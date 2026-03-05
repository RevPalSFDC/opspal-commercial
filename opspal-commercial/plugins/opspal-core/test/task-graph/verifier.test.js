/**
 * Verifier Unit Tests
 * Tests deterministic verification gate execution
 */

const { Verifier } = require('../../scripts/lib/task-graph');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('Verifier', () => {
  let verifier;
  let tempDir;

  beforeEach(() => {
    verifier = new Verifier();
    // Create temp directory for file tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifier-test-'));
  });

  afterEach(() => {
    // Cleanup temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should load default verification matrix', () => {
      expect(verifier.verificationMatrix).toBeDefined();
      expect(verifier.verificationMatrix['salesforce-apex']).toBeDefined();
    });

    it('should accept custom verification matrix via options', () => {
      const customVerifier = new Verifier({
        verificationMatrix: {
          'custom-domain': {
            required: [{ name: 'custom_gate', type: 'command', command: 'echo test' }],
            optional: []
          }
        }
      });
      expect(customVerifier.verificationMatrix['custom-domain']).toBeDefined();
    });

    it('should accept custom options', () => {
      const customVerifier = new Verifier({
        timeoutMs: 60000,
        continueOnFailure: true,
        collectEvidence: false
      });
      expect(customVerifier.options.timeoutMs).toBe(60000);
      expect(customVerifier.options.continueOnFailure).toBe(true);
      expect(customVerifier.options.collectEvidence).toBe(false);
    });
  });

  describe('loadMatrix', () => {
    it('should load verification matrix from file', () => {
      const matrixPath = path.join(tempDir, 'matrix.json');
      fs.writeFileSync(matrixPath, JSON.stringify({
        verification_gates: {
          'file-domain': {
            required: [{ name: 'file_gate', type: 'command', command: 'ls' }],
            optional: []
          }
        }
      }));

      verifier.loadMatrix(matrixPath);
      expect(verifier.verificationMatrix['file-domain']).toBeDefined();
    });
  });

  describe('addGate', () => {
    it('should add a required gate to domain', () => {
      verifier.addGate('new-domain', { name: 'new_gate', type: 'command', command: 'echo test' }, true);
      expect(verifier.verificationMatrix['new-domain'].required).toHaveLength(1);
      expect(verifier.verificationMatrix['new-domain'].required[0].name).toBe('new_gate');
    });

    it('should add an optional gate to domain', () => {
      verifier.addGate('new-domain', { name: 'optional_gate', type: 'command', command: 'echo test' }, false);
      expect(verifier.verificationMatrix['new-domain'].optional).toHaveLength(1);
    });

    it('should create domain if it does not exist', () => {
      expect(verifier.verificationMatrix['brand-new-domain']).toBeUndefined();
      verifier.addGate('brand-new-domain', { name: 'gate', type: 'command', command: 'echo' }, true);
      expect(verifier.verificationMatrix['brand-new-domain']).toBeDefined();
    });
  });

  describe('runGate', () => {
    describe('command gates', () => {
      it('should execute command gate successfully', async () => {
        const gate = {
          name: 'test_gate',
          type: 'command',
          command: 'echo "success"',
          success_criteria: {
            exit_code: 0
          }
        };

        const result = await verifier.runGate(gate);
        expect(result.passed).toBe(true);
        expect(result.name).toBe('test_gate');
        expect(result.type).toBe('command');
        expect(result.evidence).toBeDefined();
        expect(result.evidence.content).toContain('success');
      });

      it('should fail on non-zero exit code', async () => {
        const gate = {
          name: 'failing_gate',
          type: 'command',
          command: 'bash -c "exit 1"',
          success_criteria: {
            exit_code: 0
          }
        };

        const result = await verifier.runGate(gate);
        expect(result.passed).toBe(false);
      });

      it('should capture command output as evidence', async () => {
        const gate = {
          name: 'output_gate',
          type: 'command',
          command: 'echo "test output line 1" && echo "test output line 2"',
          success_criteria: {
            exit_code: 0
          }
        };

        const result = await verifier.runGate(gate);
        expect(result.evidence.type).toBe('command_output');
        expect(result.evidence.content).toContain('test output line 1');
        expect(result.evidence.content).toContain('test output line 2');
      });

      it('should include timing information', async () => {
        const gate = {
          name: 'timed_gate',
          type: 'command',
          command: 'echo "done"',
          success_criteria: { exit_code: 0 }
        };

        const result = await verifier.runGate(gate);
        expect(result.started_at).toBeDefined();
        expect(result.completed_at).toBeDefined();
      });
    });

    describe('file_exists gates', () => {
      it('should pass when file exists and should_exist is true', async () => {
        const testFile = path.join(tempDir, 'exists.txt');
        fs.writeFileSync(testFile, 'content');

        const fileVerifier = new Verifier({ workingDir: tempDir });
        const gate = {
          name: 'file_check',
          type: 'file_exists',
          path: 'exists.txt',
          should_exist: true
        };

        const result = await fileVerifier.runGate(gate);
        expect(result.passed).toBe(true);
      });

      it('should fail when file does not exist and should_exist is true', async () => {
        const fileVerifier = new Verifier({ workingDir: tempDir });
        const gate = {
          name: 'missing_file_check',
          type: 'file_exists',
          path: 'nonexistent.txt',
          should_exist: true
        };

        const result = await fileVerifier.runGate(gate);
        expect(result.passed).toBe(false);
      });

      it('should pass when file does not exist and should_exist is false', async () => {
        const fileVerifier = new Verifier({ workingDir: tempDir });
        const gate = {
          name: 'absence_check',
          type: 'file_exists',
          path: 'should-not-exist.txt',
          should_exist: false
        };

        const result = await fileVerifier.runGate(gate);
        expect(result.passed).toBe(true);
      });
    });

    describe('file_content gates', () => {
      it('should pass when content contains expected string', async () => {
        const testFile = path.join(tempDir, 'content.txt');
        fs.writeFileSync(testFile, 'This file contains the expected content');

        const fileVerifier = new Verifier({ workingDir: tempDir });
        const gate = {
          name: 'content_check',
          type: 'file_content',
          path: 'content.txt',
          contains: 'expected content'
        };

        const result = await fileVerifier.runGate(gate);
        expect(result.passed).toBe(true);
      });

      it('should fail when content does not contain expected string', async () => {
        const testFile = path.join(tempDir, 'content.txt');
        fs.writeFileSync(testFile, 'This file has some content');

        const fileVerifier = new Verifier({ workingDir: tempDir });
        const gate = {
          name: 'content_check',
          type: 'file_content',
          path: 'content.txt',
          contains: 'THIS STRING DOES NOT EXIST'
        };

        const result = await fileVerifier.runGate(gate);
        expect(result.passed).toBe(false);
      });

      it('should support regex patterns with matches', async () => {
        const testFile = path.join(tempDir, 'regex.txt');
        fs.writeFileSync(testFile, 'version: 1.2.3');

        const fileVerifier = new Verifier({ workingDir: tempDir });
        const gate = {
          name: 'regex_check',
          type: 'file_content',
          path: 'regex.txt',
          matches: 'version:\\s*\\d+\\.\\d+\\.\\d+'
        };

        const result = await fileVerifier.runGate(gate);
        expect(result.passed).toBe(true);
      });

      it('should support not_contains check', async () => {
        const testFile = path.join(tempDir, 'clean.txt');
        fs.writeFileSync(testFile, 'This file is clean');

        const fileVerifier = new Verifier({ workingDir: tempDir });
        const gate = {
          name: 'not_contains_check',
          type: 'file_content',
          path: 'clean.txt',
          not_contains: 'FORBIDDEN_PATTERN'
        };

        const result = await fileVerifier.runGate(gate);
        expect(result.passed).toBe(true);
      });

      it('should fail when file does not exist', async () => {
        const fileVerifier = new Verifier({ workingDir: tempDir });
        const gate = {
          name: 'missing_content_check',
          type: 'file_content',
          path: 'nonexistent.txt',
          contains: 'anything'
        };

        const result = await fileVerifier.runGate(gate);
        expect(result.passed).toBe(false);
        expect(result.error).toContain('not found');
      });
    });

    describe('json_schema gates', () => {
      it('should pass when JSON has required fields', async () => {
        const testFile = path.join(tempDir, 'valid.json');
        fs.writeFileSync(testFile, JSON.stringify({ name: 'test', value: 42 }));

        const fileVerifier = new Verifier({ workingDir: tempDir });
        const gate = {
          name: 'schema_check',
          type: 'json_schema',
          path: 'valid.json',
          required_fields: ['name', 'value']
        };

        const result = await fileVerifier.runGate(gate);
        expect(result.passed).toBe(true);
      });

      it('should fail when JSON is missing required fields', async () => {
        const testFile = path.join(tempDir, 'invalid.json');
        fs.writeFileSync(testFile, JSON.stringify({ name: 'test' }));

        const fileVerifier = new Verifier({ workingDir: tempDir });
        const gate = {
          name: 'schema_check',
          type: 'json_schema',
          path: 'invalid.json',
          required_fields: ['name', 'value', 'description']
        };

        const result = await fileVerifier.runGate(gate);
        expect(result.passed).toBe(false);
        expect(result.evidence.content).toContain('Missing fields');
      });

      it('should fail on invalid JSON', async () => {
        const testFile = path.join(tempDir, 'broken.json');
        fs.writeFileSync(testFile, 'not valid json {{{');

        const fileVerifier = new Verifier({ workingDir: tempDir });
        const gate = {
          name: 'schema_check',
          type: 'json_schema',
          path: 'broken.json',
          required_fields: ['name']
        };

        const result = await fileVerifier.runGate(gate);
        expect(result.passed).toBe(false);
        expect(result.error).toContain('Invalid JSON');
      });
    });

    describe('custom gates', () => {
      it('should execute custom validator function', async () => {
        const gate = {
          name: 'custom_check',
          type: 'custom',
          validator: async (workingDir) => {
            return {
              passed: true,
              message: 'Custom validation passed'
            };
          }
        };

        const result = await verifier.runGate(gate);
        expect(result.passed).toBe(true);
      });

      it('should handle custom validation failure', async () => {
        const gate = {
          name: 'custom_check',
          type: 'custom',
          validator: async () => {
            return {
              passed: false,
              message: 'Custom validation failed'
            };
          }
        };

        const result = await verifier.runGate(gate);
        expect(result.passed).toBe(false);
      });

      it('should throw error if validator is not a function', async () => {
        const gate = {
          name: 'invalid_custom',
          type: 'custom',
          validator: 'not a function'
        };

        const result = await verifier.runGate(gate);
        expect(result.passed).toBe(false);
        expect(result.error).toContain('requires validator function');
      });
    });

    describe('unknown gate type', () => {
      it('should fail for unknown gate type', async () => {
        const gate = {
          name: 'unknown_gate',
          type: 'nonexistent_type'
        };

        const result = await verifier.runGate(gate);
        expect(result.passed).toBe(false);
        expect(result.error).toContain('Unknown gate type');
      });
    });
  });

  describe('verify', () => {
    it('should run all required gates for domain', async () => {
      const testVerifier = new Verifier({
        verificationMatrix: {
          'salesforce-apex': {
            required: [
              {
                name: 'simple_check',
                type: 'command',
                command: 'echo "pass"',
                success_criteria: { exit_code: 0 }
              }
            ],
            optional: []
          }
        }
      });

      const taskSpec = {
        id: 'T-01',
        domain: 'salesforce-apex',
        acceptance_criteria: ['File created']
      };

      const resultBundle = {
        task_id: 'T-01',
        status: 'success',
        files_changed: ['test.cls']
      };

      const result = await testVerifier.verify(taskSpec, resultBundle);
      expect(result.task_id).toBe('T-01');
      expect(result.domain).toBe('salesforce-apex');
      expect(result.gates).toHaveLength(1);
      expect(result.gates[0].name).toBe('simple_check');
      expect(result.verified_at).toBeDefined();
    });

    it('should fail if any required gate fails', async () => {
      const testVerifier = new Verifier({
        verificationMatrix: {
          'test-domain': {
            required: [
              {
                name: 'passing_gate',
                type: 'command',
                command: 'echo "pass"',
                success_criteria: { exit_code: 0 }
              },
              {
                name: 'failing_gate',
                type: 'command',
                command: 'bash -c "exit 1"',
                success_criteria: { exit_code: 0 }
              }
            ],
            optional: []
          }
        }
      });

      const taskSpec = { id: 'T-01', domain: 'test-domain', acceptance_criteria: [] };
      const resultBundle = { task_id: 'T-01', status: 'success' };

      const result = await testVerifier.verify(taskSpec, resultBundle);
      expect(result.passed).toBe(false);
    });

    it('should continue on failure when continueOnFailure is true', async () => {
      const testVerifier = new Verifier({
        continueOnFailure: true,
        verificationMatrix: {
          'test-domain': {
            required: [
              {
                name: 'failing_gate',
                type: 'command',
                command: 'bash -c "exit 1"',
                success_criteria: { exit_code: 0 }
              },
              {
                name: 'passing_gate',
                type: 'command',
                command: 'echo "pass"',
                success_criteria: { exit_code: 0 }
              }
            ],
            optional: []
          }
        }
      });

      const taskSpec = { id: 'T-01', domain: 'test-domain', acceptance_criteria: [] };
      const resultBundle = { task_id: 'T-01', status: 'success' };

      const result = await testVerifier.verify(taskSpec, resultBundle);
      expect(result.passed).toBe(false);
      // Both gates should have been run
      expect(result.gates).toHaveLength(2);
    });

    it('should pass for domains without gates', async () => {
      const taskSpec = { id: 'T-01', domain: 'no-gates-domain', acceptance_criteria: [] };
      const resultBundle = { task_id: 'T-01', status: 'success' };

      const result = await verifier.verify(taskSpec, resultBundle);
      expect(result.passed).toBe(true);
      expect(result.gates).toHaveLength(0);
    });

    it('should check acceptance criteria', async () => {
      const testVerifier = new Verifier({
        verificationMatrix: {
          'test-domain': {
            required: [],
            optional: []
          }
        }
      });

      const taskSpec = {
        id: 'T-01',
        domain: 'test-domain',
        acceptance_criteria: ['File created', 'Tests pass']
      };
      const resultBundle = {
        task_id: 'T-01',
        status: 'success',
        files_changed: ['new-file.js']
      };

      const result = await testVerifier.verify(taskSpec, resultBundle);
      expect(result.acceptance_criteria_met).toHaveLength(2);
    });

    it('should collect evidence when collectEvidence is true', async () => {
      const testVerifier = new Verifier({
        collectEvidence: true,
        verificationMatrix: {
          'test-domain': {
            required: [
              {
                name: 'evidence_gate',
                type: 'command',
                command: 'echo "evidence"',
                success_criteria: { exit_code: 0 }
              }
            ],
            optional: []
          }
        }
      });

      const taskSpec = { id: 'T-01', domain: 'test-domain', acceptance_criteria: [] };
      const resultBundle = { task_id: 'T-01', status: 'success' };

      const result = await testVerifier.verify(taskSpec, resultBundle);
      expect(result.evidence).toHaveLength(1);
      expect(result.evidence[0].content).toContain('evidence');
    });
  });

  describe('verifyAll', () => {
    it('should verify multiple tasks', async () => {
      const testVerifier = new Verifier({
        verificationMatrix: {
          'test-domain': {
            required: [
              {
                name: 'check',
                type: 'command',
                command: 'echo "pass"',
                success_criteria: { exit_code: 0 }
              }
            ],
            optional: []
          }
        }
      });

      const tasks = [
        {
          taskSpec: { id: 'T-01', domain: 'test-domain', acceptance_criteria: [] },
          resultBundle: { task_id: 'T-01', status: 'success' }
        },
        {
          taskSpec: { id: 'T-02', domain: 'test-domain', acceptance_criteria: [] },
          resultBundle: { task_id: 'T-02', status: 'success' }
        },
        {
          taskSpec: { id: 'T-03', domain: 'test-domain', acceptance_criteria: [] },
          resultBundle: { task_id: 'T-03', status: 'success' }
        }
      ];

      const allResults = await testVerifier.verifyAll(tasks);
      expect(allResults.overall_passed).toBe(true);
      expect(allResults.total).toBe(3);
      expect(allResults.passed_count).toBe(3);
      expect(allResults.failed_count).toBe(0);
      expect(allResults.results).toHaveLength(3);
    });

    it('should report overall failure if any task fails verification', async () => {
      const testVerifier = new Verifier({
        verificationMatrix: {
          'pass-domain': {
            required: [{ name: 'pass', type: 'command', command: 'echo "ok"', success_criteria: { exit_code: 0 } }],
            optional: []
          },
          'fail-domain': {
            required: [{ name: 'fail', type: 'command', command: 'bash -c "exit 1"', success_criteria: { exit_code: 0 } }],
            optional: []
          }
        }
      });

      const tasks = [
        {
          taskSpec: { id: 'T-01', domain: 'pass-domain', acceptance_criteria: [] },
          resultBundle: { task_id: 'T-01', status: 'success' }
        },
        {
          taskSpec: { id: 'T-02', domain: 'fail-domain', acceptance_criteria: [] },
          resultBundle: { task_id: 'T-02', status: 'success' }
        }
      ];

      const allResults = await testVerifier.verifyAll(tasks);
      expect(allResults.overall_passed).toBe(false);
      expect(allResults.failed_count).toBe(1);
      expect(allResults.failed_tasks).toContain('T-02');
    });

    it('should aggregate all evidence', async () => {
      const testVerifier = new Verifier({
        collectEvidence: true,
        verificationMatrix: {
          'test-domain': {
            required: [
              { name: 'check', type: 'command', command: 'echo "evidence"', success_criteria: { exit_code: 0 } }
            ],
            optional: []
          }
        }
      });

      const tasks = [
        {
          taskSpec: { id: 'T-01', domain: 'test-domain', acceptance_criteria: [] },
          resultBundle: { task_id: 'T-01', status: 'success' }
        },
        {
          taskSpec: { id: 'T-02', domain: 'test-domain', acceptance_criteria: [] },
          resultBundle: { task_id: 'T-02', status: 'success' }
        }
      ];

      const allResults = await testVerifier.verifyAll(tasks);
      expect(allResults.all_evidence.length).toBeGreaterThan(0);
    });
  });
});
