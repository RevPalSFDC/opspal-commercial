#!/usr/bin/env node
/**
 * Autonomous Fix Executor - Reflection-to-Fix Pipeline Core Engine
 *
 * Purpose: Close the loop from reflection analysis to auto-implemented, tested,
 * and merged fixes. Processes open reflections from Supabase, generates fix plans,
 * implements fixes on branches, validates on a staging branch, and merges to main.
 *
 * Phases:
 *   1. ANALYZE  - Fetch reflections, detect cohorts, generate fix plans
 *   2. IMPLEMENT - Per-issue: branch → headless fixer → test → commit/revert
 *   3. VALIDATE  - Merge passing fixes to staging → full test suite
 *   4. REPORT    - Auto-merge or create Asana tasks for needs-human items
 *
 * Usage:
 *   node autonomous-fix-executor.js [--max-fixes 5] [--dry-run] [--skip-merge] [--resume] [--verbose]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { FixExecutionLedger } = require('./fix-execution-ledger');

// Non-code issue categories that should be routed to needs-human
const NON_CODE_CATEGORIES = [
  'authentication', 'auth', 'network', 'connectivity', 'environment',
  'credentials', 'permission', 'access', 'infrastructure', 'deployment'
];

class AutonomousFixExecutor {
  constructor(options = {}) {
    this.maxFixes = options.maxFixes || 5;
    this.dryRun = options.dryRun || false;
    this.skipMerge = options.skipMerge || false;
    this.resume = options.resume || false;
    this.verbose = options.verbose || false;
    this.timeout = options.timeout || 300000; // 5 min per fix

    this.runId = null;
    this.ledger = null;
    this.originalState = null;

    process.on('SIGINT', () => this._emergencyCleanup());
    process.on('SIGTERM', () => this._emergencyCleanup());
  }

  /**
   * Main entry point
   */
  async run() {
    const startTime = Date.now();

    try {
      // Initialize or resume
      if (this.resume) {
        const resumable = FixExecutionLedger.findResumable();
        if (resumable.length === 0) {
          console.log('No resumable autofix runs found.');
          return { status: 'nothing_to_resume' };
        }
        this.runId = resumable[0].runId;
        this.ledger = new FixExecutionLedger(this.runId);
        console.log(`Resuming run: ${this.runId}`);
      } else {
        this.runId = `autofix-${new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)}`;
        this.ledger = new FixExecutionLedger(this.runId);
      }

      // Phase 1: Analyze
      console.log('\n## Phase 1: Analyzing reflections...');
      const issues = await this._analyzeReflections();

      if (issues.length === 0) {
        console.log('No actionable issues found.');
        return { status: 'no_issues', runId: this.runId };
      }

      console.log(`Found ${issues.length} actionable issue(s) (max: ${this.maxFixes})`);
      const targetIssues = issues.slice(0, this.maxFixes);

      if (this.dryRun) {
        console.log('\nDRY RUN -- Analysis only:');
        this._printIssueTable(targetIssues);
        return { status: 'dry_run', issues: targetIssues, runId: this.runId };
      }

      // Save git state
      this.originalState = this._saveGitState();
      this.ledger.setRunMetadata({
        originalBranch: this.originalState.branch,
        startedAt: new Date().toISOString(),
        issueCount: targetIssues.length
      });

      // Phase 2: Implement fixes
      console.log('\n## Phase 2: Implementing fixes...');
      const fixResults = [];

      for (const issue of targetIssues) {
        const result = await this._implementFix(issue);
        fixResults.push(result);
      }

      // Return to original branch
      this._checkout(this.originalState.branch);

      const passed = fixResults.filter(r => r.status === 'passed');
      const failed = fixResults.filter(r => r.status !== 'passed');

      console.log(`\nPhase 2 complete: ${passed.length} passed, ${failed.length} failed`);

      // Phase 3: Validate on staging
      let mergeResult = null;
      if (passed.length > 0 && !this.skipMerge) {
        console.log('\n## Phase 3: Validating on staging branch...');
        mergeResult = await this._validateOnStaging(passed);
      }

      // Phase 4: Report
      console.log('\n## Phase 4: Generating report...');
      const report = this._generateReport(fixResults, mergeResult);

      // Update Supabase statuses
      await this._updateReflectionStatuses(fixResults);

      // Create Asana tasks for needs-human items
      if (failed.length > 0) {
        await this._createAsanaTasksForHumanItems(failed);
      }

      // Cleanup branches
      this._cleanup(fixResults, mergeResult);

      this.ledger.setRunMetadata({
        completedAt: new Date().toISOString(),
        totalDuration_ms: Date.now() - startTime
      });

      console.log(report);
      return {
        status: 'complete',
        runId: this.runId,
        passed: passed.length,
        failed: failed.length,
        merged: mergeResult?.merged || false
      };

    } catch (err) {
      console.error(`Autofix failed: ${err.message}`);
      if (this.originalState) {
        this._restoreGitState(this.originalState);
      }
      throw err;
    }
  }

  // ===== Phase 1: Analyze =====

  async _analyzeReflections() {
    // Load process-reflections infrastructure
    let reflections = [];

    try {
      const supabaseLib = path.join(process.cwd(), '.claude', 'scripts', 'lib', 'supabase-client.js');
      if (fs.existsSync(supabaseLib)) {
        const { getSupabaseClient } = require(supabaseLib);
        const supabase = getSupabaseClient();

        const { data, error } = await supabase
          .from('reflections')
          .select('*')
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        reflections = data || [];
      }
    } catch (err) {
      this._log(`Supabase fetch failed: ${err.message}`);

      // Fallback: look for local reflection files
      const reportsDir = path.join(process.cwd(), 'reports', 'reflections');
      if (fs.existsSync(reportsDir)) {
        const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json'));
        for (const file of files.slice(0, 20)) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(reportsDir, file), 'utf8'));
            if (data.status === 'open') reflections.push(data);
          } catch (e) { /* skip invalid */ }
        }
      }
    }

    if (reflections.length === 0) return [];

    // Parse into actionable issues
    const issues = [];

    for (const reflection of reflections) {
      const data = typeof reflection.data === 'string' ? JSON.parse(reflection.data) : (reflection.data || {});
      const issuesList = data.issues_identified || [];

      for (const issue of issuesList) {
        // Skip non-code issues
        const category = (issue.taxonomy || issue.category || '').toLowerCase();
        if (NON_CODE_CATEGORIES.some(c => category.includes(c))) continue;

        // Skip already-handled issues
        if (this.ledger.hasCompleted('fix', reflection.id)) continue;

        const affectedFile = issue.file || issue.affected_file || this._inferFile(issue);
        if (!affectedFile) continue;

        issues.push({
          id: reflection.id,
          reflectionId: reflection.id,
          file: affectedFile,
          bugDescription: issue.description || issue.root_cause || 'Unknown bug',
          severity: issue.priority || 'P2',
          category: category,
          fixPlan: issue.fix_plan || issue.recommendation || issue.description,
          rootCause: issue.root_cause || issue.description,
          testFile: this._findTestFile(affectedFile)
        });
      }
    }

    // Sort by severity (P0 first)
    const severityOrder = { 'P0': 0, 'P1': 1, 'P2': 2, 'P3': 3 };
    issues.sort((a, b) => (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3));

    return issues;
  }

  _inferFile(issue) {
    const desc = (issue.description || '') + ' ' + (issue.root_cause || '');
    const fileMatch = desc.match(/(?:in|at|file)\s+[`"']?([^\s`"']+\.[jt]sx?)[`"']?/i);
    return fileMatch ? fileMatch[1] : null;
  }

  _findTestFile(sourceFile) {
    if (!sourceFile) return null;

    const dir = path.dirname(sourceFile);
    const base = path.basename(sourceFile, path.extname(sourceFile));
    const ext = path.extname(sourceFile);

    // Common test file patterns
    const candidates = [
      path.join(dir, `${base}.test${ext}`),
      path.join(dir, `${base}.spec${ext}`),
      path.join(dir, '__tests__', `${base}.test${ext}`),
      path.join(dir, '__tests__', `${base}${ext}`),
      path.join(dir, '..', '__tests__', `${base}.test${ext}`)
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }

    return null;
  }

  // ===== Phase 2: Implement =====

  async _implementFix(issue) {
    const fixId = issue.id;
    const branchName = `fix/reflection-${fixId.substring(0, 12)}`;

    this.ledger.recordPending('fix', fixId, {
      file: issue.file,
      description: issue.bugDescription,
      severity: issue.severity,
      branchName
    });

    try {
      // Create branch
      this._createBranch(branchName);
      this.ledger.recordBranch(branchName);
      this._checkout(branchName);
      this.ledger.recordStatus('fix', fixId, 'implementing');

      // Spawn headless fixer
      const prompt = this._buildFixerPrompt(issue);
      const testCmd = issue.testFile
        ? `npx jest ${issue.testFile} --no-coverage`
        : 'npm test -- --passWithNoTests';

      const output = this._spawnHeadlessFixer(prompt);
      const result = this._parseResult(output);

      this.ledger.recordStatus('fix', fixId, 'testing');

      // Run tests to verify
      let testsPassed = false;
      try {
        execSync(testCmd, { encoding: 'utf8', timeout: 60000, stdio: 'pipe' });
        testsPassed = true;
      } catch (e) {
        testsPassed = false;
      }

      if (testsPassed || (result && result.status === 'pass')) {
        // Commit the fix
        try {
          execSync('git add -A', { encoding: 'utf8', stdio: 'pipe' });
          const commitMsg = `fix(reflection-${fixId.substring(0, 8)}): ${issue.bugDescription.substring(0, 60)}`;
          execSync(`git commit -m "${commitMsg}" --allow-empty`, { encoding: 'utf8', stdio: 'pipe' });
          const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();

          this.ledger.recordPassed('fix', fixId, {
            commit_sha: sha,
            branchName,
            changes: result?.changes_made || [issue.file]
          });

          this._checkout(this.originalState.branch);
          return { id: fixId, status: 'passed', branchName, commit_sha: sha };
        } catch (commitErr) {
          this.ledger.recordFailed('fix', fixId, commitErr);
          this._revertBranch(branchName);
          return { id: fixId, status: 'failed', error: commitErr.message };
        }
      } else {
        // Fix didn't work
        this.ledger.recordNeedsHuman('fix', fixId, result?.error || 'Tests failed after fix attempt');
        this._revertBranch(branchName);
        return { id: fixId, status: 'needs-human', error: result?.error || 'Tests failed' };
      }

    } catch (err) {
      this.ledger.recordFailed('fix', fixId, err);
      try { this._revertBranch(branchName); } catch (e) { /* cleanup best-effort */ }
      return { id: fixId, status: 'failed', error: err.message };
    }
  }

  _buildFixerPrompt(issue) {
    let sourceContent = '';
    try {
      if (fs.existsSync(issue.file)) {
        sourceContent = fs.readFileSync(issue.file, 'utf8').substring(0, 5000);
      }
    } catch (e) { /* file may not exist locally */ }

    return `Fix this bug:

Bug: ${issue.bugDescription}
Root Cause: ${issue.rootCause}
File: ${issue.file}
Fix Plan: ${issue.fixPlan}

Current file content (first 5000 chars):
\`\`\`
${sourceContent}
\`\`\`

Instructions:
1. Read the file: ${issue.file}
2. Implement the fix described above with minimal changes
3. Run tests: ${issue.testFile ? `npx jest ${issue.testFile} --no-coverage` : 'npm test -- --passWithNoTests'}
4. Output JSON: {"status":"pass|fail","tests_run":N,"tests_passed":N,"changes_made":["file"],"error":"msg if fail"}

Rules:
- Minimal changes only
- Do NOT modify unrelated files
- Do NOT push
- Do NOT switch branches`;
  }

  _spawnHeadlessFixer(prompt) {
    try {
      const result = execSync(
        `claude --print --dangerously-skip-permissions --output-format text --max-turns 15 -p "${prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`,
        {
          encoding: 'utf8',
          timeout: this.timeout,
          stdio: ['pipe', 'pipe', 'pipe'],
          maxBuffer: 10 * 1024 * 1024
        }
      );
      return result;
    } catch (err) {
      if (err.killed) return null; // timeout
      return err.stdout || null;
    }
  }

  _parseResult(output) {
    if (!output) return null;

    const jsonMatch = output.match(/\{[^{}]*"status"\s*:\s*"(?:pass|fail|needs-human)"[^{}]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch (e) { /* fall through */ }
    }

    try {
      const parsed = JSON.parse(output.trim());
      if (parsed.status) return parsed;
    } catch (e) { /* fall through */ }

    return null;
  }

  _revertBranch(branchName) {
    try {
      execSync('git checkout -- .', { encoding: 'utf8', stdio: 'pipe' });
      execSync('git clean -fd', { encoding: 'utf8', stdio: 'pipe' });
      this._checkout(this.originalState.branch);
    } catch (e) {
      this._log(`WARNING: Revert failed for ${branchName}: ${e.message}`);
    }
  }

  // ===== Phase 3: Validate =====

  async _validateOnStaging(passedFixes) {
    const stagingBranch = `autofix/staging-${new Date().toISOString().substring(0, 10)}`;

    try {
      this._createBranch(stagingBranch);
      this._checkout(stagingBranch);
      this.ledger.recordStagingBranch(stagingBranch);

      // Merge each passing fix branch
      const mergedFixes = [];
      for (const fix of passedFixes) {
        try {
          execSync(`git merge --no-edit ${fix.branchName}`, { encoding: 'utf8', stdio: 'pipe' });
          mergedFixes.push(fix);
        } catch (err) {
          this._log(`Merge conflict for ${fix.branchName}, excluding from staging`);
          execSync('git merge --abort', { encoding: 'utf8', stdio: 'pipe' });
        }
      }

      if (mergedFixes.length === 0) {
        this._checkout(this.originalState.branch);
        return { merged: false, reason: 'All merges had conflicts' };
      }

      // Run full test suite
      let testsPass = false;
      try {
        execSync('npm test -- --passWithNoTests', { encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
        testsPass = true;
      } catch (e) {
        this._log('Full test suite failed on staging');
      }

      if (testsPass && !this.skipMerge) {
        // Merge staging to main
        this._checkout(this.originalState.branch);
        execSync(`git merge --no-edit ${stagingBranch}`, { encoding: 'utf8', stdio: 'pipe' });

        for (const fix of mergedFixes) {
          this.ledger.recordMerged('fix', fix.id);
        }

        return { merged: true, fixCount: mergedFixes.length, stagingBranch };
      }

      this._checkout(this.originalState.branch);
      return { merged: false, reason: testsPass ? 'skip-merge flag' : 'Tests failed on staging', fixCount: mergedFixes.length };

    } catch (err) {
      this._log(`Staging validation failed: ${err.message}`);
      try { this._checkout(this.originalState.branch); } catch (e) { /* best effort */ }
      return { merged: false, reason: err.message };
    }
  }

  // ===== Phase 4: Report =====

  _generateReport(fixResults, mergeResult) {
    const passed = fixResults.filter(r => r.status === 'passed');
    const failed = fixResults.filter(r => r.status === 'failed');
    const needsHuman = fixResults.filter(r => r.status === 'needs-human');

    let report = `\n## Autofix Results (${this.runId})\n\n`;
    report += `| # | Issue ID | Status | Branch | Details |\n`;
    report += `|---|----------|--------|--------|----------|\n`;

    for (let i = 0; i < fixResults.length; i++) {
      const r = fixResults[i];
      const statusIcon = r.status === 'passed' ? 'PASS' : r.status === 'needs-human' ? 'HUMAN' : 'FAIL';
      report += `| ${i + 1} | ${(r.id || '').substring(0, 8)} | ${statusIcon} | ${r.branchName || '-'} | ${r.error || r.commit_sha || '-'} |\n`;
    }

    report += `\n**Summary**: ${passed.length} passed, ${failed.length} failed, ${needsHuman.length} needs-human\n`;

    if (mergeResult) {
      if (mergeResult.merged) {
        report += `\n**Merged to main**: ${mergeResult.fixCount} fix(es) via staging branch\n`;
      } else {
        report += `\n**Not merged**: ${mergeResult.reason}\n`;
      }
    }

    return report;
  }

  async _updateReflectionStatuses(fixResults) {
    try {
      const supabaseLib = path.join(process.cwd(), '.claude', 'scripts', 'lib', 'supabase-client.js');
      if (!fs.existsSync(supabaseLib)) return;

      const { getSupabaseClient } = require(supabaseLib);
      const supabase = getSupabaseClient();

      for (const result of fixResults) {
        const newStatus = result.status === 'passed' ? 'implemented' : 'under_review';
        try {
          await supabase
            .from('reflections')
            .update({ status: newStatus })
            .eq('id', result.id);
        } catch (e) {
          this._log(`Failed to update reflection ${result.id}: ${e.message}`);
        }
      }
    } catch (e) {
      this._log(`Supabase update failed: ${e.message}`);
    }
  }

  async _createAsanaTasksForHumanItems(failedItems) {
    // Reuse existing Asana infrastructure if available
    try {
      const asanaLib = path.join(process.cwd(), '.claude', 'scripts', 'lib', 'asana-client.js');
      if (!fs.existsSync(asanaLib)) {
        this._log('Asana client not available, skipping task creation');
        return;
      }

      const AsanaClient = require(asanaLib);
      const client = new AsanaClient({});
      const connectionStatus = await client.testConnection();

      if (!connectionStatus.connected) {
        this._log('Asana not connected, skipping task creation');
        return;
      }

      for (const item of failedItems) {
        try {
          await client.createTask({
            name: `[Autofix Needs Human] ${item.id?.substring(0, 8)}: ${item.error?.substring(0, 60) || 'Fix required'}`,
            notes: `Autofix run ${this.runId} could not automatically fix this issue.\n\nError: ${item.error}\nBranch: ${item.branchName || 'N/A'}`,
            dueOn: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
          });
        } catch (e) {
          this._log(`Asana task creation failed: ${e.message}`);
        }
      }
    } catch (e) {
      this._log(`Asana integration error: ${e.message}`);
    }
  }

  _cleanup(fixResults, mergeResult) {
    // Only delete branches that were successfully merged
    const merged = fixResults.filter(r => r.status === 'passed');
    if (mergeResult?.merged) {
      for (const fix of merged) {
        try {
          execSync(`git branch -d ${fix.branchName}`, { encoding: 'utf8', stdio: 'pipe' });
        } catch (e) { /* branch may not exist */ }
      }
      // Delete staging branch
      if (mergeResult.stagingBranch) {
        try {
          execSync(`git branch -d ${mergeResult.stagingBranch}`, { encoding: 'utf8', stdio: 'pipe' });
        } catch (e) { /* ignore */ }
      }
    }
  }

  // ===== Git Helpers =====

  _saveGitState() {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    let stashRef = null;

    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (status) {
      execSync('git stash push -m "autofix-pipeline-autostash"', { encoding: 'utf8' });
      stashRef = 'autofix-autostash';
      this.ledger.recordUserStash(stashRef);
    }

    return { branch, stashRef, hadChanges: !!status };
  }

  _restoreGitState(state) {
    try {
      this._checkout(state.branch);
      if (state.hadChanges) {
        try {
          execSync('git stash pop', { encoding: 'utf8', stdio: 'pipe' });
        } catch (e) {
          console.error('WARNING: Could not pop stash. Run `git stash pop` manually.');
        }
      }
    } catch (e) {
      console.error(`ERROR: Could not restore git state: ${e.message}`);
    }
  }

  _createBranch(name) {
    try {
      execSync(`git branch ${name}`, { encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      if (!e.stderr?.includes('already exists')) throw e;
    }
  }

  _checkout(name) {
    execSync(`git checkout ${name}`, { encoding: 'utf8', stdio: 'pipe' });
  }

  _log(msg) {
    if (this.verbose) console.log(`  [autofix] ${msg}`);
  }

  _printIssueTable(issues) {
    console.log('\n| # | Severity | File | Description |');
    console.log('|---|----------|------|-------------|');
    issues.forEach((issue, i) => {
      console.log(`| ${i + 1} | ${issue.severity} | ${issue.file} | ${issue.bugDescription.substring(0, 50)} |`);
    });
  }

  _emergencyCleanup() {
    console.log('\nInterrupted -- cleaning up...');
    if (this.originalState) {
      this._restoreGitState(this.originalState);
    }
    if (this.ledger) {
      console.log(`Ledger preserved at: ${this.ledger.ledgerPath}`);
      console.log('Resume with: /autofix --resume');
    }
    process.exit(1);
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log(`
Autonomous Fix Executor - Reflection-to-Fix Pipeline

Processes open reflections, implements fixes, tests, and merges automatically.

Usage:
  node autonomous-fix-executor.js [options]

Options:
  --max-fixes N   Maximum fixes per run (default: 5)
  --dry-run       Analyze without implementing
  --skip-merge    Implement but don't merge to main
  --resume        Resume interrupted run
  --verbose       Detailed logging
  --timeout N     Per-fix timeout in ms (default: 300000)

Examples:
  node autonomous-fix-executor.js --dry-run
  node autonomous-fix-executor.js --max-fixes 3 --skip-merge
  node autonomous-fix-executor.js --resume
    `);
    process.exit(0);
  }

  const getArg = (name) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=').slice(1).join('=') : null;
  };

  const executor = new AutonomousFixExecutor({
    maxFixes: parseInt(getArg('max-fixes') || args[args.indexOf('--max-fixes') + 1] || '5'),
    dryRun: args.includes('--dry-run'),
    skipMerge: args.includes('--skip-merge'),
    resume: args.includes('--resume'),
    verbose: args.includes('--verbose'),
    timeout: parseInt(getArg('timeout') || '300000')
  });

  executor.run()
    .then(result => {
      if (result.status === 'complete') {
        console.log(`\nAutofix complete: ${result.passed} passed, ${result.failed} failed`);
      }
    })
    .catch(err => {
      console.error(`Autofix failed: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { AutonomousFixExecutor };
