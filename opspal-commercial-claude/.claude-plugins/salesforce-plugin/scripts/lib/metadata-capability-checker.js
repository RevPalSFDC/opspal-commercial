#!/usr/bin/env node
/**
 * Metadata Capability Checker
 *
 * Pre-flight checks for Salesforce Tooling API object and field availability.
 * Prevents query failures by checking if objects/fields exist before querying.
 *
 * Features:
 * - Check if Tooling API objects exist (FlowDefinitionView, ValidationRule, etc.)
 * - Verify specific fields available on objects
 * - Return capability matrix with availability reasons
 * - Cache describe results per org to avoid repeated API calls
 * - Support for both Tooling API and REST API objects
 * - Automatic fallback suggestions when objects unavailable
 * - Pre-operation validation for preventing "sObject type does not exist" errors
 *
 * Addresses: tool-contract cohort (5 reflections, $39K ROI)
 * Root cause: Naive queries without checking API availability first
 *
 * Usage:
 *   const checker = new MetadataCapabilityChecker();
 *   const flowCap = await checker.checkObject('myorg', 'FlowDefinitionView');
 *   if (flowCap.available) {
 *     // Safe to query FlowDefinitionView
 *   }
 *
 * @version 1.1.0
 * @date 2025-12-09
 */

const { execSync } = require('child_process');

class MetadataCapabilityChecker {
  constructor() {
    // Cache: orgAlias → { objects: {}, fields: {} }
    this.cache = {};

    // Fallback matrix: when primary object unavailable, try these alternatives
    this.fallbacks = {
      'FlowDefinitionView': ['FlowDefinition', 'Flow'],
      'FlowVersionView': ['FlowDefinition', 'Flow'],
      'ValidationRule': ['CustomField'],  // ValidationRules stored differently in some orgs
      'ProcessDefinition': ['FlowDefinition'],  // Process Builder → Flow
      'WorkflowRule': ['FlowDefinition'],  // Workflow Rules → Flow
      'QuickAction': ['FlexiPage'],  // Quick Actions limited in some orgs
      'CustomPermission': ['PermissionSet'],  // CustomPermission via PermissionSet
      'EntityParticle': ['FieldDefinition'],  // Field metadata alternatives
      'FieldDefinition': ['EntityParticle']
    };

    // Common metadata types with their Tooling API status
    this.metadataTypes = {
      // Flow & Automation
      'FlowDefinitionView': { tooling: true, category: 'flow', priority: 'high' },
      'FlowDefinition': { tooling: true, category: 'flow', priority: 'high' },
      'FlowVersionView': { tooling: true, category: 'flow', priority: 'medium' },
      'Flow': { tooling: true, category: 'flow', priority: 'high' },
      'ProcessDefinition': { tooling: true, category: 'automation', priority: 'medium' },
      'WorkflowRule': { tooling: true, category: 'automation', priority: 'medium' },

      // Validation & Business Logic
      'ValidationRule': { tooling: true, category: 'validation', priority: 'high' },
      'RecordType': { tooling: false, category: 'schema', priority: 'medium' },

      // Apex & Code
      'ApexTrigger': { tooling: true, category: 'code', priority: 'high' },
      'ApexClass': { tooling: true, category: 'code', priority: 'high' },
      'ApexPage': { tooling: true, category: 'code', priority: 'medium' },
      'ApexComponent': { tooling: true, category: 'code', priority: 'low' },

      // Fields & Schema
      'CustomField': { tooling: true, category: 'schema', priority: 'high' },
      'CustomObject': { tooling: true, category: 'schema', priority: 'high' },
      'FieldDefinition': { tooling: true, category: 'schema', priority: 'high' },
      'EntityDefinition': { tooling: true, category: 'schema', priority: 'high' },
      'EntityParticle': { tooling: true, category: 'schema', priority: 'medium' },

      // Security & Permissions
      'Profile': { tooling: true, category: 'security', priority: 'high' },
      'PermissionSet': { tooling: true, category: 'security', priority: 'high' },
      'CustomPermission': { tooling: true, category: 'security', priority: 'medium' },

      // UI Components
      'FlexiPage': { tooling: true, category: 'ui', priority: 'medium' },
      'Layout': { tooling: true, category: 'ui', priority: 'medium' },
      'QuickAction': { tooling: true, category: 'ui', priority: 'low' },

      // Reports & Dashboards
      'Report': { tooling: false, category: 'analytics', priority: 'medium' },
      'Dashboard': { tooling: false, category: 'analytics', priority: 'medium' },
      'ReportType': { tooling: true, category: 'analytics', priority: 'low' },

      // CPQ (if installed)
      'SBQQ__Quote__c': { tooling: false, category: 'cpq', priority: 'high' },
      'SBQQ__QuoteLine__c': { tooling: false, category: 'cpq', priority: 'high' },
      'SBQQ__PriceRule__c': { tooling: false, category: 'cpq', priority: 'medium' },
      'SBQQ__ProductRule__c': { tooling: false, category: 'cpq', priority: 'medium' }
    };
  }

  /**
   * Check if a Tooling API object exists
   * @param {string} orgAlias - Salesforce org alias
   * @param {string} objectName - Object API name (e.g., 'FlowDefinitionView')
   * @param {object} options - Configuration options
   * @param {boolean} options.useToolingApi - Use Tooling API (default: true)
   * @returns {Promise<object>} Capability result
   */
  async checkObject(orgAlias, objectName, options = {}) {
    if (!orgAlias || !objectName) {
      throw new Error('orgAlias and objectName are required');
    }

    const useToolingApi = options.useToolingApi !== false;

    // Check cache
    if (this.cache[orgAlias]?.objects?.[objectName]) {
      console.log(`✓ Using cached result for ${objectName}`);
      return this.cache[orgAlias].objects[objectName];
    }

    console.log(`🔍 Checking if ${objectName} is available in ${orgAlias}...`);

    try {
      const command = [
        'sf data query',
        '--query', `"SELECT COUNT() FROM ${objectName} LIMIT 1"`,
        useToolingApi ? '--use-tooling-api' : '',
        '--json',
        '--target-org', orgAlias
      ].filter(Boolean).join(' ');

      const output = execSync(command, {
        encoding: 'utf8',
        timeout: 10000
      });

      const parsed = JSON.parse(output);

      const result = {
        available: parsed.status === 0,
        objectName,
        reason: parsed.status === 0 ? 'Object exists and is queryable' : parsed.message,
        checkedAt: new Date().toISOString()
      };

      // Cache result
      if (!this.cache[orgAlias]) {
        this.cache[orgAlias] = { objects: {}, fields: {} };
      }
      this.cache[orgAlias].objects[objectName] = result;

      if (result.available) {
        console.log(`✓ ${objectName} is available`);
      } else {
        console.log(`⚠️  ${objectName} is NOT available: ${result.reason}`);
      }

      return result;

    } catch (error) {
      // Parse error to determine reason
      let reason = 'Unknown error';

      if (error.stdout) {
        try {
          const errorJson = JSON.parse(error.stdout);
          reason = errorJson.message || errorJson.name || 'Query failed';
        } catch (e) {
          // Could not parse as JSON
        }
      }

      if (error.message) {
        if (error.message.includes('not supported')) {
          reason = 'Object not supported in this org';
        } else if (error.message.includes('sObject type')) {
          reason = 'sObject type does not exist';
        } else if (error.message.includes('INVALID_TYPE')) {
          reason = 'Invalid object type';
        }
      }

      const result = {
        available: false,
        objectName,
        reason,
        error: error.message,
        checkedAt: new Date().toISOString()
      };

      // Cache negative result too
      if (!this.cache[orgAlias]) {
        this.cache[orgAlias] = { objects: {}, fields: {} };
      }
      this.cache[orgAlias].objects[objectName] = result;

      console.log(`⚠️  ${objectName} is NOT available: ${reason}`);

      return result;
    }
  }

  /**
   * Check if specific fields exist on an object
   * @param {string} orgAlias - Salesforce org alias
   * @param {string} objectName - Object API name
   * @param {array} fieldNames - Field API names to check
   * @param {object} options - Configuration options
   * @returns {Promise<object>} Field availability results
   */
  async checkFields(orgAlias, objectName, fieldNames, options = {}) {
    if (!orgAlias || !objectName || !fieldNames || !Array.isArray(fieldNames)) {
      throw new Error('orgAlias, objectName, and fieldNames (array) are required');
    }

    const cacheKey = `${objectName}:${fieldNames.join(',')}`;

    // Check cache
    if (this.cache[orgAlias]?.fields?.[cacheKey]) {
      console.log(`✓ Using cached field results for ${objectName}`);
      return this.cache[orgAlias].fields[cacheKey];
    }

    console.log(`🔍 Checking fields on ${objectName}: ${fieldNames.join(', ')}...`);

    const result = {
      objectName,
      fields: {},
      allAvailable: true
    };

    // Try querying each field
    for (const fieldName of fieldNames) {
      try {
        const command = [
          'sf data query',
          '--query', `"SELECT ${fieldName} FROM ${objectName} LIMIT 1"`,
          options.useToolingApi !== false ? '--use-tooling-api' : '',
          '--json',
          '--target-org', orgAlias
        ].filter(Boolean).join(' ');

        const output = execSync(command, {
          encoding: 'utf8',
          timeout: 10000
        });

        const parsed = JSON.parse(output);

        result.fields[fieldName] = {
          available: parsed.status === 0,
          reason: parsed.status === 0 ? 'Field exists' : parsed.message
        };

        if (!result.fields[fieldName].available) {
          result.allAvailable = false;
        }

      } catch (error) {
        let reason = 'Unknown error';

        if (error.stdout) {
          try {
            const errorJson = JSON.parse(error.stdout);
            reason = errorJson.message || 'Field query failed';
          } catch (e) {
            // Could not parse
          }
        }

        if (error.message.includes('No such column')) {
          reason = 'Field does not exist on object';
        } else if (error.message.includes('INVALID_FIELD')) {
          reason = 'Invalid field name';
        }

        result.fields[fieldName] = {
          available: false,
          reason,
          error: error.message
        };

        result.allAvailable = false;
      }
    }

    // Cache result
    if (!this.cache[orgAlias]) {
      this.cache[orgAlias] = { objects: {}, fields: {} };
    }
    this.cache[orgAlias].fields[cacheKey] = result;

    console.log(`✓ Field check complete: ${Object.values(result.fields).filter(f => f.available).length}/${fieldNames.length} available`);

    return result;
  }

  /**
   * Get fallback suggestions when an object is unavailable
   * @param {string} objectName - Object that's unavailable
   * @returns {Array} Array of fallback suggestions
   */
  getFallbackSuggestions(objectName) {
    const suggestions = [];

    if (this.fallbacks[objectName]) {
      for (const fallback of this.fallbacks[objectName]) {
        suggestions.push({
          objectName: fallback,
          type: 'direct-fallback',
          message: `Use ${fallback} instead of ${objectName}`,
          toolingApi: this.metadataTypes[fallback]?.tooling ?? true
        });
      }
    }

    // Category-based fallbacks
    const originalType = this.metadataTypes[objectName];
    if (originalType) {
      for (const [name, config] of Object.entries(this.metadataTypes)) {
        if (name !== objectName &&
            config.category === originalType.category &&
            !suggestions.find(s => s.objectName === name)) {
          suggestions.push({
            objectName: name,
            type: 'category-fallback',
            message: `Alternative in ${config.category} category`,
            toolingApi: config.tooling
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * Pre-operation validation - check objects before running queries
   * Prevents "sObject type does not exist" errors
   * @param {string} orgAlias - Salesforce org alias
   * @param {Array} objects - Array of object names to check
   * @returns {Promise<object>} Validation result with recommendations
   */
  async preOperationValidation(orgAlias, objects) {
    console.log(`🔍 Pre-operation validation for ${objects.length} object(s)...`);

    const result = {
      canProceed: true,
      available: [],
      unavailable: [],
      fallbacks: {},
      recommendations: []
    };

    for (const objectName of objects) {
      const check = await this.checkObject(orgAlias, objectName, {
        useToolingApi: this.metadataTypes[objectName]?.tooling ?? true
      });

      if (check.available) {
        result.available.push(objectName);
      } else {
        result.unavailable.push(objectName);
        result.canProceed = false;

        // Get fallback suggestions
        const fallbacks = this.getFallbackSuggestions(objectName);
        if (fallbacks.length > 0) {
          result.fallbacks[objectName] = fallbacks;

          // Check if first fallback is available
          const firstFallback = fallbacks[0];
          const fallbackCheck = await this.checkObject(orgAlias, firstFallback.objectName, {
            useToolingApi: firstFallback.toolingApi
          });

          if (fallbackCheck.available) {
            result.recommendations.push({
              type: 'fallback-available',
              original: objectName,
              fallback: firstFallback.objectName,
              message: `${objectName} unavailable, but ${firstFallback.objectName} is available as fallback`
            });
            // Allow proceeding if we have a valid fallback
            result.canProceed = true;
          }
        } else {
          result.recommendations.push({
            type: 'no-fallback',
            object: objectName,
            message: `${objectName} unavailable and no known fallbacks exist`
          });
        }
      }
    }

    return result;
  }

  /**
   * Get a capability report for common audit objects
   * @param {string} orgAlias - Salesforce org alias
   * @param {object} options - Report options
   * @param {string} options.category - Filter by category (flow, validation, code, schema, etc.)
   * @param {boolean} options.includeCPQ - Include CPQ objects
   * @returns {Promise<object>} Capability report
   */
  async getCapabilityReport(orgAlias, options = {}) {
    console.log(`📊 Generating capability report for ${orgAlias}...`);
    console.log('');

    const report = {
      orgAlias,
      generatedAt: new Date().toISOString(),
      objects: {},
      categories: {},
      recommendations: [],
      fallbackMatrix: {}
    };

    // Build objects to check based on options
    let objectsToCheck = Object.entries(this.metadataTypes)
      .filter(([name, config]) => {
        // Filter by category if specified
        if (options.category && config.category !== options.category) {
          return false;
        }
        // Exclude CPQ unless explicitly requested
        if (config.category === 'cpq' && !options.includeCPQ) {
          return false;
        }
        return true;
      })
      .map(([name, config]) => ({
        name,
        tooling: config.tooling,
        category: config.category,
        priority: config.priority
      }));

    // Sort by priority
    const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
    objectsToCheck.sort((a, b) =>
      (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2)
    );

    // Check each object
    for (const obj of objectsToCheck) {
      const result = await this.checkObject(orgAlias, obj.name, { useToolingApi: obj.tooling });
      report.objects[obj.name] = {
        ...result,
        category: obj.category,
        priority: obj.priority
      };

      // Organize by category
      if (!report.categories[obj.category]) {
        report.categories[obj.category] = { available: [], unavailable: [] };
      }
      if (result.available) {
        report.categories[obj.category].available.push(obj.name);
      } else {
        report.categories[obj.category].unavailable.push(obj.name);
        // Add fallback suggestions
        report.fallbackMatrix[obj.name] = this.getFallbackSuggestions(obj.name);
      }
    }

    // Generate recommendations based on patterns
    this._generateRecommendations(report);

    return report;
  }

  /**
   * Generate recommendations based on capability check results
   * @private
   */
  _generateRecommendations(report) {
    // Flow-related recommendations
    if (!report.objects['FlowDefinitionView']?.available && report.objects['FlowDefinition']?.available) {
      report.recommendations.push({
        type: 'fallback',
        severity: 'medium',
        message: 'Use FlowDefinition instead of FlowDefinitionView for flow queries',
        impact: 'Flow metadata extraction will have limited fields available',
        action: 'Update queries to use FlowDefinition object'
      });
    }

    // Validation rule recommendations
    if (!report.objects['ValidationRule']?.available) {
      report.recommendations.push({
        type: 'critical',
        severity: 'high',
        message: 'ValidationRule object not available - validation audit will fail',
        impact: 'Cannot audit validation rules in this org',
        action: 'Use Metadata API retrieval instead of Tooling API queries'
      });
    }

    // CPQ recommendations
    if (report.objects['SBQQ__Quote__c'] && !report.objects['SBQQ__Quote__c'].available) {
      report.recommendations.push({
        type: 'info',
        severity: 'low',
        message: 'Salesforce CPQ not installed in this org',
        impact: 'CPQ-related assessments will not be applicable',
        action: 'Skip CPQ assessment or verify CPQ package installation'
      });
    }

    // Category-level recommendations
    for (const [category, status] of Object.entries(report.categories)) {
      if (status.unavailable.length > 0 && status.available.length === 0) {
        report.recommendations.push({
          type: 'category-unavailable',
          severity: 'high',
          message: `No ${category} objects available for audit`,
          impact: `Cannot perform ${category}-related operations`,
          action: `Check org permissions or API access for ${category} metadata`
        });
      }
    }
  }

  /**
   * Clear cache for specific org or all orgs
   * @param {string} orgAlias - Optional org alias to clear
   */
  clearCache(orgAlias = null) {
    if (orgAlias) {
      delete this.cache[orgAlias];
      console.log(`✓ Cleared cache for ${orgAlias}`);
    } else {
      this.cache = {};
      console.log('✓ Cleared all cached capability checks');
    }
  }

  /**
   * Get all cached results
   * @returns {object} Cache contents
   */
  getCachedResults() {
    return { ...this.cache };
  }
}

// CLI Execution
if (require.main === module) {
  const orgAlias = process.argv[2];
  const action = process.argv[3];
  const target = process.argv[4];

  if (!orgAlias) {
    console.error(`
╔════════════════════════════════════════════════════════════════════════════╗
║              METADATA CAPABILITY CHECKER v1.1.0                            ║
║                                                                            ║
║   Pre-flight validation to prevent "sObject type does not exist" errors    ║
║   ROI: $39K/year (addresses tool-contract cohort - 5 reflections)          ║
╚════════════════════════════════════════════════════════════════════════════╝

USAGE:
  node metadata-capability-checker.js <org-alias> <action> [target]

ACTIONS:
  check-object <object-name>
    Check if a single object is available

  check-fields <object-name> <field1,field2,...>
    Check if specific fields exist on an object

  pre-validate <object1,object2,...>
    Pre-operation validation with fallback suggestions

  report [--category <category>] [--include-cpq]
    Generate full capability report
    Categories: flow, automation, validation, code, schema, security, ui, analytics

  fallbacks <object-name>
    Show fallback suggestions for an object

  clear-cache
    Clear cached results

EXAMPLES:
  # Check single object
  node metadata-capability-checker.js myorg check-object FlowDefinitionView

  # Check fields
  node metadata-capability-checker.js myorg check-fields ValidationRule EntityDefinition.QualifiedApiName,Active

  # Pre-validate before operation
  node metadata-capability-checker.js myorg pre-validate FlowDefinitionView,ValidationRule,ApexTrigger

  # Generate flow-focused report
  node metadata-capability-checker.js myorg report --category flow

  # Get fallback suggestions
  node metadata-capability-checker.js myorg fallbacks FlowDefinitionView

EXIT CODES:
  0 - Success (object available / report generated)
  1 - Error (object unavailable / validation failed)
`);
    process.exit(1);
  }

  const checker = new MetadataCapabilityChecker();

  (async () => {
    try {
      switch (action) {
        case 'check-object':
          if (!target) {
            console.error('Error: Object name required');
            process.exit(1);
          }
          const objResult = await checker.checkObject(orgAlias, target);
          console.log('\n📊 Result:');
          console.log(JSON.stringify(objResult, null, 2));
          process.exit(objResult.available ? 0 : 1);
          break;

        case 'check-fields':
          if (!target) {
            console.error('Error: Object name and field list required');
            console.error('Format: check-fields ObjectName field1,field2,field3');
            process.exit(1);
          }
          const fieldList = process.argv[5];
          if (!fieldList) {
            console.error('Error: Field list required (comma-separated)');
            process.exit(1);
          }
          const fields = fieldList.split(',').map(f => f.trim());
          const fieldResult = await checker.checkFields(orgAlias, target, fields);
          console.log('\n📊 Result:');
          console.log(JSON.stringify(fieldResult, null, 2));
          process.exit(fieldResult.allAvailable ? 0 : 1);
          break;

        case 'pre-validate':
          if (!target) {
            console.error('Error: Object list required (comma-separated)');
            process.exit(1);
          }
          const objectList = target.split(',').map(o => o.trim());
          const validationResult = await checker.preOperationValidation(orgAlias, objectList);
          console.log('\n📊 Pre-Operation Validation Result:');
          console.log(JSON.stringify(validationResult, null, 2));

          if (!validationResult.canProceed) {
            console.log('\n❌ VALIDATION FAILED - Operation blocked');
            if (validationResult.recommendations.length > 0) {
              console.log('\n💡 Recommendations:');
              validationResult.recommendations.forEach(rec => {
                console.log(`   • ${rec.message}`);
              });
            }
          } else {
            console.log('\n✅ VALIDATION PASSED - Operation can proceed');
          }
          process.exit(validationResult.canProceed ? 0 : 1);
          break;

        case 'report':
          const reportOptions = {};
          // Parse options
          for (let i = 4; i < process.argv.length; i++) {
            if (process.argv[i] === '--category' && process.argv[i + 1]) {
              reportOptions.category = process.argv[i + 1];
              i++;
            }
            if (process.argv[i] === '--include-cpq') {
              reportOptions.includeCPQ = true;
            }
          }
          const report = await checker.getCapabilityReport(orgAlias, reportOptions);
          console.log('\n📊 Capability Report:');
          console.log(JSON.stringify(report, null, 2));
          break;

        case 'fallbacks':
          if (!target) {
            console.error('Error: Object name required');
            process.exit(1);
          }
          const fallbacks = checker.getFallbackSuggestions(target);
          console.log(`\n📊 Fallback Suggestions for ${target}:`);
          if (fallbacks.length === 0) {
            console.log('   No known fallbacks for this object');
          } else {
            fallbacks.forEach(fb => {
              console.log(`   • ${fb.objectName} (${fb.type}): ${fb.message}`);
            });
          }
          break;

        case 'clear-cache':
          checker.clearCache(orgAlias);
          break;

        default:
          console.error(`Unknown action: ${action}`);
          process.exit(1);
      }

      process.exit(0);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = MetadataCapabilityChecker;
