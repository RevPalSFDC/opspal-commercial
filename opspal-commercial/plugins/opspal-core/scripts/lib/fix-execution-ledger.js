#!/usr/bin/env node
/**
 * Fix Execution Ledger - Autonomous Fix Pipeline State Tracking
 *
 * Purpose: Track autonomous fix operations from reflection analysis through
 * implementation, testing, and merge. Supports crash recovery via checkpoint
 * resume and tracks git stash state for safe user work preservation.
 *
 * Status state machine: pending → implementing → testing → passed → merged
 *                                                       → failed → needs-human
 *
 * Usage:
 *   const { FixExecutionLedger } = require('./fix-execution-ledger');
 *   const ledger = new FixExecutionLedger('autofix-2026-02-07-abc');
 *
 *   ledger.recordUserStash('stash@{0}');
 *   ledger.recordPending('fix', 'reflection-123', { description: '...' });
 *   ledger.recordBranch('fix/reflection-123');
 *   ledger.recordStatus('fix', 'reflection-123', 'implementing');
 *   ledger.recordPassed('fix', 'reflection-123', { commit_sha: 'abc123' });
 */

const fs = require('fs');
const path = require('path');

class FixExecutionLedger {
  constructor(runId, options = {}) {
    this.runId = runId;
    this.ledgerDir = options.ledgerDir || path.join(process.cwd(), '.autofix-ledger');
    this.ledgerPath = path.join(this.ledgerDir, `${this.runId}.json`);
    this.entries = {};
    this.metadata = {};
    this.branches = [];

    if (!fs.existsSync(this.ledgerDir)) {
      fs.mkdirSync(this.ledgerDir, { recursive: true });
    }

    this._load();
  }

  generateKey(operation, subkey = null) {
    const parts = [this.runId, operation];
    if (subkey) parts.push(subkey);
    return parts.join('::');
  }

  // --- Run-level metadata ---

  setRunMetadata(meta) {
    this.metadata = { ...this.metadata, ...meta };
    this._save();
  }

  getRunMetadata() {
    return this.metadata;
  }

  recordUserStash(ref) {
    this.metadata.userStashRef = ref;
    this.metadata.userStashAt = new Date().toISOString();
    this._save();
  }

  getUserStash() {
    return this.metadata.userStashRef || null;
  }

  recordBranch(name) {
    if (!this.branches.includes(name)) {
      this.branches.push(name);
      this._save();
    }
  }

  getBranches() {
    return [...this.branches];
  }

  recordStagingBranch(name) {
    this.metadata.stagingBranch = name;
    this._save();
  }

  getStagingBranch() {
    return this.metadata.stagingBranch || null;
  }

  // --- Entry operations ---

  hasCompleted(operation, subkey = null) {
    const key = this.generateKey(operation, subkey);
    return this.entries[key] && ['passed', 'merged', 'failed', 'needs-human'].includes(this.entries[key].status);
  }

  hasPassed(operation, subkey = null) {
    const key = this.generateKey(operation, subkey);
    return this.entries[key] && ['passed', 'merged'].includes(this.entries[key].status);
  }

  hasFailed(operation, subkey = null) {
    const key = this.generateKey(operation, subkey);
    return this.entries[key] && ['failed', 'needs-human'].includes(this.entries[key].status);
  }

  recordPending(operation, subkey, meta = {}) {
    const key = this.generateKey(operation, subkey);

    this.entries[key] = {
      key,
      operation,
      subkey,
      status: 'pending',
      createdAt: new Date().toISOString(),
      metadata: meta
    };

    this._save();
  }

  recordStatus(operation, subkey, status) {
    const key = this.generateKey(operation, subkey);

    if (!this.entries[key]) {
      this.entries[key] = {
        key,
        operation,
        subkey,
        createdAt: new Date().toISOString()
      };
    }

    this.entries[key].status = status;
    this.entries[key].statusUpdatedAt = new Date().toISOString();
    this._save();
  }

  recordPassed(operation, subkey, result = {}) {
    const key = this.generateKey(operation, subkey);

    if (!this.entries[key]) {
      this.entries[key] = {
        key,
        operation,
        subkey,
        createdAt: new Date().toISOString()
      };
    }

    this.entries[key].status = 'passed';
    this.entries[key].completedAt = new Date().toISOString();
    this.entries[key].result = result;

    if (this.entries[key].createdAt) {
      const start = new Date(this.entries[key].createdAt);
      const end = new Date(this.entries[key].completedAt);
      this.entries[key].duration_ms = end - start;
    }

    this._save();
  }

  recordMerged(operation, subkey, result = {}) {
    const key = this.generateKey(operation, subkey);

    if (!this.entries[key]) {
      this.entries[key] = {
        key,
        operation,
        subkey,
        createdAt: new Date().toISOString()
      };
    }

    this.entries[key].status = 'merged';
    this.entries[key].mergedAt = new Date().toISOString();
    this.entries[key].mergeResult = result;
    this._save();
  }

  recordFailed(operation, subkey, error = {}) {
    const key = this.generateKey(operation, subkey);

    if (!this.entries[key]) {
      this.entries[key] = {
        key,
        operation,
        subkey,
        createdAt: new Date().toISOString()
      };
    }

    this.entries[key].status = 'failed';
    this.entries[key].failedAt = new Date().toISOString();
    this.entries[key].error = {
      message: error.message || String(error),
      stack: error.stack,
      details: error.details
    };

    this._save();
  }

  recordNeedsHuman(operation, subkey, reason) {
    const key = this.generateKey(operation, subkey);

    if (!this.entries[key]) {
      this.entries[key] = {
        key,
        operation,
        subkey,
        createdAt: new Date().toISOString()
      };
    }

    this.entries[key].status = 'needs-human';
    this.entries[key].needsHumanAt = new Date().toISOString();
    this.entries[key].needsHumanReason = reason;
    this._save();
  }

  // --- Query helpers ---

  getEntries(status = 'all') {
    const entries = Object.values(this.entries);
    if (status === 'all') return entries;
    return entries.filter(e => e.status === status);
  }

  getPassed() {
    return this.getEntries('passed');
  }

  getMerged() {
    return this.getEntries('merged');
  }

  getNeedsHuman() {
    return this.getEntries('needs-human');
  }

  getFailed() {
    return [...this.getEntries('failed'), ...this.getEntries('needs-human')];
  }

  getSummary() {
    const entries = Object.values(this.entries);

    return {
      runId: this.runId,
      total: entries.length,
      pending: entries.filter(e => e.status === 'pending').length,
      implementing: entries.filter(e => e.status === 'implementing').length,
      testing: entries.filter(e => e.status === 'testing').length,
      passed: entries.filter(e => e.status === 'passed').length,
      merged: entries.filter(e => e.status === 'merged').length,
      failed: entries.filter(e => e.status === 'failed').length,
      needsHuman: entries.filter(e => e.status === 'needs-human').length,
      branches: this.branches,
      metadata: this.metadata
    };
  }

  /**
   * Find resumable autofix runs
   */
  static findResumable(dir) {
    const ledgerDir = dir || path.join(process.cwd(), '.autofix-ledger');
    if (!fs.existsSync(ledgerDir)) return [];

    return fs.readdirSync(ledgerDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(ledgerDir, f), 'utf8'));
        const entries = Object.values(data.entries || {});
        const hasPending = entries.some(e =>
          ['pending', 'implementing', 'testing'].includes(e.status)
        );
        return {
          runId: data.runId,
          file: f,
          hasPending,
          lastUpdated: data.lastUpdated,
          totalEntries: entries.length,
          passed: entries.filter(e => e.status === 'passed').length,
          failed: entries.filter(e => ['failed', 'needs-human'].includes(e.status)).length
        };
      })
      .filter(r => r.hasPending)
      .sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
  }

  clear() {
    this.entries = {};
    this.metadata = {};
    this.branches = [];
    this._save();
  }

  _load() {
    if (fs.existsSync(this.ledgerPath)) {
      const data = JSON.parse(fs.readFileSync(this.ledgerPath, 'utf8'));
      this.entries = data.entries || {};
      this.metadata = data.metadata || {};
      this.branches = data.branches || [];
    }
  }

  _save() {
    const ledger = {
      runId: this.runId,
      createdAt: this.entries[Object.keys(this.entries)[0]]?.createdAt || new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      metadata: this.metadata,
      branches: this.branches,
      entries: this.entries
    };

    fs.writeFileSync(this.ledgerPath, JSON.stringify(ledger, null, 2));
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help') {
    console.log(`
Fix Execution Ledger - Autonomous Fix Pipeline State Tracking

Usage:
  node fix-execution-ledger.js summary <run-id>
  node fix-execution-ledger.js list <run-id> [status]
  node fix-execution-ledger.js resumable
  node fix-execution-ledger.js clean <run-id>

Commands:
  summary    - Show ledger statistics
  list       - List entries (filter: all|pending|passed|merged|failed|needs-human)
  resumable  - Find interrupted runs
  clean      - Clear all entries (DESTRUCTIVE)
    `);
    process.exit(0);
  }

  if (command === 'resumable') {
    const resumable = FixExecutionLedger.findResumable();
    if (resumable.length === 0) {
      console.log('No resumable autofix runs found.');
    } else {
      console.log(`\nResumable runs: ${resumable.length}`);
      resumable.forEach(r => {
        console.log(`  ${r.runId} (${r.totalEntries} entries, ${r.passed} passed, ${r.failed} failed, updated: ${r.lastUpdated})`);
      });
    }
    process.exit(0);
  }

  const runId = args[1];
  if (!runId) {
    console.error('Error: Run ID required');
    process.exit(1);
  }

  const ledger = new FixExecutionLedger(runId);

  switch (command) {
    case 'summary': {
      const s = ledger.getSummary();
      console.log('\n# Autofix Execution Ledger Summary');
      console.log('='.repeat(60));
      console.log(`Run ID: ${runId}`);
      console.log(`Total Entries: ${s.total}`);
      console.log(`  Pending:      ${s.pending}`);
      console.log(`  Implementing: ${s.implementing}`);
      console.log(`  Testing:      ${s.testing}`);
      console.log(`  Passed:       ${s.passed}`);
      console.log(`  Merged:       ${s.merged}`);
      console.log(`  Failed:       ${s.failed}`);
      console.log(`  Needs Human:  ${s.needsHuman}`);
      if (s.metadata.originalBranch) {
        console.log(`\nOriginal Branch: ${s.metadata.originalBranch}`);
      }
      if (s.metadata.userStashRef) {
        console.log(`User Stash: ${s.metadata.userStashRef}`);
      }
      if (s.branches.length > 0) {
        console.log(`\nBranches Created: ${s.branches.length}`);
        s.branches.forEach(b => console.log(`  - ${b}`));
      }
      console.log('='.repeat(60));
      break;
    }

    case 'list': {
      const status = args[2] || 'all';
      const entries = ledger.getEntries(status);
      console.log(`\nEntries (${status}): ${entries.length}`);
      console.log('='.repeat(60));
      entries.forEach(entry => {
        const icon = {
          'passed': 'PASS', 'merged': 'MERGED', 'failed': 'FAIL',
          'needs-human': 'HUMAN', 'pending': 'PEND',
          'implementing': 'IMPL', 'testing': 'TEST'
        }[entry.status] || entry.status.toUpperCase();
        console.log(`[${icon}] ${entry.key}`);
        if (entry.result?.commit_sha) {
          console.log(`  Commit: ${entry.result.commit_sha}`);
        }
        if (entry.error) {
          console.log(`  Error: ${entry.error.message}`);
        }
        if (entry.needsHumanReason) {
          console.log(`  Reason: ${entry.needsHumanReason}`);
        }
        console.log('');
      });
      break;
    }

    case 'clean':
      console.log('Clearing ledger...');
      ledger.clear();
      console.log('Done.');
      break;

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

module.exports = { FixExecutionLedger };
