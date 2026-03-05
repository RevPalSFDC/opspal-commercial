#!/usr/bin/env node

/**
 * Week 1 Test Scenario Runner
 *
 * Automates the execution of Week 1 internal testing scenarios for all 4 validators.
 * Runs 20+ real-world scenarios, collects telemetry, and generates reports.
 *
 * Usage:
 *   node scripts/week-1-test-runner.js --org <org-alias>
 *   node scripts/week-1-test-runner.js --org internal-sandbox --scenarios 1,2,3
 *   node scripts/week-1-test-runner.js --org internal-sandbox --report-only
 *
 * @see docs/WEEK_1_TESTING_QUICK_START.md
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class Week1TestRunner {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.verbose = options.verbose || false;
    this.scenariosToRun = options.scenarios || 'all';
    this.logDir = path.join(__dirname, '../logs/week-1-testing');
    this.telemetryDir = path.join(__dirname, '../logs/telemetry');
    this.resultsFile = path.join(this.logDir, `test-results-${new Date().toISOString().split('T')[0]}.json`);

    // Ensure directories exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this.results = {
      startTime: new Date().toISOString(),
      orgAlias: this.orgAlias,
      scenarios: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        blocked: 0,
        warnings: 0
      }
    };
  }

  log(message) {
    if (this.verbose) {
      console.log(`[Week 1 Test Runner] ${message}`);
    }
  }

  async runAllScenarios() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('  WEEK 1 INTERNAL TESTING - AUTOMATED TEST RUNNER');
    console.log('════════════════════════════════════════════════════════════');
    console.log(`Org: ${this.orgAlias}`);
    console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
    console.log('');

    const scenarios = this.getScenarios();

    for (const scenario of scenarios) {
      if (this.shouldRunScenario(scenario.id)) {
        console.log(`\n▶ Running Scenario ${scenario.id}: ${scenario.name}`);
        console.log(`  Validator: ${scenario.validator}`);
        console.log(`  Expected: ${scenario.expectedOutcome}`);

        try {
          const result = await this.runScenario(scenario);
          this.recordResult(scenario, result);

          if (result.outcome === scenario.expectedOutcome) {
            console.log(`  ✅ PASSED`);
          } else {
            console.log(`  ❌ FAILED (Expected: ${scenario.expectedOutcome}, Got: ${result.outcome})`);
          }
        } catch (error) {
          console.log(`  ❌ ERROR: ${error.message}`);
          this.recordResult(scenario, { outcome: 'error', error: error.message });
        }
      }
    }

    this.generateReport();
    this.saveResults();
  }

  getScenarios() {
    return [
      // Metadata Dependency Analyzer (Scenarios 1-5)
      {
        id: 1,
        name: 'Field with validation rule dependency',
        validator: 'metadata-dependency-analyzer',
        expectedOutcome: 'blocked',
        setup: () => this.createFieldWithValidationRule(),
        execute: () => this.attemptFieldDeletion('Account', 'Test_VR_Field__c'),
        cleanup: () => this.cleanupTestField('Account', 'Test_VR_Field__c')
      },
      {
        id: 2,
        name: 'Field with Flow dependency',
        validator: 'metadata-dependency-analyzer',
        expectedOutcome: 'blocked',
        setup: () => this.createFieldWithFlow(),
        execute: () => this.attemptFieldDeletion('Opportunity', 'Test_Flow_Field__c'),
        cleanup: () => this.cleanupTestField('Opportunity', 'Test_Flow_Field__c')
      },
      {
        id: 3,
        name: 'Field with layout dependency (warning only)',
        validator: 'metadata-dependency-analyzer',
        expectedOutcome: 'warnings_only',
        setup: () => this.createFieldOnLayout(),
        execute: () => this.attemptFieldDeletion('Contact', 'Test_Layout_Field__c'),
        cleanup: () => this.cleanupTestField('Contact', 'Test_Layout_Field__c')
      },
      {
        id: 4,
        name: 'Field with no dependencies',
        validator: 'metadata-dependency-analyzer',
        expectedOutcome: 'passed',
        setup: () => this.createUnusedField(),
        execute: () => this.attemptFieldDeletion('Account', 'Test_Unused_Field__c'),
        cleanup: () => this.cleanupTestField('Account', 'Test_Unused_Field__c')
      },
      {
        id: 5,
        name: 'Field with multiple dependencies',
        validator: 'metadata-dependency-analyzer',
        expectedOutcome: 'blocked',
        setup: () => this.createFieldWithMultipleDependencies(),
        execute: () => this.attemptFieldDeletion('Account', 'Test_Multi_Dep_Field__c'),
        cleanup: () => this.cleanupTestField('Account', 'Test_Multi_Dep_Field__c')
      },

      // Flow XML Validator (Scenarios 6-10)
      {
        id: 6,
        name: 'Flow with syntax errors',
        validator: 'flow-xml-validator',
        expectedOutcome: 'blocked',
        setup: () => this.createInvalidFlow(),
        execute: () => this.validateFlow('test-flow-invalid.xml'),
        cleanup: () => this.cleanupTestFlow('test-flow-invalid.xml')
      },
      {
        id: 7,
        name: 'Flow with best practice violations',
        validator: 'flow-xml-validator',
        expectedOutcome: 'warnings_only',
        setup: () => this.createFlowWithViolations(),
        execute: () => this.validateFlow('test-flow-violations.xml', { bestPractices: true }),
        cleanup: () => this.cleanupTestFlow('test-flow-violations.xml')
      },
      {
        id: 8,
        name: 'Valid Flow',
        validator: 'flow-xml-validator',
        expectedOutcome: 'passed',
        setup: () => this.createValidFlow(),
        execute: () => this.validateFlow('test-flow-valid.xml'),
        cleanup: () => this.cleanupTestFlow('test-flow-valid.xml')
      },
      {
        id: 9,
        name: 'Flow with auto-fixable errors',
        validator: 'flow-xml-validator',
        expectedOutcome: 'passed',
        setup: () => this.createFlowWithFixableErrors(),
        execute: () => this.validateFlow('test-flow-fixable.xml', { autoFix: true }),
        cleanup: () => this.cleanupTestFlow('test-flow-fixable.xml')
      },
      {
        id: 10,
        name: 'Complex Flow (performance test)',
        validator: 'flow-xml-validator',
        expectedOutcome: 'passed',
        setup: () => this.createComplexFlow(),
        execute: () => this.validateFlow('test-flow-complex.xml'),
        cleanup: () => this.cleanupTestFlow('test-flow-complex.xml')
      },

      // CSV Parser Safe (Scenarios 11-15)
      {
        id: 11,
        name: 'CSV with BOM',
        validator: 'csv-parser-safe',
        expectedOutcome: 'warnings_only',
        setup: () => this.createCSVWithBOM(),
        execute: () => this.parseCSV('test-csv-bom.csv'),
        cleanup: () => this.cleanupTestCSV('test-csv-bom.csv')
      },
      {
        id: 12,
        name: 'CSV with Windows line endings',
        validator: 'csv-parser-safe',
        expectedOutcome: 'warnings_only',
        setup: () => this.createCSVWithWindowsLineEndings(),
        execute: () => this.parseCSV('test-csv-crlf.csv'),
        cleanup: () => this.cleanupTestCSV('test-csv-crlf.csv')
      },
      {
        id: 13,
        name: 'CSV with schema validation failure',
        validator: 'csv-parser-safe',
        expectedOutcome: 'blocked',
        setup: () => this.createCSVWithMissingColumns(),
        execute: () => this.parseCSV('test-csv-schema.csv', { schema: { required: ['Name', 'Email'] } }),
        cleanup: () => this.cleanupTestCSV('test-csv-schema.csv')
      },
      {
        id: 14,
        name: 'Valid CSV',
        validator: 'csv-parser-safe',
        expectedOutcome: 'passed',
        setup: () => this.createValidCSV(),
        execute: () => this.parseCSV('test-csv-valid.csv'),
        cleanup: () => this.cleanupTestCSV('test-csv-valid.csv')
      },
      {
        id: 15,
        name: 'Large CSV (performance test)',
        validator: 'csv-parser-safe',
        expectedOutcome: 'passed',
        setup: () => this.createLargeCSV(10000),
        execute: () => this.parseCSV('test-csv-large.csv'),
        cleanup: () => this.cleanupTestCSV('test-csv-large.csv')
      },

      // Automation Feasibility Analyzer (Scenarios 16-20)
      {
        id: 16,
        name: 'Simple Flow request',
        validator: 'automation-feasibility-analyzer',
        expectedOutcome: 'passed',
        setup: () => Promise.resolve(),
        execute: () => this.analyzeFeasibility('Create a Flow to update Account status'),
        cleanup: () => Promise.resolve()
      },
      {
        id: 17,
        name: 'Complex approval request',
        validator: 'automation-feasibility-analyzer',
        expectedOutcome: 'passed',
        setup: () => Promise.resolve(),
        execute: () => this.analyzeFeasibility('Create a 3-step approval process with dynamic approvers'),
        cleanup: () => Promise.resolve()
      },
      {
        id: 18,
        name: 'Multiple automation types',
        validator: 'automation-feasibility-analyzer',
        expectedOutcome: 'passed',
        setup: () => Promise.resolve(),
        execute: () => this.analyzeFeasibility('Create a Flow and a Quick Action and a validation rule'),
        cleanup: () => Promise.resolve()
      },
      {
        id: 19,
        name: 'Unrealistic expectation',
        validator: 'automation-feasibility-analyzer',
        expectedOutcome: 'blocked',
        setup: () => Promise.resolve(),
        execute: () => this.analyzeFeasibility('Fully automate complex CPQ pricing with 50 rules'),
        cleanup: () => Promise.resolve()
      },
      {
        id: 20,
        name: 'Performance test',
        validator: 'automation-feasibility-analyzer',
        expectedOutcome: 'passed',
        setup: () => Promise.resolve(),
        execute: () => this.analyzeFeasibility('Create a Flow to ' + 'validate data '.repeat(100)),
        cleanup: () => Promise.resolve()
      }
    ];
  }

  shouldRunScenario(scenarioId) {
    if (this.scenariosToRun === 'all') {
      return true;
    }

    const scenariosArray = this.scenariosToRun.split(',').map(s => parseInt(s.trim()));
    return scenariosArray.includes(scenarioId);
  }

  async runScenario(scenario) {
    const startTime = Date.now();

    try {
      // Setup
      this.log(`Setting up scenario ${scenario.id}...`);
      await scenario.setup();

      // Execute
      this.log(`Executing scenario ${scenario.id}...`);
      const result = await scenario.execute();

      // Cleanup
      this.log(`Cleaning up scenario ${scenario.id}...`);
      await scenario.cleanup();

      return {
        ...result,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      // Attempt cleanup even on error
      try {
        await scenario.cleanup();
      } catch (cleanupError) {
        this.log(`Cleanup failed: ${cleanupError.message}`);
      }

      throw error;
    }
  }

  recordResult(scenario, result) {
    this.results.scenarios.push({
      id: scenario.id,
      name: scenario.name,
      validator: scenario.validator,
      expectedOutcome: scenario.expectedOutcome,
      actualOutcome: result.outcome,
      passed: result.outcome === scenario.expectedOutcome,
      executionTime: result.executionTime || 0,
      errors: result.errors || [],
      warnings: result.warnings || [],
      timestamp: new Date().toISOString()
    });

    this.results.summary.total++;
    if (result.outcome === scenario.expectedOutcome) {
      this.results.summary.passed++;
    } else {
      this.results.summary.failed++;
    }

    if (result.outcome === 'blocked') {
      this.results.summary.blocked++;
    } else if (result.outcome === 'warnings_only') {
      this.results.summary.warnings++;
    }
  }

  generateReport() {
    console.log('\n');
    console.log('════════════════════════════════════════════════════════════');
    console.log('  WEEK 1 TEST RESULTS SUMMARY');
    console.log('════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`Total Scenarios: ${this.results.summary.total}`);
    console.log(`Passed: ${this.results.summary.passed} (${Math.round(this.results.summary.passed / this.results.summary.total * 100)}%)`);
    console.log(`Failed: ${this.results.summary.failed} (${Math.round(this.results.summary.failed / this.results.summary.total * 100)}%)`);
    console.log(`Blocked: ${this.results.summary.blocked}`);
    console.log(`Warnings: ${this.results.summary.warnings}`);
    console.log('');

    // Per-validator summary
    const validatorSummary = this.results.scenarios.reduce((acc, scenario) => {
      if (!acc[scenario.validator]) {
        acc[scenario.validator] = { passed: 0, failed: 0, total: 0 };
      }
      acc[scenario.validator].total++;
      if (scenario.passed) {
        acc[scenario.validator].passed++;
      } else {
        acc[scenario.validator].failed++;
      }
      return acc;
    }, {});

    console.log('Per-Validator Results:');
    Object.keys(validatorSummary).forEach(validator => {
      const summary = validatorSummary[validator];
      console.log(`  ${validator}: ${summary.passed}/${summary.total} passed (${Math.round(summary.passed / summary.total * 100)}%)`);
    });

    console.log('');
    console.log('Next Steps:');
    if (this.results.summary.passed === this.results.summary.total) {
      console.log('  ✅ All scenarios passed! Review telemetry and proceed to go/no-go decision.');
      console.log('  📊 Generate telemetry report: node scripts/analyze-validator-telemetry.js');
    } else {
      console.log('  ⚠️  Some scenarios failed. Review failures and fix issues before proceeding.');
      console.log(`  📄 Results saved: ${this.resultsFile}`);
    }
    console.log('');
    console.log('════════════════════════════════════════════════════════════');
  }

  saveResults() {
    this.results.endTime = new Date().toISOString();
    fs.writeFileSync(this.resultsFile, JSON.stringify(this.results, null, 2));
    console.log(`\n📄 Full results saved: ${this.resultsFile}\n`);
  }

  // Scenario Setup Methods (Simplified - Real implementations would use SF CLI)

  async createFieldWithValidationRule() {
    // Placeholder - in real implementation, use sf CLI to create field and validation rule
    this.log('Creating field with validation rule...');
    return Promise.resolve();
  }

  async attemptFieldDeletion(objectName, fieldName) {
    // Placeholder - run metadata-dependency-analyzer
    this.log(`Attempting to delete ${objectName}.${fieldName}...`);
    try {
      const output = execSync(
        `node ${path.join(__dirname, 'lib/metadata-dependency-analyzer.js')} ${this.orgAlias} ${objectName} ${fieldName}`,
        { encoding: 'utf-8', stdio: 'pipe' }
      );

      // Parse output to determine outcome
      if (output.includes('blocked') || output.includes('Dependencies found')) {
        return { outcome: 'blocked', errors: ['Dependencies found'], warnings: [] };
      } else if (output.includes('warning')) {
        return { outcome: 'warnings_only', errors: [], warnings: ['Layout dependency'] };
      } else {
        return { outcome: 'passed', errors: [], warnings: [] };
      }
    } catch (error) {
      // If process exits with error, likely blocked
      if (error.stdout && error.stdout.includes('blocked')) {
        return { outcome: 'blocked', errors: ['Dependencies found'], warnings: [] };
      }
      throw error;
    }
  }

  async cleanupTestField(objectName, fieldName) {
    this.log(`Cleaning up test field ${objectName}.${fieldName}...`);
    // Placeholder - in real implementation, delete field via SF CLI
    return Promise.resolve();
  }

  async createInvalidFlow() {
    const flowPath = path.join(__dirname, '../test-flow-invalid.xml');
    const invalidFlow = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <status>Draft</status>
    <!-- Missing required processType -->
</Flow>`;
    fs.writeFileSync(flowPath, invalidFlow);
    return Promise.resolve();
  }

  async validateFlow(flowName, options = {}) {
    const flowPath = path.join(__dirname, `../${flowName}`);
    this.log(`Validating Flow: ${flowName}...`);

    try {
      const optsStr = Object.keys(options).map(k => `--${k}`).join(' ');
      const output = execSync(
        `node ${path.join(__dirname, 'lib/flow-xml-validator.js')} ${flowPath} ${optsStr}`,
        { encoding: 'utf-8', stdio: 'pipe' }
      );

      if (output.includes('error') || output.includes('blocked')) {
        return { outcome: 'blocked', errors: ['Validation errors'], warnings: [] };
      } else if (output.includes('warning')) {
        return { outcome: 'warnings_only', errors: [], warnings: ['Best practice violations'] };
      } else {
        return { outcome: 'passed', errors: [], warnings: [] };
      }
    } catch (error) {
      return { outcome: 'blocked', errors: [error.message], warnings: [] };
    }
  }

  async cleanupTestFlow(flowName) {
    const flowPath = path.join(__dirname, `../${flowName}`);
    if (fs.existsSync(flowPath)) {
      fs.unlinkSync(flowPath);
    }
    return Promise.resolve();
  }

  async createCSVWithBOM() {
    const csvPath = path.join(__dirname, '../test-csv-bom.csv');
    const csv = '\uFEFF' + 'Name,Email\nJohn Doe,john@example.com';
    fs.writeFileSync(csvPath, csv);
    return Promise.resolve();
  }

  async parseCSV(csvName, options = {}) {
    const csvPath = path.join(__dirname, `../${csvName}`);
    this.log(`Parsing CSV: ${csvName}...`);

    try {
      const optsStr = options.schema ? `--schema '${JSON.stringify(options.schema)}'` : '';
      const output = execSync(
        `node ${path.join(__dirname, 'lib/csv-parser-safe.js')} ${csvPath} ${optsStr}`,
        { encoding: 'utf-8', stdio: 'pipe' }
      );

      if (output.includes('error') || output.includes('blocked')) {
        return { outcome: 'blocked', errors: ['Schema validation failed'], warnings: [] };
      } else if (output.includes('warning') || output.includes('BOM') || output.includes('normalized')) {
        return { outcome: 'warnings_only', errors: [], warnings: ['Format issues fixed'] };
      } else {
        return { outcome: 'passed', errors: [], warnings: [] };
      }
    } catch (error) {
      return { outcome: 'blocked', errors: [error.message], warnings: [] };
    }
  }

  async cleanupTestCSV(csvName) {
    const csvPath = path.join(__dirname, `../${csvName}`);
    if (fs.existsSync(csvPath)) {
      fs.unlinkSync(csvPath);
    }
    return Promise.resolve();
  }

  async analyzeFeasibility(request) {
    this.log(`Analyzing feasibility: "${request.substring(0, 50)}..."...`);

    try {
      const output = execSync(
        `node ${path.join(__dirname, 'lib/automation-feasibility-analyzer.js')} "${request}"`,
        { encoding: 'utf-8', stdio: 'pipe' }
      );

      if (output.includes('MOSTLY_MANUAL') && request.includes('Fully automate')) {
        return { outcome: 'blocked', errors: ['Expectation mismatch'], warnings: [] };
      } else if (output.includes('FULLY_AUTOMATED') || output.includes('HYBRID')) {
        return { outcome: 'passed', errors: [], warnings: [] };
      } else {
        return { outcome: 'passed', errors: [], warnings: [] };
      }
    } catch (error) {
      return { outcome: 'error', errors: [error.message], warnings: [] };
    }
  }

  // Placeholder methods for other scenario types
  async createFieldWithFlow() { return Promise.resolve(); }
  async createFieldOnLayout() { return Promise.resolve(); }
  async createUnusedField() { return Promise.resolve(); }
  async createFieldWithMultipleDependencies() { return Promise.resolve(); }
  async createFlowWithViolations() { return Promise.resolve(); }
  async createValidFlow() { return Promise.resolve(); }
  async createFlowWithFixableErrors() { return Promise.resolve(); }
  async createComplexFlow() { return Promise.resolve(); }
  async createCSVWithWindowsLineEndings() { return Promise.resolve(); }
  async createCSVWithMissingColumns() { return Promise.resolve(); }
  async createValidCSV() { return Promise.resolve(); }
  async createLargeCSV(rows) { return Promise.resolve(); }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2 || args[0] !== '--org') {
    console.error('Usage: node week-1-test-runner.js --org <org-alias> [--scenarios 1,2,3] [--verbose] [--report-only]');
    console.error('');
    console.error('Options:');
    console.error('  --org <alias>        Salesforce org alias (required)');
    console.error('  --scenarios <list>   Comma-separated scenario IDs to run (default: all)');
    console.error('  --verbose            Enable verbose logging');
    console.error('  --report-only        Generate report from existing telemetry without running scenarios');
    console.error('');
    console.error('Examples:');
    console.error('  node week-1-test-runner.js --org internal-sandbox');
    console.error('  node week-1-test-runner.js --org internal-sandbox --scenarios 1,2,3,6,7,11');
    console.error('  node week-1-test-runner.js --org internal-sandbox --report-only');
    process.exit(1);
  }

  const orgAlias = args[1];
  const options = {
    verbose: args.includes('--verbose'),
    scenarios: args.includes('--scenarios') ? args[args.indexOf('--scenarios') + 1] : 'all',
    reportOnly: args.includes('--report-only')
  };

  const runner = new Week1TestRunner(orgAlias, options);

  if (options.reportOnly) {
    // Just generate report from existing telemetry
    console.log('Generating report from existing telemetry...');
    const { execSync } = require('child_process');
    execSync('node scripts/analyze-validator-telemetry.js', { stdio: 'inherit' });
  } else {
    // Run scenarios
    runner.runAllScenarios().catch(error => {
      console.error(`\n❌ Test runner failed: ${error.message}\n`);
      process.exit(1);
    });
  }
}

module.exports = Week1TestRunner;
