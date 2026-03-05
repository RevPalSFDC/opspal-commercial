/**
 * Q2C Audit Orchestrator Test Suite
 *
 * Tests Q2C audit orchestration:
 * 1. Orchestrator initialization and options
 * 2. Output directory structure creation
 * 3. Generator coordination
 * 4. Error handling and recovery
 * 5. Summary report generation
 * 6. Statistics and metrics
 *
 * Run: node test/q2c-audit-orchestrator.test.js
 *
 * @phase Phase 6: Create Q2C Audit Orchestrator & Command
 */

const fs = require('fs');
const path = require('path');
const Q2CAuditOrchestrator = require('../scripts/lib/q2c-audit-orchestrator');

// Test output directory
const TEST_OUTPUT_DIR = path.join(__dirname, 'output', 'q2c-audit-orchestrator');

async function runTests() {
  console.log('Running Q2C Audit Orchestrator tests...\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      console.log(`✗ ${name}`);
      console.log(`   Error: ${error.message}`);
      if (error.stack) {
        console.log(`   Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      }
      failed++;
    }
  }

  function expect(value) {
    return {
      toBe(expected) {
        if (value !== expected) {
          throw new Error(`Expected ${expected}, got ${value}`);
        }
      },
      toBeDefined() {
        if (value === undefined || value === null) {
          throw new Error(`Expected value to be defined, got ${value}`);
        }
      },
      toBeUndefined() {
        if (value !== undefined) {
          throw new Error(`Expected value to be undefined, got ${value}`);
        }
      },
      toBeTruthy() {
        if (!value) {
          throw new Error(`Expected truthy value, got ${value}`);
        }
      },
      toBeFalsy() {
        if (value) {
          throw new Error(`Expected falsy value, got ${value}`);
        }
      },
      toContain(substring) {
        if (!value || !value.includes(substring)) {
          throw new Error(`Expected to contain "${substring}"`);
        }
      },
      toHaveLength(expected) {
        if (!value || value.length !== expected) {
          throw new Error(`Expected length ${expected}, got ${value ? value.length : 0}`);
        }
      },
      toBeGreaterThan(expected) {
        if (value <= expected) {
          throw new Error(`Expected value > ${expected}, got ${value}`);
        }
      }
    };
  }

  // Cleanup before tests
  if (fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.rmSync(TEST_OUTPUT_DIR, { recursive: true });
  }

  console.log('=== Testing Initialization ===\n');

  await test('Initialize with default options', async () => {
    const orchestrator = new Q2CAuditOrchestrator('test-org');
    expect(orchestrator.orgAlias).toBe('test-org');
    expect(orchestrator.options.detailLevel).toBe('both');
    expect(orchestrator.options.includeInactive).toBe(false);
    expect(orchestrator.options.generateSummary).toBe(true);
    expect(orchestrator.options.verbose).toBe(false);
  });

  await test('Initialize with custom options', async () => {
    const orchestrator = new Q2CAuditOrchestrator('test-org', {
      outputDir: TEST_OUTPUT_DIR,
      detailLevel: 'high-level',
      includeInactive: true,
      generateSummary: false,
      verbose: true
    });
    expect(orchestrator.options.outputDir).toBe(TEST_OUTPUT_DIR);
    expect(orchestrator.options.detailLevel).toBe('high-level');
    expect(orchestrator.options.includeInactive).toBe(true);
    expect(orchestrator.options.generateSummary).toBe(false);
    expect(orchestrator.options.verbose).toBe(true);
  });

  await test('Results object is initialized', async () => {
    const orchestrator = new Q2CAuditOrchestrator('test-org');
    expect(orchestrator.results).toBeDefined();
    expect(orchestrator.results.orgAlias).toBe('test-org');
    expect(orchestrator.results.diagrams).toBeDefined();
    expect(orchestrator.results.errors).toHaveLength(0);
    expect(orchestrator.results.warnings).toHaveLength(0);
  });

  console.log('\n=== Testing Output Structure ===\n');

  await test('Create output directory structure', async () => {
    const outputDir = path.join(TEST_OUTPUT_DIR, 'structure-test');
    const orchestrator = new Q2CAuditOrchestrator('test-org', { outputDir });

    orchestrator._createOutputStructure();

    // Check main directory
    expect(fs.existsSync(outputDir)).toBe(true);

    // Check subdirectories
    expect(fs.existsSync(path.join(outputDir, 'cpq-configuration'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'q2c-process'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'erd'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'automation'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'approvals'))).toBe(true);
  });

  await test('Handle nested output directories', async () => {
    const outputDir = path.join(TEST_OUTPUT_DIR, 'nested', 'deep', 'directory');
    const orchestrator = new Q2CAuditOrchestrator('test-org', { outputDir });

    orchestrator._createOutputStructure();

    expect(fs.existsSync(outputDir)).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'cpq-configuration'))).toBe(true);
  });

  console.log('\n=== Testing Statistics ===\n');

  await test('Get initial statistics', async () => {
    const orchestrator = new Q2CAuditOrchestrator('test-org');

    const stats = orchestrator.getStatistics();

    expect(stats).toBeDefined();
    expect(stats.duration === null || stats.duration === undefined).toBe(true); // Not started yet
    expect(stats.diagramsGenerated).toBe(0);
    expect(stats.totalDiagrams).toBe(0); // Initially no diagrams
    expect(stats.errors).toBe(0);
    expect(stats.warnings).toBe(0);
  });

  await test('Track errors and warnings in statistics', async () => {
    const orchestrator = new Q2CAuditOrchestrator('test-org');

    orchestrator.results.errors.push({ phase: 'test', message: 'Test error' });
    orchestrator.results.warnings.push({ phase: 'test', message: 'Test warning' });

    const stats = orchestrator.getStatistics();

    expect(stats.errors).toBe(1);
    expect(stats.warnings).toBe(1);
  });

  console.log('\n=== Testing Summary Report Generation ===\n');

  await test('Generate summary report structure', async () => {
    const outputDir = path.join(TEST_OUTPUT_DIR, 'summary-test');
    const orchestrator = new Q2CAuditOrchestrator('test-org', { outputDir });

    orchestrator._createOutputStructure();

    // Mock some results
    orchestrator.results.duration = 5000;
    orchestrator.results.diagrams = {
      q2cProcess: {
        generated: true,
        highLevel: { paths: { markdown: 'q2c-process/overview.md' } },
        detailed: { paths: { markdown: 'q2c-process/detailed.md' } }
      },
      erd: {
        generated: true,
        highLevel: { paths: { markdown: 'erd/overview.md' } },
        detailed: { paths: { markdown: 'erd/detailed.md' } }
      },
      automation: {
        generated: true,
        cascades: 5,
        circularDependencies: 1,
        highLevel: { paths: { markdown: 'automation/overview.md' } }
      },
      approvals: {
        generated: true,
        processCount: 2,
        diagrams: [
          {
            processName: 'Quote_Approval',
            object: 'SBQQ__Quote__c',
            highLevel: { filename: 'approval-flow-quote-overview' },
            detailed: { filename: 'approval-flow-quote-detailed' }
          }
        ]
      },
      cpqConfiguration: {
        generated: false,
        reason: 'Requires assessment data'
      }
    };

    await orchestrator._generateSummaryReport();

    const reportPath = path.join(outputDir, 'Q2C-AUDIT-SUMMARY.md');
    expect(fs.existsSync(reportPath)).toBe(true);

    const content = fs.readFileSync(reportPath, 'utf8');
    expect(content).toContain('# Q2C Audit Summary');
    expect(content).toContain('**Org**: test-org');
    expect(content).toContain('## Q2C Process Flow');
    expect(content).toContain('## Entity Relationship Diagram (ERD)');
    expect(content).toContain('## Automation Cascades');
    expect(content).toContain('## Approval Flows');
    expect(content).toContain('## CPQ Configuration Diagrams');
  });

  await test('Include warnings in summary report', async () => {
    const outputDir = path.join(TEST_OUTPUT_DIR, 'warnings-test');
    const orchestrator = new Q2CAuditOrchestrator('test-org', { outputDir });

    orchestrator._createOutputStructure();

    orchestrator.results.duration = 5000;
    orchestrator.results.warnings.push({
      phase: 'automation',
      message: 'Found 2 circular dependencies'
    });

    orchestrator.results.diagrams = {
      cpqConfiguration: { generated: false }
    };

    await orchestrator._generateSummaryReport();

    const reportPath = path.join(outputDir, 'Q2C-AUDIT-SUMMARY.md');
    const content = fs.readFileSync(reportPath, 'utf8');

    expect(content).toContain('## Warnings');
    expect(content).toContain('Found 2 circular dependencies');
  });

  await test('Include errors in summary report', async () => {
    const outputDir = path.join(TEST_OUTPUT_DIR, 'errors-test');
    const orchestrator = new Q2CAuditOrchestrator('test-org', { outputDir });

    orchestrator._createOutputStructure();

    orchestrator.results.duration = 5000;
    orchestrator.results.errors.push({
      phase: 'erd',
      message: 'Failed to query objects'
    });

    orchestrator.results.diagrams = {
      cpqConfiguration: { generated: false }
    };

    await orchestrator._generateSummaryReport();

    const reportPath = path.join(outputDir, 'Q2C-AUDIT-SUMMARY.md');
    const content = fs.readFileSync(reportPath, 'utf8');

    expect(content).toContain('## Errors');
    expect(content).toContain('Failed to query objects');
  });

  console.log('\n=== Testing Results Object ===\n');

  await test('Results object tracks start time', async () => {
    const orchestrator = new Q2CAuditOrchestrator('test-org');

    expect(orchestrator.results.startTime === null || orchestrator.results.startTime === undefined).toBe(true);

    orchestrator.results.startTime = new Date();

    expect(orchestrator.results.startTime).toBeDefined();
    expect(orchestrator.results.startTime instanceof Date).toBe(true);
  });

  await test('Results object tracks duration', async () => {
    const orchestrator = new Q2CAuditOrchestrator('test-org');

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 5000); // 5 seconds later

    orchestrator.results.startTime = startTime;
    orchestrator.results.endTime = endTime;
    orchestrator.results.duration = endTime - startTime;

    expect(orchestrator.results.duration).toBe(5000);
  });

  await test('Results object stores diagram results', async () => {
    const orchestrator = new Q2CAuditOrchestrator('test-org');

    orchestrator.results.diagrams.q2cProcess = {
      generated: true,
      highLevel: { paths: { markdown: '/path/to/overview.md' } }
    };

    expect(orchestrator.results.diagrams.q2cProcess).toBeDefined();
    expect(orchestrator.results.diagrams.q2cProcess.generated).toBe(true);
  });

  console.log('\n=== Testing Error Handling ===\n');

  await test('Collect errors from generator phases', async () => {
    const orchestrator = new Q2CAuditOrchestrator('test-org');

    orchestrator.results.errors.push({
      phase: 'q2c-process',
      message: 'Failed to discover flows'
    });

    orchestrator.results.errors.push({
      phase: 'erd',
      message: 'Failed to query fields'
    });

    expect(orchestrator.results.errors).toHaveLength(2);
    expect(orchestrator.results.errors[0].phase).toBe('q2c-process');
    expect(orchestrator.results.errors[1].phase).toBe('erd');
  });

  await test('Collect warnings from generator phases', async () => {
    const orchestrator = new Q2CAuditOrchestrator('test-org');

    orchestrator.results.warnings.push({
      phase: 'automation',
      message: 'Circular dependency detected'
    });

    expect(orchestrator.results.warnings).toHaveLength(1);
    expect(orchestrator.results.warnings[0].phase).toBe('automation');
  });

  // Cleanup after tests
  if (fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.rmSync(TEST_OUTPUT_DIR, { recursive: true });
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Tests passed: ${passed}`);
  console.log(`Tests failed: ${failed}`);
  console.log(`${'='.repeat(50)}`);

  if (failed > 0) {
    if (typeof jest === 'undefined') process.exit(1); else throw new Error('Test failed'); // Jest-safe
  }
}

// Run tests
if (require.main === module) {
  runTests().catch(error => {
    console.error('Test suite failed:', error);
    if (typeof jest === 'undefined') process.exit(1); else throw new Error('Test failed'); // Jest-safe
  });
}


// Jest wrapper for standalone test runner
if (typeof describe !== 'undefined') {
  describe('Q2c Audit Orchestrator', () => {
    it('should pass all tests', async () => {
      expect(typeof runTests).toBe('function');
      const result = await runTests();
      expect(result).not.toBe(false);
    });
  });
}
