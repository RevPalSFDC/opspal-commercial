/**
 * Tests for SnapshotGenerator - Creates comprehensive snapshots before modifications
 *
 * The snapshot generator is critical for rollback capability. It captures:
 * - All HubSpot Companies with associations
 * - All Salesforce Accounts with associations
 * - Multiple output formats (JSON, CSV)
 */

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

// Mock dependencies
jest.mock('fs');
jest.mock('https');
jest.mock('child_process');
// Note: csv-schema-validator is mocked via moduleNameMapper in package.json

const SnapshotGenerator = require('../dedup-snapshot-generator');

describe('SnapshotGenerator', () => {
    let generator;

    const mockConfig = {
        hubspot: {
            accessToken: 'test-token',
            portalId: '12345678'
        },
        salesforce: {
            orgAlias: 'test-org',
            instanceUrl: 'https://test.salesforce.com',
            accessToken: 'sf-token'
        },
        execution: {
            maxWritePerMin: 60
        },
        output: {
            outputDir: './test-reports'
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock fs
        fs.existsSync.mockReturnValue(true);
        fs.mkdirSync.mockImplementation(() => {});
        fs.writeFileSync.mockImplementation(() => {});

        // Silence console
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
        jest.spyOn(console, 'warn').mockImplementation();

        generator = new SnapshotGenerator(mockConfig);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with config', () => {
            expect(generator.hubspot).toEqual(mockConfig.hubspot);
            expect(generator.salesforce).toEqual(mockConfig.salesforce);
        });

        it('should set default output directory', () => {
            const configNoOutput = { ...mockConfig, output: undefined };
            const gen = new SnapshotGenerator(configNoOutput);
            expect(gen.outputDir).toBe('./dedup-reports');
        });

        it('should create output directory if not exists', () => {
            fs.existsSync.mockReturnValue(false);
            new SnapshotGenerator(mockConfig);
            expect(fs.mkdirSync).toHaveBeenCalled();
        });

        it('should generate timestamp', () => {
            expect(generator.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/);
        });

        it('should initialize rate limiting', () => {
            expect(generator.requestCount).toBe(0);
            expect(generator.maxRequestsPerMin).toBe(60);
        });
    });

    describe('generate', () => {
        beforeEach(() => {
            // Mock HubSpot API response
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            if (options.path.includes('companies') && !options.path.includes('associations')) {
                                handler(JSON.stringify({
                                    results: [
                                        { id: '1', properties: { name: 'Company 1', domain: 'example.com' } }
                                    ],
                                    paging: null
                                }));
                            } else {
                                handler(JSON.stringify({ results: [] }));
                            }
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
            });

            // Mock Salesforce query
            execSync.mockReturnValue(JSON.stringify({
                status: 0,
                result: {
                    records: [
                        { Id: 'sf001', Name: 'SF Account 1', Website: 'example.com' }
                    ]
                }
            }));
        });

        it('should generate snapshot with HubSpot and Salesforce data', async () => {
            const snapshot = await generator.generate();

            expect(snapshot.id).toContain('snapshot-');
            expect(snapshot.hubspot).toBeDefined();
            expect(snapshot.salesforce).toBeDefined();
        });

        it('should save snapshot files', async () => {
            await generator.generate();

            // Should save JSON and CSV files
            expect(fs.writeFileSync).toHaveBeenCalled();
            const jsonCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].includes('.json') && call[0].includes('snapshot-')
            );
            expect(jsonCall).toBeDefined();
        });

        it('should include metadata in snapshot', async () => {
            const snapshot = await generator.generate();

            expect(snapshot.metadata.config.portalId).toBe('12345678');
            expect(snapshot.metadata.config.orgAlias).toBe('test-org');
            expect(snapshot.metadata.files.length).toBeGreaterThan(0);
        });
    });

    describe('snapshotHubSpotCompanies', () => {
        it('should fetch all companies with pagination', async () => {
            let callCount = 0;
            https.request.mockImplementation((options, callback) => {
                callCount++;
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            if (callCount === 1) {
                                handler(JSON.stringify({
                                    results: [{ id: '1', properties: { name: 'Co 1' } }],
                                    paging: { next: { after: 'page2' } }
                                }));
                            } else {
                                handler(JSON.stringify({
                                    results: [{ id: '2', properties: { name: 'Co 2' } }],
                                    paging: null
                                }));
                            }
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
            });

            const result = await generator.snapshotHubSpotCompanies();

            expect(result.totalCompanies).toBe(2);
        });

        it('should handle rate limit errors', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 429,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler('Rate limit exceeded');
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
            });

            await expect(generator.snapshotHubSpotCompanies()).rejects.toThrow('Rate limit');
        });

        it('should include required properties in request', async () => {
            let requestedPath = '';
            https.request.mockImplementation((options, callback) => {
                requestedPath = options.path;
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler(JSON.stringify({ results: [], paging: null }));
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
            });

            await generator.snapshotHubSpotCompanies();

            expect(requestedPath).toContain('salesforceaccountid');
            expect(requestedPath).toContain('domain');
            expect(requestedPath).toContain('name');
        });
    });

    describe('snapshotSalesforceAccounts', () => {
        it('should query Salesforce accounts with associations', async () => {
            execSync.mockReturnValue(JSON.stringify({
                status: 0,
                result: {
                    records: [
                        {
                            Id: 'sf001',
                            Name: 'Account 1',
                            Contacts: [{ Id: 'c1' }],
                            Opportunities: [{ Id: 'o1' }]
                        }
                    ]
                }
            }));

            const result = await generator.snapshotSalesforceAccounts();

            expect(result.totalAccounts).toBe(1);
            expect(execSync).toHaveBeenCalledWith(
                expect.stringContaining('SELECT'),
                expect.any(Object)
            );
        });

        it('should handle Salesforce query errors', async () => {
            execSync.mockReturnValue(JSON.stringify({
                status: 1,
                message: 'Query failed'
            }));

            await expect(generator.snapshotSalesforceAccounts()).rejects.toThrow('Query failed');
        });

        it('should handle CLI errors', async () => {
            execSync.mockImplementation(() => {
                throw new Error('CLI not found');
            });

            await expect(generator.snapshotSalesforceAccounts()).rejects.toThrow('SF CLI error');
        });
    });

    describe('fetchCompanyAssociations', () => {
        it('should enrich companies with associations', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                results: [{
                                    from: [{ toObjectId: 'contact1' }, { toObjectId: 'contact2' }]
                                }]
                            }));
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
            });

            const companies = [{ id: '1', properties: { name: 'Test' } }];
            const enriched = await generator.fetchCompanyAssociations(companies);

            expect(enriched[0].associations).toBeDefined();
        });

        it('should handle association fetch failures gracefully', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 500,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler('Server error');
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
            });

            const companies = [{ id: '1', properties: { name: 'Test' } }];
            const enriched = await generator.fetchCompanyAssociations(companies);

            // Should have empty associations but not fail
            expect(enriched[0].associations).toEqual({ contacts: [], deals: [] });
        });
    });

    describe('saveSnapshot', () => {
        it('should save JSON and CSV files', async () => {
            const snapshot = {
                id: 'snapshot-test',
                timestamp: new Date().toISOString(),
                hubspot: {
                    totalCompanies: 1,
                    companies: [{ id: '1', properties: { name: 'Test', domain: 'test.com' } }]
                },
                salesforce: {
                    totalAccounts: 1,
                    accounts: [{ Id: 'sf1', Name: 'SF Test' }]
                },
                metadata: { files: [] }
            };

            await generator.saveSnapshot(snapshot);

            // Should save JSON
            const jsonCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].endsWith('.json') && !call[0].includes('-metadata')
            );
            expect(jsonCall).toBeDefined();

            // Should save HubSpot CSV
            const hsCsvCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].includes('hubspot-companies.csv')
            );
            expect(hsCsvCall).toBeDefined();

            // Should save Salesforce CSV
            const sfCsvCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].includes('salesforce-accounts.csv')
            );
            expect(sfCsvCall).toBeDefined();
        });

        it('should save metadata file', async () => {
            const snapshot = {
                id: 'snapshot-test',
                hubspot: { totalCompanies: 0, companies: [] },
                salesforce: { totalAccounts: 0, accounts: [] },
                metadata: { files: [] }
            };

            await generator.saveSnapshot(snapshot);

            const metadataCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].includes('-metadata.json')
            );
            expect(metadataCall).toBeDefined();
        });
    });

    describe('saveCompaniesCSV', () => {
        it('should format companies for CSV export', () => {
            const companies = [
                {
                    id: '1',
                    properties: {
                        name: 'Company, Inc.',
                        domain: 'example.com',
                        website: 'https://example.com',
                        hubspot_owner_id: 'owner1',
                        createdate: '2025-01-01',
                        hs_lastmodifieddate: '2025-01-15',
                        lifecyclestage: 'customer',
                        salesforceaccountid: 'sf001',
                        num_associated_contacts: 5,
                        num_associated_deals: 2
                    }
                }
            ];

            generator.saveCompaniesCSV(companies, '/tmp/test.csv');

            expect(fs.writeFileSync).toHaveBeenCalled();
        });
    });

    describe('saveAccountsCSV', () => {
        it('should format accounts for CSV export', () => {
            const accounts = [
                {
                    Id: 'sf001',
                    Name: 'Account "Test"',
                    Website: 'example.com',
                    OwnerId: 'owner1',
                    CreatedDate: '2025-01-01',
                    Type: 'Customer',
                    Industry: 'Technology',
                    NumberOfEmployees: 100,
                    AnnualRevenue: 1000000,
                    Contacts: [{ Id: 'c1' }, { Id: 'c2' }],
                    Opportunities: [{ Id: 'o1' }]
                }
            ];

            generator.saveAccountsCSV(accounts, '/tmp/test.csv');

            expect(fs.writeFileSync).toHaveBeenCalled();
        });
    });

    describe('enforceRateLimit', () => {
        it('should reset window after 60 seconds', async () => {
            generator.requestCount = 50;
            generator.requestWindowStart = Date.now() - 70000;

            await generator.enforceRateLimit();

            expect(generator.requestCount).toBe(1);
        });

        it('should wait when rate limit reached', async () => {
            generator.requestCount = 60;
            generator.maxRequestsPerMin = 60;
            generator.requestWindowStart = Date.now() - 30000;

            const sleepSpy = jest.spyOn(generator, 'sleep').mockResolvedValue();

            await generator.enforceRateLimit();

            expect(sleepSpy).toHaveBeenCalled();
        });
    });

    describe('printSummary', () => {
        it('should print snapshot summary', () => {
            const snapshot = {
                id: 'snapshot-test',
                timestamp: new Date().toISOString(),
                hubspot: { totalCompanies: 100 },
                salesforce: { totalAccounts: 50 },
                metadata: {
                    files: ['/path/to/file1.json', '/path/to/file2.csv']
                }
            };

            generator.printSummary(snapshot);

            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('HubSpot Companies: 100'));
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Salesforce Accounts: 50'));
        });
    });
});
