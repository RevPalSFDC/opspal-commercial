#!/usr/bin/env node
/**
 * Tool Contract Validator
 *
 * Validates tool invocations against defined contracts to prevent tool-contract errors.
 * Target: 75% reduction in tool-contract reflections (42 reflections, $7,875 ROI)
 *
 * Enhanced for Cohort 3 (tool-contract) - 9 reflections, $36K ROI
 *
 * New Validations (Phase 3.1):
 * - Quick Action type immutability detection
 * - Flow activation status verification
 * - FLS pre-flight permission checks
 * - Metadata type change detection
 * - Deployment target validation
 *
 * @module tool-contract-validator
 * @version 2.0.0
 * @created 2026-01-06
 * @updated 2026-01-19
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { detectSalesforceEnvironment } = require('./classify-operation');

const SEVERITY = {
  CRITICAL: 'CRITICAL',
  WARNING: 'WARNING',
  INFO: 'INFO'
};

/**
 * Field Name Resolver - Maps intuitive field names to canonical schema names
 * Addresses Cohort 4 (tool-contract) issues where users type 'created' but schema expects 'request_date'
 *
 * @class FieldNameResolver
 */
class FieldNameResolver {
  constructor(mappingsConfig = {}) {
    this.mappings = mappingsConfig.mappings || {};
    this.caseSensitive = mappingsConfig.caseSensitive || false;
    this.bidirectional = mappingsConfig.bidirectional !== false;
    this.hints = mappingsConfig.hints || {};

    // Build reverse lookup: alias -> [canonical names]
    this.reverseLookup = new Map();
    for (const [intuitiveName, canonicals] of Object.entries(this.mappings)) {
      // Add the intuitive name itself as a lookup key
      const key = this.normalizeKey(intuitiveName);
      if (!this.reverseLookup.has(key)) {
        this.reverseLookup.set(key, []);
      }
      this.reverseLookup.get(key).push(...canonicals);

      // If bidirectional, add each canonical as a lookup key too
      if (this.bidirectional) {
        for (const canonical of canonicals) {
          const canonicalKey = this.normalizeKey(canonical);
          if (!this.reverseLookup.has(canonicalKey)) {
            this.reverseLookup.set(canonicalKey, []);
          }
          // Add the intuitive name as a possible resolution
          if (!this.reverseLookup.get(canonicalKey).includes(intuitiveName)) {
            this.reverseLookup.get(canonicalKey).push(intuitiveName);
          }
        }
      }
    }
  }

  normalizeKey(name) {
    if (!name) return '';
    return this.caseSensitive ? name : name.toLowerCase();
  }

  /**
   * Resolve a field name to its canonical form
   * @param {string} fieldName - The field name provided by the user
   * @param {string[]} expectedFields - The expected field names from the schema
   * @returns {Object} Resolution result with resolved name and metadata
   */
  resolve(fieldName, expectedFields = []) {
    const key = this.normalizeKey(fieldName);

    // 1. Direct match in expected fields
    if (expectedFields.includes(fieldName)) {
      return { resolved: fieldName, isAlias: false, matched: true };
    }

    // 2. Case-insensitive match in expected fields
    const caseMatch = expectedFields.find(f => this.normalizeKey(f) === key);
    if (caseMatch) {
      return {
        resolved: caseMatch,
        isAlias: false,
        matched: true,
        suggestion: `Did you mean '${caseMatch}'? (case mismatch)`
      };
    }

    // 3. Check alias mappings
    const possibleCanonicals = this.reverseLookup.get(key);
    if (possibleCanonicals && possibleCanonicals.length > 0) {
      // Find which canonical is in expected fields
      for (const canonical of possibleCanonicals) {
        const matchInExpected = expectedFields.find(f =>
          this.normalizeKey(f) === this.normalizeKey(canonical)
        );
        if (matchInExpected) {
          const hint = this.hints[matchInExpected] || '';
          return {
            resolved: matchInExpected,
            isAlias: true,
            originalName: fieldName,
            matched: true,
            suggestion: `'${fieldName}' resolved to '${matchInExpected}'. ${hint}`.trim()
          };
        }
      }
    }

    // 4. No resolution found - return original
    return {
      resolved: fieldName,
      isAlias: false,
      matched: false,
      notFound: true
    };
  }

  /**
   * Normalize all params by resolving field name aliases
   * @param {Object} params - The parameters object with potentially aliased field names
   * @param {string[]} expectedFields - Expected field names from schema
   * @returns {Object} Normalized params and suggestions
   */
  normalizeParams(params, expectedFields) {
    const normalized = {};
    const suggestions = [];

    for (const [key, value] of Object.entries(params)) {
      const resolution = this.resolve(key, expectedFields);
      normalized[resolution.resolved] = value;

      if (resolution.isAlias) {
        suggestions.push({
          original: key,
          resolved: resolution.resolved,
          message: resolution.suggestion
        });
      } else if (resolution.suggestion) {
        suggestions.push({
          original: key,
          resolved: resolution.resolved,
          message: resolution.suggestion
        });
      }
    }

    return { params: normalized, suggestions };
  }
}

/**
 * Salesforce metadata type change rules
 * Some changes are immutable after creation
 */
const IMMUTABLE_CHANGES = {
  QuickAction: {
    // Quick Action type cannot be changed after creation
    immutableFields: ['type', 'targetObject'],
    errorMessage: 'Quick Action type and target object cannot be changed after creation. Create a new Quick Action instead.'
  },
  CustomField: {
    // Field type changes are restricted
    immutableFields: ['type'],
    allowedTypeChanges: {
      'Text': ['LongTextArea', 'Html'],
      'Number': ['Currency', 'Percent'],
      'Checkbox': [] // Cannot change from checkbox
    },
    errorMessage: 'Field type change may not be allowed. Review Salesforce field type conversion rules.'
  },
  CustomObject: {
    // Object deployment mode cannot change
    immutableFields: ['deploymentStatus'],
    errorMessage: 'Object deployment status changes require careful planning.'
  },
  Flow: {
    // Flow type (e.g., AutoLaunched vs Screen) restrictions
    immutableFields: ['processType'],
    errorMessage: 'Flow process type cannot be changed. Create a new flow with the desired type.'
  }
};

/**
 * FLS (Field Level Security) permission requirements by operation
 */
const FLS_REQUIREMENTS = {
  create: ['IsCreatable'],
  update: ['IsUpdateable'],
  delete: ['IsDeletable'],
  read: ['IsAccessible'],
  upsert: ['IsCreatable', 'IsUpdateable']
};

class ToolContractValidator {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.contractsDir = options.contractsDir || path.join(__dirname, '../../config/tool-contracts');
    this.contractsFile = options.contractsFile || path.join(__dirname, '../../config/tool-contracts.json');
    this.contracts = {};
    this.fieldMappings = null;
    this.fieldResolver = null;
    this.stats = {
      totalValidations: 0,
      passed: 0,
      failed: 0,
      aliasResolutions: 0,
      byTool: {},
      avgValidationTime: 0
    };

    // Load central contracts file if it exists
    this.loadCentralContracts();
  }

  /**
   * Load contracts from central tool-contracts.json file
   */
  loadCentralContracts() {
    if (fs.existsSync(this.contractsFile)) {
      try {
        const content = JSON.parse(fs.readFileSync(this.contractsFile, 'utf8'));

        // Load contracts
        if (content.contracts) {
          for (const [toolName, contract] of Object.entries(content.contracts)) {
            this.contracts[toolName] = contract;
          }
        }

        // Load field name mappings for alias resolution
        if (content.fieldNameMappings) {
          this.fieldMappings = content.fieldNameMappings;
          this.fieldResolver = new FieldNameResolver(this.fieldMappings);
          if (this.verbose) {
            console.log(`Loaded ${Object.keys(this.fieldMappings.mappings || {}).length} field name mappings`);
          }
        }

        if (this.verbose) {
          console.log(`Loaded ${Object.keys(this.contracts).length} contracts from ${this.contractsFile}`);
        }
      } catch (error) {
        if (this.verbose) {
          console.error(`Failed to load central contracts: ${error.message}`);
        }
      }
    }
  }

  loadContracts() {
    let loaded = 0;
    if (!fs.existsSync(this.contractsDir)) {
      fs.mkdirSync(this.contractsDir, { recursive: true });
      return 0;
    }

    const files = fs.readdirSync(this.contractsDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const content = JSON.parse(fs.readFileSync(path.join(this.contractsDir, file), 'utf8'));
      for (const [toolName, contract] of Object.entries(content)) {
        this.contracts[toolName] = contract;
        loaded++;
      }
    }
    return loaded;
  }

  async validate(toolName, params, options = {}) {
    const startTime = Date.now();
    this.stats.totalValidations++;

    if (!this.stats.byTool[toolName]) {
      this.stats.byTool[toolName] = { validations: 0, passed: 0, failed: 0, aliasResolutions: 0 };
    }
    this.stats.byTool[toolName].validations++;

    const contract = this.contracts[toolName];
    if (!contract) {
      return { valid: true, toolName, errors: [], warnings: [{ message: `No contract for ${toolName}` }], validationTime: Date.now() - startTime };
    }

    const errors = [];
    const warnings = [];

    // Get expected field names from contract schema
    const expectedFields = [
      ...(contract.required || []),
      ...Object.keys(contract.types || {}),
      ...Object.keys(contract.input?.properties || {})
    ];

    // Apply field name alias resolution if resolver is available
    let paramsToValidate = params;
    if (this.fieldResolver && expectedFields.length > 0) {
      const { params: normalizedParams, suggestions } = this.fieldResolver.normalizeParams(params, expectedFields);
      paramsToValidate = normalizedParams;

      // Add alias resolution suggestions as INFO warnings
      for (const suggestion of suggestions) {
        warnings.push({
          type: 'field_alias_resolved',
          severity: SEVERITY.INFO,
          original: suggestion.original,
          resolved: suggestion.resolved,
          message: suggestion.message
        });
        this.stats.aliasResolutions++;
        this.stats.byTool[toolName].aliasResolutions++;
      }
    }

    // Required params (using normalized params)
    for (const param of (contract.required || [])) {
      if (!(param in paramsToValidate) || paramsToValidate[param] == null) {
        // Provide hint about possible aliases
        const aliasHint = this.getAliasHint(param);
        errors.push({
          type: 'missing_required',
          severity: SEVERITY.CRITICAL,
          param,
          message: `Missing required: ${param}`,
          hint: aliasHint
        });
      }
    }

    // Types (using normalized params)
    for (const [param, expectedType] of Object.entries(contract.types || {})) {
      if (param in paramsToValidate && paramsToValidate[param] != null) {
        const actualType = Array.isArray(paramsToValidate[param]) ? 'array' : typeof paramsToValidate[param];
        if (actualType !== expectedType) {
          errors.push({ type: 'type_mismatch', severity: SEVERITY.CRITICAL, param, message: `${param} type mismatch: ${actualType} vs ${expectedType}` });
        }
      }
    }

    // Rules (using normalized params)
    for (const rule of (contract.rules || [])) {
      if (this.evaluateCondition(paramsToValidate, rule.condition)) {
        for (const req of (rule.requires || [])) {
          if (!(req in paramsToValidate)) {
            errors.push({ type: 'rule_violation', severity: rule.severity || SEVERITY.CRITICAL, message: rule.message || `Rule ${rule.name} requires ${req}` });
          }
        }
      }
    }

    const valid = !errors.some(e => e.severity === SEVERITY.CRITICAL);
    this.stats[valid ? 'passed' : 'failed']++;
    this.stats.byTool[toolName][valid ? 'passed' : 'failed']++;

    return {
      valid,
      toolName,
      errors,
      warnings,
      errorCount: errors.length,
      warningCount: warnings.length,
      aliasesResolved: warnings.filter(w => w.type === 'field_alias_resolved').length,
      validationTime: Date.now() - startTime
    };
  }

  /**
   * Get hint about possible aliases for a field name
   */
  getAliasHint(fieldName) {
    if (!this.fieldMappings || !this.fieldMappings.mappings) {
      return null;
    }

    // Check if this field has known aliases
    const key = fieldName.toLowerCase();
    for (const [intuitive, canonicals] of Object.entries(this.fieldMappings.mappings)) {
      if (canonicals.some(c => c.toLowerCase() === key)) {
        return `Accepted aliases: ${intuitive}, ${canonicals.join(', ')}`;
      }
    }

    // Check hints
    if (this.fieldMappings.hints && this.fieldMappings.hints[fieldName]) {
      return this.fieldMappings.hints[fieldName];
    }

    return null;
  }

  evaluateCondition(params, condition) {
    if (!condition) return true;
    const { param, pattern } = condition;
    if (!(param in params)) return false;
    if (pattern) return new RegExp(pattern).test(String(params[param]));
    return true;
  }

  listContracts() {
    return Object.keys(this.contracts);
  }

  getStats() {
    return this.stats;
  }

  // ============================================================================
  // Phase 3.1 Enhancements: New Validation Methods
  // ============================================================================

  /**
   * Validate Quick Action type immutability
   * Quick Actions cannot change type after creation
   *
   * @param {Object} metadata - The Quick Action metadata being deployed
   * @param {string} orgAlias - Target org alias for checking existing state
   * @returns {Object} Validation result
   */
  async validateQuickActionType(metadata, orgAlias) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      metadata: 'QuickAction'
    };

    if (!metadata || !metadata.fullName) {
      return result; // Nothing to validate
    }

    try {
      // Check if Quick Action already exists in org
      const existingMetadata = await this.queryExistingMetadata('QuickAction', metadata.fullName, orgAlias);

      if (existingMetadata) {
        // Check for immutable field changes
        for (const field of IMMUTABLE_CHANGES.QuickAction.immutableFields) {
          if (metadata[field] && existingMetadata[field] && metadata[field] !== existingMetadata[field]) {
            result.valid = false;
            result.errors.push({
              type: 'immutable_change',
              severity: SEVERITY.CRITICAL,
              field: field,
              currentValue: existingMetadata[field],
              newValue: metadata[field],
              message: IMMUTABLE_CHANGES.QuickAction.errorMessage,
              remediation: `Create a new Quick Action with the desired ${field} instead of modifying the existing one.`
            });
          }
        }
      }
    } catch (error) {
      result.warnings.push({
        message: `Could not verify Quick Action state: ${error.message}`,
        severity: SEVERITY.WARNING
      });
    }

    return result;
  }

  /**
   * Validate Flow activation status
   * Ensures Flow deploys with correct activation state
   *
   * @param {Object} flowMetadata - The Flow metadata being deployed
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  async validateFlowActivation(flowMetadata, options = {}) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      metadata: 'Flow'
    };

    const {
      requireActive = false,
      verifyPostDeploy = true,
      orgAlias = null
    } = options;

    if (!flowMetadata) {
      return result;
    }

    // Check if Flow status is set correctly
    const status = flowMetadata.status || flowMetadata.Status;

    if (requireActive && status !== 'Active') {
      result.warnings.push({
        type: 'flow_not_active',
        severity: SEVERITY.WARNING,
        message: `Flow is set to '${status}' but requireActive=true. Flow may deploy as Draft.`,
        remediation: 'Ensure status is set to "Active" in the Flow metadata or use post-deploy activation.'
      });
    }

    // Check for common issues that cause Flows to deploy as Draft
    if (status === 'Active') {
      // Check for missing entry criteria (for Record-Triggered Flows)
      if (flowMetadata.processType === 'AutoLaunchedFlow' && flowMetadata.triggerType) {
        if (!flowMetadata.start || !flowMetadata.start.filterLogic) {
          result.warnings.push({
            type: 'missing_entry_criteria',
            severity: SEVERITY.WARNING,
            message: 'Record-Triggered Flow may need entry criteria. Without it, the Flow may not activate.',
            remediation: 'Add filter conditions to the Start element.'
          });
        }
      }

      // Check for referenced elements that don't exist
      if (flowMetadata.start && flowMetadata.start.connector) {
        const targetElement = flowMetadata.start.connector.targetReference;
        const elementExists = this.findFlowElement(flowMetadata, targetElement);
        if (!elementExists) {
          result.valid = false;
          result.errors.push({
            type: 'broken_reference',
            severity: SEVERITY.CRITICAL,
            message: `Start element references non-existent element: ${targetElement}`,
            remediation: 'Ensure all referenced elements exist in the Flow.'
          });
        }
      }
    }

    return result;
  }

  /**
   * Find a Flow element by name
   */
  findFlowElement(flowMetadata, elementName) {
    if (!elementName) return true;

    const elementTypes = [
      'actionCalls', 'assignments', 'decisions', 'loops',
      'recordCreates', 'recordDeletes', 'recordLookups', 'recordUpdates',
      'screens', 'subflows', 'waits'
    ];

    for (const type of elementTypes) {
      const elements = flowMetadata[type];
      if (elements) {
        const arr = Array.isArray(elements) ? elements : [elements];
        if (arr.some(e => e.name === elementName)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Validate Field Level Security (FLS) permissions
   * Pre-flight check for required permissions before data operations
   *
   * @param {string} objectName - The Salesforce object name
   * @param {string[]} fields - List of fields being accessed
   * @param {string} operation - Operation type (create, update, delete, read, upsert)
   * @param {string} orgAlias - Target org alias
   * @returns {Object} Validation result
   */
  async validateFLS(objectName, fields, operation, orgAlias) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      object: objectName,
      operation: operation,
      checkedFields: []
    };

    const requiredPerms = FLS_REQUIREMENTS[operation.toLowerCase()];
    if (!requiredPerms) {
      result.warnings.push({
        message: `Unknown operation type: ${operation}`,
        severity: SEVERITY.WARNING
      });
      return result;
    }

    try {
      // Get field describe info
      const fieldDescribe = await this.describeFields(objectName, fields, orgAlias);

      for (const field of fields) {
        const fieldInfo = fieldDescribe[field];
        if (!fieldInfo) {
          result.warnings.push({
            field: field,
            message: `Could not verify FLS for field: ${field}`,
            severity: SEVERITY.WARNING
          });
          continue;
        }

        result.checkedFields.push(field);

        for (const perm of requiredPerms) {
          if (fieldInfo[perm] === false) {
            result.valid = false;
            result.errors.push({
              type: 'fls_violation',
              severity: SEVERITY.CRITICAL,
              field: field,
              permission: perm,
              message: `Field ${field} lacks ${perm} permission for ${operation} operation`,
              remediation: `Grant ${perm} permission on ${objectName}.${field} via Profile or Permission Set`
            });
          }
        }
      }
    } catch (error) {
      result.warnings.push({
        message: `FLS check failed: ${error.message}`,
        severity: SEVERITY.WARNING
      });
    }

    return result;
  }

  /**
   * Validate metadata type changes for immutability
   *
   * @param {string} metadataType - Type of metadata (QuickAction, CustomField, etc.)
   * @param {Object} newMetadata - The metadata being deployed
   * @param {string} orgAlias - Target org alias
   * @returns {Object} Validation result
   */
  async validateMetadataTypeChange(metadataType, newMetadata, orgAlias) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      metadataType: metadataType
    };

    const rules = IMMUTABLE_CHANGES[metadataType];
    if (!rules) {
      return result; // No immutability rules for this type
    }

    try {
      const existing = await this.queryExistingMetadata(metadataType, newMetadata.fullName, orgAlias);

      if (existing) {
        for (const field of rules.immutableFields) {
          const oldValue = existing[field];
          const newValue = newMetadata[field];

          if (oldValue && newValue && oldValue !== newValue) {
            // Check if this is an allowed change
            if (rules.allowedTypeChanges && rules.allowedTypeChanges[oldValue]) {
              if (!rules.allowedTypeChanges[oldValue].includes(newValue)) {
                result.valid = false;
                result.errors.push({
                  type: 'immutable_change',
                  severity: SEVERITY.CRITICAL,
                  field: field,
                  currentValue: oldValue,
                  newValue: newValue,
                  message: rules.errorMessage,
                  remediation: `Cannot change ${field} from ${oldValue} to ${newValue}. Create new metadata instead.`
                });
              }
            } else {
              result.valid = false;
              result.errors.push({
                type: 'immutable_change',
                severity: SEVERITY.CRITICAL,
                field: field,
                currentValue: oldValue,
                newValue: newValue,
                message: rules.errorMessage
              });
            }
          }
        }
      }
    } catch (error) {
      result.warnings.push({
        message: `Could not verify existing metadata: ${error.message}`,
        severity: SEVERITY.WARNING
      });
    }

    return result;
  }

  /**
   * Validate deployment target (sandbox vs production safeguards)
   *
   * @param {string} orgAlias - Target org alias
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  async validateDeploymentTarget(orgAlias, options = {}) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      orgAlias: orgAlias,
      isProduction: false
    };

    const {
      allowProduction = false,
      requireCheckOnly = true,
      destructiveChanges = false
    } = options;

    try {
      // Determine if target is production
      const orgInfo = await this.getOrgInfo(orgAlias);
      result.isProduction = orgInfo.isProduction || false;
      result.orgType = orgInfo.orgType;

      if (result.isProduction) {
        if (!allowProduction) {
          result.valid = false;
          result.errors.push({
            type: 'production_blocked',
            severity: SEVERITY.CRITICAL,
            message: 'Deployment to production is blocked. Set allowProduction=true to override.',
            remediation: 'Use a sandbox for testing or explicitly allow production deployment.'
          });
        }

        if (destructiveChanges) {
          result.warnings.push({
            type: 'destructive_to_production',
            severity: SEVERITY.WARNING,
            message: 'Destructive changes to production detected. Ensure you have backups.',
            remediation: 'Create a backup of the affected components before proceeding.'
          });
        }

        if (requireCheckOnly) {
          result.warnings.push({
            type: 'check_only_recommended',
            severity: SEVERITY.INFO,
            message: 'Consider running checkOnly deployment first for production.',
            remediation: 'Use --check-only flag to validate deployment without making changes.'
          });
        }
      }
    } catch (error) {
      result.warnings.push({
        message: `Could not verify org type: ${error.message}. Assuming non-production.`,
        severity: SEVERITY.WARNING
      });
    }

    return result;
  }

  // ============================================================================
  // Helper Methods for New Validations
  // ============================================================================

  /**
   * Query existing metadata from org
   */
  async queryExistingMetadata(metadataType, fullName, orgAlias) {
    if (!orgAlias) return null;

    try {
      const cmd = `sf data query --query "SELECT Id, DeveloperName FROM ${metadataType} WHERE DeveloperName = '${fullName}'" --target-org ${orgAlias} --json`;
      const result = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
      const parsed = JSON.parse(result);
      return parsed.result?.records?.[0] || null;
    } catch {
      // Metadata might not be queryable via SOQL, try tooling API
      try {
        const cmd = `sf data query --query "SELECT Id, DeveloperName FROM ${metadataType} WHERE DeveloperName = '${fullName}'" --target-org ${orgAlias} --use-tooling-api --json`;
        const result = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
        const parsed = JSON.parse(result);
        return parsed.result?.records?.[0] || null;
      } catch {
        return null;
      }
    }
  }

  /**
   * Describe fields to check FLS
   */
  async describeFields(objectName, fields, orgAlias) {
    if (!orgAlias) return {};

    try {
      const cmd = `sf sobject describe --sobject ${objectName} --target-org ${orgAlias} --json`;
      const result = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
      const parsed = JSON.parse(result);
      const fieldDescribe = {};

      for (const field of parsed.result?.fields || []) {
        if (fields.includes(field.name)) {
          fieldDescribe[field.name] = {
            IsCreatable: field.createable,
            IsUpdateable: field.updateable,
            IsDeletable: field.permissionable,
            IsAccessible: field.accessible
          };
        }
      }

      return fieldDescribe;
    } catch {
      return {};
    }
  }

  /**
   * Get org info to determine if production
   */
  async getOrgInfo(orgAlias) {
    if (!orgAlias) {
      return { isProduction: false, orgType: 'unknown' };
    }

    const environment = detectSalesforceEnvironment(orgAlias, {
      useCache: true,
      querySfCli: true,
      timeout: 30000
    });

    return {
      isProduction: environment.isProduction,
      orgType: environment.orgType || 'unknown',
      isSandbox: environment.isSandbox
    };
  }
}

// Export class and constants
module.exports = ToolContractValidator;
module.exports.SEVERITY = SEVERITY;
module.exports.IMMUTABLE_CHANGES = IMMUTABLE_CHANGES;
module.exports.FLS_REQUIREMENTS = FLS_REQUIREMENTS;
module.exports.FieldNameResolver = FieldNameResolver;

if (require.main === module) {
  const validator = new ToolContractValidator({ verbose: true });
  const loaded = validator.loadContracts();
  const command = process.argv[2];

  if (command === 'list') {
    console.log('Registered contracts:', validator.listContracts());
  } else if (command === 'stats') {
    console.log('Statistics:', validator.getStats());
  } else if (command === 'validate') {
    // validate <tool-name> --params-file <file> OR --params <json>
    const toolName = process.argv[3];

    if (!toolName) {
      console.error('ERROR: Tool name required');
      console.error('Usage: node tool-contract-validator.js validate <tool-name> --params-file <file>');
      process.exit(1);
    }

    let params = {};
    const paramsFileIndex = process.argv.indexOf('--params-file');
    const paramsIndex = process.argv.indexOf('--params');

    if (paramsFileIndex > -1 && process.argv[paramsFileIndex + 1]) {
      // Read params from file
      const paramsFile = process.argv[paramsFileIndex + 1];
      try {
        params = JSON.parse(fs.readFileSync(paramsFile, 'utf8'));
      } catch (error) {
        console.error(`ERROR: Failed to read params file: ${error.message}`);
        process.exit(1);
      }
    } else if (paramsIndex > -1 && process.argv[paramsIndex + 1]) {
      // Parse params from command line
      try {
        params = JSON.parse(process.argv[paramsIndex + 1]);
      } catch (error) {
        console.error(`ERROR: Failed to parse params JSON: ${error.message}`);
        process.exit(1);
      }
    }

    // Run validation
    validator.validate(toolName, params)
      .then(result => {
        if (result.valid) {
          console.log(`✅ Validation PASSED for ${toolName}`);
          if (result.warnings && result.warnings.length > 0) {
            console.log('\nWARNINGS:');
            result.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
            process.exit(2); // Exit 2 for warnings
          }
          process.exit(0);
        } else {
          console.error(`❌ Validation FAILED for ${toolName}`);
          console.error('\nERRORS:');
          result.errors.forEach(e => {
            console.error(`  [${e.severity}] ${e.message}`);
            if (e.remediation) {
              console.error(`    💡 ${e.remediation}`);
            }
          });
          process.exit(1);
        }
      })
      .catch(error => {
        console.error(`ERROR: Validation failed: ${error.message}`);
        process.exit(1);
      });
  } else {
    console.log('Commands: list, stats, validate');
    console.log('');
    console.log('Examples:');
    console.log('  node tool-contract-validator.js list');
    console.log('  node tool-contract-validator.js stats');
    console.log('  node tool-contract-validator.js validate sf_data_query --params \'{"query":"SELECT Id FROM Account"}\'');
    console.log('  node tool-contract-validator.js validate sf_data_query --params-file ./params.json');
  }
}
