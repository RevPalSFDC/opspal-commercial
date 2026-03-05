#!/usr/bin/env node

/**
 * Unified Pre-Operation Validation Orchestrator
 *
 * Single entry point for ALL pre-operation validations. Integrates:
 * - MetadataDependencyAnalyzer (field references - schema/parse cohort)
 * - EnvConfigValidator (path resolution - config/env cohort)
 * - MetadataCapabilityChecker (API availability - tool-contract cohort)
 * - FlowFieldReferenceValidator (flow field checks)
 * - DeploymentSourceValidator (structure validation)
 *
 * Phase 2.1 of Reflection-Based Infrastructure Improvements
 * Addresses: Cross-cohort prevention through unified validation
 *
 * Features:
 * - Operation type detection (deploy, query, create, delete)
 * - Validator selection matrix by operation type
 * - Parallel validation execution for performance
 * - Unified error/warning aggregation
 * - Operation-blocking based on severity
 * - Caching to avoid repeated checks
 *
 * Usage:
 *   const orchestrator = new PreOperationValidationOrchestrator(orgAlias);
 *   const result = await orchestrator.validate('deploy', {
 *     deployDir: './force-app',
 *     metadata: ['Flow', 'ValidationRule']
 *   });
 *
 * CLI:
 *   node pre-operation-validation-orchestrator.js <org> <operation> [options]
 *
 * @version 1.0.0
 * @date 2025-12-09
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Validator Loading (lazy load to avoid startup overhead)
// ============================================================================

let MetadataDependencyAnalyzer = null;
let MetadataCapabilityChecker = null;
let envConfigValidator = null;

function loadValidators() {
  const salesforcePluginPath = path.join(__dirname, '../../..', 'salesforce-plugin/scripts/lib');

  try {
    MetadataDependencyAnalyzer = require(path.join(salesforcePluginPath, 'metadata-dependency-analyzer.js'));
  } catch (e) {
    console.warn('MetadataDependencyAnalyzer not available:', e.message);
  }

  try {
    MetadataCapabilityChecker = require(path.join(salesforcePluginPath, 'metadata-capability-checker.js'));
  } catch (e) {
    console.warn('MetadataCapabilityChecker not available:', e.message);
  }

  try {
    envConfigValidator = require(path.join(__dirname, 'env-config-validator.js'));
  } catch (e) {
    console.warn('EnvConfigValidator not available:', e.message);
  }
}

// ============================================================================
// Operation Type Definitions
// ============================================================================

const OPERATION_TYPES = {
  deploy: {
    description: 'Deploying metadata to Salesforce',
    validators: ['dependency', 'capability', 'structure', 'deploymentOrder'],
    blocking: true,
    timeout: 30000
  },
  query: {
    description: 'Querying Salesforce data or metadata',
    validators: ['capability', 'environment'],
    blocking: false,
    timeout: 10000
  },
  create: {
    description: 'Creating new metadata components',
    validators: ['capability', 'environment', 'dependency'],
    blocking: true,
    timeout: 20000
  },
  delete: {
    description: 'Deleting metadata components',
    validators: ['dependency', 'capability'],
    blocking: true,
    timeout: 20000
  },
  update: {
    description: 'Updating existing metadata',
    validators: ['dependency', 'capability', 'flowReference'],
    blocking: true,
    timeout: 20000
  },
  audit: {
    description: 'Running assessment or audit',
    validators: ['capability', 'environment'],
    blocking: false,
    timeout: 15000
  }
};

// ============================================================================
// Severity Levels
// ============================================================================

const SEVERITY = {
  CRITICAL: { level: 0, name: 'critical', blocking: true },
  ERROR: { level: 1, name: 'error', blocking: true },
  WARNING: { level: 2, name: 'warning', blocking: false },
  INFO: { level: 3, name: 'info', blocking: false }
};

// ============================================================================
// Main Orchestrator Class
// ============================================================================

class PreOperationValidationOrchestrator {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.options = {
      verbose: options.verbose || false,
      parallel: options.parallel !== false,  // Default: parallel execution
      timeout: options.timeout || 30000,
      blockOnError: options.blockOnError !== false,  // Default: block on errors
      blockOnWarning: options.blockOnWarning || false,
      skipCache: options.skipCache || false
    };

    // Lazy load validators
    loadValidators();

    // Initialize validator instances
    this.validators = {};
    this._initializeValidators();

    // Results cache
    this.cache = {};
  }

  /**
   * Initialize validator instances
   * @private
   */
  _initializeValidators() {
    if (MetadataDependencyAnalyzer) {
      this.validators.dependency = new MetadataDependencyAnalyzer(this.orgAlias, {
        verbose: this.options.verbose
      });
    }

    if (MetadataCapabilityChecker) {
      this.validators.capability = new MetadataCapabilityChecker();
    }

    if (envConfigValidator) {
      this.validators.environment = envConfigValidator;
    }
  }

  /**
   * Main validation entry point
   * @param {string} operationType - Type of operation (deploy, query, create, delete, update, audit)
   * @param {object} context - Operation context
   * @returns {Promise<object>} Validation result
   */
  async validate(operationType, context = {}) {
    const startTime = Date.now();

    this._log(`\n📋 Pre-Operation Validation Orchestrator`);
    this._log(`   Operation: ${operationType}`);
    this._log(`   Org: ${this.orgAlias}`);
    this._log('');

    // Get operation config
    const opConfig = OPERATION_TYPES[operationType];
    if (!opConfig) {
      return this._buildResult(false, [{
        validator: 'orchestrator',
        severity: SEVERITY.ERROR,
        message: `Unknown operation type: ${operationType}`,
        suggestion: `Valid types: ${Object.keys(OPERATION_TYPES).join(', ')}`
      }], startTime);
    }

    // Check cache
    const cacheKey = this._getCacheKey(operationType, context);
    if (!this.options.skipCache && this.cache[cacheKey]) {
      this._log('✓ Using cached validation result');
      return this.cache[cacheKey];
    }

    // Run validators
    const validatorResults = await this._runValidators(opConfig.validators, context);

    // Aggregate results
    const result = this._aggregateResults(validatorResults, opConfig, startTime);

    // Cache result
    if (!this.options.skipCache) {
      this.cache[cacheKey] = result;
    }

    // Log summary
    this._logSummary(result);

    return result;
  }

  /**
   * Run selected validators
   * @private
   */
  async _runValidators(validatorNames, context) {
    const results = [];

    if (this.options.parallel) {
      // Parallel execution
      const promises = validatorNames.map(name =>
        this._runValidator(name, context).catch(err => ({
          validator: name,
          success: false,
          error: err.message
        }))
      );

      const parallelResults = await Promise.all(promises);
      results.push(...parallelResults);
    } else {
      // Sequential execution
      for (const name of validatorNames) {
        try {
          const result = await this._runValidator(name, context);
          results.push(result);
        } catch (err) {
          results.push({
            validator: name,
            success: false,
            error: err.message
          });
        }
      }
    }

    return results;
  }

  /**
   * Run a single validator
   * @private
   */
  async _runValidator(name, context) {
    const startTime = Date.now();
    this._log(`  🔍 Running ${name} validator...`);

    let result = {
      validator: name,
      success: true,
      issues: [],
      duration: 0
    };

    try {
      switch (name) {
        case 'dependency':
          result = await this._runDependencyValidator(context);
          break;

        case 'capability':
          result = await this._runCapabilityValidator(context);
          break;

        case 'environment':
          result = await this._runEnvironmentValidator(context);
          break;

        case 'structure':
          result = await this._runStructureValidator(context);
          break;

        case 'deploymentOrder':
          result = await this._runDeploymentOrderValidator(context);
          break;

        case 'flowReference':
          result = await this._runFlowReferenceValidator(context);
          break;

        default:
          result.issues.push({
            severity: SEVERITY.WARNING,
            message: `Unknown validator: ${name}`
          });
      }
    } catch (err) {
      result.success = false;
      result.error = err.message;
      result.issues.push({
        severity: SEVERITY.ERROR,
        message: `Validator error: ${err.message}`
      });
    }

    result.duration = Date.now() - startTime;
    result.validator = name;

    const status = result.success ? '✅' : '❌';
    this._log(`  ${status} ${name}: ${result.duration}ms`);

    return result;
  }

  /**
   * Run dependency validator
   * @private
   */
  async _runDependencyValidator(context) {
    const result = { success: true, issues: [] };

    if (!this.validators.dependency) {
      result.issues.push({
        severity: SEVERITY.WARNING,
        message: 'Dependency analyzer not available'
      });
      return result;
    }

    // Check for field deletions
    if (context.deletedFields && context.deletedFields.length > 0) {
      for (const field of context.deletedFields) {
        const [objectName, fieldName] = field.split('.');
        const analysis = await this.validators.dependency.analyzeField(objectName, fieldName);

        if (analysis.totalReferences > 0) {
          result.success = false;
          result.issues.push({
            severity: SEVERITY.CRITICAL,
            message: `Field ${field} has ${analysis.totalReferences} active references`,
            details: analysis,
            suggestion: 'Update or remove references before deleting'
          });
        }
      }
    }

    // Check deployment directory for flow patterns
    if (context.deployDir) {
      const flowCheck = await this.validators.dependency.checkDeployment(context.deployDir);
      if (!flowCheck.canDeploy) {
        result.success = false;
        result.issues.push({
          severity: SEVERITY.ERROR,
          message: `Deployment blocked: ${flowCheck.blockers?.length || 0} blocking issues`,
          details: flowCheck
        });
      }
    }

    return result;
  }

  /**
   * Run capability validator
   * @private
   */
  async _runCapabilityValidator(context) {
    const result = { success: true, issues: [] };

    if (!this.validators.capability) {
      result.issues.push({
        severity: SEVERITY.WARNING,
        message: 'Capability checker not available'
      });
      return result;
    }

    // Check objects if specified
    if (context.objects && context.objects.length > 0) {
      const validation = await this.validators.capability.preOperationValidation(
        this.orgAlias,
        context.objects
      );

      if (!validation.canProceed) {
        result.success = false;
        for (const obj of validation.unavailable) {
          const fallbacks = validation.fallbacks[obj] || [];
          result.issues.push({
            severity: SEVERITY.ERROR,
            message: `Object ${obj} not available`,
            fallbacks: fallbacks.map(f => f.objectName),
            suggestion: fallbacks.length > 0
              ? `Try using ${fallbacks[0].objectName} instead`
              : 'Check API access and permissions'
          });
        }
      }

      // Add recommendations as warnings
      for (const rec of validation.recommendations) {
        if (rec.type === 'fallback-available') {
          result.issues.push({
            severity: SEVERITY.INFO,
            message: rec.message
          });
        }
      }
    }

    // Check metadata types if specified
    if (context.metadata && context.metadata.length > 0) {
      const report = await this.validators.capability.getCapabilityReport(this.orgAlias, {
        category: context.category
      });

      for (const rec of report.recommendations) {
        result.issues.push({
          severity: rec.severity === 'high' ? SEVERITY.WARNING : SEVERITY.INFO,
          message: rec.message,
          action: rec.action
        });
      }
    }

    return result;
  }

  /**
   * Run environment validator
   * @private
   */
  async _runEnvironmentValidator(context) {
    const result = { success: true, issues: [] };

    if (!this.validators.environment) {
      result.issues.push({
        severity: SEVERITY.WARNING,
        message: 'Environment validator not available'
      });
      return result;
    }

    // Detect environment
    const env = this.validators.environment.detectEnvironment();

    // Check path resolution
    if (context.platform && context.instance) {
      const resolution = this.validators.environment.resolveInstancePath(
        context.platform,
        context.instance
      );

      if (!resolution.resolved) {
        result.issues.push({
          severity: SEVERITY.WARNING,
          message: resolution.message,
          suggestion: resolution.suggestion
        });
      } else {
        // Check for ENV_CONFIG.json
        const config = this.validators.environment.loadEnvConfig(
          context.platform,
          context.instance
        );

        if (!config.exists) {
          result.issues.push({
            severity: SEVERITY.INFO,
            message: config.message,
            suggestion: `Generate with: node env-config-validator.js generate ${context.platform} ${context.instance}`
          });
        }
      }
    }

    return result;
  }

  /**
   * Run structure validator
   * @private
   */
  async _runStructureValidator(context) {
    const result = { success: true, issues: [] };

    if (!context.deployDir) {
      return result;
    }

    // Check if deployment directory exists
    if (!fs.existsSync(context.deployDir)) {
      result.success = false;
      result.issues.push({
        severity: SEVERITY.ERROR,
        message: `Deployment directory not found: ${context.deployDir}`
      });
      return result;
    }

    // Check for package.xml or proper structure
    const packageXmlPath = path.join(context.deployDir, 'package.xml');
    const hasPackageXml = fs.existsSync(packageXmlPath);

    // Check for force-app structure
    const mainDefaultPath = path.join(context.deployDir, 'main', 'default');
    const isSourceFormat = fs.existsSync(mainDefaultPath);

    if (!hasPackageXml && !isSourceFormat) {
      result.issues.push({
        severity: SEVERITY.WARNING,
        message: 'Non-standard deployment structure detected',
        suggestion: 'Use source format (force-app/main/default) or include package.xml'
      });
    }

    return result;
  }

  /**
   * Run deployment order validator
   * @private
   */
  async _runDeploymentOrderValidator(context) {
    const result = { success: true, issues: [] };

    if (!this.validators.environment || !context.deployDir) {
      return result;
    }

    // Check for common ordering issues
    const deployDir = context.deployDir;

    // Reports need folders first
    const reportsDir = path.join(deployDir, 'reports');
    if (fs.existsSync(reportsDir)) {
      const reports = fs.readdirSync(reportsDir).filter(f => f.endsWith('.report-meta.xml'));
      const folders = fs.readdirSync(reportsDir).filter(f => f.endsWith('.reportFolder-meta.xml'));

      if (reports.length > 0 && folders.length === 0) {
        result.issues.push({
          severity: SEVERITY.WARNING,
          message: `${reports.length} reports found but no report folders`,
          suggestion: 'Deploy report folders before reports'
        });
      }
    }

    // Custom Metadata should deploy before flows
    const customMetadataDir = path.join(deployDir, 'customMetadata');
    const flowsDir = path.join(deployDir, 'flows');

    if (fs.existsSync(customMetadataDir) && fs.existsSync(flowsDir)) {
      result.issues.push({
        severity: SEVERITY.INFO,
        message: 'Custom Metadata and Flows detected - ensure correct deployment order',
        suggestion: 'Custom Metadata should deploy before Flows that reference them'
      });
    }

    return result;
  }

  /**
   * Run flow reference validator
   * @private
   */
  async _runFlowReferenceValidator(context) {
    const result = { success: true, issues: [] };

    // Check for flow XML patterns
    if (context.flowPaths && context.flowPaths.length > 0 && this.validators.dependency) {
      for (const flowPath of context.flowPaths) {
        if (fs.existsSync(flowPath)) {
          const flowXML = fs.readFileSync(flowPath, 'utf8');
          const validation = this.validators.dependency.validateFlowXMLPatterns(flowXML);

          if (!validation.valid) {
            result.success = false;
            for (const error of validation.errors) {
              result.issues.push({
                severity: SEVERITY.ERROR,
                message: `${path.basename(flowPath)}: ${error.message}`,
                fix: error.fix
              });
            }
          }

          for (const warning of validation.warnings) {
            result.issues.push({
              severity: SEVERITY.WARNING,
              message: `${path.basename(flowPath)}: ${warning.message}`,
              fix: warning.fix
            });
          }
        }
      }
    }

    return result;
  }

  /**
   * Aggregate results from all validators
   * @private
   */
  _aggregateResults(validatorResults, opConfig, startTime) {
    const result = {
      success: true,
      canProceed: true,
      operation: opConfig.description,
      org: this.orgAlias,
      duration: Date.now() - startTime,
      validators: {},
      summary: {
        critical: 0,
        errors: 0,
        warnings: 0,
        info: 0
      },
      issues: [],
      recommendations: []
    };

    for (const vResult of validatorResults) {
      result.validators[vResult.validator] = {
        success: vResult.success,
        duration: vResult.duration,
        issueCount: vResult.issues?.length || 0
      };

      if (!vResult.success) {
        result.success = false;
      }

      // Aggregate issues
      if (vResult.issues) {
        for (const issue of vResult.issues) {
          result.issues.push({
            ...issue,
            validator: vResult.validator
          });

          // Count by severity
          const severityName = issue.severity?.name || 'info';
          if (severityName === 'critical') result.summary.critical++;
          else if (severityName === 'error') result.summary.errors++;
          else if (severityName === 'warning') result.summary.warnings++;
          else result.summary.info++;
        }
      }
    }

    // Determine if operation can proceed
    if (this.options.blockOnError && (result.summary.critical > 0 || result.summary.errors > 0)) {
      result.canProceed = false;
    }

    if (this.options.blockOnWarning && result.summary.warnings > 0) {
      result.canProceed = false;
    }

    // Generate recommendations
    if (result.summary.critical > 0 || result.summary.errors > 0) {
      result.recommendations.push('Fix critical/error issues before proceeding');
    }

    if (result.summary.warnings > 0) {
      result.recommendations.push(`Review ${result.summary.warnings} warning(s) - may cause issues`);
    }

    return result;
  }

  /**
   * Generate cache key
   * @private
   */
  _getCacheKey(operationType, context) {
    const contextHash = JSON.stringify(context).slice(0, 100);
    return `${this.orgAlias}:${operationType}:${contextHash}`;
  }

  /**
   * Log message if verbose
   * @private
   */
  _log(message) {
    if (this.options.verbose) {
      console.log(message);
    }
  }

  /**
   * Log summary
   * @private
   */
  _logSummary(result) {
    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    console.log('  VALIDATION SUMMARY');
    console.log('════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`  Duration: ${result.duration}ms`);
    console.log(`  Critical: ${result.summary.critical}`);
    console.log(`  Errors:   ${result.summary.errors}`);
    console.log(`  Warnings: ${result.summary.warnings}`);
    console.log(`  Info:     ${result.summary.info}`);
    console.log('');

    if (result.canProceed) {
      console.log('  ✅ VALIDATION PASSED - Operation can proceed');
    } else {
      console.log('  ❌ VALIDATION FAILED - Operation blocked');
    }

    if (result.recommendations.length > 0) {
      console.log('');
      console.log('  💡 Recommendations:');
      result.recommendations.forEach(rec => {
        console.log(`     • ${rec}`);
      });
    }

    console.log('');
    console.log('════════════════════════════════════════════════════════════');
  }

  /**
   * Clear validation cache
   */
  clearCache() {
    this.cache = {};
    console.log('✓ Validation cache cleared');
  }
}

// ============================================================================
// CLI Execution
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const orgAlias = args[0];
  const operation = args[1];

  if (!orgAlias || !operation) {
    console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║           UNIFIED PRE-OPERATION VALIDATION ORCHESTRATOR                    ║
║                                                                            ║
║   Single entry point for all pre-operation validations                     ║
║   Integrates: dependency, capability, environment, structure validators    ║
╚════════════════════════════════════════════════════════════════════════════╝

USAGE:
  node pre-operation-validation-orchestrator.js <org-alias> <operation> [options]

OPERATIONS:
  deploy     Validate before metadata deployment
  query      Validate before data/metadata query
  create     Validate before creating new components
  delete     Validate before deleting components
  update     Validate before updating components
  audit      Validate before running assessment

OPTIONS:
  --deploy-dir <path>      Deployment directory (for deploy operation)
  --objects <obj1,obj2>    Objects to validate (comma-separated)
  --metadata <type1,type2> Metadata types to check
  --platform <platform>    Platform (salesforce, hubspot)
  --instance <name>        Instance name
  --verbose                Show detailed output
  --no-parallel            Run validators sequentially
  --skip-cache             Skip cached results
  --json                   Output as JSON

EXAMPLES:
  # Validate deployment
  node pre-operation-validation-orchestrator.js myorg deploy --deploy-dir ./force-app --verbose

  # Validate query objects
  node pre-operation-validation-orchestrator.js myorg query --objects FlowDefinitionView,ValidationRule

  # Validate audit prerequisites
  node pre-operation-validation-orchestrator.js myorg audit --platform salesforce --instance myorg

  # Full validation with JSON output
  node pre-operation-validation-orchestrator.js myorg deploy --deploy-dir ./force-app --json

EXIT CODES:
  0 - Validation passed, operation can proceed
  1 - Validation failed, operation blocked
`);
    process.exit(1);
  }

  // Parse options
  const options = {
    verbose: args.includes('--verbose'),
    parallel: !args.includes('--no-parallel'),
    skipCache: args.includes('--skip-cache'),
    json: args.includes('--json')
  };

  const context = {};

  // Parse context options
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--deploy-dir' && args[i + 1]) {
      context.deployDir = args[++i];
    } else if (args[i] === '--objects' && args[i + 1]) {
      context.objects = args[++i].split(',').map(o => o.trim());
    } else if (args[i] === '--metadata' && args[i + 1]) {
      context.metadata = args[++i].split(',').map(m => m.trim());
    } else if (args[i] === '--platform' && args[i + 1]) {
      context.platform = args[++i];
    } else if (args[i] === '--instance' && args[i + 1]) {
      context.instance = args[++i];
    } else if (args[i] === '--deleted-fields' && args[i + 1]) {
      context.deletedFields = args[++i].split(',').map(f => f.trim());
    }
  }

  const orchestrator = new PreOperationValidationOrchestrator(orgAlias, options);

  (async () => {
    try {
      const result = await orchestrator.validate(operation, context);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      }

      process.exit(result.canProceed ? 0 : 1);
    } catch (error) {
      console.error('Error:', error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  })();
}

module.exports = PreOperationValidationOrchestrator;
