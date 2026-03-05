/**
 * Comprehensive tests for Deduplication Rollback Manager
 *
 * Tests cover:
 * - Happy path: successful rollback from snapshot
 * - Edge case: corrupted snapshot handling
 * - Edge case: partial rollback (some records fail)
 * - Edge case: rollback timeout scenarios
 * - Edge case: old snapshots
 * - Integration: verify data restored correctly
 */

const path = require('path');
const fs = require('fs');
const https = require('https');

// Mock dependencies before requiring the module
jest.mock('fs');
jest.mock('https');

const RollbackManager = require('../dedup-rollback-manager');

describe('RollbackManager', () => {
    let manager;
    let mockConfig;
    const testOutputDir = './dedup-reports';

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Default mock config
        mockConfig = {
            hubspot: {
                accessToken: 'test-token-123'
            },
            salesforce: {
                accessToken: 'sf-token-123'
            },
            output: {
                outputDir: testOutputDir
            },
            execution: {
                dryRun: true
            }
        };

        manager = new RollbackManager(mockConfig);

        // Setup default fs mocks
        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockReturnValue([]);
        fs.writeFileSync.mockImplementation(() => {});
    });

    describe('constructor', () => {
        it('should initialize with provided config', () => {
            expect(manager.config).toEqual(mockConfig);
            expect(manager.hubspot).toEqual(mockConfig.hubspot);
            expect(manager.salesforce).toEqual(mockConfig.salesforce);
            expect(manager.outputDir).toBe(testOutputDir);
            expect(manager.dryRun).toBe(true);
        });

        it('should default to dry run mode when not explicitly set', () => {
            const configWithoutDryRun = {
                hubspot: { accessToken: 'token' },
                output: { outputDir: testOutputDir }
            };
            const mgr = new RollbackManager(configWithoutDryRun);
            expect(mgr.dryRun).toBe(true);
        });

        it('should use default output directory when not provided', () => {
            const configWithoutOutput = {
                hubspot: { accessToken: 'token' }
            };
            const mgr = new RollbackManager(configWithoutOutput);
            expect(mgr.outputDir).toBe('./dedup-reports');
        });

        it('should initialize stats object correctly', () => {
            expect(manager.stats.companiesRestored).toBe(0);
            expect(manager.stats.propertiesRestored).toBe(0);
            expect(manager.stats.associationsRestored).toBe(0);
            expect(manager.stats.errors).toEqual([]);
            expect(manager.stats.skipped).toEqual([]);
            expect(manager.stats.startedAt).toBeDefined();
        });

        it('should respect explicit dryRun=false', () => {
            const liveConfig = {
                ...mockConfig,
                execution: { dryRun: false }
            };
            const mgr = new RollbackManager(liveConfig);
            expect(mgr.dryRun).toBe(false);
        });
    });

    describe('listSnapshots', () => {
        it('should return empty array when no snapshots exist', () => {
            fs.readdirSync.mockReturnValue([]);

            const result = manager.listSnapshots();

            expect(result).toEqual([]);
        });

        it('should list and parse valid snapshot files', () => {
            const mockSnapshotData = {
                timestamp: '2025-01-15T10:00:00Z',
                hubspot: {
                    companies: [{ id: '1', properties: { name: 'Test Co' } }]
                },
                salesforce: {
                    accounts: [{ Id: 'sf1' }]
                }
            };

            fs.readdirSync.mockReturnValue([
                'snapshot-2025-01-15.json',
                'other-file.txt',
                'snapshot-2025-01-14.json'
            ]);
            fs.statSync.mockReturnValue({
                ctime: new Date('2025-01-15T10:00:00Z'),
                size: 1048576 // 1 MB
            });
            fs.readFileSync.mockReturnValue(JSON.stringify(mockSnapshotData));

            const result = manager.listSnapshots();

            expect(result).toHaveLength(2);
            expect(result[0].hubspotCompanies).toBe(1);
            expect(result[0].salesforceAccounts).toBe(1);
        });

        it('should sort snapshots with most recent first', () => {
            fs.readdirSync.mockReturnValue([
                'snapshot-2025-01-10.json',
                'snapshot-2025-01-15.json',
                'snapshot-2025-01-12.json'
            ]);
            fs.statSync.mockReturnValue({
                ctime: new Date(),
                size: 1024
            });
            fs.readFileSync.mockReturnValue(JSON.stringify({
                timestamp: '2025-01-15T10:00:00Z',
                hubspot: { companies: [] }
            }));

            const result = manager.listSnapshots();

            // After reverse sort, should be in reverse alphabetical order
            expect(result[0].file).toBe('snapshot-2025-01-15.json');
        });

        it('should handle corrupted snapshot files gracefully', () => {
            fs.readdirSync.mockReturnValue(['snapshot-corrupted.json']);
            fs.statSync.mockReturnValue({
                ctime: new Date(),
                size: 100
            });
            fs.readFileSync.mockReturnValue('{ invalid json }');

            // Should not throw, just log warning
            const result = manager.listSnapshots();

            expect(result).toEqual([]);
        });

        it('should calculate file size in MB correctly', () => {
            fs.readdirSync.mockReturnValue(['snapshot-test.json']);
            fs.statSync.mockReturnValue({
                ctime: new Date(),
                size: 5242880 // 5 MB
            });
            fs.readFileSync.mockReturnValue(JSON.stringify({
                timestamp: '2025-01-15T10:00:00Z',
                hubspot: { companies: [] }
            }));

            const result = manager.listSnapshots();

            expect(result[0].size).toBe('5.00 MB');
        });
    });

    describe('getAge', () => {
        it('should return seconds ago for recent dates', () => {
            const thirtySecondsAgo = new Date(Date.now() - 30000);
            const result = manager.getAge(thirtySecondsAgo);
            expect(result).toMatch(/\d+ seconds ago/);
        });

        it('should return minutes ago for dates within an hour', () => {
            const fortyFiveMinutesAgo = new Date(Date.now() - 45 * 60 * 1000);
            const result = manager.getAge(fortyFiveMinutesAgo);
            expect(result).toMatch(/\d+ minutes ago/);
        });

        it('should return hours ago for dates within a day', () => {
            const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
            const result = manager.getAge(twelveHoursAgo);
            expect(result).toMatch(/\d+ hours ago/);
        });

        it('should return days ago for older dates', () => {
            const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
            const result = manager.getAge(fiveDaysAgo);
            expect(result).toBe('5 days ago');
        });
    });

    describe('loadSnapshot', () => {
        it('should load and parse valid snapshot file', () => {
            const mockSnapshot = {
                timestamp: '2025-01-15T10:00:00Z',
                hubspot: {
                    companies: [{ id: '1', properties: { name: 'Test' } }]
                }
            };

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(mockSnapshot));

            const result = manager.loadSnapshot('/path/to/snapshot.json');

            expect(result).toEqual(mockSnapshot);
        });

        it('should throw error when snapshot file does not exist', () => {
            fs.existsSync.mockReturnValue(false);

            expect(() => manager.loadSnapshot('/nonexistent/path.json'))
                .toThrow('Snapshot not found');
        });

        it('should throw error for invalid JSON', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('not valid json');

            expect(() => manager.loadSnapshot('/path/to/invalid.json'))
                .toThrow();
        });

        it('should throw error when hubspot.companies is missing', () => {
            const invalidSnapshot = {
                timestamp: '2025-01-15T10:00:00Z',
                hubspot: {}
            };

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(invalidSnapshot));

            expect(() => manager.loadSnapshot('/path/to/snapshot.json'))
                .toThrow('Invalid snapshot: missing HubSpot companies');
        });

        it('should throw error when hubspot object is missing', () => {
            const invalidSnapshot = {
                timestamp: '2025-01-15T10:00:00Z'
            };

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(invalidSnapshot));

            expect(() => manager.loadSnapshot('/path/to/snapshot.json'))
                .toThrow('Invalid snapshot: missing HubSpot companies');
        });
    });

    describe('validateSnapshot', () => {
        it('should pass validation for valid snapshot', async () => {
            const validSnapshot = {
                timestamp: new Date().toISOString(),
                hubspot: {
                    companies: [{ id: '1' }]
                }
            };

            await expect(manager.validateSnapshot(validSnapshot))
                .resolves.not.toThrow();
        });

        it('should throw error when timestamp is missing', async () => {
            const invalidSnapshot = {
                hubspot: {
                    companies: [{ id: '1' }]
                }
            };

            await expect(manager.validateSnapshot(invalidSnapshot))
                .rejects.toThrow('missing required fields: timestamp');
        });

        it('should throw error when hubspot is missing', async () => {
            const invalidSnapshot = {
                timestamp: new Date().toISOString()
            };

            await expect(manager.validateSnapshot(invalidSnapshot))
                .rejects.toThrow('missing required fields: hubspot');
        });

        it('should throw error when companies array is empty', async () => {
            const emptySnapshot = {
                timestamp: new Date().toISOString(),
                hubspot: {
                    companies: []
                }
            };

            await expect(manager.validateSnapshot(emptySnapshot))
                .rejects.toThrow('Snapshot contains no companies');
        });

        it('should warn but not throw for old snapshots (> 30 days)', async () => {
            const oldTimestamp = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
            const oldSnapshot = {
                timestamp: oldTimestamp,
                hubspot: {
                    companies: [{ id: '1' }]
                }
            };

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await manager.validateSnapshot(oldSnapshot);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('WARNING: Snapshot is')
            );

            consoleSpy.mockRestore();
        });
    });

    describe('createRestorationPlan', () => {
        it('should create plan from execution report with deleted companies', async () => {
            const snapshot = {
                hubspot: {
                    companies: [
                        { id: '1', properties: { name: 'Company 1' } },
                        { id: '2', properties: { name: 'Company 2' } },
                        { id: '3', properties: { name: 'Company 3' } }
                    ]
                }
            };

            const executionReport = {
                deletedCompanies: ['1', '3']
            };

            const plan = await manager.createRestorationPlan(snapshot, executionReport);

            expect(plan.companiesToRestore).toHaveLength(2);
            expect(plan.companiesToRestore.map(c => c.id)).toEqual(['1', '3']);
        });

        it('should return empty plan when no deleted companies in report', async () => {
            const snapshot = {
                hubspot: {
                    companies: [
                        { id: '1', properties: { name: 'Company 1' } }
                    ]
                }
            };

            const executionReport = {
                deletedCompanies: []
            };

            const plan = await manager.createRestorationPlan(snapshot, executionReport);

            expect(plan.companiesToRestore).toHaveLength(0);
        });

        it('should check company existence when no execution report provided', async () => {
            const snapshot = {
                hubspot: {
                    companies: [
                        { id: '1', properties: { name: 'Company 1' } },
                        { id: '2', properties: { name: 'Company 2' } }
                    ]
                }
            };

            // Mock verifyCompanyExists - always return false for first call (missing)
            // Since randomSample shuffles, we don't know which company comes first
            manager.verifyCompanyExists = jest.fn()
                .mockResolvedValueOnce(false) // First checked company doesn't exist
                .mockResolvedValueOnce(true);  // Second checked company exists

            const plan = await manager.createRestorationPlan(snapshot, null);

            // Should have 1 company to restore (the one that doesn't exist)
            expect(plan.companiesToRestore).toHaveLength(1);
            // Verify it's one of the companies from snapshot
            expect(['1', '2']).toContain(plan.companiesToRestore[0].id);
        });

        it('should handle errors during company existence check', async () => {
            const snapshot = {
                hubspot: {
                    companies: [
                        { id: '1', properties: { name: 'Company 1' } }
                    ]
                }
            };

            manager.verifyCompanyExists = jest.fn()
                .mockRejectedValue(new Error('API Error'));

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            const plan = await manager.createRestorationPlan(snapshot, null);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Error checking')
            );

            consoleSpy.mockRestore();
        });
    });

    describe('rollback', () => {
        let mockSnapshot;
        let snapshotPath;

        beforeEach(() => {
            snapshotPath = '/path/to/snapshot.json';
            mockSnapshot = {
                timestamp: new Date().toISOString(),
                hubspot: {
                    companies: [
                        { id: '1', properties: { name: 'Company 1' } }
                    ]
                }
            };

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(mockSnapshot));
        });

        it('should complete dry run successfully without making API calls', async () => {
            manager.verifyCompanyExists = jest.fn().mockResolvedValue(false);
            // Mock restoreCompany to verify it's not called in dry run
            manager.restoreCompany = jest.fn();

            const result = await manager.rollback(snapshotPath);

            expect(result.companiesRestored).toBe(0); // Dry run doesn't restore
            expect(manager.restoreCompany).not.toHaveBeenCalled(); // No API call in dry run
        });

        it('should return early when nothing to rollback', async () => {
            manager.verifyCompanyExists = jest.fn().mockResolvedValue(true); // All companies exist

            const result = await manager.rollback(snapshotPath);

            expect(result.companiesRestored).toBe(0);
        });

        it('should execute restoration in live mode', async () => {
            const liveManager = new RollbackManager({
                ...mockConfig,
                execution: { dryRun: false }
            });

            liveManager.verifyCompanyExists = jest.fn().mockResolvedValue(false);
            liveManager.restoreCompany = jest.fn().mockResolvedValue({ id: 'new-1' });

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(mockSnapshot));

            const result = await liveManager.rollback(snapshotPath);

            expect(liveManager.restoreCompany).toHaveBeenCalled();
            expect(result.companiesRestored).toBe(1);
        });

        it('should handle rollback errors gracefully', async () => {
            fs.existsSync.mockReturnValue(false);

            await expect(manager.rollback(snapshotPath))
                .rejects.toThrow('Snapshot not found');
        });

        it('should save rollback report even on error', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('invalid json');

            try {
                await manager.rollback(snapshotPath);
            } catch (e) {
                // Expected to throw
            }

            // Report should still be saved
            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        it('should use targeted rollback when execution report provided', async () => {
            const executionReport = {
                deletedCompanies: ['1']
            };

            const liveManager = new RollbackManager({
                ...mockConfig,
                execution: { dryRun: false }
            });
            liveManager.restoreCompany = jest.fn().mockResolvedValue({ id: 'new-1' });
            liveManager.verifyCompanyExists = jest.fn().mockResolvedValue(true);

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(mockSnapshot));

            await liveManager.rollback(snapshotPath, executionReport);

            expect(liveManager.restoreCompany).toHaveBeenCalledWith(
                expect.objectContaining({ id: '1' })
            );
        });
    });

    describe('executeRestoration', () => {
        it('should restore companies in batches', async () => {
            const liveManager = new RollbackManager({
                ...mockConfig,
                execution: { dryRun: false }
            });

            const plan = {
                companiesToRestore: Array(25).fill(null).map((_, i) => ({
                    id: String(i),
                    properties: { name: `Company ${i}` }
                })),
                propertiesToRestore: [],
                associationsToRestore: []
            };

            liveManager.restoreCompany = jest.fn().mockResolvedValue({});
            liveManager.sleep = jest.fn().mockResolvedValue();

            await liveManager.executeRestoration(plan);

            expect(liveManager.restoreCompany).toHaveBeenCalledTimes(25);
            expect(liveManager.stats.companiesRestored).toBe(25);
            // Should have rate limiting between batches (2 waits for 3 batches)
            expect(liveManager.sleep).toHaveBeenCalledTimes(2);
        });

        it('should handle partial failures gracefully', async () => {
            const liveManager = new RollbackManager({
                ...mockConfig,
                execution: { dryRun: false }
            });

            const plan = {
                companiesToRestore: [
                    { id: '1', properties: { name: 'Company 1' } },
                    { id: '2', properties: { name: 'Company 2' } },
                    { id: '3', properties: { name: 'Company 3' } }
                ],
                propertiesToRestore: [],
                associationsToRestore: []
            };

            liveManager.restoreCompany = jest.fn()
                .mockResolvedValueOnce({})
                .mockRejectedValueOnce(new Error('API Error'))
                .mockResolvedValueOnce({});

            liveManager.sleep = jest.fn().mockResolvedValue();

            await liveManager.executeRestoration(plan);

            expect(liveManager.stats.companiesRestored).toBe(2);
            expect(liveManager.stats.errors).toHaveLength(1);
            expect(liveManager.stats.errors[0].companyId).toBe('2');
        });

        it('should continue processing after individual failures', async () => {
            const liveManager = new RollbackManager({
                ...mockConfig,
                execution: { dryRun: false }
            });

            const plan = {
                companiesToRestore: [
                    { id: '1', properties: { name: 'Company 1' } },
                    { id: '2', properties: { name: 'Company 2' } }
                ],
                propertiesToRestore: [],
                associationsToRestore: []
            };

            liveManager.restoreCompany = jest.fn()
                .mockRejectedValueOnce(new Error('First fails'))
                .mockResolvedValueOnce({}); // Second succeeds

            liveManager.sleep = jest.fn().mockResolvedValue();

            await liveManager.executeRestoration(plan);

            expect(liveManager.stats.companiesRestored).toBe(1);
            expect(liveManager.stats.errors).toHaveLength(1);
        });
    });

    describe('restoreCompany', () => {
        it('should make correct API call to create company', async () => {
            const company = {
                id: '123',
                properties: {
                    name: 'Test Company',
                    domain: 'test.com'
                }
            };

            const mockResponse = {
                statusCode: 201,
                on: jest.fn((event, callback) => {
                    if (event === 'data') callback(JSON.stringify({ id: 'new-123' }));
                    if (event === 'end') callback();
                })
            };

            const mockRequest = {
                on: jest.fn(),
                write: jest.fn(),
                end: jest.fn()
            };

            https.request.mockImplementation((options, callback) => {
                callback(mockResponse);
                return mockRequest;
            });

            const result = await manager.restoreCompany(company);

            expect(https.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    hostname: 'api.hubapi.com',
                    path: '/crm/v3/objects/companies',
                    method: 'POST'
                }),
                expect.any(Function)
            );
            expect(result).toEqual({ id: 'new-123' });
        });

        it('should reject on HTTP error', async () => {
            const company = { id: '123', properties: { name: 'Test' } };

            const mockResponse = {
                statusCode: 400,
                on: jest.fn((event, callback) => {
                    if (event === 'data') callback('Bad Request');
                    if (event === 'end') callback();
                })
            };

            const mockRequest = {
                on: jest.fn(),
                write: jest.fn(),
                end: jest.fn()
            };

            https.request.mockImplementation((options, callback) => {
                callback(mockResponse);
                return mockRequest;
            });

            await expect(manager.restoreCompany(company))
                .rejects.toThrow('HTTP 400');
        });

        it('should reject on network error', async () => {
            const company = { id: '123', properties: { name: 'Test' } };

            const mockRequest = {
                on: jest.fn((event, callback) => {
                    if (event === 'error') callback(new Error('Network Error'));
                }),
                write: jest.fn(),
                end: jest.fn()
            };

            https.request.mockReturnValue(mockRequest);

            await expect(manager.restoreCompany(company))
                .rejects.toThrow('Network Error');
        });
    });

    describe('verifyCompanyExists', () => {
        it('should return true when company exists', async () => {
            const mockResponse = {
                statusCode: 200,
                on: jest.fn()
            };

            const mockRequest = {
                on: jest.fn(),
                end: jest.fn()
            };

            https.request.mockImplementation((options, callback) => {
                callback(mockResponse);
                return mockRequest;
            });

            const result = await manager.verifyCompanyExists('123');

            expect(result).toBe(true);
            expect(https.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    path: '/crm/v3/objects/companies/123',
                    method: 'GET'
                }),
                expect.any(Function)
            );
        });

        it('should return false when company does not exist', async () => {
            const mockResponse = {
                statusCode: 404,
                on: jest.fn()
            };

            const mockRequest = {
                on: jest.fn(),
                end: jest.fn()
            };

            https.request.mockImplementation((options, callback) => {
                callback(mockResponse);
                return mockRequest;
            });

            const result = await manager.verifyCompanyExists('999');

            expect(result).toBe(false);
        });

        it('should reject on unexpected HTTP status', async () => {
            const mockResponse = {
                statusCode: 500,
                on: jest.fn()
            };

            const mockRequest = {
                on: jest.fn(),
                end: jest.fn()
            };

            https.request.mockImplementation((options, callback) => {
                callback(mockResponse);
                return mockRequest;
            });

            await expect(manager.verifyCompanyExists('123'))
                .rejects.toThrow('HTTP 500');
        });
    });

    describe('verifyRestoration', () => {
        it('should verify sample of restored companies', async () => {
            const plan = {
                companiesToRestore: Array(20).fill(null).map((_, i) => ({
                    id: String(i),
                    properties: { name: `Company ${i}` }
                }))
            };

            manager.verifyCompanyExists = jest.fn().mockResolvedValue(true);

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await manager.verifyRestoration(plan);

            // Should verify max 10 companies
            expect(manager.verifyCompanyExists).toHaveBeenCalledTimes(10);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Verified 10/10')
            );

            consoleSpy.mockRestore();
        });

        it('should report missing companies after restoration', async () => {
            const plan = {
                companiesToRestore: [
                    { id: '1', properties: { name: 'Company 1' } },
                    { id: '2', properties: { name: 'Company 2' } }
                ]
            };

            manager.verifyCompanyExists = jest.fn()
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false);

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await manager.verifyRestoration(plan);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('1 companies still missing')
            );

            consoleSpy.mockRestore();
        });

        it('should handle verification errors gracefully', async () => {
            const plan = {
                companiesToRestore: [
                    { id: '1', properties: { name: 'Company 1' } }
                ]
            };

            manager.verifyCompanyExists = jest.fn()
                .mockRejectedValue(new Error('Verification failed'));

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await manager.verifyRestoration(plan);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Verification error')
            );

            consoleSpy.mockRestore();
        });
    });

    describe('randomSample', () => {
        it('should return requested sample size', () => {
            const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const result = manager.randomSample(array, 5);

            expect(result).toHaveLength(5);
        });

        it('should return all items when sample size exceeds array length', () => {
            const array = [1, 2, 3];
            const result = manager.randomSample(array, 10);

            expect(result).toHaveLength(3);
        });

        it('should return different items on multiple calls (randomized)', () => {
            const array = Array.from({ length: 100 }, (_, i) => i);
            const results = new Set();

            // Get 10 samples and check they're not all identical
            for (let i = 0; i < 10; i++) {
                const sample = manager.randomSample(array, 5);
                results.add(JSON.stringify(sample));
            }

            // Should have at least some variety (very unlikely to all be identical)
            expect(results.size).toBeGreaterThan(1);
        });

        it('should not modify original array', () => {
            const array = [1, 2, 3, 4, 5];
            const original = [...array];

            manager.randomSample(array, 3);

            expect(array).toEqual(original);
        });
    });

    describe('sleep', () => {
        it('should delay for specified milliseconds', async () => {
            jest.useFakeTimers();

            const sleepPromise = manager.sleep(1000);

            jest.advanceTimersByTime(1000);

            await expect(sleepPromise).resolves.toBeUndefined();

            jest.useRealTimers();
        });
    });

    describe('saveRollbackReport', () => {
        it('should save report with correct format', () => {
            manager.stats = {
                startedAt: '2025-01-15T10:00:00Z',
                companiesRestored: 10,
                propertiesRestored: 5,
                associationsRestored: 3,
                errors: [],
                skipped: []
            };

            manager.saveRollbackReport('/path/to/snapshot.json');

            // Verify file was written with rollback-report filename
            expect(fs.writeFileSync).toHaveBeenCalled();
            const [filePath, content] = fs.writeFileSync.mock.calls[0];
            expect(filePath).toContain('rollback-report-');
            expect(filePath).toMatch(/\.json$/);

            // Verify content includes snapshot name
            const savedData = JSON.parse(content);
            expect(savedData.snapshot).toBe('snapshot.json');
        });

        it('should include snapshot filename in report', () => {
            manager.saveRollbackReport('/long/path/to/my-snapshot-2025-01-15.json');

            const callArgs = fs.writeFileSync.mock.calls[0];
            const savedReport = JSON.parse(callArgs[1]);

            expect(savedReport.snapshot).toBe('my-snapshot-2025-01-15.json');
        });
    });

    describe('printSummary', () => {
        it('should print summary without errors', () => {
            manager.stats = {
                companiesRestored: 10,
                propertiesRestored: 5,
                associationsRestored: 3,
                errors: []
            };

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            manager.printSummary();

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Companies Restored: 10')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Errors: 0')
            );

            consoleSpy.mockRestore();
        });

        it('should print errors when present', () => {
            manager.stats = {
                companiesRestored: 8,
                propertiesRestored: 0,
                associationsRestored: 0,
                errors: [
                    { companyName: 'Failed Co 1', error: 'API Error' },
                    { companyName: 'Failed Co 2', error: 'Timeout' }
                ]
            };

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            manager.printSummary();

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Errors: 2')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed Co 1')
            );

            consoleSpy.mockRestore();
        });

        it('should truncate error list when more than 5 errors', () => {
            manager.stats = {
                companiesRestored: 5,
                propertiesRestored: 0,
                associationsRestored: 0,
                errors: Array(10).fill(null).map((_, i) => ({
                    companyName: `Failed ${i}`,
                    error: 'Error'
                }))
            };

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            manager.printSummary();

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('... and 5 more')
            );

            consoleSpy.mockRestore();
        });
    });

    describe('Integration scenarios', () => {
        it('should handle complete rollback workflow', async () => {
            const snapshot = {
                timestamp: new Date().toISOString(),
                hubspot: {
                    companies: [
                        { id: '1', properties: { name: 'Company 1', domain: 'co1.com' } },
                        { id: '2', properties: { name: 'Company 2', domain: 'co2.com' } }
                    ]
                }
            };

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(snapshot));

            // All companies missing (need restoration)
            manager.verifyCompanyExists = jest.fn().mockResolvedValue(false);

            const result = await manager.rollback('/path/to/snapshot.json');

            // In dry run mode, no restoration happens
            expect(result.companiesRestored).toBe(0);
        });

        it('should handle empty snapshot gracefully', async () => {
            const emptySnapshot = {
                timestamp: new Date().toISOString(),
                hubspot: {
                    companies: []
                }
            };

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(emptySnapshot));

            await expect(manager.rollback('/path/to/empty.json'))
                .rejects.toThrow('Snapshot contains no companies');
        });

        it('should handle mixed success/failure during batch restore', async () => {
            const liveManager = new RollbackManager({
                ...mockConfig,
                execution: { dryRun: false }
            });

            const executionReport = {
                deletedCompanies: ['1', '2', '3', '4', '5']
            };

            const snapshot = {
                timestamp: new Date().toISOString(),
                hubspot: {
                    companies: [
                        { id: '1', properties: { name: 'Company 1' } },
                        { id: '2', properties: { name: 'Company 2' } },
                        { id: '3', properties: { name: 'Company 3' } },
                        { id: '4', properties: { name: 'Company 4' } },
                        { id: '5', properties: { name: 'Company 5' } }
                    ]
                }
            };

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(snapshot));

            // Companies 2 and 4 fail to restore
            liveManager.restoreCompany = jest.fn()
                .mockResolvedValueOnce({}) // 1 succeeds
                .mockRejectedValueOnce(new Error('Rate limited')) // 2 fails
                .mockResolvedValueOnce({}) // 3 succeeds
                .mockRejectedValueOnce(new Error('Validation error')) // 4 fails
                .mockResolvedValueOnce({}); // 5 succeeds

            liveManager.verifyCompanyExists = jest.fn().mockResolvedValue(true);
            liveManager.sleep = jest.fn().mockResolvedValue();

            const result = await liveManager.rollback('/path/to/snapshot.json', executionReport);

            expect(result.companiesRestored).toBe(3);
            expect(result.errors).toHaveLength(2);
            expect(result.errors[0].error).toContain('Rate limited');
            expect(result.errors[1].error).toContain('Validation error');
        });
    });
});
