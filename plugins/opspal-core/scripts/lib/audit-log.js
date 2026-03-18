#!/usr/bin/env node

/**
 * Centralized Audit Log
 *
 * Records all mutations (create, update, delete) with:
 * - Before/after state
 * - Actor and timestamp
 * - Trace ID correlation
 * - Support for compliance queries
 *
 * @version 1.0.0
 * @date 2025-12-19
 *
 * Addresses: Infrastructure gap (unified audit trail)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AuditLog {
    constructor(options = {}) {
        this.logDir = options.logDir || path.join(process.env.HOME || '/tmp', '.claude', 'audit');
        this.logFile = path.join(this.logDir, 'audit.jsonl');
        this.indexFile = path.join(this.logDir, 'audit-index.json');

        // Trace context
        this.traceId = options.traceId || process.env.TRACE_ID || process.env.CLAUDE_TRACE_ID;

        // Actor information
        this.actor = options.actor || {
            type: 'agent',
            id: process.env.CLAUDE_AGENT_ID || 'claude-code',
            name: process.env.CLAUDE_AGENT_NAME || 'Claude Code'
        };

        // Retention settings
        this.retentionDays = options.retentionDays || 90;

        // Ensure log directory exists
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }

        // Initialize index if needed
        this._initIndex();
    }

    /**
     * Log a CREATE operation
     * @param {string} resourceType - Type of resource (e.g., 'Field', 'Flow', 'PermissionSet')
     * @param {string} resourceId - Unique identifier
     * @param {Object} state - Created state
     * @param {Object} metadata - Additional metadata
     * @returns {Object} Audit entry
     */
    logCreate(resourceType, resourceId, state, metadata = {}) {
        return this._log({
            operation: 'CREATE',
            resourceType,
            resourceId,
            before: null,
            after: state,
            metadata
        });
    }

    /**
     * Log an UPDATE operation
     * @param {string} resourceType - Type of resource
     * @param {string} resourceId - Unique identifier
     * @param {Object} before - State before change
     * @param {Object} after - State after change
     * @param {Object} metadata - Additional metadata
     * @returns {Object} Audit entry
     */
    logUpdate(resourceType, resourceId, before, after, metadata = {}) {
        // Calculate diff
        const changes = this._calculateDiff(before, after);

        return this._log({
            operation: 'UPDATE',
            resourceType,
            resourceId,
            before,
            after,
            changes,
            metadata
        });
    }

    /**
     * Log a DELETE operation
     * @param {string} resourceType - Type of resource
     * @param {string} resourceId - Unique identifier
     * @param {Object} state - State before deletion
     * @param {Object} metadata - Additional metadata
     * @returns {Object} Audit entry
     */
    logDelete(resourceType, resourceId, state, metadata = {}) {
        return this._log({
            operation: 'DELETE',
            resourceType,
            resourceId,
            before: state,
            after: null,
            metadata
        });
    }

    /**
     * Log a DEPLOY operation
     * @param {string} resourceType - Type of resource
     * @param {Array} components - Components being deployed
     * @param {Object} metadata - Deployment metadata
     * @returns {Object} Audit entry
     */
    logDeploy(resourceType, components, metadata = {}) {
        return this._log({
            operation: 'DEPLOY',
            resourceType,
            resourceId: `deploy-${Date.now()}`,
            before: null,
            after: { components },
            metadata: {
                ...metadata,
                componentCount: components.length
            }
        });
    }

    /**
     * Log a QUERY operation (for sensitive data access)
     * @param {string} resourceType - Type of resource queried
     * @param {string} query - Query string
     * @param {number} recordCount - Number of records returned
     * @param {Object} metadata - Additional metadata
     * @returns {Object} Audit entry
     */
    logQuery(resourceType, query, recordCount, metadata = {}) {
        return this._log({
            operation: 'QUERY',
            resourceType,
            resourceId: `query-${Date.now()}`,
            before: null,
            after: { query, recordCount },
            metadata
        });
    }

    /**
     * Query audit log
     * @param {Object} filters - Query filters
     * @returns {Array} Matching audit entries
     */
    query(filters = {}) {
        const results = [];

        if (!fs.existsSync(this.logFile)) {
            return results;
        }

        const lines = fs.readFileSync(this.logFile, 'utf-8').trim().split('\n');

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                const entry = JSON.parse(line);

                // Apply filters
                if (filters.operation && entry.operation !== filters.operation) continue;
                if (filters.resourceType && entry.resourceType !== filters.resourceType) continue;
                if (filters.resourceId && entry.resourceId !== filters.resourceId) continue;
                if (filters.traceId && entry.traceId !== filters.traceId) continue;
                if (filters.actorId && entry.actor?.id !== filters.actorId) continue;

                if (filters.startDate) {
                    const entryDate = new Date(entry.timestamp);
                    if (entryDate < new Date(filters.startDate)) continue;
                }

                if (filters.endDate) {
                    const entryDate = new Date(entry.timestamp);
                    if (entryDate > new Date(filters.endDate)) continue;
                }

                results.push(entry);
            } catch (e) {
                // Skip invalid entries
            }
        }

        // Sort by timestamp descending (newest first)
        results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Apply limit
        if (filters.limit) {
            return results.slice(0, filters.limit);
        }

        return results;
    }

    /**
     * Get history for a specific resource
     * @param {string} resourceType - Type of resource
     * @param {string} resourceId - Resource identifier
     * @returns {Array} Audit history for resource
     */
    getResourceHistory(resourceType, resourceId) {
        return this.query({
            resourceType,
            resourceId
        });
    }

    /**
     * Get all operations for a trace
     * @param {string} traceId - Trace ID
     * @returns {Array} Audit entries for trace
     */
    getTraceOperations(traceId) {
        return this.query({ traceId });
    }

    /**
     * Generate compliance report
     * @param {Object} options - Report options
     * @returns {Object} Compliance report
     */
    generateComplianceReport(options = {}) {
        const { startDate, endDate, resourceTypes } = options;

        const entries = this.query({
            startDate,
            endDate
        });

        // Filter by resource types if specified
        const filtered = resourceTypes
            ? entries.filter(e => resourceTypes.includes(e.resourceType))
            : entries;

        // Generate statistics
        const stats = {
            totalOperations: filtered.length,
            byOperation: {},
            byResourceType: {},
            byActor: {},
            timeRange: {
                start: startDate || 'all time',
                end: endDate || 'now'
            }
        };

        for (const entry of filtered) {
            // By operation
            stats.byOperation[entry.operation] = (stats.byOperation[entry.operation] || 0) + 1;

            // By resource type
            stats.byResourceType[entry.resourceType] = (stats.byResourceType[entry.resourceType] || 0) + 1;

            // By actor
            const actorId = entry.actor?.id || 'unknown';
            stats.byActor[actorId] = (stats.byActor[actorId] || 0) + 1;
        }

        return {
            generatedAt: new Date().toISOString(),
            statistics: stats,
            recentOperations: filtered.slice(0, 10)
        };
    }

    /**
     * Get audit log summary
     * @returns {Object} Summary statistics
     */
    getSummary() {
        const index = this._loadIndex();

        return {
            totalEntries: index.totalEntries,
            oldestEntry: index.oldestEntry,
            newestEntry: index.newestEntry,
            operationCounts: index.operationCounts,
            resourceTypeCounts: index.resourceTypeCounts,
            logFileSize: fs.existsSync(this.logFile)
                ? fs.statSync(this.logFile).size
                : 0
        };
    }

    /**
     * Clean up old entries beyond retention period
     * @returns {Object} Cleanup result
     */
    cleanup() {
        if (!fs.existsSync(this.logFile)) {
            return { entriesRemoved: 0, entriesKept: 0 };
        }

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

        const lines = fs.readFileSync(this.logFile, 'utf-8').trim().split('\n');
        const kept = [];
        let removed = 0;

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                const entry = JSON.parse(line);
                const entryDate = new Date(entry.timestamp);

                if (entryDate >= cutoffDate) {
                    kept.push(line);
                } else {
                    removed++;
                }
            } catch (e) {
                // Keep unparseable lines to avoid data loss
                kept.push(line);
            }
        }

        // Write back
        fs.writeFileSync(this.logFile, kept.join('\n') + '\n');

        // Rebuild index
        this._rebuildIndex();

        return {
            entriesRemoved: removed,
            entriesKept: kept.length
        };
    }

    // === Private Methods ===

    _log(data) {
        const entry = {
            id: crypto.randomBytes(8).toString('hex'),
            timestamp: new Date().toISOString(),
            traceId: this.traceId,
            actor: this.actor,
            ...data
        };

        // Write to log file
        fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n');

        // Update index
        this._updateIndex(entry);

        return entry;
    }

    _calculateDiff(before, after) {
        if (!before || !after) return null;

        const changes = {
            added: {},
            removed: {},
            modified: {}
        };

        // Find added and modified
        for (const [key, value] of Object.entries(after)) {
            if (!(key in before)) {
                changes.added[key] = value;
            } else if (JSON.stringify(before[key]) !== JSON.stringify(value)) {
                changes.modified[key] = {
                    from: before[key],
                    to: value
                };
            }
        }

        // Find removed
        for (const key of Object.keys(before)) {
            if (!(key in after)) {
                changes.removed[key] = before[key];
            }
        }

        return changes;
    }

    _initIndex() {
        if (!fs.existsSync(this.indexFile)) {
            this._saveIndex({
                totalEntries: 0,
                oldestEntry: null,
                newestEntry: null,
                operationCounts: {},
                resourceTypeCounts: {}
            });
        }
    }

    _loadIndex() {
        try {
            return JSON.parse(fs.readFileSync(this.indexFile, 'utf-8'));
        } catch (e) {
            return {
                totalEntries: 0,
                oldestEntry: null,
                newestEntry: null,
                operationCounts: {},
                resourceTypeCounts: {}
            };
        }
    }

    _saveIndex(index) {
        fs.writeFileSync(this.indexFile, JSON.stringify(index, null, 2));
    }

    _updateIndex(entry) {
        const index = this._loadIndex();

        index.totalEntries++;
        index.newestEntry = entry.timestamp;
        if (!index.oldestEntry) {
            index.oldestEntry = entry.timestamp;
        }

        index.operationCounts[entry.operation] = (index.operationCounts[entry.operation] || 0) + 1;
        index.resourceTypeCounts[entry.resourceType] = (index.resourceTypeCounts[entry.resourceType] || 0) + 1;

        this._saveIndex(index);
    }

    _rebuildIndex() {
        const index = {
            totalEntries: 0,
            oldestEntry: null,
            newestEntry: null,
            operationCounts: {},
            resourceTypeCounts: {}
        };

        if (!fs.existsSync(this.logFile)) {
            this._saveIndex(index);
            return;
        }

        const lines = fs.readFileSync(this.logFile, 'utf-8').trim().split('\n');

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                const entry = JSON.parse(line);

                index.totalEntries++;

                if (!index.oldestEntry || entry.timestamp < index.oldestEntry) {
                    index.oldestEntry = entry.timestamp;
                }
                if (!index.newestEntry || entry.timestamp > index.newestEntry) {
                    index.newestEntry = entry.timestamp;
                }

                index.operationCounts[entry.operation] = (index.operationCounts[entry.operation] || 0) + 1;
                index.resourceTypeCounts[entry.resourceType] = (index.resourceTypeCounts[entry.resourceType] || 0) + 1;
            } catch (e) {
                // Skip invalid entries
            }
        }

        this._saveIndex(index);
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const auditLog = new AuditLog();

    switch (command) {
        case 'query':
            const filters = {};
            for (let i = 1; i < args.length; i += 2) {
                const key = args[i].replace('--', '');
                filters[key] = args[i + 1];
            }
            const results = auditLog.query(filters);
            console.log(JSON.stringify(results, null, 2));
            break;

        case 'history':
            const resourceType = args[1];
            const resourceId = args[2];
            if (!resourceType || !resourceId) {
                console.error('Usage: audit-log history <resourceType> <resourceId>');
                process.exit(1);
            }
            const history = auditLog.getResourceHistory(resourceType, resourceId);
            console.log(JSON.stringify(history, null, 2));
            break;

        case 'report':
            const reportOptions = {};
            for (let i = 1; i < args.length; i += 2) {
                const key = args[i].replace('--', '');
                reportOptions[key] = args[i + 1];
            }
            const report = auditLog.generateComplianceReport(reportOptions);
            console.log(JSON.stringify(report, null, 2));
            break;

        case 'summary':
            const summary = auditLog.getSummary();
            console.log(JSON.stringify(summary, null, 2));
            break;

        case 'cleanup':
            const cleanupResult = auditLog.cleanup();
            console.log(`Cleanup complete: ${cleanupResult.entriesRemoved} removed, ${cleanupResult.entriesKept} kept`);
            break;

        default:
            console.log(`
Centralized Audit Log - Track all mutations with compliance support

Usage:
  audit-log query [--operation X] [--resourceType X] [--limit N]
  audit-log history <resourceType> <resourceId>
  audit-log report [--startDate X] [--endDate X]
  audit-log summary
  audit-log cleanup

Query Filters:
  --operation       CREATE, UPDATE, DELETE, DEPLOY, QUERY
  --resourceType    Field, Flow, PermissionSet, etc.
  --resourceId      Specific resource ID
  --traceId         Filter by trace ID
  --startDate       Filter from date (ISO format)
  --endDate         Filter to date (ISO format)
  --limit           Max results to return

Examples:
  audit-log query --operation DELETE --limit 10
  audit-log history Field Account.Custom_Field__c
  audit-log report --startDate 2025-12-01
  audit-log summary
            `);
    }
}

module.exports = { AuditLog };
