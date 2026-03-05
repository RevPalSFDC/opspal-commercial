/**
 * Tests for AssociationRepairManager - Post-execution verification and repair
 *
 * Critical Phase 2.5 component that ensures 100% of contacts have PRIMARY
 * associations after deduplication. Discovered 96.8% of contacts needed
 * repair in production.
 */

const fs = require('fs');
const https = require('https');

// Mock dependencies
jest.mock('fs');
jest.mock('https');
jest.mock('../dedup-association-verifier');

const AssociationRepairManager = require('../dedup-association-repair');
const AssociationVerifier = require('../dedup-association-verifier');

describe('AssociationRepairManager', () => {
    let manager;
    let mockVerifier;

    const createMockConfig = () => ({
        hubspot: {
            accessToken: 'test-token',
            portalId: '12345678'
        },
        execution: {
            dryRun: true
        },
        output: {
            outputDir: './test-reports'
        }
    });

    const mockCanonicalMap = [
        {
            bundleId: 'bundle-1',
            bundleType: 'bundleA',
            clusterKey: 'sf001',
            canonical: {
                companyId: '100',
                companyName: 'Canonical Corp',
                num_contacts: 5,
                num_deals: 2
            },
            duplicateCount: 2,
            duplicates: [
                { companyId: '101', companyName: 'Dup 1', num_contacts: 3 },
                { companyId: '102', companyName: 'Dup 2', num_contacts: 2 }
            ]
        }
    ];

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock fs
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(JSON.stringify(mockCanonicalMap));
        fs.writeFileSync.mockImplementation(() => {});

        // Mock verifier
        mockVerifier = {
            verifyAndRepairBatch: jest.fn().mockResolvedValue([
                { contactId: 'c1', hadPrimary: true, repaired: false },
                { contactId: 'c2', hadPrimary: false, repaired: true },
                { contactId: 'c3', hadPrimary: false, repaired: true }
            ])
        };
        AssociationVerifier.mockImplementation(() => mockVerifier);

        // Silence console
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();

        manager = new AssociationRepairManager(createMockConfig());
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with config', () => {
            expect(manager.config).toEqual(createMockConfig());
            expect(manager.dryRun).toBe(true);
        });

        it('should default to dry run mode', () => {
            const configNoDryRun = { ...createMockConfig(), execution: {} };
            const mgr = new AssociationRepairManager(configNoDryRun);
            expect(mgr.dryRun).toBe(true);
        });

        it('should initialize statistics', () => {
            expect(manager.stats.canonicalCompaniesProcessed).toBe(0);
            expect(manager.stats.totalContactsVerified).toBe(0);
            expect(manager.stats.contactsWithPrimary).toBe(0);
            expect(manager.stats.contactsRepaired).toBe(0);
            expect(manager.stats.repairFailures).toBe(0);
            expect(manager.stats.companiesWithIssues).toEqual([]);
            expect(manager.stats.errors).toEqual([]);
        });
    });

    describe('repair', () => {
        beforeEach(() => {
            // Mock getCompanyContacts
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                results: [
                                    { toObjectId: 'c1' },
                                    { toObjectId: 'c2' },
                                    { toObjectId: 'c3' }
                                ]
                            }));
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });
        });

        it('should load canonical map from file', async () => {
            await manager.repair('/path/to/canonical-map.json');

            expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/canonical-map.json', 'utf8');
        });

        it('should process all bundles', async () => {
            const result = await manager.repair('/path/to/canonical-map.json');

            expect(result.stats.canonicalCompaniesProcessed).toBe(1);
        });

        it('should calculate success rate', async () => {
            const result = await manager.repair('/path/to/canonical-map.json');

            // 1 had primary + 2 repaired = 3 successful out of 3 verified = 100%
            expect(result.successRate).toBe(100);
        });

        it('should save repair report', async () => {
            await manager.repair('/path/to/canonical-map.json');

            const reportCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].includes('association-repair-report')
            );
            expect(reportCall).toBeDefined();
        });

        it('should throw error if canonical map not found', async () => {
            fs.existsSync.mockReturnValue(false);

            await expect(manager.repair('/nonexistent/map.json')).rejects.toThrow('not found');
        });

        it('should handle canonicalMap property in file', async () => {
            fs.readFileSync.mockReturnValue(JSON.stringify({ canonicalMap: mockCanonicalMap }));

            const result = await manager.repair('/path/to/canonical-map.json');

            expect(result.stats.canonicalCompaniesProcessed).toBe(1);
        });

        it('should load execution report if provided', async () => {
            const execReportPath = '/path/to/execution-report.json';
            fs.existsSync.mockImplementation(path => true);
            fs.readFileSync.mockImplementation(path => {
                if (path.includes('execution-report')) {
                    return JSON.stringify({ companiesDeleted: 5 });
                }
                return JSON.stringify(mockCanonicalMap);
            });

            await manager.repair('/path/to/canonical-map.json', execReportPath);

            expect(fs.readFileSync).toHaveBeenCalledWith(execReportPath, 'utf8');
        });
    });

    describe('loadCanonicalMap', () => {
        it('should load and parse JSON file', () => {
            const map = manager.loadCanonicalMap('/path/to/map.json');

            expect(map).toEqual(mockCanonicalMap);
        });

        it('should extract canonicalMap property if present', () => {
            fs.readFileSync.mockReturnValue(JSON.stringify({ canonicalMap: mockCanonicalMap }));

            const map = manager.loadCanonicalMap('/path/to/map.json');

            expect(map).toEqual(mockCanonicalMap);
        });

        it('should throw error if file not found', () => {
            fs.existsSync.mockReturnValue(false);

            expect(() => manager.loadCanonicalMap('/nonexistent.json')).toThrow('not found');
        });
    });

    describe('repairBundleAssociations', () => {
        const bundle = mockCanonicalMap[0];

        beforeEach(() => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                results: [{ toObjectId: 'c1' }, { toObjectId: 'c2' }]
                            }));
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });
        });

        it('should calculate expected contacts from canonical + duplicates', async () => {
            await manager.repairBundleAssociations(bundle, mockVerifier);

            // Expected: 5 (canonical) + 3 (dup1) + 2 (dup2) = 10
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('Expected contacts: 10')
            );
        });

        it('should skip bundles with no expected contacts', async () => {
            const emptyBundle = {
                ...bundle,
                canonical: { ...bundle.canonical, num_contacts: 0 },
                duplicates: []
            };

            await manager.repairBundleAssociations(emptyBundle, mockVerifier);

            expect(mockVerifier.verifyAndRepairBatch).not.toHaveBeenCalled();
        });

        it('should update statistics after repair', async () => {
            await manager.repairBundleAssociations(bundle, mockVerifier);

            expect(manager.stats.totalContactsVerified).toBe(3);
            expect(manager.stats.contactsWithPrimary).toBe(1);
            expect(manager.stats.contactsRepaired).toBe(2);
        });

        it('should track companies with issues', async () => {
            await manager.repairBundleAssociations(bundle, mockVerifier);

            expect(manager.stats.companiesWithIssues.length).toBe(1);
            expect(manager.stats.companiesWithIssues[0].contactsRepaired).toBe(2);
        });

        it('should handle no contacts found in HubSpot', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler(JSON.stringify({ results: [] }));
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            await manager.repairBundleAssociations(bundle, mockVerifier);

            expect(manager.stats.companiesWithIssues[0].issue).toBe('No contacts found');
        });

        it('should handle API errors', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 500,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler('Server Error');
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            await manager.repairBundleAssociations(bundle, mockVerifier);

            expect(manager.stats.errors.length).toBe(1);
        });
    });

    describe('getCompanyContacts', () => {
        it('should fetch contact IDs from HubSpot API', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                results: [
                                    { toObjectId: 'c1' },
                                    { toObjectId: 'c2' }
                                ]
                            }));
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            const contacts = await manager.getCompanyContacts('100');

            expect(contacts).toEqual(['c1', 'c2']);
        });

        it('should return empty array for 404', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 404,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler('Not Found');
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            const contacts = await manager.getCompanyContacts('nonexistent');

            expect(contacts).toEqual([]);
        });

        it('should throw error for other API errors', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 500,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler('Server Error');
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            await expect(manager.getCompanyContacts('100')).rejects.toThrow('HubSpot API error');
        });

        it('should throw error if access token not configured', async () => {
            const originalToken = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
            manager.config.hubspot.accessToken = null;
            delete process.env.HUBSPOT_PRIVATE_APP_TOKEN;

            try {
                await expect(manager.getCompanyContacts('100')).rejects.toThrow('access token not configured');
            } finally {
                // Restore env var for subsequent tests
                if (originalToken) {
                    process.env.HUBSPOT_PRIVATE_APP_TOKEN = originalToken;
                }
            }
        });
    });

    describe('saveRepairReport', () => {
        it('should save report with success criteria', () => {
            manager.stats = {
                startedAt: new Date().toISOString(),
                canonicalCompaniesProcessed: 10,
                totalContactsVerified: 100,
                contactsWithPrimary: 90,
                contactsRepaired: 8,
                repairFailures: 2,
                companiesWithIssues: [],
                errors: []
            };

            manager.saveRepairReport();

            const [filePath, content] = fs.writeFileSync.mock.calls[0];
            expect(filePath).toContain('association-repair-report');

            const saved = JSON.parse(content);
            expect(saved.successCriteria.targetSuccessRate).toBe(95);
            expect(saved.successCriteria.actualSuccessRate).toBe(98); // (90+8)/100*100
            expect(saved.successCriteria.met).toBe(true);
        });

        it('should handle 100% success with no contacts', () => {
            manager.stats = {
                startedAt: new Date().toISOString(),
                canonicalCompaniesProcessed: 0,
                totalContactsVerified: 0,
                contactsWithPrimary: 0,
                contactsRepaired: 0,
                repairFailures: 0,
                companiesWithIssues: [],
                errors: []
            };

            manager.saveRepairReport();

            const [, content] = fs.writeFileSync.mock.calls[0];
            const saved = JSON.parse(content);
            expect(saved.successCriteria.actualSuccessRate).toBe(100);
        });
    });

    describe('printSummary', () => {
        it('should print repair statistics', () => {
            manager.stats = {
                startedAt: new Date().toISOString(),
                canonicalCompaniesProcessed: 10,
                totalContactsVerified: 100,
                contactsWithPrimary: 90,
                contactsRepaired: 8,
                repairFailures: 2,
                companiesWithIssues: [],
                errors: []
            };

            manager.printSummary();

            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Total Contacts Verified: 100'));
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Already Had PRIMARY: 90'));
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Repaired PRIMARY: 8'));
        });

        it('should show success status based on rate', () => {
            manager.stats = {
                totalContactsVerified: 100,
                contactsWithPrimary: 99,
                contactsRepaired: 1,
                repairFailures: 0,
                companiesWithIssues: [],
                errors: []
            };

            manager.printSummary();

            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Excellent'));
        });

        it('should show warning for low success rate', () => {
            manager.stats = {
                totalContactsVerified: 100,
                contactsWithPrimary: 50,
                contactsRepaired: 30,
                repairFailures: 20,
                companiesWithIssues: [],
                errors: []
            };

            manager.printSummary();

            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Below threshold'));
        });

        it('should display companies with repairs', () => {
            manager.stats = {
                totalContactsVerified: 100,
                contactsWithPrimary: 90,
                contactsRepaired: 10,
                repairFailures: 0,
                companiesWithIssues: [
                    { companyName: 'Company A', contactsRepaired: 5, totalContacts: 50 },
                    { companyName: 'Company B', contactsRepaired: 5, totalContacts: 30 }
                ],
                errors: []
            };

            manager.printSummary();

            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Companies with Repairs: 2'));
        });

        it('should display errors if present', () => {
            manager.stats = {
                totalContactsVerified: 100,
                contactsWithPrimary: 90,
                contactsRepaired: 5,
                repairFailures: 5,
                companiesWithIssues: [],
                errors: [
                    { companyName: 'Failed Co', error: 'API Error' }
                ]
            };

            manager.printSummary();

            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Errors: 1'));
        });
    });

    describe('success criteria validation', () => {
        it('should throw error if success rate below 95%', async () => {
            mockVerifier.verifyAndRepairBatch.mockResolvedValue([
                { contactId: 'c1', hadPrimary: false, repaired: false, error: 'Failed' },
                { contactId: 'c2', hadPrimary: false, repaired: false, error: 'Failed' },
                { contactId: 'c3', hadPrimary: false, repaired: true }
            ]);

            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                results: [{ toObjectId: 'c1' }, { toObjectId: 'c2' }, { toObjectId: 'c3' }]
                            }));
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            // 1 success out of 3 = 33.3%
            await expect(manager.repair('/path/to/canonical-map.json')).rejects.toThrow('below 95%');
        });
    });
});
