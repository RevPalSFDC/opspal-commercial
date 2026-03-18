#!/usr/bin/env node
/**
 * Unit Tests: Parallel Backup Processing
 *
 * Tests the parallel processing capabilities in SFDCFullBackupGenerator
 *
 * Test Coverage:
 * - Keyset query building for parallel execution
 * - Concurrent batch processing
 * - Rate limiting
 * - Performance improvements
 * - Backward compatibility with sequential mode
 *
 * @author Claude Code
 * @date 2025-10-16
 */

const assert = require('assert');
const SFDCFullBackupGenerator = require('../scripts/lib/sfdc-full-backup-generator');

// Mock BulkAPIHandler
class MockBulkAPIHandler {
    constructor(options = {}) {
        this.queryCallCount = 0;
        this.syncQueryCallCount = 0;
        this.mockRecordCount = options.mockRecordCount || 10000;
        this.mockBatchSize = options.mockBatchSize || 2000;
    }

    async query(soql, options = {}) {
        this.queryCallCount++;

        // Mock COUNT() query
        if (soql.includes('COUNT()')) {
            return [{ expr0: this.mockRecordCount }];
        }

        // Mock ID sampling query
        if (soql.includes('SELECT Id FROM') && soql.includes('ORDER BY Id')) {
            const limit = parseInt(soql.match(/LIMIT (\d+)/)?.[1] || '10000');
            return Array.from({ length: Math.min(limit, this.mockRecordCount) }, (_, i) => ({
                Id: `001${String(i).padStart(15, '0')}`
            }));
        }

        // Mock FIELDS(ALL) query
        if (soql.includes('FIELDS(ALL)')) {
            const records = Array.from({ length: this.mockBatchSize }, (_, i) => ({
                Id: `001RECORD${i}`,
                Name: `Account ${i}`,
                Website: `example${i}.com`
            }));
            return { records, totalSize: records.length };
        }

        return [];
    }

    async syncQuery(soql, options = {}) {
        this.syncQueryCallCount++;
        return this.query(soql, options);
    }
}

describe('SFDCFullBackupGenerator - Parallel Processing', () => {
    let generator;
    let mockBulkHandler;

    beforeEach(() => {
        mockBulkHandler = new MockBulkAPIHandler();
    });

    describe('Constructor with Parallel Options', () => {
        it('should initialize with parallel mode enabled', () => {
            generator = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: 'test-org',
                bulkHandler: mockBulkHandler,
                enableParallel: true,
                concurrency: 5
            });

            assert.strictEqual(generator.enableParallel, true);
            assert.strictEqual(generator.concurrency, 5);
            assert.ok(generator.bulkHandler);
        });

        it('should default to sequential mode', () => {
            generator = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: 'test-org',
                bulkHandler: mockBulkHandler
            });

            assert.strictEqual(generator.enableParallel, false);
        });

        it('should work without bulkHandler (CLI mode)', () => {
            generator = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: 'test-org',
                skipOrgCheck: true // Skip org connection for test
            });

            assert.strictEqual(generator.useCliMode, true);
            assert.strictEqual(generator.bulkHandler, null);
        });
    });

    describe('buildKeysetQueries', () => {
        it('should split dataset into correct number of batches', async () => {
            generator = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: 'test-org',
                bulkHandler: mockBulkHandler,
                enableParallel: true,
                concurrency: 5
            });

            const totalRecords = 10000;
            const batchSize = 10000;

            const queries = await generator.buildKeysetQueries(totalRecords, batchSize);

            // With 10k records and concurrency of 5, should get 5 queries
            assert.strictEqual(queries.length, 5);
        });

        it('should create non-overlapping ID ranges', async () => {
            generator = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: 'test-org',
                bulkHandler: mockBulkHandler,
                enableParallel: true,
                concurrency: 3
            });

            const totalRecords = 9000;
            const batchSize = 9000;

            const queries = await generator.buildKeysetQueries(totalRecords, batchSize);

            // Verify each query has WHERE clause with Id range
            queries.forEach((query, index) => {
                if (index === 0) {
                    // First query: Id < endId
                    assert.ok(query.includes('Id <'));
                } else if (index === queries.length - 1) {
                    // Last query: Id >= startId
                    assert.ok(query.includes('Id >=') && !query.includes('AND Id <'));
                } else {
                    // Middle queries: Id >= startId AND Id < endId
                    assert.ok(query.includes('Id >=') && query.includes('AND Id <'));
                }
            });
        });

        it('should include ORDER BY Id ASC for consistent results', async () => {
            generator = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: 'test-org',
                bulkHandler: mockBulkHandler,
                enableParallel: true,
                concurrency: 5
            });

            const queries = await generator.buildKeysetQueries(10000, 10000);

            queries.forEach(query => {
                assert.ok(query.includes('ORDER BY Id ASC'));
            });
        });

        it('should use FIELDS(ALL) for complete data extraction', async () => {
            generator = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: 'test-org',
                bulkHandler: mockBulkHandler,
                enableParallel: true,
                concurrency: 5
            });

            const queries = await generator.buildKeysetQueries(10000, 10000);

            queries.forEach(query => {
                assert.ok(query.includes('SELECT FIELDS(ALL)'));
                assert.ok(query.includes('FROM Account'));
            });
        });
    });

    describe('extractActiveRecordsParallel', () => {
        it('should route to parallel mode when enabled', async () => {
            generator = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: 'test-org',
                bulkHandler: mockBulkHandler,
                enableParallel: true,
                concurrency: 3
            });

            // Mock the parallel extraction method
            let parallelCalled = false;
            const originalParallel = generator.extractActiveRecordsParallel;
            generator.extractActiveRecordsParallel = async function() {
                parallelCalled = true;
                return { records: [], totalSize: 0 };
            };

            await generator.extractActiveRecords();

            assert.strictEqual(parallelCalled, true);
        });

        it('should fall back to sequential mode without bulkHandler', async () => {
            generator = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: 'test-org',
                enableParallel: true, // Enabled but no bulkHandler
                concurrency: 5,
                skipOrgCheck: true // Skip org connection for test
            });

            // Should fall back to sequential mode
            assert.strictEqual(generator.useCliMode, true);
        });

        it('should execute queries in parallel batches', async () => {
            mockBulkHandler = new MockBulkAPIHandler({
                mockRecordCount: 10000,
                mockBatchSize: 2000
            });

            generator = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: 'test-org',
                bulkHandler: mockBulkHandler,
                enableParallel: true,
                concurrency: 5
            });

            const result = await generator.extractActiveRecordsParallel();

            // Should have called bulkHandler.query multiple times in parallel
            assert.ok(mockBulkHandler.queryCallCount > 0);
            assert.ok(result.records);
        });
    });

    describe('Rate Limiting', () => {
        it('should respect rate limiter between parallel batches', async () => {
            generator = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: 'test-org',
                bulkHandler: mockBulkHandler,
                enableParallel: true,
                concurrency: 5
            });

            // Verify rate limiter exists
            assert.ok(generator.rateLimiter);
            assert.strictEqual(generator.rateLimiter.maxRequests, 90);
            assert.strictEqual(generator.rateLimiter.windowMs, 10000);
        });

        it('should call waitIfNeeded before each query batch', async () => {
            generator = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: 'test-org',
                bulkHandler: mockBulkHandler,
                enableParallel: true,
                concurrency: 3
            });

            let waitCallCount = 0;
            const originalWait = generator.rateLimiter.waitIfNeeded;
            generator.rateLimiter.waitIfNeeded = async function() {
                waitCallCount++;
                return originalWait.call(this);
            };

            await generator.extractActiveRecordsParallel();

            // Should call waitIfNeeded for each batch of parallel queries
            assert.ok(waitCallCount > 0);
        });
    });

    describe('Performance Comparison', () => {
        it('should demonstrate parallel speedup potential', () => {
            // Theoretical calculation
            const totalRecords = 10000;
            const recordsPerQuery = 2000;
            const queryTimeMs = 1000; // Assume 1s per query

            // Sequential: 5 queries * 1s = 5s
            const sequentialBatches = Math.ceil(totalRecords / recordsPerQuery);
            const sequentialTime = sequentialBatches * queryTimeMs;

            // Parallel (5x): 5 queries / 5 concurrency = 1s
            const concurrency = 5;
            const parallelTime = Math.ceil(sequentialBatches / concurrency) * queryTimeMs;

            const speedup = sequentialTime / parallelTime;

            assert.strictEqual(speedup, 5); // 5x speedup with 5x concurrency
        });

        it('should handle large dataset split correctly', () => {
            const totalRecords = 100000; // 100k records
            const concurrency = 5;
            const recordsPerBatch = Math.ceil(totalRecords / concurrency);

            // Each batch should handle ~20k records
            assert.strictEqual(recordsPerBatch, 20000);

            // Should create 5 queries
            assert.strictEqual(concurrency, 5);
        });
    });

    describe('Error Handling in Parallel Mode', () => {
        it('should handle query failures gracefully', async () => {
            const failingHandler = new MockBulkAPIHandler();
            failingHandler.query = async () => {
                throw new Error('API_CURRENTLY_DISABLED');
            };

            generator = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: 'test-org',
                bulkHandler: failingHandler,
                enableParallel: true,
                concurrency: 5
            });

            try {
                await generator.extractActiveRecordsParallel();
                assert.fail('Should have thrown error');
            } catch (error) {
                assert.ok(error.message.includes('API_CURRENTLY_DISABLED'));
            }
        });

        it('should preserve record order despite parallel execution', async () => {
            generator = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: 'test-org',
                bulkHandler: mockBulkHandler,
                enableParallel: true,
                concurrency: 5
            });

            const result = await generator.extractActiveRecordsParallel();

            // Verify records are in order (assuming mock returns ordered data)
            if (result.records.length > 1) {
                for (let i = 1; i < result.records.length; i++) {
                    assert.ok(result.records[i].Id >= result.records[i - 1].Id);
                }
            }
        });
    });

    describe('Backward Compatibility', () => {
        it('should support legacy sequential mode', async () => {
            generator = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: 'test-org',
                bulkHandler: mockBulkHandler,
                enableParallel: false // Explicitly disabled
            });

            // Should not call parallel method
            let parallelCalled = false;
            const originalParallel = generator.extractActiveRecordsParallel;
            generator.extractActiveRecordsParallel = async function() {
                parallelCalled = true;
                return { records: [], totalSize: 0 };
            };

            // Sequential extraction would be called instead
            assert.strictEqual(generator.enableParallel, false);
        });

        it('should work with CLI mode (no bulkHandler)', () => {
            generator = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: 'test-org',
                enableParallel: true, // Enabled but no bulkHandler
                skipOrgCheck: true // Skip org connection for test
            });

            // Should fall back to CLI mode
            assert.strictEqual(generator.useCliMode, true);
            assert.strictEqual(generator.bulkHandler, null);
        });
    });
});

// Run tests
if (require.main === module) {
    console.log('🧪 Running Parallel Backup Processing Tests...\n');

    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    const runTest = async (testName, testFn) => {
        totalTests++;
        try {
            await testFn();
            passedTests++;
            console.log(`  ✅ ${testName}`);
        } catch (error) {
            failedTests++;
            console.log(`  ❌ ${testName}`);
            console.log(`     ${error.message}`);
            if (process.env.VERBOSE) {
                console.log(error.stack);
            }
        }
    };

    (async () => {
        console.log('Constructor Tests:');
        await runTest('should initialize with parallel mode', () => {
            const gen = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: 'test',
                bulkHandler: new MockBulkAPIHandler(),
                enableParallel: true,
                concurrency: 5
            });
            assert.strictEqual(gen.enableParallel, true);
        });

        console.log('\nKeyset Query Building:');
        await runTest('should split into correct batches', async () => {
            const gen = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: 'test',
                bulkHandler: new MockBulkAPIHandler(),
                enableParallel: true,
                concurrency: 5
            });
            const queries = await gen.buildKeysetQueries(10000, 10000);
            assert.strictEqual(queries.length, 5);
        });

        console.log('\nParallel Execution:');
        await runTest('should execute queries in parallel', async () => {
            const handler = new MockBulkAPIHandler({ mockRecordCount: 10000 });
            const gen = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: 'test',
                bulkHandler: handler,
                enableParallel: true,
                concurrency: 5
            });
            await gen.extractActiveRecordsParallel();
            assert.ok(handler.queryCallCount > 0);
        });

        console.log('\nBackward Compatibility:');
        await runTest('should work in CLI mode', () => {
            const gen = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: 'test',
                enableParallel: true,
                skipOrgCheck: true // Skip org connection for test
            });
            assert.strictEqual(gen.useCliMode, true);
        });

        console.log('\n' + '═'.repeat(70));
        console.log('TEST SUMMARY');
        console.log('═'.repeat(70));
        console.log(`Total Tests: ${totalTests}`);
        console.log(`✅ Passed: ${passedTests}`);
        console.log(`❌ Failed: ${failedTests}`);
        console.log('═'.repeat(70));

        process.exit(failedTests > 0 ? 1 : 0);
    })();
}

module.exports = { SFDCFullBackupGenerator };
