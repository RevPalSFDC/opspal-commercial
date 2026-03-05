/**
 * Unit tests for FlowNLPModifier (Phase 2.2 Enhancements)
 * Tests intelligent templates, option parsing, and advanced element creation
 *
 * Run: node test/flow-nlp-modifier-phase2.2.test.js
 */

const FlowNLPModifier = require('../scripts/lib/flow-nlp-modifier');
const fs = require('fs').promises;
const path = require('path');

// Test directories
const testDir = path.join(__dirname, '../tmp/test-nlp-phase22');
const fixtureDir = path.join(__dirname, 'fixtures/flows');

// Test runner
async function runTests() {
    console.log('>� Running FlowNLPModifier Phase 2.2 tests...\n');

    let passed = 0;
    let failed = 0;
    const results = [];

    async function test(name, fn) {
        try {
            await fn();
            console.log(` ${name}`);
            passed++;
            results.push({ name, passed: true });
        } catch (error) {
            console.log(`L ${name}`);
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
                if (!value || !value.includes(expected)) {
                    throw new Error(`Expected to contain "${expected}", got "${value}"`);
                }
            },
            toHaveProperty(property) {
                if (!value || !value.hasOwnProperty(property)) {
                    throw new Error(`Expected to have property "${property}"`);
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
            toEqual(expected) {
                if (JSON.stringify(value) !== JSON.stringify(expected)) {
                    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
                }
            }
        };
    }

    // Setup: Create test directory
    await fs.mkdir(testDir, { recursive: true });

    // Create a simple test flow
    const testFlow = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <label>Test Flow</label>
    <processType>AutoLaunchedFlow</processType>
    <status>Draft</status>
</Flow>`;

    const testFlowPath = path.join(testDir, 'test-flow.flow-meta.xml');
    await fs.writeFile(testFlowPath, testFlow);

    // === BACKWARD COMPATIBILITY TESTS ===
    console.log('=� Testing Backward Compatibility:');

    await test('Add basic decision without options', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test', { verbose: false });
        await modifier.init();

        const result = await modifier.parseAndApply('Add a decision called Basic_Decision');

        expect(result.added).toBe('Basic_Decision');
        expect(result.type).toBe('decisions');

        // Verify element has basic structure
        const element = modifier.findElement('Basic_Decision');
        expect(element).toBeTruthy();
        expect(element.name).toBe('Basic_Decision');
        expect(element.label).toBeTruthy();

        await modifier.context.clear();
    });

    await test('Add basic assignment without options', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test', { verbose: false });
        await modifier.init();

        const result = await modifier.parseAndApply('Add an assignment called Set_Status');

        expect(result.added).toBe('Set_Status');
        expect(result.type).toBe('assignments');

        const element = modifier.findElement('Set_Status');
        expect(element).toBeTruthy();
        expect(element.name).toBe('Set_Status');
        expect(element.label).toBeTruthy();

        await modifier.context.clear();
    });

    // === OPTION PARSING TESTS ===
    console.log('\n=� Testing Option Parsing:');

    await test('Parse label option', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test', { verbose: false });
        await modifier.init();

        const result = await modifier.parseAndApply('Add a decision called Status_Check with label "Check Account Status"');

        const element = modifier.findElement('Status_Check');
        expect(element).toBeTruthy();
        expect(element.label).toBe('Check Account Status');

        await modifier.context.clear();
    });

    await test('Parse connector/target option', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test', { verbose: false });
        await modifier.init();

        const result = await modifier.parseAndApply('Add an assignment called Update_Field connecting to Next_Step');

        const element = modifier.findElement('Update_Field');
        expect(element).toBeTruthy();
        expect(element.connector).toBeTruthy();
        expect(element.connector.targetReference).toBe('Next_Step');

        await modifier.context.clear();
    });

    await test('Parse default label option (decision)', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test', { verbose: false });
        await modifier.init();

        const result = await modifier.parseAndApply('Add a decision called Approval_Decision with default "Not Approved"');

        const element = modifier.findElement('Approval_Decision');
        expect(element).toBeTruthy();
        expect(element.defaultConnectorLabel).toBe('Not Approved');

        await modifier.context.clear();
    });

    await test('Parse object option (record operations)', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test', { verbose: false });
        await modifier.init();

        const result = await modifier.parseAndApply('Add a lookup called Find_Account for Account');

        const element = modifier.findElement('Find_Account');
        expect(element).toBeTruthy();
        expect(element.object).toBe('Account');

        await modifier.context.clear();
    });

    await test('Parse collection option (loops)', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test', { verbose: false });
        await modifier.init();

        const result = await modifier.parseAndApply('Add a loop called Process_Records collection AccountList');

        const element = modifier.findElement('Process_Records');
        expect(element).toBeTruthy();
        expect(element.collectionReference).toBe('AccountList');

        await modifier.context.clear();
    });

    await test('Parse iteration order option (loops)', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test', { verbose: false });
        await modifier.init();

        const result = await modifier.parseAndApply('Add a loop called Sort_Descending collection Items descending');

        const element = modifier.findElement('Sort_Descending');
        expect(element).toBeTruthy();
        expect(element.iterationOrder).toBe('Desc');

        await modifier.context.clear();
    });

    await test('Parse location option', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test', { verbose: false });
        await modifier.init();

        const result = await modifier.parseAndApply('Add a decision called Positioned_Decision at 100, 200');

        const element = modifier.findElement('Positioned_Decision');
        expect(element).toBeTruthy();
        expect(element.locationX).toBe(100);
        expect(element.locationY).toBe(200);

        await modifier.context.clear();
    });

    // === TEMPLATE INTEGRATION TESTS ===
    console.log('\n=� Testing Template Integration:');

    await test('Decision template has all required properties', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test', { verbose: false });
        await modifier.init();

        await modifier.parseAndApply('Add a decision called Full_Decision with label "Full Check" default "Default Path" connecting to Next_Element at 50, 100');

        const element = modifier.findElement('Full_Decision');
        expect(element).toBeTruthy();
        expect(element.name).toBe('Full_Decision');
        expect(element.label).toBe('Full Check');
        expect(element.defaultConnectorLabel).toBe('Default Path');
        expect(element.defaultConnector.targetReference).toBe('Next_Element');
        expect(element.locationX).toBe(50);
        expect(element.locationY).toBe(100);

        await modifier.context.clear();
    });

    await test('Assignment template has connector', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test', { verbose: false });
        await modifier.init();

        await modifier.parseAndApply('Add an assignment called Set_Value connecting to After_Assignment');

        const element = modifier.findElement('Set_Value');
        expect(element).toBeTruthy();
        expect(element.connector).toBeTruthy();
        expect(element.connector.targetReference).toBe('After_Assignment');

        await modifier.context.clear();
    });

    await test('Record lookup template has proper structure', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test', { verbose: false });
        await modifier.init();

        await modifier.parseAndApply('Add a lookup called Find_Contact for Contact');

        const element = modifier.findElement('Find_Contact');
        expect(element).toBeTruthy();
        expect(element.object).toBe('Contact');
        expect(element.filterLogic).toBe('and'); // Default from template
        expect(element.getFirstRecordOnly).toBe(true); // Default from template

        await modifier.context.clear();
    });

    await test('Loop template has proper structure', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test', { verbose: false });
        await modifier.init();

        await modifier.parseAndApply('Add a loop called Iterate_Accounts collection AccountRecords ascending');

        const element = modifier.findElement('Iterate_Accounts');
        expect(element).toBeTruthy();
        expect(element.collectionReference).toBe('AccountRecords');
        expect(element.iterationOrder).toBe('Asc');

        await modifier.context.clear();
    });

    // === COMPLEX SCENARIOS ===
    console.log('\n=� Testing Complex Scenarios:');

    await test('Multiple options parsed correctly', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test', { verbose: false });
        await modifier.init();

        const result = await modifier.parseAndApply('Add a decision called Complex_Decision with label "Complex Check" default "Default" connecting to Next at 150, 250');

        const element = modifier.findElement('Complex_Decision');
        expect(element).toBeTruthy();
        expect(element.name).toBe('Complex_Decision');
        expect(element.label).toBe('Complex Check');
        expect(element.defaultConnectorLabel).toBe('Default');
        expect(element.defaultConnector.targetReference).toBe('Next');
        expect(element.locationX).toBe(150);
        expect(element.locationY).toBe(250);

        await modifier.context.clear();
    });

    await test('Save flow with template-created elements', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test', { verbose: false });
        await modifier.init();

        await modifier.parseAndApply('Add a decision called Save_Test with label "Test Save"');

        const outputPath = path.join(testDir, 'saved-flow.flow-meta.xml');
        await modifier.save(outputPath);

        // Verify file was saved
        const savedContent = await fs.readFile(outputPath, 'utf8');
        expect(savedContent).toContain('Save_Test');
        expect(savedContent).toContain('Test Save');

        await modifier.context.clear();
        await fs.unlink(outputPath);
    });

    // === ELEMENT TYPE TESTS ===
    console.log('\n=� Testing Different Element Types:');

    const elementTypes = [
        { type: 'decision', name: 'Test_Decision' },
        { type: 'assignment', name: 'Test_Assignment' },
        { type: 'action', name: 'Test_Action' },
        { type: 'lookup', name: 'Test_Lookup', options: 'for Account' },
        { type: 'create', name: 'Test_Create', options: 'for Lead' },
        { type: 'update', name: 'Test_Update', options: 'for Case' },
        { type: 'loop', name: 'Test_Loop', options: 'collection Items' },
        { type: 'screen', name: 'Test_Screen' }
    ];

    for (const { type, name, options } of elementTypes) {
        await test(`Create ${type} element with template`, async () => {
            const modifier = new FlowNLPModifier(testFlowPath, 'test', { verbose: false });
            await modifier.init();

            const instruction = options
                ? `Add a ${type} called ${name} ${options}`
                : `Add a ${type} called ${name}`;

            const result = await modifier.parseAndApply(instruction);

            expect(result.added).toBe(name);

            const element = modifier.findElement(name);
            expect(element).toBeTruthy();
            expect(element.name).toBe(name);
            expect(element.label).toBeTruthy();

            await modifier.context.clear();
        });
    }

    // === LABEL GENERATION TESTS ===
    console.log('\n=� Testing Label Generation:');

    await test('Auto-generate label from snake_case name', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test', { verbose: false });
        await modifier.init();

        await modifier.parseAndApply('Add a decision called check_approval_status');

        const element = modifier.findElement('check_approval_status');
        expect(element).toBeTruthy();
        // Label should be auto-generated as "Check Approval Status"
        expect(element.label).toContain('Check');
        expect(element.label).toContain('Approval');
        expect(element.label).toContain('Status');

        await modifier.context.clear();
    });

    // Cleanup test directory
    try {
        await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
        console.warn('Warning: Could not clean up test directory:', error.message);
    }

    // Print summary
    console.log(`\n${'='.repeat(80)}`);
    console.log(`=� Test Summary`);
    console.log(`${'='.repeat(80)}`);
    console.log(`  Total: ${passed + failed}`);
    console.log(`   Passed: ${passed} (${((passed / (passed + failed)) * 100).toFixed(1)}%)`);
    console.log(`  L Failed: ${failed} (${((failed / (passed + failed)) * 100).toFixed(1)}%)`);

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
  describe('Flow Nlp Modifier Phase2.2', () => {
    it('should pass all tests', async () => {
      expect(typeof runTests).toBe('function');
      const result = await runTests();
      expect(result).not.toBe(false);
    });
  });
}
