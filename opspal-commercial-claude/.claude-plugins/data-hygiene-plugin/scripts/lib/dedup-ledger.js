#!/usr/bin/env node
/**
 * Deduplication Ledger - Idempotency Tracking
 *
 * Purpose: Track all deduplication operations with idempotency keys to prevent
 * duplicate API calls on retry. Ensures safe retry behavior and operation resumption.
 *
 * Key Features:
 * - x-request-id generation: {PREFIX}::{operation}::{fromId}::{toId}
 * - Operation status tracking: pending, committed, failed
 * - Automatic conflict detection
 * - Ledger persistence to disk
 * - Resume interrupted operations
 *
 * Usage:
 *   const ledger = new DedupLedger('dedupe-20251014-1200');
 *
 *   // Check if operation already executed
 *   if (ledger.hasCommitted('reparent', fromId, toId)) {
 *     console.log('Already executed, skipping...');
 *     return;
 *   }
 *
 *   // Record pending operation
 *   ledger.recordPending('reparent', fromId, toId, { metadata });
 *
 *   // Execute operation...
 *
 *   // Mark as committed
 *   ledger.recordCommitted('reparent', fromId, toId, { result });
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class DedupLedger {
    constructor(idempotencyPrefix, options = {}) {
        this.prefix = idempotencyPrefix;
        this.ledgerDir = options.ledgerDir || path.join(__dirname, '../../.dedup-ledger');
        this.ledgerPath = path.join(this.ledgerDir, `${this.prefix}.json`);
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
     * @param {string} operation - Operation type (e.g., 'reparent', 'delete', 'merge')
     * @param {string} fromId - Source entity ID
     * @param {string} toId - Target entity ID (optional)
     * @returns {string} Idempotency key
     */
    generateKey(operation, fromId, toId = null) {
        const parts = [this.prefix, operation, fromId];
        if (toId) parts.push(toId);
        return parts.join('::');
    }

    /**
     * Check if operation has been committed
     * @param {string} operation
     * @param {string} fromId
     * @param {string} toId
     * @returns {boolean}
     */
    hasCommitted(operation, fromId, toId = null) {
        const key = this.generateKey(operation, fromId, toId);
        return this.entries[key] && this.entries[key].status === 'committed';
    }

    /**
     * Check if operation is pending
     * @param {string} operation
     * @param {string} fromId
     * @param {string} toId
     * @returns {boolean}
     */
    isPending(operation, fromId, toId = null) {
        const key = this.generateKey(operation, fromId, toId);
        return this.entries[key] && this.entries[key].status === 'pending';
    }

    /**
     * Check if operation has failed
     * @param {string} operation
     * @param {string} fromId
     * @param {string} toId
     * @returns {boolean}
     */
    hasFailed(operation, fromId, toId = null) {
        const key = this.generateKey(operation, fromId, toId);
        return this.entries[key] && this.entries[key].status === 'failed';
    }

    /**
     * Record pending operation
     * @param {string} operation
     * @param {string} fromId
     * @param {string} toId
     * @param {object} metadata - Additional metadata
     */
    recordPending(operation, fromId, toId = null, metadata = {}) {
        const key = this.generateKey(operation, fromId, toId);

        // Check for conflicts
        if (this.hasCommitted(operation, fromId, toId)) {
            throw new Error(`Operation already committed: ${key}`);
        }

        this.entries[key] = {
            key,
            operation,
            fromId,
            toId,
            status: 'pending',
            createdAt: new Date().toISOString(),
            metadata
        };

        this._save();
    }

    /**
     * Record committed operation
     * @param {string} operation
     * @param {string} fromId
     * @param {string} toId
     * @param {object} result - Operation result
     */
    recordCommitted(operation, fromId, toId = null, result = {}) {
        const key = this.generateKey(operation, fromId, toId);

        if (!this.entries[key]) {
            // Create entry if doesn't exist (late recording)
            this.entries[key] = {
                key,
                operation,
                fromId,
                toId,
                createdAt: new Date().toISOString()
            };
        }

        this.entries[key].status = 'committed';
        this.entries[key].committedAt = new Date().toISOString();
        this.entries[key].result = result;

        this._save();
    }

    /**
     * Record failed operation
     * @param {string} operation
     * @param {string} fromId
     * @param {string} toId
     * @param {object} error - Error details
     */
    recordFailed(operation, fromId, toId = null, error = {}) {
        const key = this.generateKey(operation, fromId, toId);

        if (!this.entries[key]) {
            this.entries[key] = {
                key,
                operation,
                fromId,
                toId,
                createdAt: new Date().toISOString()
            };
        }

        this.entries[key].status = 'failed';
        this.entries[key].failedAt = new Date().toISOString();
        this.entries[key].error = {
            message: error.message || error.toString(),
            stack: error.stack,
            details: error.details
        };

        this._save();
    }

    /**
     * Get all entries by status
     * @param {string} status - 'pending', 'committed', 'failed', or 'all'
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
     * Get summary statistics
     * @returns {object}
     */
    getSummary() {
        const entries = Object.values(this.entries);

        return {
            total: entries.length,
            pending: entries.filter(e => e.status === 'pending').length,
            committed: entries.filter(e => e.status === 'committed').length,
            failed: entries.filter(e => e.status === 'failed').length,
            byOperation: this._groupByOperation(entries)
        };
    }

    /**
     * Group entries by operation type
     */
    _groupByOperation(entries) {
        const grouped = {};

        entries.forEach(entry => {
            if (!grouped[entry.operation]) {
                grouped[entry.operation] = {
                    total: 0,
                    pending: 0,
                    committed: 0,
                    failed: 0
                };
            }

            grouped[entry.operation].total++;
            grouped[entry.operation][entry.status]++;
        });

        return grouped;
    }

    /**
     * Load ledger from disk
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
     */
    _save() {
        const ledger = {
            prefix: this.prefix,
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

        const headers = ['key', 'operation', 'fromId', 'toId', 'status', 'createdAt', 'committedAt', 'failedAt'];
        const rows = entries.map(entry => [
            entry.key,
            entry.operation,
            entry.fromId,
            entry.toId || '',
            entry.status,
            entry.createdAt,
            entry.committedAt || '',
            entry.failedAt || ''
        ]);

        const csv = [headers.join(',')].concat(rows.map(row => row.join(','))).join('\n');
        fs.writeFileSync(outputPath, csv);

        console.log(`✅ Ledger exported to: ${outputPath}`);
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
Deduplication Ledger - Idempotency Tracking

Usage:
  node dedup-ledger.js summary <prefix>
  node dedup-ledger.js list <prefix> [status]
  node dedup-ledger.js export <prefix> <output-path>
  node dedup-ledger.js clear <prefix>

Commands:
  summary    - Show ledger statistics
  list       - List entries (filter by status: all|pending|committed|failed)
  export     - Export ledger to CSV
  clear      - Clear all entries (DESTRUCTIVE)

Examples:
  node dedup-ledger.js summary dedupe-20251014-1200
  node dedup-ledger.js list dedupe-20251014-1200 failed
  node dedup-ledger.js export dedupe-20251014-1200 ./ledger.csv
        `);
        process.exit(0);
    }

    const prefix = args[1];
    if (!prefix) {
        console.error('Error: Idempotency prefix required');
        process.exit(1);
    }

    const ledger = new DedupLedger(prefix);

    switch (command) {
        case 'summary':
            const summary = ledger.getSummary();
            console.log('\n📊 Ledger Summary');
            console.log('═'.repeat(60));
            console.log(`Prefix: ${prefix}`);
            console.log(`Total Entries: ${summary.total}`);
            console.log(`  Pending:   ${summary.pending}`);
            console.log(`  Committed: ${summary.committed}`);
            console.log(`  Failed:    ${summary.failed}`);
            console.log('\nBy Operation:');
            Object.keys(summary.byOperation).forEach(op => {
                const stats = summary.byOperation[op];
                console.log(`  ${op}: ${stats.total} total (${stats.committed} committed, ${stats.failed} failed)`);
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
                console.log(`  From: ${entry.fromId} ${entry.toId ? `→ ${entry.toId}` : ''}`);
                console.log(`  Created: ${entry.createdAt}`);
                if (entry.error) {
                    console.log(`  Error: ${entry.error.message}`);
                }
                console.log('');
            });
            break;

        case 'export':
            const outputPath = args[2];
            if (!outputPath) {
                console.error('Error: Output path required');
                process.exit(1);
            }
            ledger.exportCSV(outputPath);
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

module.exports = DedupLedger;
