#!/usr/bin/env node
/**
 * Unified Validation Pipeline
 *
 * Orchestrates all validation stages to provide comprehensive error prevention.
 * Integrates: schema, parse, data quality, tool contract, and permission validation.
 *
 * Target: <500ms end-to-end validation, 95%+ pass rate for legitimate operations
 *
 * @module unified-validation-pipeline
 * @version 1.0.0
 * @created 2026-01-06
 */

const fs = require('fs');
const path = require('path');
const SchemaRegistry = require('./schema-registry');
const ParseErrorHandler = require('./parse-error-handler');
const ToolContractValidator = require('./tool-contract-validator');
const { requireProtectedModule } = require('./protected-asset-runtime');

// Conditional requires for Salesforce-specific validators
let EnhancedDataQualityFramework;
let EnhancedPermissionValidator;

try {
  const salesforcePluginRoot = path.resolve(__dirname, '../../../opspal-salesforce');
  if (fs.existsSync(salesforcePluginRoot)) {
    EnhancedDataQualityFramework = requireProtectedModule({
      pluginRoot: salesforcePluginRoot,
      pluginName: 'opspal-salesforce',
      relativePath: 'scripts/lib/enhanced-data-quality-framework.js',
      allowPlaintextFallback: true
    });
  }
} catch (e) {
  // Salesforce plugin not available
}

try {
  EnhancedPermissionValidator = require('../../../opspal-salesforce/scripts/lib/validators/enhanced-permission-validator');
} catch (e) {
  // Salesforce plugin not available
}

const SEVERITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  WARNING: 'WARNING',
  INFO: 'INFO'
};

const STAGE = {
  SCHEMA: 'schema',
  PARSE: 'parse',
  DATA_QUALITY: 'dataQuality',
  TOOL_CONTRACT: 'toolContract',
  PERMISSIONS: 'permissions'
};

/**
 * Default pipeline configuration
 */
const DEFAULT_CONFIG = {
  stages: {
    schema: {
      enabled: true,
      blocking: true,          // CRITICAL errors block
      warningMode: false        // Warnings pass through
    },
    parse: {
      enabled: true,
      blocking: true,
      warningMode: false,
      autoFix: true            // Attempt auto-fix before failing
    },
    dataQuality: {
      enabled: true,
      threshold: 70,           // Minimum quality score
      blocking: 'criticalOnly', // 'always', 'criticalOnly', 'never'
      blockThreshold: 50        // Block if score < 50
    },
    toolContract: {
      enabled: true,
      blocking: true,
      warningMode: false
    },
    permissions: {
      enabled: true,
      blocking: true,
      warningMode: false,
      requireSalesforce: true   // Only run if Salesforce context available
    }
  },
  parallelization: {
    enabled: true,
    maxConcurrent: 3
  },
  performance: {
    timeoutMs: 500,            // Total pipeline timeout
    stageTimeoutMs: 200        // Per-stage timeout
  },
  reporting: {
    verbose: false,
    includeRemediation: true,
    aggregateErrors: true
  }
};

/**
 * Unified Validation Pipeline
 *
 * Orchestrates multiple validation stages with configurable blocking behavior,
 * parallel execution, and comprehensive error reporting.
 */
class UnifiedValidationPipeline {
  constructor(options = {}) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, options.config || {});
    this.verbose = options.verbose || this.config.reporting.verbose;

    // Initialize validators
    this.validators = {
      schema: new SchemaRegistry({ verbose: this.verbose }),
      parse: new ParseErrorHandler({ verbose: this.verbose }),
      toolContract: new ToolContractValidator({ verbose: this.verbose })
    };

    // Load schemas and contracts
    this.validators.schema.loadAllSchemas();
    this.validators.toolContract.loadContracts();

    // Initialize Salesforce validators if available
    if (EnhancedDataQualityFramework) {
      this.validators.dataQuality = new EnhancedDataQualityFramework({ verbose: this.verbose });
    }

    // Permission validator requires org context
    this.validators.permissions = null;

    // Statistics
    this.stats = {
      totalValidations: 0,
      passed: 0,
      failed: 0,
      blocked: 0,
      byStage: {},
      bySeverity: { CRITICAL: 0, HIGH: 0, WARNING: 0, INFO: 0 },
      avgValidationTime: 0,
      timeouts: 0
    };

    // Initialize stage stats
    Object.values(STAGE).forEach(stage => {
      this.stats.byStage[stage] = {
        validations: 0,
        passed: 0,
        failed: 0,
        blocked: 0,
        avgTime: 0
      };
    });
  }

  /**
   * Merge user config with defaults
   */
  mergeConfig(defaults, userConfig) {
    const merged = JSON.parse(JSON.stringify(defaults));

    if (userConfig.stages) {
      Object.keys(userConfig.stages).forEach(stage => {
        merged.stages[stage] = {
          ...merged.stages[stage],
          ...userConfig.stages[stage]
        };
      });
    }

    if (userConfig.parallelization) {
      merged.parallelization = {
        ...merged.parallelization,
        ...userConfig.parallelization
      };
    }

    if (userConfig.performance) {
      merged.performance = {
        ...merged.performance,
        ...userConfig.performance
      };
    }

    if (userConfig.reporting) {
      merged.reporting = {
        ...merged.reporting,
        ...userConfig.reporting
      };
    }

    return merged;
  }

  /**
   * Main validation entry point
   *
   * @param {Object} context - Validation context
   * @param {string} context.type - Type of validation (reflection, tool, data, etc.)
   * @param {Object} context.data - Data to validate
   * @param {string} [context.schemaName] - Schema name for schema validation
   * @param {string} [context.format] - Format for parse validation (json, xml, csv)
   * @param {string} [context.toolName] - Tool name for contract validation
   * @param {Object} [context.toolParams] - Tool parameters
   * @param {string} [context.orgAlias] - Salesforce org alias for permission validation
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation result
   */
  async validate(context, options = {}) {
    const startTime = Date.now();
    this.stats.totalValidations++;

    const results = {
      valid: true,
      blocked: false,
      stages: {},
      errors: [],
      warnings: [],
      summary: {},
      validationTime: 0
    };

    try {
      // Determine which stages to run
      const stages = this.determineStages(context);

      // Execute stages
      if (this.config.parallelization.enabled && stages.length > 1) {
        // Parallel execution for independent stages
        await this.executeParallel(stages, context, results);
      } else {
        // Sequential execution
        await this.executeSequential(stages, context, results);
      }

      // Aggregate results
      this.aggregateResults(results);

      // Determine final validation status
      results.valid = !results.errors.some(e => e.severity === SEVERITY.CRITICAL);
      results.blocked = this.shouldBlock(results);

      // Update statistics
      if (results.valid) {
        this.stats.passed++;
      } else {
        this.stats.failed++;
      }
      if (results.blocked) {
        this.stats.blocked++;
      }

      results.validationTime = Date.now() - startTime;
      this.updateAvgValidationTime(results.validationTime);

      return results;

    } catch (error) {
      results.valid = false;
      results.blocked = true;
      results.errors.push({
        stage: 'pipeline',
        severity: SEVERITY.CRITICAL,
        type: 'pipeline_error',
        message: `Pipeline error: ${error.message}`,
        remediation: 'Check pipeline configuration and validator availability'
      });
      results.validationTime = Date.now() - startTime;
      return results;
    }
  }

  /**
   * Determine which stages should run based on context
   */
  determineStages(context) {
    const stages = [];

    // Schema validation
    if (this.config.stages.schema.enabled && context.schemaName) {
      stages.push({
        name: STAGE.SCHEMA,
        validator: this.validators.schema,
        method: 'validate',
        args: [context.data, context.schemaName],
        config: this.config.stages.schema
      });
    }

    // Parse validation
    if (this.config.stages.parse.enabled && context.format) {
      stages.push({
        name: STAGE.PARSE,
        validator: this.validators.parse,
        method: 'parse',
        args: [context.data, context.format, { autoFix: this.config.stages.parse.autoFix }],
        config: this.config.stages.parse
      });
    }

    // Data quality validation
    if (this.config.stages.dataQuality.enabled && this.validators.dataQuality && context.type === 'data') {
      stages.push({
        name: STAGE.DATA_QUALITY,
        validator: this.validators.dataQuality,
        method: 'validate',
        args: [context.data, context.expectedSchema || {}, { verbose: this.verbose }],
        config: this.config.stages.dataQuality
      });
    }

    // Tool contract validation
    if (this.config.stages.toolContract.enabled && context.toolName) {
      stages.push({
        name: STAGE.TOOL_CONTRACT,
        validator: this.validators.toolContract,
        method: 'validate',
        args: [context.toolName, context.toolParams || {}],
        config: this.config.stages.toolContract
      });
    }

    // Permission validation
    if (this.config.stages.permissions.enabled &&
        context.orgAlias &&
        EnhancedPermissionValidator &&
        context.operation) {

      // Initialize permission validator with org context
      if (!this.validators.permissions || this.validators.permissions.orgAlias !== context.orgAlias) {
        this.validators.permissions = new EnhancedPermissionValidator(context.orgAlias, { verbose: this.verbose });
      }

      stages.push({
        name: STAGE.PERMISSIONS,
        validator: this.validators.permissions,
        method: context.operation === 'bulk' ? 'validateBulkOperation' : 'validateFieldLevelSecurity',
        args: context.operation === 'bulk'
          ? [context.objectType, context.operationType, context.recordIds || [], { targetOrg: context.orgAlias }]
          : [context.objectType, context.fields || [], context.accessType || 'editable'],
        config: this.config.stages.permissions
      });
    }

    return stages;
  }

  /**
   * Execute stages sequentially with short-circuiting
   */
  async executeSequential(stages, context, results) {
    for (const stage of stages) {
      const stageStartTime = Date.now();

      try {
        // Execute stage with timeout
        const stageResult = await this.executeStageWithTimeout(stage);

        // Store stage result
        results.stages[stage.name] = stageResult;

        // Update stage statistics
        const stageTime = Date.now() - stageStartTime;
        this.updateStageStats(stage.name, stageResult, stageTime);

        // Collect errors and warnings
        if (stageResult.errors) {
          stageResult.errors.forEach(error => {
            results.errors.push({ ...error, stage: stage.name });
            this.stats.bySeverity[error.severity]++;
          });
        }

        if (stageResult.warnings) {
          stageResult.warnings.forEach(warning => {
            results.warnings.push({ ...warning, stage: stage.name });
          });
        }

        // Short-circuit on CRITICAL errors if blocking enabled
        if (stage.config.blocking && !stageResult.valid) {
          const hasCritical = stageResult.errors?.some(e => e.severity === SEVERITY.CRITICAL);
          if (hasCritical) {
            if (this.verbose) {
              console.log(`[Pipeline] Short-circuiting after ${stage.name} stage due to CRITICAL errors`);
            }
            break;
          }
        }

      } catch (error) {
        results.stages[stage.name] = {
          valid: false,
          errors: [{
            severity: SEVERITY.CRITICAL,
            type: 'stage_error',
            message: `Stage execution error: ${error.message}`
          }]
        };
        this.stats.byStage[stage.name].failed++;

        // Short-circuit on stage errors
        if (stage.config.blocking) {
          break;
        }
      }
    }
  }

  /**
   * Execute stages in parallel
   */
  async executeParallel(stages, context, results) {
    // Group stages that can run in parallel
    // Schema, parse, and tool contract are independent
    // Data quality and permissions may depend on earlier stages

    const independentStages = stages.filter(s =>
      [STAGE.SCHEMA, STAGE.PARSE, STAGE.TOOL_CONTRACT].includes(s.name)
    );

    const dependentStages = stages.filter(s =>
      [STAGE.DATA_QUALITY, STAGE.PERMISSIONS].includes(s.name)
    );

    // Execute independent stages in parallel
    if (independentStages.length > 0) {
      const promises = independentStages.map(stage => this.executeStageWithStats(stage));
      const stageResults = await Promise.all(promises);

      stageResults.forEach((stageResult, index) => {
        const stage = independentStages[index];
        results.stages[stage.name] = stageResult.result;

        // Collect errors/warnings
        if (stageResult.result.errors) {
          stageResult.result.errors.forEach(error => {
            results.errors.push({ ...error, stage: stage.name });
            this.stats.bySeverity[error.severity]++;
          });
        }
        if (stageResult.result.warnings) {
          stageResult.result.warnings.forEach(warning => {
            results.warnings.push({ ...warning, stage: stage.name });
          });
        }
      });

      // Check if any independent stage had CRITICAL errors
      const hasCriticalErrors = stageResults.some(sr =>
        sr.result.errors?.some(e => e.severity === SEVERITY.CRITICAL)
      );

      if (hasCriticalErrors && dependentStages.length > 0) {
        // Skip dependent stages if CRITICAL errors found
        if (this.verbose) {
          console.log('[Pipeline] Skipping dependent stages due to CRITICAL errors');
        }
        return;
      }
    }

    // Execute dependent stages sequentially
    if (dependentStages.length > 0) {
      await this.executeSequential(dependentStages, context, results);
    }
  }

  /**
   * Execute a single stage with timeout
   */
  async executeStageWithTimeout(stage) {
    const timeout = this.config.performance.stageTimeoutMs;

    return Promise.race([
      stage.validator[stage.method](...stage.args),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Stage timeout after ${timeout}ms`)), timeout)
      )
    ]).catch(error => {
      if (error.message.includes('timeout')) {
        this.stats.timeouts++;
      }
      throw error;
    });
  }

  /**
   * Execute stage with automatic stats tracking
   */
  async executeStageWithStats(stage) {
    const startTime = Date.now();
    try {
      const result = await this.executeStageWithTimeout(stage);
      const time = Date.now() - startTime;
      this.updateStageStats(stage.name, result, time);
      return { result, time };
    } catch (error) {
      this.stats.byStage[stage.name].failed++;
      throw error;
    }
  }

  /**
   * Update stage statistics
   */
  updateStageStats(stageName, result, time) {
    const stageStats = this.stats.byStage[stageName];
    stageStats.validations++;

    if (result.valid) {
      stageStats.passed++;
    } else {
      stageStats.failed++;
    }

    // Update average time
    const n = stageStats.validations;
    stageStats.avgTime = ((stageStats.avgTime * (n - 1)) + time) / n;
  }

  /**
   * Aggregate results across all stages
   */
  aggregateResults(results) {
    // Group errors by type
    const errorsByType = {};
    results.errors.forEach(error => {
      if (!errorsByType[error.type]) {
        errorsByType[error.type] = [];
      }
      errorsByType[error.type].push(error);
    });

    // Create summary
    results.summary = {
      totalStages: Object.keys(results.stages).length,
      stagesExecuted: Object.keys(results.stages).length,
      stagesPassed: Object.values(results.stages).filter(s => s.valid).length,
      stagesFailed: Object.values(results.stages).filter(s => !s.valid).length,
      totalErrors: results.errors.length,
      totalWarnings: results.warnings.length,
      criticalErrors: results.errors.filter(e => e.severity === SEVERITY.CRITICAL).length,
      errorsByType,
      worstSeverity: this.getWorstSeverity(results.errors)
    };

    // Add remediation if enabled
    if (this.config.reporting.includeRemediation && results.errors.length > 0) {
      results.summary.remediation = this.generateRemediation(results.errors);
    }
  }

  /**
   * Determine if validation should block execution
   */
  shouldBlock(results) {
    // Always block on CRITICAL errors if any stage has blocking enabled
    const hasCritical = results.errors.some(e => e.severity === SEVERITY.CRITICAL);
    if (hasCritical) {
      return true;
    }

    // Check data quality threshold
    const dataQualityResult = results.stages[STAGE.DATA_QUALITY];
    if (dataQualityResult && this.config.stages.dataQuality.blocking !== 'never') {
      if (dataQualityResult.qualityScore < this.config.stages.dataQuality.blockThreshold) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get worst severity from errors
   */
  getWorstSeverity(errors) {
    if (errors.some(e => e.severity === SEVERITY.CRITICAL)) return SEVERITY.CRITICAL;
    if (errors.some(e => e.severity === SEVERITY.HIGH)) return SEVERITY.HIGH;
    if (errors.some(e => e.severity === SEVERITY.WARNING)) return SEVERITY.WARNING;
    return SEVERITY.INFO;
  }

  /**
   * Generate remediation suggestions
   */
  generateRemediation(errors) {
    const remediation = [];
    const seen = new Set();

    errors.forEach(error => {
      if (error.remediation && !seen.has(error.remediation)) {
        remediation.push({
          severity: error.severity,
          suggestion: error.remediation,
          affectedStage: error.stage
        });
        seen.add(error.remediation);
      }
    });

    return remediation;
  }

  /**
   * Update average validation time
   */
  updateAvgValidationTime(time) {
    const n = this.stats.totalValidations;
    this.stats.avgValidationTime = ((this.stats.avgValidationTime * (n - 1)) + time) / n;
  }

  /**
   * Get pipeline statistics
   */
  getStats() {
    return {
      ...this.stats,
      passRate: this.stats.totalValidations > 0
        ? (this.stats.passed / this.stats.totalValidations * 100).toFixed(2) + '%'
        : '0%',
      blockRate: this.stats.totalValidations > 0
        ? (this.stats.blocked / this.stats.totalValidations * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats.totalValidations = 0;
    this.stats.passed = 0;
    this.stats.failed = 0;
    this.stats.blocked = 0;
    this.stats.avgValidationTime = 0;
    this.stats.timeouts = 0;

    Object.values(STAGE).forEach(stage => {
      this.stats.byStage[stage] = {
        validations: 0,
        passed: 0,
        failed: 0,
        blocked: 0,
        avgTime: 0
      };
    });

    Object.keys(SEVERITY).forEach(severity => {
      this.stats.bySeverity[severity] = 0;
    });
  }
}

module.exports = UnifiedValidationPipeline;

// CLI Interface
if (require.main === module) {
  const pipeline = new UnifiedValidationPipeline({ verbose: true });
  const command = process.argv[2];

  if (command === 'validate') {
    // validate --context <file> OR --type <type> --data <data>
    const contextFileIndex = process.argv.indexOf('--context');

    if (contextFileIndex > -1 && process.argv[contextFileIndex + 1]) {
      const contextFile = process.argv[contextFileIndex + 1];
      const context = JSON.parse(fs.readFileSync(contextFile, 'utf8'));

      pipeline.validate(context)
        .then(result => {
          console.log('\n📊 Validation Result:');
          console.log(JSON.stringify(result, null, 2));
          process.exit(result.blocked ? 1 : 0);
        })
        .catch(error => {
          console.error('ERROR:', error.message);
          process.exit(1);
        });
    } else {
      console.error('ERROR: --context <file> required');
      process.exit(1);
    }

  } else if (command === 'stats') {
    console.log('\n📈 Pipeline Statistics:');
    console.log(JSON.stringify(pipeline.getStats(), null, 2));

  } else {
    console.log('Commands: validate, stats');
    console.log('');
    console.log('Examples:');
    console.log('  node unified-validation-pipeline.js validate --context ./validation-context.json');
    console.log('  node unified-validation-pipeline.js stats');
    console.log('');
    console.log('Context file format:');
    console.log(JSON.stringify({
      type: 'reflection',
      data: { /* data to validate */ },
      schemaName: 'reflection',
      format: 'json',
      toolName: 'sf_data_query',
      toolParams: { query: 'SELECT Id FROM Account' },
      orgAlias: 'my-org',
      operation: 'bulk',
      objectType: 'Account',
      operationType: 'delete',
      recordIds: []
    }, null, 2));
  }
}
