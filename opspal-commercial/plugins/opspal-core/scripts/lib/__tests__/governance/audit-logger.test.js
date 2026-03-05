/**
 * Tests for Audit Logger
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { AuditLogger, AUDIT_TYPES } = require('../../governance/audit-logger');

describe('AuditLogger', () => {
    let logger;
    let tempDir;

    beforeEach(() => {
        // Create temp directory for tests
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
        logger = new AuditLogger({
            storagePath: tempDir,
            bufferSize: 5,
            flushInterval: 60000 // Long interval, we'll flush manually
        });
    });

    afterEach(() => {
        logger.destroy();
        // Clean up temp directory
        try {
            const files = fs.readdirSync(tempDir);
            for (const file of files) {
                fs.unlinkSync(path.join(tempDir, file));
            }
            fs.rmdirSync(tempDir);
        } catch (e) {
            // Ignore cleanup errors
        }
    });

    describe('logAction', () => {
        it('should create audit entry with required fields', () => {
            const entry = logger.logAction({
                type: 'enrichment',
                recordId: 'r001',
                recordType: 'Account',
                confidence: 95
            });

            expect(entry.id).toBeDefined();
            expect(entry.type).toBe(AUDIT_TYPES.ACTION);
            expect(entry.timestamp).toBeDefined();
            expect(entry.action_type).toBe('enrichment');
            expect(entry.record_ids).toContain('r001');
        });

        it('should handle multiple record IDs', () => {
            const entry = logger.logAction({
                type: 'bulk_update',
                recordIds: ['r001', 'r002', 'r003']
            });

            expect(entry.record_ids.length).toBe(3);
        });
    });

    describe('logMerge', () => {
        it('should log merge with snapshot for rollback', () => {
            const cluster = {
                records: [
                    { Id: 'r001', Name: 'Record 1' },
                    { Id: 'r002', Name: 'Record 2' }
                ],
                confidence: 92
            };

            const goldenRecord = { Id: 'r001', Name: 'Merged Record' };
            const fieldLineage = {
                Name: { source: 'r001', confidence: 95 }
            };

            const entry = logger.logMerge(cluster, goldenRecord, fieldLineage);

            expect(entry.type).toBe(AUDIT_TYPES.MERGE);
            expect(entry.snapshot_id).toBeDefined();
            expect(entry.cluster.record_count).toBe(2);
            expect(entry.rollback_available).toBe(true);
        });
    });

    describe('logUpdate', () => {
        it('should track field changes with before/after', () => {
            const entry = logger.logUpdate({
                recordId: 'r001',
                recordType: 'Contact',
                changes: {
                    Phone: { before: '555-1234', after: '555-5678' },
                    Email: { before: null, after: 'new@email.com' }
                },
                reason: 'Enrichment'
            });

            expect(entry.type).toBe(AUDIT_TYPES.UPDATE);
            expect(entry.field_changes.length).toBe(2);
            expect(entry.field_changes[0].before).toBeDefined();
            expect(entry.field_changes[0].after).toBeDefined();
        });
    });

    describe('logEnrichment', () => {
        it('should log enrichment with field details', () => {
            const entry = logger.logEnrichment({
                recordId: 'r001',
                recordType: 'Account',
                source: 'clearbit',
                fieldsUpdated: ['employee_count', 'industry'],
                fieldsSkipped: ['annual_revenue'],
                confidenceScores: { employee_count: 4, industry: 5 },
                duration: 250
            });

            expect(entry.type).toBe(AUDIT_TYPES.ENRICHMENT);
            expect(entry.enriched_fields).toBeDefined();
            expect(entry.enrichment_source).toBe('clearbit');
        });
    });

    describe('logComplianceEvent', () => {
        it('should log GDPR compliance event', () => {
            const entry = logger.logComplianceEvent({
                regulation: 'GDPR',
                eventType: 'data_erasure_request',
                recordId: 'c001',
                recordType: 'Contact',
                dataSubject: 'john.doe@example.com',
                actionTaken: 'deleted',
                fieldsAffected: ['email', 'phone', 'first_name']
            });

            expect(entry.type).toBe(AUDIT_TYPES.COMPLIANCE);
            expect(entry.regulation).toBe('GDPR');
            expect(entry.fields_affected.length).toBe(3);
        });
    });

    describe('queryLog', () => {
        it('should query by type', () => {
            // Log some entries
            logger.logAction({ type: 'enrichment' });
            logger.logAction({ type: 'update' });
            logger.logMerge({ records: [] }, {}, {});
            logger._flushBuffer();

            const entries = logger.queryLog({ types: [AUDIT_TYPES.ACTION] });

            expect(entries.every(e => e.type === AUDIT_TYPES.ACTION)).toBe(true);
        });

        it('should query by record ID', () => {
            logger.logAction({ type: 'update', recordId: 'r001' });
            logger.logAction({ type: 'update', recordId: 'r002' });
            logger._flushBuffer();

            const entries = logger.queryLog({ recordId: 'r001' });

            expect(entries.length).toBeGreaterThanOrEqual(1);
            expect(entries.every(e =>
                e.record_id === 'r001' || e.record_ids?.includes('r001')
            )).toBe(true);
        });

        it('should apply limit', () => {
            for (let i = 0; i < 10; i++) {
                logger.logAction({ type: 'test' });
            }
            logger._flushBuffer();

            const entries = logger.queryLog({ limit: 5 });

            expect(entries.length).toBeLessThanOrEqual(5);
        });
    });

    describe('getRollbackData', () => {
        it('should retrieve snapshot for merge rollback', () => {
            const cluster = {
                records: [
                    { Id: 'r001', Name: 'Record 1' },
                    { Id: 'r002', Name: 'Record 2' }
                ]
            };

            const entry = logger.logMerge(cluster, { Id: 'r001' }, {});
            const rollbackData = logger.getRollbackData(entry.snapshot_id);

            expect(rollbackData).toBeDefined();
            expect(rollbackData.type).toBe('snapshot');
            expect(rollbackData.data.length).toBe(2);
        });
    });

    describe('getStats', () => {
        it('should track logging statistics', () => {
            logger.logAction({ type: 'test' });
            logger.logAction({ type: 'test' });
            logger.logMerge({ records: [] }, {}, {});

            const stats = logger.getStats();

            expect(stats.totalLogged).toBe(3);
            expect(stats.byType[AUDIT_TYPES.ACTION]).toBe(2);
            expect(stats.byType[AUDIT_TYPES.MERGE]).toBe(1);
        });
    });

    describe('cleanup', () => {
        it('should remove expired snapshots', () => {
            // Create a snapshot with expired date
            logger._snapshots.set('old-snapshot', {
                data: [],
                createdAt: '2020-01-01',
                expiresAt: '2020-02-01'
            });

            const result = logger.cleanup();

            expect(result.snapshotsRemoved).toBeGreaterThanOrEqual(1);
        });
    });

    describe('AUDIT_TYPES', () => {
        it('should export all audit types', () => {
            expect(AUDIT_TYPES.ACTION).toBe('action');
            expect(AUDIT_TYPES.MERGE).toBe('merge');
            expect(AUDIT_TYPES.UPDATE).toBe('update');
            expect(AUDIT_TYPES.DELETE).toBe('delete');
            expect(AUDIT_TYPES.ENRICHMENT).toBe('enrichment');
            expect(AUDIT_TYPES.COMPLIANCE).toBe('compliance');
            expect(AUDIT_TYPES.ROLLBACK).toBe('rollback');
        });
    });
});
