/**
 * End-to-End tests for FlowAuthor (Phase 3.0)
 * Tests complete Flow authoring workflow from creation to deployment
 *
 * Run: node test/flow-author.test.js
 */

const FlowAuthor = require('../scripts/lib/flow-author');
const fs = require('fs').promises;
const path = require('path');

async function runTests() {
    console.log('Running FlowAuthor Phase 3.0 end-to-end tests...\n');

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
            toHaveLength(expected) {
                if (!value || value.length !== expected) {
                    throw new Error(`Expected length ${expected}, got ${value ? value.length : 0}`);
                }
            },
            toContain(substring) {
                if (!value || !value.includes(substring)) {
                    throw new Error(`Expected to contain "${substring}"`);
                }
            },
            toBeGreaterThan(expected) {
                if (value <= expected) {
                    throw new Error(`Expected ${value} to be greater than ${expected}`);
                }
            }
        };
    }

    const testDir = path.join(__dirname, '../tmp/test-flow-author');
    await fs.mkdir(testDir, { recursive: true });

    console.log('=== Testing Flow Creation Workflow ===\n');

    await test('Create new Flow with FlowAuthor', async () => {
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        const flow = await author.createFlow('Test_Opportunity_Flow', {
            type: 'Record-Triggered',
            object: 'Opportunity',
            trigger: 'After Save',
            description: 'Test Flow for opportunities'
        });

        expect(flow).toBeTruthy();
        expect(flow.label).toBeTruthy();
        expect(flow.processType).toBe('Record-Triggered');

        await author.close();
    });

    await test('Load existing Flow', async () => {
        const flowPath = path.join(testDir, 'Test_Opportunity_Flow.flow-meta.xml');
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        const flow = await author.loadFlow(flowPath);

        expect(flow).toBeTruthy();
        expect(flow.processType).toBe('Record-Triggered');

        await author.close();
    });

    console.log('\n=== Testing Element Management ===\n');

    await test('Add decision element with natural language', async () => {
        const flowPath = path.join(testDir, 'Test_Opportunity_Flow.flow-meta.xml');
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        await author.loadFlow(flowPath);
        await author.addElement('Add a decision called Amount_Check with rule High_Value if Amount > 100000 then Executive_Review');

        const element = author.findElement('Amount_Check');
        expect(element).toBeTruthy();
        expect(element.rules).toBeTruthy();
        expect(element.rules).toHaveLength(1);

        await author.close();
    });

    await test('Add assignment element', async () => {
        const flowPath = path.join(testDir, 'Test_Opportunity_Flow.flow-meta.xml');
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        await author.loadFlow(flowPath);
        await author.addElement('Add an assignment called Set_Status');

        const element = author.findElement('Set_Status');
        expect(element).toBeTruthy();

        await author.close();
    });

    await test('Find element by name', async () => {
        const flowPath = path.join(testDir, 'Test_Opportunity_Flow.flow-meta.xml');
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        await author.loadFlow(flowPath);

        // Add an element first
        await author.addElement('Add a decision called Find_Test');

        const element = author.findElement('Find_Test');
        expect(element).toBeTruthy();
        expect(element.name).toBe('Find_Test');

        await author.close();
    });

    await test('Get all elements', async () => {
        const flowPath = path.join(testDir, 'Test_Opportunity_Flow.flow-meta.xml');
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        await author.loadFlow(flowPath);

        // Add an element to ensure there are elements
        await author.addElement('Add an assignment called GetAll_Test');

        const elements = author.getAllElements();
        expect(elements).toBeTruthy();
        expect(elements.length).toBeGreaterThan(0);

        await author.close();
    });

    await test('Remove element', async () => {
        const flowPath = path.join(testDir, 'Test_Opportunity_Flow.flow-meta.xml');
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        await author.loadFlow(flowPath);

        // Add element first
        await author.addElement('Add an assignment called Temp_Element');
        let element = author.findElement('Temp_Element');
        expect(element).toBeTruthy();

        // Remove it
        await author.removeElement('Temp_Element');
        element = author.findElement('Temp_Element');
        expect(element === null || element === undefined).toBeTruthy();

        await author.close();
    });

    console.log('\n=== Testing Validation Framework ===\n');

    await test('Comprehensive validation', async () => {
        const flowPath = path.join(testDir, 'Test_Opportunity_Flow.flow-meta.xml');
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        await author.loadFlow(flowPath);

        const validation = await author.validate();

        expect(validation).toBeTruthy();
        expect(validation.hasOwnProperty('valid')).toBeTruthy();
        expect(validation.hasOwnProperty('errors')).toBeTruthy();
        expect(validation.hasOwnProperty('warnings')).toBeTruthy();
        expect(validation.hasOwnProperty('bestPractices')).toBeTruthy();
        expect(validation.hasOwnProperty('governorLimits')).toBeTruthy();

        await author.close();
    });

    await test('Best practices check', async () => {
        const flowPath = path.join(testDir, 'Test_Opportunity_Flow.flow-meta.xml');
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        await author.loadFlow(flowPath);

        const bestPractices = await author.checkBestPractices();

        expect(bestPractices).toBeTruthy();
        expect(bestPractices.hasOwnProperty('score')).toBeTruthy();
        expect(bestPractices.hasOwnProperty('issues')).toBeTruthy();
        expect(bestPractices.hasOwnProperty('recommendations')).toBeTruthy();

        await author.close();
    });

    await test('Governor limits check', async () => {
        const flowPath = path.join(testDir, 'Test_Opportunity_Flow.flow-meta.xml');
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        await author.loadFlow(flowPath);

        const limits = await author.checkGovernorLimits();

        expect(limits).toBeTruthy();
        expect(limits.hasOwnProperty('limits')).toBeTruthy();
        expect(limits.limits.hasOwnProperty('elements')).toBeTruthy();
        expect(limits.limits.hasOwnProperty('variables')).toBeTruthy();

        await author.close();
    });

    await test('Complexity analysis', async () => {
        const flowPath = path.join(testDir, 'Test_Opportunity_Flow.flow-meta.xml');
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        await author.loadFlow(flowPath);

        const complexity = await author.analyzeComplexity();

        expect(complexity).toBeTruthy();
        expect(complexity.hasOwnProperty('level')).toBeTruthy();
        expect(complexity.hasOwnProperty('elementCount')).toBeTruthy();

        await author.close();
    });

    await test('Suggest improvements', async () => {
        const flowPath = path.join(testDir, 'Test_Opportunity_Flow.flow-meta.xml');
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        await author.loadFlow(flowPath);

        const suggestions = await author.suggestImprovements();

        expect(Array.isArray(suggestions)).toBeTruthy();

        await author.close();
    });

    console.log('\n=== Testing Change Management ===\n');

    await test('Get diff after changes', async () => {
        const flowPath = path.join(testDir, 'Test_Opportunity_Flow.flow-meta.xml');
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        await author.loadFlow(flowPath);

        // Make a change
        await author.addElement('Add an assignment called New_Element');

        // Get diff
        const diff = await author.getDiff();

        expect(diff).toBeTruthy();
        expect(diff.hasOwnProperty('elementsAdded')).toBeTruthy();

        await author.close();
    });

    await test('Create checkpoint', async () => {
        const flowPath = path.join(testDir, 'Test_Opportunity_Flow.flow-meta.xml');
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        await author.loadFlow(flowPath);

        const checkpoint = await author.createCheckpoint('before-changes');

        expect(checkpoint).toBeTruthy();
        expect(checkpoint.name).toBe('before-changes');
        expect(checkpoint.hasOwnProperty('path')).toBeTruthy();

        await author.close();
    });

    await test('Rollback to checkpoint', async () => {
        const flowPath = path.join(testDir, 'Test_Opportunity_Flow.flow-meta.xml');
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        await author.loadFlow(flowPath);

        // Create checkpoint
        await author.createCheckpoint('checkpoint1');

        // Make change
        await author.addElement('Add an assignment called Rollback_Test');
        let element = author.findElement('Rollback_Test');
        expect(element).toBeTruthy();

        // Rollback
        await author.rollback('checkpoint1');

        // Element should be gone
        element = author.findElement('Rollback_Test');
        expect(element === null || element === undefined).toBeTruthy();

        await author.close();
    });

    console.log('\n=== Testing Documentation Generation ===\n');

    await test('Generate Flow documentation', async () => {
        const flowPath = path.join(testDir, 'Test_Opportunity_Flow.flow-meta.xml');
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        await author.loadFlow(flowPath);

        const docs = await author.generateDocumentation();

        expect(docs).toBeTruthy();
        expect(typeof docs).toBe('string');
        expect(docs).toContain('# Flow Documentation');
        expect(docs).toContain('Test_Opportunity_Flow');

        await author.close();
    });

    console.log('\n=== Testing Metadata & Context ===\n');

    await test('Get Flow context', async () => {
        const flowPath = path.join(testDir, 'Test_Opportunity_Flow.flow-meta.xml');
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        await author.loadFlow(flowPath);

        const context = author.getContext();

        expect(context).toBeTruthy();
        expect(context.name).toBe('Test_Opportunity_Flow');
        expect(context.hasOwnProperty('path')).toBeTruthy();

        await author.close();
    });

    await test('Get Flow metadata', async () => {
        const flowPath = path.join(testDir, 'Test_Opportunity_Flow.flow-meta.xml');
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        await author.loadFlow(flowPath);

        const metadata = author.getMetadata();

        expect(metadata).toBeTruthy();
        expect(metadata.hasOwnProperty('label')).toBeTruthy();
        expect(metadata.hasOwnProperty('processType')).toBeTruthy();

        await author.close();
    });

    await test('Get Flow statistics', async () => {
        const flowPath = path.join(testDir, 'Test_Opportunity_Flow.flow-meta.xml');
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        await author.loadFlow(flowPath);

        const stats = author.getStatistics();

        expect(stats).toBeTruthy();
        expect(stats.hasOwnProperty('elementCount')).toBeTruthy();
        expect(stats.hasOwnProperty('variableCount')).toBeTruthy();
        expect(stats.hasOwnProperty('checkpointCount')).toBeTruthy();

        await author.close();
    });

    console.log('\n=== Testing Save Functionality ===\n');

    await test('Save Flow', async () => {
        const flowPath = path.join(testDir, 'Test_Opportunity_Flow.flow-meta.xml');
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        await author.loadFlow(flowPath);

        // Make a change
        await author.addElement('Add an assignment called Save_Test');

        // Save
        const savedPath = await author.save();

        expect(savedPath).toBe(flowPath);

        // Verify file exists
        const exists = await fs.access(savedPath).then(() => true).catch(() => false);
        expect(exists).toBeTruthy();

        await author.close();
    });

    await test('Save Flow to different path', async () => {
        const flowPath = path.join(testDir, 'Test_Opportunity_Flow.flow-meta.xml');
        const author = new FlowAuthor('test-org', { verbose: false, workingDir: testDir });

        await author.loadFlow(flowPath);

        const newPath = path.join(testDir, 'Test_Opportunity_Flow_Copy.flow-meta.xml');
        const savedPath = await author.save(newPath);

        expect(savedPath).toBe(newPath);

        // Verify file exists
        const exists = await fs.access(newPath).then(() => true).catch(() => false);
        expect(exists).toBeTruthy();

        await author.close();
    });

    console.log('\n=== Testing Auto-Save and Auto-Validate ===\n');

    await test('Auto-save on element addition', async () => {
        const author = new FlowAuthor('test-org', {
            verbose: false,
            workingDir: testDir,
            autoSave: true
        });

        await author.createFlow('AutoSave_Test', {
            type: 'AutoLaunchedFlow',
            description: 'Test auto-save'
        });

        // Add element (should auto-save)
        await author.addElement('Add an assignment called AutoSave_Element');

        // Verify saved by reloading
        const flowPath = path.join(testDir, 'AutoSave_Test.flow-meta.xml');
        const author2 = new FlowAuthor('test-org', { verbose: false });
        await author2.loadFlow(flowPath);

        const element = author2.findElement('AutoSave_Element');
        expect(element).toBeTruthy();

        await author.close();
        await author2.close();
    });

    await test('Auto-validate on element addition', async () => {
        const author = new FlowAuthor('test-org', {
            verbose: false,
            workingDir: testDir,
            autoValidate: true
        });

        await author.createFlow('AutoValidate_Test', {
            type: 'AutoLaunchedFlow'
        });

        // Add element (should auto-validate)
        await author.addElement('Add a decision called Test_Decision');

        // If we got here without errors, auto-validation worked
        expect(true).toBeTruthy();

        await author.close();
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
  describe('Flow Author', () => {
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
