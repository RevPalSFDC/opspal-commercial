#!/usr/bin/env node

/**
 * CPQ Field Validator
 *
 * Validates SBQQ field availability in target org before executing CPQ assessments.
 * Prevents "field does not exist" errors by comparing script requirements against
 * actual org schema.
 *
 * Usage:
 *   const validator = require('./cpq-field-validator');
 *   const result = await validator.validateFields('myorg', 'Product2', ['Name', 'SBQQ__Component__c']);
 *   const query = validator.generateValidQuery(baseQuery, result.availableFields);
 *
 * @module cpq-field-validator
 * @version 1.0.0
 * @created 2025-10-08
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Standard SBQQ objects used in CPQ assessments
 */
const SBQQ_OBJECTS = {
  'Product2': 'Product catalog',
  'SBQQ__Quote__c': 'CPQ Quotes (may be renamed - check org quirks)',
  'SBQQ__QuoteLine__c': 'CPQ Quote Lines',
  'SBQQ__ProductOption__c': 'Product bundles and options',
  'SBQQ__ProductFeature__c': 'Product features',
  'SBQQ__PriceRule__c': 'Price rules',
  'SBQQ__PriceCondition__c': 'Price rule conditions',
  'SBQQ__PriceAction__c': 'Price rule actions',
  'SBQQ__ProductRule__c': 'Product rules',
  'SBQQ__ErrorCondition__c': 'Product rule conditions',
  'SBQQ__ProductAction__c': 'Product rule actions',
  'SBQQ__DiscountSchedule__c': 'Discount schedules',
  'SBQQ__DiscountTier__c': 'Discount tiers',
  'SBQQ__Subscription__c': 'Subscriptions',
  'PricebookEntry': 'Pricebook entries'
};

/**
 * Get all fields for a Salesforce object
 *
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} objectName - API name of object
 * @returns {Object} { objectName, fields: [], error: null }
 */
function getObjectFields(orgAlias, objectName) {
  try {
    const cmd = `sf sobject describe --sobject ${objectName} --target-org ${orgAlias} --json`;
    const result = JSON.parse(execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }));

    if (result.status !== 0) {
      return {
        objectName,
        fields: [],
        error: `Object not found or not accessible: ${objectName}`
      };
    }

    const fields = result.result.fields.map(f => ({
      name: f.name,
      type: f.type,
      label: f.label,
      required: !f.nillable,
      updateable: f.updateable,
      createable: f.createable
    }));

    return {
      objectName,
      fields,
      fieldNames: fields.map(f => f.name),
      error: null
    };

  } catch (error) {
    return {
      objectName,
      fields: [],
      fieldNames: [],
      error: error.message
    };
  }
}

/**
 * Validate that required fields exist in the org
 *
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} objectName - API name of object
 * @param {string[]} requiredFields - List of field names to validate
 * @returns {Object} Validation result with available/missing fields
 */
function validateFields(orgAlias, objectName, requiredFields) {
  const objectSchema = getObjectFields(orgAlias, objectName);

  if (objectSchema.error) {
    return {
      objectName,
      valid: false,
      error: objectSchema.error,
      availableFields: [],
      missingFields: requiredFields,
      criticalMissing: requiredFields
    };
  }

  const availableFields = [];
  const missingFields = [];

  requiredFields.forEach(field => {
    if (objectSchema.fieldNames.includes(field)) {
      availableFields.push(field);
    } else {
      missingFields.push(field);
    }
  });

  // Critical fields that must exist for assessment to work
  const criticalFields = getCriticalFields(objectName);
  const criticalMissing = missingFields.filter(f => criticalFields.includes(f));

  return {
    objectName,
    valid: criticalMissing.length === 0,
    availableFields,
    missingFields,
    criticalMissing,
    totalRequired: requiredFields.length,
    availabilityRate: (availableFields.length / requiredFields.length * 100).toFixed(1)
  };
}

/**
 * Get critical fields that must exist for assessment
 *
 * @param {string} objectName - API name of object
 * @returns {string[]} List of critical field names
 */
function getCriticalFields(objectName) {
  const criticalMap = {
    'Product2': ['Id', 'Name', 'IsActive', 'ProductCode'],
    'SBQQ__Quote__c': ['Id', 'Name', 'SBQQ__Status__c'],
    'SBQQ__QuoteLine__c': ['Id', 'SBQQ__Quote__c', 'SBQQ__Product__c'],
    'SBQQ__ProductOption__c': ['Id', 'SBQQ__ConfiguredSKU__c', 'SBQQ__OptionalSKU__c'],
    'SBQQ__PriceRule__c': ['Id', 'Name', 'SBQQ__Active__c'],
    'SBQQ__ProductRule__c': ['Id', 'Name', 'SBQQ__Active__c', 'SBQQ__Type__c'],
    'SBQQ__DiscountSchedule__c': ['Id', 'Name', 'SBQQ__Type__c']
  };

  return criticalMap[objectName] || ['Id', 'Name'];
}

/**
 * Generate valid SOQL query by removing unavailable fields
 *
 * @param {string} baseQuery - Original SOQL query
 * @param {string[]} availableFields - List of available fields
 * @returns {string} Modified query with only available fields
 */
function generateValidQuery(baseQuery, availableFields) {
  // Extract SELECT clause
  const selectMatch = baseQuery.match(/SELECT\s+(.*?)\s+FROM/is);
  if (!selectMatch) {
    return baseQuery; // Can't parse, return original
  }

  const selectClause = selectMatch[1];
  const fields = selectClause.split(',').map(f => f.trim());

  // Filter to only available fields
  const validFields = fields.filter(field => {
    // Handle relationship fields (e.g., "Account.Name")
    const baseField = field.split('.')[0];
    // Handle subqueries
    if (field.startsWith('(SELECT')) {
      return true; // Keep subqueries, they'll be validated separately
    }
    return availableFields.includes(baseField);
  });

  // Reconstruct query
  const newSelectClause = validFields.join(',\n  ');
  return baseQuery.replace(selectMatch[0], `SELECT\n  ${newSelectClause}\nFROM`);
}

/**
 * Get field availability matrix for all SBQQ objects
 *
 * @param {string} orgAlias - Salesforce org alias
 * @returns {Object} Complete field availability matrix
 */
function getFieldAvailabilityMatrix(orgAlias) {
  console.log(`\n🔍 Scanning SBQQ objects in org: ${orgAlias}\n`);

  const matrix = {
    orgAlias,
    timestamp: new Date().toISOString(),
    objects: {},
    summary: {
      totalObjects: 0,
      accessibleObjects: 0,
      inaccessibleObjects: 0
    }
  };

  Object.entries(SBQQ_OBJECTS).forEach(([objectName, description]) => {
    const schema = getObjectFields(orgAlias, objectName);

    if (schema.error) {
      console.log(`❌ ${objectName}: ${schema.error}`);
      matrix.objects[objectName] = {
        accessible: false,
        error: schema.error,
        description
      };
      matrix.summary.inaccessibleObjects++;
    } else {
      console.log(`✅ ${objectName}: ${schema.fields.length} fields`);
      matrix.objects[objectName] = {
        accessible: true,
        fieldCount: schema.fields.length,
        fields: schema.fields,
        description
      };
      matrix.summary.accessibleObjects++;
    }

    matrix.summary.totalObjects++;
  });

  console.log(`\n📊 Summary: ${matrix.summary.accessibleObjects}/${matrix.summary.totalObjects} objects accessible\n`);

  return matrix;
}

/**
 * Generate field validation report
 *
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} outputPath - Path to save report
 * @returns {Object} Validation report
 */
function generateFieldValidationReport(orgAlias, outputPath = null) {
  const matrix = getFieldAvailabilityMatrix(orgAlias);

  const report = {
    ...matrix,
    recommendations: [],
    warnings: []
  };

  // Check for common issues
  if (!matrix.objects['SBQQ__Quote__c']?.accessible) {
    report.warnings.push({
      severity: 'HIGH',
      message: 'SBQQ__Quote__c not accessible. Check if CPQ package is installed and user has permissions.',
      action: 'Verify CPQ package installation and user profile permissions'
    });
  }

  // Check for renamed objects (org quirks)
  if (!matrix.objects['SBQQ__Quote__c']?.accessible) {
    report.recommendations.push({
      priority: 'HIGH',
      message: 'Run org quirks detection to check for renamed CPQ objects',
      command: 'node scripts/lib/org-quirks-detector.js generate-docs ' + orgAlias
    });
  }

  // Save report if path provided
  if (outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`✅ Report saved: ${outputPath}`);
  }

  return report;
}

/**
 * Validate script requirements against org
 *
 * @param {string} orgAlias - Salesforce org alias
 * @param {Object} scriptRequirements - { objectName: [requiredFields] }
 * @returns {Object} Validation results
 */
function validateScriptRequirements(orgAlias, scriptRequirements) {
  const results = {
    orgAlias,
    timestamp: new Date().toISOString(),
    overallValid: true,
    objects: {}
  };

  Object.entries(scriptRequirements).forEach(([objectName, requiredFields]) => {
    const validation = validateFields(orgAlias, objectName, requiredFields);
    results.objects[objectName] = validation;

    if (!validation.valid) {
      results.overallValid = false;
      console.log(`\n⚠️  ${objectName}:`);
      console.log(`   Available: ${validation.availableFields.length}/${validation.totalRequired} (${validation.availabilityRate}%)`);
      if (validation.criticalMissing.length > 0) {
        console.log(`   ❌ Critical fields missing: ${validation.criticalMissing.join(', ')}`);
      }
      if (validation.missingFields.length > validation.criticalMissing.length) {
        const optionalMissing = validation.missingFields.filter(f => !validation.criticalMissing.includes(f));
        console.log(`   ⚠️  Optional fields missing: ${optionalMissing.join(', ')}`);
      }
    } else {
      console.log(`✅ ${objectName}: All critical fields available (${validation.availabilityRate}% total)`);
    }
  });

  return results;
}

// Export functions
module.exports = {
  getObjectFields,
  validateFields,
  generateValidQuery,
  getFieldAvailabilityMatrix,
  generateFieldValidationReport,
  validateScriptRequirements,
  SBQQ_OBJECTS
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log(`
Usage: cpq-field-validator.js <org-alias> [options]

Options:
  --matrix              Generate complete field availability matrix
  --report <path>       Generate validation report and save to path
  --validate <object>   Validate specific object fields

Examples:
  node cpq-field-validator.js myorg --matrix
  node cpq-field-validator.js myorg --report data/field-validation.json
  node cpq-field-validator.js myorg --validate Product2
    `);
    process.exit(1);
  }

  const orgAlias = args[0];

  if (args.includes('--matrix')) {
    getFieldAvailabilityMatrix(orgAlias);
  } else if (args.includes('--report')) {
    const reportPath = args[args.indexOf('--report') + 1] || 'field-validation-report.json';
    generateFieldValidationReport(orgAlias, reportPath);
  } else if (args.includes('--validate')) {
    const objectName = args[args.indexOf('--validate') + 1];
    const schema = getObjectFields(orgAlias, objectName);
    console.log(JSON.stringify(schema, null, 2));
  } else {
    // Default: matrix
    getFieldAvailabilityMatrix(orgAlias);
  }
}
