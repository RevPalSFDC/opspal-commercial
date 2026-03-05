/**
 * CPQ ERD Generator Test Suite
 *
 * Tests CPQ Entity Relationship Diagram generation:
 * 1. Object discovery (CPQ custom + standard objects)
 * 2. Relationship mapping (lookup, master-detail)
 * 3. High-level ERD generation (objects and relationships)
 * 4. Detailed ERD generation (with key fields)
 * 5. Field selection logic
 * 6. Mermaid syntax generation
 *
 * Run: node test/cpq-erd-generator.test.js
 *
 * @phase Phase 3: Build CPQ ERD Generator
 */

const fs = require('fs');
const path = require('path');
const CPQERDGenerator = require('../scripts/lib/cpq-erd-generator');

// Test output directory
const TEST_OUTPUT_DIR = path.join(__dirname, 'output', 'cpq-erd');

async function runTests() {
  console.log('Running CPQ ERD Generator tests...\n');

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
    const generator = new CPQERDGenerator('test-org');
    expect(generator.orgAlias).toBe('test-org');
    expect(generator.options.detailLevel).toBe('both');
    expect(generator.options.includeStandardObjects).toBe(true);
    expect(generator.options.maxFieldsPerObject).toBe(10);
  });

  await test('Initialize with custom options', async () => {
    const generator = new CPQERDGenerator('test-org', {
      detailLevel: 'high-level',
      outputDir: TEST_OUTPUT_DIR,
      includeStandardObjects: false,
      maxFieldsPerObject: 5,
      verbose: true
    });
    expect(generator.options.detailLevel).toBe('high-level');
    expect(generator.options.outputDir).toBe(TEST_OUTPUT_DIR);
    expect(generator.options.includeStandardObjects).toBe(false);
    expect(generator.options.maxFieldsPerObject).toBe(5);
    expect(generator.options.verbose).toBe(true);
  });

  console.log('\n=== Testing Object Discovery ===\n');

  await test('CPQ object patterns are defined', async () => {
    const generator = new CPQERDGenerator('test-org');
    expect(generator.cpqObjectPatterns).toBeDefined();
    expect(generator.cpqObjectPatterns.length).toBeGreaterThan(0);
    expect(generator.cpqObjectPatterns).toContain('SBQQ__Quote__c');
    expect(generator.cpqObjectPatterns).toContain('SBQQ__QuoteLine__c');
  });

  await test('CPQ standard objects are defined', async () => {
    const generator = new CPQERDGenerator('test-org');
    expect(generator.cpqStandardObjects).toBeDefined();
    expect(generator.cpqStandardObjects.length).toBeGreaterThan(0);
    expect(generator.cpqStandardObjects).toContain('Product2');
    expect(generator.cpqStandardObjects).toContain('Opportunity');
    expect(generator.cpqStandardObjects).toContain('Account');
  });

  console.log('\n=== Testing Relationship Mapping ===\n');

  await test('Map lookup relationships', async () => {
    const generator = new CPQERDGenerator('test-org');

    const mockObjects = [
      {
        apiName: 'SBQQ__Quote__c',
        label: 'Quote',
        fields: [
          {
            QualifiedApiName: 'SBQQ__Opportunity2__c',
            Label: 'Opportunity',
            DataType: 'Lookup',
            ReferenceTo: 'Opportunity',
            RelationshipName: 'SBQQ__Opportunity2__r',
            IsNillable: false
          }
        ]
      },
      {
        apiName: 'Opportunity',
        label: 'Opportunity',
        fields: []
      }
    ];

    const relationships = await generator._mapRelationships(mockObjects);

    expect(relationships.length).toBe(1);
    expect(relationships[0].from).toBe('SBQQ__Quote__c');
    expect(relationships[0].to).toBe('Opportunity');
    expect(relationships[0].type).toBe('Lookup');
    expect(relationships[0].required).toBe(true);
  });

  await test('Map master-detail relationships', async () => {
    const generator = new CPQERDGenerator('test-org');

    const mockObjects = [
      {
        apiName: 'SBQQ__QuoteLine__c',
        label: 'Quote Line',
        fields: [
          {
            QualifiedApiName: 'SBQQ__Quote__c',
            Label: 'Quote',
            DataType: 'MasterDetail',
            ReferenceTo: 'SBQQ__Quote__c',
            RelationshipName: 'SBQQ__Quote__r',
            IsNillable: false
          }
        ]
      },
      {
        apiName: 'SBQQ__Quote__c',
        label: 'Quote',
        fields: []
      }
    ];

    const relationships = await generator._mapRelationships(mockObjects);

    expect(relationships.length).toBe(1);
    expect(relationships[0].from).toBe('SBQQ__QuoteLine__c');
    expect(relationships[0].to).toBe('SBQQ__Quote__c');
    expect(relationships[0].type).toBe('MasterDetail');
  });

  await test('Exclude relationships to non-CPQ objects', async () => {
    const generator = new CPQERDGenerator('test-org');

    const mockObjects = [
      {
        apiName: 'SBQQ__Quote__c',
        label: 'Quote',
        fields: [
          {
            QualifiedApiName: 'SBQQ__Opportunity2__c',
            Label: 'Opportunity',
            DataType: 'Lookup',
            ReferenceTo: 'Opportunity',
            RelationshipName: 'SBQQ__Opportunity2__r',
            IsNillable: false
          },
          {
            QualifiedApiName: 'SomeOtherObject__c',
            Label: 'Other Object',
            DataType: 'Lookup',
            ReferenceTo: 'SomeOtherObject__c',
            RelationshipName: 'SomeOtherObject__r',
            IsNillable: true
          }
        ]
      },
      {
        apiName: 'Opportunity',
        label: 'Opportunity',
        fields: []
      }
    ];

    const relationships = await generator._mapRelationships(mockObjects);

    // Should only include relationship to Opportunity (which is in mockObjects)
    expect(relationships.length).toBe(1);
    expect(relationships[0].to).toBe('Opportunity');
  });

  console.log('\n=== Testing Cardinality Notation ===\n');

  await test('Get cardinality for required master-detail', async () => {
    const generator = new CPQERDGenerator('test-org');
    const rel = { type: 'MasterDetail', required: true };
    const cardinality = generator._getCardinality(rel);
    expect(cardinality).toBe('||--|{');
  });

  await test('Get cardinality for optional master-detail', async () => {
    const generator = new CPQERDGenerator('test-org');
    const rel = { type: 'MasterDetail', required: false };
    const cardinality = generator._getCardinality(rel);
    expect(cardinality).toBe('||--o{');
  });

  await test('Get cardinality for required lookup', async () => {
    const generator = new CPQERDGenerator('test-org');
    const rel = { type: 'Lookup', required: true };
    const cardinality = generator._getCardinality(rel);
    expect(cardinality).toBe('}|--|{');
  });

  await test('Get cardinality for optional lookup', async () => {
    const generator = new CPQERDGenerator('test-org');
    const rel = { type: 'Lookup', required: false };
    const cardinality = generator._getCardinality(rel);
    expect(cardinality).toBe('}o--o{');
  });

  console.log('\n=== Testing Field Type Mapping ===\n');

  await test('Map Salesforce data types to Mermaid types', async () => {
    const generator = new CPQERDGenerator('test-org');

    expect(generator._getMermaidFieldType('Text')).toBe('string');
    expect(generator._getMermaidFieldType('Number')).toBe('int');
    expect(generator._getMermaidFieldType('Currency')).toBe('decimal');
    expect(generator._getMermaidFieldType('Percent')).toBe('decimal');
    expect(generator._getMermaidFieldType('Date')).toBe('date');
    expect(generator._getMermaidFieldType('DateTime')).toBe('datetime');
    expect(generator._getMermaidFieldType('Checkbox')).toBe('boolean');
    expect(generator._getMermaidFieldType('Picklist')).toBe('string');
    expect(generator._getMermaidFieldType('Lookup')).toBe('string');
  });

  console.log('\n=== Testing Field Selection ===\n');

  await test('Select key fields for detailed ERD', async () => {
    const generator = new CPQERDGenerator('test-org', { maxFieldsPerObject: 5 });

    const mockObject = {
      apiName: 'SBQQ__Quote__c',
      label: 'Quote',
      fields: [
        { QualifiedApiName: 'Name', Label: 'Name', DataType: 'Text', IsRequired: true, IsNillable: false },
        { QualifiedApiName: 'SBQQ__Status__c', Label: 'Status', DataType: 'Picklist', IsRequired: false, IsNillable: true },
        { QualifiedApiName: 'SBQQ__NetAmount__c', Label: 'Net Amount', DataType: 'Currency', IsRequired: false, IsNillable: true },
        { QualifiedApiName: 'SBQQ__Opportunity2__c', Label: 'Opportunity', DataType: 'Lookup', IsRequired: false, IsNillable: false, ReferenceTo: 'Opportunity' },
        { QualifiedApiName: 'Description', Label: 'Description', DataType: 'LongTextArea', IsRequired: false, IsNillable: true },
        { QualifiedApiName: 'SBQQ__Account__c', Label: 'Account', DataType: 'Lookup', IsRequired: false, IsNillable: true, ReferenceTo: 'Account' },
        { QualifiedApiName: 'CreatedDate', Label: 'Created Date', DataType: 'DateTime', IsRequired: false, IsNillable: false }
      ]
    };

    const selectedFields = generator._selectKeyFields(mockObject);

    // Should prioritize required, CPQ-specific, and relationship fields
    expect(selectedFields.length).toBeGreaterThan(0);
    expect(selectedFields.length <= 5).toBe(true); // Respects maxFieldsPerObject

    // Name should be included (required)
    const hasName = selectedFields.some(f => f.QualifiedApiName === 'Name');
    expect(hasName).toBe(true);

    // CPQ fields should be included
    const hasCPQFields = selectedFields.some(f => f.QualifiedApiName.startsWith('SBQQ__'));
    expect(hasCPQFields).toBe(true);
  });

  console.log('\n=== Testing Text Sanitization ===\n');

  await test('Sanitize Mermaid text with special characters', async () => {
    const generator = new CPQERDGenerator('test-org');

    const sanitized = generator._sanitizeMermaidText('Quote "Special" & <Test>');
    expect(sanitized).toContain('\\"Special\\"'); // Escaped quotes
    expect(sanitized).toContain('&'); // Ampersand preserved
  });

  await test('Sanitize ID with special characters', async () => {
    const generator = new CPQERDGenerator('test-org');

    const sanitized = generator._sanitizeId('SBQQ__Quote__c');
    expect(sanitized).toBe('SBQQ__Quote__c'); // Underscores preserved

    const sanitized2 = generator._sanitizeId('Object-With-Dashes');
    expect(sanitized2).toBe('Object_With_Dashes'); // Dashes replaced
  });

  console.log('\n=== Testing ERD Generation ===\n');

  await test('Generate high-level ERD', async () => {
    const generator = new CPQERDGenerator('test-org', { outputDir: TEST_OUTPUT_DIR });

    const mockObjects = [
      {
        apiName: 'SBQQ__Quote__c',
        label: 'Quote',
        fields: [
          {
            QualifiedApiName: 'SBQQ__Opportunity2__c',
            Label: 'Opportunity',
            DataType: 'Lookup',
            ReferenceTo: 'Opportunity',
            RelationshipName: 'SBQQ__Opportunity2__r',
            IsNillable: false
          }
        ]
      },
      {
        apiName: 'Opportunity',
        label: 'Opportunity',
        fields: []
      }
    ];

    const mockRelationships = [
      {
        from: 'SBQQ__Quote__c',
        to: 'Opportunity',
        field: 'SBQQ__Opportunity2__c',
        fieldLabel: 'Opportunity',
        type: 'Lookup',
        required: true
      }
    ];

    const result = await generator._generateHighLevelERD(mockObjects, mockRelationships);

    expect(result).toBeDefined();
    expect(result.paths.markdown).toBeDefined();
    expect(fs.existsSync(result.paths.markdown)).toBe(true);

    const content = fs.readFileSync(result.paths.markdown, 'utf8');
    expect(content).toContain('```mermaid');
    expect(content).toContain('erDiagram');
    expect(content).toContain('SBQQ__Quote__c');
    expect(content).toContain('Opportunity');
  });

  await test('Generate detailed ERD with fields', async () => {
    const generator = new CPQERDGenerator('test-org', { outputDir: TEST_OUTPUT_DIR });

    const mockObjects = [
      {
        apiName: 'SBQQ__Quote__c',
        label: 'Quote',
        fields: [
          {
            QualifiedApiName: 'Name',
            Label: 'Quote Number',
            DataType: 'Text',
            IsRequired: true,
            IsNillable: false
          },
          {
            QualifiedApiName: 'SBQQ__Status__c',
            Label: 'Status',
            DataType: 'Picklist',
            IsRequired: false,
            IsNillable: true
          },
          {
            QualifiedApiName: 'SBQQ__Opportunity2__c',
            Label: 'Opportunity',
            DataType: 'Lookup',
            ReferenceTo: 'Opportunity',
            RelationshipName: 'SBQQ__Opportunity2__r',
            IsNillable: false
          }
        ]
      },
      {
        apiName: 'Opportunity',
        label: 'Opportunity',
        fields: [
          {
            QualifiedApiName: 'Name',
            Label: 'Opportunity Name',
            DataType: 'Text',
            IsRequired: true,
            IsNillable: false
          }
        ]
      }
    ];

    const mockRelationships = [
      {
        from: 'SBQQ__Quote__c',
        to: 'Opportunity',
        field: 'SBQQ__Opportunity2__c',
        fieldLabel: 'Opportunity',
        type: 'Lookup',
        required: true
      }
    ];

    const result = await generator._generateDetailedERD(mockObjects, mockRelationships);

    expect(result).toBeDefined();
    expect(result.paths.markdown).toBeDefined();
    expect(fs.existsSync(result.paths.markdown)).toBe(true);

    const content = fs.readFileSync(result.paths.markdown, 'utf8');
    expect(content).toContain('```mermaid');
    expect(content).toContain('erDiagram');
    expect(content).toContain('SBQQ__Quote__c');
    expect(content).toContain('Quote Number');
    expect(content).toContain('Status');
  });

  console.log('\n=== Testing File I/O ===\n');

  await test('Create output directory if it does not exist', async () => {
    const nonExistentDir = path.join(TEST_OUTPUT_DIR, 'nested', 'deep', 'directory');
    const generator = new CPQERDGenerator('test-org', { outputDir: nonExistentDir });

    const mockObjects = [
      { apiName: 'SBQQ__Quote__c', label: 'Quote', fields: [] }
    ];
    const mockRelationships = [];

    await generator._generateHighLevelERD(mockObjects, mockRelationships);

    expect(fs.existsSync(nonExistentDir)).toBe(true);
  });

  await test('Save diagram with correct filename and metadata', async () => {
    const generator = new CPQERDGenerator('test-org', { outputDir: TEST_OUTPUT_DIR });

    const mockMermaidCode = 'erDiagram\n  SBQQ__Quote__c {\n  }';
    const result = await generator._saveDiagram(mockMermaidCode, 'test-erd', 'Test ERD Title');

    expect(result.filename).toBe('test-erd');
    expect(result.title).toBe('Test ERD Title');
    expect(result.paths.markdown).toContain('test-erd.md');
    expect(fs.existsSync(result.paths.markdown)).toBe(true);

    const content = fs.readFileSync(result.paths.markdown, 'utf8');
    expect(content).toContain('# Test ERD Title');
    expect(content).toContain('```mermaid');
    expect(content).toContain('Org: test-org');
  });

  await test('Save both Markdown and .mmd files', async () => {
    const generator = new CPQERDGenerator('test-org', {
      outputDir: TEST_OUTPUT_DIR,
      saveAsMarkdown: true,
      saveMermaidOnly: true
    });

    const mockMermaidCode = 'erDiagram\n  SBQQ__Quote__c {\n  }';
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
  describe('Cpq Erd Generator', () => {
    it('should pass all tests', async () => {
      expect(typeof runTests).toBe('function');
      const result = await runTests();
      expect(result).not.toBe(false);
    });
  });
}
