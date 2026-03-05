/**
 * Integration tests for FlowNLPModifier Phase 2.3
 * Tests decision rule parsing and creation
 * Run: node test/flow-nlp-modifier-phase2.3.test.js
 */

const FlowNLPModifier = require('../scripts/lib/flow-nlp-modifier');
const fs = require('fs').promises;
const path = require('path');

async function runTests() {
    console.log('Running FlowNLPModifier Phase 2.3 integration tests...\n');

    let passed = 0;
    let failed = 0;

    async function test(name, fn) {
        try {
            await fn();
            console.log('PASS: ' + name);
            passed++;
        } catch (error) {
            console.log('FAIL: ' + name);
            console.log('  Error: ' + error.message);
            failed++;
        }
    }

    function expect(value) {
        return {
            toBe(expected) {
                if (value !== expected) throw new Error('Expected ' + expected + ', got ' + value);
            },
            toBeTruthy() {
                if (!value) throw new Error('Expected truthy value');
            },
            toHaveLength(expected) {
                if (!value || value.length !== expected) throw new Error('Expected length ' + expected);
            }
        };
    }

    const testDir = path.join(__dirname, '../tmp/test-nlp-phase23');
    await fs.mkdir(testDir, { recursive: true });

    const testFlow = '<?xml version="1.0" encoding="UTF-8"?>\n<Flow xmlns="http://soap.sforce.com/2006/04/metadata">\n    <apiVersion>62.0</apiVersion>\n    <label>Test Flow</label>\n    <processType>AutoLaunchedFlow</processType>\n    <status>Draft</status>\n</Flow>';

    const testFlowPath = path.join(testDir, 'test-flow.flow-meta.xml');
    await fs.writeFile(testFlowPath, testFlow);

    console.log('Testing Decision Rules:\n');

    await test('Create decision with single rule', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test', { verbose: false });
        await modifier.init();

        await modifier.parseAndApply('Add a decision called Amount_Check with rule High_Value if Amount > 10000 then Large_Deal_Path');

        const element = modifier.findElement('Amount_Check');
        expect(element).toBeTruthy();
        expect(element.rules).toBeTruthy();
        expect(element.rules).toHaveLength(1);
        expect(element.rules[0].name).toBe('High_Value');
        expect(element.rules[0].conditions).toHaveLength(1);
        expect(element.rules[0].conditions[0].operator).toBe('GreaterThan');

        await modifier.context.clear();
    });

    await test('Create decision with multiple conditions (AND)', async () => {
        const modifier = new FlowNLPModifier(testFlowPath, 'test', { verbose: false });
        await modifier.init();

        const instruction = 'Add a decision called Approval_Check with rule Needs_Manager if Status = ' + "'Pending'" + ' and Amount > 5000 then Manager_Review';
        await modifier.parseAndApply(instruction);

        const element = modifier.findElement('Approval_Check');
        expect(element.rules[0].conditions).toHaveLength(2);
        expect(element.rules[0].conditionLogic).toBe('and');

        await modifier.context.clear();
    });

    await fs.rm(testDir, { recursive: true, force: true });

    console.log('\n' + '='.repeat(80));
    console.log('Test Summary');
    console.log('='.repeat(80));
    console.log('  Total: ' + (passed + failed));
    console.log('  Passed: ' + passed + ' (' + ((passed / (passed + failed)) * 100).toFixed(1) + '%)');
    console.log('  Failed: ' + failed + ' (' + ((failed / (passed + failed)) * 100).toFixed(1) + '%)');
    console.log('='.repeat(80) + '\n');

    return failed === 0;
}

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
  describe('Flow Nlp Modifier Phase2.3', () => {
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
