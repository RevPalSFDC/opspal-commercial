/**
 * json-output-enforcer.test.js
 *
 * Tests for JSONOutputEnforcer - ensures sub-agents return structured JSON output
 */

const enforcer = require('../json-output-enforcer');

describe('JSONOutputEnforcer', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
    console.error.mockRestore();
    console.warn.mockRestore();
  });

  describe('parseSubAgentOutput', () => {
    it('should parse direct JSON', () => {
      const result = enforcer.parseSubAgentOutput('{"key": "value"}');

      expect(result.success).toBe(true);
      expect(result.data.key).toBe('value');
      expect(result.method).toBe('direct');
    });

    it('should extract JSON from markdown code block', () => {
      const input = 'Some text\n```json\n{"key": "value"}\n```\nMore text';
      const result = enforcer.parseSubAgentOutput(input);

      expect(result.success).toBe(true);
      expect(result.data.key).toBe('value');
      expect(result.method).toBe('markdown');
    });

    it('should extract JSON array from markdown', () => {
      const input = '```\n[1, 2, 3]\n```';
      const result = enforcer.parseSubAgentOutput(input);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([1, 2, 3]);
    });

    it('should extract JSON from text', () => {
      const input = 'Result: {"status": "ok"} was returned';
      const result = enforcer.parseSubAgentOutput(input);

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('ok');
      expect(result.method).toBe('extraction');
    });

    it('should parse line-delimited JSON', () => {
      const input = '{"a": 1}\n{"b": 2}';
      const result = enforcer.parseSubAgentOutput(input, { expectWrappedJSON: false, fallbackToExtraction: false });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.method).toBe('line-delimited');
    });

    it('should return single object for single JSONL line', () => {
      const input = '{"single": true}';
      // Will be parsed as direct JSON
      const result = enforcer.parseSubAgentOutput(input);

      expect(result.success).toBe(true);
      expect(result.data.single).toBe(true);
    });

    it('should fail when no JSON found', () => {
      const result = enforcer.parseSubAgentOutput('Just plain text without JSON');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should throw in strict mode on failure', () => {
      expect(() => {
        enforcer.parseSubAgentOutput('Not JSON', { strict: true, agentName: 'test-agent' });
      }).toThrow('did not return valid JSON');
    });

    it('should include truncated raw output on failure', () => {
      const longText = 'x'.repeat(1000);
      const result = enforcer.parseSubAgentOutput(longText);

      expect(result.success).toBe(false);
      expect(result.rawOutput).toContain('...');
      expect(result.rawOutput.length).toBeLessThan(600);
    });

    it('should skip markdown extraction when disabled', () => {
      const input = '```json\n{"key": "value"}\n```';
      const result = enforcer.parseSubAgentOutput(input, {
        expectWrappedJSON: false,
        fallbackToExtraction: false
      });

      // Falls back to line-delimited check which fails, then extracts from text
      expect(result.success).toBe(false);
    });
  });

  describe('extractJSONFromMarkdown', () => {
    it('should extract from ```json block', () => {
      const input = '```json\n{"test": true}\n```';
      const result = enforcer.extractJSONFromMarkdown(input);
      expect(result).toBe('{"test": true}');
    });

    it('should extract object from plain code block', () => {
      const input = '```\n{"obj": 1}\n```';
      const result = enforcer.extractJSONFromMarkdown(input);
      expect(result).toBe('{"obj": 1}');
    });

    it('should extract array from plain code block', () => {
      const input = '```\n[1, 2, 3]\n```';
      const result = enforcer.extractJSONFromMarkdown(input);
      expect(result).toBe('[1, 2, 3]');
    });

    it('should return null when no code block', () => {
      const result = enforcer.extractJSONFromMarkdown('No code block here');
      expect(result).toBeNull();
    });
  });

  describe('extractJSONFromText', () => {
    it('should extract first JSON object', () => {
      const input = 'prefix {"key": "value"} suffix';
      const result = enforcer.extractJSONFromText(input);
      expect(result).toBe('{"key": "value"}');
    });

    it('should extract nested JSON object', () => {
      const input = '{"outer": {"inner": "value"}}';
      const result = enforcer.extractJSONFromText(input);
      expect(result).toBe('{"outer": {"inner": "value"}}');
    });

    it('should extract array', () => {
      const input = 'data: [1, 2, 3] end';
      const result = enforcer.extractJSONFromText(input);
      expect(result).toBe('[1, 2, 3]');
    });

    it('should return null when no JSON', () => {
      const result = enforcer.extractJSONFromText('no json here');
      expect(result).toBeNull();
    });

    it('should handle unbalanced braces', () => {
      const input = '{ incomplete';
      const result = enforcer.extractJSONFromText(input);
      expect(result).toBeNull();
    });
  });

  describe('parseLineDelimitedJSON', () => {
    it('should parse multiple JSON lines', () => {
      const input = '{"a": 1}\n{"b": 2}\n{"c": 3}';
      const result = enforcer.parseLineDelimitedJSON(input);

      expect(result).toHaveLength(3);
      expect(result[0].a).toBe(1);
    });

    it('should return single object for one line', () => {
      const input = '{"single": true}';
      const result = enforcer.parseLineDelimitedJSON(input);
      expect(result.single).toBe(true);
    });

    it('should filter empty lines', () => {
      const input = '{"a": 1}\n\n{"b": 2}\n';
      const result = enforcer.parseLineDelimitedJSON(input);
      expect(result).toHaveLength(2);
    });

    it('should return null for empty input', () => {
      const result = enforcer.parseLineDelimitedJSON('');
      expect(result).toBeNull();
    });

    it('should return null for invalid JSONL', () => {
      const input = '{"valid": true}\nnot valid json';
      const result = enforcer.parseLineDelimitedJSON(input);
      expect(result).toBeNull();
    });
  });

  describe('enforceJSONInPrompt', () => {
    it('should add enforcement to prompt', () => {
      const basePrompt = 'Do something';
      const enhanced = enforcer.enforceJSONInPrompt(basePrompt);

      expect(enhanced).toContain('Do something');
      expect(enhanced).toContain('MANDATORY');
      expect(enhanced).toContain('JSON');
    });

    it('should include schema when provided', () => {
      const schema = { type: 'object', required: ['field1'] };
      const enhanced = enforcer.enforceJSONInPrompt('Prompt', schema);

      expect(enhanced).toContain('field1');
      expect(enhanced).toContain('Expected Schema');
    });

    it('should include data source labels', () => {
      const enhanced = enforcer.enforceJSONInPrompt('Prompt');

      expect(enhanced).toContain('VERIFIED');
      expect(enhanced).toContain('SIMULATED');
      expect(enhanced).toContain('FAILED');
      expect(enhanced).toContain('UNKNOWN');
    });
  });

  describe('validateCompliance', () => {
    it('should pass for fully compliant output', () => {
      const output = {
        data_source: 'VERIFIED',
        query_executed: 'SELECT * FROM table',
        result: {}
      };

      const result = enforcer.validateCompliance(output);

      expect(result.compliant).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should fail when data_source missing', () => {
      const result = enforcer.validateCompliance({ result: {} });

      expect(result.compliant).toBe(false);
      expect(result.issues.some(i => i.includes('data_source'))).toBe(true);
    });

    it('should fail for invalid data_source value', () => {
      const result = enforcer.validateCompliance({ data_source: 'INVALID' });

      expect(result.compliant).toBe(false);
      expect(result.issues.some(i => i.includes('Invalid data_source'))).toBe(true);
    });

    it('should require simulated_warning for SIMULATED', () => {
      const result = enforcer.validateCompliance({ data_source: 'SIMULATED' });

      expect(result.compliant).toBe(false);
      expect(result.issues.some(i => i.includes('simulated_warning'))).toBe(true);
    });

    it('should pass SIMULATED with warning', () => {
      const result = enforcer.validateCompliance({
        data_source: 'SIMULATED',
        simulated_warning: 'This is mock data'
      });

      expect(result.compliant).toBe(true);
    });

    it('should require failure_reason for FAILED', () => {
      const result = enforcer.validateCompliance({ data_source: 'FAILED' });

      expect(result.compliant).toBe(false);
      expect(result.issues.some(i => i.includes('failure_reason'))).toBe(true);
    });

    it('should pass FAILED with reason', () => {
      const result = enforcer.validateCompliance({
        data_source: 'FAILED',
        failure_reason: 'Connection timeout'
      });

      expect(result.compliant).toBe(true);
    });

    it('should warn about missing query_executed for VERIFIED', () => {
      const result = enforcer.validateCompliance({ data_source: 'VERIFIED' });

      expect(result.compliant).toBe(false);
      expect(result.issues.some(i => i.includes('query_executed'))).toBe(true);
    });

    it('should pass UNKNOWN without additional fields', () => {
      const result = enforcer.validateCompliance({ data_source: 'UNKNOWN' });
      expect(result.compliant).toBe(true);
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate report with correct totals', () => {
      const results = [
        { success: true, compliant: true, data: { data_source: 'VERIFIED' } },
        { success: true, compliant: true, data: { data_source: 'SIMULATED' } },
        { success: false, compliant: false, agentName: 'failing', issues: ['error'] }
      ];

      const report = enforcer.generateComplianceReport(results);

      expect(report.totalAgents).toBe(3);
      expect(report.compliantAgents).toBe(2);
      expect(report.complianceRate).toBe(67);
    });

    it('should categorize data sources', () => {
      const results = [
        { success: true, compliant: true, data: { data_source: 'VERIFIED' } },
        { success: true, compliant: true, data: { data_source: 'VERIFIED' } },
        { success: true, compliant: true, data: { data_source: 'SIMULATED' } },
        { success: true, compliant: true, data: { data_source: 'FAILED' } }
      ];

      const report = enforcer.generateComplianceReport(results);

      expect(report.summary.verified).toBe(2);
      expect(report.summary.simulated).toBe(1);
      expect(report.summary.failed).toBe(1);
    });

    it('should list non-compliant agents', () => {
      const results = [
        { compliant: false, agentName: 'agent1', issues: ['issue1'] },
        { compliant: true }
      ];

      const report = enforcer.generateComplianceReport(results);

      expect(report.nonCompliantAgents).toHaveLength(1);
      expect(report.nonCompliantAgents[0].agentName).toBe('agent1');
    });

    it('should handle empty results', () => {
      const report = enforcer.generateComplianceReport([]);

      expect(report.totalAgents).toBe(0);
      expect(report.complianceRate).toBe(0);
    });
  });

  describe('wrapExecution', () => {
    it('should handle execution errors', async () => {
      const failingExecution = jest.fn().mockRejectedValue(new Error('Exec failed'));

      const result = await enforcer.wrapExecution(failingExecution, {
        agentName: 'failing-agent'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Exec failed');
    });

    it('should parse and validate successful execution', async () => {
      // Mock verifier
      jest.mock('../subagent-verifier', () => ({
        verifyOutput: jest.fn().mockReturnValue({ valid: true, summary: {} })
      }), { virtual: true });

      const successExecution = jest.fn().mockResolvedValue(JSON.stringify({
        data_source: 'VERIFIED',
        query_executed: 'SELECT *',
        result: {}
      }));

      const result = await enforcer.wrapExecution(successExecution, {
        agentName: 'success-agent',
        verifyOutput: false  // Skip verification to avoid mock issues
      });

      expect(result.success).toBe(true);
      expect(result.data.data_source).toBe('VERIFIED');
    });

    it('should return error when JSON parsing fails', async () => {
      const badOutput = jest.fn().mockResolvedValue('Not JSON at all');

      const result = await enforcer.wrapExecution(badOutput, {
        agentName: 'bad-agent',
        verifyOutput: false
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not valid JSON');
    });
  });
});
