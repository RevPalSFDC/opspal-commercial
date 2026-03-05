/**
 * Tests for DedupLedger - Idempotency tracking for safe retry behavior
 *
 * The ledger prevents duplicate API calls during deduplication operations
 * by tracking pending, committed, and failed operations.
 */

const fs = require('fs');
const path = require('path');

// Mock fs module
jest.mock('fs');

const DedupLedger = require('../dedup-ledger');

describe('DedupLedger', () => {
    let ledger;
    const testPrefix = 'test-dedupe-2025-01-01';

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock fs.existsSync to return false (no existing ledger)
        fs.existsSync.mockReturnValue(false);
        fs.mkdirSync.mockImplementation(() => {});
        fs.writeFileSync.mockImplementation(() => {});
        fs.readFileSync.mockReturnValue(JSON.stringify({ entries: {} }));

        ledger = new DedupLedger(testPrefix);
    });

    describe('constructor', () => {
        it('should initialize with provided prefix', () => {
            expect(ledger.prefix).toBe(testPrefix);
        });

        it('should set default ledger directory', () => {
            expect(ledger.ledgerDir).toContain('.dedup-ledger');
        });

        it('should use custom ledger directory if provided', () => {
            const customLedger = new DedupLedger(testPrefix, { ledgerDir: '/custom/path' });
            expect(customLedger.ledgerDir).toBe('/custom/path');
        });

        it('should create ledger directory if it does not exist', () => {
            fs.existsSync.mockReturnValue(false);
            new DedupLedger(testPrefix);
            expect(fs.mkdirSync).toHaveBeenCalled();
        });

        it('should load existing ledger if present', () => {
            const existingEntries = {
                entries: {
                    'test::reparent::123::456': {
                        key: 'test::reparent::123::456',
                        operation: 'reparent',
                        status: 'committed'
                    }
                }
            };
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(existingEntries));

            const loadedLedger = new DedupLedger(testPrefix);
            expect(loadedLedger.entries).toEqual(existingEntries.entries);
        });
    });

    describe('generateKey', () => {
        it('should generate key with all parts', () => {
            const key = ledger.generateKey('reparent', 'from123', 'to456');
            expect(key).toBe(`${testPrefix}::reparent::from123::to456`);
        });

        it('should generate key without toId when null', () => {
            const key = ledger.generateKey('delete', 'company123', null);
            expect(key).toBe(`${testPrefix}::delete::company123`);
        });

        it('should generate key without toId when undefined', () => {
            const key = ledger.generateKey('delete', 'company123');
            expect(key).toBe(`${testPrefix}::delete::company123`);
        });
    });

    describe('recordPending', () => {
        it('should record a pending operation', () => {
            ledger.recordPending('reparent', 'from123', 'to456');

            const key = `${testPrefix}::reparent::from123::to456`;
            expect(ledger.entries[key]).toBeDefined();
            expect(ledger.entries[key].status).toBe('pending');
            expect(ledger.entries[key].operation).toBe('reparent');
            expect(ledger.entries[key].fromId).toBe('from123');
            expect(ledger.entries[key].toId).toBe('to456');
        });

        it('should include metadata in pending entry', () => {
            const metadata = { note: 'test metadata', count: 5 };
            ledger.recordPending('reparent', 'from123', 'to456', metadata);

            const key = `${testPrefix}::reparent::from123::to456`;
            expect(ledger.entries[key].metadata).toEqual(metadata);
        });

        it('should throw error if operation already committed', () => {
            ledger.recordPending('reparent', 'from123', 'to456');
            ledger.recordCommitted('reparent', 'from123', 'to456');

            expect(() => {
                ledger.recordPending('reparent', 'from123', 'to456');
            }).toThrow('Operation already committed');
        });

        it('should save ledger to disk after recording', () => {
            ledger.recordPending('reparent', 'from123', 'to456');
            expect(fs.writeFileSync).toHaveBeenCalled();
        });
    });

    describe('recordCommitted', () => {
        it('should update existing entry to committed', () => {
            ledger.recordPending('reparent', 'from123', 'to456');
            ledger.recordCommitted('reparent', 'from123', 'to456', { success: true });

            const key = `${testPrefix}::reparent::from123::to456`;
            expect(ledger.entries[key].status).toBe('committed');
            expect(ledger.entries[key].committedAt).toBeDefined();
            expect(ledger.entries[key].result).toEqual({ success: true });
        });

        it('should create entry if not already pending (late recording)', () => {
            ledger.recordCommitted('delete', 'company123', null, { result: 'ok' });

            const key = `${testPrefix}::delete::company123`;
            expect(ledger.entries[key]).toBeDefined();
            expect(ledger.entries[key].status).toBe('committed');
        });

        it('should save ledger to disk after recording', () => {
            ledger.recordCommitted('delete', 'company123');
            expect(fs.writeFileSync).toHaveBeenCalled();
        });
    });

    describe('recordFailed', () => {
        it('should record a failed operation', () => {
            ledger.recordPending('reparent', 'from123', 'to456');
            const error = new Error('API timeout');
            error.details = { code: 504 };
            ledger.recordFailed('reparent', 'from123', 'to456', error);

            const key = `${testPrefix}::reparent::from123::to456`;
            expect(ledger.entries[key].status).toBe('failed');
            expect(ledger.entries[key].failedAt).toBeDefined();
            expect(ledger.entries[key].error.message).toBe('API timeout');
        });

        it('should create entry if not already pending', () => {
            const error = new Error('Direct failure');
            ledger.recordFailed('delete', 'company123', null, error);

            const key = `${testPrefix}::delete::company123`;
            expect(ledger.entries[key]).toBeDefined();
            expect(ledger.entries[key].status).toBe('failed');
        });
    });

    describe('status checks', () => {
        beforeEach(() => {
            ledger.recordPending('reparent', 'pending123', 'to456');

            ledger.recordPending('reparent', 'committed123', 'to456');
            ledger.recordCommitted('reparent', 'committed123', 'to456');

            ledger.recordPending('reparent', 'failed123', 'to456');
            ledger.recordFailed('reparent', 'failed123', 'to456', new Error('test'));
        });

        describe('hasCommitted', () => {
            it('should return true for committed operations', () => {
                expect(ledger.hasCommitted('reparent', 'committed123', 'to456')).toBe(true);
            });

            it('should return false for pending operations', () => {
                expect(ledger.hasCommitted('reparent', 'pending123', 'to456')).toBe(false);
            });

            it('should return false for failed operations', () => {
                expect(ledger.hasCommitted('reparent', 'failed123', 'to456')).toBe(false);
            });

            it('should return false for non-existent operations', () => {
                expect(ledger.hasCommitted('reparent', 'unknown', 'to456')).toBeFalsy();
            });
        });

        describe('isPending', () => {
            it('should return true for pending operations', () => {
                expect(ledger.isPending('reparent', 'pending123', 'to456')).toBe(true);
            });

            it('should return false for committed operations', () => {
                expect(ledger.isPending('reparent', 'committed123', 'to456')).toBe(false);
            });
        });

        describe('hasFailed', () => {
            it('should return true for failed operations', () => {
                expect(ledger.hasFailed('reparent', 'failed123', 'to456')).toBe(true);
            });

            it('should return false for committed operations', () => {
                expect(ledger.hasFailed('reparent', 'committed123', 'to456')).toBe(false);
            });
        });
    });

    describe('getEntries', () => {
        beforeEach(() => {
            ledger.recordPending('reparent', 'p1', 't1');
            ledger.recordPending('reparent', 'c1', 't1');
            ledger.recordCommitted('reparent', 'c1', 't1');
            ledger.recordPending('delete', 'f1');
            ledger.recordFailed('delete', 'f1', null, new Error('fail'));
        });

        it('should return all entries when status is "all"', () => {
            const entries = ledger.getEntries('all');
            expect(entries.length).toBe(3);
        });

        it('should return all entries when status is not specified', () => {
            const entries = ledger.getEntries();
            expect(entries.length).toBe(3);
        });

        it('should filter by pending status', () => {
            const entries = ledger.getEntries('pending');
            expect(entries.length).toBe(1);
            expect(entries[0].status).toBe('pending');
        });

        it('should filter by committed status', () => {
            const entries = ledger.getEntries('committed');
            expect(entries.length).toBe(1);
            expect(entries[0].status).toBe('committed');
        });

        it('should filter by failed status', () => {
            const entries = ledger.getEntries('failed');
            expect(entries.length).toBe(1);
            expect(entries[0].status).toBe('failed');
        });
    });

    describe('getSummary', () => {
        beforeEach(() => {
            // 2 reparent operations (1 committed, 1 pending)
            ledger.recordPending('reparent', 'p1', 't1');
            ledger.recordPending('reparent', 'c1', 't1');
            ledger.recordCommitted('reparent', 'c1', 't1');

            // 1 delete operation (failed)
            ledger.recordPending('delete', 'f1');
            ledger.recordFailed('delete', 'f1', null, new Error('fail'));
        });

        it('should return total count', () => {
            const summary = ledger.getSummary();
            expect(summary.total).toBe(3);
        });

        it('should return counts by status', () => {
            const summary = ledger.getSummary();
            expect(summary.pending).toBe(1);
            expect(summary.committed).toBe(1);
            expect(summary.failed).toBe(1);
        });

        it('should group by operation', () => {
            const summary = ledger.getSummary();
            expect(summary.byOperation.reparent.total).toBe(2);
            expect(summary.byOperation.reparent.committed).toBe(1);
            expect(summary.byOperation.reparent.pending).toBe(1);
            expect(summary.byOperation.delete.total).toBe(1);
            expect(summary.byOperation.delete.failed).toBe(1);
        });
    });

    describe('exportCSV', () => {
        it('should export entries to CSV format', () => {
            ledger.recordPending('reparent', 'from1', 'to1');
            ledger.recordCommitted('reparent', 'from1', 'to1');

            const outputPath = '/tmp/ledger.csv';
            ledger.exportCSV(outputPath);

            expect(fs.writeFileSync).toHaveBeenCalledWith(
                outputPath,
                expect.stringContaining('key,operation,fromId,toId,status')
            );
        });

        it('should handle empty ledger', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            ledger.exportCSV('/tmp/empty.csv');
            expect(consoleSpy).toHaveBeenCalledWith('No entries to export');
            consoleSpy.mockRestore();
        });
    });

    describe('clear', () => {
        it('should clear all entries', () => {
            ledger.recordPending('reparent', 'from1', 'to1');
            ledger.recordCommitted('reparent', 'from1', 'to1');

            expect(Object.keys(ledger.entries).length).toBe(1);

            ledger.clear();

            expect(Object.keys(ledger.entries).length).toBe(0);
        });

        it('should save empty ledger to disk', () => {
            ledger.recordPending('reparent', 'from1', 'to1');
            fs.writeFileSync.mockClear();

            ledger.clear();

            expect(fs.writeFileSync).toHaveBeenCalled();
        });
    });

    describe('persistence', () => {
        it('should save ledger with correct structure', () => {
            ledger.recordPending('reparent', 'from1', 'to1');

            const savedData = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
            expect(savedData.prefix).toBe(testPrefix);
            expect(savedData.lastUpdated).toBeDefined();
            expect(savedData.entries).toBeDefined();
        });

        it('should load ledger from disk on construction', () => {
            const existingLedger = {
                prefix: testPrefix,
                entries: {
                    'key1': { key: 'key1', status: 'committed' }
                }
            };

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(existingLedger));

            const loadedLedger = new DedupLedger(testPrefix);
            expect(loadedLedger.entries['key1']).toBeDefined();
        });
    });
});
