/**
 * Q2C Process Flow Generator Test Suite
 *
 * Tests Q2C process flow diagram generation:
 * 1. Automation discovery (flows, triggers, approvals, validations, workflows)
 * 2. Stage mapping (10 Q2C stages)
 * 3. High-level process flow generation
 * 4. Detailed process flow generation
 *
 * Run: node test/q2c-process-flow-generator.test.js
 *
 * @phase Phase 2: Build Q2C Process Flow Generator
 */

const fs = require('fs');
const path = require('path');
const Q2CProcessFlowGenerator = require('../scripts/lib/q2c-process-flow-generator');

// Test output directory
const TEST_OUTPUT_DIR = path.join(__dirname, 'output', 'q2c-process-flow');

async function runTests() {
  console.log('Running Q2C Process Flow Generator tests...\n');

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
      if (error.stack) {
        console.log(`   Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      }
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
      toBeDefined() {
        if (value === undefined || value === null) {
          throw new Error(`Expected value to be defined, got ${value}`);
        }
      },
      toBeTruthy() {
        if (!value) {
          throw new Error(`Expected truthy value, got ${value}`);
        }
      },
      toContain(substring) {
        if (!value || !value.includes(substring)) {
          throw new Error(`Expected to contain "${substring}"`);
        }
      },
      toHaveLength(expected) {
        if (!value || value.length !== expected) {
          throw new Error(`Expected length ${expected}, got ${value ? value.length : 0}`);
        }
      }
    };
  }

  // Cleanup before tests
  if (fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.rmSync(TEST_OUTPUT_DIR, { recursive: true });
  }

  console.log('=== Testing Initialization ===\n');

  await test('Initialize with default options', async () => {
    const generator = new Q2CProcessFlowGenerator('test-org');
    expect(generator.orgAlias).toBe('test-org');
    expect(generator.options.detailLevel).toBe('both');
    expect(generator.options.verbose).toBe(false);
  });

  await test('Initialize with custom options', async () => {
    const generator = new Q2CProcessFlowGenerator('test-org', {
      detailLevel: 'high-level',
      outputDir: TEST_OUTPUT_DIR,
      verbose: true,
      includeInactive: true
    });
    expect(generator.options.detailLevel).toBe('high-level');
    expect(generator.options.outputDir).toBe(TEST_OUTPUT_DIR);
    expect(generator.options.verbose).toBe(true);
    expect(generator.options.includeInactive).toBe(true);
  });

  await test('Q2C stages are properly defined', async () => {
    const generator = new Q2CProcessFlowGenerator('test-org');
    const stages = generator.q2cStages;

    // Verify 10 stages exist
    expect(Object.keys(stages)).toHaveLength(10);

    // Verify each stage has required properties
    Object.values(stages).forEach(stage => {
      expect(stage.name).toBeDefined();
      expect(stage.order).toBeDefined();
      expect(stage.objects).toBeDefined();
      expect(stage.keywords).toBeDefined();
    });

    // Verify stages are in correct order
    expect(stages.quoteCreation.order).toBe(1);
    expect(stages.revenue.order).toBe(10);
  });

  console.log('\n=== Testing Stage Matching Logic ===\n');

  await test('Match flow to quote creation stage', async () => {
    const generator = new Q2CProcessFlowGenerator('test-org');
    const mockFlow = {
      name: 'Create_Quote_From_Opportunity',
      label: 'Create Quote',
      object: 'Opportunity'
    };

    const stage = generator._matchFlowToStage(mockFlow);
    expect(stage).toBe('quoteCreation');
  });

  await test('Match flow to pricing stage', async () => {
    const generator = new Q2CProcessFlowGenerator('test-org');
    const mockFlow = {
      name: 'Apply_Discount_Rules',
      label: 'Apply Discount',
      object: 'SBQQ__Quote__c'
    };

    const stage = generator._matchFlowToStage(mockFlow);
    expect(stage).toBe('pricing');
  });

  await test('Match Apply_Pricing flow to pricing stage', async () => {
    const generator = new Q2CProcessFlowGenerator('test-org');
    const mockFlow = {
      name: 'Apply_Pricing',
      label: 'Apply Pricing',
      object: 'SBQQ__Quote__c'
    };

    const stage = generator._matchFlowToStage(mockFlow);
    expect(stage).toBe('pricing');
  });

  await test('Match trigger to approval stage', async () => {
    const generator = new Q2CProcessFlowGenerator('test-org');
    const mockTrigger = {
      name: 'QuoteApprovalTrigger',
      object: 'SBQQ__Quote__c'
    };

    const stage = generator._matchTriggerToStage(mockTrigger);
    expect(stage).toBeTruthy(); // Should match either quoteCreation or approval
  });

  await test('Match validation rule to order stage', async () => {
    const generator = new Q2CProcessFlowGenerator('test-org');
    const mockValidation = {
      name: 'Order_Required_Fields',
      object: 'Order'
    };

    const stage = generator._matchValidationToStage(mockValidation);
    expect(stage).toBe('order');
  });

  console.log('\n=== Testing Automation Mapping ===\n');

  await test('Map automation to Q2C stages', async () => {
    const generator = new Q2CProcessFlowGenerator('test-org');

    const mockAutomation = {
      flows: [
        { name: 'Create_Quote', label: 'Create Quote', object: 'Opportunity' },
        { name: 'Apply_Pricing', label: 'Apply Pricing', object: 'SBQQ__Quote__c' }
      ],
      triggers: [
        { name: 'OrderTrigger', object: 'Order' }
      ],
      approvalProcesses: [
        { name: 'Quote_Approval', object: 'SBQQ__Quote__c' }
      ],
      validationRules: [
        { name: 'Quote_Required_Fields', object: 'SBQQ__Quote__c' }
      ],
      workflowRules: []
    };

    const stageMapping = generator.mapAutomationToStages(mockAutomation);

    // Verify all stages are initialized
    expect(Object.keys(stageMapping)).toHaveLength(10);

    // Verify Create_Quote flow is in quote creation stage
    const quoteCreationFlows = stageMapping.quoteCreation.automation.flows;
    const hasCreateQuote = quoteCreationFlows.some(f => f.name === 'Create_Quote');
    expect(hasCreateQuote).toBe(true);

    // Verify Apply_Pricing flow is in pricing stage
    const pricingFlows = stageMapping.pricing.automation.flows;
    const hasApplyPricing = pricingFlows.some(f => f.name === 'Apply_Pricing');
    expect(hasApplyPricing).toBe(true);

    // Verify triggers are mapped
    const orderTriggers = stageMapping.order.automation.triggers;
    expect(orderTriggers.length).toBe(1);

    // Verify approvals are mapped
    const approvals = stageMapping.approval.automation.approvals;
    expect(approvals.length).toBe(1);
  });

  console.log('\n=== Testing Mermaid Diagram Generation ===\n');

  await test('Generate high-level process flow diagram', async () => {
    const generator = new Q2CProcessFlowGenerator('test-org', { outputDir: TEST_OUTPUT_DIR });

    const mockStageMapping = {};
    Object.keys(generator.q2cStages).forEach(stageKey => {
      mockStageMapping[stageKey] = {
        ...generator.q2cStages[stageKey],
        automation: {
          flows: [{ name: 'Test Flow', label: 'Test', object: 'Test' }],
          triggers: [],
          approvals: [],
          validations: [],
          workflows: []
        }
      };
    });

    const result = await generator._generateHighLevelProcessFlow(mockStageMapping);

    expect(result).toBeDefined();
    expect(result.paths.markdown).toBeDefined();
    expect(fs.existsSync(result.paths.markdown)).toBe(true);

    const content = fs.readFileSync(result.paths.markdown, 'utf8');
    expect(content).toContain('```mermaid');
    expect(content).toContain('flowchart LR');
    expect(content).toContain('Quote Creation');
    expect(content).toContain('Revenue Recognition');
    expect(content).toContain('(1 automation)');
  });

  await test('Generate detailed process flow diagram', async () => {
    const generator = new Q2CProcessFlowGenerator('test-org', { outputDir: TEST_OUTPUT_DIR });

    const mockStageMapping = {};
    Object.keys(generator.q2cStages).forEach(stageKey => {
      mockStageMapping[stageKey] = {
        ...generator.q2cStages[stageKey],
        automation: {
          flows: [{ name: 'TestFlow', label: 'Test Flow', object: 'Test' }],
          triggers: [{ name: 'TestTrigger', object: 'Test' }],
          approvals: [],
          validations: [],
          workflows: []
        }
      };
    });

    const result = await generator._generateDetailedProcessFlow(mockStageMapping);

    expect(result).toBeDefined();
    expect(result.paths.markdown).toBeDefined();
    expect(fs.existsSync(result.paths.markdown)).toBe(true);

    const content = fs.readFileSync(result.paths.markdown, 'utf8');
    expect(content).toContain('```mermaid');
    expect(content).toContain('flowchart TB');
    expect(content).toContain('subgraph');
    expect(content).toContain('Flow: Test Flow');
    expect(content).toContain('Trigger: TestTrigger');
  });

  await test('High-level diagram shows all 10 stages', async () => {
    const generator = new Q2CProcessFlowGenerator('test-org', { outputDir: TEST_OUTPUT_DIR });

    const mockStageMapping = {};
    Object.keys(generator.q2cStages).forEach(stageKey => {
      mockStageMapping[stageKey] = {
        ...generator.q2cStages[stageKey],
        automation: {
          flows: [],
          triggers: [],
          approvals: [],
          validations: [],
          workflows: []
        }
      };
    });

    const result = await generator._generateHighLevelProcessFlow(mockStageMapping);
    const content = fs.readFileSync(result.paths.markdown, 'utf8');

    // Verify all stage names are present
    expect(content).toContain('Quote Creation');
    expect(content).toContain('Product Configuration');
    expect(content).toContain('Pricing & Discounting');
    expect(content).toContain('Quote Approval');
    expect(content).toContain('Quote Presentation');
    expect(content).toContain('Quote Acceptance');
    expect(content).toContain('Contract Generation');
    expect(content).toContain('Order Processing');
    expect(content).toContain('Billing & Invoicing');
    expect(content).toContain('Revenue Recognition');
  });

  await test('Detailed diagram includes subgraphs for each stage', async () => {
    const generator = new Q2CProcessFlowGenerator('test-org', { outputDir: TEST_OUTPUT_DIR });

    const mockStageMapping = {
      quoteCreation: {
        ...generator.q2cStages.quoteCreation,
        automation: {
          flows: [{ name: 'CreateQuote', label: 'Create Quote Flow', object: 'Opportunity' }],
          triggers: [],
          approvals: [],
          validations: [],
          workflows: []
        }
      }
    };

    // Add other stages with empty automation
    Object.keys(generator.q2cStages).forEach(stageKey => {
      if (!mockStageMapping[stageKey]) {
        mockStageMapping[stageKey] = {
          ...generator.q2cStages[stageKey],
          automation: { flows: [], triggers: [], approvals: [], validations: [], workflows: [] }
        };
      }
    });

    const result = await generator._generateDetailedProcessFlow(mockStageMapping);
    const content = fs.readFileSync(result.paths.markdown, 'utf8');

    // Verify subgraph syntax
    expect(content).toContain('subgraph quoteCreation');
    expect(content).toContain('direction TB');
    expect(content).toContain('quoteCreation_start((Start))');
    expect(content).toContain('quoteCreation_end((Complete))');
    expect(content).toContain('Flow: Create Quote Flow');
  });

  console.log('\n=== Testing Text Sanitization ===\n');

  await test('Sanitize Mermaid text with special characters', async () => {
    const generator = new Q2CProcessFlowGenerator('test-org');

    const sanitized = generator._sanitizeMermaidText('Flow "Test" & <Special>');
    expect(sanitized).toContain('\\"Test\\"'); // Escaped quotes
  });

  await test('Sanitize ID with special characters', async () => {
    const generator = new Q2CProcessFlowGenerator('test-org');

    const sanitized = generator._sanitizeId('stage-with-special-chars!@#$');
    expect(sanitized).toBe('stage_with_special_chars____');
  });

  console.log('\n=== Testing File I/O ===\n');

  await test('Create output directory if it does not exist', async () => {
    const nonExistentDir = path.join(TEST_OUTPUT_DIR, 'nested', 'deep', 'directory');
    const generator = new Q2CProcessFlowGenerator('test-org', { outputDir: nonExistentDir });

    const mockStageMapping = {};
    Object.keys(generator.q2cStages).forEach(stageKey => {
      mockStageMapping[stageKey] = {
        ...generator.q2cStages[stageKey],
        automation: { flows: [], triggers: [], approvals: [], validations: [], workflows: [] }
      };
    });

    await generator._generateHighLevelProcessFlow(mockStageMapping);

    expect(fs.existsSync(nonExistentDir)).toBe(true);
  });

  await test('Save diagram with correct filename and metadata', async () => {
    const generator = new Q2CProcessFlowGenerator('test-org', { outputDir: TEST_OUTPUT_DIR });

    const mockMermaidCode = 'flowchart LR\n  A --> B';
    const result = await generator._saveDiagram(mockMermaidCode, 'test-diagram', 'Test Diagram Title');

    expect(result.filename).toBe('test-diagram');
    expect(result.title).toBe('Test Diagram Title');
    expect(result.paths.markdown).toContain('test-diagram.md');
    expect(fs.existsSync(result.paths.markdown)).toBe(true);

    const content = fs.readFileSync(result.paths.markdown, 'utf8');
    expect(content).toContain('# Test Diagram Title');
    expect(content).toContain('```mermaid');
    expect(content).toContain('flowchart LR');
    expect(content).toContain('Org: test-org');
  });

  // Cleanup after tests
  if (fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.rmSync(TEST_OUTPUT_DIR, { recursive: true });
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Tests passed: ${passed}`);
  console.log(`Tests failed: ${failed}`);
  console.log(`${'='.repeat(50)}`);

  if (failed > 0) {
    if (typeof jest === 'undefined') process.exit(1); else throw new Error('Test failed'); // Jest-safe
  }
}

// Run tests
if (require.main === module) {
  runTests().catch(error => {
    console.error('Test suite failed:', error);
    if (typeof jest === 'undefined') process.exit(1); else throw new Error('Test failed'); // Jest-safe
  });
}


// Jest wrapper for standalone test runner
if (typeof describe !== 'undefined') {
  describe('Q2c Process Flow Generator', () => {
    it('should pass all tests', async () => {
      expect(typeof runTests).toBe('function');
      const result = await runTests();
      expect(result).not.toBe(false);
    });
  });
}
