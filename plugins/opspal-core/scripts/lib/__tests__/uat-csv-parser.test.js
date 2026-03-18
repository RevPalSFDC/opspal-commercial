/**
 * UAT CSV Parser Tests
 *
 * Unit tests for the UAT CSV parser module.
 * Coverage target: 90%+ (pure functions, well-defined inputs/outputs)
 */

const path = require('path');
const UATCSVParser = require('../uat-csv-parser');

describe('UATCSVParser', () => {
  let parser;

  beforeEach(() => {
    parser = new UATCSVParser();
  });

  describe('parseLine()', () => {
    it('should parse simple CSV line', () => {
      const result = parser.parseLine('Epic,User Story,Test Scenario');
      expect(result).toEqual(['Epic', 'User Story', 'Test Scenario']);
    });

    it('should handle quoted values with commas', () => {
      const result = parser.parseLine('"Epic, with comma","Story","Test"');
      expect(result).toEqual(['Epic, with comma', 'Story', 'Test']);
    });

    it('should handle escaped quotes: "He said ""Hello"""', () => {
      const result = parser.parseLine('"He said ""Hello""","Test"');
      expect(result).toEqual(['He said "Hello"', 'Test']);
    });

    it('should handle empty fields', () => {
      const result = parser.parseLine(',,Value,,');
      expect(result).toEqual(['', '', 'Value', '', '']);
    });

    it('should handle trailing delimiters', () => {
      const result = parser.parseLine('A,B,C,');
      expect(result).toEqual(['A', 'B', 'C', '']);
    });

    it('should handle multiline values in quotes', () => {
      // Note: parseLine handles single line, multiline needs to be pre-processed
      const result = parser.parseLine('"Line1"');
      expect(result).toEqual(['Line1']);
    });

    it('should handle special characters', () => {
      const result = parser.parseLine('Test < > &,Value');
      expect(result).toEqual(['Test < > &', 'Value']);
    });
  });

  describe('parseStep()', () => {
    it('should parse navigate patterns: "From Account"', () => {
      const step = parser.parseStep('From Account', 1);
      expect(step.action).toBe('navigate');
      expect(step.object).toBe('Account');
      expect(step.stepNumber).toBe(1);
    });

    it('should parse navigate to patterns: "Navigate to Opportunity"', () => {
      const step = parser.parseStep('Navigate to Opportunity', 1);
      expect(step.action).toBe('navigate');
      expect(step.object).toBe('Opportunity');
    });

    it('should parse create patterns: "Create opp"', () => {
      const step = parser.parseStep('Create opp', 1);
      expect(step.action).toBe('create');
      expect(step.object).toBe('Opportunity');
    });

    it('should parse add patterns: "Add Quote"', () => {
      const step = parser.parseStep('Add Quote', 1);
      expect(step.action).toBe('create');
      expect(step.object).toBe('SBQQ__Quote__c');
    });

    it('should parse update patterns: "Mark Primary"', () => {
      const step = parser.parseStep('Mark Primary', 1);
      expect(step.action).toBe('update');
      expect(step.field).toBe('Primary');
      expect(step.data.primary).toBe(true);
    });

    it('should parse set patterns: "Set Stage"', () => {
      const step = parser.parseStep('Set Stage', 1);
      expect(step.action).toBe('update');
      expect(step.field).toBe('Stage');
    });

    it('should parse verify patterns: "Verify rollups"', () => {
      const step = parser.parseStep('Verify rollups', 1);
      expect(step.action).toBe('verify');
      expect(step.target).toBe('rollups');
    });

    it('should parse confirm patterns: "Confirm amount"', () => {
      const step = parser.parseStep('Confirm amount', 1);
      expect(step.action).toBe('verify');
      expect(step.target).toBe('amount');
    });

    it('should parse permission patterns: "Sales/CSM attempt"', () => {
      const step = parser.parseStep('Sales/CSM profile attempt', 1);
      expect(step.action).toBe('permission');
      expect(step.profile).toBe('Sales/CSM');
    });

    it('should extract preconditions: "after Qualification"', () => {
      const step = parser.parseStep('add products after Qualification', 1);
      expect(step.precondition).toEqual({ stage: 'Qualification' });
    });

    it('should be case-insensitive', () => {
      const step1 = parser.parseStep('FROM Account', 1);
      const step2 = parser.parseStep('from account', 1);
      expect(step1.action).toBe('navigate');
      expect(step2.action).toBe('navigate');
    });

    it('should return manual for unrecognized patterns', () => {
      const step = parser.parseStep('do something weird', 1);
      expect(step.action).toBe('manual');
    });

    it('should extract stage references', () => {
      const step = parser.parseStep('Stage: Qualification', 1);
      expect(step.data.stage).toBe('Qualification');
    });

    it('should extract term information', () => {
      const step = parser.parseStep('Set 12-month term', 1);
      expect(step.data.term).toEqual({ value: 12, unit: 'month' });
    });

    it('should detect blocked expected outcome', () => {
      const step = parser.parseStep('Verify action is blocked', 1);
      expect(step.expectedOutcome).toBe('blocked');
    });

    it('should parse submit for approval', () => {
      const step = parser.parseStep('Submit for approval', 1);
      expect(step.action).toBe('submit_approval');
    });

    it('should parse approval patterns', () => {
      const step = parser.parseStep('Approve the request', 1);
      expect(step.action).toBe('approve');
    });
  });

  describe('normalizeObjectName()', () => {
    it('should map Quote to SBQQ__Quote__c', () => {
      expect(parser.normalizeObjectName('Quote')).toBe('SBQQ__Quote__c');
      expect(parser.normalizeObjectName('quote')).toBe('SBQQ__Quote__c');
      expect(parser.normalizeObjectName('quotes')).toBe('SBQQ__Quote__c');
    });

    it('should map Opp to Opportunity', () => {
      expect(parser.normalizeObjectName('Opp')).toBe('Opportunity');
      expect(parser.normalizeObjectName('opp')).toBe('Opportunity');
      expect(parser.normalizeObjectName('opportunity')).toBe('Opportunity');
    });

    it('should handle case variations', () => {
      expect(parser.normalizeObjectName('ACCOUNT')).toBe('Account');
      expect(parser.normalizeObjectName('Account')).toBe('Account');
      expect(parser.normalizeObjectName('account')).toBe('Account');
    });

    it('should pass through unknown objects', () => {
      expect(parser.normalizeObjectName('CustomObject__c')).toBe('CustomObject__c');
      expect(parser.normalizeObjectName('UnknownThing')).toBe('UnknownThing');
    });

    it('should map products to OpportunityLineItem', () => {
      expect(parser.normalizeObjectName('products')).toBe('OpportunityLineItem');
    });

    it('should map subscription to SBQQ__Subscription__c', () => {
      expect(parser.normalizeObjectName('subscription')).toBe('SBQQ__Subscription__c');
    });
  });

  describe('parseSteps()', () => {
    it('should split steps by arrow delimiter', () => {
      const steps = parser.parseSteps('Step 1 → Step 2 → Step 3');
      expect(steps).toHaveLength(3);
    });

    it('should split steps by ASCII arrow delimiter', () => {
      const steps = parser.parseSteps('Step 1 -> Step 2 -> Step 3');
      expect(steps).toHaveLength(3);
    });

    it('should handle mixed delimiters', () => {
      const steps = parser.parseSteps('Step 1 → Step 2; Step 3');
      expect(steps).toHaveLength(3);
    });

    it('should trim whitespace from steps', () => {
      const steps = parser.parseSteps('  Step 1  →  Step 2  ');
      expect(steps[0].raw).toBe('Step 1');
      expect(steps[1].raw).toBe('Step 2');
    });

    it('should filter empty steps', () => {
      const steps = parser.parseSteps('Step 1 →  → Step 2');
      expect(steps).toHaveLength(2);
    });

    it('should assign step numbers sequentially', () => {
      const steps = parser.parseSteps('A → B → C');
      expect(steps[0].stepNumber).toBe(1);
      expect(steps[1].stepNumber).toBe(2);
      expect(steps[2].stepNumber).toBe(3);
    });
  });

  describe('generateTestCaseId()', () => {
    it('should generate ID with epic prefix', () => {
      const id = parser.generateTestCaseId('CPQ Workflow', 1);
      expect(id).toMatch(/^CPQWORKFLO-TS-001$/);
    });

    it('should pad index with zeros', () => {
      const id = parser.generateTestCaseId('Epic', 42);
      expect(id).toBe('EPIC-TS-042');
    });

    it('should use UAT prefix for empty epic', () => {
      const id = parser.generateTestCaseId('', 1);
      expect(id).toBe('UAT-TS-001');
    });

    it('should handle special characters in epic', () => {
      const id = parser.generateTestCaseId('Epic & Story!', 1);
      expect(id).toMatch(/^EPICSTORY-TS-001$/);
    });

    it('should truncate long epic names', () => {
      const id = parser.generateTestCaseId('VeryLongEpicNameThatShouldBeTruncated', 1);
      expect(id).toMatch(/^VERYLONGEP-TS-001$/);
    });
  });

  describe('extractStepContext()', () => {
    it('should detect primary flag', () => {
      const step = { action: 'manual', data: {} };
      parser.extractStepContext(step, 'Mark as Primary');
      expect(step.data.primary).toBe(true);
    });

    it('should detect rollup verification', () => {
      const step = { action: 'manual', data: {} };
      parser.extractStepContext(step, 'Verify rollups match');
      expect(step.target).toBe('rollups');
      expect(step.action).toBe('verify');
    });

    it('should detect discount changes', () => {
      const step = { action: 'manual', data: {} };
      parser.extractStepContext(step, 'Change discount to 20%');
      expect(step.target).toBe('discount');
      expect(step.action).toBe('update');
    });

    it('should detect quantity changes', () => {
      const step = { action: 'manual', data: {} };
      parser.extractStepContext(step, 'Update quantity');
      expect(step.target).toBe('quantity');
      expect(step.action).toBe('update');
    });

    it('should detect approval target', () => {
      const step = { action: 'manual', data: {} };
      parser.extractStepContext(step, 'Submit for approval');
      expect(step.target).toBe('approval');
    });

    it('should detect blocked/denied scenarios', () => {
      const step = { action: 'manual', data: {} };
      parser.extractStepContext(step, 'Action should be blocked');
      expect(step.expectedOutcome).toBe('blocked');
    });
  });

  describe('parse() with fixture files', () => {
    const fixturesDir = path.join(__dirname, '../__fixtures__/csv');

    it('should parse valid CPQ workflow CSV', async () => {
      const result = await parser.parse(path.join(fixturesDir, 'valid-cpq-workflow.csv'));

      expect(result.testCases.length).toBeGreaterThan(0);
      expect(result.stats.testCases).toBe(result.testCases.length);
      expect(result.stats.totalSteps).toBeGreaterThan(0);
      expect(result.parsedAt).toBeDefined();
    });

    it('should parse edge case CSV', async () => {
      const result = await parser.parse(path.join(fixturesDir, 'edge-cases.csv'));

      // Should handle quoted values with commas
      const commaTest = result.testCases.find(tc => tc.epic.includes('comma'));
      expect(commaTest).toBeDefined();
      expect(commaTest.epic).toBe('Epic, with comma');
    });

    it('should throw error for non-existent file', async () => {
      await expect(parser.parse('/nonexistent/file.csv'))
        .rejects.toThrow('CSV file not found');
    });
  });

  describe('getDefaultTestData()', () => {
    it('should return Account defaults', () => {
      const data = parser.getDefaultTestData('Account');
      expect(data.Name).toBeDefined();
      expect(data.Type).toBeDefined();
    });

    it('should return Opportunity defaults', () => {
      const data = parser.getDefaultTestData('Opportunity');
      expect(data.Name).toBeDefined();
      expect(data.StageName).toBeDefined();
      expect(data.CloseDate).toBeDefined();
    });

    it('should return CPQ Quote defaults', () => {
      const data = parser.getDefaultTestData('SBQQ__Quote__c');
      expect(data.SBQQ__Primary__c).toBeDefined();
    });

    it('should return generic defaults for unknown objects', () => {
      const data = parser.getDefaultTestData('CustomObject__c');
      expect(data.Name).toContain('CustomObject__c');
    });
  });

  describe('constructor options', () => {
    it('should accept custom delimiter', () => {
      const customParser = new UATCSVParser({ delimiter: ';' });
      const result = customParser.parseLine('A;B;C');
      expect(result).toEqual(['A', 'B', 'C']);
    });

    it('should accept custom step delimiters', () => {
      const customParser = new UATCSVParser({ stepDelimiters: ['|'] });
      const steps = customParser.parseSteps('Step 1 | Step 2');
      expect(steps).toHaveLength(2);
    });

    it('should default verbose to false', () => {
      expect(parser.verbose).toBe(false);
    });

    it('should respect verbose option', () => {
      const verboseParser = new UATCSVParser({ verbose: true });
      expect(verboseParser.verbose).toBe(true);
    });
  });
});
