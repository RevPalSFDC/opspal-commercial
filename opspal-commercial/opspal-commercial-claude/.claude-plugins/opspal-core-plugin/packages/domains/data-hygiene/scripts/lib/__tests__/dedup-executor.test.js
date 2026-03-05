/**
 * Tests for DedupExecutor - Executes deduplication by reparenting and deleting
 *
 * The executor handles the actual modification operations:
 * - Reparenting contacts and deals from duplicates to canonical
 * - Deleting duplicate companies
 * - Rate limiting for API compliance
 * - Idempotency tracking
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

// Mock dependencies
jest.mock('fs');
jest.mock('https');
jest.mock('../dedup-ledger');
jest.mock('../dedup-association-verifier');

const DedupExecutor = require('../dedup-executor');
const DedupLedger = require('../dedup-ledger');
const AssociationVerifier = require('../dedup-association-verifier');

describe('DedupExecutor', () => {
    let executor;
    let mockLedger;
    let mockVerifier;

    const mockCanonicalMap = [
        {
            bundleId: 'bundle-1',
            bundleType: 'bundleA',
            clusterKey: 'sf001',
            canonical: {
                companyId: '100',
                companyName: 'Canonical Corp',
                salesforceAccountId: 'sf001',
                num_contacts: 5,
                num_deals: 2
            },
            duplicateCount: 2,
            duplicates: [
                { companyId: '101', companyName: 'Dup 1', num_contacts: 3, num_deals: 1 },
                { companyId: '102', companyName: 'Dup 2', num_contacts: 2, num_deals: 0 }
            ]
        },
        {
            bundleId: 'bundle-2',
            bundleType: 'bundleB',
            clusterKey: 'example.com',
            canonical: {
                companyId: '200',
                companyName: 'Example Inc',
                num_contacts: 10,
                num_deals: 5
            },
            duplicateCount: 1,
            duplicates: [
                { companyId: '201', companyName: 'Example Duplicate', num_contacts: 5, num_deals: 2 }
            ]
        }
    ];

    const mockConfig = {
        hubspot: {
            accessToken: 'test-token',
            portalId: '12345'
        },
        salesforce: {
            orgAlias: 'test-org'
        },
        execution: {
            dryRun: true,
            batchSize: 100,
            maxWritePerMin: 60,
            idempotencyPrefix: 'test-dedupe'
        },
        output: {
            outputDir: './test-reports'
        },
        verification: {
            verifyPrimaryAfterReparent: false // Disable for simpler tests
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock ledger
        mockLedger = {
            prefix: 'test-dedupe',
            ledgerPath: '/tmp/ledger.json',
            hasCommitted: jest.fn().mockReturnValue(false),
            recordPending: jest.fn(),
            recordCommitted: jest.fn(),
            recordFailed: jest.fn(),
            getSummary: jest.fn().mockReturnValue({ total: 0, pending: 0, committed: 0, failed: 0 })
        };
        DedupLedger.mockImplementation(() => mockLedger);

        // Mock verifier
        mockVerifier = {
            verifyAndRepairBatch: jest.fn().mockResolvedValue([])
        };
        AssociationVerifier.mockImplementation(() => mockVerifier);

        // Mock fs
        fs.existsSync.mockReturnValue(true);
        fs.mkdirSync.mockImplementation(() => {});
        fs.writeFileSync.mockImplementation(() => {});

        // Mock https
        https.request.mockImplementation((options, callback) => {
            const mockRes = {
                statusCode: 200,
                on: jest.fn((event, handler) => {
                    if (event === 'data') {
                        handler(JSON.stringify({ results: {} }));
                    }
                    if (event === 'end') {
                        handler();
                    }
                    return mockRes;
                })
            };
            callback(mockRes);
            return {
                on: jest.fn(),
                write: jest.fn(),
                end: jest.fn()
            };
        });

        // Silence console output during tests
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
        jest.spyOn(console, 'warn').mockImplementation();

        executor = new DedupExecutor(mockCanonicalMap, mockConfig);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with canonical map and config', () => {
            expect(executor.canonicalMap).toEqual(mockCanonicalMap);
            expect(executor.dryRun).toBe(true);
            expect(executor.batchSize).toBe(100);
        });

        it('should default to dry run mode for safety', () => {
            const configNoDryRun = { ...mockConfig, execution: {} };
            const safeExecutor = new DedupExecutor(mockCanonicalMap, configNoDryRun);
            expect(safeExecutor.dryRun).toBe(true);
        });

        it('should initialize statistics', () => {
            expect(executor.stats.bundlesProcessed).toBe(0);
            expect(executor.stats.contactsReparented).toBe(0);
            expect(executor.stats.dealsReparented).toBe(0);
            expect(executor.stats.companiesDeleted).toBe(0);
            expect(executor.stats.errors).toEqual([]);
        });

        it('should initialize rate limiting', () => {
            expect(executor.requestCount).toBe(0);
            expect(executor.requestWindowStart).toBeDefined();
        });
    });

    describe('execute', () => {
        it('should process all bundles in dry run mode', async () => {
            const result = await executor.execute();

            expect(result.bundlesProcessed).toBe(2);
            expect(mockLedger.recordPending).not.toHaveBeenCalled(); // Dry run
        });

        it('should save execution report', async () => {
            await executor.execute();

            expect(fs.writeFileSync).toHaveBeenCalled();
            const writeCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].includes('execution-report')
            );
            expect(writeCall).toBeDefined();
        });

        it('should handle execution errors gracefully', async () => {
            // Force live mode and simulate API failure
            executor.dryRun = false;

            // Make getCompanyAssociations throw synchronously
            https.request.mockImplementation(() => {
                throw new Error('API Error');
            });

            // Executor catches errors and records them instead of rejecting
            // This is resilient production behavior
            const result = await executor.execute();

            // Should record errors in stats
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0].error).toBe('API Error');
        }, 10000); // Increase timeout for async error handling
    });

    describe('processBundleA', () => {
        const bundleA = mockCanonicalMap[0];

        it('should handle SF-anchored bundles in dry run', async () => {
            await executor.processBundleA(bundleA);

            // In dry run, no actual operations
            expect(mockLedger.recordPending).not.toHaveBeenCalled();
        });

        it('should check if SF Account already attached', async () => {
            const bundleWithMatch = {
                ...bundleA,
                canonical: {
                    ...bundleA.canonical,
                    salesforceAccountId: 'sf001' // Matches clusterKey
                }
            };

            await executor.processBundleA(bundleWithMatch);

            // Should skip attachment since already attached
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('already attached')
            );
        });
    });

    describe('processBundleB', () => {
        const bundleB = mockCanonicalMap[1];

        it('should handle HS-only bundles in dry run', async () => {
            await executor.processBundleB(bundleB);

            // In dry run, no actual operations
            expect(mockLedger.recordPending).not.toHaveBeenCalled();
        });
    });

    describe('reparentAssociations', () => {
        const duplicate = { companyId: '101', companyName: 'Dup', num_contacts: 3, num_deals: 1 };
        const canonical = { companyId: '100', companyName: 'Main' };

        it('should skip if already reparented (from ledger)', async () => {
            mockLedger.hasCommitted.mockReturnValue(true);

            await executor.reparentAssociations(duplicate, canonical);

            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('Already reparented')
            );
        });

        it('should log in dry run mode without making API calls', async () => {
            await executor.reparentAssociations(duplicate, canonical);

            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('DRY RUN')
            );
        });
    });

    describe('deleteHubSpotCompany', () => {
        const company = { companyId: '101', companyName: 'To Delete' };

        it('should skip if already deleted (from ledger)', async () => {
            mockLedger.hasCommitted.mockReturnValue(true);

            await executor.deleteHubSpotCompany(company);

            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('Already deleted')
            );
        });

        it('should log in dry run mode', async () => {
            await executor.deleteHubSpotCompany(company);

            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('DRY RUN')
            );
        });
    });

    describe('getCompanyAssociations', () => {
        it('should parse association response correctly', async () => {
            executor.dryRun = false;

            const mockResponse = {
                results: {
                    '100': {
                        contacts: [{ toObjectId: 'c1' }, { toObjectId: 'c2' }],
                        deals: [{ toObjectId: 'd1' }]
                    }
                }
            };

            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler(JSON.stringify(mockResponse));
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
            });

            const associations = await executor.getCompanyAssociations('100');

            expect(associations.contacts).toEqual(['c1', 'c2']);
            expect(associations.deals).toEqual(['d1']);
        });

        it('should return empty arrays for 404', async () => {
            executor.dryRun = false;

            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 404,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler('');
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
            });

            const associations = await executor.getCompanyAssociations('nonexistent');

            expect(associations.contacts).toEqual([]);
            expect(associations.deals).toEqual([]);
        });
    });

    describe('enforceRateLimit', () => {
        it('should reset window after 60 seconds', async () => {
            executor.requestCount = 50;
            executor.requestWindowStart = Date.now() - 70000; // 70 seconds ago

            await executor.enforceRateLimit();

            expect(executor.requestCount).toBe(1);
        });

        it('should wait when rate limit reached', async () => {
            executor.requestCount = 60;
            executor.maxRequestsPerMin = 60;
            executor.requestWindowStart = Date.now() - 30000; // 30 seconds ago

            const sleepSpy = jest.spyOn(executor, 'sleep').mockResolvedValue();

            await executor.enforceRateLimit();

            expect(sleepSpy).toHaveBeenCalled();
        });
    });

    describe('timestamp', () => {
        it('should generate timestamp in expected format', () => {
            const ts = executor.timestamp();
            expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/);
        });
    });

    describe('printSummary', () => {
        it('should print execution statistics', () => {
            executor.stats = {
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                bundlesProcessed: 2,
                contactsReparented: 10,
                dealsReparented: 5,
                companiesDeleted: 3,
                primaryAssociationsVerified: 10,
                primaryAssociationsRepaired: 2,
                primaryRepairFailures: 0,
                errors: []
            };

            executor.printSummary();

            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Bundles Processed: 2'));
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Contacts Reparented: 10'));
        });

        it('should display errors if present', () => {
            executor.stats = {
                startedAt: new Date().toISOString(),
                bundlesProcessed: 1,
                contactsReparented: 0,
                dealsReparented: 0,
                companiesDeleted: 0,
                primaryAssociationsVerified: 0,
                primaryAssociationsRepaired: 0,
                primaryRepairFailures: 0,
                errors: [
                    { operation: 'delete', companyId: '123', error: 'API Error' }
                ]
            };

            executor.printSummary();

            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Errors: 1'));
        });
    });

    describe('saveExecutionReport', () => {
        it('should save report with config and ledger summary', () => {
            executor.stats = {
                startedAt: new Date().toISOString(),
                bundlesProcessed: 2,
                contactsReparented: 10,
                dealsReparented: 5,
                companiesDeleted: 3,
                errors: []
            };

            executor.saveExecutionReport();

            expect(fs.writeFileSync).toHaveBeenCalled();
            const [filePath, content] = fs.writeFileSync.mock.calls[0];
            expect(filePath).toContain('execution-report');

            const saved = JSON.parse(content);
            expect(saved.config.dryRun).toBe(true);
            expect(saved.ledgerSummary).toBeDefined();
        });
    });

    describe('live execution mode', () => {
        beforeEach(() => {
            executor.dryRun = false;

            // Mock successful API responses
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: options.method === 'DELETE' ? 204 : 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler(JSON.stringify({ results: {} }));
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
            });
        });

        it('should record pending operations', async () => {
            const duplicate = { companyId: '101', companyName: 'Dup', num_contacts: 0, num_deals: 0 };
            const canonical = { companyId: '100', companyName: 'Main' };

            await executor.reparentAssociations(duplicate, canonical);

            expect(mockLedger.recordPending).toHaveBeenCalledWith(
                'reparent', '101', '100'
            );
        });

        it('should record committed operations on success', async () => {
            const duplicate = { companyId: '101', companyName: 'Dup', num_contacts: 0, num_deals: 0 };
            const canonical = { companyId: '100', companyName: 'Main' };

            await executor.reparentAssociations(duplicate, canonical);

            expect(mockLedger.recordCommitted).toHaveBeenCalled();
        });
    });
});
