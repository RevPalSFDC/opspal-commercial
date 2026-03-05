/**
 * report-service.test.js
 *
 * Tests for ReportService - canonical report generation for OpsPal
 */

jest.mock('fs');
jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

const fs = require('fs');
const { execSync } = require('child_process');
const ReportService = require('../report-service');

describe('ReportService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    fs.mkdirSync.mockImplementation(() => {});
    fs.readFileSync.mockReturnValue('# {{title}}\n{{key_messages}}');
    fs.writeFileSync.mockImplementation(() => {});
    fs.appendFileSync.mockImplementation(() => {});

    service = new ReportService({
      templatesDir: '/templates',
      logPath: '/logs/test.jsonl'
    });
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      fs.existsSync.mockReturnValue(false);
      const defaultService = new ReportService();

      expect(defaultService.config.defaultFormat).toBe('markdown');
      expect(defaultService.config.defaultPIIPolicy).toBe('mask');
    });

    it('should create log directory if not exists', () => {
      fs.existsSync.mockReturnValue(false);
      new ReportService({ logPath: '/new/path/log.jsonl' });

      expect(fs.mkdirSync).toHaveBeenCalledWith('/new/path', { recursive: true });
    });

    it('should accept custom config', () => {
      const customService = new ReportService({
        defaultFormat: 'html',
        defaultPIIPolicy: 'remove'
      });

      expect(customService.config.defaultFormat).toBe('html');
      expect(customService.config.defaultPIIPolicy).toBe('remove');
    });
  });

  describe('generateReport', () => {
    const validRequest = {
      report_type: 'exec_update',
      audience: 'exec',
      objectives: ['Test objective'],
      key_messages: ['Test message'],
      inputs: {
        facts: ['Fact 1'],
        metrics: { accuracy: 0.95 }
      }
    };

    it('should generate report successfully', async () => {
      const response = await service.generateReport(validRequest);

      expect(response.content).toBeDefined();
      expect(response.format).toBe('markdown');
      expect(response.metadata.author).toBe('report-service');
      expect(response.trace_ids.length).toBeGreaterThan(0);
    });

    it('should include section word counts', async () => {
      const response = await service.generateReport(validRequest);

      expect(response.section_word_counts).toBeDefined();
    });

    it('should include validation', async () => {
      const response = await service.generateReport(validRequest);

      expect(response.validation.pii_detected).toBeDefined();
      expect(response.validation.hallucination_risk).toBeDefined();
    });

    it('should log telemetry on success', async () => {
      await service.generateReport(validRequest);

      expect(fs.appendFileSync).toHaveBeenCalled();
    });

    it('should log error and rethrow on failure', async () => {
      const invalidRequest = {};

      await expect(service.generateReport(invalidRequest)).rejects.toThrow();
      expect(fs.appendFileSync).toHaveBeenCalled();
    });
  });

  describe('_validateInput', () => {
    it('should throw for missing required fields', () => {
      expect(() => service._validateInput({})).toThrow('Missing required field');
      expect(() => service._validateInput({ report_type: 'exec_update' })).toThrow('Missing required field');
    });

    it('should throw for invalid report_type', () => {
      const request = {
        report_type: 'invalid_type',
        audience: 'exec',
        objectives: ['test'],
        key_messages: ['test'],
        inputs: { facts: ['test'] }
      };

      expect(() => service._validateInput(request)).toThrow('Invalid report_type');
    });

    it('should throw for invalid audience', () => {
      const request = {
        report_type: 'exec_update',
        audience: 'invalid_audience',
        objectives: ['test'],
        key_messages: ['test'],
        inputs: { facts: ['test'] }
      };

      expect(() => service._validateInput(request)).toThrow('Invalid audience');
    });

    it('should throw if inputs has no facts/tables/metrics', () => {
      const request = {
        report_type: 'exec_update',
        audience: 'exec',
        objectives: ['test'],
        key_messages: ['test'],
        inputs: {}
      };

      expect(() => service._validateInput(request)).toThrow('At least one of inputs.facts');
    });

    it('should accept valid request', () => {
      const request = {
        report_type: 'postmortem',
        audience: 'engineering',
        objectives: ['test'],
        key_messages: ['test'],
        inputs: { tables: [{ headers: ['a'], rows: [['1']] }] }
      };

      expect(() => service._validateInput(request)).not.toThrow();
    });

    it('should accept all valid report types', () => {
      const types = ['exec_update', 'weekly_status', 'postmortem', 'evaluation', 'design_review', 'audit', 'assessment', 'quality_report'];

      for (const type of types) {
        const request = {
          report_type: type,
          audience: 'exec',
          objectives: ['test'],
          key_messages: ['test'],
          inputs: { facts: ['test'] }
        };
        expect(() => service._validateInput(request)).not.toThrow();
      }
    });

    it('should accept all valid audiences', () => {
      const audiences = ['exec', 'pm', 'engineering', 'gtm', 'customer', 'internal'];

      for (const audience of audiences) {
        const request = {
          report_type: 'exec_update',
          audience,
          objectives: ['test'],
          key_messages: ['test'],
          inputs: { metrics: { x: 1 } }
        };
        expect(() => service._validateInput(request)).not.toThrow();
      }
    });
  });

  describe('_selectTemplate', () => {
    it('should return template from file when exists', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('# Template Content');

      const template = service._selectTemplate('exec_update', 'exec');

      expect(template.name).toBe('exec-update-template');
      expect(template.content).toBe('# Template Content');
    });

    it('should return generic fallback when template not found', () => {
      fs.existsSync.mockReturnValue(false);

      const template = service._selectTemplate('exec_update', 'exec');

      expect(template.name).toBe('generic-fallback');
      expect(template.content).toContain('{{title}}');
    });
  });

  describe('_generateTitle', () => {
    it('should return correct title for each report type', () => {
      expect(service._generateTitle({ report_type: 'exec_update' })).toBe('Executive Update');
      expect(service._generateTitle({ report_type: 'postmortem' })).toBe('Postmortem Report');
      expect(service._generateTitle({ report_type: 'audit' })).toBe('Audit Report');
      expect(service._generateTitle({ report_type: 'assessment' })).toBe('Assessment Report');
    });

    it('should return Report for unknown type', () => {
      expect(service._generateTitle({ report_type: 'unknown' })).toBe('Report');
    });
  });

  describe('_formatObjectives', () => {
    it('should format objectives as list', () => {
      const result = service._formatObjectives(['Objective 1', 'Objective 2']);
      expect(result).toBe('- Objective 1\n- Objective 2');
    });

    it('should return empty string for empty array', () => {
      expect(service._formatObjectives([])).toBe('');
    });

    it('should return empty string for null', () => {
      expect(service._formatObjectives(null)).toBe('');
    });
  });

  describe('_formatKeyMessages', () => {
    it('should format key messages as bold list', () => {
      const result = service._formatKeyMessages(['Message 1', 'Message 2']);
      expect(result).toBe('- **Message 1**\n- **Message 2**');
    });

    it('should return empty string for empty array', () => {
      expect(service._formatKeyMessages([])).toBe('');
    });
  });

  describe('_formatFacts', () => {
    it('should format facts with references', () => {
      const result = service._formatFacts(['Fact A', 'Fact B']);
      expect(result).toBe('- Fact A [fact-1]\n- Fact B [fact-2]');
    });

    it('should return empty string for empty array', () => {
      expect(service._formatFacts([])).toBe('');
    });
  });

  describe('_formatMetricsTable', () => {
    it('should format metrics as markdown table', () => {
      const result = service._formatMetricsTable({ accuracy: 0.95, count: 100 });

      expect(result).toContain('| Metric | Value |');
      expect(result).toContain('| Accuracy | 0.95 |');
      expect(result).toContain('| Count | 100 |');
    });

    it('should format integer values without decimals', () => {
      const result = service._formatMetricsTable({ total: 1000 });
      expect(result).toContain('| Total | 1,000 |');
    });

    it('should return empty string for empty metrics', () => {
      expect(service._formatMetricsTable({})).toBe('');
    });

    it('should handle string values', () => {
      const result = service._formatMetricsTable({ status: 'active' });
      expect(result).toContain('| Status | active |');
    });
  });

  describe('_formatTables', () => {
    it('should format tables as markdown', () => {
      const tables = [{
        headers: ['Name', 'Value'],
        rows: [['A', '1'], ['B', '2']]
      }];

      const result = service._formatTables(tables);

      expect(result).toContain('| Name | Value |');
      expect(result).toContain('| --- | --- |');
      expect(result).toContain('| A | 1 |');
    });

    it('should return empty string for empty tables', () => {
      expect(service._formatTables([])).toBe('');
    });

    it('should skip tables without headers or rows', () => {
      const tables = [{ headers: null }];
      const result = service._formatTables(tables);
      expect(result).toBe('');
    });
  });

  describe('_formatRisks', () => {
    it('should format risks with warning emoji', () => {
      const result = service._formatRisks(['Risk 1', 'Risk 2']);
      expect(result).toBe('- ⚠️ Risk 1\n- ⚠️ Risk 2');
    });

    it('should return empty string for empty array', () => {
      expect(service._formatRisks([])).toBe('');
    });
  });

  describe('_formatDecisions', () => {
    it('should format decisions with checkmark emoji', () => {
      const result = service._formatDecisions(['Decision 1', 'Decision 2']);
      expect(result).toBe('- ✅ Decision 1\n- ✅ Decision 2');
    });
  });

  describe('_formatLinks', () => {
    it('should format links as markdown references', () => {
      const result = service._formatLinks(['https://example.com', 'https://test.com']);
      expect(result).toContain('[Reference 1](https://example.com)');
      expect(result).toContain('[Reference 2](https://test.com)');
    });
  });

  describe('_applyPIIPolicy', () => {
    it('should mask emails when policy is mask', () => {
      const content = 'Contact john@example.com for details';
      const result = service._applyPIIPolicy(content, 'mask');
      expect(result).toContain('***@***.***');
      expect(result).not.toContain('john@example.com');
    });

    it('should remove emails when policy is remove', () => {
      const content = 'Contact john@example.com for details';
      const result = service._applyPIIPolicy(content, 'remove');
      expect(result).not.toContain('john@example.com');
      expect(result).not.toContain('***@***.***');
    });

    it('should mask phone numbers', () => {
      const content = 'Call 555-123-4567 or (555) 987-6543';
      const result = service._applyPIIPolicy(content, 'mask');
      expect(result).toContain('(***) ***-****');
    });

    it('should allow content when policy is allow_internal', () => {
      const content = 'Contact john@example.com for details';
      const result = service._applyPIIPolicy(content, 'allow_internal');
      expect(result).toBe(content);
    });

    it('should default to mask policy', () => {
      const content = 'Email: test@test.com';
      const result = service._applyPIIPolicy(content);
      expect(result).toContain('***@***.***');
    });
  });

  describe('_formatOutput', () => {
    it('should return markdown content unchanged', async () => {
      const content = '# Title\nBody';
      const result = await service._formatOutput(content, 'markdown');
      expect(result).toBe(content);
    });

    it('should convert to HTML when pandoc available', async () => {
      execSync.mockReturnValue('<h1>Title</h1>');
      fs.writeFileSync.mockImplementation(() => {});
      fs.unlinkSync = jest.fn();

      const result = await service._formatOutput('# Title', 'html');

      expect(result).toBe('<h1>Title</h1>');
    });

    it('should return markdown when pandoc not available', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      execSync.mockImplementation(() => { throw new Error('pandoc not found'); });

      const result = await service._formatOutput('# Title', 'html');

      expect(result).toBe('# Title');
      console.warn.mockRestore();
    });

    it('should throw for PDF format', async () => {
      await expect(service._formatOutput('content', 'pdf')).rejects.toThrow('PDF generation requires pandoc');
    });

    it('should convert to JSON format', async () => {
      const content = '# Title\nBody content';
      const result = await service._formatOutput(content, 'json');
      const parsed = JSON.parse(result);

      expect(parsed.title).toBe('Title');
      expect(parsed.sections).toBeDefined();
    });
  });

  describe('_markdownToJSON', () => {
    it('should parse markdown into sections', () => {
      const content = '# Main Title\nBody 1\n## Section 1\nBody 2\n## Section 2\nBody 3';
      const result = service._markdownToJSON(content);

      expect(result.title).toBe('Main Title');
      expect(result.sections.length).toBe(3);
      expect(result.sections[0].level).toBe(1);
      expect(result.sections[1].level).toBe(2);
    });

    it('should calculate word counts', () => {
      const content = '# Title\nOne two three\n## Section\nFour five';
      const result = service._markdownToJSON(content);

      expect(result.sections[0].word_count).toBe(3);
      expect(result.sections[1].word_count).toBe(2);
    });
  });

  describe('_validateOutput', () => {
    const request = { inputs: { metrics: { x: 1 } } };

    it('should detect PII', () => {
      const content = 'Contact john@example.com';
      const result = service._validateOutput(content, request);
      expect(result.pii_detected).toBe(true);
    });

    it('should detect generic placeholders as hallucination', () => {
      const content = 'Contact Example Corp at jane@example.com';
      const result = service._validateOutput(content, request);

      expect(result.hallucination_risk).toBe(1.0);
      expect(result.unsupported_claims.length).toBeGreaterThan(0);
    });

    it('should pass clean content', () => {
      const content = 'This is a clean report with no PII';
      const result = service._validateOutput(content, request);

      expect(result.pii_detected).toBe(false);
      expect(result.hallucination_risk).toBe(0);
    });
  });

  describe('_detectPII', () => {
    it('should detect email addresses', () => {
      expect(service._detectPII('test@example.com')).toBe(true);
    });

    it('should detect phone numbers', () => {
      expect(service._detectPII('555-123-4567')).toBe(true);
    });

    it('should return false for clean content', () => {
      expect(service._detectPII('No PII here')).toBe(false);
    });
  });

  describe('_trimToEssentials', () => {
    it('should keep only essential sections', () => {
      const content = '## Summary\nKeep this\n## Details\nRemove this\n## Highlights\nKeep this\n## Technical\nRemove';
      const result = service._trimToEssentials(content);

      expect(result).toContain('Summary');
      expect(result).toContain('Highlights');
      expect(result).not.toContain('Technical');
    });
  });

  describe('_generateTraceId', () => {
    it('should generate unique trace IDs', () => {
      const id1 = service._generateTraceId();
      const id2 = service._generateTraceId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^report-\d+-[a-z0-9]+$/);
    });
  });

  describe('_hashObject', () => {
    it('should generate consistent hashes', () => {
      const obj = { a: 1, b: 2 };
      const hash1 = service._hashObject(obj);
      const hash2 = service._hashObject(obj);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(16);
    });

    it('should generate different hashes for different objects', () => {
      const hash1 = service._hashObject({ a: 1 });
      const hash2 = service._hashObject({ a: 2 });

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('_getGenericTemplate', () => {
    it('should return template with all placeholders', () => {
      const template = service._getGenericTemplate('exec');

      expect(template).toContain('{{title}}');
      expect(template).toContain('{{key_messages}}');
      expect(template).toContain('{{objectives}}');
      expect(template).toContain('{{facts}}');
      expect(template).toContain('{{metrics_table}}');
      expect(template).toContain('{{tables}}');
      expect(template).toContain('{{risks}}');
      expect(template).toContain('{{decisions}}');
      expect(template).toContain('{{links}}');
    });
  });

  describe('_adaptToAudience', () => {
    it('should trim for exec with short length', () => {
      const content = '## Summary\nImportant\n## Technical\nDetails\n## Highlights\nMore';
      const result = service._adaptToAudience(content, 'exec', { length: 'short' });

      expect(result).toContain('Summary');
      expect(result).not.toContain('Technical');
    });

    it('should keep all content for engineering', () => {
      const content = '## Summary\nImportant\n## Technical\nDetails';
      const result = service._adaptToAudience(content, 'engineering', { style: 'analytical' });

      expect(result).toContain('Technical');
    });
  });
});
