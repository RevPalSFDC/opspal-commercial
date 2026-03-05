/**
 * UAT Report Generator Tests
 *
 * Unit tests for the UAT report generator module.
 * Coverage target: 90%+ (all pure functions)
 */

const path = require('path');
const fs = require('fs');
const { UATReportGenerator } = require('../uat-report-generator');

// Load sample results fixture
const sampleResults = require('../__fixtures__/results/sample-results.json');

describe('UATReportGenerator', () => {
  let generator;

  beforeEach(() => {
    generator = new UATReportGenerator(sampleResults);
  });

  describe('constructor', () => {
    it('should accept results object', () => {
      expect(generator.results).toBe(sampleResults);
    });

    it('should set default options', () => {
      expect(generator.includeEvidence).toBe(true);
      expect(generator.includeSteps).toBe(true);
      expect(generator.title).toBe('UAT Test Execution Report');
    });

    it('should accept custom options', () => {
      const customGenerator = new UATReportGenerator(sampleResults, {
        includeEvidence: false,
        includeSteps: false,
        title: 'Custom Title'
      });
      expect(customGenerator.includeEvidence).toBe(false);
      expect(customGenerator.includeSteps).toBe(false);
      expect(customGenerator.title).toBe('Custom Title');
    });
  });

  describe('escapeCSV()', () => {
    it('should wrap values with commas in quotes', () => {
      expect(generator.escapeCSV('value, with comma')).toBe('"value, with comma"');
    });

    it('should escape quotes by doubling', () => {
      expect(generator.escapeCSV('say "hello"')).toBe('"say ""hello"""');
    });

    it('should handle newlines', () => {
      expect(generator.escapeCSV('line1\nline2')).toBe('"line1\nline2"');
    });

    it('should convert null to empty string', () => {
      expect(generator.escapeCSV(null)).toBe('');
    });

    it('should convert undefined to empty string', () => {
      expect(generator.escapeCSV(undefined)).toBe('');
    });

    it('should convert numbers to strings', () => {
      expect(generator.escapeCSV(123)).toBe('123');
    });

    it('should pass through simple strings unchanged', () => {
      expect(generator.escapeCSV('simple')).toBe('simple');
    });
  });

  describe('buildMarkdown()', () => {
    let markdown;

    beforeEach(() => {
      markdown = generator.buildMarkdown();
    });

    it('should generate valid markdown', () => {
      expect(markdown).toContain('# UAT Test Execution Report');
    });

    it('should include summary table', () => {
      expect(markdown).toContain('| Metric | Value |');
      expect(markdown).toContain('Total Test Cases');
      expect(markdown).toContain('Pass Rate');
    });

    it('should list test cases', () => {
      expect(markdown).toContain('## Test Case Results');
    });

    it('should include execution details', () => {
      expect(markdown).toContain('## Execution Details');
      expect(markdown).toContain('Duration');
    });

    it('should escape pipe characters in tables', () => {
      const resultsWithPipe = {
        ...sampleResults,
        results: [{
          ...sampleResults.results[0],
          steps: [{
            stepNumber: 1,
            raw: 'Step | with | pipes',
            action: 'create',
            status: 'passed',
            duration: 100
          }]
        }]
      };
      const pipeGenerator = new UATReportGenerator(resultsWithPipe);
      const md = pipeGenerator.buildMarkdown();
      // Pipe characters in step descriptions should be escaped for markdown tables
      expect(md).toContain('Step \\| with \\| pipes');
    });

    it('should show status icons', () => {
      expect(markdown).toMatch(/[✅❌⚠️]/);
    });

    it('should include step details when enabled', () => {
      expect(markdown).toContain('**Steps:**');
      expect(markdown).toContain('| # | Step | Status | Duration |');
    });

    it('should exclude step details when disabled', () => {
      const noStepsGenerator = new UATReportGenerator(sampleResults, { includeSteps: false });
      const md = noStepsGenerator.buildMarkdown();
      expect(md).not.toContain('| # | Step | Status | Duration |');
    });

    it('should show failures section for failed tests', () => {
      expect(markdown).toContain('**Failures:**');
    });
  });

  describe('buildCSV()', () => {
    let csv;

    beforeEach(() => {
      csv = generator.buildCSV();
    });

    it('should generate valid CSV with headers', () => {
      expect(csv).toContain('Epic,User Story,Scenario,Status');
    });

    it('should include all header columns', () => {
      const headers = ['Epic', 'User Story', 'Scenario', 'Status', 'Steps Total', 'Steps Passed', 'Steps Failed', 'Steps Manual', 'Duration (ms)', 'Tester Comments'];
      const firstLine = csv.split('\n')[0];
      headers.forEach(header => {
        expect(firstLine).toContain(header);
      });
    });

    it('should calculate step counts correctly', () => {
      const lines = csv.split('\n');
      // Find the first data row
      const dataRow = lines[1];
      // Should have step counts
      expect(dataRow).toMatch(/\d+/);
    });

    it('should aggregate error messages', () => {
      // The failed test case should have error message in Tester Comments
      expect(csv).toContain('FIELD_CUSTOM_VALIDATION_EXCEPTION');
    });

    it('should escape special characters', () => {
      const resultsWithSpecial = {
        ...sampleResults,
        results: [{
          ...sampleResults.results[0],
          scenario: 'Test, with "quotes" and comma'
        }]
      };
      const specialGenerator = new UATReportGenerator(resultsWithSpecial);
      const specialCsv = specialGenerator.buildCSV();
      expect(specialCsv).toContain('"Test, with ""quotes"" and comma"');
    });
  });

  describe('buildJSON()', () => {
    let json;

    beforeEach(() => {
      json = generator.buildJSON();
    });

    it('should include all required fields', () => {
      expect(json.report).toBeDefined();
      expect(json.summary).toBeDefined();
      expect(json.execution).toBeDefined();
      expect(json.results).toBeDefined();
    });

    it('should include report metadata', () => {
      expect(json.report.title).toBe('UAT Test Execution Report');
      expect(json.report.generatedAt).toBeDefined();
      expect(json.report.generator).toContain('UAT Test Framework');
    });

    it('should include summary statistics', () => {
      expect(json.summary.success).toBeDefined();
      expect(json.summary.platform).toBe('salesforce');
      expect(json.summary.testCases).toBeDefined();
    });

    it('should respect includeEvidence option', () => {
      expect(json.evidence).toBeDefined();

      const noEvidenceGenerator = new UATReportGenerator(sampleResults, { includeEvidence: false });
      const noEvidenceJson = noEvidenceGenerator.buildJSON();
      expect(noEvidenceJson.evidence).toBeUndefined();
    });

    it('should calculate step summaries', () => {
      const firstResult = json.results[0];
      expect(firstResult.stepSummary).toBeDefined();
      expect(firstResult.stepSummary.total).toBeGreaterThan(0);
      expect(firstResult.stepSummary.passed).toBeDefined();
      expect(firstResult.stepSummary.failed).toBeDefined();
    });

    it('should include steps when enabled', () => {
      expect(json.results[0].steps).toBeDefined();
    });

    it('should exclude steps when disabled', () => {
      const noStepsGenerator = new UATReportGenerator(sampleResults, { includeSteps: false });
      const noStepsJson = noStepsGenerator.buildJSON();
      expect(noStepsJson.results[0].steps).toBeUndefined();
    });
  });

  describe('getSummaryText()', () => {
    let summary;

    beforeEach(() => {
      summary = generator.getSummaryText();
    });

    it('should include box header', () => {
      expect(summary).toContain('UAT TEST EXECUTION SUMMARY');
    });

    it('should include platform', () => {
      expect(summary).toContain('Platform:');
      expect(summary).toContain('salesforce');
    });

    it('should include status with icon', () => {
      expect(summary).toMatch(/Status:.*[✅❌]/);
    });

    it('should include test case counts', () => {
      expect(summary).toContain('Total:');
      expect(summary).toContain('Passed:');
      expect(summary).toContain('Failed:');
      expect(summary).toContain('Pass Rate:');
    });

    it('should include step counts', () => {
      expect(summary).toContain('Steps:');
      expect(summary).toContain('Manual:');
    });

    it('should list failed tests when present', () => {
      expect(summary).toContain('Failed Test Cases:');
    });
  });

  describe('generateMarkdown()', () => {
    it('should write to file', async () => {
      const outputPath = path.join(__dirname, '../__fixtures__/results/test-output.md');

      try {
        const result = await generator.generateMarkdown(outputPath);

        expect(result.success).toBe(true);
        expect(result.path).toBe(outputPath);
        expect(result.format).toBe('markdown');
        expect(result.size).toBeGreaterThan(0);
        expect(fs.existsSync(outputPath)).toBe(true);
      } finally {
        // Cleanup
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      }
    });

    it('should create directory if not exists', async () => {
      const outputPath = path.join(__dirname, '../__fixtures__/results/new-dir/test.md');

      try {
        const result = await generator.generateMarkdown(outputPath);
        expect(result.success).toBe(true);
      } finally {
        // Cleanup
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
          fs.rmdirSync(path.dirname(outputPath));
        }
      }
    });
  });

  describe('generateCSV()', () => {
    it('should write to file', async () => {
      const outputPath = path.join(__dirname, '../__fixtures__/results/test-output.csv');

      try {
        const result = await generator.generateCSV(outputPath);

        expect(result.success).toBe(true);
        expect(result.format).toBe('csv');
        expect(fs.existsSync(outputPath)).toBe(true);
      } finally {
        // Cleanup
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      }
    });
  });

  describe('generateJSON()', () => {
    it('should write to file', async () => {
      const outputPath = path.join(__dirname, '../__fixtures__/results/test-output.json');

      try {
        const result = await generator.generateJSON(outputPath);

        expect(result.success).toBe(true);
        expect(result.format).toBe('json');
        expect(fs.existsSync(outputPath)).toBe(true);

        // Verify it's valid JSON
        const content = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
        expect(content.report).toBeDefined();
      } finally {
        // Cleanup
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      }
    });
  });

  describe('generateAll()', () => {
    it('should generate all formats', async () => {
      const outputDir = path.join(__dirname, '../__fixtures__/results/all-formats');

      try {
        const result = await generator.generateAll(outputDir, 'test');

        expect(result.success).toBe(true);
        expect(result.reports.markdown.success).toBe(true);
        expect(result.reports.csv.success).toBe(true);
        expect(result.reports.json.success).toBe(true);
      } finally {
        // Cleanup
        if (fs.existsSync(outputDir)) {
          const files = fs.readdirSync(outputDir);
          files.forEach(f => fs.unlinkSync(path.join(outputDir, f)));
          fs.rmdirSync(outputDir);
        }
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty results', () => {
      const emptyResults = {
        ...sampleResults,
        results: [],
        testCases: { total: 0, passed: 0, failed: 0, partial: 0, passRate: 0 },
        steps: { total: 0, passed: 0, failed: 0, manual: 0 }
      };
      const emptyGenerator = new UATReportGenerator(emptyResults);

      const md = emptyGenerator.buildMarkdown();
      expect(md).toContain('No test cases executed');
    });

    it('should handle results without evidence', () => {
      const noEvidenceResults = {
        ...sampleResults,
        evidence: []
      };
      const noEvidenceGenerator = new UATReportGenerator(noEvidenceResults);

      // Should not throw
      const md = noEvidenceGenerator.buildMarkdown();
      expect(md).toBeDefined();
    });

    it('should handle results without created records', () => {
      const noRecordsResults = {
        ...sampleResults,
        createdRecords: []
      };
      const noRecordsGenerator = new UATReportGenerator(noRecordsResults);

      const md = noRecordsGenerator.buildMarkdown();
      expect(md).not.toContain('## Created Records');
    });
  });
});
