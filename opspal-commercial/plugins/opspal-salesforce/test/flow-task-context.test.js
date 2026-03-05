/**
 * Unit tests for FlowTaskContext
 * Tests execution context management, checkpoints, and state persistence
 *
 * Run: node test/flow-task-context.test.js
 */

const FlowTaskContext = require('../scripts/lib/flow-task-context');
const fs = require('fs').promises;
const path = require('path');

// Test helper - create unique test file for each run
const testDir = path.join(__dirname, '../tmp/test');
let testFile = null;

// Test runner
async function runTests() {
    console.log('🧪 Running FlowTaskContext tests...\n');

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
            toBeNull() {
                if (value !== null) {
                    throw new Error(`Expected null, got ${value}`);
                }
            },
            toHaveLength(expected) {
                if (!value || value.length !== expected) {
                    throw new Error(`Expected length ${expected}, got ${value ? value.length : 'undefined'}`);
                }
            }
        };
    }

    // Setup: Create test directory
    try {
        await fs.mkdir(testDir, { recursive: true });
    } catch (error) {
        console.error('Failed to create test directory:', error.message);
        return false;
    }

    // === INITIALIZATION TESTS ===
    console.log('📦 Testing Initialization:');

    await test('Initialize new context', async () => {
        testFile = path.join(testDir, `context-${Date.now()}.json`);
        const context = new FlowTaskContext(testFile);

        const result = await context.init({
            flowName: 'Test_Flow',
            operation: 'deploy',
            orgAlias: 'test-org'
        });

        expect(result.status).toBe('initialized');
        expect(result.flowName).toBe('Test_Flow');
        expect(result.operation).toBe('deploy');
        expect(result.orgAlias).toBe('test-org');
        expect(result.contextId).toBeTruthy();
        expect(result.steps).toHaveLength(0);
        expect(result.checkpoints).toHaveLength(0);

        // Cleanup
        await context.clear();
    });

    await test('Context ID is unique', async () => {
        testFile = path.join(testDir, `context-${Date.now()}.json`);
        const context1 = new FlowTaskContext(testFile);
        await context1.init();
        const id1 = context1.get().contextId;

        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay

        const context2 = new FlowTaskContext(testFile + '.2');
        await context2.init();
        const id2 = context2.get().contextId;

        if (id1 === id2) {
            throw new Error('Context IDs should be unique');
        }

        // Cleanup
        await context1.clear();
        await context2.clear();
    });

    // === PERSISTENCE TESTS ===
    console.log('\n📦 Testing Persistence:');

    await test('Save and load context', async () => {
        testFile = path.join(testDir, `context-${Date.now()}.json`);
        const context1 = new FlowTaskContext(testFile);

        await context1.init({ flowName: 'Test_Flow' });
        const originalId = context1.get().contextId;

        const context2 = new FlowTaskContext(testFile);
        await context2.load();

        expect(context2.get().contextId).toBe(originalId);
        expect(context2.get().flowName).toBe('Test_Flow');

        // Cleanup
        await context1.clear();
    });

    await test('Load non-existent context throws error', async () => {
        const context = new FlowTaskContext('/tmp/non-existent-file.json');

        try {
            await context.load();
            throw new Error('Should have thrown error');
        } catch (error) {
            if (!error.message.includes('No context file found')) {
                throw error;
            }
        }
    });

    // === STEP RECORDING TESTS ===
    console.log('\n📦 Testing Step Recording:');

    await test('Record execution step', async () => {
        testFile = path.join(testDir, `context-${Date.now()}.json`);
        const context = new FlowTaskContext(testFile);
        await context.init({ flowName: 'Test_Flow' });

        await context.recordStep('validation', { passed: true, count: 5 });

        const steps = context.get().steps;
        expect(steps).toHaveLength(1);
        expect(steps[0].stepName).toBe('validation');
        expect(steps[0].status).toBe('completed');
        expect(steps[0].data.passed).toBe(true);
        expect(context.get().status).toBe('in_progress');

        // Cleanup
        await context.clear();
    });

    await test('Record failed step', async () => {
        testFile = path.join(testDir, `context-${Date.now()}.json`);
        const context = new FlowTaskContext(testFile);
        await context.init();

        await context.recordStep('deployment', {
            error: 'Deployment failed',
            details: 'Field does not exist'
        });

        const steps = context.get().steps;
        expect(steps[0].status).toBe('failed');

        // Cleanup
        await context.clear();
    });

    await test('Record multiple steps', async () => {
        testFile = path.join(testDir, `context-${Date.now()}.json`);
        const context = new FlowTaskContext(testFile);
        await context.init();

        await context.recordStep('step1', { data: 'a' });
        await context.recordStep('step2', { data: 'b' });
        await context.recordStep('step3', { data: 'c' });

        expect(context.get().steps).toHaveLength(3);

        // Cleanup
        await context.clear();
    });

    // === CHECKPOINT TESTS ===
    console.log('\n📦 Testing Checkpoints:');

    await test('Create checkpoint', async () => {
        testFile = path.join(testDir, `context-${Date.now()}.json`);
        const context = new FlowTaskContext(testFile);
        await context.init();

        await context.recordStep('step1', {});
        await context.recordStep('step2', {});

        const checkpoint = await context.createCheckpoint('before_deploy', {
            flowVersion: 3,
            backupPath: '/tmp/backup.xml'
        });

        expect(checkpoint.checkpointName).toBe('before_deploy');
        expect(checkpoint.stepIndex).toBe(2);
        expect(checkpoint.data.flowVersion).toBe(3);

        // Cleanup
        await context.clear();
    });

    await test('Get latest checkpoint', async () => {
        testFile = path.join(testDir, `context-${Date.now()}.json`);
        const context = new FlowTaskContext(testFile);
        await context.init();

        expect(context.getLatestCheckpoint()).toBeNull();

        await context.createCheckpoint('checkpoint1', {});
        await context.createCheckpoint('checkpoint2', {});

        const latest = context.getLatestCheckpoint();
        expect(latest.checkpointName).toBe('checkpoint2');

        // Cleanup
        await context.clear();
    });

    await test('Multiple checkpoints preserve order', async () => {
        testFile = path.join(testDir, `context-${Date.now()}.json`);
        const context = new FlowTaskContext(testFile);
        await context.init();

        await context.createCheckpoint('cp1', { order: 1 });
        await context.createCheckpoint('cp2', { order: 2 });
        await context.createCheckpoint('cp3', { order: 3 });

        const checkpoints = context.get().checkpoints;
        expect(checkpoints).toHaveLength(3);
        expect(checkpoints[0].data.order).toBe(1);
        expect(checkpoints[2].data.order).toBe(3);

        // Cleanup
        await context.clear();
    });

    // === ERROR RECORDING TESTS ===
    console.log('\n📦 Testing Error Recording:');

    await test('Record error', async () => {
        testFile = path.join(testDir, `context-${Date.now()}.json`);
        const context = new FlowTaskContext(testFile);
        await context.init();

        const error = new Error('Test error');
        await context.recordError(error, 'deployment');

        const errors = context.get().errors;
        expect(errors).toHaveLength(1);
        expect(errors[0].message).toBe('Test error');
        expect(errors[0].step).toBe('deployment');
        expect(context.get().status).toBe('failed');

        // Cleanup
        await context.clear();
    });

    await test('Record multiple errors', async () => {
        testFile = path.join(testDir, `context-${Date.now()}.json`);
        const context = new FlowTaskContext(testFile);
        await context.init();

        await context.recordError(new Error('Error 1'));
        await context.recordError(new Error('Error 2'));

        expect(context.get().errors).toHaveLength(2);

        // Cleanup
        await context.clear();
    });

    // === COMPLETION TESTS ===
    console.log('\n📦 Testing Completion:');

    await test('Complete context', async () => {
        testFile = path.join(testDir, `context-${Date.now()}.json`);
        const context = new FlowTaskContext(testFile);
        await context.init();

        await context.recordStep('step1', {});
        await context.complete({ flowVersion: 4, success: true });

        expect(context.get().status).toBe('completed');
        expect(context.get().completedAt).toBeTruthy();
        expect(context.get().finalData.success).toBe(true);

        // Cleanup
        await context.clear();
    });

    // === METADATA TESTS ===
    console.log('\n📦 Testing Metadata:');

    await test('Update metadata', async () => {
        testFile = path.join(testDir, `context-${Date.now()}.json`);
        const context = new FlowTaskContext(testFile);
        await context.init({ metadata: { initial: 'value' } });

        await context.updateMetadata('customKey', 'customValue');
        await context.updateMetadata('count', 42);

        const metadata = context.get().metadata;
        expect(metadata.initial).toBe('value');
        expect(metadata.customKey).toBe('customValue');
        expect(metadata.count).toBe(42);

        // Cleanup
        await context.clear();
    });

    // === LIFECYCLE TESTS ===
    console.log('\n📦 Testing Lifecycle:');

    await test('Full lifecycle with checkpoints and errors', async () => {
        testFile = path.join(testDir, `context-${Date.now()}.json`);
        const context = new FlowTaskContext(testFile);

        // Initialize
        await context.init({ flowName: 'Complex_Flow', operation: 'deploy' });
        expect(context.get().status).toBe('initialized');

        // Record steps
        await context.recordStep('validation', { passed: true });
        expect(context.get().status).toBe('in_progress');

        // Create checkpoint
        await context.createCheckpoint('before_deploy', { version: 3 });

        // More steps
        await context.recordStep('deployment', { started: true });
        await context.recordStep('activation', { version: 4 });

        // Update metadata
        await context.updateMetadata('finalVersion', 4);

        // Complete
        await context.complete({ success: true });
        expect(context.get().status).toBe('completed');

        // Verify state
        expect(context.get().steps).toHaveLength(3);
        expect(context.get().checkpoints).toHaveLength(1);
        expect(context.get().metadata.finalVersion).toBe(4);

        // Cleanup
        await context.clear();
    });

    // === ERROR HANDLING TESTS ===
    console.log('\n📦 Testing Error Handling:');

    await test('Operations fail when context not initialized', async () => {
        const context = new FlowTaskContext('/tmp/test.json');

        try {
            await context.recordStep('test', {});
            throw new Error('Should have thrown error');
        } catch (error) {
            if (!error.message.includes('not initialized')) {
                throw error;
            }
        }

        try {
            await context.createCheckpoint('test', {});
            throw new Error('Should have thrown error');
        } catch (error) {
            if (!error.message.includes('not initialized')) {
                throw error;
            }
        }
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
  describe('Flow Task Context', () => {
    it('should pass all tests', async () => {
      expect(typeof runTests).toBe('function');
      const result = await runTests();
      expect(result).not.toBe(false);
    });
  });
}
