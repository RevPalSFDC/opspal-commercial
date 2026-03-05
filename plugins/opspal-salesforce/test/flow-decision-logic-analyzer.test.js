/**
 * Test Suite for Flow Decision Logic Analyzer
 *
 * Tests:
 * 1. Contradiction detection (Amount >= 10000 AND Amount < 5000)
 * 2. Unreachable branch detection
 * 3. Field usage order validation
 * 4. Infinite loop detection
 * 5. Dead-end path detection
 *
 * @version 1.0.0
 * @created 2025-10-26
 */

const fs = require('fs');
const path = require('path');
const FlowDecisionLogicAnalyzer = require('../scripts/lib/flow-decision-logic-analyzer');

// Mock flow XML for testing
const createMockFlowXml = (flowDefinition) => {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    ${flowDefinition}
</Flow>`;
};

// Test 1: Contradictory Conditions
async function testContradictoryConditions() {
    console.log('\n🧪 Test 1: Contradictory Conditions Detection');

    const flowXml = createMockFlowXml(`
        <start>
            <connector>
                <targetReference>Decision_1</targetReference>
            </connector>
        </start>
        <decisions>
            <name>Decision_1</name>
            <label>Check Amount High</label>
            <rules>
                <name>Amount_High</name>
                <label>Amount >= 10000</label>
                <conditions>
                    <leftValueReference>Amount</leftValueReference>
                    <operator>GreaterThanOrEqualTo</operator>
                    <rightValue>
                        <numberValue>10000</numberValue>
                    </rightValue>
                </conditions>
                <connector>
                    <targetReference>Decision_2</targetReference>
                </connector>
            </rules>
            <defaultConnector>
                <targetReference>End</targetReference>
            </defaultConnector>
        </decisions>
        <decisions>
            <name>Decision_2</name>
            <label>Check Amount Low</label>
            <rules>
                <name>Amount_Low</name>
                <label>Amount &lt; 5000</label>
                <conditions>
                    <leftValueReference>Amount</leftValueReference>
                    <operator>LessThan</operator>
                    <rightValue>
                        <numberValue>5000</numberValue>
                    </rightValue>
                </conditions>
                <connector>
                    <targetReference>End</targetReference>
                </connector>
            </rules>
            <defaultConnector>
                <targetReference>End</targetReference>
            </defaultConnector>
        </decisions>
    `);

    // Write to temp file
    const tempFile = path.join('/tmp', 'test-contradictory.flow-meta.xml');
    fs.writeFileSync(tempFile, flowXml);

    const analyzer = new FlowDecisionLogicAnalyzer('test-org');
    const result = await analyzer.analyze(tempFile);

    // Verify contradiction was detected
    const contradictionErrors = result.errors.filter(e => e.type === 'CONTRADICTORY_CONDITIONS');

    if (contradictionErrors.length > 0) {
        console.log('✅ PASS: Contradiction detected');
        console.log(`   Found: ${contradictionErrors[0].message}`);
        return true;
    } else {
        console.log('❌ FAIL: Contradiction not detected');
        return false;
    }
}

// Test 2: Unreachable Branch
async function testUnreachableBranch() {
    console.log('\n🧪 Test 2: Unreachable Branch Detection');

    const flowXml = createMockFlowXml(`
        <start>
            <connector>
                <targetReference>Decision_1</targetReference>
            </connector>
        </start>
        <decisions>
            <name>Decision_1</name>
            <label>Main Decision</label>
            <rules>
                <name>Rule_1</name>
                <label>Rule 1</label>
                <conditions>
                    <leftValueReference>Status</leftValueReference>
                    <operator>EqualTo</operator>
                    <rightValue>
                        <stringValue>Active</stringValue>
                    </rightValue>
                </conditions>
                <connector>
                    <targetReference>End</targetReference>
                </connector>
            </rules>
            <defaultConnector>
                <targetReference>End</targetReference>
            </defaultConnector>
        </decisions>
        <decisions>
            <name>OrphanDecision</name>
            <label>Unreachable Decision</label>
            <rules>
                <name>Orphan_Rule</name>
                <label>Orphan Rule</label>
                <connector>
                    <targetReference>End</targetReference>
                </connector>
            </rules>
        </decisions>
    `);

    const tempFile = path.join('/tmp', 'test-unreachable.flow-meta.xml');
    fs.writeFileSync(tempFile, flowXml);

    const analyzer = new FlowDecisionLogicAnalyzer('test-org');
    const result = await analyzer.analyze(tempFile);

    const unreachableWarnings = result.warnings.filter(w => w.type === 'UNREACHABLE_BRANCH');

    if (unreachableWarnings.length > 0) {
        console.log('✅ PASS: Unreachable branch detected');
        console.log(`   Found: ${unreachableWarnings[0].message}`);
        return true;
    } else {
        console.log('❌ FAIL: Unreachable branch not detected');
        return false;
    }
}

// Test 3: Infinite Loop Detection
async function testInfiniteLoop() {
    console.log('\n🧪 Test 3: Infinite Loop Detection');

    const flowXml = createMockFlowXml(`
        <start>
            <connector>
                <targetReference>Decision_1</targetReference>
            </connector>
        </start>
        <decisions>
            <name>Decision_1</name>
            <label>Loop Decision</label>
            <rules>
                <name>Loop_Back</name>
                <label>Loop Back</label>
                <conditions>
                    <leftValueReference>Counter</leftValueReference>
                    <operator>LessThan</operator>
                    <rightValue>
                        <numberValue>100</numberValue>
                    </rightValue>
                </conditions>
                <connector>
                    <targetReference>Assignment_1</targetReference>
                </connector>
            </rules>
            <defaultConnector>
                <targetReference>End</targetReference>
            </defaultConnector>
        </decisions>
        <assignments>
            <name>Assignment_1</name>
            <label>Increment Counter</label>
            <assignmentItems>
                <assignToReference>Counter</assignToReference>
                <operator>Add</operator>
                <value>
                    <numberValue>1</numberValue>
                </value>
            </assignmentItems>
            <connector>
                <targetReference>Decision_1</targetReference>
            </connector>
        </assignments>
    `);

    const tempFile = path.join('/tmp', 'test-loop.flow-meta.xml');
    fs.writeFileSync(tempFile, flowXml);

    const analyzer = new FlowDecisionLogicAnalyzer('test-org');
    const result = await analyzer.analyze(tempFile);

    const loopErrors = result.errors.filter(e => e.type === 'INFINITE_LOOP');

    if (loopErrors.length > 0) {
        console.log('✅ PASS: Infinite loop detected');
        console.log(`   Found: ${loopErrors[0].message}`);
        return true;
    } else {
        console.log('❌ FAIL: Infinite loop not detected');
        return false;
    }
}

// Test 4: Valid Flow (No Errors)
async function testValidFlow() {
    console.log('\n🧪 Test 4: Valid Flow (Should Pass)');

    const flowXml = createMockFlowXml(`
        <start>
            <connector>
                <targetReference>Get_Record</targetReference>
            </connector>
        </start>
        <recordLookups>
            <name>Get_Record</name>
            <label>Get Account Record</label>
            <object>Account</object>
            <outputReference>Account_Record</outputReference>
            <connector>
                <targetReference>Decision_1</targetReference>
            </connector>
        </recordLookups>
        <decisions>
            <name>Decision_1</name>
            <label>Check Amount</label>
            <rules>
                <name>Amount_High</name>
                <label>Amount > 10000</label>
                <conditions>
                    <leftValueReference>Account_Record.AnnualRevenue</leftValueReference>
                    <operator>GreaterThan</operator>
                    <rightValue>
                        <numberValue>10000</numberValue>
                    </rightValue>
                </conditions>
                <connector>
                    <targetReference>End</targetReference>
                </connector>
            </rules>
            <defaultConnector>
                <targetReference>End</targetReference>
            </defaultConnector>
        </decisions>
    `);

    const tempFile = path.join('/tmp', 'test-valid.flow-meta.xml');
    fs.writeFileSync(tempFile, flowXml);

    const analyzer = new FlowDecisionLogicAnalyzer('test-org');
    const result = await analyzer.analyze(tempFile);

    if (result.valid && result.errors.length === 0) {
        console.log('✅ PASS: Valid flow passed validation');
        return true;
    } else {
        console.log('❌ FAIL: Valid flow incorrectly flagged as invalid');
        console.log(`   Errors: ${result.errors.length}`);
        return false;
    }
}

// Test 5: Dead End Path Detection
async function testDeadEndPath() {
    console.log('\n🧪 Test 5: Dead End Path Detection');

    const flowXml = createMockFlowXml(`
        <start>
            <connector>
                <targetReference>Decision_1</targetReference>
            </connector>
        </start>
        <decisions>
            <name>Decision_1</name>
            <label>Main Decision</label>
            <rules>
                <name>Rule_1</name>
                <label>Rule 1</label>
                <conditions>
                    <leftValueReference>Status</leftValueReference>
                    <operator>EqualTo</operator>
                    <rightValue>
                        <stringValue>Active</stringValue>
                    </rightValue>
                </conditions>
                <connector>
                    <targetReference>Assignment_DeadEnd</targetReference>
                </connector>
            </rules>
            <defaultConnector>
                <targetReference>End</targetReference>
            </defaultConnector>
        </decisions>
        <assignments>
            <name>Assignment_DeadEnd</name>
            <label>Dead End Assignment</label>
            <assignmentItems>
                <assignToReference>SomeVar</assignToReference>
                <operator>Assign</operator>
                <value>
                    <stringValue>Value</stringValue>
                </value>
            </assignmentItems>
        </assignments>
    `);

    const tempFile = path.join('/tmp', 'test-deadend.flow-meta.xml');
    fs.writeFileSync(tempFile, flowXml);

    const analyzer = new FlowDecisionLogicAnalyzer('test-org');
    const result = await analyzer.analyze(tempFile);

    const deadEndWarnings = result.warnings.filter(w => w.type === 'DEAD_END_PATH');

    if (deadEndWarnings.length > 0) {
        console.log('✅ PASS: Dead end path detected');
        console.log(`   Found: ${deadEndWarnings[0].message}`);
        return true;
    } else {
        console.log('❌ FAIL: Dead end path not detected');
        return false;
    }
}

// Run all tests
async function runAllTests() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  Flow Decision Logic Analyzer - Test Suite      ║');
    console.log('╚══════════════════════════════════════════════════╝');

    const tests = [
        testContradictoryConditions,
        testUnreachableBranch,
        testInfiniteLoop,
        testValidFlow,
        testDeadEndPath
    ];

    const results = [];

    for (const test of tests) {
        try {
            const passed = await test();
            results.push(passed);
        } catch (error) {
            console.log(`❌ FAIL: ${error.message}`);
            results.push(false);
        }
    }

    // Summary
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║  Test Summary                                    ║');
    console.log('╚══════════════════════════════════════════════════╝');

    const passed = results.filter(r => r).length;
    const total = results.length;

    console.log(`\n  Passed: ${passed}/${total}`);
    console.log(`  Failed: ${total - passed}/${total}`);

    if (passed === total) {
        console.log('\n  ✅ All tests passed!\n');
        if (typeof jest === 'undefined') process.exit(0); // Jest-safe
    } else {
        console.log('\n  ❌ Some tests failed\n');
        if (typeof jest === 'undefined') process.exit(1); else throw new Error('Test failed'); // Jest-safe
    }
}

// Run if called directly
if (require.main === module) {
    runAllTests();
}

module.exports = { runAllTests };


// Jest wrapper for standalone test runner
if (typeof describe !== 'undefined') {
  describe('Flow Decision Logic Analyzer', () => {
    it('should pass all tests', async () => {
      expect(typeof runAllTests).toBe('function');
      await runAllTests();
    });
  });
}
