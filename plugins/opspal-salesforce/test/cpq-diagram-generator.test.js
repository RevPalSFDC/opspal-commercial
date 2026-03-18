/**
 * CPQ Diagram Generator Test Suite
 *
 * Tests all CPQ diagram generation capabilities:
 * 1. Pricing Logic Flowchart
 * 2. Quote Lifecycle State Diagram
 * 3. Subscription Renewal Flow
 * 4. Product Bundle Configuration Tree
 *
 * Run: node test/cpq-diagram-generator.test.js
 *
 * @phase Phase 1: Extract & Modularize Existing CPQ Diagram Code
 */

const fs = require('fs');
const path = require('path');
const CPQDiagramGenerator = require('../scripts/lib/cpq-diagram-generator');

// Test output directory
const TEST_OUTPUT_DIR = path.join(__dirname, 'output', 'cpq-diagrams');

async function runTests() {
  console.log('Running CPQ Diagram Generator tests...\n');

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
      toBeUndefined() {
        if (value !== undefined) {
          throw new Error(`Expected value to be undefined, got ${value}`);
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
      }
    };
  }

  // Cleanup before tests
  if (fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.rmSync(TEST_OUTPUT_DIR, { recursive: true });
  }

  console.log('=== Testing Initialization ===\n');

  await test('Initialize with default options', async () => {
    const generator = new CPQDiagramGenerator();
    expect(generator.options.detailLevel).toBe('both');
    expect(generator.options.outputDir).toBe('./diagrams');
    expect(generator.options.saveAsMarkdown).toBe(true);
    expect(generator.options.saveMermaidOnly).toBe(false);
  });

  await test('Initialize with custom options', async () => {
    const generator = new CPQDiagramGenerator({
      detailLevel: 'high-level',
      outputDir: TEST_OUTPUT_DIR,
      saveAsMarkdown: false,
      saveMermaidOnly: true
    });
    expect(generator.options.detailLevel).toBe('high-level');
    expect(generator.options.outputDir).toBe(TEST_OUTPUT_DIR);
    expect(generator.options.saveAsMarkdown).toBe(false);
    expect(generator.options.saveMermaidOnly).toBe(true);
  });

  console.log('\n=== Testing Pricing Logic Flowchart ===\n');

  const mockPriceRules = [
    {
      id: 'rule1',
      name: 'Base Price Rule',
      evaluationOrder: 1,
      conditions: ['Product Code = PROD-001'],
      actions: [{ id: 'action1', type: 'Set Price', targetField: 'Unit Price' }]
    },
    {
      id: 'rule2',
      name: 'Volume Discount',
      evaluationOrder: 2,
      conditions: ['Quantity > 100'],
      actions: [{ id: 'action2', type: 'Apply Discount', targetField: 'Discount Percentage' }]
    },
    {
      id: 'rule3',
      name: 'Partner Markup',
      evaluationOrder: 3,
      conditions: [],
      actions: [{ id: 'action3', type: 'Apply Markup', targetField: 'Partner Margin' }]
    }
  ];

  const mockPriceActions = [
    { id: 'action1', type: 'Set Price', targetField: 'Unit Price' },
    { id: 'action2', type: 'Apply Discount', targetField: 'Discount Percentage' },
    { id: 'action3', type: 'Apply Markup', targetField: 'Partner Margin' }
  ];

  await test('Generate high-level pricing flowchart', async () => {
    const generator = new CPQDiagramGenerator({ outputDir: TEST_OUTPUT_DIR });
    const result = await generator.generatePricingLogicFlowchart(
      mockPriceRules,
      mockPriceActions,
      { detailLevel: 'high-level' }
    );

    expect(result.highLevel).toBeDefined();
    expect(result.highLevel.paths.markdown).toContain('pricing-logic-flowchart-overview.md');
    expect(fs.existsSync(result.highLevel.paths.markdown)).toBe(true);

    const content = fs.readFileSync(result.highLevel.paths.markdown, 'utf8');
    expect(content).toContain('```mermaid');
    expect(content).toContain('flowchart TB');
    expect(content).toContain('Product Selected');
    expect(content).toContain('Final Price');
  });

  await test('Generate detailed pricing flowchart', async () => {
    const generator = new CPQDiagramGenerator({ outputDir: TEST_OUTPUT_DIR });
    const result = await generator.generatePricingLogicFlowchart(
      mockPriceRules,
      mockPriceActions,
      { detailLevel: 'detailed' }
    );

    expect(result.detailed).toBeDefined();
    expect(result.detailed.paths.markdown).toContain('pricing-logic-flowchart-detailed.md');
    expect(fs.existsSync(result.detailed.paths.markdown)).toBe(true);

    const content = fs.readFileSync(result.detailed.paths.markdown, 'utf8');
    expect(content).toContain('Base Price Rule');
    expect(content).toContain('Volume Discount');
    expect(content).toContain('Partner Markup');
    expect(content).toContain('Order: 1');
    expect(content).toContain('Order: 2');
  });

  await test('Generate both high-level and detailed pricing flowcharts', async () => {
    const generator = new CPQDiagramGenerator({ outputDir: TEST_OUTPUT_DIR });
    const result = await generator.generatePricingLogicFlowchart(
      mockPriceRules,
      mockPriceActions,
      { detailLevel: 'both' }
    );

    expect(result.highLevel).toBeDefined();
    expect(result.detailed).toBeDefined();
    expect(fs.existsSync(result.highLevel.paths.markdown)).toBe(true);
    expect(fs.existsSync(result.detailed.paths.markdown)).toBe(true);
  });

  console.log('\n=== Testing Quote Lifecycle State Diagram ===\n');

  const mockQuotesByStatus = {
    'Draft': 45,
    'In Review': 12,
    'Approved': 8,
    'Presented': 5,
    'Accepted': 3,
    'Rejected': 2
  };

  await test('Generate high-level quote lifecycle diagram', async () => {
    const generator = new CPQDiagramGenerator({ outputDir: TEST_OUTPUT_DIR });
    const result = await generator.generateQuoteLifecycleStateDiagram(
      mockQuotesByStatus,
      { detailLevel: 'high-level' }
    );

    expect(result.highLevel).toBeDefined();
    expect(result.highLevel.paths.markdown).toContain('quote-lifecycle-state-diagram-overview.md');
    expect(fs.existsSync(result.highLevel.paths.markdown)).toBe(true);

    const content = fs.readFileSync(result.highLevel.paths.markdown, 'utf8');
    expect(content).toContain('```mermaid');
    expect(content).toContain('stateDiagram-v2');
    expect(content).toContain('Draft');
  });

  await test('Generate detailed quote lifecycle diagram', async () => {
    const generator = new CPQDiagramGenerator({ outputDir: TEST_OUTPUT_DIR });
    const result = await generator.generateQuoteLifecycleStateDiagram(
      mockQuotesByStatus,
      { detailLevel: 'detailed' }
    );

    expect(result.detailed).toBeDefined();
    expect(result.detailed.paths.markdown).toContain('quote-lifecycle-state-diagram-detailed.md');
    expect(fs.existsSync(result.detailed.paths.markdown)).toBe(true);

    const content = fs.readFileSync(result.detailed.paths.markdown, 'utf8');
    expect(content).toContain('45 quotes');
    expect(content).toContain('12 quotes');
  });

  console.log('\n=== Testing Subscription Renewal Flow ===\n');

  const mockRenewalConfig = {
    renewalWindowDays: 30,
    hasCustomRenewalFlow: true
  };

  await test('Generate high-level renewal flow', async () => {
    const generator = new CPQDiagramGenerator({ outputDir: TEST_OUTPUT_DIR });
    const result = await generator.generateSubscriptionRenewalFlow(
      mockRenewalConfig,
      { detailLevel: 'high-level' }
    );

    expect(result.highLevel).toBeDefined();
    expect(result.highLevel.paths.markdown).toContain('subscription-renewal-flow-overview.md');
    expect(fs.existsSync(result.highLevel.paths.markdown)).toBe(true);

    const content = fs.readFileSync(result.highLevel.paths.markdown, 'utf8');
    expect(content).toContain('```mermaid');
    expect(content).toContain('sequenceDiagram');
    expect(content).toContain('30 days before expiry');
  });

  await test('Generate detailed renewal flow', async () => {
    const generator = new CPQDiagramGenerator({ outputDir: TEST_OUTPUT_DIR });
    const result = await generator.generateSubscriptionRenewalFlow(
      mockRenewalConfig,
      { detailLevel: 'detailed' }
    );

    expect(result.detailed).toBeDefined();
    expect(result.detailed.paths.markdown).toContain('subscription-renewal-flow-detailed.md');
    expect(fs.existsSync(result.detailed.paths.markdown)).toBe(true);

    const content = fs.readFileSync(result.detailed.paths.markdown, 'utf8');
    expect(content).toContain('participant Customer');
    expect(content).toContain('participant SalesforceCPQ');
    expect(content).toContain('participant PricingEngine');
  });

  console.log('\n=== Testing Product Bundle Configuration Tree ===\n');

  const mockBundles = [
    {
      id: 'bundle1',
      name: 'Enterprise Package',
      options: [
        { id: 'opt1', name: 'Core Features', required: true },
        { id: 'opt2', name: 'Advanced Analytics', required: false },
        { id: 'opt3', name: 'Premium Support', required: false }
      ],
      features: [
        { id: 'feat1', name: 'API Access', parentOption: 'opt1', priceAdjustment: 0 },
        { id: 'feat2', name: 'Custom Reports', parentOption: 'opt2', priceAdjustment: 500 },
        { id: 'feat3', name: '24/7 Support', parentOption: 'opt3', priceAdjustment: 1000 }
      ]
    }
  ];

  await test('Generate high-level bundle tree', async () => {
    const generator = new CPQDiagramGenerator({ outputDir: TEST_OUTPUT_DIR });
    const result = await generator.generateProductBundleTree(
      mockBundles,
      { detailLevel: 'high-level' }
    );

    expect(result.highLevel).toBeDefined();
    expect(result.highLevel.paths.markdown).toContain('product-bundle-configuration-overview.md');
    expect(fs.existsSync(result.highLevel.paths.markdown)).toBe(true);

    const content = fs.readFileSync(result.highLevel.paths.markdown, 'utf8');
    expect(content).toContain('```mermaid');
    expect(content).toContain('flowchart TB');
    expect(content).toContain('Enterprise Package');
  });

  await test('Generate detailed bundle tree', async () => {
    const generator = new CPQDiagramGenerator({ outputDir: TEST_OUTPUT_DIR });
    const result = await generator.generateProductBundleTree(
      mockBundles,
      { detailLevel: 'detailed' }
    );

    expect(result.detailed).toBeDefined();
    expect(result.detailed.paths.markdown).toContain('product-bundle-configuration-detailed.md');
    expect(fs.existsSync(result.detailed.paths.markdown)).toBe(true);

    const content = fs.readFileSync(result.detailed.paths.markdown, 'utf8');
    expect(content).toContain('Core Features');
    expect(content).toContain('Advanced Analytics');
    expect(content).toContain('Premium Support');
    expect(content).toContain('$500');
    expect(content).toContain('$1000');
  });

  console.log('\n=== Testing Generate All Diagrams ===\n');

  const mockAssessmentData = {
    priceRules: [
      { id: 'rule1', name: 'Base Price', evaluationOrder: 1, conditions: [], actions: [] }
    ],
    priceActions: [],
    quotesByStatus: { 'Draft': 10, 'Approved': 5 },
    subscriptionsUsed: true,
    renewalConfig: { renewalWindowDays: 30 },
    bundleComplexity: 3,
    bundles: [
      {
        id: 'bundle1',
        name: 'Standard Bundle',
        options: [{ id: 'opt1', name: 'Core', required: true }],
        features: []
      }
    ]
  };

  await test('Generate all applicable diagrams', async () => {
    const generator = new CPQDiagramGenerator({ outputDir: TEST_OUTPUT_DIR });
    const result = await generator.generateAllDiagrams(mockAssessmentData);

    expect(result.pricingFlow).toBeDefined();
    expect(result.quoteLifecycle).toBeDefined();
    expect(result.renewalFlow).toBeDefined();
    expect(result.bundleConfig).toBeDefined();
  });

  await test('Skip diagrams when data is missing', async () => {
    const minimalAssessmentData = {
      priceRules: [],
      quotesByStatus: {},
      subscriptionsUsed: false,
      bundleComplexity: 1,
      bundles: []
    };

    const generator = new CPQDiagramGenerator({ outputDir: TEST_OUTPUT_DIR });
    const result = await generator.generateAllDiagrams(minimalAssessmentData);

    expect(result.pricingFlow).toBeUndefined();
    expect(result.quoteLifecycle).toBeUndefined();
    expect(result.renewalFlow).toBeUndefined();
    expect(result.bundleConfig).toBeUndefined();
  });

  console.log('\n=== Testing File I/O Options ===\n');

  await test('Save both Markdown and .mmd files', async () => {
    const generator = new CPQDiagramGenerator({
      outputDir: TEST_OUTPUT_DIR,
      saveAsMarkdown: true,
      saveMermaidOnly: true
    });

    const mockRules = [{ id: 'r1', name: 'Test Rule', evaluationOrder: 1, conditions: [], actions: [] }];
    const result = await generator.generatePricingLogicFlowchart(mockRules, [], { detailLevel: 'high-level' });

    expect(result.highLevel.paths.markdown).toBeDefined();
    expect(result.highLevel.paths.mermaid).toBeDefined();
    expect(fs.existsSync(result.highLevel.paths.markdown)).toBe(true);
    expect(fs.existsSync(result.highLevel.paths.mermaid)).toBe(true);
  });

  await test('Create output directory if it does not exist', async () => {
    const nonExistentDir = path.join(TEST_OUTPUT_DIR, 'nested', 'deep', 'directory');
    const generator = new CPQDiagramGenerator({ outputDir: nonExistentDir });

    const mockRules = [{ id: 'r1', name: 'Test', evaluationOrder: 1, conditions: [], actions: [] }];
    await generator.generatePricingLogicFlowchart(mockRules, [], { detailLevel: 'high-level' });

    expect(fs.existsSync(nonExistentDir)).toBe(true);
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

// Only run standalone if not in Jest
if (require.main === module) {
  runTests().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}


// Jest wrapper for standalone test runner
if (typeof describe !== 'undefined') {
  describe('Cpq Diagram Generator', () => {
    it('should pass all tests', async () => {
      expect(typeof runTests).toBe('function');
      const result = await runTests();
      expect(result).not.toBe(false);
    }, 30000);
  });
}
