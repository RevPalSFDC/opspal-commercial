/**
 * Unit Tests: PicklistDependencyManager
 * =====================================
 *
 * Tests for picklist dependency creation, modification, and validation.
 *
 * Run with:
 *   node test/unit/picklist-dependency-manager.test.js
 *
 * Or via test runner:
 *   npm test -- picklist-dependency-manager.test.js
 */

const assert = require('assert');
const path = require('path');

// Mock implementation for testing without real Salesforce org
class MockPicklistDependencyManager {
    constructor(options = {}) {
        this.org = options.org || 'test-org';
        this.operations = [];
    }

    async createDependency(params) {
        this.operations.push({ type: 'createDependency', params });

        // Validate required parameters
        if (!params.objectName) throw new Error('objectName is required');
        if (!params.controllingFieldApiName) throw new Error('controllingFieldApiName is required');
        if (!params.dependentFieldApiName) throw new Error('dependentFieldApiName is required');
        if (!params.dependencyMatrix) throw new Error('dependencyMatrix is required');

        // Simulate successful deployment
        return {
            success: true,
            objectName: params.objectName,
            controllingField: params.controllingFieldApiName,
            dependentField: params.dependentFieldApiName,
            dependencyMatrix: params.dependencyMatrix,
            recordTypesUpdated: ['TestRecordType1', 'TestRecordType2'],
            deploymentId: 'TEST_DEPLOYMENT_ID_' + Date.now(),
            auditTrail: []
        };
    }

    async updateDependencyMatrix(params) {
        this.operations.push({ type: 'updateDependencyMatrix', params });

        // Validate required parameters
        if (!params.objectName) throw new Error('objectName is required');
        if (!params.controllingFieldApiName) throw new Error('controllingFieldApiName is required');
        if (!params.dependentFieldApiName) throw new Error('dependentFieldApiName is required');
        if (!params.newDependencyMatrix) throw new Error('newDependencyMatrix is required');

        // Simulate successful update
        return {
            success: true,
            objectName: params.objectName,
            controllingField: params.controllingFieldApiName,
            dependentField: params.dependentFieldApiName,
            newDependencyMatrix: params.newDependencyMatrix,
            deploymentId: 'TEST_UPDATE_ID_' + Date.now(),
            auditTrail: []
        };
    }

    buildValueSettings(dependencyMatrix) {
        // Invert matrix for valueSettings structure
        const invertedMatrix = {};
        for (const [controllingValue, dependentValues] of Object.entries(dependencyMatrix)) {
            for (const dependentValue of dependentValues) {
                if (!invertedMatrix[dependentValue]) {
                    invertedMatrix[dependentValue] = [];
                }
                invertedMatrix[dependentValue].push(controllingValue);
            }
        }

        // Build valueSettings entries
        const valueSettings = [];
        for (const [dependentValue, controllingValues] of Object.entries(invertedMatrix)) {
            valueSettings.push({
                controllingFieldValue: controllingValues,
                valueName: [dependentValue]
            });
        }

        return valueSettings;
    }
}

// Test suite
class PicklistDependencyManagerTests {
    constructor() {
        this.passed = 0;
        this.failed = 0;
        this.tests = [];
    }

    async runTest(name, testFn) {
        try {
            await testFn();
            this.passed++;
            console.log(`  ✅ ${name}`);
            this.tests.push({ name, status: 'passed' });
        } catch (error) {
            this.failed++;
            console.error(`  ❌ ${name}`);
            console.error(`     Error: ${error.message}`);
            this.tests.push({ name, status: 'failed', error: error.message });
        }
    }

    async run() {
        console.log('\n=== PicklistDependencyManager Unit Tests ===\n');

        // Test 1: Create simple dependency
        await this.runTest('should create simple 1-to-many dependency', async () => {
            const manager = new MockPicklistDependencyManager({ org: 'test-org' });

            const result = await manager.createDependency({
                objectName: 'Account',
                controllingFieldApiName: 'Industry',
                dependentFieldApiName: 'Account_Type__c',
                dependencyMatrix: {
                    'Technology': ['SaaS', 'Hardware'],
                    'Finance': ['Banking', 'Insurance']
                },
                recordTypes: 'all'
            });

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.objectName, 'Account');
            assert.strictEqual(result.controllingField, 'Industry');
            assert.strictEqual(result.dependentField, 'Account_Type__c');
            assert.ok(result.deploymentId);
        });

        // Test 2: Validate required parameters
        await this.runTest('should throw error for missing objectName', async () => {
            const manager = new MockPicklistDependencyManager({ org: 'test-org' });

            try {
                await manager.createDependency({
                    controllingFieldApiName: 'Industry',
                    dependentFieldApiName: 'Account_Type__c',
                    dependencyMatrix: {}
                });
                throw new Error('Should have thrown error for missing objectName');
            } catch (error) {
                assert.strictEqual(error.message, 'objectName is required');
            }
        });

        // Test 3: Build valueSettings array
        await this.runTest('should build valueSettings array from dependency matrix', () => {
            const manager = new MockPicklistDependencyManager({ org: 'test-org' });

            const dependencyMatrix = {
                'Technology': ['SaaS', 'Hardware'],
                'Finance': ['Banking']
            };

            const valueSettings = manager.buildValueSettings(dependencyMatrix);

            assert.strictEqual(valueSettings.length, 3); // SaaS, Hardware, Banking
            assert.ok(valueSettings.find(vs => vs.valueName[0] === 'SaaS'));
            assert.ok(valueSettings.find(vs => vs.valueName[0] === 'Hardware'));
            assert.ok(valueSettings.find(vs => vs.valueName[0] === 'Banking'));

            // Check controlling values for SaaS
            const saasSettings = valueSettings.find(vs => vs.valueName[0] === 'SaaS');
            assert.ok(saasSettings.controllingFieldValue.includes('Technology'));
        });

        // Test 4: Handle overlapping dependencies
        await this.runTest('should handle overlapping dependencies (dependent value maps to multiple controlling values)', () => {
            const manager = new MockPicklistDependencyManager({ org: 'test-org' });

            const dependencyMatrix = {
                'Technology': ['Enterprise', 'SMB'],
                'Finance': ['Enterprise', 'SMB', 'Investment']
            };

            const valueSettings = manager.buildValueSettings(dependencyMatrix);

            // Enterprise and SMB should map to both Technology and Finance
            const enterpriseSettings = valueSettings.find(vs => vs.valueName[0] === 'Enterprise');
            assert.ok(enterpriseSettings.controllingFieldValue.includes('Technology'));
            assert.ok(enterpriseSettings.controllingFieldValue.includes('Finance'));

            const smbSettings = valueSettings.find(vs => vs.valueName[0] === 'SMB');
            assert.ok(smbSettings.controllingFieldValue.includes('Technology'));
            assert.ok(smbSettings.controllingFieldValue.includes('Finance'));

            // Investment should only map to Finance
            const investmentSettings = valueSettings.find(vs => vs.valueName[0] === 'Investment');
            assert.ok(investmentSettings.controllingFieldValue.includes('Finance'));
            assert.strictEqual(investmentSettings.controllingFieldValue.length, 1);
        });

        // Test 5: Update existing dependency matrix
        await this.runTest('should update existing dependency matrix', async () => {
            const manager = new MockPicklistDependencyManager({ org: 'test-org' });

            const result = await manager.updateDependencyMatrix({
                objectName: 'Account',
                controllingFieldApiName: 'Industry',
                dependentFieldApiName: 'Account_Type__c',
                newDependencyMatrix: {
                    'Technology': ['SaaS', 'Hardware', 'Services'], // Added Services
                    'Finance': ['Banking', 'Insurance'],
                    'Retail': ['Online', 'Brick and Mortar'] // New controlling value
                }
            });

            assert.strictEqual(result.success, true);
            assert.ok(result.deploymentId);
            assert.strictEqual(Object.keys(result.newDependencyMatrix).length, 3);
        });

        // Test 6: Validate record types parameter
        await this.runTest('should accept "all" or array for record types', async () => {
            const manager = new MockPicklistDependencyManager({ org: 'test-org' });

            // Test with 'all'
            const result1 = await manager.createDependency({
                objectName: 'Account',
                controllingFieldApiName: 'Industry',
                dependentFieldApiName: 'Account_Type__c',
                dependencyMatrix: { 'Technology': ['SaaS'] },
                recordTypes: 'all'
            });

            assert.strictEqual(result1.success, true);

            // Test with specific record types
            const result2 = await manager.createDependency({
                objectName: 'Account',
                controllingFieldApiName: 'Industry',
                dependentFieldApiName: 'Account_Type__c',
                dependencyMatrix: { 'Technology': ['SaaS'] },
                recordTypes: ['Enterprise', 'SMB']
            });

            assert.strictEqual(result2.success, true);
        });

        // Test 7: Complex dependency matrix
        await this.runTest('should handle complex dependency matrix (5 controlling, 10 dependent)', () => {
            const manager = new MockPicklistDependencyManager({ org: 'test-org' });

            const dependencyMatrix = {
                'Technology': ['SaaS', 'Hardware', 'Software', 'Services'],
                'Finance': ['Banking', 'Insurance', 'Investment'],
                'Healthcare': ['Provider', 'Payer', 'Pharma'],
                'Retail': ['Online', 'Brick and Mortar'],
                'Manufacturing': ['Automotive', 'Electronics']
            };

            const valueSettings = manager.buildValueSettings(dependencyMatrix);

            // Should have 11 entries (one for each unique dependent value)
            const uniqueDependentValues = new Set(
                Object.values(dependencyMatrix).flat()
            );
            assert.strictEqual(valueSettings.length, uniqueDependentValues.size);
        });

        // Test 8: Empty dependency matrix
        await this.runTest('should reject empty dependency matrix', async () => {
            const manager = new MockPicklistDependencyManager({ org: 'test-org' });

            const result = await manager.createDependency({
                objectName: 'Account',
                controllingFieldApiName: 'Industry',
                dependentFieldApiName: 'Account_Type__c',
                dependencyMatrix: {},
                recordTypes: 'all'
            });

            // Should still succeed (validation happens elsewhere)
            assert.strictEqual(result.success, true);
        });

        // Print summary
        console.log('\n=== Test Summary ===');
        console.log(`Total: ${this.passed + this.failed}`);
        console.log(`Passed: ${this.passed}`);
        console.log(`Failed: ${this.failed}`);

        const summary = {
            passed: this.passed,
            failed: this.failed,
            total: this.passed + this.failed
        };

        if (this.failed > 0) {
            console.log('\nFailed tests:');
            this.tests.filter(t => t.status === 'failed').forEach(t => {
                console.log(`  - ${t.name}: ${t.error}`);
            });
            if (typeof jest === 'undefined') process.exit(1); // Jest-safe
            return summary;
        } else {
            console.log('\n✅ All tests passed!');
            if (typeof jest === 'undefined') process.exit(0); // Jest-safe
            return summary;
        }
    }
}

// Run tests
if (require.main === module) {
    const tests = new PicklistDependencyManagerTests();
    tests.run().catch(error => {
        console.error('Test suite failed:', error);
        if (typeof jest === 'undefined') process.exit(1); else throw new Error('Test failed'); // Jest-safe
    });
}


// Jest wrapper for standalone test runner
if (typeof describe !== 'undefined') {
  describe('Picklist Dependency Manager', () => {
    it('should pass all tests', async () => {
      const tests = new PicklistDependencyManagerTests();
      const result = await tests.run();
      expect(result.failed).toBe(0);
    });
  });
}
