/**
 * UAT End-to-End Tests
 *
 * Full pipeline tests from CSV parsing to report generation.
 * Uses fixture files for testing without real external calls.
 */

const path = require('path');
const fs = require('fs');
const UATCSVParser = require('../uat-csv-parser');
const { UATReportGenerator } = require('../uat-report-generator');
const { UATStepExecutor } = require('../uat-step-executor');

describe('UAT E2E', () => {
  const fixturesDir = path.join(__dirname, '../__fixtures__');
  const outputDir = path.join(__dirname, '../__fixtures__/results/e2e-output');

  beforeAll(() => {
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Cleanup output files
    if (fs.existsSync(outputDir)) {
      const files = fs.readdirSync(outputDir);
      files.forEach(f => {
        try {
          fs.unlinkSync(path.join(outputDir, f));
        } catch (e) {
          // Ignore cleanup errors
        }
      });
      try {
        fs.rmdirSync(outputDir);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Full Pipeline: CSV -> Parse -> Results -> Reports', () => {
    it('should parse fixture CSV and generate all reports', async () => {
      // Step 1: Parse CSV
      const parser = new UATCSVParser();
      const parseResult = await parser.parse(path.join(fixturesDir, 'csv/valid-cpq-workflow.csv'));

      expect(parseResult.testCases.length).toBeGreaterThan(0);
      expect(parseResult.stats.testCases).toBe(parseResult.testCases.length);
      expect(parseResult.stats.totalSteps).toBeGreaterThan(0);

      // Step 2: Simulate execution results (normally would come from test runner)
      const simulatedResults = {
        success: true,
        platform: 'salesforce',
        dryRun: true,
        testCases: {
          total: parseResult.testCases.length,
          passed: parseResult.testCases.length - 1,
          failed: 1,
          partial: 0,
          passRate: Math.round(((parseResult.testCases.length - 1) / parseResult.testCases.length) * 100)
        },
        steps: {
          total: parseResult.stats.totalSteps,
          passed: parseResult.stats.totalSteps - 2,
          failed: 1,
          manual: 1
        },
        execution: {
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          duration: 5000,
          durationFormatted: '5s'
        },
        results: parseResult.testCases.map((tc, index) => ({
          epic: tc.epic,
          userStory: tc.userStory,
          scenario: tc.scenario,
          status: index === 0 ? 'failed' : 'passed',
          duration: 1000 + (index * 500),
          steps: tc.steps.map((step, stepIndex) => ({
            stepNumber: step.stepNumber,
            raw: step.raw,
            action: step.action,
            status: (index === 0 && stepIndex === tc.steps.length - 1) ? 'failed' : 'passed',
            duration: 100 + (stepIndex * 50),
            error: (index === 0 && stepIndex === tc.steps.length - 1) ? 'Simulated failure for testing' : undefined
          }))
        })),
        evidence: [],
        createdRecords: []
      };

      // Step 3: Generate all reports
      const generator = new UATReportGenerator(simulatedResults);

      // Markdown report
      const md = generator.buildMarkdown();
      expect(md).toContain('# UAT Test Execution Report');
      expect(md).toContain('## Executive Summary');
      expect(md).toContain('## Test Case Results');

      // CSV report
      const csv = generator.buildCSV();
      expect(csv).toContain('Epic,User Story');
      expect(csv.split('\n').length).toBeGreaterThan(1); // Header + data rows

      // JSON report
      const json = generator.buildJSON();
      expect(json.report).toBeDefined();
      expect(json.summary).toBeDefined();
      expect(json.results).toBeDefined();
      expect(json.results.length).toBe(parseResult.testCases.length);

      // Write reports to files
      const reportResults = await generator.generateAll(outputDir, 'e2e-test');

      expect(reportResults.success).toBe(true);
      expect(reportResults.reports.markdown.success).toBe(true);
      expect(reportResults.reports.csv.success).toBe(true);
      expect(reportResults.reports.json.success).toBe(true);
    });

    it('should handle edge case CSV correctly', async () => {
      const parser = new UATCSVParser();
      const parseResult = await parser.parse(path.join(fixturesDir, 'csv/edge-cases.csv'));

      // Should handle various edge cases
      expect(parseResult.testCases.length).toBeGreaterThan(0);

      // Check specific edge cases were parsed
      const epicWithComma = parseResult.testCases.find(tc => tc.epic.includes('comma'));
      expect(epicWithComma).toBeDefined();
      expect(epicWithComma.epic).toBe('Epic, with comma');

      // Generate report from edge case results
      const simulatedResults = {
        success: true,
        platform: 'salesforce',
        dryRun: true,
        testCases: { total: parseResult.testCases.length, passed: parseResult.testCases.length, failed: 0, partial: 0, passRate: 100 },
        steps: { total: 10, passed: 10, failed: 0, manual: 0 },
        execution: { startTime: new Date().toISOString(), endTime: new Date().toISOString(), duration: 1000, durationFormatted: '1s' },
        results: parseResult.testCases.map(tc => ({
          epic: tc.epic,
          userStory: tc.userStory,
          scenario: tc.scenario,
          status: 'passed',
          duration: 500,
          steps: tc.steps.map(step => ({ ...step, status: 'passed', duration: 50 }))
        })),
        evidence: [],
        createdRecords: []
      };

      const generator = new UATReportGenerator(simulatedResults);
      const csv = generator.buildCSV();

      // CSV should properly escape the comma in epic name
      expect(csv).toContain('"Epic, with comma"');
    });

    it('should report clear errors for non-existent file', async () => {
      const parser = new UATCSVParser();

      await expect(parser.parse('/nonexistent/path/to/file.csv'))
        .rejects.toThrow('CSV file not found');
    });
  });

  describe('Step Execution Flow', () => {
    it('should execute steps in sequence with context passing', async () => {
      // Create mock adapter
      const mockAdapter = {
        createRecord: jest.fn()
          .mockResolvedValueOnce({ success: true, id: '001xxx' }) // Account
          .mockResolvedValueOnce({ success: true, id: '006xxx' }), // Opportunity
        updateRecord: jest.fn().mockResolvedValue({ success: true }),
        verifyField: jest.fn().mockResolvedValue({ passed: true }),
        queryRecord: jest.fn().mockResolvedValue({ success: true, record: { StageName: 'Qualification' } }),
        verifyRollup: jest.fn().mockResolvedValue({ passed: true }),
        cleanup: jest.fn().mockResolvedValue({ success: true })
      };

      const executor = new UATStepExecutor(mockAdapter);

      // Execute step 1: Create Account
      const step1 = {
        stepNumber: 1,
        raw: 'Create Account',
        action: 'create',
        object: 'Account',
        data: {}
      };
      const result1 = await executor.executeStep(step1, { Name: 'Test Account' });

      expect(result1.status).toBe('passed');
      expect(executor.getContext().AccountId).toBe('001xxx');

      // Execute step 2: Create Opportunity (should use Account context)
      const step2 = {
        stepNumber: 2,
        raw: 'Create Opportunity',
        action: 'create',
        object: 'Opportunity',
        data: { AccountId: '{AccountId}' }
      };
      const result2 = await executor.executeStep(step2, { Name: 'Test Opp', StageName: 'Qualification' });

      expect(result2.status).toBe('passed');
      expect(executor.getContext().OpportunityId).toBe('006xxx');

      // Verify context resolution worked
      expect(mockAdapter.createRecord).toHaveBeenLastCalledWith(
        'Opportunity',
        expect.objectContaining({ AccountId: '001xxx' })
      );
    });
  });

  describe('Report Generator Integration', () => {
    it('should use sample fixture results to generate reports', async () => {
      // Load sample results fixture
      const sampleResults = require('../__fixtures__/results/sample-results.json');

      const generator = new UATReportGenerator(sampleResults);

      // Summary text
      const summary = generator.getSummaryText();
      expect(summary).toContain('UAT TEST EXECUTION SUMMARY');
      expect(summary).toContain('salesforce');

      // Markdown
      const md = generator.buildMarkdown();
      expect(md).toContain('Streamlined CPQ Workflow');

      // CSV
      const csv = generator.buildCSV();
      const lines = csv.split('\n');
      expect(lines.length).toBe(4); // Header + 3 test cases

      // JSON
      const json = generator.buildJSON();
      expect(json.results.length).toBe(3);
    });
  });

  describe('Test Data Template Generation', () => {
    it('should generate test data template from parsed test cases', async () => {
      const parser = new UATCSVParser();
      const parseResult = await parser.parse(path.join(fixturesDir, 'csv/valid-cpq-workflow.csv'));

      const template = parser.generateTestDataTemplate(parseResult.testCases);

      // Template should have entries for each test case
      expect(Object.keys(template).length).toBe(parseResult.testCases.length);

      // Each entry should have object defaults
      const firstKey = Object.keys(template)[0];
      expect(template[firstKey]._description).toBeDefined();
      expect(template[firstKey]._steps).toBeDefined();
    });
  });

  describe('Parser Statistics', () => {
    it('should calculate correct statistics', async () => {
      const parser = new UATCSVParser();
      const parseResult = await parser.parse(path.join(fixturesDir, 'csv/valid-cpq-workflow.csv'));

      // Verify stats
      expect(parseResult.stats.totalRows).toBe(parseResult.testCases.length);
      expect(parseResult.stats.testCases).toBe(parseResult.testCases.length);

      // Total steps should match sum of individual test case steps
      const calculatedTotalSteps = parseResult.testCases.reduce((sum, tc) => sum + tc.steps.length, 0);
      expect(parseResult.stats.totalSteps).toBe(calculatedTotalSteps);

      // Epics should be unique
      const uniqueEpics = [...new Set(parseResult.testCases.map(tc => tc.epic))];
      expect(parseResult.stats.epics.length).toBe(uniqueEpics.length);
    });
  });
});
