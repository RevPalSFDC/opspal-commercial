#!/usr/bin/env node
/**
 * Live Wire Sync Test Ledger - Idempotency Tracking
 *
 * Purpose: Track all wire test operations with idempotency keys to prevent
 * duplicate probes and enable safe retry/resume behavior.
 *
 * Key Features:
 * - Operation tracking: probe_sf_to_hs, probe_hs_to_sf, backfill_anchor, field_creation
 * - Status tracking: pending, pass, fail, timeout
 * - Lag measurement for successful probes
 * - Collision detection tracking
 * - Ledger persistence to disk
 * - Resume interrupted test runs
 *
 * Usage:
 *   const ledger = new WireTestLedger('wire-test-2025-11-07-153045');
 *
 *   // Check if probe already executed
 *   if (ledger.hasCompleted('probe_sf_to_hs', syncAnchor)) {
 *     console.log('Probe already executed, skipping...');
 *     return ledger.getProbeResult('probe_sf_to_hs', syncAnchor);
 *   }
 *
 *   // Record pending probe
 *   ledger.recordPending('probe_sf_to_hs', syncAnchor, { sfdcId, hubspotId });
 *
 *   // Execute probe...
 *
 *   // Mark as pass with lag
 *   ledger.recordPass('probe_sf_to_hs', syncAnchor, { lag_seconds: 38 });
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class WireTestLedger {
    constructor(runId, options = {}) {
        this.runId = runId;
        this.ledgerDir = options.ledgerDir || path.join(__dirname, '../../.wire-test-ledger');
        this.ledgerPath = path.join(this.ledgerDir, `${this.runId}.json`);
        this.entries = {};

        // Ensure ledger directory exists
        if (!fs.existsSync(this.ledgerDir)) {
            fs.mkdirSync(this.ledgerDir, { recursive: true });
        }

        // Load existing ledger if present
        this._load();
    }

    /**
     * Generate idempotency key for operation
     * @param {string} operation - Operation type (e.g., 'probe_sf_to_hs', 'backfill_anchor')
     * @param {string} syncAnchor - Sync Anchor UUID
     * @param {string} subkey - Optional subkey for uniqueness (e.g., field name)
     * @returns {string} Idempotency key
     */
    generateKey(operation, syncAnchor, subkey = null) {
        const parts = [this.runId, operation, syncAnchor];
        if (subkey) parts.push(subkey);
        return parts.join('::');
    }

    /**
     * Check if operation has completed (pass or fail)
     * @param {string} operation
     * @param {string} syncAnchor
     * @param {string} subkey
     * @returns {boolean}
     */
    hasCompleted(operation, syncAnchor, subkey = null) {
        const key = this.generateKey(operation, syncAnchor, subkey);
        return this.entries[key] && ['pass', 'fail', 'timeout'].includes(this.entries[key].status);
    }

    /**
     * Check if operation passed
     * @param {string} operation
     * @param {string} syncAnchor
     * @param {string} subkey
     * @returns {boolean}
     */
    hasPassed(operation, syncAnchor, subkey = null) {
        const key = this.generateKey(operation, syncAnchor, subkey);
        return this.entries[key] && this.entries[key].status === 'pass';
    }

    /**
     * Check if operation failed
     * @param {string} operation
     * @param {string} syncAnchor
     * @param {string} subkey
     * @returns {boolean}
     */
    hasFailed(operation, syncAnchor, subkey = null) {
        const key = this.generateKey(operation, syncAnchor, subkey);
        return this.entries[key] && ['fail', 'timeout'].includes(this.entries[key].status);
    }

    /**
     * Check if operation is pending
     * @param {string} operation
     * @param {string} syncAnchor
     * @param {string} subkey
     * @returns {boolean}
     */
    isPending(operation, syncAnchor, subkey = null) {
        const key = this.generateKey(operation, syncAnchor, subkey);
        return this.entries[key] && this.entries[key].status === 'pending';
    }

    /**
     * Record pending operation
     * @param {string} operation
     * @param {string} syncAnchor
     * @param {object} metadata - Additional metadata (sfdcId, hubspotId, etc.)
     * @param {string} subkey - Optional subkey
     */
    recordPending(operation, syncAnchor, metadata = {}, subkey = null) {
        const key = this.generateKey(operation, syncAnchor, subkey);

        // Allow re-recording pending if previous failed (for retry)
        if (this.hasPassed(operation, syncAnchor, subkey)) {
            throw new Error(`Operation already passed: ${key}`);
        }

        this.entries[key] = {
            key,
            operation,
            syncAnchor,
            subkey,
            status: 'pending',
            createdAt: new Date().toISOString(),
            metadata
        };

        this._save();
    }

    /**
     * Record passed operation
     * @param {string} operation
     * @param {string} syncAnchor
     * @param {object} result - Operation result (lag_seconds, etc.)
     * @param {string} subkey
     */
    recordPass(operation, syncAnchor, result = {}, subkey = null) {
        const key = this.generateKey(operation, syncAnchor, subkey);

        if (!this.entries[key]) {
            // Create entry if doesn't exist (late recording)
            this.entries[key] = {
                key,
                operation,
                syncAnchor,
                subkey,
                createdAt: new Date().toISOString()
            };
        }

        this.entries[key].status = 'pass';
        this.entries[key].completedAt = new Date().toISOString();
        this.entries[key].result = result;

        // Calculate duration if createdAt exists
        if (this.entries[key].createdAt) {
            const start = new Date(this.entries[key].createdAt);
            const end = new Date(this.entries[key].completedAt);
            this.entries[key].duration_ms = end - start;
        }

        this._save();
    }

    /**
     * Record failed operation
     * @param {string} operation
     * @param {string} syncAnchor
     * @param {object} error - Error details
     * @param {string} subkey
     */
    recordFail(operation, syncAnchor, error = {}, subkey = null) {
        const key = this.generateKey(operation, syncAnchor, subkey);

        if (!this.entries[key]) {
            this.entries[key] = {
                key,
                operation,
                syncAnchor,
                subkey,
                createdAt: new Date().toISOString()
            };
        }

        this.entries[key].status = 'fail';
        this.entries[key].failedAt = new Date().toISOString();
        this.entries[key].error = {
            message: error.message || error.toString(),
            stack: error.stack,
            details: error.details,
            code: error.code
        };

        this._save();
    }

    /**
     * Record timeout
     * @param {string} operation
     * @param {string} syncAnchor
     * @param {object} context - Timeout context (sla_seconds, polls_attempted)
     * @param {string} subkey
     */
    recordTimeout(operation, syncAnchor, context = {}, subkey = null) {
        const key = this.generateKey(operation, syncAnchor, subkey);

        if (!this.entries[key]) {
            this.entries[key] = {
                key,
                operation,
                syncAnchor,
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
     * Get probe result for a specific sync anchor
     * @param {string} operation - 'probe_sf_to_hs' or 'probe_hs_to_sf'
     * @param {string} syncAnchor
     * @returns {object|null}
     */
    getProbeResult(operation, syncAnchor) {
        const key = this.generateKey(operation, syncAnchor);
        return this.entries[key] || null;
    }

    /**
     * Get all probe results grouped by sync anchor
     * @returns {object} { syncAnchor: { sf_to_hs: {...}, hs_to_sf: {...} } }
     */
    getAllProbeResults() {
        const probes = {};

        Object.values(this.entries).forEach(entry => {
            if (entry.operation.startsWith('probe_')) {
                const anchor = entry.syncAnchor;
                if (!probes[anchor]) {
                    probes[anchor] = {};
                }

                const direction = entry.operation === 'probe_sf_to_hs' ? 'sf_to_hs' : 'hs_to_sf';
                probes[anchor][direction] = entry;
            }
        });

        return probes;
    }

    /**
     * Get all entries by status
     * @param {string} status - 'pending', 'pass', 'fail', 'timeout', or 'all'
     * @returns {Array<object>}
     */
    getEntries(status = 'all') {
        const entries = Object.values(this.entries);

        if (status === 'all') {
            return entries;
        }

        return entries.filter(entry => entry.status === status);
    }

    /**
     * Get entries by operation type
     * @param {string} operation - Operation type
     * @returns {Array<object>}
     */
    getEntriesByOperation(operation) {
        return Object.values(this.entries).filter(entry => entry.operation === operation);
    }

    /**
     * Get summary statistics
     * @returns {object}
     */
    getSummary() {
        const entries = Object.values(this.entries);

        const probes = entries.filter(e => e.operation.startsWith('probe_'));
        const sfToHs = probes.filter(e => e.operation === 'probe_sf_to_hs');
        const hsToSf = probes.filter(e => e.operation === 'probe_hs_to_sf');

        return {
            total: entries.length,
            pending: entries.filter(e => e.status === 'pending').length,
            pass: entries.filter(e => e.status === 'pass').length,
            fail: entries.filter(e => e.status === 'fail').length,
            timeout: entries.filter(e => e.status === 'timeout').length,
            probes: {
                total: probes.length,
                sf_to_hs: {
                    total: sfToHs.length,
                    pass: sfToHs.filter(e => e.status === 'pass').length,
                    fail: sfToHs.filter(e => e.status === 'fail').length,
                    timeout: sfToHs.filter(e => e.status === 'timeout').length,
                    avg_lag_seconds: this._calculateAvgLag(sfToHs)
                },
                hs_to_sf: {
                    total: hsToSf.length,
                    pass: hsToSf.filter(e => e.status === 'pass').length,
                    fail: hsToSf.filter(e => e.status === 'fail').length,
                    timeout: hsToSf.filter(e => e.status === 'timeout').length,
                    avg_lag_seconds: this._calculateAvgLag(hsToSf)
                }
            },
            byOperation: this._groupByOperation(entries)
        };
    }

    /**
     * Calculate average lag for successful probes
     * @private
     */
    _calculateAvgLag(probes) {
        const passed = probes.filter(p => p.status === 'pass' && p.result && p.result.lag_seconds !== undefined);
        if (passed.length === 0) return null;

        const sum = passed.reduce((acc, p) => acc + p.result.lag_seconds, 0);
        return Math.round((sum / passed.length) * 10) / 10; // Round to 1 decimal
    }

    /**
     * Group entries by operation type
     * @private
     */
    _groupByOperation(entries) {
        const grouped = {};

        entries.forEach(entry => {
            if (!grouped[entry.operation]) {
                grouped[entry.operation] = {
                    total: 0,
                    pending: 0,
                    pass: 0,
                    fail: 0,
                    timeout: 0
                };
            }

            grouped[entry.operation].total++;
            grouped[entry.operation][entry.status]++;
        });

        return grouped;
    }

    /**
     * Load ledger from disk
     * @private
     */
    _load() {
        if (fs.existsSync(this.ledgerPath)) {
            const data = fs.readFileSync(this.ledgerPath, 'utf8');
            const ledger = JSON.parse(data);
            this.entries = ledger.entries || {};
        }
    }

    /**
     * Save ledger to disk
     * @private
     */
    _save() {
        const ledger = {
            runId: this.runId,
            createdAt: this.entries[Object.keys(this.entries)[0]]?.createdAt || new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            entries: this.entries
        };

        fs.writeFileSync(this.ledgerPath, JSON.stringify(ledger, null, 2));
    }

    /**
     * Export ledger as CSV
     * @param {string} outputPath - Path to CSV file
     */
    exportCSV(outputPath) {
        const entries = Object.values(this.entries);

        if (entries.length === 0) {
            console.log('No entries to export');
            return;
        }

        const headers = [
            'key',
            'operation',
            'syncAnchor',
            'status',
            'lag_seconds',
            'createdAt',
            'completedAt',
            'failedAt',
            'error'
        ];

        const rows = entries.map(entry => [
            entry.key,
            entry.operation,
            entry.syncAnchor,
            entry.status,
            entry.result?.lag_seconds || '',
            entry.createdAt,
            entry.completedAt || '',
            entry.failedAt || entry.timedOutAt || '',
            entry.error?.message || ''
        ]);

        const csv = [headers.join(',')].concat(rows.map(row => row.map(cell => `"${cell}"`).join(','))).join('\n');
        fs.writeFileSync(outputPath, csv);

        console.log(`✅ Ledger exported to: ${outputPath}`);
    }

    /**
     * Export probe results as JSON (for report generation)
     * @param {string} outputPath - Path to JSON file
     */
    exportProbeResults(outputPath) {
        const probeResults = this.getAllProbeResults();
        fs.writeFileSync(outputPath, JSON.stringify(probeResults, null, 2));
        console.log(`✅ Probe results exported to: ${outputPath}`);
    }

    /**
     * Clear all entries (use with caution!)
     */
    clear() {
        this.entries = {};
        this._save();
    }
}

// CLI Usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === '--help') {
        console.log(`
Live Wire Sync Test Ledger - Operation Tracking

Usage:
  node wire-test-ledger.js summary <run-id>
  node wire-test-ledger.js list <run-id> [status]
  node wire-test-ledger.js probes <run-id>
  node wire-test-ledger.js export <run-id> <output-path>
  node wire-test-ledger.js export-probes <run-id> <output-path>
  node wire-test-ledger.js clear <run-id>

Commands:
  summary       - Show ledger statistics
  list          - List entries (filter by status: all|pending|pass|fail|timeout)
  probes        - Show probe results grouped by sync anchor
  export        - Export ledger to CSV
  export-probes - Export probe results to JSON
  clear         - Clear all entries (DESTRUCTIVE)

Examples:
  node wire-test-ledger.js summary wire-test-2025-11-07-153045
  node wire-test-ledger.js list wire-test-2025-11-07-153045 fail
  node wire-test-ledger.js probes wire-test-2025-11-07-153045
  node wire-test-ledger.js export wire-test-2025-11-07-153045 ./ledger.csv
        `);
        process.exit(0);
    }

    const runId = args[1];
    if (!runId) {
        console.error('Error: Run ID required');
        process.exit(1);
    }

    const ledger = new WireTestLedger(runId);

    switch (command) {
        case 'summary':
            const summary = ledger.getSummary();
            console.log('\n📊 Wire Test Ledger Summary');
            console.log('═'.repeat(60));
            console.log(`Run ID: ${runId}`);
            console.log(`Total Entries: ${summary.total}`);
            console.log(`  Pending: ${summary.pending}`);
            console.log(`  Pass:    ${summary.pass}`);
            console.log(`  Fail:    ${summary.fail}`);
            console.log(`  Timeout: ${summary.timeout}`);
            console.log('\nProbe Results:');
            console.log(`  SF→HS: ${summary.probes.sf_to_hs.pass}/${summary.probes.sf_to_hs.total} pass (avg lag: ${summary.probes.sf_to_hs.avg_lag_seconds}s)`);
            console.log(`  HS→SF: ${summary.probes.hs_to_sf.pass}/${summary.probes.hs_to_sf.total} pass (avg lag: ${summary.probes.hs_to_sf.avg_lag_seconds}s)`);
            console.log('\nBy Operation:');
            Object.keys(summary.byOperation).forEach(op => {
                const stats = summary.byOperation[op];
                console.log(`  ${op}: ${stats.total} total (${stats.pass} pass, ${stats.fail} fail, ${stats.timeout} timeout)`);
            });
            console.log('═'.repeat(60));
            break;

        case 'list':
            const status = args[2] || 'all';
            const entries = ledger.getEntries(status);
            console.log(`\n📋 Entries (${status}): ${entries.length}`);
            console.log('═'.repeat(60));
            entries.forEach(entry => {
                console.log(`${entry.key}`);
                console.log(`  Operation: ${entry.operation} | Status: ${entry.status}`);
                console.log(`  Sync Anchor: ${entry.syncAnchor}`);
                if (entry.result?.lag_seconds) {
                    console.log(`  Lag: ${entry.result.lag_seconds}s`);
                }
                if (entry.error) {
                    console.log(`  Error: ${entry.error.message}`);
                }
                console.log('');
            });
            break;

        case 'probes':
            const probeResults = ledger.getAllProbeResults();
            console.log(`\n🔍 Probe Results: ${Object.keys(probeResults).length} sync anchors`);
            console.log('═'.repeat(60));
            Object.entries(probeResults).forEach(([anchor, results]) => {
                console.log(`\nSync Anchor: ${anchor}`);
                if (results.sf_to_hs) {
                    console.log(`  SF→HS: ${results.sf_to_hs.status} ${results.sf_to_hs.result?.lag_seconds ? `(${results.sf_to_hs.result.lag_seconds}s)` : ''}`);
                }
                if (results.hs_to_sf) {
                    console.log(`  HS→SF: ${results.hs_to_sf.status} ${results.hs_to_sf.result?.lag_seconds ? `(${results.hs_to_sf.result.lag_seconds}s)` : ''}`);
                }
            });
            console.log('═'.repeat(60));
            break;

        case 'export':
            const outputPath = args[2];
            if (!outputPath) {
                console.error('Error: Output path required');
                process.exit(1);
            }
            ledger.exportCSV(outputPath);
            break;

        case 'export-probes':
            const probeOutputPath = args[2];
            if (!probeOutputPath) {
                console.error('Error: Output path required');
                process.exit(1);
            }
            ledger.exportProbeResults(probeOutputPath);
            break;

        case 'clear':
            console.log('⚠️  Clearing ledger (this is destructive!)');
            ledger.clear();
            console.log('✅ Ledger cleared');
            break;

        default:
            console.error(`Unknown command: ${command}`);
            process.exit(1);
    }
}

module.exports = WireTestLedger;
