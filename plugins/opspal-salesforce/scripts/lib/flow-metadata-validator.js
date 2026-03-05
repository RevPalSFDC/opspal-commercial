/**
 * Flow Metadata Validator
 *
 * Validates Salesforce Flow metadata for common issues before deployment.
 * Specifically checks for picklist field comparisons without TEXT() wrapper.
 *
 * Related reflections: 7c9cd6c1
 * ROI: $4,500/yr
 *
 * @module flow-metadata-validator
 */

const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

// Common picklist-related issues
const FLOW_ISSUES = {
  PICKLIST_NO_TEXT: {
    code: 'FLOW001',
    severity: 'error',
    message: 'Picklist field comparison without TEXT() wrapper',
    fix: 'Wrap picklist field reference in TEXT() function: TEXT({!$Record.FieldName}) instead of {!$Record.FieldName}'
  },
  API_VERSION_MISMATCH: {
    code: 'FLOW002',
    severity: 'warning',
    message: 'Unsupported property for target API version',
    fix: 'Remove unsupported properties or upgrade target org API version'
  },
  ORPHANED_CONNECTOR: {
    code: 'FLOW003',
    severity: 'warning',
    message: 'Decision outcome has no target connector',
    fix: 'Add action or screen element to the decision outcome'
  },
  MISSING_FAULT_PATH: {
    code: 'FLOW004',
    severity: 'warning',
    message: 'DML operation without fault path',
    fix: 'Add fault connector to handle potential errors'
  }
};

// Picklist field patterns (common standard and custom picklist fields)
const PICKLIST_FIELD_PATTERNS = [
  // Standard picklist fields
  /Status/i,
  /Stage/i,
  /Type/i,
  /Priority/i,
  /Rating/i,
  /Source/i,
  /Industry/i,
  /LeadSource/i,
  /StageName/i,
  /ForecastCategory/i,
  /AccountSource/i,
  /Salutation/i,
  /CleanStatus/i,
  // Marketing stage patterns
  /Marketing_Stage__c/i,
  /__Stage__c/i,
  /__Status__c/i,
  /__Type__c/i,
  // Record Type field (always picklist-like)
  /RecordType\.Name/i,
  /\$Record\.Type/i
];

// Properties that may not be supported in older API versions
const VERSION_SENSITIVE_PROPERTIES = {
  'areMetricsLoggedToDataCloud': { minVersion: 61 },
  'runInMode': { minVersion: 56 },
  'triggerType': { minVersion: 54 },
  'isTemplate': { minVersion: 55 }
};

/**
 * Check if a field reference looks like a picklist
 * @param {string} fieldRef - The field reference string
 * @returns {boolean}
 */
function looksLikePicklist(fieldRef) {
  return PICKLIST_FIELD_PATTERNS.some(pattern => pattern.test(fieldRef));
}

/**
 * Check if a formula contains a picklist comparison without TEXT()
 * @param {string} formula - The formula string
 * @returns {Object[]} Array of issues found
 */
function checkPicklistComparison(formula) {
  const issues = [];

  if (!formula) return issues;

  // Pattern: {!$Record.SomePicklistField} = 'Value' without TEXT()
  // This should be TEXT({!$Record.SomePicklistField}) = 'Value'
  const comparisonPattern = /\{!\$Record\.([^}]+)\}\s*[=!<>]+\s*['"][^'"]+['"]/g;
  let match;

  while ((match = comparisonPattern.exec(formula)) !== null) {
    const fieldName = match[1];
    const fullMatch = match[0];

    // Check if this looks like a picklist field
    if (looksLikePicklist(fieldName)) {
      // Check if it's already wrapped in TEXT()
      const textPattern = new RegExp(`TEXT\\s*\\(\\s*\\{!\\$Record\\.${fieldName}\\}\\s*\\)`, 'i');
      if (!textPattern.test(formula)) {
        issues.push({
          ...FLOW_ISSUES.PICKLIST_NO_TEXT,
          field: fieldName,
          originalFormula: fullMatch,
          suggestedFix: fullMatch.replace(
            `{!$Record.${fieldName}}`,
            `TEXT({!$Record.${fieldName}})`
          ),
          position: match.index
        });
      }
    }
  }

  return issues;
}

/**
 * Check for API version sensitive properties
 * @param {Object} flowMetadata - Parsed flow metadata
 * @param {number} targetApiVersion - Target deployment API version
 * @returns {Object[]} Array of issues found
 */
function checkApiVersionProperties(flowMetadata, targetApiVersion = 60) {
  const issues = [];

  function checkObject(obj, path = '') {
    if (!obj || typeof obj !== 'object') return;

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (VERSION_SENSITIVE_PROPERTIES[key]) {
        const { minVersion } = VERSION_SENSITIVE_PROPERTIES[key];
        if (targetApiVersion < minVersion) {
          issues.push({
            ...FLOW_ISSUES.API_VERSION_MISMATCH,
            property: key,
            path: currentPath,
            minVersion,
            targetVersion: targetApiVersion,
            suggestedFix: `Remove ${key} property or deploy to org with API version ${minVersion}+`
          });
        }
      }

      if (typeof value === 'object') {
        checkObject(value, currentPath);
      }
    }
  }

  checkObject(flowMetadata);
  return issues;
}

/**
 * Check for orphaned decision connectors
 * @param {Object} flowMetadata - Parsed flow metadata
 * @returns {Object[]} Array of issues found
 */
function checkOrphanedConnectors(flowMetadata) {
  const issues = [];

  const decisions = flowMetadata.decisions || [];
  const decisionsArray = Array.isArray(decisions) ? decisions : [decisions];

  for (const decision of decisionsArray) {
    if (!decision) continue;

    // Check default connector
    if (decision.defaultConnector === null || decision.defaultConnectorLabel && !decision.defaultConnector) {
      issues.push({
        ...FLOW_ISSUES.ORPHANED_CONNECTOR,
        decisionName: decision.name,
        outcome: 'default',
        suggestedFix: `Add target element for default outcome of decision "${decision.name}"`
      });
    }

    // Check rule outcomes
    const rules = decision.rules || [];
    const rulesArray = Array.isArray(rules) ? rules : [rules];

    for (const rule of rulesArray) {
      if (!rule) continue;

      if (rule.connector === null || (rule.label && !rule.connector)) {
        issues.push({
          ...FLOW_ISSUES.ORPHANED_CONNECTOR,
          decisionName: decision.name,
          outcome: rule.name || rule.label,
          suggestedFix: `Add target element for outcome "${rule.label}" of decision "${decision.name}"`
        });
      }
    }
  }

  return issues;
}

/**
 * Check for DML operations without fault paths
 * @param {Object} flowMetadata - Parsed flow metadata
 * @returns {Object[]} Array of issues found
 */
function checkFaultPaths(flowMetadata) {
  const issues = [];

  const dmlOperations = [
    ...(flowMetadata.recordCreates || []),
    ...(flowMetadata.recordUpdates || []),
    ...(flowMetadata.recordDeletes || []),
    ...(flowMetadata.recordLookups || [])
  ].filter(Boolean);

  for (const op of dmlOperations) {
    if (!op) continue;

    // Convert to array if single object
    const ops = Array.isArray(op) ? op : [op];

    for (const operation of ops) {
      if (!operation) continue;

      // Check if fault connector exists
      if (!operation.faultConnector && operation.storeOutputAutomatically !== false) {
        issues.push({
          ...FLOW_ISSUES.MISSING_FAULT_PATH,
          operationType: operation.object ? `${operation.object} operation` : 'DML operation',
          elementName: operation.name,
          suggestedFix: `Add fault connector to "${operation.name}" to handle potential errors`
        });
      }
    }
  }

  return issues;
}

/**
 * Parse Flow XML file
 * @param {string} flowPath - Path to Flow XML file
 * @returns {Object} Parsed flow metadata
 */
function parseFlowXml(flowPath) {
  const xml = fs.readFileSync(flowPath, 'utf8');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: true,
    parseTagValue: true,
    trimValues: true
  });

  const parsed = parser.parse(xml);
  return parsed.Flow || parsed;
}

/**
 * Full validation pipeline for a Flow file
 * @param {string} flowPath - Path to Flow XML file
 * @param {Object} options - Validation options
 * @param {number} options.targetApiVersion - Target deployment API version (default: 60)
 * @param {boolean} options.strict - Strict mode treats warnings as errors
 * @returns {Object} Validation result
 */
function validateFlow(flowPath, options = {}) {
  const result = {
    valid: true,
    flowPath,
    timestamp: new Date().toISOString(),
    issues: [],
    summary: {
      errors: 0,
      warnings: 0
    },
    recommendations: []
  };

  // Check file exists
  if (!fs.existsSync(flowPath)) {
    result.valid = false;
    result.issues.push({
      code: 'FILE001',
      severity: 'error',
      message: `Flow file not found: ${flowPath}`
    });
    return result;
  }

  try {
    // Parse flow
    const flowMetadata = parseFlowXml(flowPath);

    // Run all checks
    // 1. Picklist comparison checks
    const formulaLocations = [
      flowMetadata.start?.filterFormula,
      ...(flowMetadata.decisions || []).map(d => d?.rules?.conditions?.leftValueReference),
      ...(flowMetadata.recordLookups || []).map(r => r?.filterFormula)
    ].filter(Boolean);

    for (const formula of formulaLocations) {
      const picklistIssues = checkPicklistComparison(formula);
      result.issues.push(...picklistIssues);
    }

    // Also check formula strings anywhere in the flow
    const flowJson = JSON.stringify(flowMetadata);
    const directPicklistIssues = checkPicklistComparison(flowJson);
    result.issues.push(...directPicklistIssues);

    // 2. API version checks
    const targetVersion = options.targetApiVersion || 60;
    const apiIssues = checkApiVersionProperties(flowMetadata, targetVersion);
    result.issues.push(...apiIssues);

    // 3. Orphaned connector checks
    const connectorIssues = checkOrphanedConnectors(flowMetadata);
    result.issues.push(...connectorIssues);

    // 4. Fault path checks
    const faultIssues = checkFaultPaths(flowMetadata);
    result.issues.push(...faultIssues);

    // Count by severity
    result.summary.errors = result.issues.filter(i => i.severity === 'error').length;
    result.summary.warnings = result.issues.filter(i => i.severity === 'warning').length;

    // Determine validity
    if (result.summary.errors > 0) {
      result.valid = false;
    }

    if (options.strict && result.summary.warnings > 0) {
      result.valid = false;
    }

    // Generate recommendations
    if (result.issues.length > 0) {
      result.recommendations = [...new Set(result.issues.map(i => i.fix))];
    } else {
      result.recommendations.push('Flow validation passed - no issues found');
    }

  } catch (err) {
    result.valid = false;
    result.issues.push({
      code: 'PARSE001',
      severity: 'error',
      message: `Failed to parse Flow XML: ${err.message}`
    });
  }

  return result;
}

/**
 * Validate multiple Flow files in a directory
 * @param {string} dirPath - Path to directory containing Flow files
 * @param {Object} options - Validation options
 * @returns {Object} Aggregate validation result
 */
function validateFlowDirectory(dirPath, options = {}) {
  const result = {
    valid: true,
    timestamp: new Date().toISOString(),
    flowsChecked: 0,
    flowsValid: 0,
    flowsInvalid: 0,
    results: [],
    summary: {
      totalErrors: 0,
      totalWarnings: 0
    }
  };

  // Find all flow files
  const files = fs.readdirSync(dirPath).filter(f =>
    f.endsWith('.flow-meta.xml') || f.endsWith('.flow')
  );

  for (const file of files) {
    const flowPath = path.join(dirPath, file);
    const flowResult = validateFlow(flowPath, options);

    result.flowsChecked++;
    result.results.push({
      file,
      ...flowResult
    });

    if (flowResult.valid) {
      result.flowsValid++;
    } else {
      result.flowsInvalid++;
      result.valid = false;
    }

    result.summary.totalErrors += flowResult.summary.errors;
    result.summary.totalWarnings += flowResult.summary.warnings;
  }

  return result;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'validate':
      if (!args[1]) {
        console.error('Usage: flow-metadata-validator.js validate <flow-path> [--api-version <version>] [--strict]');
        process.exit(1);
      }
      const versionIdx = args.indexOf('--api-version');
      const apiVersion = versionIdx > 0 ? parseInt(args[versionIdx + 1]) : 60;
      const strict = args.includes('--strict');

      const flowResult = validateFlow(args[1], { targetApiVersion: apiVersion, strict });
      console.log(JSON.stringify(flowResult, null, 2));
      process.exit(flowResult.valid ? 0 : 1);
      break;

    case 'validate-dir':
      if (!args[1]) {
        console.error('Usage: flow-metadata-validator.js validate-dir <directory> [--api-version <version>]');
        process.exit(1);
      }
      const dirVersionIdx = args.indexOf('--api-version');
      const dirApiVersion = dirVersionIdx > 0 ? parseInt(args[dirVersionIdx + 1]) : 60;

      const dirResult = validateFlowDirectory(args[1], { targetApiVersion: dirApiVersion });
      console.log(JSON.stringify(dirResult, null, 2));
      process.exit(dirResult.valid ? 0 : 1);
      break;

    case 'check-formula':
      if (!args[1]) {
        console.error('Usage: flow-metadata-validator.js check-formula "<formula>"');
        process.exit(1);
      }
      const formulaIssues = checkPicklistComparison(args[1]);
      console.log(JSON.stringify(formulaIssues, null, 2));
      break;

    default:
      console.log(`Flow Metadata Validator

Usage:
  flow-metadata-validator.js validate <flow-path> [options]     Validate single Flow
  flow-metadata-validator.js validate-dir <directory> [options] Validate all Flows in directory
  flow-metadata-validator.js check-formula "<formula>"          Check formula for issues

Options:
  --api-version <version>  Target deployment API version (default: 60)
  --strict                 Treat warnings as errors

Checks Performed:
  FLOW001 - Picklist field comparison without TEXT() wrapper
  FLOW002 - API version incompatible properties
  FLOW003 - Orphaned decision connectors (no target)
  FLOW004 - DML operations without fault paths

Examples:
  # Validate a single Flow
  node flow-metadata-validator.js validate force-app/main/default/flows/MyFlow.flow-meta.xml

  # Validate with specific API version
  node flow-metadata-validator.js validate MyFlow.flow --api-version 55

  # Validate all Flows in a directory
  node flow-metadata-validator.js validate-dir force-app/main/default/flows/
`);
  }
}

module.exports = {
  FLOW_ISSUES,
  looksLikePicklist,
  checkPicklistComparison,
  checkApiVersionProperties,
  checkOrphanedConnectors,
  checkFaultPaths,
  parseFlowXml,
  validateFlow,
  validateFlowDirectory
};
