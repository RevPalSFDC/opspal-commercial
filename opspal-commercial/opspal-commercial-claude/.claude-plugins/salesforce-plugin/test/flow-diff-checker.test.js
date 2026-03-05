/**
 * Unit tests for FlowDiffChecker
 * Tests flow comparison, diff detection, and risk scoring
 *
 * Run: node test/flow-diff-checker.test.js
 */

const FlowDiffChecker = require('../scripts/lib/flow-diff-checker');
const fs = require('fs').promises;
const path = require('path');

// Test directories
const testDir = path.join(__dirname, '../tmp/test-flows');
const fixtureDir = path.join(__dirname, 'fixtures/flows');

// Test runner
async function runTests() {
    console.log('🧪 Running FlowDiffChecker tests...\n');

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
            toBeGreaterThan(expected) {
                if (value <= expected) {
                    throw new Error(`Expected ${value} to be greater than ${expected}`);
                }
            },
            toBeTruthy() {
                if (!value) {
                    throw new Error(`Expected truthy value, got ${value}`);
                }
            }
        };
    }

    // Setup: Create test directory and test flows
    await fs.mkdir(testDir, { recursive: true });

    // Create base test flow
    const baseFlow = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <label>Test Flow</label>
    <processType>AutoLaunchedFlow</processType>
    <status>Draft</status>

    <decisions>
        <name>Decision_1</name>
        <label>Decision 1</label>
        <defaultConnector>
            <targetReference>Assignment_1</targetReference>
        </defaultConnector>
        <rules>
            <name>Rule_1</name>
            <conditionLogic>and</conditionLogic>
            <conditions>
                <leftValueReference>$Record.Status__c</leftValueReference>
                <operator>EqualTo</operator>
                <rightValue>
                    <stringValue>Active</stringValue>
                </rightValue>
            </conditions>
            <connector>
                <targetReference>Assignment_2</targetReference>
            </connector>
            <label>Rule 1</label>
        </rules>
    </decisions>

    <assignments>
        <name>Assignment_1</name>
        <label>Assignment 1</label>
        <assignmentItems>
            <assignToReference>varCounter</assignToReference>
            <operator>Assign</operator>
            <value>
                <numberValue>1.0</numberValue>
            </value>
        </assignmentItems>
    </assignments>

    <assignments>
        <name>Assignment_2</name>
        <label>Assignment 2</label>
        <assignmentItems>
            <assignToReference>varCounter</assignToReference>
            <operator>Add</operator>
            <value>
                <numberValue>1.0</numberValue>
            </value>
        </assignmentItems>
    </assignments>

    <variables>
        <name>varCounter</name>
        <dataType>Number</dataType>
        <isCollection>false</isCollection>
        <isInput>false</isInput>
        <isOutput>false</isOutput>
        <scale>0</scale>
        <value>
            <numberValue>0.0</numberValue>
        </value>
    </variables>
</Flow>`;

    const baseFlowPath = path.join(testDir, 'base-flow.flow-meta.xml');
    await fs.writeFile(baseFlowPath, baseFlow);

    // === NO CHANGES TESTS ===
    console.log('📦 Testing No Changes:');

    await test('Identical flows show no differences', async () => {
        const checker = new FlowDiffChecker({ verbose: false });
        const diff = await checker.compare(baseFlowPath, baseFlowPath);

        expect(diff.elementsAdded).toHaveLength(0);
        expect(diff.elementsRemoved).toHaveLength(0);
        expect(diff.elementsModified).toHaveLength(0);
        expect(diff.connectorsChanged).toHaveLength(0);
        expect(diff.summary.riskLevel).toBe('LOW');
    });

    // === ELEMENT ADDITION TESTS ===
    console.log('\n📦 Testing Element Addition:');

    await test('Detect added decision element', async () => {
        const modifiedFlow = baseFlow.replace('</Flow>', `
    <decisions>
        <name>Decision_2</name>
        <label>Decision 2</label>
        <defaultConnectorLabel>Default</defaultConnectorLabel>
    </decisions>
</Flow>`);

        const modifiedPath = path.join(testDir, 'flow-with-new-decision.flow-meta.xml');
        await fs.writeFile(modifiedPath, modifiedFlow);

        const checker = new FlowDiffChecker({ verbose: false });
        const diff = await checker.compare(baseFlowPath, modifiedPath);

        expect(diff.elementsAdded).toHaveLength(1);
        expect(diff.elementsAdded[0].name).toBe('Decision_2');
        expect(diff.elementsAdded[0].type).toBe('decisions');
        expect(diff.summary.riskLevel).toBe('LOW');

        await fs.unlink(modifiedPath);
    });

    await test('Detect added assignment element', async () => {
        const modifiedFlow = baseFlow.replace('</Flow>', `
    <assignments>
        <name>Assignment_3</name>
        <label>Assignment 3</label>
        <assignmentItems>
            <assignToReference>varCounter</assignToReference>
            <operator>Assign</operator>
            <value>
                <numberValue>5.0</numberValue>
            </value>
        </assignmentItems>
    </assignments>
</Flow>`);

        const modifiedPath = path.join(testDir, 'flow-with-new-assignment.flow-meta.xml');
        await fs.writeFile(modifiedPath, modifiedFlow);

        const checker = new FlowDiffChecker({ verbose: false });
        const diff = await checker.compare(baseFlowPath, modifiedPath);

        expect(diff.elementsAdded).toHaveLength(1);
        expect(diff.elementsAdded[0].type).toBe('assignments');

        await fs.unlink(modifiedPath);
    });

    // === ELEMENT REMOVAL TESTS ===
    console.log('\n📦 Testing Element Removal:');

    await test('Detect removed assignment element', async () => {
        const modifiedFlow = baseFlow
            .replace(/<assignments>[\s\S]*?<name>Assignment_1<\/name>[\s\S]*?<\/assignments>/, '')
            .trim();

        const modifiedPath = path.join(testDir, 'flow-without-assignment.flow-meta.xml');
        await fs.writeFile(modifiedPath, modifiedFlow);

        const checker = new FlowDiffChecker({ verbose: false });
        const diff = await checker.compare(baseFlowPath, modifiedPath);

        expect(diff.elementsRemoved).toHaveLength(1);
        expect(diff.elementsRemoved[0].name).toBe('Assignment_1');
        expect(diff.summary.riskLevel).toContain('HIGH'); // Removals are HIGH risk

        await fs.unlink(modifiedPath);
    });

    // === ELEMENT MODIFICATION TESTS ===
    console.log('\n📦 Testing Element Modification:');

    await test('Detect modified decision condition', async () => {
        const modifiedFlow = baseFlow.replace(
            '<stringValue>Active</stringValue>',
            '<stringValue>Inactive</stringValue>'
        );

        const modifiedPath = path.join(testDir, 'flow-modified-condition.flow-meta.xml');
        await fs.writeFile(modifiedPath, modifiedFlow);

        const checker = new FlowDiffChecker({ verbose: false });
        const diff = await checker.compare(baseFlowPath, modifiedPath);

        expect(diff.elementsModified).toHaveLength(1);
        expect(diff.elementsModified[0].name).toBe('Decision_1');
        expect(diff.summary.riskLevel).toBe('MEDIUM'); // Modifications are MEDIUM risk

        await fs.unlink(modifiedPath);
    });

    await test('Detect modified label', async () => {
        const modifiedFlow = baseFlow.replace(
            '<label>Test Flow</label>',
            '<label>Modified Test Flow</label>'
        );

        const modifiedPath = path.join(testDir, 'flow-modified-label.flow-meta.xml');
        await fs.writeFile(modifiedPath, modifiedFlow);

        const checker = new FlowDiffChecker({ verbose: false });
        const diff = await checker.compare(baseFlowPath, modifiedPath);

        expect(diff.metadataChanges.label).toBeTruthy();
        expect(diff.metadataChanges.label.before).toBe('Test Flow');
        expect(diff.metadataChanges.label.after).toBe('Modified Test Flow');

        await fs.unlink(modifiedPath);
    });

    // === CONNECTOR CHANGES TESTS ===
    console.log('\n📦 Testing Connector Changes:');

    await test('Detect changed connector', async () => {
        const modifiedFlow = baseFlow.replace(
            '<targetReference>Assignment_1</targetReference>',
            '<targetReference>Assignment_2</targetReference>'
        );

        const modifiedPath = path.join(testDir, 'flow-connector-changed.flow-meta.xml');
        await fs.writeFile(modifiedPath, modifiedFlow);

        const checker = new FlowDiffChecker({ verbose: false });
        const diff = await checker.compare(baseFlowPath, modifiedPath);

        expect(diff.connectorsChanged.length).toBeGreaterThan(0);
        expect(diff.summary.riskLevel).toContain('HIGH'); // Connector changes are HIGH risk

        await fs.unlink(modifiedPath);
    });

    // === RISK LEVEL TESTS ===
    console.log('\n📦 Testing Risk Level Calculation:');

    await test('LOW risk for adding elements only', async () => {
        const modifiedFlow = baseFlow.replace('</Flow>', `
    <decisions>
        <name>Decision_New</name>
        <label>New Decision</label>
    </decisions>
</Flow>`);

        const modifiedPath = path.join(testDir, 'flow-low-risk.flow-meta.xml');
        await fs.writeFile(modifiedPath, modifiedFlow);

        const checker = new FlowDiffChecker({ verbose: false });
        const diff = await checker.compare(baseFlowPath, modifiedPath);

        expect(diff.summary.riskLevel).toBe('LOW');

        await fs.unlink(modifiedPath);
    });

    await test('MEDIUM risk for modifying elements', async () => {
        const modifiedFlow = baseFlow.replace(
            '<numberValue>1.0</numberValue>',
            '<numberValue>2.0</numberValue>'
        );

        const modifiedPath = path.join(testDir, 'flow-medium-risk.flow-meta.xml');
        await fs.writeFile(modifiedPath, modifiedFlow);

        const checker = new FlowDiffChecker({ verbose: false });
        const diff = await checker.compare(baseFlowPath, modifiedPath);

        expect(diff.summary.riskLevel).toBe('MEDIUM');

        await fs.unlink(modifiedPath);
    });

    await test('HIGH risk for removing elements', async () => {
        const modifiedFlow = baseFlow
            .replace(/<decisions>[\s\S]*?<\/decisions>/, '');

        const modifiedPath = path.join(testDir, 'flow-high-risk.flow-meta.xml');
        await fs.writeFile(modifiedPath, modifiedFlow);

        const checker = new FlowDiffChecker({ verbose: false });
        const diff = await checker.compare(baseFlowPath, modifiedPath);

        expect(diff.summary.riskLevel).toContain('HIGH');

        await fs.unlink(modifiedPath);
    });

    await test('CRITICAL risk for metadata changes', async () => {
        const modifiedFlow = baseFlow.replace(
            '<processType>AutoLaunchedFlow</processType>',
            '<processType>Flow</processType>'
        );

        const modifiedPath = path.join(testDir, 'flow-critical-risk.flow-meta.xml');
        await fs.writeFile(modifiedPath, modifiedFlow);

        const checker = new FlowDiffChecker({ verbose: false });
        const diff = await checker.compare(baseFlowPath, modifiedPath);

        expect(diff.summary.riskLevel).toBe('CRITICAL');

        await fs.unlink(modifiedPath);
    });

    // === COMPLEX CHANGES TESTS ===
    console.log('\n📦 Testing Complex Changes:');

    await test('Multiple changes escalate risk appropriately', async () => {
        const modifiedFlow = baseFlow
            .replace(/<assignments>[\s\S]*?<name>Assignment_1<\/name>[\s\S]*?<\/assignments>/, '') // Remove
            .replace('<numberValue>1.0</numberValue>', '<numberValue>5.0</numberValue>') // Modify
            .replace('</Flow>', `
    <decisions>
        <name>Decision_New</name>
        <label>New Decision</label>
    </decisions>
</Flow>`); // Add

        const modifiedPath = path.join(testDir, 'flow-multiple-changes.flow-meta.xml');
        await fs.writeFile(modifiedPath, modifiedFlow);

        const checker = new FlowDiffChecker({ verbose: false });
        const diff = await checker.compare(baseFlowPath, modifiedPath);

        expect(diff.elementsAdded.length).toBeGreaterThan(0);
        expect(diff.elementsRemoved.length).toBeGreaterThan(0);
        expect(diff.elementsModified.length).toBeGreaterThan(0);
        expect(diff.summary.riskLevel).toContain('HIGH'); // Multiple changes = HIGH risk

        await fs.unlink(modifiedPath);
    });

    // === FORMAT OUTPUT TESTS ===
    console.log('\n📦 Testing Format Output:');

    await test('Format diff for display', async () => {
        const modifiedFlow = baseFlow.replace('</Flow>', `
    <decisions>
        <name>Decision_New</name>
        <label>New Decision</label>
    </decisions>
</Flow>`);

        const modifiedPath = path.join(testDir, 'flow-for-format.flow-meta.xml');
        await fs.writeFile(modifiedPath, modifiedFlow);

        const checker = new FlowDiffChecker({ verbose: false });
        const diff = await checker.compare(baseFlowPath, modifiedPath);
        const formatted = checker.format(diff);

        expect(formatted).toContain('Flow Modification Diff');
        expect(formatted).toContain('Risk Level: LOW');
        expect(formatted).toContain('Elements Added: 1');

        await fs.unlink(modifiedPath);
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
  describe('Flow Diff Checker', () => {
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
