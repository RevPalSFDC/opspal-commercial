/**
 * Unit Tests: PicklistDependencyValidator
 * ========================================
 *
 * Tests for comprehensive dependency validation before and after deployment.
 *
 * Run with:
 *   node test/unit/picklist-dependency-validator.test.js
 */

const assert = require('assert');

// Mock implementation for testing
class MockPicklistDependencyValidator {
    constructor(options = {}) {
        this.org = options.org || 'test-org';
        this.mockFields = new Map();
        this.mockRecordTypes = new Map();
    }

    // Helper to set up mock data
    setMockFields(objectName, fields) {
        this.mockFields.set(objectName, fields);
    }

    setMockRecordTypes(objectName, recordTypes) {
        this.mockRecordTypes.set(objectName, recordTypes);
    }

    async validateBeforeDeployment(params) {
        // Validate required parameters
        if (!params.objectName) throw new Error('objectName is required');
        if (!params.controllingFieldApiName) throw new Error('controllingFieldApiName is required');
        if (!params.dependentFieldApiName) throw new Error('dependentFieldApiName is required');
        if (!params.dependencyMatrix) throw new Error('dependencyMatrix is required');

        const errors = [];
        const warnings = [];
        const checks = {};

        // Check 1: Fields exist
        checks.fieldsExist = this.mockValidateFieldsExist(params.objectName, params.controllingFieldApiName, params.dependentFieldApiName, errors);

        // Check 2: Field types compatible
        checks.fieldTypes = this.mockValidateFieldTypes(params.objectName, params.controllingFieldApiName, params.dependentFieldApiName, errors);

        // Check 3: Controlling values exist
        checks.controllingValues = this.mockValidateControllingValues(params.objectName, params.controllingFieldApiName, params.dependencyMatrix, errors);

        // Check 4: Dependent values exist
        checks.dependentValues = this.mockValidateDependentValues(params.objectName, params.dependentFieldApiName, params.dependencyMatrix, errors);

        // Check 5: Dependency matrix completeness
        checks.matrix = this.validateDependencyMatrix(params.dependencyMatrix, errors, warnings);

        // Check 6: Circular dependencies
        checks.circularDependency = this.mockCheckCircularDependency(params.objectName, params.controllingFieldApiName, params.dependentFieldApiName, errors);

        return {
            canProceed: errors.length === 0,
            valid: errors.length === 0,
            errors,
            warnings,
            checks
        };
    }

    mockValidateFieldsExist(objectName, controllingField, dependentField, errors) {
        const fields = this.mockFields.get(objectName) || [];
        const fieldNames = new Set(fields.map(f => f.name));

        if (!fieldNames.has(controllingField)) {
            errors.push(`Controlling field '${controllingField}' not found on ${objectName}`);
        }
        if (!fieldNames.has(dependentField)) {
            errors.push(`Dependent field '${dependentField}' not found on ${objectName}`);
        }

        return { valid: errors.length === 0 };
    }

    mockValidateFieldTypes(objectName, controllingField, dependentField, errors) {
        const fields = this.mockFields.get(objectName) || [];
        const controllingFieldObj = fields.find(f => f.name === controllingField);
        const dependentFieldObj = fields.find(f => f.name === dependentField);

        const validTypes = ['picklist', 'multipicklist'];

        if (controllingFieldObj && !validTypes.includes(controllingFieldObj.type)) {
            errors.push(`Controlling field '${controllingField}' must be picklist or multipicklist type (found: ${controllingFieldObj.type})`);
        }
        if (dependentFieldObj && !validTypes.includes(dependentFieldObj.type)) {
            errors.push(`Dependent field '${dependentField}' must be picklist or multipicklist type (found: ${dependentFieldObj.type})`);
        }

        return { valid: errors.length === 0 };
    }

    mockValidateControllingValues(objectName, fieldName, dependencyMatrix, errors) {
        const fields = this.mockFields.get(objectName) || [];
        const field = fields.find(f => f.name === fieldName);

        if (!field || !field.picklistValues) {
            errors.push(`Field '${fieldName}' has no picklist values`);
            return { valid: false };
        }

        const actualValues = new Set(field.picklistValues.map(v => v.value));
        const expectedValues = Object.keys(dependencyMatrix);

        for (const expectedValue of expectedValues) {
            if (!actualValues.has(expectedValue)) {
                errors.push(`Controlling value '${expectedValue}' not found in ${fieldName}`);
            }
        }

        return { valid: errors.length === 0 };
    }

    mockValidateDependentValues(objectName, fieldName, dependencyMatrix, errors) {
        const fields = this.mockFields.get(objectName) || [];
        const field = fields.find(f => f.name === fieldName);

        if (!field || !field.picklistValues) {
            errors.push(`Field '${fieldName}' has no picklist values`);
            return { valid: false };
        }

        const actualValues = new Set(field.picklistValues.map(v => v.value));
        const expectedValues = [...new Set(Object.values(dependencyMatrix).flat())];

        for (const expectedValue of expectedValues) {
            if (!actualValues.has(expectedValue)) {
                errors.push(`Dependent value '${expectedValue}' not found in ${fieldName}`);
            }
        }

        return { valid: errors.length === 0 };
    }

    validateDependencyMatrix(dependencyMatrix, errors, warnings) {
        // Check matrix not empty
        if (!dependencyMatrix || Object.keys(dependencyMatrix).length === 0) {
            errors.push('Dependency matrix is empty');
            return { valid: false, stats: {} };
        }

        // Check each controlling value has at least one dependent value
        for (const [controllingValue, dependentValues] of Object.entries(dependencyMatrix)) {
            if (!Array.isArray(dependentValues) || dependentValues.length === 0) {
                errors.push(`Controlling value '${controllingValue}' has no dependent values mapped`);
            }
        }

        // Check for orphaned dependent values
        const allDependentValuesInMatrix = new Set(Object.values(dependencyMatrix).flat());

        return {
            valid: errors.length === 0,
            stats: {
                controllingValues: Object.keys(dependencyMatrix).length,
                dependentValues: allDependentValuesInMatrix.size,
                totalMappings: Object.values(dependencyMatrix).flat().length
            }
        };
    }

    mockCheckCircularDependency(objectName, controllingField, dependentField, errors) {
        const fields = this.mockFields.get(objectName) || [];
        const controllingFieldObj = fields.find(f => f.name === controllingField);

        // Check if controlling field is itself dependent on the dependent field
        if (controllingFieldObj?.dependentPicklist && controllingFieldObj.controllerName === dependentField) {
            errors.push(`Circular dependency detected: ${controllingField} depends on ${dependentField}`);
        }

        return { valid: errors.length === 0 };
    }

    async verifyDependencyDeployment(params) {
        if (!params.objectName) throw new Error('objectName is required');
        if (!params.controllingFieldApiName) throw new Error('controllingFieldApiName is required');
        if (!params.dependentFieldApiName) throw new Error('dependentFieldApiName is required');

        const fields = this.mockFields.get(params.objectName) || [];
        const dependentField = fields.find(f => f.name === params.dependentFieldApiName);

        if (!dependentField) {
            return {
                success: false,
                message: `Dependent field ${params.dependentFieldApiName} not found after deployment`
            };
        }

        if (!dependentField.dependentPicklist) {
            return {
                success: false,
                message: `Dependent field ${params.dependentFieldApiName} is not marked as dependent`
            };
        }

        if (dependentField.controllerName !== params.controllingFieldApiName) {
            return {
                success: false,
                message: `Controlling field reference incorrect (expected: ${params.controllingFieldApiName}, got: ${dependentField.controllerName})`
            };
        }

        return {
            success: true,
            message: 'Dependency verified successfully'
        };
    }
}

// Test suite
class PicklistDependencyValidatorTests {
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
        console.log('\n=== PicklistDependencyValidator Unit Tests ===\n');

        // Test 1: Validate fields exist
        await this.runTest('should check both fields exist', async () => {
            const validator = new MockPicklistDependencyValidator({ org: 'test-org' });

            validator.setMockFields('Account', [
                { name: 'Industry', type: 'picklist', picklistValues: [{ value: 'Technology' }] },
                { name: 'Account_Type__c', type: 'picklist', picklistValues: [{ value: 'SaaS' }] }
            ]);

            const validation = await validator.validateBeforeDeployment({
                objectName: 'Account',
                controllingFieldApiName: 'Industry',
                dependentFieldApiName: 'Account_Type__c',
                dependencyMatrix: { 'Technology': ['SaaS'] }
            });

            assert.strictEqual(validation.canProceed, true);
            assert.strictEqual(validation.errors.length, 0);
        });

        // Test 2: Detect missing controlling field
        await this.runTest('should detect missing controlling field', async () => {
            const validator = new MockPicklistDependencyValidator({ org: 'test-org' });

            validator.setMockFields('Account', [
                { name: 'Account_Type__c', type: 'picklist', picklistValues: [{ value: 'SaaS' }] }
            ]);

            const validation = await validator.validateBeforeDeployment({
                objectName: 'Account',
                controllingFieldApiName: 'Industry',
                dependentFieldApiName: 'Account_Type__c',
                dependencyMatrix: { 'Technology': ['SaaS'] }
            });

            assert.strictEqual(validation.canProceed, false);
            assert.ok(validation.errors.some(e => e.includes('Controlling field')));
        });

        // Test 3: Validate field types
        await this.runTest('should validate field types are compatible', async () => {
            const validator = new MockPicklistDependencyValidator({ org: 'test-org' });

            validator.setMockFields('Account', [
                { name: 'Industry', type: 'text', picklistValues: [] }, // Wrong type
                { name: 'Account_Type__c', type: 'picklist', picklistValues: [{ value: 'SaaS' }] }
            ]);

            const validation = await validator.validateBeforeDeployment({
                objectName: 'Account',
                controllingFieldApiName: 'Industry',
                dependentFieldApiName: 'Account_Type__c',
                dependencyMatrix: { 'Technology': ['SaaS'] }
            });

            assert.strictEqual(validation.canProceed, false);
            assert.ok(validation.errors.some(e => e.includes('must be picklist or multipicklist')));
        });

        // Test 4: Validate controlling values exist
        await this.runTest('should validate controlling values exist in field', async () => {
            const validator = new MockPicklistDependencyValidator({ org: 'test-org' });

            validator.setMockFields('Account', [
                { name: 'Industry', type: 'picklist', picklistValues: [{ value: 'Technology' }] },
                { name: 'Account_Type__c', type: 'picklist', picklistValues: [{ value: 'SaaS' }] }
            ]);

            const validation = await validator.validateBeforeDeployment({
                objectName: 'Account',
                controllingFieldApiName: 'Industry',
                dependentFieldApiName: 'Account_Type__c',
                dependencyMatrix: {
                    'Technology': ['SaaS'],
                    'Finance': ['Banking'] // Finance doesn't exist
                }
            });

            assert.strictEqual(validation.canProceed, false);
            assert.ok(validation.errors.some(e => e.includes('Finance')));
        });

        // Test 5: Validate dependent values exist
        await this.runTest('should validate dependent values exist in field', async () => {
            const validator = new MockPicklistDependencyValidator({ org: 'test-org' });

            validator.setMockFields('Account', [
                { name: 'Industry', type: 'picklist', picklistValues: [{ value: 'Technology' }] },
                { name: 'Account_Type__c', type: 'picklist', picklistValues: [{ value: 'SaaS' }] }
            ]);

            const validation = await validator.validateBeforeDeployment({
                objectName: 'Account',
                controllingFieldApiName: 'Industry',
                dependentFieldApiName: 'Account_Type__c',
                dependencyMatrix: {
                    'Technology': ['SaaS', 'Hardware'] // Hardware doesn't exist
                }
            });

            assert.strictEqual(validation.canProceed, false);
            assert.ok(validation.errors.some(e => e.includes('Hardware')));
        });

        // Test 6: Detect circular dependencies
        await this.runTest('should detect circular dependencies', async () => {
            const validator = new MockPicklistDependencyValidator({ org: 'test-org' });

            validator.setMockFields('Account', [
                {
                    name: 'Industry',
                    type: 'picklist',
                    picklistValues: [{ value: 'Technology' }],
                    dependentPicklist: true,
                    controllerName: 'Account_Type__c' // Industry depends on Account_Type__c
                },
                { name: 'Account_Type__c', type: 'picklist', picklistValues: [{ value: 'SaaS' }] }
            ]);

            const validation = await validator.validateBeforeDeployment({
                objectName: 'Account',
                controllingFieldApiName: 'Industry', // Trying to make Industry control Account_Type__c
                dependentFieldApiName: 'Account_Type__c',
                dependencyMatrix: { 'Technology': ['SaaS'] }
            });

            assert.strictEqual(validation.canProceed, false);
            assert.ok(validation.errors.some(e => e.includes('Circular dependency')));
        });

        // Test 7: Validate dependency matrix structure
        await this.runTest('should validate dependency matrix completeness', async () => {
            const validator = new MockPicklistDependencyValidator({ org: 'test-org' });

            validator.setMockFields('Account', [
                { name: 'Industry', type: 'picklist', picklistValues: [{ value: 'Technology' }] },
                { name: 'Account_Type__c', type: 'picklist', picklistValues: [{ value: 'SaaS' }] }
            ]);

            // Empty controlling value array
            const validation = await validator.validateBeforeDeployment({
                objectName: 'Account',
                controllingFieldApiName: 'Industry',
                dependentFieldApiName: 'Account_Type__c',
                dependencyMatrix: {
                    'Technology': [] // No dependent values
                }
            });

            assert.strictEqual(validation.canProceed, false);
            assert.ok(validation.errors.some(e => e.includes('has no dependent values')));
        });

        // Test 8: Verify deployment success
        await this.runTest('should verify dependency deployment', async () => {
            const validator = new MockPicklistDependencyValidator({ org: 'test-org' });

            validator.setMockFields('Account', [
                { name: 'Industry', type: 'picklist', picklistValues: [{ value: 'Technology' }] },
                {
                    name: 'Account_Type__c',
                    type: 'picklist',
                    picklistValues: [{ value: 'SaaS' }],
                    dependentPicklist: true,
                    controllerName: 'Industry'
                }
            ]);

            const verification = await validator.verifyDependencyDeployment({
                objectName: 'Account',
                controllingFieldApiName: 'Industry',
                dependentFieldApiName: 'Account_Type__c'
            });

            assert.strictEqual(verification.success, true);
        });

        // Test 9: Detect incorrect deployment
        await this.runTest('should detect incorrect controlling field reference', async () => {
            const validator = new MockPicklistDependencyValidator({ org: 'test-org' });

            validator.setMockFields('Account', [
                { name: 'Industry', type: 'picklist', picklistValues: [{ value: 'Technology' }] },
                {
                    name: 'Account_Type__c',
                    type: 'picklist',
                    picklistValues: [{ value: 'SaaS' }],
                    dependentPicklist: true,
                    controllerName: 'WrongField' // Wrong controller
                }
            ]);

            const verification = await validator.verifyDependencyDeployment({
                objectName: 'Account',
                controllingFieldApiName: 'Industry',
                dependentFieldApiName: 'Account_Type__c'
            });

            assert.strictEqual(verification.success, false);
            assert.ok(verification.message.includes('incorrect'));
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
    const tests = new PicklistDependencyValidatorTests();
    tests.run().catch(error => {
        console.error('Test suite failed:', error);
        if (typeof jest === 'undefined') process.exit(1); else throw new Error('Test failed'); // Jest-safe
    });
}


// Jest wrapper for standalone test runner
if (typeof describe !== 'undefined') {
  describe('Picklist Dependency Validator', () => {
    it('should pass all tests', async () => {
      const tests = new PicklistDependencyValidatorTests();
      const result = await tests.run();
      expect(result.failed).toBe(0);
    });
  });
}
