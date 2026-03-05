#!/usr/bin/env node
/**
 * Parallel Hypothesis Executor - Bug Fix Pipeline Core Engine
 *
 * Purpose: Execute multiple bug fix hypotheses in parallel using headless
 * Claude processes, each on its own git branch. Collects results into a
 * ledger for the user to review and choose the winning hypothesis.
 *
 * Workflow:
 *   1. Stash user's uncommitted work
 *   2. Create N branches (fix/bugfix-<id>-hyp-{1,2,3})
 *   3. Spawn N headless `claude --print` processes
 *   4. Each implements its hypothesis + runs tests
 *   5. Collect results into ledger
 *   6. Restore original branch + stash
 *
 * Usage:
 *   node parallel-hypothesis-executor.js \
 *     --run-id bugfix-abc \
 *     --hypotheses '<json>' \
 *     --test-cmd 'npx jest path/to/test' \
 *     [--timeout 300000] \
 *     [--dry-run]
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { HypothesisResultLedger } = require('./hypothesis-result-ledger');

class ParallelHypothesisExecutor {
  constructor(options = {}) {
    this.runId = options.runId || `bugfix-${Date.now().toString(36)}`;
    this.hypotheses = options.hypotheses || [];
    this.testCommand = options.testCommand || 'npm test';
    this.timeout = options.timeout || 300000; // 5 min per hypothesis
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;
    this.maxBudget = options.maxBudget || 0.50;

    this.ledger = new HypothesisResultLedger(this.runId);
    this.childProcesses = [];
    this.originalState = null;

    // Cleanup on SIGINT
    process.on('SIGINT', () => this._emergencyCleanup());
    process.on('SIGTERM', () => this._emergencyCleanup());
  }

  /**
   * Main entry point -- run all hypotheses in parallel
   */
  async execute() {
    const startTime = Date.now();

    try {
      // 1. Save git state
      this._log('Saving git state...');
      this.originalState = this._saveGitState();
      this.ledger.setRunMetadata({
        originalBranch: this.originalState.branch,
        testCommand: this.testCommand,
        hypothesisCount: this.hypotheses.length,
        startedAt: new Date().toISOString()
      });

      if (this.dryRun) {
        this._log('DRY RUN -- skipping branch creation and execution');
        this._logHypotheses();
        return this.ledger.getSummary();
      }

      // 2. Record all hypotheses as pending
      for (const hyp of this.hypotheses) {
        if (!this.ledger.hasCompleted('hypothesis', String(hyp.id))) {
          this.ledger.recordPending('hypothesis', String(hyp.id), {
            root_cause: hyp.root_cause,
            fix_description: hyp.fix_description,
            affected_files: hyp.affected_files,
            confidence: hyp.confidence,
            branchName: `fix/${this.runId}-hyp-${hyp.id}`
          });
        }
      }

      // 3. Create branches
      this._log('Creating hypothesis branches...');
      for (const hyp of this.hypotheses) {
        const branchName = `fix/${this.runId}-hyp-${hyp.id}`;
        this._createBranch(branchName);
      }

      // Return to original branch before spawning
      this._checkout(this.originalState.branch);

      // 4. Execute hypotheses in parallel
      this._log('Spawning parallel hypothesis workers...');
      const results = await this._executeParallel();

      // 5. Update ledger with final timing
      this.ledger.setRunMetadata({
        completedAt: new Date().toISOString(),
        totalDuration_ms: Date.now() - startTime
      });

      return {
        runId: this.runId,
        summary: this.ledger.getSummary(),
        results
      };

    } finally {
      // 6. Always restore original state
      if (this.originalState && !this.dryRun) {
        this._restoreGitState(this.originalState);
      }
    }
  }

  _log(msg) {
    if (this.verbose) {
      console.log(`  [hypothesis-executor] ${msg}`);
    }
  }

  _logHypotheses() {
    console.log('\nHypotheses to test:');
    for (const hyp of this.hypotheses) {
      console.log(`  #${hyp.id} (${Math.round(hyp.confidence * 100)}% confidence)`);
      console.log(`    Root cause: ${hyp.root_cause}`);
      console.log(`    Fix: ${hyp.fix_description}`);
      console.log(`    Files: ${hyp.affected_files.join(', ')}`);
      console.log(`    Branch: fix/${this.runId}-hyp-${hyp.id}`);
      console.log('');
    }
  }

  /**
   * Save current git state (branch + stash if dirty)
   */
  _saveGitState() {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    let stashRef = null;

    // Check for uncommitted changes
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (status) {
      this._log('Stashing uncommitted changes...');
      execSync('git stash push -m "bugfix-pipeline-autostash"', { encoding: 'utf8' });
      stashRef = execSync('git stash list --max-count=1', { encoding: 'utf8' }).trim();
    }

    return { branch, stashRef, hadChanges: !!status };
  }

  /**
   * Create a branch from current HEAD
   */
  _createBranch(branchName) {
    try {
      execSync(`git branch ${branchName}`, { encoding: 'utf8', stdio: 'pipe' });
      this._log(`Created branch: ${branchName}`);
    } catch (err) {
      // Branch may already exist from a previous interrupted run
      if (err.stderr && err.stderr.includes('already exists')) {
        this._log(`Branch exists (resuming): ${branchName}`);
      } else {
        throw err;
      }
    }
  }

  _checkout(branchName) {
    execSync(`git checkout ${branchName}`, { encoding: 'utf8', stdio: 'pipe' });
  }

  /**
   * Build the prompt for a headless Claude process
   */
  _buildHeadlessPrompt(hypothesis, branchName) {
    return `You are on branch "${branchName}". Implement this fix:

Root Cause: ${hypothesis.root_cause}
Fix: ${hypothesis.fix_description}
Files to modify: ${hypothesis.affected_files.join(', ')}

Instructions:
1. Read the affected files listed above
2. Implement the fix described above with minimal changes
3. Run the test command: ${this.testCommand}
4. If tests pass, commit with message: "fix: ${hypothesis.root_cause} (hypothesis ${hypothesis.id})"
5. Output ONLY this JSON (no other text):
{"status":"pass","tests_run":<N>,"tests_passed":<N>,"changes_made":[<files>],"commit_sha":"<sha>"}

If tests fail after your fix attempt, output:
{"status":"fail","tests_run":<N>,"tests_passed":<N>,"error":"<error message>"}

Rules:
- Do NOT switch branches
- Do NOT push
- Keep changes minimal
- Do NOT modify files outside the listed affected files`;
  }

  /**
   * Spawn a single headless Claude process for a hypothesis
   */
  _spawnHeadlessProcess(hypothesis) {
    const branchName = `fix/${this.runId}-hyp-${hypothesis.id}`;
    const prompt = this._buildHeadlessPrompt(hypothesis, branchName);

    return new Promise((resolve) => {
      const hypId = String(hypothesis.id);

      this.ledger.recordStatus('hypothesis', hypId, 'implementing');

      // Build claude command
      const args = [
        '--print',
        '--dangerously-skip-permissions',
        '--output-format', 'text',
        '--max-turns', '20',
        '-p', prompt
      ];

      this._log(`Spawning worker for hypothesis #${hypothesis.id} on ${branchName}`);

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Spawn on the correct branch by setting GIT_WORK_TREE
      const child = spawn('claude', args, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          GIT_BRANCH: branchName
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.childProcesses.push(child);

      // Set up checkout on this branch before the process starts
      try {
        // We need to checkout the branch for this process
        // Since we can't do per-process branches easily, we'll use git worktree or sequential
        // For now, run sequentially with checkout per hypothesis
      } catch (e) {
        // handled in execute flow
      }

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 5000);
      }, this.timeout);

      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
        clearTimeout(timer);
        this.childProcesses = this.childProcesses.filter(p => p !== child);

        if (timedOut) {
          this.ledger.recordTimeout('hypothesis', hypId, {
            timeout_ms: this.timeout,
            partial_output: stdout.substring(0, 500)
          });
          resolve({ id: hypothesis.id, status: 'timeout', branchName });
          return;
        }

        // Parse result JSON from output
        const result = this._parseResult(stdout);

        if (result && result.status === 'pass') {
          this.ledger.recordPass('hypothesis', hypId, {
            ...result,
            branchName
          });
          resolve({ id: hypothesis.id, status: 'pass', branchName, ...result });
        } else if (result) {
          this.ledger.recordFail('hypothesis', hypId, {
            message: result.error || 'Tests failed',
            details: result
          });
          resolve({ id: hypothesis.id, status: 'fail', branchName, ...result });
        } else {
          this.ledger.recordError('hypothesis', hypId, {
            message: 'Could not parse result from headless process',
            stdout: stdout.substring(0, 1000),
            stderr: stderr.substring(0, 500),
            exitCode: code
          });
          resolve({ id: hypothesis.id, status: 'error', branchName, rawOutput: stdout.substring(0, 500) });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        this.ledger.recordError('hypothesis', hypId, err);
        resolve({ id: hypothesis.id, status: 'error', branchName, error: err.message });
      });
    });
  }

  /**
   * Execute all hypotheses -- sequential with branch checkouts
   * (git worktrees would be better but adds complexity; sequential is safer)
   */
  async _executeParallel() {
    const results = [];

    for (const hyp of this.hypotheses) {
      if (this.ledger.hasCompleted('hypothesis', String(hyp.id))) {
        this._log(`Hypothesis #${hyp.id} already completed, skipping`);
        const entry = this.ledger.getEntries().find(e => e.subkey === String(hyp.id));
        if (entry) results.push({ id: hyp.id, status: entry.status, branchName: entry.metadata?.branchName });
        continue;
      }

      const branchName = `fix/${this.runId}-hyp-${hyp.id}`;

      try {
        // Checkout the hypothesis branch
        this._checkout(branchName);

        // Spawn headless process
        const result = await this._spawnHeadlessProcess(hyp);
        results.push(result);

      } catch (err) {
        this.ledger.recordError('hypothesis', String(hyp.id), err);
        results.push({ id: hyp.id, status: 'error', error: err.message });
      }

      // Return to original branch between hypotheses
      try {
        this._checkout(this.originalState.branch);
      } catch (e) {
        // If checkout fails, try harder
        try {
          execSync('git checkout -- .', { encoding: 'utf8', stdio: 'pipe' });
          this._checkout(this.originalState.branch);
        } catch (e2) {
          this._log(`WARNING: Could not return to original branch: ${e2.message}`);
        }
      }
    }

    return results;
  }

  /**
   * Parse JSON result from headless process output
   */
  _parseResult(output) {
    if (!output) return null;

    // Try to find JSON in the output
    const jsonMatch = output.match(/\{[^{}]*"status"\s*:\s*"(?:pass|fail)"[^{}]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        // fall through
      }
    }

    // Try parsing the entire output
    try {
      const parsed = JSON.parse(output.trim());
      if (parsed.status) return parsed;
    } catch (e) {
      // fall through
    }

    // Look for pass/fail indicators
    if (output.includes('Tests:') && output.includes('passed')) {
      const testsMatch = output.match(/Tests:\s*(\d+)\s*passed/);
      if (testsMatch) {
        return { status: 'pass', tests_passed: parseInt(testsMatch[1]) };
      }
    }

    return null;
  }

  /**
   * Restore original git state
   */
  _restoreGitState(state) {
    try {
      this._checkout(state.branch);

      if (state.hadChanges && state.stashRef) {
        this._log('Restoring stashed changes...');
        try {
          execSync('git stash pop', { encoding: 'utf8', stdio: 'pipe' });
        } catch (e) {
          this._log('WARNING: Could not pop stash automatically. Run `git stash pop` manually.');
        }
      }
    } catch (e) {
      console.error(`ERROR: Could not restore git state: ${e.message}`);
      console.error(`Original branch: ${state.branch}`);
      if (state.stashRef) {
        console.error(`Stashed changes exist. Run: git checkout ${state.branch} && git stash pop`);
      }
    }
  }

  /**
   * Emergency cleanup on SIGINT/SIGTERM
   */
  _emergencyCleanup() {
    console.log('\nInterrupted -- cleaning up...');

    // Kill child processes
    for (const child of this.childProcesses) {
      try { child.kill('SIGTERM'); } catch (e) { /* ignore */ }
    }

    // Restore git state
    if (this.originalState) {
      this._restoreGitState(this.originalState);
    }

    console.log(`Ledger preserved at: ${this.ledger.ledgerPath}`);
    console.log('Resume with: /bugfix --resume');
    process.exit(1);
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);

  // Parse CLI args
  const getArg = (name) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=').slice(1).join('=') : null;
  };

  const runId = getArg('run-id') || `bugfix-${Date.now().toString(36)}`;
  const hypothesesJson = getArg('hypotheses');
  const testCmd = getArg('test-cmd') || 'npm test';
  const timeout = parseInt(getArg('timeout') || '300000');
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');

  if (!hypothesesJson && !args.includes('--help')) {
    console.error('Error: --hypotheses=<json> is required');
    console.log(`
Usage:
  node parallel-hypothesis-executor.js \\
    --run-id=<id> \\
    --hypotheses='<json-array>' \\
    --test-cmd='npx jest ...' \\
    [--timeout=300000] \\
    [--dry-run] \\
    [--verbose]
    `);
    process.exit(1);
  }

  if (args.includes('--help')) {
    console.log(`
Parallel Hypothesis Executor

Executes bug fix hypotheses on separate branches with headless Claude processes.

Usage:
  node parallel-hypothesis-executor.js \\
    --run-id=<id> \\
    --hypotheses='[{"id":1,"root_cause":"...","fix_description":"...","affected_files":["..."]}]' \\
    --test-cmd='npx jest path/to/test' \\
    [--timeout=300000] \\
    [--dry-run] \\
    [--verbose]

Options:
  --run-id       Unique identifier for this bugfix run
  --hypotheses   JSON array of hypothesis objects
  --test-cmd     Test command to verify fixes
  --timeout      Per-hypothesis timeout in ms (default: 300000)
  --dry-run      Show plan without executing
  --verbose      Detailed logging
    `);
    process.exit(0);
  }

  let hypotheses;
  try {
    hypotheses = JSON.parse(hypothesesJson);
  } catch (e) {
    console.error(`Error parsing hypotheses JSON: ${e.message}`);
    process.exit(1);
  }

  const executor = new ParallelHypothesisExecutor({
    runId,
    hypotheses,
    testCommand: testCmd,
    timeout,
    dryRun,
    verbose
  });

  executor.execute()
    .then(result => {
      console.log('\n' + JSON.stringify(result, null, 2));
    })
    .catch(err => {
      console.error(`Execution failed: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { ParallelHypothesisExecutor };
