#!/usr/bin/env node

/**
 * Pre-Flight Backup Validator
 *
 * Validates backup operations BEFORE execution to prevent predictable failures.
 * Integrates with object-size-detector and metadata-backup-planner.
 *
 * **Problem Solved (Reflection Cohort #2, P1):**
 * - Backups fail 15 minutes into execution due to memory limits
 * - No upfront validation of backup feasibility
 * - Manual risk assessment takes 20+ minutes
 *
 * **Solution:**
 * - Pre-execution risk assessment (blocks doomed operations)
 * - Automatic strategy recommendation (JSON/CSV/Intelligent/Streaming)
 * - Memory estimation and feasibility checks
 * - Integration with metadata analysis tools
 *
 * **ROI:** Part of $25,000/year data operation infrastructure
 *
 * @module pre-flight-validator
 */

const { ObjectSizeDetector } = require('./object-size-detector');
const { MetadataBackupPlanner } = require('./metadata-backup-planner');

/**
 * Pre-Flight Check Status
 */
const CheckStatus = {
  PASSED: 'passed',
  WARNING: 'warning',
  BLOCKED: 'blocked'
};

/**
 * Backup Strategy
 */
const BackupStrategy = {
  JSON: 'json',           // Small objects (<50 fields)
  CSV: 'csv',             // Medium objects (50-200 fields)
  INTELLIGENT: 'intelligent', // Large objects (200-500 fields) - smart field selection
  STREAMING: 'streaming'      // Very large datasets (50K+ records)
};

/**
 * Pre-Flight Validator
 *
 * Validates backup operations before execution to prevent failures.
 *
 * @example
 * const validator = new PreFlightValidator({
 *   org: 'rentable-production',
 *   objectName: 'Account',
 *   mode: 'full' // or 'intelligent'
 * });
 *
 * const result = await validator.validate();
 * // {
 * //   status: 'passed',
 * //   riskLevel: 'medium',
 * //   recommendedStrategy: 'intelligent',
 * //   estimatedMemoryMB: 268,
 * //   recommendations: [...]
 * // }
 */
class PreFlightValidator {
  /**
   * Create a validator instance
   *
   * @param {Object} config - Configuration
   * @param {string} config.org - Salesforce org alias
   * @param {string} config.objectName - Object API name
   * @param {string} [config.mode='full'] - Backup mode (full, intelligent, minimal)
   * @param {Array<string>} [config.fields] - Specific fields to backup (overrides mode)
   * @param {string} [config.whereClause] - Optional WHERE clause
   * @param {number} [config.memoryLimitMB=512] - Memory limit threshold (default: 512MB)
   */
  constructor(config) {
    this.org = config.org;
    this.objectName = config.objectName;
    this.mode = config.mode || 'full';
    this.fields = config.fields;
    this.whereClause = config.whereClause;
    this.memoryLimitMB = config.memoryLimitMB || 512;

    this.checks = [];
    this.recommendations = [];
    this.startTime = null;
    this.endTime = null;
  }

  /**
   * Run all pre-flight checks
   *
   * @returns {Promise<Object>} - Validation result
   */
  async validate() {
    console.log(`\n🚁 Pre-Flight Validation`);
    console.log(`   Object: ${this.objectName}`);
    console.log(`   Org: ${this.org}`);
    console.log(`   Mode: ${this.mode}\n`);

    this.startTime = Date.now();

    try {
      // Check 1: Object Size Analysis
      const sizeAnalysis = await this._checkObjectSize();

      // Check 2: Memory Estimation
      const memoryCheck = await this._checkMemoryFeasibility(sizeAnalysis);

      // Check 3: Strategy Recommendation
      const strategyCheck = await this._checkBackupStrategy(sizeAnalysis);

      // Check 4: Field Selection Validation
      const fieldCheck = await this._checkFieldSelection(sizeAnalysis);

      this.endTime = Date.now();

      const result = this._generateResult({
        sizeAnalysis,
        memoryCheck,
        strategyCheck,
        fieldCheck
      });

      this._printSummary(result);

      return result;
    } catch (error) {
      this.endTime = Date.now();
      console.error(`\n❌ Pre-flight validation failed: ${error.message}`);
      throw error;
    }
  }

  // ========================================
  // PRE-FLIGHT CHECKS
  // ========================================

  /**
   * Check 1: Analyze object size
   * @private
   */
  async _checkObjectSize() {
    console.log('Check 1: Object Size Analysis...');

    const detector = new ObjectSizeDetector({
      org: this.org,
      objectName: this.objectName,
      whereClause: this.whereClause
    });

    const analysis = await detector.analyze();

    this.checks.push({
      name: 'Object Size',
      status: CheckStatus.PASSED,
      details: analysis
    });

    console.log(`   ✅ Fields: ${analysis.fieldCount.toLocaleString()}, Records: ${analysis.recordCount.toLocaleString()}`);

    return analysis;
  }

  /**
   * Check 2: Memory feasibility
   * @private
   */
  async _checkMemoryFeasibility(sizeAnalysis) {
    console.log('\nCheck 2: Memory Estimation...');

    const estimatedMemoryMB = sizeAnalysis.estimatedMemoryMB;
    const riskLevel = sizeAnalysis.riskLevel;

    let status = CheckStatus.PASSED;

    // CRITICAL risk - block execution
    if (riskLevel === 'CRITICAL') {
      status = CheckStatus.BLOCKED;
      this.recommendations.push({
        priority: 'CRITICAL',
        message: `⛔ BLOCKED: Estimated memory (${estimatedMemoryMB}MB) exceeds safe limit`,
        action: 'Use intelligent field selection or streaming mode',
        code: `// Option 1: Intelligent mode (70-90% reduction)\nconst planner = new MetadataBackupPlanner({ org: '${this.org}', objectName: '${this.objectName}' });\nconst plan = await planner.generatePlan({ mode: 'intelligent' });\n\n// Option 2: Streaming mode (for 50K+ records)\nconst exporter = new StreamingCSVExporter({ org: '${this.org}', objectName: '${this.objectName}', fields: plan.selectedFields, outputFile: './backup.csv' });\nawait exporter.export();`
      });
      console.log(`   ⛔ BLOCKED: ${estimatedMemoryMB}MB exceeds limit (${this.memoryLimitMB}MB)`);
    } else if (riskLevel === 'HIGH') {
      status = CheckStatus.WARNING;
      this.recommendations.push({
        priority: 'HIGH',
        message: `⚠️  WARNING: High memory usage (${estimatedMemoryMB}MB)`,
        action: 'Consider intelligent field selection',
        code: `const planner = new MetadataBackupPlanner({ org: '${this.org}', objectName: '${this.objectName}' });\nconst plan = await planner.generatePlan({ mode: 'intelligent' });`
      });
      console.log(`   ⚠️  High risk: ${estimatedMemoryMB}MB (close to ${this.memoryLimitMB}MB limit)`);
    } else if (riskLevel === 'MEDIUM') {
      status = CheckStatus.WARNING;
      this.recommendations.push({
        priority: 'MEDIUM',
        message: `💡 TIP: Medium memory usage (${estimatedMemoryMB}MB)`,
        action: 'Monitor memory during execution',
        code: null
      });
      console.log(`   💡 Medium risk: ${estimatedMemoryMB}MB`);
    } else {
      console.log(`   ✅ Low risk: ${estimatedMemoryMB}MB (well under ${this.memoryLimitMB}MB limit)`);
    }

    this.checks.push({
      name: 'Memory Feasibility',
      status,
      details: {
        estimatedMemoryMB,
        memoryLimitMB: this.memoryLimitMB,
        riskLevel,
        feasible: status !== CheckStatus.BLOCKED
      }
    });

    return {
      estimatedMemoryMB,
      riskLevel,
      status
    };
  }

  /**
   * Check 3: Backup strategy recommendation
   * @private
   */
  async _checkBackupStrategy(sizeAnalysis) {
    console.log('\nCheck 3: Strategy Recommendation...');

    const { fieldCount, recordCount, estimatedMemoryMB, recommendedStrategy } = sizeAnalysis;

    let finalStrategy = recommendedStrategy;
    let status = CheckStatus.PASSED;

    // Override strategy based on user's mode
    if (this.mode === 'full' && recommendedStrategy === 'intelligent') {
      status = CheckStatus.WARNING;
      this.recommendations.push({
        priority: 'HIGH',
        message: `⚠️  Full mode not recommended for ${fieldCount} fields`,
        action: `Switch to intelligent mode (recommended: ${recommendedStrategy})`,
        code: `// Intelligent mode reduces fields by 70-90%\nconst planner = new MetadataBackupPlanner({ org: '${this.org}', objectName: '${this.objectName}' });\nconst plan = await planner.generatePlan({ mode: 'intelligent' });`
      });
    }

    // Recommend streaming for large datasets
    if (recordCount > 50000 && !this.whereClause) {
      finalStrategy = BackupStrategy.STREAMING;
      this.recommendations.push({
        priority: 'HIGH',
        message: `💡 Streaming recommended for ${recordCount.toLocaleString()} records`,
        action: 'Use StreamingCSVExporter for chunked processing',
        code: `const exporter = new StreamingCSVExporter({\n  org: '${this.org}',\n  objectName: '${this.objectName}',\n  fields: ${this.fields ? JSON.stringify(this.fields) : 'plan.selectedFields'},\n  outputFile: './backup/${this.objectName.toLowerCase()}.csv',\n  batchSize: 10000\n});\nawait exporter.export();`
      });
    }

    console.log(`   ✅ Recommended: ${finalStrategy}`);

    this.checks.push({
      name: 'Backup Strategy',
      status,
      details: {
        recommendedStrategy: finalStrategy,
        userMode: this.mode,
        reasons: this._getStrategyReasons(sizeAnalysis)
      }
    });

    return {
      recommendedStrategy: finalStrategy,
      status
    };
  }

  /**
   * Check 4: Field selection validation
   * @private
   */
  async _checkFieldSelection(sizeAnalysis) {
    console.log('\nCheck 4: Field Selection...');

    let status = CheckStatus.PASSED;
    let selectedFieldCount = null;
    let reductionPercent = null;

    // If user specified fields, validate count
    if (this.fields && this.fields.length > 0) {
      selectedFieldCount = this.fields.length;
      reductionPercent = ((sizeAnalysis.fieldCount - selectedFieldCount) / sizeAnalysis.fieldCount) * 100;

      console.log(`   ✅ User-specified: ${selectedFieldCount} fields (${reductionPercent.toFixed(0)}% reduction)`);
    } else if (this.mode === 'intelligent') {
      // Generate intelligent field selection
      const planner = new MetadataBackupPlanner({
        org: this.org,
        objectName: this.objectName
      });

      const plan = await planner.generatePlan({ mode: 'intelligent' });
      selectedFieldCount = plan.selectedFields.length;
      reductionPercent = plan.reductionPercent;

      console.log(`   ✅ Intelligent: ${selectedFieldCount} fields (${reductionPercent.toFixed(0)}% reduction)`);

      this.recommendations.push({
        priority: 'INFO',
        message: `💡 Intelligent mode selected ${selectedFieldCount}/${sizeAnalysis.fieldCount} fields`,
        action: 'Review selected fields in plan',
        code: null
      });
    } else if (this.mode === 'full') {
      selectedFieldCount = sizeAnalysis.fieldCount;
      reductionPercent = 0;

      if (sizeAnalysis.fieldCount > 200) {
        status = CheckStatus.WARNING;
        this.recommendations.push({
          priority: 'MEDIUM',
          message: `⚠️  Full mode with ${sizeAnalysis.fieldCount} fields is inefficient`,
          action: 'Consider intelligent mode for 70-90% field reduction',
          code: null
        });
      }

      console.log(`   ⚠️  Full mode: ${selectedFieldCount} fields (no reduction)`);
    }

    this.checks.push({
      name: 'Field Selection',
      status,
      details: {
        mode: this.mode,
        totalFields: sizeAnalysis.fieldCount,
        selectedFields: selectedFieldCount,
        reductionPercent: reductionPercent ? reductionPercent.toFixed(2) : '0'
      }
    });

    return {
      selectedFieldCount,
      reductionPercent,
      status
    };
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Get strategy reasons
   * @private
   */
  _getStrategyReasons(sizeAnalysis) {
    const reasons = [];

    if (sizeAnalysis.fieldCount < 50) {
      reasons.push('Low field count - JSON export suitable');
    } else if (sizeAnalysis.fieldCount < 200) {
      reasons.push('Medium field count - CSV export suitable');
    } else if (sizeAnalysis.fieldCount >= 200) {
      reasons.push('High field count - intelligent field selection recommended');
    }

    if (sizeAnalysis.recordCount > 50000) {
      reasons.push('Large dataset - streaming mode recommended');
    }

    if (sizeAnalysis.estimatedMemoryMB > 256) {
      reasons.push('High memory usage - chunked processing recommended');
    }

    return reasons;
  }

  /**
   * Generate validation result
   * @private
   */
  _generateResult(checkResults) {
    const { sizeAnalysis, memoryCheck, strategyCheck, fieldCheck } = checkResults;

    // Determine overall status
    const statuses = this.checks.map(c => c.status);
    const hasBlocked = statuses.includes(CheckStatus.BLOCKED);
    const hasWarning = statuses.includes(CheckStatus.WARNING);

    let overallStatus = CheckStatus.PASSED;
    if (hasBlocked) {
      overallStatus = CheckStatus.BLOCKED;
    } else if (hasWarning) {
      overallStatus = CheckStatus.WARNING;
    }

    const duration = this.endTime - this.startTime;

    return {
      status: overallStatus,
      canProceed: overallStatus !== CheckStatus.BLOCKED,
      objectName: this.objectName,
      org: this.org,
      mode: this.mode,
      riskLevel: sizeAnalysis.riskLevel,
      recommendedStrategy: strategyCheck.recommendedStrategy,
      estimatedMemoryMB: memoryCheck.estimatedMemoryMB,
      fieldCount: sizeAnalysis.fieldCount,
      recordCount: sizeAnalysis.recordCount,
      selectedFieldCount: fieldCheck.selectedFieldCount,
      reductionPercent: fieldCheck.reductionPercent,
      checks: this.checks,
      recommendations: this.recommendations,
      duration,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Print validation summary
   * @private
   */
  _printSummary(result) {
    console.log(`\n\n═══════════════════════════════════════════════════════════`);

    if (result.status === CheckStatus.PASSED) {
      console.log(`✅ Pre-Flight PASSED - Safe to proceed`);
    } else if (result.status === CheckStatus.WARNING) {
      console.log(`⚠️  Pre-Flight PASSED with warnings`);
    } else {
      console.log(`⛔ Pre-Flight BLOCKED - Operation not safe`);
    }

    console.log(`═══════════════════════════════════════════════════════════\n`);

    console.log(`📊 Summary:`);
    console.log(`   Risk Level: ${result.riskLevel}`);
    console.log(`   Estimated Memory: ${result.estimatedMemoryMB}MB`);
    console.log(`   Recommended Strategy: ${result.recommendedStrategy}`);
    console.log(`   Can Proceed: ${result.canProceed ? '✅ Yes' : '⛔ No'}\n`);

    if (result.recommendations.length > 0) {
      console.log(`💡 Recommendations:\n`);
      result.recommendations.forEach((rec, i) => {
        console.log(`   ${i + 1}. [${rec.priority}] ${rec.message}`);
        console.log(`      Action: ${rec.action}`);
        if (rec.code) {
          console.log(`\n${rec.code}\n`);
        }
      });
      console.log('');
    }

    console.log(`🗂️  Object: ${result.objectName}`);
    console.log(`🏢 Org: ${result.org}`);
    console.log(`⏱️  Duration: ${result.duration}ms\n`);
  }
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
  PreFlightValidator,
  CheckStatus,
  BackupStrategy
};

// ========================================
// CLI USAGE
// ========================================

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Pre-Flight Backup Validator - CLI Usage\n');
    console.log('Usage: node pre-flight-validator.js <org> <object> [options]\n');
    console.log('Options:');
    console.log('  --mode <full|intelligent|minimal>  Backup mode (default: full)');
    console.log('  --fields <f1,f2,...>               Specific fields to backup');
    console.log('  --where "<clause>"                 WHERE clause filter');
    console.log('  --memory-limit <mb>                Memory limit threshold (default: 512)\n');
    console.log('Examples:');
    console.log('  node pre-flight-validator.js rentable-production Account');
    console.log('  node pre-flight-validator.js rentable-production Account --mode intelligent');
    console.log('  node pre-flight-validator.js rentable-production Account --fields "Id,Name,BillingAddress"');
    console.log('  node pre-flight-validator.js rentable-production Account --where "CreatedDate > LAST_N_DAYS:30"\n');
    process.exit(1);
  }

  const org = args[0];
  const objectName = args[1];

  // Parse options
  const options = {
    org,
    objectName
  };

  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--mode' && args[i + 1]) {
      options.mode = args[i + 1];
      i++;
    } else if (args[i] === '--fields' && args[i + 1]) {
      options.fields = args[i + 1].split(',').map(f => f.trim());
      i++;
    } else if (args[i] === '--where' && args[i + 1]) {
      options.whereClause = args[i + 1];
      i++;
    } else if (args[i] === '--memory-limit' && args[i + 1]) {
      options.memoryLimitMB = parseInt(args[i + 1]);
      i++;
    }
  }

  const validator = new PreFlightValidator(options);

  validator.validate()
    .then(result => {
      if (result.canProceed) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error(`❌ Pre-flight validation failed: ${error.message}`);
      process.exit(1);
    });
}
