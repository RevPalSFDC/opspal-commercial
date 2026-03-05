/**
 * Audit Logger
 *
 * Comprehensive audit logging for data quality operations including
 * action tracking, change history, rollback support, and compliance exports.
 *
 * @module governance/audit-logger
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Audit entry types
 */
const AUDIT_TYPES = {
    ACTION: 'action',
    MERGE: 'merge',
    UPDATE: 'update',
    DELETE: 'delete',
    ENRICHMENT: 'enrichment',
    REVIEW: 'review',
    APPROVAL: 'approval',
    REJECTION: 'rejection',
    OVERRIDE: 'override',
    ROLLBACK: 'rollback',
    COMPLIANCE: 'compliance',
    ERROR: 'error'
};

/**
 * Audit Logger
 */
class AuditLogger {
    /**
     * Create an audit logger
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        // Storage configuration
        this.storagePath = options.storagePath ||
            path.join(process.cwd(), '.audit-logs');
        this.filePrefix = options.filePrefix || 'audit';
        this.rotationDays = options.rotationDays || 30;

        // Retention configuration (from governance policies)
        this.retentionDays = options.retentionDays || {
            default: 365,
            merge: 730,
            delete: 1095,
            bulk_update: 730,
            compliance_change: 2555,
            field_update: 365,
            enrichment: 180
        };

        // In-memory buffer for performance
        this._buffer = [];
        this._bufferSize = options.bufferSize || 100;
        this._flushInterval = options.flushInterval || 5000; // 5 seconds

        // Snapshot storage for rollback support
        this._snapshots = new Map();
        this._maxSnapshotsPerOperation = options.maxSnapshotsPerOperation || 100;

        // Statistics
        this._stats = {
            totalLogged: 0,
            byType: {},
            lastFlush: null
        };

        // Initialize storage
        this._initializeStorage();

        // Start flush interval
        this._flushTimer = setInterval(() => this._flushBuffer(), this._flushInterval);
    }

    /**
     * Initialize storage directory
     * @private
     */
    _initializeStorage() {
        try {
            if (!fs.existsSync(this.storagePath)) {
                fs.mkdirSync(this.storagePath, { recursive: true });
            }
        } catch (error) {
            console.error(`Failed to initialize audit storage: ${error.message}`);
        }
    }

    /**
     * Log an action
     * @param {Object} action - Action details
     * @returns {Object} Audit entry
     */
    logAction(action) {
        const entry = {
            id: this._generateId(),
            type: AUDIT_TYPES.ACTION,
            timestamp: new Date().toISOString(),
            action_type: action.type || 'unknown',
            record_ids: action.recordIds || (action.recordId ? [action.recordId] : []),
            record_type: action.recordType || 'unknown',
            user_or_automation: action.user || action.automationId || 'system',
            confidence: action.confidence,
            rule_applied: action.rule || action.ruleApplied,
            metadata: action.metadata || {},
            source: action.source || 'data_quality_system'
        };

        this._addToBuffer(entry);
        return entry;
    }

    /**
     * Log a merge operation with full details
     * @param {Object} cluster - Records being merged
     * @param {Object} goldenRecord - Resulting merged record
     * @param {Object} fieldLineage - Per-field source tracking
     * @returns {Object} Audit entry
     */
    logMerge(cluster, goldenRecord, fieldLineage) {
        // Create snapshots for rollback
        const snapshotId = this._createMergeSnapshot(cluster);

        const entry = {
            id: this._generateId(),
            type: AUDIT_TYPES.MERGE,
            timestamp: new Date().toISOString(),
            snapshot_id: snapshotId,
            cluster: {
                record_count: cluster.records?.length || 0,
                record_ids: (cluster.records || []).map(r => r.Id || r.id),
                confidence: cluster.confidence
            },
            golden_record: {
                id: goldenRecord.Id || goldenRecord.id,
                survivor_id: cluster.survivorId || cluster.primaryId
            },
            field_lineage: fieldLineage,
            merged_by: cluster.mergedBy || 'system',
            merge_rule: cluster.mergeRule || 'default',
            rollback_available: true,
            rollback_expires: this._calculateRetentionDate('merge')
        };

        this._addToBuffer(entry);
        return entry;
    }

    /**
     * Log a field update
     * @param {Object} update - Update details
     * @returns {Object} Audit entry
     */
    logUpdate(update) {
        const entry = {
            id: this._generateId(),
            type: AUDIT_TYPES.UPDATE,
            timestamp: new Date().toISOString(),
            record_id: update.recordId,
            record_type: update.recordType,
            field_changes: Object.entries(update.changes || {}).map(([field, change]) => ({
                field,
                before: change.before || change.old,
                after: change.after || change.new,
                source: change.source
            })),
            update_reason: update.reason,
            updated_by: update.updatedBy || 'system',
            confidence: update.confidence,
            rollback_available: true
        };

        // Store snapshot if not already stored
        if (update.beforeRecord) {
            this._storeSnapshot(update.recordId, update.beforeRecord);
        }

        this._addToBuffer(entry);
        return entry;
    }

    /**
     * Log an enrichment operation
     * @param {Object} enrichment - Enrichment details
     * @returns {Object} Audit entry
     */
    logEnrichment(enrichment) {
        const entry = {
            id: this._generateId(),
            type: AUDIT_TYPES.ENRICHMENT,
            timestamp: new Date().toISOString(),
            record_id: enrichment.recordId,
            record_type: enrichment.recordType,
            enriched_fields: enrichment.fields || [],
            enrichment_source: enrichment.source,
            confidence_scores: enrichment.confidenceScores || {},
            fields_updated: enrichment.fieldsUpdated || [],
            fields_skipped: enrichment.fieldsSkipped || [],
            skip_reasons: enrichment.skipReasons || {},
            duration_ms: enrichment.duration
        };

        this._addToBuffer(entry);
        return entry;
    }

    /**
     * Log a review action
     * @param {Object} review - Review details
     * @returns {Object} Audit entry
     */
    logReview(review) {
        const entry = {
            id: this._generateId(),
            type: review.approved ? AUDIT_TYPES.APPROVAL : AUDIT_TYPES.REJECTION,
            timestamp: new Date().toISOString(),
            review_id: review.reviewId,
            original_action: review.action,
            reviewer: review.reviewer,
            decision: review.approved ? 'approved' : 'rejected',
            comment: review.comment,
            approvals_count: review.approvalsCount,
            required_approvals: review.requiredApprovals
        };

        this._addToBuffer(entry);
        return entry;
    }

    /**
     * Log a compliance event
     * @param {Object} compliance - Compliance event details
     * @returns {Object} Audit entry
     */
    logComplianceEvent(compliance) {
        const entry = {
            id: this._generateId(),
            type: AUDIT_TYPES.COMPLIANCE,
            timestamp: new Date().toISOString(),
            regulation: compliance.regulation,
            event_type: compliance.eventType,
            record_id: compliance.recordId,
            record_type: compliance.recordType,
            data_subject: compliance.dataSubject,
            action_taken: compliance.actionTaken,
            fields_affected: compliance.fieldsAffected || [],
            legal_basis: compliance.legalBasis,
            expiration_date: compliance.expirationDate,
            metadata: compliance.metadata || {}
        };

        this._addToBuffer(entry);
        return entry;
    }

    /**
     * Log an error
     * @param {Object} error - Error details
     * @returns {Object} Audit entry
     */
    logError(error) {
        const entry = {
            id: this._generateId(),
            type: AUDIT_TYPES.ERROR,
            timestamp: new Date().toISOString(),
            error_type: error.type || 'unknown',
            error_message: error.message,
            error_stack: error.stack,
            context: {
                action: error.action,
                record_id: error.recordId,
                record_type: error.recordType
            },
            severity: error.severity || 'error',
            recovered: error.recovered || false
        };

        this._addToBuffer(entry);
        return entry;
    }

    /**
     * Log a rollback operation
     * @param {Object} rollback - Rollback details
     * @returns {Object} Audit entry
     */
    logRollback(rollback) {
        const entry = {
            id: this._generateId(),
            type: AUDIT_TYPES.ROLLBACK,
            timestamp: new Date().toISOString(),
            original_audit_id: rollback.originalAuditId,
            snapshot_id: rollback.snapshotId,
            records_restored: rollback.recordsRestored || [],
            rollback_reason: rollback.reason,
            rolled_back_by: rollback.rolledBackBy || 'system',
            success: rollback.success,
            error: rollback.error
        };

        this._addToBuffer(entry);
        return entry;
    }

    /**
     * Query audit log
     * @param {Object} filters - Query filters
     * @returns {Object[]} Matching audit entries
     */
    queryLog(filters = {}) {
        // Flush buffer first to ensure all entries are available
        this._flushBuffer();

        const entries = [];
        const files = this._getLogFiles(filters.dateRange);

        for (const file of files) {
            try {
                const content = fs.readFileSync(file, 'utf-8');
                const lines = content.split('\n').filter(l => l.trim());

                for (const line of lines) {
                    try {
                        const entry = JSON.parse(line);

                        if (this._matchesFilters(entry, filters)) {
                            entries.push(entry);
                        }
                    } catch (e) {
                        // Skip malformed entries
                    }
                }
            } catch (error) {
                console.warn(`Failed to read log file ${file}: ${error.message}`);
            }
        }

        // Sort by timestamp descending (most recent first)
        entries.sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        // Apply limit
        if (filters.limit) {
            return entries.slice(0, filters.limit);
        }

        return entries;
    }

    /**
     * Export audit log for compliance
     * @param {Object} options - Export options
     * @returns {Object} Export result
     */
    exportForCompliance(options = {}) {
        const dateRange = options.dateRange || {
            start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
            end: new Date().toISOString()
        };

        const format = options.format || 'json';
        const regulations = options.regulations || ['gdpr', 'ccpa'];

        // Query relevant entries
        const entries = this.queryLog({
            dateRange,
            types: [AUDIT_TYPES.COMPLIANCE, AUDIT_TYPES.MERGE, AUDIT_TYPES.DELETE, AUDIT_TYPES.UPDATE]
        });

        // Filter by regulation if specified
        const filtered = entries.filter(entry => {
            if (entry.type === AUDIT_TYPES.COMPLIANCE) {
                return regulations.includes(entry.regulation?.toLowerCase());
            }
            // Include all other data modification entries
            return true;
        });

        // Generate export
        const exportData = {
            exportedAt: new Date().toISOString(),
            dateRange,
            regulations,
            entryCount: filtered.length,
            entries: filtered
        };

        // Save to file if path specified
        if (options.outputPath) {
            const output = format === 'json'
                ? JSON.stringify(exportData, null, 2)
                : this._formatAsCSV(filtered);

            fs.writeFileSync(options.outputPath, output);
        }

        return exportData;
    }

    /**
     * Get rollback data for an operation
     * @param {string} auditId - Audit entry ID or snapshot ID
     * @returns {Object|null} Rollback data
     */
    getRollbackData(auditId) {
        // Check snapshots
        const snapshot = this._snapshots.get(auditId);
        if (snapshot) {
            return {
                type: 'snapshot',
                snapshotId: auditId,
                data: snapshot.data,
                createdAt: snapshot.createdAt,
                expiresAt: snapshot.expiresAt
            };
        }

        // Query audit log for the entry
        const entries = this.queryLog({
            id: auditId,
            limit: 1
        });

        if (entries.length > 0 && entries[0].snapshot_id) {
            const snapshotData = this._snapshots.get(entries[0].snapshot_id);
            if (snapshotData) {
                return {
                    type: 'merge_snapshot',
                    auditId,
                    snapshotId: entries[0].snapshot_id,
                    data: snapshotData.data,
                    createdAt: snapshotData.createdAt
                };
            }
        }

        return null;
    }

    /**
     * Clean up expired snapshots and old logs
     * @returns {Object} Cleanup result
     */
    cleanup() {
        const now = Date.now();
        let snapshotsRemoved = 0;
        let filesRemoved = 0;

        // Clean expired snapshots
        for (const [id, snapshot] of this._snapshots) {
            if (snapshot.expiresAt && new Date(snapshot.expiresAt).getTime() < now) {
                this._snapshots.delete(id);
                snapshotsRemoved++;
            }
        }

        // Clean old log files
        try {
            const files = fs.readdirSync(this.storagePath);
            const cutoffDate = new Date(now - this.retentionDays.default * 24 * 60 * 60 * 1000);

            for (const file of files) {
                if (file.startsWith(this.filePrefix) && file.endsWith('.jsonl')) {
                    const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
                    if (dateMatch) {
                        const fileDate = new Date(dateMatch[1]);
                        if (fileDate < cutoffDate) {
                            fs.unlinkSync(path.join(this.storagePath, file));
                            filesRemoved++;
                        }
                    }
                }
            }
        } catch (error) {
            console.warn(`Cleanup error: ${error.message}`);
        }

        return {
            snapshotsRemoved,
            filesRemoved,
            cleanedAt: new Date().toISOString()
        };
    }

    /**
     * Get audit statistics
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            ...this._stats,
            bufferSize: this._buffer.length,
            snapshotCount: this._snapshots.size,
            storagePath: this.storagePath
        };
    }

    // Private methods

    _generateId() {
        return `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    _addToBuffer(entry) {
        this._buffer.push(entry);
        this._stats.totalLogged++;
        this._stats.byType[entry.type] = (this._stats.byType[entry.type] || 0) + 1;

        if (this._buffer.length >= this._bufferSize) {
            this._flushBuffer();
        }
    }

    _flushBuffer() {
        if (this._buffer.length === 0) return;

        const today = new Date().toISOString().split('T')[0];
        const filename = `${this.filePrefix}-${today}.jsonl`;
        const filepath = path.join(this.storagePath, filename);

        try {
            const lines = this._buffer.map(entry => JSON.stringify(entry)).join('\n') + '\n';
            fs.appendFileSync(filepath, lines);
            this._buffer = [];
            this._stats.lastFlush = new Date().toISOString();
        } catch (error) {
            console.error(`Failed to flush audit buffer: ${error.message}`);
        }
    }

    _createMergeSnapshot(cluster) {
        const snapshotId = `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const snapshot = {
            data: cluster.records || [],
            createdAt: new Date().toISOString(),
            expiresAt: this._calculateRetentionDate('merge'),
            type: 'merge'
        };

        this._snapshots.set(snapshotId, snapshot);

        // Limit snapshots per operation type
        this._pruneSnapshots();

        return snapshotId;
    }

    _storeSnapshot(recordId, record) {
        const snapshotId = `record-${recordId}-${Date.now()}`;

        this._snapshots.set(snapshotId, {
            data: record,
            createdAt: new Date().toISOString(),
            expiresAt: this._calculateRetentionDate('field_update'),
            type: 'record'
        });

        return snapshotId;
    }

    _pruneSnapshots() {
        // Remove oldest snapshots if exceeding limit
        if (this._snapshots.size > this._maxSnapshotsPerOperation * 10) {
            const entries = Array.from(this._snapshots.entries());
            entries.sort((a, b) =>
                new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime()
            );

            const toRemove = entries.slice(0, entries.length - this._maxSnapshotsPerOperation * 5);
            for (const [id] of toRemove) {
                this._snapshots.delete(id);
            }
        }
    }

    _calculateRetentionDate(actionType) {
        const days = this.retentionDays[actionType] || this.retentionDays.default;
        return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }

    _getLogFiles(dateRange) {
        const files = [];

        try {
            const allFiles = fs.readdirSync(this.storagePath)
                .filter(f => f.startsWith(this.filePrefix) && f.endsWith('.jsonl'))
                .sort();

            if (dateRange) {
                const startDate = dateRange.start ? new Date(dateRange.start) : new Date(0);
                const endDate = dateRange.end ? new Date(dateRange.end) : new Date();

                for (const file of allFiles) {
                    const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
                    if (dateMatch) {
                        const fileDate = new Date(dateMatch[1]);
                        if (fileDate >= startDate && fileDate <= endDate) {
                            files.push(path.join(this.storagePath, file));
                        }
                    }
                }
            } else {
                files.push(...allFiles.map(f => path.join(this.storagePath, f)));
            }
        } catch (error) {
            console.warn(`Failed to list log files: ${error.message}`);
        }

        return files;
    }

    _matchesFilters(entry, filters) {
        if (filters.id && entry.id !== filters.id) return false;

        if (filters.types && !filters.types.includes(entry.type)) return false;

        if (filters.recordId) {
            const hasRecordId = entry.record_id === filters.recordId ||
                entry.record_ids?.includes(filters.recordId);
            if (!hasRecordId) return false;
        }

        if (filters.recordType && entry.record_type !== filters.recordType) return false;

        if (filters.user && entry.user_or_automation !== filters.user) return false;

        if (filters.dateRange) {
            const entryDate = new Date(entry.timestamp);
            if (filters.dateRange.start && entryDate < new Date(filters.dateRange.start)) return false;
            if (filters.dateRange.end && entryDate > new Date(filters.dateRange.end)) return false;
        }

        return true;
    }

    _formatAsCSV(entries) {
        if (entries.length === 0) return '';

        // Get all unique keys
        const keys = new Set();
        for (const entry of entries) {
            Object.keys(entry).forEach(k => keys.add(k));
        }

        const headers = Array.from(keys);
        const rows = [headers.join(',')];

        for (const entry of entries) {
            const values = headers.map(h => {
                const val = entry[h];
                if (val === null || val === undefined) return '';
                if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
                if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                    return `"${val.replace(/"/g, '""')}"`;
                }
                return val;
            });
            rows.push(values.join(','));
        }

        return rows.join('\n');
    }

    /**
     * Destroy the logger (cleanup timers)
     */
    destroy() {
        if (this._flushTimer) {
            clearInterval(this._flushTimer);
        }
        this._flushBuffer();
    }

    /**
     * Get audit type constants
     */
    static get TYPES() {
        return { ...AUDIT_TYPES };
    }
}

module.exports = {
    AuditLogger,
    AUDIT_TYPES
};
