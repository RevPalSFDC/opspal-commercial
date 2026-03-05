/**
 * Unit tests for FlowConditionParser (Phase 2.3)
 * Tests condition parsing, operators, and value type detection
 *
 * Run: node test/flow-condition-parser.test.js
 */

const FlowConditionParser = require('../scripts/lib/flow-condition-parser');

async function runTests() {
    console.log('>� Running FlowConditionParser Phase 2.3 tests...\n');

    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(` ${name}`);
            passed++;
        } catch (error) {
            console.log(`L ${name}`);
            console.log(`   Error: ${error.message}`);
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
            toBeTruthy() {
                if (!value) {
                    throw new Error(`Expected truthy value, got ${value}`);
                }
            },
            toHaveProperty(property) {
                if (!value || !value.hasOwnProperty(property)) {
                    throw new Error(`Expected to have property "${property}"`);
                }
            }
        };
    }

    const parser = new FlowConditionParser();

    // === BASIC CONDITION PARSING ===
    console.log('=� Testing Basic Condition Parsing:');

    test('Parse simple equality condition', () => {
        const condition = parser.parseCondition('Status = \'Pending\'');
        expect(condition.leftValueReference).toBe('Status');
        expect(condition.operator).toBe('EqualTo');
        expect(condition.rightValue.stringValue).toBe('Pending');
    });

    test('Parse greater than condition', () => {
        const condition = parser.parseCondition('Amount > 10000');
        expect(condition.leftValueReference).toBe('Amount');
        expect(condition.operator).toBe('GreaterThan');
        expect(condition.rightValue.numberValue).toBe(10000);
    });

    test('Parse less than condition', () => {
        const condition = parser.parseCondition('Count < 5');
        expect(condition.operator).toBe('LessThan');
        expect(condition.rightValue.numberValue).toBe(5);
    });

    test('Parse contains condition', () => {
        const condition = parser.parseCondition('Name contains \'Smith\'');
        expect(condition.operator).toBe('Contains');
        expect(condition.rightValue.stringValue).toBe('Smith');
    });

    // === OPERATOR VARIATIONS ===
    console.log('\n=� Testing Operator Variations:');

    test('Parse "equals" operator', () => {
        const condition = parser.parseCondition('Type equals \'Lead\'');
        expect(condition.operator).toBe('EqualTo');
    });

    test('Parse "is" operator', () => {
        const condition = parser.parseCondition('Active is true');
        expect(condition.operator).toBe('EqualTo');
    });

    test('Parse ">=" operator', () => {
        const condition = parser.parseCondition('Amount >= 5000');
        expect(condition.operator).toBe('GreaterThanOrEqualTo');
    });

    // === VALUE TYPE DETECTION ===
    console.log('\n=� Testing Value Type Detection:');

    test('Detect number value', () => {
        const value = parser.parseValue('10000');
        expect(value.type).toBe('number');
        expect(value.value).toBe(10000);
    });

    test('Detect string value (single quotes)', () => {
        const value = parser.parseValue("'Pending'");
        expect(value.type).toBe('string');
        expect(value.value).toBe('Pending');
    });

    test('Detect boolean value (true)', () => {
        const value = parser.parseValue('true');
        expect(value.type).toBe('boolean');
        expect(value.value).toBe(true);
    });

    test('Detect field reference', () => {
        const value = parser.parseValue('AccountName');
        expect(value.type).toBe('reference');
        expect(value.value).toBe('AccountName');
    });

    //=== MULTIPLE CONDITIONS ===
    console.log('\n=� Testing Multiple Conditions:');

    test('Parse AND conditions', () => {
        const result = parser.parseMultipleConditions('Status = \'Pending\' and Amount > 5000');
        expect(result.logic).toBe('and');
        expect(result.conditions.length).toBe(2);
    });

    test('Parse OR conditions', () => {
        const result = parser.parseMultipleConditions('Type = \'Urgent\' or Amount > 50000');
        expect(result.logic).toBe('or');
        expect(result.conditions.length).toBe(2);
    });

    test('Parse single condition as multiple', () => {
        const result = parser.parseMultipleConditions('Amount > 10000');
        expect(result.logic).toBe('and');
        expect(result.conditions.length).toBe(1);
    });

    // Print summary
    console.log(`\n${'='.repeat(80)}`);
    console.log(`=� Test Summary`);
    console.log(`${'='.repeat(80)}`);
    console.log(`  Total: ${passed + failed}`);
    console.log(`   Passed: ${passed} (${((passed / (passed + failed)) * 100).toFixed(1)}%)`);
    console.log(`  L Failed: ${failed} (${((failed / (passed + failed)) * 100).toFixed(1)}%)`);
    console.log(`${'='.repeat(80)}\n`);

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
  describe('Flow Condition Parser', () => {
    it('should pass all tests', async () => {
      expect(typeof runTests).toBe('function');
      const result = await runTests();
      expect(result).not.toBe(false);
    });
  });
}
