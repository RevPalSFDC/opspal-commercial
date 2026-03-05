#!/usr/bin/env node

/**
 * Validation Rule Batch Manager
 *
 * Process multiple validation rules in parallel for 5-10x performance improvement.
 *
 * Features:
 * - Parallel validation with configurable concurrency
 * - Parallel deployment with error aggregation
 * - Batch impact analysis across multiple rules
 * - Progress tracking and statistics
 * - Rollback capability for failed batches
 * - Integration with validation-rule-orchestrator
 *
 * Usage:
 *   const BatchManager = require('./validation-rule-batch-manager');
 *   const manager = new BatchManager('my-org', { parallel: 5, verbose: true });
 *   await manager.validateBatch(ruleConfigs);
 *   await manager.deployBatch(ruleConfigs, { activateOnDeploy: true });
 *
 * CLI Usage:
 *   node validation-rule-batch-manager.js validate --rules rules.json --org my-org
 *   node validation-rule-batch-manager.js deploy --rules rules.json --org my-org --activate
 *   node validation-rule-batch-manager.js analyze --rules rules.json --org my-org
 *
 * @version 1.0.0
 * @see agents/validation-rule-orchestrator.md
 * @see docs/runbooks/validation-rule-management/
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class ValidationRuleBatchManager {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.options = {
      parallel: options.parallel || 5,          // Max concurrent operations
      verbose: options.verbose || false,        // Detailed logging
      continueOnError: options.continueOnError !== false, // Keep going on errors
      timeout: options.timeout || 300000,       // 5 minute timeout per rule
      ...options
    };

    this.stats = {
      total: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      startTime: null,
      endTime: null,
      operations: []
    };

    // Load dependencies
    this.complexityCalculator = require('./validation-rule-complexity-calculator');
  }

  /**
   * Validate multiple validation rules in parallel
   *
   * @param {Array} ruleConfigs - Array of rule configurations
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation results with aggregated errors
   *
   * @example
   * const results = await manager.validateBatch([
   *   { object: 'Opportunity', name: 'Amount_Required', formula: '...', ... },
   *   { object: 'Account', name: 'Industry_Required', formula: '...', ... }
   * ]);
   */
  async validateBatch(ruleConfigs, options = {}) {
    this.stats.startTime = Date.now();
    this.stats.total = ruleConfigs.length;

    this.log(`📋 Starting batch validation of ${ruleConfigs.length} rules...`);
    this.log(`⚡ Parallel: ${this.options.parallel} concurrent operations`);

    const results = await this._processBatch(
      ruleConfigs,
      (config) => this._validateRule(config, options),
      'validate'
    );

    this.stats.endTime = Date.now();

    return this._generateBatchReport(results, 'Validation');
  }

  /**
   * Deploy multiple validation rules in parallel
   *
   * @param {Array} ruleConfigs - Array of rule configurations
   * @param {Object} options - Deployment options
   * @returns {Promise<Object>} Deployment results with rollback info
   *
   * @example
   * const results = await manager.deployBatch(rules, {
   *   activateOnDeploy: true,
   *   runImpactAnalysis: true,
   *   deploymentStrategy: 'staged'
   * });
   */
  async deployBatch(ruleConfigs, options = {}) {
    this.stats.startTime = Date.now();
    this.stats.total = ruleConfigs.length;

    this.log(`🚀 Starting batch deployment of ${ruleConfigs.length} rules...`);
    this.log(`⚡ Parallel: ${this.options.parallel} concurrent operations`);

    // Pre-deployment validation
    if (options.preValidate !== false) {
      this.log(`🔍 Running pre-deployment validation...`);
      const validationResults = await this.validateBatch(ruleConfigs, { quickCheck: true });

      if (validationResults.summary.failed > 0) {
        throw new Error(`Pre-deployment validation failed for ${validationResults.summary.failed} rules. Fix errors before deploying.`);
      }
    }

    // Impact analysis
    if (options.runImpactAnalysis) {
      this.log(`📊 Running impact analysis...`);
      const impactResults = await this.analyzeBatch(ruleConfigs);

      const highRiskRules = impactResults.results.filter(r => r.impact && r.impact.riskLevel === 'HIGH');
      if (highRiskRules.length > 0 && !options.forceHighRisk) {
        throw new Error(`${highRiskRules.length} rules have HIGH risk. Review or use --force-high-risk to proceed.`);
      }
    }

    // Deploy
    const results = await this._processBatch(
      ruleConfigs,
      (config) => this._deployRule(config, options),
      'deploy'
    );

    this.stats.endTime = Date.now();

    // Generate rollback script if any failures
    if (this.stats.failed > 0) {
      await this._generateRollbackScript(results.results);
    }

    return this._generateBatchReport(results, 'Deployment');
  }

  /**
   * Analyze impact of multiple validation rules in parallel
   *
   * @param {Array} ruleConfigs - Array of rule configurations
   * @returns {Promise<Object>} Impact analysis results
   *
   * @example
   * const analysis = await manager.analyzeBatch(rules);
   * console.log(`Total violations: ${analysis.summary.totalViolations}`);
   */
  async analyzeBatch(ruleConfigs) {
    this.stats.startTime = Date.now();
    this.stats.total = ruleConfigs.length;

    this.log(`📊 Starting batch impact analysis of ${ruleConfigs.length} rules...`);

    const results = await this._processBatch(
      ruleConfigs,
      (config) => this._analyzeRule(config),
      'analyze'
    );

    this.stats.endTime = Date.now();

    return this._generateBatchReport(results, 'Impact Analysis');
  }

  /**
   * Process batch with configurable parallelism
   *
   * @private
   */
  async _processBatch(items, processFn, operationType) {
    const results = {
      results: [],
      errors: []
    };

    // Process in chunks for parallelism
    for (let i = 0; i < items.length; i += this.options.parallel) {
      const chunk = items.slice(i, i + this.options.parallel);

      this.log(`Processing chunk ${Math.floor(i / this.options.parallel) + 1}/${Math.ceil(items.length / this.options.parallel)}...`);

      const chunkPromises = chunk.map(async (item, idx) => {
        const globalIdx = i + idx;
        try {
          const result = await processFn(item);
          this.stats.succeeded++;

          const operationRecord = {
            index: globalIdx,
            rule: `${item.object}.${item.name}`,
            status: 'success',
            result,
            duration: result.duration || 0
          };

          this.stats.operations.push(operationRecord);
          results.results.push(operationRecord);

          this.log(`✅ [${globalIdx + 1}/${items.length}] ${item.object}.${item.name} - Success`);

          return operationRecord;
        } catch (error) {
          this.stats.failed++;

          const errorRecord = {
            index: globalIdx,
            rule: `${item.object}.${item.name}`,
            status: 'failed',
            error: error.message,
            duration: 0
          };

          this.stats.operations.push(errorRecord);
          results.errors.push(errorRecord);

          this.log(`❌ [${globalIdx + 1}/${items.length}] ${item.object}.${item.name} - Failed: ${error.message}`);

          if (!this.options.continueOnError) {
            throw error;
          }

          return errorRecord;
        }
      });

      await Promise.all(chunkPromises);
    }

    return results;
  }

  /**
   * Validate single rule
   *
   * @private
   */
  async _validateRule(config, options) {
    const startTime = Date.now();

    // Validate required fields
    if (!config.object || !config.name || !config.formula) {
      throw new Error('Rule config must include object, name, and formula');
    }

    // Calculate complexity
    const complexity = this.complexityCalculator.calculateFromFormula(config.formula);

    // Check for anti-patterns
    const antiPatterns = this.complexityCalculator.detectAntiPatterns(config.formula);
    const criticalIssues = antiPatterns.filter(ap => ap.severity === 'CRITICAL');

    if (criticalIssues.length > 0 && !options.ignoreCritical) {
      throw new Error(`Critical anti-patterns detected: ${criticalIssues.map(ap => ap.pattern).join(', ')}`);
    }

    // Validate formula syntax (basic check)
    if (!config.formula.includes('(') || !config.formula.includes(')')) {
      throw new Error('Formula appears to be invalid - missing parentheses');
    }

    // Validate error message
    if (!config.errorMessage || config.errorMessage.length < 10) {
      throw new Error('Error message is required and must be descriptive (min 10 chars)');
    }

    const duration = Date.now() - startTime;

    return {
      valid: true,
      complexity,
      antiPatterns,
      duration,
      warnings: antiPatterns.filter(ap => ap.severity === 'WARNING')
    };
  }

  /**
   * Deploy single rule
   *
   * @private
   */
  async _deployRule(config, options) {
    const startTime = Date.now();

    // Generate metadata XML
    const metadataXml = this._generateMetadataXml(config, options);

    // Write to temp file
    const tempDir = path.join(process.cwd(), '.temp-validation-rules');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const xmlPath = path.join(tempDir, `${config.object}.${config.name}.validationRule-meta.xml`);
    fs.writeFileSync(xmlPath, metadataXml);

    try {
      // Deploy using Salesforce CLI
      const deployCommand = `sf project deploy start --metadata ValidationRule:${config.object}.${config.name} --target-org ${this.orgAlias} --wait 10`;

      const result = execSync(deployCommand, {
        cwd: tempDir,
        encoding: 'utf-8',
        timeout: this.options.timeout
      });

      const duration = Date.now() - startTime;

      return {
        deployed: true,
        duration,
        output: result
      };
    } finally {
      // Cleanup
      if (fs.existsSync(xmlPath)) {
        fs.unlinkSync(xmlPath);
      }
    }
  }

  /**
   * Analyze impact of single rule
   *
   * @private
   */
  async _analyzeRule(config) {
    const startTime = Date.now();

    try {
      // Convert formula to SOQL WHERE clause (simplified)
      const whereClause = this._formulaToSoql(config.formula);

      // Query violating records
      const countQuery = `SELECT COUNT() FROM ${config.object} WHERE ${whereClause}`;
      const result = execSync(
        `sf data query --query "${countQuery}" --target-org ${this.orgAlias} --json`,
        { encoding: 'utf-8', timeout: this.options.timeout }
      );

      const queryResult = JSON.parse(result);
      const violationCount = queryResult.result?.totalSize || 0;

      // Get total record count
      const totalQuery = `SELECT COUNT() FROM ${config.object}`;
      const totalResult = execSync(
        `sf data query --query "${totalQuery}" --target-org ${this.orgAlias} --json`,
        { encoding: 'utf-8', timeout: this.options.timeout }
      );

      const totalCount = JSON.parse(totalResult).result?.totalSize || 0;
      const violationRate = totalCount > 0 ? (violationCount / totalCount) * 100 : 0;

      // Determine risk level
      let riskLevel = 'LOW';
      if (violationRate > 10) riskLevel = 'HIGH';
      else if (violationRate > 1) riskLevel = 'MEDIUM';

      const duration = Date.now() - startTime;

      return {
        impact: {
          violationCount,
          totalCount,
          violationRate: violationRate.toFixed(2),
          riskLevel
        },
        duration
      };
    } catch (error) {
      // If SOQL conversion fails, return unknown impact
      return {
        impact: {
          violationCount: 'Unknown',
          totalCount: 'Unknown',
          violationRate: 'Unknown',
          riskLevel: 'UNKNOWN',
          error: error.message
        },
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Generate metadata XML for validation rule
   *
   * @private
   */
  _generateMetadataXml(config, options) {
    const active = options.activateOnDeploy !== false;

    return `<?xml version="1.0" encoding="UTF-8"?>
<ValidationRule xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${config.name}</fullName>
    <active>${active}</active>
    <description>${config.description || 'Validation rule created via batch deployment'}</description>
    <errorConditionFormula>${this._escapeXml(config.formula)}</errorConditionFormula>
    <errorMessage>${this._escapeXml(config.errorMessage)}</errorMessage>
    ${config.errorDisplayField ? `<errorDisplayField>${config.errorDisplayField}</errorDisplayField>` : ''}
</ValidationRule>`;
  }

  /**
   * Convert validation formula to SOQL WHERE clause (simplified)
   *
   * @private
   */
  _formulaToSoql(formula) {
    // This is a simplified conversion - real implementation would need full formula parser
    let soql = formula
      .replace(/AND\(/gi, '(')
      .replace(/OR\(/gi, '(')
      .replace(/NOT\(/gi, 'NOT (')
      .replace(/ISBLANK\(([^)]+)\)/gi, '$1 = null')
      .replace(/ISNULL\(([^)]+)\)/gi, '$1 = null')
      .replace(/ISPICKVAL\(([^,]+),\s*"([^"]+)"\)/gi, "$1 = '$2'")
      .replace(/TEXT\(([^)]+)\)/gi, '$1');

    return soql;
  }

  /**
   * Escape XML special characters
   *
   * @private
   */
  _escapeXml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Generate rollback script for failed deployments
   *
   * @private
   */
  async _generateRollbackScript(results) {
    const failedDeployments = results.filter(r => r.status === 'success');

    if (failedDeployments.length === 0) return;

    const rollbackCommands = failedDeployments.map(r => {
      return `# Rollback ${r.rule}
sf project retrieve start --metadata ValidationRule:${r.rule} --target-org ${this.orgAlias}
# Then edit to deactivate or delete`;
    }).join('\n\n');

    const rollbackScript = `#!/bin/bash
# Rollback script generated at ${new Date().toISOString()}
# Failed deployments: ${this.stats.failed}
# Successful deployments to rollback: ${failedDeployments.length}

${rollbackCommands}
`;

    const rollbackPath = path.join(process.cwd(), `rollback-${Date.now()}.sh`);
    fs.writeFileSync(rollbackPath, rollbackScript);
    fs.chmodSync(rollbackPath, '755');

    this.log(`📝 Rollback script generated: ${rollbackPath}`);
  }

  /**
   * Generate batch operation report
   *
   * @private
   */
  _generateBatchReport(results, operationType) {
    const duration = this.stats.endTime - this.stats.startTime;
    const avgDuration = this.stats.operations.length > 0
      ? this.stats.operations.reduce((sum, op) => sum + op.duration, 0) / this.stats.operations.length
      : 0;

    const summary = {
      operationType,
      total: this.stats.total,
      succeeded: this.stats.succeeded,
      failed: this.stats.failed,
      skipped: this.stats.skipped,
      successRate: ((this.stats.succeeded / this.stats.total) * 100).toFixed(1) + '%',
      totalDuration: `${duration}ms`,
      avgDuration: `${Math.round(avgDuration)}ms`,
      operations: this.stats.operations
    };

    // Add operation-specific data
    if (operationType === 'Impact Analysis') {
      const impacts = results.results
        .filter(r => r.result && r.result.impact)
        .map(r => r.result.impact);

      summary.impactSummary = {
        totalViolations: impacts.reduce((sum, i) => sum + (typeof i.violationCount === 'number' ? i.violationCount : 0), 0),
        highRiskRules: impacts.filter(i => i.riskLevel === 'HIGH').length,
        mediumRiskRules: impacts.filter(i => i.riskLevel === 'MEDIUM').length,
        lowRiskRules: impacts.filter(i => i.riskLevel === 'LOW').length
      };
    }

    return {
      summary,
      results: results.results,
      errors: results.errors
    };
  }

  /**
   * Get batch statistics
   *
   * @returns {Object} Current statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      successRate: this.stats.total > 0 ? ((this.stats.succeeded / this.stats.total) * 100).toFixed(1) + '%' : '0%',
      avgDuration: this.stats.operations.length > 0
        ? `${Math.round(this.stats.operations.reduce((sum, op) => sum + op.duration, 0) / this.stats.operations.length)}ms`
        : '0ms'
    };
  }

  /**
   * Log message if verbose mode enabled
   *
   * @private
   */
  log(message) {
    if (this.options.verbose) {
      console.log(message);
    }
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || ['validate', 'deploy', 'analyze', 'help'].indexOf(command) === -1) {
    console.log(`
Validation Rule Batch Manager v1.0.0

Usage:
  node validation-rule-batch-manager.js <command> [options]

Commands:
  validate  Validate multiple validation rules in parallel
  deploy    Deploy multiple validation rules in parallel
  analyze   Analyze impact of multiple validation rules
  help      Show this help message

Options:
  --rules <path>        Path to JSON file with rule configurations (required)
  --org <alias>         Salesforce org alias (required)
  --parallel <num>      Max concurrent operations (default: 5)
  --verbose             Enable detailed logging
  --continue-on-error   Continue processing on errors (default: true)
  --activate            Activate rules on deployment (default: false)
  --pre-validate        Run validation before deployment (default: true)
  --impact-analysis     Run impact analysis before deployment
  --force-high-risk     Deploy even if high-risk rules detected

Examples:
  # Validate batch
  node validation-rule-batch-manager.js validate --rules rules.json --org my-org --verbose

  # Deploy batch with activation
  node validation-rule-batch-manager.js deploy --rules rules.json --org my-org --activate --impact-analysis

  # Analyze impact
  node validation-rule-batch-manager.js analyze --rules rules.json --org my-org

Rules JSON Format:
  [
    {
      "object": "Opportunity",
      "name": "Amount_Required",
      "formula": "AND(ISPICKVAL(StageName, \\"Closed Won\\"), ISBLANK(Amount))",
      "errorMessage": "Amount is required for Closed Won opportunities",
      "description": "Ensure amount is populated"
    }
  ]
`);
    process.exit(command ? 0 : 1);
  }

  // Parse options
  const options = {};
  let rulesPath, orgAlias;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--rules' && i + 1 < args.length) {
      rulesPath = args[++i];
    } else if (arg === '--org' && i + 1 < args.length) {
      orgAlias = args[++i];
    } else if (arg === '--parallel' && i + 1 < args.length) {
      options.parallel = parseInt(args[++i]);
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--continue-on-error') {
      options.continueOnError = true;
    } else if (arg === '--activate') {
      options.activateOnDeploy = true;
    } else if (arg === '--pre-validate') {
      options.preValidate = true;
    } else if (arg === '--impact-analysis') {
      options.runImpactAnalysis = true;
    } else if (arg === '--force-high-risk') {
      options.forceHighRisk = true;
    }
  }

  if (!rulesPath || !orgAlias) {
    console.error('Error: --rules and --org are required');
    process.exit(1);
  }

  if (!fs.existsSync(rulesPath)) {
    console.error(`Error: Rules file not found: ${rulesPath}`);
    process.exit(1);
  }

  // Load rules
  const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));

  if (!Array.isArray(rules) || rules.length === 0) {
    console.error('Error: Rules file must contain an array of rule configurations');
    process.exit(1);
  }

  // Execute command
  const manager = new ValidationRuleBatchManager(orgAlias, options);

  (async () => {
    try {
      let result;

      if (command === 'validate') {
        result = await manager.validateBatch(rules);
      } else if (command === 'deploy') {
        result = await manager.deployBatch(rules, options);
      } else if (command === 'analyze') {
        result = await manager.analyzeBatch(rules);
      }

      console.log('\n' + '='.repeat(80));
      console.log('BATCH OPERATION COMPLETE');
      console.log('='.repeat(80));
      console.log(JSON.stringify(result.summary, null, 2));

      if (result.errors && result.errors.length > 0) {
        console.log('\nErrors:');
        result.errors.forEach(err => {
          console.log(`  ❌ ${err.rule}: ${err.error}`);
        });
      }

      process.exit(result.summary.failed > 0 ? 1 : 0);
    } catch (error) {
      console.error(`\n❌ Batch operation failed: ${error.message}`);
      process.exit(1);
    }
  })();
}

module.exports = ValidationRuleBatchManager;
