/**
 * Verifier - Deterministic verification gate execution
 *
 * Provides:
 * - Domain-specific verification gate execution
 * - Success criteria validation
 * - Evidence collection
 * - Gate result aggregation
 * - Configurable verification matrix
 */

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = util.promisify(exec);

class Verifier {
  constructor(options = {}) {
    this.options = {
      timeoutMs: options.timeoutMs || 120000, // 2 minutes default
      continueOnFailure: options.continueOnFailure || false,
      collectEvidence: options.collectEvidence ?? true,
      workingDir: options.workingDir || process.cwd(),
      ...options
    };

    // Load verification matrix
    this.verificationMatrix = options.verificationMatrix || this.getDefaultMatrix();
  }

  /**
   * Get default verification matrix
   * @private
   */
  getDefaultMatrix() {
    return {
      'salesforce-apex': {
        required: [
          {
            name: 'apex_syntax_check',
            type: 'command',
            command: 'sf project deploy validate --source-dir force-app --dry-run',
            success_criteria: { exit_code: 0 }
          }
        ],
        optional: []
      },
      'salesforce-flow': {
        required: [
          {
            name: 'flow_xml_validation',
            type: 'command',
            command: 'sf project deploy validate --source-dir force-app/main/default/flows --dry-run',
            success_criteria: { exit_code: 0 }
          }
        ],
        optional: []
      },
      'salesforce-metadata': {
        required: [
          {
            name: 'metadata_validation',
            type: 'command',
            command: 'sf project deploy validate --source-dir force-app --dry-run',
            success_criteria: { exit_code: 0 }
          }
        ],
        optional: []
      },
      'hubspot-workflow': {
        required: [],
        optional: []
      },
      'data-transform': {
        required: [],
        optional: []
      }
    };
  }

  /**
   * Load verification matrix from file
   * @param {string} filePath - Path to verification matrix JSON
   */
  loadMatrix(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    this.verificationMatrix = JSON.parse(content).verification_gates || {};
  }

  /**
   * Verify a task result
   * @param {Object} taskSpec - TaskSpec being verified
   * @param {Object} resultBundle - Result to verify
   * @returns {Promise<Object>} Verification result
   */
  async verify(taskSpec, resultBundle) {
    const domain = taskSpec.domain;
    const gates = this.verificationMatrix[domain];

    const verificationResult = {
      task_id: taskSpec.id,
      domain,
      verified_at: new Date().toISOString(),
      passed: true,
      gates: [],
      evidence: [],
      acceptance_criteria_met: []
    };

    // Run verification gates
    if (gates?.required) {
      for (const gate of gates.required) {
        const gateResult = await this.runGate(gate);
        verificationResult.gates.push(gateResult);

        if (!gateResult.passed) {
          verificationResult.passed = false;
          if (!this.options.continueOnFailure) {
            break;
          }
        }

        if (this.options.collectEvidence && gateResult.evidence) {
          verificationResult.evidence.push(gateResult.evidence);
        }
      }
    }

    // Check acceptance criteria
    const criteriaResults = this.checkAcceptanceCriteria(
      taskSpec.acceptance_criteria,
      resultBundle
    );
    verificationResult.acceptance_criteria_met = criteriaResults;

    // Overall pass requires both gates and criteria
    const allCriteriaMet = criteriaResults.every(c => c.met);
    verificationResult.passed = verificationResult.passed && allCriteriaMet;

    return verificationResult;
  }

  /**
   * Run a single verification gate
   * @param {Object} gate - Gate configuration
   * @returns {Promise<Object>} Gate result
   */
  async runGate(gate) {
    const gateResult = {
      name: gate.name,
      type: gate.type,
      passed: false,
      started_at: new Date().toISOString(),
      completed_at: null,
      evidence: null,
      error: null
    };

    try {
      switch (gate.type) {
        case 'command':
          await this.runCommandGate(gate, gateResult);
          break;
        case 'file_exists':
          this.runFileExistsGate(gate, gateResult);
          break;
        case 'file_content':
          this.runFileContentGate(gate, gateResult);
          break;
        case 'json_schema':
          this.runJsonSchemaGate(gate, gateResult);
          break;
        case 'custom':
          await this.runCustomGate(gate, gateResult);
          break;
        default:
          throw new Error(`Unknown gate type: ${gate.type}`);
      }
    } catch (error) {
      gateResult.error = error.message;
      gateResult.passed = false;
    }

    gateResult.completed_at = new Date().toISOString();
    return gateResult;
  }

  /**
   * Run a command-based gate
   * @private
   */
  async runCommandGate(gate, gateResult) {
    const command = this.interpolateCommand(gate.command);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.options.workingDir,
        timeout: this.options.timeoutMs
      });

      gateResult.output = stdout;
      gateResult.stderr = stderr;

      // Check success criteria
      gateResult.passed = this.checkCommandCriteria(
        gate.success_criteria,
        { exit_code: 0, stdout, stderr }
      );

      // Build evidence
      gateResult.evidence = {
        type: 'command_output',
        description: `Gate: ${gate.name}`,
        content: `Command: ${command}\n\nOutput:\n${stdout}${stderr ? '\n\nStderr:\n' + stderr : ''}`,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      // Command failed (non-zero exit)
      gateResult.output = error.stdout || '';
      gateResult.stderr = error.stderr || error.message;

      // Some gates expect non-zero exit
      if (gate.success_criteria?.exit_code !== undefined) {
        gateResult.passed = error.code === gate.success_criteria.exit_code;
      } else {
        gateResult.passed = false;
      }

      gateResult.evidence = {
        type: 'command_output',
        description: `Gate: ${gate.name} (failed)`,
        content: `Command: ${command}\nExit code: ${error.code}\n\nOutput:\n${error.stdout || ''}\n\nError:\n${error.stderr || error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Run a file existence gate
   * @private
   */
  runFileExistsGate(gate, gateResult) {
    const filePath = path.resolve(this.options.workingDir, gate.path);
    const exists = fs.existsSync(filePath);

    gateResult.passed = gate.should_exist ? exists : !exists;
    gateResult.evidence = {
      type: 'validation',
      description: `File existence check: ${gate.path}`,
      content: `Path: ${filePath}\nExists: ${exists}\nExpected: ${gate.should_exist ? 'should exist' : 'should not exist'}`,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Run a file content gate
   * @private
   */
  runFileContentGate(gate, gateResult) {
    const filePath = path.resolve(this.options.workingDir, gate.path);

    if (!fs.existsSync(filePath)) {
      gateResult.passed = false;
      gateResult.error = `File not found: ${filePath}`;
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');

    if (gate.contains) {
      gateResult.passed = content.includes(gate.contains);
    } else if (gate.matches) {
      const regex = new RegExp(gate.matches);
      gateResult.passed = regex.test(content);
    } else if (gate.not_contains) {
      gateResult.passed = !content.includes(gate.not_contains);
    }

    gateResult.evidence = {
      type: 'validation',
      description: `File content check: ${gate.path}`,
      content: `Checked for: ${gate.contains || gate.matches || 'not:' + gate.not_contains}\nResult: ${gateResult.passed ? 'PASS' : 'FAIL'}`,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Run a JSON schema validation gate
   * @private
   */
  runJsonSchemaGate(gate, gateResult) {
    const filePath = path.resolve(this.options.workingDir, gate.path);

    if (!fs.existsSync(filePath)) {
      gateResult.passed = false;
      gateResult.error = `File not found: ${filePath}`;
      return;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const json = JSON.parse(content);

      // Basic schema validation (required fields)
      if (gate.required_fields) {
        const missing = gate.required_fields.filter(f => !(f in json));
        gateResult.passed = missing.length === 0;
        gateResult.evidence = {
          type: 'validation',
          description: `JSON schema check: ${gate.path}`,
          content: missing.length === 0
            ? 'All required fields present'
            : `Missing fields: ${missing.join(', ')}`,
          timestamp: new Date().toISOString()
        };
      } else {
        gateResult.passed = true;
      }
    } catch (error) {
      gateResult.passed = false;
      gateResult.error = `Invalid JSON: ${error.message}`;
    }
  }

  /**
   * Run a custom gate with function
   * @private
   */
  async runCustomGate(gate, gateResult) {
    if (typeof gate.validator !== 'function') {
      throw new Error('Custom gate requires validator function');
    }

    const result = await gate.validator(this.options.workingDir);

    gateResult.passed = result.passed;
    gateResult.evidence = result.evidence || {
      type: 'validation',
      description: `Custom gate: ${gate.name}`,
      content: result.message || (result.passed ? 'Passed' : 'Failed'),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Interpolate command with environment variables
   * @private
   */
  interpolateCommand(command) {
    return command.replace(/\{(\w+)\}/g, (match, key) => {
      return process.env[key] || match;
    });
  }

  /**
   * Check command success criteria
   * @private
   */
  checkCommandCriteria(criteria, result) {
    if (!criteria) return result.exit_code === 0;

    if (criteria.exit_code !== undefined && result.exit_code !== criteria.exit_code) {
      return false;
    }

    if (criteria.stdout_contains && !result.stdout.includes(criteria.stdout_contains)) {
      return false;
    }

    if (criteria.stdout_matches) {
      const regex = new RegExp(criteria.stdout_matches);
      if (!regex.test(result.stdout)) {
        return false;
      }
    }

    if (criteria.outcome) {
      // Try to parse JSON output
      try {
        const json = JSON.parse(result.stdout);
        if (json.outcome !== criteria.outcome && json.status !== criteria.outcome) {
          return false;
        }
      } catch (e) {
        // Not JSON, check as string
        if (!result.stdout.includes(criteria.outcome)) {
          return false;
        }
      }
    }

    if (criteria.coverage_threshold !== undefined) {
      // Try to extract coverage from output
      const coverageMatch = result.stdout.match(/coverage[:\s]+(\d+(?:\.\d+)?)/i);
      if (coverageMatch) {
        const coverage = parseFloat(coverageMatch[1]);
        if (coverage < criteria.coverage_threshold) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check acceptance criteria from task spec
   * @private
   */
  checkAcceptanceCriteria(criteria, resultBundle) {
    if (!criteria || criteria.length === 0) {
      return [];
    }

    return criteria.map(criterion => {
      // Acceptance criteria are typically human-verified
      // Here we do basic heuristic checks
      const result = {
        criterion,
        met: false,
        auto_verified: false
      };

      // Check if criterion mentions verification in result
      if (resultBundle.evidence?.some(e =>
        e.content?.toLowerCase().includes(criterion.toLowerCase().slice(0, 30))
      )) {
        result.met = true;
        result.auto_verified = true;
      }

      // Check if files were changed as expected
      if (criterion.toLowerCase().includes('file') && resultBundle.files_changed?.length > 0) {
        result.met = true;
        result.auto_verified = true;
      }

      // Default: mark as needing human verification
      if (!result.auto_verified) {
        result.needs_human_verification = true;
      }

      return result;
    });
  }

  /**
   * Add a custom gate to the verification matrix
   * @param {string} domain - Domain to add gate to
   * @param {Object} gate - Gate configuration
   * @param {boolean} required - Whether gate is required
   */
  addGate(domain, gate, required = true) {
    if (!this.verificationMatrix[domain]) {
      this.verificationMatrix[domain] = { required: [], optional: [] };
    }

    const list = required ? 'required' : 'optional';
    this.verificationMatrix[domain][list].push(gate);
  }

  /**
   * Verify multiple results and aggregate
   * @param {Array<Object>} tasks - Array of {taskSpec, resultBundle}
   * @returns {Promise<Object>} Aggregated verification result
   */
  async verifyAll(tasks) {
    const results = await Promise.all(
      tasks.map(({ taskSpec, resultBundle }) =>
        this.verify(taskSpec, resultBundle)
      )
    );

    const passed = results.filter(r => r.passed);
    const failed = results.filter(r => !r.passed);

    return {
      overall_passed: failed.length === 0,
      total: results.length,
      passed_count: passed.length,
      failed_count: failed.length,
      results,
      failed_tasks: failed.map(r => r.task_id),
      all_evidence: results.flatMap(r => r.evidence)
    };
  }
}

module.exports = { Verifier };
