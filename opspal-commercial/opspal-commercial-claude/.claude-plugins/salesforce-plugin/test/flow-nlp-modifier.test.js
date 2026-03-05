/**
 * Unit tests for FlowNLPModifier
 * Tests natural language instruction parsing and flow modification
 *
 * Run: node test/flow-nlp-modifier.test.js
 */

const FlowNLPModifier = require('../scripts/lib/flow-nlp-modifier');
const fs = require('fs').promises;
const path = require('path');

// Test directories
const testDir = path.join(__dirname, '../tmp/test-nlp');
const fixtureDir = path.join(__dirname, 'fixtures/flows');

// Test runner
async function runTests() {
    console.log('🧪 Running FlowNLPModifier tests...\n');

    let passed = 0;
    let failed = 0;
    const results = [];

    async function test(name, fn) {
        try {
            await fn();
            console.log(`✅ ${name}`);
            passed++;
            results.push({ name, passed: true });
        } catch (error) {
            console.log(`❌ ${name}`);
            console.log(`   Error: ${error.message}`);
            failed++;
            results.push({ name, passed: false, error: error.message });
        }
    }

    function expect(value) {
        return {
            toBe(expected) {
                if (value !== expected) {
                    throw new Error(`Expected ${expected}, got ${value}`);
                }
            },
            toContain(expected) {
                if (!value.includes(expected)) {
                    throw new Error(`Expected to contain "${expected}", got "${value}"`);
                }
            },
            toHaveLength(expected) {
                if (!value || value.length !== expected) {
                    throw new Error(`Expected length ${expected}, got ${value ? value.length : 'undefined'}`);
                }
            },
            toBeTruthy() {
                if (!value) {
                    throw new Error(`Expected truthy value, got ${value}`);
                }
            },
            toBeNull() {
                if (value !== null) {
                    throw new Error(`Expected null, got ${value}`);
                }
            },
            toBeGreaterThan(expected) {
                if (value <= expected) {
                    throw new Error(`Expected ${value} to be greater than ${expected}`);
                }
            }
        };
    }

    // Setup: Create test directory
    await fs.mkdir(testDir, { recursive: true });

    // Create test flow for modifications
    const testFlow = await fs.readFile(path.join(fixtureDir, 'Test_Flow.flow-meta.xml'), 'utf8');
    const testFlowPath = path.join(testDir, 'test-flow.flow-meta.xml');
    await fs.writeFile(testFlowPath, testFlow);

    // === INITIALIZATION TESTS ===
    console.log('📦 Testing Initialization:');

    await test('Initialize modifier', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test-org', { verbose: false });
        await modifier.init();

        const context = modifier.getContext();
        expect(context.status).toBe('initialized');
        expect(context.flowName).toBe('test-flow');
        expect(context.operation).toBe('nlp-modification');

        await modifier.context.clear();
    });

    await test('Load flow correctly', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test-org', { verbose: false });
        await modifier.init();

        expect(modifier.flow).toBeTruthy();
        expect(modifier.flow.label).toBe('Test Flow');
        expect(modifier.originalFlow).toBeTruthy();

        await modifier.context.clear();
    });

    // === INSTRUCTION PARSING TESTS ===
    console.log('\n📦 Testing Instruction Parsing:');

    await test('Parse remove instruction', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test-org', { verbose: false });
        await modifier.init();

        const operation = modifier.parseInstruction('Remove the Legacy_Email_Step element');

        expect(operation.type).toBe('remove');
        expect(operation.target).toBe('Legacy_Email_Step');

        await modifier.context.clear();
    });

    await test('Parse add instruction', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test-org', { verbose: false });
        await modifier.init();

        const operation = modifier.parseInstruction('Add a decision called Approval_Check');

        expect(operation.type).toBe('add');
        expect(operation.elementType).toBe('decision');
        expect(operation.target).toBe('Approval_Check');

        await modifier.context.clear();
    });

    await test('Parse modify instruction', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test-org', { verbose: false });
        await modifier.init();

        const operation = modifier.parseInstruction('Modify Decision_Approval to check status');

        expect(operation.type).toBe('modify');
        expect(operation.target).toBe('Decision_Approval');
        expect(operation.change).toContain('check status');

        await modifier.context.clear();
    });

    await test('Parse activate instruction', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test-org', { verbose: false });
        await modifier.init();

        const operation = modifier.parseInstruction('Activate the flow');

        expect(operation.type).toBe('activate');
        expect(operation.target).toBe('flow');

        await modifier.context.clear();
    });

    await test('Parse deactivate instruction', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test-org', { verbose: false });
        await modifier.init();

        const operation = modifier.parseInstruction('Deactivate the flow');

        expect(operation.type).toBe('deactivate');

        await modifier.context.clear();
    });

    await test('Return null for unparseable instruction', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test-org', { verbose: false });
        await modifier.init();

        const operation = modifier.parseInstruction('This is not a valid instruction');

        expect(operation).toBeNull();

        await modifier.context.clear();
    });

    // === ELEMENT REMOVAL TESTS ===
    console.log('\n📦 Testing Element Removal:');

    await test('Remove existing element', async () => {
        const testPath = path.join(testDir, 'test-remove.flow-meta.xml');
        await fs.copyFile(testFlowPath, testPath);

        const modifier = new FlowNLPModifier(testPath, 'test-org', { verbose: false });
        await modifier.init();

        await modifier.parseAndApply('Remove the Middle_Element');

        const operations = modifier.getOperations();
        expect(operations).toHaveLength(1);
        expect(operations[0].result.removed).toBe('Middle_Element');

        await modifier.context.clear();
        await fs.unlink(testPath);
    });

    await test('Error when removing non-existent element', async () => {
        const testPath = path.join(testDir, 'test-remove-missing.flow-meta.xml');
        await fs.copyFile(testFlowPath, testPath);

        const modifier = new FlowNLPModifier(testPath, 'test-org', { verbose: false });
        await modifier.init();

        try {
            await modifier.parseAndApply('Remove NonExistent_Element');
            throw new Error('Should have thrown error');
        } catch (error) {
            if (!error.message.includes('Element not found')) {
                throw error;
            }
        }

        await modifier.context.clear();
        await fs.unlink(testPath);
    });

    // === ELEMENT ADDITION TESTS ===
    console.log('\n📦 Testing Element Addition:');

    await test('Add new decision element', async () => {
        const testPath = path.join(testDir, 'test-add-decision.flow-meta.xml');
        await fs.copyFile(testFlowPath, testPath);

        const modifier = new FlowNLPModifier(testPath, 'test-org', { verbose: false });
        await modifier.init();

        await modifier.parseAndApply('Add a decision called New_Decision');

        const operations = modifier.getOperations();
        expect(operations).toHaveLength(1);
        expect(operations[0].result.added).toBe('New_Decision');
        expect(operations[0].result.type).toBe('decisions');

        await modifier.context.clear();
        await fs.unlink(testPath);
    });

    await test('Add new assignment element', async () => {
        const testPath = path.join(testDir, 'test-add-assignment.flow-meta.xml');
        await fs.copyFile(testFlowPath, testPath);

        const modifier = new FlowNLPModifier(testPath, 'test-org', { verbose: false });
        await modifier.init();

        await modifier.parseAndApply('Add an assignment called Set_Values');

        const operations = modifier.getOperations();
        expect(operations[0].result.type).toBe('assignments');

        await modifier.context.clear();
        await fs.unlink(testPath);
    });

    // === STATUS CHANGE TESTS ===
    console.log('\n📦 Testing Status Changes:');

    await test('Activate flow', async () => {
        const testPath = path.join(testDir, 'test-activate.flow-meta.xml');
        await fs.copyFile(testFlowPath, testPath);

        const modifier = new FlowNLPModifier(testPath, 'test-org', { verbose: false });
        await modifier.init();

        await modifier.parseAndApply('Activate the flow');

        expect(modifier.flow.status).toBe('Active');

        const operations = modifier.getOperations();
        expect(operations[0].result.newValue).toBe('Active');

        await modifier.context.clear();
        await fs.unlink(testPath);
    });

    await test('Deactivate flow', async () => {
        const testPath = path.join(testDir, 'test-deactivate.flow-meta.xml');
        await fs.copyFile(testFlowPath, testPath);

        const modifier = new FlowNLPModifier(testPath, 'test-org', { verbose: false });
        await modifier.init();

        // First activate
        modifier.flow.status = 'Active';

        // Then deactivate
        await modifier.parseAndApply('Deactivate the flow');

        expect(modifier.flow.status).toBe('Draft');

        await modifier.context.clear();
        await fs.unlink(testPath);
    });

    // === SAVE TESTS ===
    console.log('\n📦 Testing Save Functionality:');

    await test('Save modified flow', async () => {
        const testPath = path.join(testDir, 'test-save-input.flow-meta.xml');
        const outputPath = path.join(testDir, 'test-save-output.flow-meta.xml');
        await fs.copyFile(testFlowPath, testPath);

        const modifier = new FlowNLPModifier(testPath, 'test-org', { verbose: false });
        await modifier.init();

        await modifier.parseAndApply('Add a decision called Save_Test');
        await modifier.save(outputPath);

        // Verify output file exists
        const outputContent = await fs.readFile(outputPath, 'utf8');
        expect(outputContent).toContain('Save_Test');

        await modifier.context.clear();
        await fs.unlink(testPath);
        await fs.unlink(outputPath);
    });

    // === ROLLBACK TESTS ===
    console.log('\n📦 Testing Rollback:');

    await test('Rollback to original state', async () => {
        const testPath = path.join(testDir, 'test-rollback.flow-meta.xml');
        await fs.copyFile(testFlowPath, testPath);

        const modifier = new FlowNLPModifier(testPath, 'test-org', { verbose: false });
        await modifier.init();

        const originalStatus = modifier.flow.status;

        // Make changes
        await modifier.parseAndApply('Activate the flow');
        expect(modifier.flow.status).toBe('Active');

        // Rollback
        await modifier.rollback();
        expect(modifier.flow.status).toBe(originalStatus);
        expect(modifier.getOperations()).toHaveLength(0);

        await modifier.context.clear();
        await fs.unlink(testPath);
    });

    // === MULTIPLE OPERATIONS TESTS ===
    console.log('\n📦 Testing Multiple Operations:');

    await test('Apply multiple operations sequentially', async () => {
        const testPath = path.join(testDir, 'test-multi-ops.flow-meta.xml');
        await fs.copyFile(testFlowPath, testPath);

        const modifier = new FlowNLPModifier(testPath, 'test-org', { verbose: false });
        await modifier.init();

        await modifier.parseAndApply('Add a decision called Op1');
        await modifier.parseAndApply('Add an assignment called Op2');
        await modifier.parseAndApply('Activate the flow');

        const operations = modifier.getOperations();
        expect(operations).toHaveLength(3);

        await modifier.context.clear();
        await fs.unlink(testPath);
    });

    // === CONTEXT TRACKING TESTS ===
    console.log('\n📦 Testing Context Tracking:');

    await test('Context records all operations', async () => {
        const testPath = path.join(testDir, 'test-context.flow-meta.xml');
        await fs.copyFile(testFlowPath, testPath);

        const modifier = new FlowNLPModifier(testPath, 'test-org', { verbose: false });
        await modifier.init();

        await modifier.parseAndApply('Add a decision called Context_Test');

        const context = modifier.getContext();
        expect(context.steps.length).toBeGreaterThan(0);

        // Should have steps for: parse_instruction, apply_operation, operation_complete
        const stepNames = context.steps.map(s => s.stepName);
        expect(stepNames).toContain('parse_instruction');
        expect(stepNames).toContain('apply_operation');
        expect(stepNames).toContain('operation_complete');

        await modifier.context.clear();
        await fs.unlink(testPath);
    });

    // Cleanup test directory
    try {
        await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
        console.warn('Warning: Could not clean up test directory:', error.message);
    }

    // Print summary
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 Test Summary`);
    console.log(`${'='.repeat(80)}`);
    console.log(`  Total: ${passed + failed}`);
    console.log(`  ✅ Passed: ${passed} (${((passed / (passed + failed)) * 100).toFixed(1)}%)`);
    console.log(`  ❌ Failed: ${failed} (${((failed / (passed + failed)) * 100).toFixed(1)}%)`);

    if (failed > 0) {
        console.log(`\n  Failed tests:`);
        results.filter(r => !r.passed).forEach(r => {
            console.log(`    - ${r.name}: ${r.error}`);
        });
    }

    console.log(`${'='.repeat(80)}\n`);

    return failed === 0;
}

// Run tests if called directly
if (require.main === module) {
    runTests().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('Test execution failed:', error);
        if (typeof jest === 'undefined') process.exit(1); else throw new Error('Test failed'); // Jest-safe
    });
}

module.exports = { runTests };


// Jest wrapper for standalone test runner
if (typeof describe !== 'undefined') {
  describe('Flow Nlp Modifier', () => {
    it('should pass all tests', async () => {
      if (typeof runTests === 'function') {
        const result = await runTests();
        expect(result).not.toBe(false);
      } else {
        expect(true).toBe(true);
      }
    });
  });
}
