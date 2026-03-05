/**
 * Integration Test: Simple Dependency Creation
 * ===========================================
 *
 * Tests complete workflow for creating a simple 1-to-many dependency.
 *
 * Scenario:
 * - 2 controlling values → 4 dependent values
 * - 3 record types
 * - Field-specific values (no Global Value Sets)
 *
 * Prerequisites:
 * - Authenticated to test sandbox
 * - Account object available
 * - Clean state (no existing Industry → Account_Type dependency)
 *
 * Run with:
 *   SF_TARGET_ORG=test-sandbox node test/integration/simple-dependency-creation.test.js
 */

const { PicklistDependencyManager } = require('../../scripts/lib/picklist-dependency-manager');
const { PicklistDependencyValidator } = require('../../scripts/lib/picklist-dependency-validator');
const { UnifiedPicklistManager } = require('../../scripts/lib/unified-picklist-manager');

class SimpleDependencyCreationTest {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.testPassed = true;
        this.errors = [];
    }

    async run() {
        console.log('\n=== Simple Dependency Creation Integration Test ===\n');
        console.log(`Org: ${this.orgAlias}\n`);

        try {
            // Test configuration
            const config = {
                objectName: 'Account',
                controllingFieldApiName: 'Industry',
                dependentFieldApiName: 'Account_Type__c',
                dependencyMatrix: {
                    'Technology': ['SaaS', 'Hardware'],
                    'Finance': ['Banking', 'Insurance']
                },
                recordTypes: 'all'
            };

            console.log('Configuration:');
            console.log(JSON.stringify(config, null, 2));

            // Phase 1: Pre-creation validation
            console.log('\n--- Phase 1: Pre-Creation Validation ---');
            const validator = new PicklistDependencyValidator({ org: this.orgAlias });

            const validation = await validator.validateBeforeDeployment(config);

            if (!validation.canProceed) {
                this.testPassed = false;
                this.errors.push('Pre-deployment validation failed');
                console.error('❌ Validation errors:', validation.errors);
                return;
            }

            console.log('✅ Pre-deployment validation passed');
            if (validation.warnings.length > 0) {
                console.warn('⚠️ Warnings:', validation.warnings);
            }

            // Phase 2: Create dependency
            console.log('\n--- Phase 2: Create Dependency ---');
            const manager = new PicklistDependencyManager({ org: this.orgAlias });

            const createResult = await manager.createDependency(config);

            if (!createResult.success) {
                this.testPassed = false;
                this.errors.push('Dependency creation failed');
                console.error('❌ Creation failed');
                return;
            }

            console.log('✅ Dependency created');
            console.log(`   Deployment ID: ${createResult.deploymentId}`);
            console.log(`   Record Types Updated: ${createResult.recordTypesUpdated.join(', ')}`);

            // Phase 3: Post-deployment verification
            console.log('\n--- Phase 3: Post-Deployment Verification ---');

            const verification = await validator.verifyDependencyDeployment({
                objectName: config.objectName,
                controllingFieldApiName: config.controllingFieldApiName,
                dependentFieldApiName: config.dependentFieldApiName
            });

            if (!verification.success) {
                this.testPassed = false;
                this.errors.push('Post-deployment verification failed');
                console.error('❌ Verification failed:', verification.message);
                return;
            }

            console.log('✅ Deployment verified');
            console.log('   Dependent field correctly marked as dependent');
            console.log(`   Controlling field reference: ${config.controllingFieldApiName}`);

            // Phase 4: Record type verification
            console.log('\n--- Phase 4: Record Type Verification ---');
            const picklistMgr = new UnifiedPicklistManager({ org: this.orgAlias });

            const allDependentValues = Object.values(config.dependencyMatrix).flat();
            const rtVerification = await picklistMgr.verifyPicklistAvailability({
                objectName: config.objectName,
                fieldApiName: config.dependentFieldApiName,
                expectedValues: allDependentValues,
                recordTypes: 'all'
            });

            if (!rtVerification.success) {
                this.testPassed = false;
                this.errors.push('Record type verification failed');
                console.error('❌ Some record types missing values');
                return;
            }

            console.log('✅ All record types have correct values');

            // Test summary
            console.log('\n' + '='.repeat(60));
            console.log('  Test Summary');
            console.log('='.repeat(60));
            console.log('\n✅ ALL PHASES PASSED');
            console.log(`\nDeployment ID: ${createResult.deploymentId}`);
            console.log(`Record Types Updated: ${createResult.recordTypesUpdated.length}`);
            console.log(`Dependent Values: ${allDependentValues.length}`);

        } catch (error) {
            this.testPassed = false;
            this.errors.push(error.message);
            console.error('\n❌ Test failed:', error.message);
            if (error.context) {
                console.error('Context:', JSON.stringify(error.context, null, 2));
            }
        }

        return {
            passed: this.testPassed,
            errors: this.errors
        };
    }
}

// Execute test
async function main() {
    const orgAlias = process.env.SF_TARGET_ORG;

    if (!orgAlias) {
        console.error('❌ SF_TARGET_ORG environment variable not set');
        console.error('Set it with: export SF_TARGET_ORG=your-sandbox-alias');
        if (typeof jest === 'undefined') process.exit(1); else throw new Error('Test failed'); // Jest-safe
    }

    const test = new SimpleDependencyCreationTest(orgAlias);
    const result = await test.run();

    if (result.passed) {
        console.log('\n✅ Integration test PASSED');
        if (typeof jest === 'undefined') process.exit(0); // Jest-safe
    } else {
        console.error('\n❌ Integration test FAILED');
        console.error('Errors:', result.errors);
        if (typeof jest === 'undefined') process.exit(1); else throw new Error('Test failed'); // Jest-safe
    }
}

if (require.main === module) {
    main();
}

module.exports = SimpleDependencyCreationTest;


// Jest wrapper for standalone test runner
if (typeof describe !== 'undefined') {
  describe('Simple Dependency Creation', () => {
    const hasOrg = Boolean(process.env.SF_TARGET_ORG);
    const runTest = hasOrg ? it : it.skip;

    runTest('should pass all tests', async () => {
      const test = new SimpleDependencyCreationTest(process.env.SF_TARGET_ORG);
      const result = await test.run();
      expect(result.passed).toBe(true);
    });
  });
}
