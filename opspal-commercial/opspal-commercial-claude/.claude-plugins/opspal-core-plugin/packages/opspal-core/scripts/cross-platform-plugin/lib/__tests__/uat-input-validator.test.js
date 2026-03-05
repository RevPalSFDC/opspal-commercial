/**
 * Tests for UAT Input Validator
 *
 * Tests input validation for the UAT framework including:
 * - CSV file validation
 * - CSV structure validation
 * - Platform configuration validation
 * - Test data validation
 */

const path = require('path');
const fs = require('fs');
const { UATInputValidator } = require('../uat-input-validator');

describe('UATInputValidator', () => {
  let validator;
  const fixturesDir = path.join(__dirname, '../__fixtures__/csv');

  beforeEach(() => {
    validator = new UATInputValidator();
  });

  describe('validateCSVFile()', () => {
    it('should reject null file path', () => {
      const result = validator.validateCSVFile(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('required'));
    });

    it('should reject undefined file path', () => {
      const result = validator.validateCSVFile(undefined);
      expect(result.valid).toBe(false);
    });

    it('should reject empty file path', () => {
      const result = validator.validateCSVFile('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('required'));
    });

    it('should reject non-existent file', () => {
      const result = validator.validateCSVFile('/nonexistent/file.csv');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('not found'));
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should accept valid CSV file', () => {
      const validPath = path.join(fixturesDir, 'cpq-qa-workbook.csv');
      if (fs.existsSync(validPath)) {
        const result = validator.validateCSVFile(validPath);
        expect(result.valid).toBe(true);
        expect(result.errors.length).toBe(0);
      }
    });

    it('should warn for non-.csv extension', () => {
      // Create temp file with wrong extension
      const tempFile = path.join(__dirname, 'temp_test.txt');
      fs.writeFileSync(tempFile, 'test,data\n1,2');

      try {
        const result = validator.validateCSVFile(tempFile);
        expect(result.warnings).toContainEqual(expect.stringContaining('extension'));
      } finally {
        fs.unlinkSync(tempFile);
      }
    });

    it('should reject empty file', () => {
      const tempFile = path.join(__dirname, 'empty_test.csv');
      fs.writeFileSync(tempFile, '');

      try {
        const result = validator.validateCSVFile(tempFile);
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(expect.stringContaining('empty'));
      } finally {
        fs.unlinkSync(tempFile);
      }
    });

    it('should reject directory path', () => {
      const result = validator.validateCSVFile(__dirname);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('directory'));
    });
  });

  describe('validateCSVStructure()', () => {
    it('should reject null content', () => {
      const result = validator.validateCSVStructure(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('empty'));
    });

    it('should reject empty content', () => {
      const result = validator.validateCSVStructure('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('empty'));
    });

    it('should reject header-only CSV', () => {
      const result = validator.validateCSVStructure('Col1,Col2,Test Scenario');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('at least header row and one data row'));
    });

    it('should require Test Scenario column', () => {
      const result = validator.validateCSVStructure('Col1,Col2\nval1,val2');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('Test Scenario'));
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should accept "Test Scenarios" column name', () => {
      const result = validator.validateCSVStructure('Epic,Test Scenarios\nMyEpic,Step 1 → Step 2');
      expect(result.valid).toBe(true);
    });

    it('should accept "Scenario" column name', () => {
      const result = validator.validateCSVStructure('Epic,Scenario\nMyEpic,Step 1');
      expect(result.valid).toBe(true);
    });

    it('should accept "Test Case" column name', () => {
      const result = validator.validateCSVStructure('Test Case,Expected\nDo thing,Works');
      expect(result.valid).toBe(true);
    });

    it('should parse headers correctly', () => {
      const result = validator.validateCSVStructure('Epic,User Story,Test Scenario\nEpic1,Story1,Steps');
      expect(result.headers).toEqual(['Epic', 'User Story', 'Test Scenario']);
    });

    it('should warn about missing Epic column', () => {
      const result = validator.validateCSVStructure('Test Scenario\nStep 1');
      expect(result.warnings).toContainEqual(expect.stringContaining('Epic'));
    });

    it('should warn about missing User Story column', () => {
      const result = validator.validateCSVStructure('Test Scenario\nStep 1');
      expect(result.warnings).toContainEqual(expect.stringContaining('User Story'));
    });

    it('should handle quoted values with commas', () => {
      const csv = 'Test Scenario,Description\n"Step 1, Step 2",Works';
      const result = validator.validateCSVStructure(csv);
      expect(result.valid).toBe(true);
    });

    it('should handle escaped quotes', () => {
      const csv = 'Test Scenario,Description\n"Say ""Hello""",Test';
      const result = validator.validateCSVStructure(csv);
      expect(result.valid).toBe(true);
    });

    it('should normalize CRLF line endings', () => {
      const csv = 'Test Scenario\r\nStep 1\r\nStep 2';
      const result = validator.validateCSVStructure(csv);
      expect(result.valid).toBe(true);
    });

    it('should count scenarios correctly', () => {
      const csv = 'Epic,Test Scenario\nE1,Step1\nE2,Step2\nE3,Step3';
      const result = validator.validateCSVStructure(csv);
      expect(result.stats.scenarioCount).toBe(3);
    });

    it('should warn about empty test scenario rows', () => {
      const csv = 'Epic,Test Scenario\nE1,\nE2,Steps';
      const result = validator.validateCSVStructure(csv);
      expect(result.warnings.some(w => w.includes('no test scenario'))).toBe(true);
    });
  });

  describe('validatePlatformConfig()', () => {
    it('should reject empty platform', () => {
      const result = validator.validatePlatformConfig('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('required'));
    });

    it('should reject unknown platform', () => {
      const result = validator.validatePlatformConfig('oracle');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('Unknown platform'));
      expect(result.suggestions).toContainEqual(expect.stringContaining('salesforce'));
    });

    it('should accept salesforce platform', () => {
      const result = validator.validatePlatformConfig('salesforce', { orgAlias: 'my-sandbox' });
      expect(result.valid).toBe(true);
    });

    it('should accept hubspot platform', () => {
      const result = validator.validatePlatformConfig('hubspot');
      expect(result.valid).toBe(true);
    });

    it('should require orgAlias for Salesforce', () => {
      const result = validator.validatePlatformConfig('salesforce', {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('org alias'));
    });

    it('should warn about production-looking org aliases', () => {
      const result = validator.validatePlatformConfig('salesforce', { orgAlias: 'production' });
      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual(expect.stringContaining('production'));
    });

    it('should be case insensitive for platform name', () => {
      const result = validator.validatePlatformConfig('SALESFORCE', { orgAlias: 'test' });
      expect(result.valid).toBe(true);
    });
  });

  describe('validateTestData()', () => {
    it('should accept null test data', () => {
      const result = validator.validateTestData(null);
      expect(result.valid).toBe(true);
    });

    it('should accept undefined test data', () => {
      const result = validator.validateTestData(undefined);
      expect(result.valid).toBe(true);
    });

    it('should accept valid object', () => {
      const result = validator.validateTestData({ Name: 'Test', Amount: 100 });
      expect(result.valid).toBe(true);
    });

    it('should reject non-object test data', () => {
      const result = validator.validateTestData('string');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('object'));
    });

    it('should warn about template placeholders', () => {
      const result = validator.validateTestData({ Name: '{{placeholder}}' });
      expect(result.warnings).toContainEqual(expect.stringContaining('unresolved template'));
    });

    it('should warn about TBD values', () => {
      const result = validator.validateTestData({ Status: 'TBD' });
      expect(result.warnings).toContainEqual(expect.stringContaining('placeholder'));
    });
  });

  describe('validateFilters()', () => {
    it('should accept null filters', () => {
      const result = validator.validateFilters(null);
      expect(result.valid).toBe(true);
    });

    it('should accept valid filter keys', () => {
      const result = validator.validateFilters({ epic: 'CPQ', scenario: 'quote' });
      expect(result.valid).toBe(true);
    });

    it('should warn about unknown filter keys', () => {
      const result = validator.validateFilters({ unknownKey: 'value' });
      expect(result.warnings).toContainEqual(expect.stringContaining('Unknown filter key'));
    });

    it('should reject non-string filter values', () => {
      const result = validator.validateFilters({ epic: 123 });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateAll()', () => {
    it('should aggregate errors from all validations', () => {
      const result = validator.validateAll({
        csvPath: '/nonexistent.csv',
        platform: 'unknown'
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it('should include details for each validation', () => {
      const result = validator.validateAll({
        csvPath: '/nonexistent.csv',
        platform: 'salesforce',
        config: { orgAlias: 'test' }
      });

      expect(result.details.file).toBeDefined();
      expect(result.details.platform).toBeDefined();
    });

    it('should deduplicate suggestions', () => {
      const result = validator.validateAll({
        csvPath: '/file1.csv',
        platform: 'salesforce',
        config: {}
      });

      const uniqueSuggestions = [...new Set(result.suggestions)];
      expect(result.suggestions.length).toBe(uniqueSuggestions.length);
    });
  });

  describe('parseCSVLine()', () => {
    it('should parse simple line', () => {
      const result = validator.parseCSVLine('a,b,c');
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should handle quoted values', () => {
      const result = validator.parseCSVLine('"hello",world');
      expect(result).toEqual(['hello', 'world']);
    });

    it('should handle commas in quotes', () => {
      const result = validator.parseCSVLine('"a,b",c');
      expect(result).toEqual(['a,b', 'c']);
    });

    it('should handle escaped quotes', () => {
      const result = validator.parseCSVLine('"He said ""Hi"""');
      expect(result).toEqual(['He said "Hi"']);
    });

    it('should handle empty fields', () => {
      const result = validator.parseCSVLine('a,,c');
      expect(result).toEqual(['a', '', 'c']);
    });

    it('should handle trailing comma', () => {
      const result = validator.parseCSVLine('a,b,');
      expect(result).toEqual(['a', 'b', '']);
    });
  });
});
