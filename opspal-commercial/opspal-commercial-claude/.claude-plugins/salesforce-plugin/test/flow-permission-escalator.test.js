/**
 * Unit tests for FlowPermissionEscalator
 * Tests 3-tier permission fallback system
 *
 * Run: node test/flow-permission-escalator.test.js
 */

const FlowPermissionEscalator = require('../scripts/lib/flow-permission-escalator');
const fs = require('fs').promises;
const path = require('path');

// Test directories
const testDir = path.join(__dirname, '../tmp/test-escalator');
const fixtureDir = path.join(__dirname, 'fixtures/flows');

// Test runner
async function runTests() {
    console.log('🧪 Running FlowPermissionEscalator tests...\n');

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
            toBeTruthy() {
                if (!value) {
                    throw new Error(`Expected truthy value, got ${value}`);
                }
            },
            toBeGreaterThan(expected) {
                if (value <= expected) {
                    throw new Error(`Expected ${value} to be greater than ${expected}`);
                }
            }
        };
    }

    // Setup: Create test directory
    await fs.mkdir(testDir, { recursive: true });

    // Create test flow
    const testFlow = await fs.readFile(path.join(fixtureDir, 'Test_Flow.flow-meta.xml'), 'utf8');
    const testFlowPath = path.join(testDir, 'test-flow.flow-meta.xml');
    await fs.writeFile(testFlowPath, testFlow);

    // === INITIALIZATION TESTS ===
    console.log('📦 Testing Initialization:');

    await test('Initialize escalator', async () => {
        const escalator = new FlowPermissionEscalator(testFlowPath, 'test-org', { verbose: false });
        await escalator.init();

        const context = escalator.getContext();
        // Status is 'in_progress' after recording steps during init
        expect(context.status).toBe('in_progress');
        expect(context.flowName).toBe('test-flow');
        expect(context.operation).toBe('permission-escalation');

        await escalator.context.clear();
    });

    await test('Gather user information', async () => {
        const escalator = new FlowPermissionEscalator(testFlowPath, 'test-org', { verbose: false });
        await escalator.init();

        expect(escalator.userInfo).toBeTruthy();
        expect(escalator.userInfo.username).toBeTruthy();
        expect(escalator.userInfo.profile).toBeTruthy();

        await escalator.context.clear();
    });

    await test('Detect Apex invocation', async () => {
        const escalator = new FlowPermissionEscalator(testFlowPath, 'test-org', { verbose: false });
        await escalator.init();

        // Should be false for test flow (no Apex)
        expect(escalator.requiresApex).toBe(false);

        await escalator.context.clear();
    });

    // === PERMISSION CHECKING TESTS ===
    console.log('\n📦 Testing Permission Checks:');

    await test('Check Modify All Data permission (System Administrator)', async () => {
        const escalator = new FlowPermissionEscalator(testFlowPath, 'test-org', { verbose: false });
        await escalator.init();

        // Mock System Administrator profile
        escalator.userInfo.profile = 'System Administrator';

        const hasPermission = escalator.hasModifyAllDataPermission();
        expect(hasPermission).toBe(true);

        await escalator.context.clear();
    });

    await test('Check Modify All Data permission (Standard User)', async () => {
        const escalator = new FlowPermissionEscalator(testFlowPath, 'test-org', { verbose: false });
        await escalator.init();

        // Mock Standard User profile
        escalator.userInfo.profile = 'Standard User';

        const hasPermission = escalator.hasModifyAllDataPermission();
        expect(hasPermission).toBe(false);

        await escalator.context.clear();
    });

    await test('Check Apex execution permission (Standard User)', async () => {
        const escalator = new FlowPermissionEscalator(testFlowPath, 'test-org', { verbose: false });
        await escalator.init();

        // Mock Standard User profile
        escalator.userInfo.profile = 'Standard User';

        const hasPermission = escalator.hasApexExecutionPermission();
        expect(hasPermission).toBe(true);

        await escalator.context.clear();
    });

    await test('Check Apex execution permission (Guest User)', async () => {
        const escalator = new FlowPermissionEscalator(testFlowPath, 'test-org', { verbose: false });
        await escalator.init();

        // Mock Guest User profile (restricted)
        escalator.userInfo.profile = 'Guest User';

        const hasPermission = escalator.hasApexExecutionPermission();
        expect(hasPermission).toBe(false);

        await escalator.context.clear();
    });

    // === TIER 1 DEPLOYMENT TESTS ===
    console.log('\n📦 Testing Tier 1 (Metadata API):');

    await test('Tier 1 success with System Administrator', async () => {
        const escalator = new FlowPermissionEscalator(testFlowPath, 'test-org', { verbose: false });
        await escalator.init();

        // Mock System Administrator
        escalator.userInfo.profile = 'System Administrator';

        const result = await escalator.deployTier1();

        expect(result.tier).toBe('tier1');
        expect(result.method).toBe('metadata_api');
        expect(result.success).toBe(true);

        const attempts = escalator.getAttempts();
        expect(attempts).toHaveLength(1);
        expect(attempts[0].success).toBe(true);

        await escalator.context.clear();
    });

    await test('Tier 1 failure with Standard User', async () => {
        const escalator = new FlowPermissionEscalator(testFlowPath, 'test-org', { verbose: false });
        await escalator.init();

        // Mock Standard User (no Modify All Data)
        escalator.userInfo.profile = 'Standard User';

        try {
            await escalator.deployTier1();
            throw new Error('Should have thrown permission error');
        } catch (error) {
            expect(error.message).toContain('insufficient access permissions');
        }

        const attempts = escalator.getAttempts();
        expect(attempts).toHaveLength(1);
        expect(attempts[0].success).toBe(false);

        await escalator.context.clear();
    });

    // === TIER 2 DEPLOYMENT TESTS ===
    console.log('\n📦 Testing Tier 2 (Apex Service):');

    await test('Tier 2 success with Standard User', async () => {
        const escalator = new FlowPermissionEscalator(testFlowPath, 'test-org', { verbose: false });
        await escalator.init();

        // Mock Standard User (has Apex execution)
        escalator.userInfo.profile = 'Standard User';

        const result = await escalator.deployTier2();

        expect(result.tier).toBe('tier2');
        expect(result.method).toBe('apex_service');
        expect(result.success).toBe(true);

        await escalator.context.clear();
    });

    await test('Tier 2 failure with Guest User', async () => {
        const escalator = new FlowPermissionEscalator(testFlowPath, 'test-org', { verbose: false });
        await escalator.init();

        // Mock Guest User (no Apex execution)
        escalator.userInfo.profile = 'Guest User';

        try {
            await escalator.deployTier2();
            throw new Error('Should have thrown permission error');
        } catch (error) {
            expect(error.message).toContain('insufficient access permissions');
        }

        await escalator.context.clear();
    });

    // === TIER 3 DEPLOYMENT TESTS ===
    console.log('\n📦 Testing Tier 3 (Manual Guide):');

    await test('Tier 3 always succeeds', async () => {
        const escalator = new FlowPermissionEscalator(testFlowPath, 'test-org', { verbose: false });
        await escalator.init();

        const result = await escalator.deployTier3();

        expect(result.tier).toBe('tier3');
        expect(result.method).toBe('manual_guide');
        expect(result.success).toBe(true);
        expect(result.guidePath).toBeTruthy();

        // Verify guide file was created
        const guideExists = await fs.access(result.guidePath)
            .then(() => true)
            .catch(() => false);
        expect(guideExists).toBe(true);

        await escalator.context.clear();
    });

    await test('Tier 3 guide contains correct content', async () => {
        const escalator = new FlowPermissionEscalator(testFlowPath, 'test-org', { verbose: false });
        await escalator.init();

        const result = await escalator.deployTier3();

        const guideContent = await fs.readFile(result.guidePath, 'utf8');

        expect(guideContent).toContain('Manual Flow Deployment Guide');
        expect(guideContent).toContain(escalator.flowName);
        expect(guideContent).toContain('Manual Deployment Steps');
        expect(guideContent).toContain('Permission Requirements');

        await escalator.context.clear();
    });

    // === ESCALATION FLOW TESTS ===
    console.log('\n📦 Testing Escalation Flow:');

    await test('Successful deployment at Tier 1', async () => {
        const escalator = new FlowPermissionEscalator(testFlowPath, 'test-org', { verbose: false });
        await escalator.init();

        // Mock System Administrator (succeeds at Tier 1)
        escalator.userInfo.profile = 'System Administrator';

        const result = await escalator.deploy();

        expect(result.tier).toBe('tier1');
        expect(result.success).toBe(true);

        const attempts = escalator.getAttempts();
        expect(attempts).toHaveLength(1);

        await escalator.context.clear();
    });

    await test('Escalation from Tier 1 to Tier 2', async () => {
        const escalator = new FlowPermissionEscalator(testFlowPath, 'test-org', { verbose: false });
        await escalator.init();

        // Mock Standard User (fails Tier 1, succeeds Tier 2)
        escalator.userInfo.profile = 'Standard User';

        const result = await escalator.deploy();

        expect(result.tier).toBe('tier2');
        expect(result.success).toBe(true);

        const attempts = escalator.getAttempts();
        expect(attempts).toHaveLength(2);
        expect(attempts[0].success).toBe(false);
        expect(attempts[1].success).toBe(true);

        await escalator.context.clear();
    });

    await test('Escalation from Tier 1 to Tier 2 to Tier 3', async () => {
        const escalator = new FlowPermissionEscalator(testFlowPath, 'test-org', { verbose: false });
        await escalator.init();

        // Mock Guest User (fails Tier 1 and 2, succeeds at Tier 3)
        escalator.userInfo.profile = 'Guest User';

        const result = await escalator.deploy();

        expect(result.tier).toBe('tier3');
        expect(result.success).toBe(true);

        const attempts = escalator.getAttempts();
        expect(attempts).toHaveLength(3);
        expect(attempts[0].success).toBe(false);
        expect(attempts[1].success).toBe(false);
        expect(attempts[2].success).toBe(true);

        await escalator.context.clear();
    });

    // === CONTEXT TRACKING TESTS ===
    console.log('\n📦 Testing Context Tracking:');

    await test('Context tracks all steps', async () => {
        const escalator = new FlowPermissionEscalator(testFlowPath, 'test-org', { verbose: false });
        await escalator.init();

        escalator.userInfo.profile = 'System Administrator';
        await escalator.deploy();

        const context = escalator.getContext();
        expect(context.steps.length).toBeGreaterThan(0);

        const stepNames = context.steps.map(s => s.stepName);
        expect(stepNames).toContain('user_info_gathered');
        expect(stepNames).toContain('apex_detection');
        expect(stepNames).toContain('tier1_start');

        await escalator.context.clear();
    });

    await test('Context records escalation attempts', async () => {
        const escalator = new FlowPermissionEscalator(testFlowPath, 'test-org', { verbose: false });
        await escalator.init();

        escalator.userInfo.profile = 'Standard User';
        await escalator.deploy();

        const context = escalator.getContext();
        const stepNames = context.steps.map(s => s.stepName);

        // Should have attempted Tier 1 (failed) and Tier 2 (succeeded)
        expect(stepNames).toContain('tier1_start');
        expect(stepNames).toContain('tier1_failed');
        expect(stepNames).toContain('tier2_start');
        expect(stepNames).toContain('tier2_success');

        await escalator.context.clear();
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
  describe('Flow Permission Escalator', () => {
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
