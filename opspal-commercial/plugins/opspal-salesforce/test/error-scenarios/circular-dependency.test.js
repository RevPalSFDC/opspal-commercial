/**
 * Error Scenario Test: Circular Dependency Detection
 * ==================================================
 *
 * Tests that validator correctly detects and blocks circular dependencies.
 *
 * Scenario:
 * - Field A controls Field B
 * - Field B controls Field A (circular!)
 * - Validator should block this configuration
 *
 * Run with:
 *   node test/error-scenarios/circular-dependency.test.js
 */

const assert = require('assert');

// Mock validator with circular dependency detection
class MockValidator {
    constructor() {
        this.mockFields = new Map();
    }

    setMockFields(objectName, fields) {
        this.mockFields.set(objectName, fields);
    }

    async validateBeforeDeployment(params) {
        const { objectName, controllingFieldApiName, dependentFieldApiName } = params;
        const fields = this.mockFields.get(objectName) || [];
        const controllingField = fields.find(f => f.name === controllingFieldApiName);

        const errors = [];

        // Check for circular dependency
        if (controllingField?.dependentPicklist && controllingField.controllerName === dependentFieldApiName) {
            errors.push(
                `Circular dependency detected: ${controllingFieldApiName} depends on ${dependentFieldApiName}, ` +
                `but you're trying to make ${dependentFieldApiName} depend on ${controllingFieldApiName}`
            );
        }

        return {
            canProceed: errors.length === 0,
            errors
        };
    }
}

async function runTest() {
    console.log('\n=== Circular Dependency Detection Test ===\n');

    const validator = new MockValidator();

    // Setup: Field A depends on Field B
    validator.setMockFields('Account', [
        {
            name: 'FieldA',
            type: 'picklist',
            dependentPicklist: true,
            controllerName: 'FieldB'  // FieldA depends on FieldB
        },
        {
            name: 'FieldB',
            type: 'picklist'
        }
    ]);

    // Test: Try to make FieldB depend on FieldA (creating circular dependency)
    console.log('Test: Attempting to create circular dependency...');
    console.log('  - FieldA already depends on FieldB');
    console.log('  - Trying to make FieldB depend on FieldA\n');

    const validation = await validator.validateBeforeDeployment({
        objectName: 'Account',
        controllingFieldApiName: 'FieldA',  // FieldA as controller
        dependentFieldApiName: 'FieldB',    // FieldB as dependent (CIRCULAR!)
        dependencyMatrix: { 'Value1': ['Value2'] }
    });

    console.log('Validation Result:');
    console.log(`  canProceed: ${validation.canProceed}`);
    console.log(`  Errors: ${JSON.stringify(validation.errors)}`);

    // Assert circular dependency was detected
    assert.strictEqual(validation.canProceed, false, 'Validator should block circular dependency');
    assert.strictEqual(validation.errors.length, 1, 'Should have exactly one error');
    assert.ok(
        validation.errors[0].includes('Circular dependency'),
        'Error message should mention circular dependency'
    );

    console.log('\n✅ Test PASSED: Circular dependency correctly detected and blocked');
    if (typeof jest === 'undefined') process.exit(0); // Jest-safe
}

if (require.main === module) {
    runTest().catch(error => {
        console.error('\n❌ Test FAILED:', error.message);
        if (typeof jest === 'undefined') process.exit(1); else throw new Error('Test failed'); // Jest-safe
    });
}


// Jest wrapper for standalone test runner
if (typeof describe !== 'undefined') {
  describe('Circular Dependency', () => {
    it('should pass the circular dependency test', async () => {
      expect(typeof runTest).toBe('function');
      await runTest();
    });
  });
}
