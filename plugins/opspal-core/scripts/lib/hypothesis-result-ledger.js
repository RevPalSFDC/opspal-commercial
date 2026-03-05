#!/usr/bin/env node
/**
 * Hypothesis Result Ledger - Bug Fix Pipeline State Tracking
 *
 * Purpose: Track parallel hypothesis testing operations with idempotency keys
 * to prevent duplicate work and enable safe resume after interruption.
 *
 * Follows the WireTestLedger pattern for consistency.
 *
 * Status state machine: pending → implementing → testing → pass/fail/timeout/error
 *
 * Usage:
 *   const { HypothesisResultLedger } = require('./hypothesis-result-ledger');
 *   const ledger = new HypothesisResultLedger('bugfix-2026-02-07-abc');
 *
 *   ledger.recordPending('hypothesis', '1', { root_cause: '...' });
 *   ledger.recordStatus('hypothesis', '1', 'implementing');
 *   ledger.recordStatus('hypothesis', '1', 'testing');
 *   ledger.recordPass('hypothesis', '1', { tests_run: 12, tests_passed: 12 });
 */

const fs = require('fs');
const path = require('path');

class HypothesisResultLedger {
  constructor(runId, options = {}) {
    this.runId = runId;
    this.ledgerDir = options.ledgerDir || path.join(process.cwd(), '.bugfix-ledger');
    this.ledgerPath = path.join(this.ledgerDir, `${this.runId}.json`);
    this.entries = {};
    this.metadata = {};

    if (!fs.existsSync(this.ledgerDir)) {
      fs.mkdirSync(this.ledgerDir, { recursive: true });
    }

    this._load();
  }

  /**
   * Generate idempotency key for operation
   */
  generateKey(operation, subkey = null) {
    const parts = [this.runId, operation];
    if (subkey) parts.push(subkey);
    return parts.join('::');
  }

  /**
   * Record metadata about the run (original branch, test command, etc.)
   */
  setRunMetadata(meta) {
    this.metadata = { ...this.metadata, ...meta };
    this._save();
  }

  /**
   * Get run metadata
   */
  getRunMetadata() {
    return this.metadata;
  }

  /**
   * Check if operation has completed (pass, fail, timeout, or error)
   */
  hasCompleted(operation, subkey = null) {
    const key = this.generateKey(operation, subkey);
    return this.entries[key] && ['pass', 'fail', 'timeout', 'error'].includes(this.entries[key].status);
  }

  hasPassed(operation, subkey = null) {
    const key = this.generateKey(operation, subkey);
    return this.entries[key] && this.entries[key].status === 'pass';
  }

  hasFailed(operation, subkey = null) {
    const key = this.generateKey(operation, subkey);
    return this.entries[key] && ['fail', 'timeout', 'error'].includes(this.entries[key].status);
  }

  isPending(operation, subkey = null) {
    const key = this.generateKey(operation, subkey);
    return this.entries[key] && this.entries[key].status === 'pending';
  }

  /**
   * Record pending operation
   */
  recordPending(operation, subkey, meta = {}) {
    const key = this.generateKey(operation, subkey);

    if (this.hasPassed(operation, subkey)) {
      throw new Error(`Operation already passed: ${key}`);
    }

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

  /**
   * Update status (implementing, testing)
   */
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

  /**
   * Record passed operation
   */
  recordPass(operation, subkey, result = {}) {
    const key = this.generateKey(operation, subkey);

    if (!this.entries[key]) {
      this.entries[key] = {
        key,
        operation,
        subkey,
        createdAt: new Date().toISOString()
      };
    }

    this.entries[key].status = 'pass';
    this.entries[key].completedAt = new Date().toISOString();
    this.entries[key].result = result;

    if (this.entries[key].createdAt) {
      const start = new Date(this.entries[key].createdAt);
      const end = new Date(this.entries[key].completedAt);
      this.entries[key].duration_ms = end - start;
    }

    this._save();
  }

  /**
   * Record failed operation
   */
  recordFail(operation, subkey, error = {}) {
    const key = this.generateKey(operation, subkey);

    if (!this.entries[key]) {
      this.entries[key] = {
        key,
        operation,
        subkey,
        createdAt: new Date().toISOString()
      };
    }

    this.entries[key].status = 'fail';
    this.entries[key].failedAt = new Date().toISOString();
    this.entries[key].error = {
      message: error.message || String(error),
      stack: error.stack,
      details: error.details
    };

    this._save();
  }

  /**
   * Record timeout
   */
  recordTimeout(operation, subkey, context = {}) {
    const key = this.generateKey(operation, subkey);

    if (!this.entries[key]) {
      this.entries[key] = {
        key,
        operation,
        subkey,
        createdAt: new Date().toISOString()
      };
    }

    this.entries[key].status = 'timeout';
    this.entries[key].timedOutAt = new Date().toISOString();
    this.entries[key].context = context;

    this._save();
  }

  /**
   * Record error
   */
  recordError(operation, subkey, error = {}) {
    const key = this.generateKey(operation, subkey);

    if (!this.entries[key]) {
      this.entries[key] = {
        key,
        operation,
        subkey,
        createdAt: new Date().toISOString()
      };
    }

    this.entries[key].status = 'error';
    this.entries[key].errorAt = new Date().toISOString();
    this.entries[key].error = {
      message: error.message || String(error),
      stack: error.stack
    };

    this._save();
  }

  /**
   * Get all entries by status
   */
  getEntries(status = 'all') {
    const entries = Object.values(this.entries);
    if (status === 'all') return entries;
    return entries.filter(e => e.status === status);
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    const entries = Object.values(this.entries);
    const hypotheses = entries.filter(e => e.operation === 'hypothesis');

    return {
      runId: this.runId,
      total: entries.length,
      pending: entries.filter(e => e.status === 'pending').length,
      implementing: entries.filter(e => e.status === 'implementing').length,
      testing: entries.filter(e => e.status === 'testing').length,
      pass: entries.filter(e => e.status === 'pass').length,
      fail: entries.filter(e => e.status === 'fail').length,
      timeout: entries.filter(e => e.status === 'timeout').length,
      error: entries.filter(e => e.status === 'error').length,
      hypotheses: {
        total: hypotheses.length,
        pass: hypotheses.filter(e => e.status === 'pass').length,
        fail: hypotheses.filter(e => e.status === 'fail').length,
        timeout: hypotheses.filter(e => e.status === 'timeout').length
      },
      metadata: this.metadata
    };
  }

  /**
   * Find resumable runs in a directory
   */
  static findResumable(dir) {
    const ledgerDir = dir || path.join(process.cwd(), '.bugfix-ledger');
    if (!fs.existsSync(ledgerDir)) return [];

    return fs.readdirSync(ledgerDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(ledgerDir, f), 'utf8'));
        const entries = Object.values(data.entries || {});
        const hasPending = entries.some(e => ['pending', 'implementing', 'testing'].includes(e.status));
        return {
          runId: data.runId,
          file: f,
          hasPending,
          lastUpdated: data.lastUpdated,
          totalEntries: entries.length
        };
      })
      .filter(r => r.hasPending)
      .sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
  }

  /**
   * Clear all entries
   */
  clear() {
    this.entries = {};
    this.metadata = {};
    this._save();
  }

  _load() {
    if (fs.existsSync(this.ledgerPath)) {
      const data = JSON.parse(fs.readFileSync(this.ledgerPath, 'utf8'));
      this.entries = data.entries || {};
      this.metadata = data.metadata || {};
    }
  }

  _save() {
    const ledger = {
      runId: this.runId,
      createdAt: this.entries[Object.keys(this.entries)[0]]?.createdAt || new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      metadata: this.metadata,
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
Hypothesis Result Ledger - Bug Fix Pipeline State Tracking

Usage:
  node hypothesis-result-ledger.js summary <run-id>
  node hypothesis-result-ledger.js list <run-id> [status]
  node hypothesis-result-ledger.js resumable
  node hypothesis-result-ledger.js clean <run-id>

Commands:
  summary    - Show ledger statistics
  list       - List entries (filter: all|pending|pass|fail|timeout|error)
  resumable  - Find interrupted runs
  clean      - Clear all entries (DESTRUCTIVE)
    `);
    process.exit(0);
  }

  if (command === 'resumable') {
    const resumable = HypothesisResultLedger.findResumable();
    if (resumable.length === 0) {
      console.log('No resumable runs found.');
    } else {
      console.log(`\nResumable runs: ${resumable.length}`);
      resumable.forEach(r => {
        console.log(`  ${r.runId} (${r.totalEntries} entries, updated: ${r.lastUpdated})`);
      });
    }
    process.exit(0);
  }

  const runId = args[1];
  if (!runId) {
    console.error('Error: Run ID required');
    process.exit(1);
  }

  const ledger = new HypothesisResultLedger(runId);

  switch (command) {
    case 'summary': {
      const summary = ledger.getSummary();
      console.log('\n# Bugfix Hypothesis Ledger Summary');
      console.log('='.repeat(60));
      console.log(`Run ID: ${runId}`);
      console.log(`Total Entries: ${summary.total}`);
      console.log(`  Pending:      ${summary.pending}`);
      console.log(`  Implementing: ${summary.implementing}`);
      console.log(`  Testing:      ${summary.testing}`);
      console.log(`  Pass:         ${summary.pass}`);
      console.log(`  Fail:         ${summary.fail}`);
      console.log(`  Timeout:      ${summary.timeout}`);
      console.log(`  Error:        ${summary.error}`);
      if (summary.metadata.originalBranch) {
        console.log(`\nOriginal Branch: ${summary.metadata.originalBranch}`);
      }
      if (summary.metadata.testCommand) {
        console.log(`Test Command: ${summary.metadata.testCommand}`);
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
        const icon = entry.status === 'pass' ? 'PASS' : entry.status === 'fail' ? 'FAIL' : entry.status.toUpperCase();
        console.log(`[${icon}] ${entry.key}`);
        if (entry.result) {
          console.log(`  Tests: ${entry.result.tests_passed || 0}/${entry.result.tests_run || 0} passed`);
        }
        if (entry.error) {
          console.log(`  Error: ${entry.error.message}`);
        }
        if (entry.metadata?.branchName) {
          console.log(`  Branch: ${entry.metadata.branchName}`);
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

module.exports = { HypothesisResultLedger };
