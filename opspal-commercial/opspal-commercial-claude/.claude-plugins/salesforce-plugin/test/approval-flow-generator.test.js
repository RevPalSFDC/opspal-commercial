/**
 * Approval Flow Generator Test Suite
 *
 * Tests approval flow diagram generation:
 * 1. Approval process discovery
 * 2. Approval step retrieval and mapping
 * 3. High-level approval flow (simplified sequence)
 * 4. Detailed approval flow (with all decision paths)
 * 5. Approver type detection
 * 6. Rejection behavior handling
 *
 * Run: node test/approval-flow-generator.test.js
 *
 * @phase Phase 5: Build Approval Flow Generator
 */

const fs = require('fs');
const path = require('path');
const ApprovalFlowGenerator = require('../scripts/lib/approval-flow-generator');

// Test output directory
const TEST_OUTPUT_DIR = path.join(__dirname, 'output', 'approval-flow');

async function runTests() {
  console.log('Running Approval Flow Generator tests...\n');

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
    const generator = new ApprovalFlowGenerator('test-org');
    expect(generator.orgAlias).toBe('test-org');
    expect(generator.options.detailLevel).toBe('both');
    expect(generator.options.includeInactive).toBe(false);
  });

  await test('Initialize with custom options', async () => {
    const generator = new ApprovalFlowGenerator('test-org', {
      detailLevel: 'high-level',
      outputDir: TEST_OUTPUT_DIR,
      focusObjects: ['SBQQ__Quote__c'],
      includeInactive: true,
      verbose: true
    });
    expect(generator.options.detailLevel).toBe('high-level');
    expect(generator.options.outputDir).toBe(TEST_OUTPUT_DIR);
    expect(generator.options.focusObjects).toHaveLength(1);
    expect(generator.options.includeInactive).toBe(true);
  });

  await test('CPQ objects are defined', async () => {
    const generator = new ApprovalFlowGenerator('test-org');
    expect(generator.cpqObjects).toBeDefined();
    expect(generator.cpqObjects.length).toBeGreaterThan(0);
    expect(generator.cpqObjects).toContain('SBQQ__Quote__c');
    expect(generator.cpqObjects).toContain('Opportunity');
  });

  console.log('\n=== Testing Approver Type Detection ===\n');

  await test('Detect Queue approver type', async () => {
    const generator = new ApprovalFlowGenerator('test-org');
    const step = {
      assignedApprover: 'Queue:Sales_Queue',
      stepNumber: 1
    };
    const type = generator._getApproverType(step);
    expect(type).toBe('Queue');
  });

  await test('Detect User approver type', async () => {
    const generator = new ApprovalFlowGenerator('test-org');
    const step = {
      assignedApprover: 'User:john.doe@example.com',
      stepNumber: 1
    };
    const type = generator._getApproverType(step);
    expect(type).toBe('User');
  });

  await test('Detect Role approver type', async () => {
    const generator = new ApprovalFlowGenerator('test-org');
    const step = {
      assignedApprover: 'Role:VP_Sales',
      stepNumber: 1
    };
    const type = generator._getApproverType(step);
    expect(type).toBe('Role');
  });

  await test('Detect Manager approver type', async () => {
    const generator = new ApprovalFlowGenerator('test-org');
    const step = {
      assignedApprover: 'Manager',
      stepNumber: 1
    };
    const type = generator._getApproverType(step);
    expect(type).toBe('Manager');
  });

  await test('Default approver type for unknown', async () => {
    const generator = new ApprovalFlowGenerator('test-org');
    const step = {
      assignedApprover: null,
      stepNumber: 3
    };
    const type = generator._getApproverType(step);
    expect(type).toContain('Step 3');
  });

  console.log('\n=== Testing Rejection Behavior ===\n');

  await test('Get rejection behavior - Reject', async () => {
    const generator = new ApprovalFlowGenerator('test-org');
    const step = { rejectBehavior: 'Reject' };
    const behavior = generator._getRejectBehavior(step);
    expect(behavior).toBe('Reject Record');
  });

  await test('Get rejection behavior - RejectRequest', async () => {
    const generator = new ApprovalFlowGenerator('test-org');
    const step = { rejectBehavior: 'RejectRequest' };
    const behavior = generator._getRejectBehavior(step);
    expect(behavior).toBe('Reject Request Only');
  });

  await test('Get rejection behavior - RejectAndGoBack', async () => {
    const generator = new ApprovalFlowGenerator('test-org');
    const step = { rejectBehavior: 'RejectAndGoBack' };
    const behavior = generator._getRejectBehavior(step);
    expect(behavior).toBe('Reject & Return to Previous Approver');
  });

  await test('Default rejection behavior', async () => {
    const generator = new ApprovalFlowGenerator('test-org');
    const step = { rejectBehavior: null };
    const behavior = generator._getRejectBehavior(step);
    expect(behavior).toBe('Reject Record');
  });

  console.log('\n=== Testing Approval Flow Generation ===\n');

  await test('Generate high-level approval flow', async () => {
    const generator = new ApprovalFlowGenerator('test-org', { outputDir: TEST_OUTPUT_DIR });

    const mockProcess = {
      id: '1',
      name: 'Quote_Approval',
      label: 'Quote Approval Process',
      object: 'SBQQ__Quote__c',
      state: 'Active',
      steps: [
        {
          id: 's1',
          name: 'Manager Approval',
          stepNumber: 1,
          assignedApprover: 'Manager',
          allowDelegate: true
        },
        {
          id: 's2',
          name: 'Director Approval',
          stepNumber: 2,
          assignedApprover: 'Role:Director',
          allowDelegate: false
        }
      ]
    };

    const result = await generator._generateHighLevelApprovalFlow(mockProcess);

    expect(result).toBeDefined();
    expect(result.paths.markdown).toBeDefined();
    expect(fs.existsSync(result.paths.markdown)).toBe(true);

    const content = fs.readFileSync(result.paths.markdown, 'utf8');
    expect(content).toContain('```mermaid');
    expect(content).toContain('sequenceDiagram');
    expect(content).toContain('Submitter');
    expect(content).toContain('System');
    expect(content).toContain('Approver1');
    expect(content).toContain('Approver2');
    expect(content).toContain('Submit for Approval');
    expect(content).toContain('Request Approval');
  });

  await test('Generate detailed approval flow', async () => {
    const generator = new ApprovalFlowGenerator('test-org', { outputDir: TEST_OUTPUT_DIR });

    const mockProcess = {
      id: '1',
      name: 'Quote_Approval',
      label: 'Quote Approval Process',
      object: 'SBQQ__Quote__c',
      state: 'Active',
      steps: [
        {
          id: 's1',
          name: 'Manager Approval',
          stepNumber: 1,
          assignedApprover: 'Manager',
          allowDelegate: true,
          rejectBehavior: 'Reject',
          rejectedRecallAction: 'Notify Submitter'
        },
        {
          id: 's2',
          name: 'Director Approval',
          stepNumber: 2,
          assignedApprover: 'Role:Director',
          allowDelegate: false,
          rejectBehavior: 'RejectRequest',
          approvedApprover: 'Final Approval Actions'
        }
      ]
    };

    const result = await generator._generateDetailedApprovalFlow(mockProcess);

    expect(result).toBeDefined();
    expect(result.paths.markdown).toBeDefined();
    expect(fs.existsSync(result.paths.markdown)).toBe(true);

    const content = fs.readFileSync(result.paths.markdown, 'utf8');
    expect(content).toContain('```mermaid');
    expect(content).toContain('sequenceDiagram');
    expect(content).toContain('Manager');
    expect(content).toContain('Role');
    expect(content).toContain('Entry Criteria Check');
    expect(content).toContain('Manager Approval');
    expect(content).toContain('Director Approval');
    expect(content).toContain('Delegation Allowed');
    expect(content).toContain('Reject Record');
  });

  await test('Handle single-step approval process', async () => {
    const generator = new ApprovalFlowGenerator('test-org', { outputDir: TEST_OUTPUT_DIR });

    const mockProcess = {
      id: '1',
      name: 'Simple_Approval',
      label: 'Simple Approval',
      object: 'Opportunity',
      state: 'Active',
      steps: [
        {
          id: 's1',
          name: 'Manager Approval',
          stepNumber: 1,
          assignedApprover: 'Manager',
          allowDelegate: false
        }
      ]
    };

    const result = await generator._generateHighLevelApprovalFlow(mockProcess);

    expect(result).toBeDefined();
    const content = fs.readFileSync(result.paths.markdown, 'utf8');
    expect(content).toContain('Approver1');
    expect(content).toContain('Approved');
  });

  await test('Handle multi-step approval process', async () => {
    const generator = new ApprovalFlowGenerator('test-org', { outputDir: TEST_OUTPUT_DIR });

    const mockProcess = {
      id: '1',
      name: 'Complex_Approval',
      label: 'Complex Approval',
      object: 'SBQQ__Quote__c',
      state: 'Active',
      steps: [
        {
          id: 's1',
          name: 'Step 1',
          stepNumber: 1,
          assignedApprover: 'Manager'
        },
        {
          id: 's2',
          name: 'Step 2',
          stepNumber: 2,
          assignedApprover: 'Director'
        },
        {
          id: 's3',
          name: 'Step 3',
          stepNumber: 3,
          assignedApprover: 'VP'
        },
        {
          id: 's4',
          name: 'Step 4',
          stepNumber: 4,
          assignedApprover: 'CEO'
        }
      ]
    };

    const result = await generator._generateHighLevelApprovalFlow(mockProcess);

    expect(result).toBeDefined();
    const content = fs.readFileSync(result.paths.markdown, 'utf8');
    expect(content).toContain('Approver1');
    expect(content).toContain('Approver2');
    expect(content).toContain('Approver3');
    expect(content).toContain('Approver4');
  });

  console.log('\n=== Testing Text Sanitization ===\n');

  await test('Sanitize Mermaid text with special characters', async () => {
    const generator = new ApprovalFlowGenerator('test-org');

    const sanitized = generator._sanitizeMermaidText('Approval "Quote" & <Test>');
    expect(sanitized).toContain('\\"Quote\\"'); // Escaped quotes
  });

  await test('Sanitize ID with special characters', async () => {
    const generator = new ApprovalFlowGenerator('test-org');

    const sanitized = generator._sanitizeId('Quote_Approval_Process');
    expect(sanitized).toBe('Quote_Approval_Process'); // Underscores preserved

    const sanitized2 = generator._sanitizeId('Process-With-Dashes');
    expect(sanitized2).toBe('Process_With_Dashes'); // Dashes replaced
  });

  console.log('\n=== Testing File I/O ===\n');

  await test('Create output directory if it does not exist', async () => {
    const nonExistentDir = path.join(TEST_OUTPUT_DIR, 'nested', 'deep', 'directory');
    const generator = new ApprovalFlowGenerator('test-org', { outputDir: nonExistentDir });

    const mockProcess = {
      id: '1',
      name: 'Test_Approval',
      label: 'Test Approval',
      object: 'Test__c',
      state: 'Active',
      steps: []
    };

    await generator._generateHighLevelApprovalFlow(mockProcess);

    expect(fs.existsSync(nonExistentDir)).toBe(true);
  });

  await test('Save diagram with correct filename and metadata', async () => {
    const generator = new ApprovalFlowGenerator('test-org', { outputDir: TEST_OUTPUT_DIR });

    const mockMermaidCode = 'sequenceDiagram\n  Submitter->>System: Submit';
    const result = await generator._saveDiagram(
      mockMermaidCode,
      'test-approval',
      'Test Approval Flow',
      'SBQQ__Quote__c'
    );

    expect(result.filename).toBe('test-approval');
    expect(result.title).toBe('Test Approval Flow');
    expect(result.object).toBe('SBQQ__Quote__c');
    expect(result.paths.markdown).toContain('test-approval.md');
    expect(fs.existsSync(result.paths.markdown)).toBe(true);

    const content = fs.readFileSync(result.paths.markdown, 'utf8');
    expect(content).toContain('# Test Approval Flow');
    expect(content).toContain('Object: SBQQ__Quote__c');
    expect(content).toContain('Org: test-org');
    expect(content).toContain('```mermaid');
  });

  await test('Save both Markdown and .mmd files', async () => {
    const generator = new ApprovalFlowGenerator('test-org', {
      outputDir: TEST_OUTPUT_DIR,
      saveAsMarkdown: true,
      saveMermaidOnly: true
    });

    const mockMermaidCode = 'sequenceDiagram\n  Submitter->>System: Submit';
    const result = await generator._saveDiagram(
      mockMermaidCode,
      'test-both',
      'Test Both Formats',
      'Opportunity'
    );

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
runTests().catch(error => {
  console.error('Test suite failed:', error);
  if (typeof jest === 'undefined') process.exit(1); else throw new Error('Test failed'); // Jest-safe
});


// Jest wrapper for standalone test runner
if (typeof describe !== 'undefined') {
  describe('Approval Flow Generator', () => {
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
