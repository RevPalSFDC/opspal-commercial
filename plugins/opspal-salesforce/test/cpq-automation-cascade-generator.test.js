/**
 * CPQ Automation Cascade Generator Test Suite
 *
 * Tests automation cascade diagram generation:
 * 1. Automation discovery (flows, triggers, PBs, validation rules, workflows)
 * 2. Cascade mapping (execution order and relationships)
 * 3. Circular dependency detection
 * 4. High-level cascade diagram (object-level view)
 * 5. Detailed cascade diagram (component-level view)
 *
 * Run: node test/cpq-automation-cascade-generator.test.js
 *
 * @phase Phase 4: Build CPQ Automation Cascade Generator
 */

const fs = require('fs');
const path = require('path');
const CPQAutomationCascadeGenerator = require('../scripts/lib/cpq-automation-cascade-generator');

// Test output directory
const TEST_OUTPUT_DIR = path.join(__dirname, 'output', 'cpq-automation-cascade');

async function runTests() {
  console.log('Running CPQ Automation Cascade Generator tests...\n');

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
      },
      toHaveLength(expected) {
        if (!value || value.length !== expected) {
          throw new Error(`Expected length ${expected}, got ${value ? value.length : 0}`);
        }
      },
      toBeGreaterThan(expected) {
        if (value <= expected) {
          throw new Error(`Expected value > ${expected}, got ${value}`);
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
    const generator = new CPQAutomationCascadeGenerator('test-org');
    expect(generator.orgAlias).toBe('test-org');
    expect(generator.options.detailLevel).toBe('both');
    expect(generator.options.detectCircularDeps).toBe(true);
    expect(generator.options.maxCascadeDepth).toBe(5);
  });

  await test('Initialize with custom options', async () => {
    const generator = new CPQAutomationCascadeGenerator('test-org', {
      detailLevel: 'high-level',
      outputDir: TEST_OUTPUT_DIR,
      focusObjects: ['SBQQ__Quote__c', 'Opportunity'],
      detectCircularDeps: false,
      maxCascadeDepth: 3,
      verbose: true
    });
    expect(generator.options.detailLevel).toBe('high-level');
    expect(generator.options.outputDir).toBe(TEST_OUTPUT_DIR);
    expect(generator.options.focusObjects).toHaveLength(2);
    expect(generator.options.detectCircularDeps).toBe(false);
    expect(generator.options.maxCascadeDepth).toBe(3);
  });

  console.log('\n=== Testing Execution Order ===\n');

  await test('Sort automation by execution order', async () => {
    const generator = new CPQAutomationCascadeGenerator('test-org');

    const components = [
      { type: 'Flow', name: 'Test_Flow', label: 'Test Flow' },
      { type: 'ValidationRule', name: 'Test_Validation', label: 'Test Validation' },
      { type: 'Trigger', name: 'TestTrigger', label: 'Test Trigger' },
      { type: 'WorkflowRule', name: 'Test_Workflow', label: 'Test Workflow' },
      { type: 'ProcessBuilder', name: 'Test_Process', label: 'Test Process' }
    ];

    const sorted = generator._sortByExecutionOrder(components);

    expect(sorted[0].type).toBe('ValidationRule'); // First
    expect(sorted[1].type).toBe('Trigger');        // Second
    expect(sorted[2].type).toBe('Flow');           // Third
    expect(sorted[3].type).toBe('ProcessBuilder'); // Fourth
    expect(sorted[4].type).toBe('WorkflowRule');   // Fifth
  });

  await test('Get trigger events from metadata', async () => {
    const generator = new CPQAutomationCascadeGenerator('test-org');

    const trigger = {
      UsageBeforeInsert: true,
      UsageAfterInsert: true,
      UsageBeforeUpdate: false,
      UsageAfterUpdate: true,
      UsageBeforeDelete: false,
      UsageAfterDelete: false,
      UsageAfterUndelete: false
    };

    const events = generator._getTriggerEvents(trigger);

    expect(events).toHaveLength(3);
    expect(events).toContain('before insert');
    expect(events).toContain('after insert');
    expect(events).toContain('after update');
  });

  console.log('\n=== Testing Cascade Mapping ===\n');

  await test('Map cascades from automation inventory', async () => {
    const generator = new CPQAutomationCascadeGenerator('test-org');

    const mockAutomation = {
      flows: [
        { id: '1', name: 'Quote_Flow', label: 'Quote Flow', type: 'Flow', object: 'SBQQ__Quote__c' }
      ],
      triggers: [
        { id: '2', name: 'QuoteTrigger', label: 'Quote Trigger', type: 'Trigger', object: 'SBQQ__Quote__c' }
      ],
      processBuilders: [
        { id: '3', name: 'Quote_Process', label: 'Quote Process', type: 'ProcessBuilder', object: 'SBQQ__Quote__c' }
      ],
      validationRules: [
        { id: '4', name: 'Quote_Validation', label: 'Quote Validation', type: 'ValidationRule', object: 'SBQQ__Quote__c' }
      ],
      workflowRules: [
        { id: '5', name: 'Quote_Workflow', label: 'Quote Workflow', type: 'WorkflowRule', object: 'SBQQ__Quote__c' }
      ]
    };

    const cascades = await generator._mapCascades(mockAutomation);

    // Should create cascade chain: Validation -> Trigger -> Flow -> Process -> Workflow (4 cascades)
    expect(cascades.length).toBe(4);

    // First cascade should be Validation -> Trigger
    expect(cascades[0].from.type).toBe('ValidationRule');
    expect(cascades[0].to.type).toBe('Trigger');
    expect(cascades[0].object).toBe('SBQQ__Quote__c');
    expect(cascades[0].executionOrder).toBe(1);

    // Last cascade should be Process -> Workflow
    expect(cascades[3].from.type).toBe('ProcessBuilder');
    expect(cascades[3].to.type).toBe('WorkflowRule');
  });

  await test('Map cascades for multiple objects', async () => {
    const generator = new CPQAutomationCascadeGenerator('test-org');

    const mockAutomation = {
      flows: [
        { id: '1', name: 'Quote_Flow', label: 'Quote Flow', type: 'Flow', object: 'SBQQ__Quote__c' },
        { id: '2', name: 'Opp_Flow', label: 'Opp Flow', type: 'Flow', object: 'Opportunity' }
      ],
      triggers: [
        { id: '3', name: 'QuoteTrigger', label: 'Quote Trigger', type: 'Trigger', object: 'SBQQ__Quote__c' },
        { id: '4', name: 'OppTrigger', label: 'Opp Trigger', type: 'Trigger', object: 'Opportunity' }
      ],
      processBuilders: [],
      validationRules: [],
      workflowRules: []
    };

    const cascades = await generator._mapCascades(mockAutomation);

    // Should create 2 cascades (one per object)
    expect(cascades.length).toBe(2);

    // One cascade for Quote object
    const quoteCascade = cascades.find(c => c.object === 'SBQQ__Quote__c');
    expect(quoteCascade).toBeDefined();
    expect(quoteCascade.from.type).toBe('Trigger');
    expect(quoteCascade.to.type).toBe('Flow');

    // One cascade for Opportunity object
    const oppCascade = cascades.find(c => c.object === 'Opportunity');
    expect(oppCascade).toBeDefined();
    expect(oppCascade.from.type).toBe('Trigger');
    expect(oppCascade.to.type).toBe('Flow');
  });

  console.log('\n=== Testing Circular Dependency Detection ===\n');

  await test('Detect simple circular dependency', async () => {
    const generator = new CPQAutomationCascadeGenerator('test-org');

    const mockCascades = [
      {
        from: { id: '1', type: 'Flow', name: 'Flow_A', label: 'Flow A' },
        to: { id: '2', type: 'Flow', name: 'Flow_B', label: 'Flow B' },
        object: 'SBQQ__Quote__c'
      },
      {
        from: { id: '2', type: 'Flow', name: 'Flow_B', label: 'Flow B' },
        to: { id: '1', type: 'Flow', name: 'Flow_A', label: 'Flow A' },
        object: 'SBQQ__Quote__c'
      }
    ];

    const circular = generator._detectCircularDependencies(mockCascades);

    expect(circular.length).toBeGreaterThan(0);
    expect(circular[0].severity).toBe('high');
  });

  await test('No circular dependencies in linear cascade', async () => {
    const generator = new CPQAutomationCascadeGenerator('test-org');

    const mockCascades = [
      {
        from: { id: '1', type: 'ValidationRule', name: 'Val_A', label: 'Validation A' },
        to: { id: '2', type: 'Trigger', name: 'Trigger_B', label: 'Trigger B' },
        object: 'SBQQ__Quote__c'
      },
      {
        from: { id: '2', type: 'Trigger', name: 'Trigger_B', label: 'Trigger B' },
        to: { id: '3', type: 'Flow', name: 'Flow_C', label: 'Flow C' },
        object: 'SBQQ__Quote__c'
      }
    ];

    const circular = generator._detectCircularDependencies(mockCascades);

    expect(circular.length).toBe(0);
  });

  console.log('\n=== Testing Diagram Generation ===\n');

  await test('Generate high-level cascade diagram', async () => {
    const generator = new CPQAutomationCascadeGenerator('test-org', { outputDir: TEST_OUTPUT_DIR });

    const mockCascades = [
      {
        from: { id: '1', type: 'ValidationRule', name: 'Val', label: 'Validation', object: 'SBQQ__Quote__c' },
        to: { id: '2', type: 'Trigger', name: 'Trig', label: 'Trigger', object: 'SBQQ__Quote__c' },
        object: 'SBQQ__Quote__c',
        executionOrder: 1
      },
      {
        from: { id: '2', type: 'Trigger', name: 'Trig', label: 'Trigger', object: 'SBQQ__Quote__c' },
        to: { id: '3', type: 'Flow', name: 'Flw', label: 'Flow', object: 'SBQQ__Quote__c' },
        object: 'SBQQ__Quote__c',
        executionOrder: 2
      }
    ];

    const result = await generator._generateHighLevelCascade(mockCascades, []);

    expect(result).toBeDefined();
    expect(result.paths.markdown).toBeDefined();
    expect(fs.existsSync(result.paths.markdown)).toBe(true);

    const content = fs.readFileSync(result.paths.markdown, 'utf8');
    expect(content).toContain('```mermaid');
    expect(content).toContain('flowchart TB');
    expect(content).toContain('SBQQ__Quote__c');
  });

  await test('Generate detailed cascade diagram', async () => {
    const generator = new CPQAutomationCascadeGenerator('test-org', { outputDir: TEST_OUTPUT_DIR });

    const mockCascades = [
      {
        from: { id: '1', type: 'ValidationRule', name: 'Val', label: 'Validation Rule', object: 'SBQQ__Quote__c' },
        to: { id: '2', type: 'Trigger', name: 'Trig', label: 'Quote Trigger', object: 'SBQQ__Quote__c' },
        object: 'SBQQ__Quote__c',
        executionOrder: 1
      },
      {
        from: { id: '2', type: 'Trigger', name: 'Trig', label: 'Quote Trigger', object: 'SBQQ__Quote__c' },
        to: { id: '3', type: 'Flow', name: 'Flw', label: 'Quote Flow', object: 'SBQQ__Quote__c' },
        object: 'SBQQ__Quote__c',
        executionOrder: 2
      }
    ];

    const result = await generator._generateDetailedCascade(mockCascades, []);

    expect(result).toBeDefined();
    expect(result.paths.markdown).toBeDefined();
    expect(fs.existsSync(result.paths.markdown)).toBe(true);

    const content = fs.readFileSync(result.paths.markdown, 'utf8');
    expect(content).toContain('```mermaid');
    expect(content).toContain('flowchart TB');
    expect(content).toContain('Validation Rule');
    expect(content).toContain('Quote Trigger');
    expect(content).toContain('Quote Flow');
    expect(content).toContain('Order: 1');
    expect(content).toContain('Order: 2');
  });

  await test('Highlight circular dependencies in diagram', async () => {
    const generator = new CPQAutomationCascadeGenerator('test-org', { outputDir: TEST_OUTPUT_DIR });

    const mockCascades = [
      {
        from: { id: '1', type: 'Flow', name: 'Flow_A', label: 'Flow A', object: 'SBQQ__Quote__c' },
        to: { id: '2', type: 'Flow', name: 'Flow_B', label: 'Flow B', object: 'SBQQ__Quote__c' },
        object: 'SBQQ__Quote__c',
        executionOrder: 1
      }
    ];

    const mockCircular = [
      {
        chain: ['Flow:Flow_A', 'Flow:Flow_B', 'Flow:Flow_A'],
        severity: 'high',
        description: 'Circular dependency detected: Flow:Flow_A → Flow:Flow_B → Flow:Flow_A'
      }
    ];

    const result = await generator._generateDetailedCascade(mockCascades, mockCircular);

    const content = fs.readFileSync(result.paths.markdown, 'utf8');
    expect(content).toContain('Circular Dependencies Detected');
    expect(content).toContain('Circular dependency detected');
  });

  console.log('\n=== Testing Text Sanitization ===\n');

  await test('Sanitize Mermaid text with special characters', async () => {
    const generator = new CPQAutomationCascadeGenerator('test-org');

    const sanitized = generator._sanitizeMermaidText('Flow "Test" & <Special>');
    expect(sanitized).toContain('\\"Test\\"'); // Escaped quotes
  });

  await test('Sanitize ID with special characters', async () => {
    const generator = new CPQAutomationCascadeGenerator('test-org');

    const sanitized = generator._sanitizeId('SBQQ__Quote__c');
    expect(sanitized).toBe('SBQQ__Quote__c'); // Underscores preserved

    const sanitized2 = generator._sanitizeId('Flow-With-Dashes');
    expect(sanitized2).toBe('Flow_With_Dashes'); // Dashes replaced
  });

  console.log('\n=== Testing File I/O ===\n');

  await test('Create output directory if it does not exist', async () => {
    const nonExistentDir = path.join(TEST_OUTPUT_DIR, 'nested', 'deep', 'directory');
    const generator = new CPQAutomationCascadeGenerator('test-org', { outputDir: nonExistentDir });

    const mockCascades = [];
    await generator._generateHighLevelCascade(mockCascades, []);

    expect(fs.existsSync(nonExistentDir)).toBe(true);
  });

  await test('Save diagram with correct filename and metadata', async () => {
    const generator = new CPQAutomationCascadeGenerator('test-org', { outputDir: TEST_OUTPUT_DIR });

    const mockMermaidCode = 'flowchart TB\n  A --> B';
    const result = await generator._saveDiagram(mockMermaidCode, 'test-cascade', 'Test Cascade Title');

    expect(result.filename).toBe('test-cascade');
    expect(result.title).toBe('Test Cascade Title');
    expect(result.paths.markdown).toContain('test-cascade.md');
    expect(fs.existsSync(result.paths.markdown)).toBe(true);

    const content = fs.readFileSync(result.paths.markdown, 'utf8');
    expect(content).toContain('# Test Cascade Title');
    expect(content).toContain('```mermaid');
    expect(content).toContain('Org: test-org');
  });

  await test('Save both Markdown and .mmd files', async () => {
    const generator = new CPQAutomationCascadeGenerator('test-org', {
      outputDir: TEST_OUTPUT_DIR,
      saveAsMarkdown: true,
      saveMermaidOnly: true
    });

    const mockMermaidCode = 'flowchart TB\n  A --> B';
    const result = await generator._saveDiagram(mockMermaidCode, 'test-both', 'Test Both Formats');

    expect(result.paths.markdown).toBeDefined();
    expect(result.paths.mermaid).toBeDefined();
    expect(fs.existsSync(result.paths.markdown)).toBe(true);
    expect(fs.existsSync(result.paths.mermaid)).toBe(true);
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
  describe('Cpq Automation Cascade Generator', () => {
    it('should pass all tests', async () => {
      expect(typeof runTests).toBe('function');
      const result = await runTests();
      expect(result).not.toBe(false);
    });
  });
}
