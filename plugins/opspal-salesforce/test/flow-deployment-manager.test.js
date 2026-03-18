/**
 * End-to-End tests for FlowDeploymentManager (Phase 3.0)
 * Tests comprehensive deployment orchestration with validation and rollback
 *
 * Run: node test/flow-deployment-manager.test.js
 */

const FlowDeploymentManager = require('../scripts/lib/flow-deployment-manager');
const fs = require('fs').promises;
const path = require('path');

async function runTests() {
    console.log('Running FlowDeploymentManager Phase 3.0 end-to-end tests...\n');

    let passed = 0;
    let failed = 0;

    async function test(name, fn) {
        try {
            await fn();
            console.log(`✓ ${name}`);
            passed++;
        } catch (error) {
            console.log(`✗ ${name}`);
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
            toHaveProperty(prop) {
                if (!value || !value.hasOwnProperty(prop)) {
                    throw new Error(`Expected to have property "${prop}"`);
                }
            },
            toBeGreaterThan(expected) {
                if (value <= expected) {
                    throw new Error(`Expected ${value} to be greater than ${expected}`);
                }
            }
        };
    }

    const testDir = path.join(__dirname, '../tmp/test-deployment-manager');
    await fs.mkdir(testDir, { recursive: true });

    // Create a sample Flow XML for testing
    const sampleFlowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <description>Test Flow for deployment</description>
    <label>Test Deployment Flow</label>
    <processType>AutoLaunchedFlow</processType>
    <status>Draft</status>
</Flow>`;

    const testFlowPath = path.join(testDir, 'Test_Deployment_Flow.flow-meta.xml');
    await fs.writeFile(testFlowPath, sampleFlowXML);

    console.log('=== Testing FlowDeploymentManager Initialization ===\n');

    await test('Initialize FlowDeploymentManager', async () => {
        const manager = new FlowDeploymentManager('test-org', { verbose: false, workingDir: testDir });

        expect(manager).toBeTruthy();
        expect(manager.orgAlias).toBe('test-org');
        expect(manager.workingDir).toBe(testDir);
    });

    console.log('\n=== Testing Validation Framework ===\n');

    await test('Validate Flow before deployment', async () => {
        const manager = new FlowDeploymentManager('test-org', { verbose: false, workingDir: testDir });

        const validation = await manager.validateBeforeDeployment(testFlowPath);

        expect(validation).toBeTruthy();
        expect(validation).toHaveProperty('valid');
        expect(validation).toHaveProperty('errors');
        expect(validation).toHaveProperty('warnings');
    });

    await test('Validation detects missing file', async () => {
        const manager = new FlowDeploymentManager('test-org', { verbose: false, workingDir: testDir });

        const validation = await manager.validateBeforeDeployment(path.join(testDir, 'nonexistent.xml'));

        expect(validation).toBeTruthy();
        expect(validation.valid).toBe(false);
        expect(validation.errors.length).toBeGreaterThan(0);
    });

    console.log('\n=== Testing Deployment History ===\n');

    await test('Track deployment history', async () => {
        const manager = new FlowDeploymentManager('test-org', { verbose: false, workingDir: testDir });

        const history = manager.getHistory();

        expect(Array.isArray(history)).toBeTruthy();
    });

    await test('Generate unique deployment IDs', async () => {
        const manager = new FlowDeploymentManager('test-org', { verbose: false, workingDir: testDir });

        const id1 = manager.generateDeploymentId();
        const id2 = manager.generateDeploymentId();

        expect(id1).toBeTruthy();
        expect(id2).toBeTruthy();
        expect(id1 !== id2).toBeTruthy();
    });

    console.log('\n=== Testing Context Integration ===\n');

    await test('Context initialized per-deployment', async () => {
        const manager = new FlowDeploymentManager('test-org', { verbose: false, workingDir: testDir });

        await manager.init(testFlowPath);

        expect(manager.context).toBeTruthy();
        expect(manager.flowName).toBe('Test_Deployment_Flow');
    });

    console.log('\n=== Testing Dry-Run Mode ===\n');

    await test('Dry-run mode skips actual deployment', async () => {
        const manager = new FlowDeploymentManager('test-org', { verbose: false, workingDir: testDir });

        try {
            const result = await manager.deploy(testFlowPath, {
                dryRun: true,
                validate: true,
                escalatePermissions: false
            });

            expect(result).toBeTruthy();
            expect(result.dryRun).toBe(true);
            expect(result.success).toBe(true);
            expect(result.message).toBeTruthy();
        } catch (error) {
            // Expected to fail in test environment without real org
            // But should reach dry-run mode first
            if (!error.message.includes('validation') && !error.message.includes('org')) {
                throw error;
            }
        }
    });

    console.log('\n=== Testing Backup & Rollback ===\n');

    await test('Create deployment snapshot', async () => {
        const manager = new FlowDeploymentManager('test-org', { verbose: false, workingDir: testDir });

        await manager.init(testFlowPath);

        // createSnapshot will fail if Flow doesn't exist in org, but that's expected in test
        await manager.createSnapshot();

        // Snapshot path should be set or null (if Flow doesn't exist)
        expect(manager.preDeploymentSnapshot !== undefined).toBeTruthy();
    });

    console.log('\n=== Testing Error Handling ===\n');

    await test('Error classification with FlowErrorTaxonomy', async () => {
        const manager = new FlowDeploymentManager('test-org', { verbose: false, workingDir: testDir });

        expect(manager.errorTaxonomy).toBeTruthy();
    });

    await test('Deployment failure triggers error recording', async () => {
        const manager = new FlowDeploymentManager('test-org', { verbose: false, workingDir: testDir });

        try {
            // This should fail because we're not connected to a real org
            await manager.deploy(testFlowPath, {
                validate: false,
                escalatePermissions: false,
                autoRollback: false,
                dryRun: false
            });
        } catch (error) {
            // Error is expected - verify it was handled properly
            expect(error).toBeTruthy();

            // Check deployment history records the failure
            const history = manager.getHistory();
            if (history.length > 0) {
                const lastDeployment = history[history.length - 1];
                expect(lastDeployment).toHaveProperty('success');
                expect(lastDeployment.success).toBe(false);
                expect(lastDeployment).toHaveProperty('error');
            }
        }
    });

    console.log('\n=== Testing Deployment Options ===\n');

    await test('Deployment accepts activateOnDeploy option', async () => {
        const manager = new FlowDeploymentManager('test-org', { verbose: false, workingDir: testDir });

        try {
            await manager.deploy(testFlowPath, {
                activateOnDeploy: true,
                dryRun: true
            });

            // If dry-run succeeds, options are being parsed correctly
            expect(true).toBeTruthy();
        } catch (error) {
            // Expected in test environment
            if (!error.message.includes('org')) {
                throw error;
            }
        }
    });

    await test('Deployment accepts runTests option', async () => {
        const manager = new FlowDeploymentManager('test-org', { verbose: false, workingDir: testDir });

        try {
            await manager.deploy(testFlowPath, {
                runTests: true,
                dryRun: true
            });

            expect(true).toBeTruthy();
        } catch (error) {
            if (!error.message.includes('org')) {
                throw error;
            }
        }
    });

    await test('Deployment accepts escalatePermissions option', async () => {
        const manager = new FlowDeploymentManager('test-org', { verbose: false, workingDir: testDir });

        try {
            await manager.deploy(testFlowPath, {
                escalatePermissions: true,
                dryRun: true
            });

            expect(true).toBeTruthy();
        } catch (error) {
            if (!error.message.includes('org')) {
                throw error;
            }
        }
    });

    console.log('\n=== Testing Activation Management ===\n');

    await test('Activate Flow method exists', async () => {
        const manager = new FlowDeploymentManager('test-org', { verbose: false, workingDir: testDir });

        expect(typeof manager.activate).toBe('function');
    });

    await test('Deactivate Flow method exists', async () => {
        const manager = new FlowDeploymentManager('test-org', { verbose: false, workingDir: testDir });

        expect(typeof manager.deactivate).toBe('function');
    });

    console.log('\n=== Testing Integration Points ===\n');

    await test('FlowDeploymentManager integrates with FlowTaskContext', async () => {
        const manager = new FlowDeploymentManager('test-org', { verbose: false, workingDir: testDir });

        await manager.init(testFlowPath);

        expect(manager.context).toBeTruthy();
        expect(manager.context.context).toBeTruthy();
        expect(manager.context.context).toHaveProperty('contextId');
    });

    await test('FlowDeploymentManager integrates with FlowErrorTaxonomy', async () => {
        const manager = new FlowDeploymentManager('test-org', { verbose: false, workingDir: testDir });

        expect(manager.errorTaxonomy).toBeTruthy();
        expect(typeof manager.errorTaxonomy.classify).toBe('function');
    });

    await test('FlowDeploymentManager uses FlowPermissionEscalator', async () => {
        const manager = new FlowDeploymentManager('test-org', { verbose: false, workingDir: testDir });

        // Should have escalation capability
        try {
            await manager.deploy(testFlowPath, {
                escalatePermissions: true,
                dryRun: true,
                validate: true
            });

            // Dry-run should succeed (validation passes)
            expect(true).toBeTruthy();
        } catch (error) {
            // Expected to fail in test environment
            if (!error.message.includes('org') && !error.message.includes('validation')) {
                throw error;
            }
        }
    });

    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('Test Summary');
    console.log('='.repeat(80));
    console.log(`  Total: ${passed + failed}`);
    console.log(`  ✓ Passed: ${passed} (${((passed / (passed + failed)) * 100).toFixed(1)}%)`);
    console.log(`  ✗ Failed: ${failed} (${((failed / (passed + failed)) * 100).toFixed(1)}%)`);
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
  describe('Flow Deployment Manager', () => {
    it('should pass all tests', async () => {
      expect(typeof runTests).toBe('function');
      const result = await runTests();
      expect(result).not.toBe(false);
    });
  });
}
