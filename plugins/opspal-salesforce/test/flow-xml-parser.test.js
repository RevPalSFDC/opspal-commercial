/**
 * Unit tests for FlowXMLParser
 * Tests XML parsing, validation, and metadata extraction
 *
 * Run: node test/flow-xml-parser.test.js
 */

const FlowXMLParser = require('../scripts/lib/flow-xml-parser');
const fs = require('fs').promises;
const path = require('path');

// Test directories
const testDir = path.join(__dirname, '../tmp/test-parser');
const fixtureDir = path.join(__dirname, 'fixtures/flows');

// Test runner
async function runTests() {
    console.log('🧪 Running FlowXMLParser tests...\n');

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
            },
            toBeFalsy() {
                if (value) {
                    throw new Error(`Expected falsy value, got ${value}`);
                }
            }
        };
    }

    // Setup: Create test directory
    await fs.mkdir(testDir, { recursive: true });

    // === VALID FLOW TESTS ===
    console.log('📦 Testing Valid Flow Parsing:');

    await test('Parse valid flow successfully', async () => {
        const validFlow = `<?xml version="1.0" encoding="UTF-8"?>
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
    </decisions>
    <assignments>
        <name>Assignment_1</name>
        <label>Assignment 1</label>
    </assignments>
</Flow>`;

        const flowPath = path.join(testDir, 'valid-flow.flow-meta.xml');
        await fs.writeFile(flowPath, validFlow);

        const parser = new FlowXMLParser({ verbose: false });
        const result = await parser.validate(flowPath);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.elementCount).toBe(2);

        await fs.unlink(flowPath);
    });

    await test('Parse flow from test fixtures', async () => {
        const flowPath = path.join(fixtureDir, 'Test_Flow.flow-meta.xml');
        const parser = new FlowXMLParser({ verbose: false });
        const result = await parser.validate(flowPath);

        expect(result.valid).toBe(true);
        expect(result.elementCount).toBeGreaterThan(0);
    });

    // === VALIDATION ERROR TESTS ===
    console.log('\n📦 Testing Validation Errors:');

    await test('Detect missing required field: label', async () => {
        const invalidFlow = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <processType>AutoLaunchedFlow</processType>
    <status>Draft</status>
</Flow>`;

        const flowPath = path.join(testDir, 'no-label.flow-meta.xml');
        await fs.writeFile(flowPath, invalidFlow);

        const parser = new FlowXMLParser({ verbose: false });
        const result = await parser.validate(flowPath);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain('label');

        await fs.unlink(flowPath);
    });

    await test('Detect missing required field: processType', async () => {
        const invalidFlow = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <label>Test Flow</label>
    <status>Draft</status>
</Flow>`;

        const flowPath = path.join(testDir, 'no-process-type.flow-meta.xml');
        await fs.writeFile(flowPath, invalidFlow);

        const parser = new FlowXMLParser({ verbose: false });
        const result = await parser.validate(flowPath);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('processType');

        await fs.unlink(flowPath);
    });

    await test('Detect broken connector reference', async () => {
        const brokenFlow = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <label>Test Flow</label>
    <processType>AutoLaunchedFlow</processType>
    <status>Draft</status>
    <decisions>
        <name>Decision_1</name>
        <label>Decision 1</label>
        <defaultConnector>
            <targetReference>NonExistent_Element</targetReference>
        </defaultConnector>
    </decisions>
</Flow>`;

        const flowPath = path.join(testDir, 'broken-connector.flow-meta.xml');
        await fs.writeFile(flowPath, brokenFlow);

        const parser = new FlowXMLParser({ verbose: false });
        const result = await parser.validate(flowPath);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('NonExistent_Element');

        await fs.unlink(flowPath);
    });

    await test('Detect element missing name property', async () => {
        const noNameFlow = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <label>Test Flow</label>
    <processType>AutoLaunchedFlow</processType>
    <status>Draft</status>
    <assignments>
        <label>Assignment Without Name</label>
    </assignments>
</Flow>`;

        const flowPath = path.join(testDir, 'no-element-name.flow-meta.xml');
        await fs.writeFile(flowPath, noNameFlow);

        const parser = new FlowXMLParser({ verbose: false });
        const result = await parser.validate(flowPath);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('missing name property');

        await fs.unlink(flowPath);
    });

    // === VALIDATION WARNING TESTS ===
    console.log('\n📦 Testing Validation Warnings:');

    await test('Detect missing optional field: status', async () => {
        const noStatusFlow = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <label>Test Flow</label>
    <processType>AutoLaunchedFlow</processType>
</Flow>`;

        const flowPath = path.join(testDir, 'no-status.flow-meta.xml');
        await fs.writeFile(flowPath, noStatusFlow);

        const parser = new FlowXMLParser({ verbose: false });
        const result = await parser.validate(flowPath);

        expect(result.valid).toBe(true); // Still valid, just warning
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0]).toContain('status');

        await fs.unlink(flowPath);
    });

    await test('Detect invalid process type', async () => {
        const invalidTypeFlow = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <label>Test Flow</label>
    <processType>InvalidType</processType>
    <status>Draft</status>
</Flow>`;

        const flowPath = path.join(testDir, 'invalid-type.flow-meta.xml');
        await fs.writeFile(flowPath, invalidTypeFlow);

        const parser = new FlowXMLParser({ verbose: false });
        const result = await parser.validate(flowPath);

        expect(result.valid).toBe(true); // Still valid, just warning
        expect(result.warnings.length).toBeGreaterThan(0);

        await fs.unlink(flowPath);
    });

    // === COMPLEX VALIDATION TESTS ===
    console.log('\n📦 Testing Complex Validation:');

    await test('Validate decision rules connectors', async () => {
        const rulesFlow = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <label>Test Flow</label>
    <processType>AutoLaunchedFlow</processType>
    <status>Draft</status>
    <decisions>
        <name>Decision_1</name>
        <label>Decision 1</label>
        <rules>
            <name>Rule_1</name>
            <connector>
                <targetReference>Assignment_1</targetReference>
            </connector>
        </rules>
        <defaultConnector>
            <targetReference>Assignment_2</targetReference>
        </defaultConnector>
    </decisions>
    <assignments>
        <name>Assignment_1</name>
        <label>Assignment 1</label>
    </assignments>
    <assignments>
        <name>Assignment_2</name>
        <label>Assignment 2</label>
    </assignments>
</Flow>`;

        const flowPath = path.join(testDir, 'rules-flow.flow-meta.xml');
        await fs.writeFile(flowPath, rulesFlow);

        const parser = new FlowXMLParser({ verbose: false });
        const result = await parser.validate(flowPath);

        expect(result.valid).toBe(true);
        expect(result.elementCount).toBe(3);

        await fs.unlink(flowPath);
    });

    await test('Detect broken rule connector', async () => {
        const brokenRuleFlow = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <label>Test Flow</label>
    <processType>AutoLaunchedFlow</processType>
    <status>Draft</status>
    <decisions>
        <name>Decision_1</name>
        <label>Decision 1</label>
        <rules>
            <name>Rule_1</name>
            <connector>
                <targetReference>NonExistent_Assignment</targetReference>
            </connector>
        </rules>
    </decisions>
</Flow>`;

        const flowPath = path.join(testDir, 'broken-rule.flow-meta.xml');
        await fs.writeFile(flowPath, brokenRuleFlow);

        const parser = new FlowXMLParser({ verbose: false });
        const result = await parser.validate(flowPath);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain('NonExistent_Assignment');

        await fs.unlink(flowPath);
    });

    await test('Validate start element connector', async () => {
        const startFlow = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <label>Test Flow</label>
    <processType>AutoLaunchedFlow</processType>
    <status>Draft</status>
    <start>
        <connector>
            <targetReference>Assignment_1</targetReference>
        </connector>
    </start>
    <assignments>
        <name>Assignment_1</name>
        <label>Assignment 1</label>
    </assignments>
</Flow>`;

        const flowPath = path.join(testDir, 'start-flow.flow-meta.xml');
        await fs.writeFile(flowPath, startFlow);

        const parser = new FlowXMLParser({ verbose: false });
        const result = await parser.validate(flowPath);

        expect(result.valid).toBe(true);

        await fs.unlink(flowPath);
    });

    await test('Detect broken start connector', async () => {
        const brokenStartFlow = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <label>Test Flow</label>
    <processType>AutoLaunchedFlow</processType>
    <status>Draft</status>
    <start>
        <connector>
            <targetReference>NonExistent_Element</targetReference>
        </connector>
    </start>
</Flow>`;

        const flowPath = path.join(testDir, 'broken-start.flow-meta.xml');
        await fs.writeFile(flowPath, brokenStartFlow);

        const parser = new FlowXMLParser({ verbose: false });
        const result = await parser.validate(flowPath);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('Start connector');

        await fs.unlink(flowPath);
    });

    // === PARSE METHOD TESTS ===
    console.log('\n📦 Testing Parse Method:');

    await test('Parse flow with parse() method', async () => {
        const flowPath = path.join(fixtureDir, 'Test_Flow.flow-meta.xml');
        const parser = new FlowXMLParser({ verbose: false });
        const flow = await parser.parse(flowPath);

        expect(flow.label).toBeTruthy();
        expect(flow.getAllElements).toBeTruthy();
        // Test_Flow has 2 decisions + 2 assignments + 1 actionCall = 5 elements
        expect(flow.getAllElements()).toHaveLength(5);
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
  describe('Flow Xml Parser', () => {
    it('should pass all tests', async () => {
      expect(typeof runTests).toBe('function');
      const result = await runTests();
      expect(result).not.toBe(false);
    });
  });
}
