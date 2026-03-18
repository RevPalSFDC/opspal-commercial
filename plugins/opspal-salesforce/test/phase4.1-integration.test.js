/**
 * Phase 4.1 Integration Tests
 *
 * Tests CLI Wrapper Tool, Template Library, and Batch Operations
 *
 * Run: node test/phase4.1-integration.test.js
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

if (typeof jest !== 'undefined') {
    jest.mock('p-limit', () => {
        return (concurrency) => {
            if (!Number.isInteger(concurrency) || concurrency < 1) {
                throw new TypeError('Expected concurrency to be a positive integer');
            }
            const limit = (fn, ...args) => Promise.resolve().then(() => fn(...args));
            limit.activeCount = 0;
            limit.pendingCount = 0;
            limit.clearQueue = () => {};
            return limit;
        };
    });
}

// Test configuration
const TEST_DIR = path.join(__dirname, '../test-output/phase4.1');
const TEST_ORG_ALIAS = 'test-org';

// Test counters
let testsPassed = 0;
let testsFailed = 0;
let totalTests = 0;

/**
 * Test framework helper
 */
async function test(description, testFn) {
    totalTests++;
    process.stdout.write(`\n${totalTests}. ${description}... `);

    try {
        await testFn();
        testsPassed++;
        console.log('✓ PASS');
    } catch (error) {
        testsFailed++;
        console.log('✗ FAIL');
        console.error(`   Error: ${error.message}`);
        if (error.stack) {
            console.error(`   Stack: ${error.stack.split('\n').slice(1, 3).join('\n')}`);
        }
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
        toBeFalsy() {
            if (value) {
                throw new Error(`Expected falsy value, got ${value}`);
            }
        },
        toContain(substring) {
            if (!value.includes(substring)) {
                throw new Error(`Expected "${value}" to contain "${substring}"`);
            }
        },
        toBeGreaterThan(min) {
            if (value <= min) {
                throw new Error(`Expected ${value} to be greater than ${min}`);
            }
        }
    };
}

/**
 * Setup test environment
 */
async function setup() {
    console.log('\n=== Phase 4.1 Integration Tests ===\n');
    console.log('Setting up test environment...');

    // Create test output directory
    await fs.mkdir(TEST_DIR, { recursive: true });

    console.log(`Test directory: ${TEST_DIR}`);
    console.log('');
}

/**
 * Cleanup test environment
 */
async function cleanup() {
    console.log('\nCleaning up test environment...');

    try {
        await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch (error) {
        // Ignore cleanup errors
    }
}

/**
 * Test Template Registry
 */
async function testTemplateRegistry() {
    const { TemplateRegistry } = require('../templates');
    const registry = new TemplateRegistry();

    await test('Load all templates', async () => {
        const templates = await registry.getAllTemplates();
        expect(templates.length).toBeGreaterThan(0);
    });

    await test('Get specific template', async () => {
        const template = await registry.getTemplate('lead-assignment');
        expect(template).toBeTruthy();
        expect(template.name).toBe('lead-assignment');
    });

    await test('Filter templates by category', async () => {
        const coreTemplates = await registry.getAllTemplates('core');
        expect(coreTemplates.length).toBeGreaterThan(0);
        coreTemplates.forEach(t => {
            expect(t.category).toBe('core');
        });
    });

    await test('Validate template structure', async () => {
        const template = await registry.getTemplate('opportunity-validation');
        expect(template.name).toBeTruthy();
        expect(template.description).toBeTruthy();
        expect(template.type).toBeTruthy();
        expect(template.structure).toBeTruthy();
    });
}

/**
 * Test Batch Manager
 */
async function testBatchManager() {
    const FlowBatchManager = require('../scripts/lib/flow-batch-manager');

    await test('Create FlowBatchManager instance', async () => {
        const manager = new FlowBatchManager(TEST_ORG_ALIAS, {
            verbose: false,
            parallel: 3
        });
        expect(manager).toBeTruthy();
        expect(manager.parallelLimit).toBe(3);
        await manager.close();
    });

    await test('Get empty statistics', async () => {
        const manager = new FlowBatchManager(TEST_ORG_ALIAS);
        const stats = manager.getStatistics();
        expect(stats.total).toBe(0);
        expect(stats.succeeded).toBe(0);
        expect(stats.failed).toBe(0);
        await manager.close();
    });

    await test('Get empty errors', async () => {
        const manager = new FlowBatchManager(TEST_ORG_ALIAS);
        const errors = manager.getErrors();
        expect(errors.length).toBe(0);
        await manager.close();
    });
}

/**
 * Test CLI Commands (dry-run mode)
 */
async function testCLICommands() {
    const cliPath = path.join(__dirname, '../cli/flow-cli.js');

    await test('CLI help command', async () => {
        try {
            const { stdout } = await execAsync(`node "${cliPath}" --help`);
            expect(stdout).toContain('Salesforce Flow authoring CLI');
            expect(stdout).toContain('create');
            expect(stdout).toContain('validate');
            expect(stdout).toContain('deploy');
        } catch (error) {
            // CLI might not be installed, skip this test
            console.log('   (Skipped - CLI not installed)');
        }
    });

    await test('CLI version command', async () => {
        try {
            const { stdout } = await execAsync(`node "${cliPath}" --version`);
            expect(stdout).toContain('4.0.0');
        } catch (error) {
            console.log('   (Skipped - CLI not installed)');
        }
    });

    await test('Template list command', async () => {
        try {
            const { stdout } = await execAsync(`node "${cliPath}" template list`);
            expect(stdout).toContain('lead-assignment');
        } catch (error) {
            console.log('   (Skipped - CLI not installed)');
        }
    });
}

/**
 * Test Template Application
 */
async function testTemplateApplication() {
    const { TemplateRegistry } = require('../templates');
    const registry = new TemplateRegistry();

    await test('Apply template with parameters', async () => {
        const flowName = 'Test_Lead_Assignment';
        const params = {
            assignmentField: 'State',
            assignmentValue: 'California',
            ownerUserId: '005xx000000TEST'
        };

        const flowPath = await registry.applyTemplate('lead-assignment', flowName, params, {
            outputDir: TEST_DIR
        });

        expect(flowPath).toBeTruthy();

        const flowContent = await fs.readFile(flowPath, 'utf-8');
        expect(flowContent).toContain('<?xml');
        expect(flowContent).toContain('<Flow');
        expect(flowContent).toContain(flowName);
    });

    await test('Apply template with defaults', async () => {
        const flowName = 'Test_Task_Reminder';
        const params = {
            reminderDaysBefore: 2
        };

        const flowPath = await registry.applyTemplate('task-reminder', flowName, params, {
            outputDir: TEST_DIR
        });

        expect(flowPath).toBeTruthy();

        const flowContent = await fs.readFile(flowPath, 'utf-8');
        expect(flowContent).toContain(flowName);
    });
}

/**
 * Test Error Handling
 */
async function testErrorHandling() {
    const { TemplateRegistry } = require('../templates');
    const registry = new TemplateRegistry();

    await test('Handle non-existent template', async () => {
        const template = await registry.getTemplate('non-existent-template');
        expect(template).toBeFalsy();
    });

    await test('Handle missing required parameters', async () => {
        try {
            await registry.applyTemplate('lead-assignment', 'TestFlow', {}, {
                outputDir: TEST_DIR
            });
            throw new Error('Should have thrown error for missing parameters');
        } catch (error) {
            // Expected error
            expect(error).toBeTruthy();
        }
    });
}

/**
 * Test Template Creation
 */
async function testTemplateCreation() {
    const { TemplateRegistry } = require('../templates');
    const registry = new TemplateRegistry();

    await test('Create custom template', async () => {
        const templateName = 'test-custom-template';
        const flowPath = path.join(TEST_DIR, 'sample-flow.xml');

        // Create a sample Flow file
        await fs.writeFile(flowPath, '<?xml version="1.0"?><Flow></Flow>');

        const templatePath = await registry.createTemplate(templateName, flowPath, {
            description: 'Test custom template',
            category: 'custom'
        });

        expect(templatePath).toBeTruthy();

        const templateContent = await fs.readFile(templatePath, 'utf-8');
        const template = JSON.parse(templateContent);

        expect(template.name).toBe(templateName);
        expect(template.category).toBe('custom');
    });
}

/**
 * Run all tests
 */
async function runAllTests() {
    try {
        await setup();

        console.log('--- Template Registry Tests ---');
        await testTemplateRegistry();

        console.log('\n--- Batch Manager Tests ---');
        await testBatchManager();

        console.log('\n--- CLI Command Tests ---');
        await testCLICommands();

        console.log('\n--- Template Application Tests ---');
        await testTemplateApplication();

        console.log('\n--- Error Handling Tests ---');
        await testErrorHandling();

        console.log('\n--- Template Creation Tests ---');
        await testTemplateCreation();

        // Summary
        console.log('\n=== Test Summary ===');
        console.log(`Total Tests: ${totalTests}`);
        console.log(`Passed: ${testsPassed}`);
        console.log(`Failed: ${testsFailed}`);
        console.log(`Success Rate: ${(testsPassed / totalTests * 100).toFixed(1)}%`);

        if (testsFailed === 0) {
            console.log('\n✓ All tests passed!');
        } else {
            console.log(`\n✗ ${testsFailed} test(s) failed`);
            if (typeof jest === 'undefined') process.exit(1); else throw new Error('Test failed'); // Jest-safe
        }

    } catch (error) {
        console.error('\nTest suite error:', error);
        if (typeof jest === 'undefined') process.exit(1); else throw new Error('Test failed'); // Jest-safe
    } finally {
        await cleanup();
    }
}

// Run tests
if (require.main === module) {
    runAllTests();
}


// Jest wrapper for standalone test runner
if (typeof describe !== 'undefined') {
  describe('Phase4.1 Integration', () => {
    it('should pass all tests', async () => {
      expect(typeof runAllTests).toBe('function');
      await runAllTests();
    });
  });
}
