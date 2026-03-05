/**
 * Comprehensive tests for Deduplication Clustering Engine
 *
 * Tests cover:
 * - Domain normalization (critical function)
 * - Bundle A creation (SF-anchored)
 * - Bundle B creation (HS-only by domain)
 * - Handling companies without domains
 * - CSV output formatting
 * - Edge cases and integration
 */

const fs = require('fs');
const path = require('path');

jest.mock('fs');

const ClusteringEngine = require('../dedup-clustering-engine');

describe('ClusteringEngine', () => {
    let engine;
    let mockSnapshot;
    let mockConfig;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup fs mocks
        fs.existsSync.mockReturnValue(true);
        fs.writeFileSync.mockImplementation(() => {});

        mockSnapshot = {
            hubspot: {
                companies: []
            }
        };

        mockConfig = {
            output: {
                outputDir: './test-reports'
            }
        };

        engine = new ClusteringEngine(mockSnapshot, mockConfig);
    });

    describe('constructor', () => {
        it('should initialize with provided config', () => {
            expect(engine.snapshot).toEqual(mockSnapshot);
            expect(engine.config).toEqual(mockConfig);
            expect(engine.outputDir).toBe('./test-reports');
        });

        it('should use default output directory when not provided', () => {
            const eng = new ClusteringEngine({}, {});
            expect(eng.outputDir).toBe('./dedup-reports');
        });

        it('should initialize empty bundle arrays', () => {
            expect(engine.bundles.bundleA).toEqual([]);
            expect(engine.bundles.bundleB).toEqual([]);
            expect(engine.bundles.skipped).toEqual([]);
        });
    });

    describe('normalizeDomain', () => {
        it('should lowercase domain', () => {
            expect(engine.normalizeDomain('EXAMPLE.COM')).toBe('example.com');
            expect(engine.normalizeDomain('ExAmPlE.CoM')).toBe('example.com');
        });

        it('should remove http:// protocol', () => {
            expect(engine.normalizeDomain('http://example.com')).toBe('example.com');
        });

        it('should remove https:// protocol', () => {
            expect(engine.normalizeDomain('https://example.com')).toBe('example.com');
        });

        it('should remove www prefix', () => {
            expect(engine.normalizeDomain('www.example.com')).toBe('example.com');
            expect(engine.normalizeDomain('http://www.example.com')).toBe('example.com');
        });

        it('should remove path', () => {
            expect(engine.normalizeDomain('example.com/page/subpage')).toBe('example.com');
            expect(engine.normalizeDomain('https://example.com/about')).toBe('example.com');
        });

        it('should remove trailing dots', () => {
            expect(engine.normalizeDomain('example.com.')).toBe('example.com');
        });

        it('should trim whitespace', () => {
            expect(engine.normalizeDomain('  example.com  ')).toBe('example.com');
        });

        it('should return "unknown" for null/undefined', () => {
            expect(engine.normalizeDomain(null)).toBe('unknown');
            expect(engine.normalizeDomain(undefined)).toBe('unknown');
        });

        it('should return "unknown" for empty string', () => {
            expect(engine.normalizeDomain('')).toBe('unknown');
            expect(engine.normalizeDomain('   ')).toBe('unknown');
        });

        it('should return "unknown" for non-string input', () => {
            expect(engine.normalizeDomain(123)).toBe('unknown');
            expect(engine.normalizeDomain({})).toBe('unknown');
        });

        it('should handle complex URLs', () => {
            expect(engine.normalizeDomain('https://www.example.com/path?query=1')).toBe('example.com');
            expect(engine.normalizeDomain('HTTP://WWW.EXAMPLE.COM/')).toBe('example.com');
        });

        it('should handle subdomains correctly', () => {
            expect(engine.normalizeDomain('app.example.com')).toBe('app.example.com');
            expect(engine.normalizeDomain('https://api.example.com')).toBe('api.example.com');
        });

        it('should handle international domains', () => {
            expect(engine.normalizeDomain('beispiel.de')).toBe('beispiel.de');
            expect(engine.normalizeDomain('https://www.ejemplo.es/')).toBe('ejemplo.es');
        });
    });

    describe('createBundleA', () => {
        it('should group companies by salesforceaccountid', () => {
            const companies = [
                {
                    id: '1',
                    properties: {
                        name: 'Company 1',
                        salesforceaccountid: 'sf001',
                        domain: 'example1.com'
                    }
                },
                {
                    id: '2',
                    properties: {
                        name: 'Company 2',
                        salesforceaccountid: 'sf001',
                        domain: 'example2.com'
                    }
                }
            ];

            engine.createBundleA(companies);

            expect(engine.bundles.bundleA).toHaveLength(1);
            expect(engine.bundles.bundleA[0].salesforceAccountId).toBe('sf001');
            expect(engine.bundles.bundleA[0].companyCount).toBe(2);
        });

        it('should not create bundle for single company', () => {
            const companies = [
                {
                    id: '1',
                    properties: {
                        name: 'Unique Company',
                        salesforceaccountid: 'sf001',
                        domain: 'unique.com'
                    }
                }
            ];

            engine.createBundleA(companies);

            expect(engine.bundles.bundleA).toHaveLength(0);
        });

        it('should ignore companies without salesforceaccountid', () => {
            const companies = [
                {
                    id: '1',
                    properties: {
                        name: 'Company 1',
                        domain: 'example1.com'
                    }
                },
                {
                    id: '2',
                    properties: {
                        name: 'Company 2',
                        domain: 'example2.com'
                    }
                }
            ];

            engine.createBundleA(companies);

            expect(engine.bundles.bundleA).toHaveLength(0);
        });

        it('should create multiple bundles for different SF account IDs', () => {
            const companies = [
                { id: '1', properties: { name: 'Co1', salesforceaccountid: 'sf001' } },
                { id: '2', properties: { name: 'Co2', salesforceaccountid: 'sf001' } },
                { id: '3', properties: { name: 'Co3', salesforceaccountid: 'sf002' } },
                { id: '4', properties: { name: 'Co4', salesforceaccountid: 'sf002' } }
            ];

            engine.createBundleA(companies);

            expect(engine.bundles.bundleA).toHaveLength(2);
        });

        it('should extract correct company properties', () => {
            const companies = [
                {
                    id: '123',
                    properties: {
                        name: 'Test Corp',
                        salesforceaccountid: 'sf001',
                        domain: 'test.com',
                        website: 'https://test.com',
                        hubspot_owner_id: 'owner1',
                        createdate: '2023-01-01T00:00:00Z',
                        num_associated_contacts: '50',
                        num_associated_deals: '10'
                    },
                    associations: { contacts: [] }
                },
                {
                    id: '124',
                    properties: {
                        name: 'Test Corp LLC',
                        salesforceaccountid: 'sf001'
                    }
                }
            ];

            engine.createBundleA(companies);

            const company = engine.bundles.bundleA[0].companies[0];
            expect(company.id).toBe('123');
            expect(company.name).toBe('Test Corp');
            expect(company.domain).toBe('test.com');
            expect(company.owner_id).toBe('owner1');
            expect(company.num_contacts).toBe(50);
            expect(company.num_deals).toBe(10);
        });

        it('should handle missing optional properties', () => {
            const companies = [
                { id: '1', properties: { salesforceaccountid: 'sf001' } },
                { id: '2', properties: { salesforceaccountid: 'sf001' } }
            ];

            engine.createBundleA(companies);

            const company = engine.bundles.bundleA[0].companies[0];
            expect(company.num_contacts).toBe(0);
            expect(company.num_deals).toBe(0);
        });
    });

    describe('createBundleB', () => {
        it('should group HS-only companies by normalized domain', () => {
            const companies = [
                {
                    id: '1',
                    properties: {
                        name: 'Company 1',
                        domain: 'example.com'
                    }
                },
                {
                    id: '2',
                    properties: {
                        name: 'Company 2',
                        domain: 'www.example.com'
                    }
                }
            ];

            engine.createBundleB(companies);

            expect(engine.bundles.bundleB).toHaveLength(1);
            expect(engine.bundles.bundleB[0].normalizedDomain).toBe('example.com');
            expect(engine.bundles.bundleB[0].companyCount).toBe(2);
        });

        it('should exclude companies with salesforceaccountid', () => {
            const companies = [
                {
                    id: '1',
                    properties: {
                        name: 'SF Company',
                        salesforceaccountid: 'sf001',
                        domain: 'example.com'
                    }
                },
                {
                    id: '2',
                    properties: {
                        name: 'HS Company',
                        domain: 'example.com'
                    }
                }
            ];

            engine.createBundleB(companies);

            // Only 1 HS-only company, not enough for a bundle
            expect(engine.bundles.bundleB).toHaveLength(0);
        });

        it('should skip companies without domain', () => {
            const companies = [
                {
                    id: '1',
                    properties: {
                        name: 'No Domain Co'
                    }
                },
                {
                    id: '2',
                    properties: {
                        name: 'With Domain',
                        domain: 'example.com'
                    }
                }
            ];

            engine.createBundleB(companies);

            expect(engine.bundles.skipped).toHaveLength(1);
            expect(engine.bundles.skipped[0].companyId).toBe('1');
            expect(engine.bundles.skipped[0].reason).toBe('no_domain');
        });

        it('should use website as fallback for domain', () => {
            const companies = [
                {
                    id: '1',
                    properties: {
                        name: 'Website Only 1',
                        website: 'https://example.com'
                    }
                },
                {
                    id: '2',
                    properties: {
                        name: 'Website Only 2',
                        website: 'http://www.example.com'
                    }
                }
            ];

            engine.createBundleB(companies);

            expect(engine.bundles.bundleB).toHaveLength(1);
            expect(engine.bundles.bundleB[0].normalizedDomain).toBe('example.com');
        });

        it('should not create bundle for single domain', () => {
            const companies = [
                {
                    id: '1',
                    properties: {
                        name: 'Unique Company',
                        domain: 'unique.com'
                    }
                }
            ];

            engine.createBundleB(companies);

            expect(engine.bundles.bundleB).toHaveLength(0);
        });

        it('should set salesforceaccountid to null for all companies', () => {
            const companies = [
                { id: '1', properties: { name: 'Co1', domain: 'test.com' } },
                { id: '2', properties: { name: 'Co2', domain: 'test.com' } }
            ];

            engine.createBundleB(companies);

            engine.bundles.bundleB[0].companies.forEach(company => {
                expect(company.salesforceaccountid).toBeNull();
            });
        });
    });

    describe('cluster', () => {
        it('should return empty bundles for empty snapshot', async () => {
            const result = await engine.cluster();

            expect(result.bundleA).toEqual([]);
            expect(result.bundleB).toEqual([]);
        });

        it('should process both bundle types', async () => {
            const snapshot = {
                hubspot: {
                    companies: [
                        { id: '1', properties: { salesforceaccountid: 'sf001', domain: 'a.com' } },
                        { id: '2', properties: { salesforceaccountid: 'sf001', domain: 'b.com' } },
                        { id: '3', properties: { domain: 'example.com' } },
                        { id: '4', properties: { domain: 'www.example.com' } }
                    ]
                }
            };

            const eng = new ClusteringEngine(snapshot, mockConfig);
            const result = await eng.cluster();

            expect(result.bundleA).toHaveLength(1);
            expect(result.bundleB).toHaveLength(1);
        });

        it('should handle missing hubspot.companies', async () => {
            const snapshot = {
                hubspot: {}
            };

            const eng = new ClusteringEngine(snapshot, mockConfig);
            const result = await eng.cluster();

            expect(result.bundleA).toEqual([]);
            expect(result.bundleB).toEqual([]);
        });

        it('should save bundle files', async () => {
            const snapshot = {
                hubspot: {
                    companies: [
                        { id: '1', properties: { salesforceaccountid: 'sf001' } },
                        { id: '2', properties: { salesforceaccountid: 'sf001' } }
                    ]
                }
            };

            const eng = new ClusteringEngine(snapshot, mockConfig);
            await eng.cluster();

            expect(fs.writeFileSync).toHaveBeenCalled();
        });
    });

    describe('saveBundles', () => {
        beforeEach(() => {
            engine.bundles = {
                bundleA: [{
                    type: 'sf-anchored',
                    salesforceAccountId: 'sf001',
                    companyCount: 2,
                    companies: [
                        { id: '1', name: 'Co1' },
                        { id: '2', name: 'Co2' }
                    ]
                }],
                bundleB: [{
                    type: 'hs-only',
                    normalizedDomain: 'example.com',
                    companyCount: 2,
                    companies: [
                        { id: '3', name: 'Co3' },
                        { id: '4', name: 'Co4' }
                    ]
                }],
                skipped: [{
                    companyId: '5',
                    companyName: 'No Domain',
                    reason: 'no_domain',
                    message: 'No domain available'
                }]
            };
        });

        it('should save JSON file', () => {
            engine.saveBundles();

            const jsonCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].includes('.json') && !call[0].includes('csv')
            );

            expect(jsonCall).toBeDefined();
            const savedData = JSON.parse(jsonCall[1]);
            expect(savedData.bundleA).toHaveLength(1);
            expect(savedData.bundleB).toHaveLength(1);
        });

        it('should save Bundle A CSV when bundles exist', () => {
            engine.saveBundles();

            const csvCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].includes('-bundleA.csv')
            );

            expect(csvCall).toBeDefined();
        });

        it('should save Bundle B CSV when bundles exist', () => {
            engine.saveBundles();

            const csvCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].includes('-bundleB.csv')
            );

            expect(csvCall).toBeDefined();
        });

        it('should save skipped CSV when items exist', () => {
            engine.saveBundles();

            const csvCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].includes('-skipped.csv')
            );

            expect(csvCall).toBeDefined();
        });

        it('should not save Bundle A CSV when empty', () => {
            engine.bundles.bundleA = [];
            engine.saveBundles();

            const csvCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].includes('-bundleA.csv')
            );

            expect(csvCall).toBeUndefined();
        });
    });

    describe('saveBundleCSV', () => {
        it('should create CSV with correct headers', () => {
            const bundles = [{
                type: 'sf-anchored',
                salesforceAccountId: 'sf001',
                companyCount: 1,
                companies: [
                    {
                        id: '1',
                        name: 'Test Co',
                        domain: 'test.com',
                        salesforceaccountid: 'sf001',
                        owner_id: 'owner1',
                        createdate: '2023-01-01',
                        num_contacts: 10,
                        num_deals: 5
                    }
                ]
            }];

            engine.saveBundleCSV(bundles, '/test/path.csv', 'Test');

            const csvContent = fs.writeFileSync.mock.calls[0][1];
            const lines = csvContent.split('\n');

            expect(lines[0]).toContain('Bundle_ID');
            expect(lines[0]).toContain('Company_ID');
            expect(lines[0]).toContain('Num_Contacts');
        });

        it('should create correct data rows', () => {
            const bundles = [{
                type: 'sf-anchored',
                salesforceAccountId: 'sf001',
                companyCount: 2,
                companies: [
                    { id: '1', name: 'Co1', domain: 'a.com', salesforceaccountid: 'sf001', num_contacts: 10, num_deals: 5 },
                    { id: '2', name: 'Co2', domain: 'b.com', salesforceaccountid: 'sf001', num_contacts: 20, num_deals: 10 }
                ]
            }];

            engine.saveBundleCSV(bundles, '/test/path.csv', 'Test');

            const csvContent = fs.writeFileSync.mock.calls[0][1];
            const lines = csvContent.split('\n');

            // Header + 2 data rows
            expect(lines).toHaveLength(3);
            expect(lines[1]).toContain('sf-anchored-1');
            expect(lines[1]).toContain('Co1');
        });
    });

    describe('saveSkippedCSV', () => {
        it('should create CSV with correct headers', () => {
            const skipped = [{
                companyId: '1',
                companyName: 'No Domain Inc',
                reason: 'no_domain',
                message: 'No domain available for clustering'
            }];

            engine.saveSkippedCSV(skipped, '/test/skipped.csv');

            const csvContent = fs.writeFileSync.mock.calls[0][1];
            const lines = csvContent.split('\n');

            expect(lines[0]).toBe('Company_ID,Company_Name,Reason,Message');
        });

        it('should escape values with special characters', () => {
            const skipped = [{
                companyId: '1',
                companyName: 'Company, Inc "Test"',
                reason: 'no_domain',
                message: 'Has comma, and "quotes"'
            }];

            engine.saveSkippedCSV(skipped, '/test/skipped.csv');

            const csvContent = fs.writeFileSync.mock.calls[0][1];

            expect(csvContent).toContain('"Company, Inc ""Test"""');
        });
    });

    describe('escapeCsv', () => {
        it('should return empty string for null/undefined', () => {
            expect(engine.escapeCsv(null)).toBe('');
            expect(engine.escapeCsv(undefined)).toBe('');
        });

        it('should not escape simple strings', () => {
            expect(engine.escapeCsv('simple')).toBe('simple');
        });

        it('should escape strings with commas', () => {
            expect(engine.escapeCsv('hello,world')).toBe('"hello,world"');
        });

        it('should escape strings with quotes', () => {
            expect(engine.escapeCsv('say "hello"')).toBe('"say ""hello"""');
        });

        it('should escape strings with newlines', () => {
            expect(engine.escapeCsv('line1\nline2')).toBe('"line1\nline2"');
        });
    });

    describe('printSummary', () => {
        it('should print bundle counts', () => {
            engine.bundles = {
                bundleA: [
                    { companyCount: 3 },
                    { companyCount: 2 }
                ],
                bundleB: [
                    { companyCount: 4 }
                ],
                skipped: [{ id: '1' }]
            };

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            engine.printSummary();

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Bundle A (SF-anchored): 2 groups')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Bundle B (HS-only): 1 groups')
            );

            consoleSpy.mockRestore();
        });

        it('should calculate averages correctly', () => {
            engine.bundles = {
                bundleA: [
                    { companyCount: 4 },
                    { companyCount: 6 }
                ],
                bundleB: [],
                skipped: []
            };

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            engine.printSummary();

            // Average should be (4+6)/2 = 5.0
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('5.0')
            );

            consoleSpy.mockRestore();
        });

        it('should show top 5 largest groups', () => {
            engine.bundles = {
                bundleA: [
                    { type: 'sf-anchored', salesforceAccountId: 'sf001', companyCount: 10 },
                    { type: 'sf-anchored', salesforceAccountId: 'sf002', companyCount: 5 }
                ],
                bundleB: [
                    { type: 'hs-only', normalizedDomain: 'big.com', companyCount: 20 }
                ],
                skipped: []
            };

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            engine.printSummary();

            // big.com (20) should be listed first
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('big.com')
            );

            consoleSpy.mockRestore();
        });
    });

    describe('Edge cases', () => {
        it('should handle companies with empty properties object', () => {
            const companies = [
                { id: '1', properties: {} },
                { id: '2', properties: { salesforceaccountid: 'sf001' } },
                { id: '3', properties: { salesforceaccountid: 'sf001' } }
            ];

            expect(() => engine.createBundleA(companies)).not.toThrow();
            expect(() => engine.createBundleB(companies)).not.toThrow();
        });

        it('should handle duplicate domain entries with different casing', () => {
            const companies = [
                { id: '1', properties: { domain: 'EXAMPLE.com' } },
                { id: '2', properties: { domain: 'example.COM' } },
                { id: '3', properties: { domain: 'Example.Com' } }
            ];

            engine.createBundleB(companies);

            expect(engine.bundles.bundleB).toHaveLength(1);
            expect(engine.bundles.bundleB[0].companyCount).toBe(3);
        });

        it('should handle very long domain lists', () => {
            const companies = Array(1000).fill(null).map((_, i) => ({
                id: String(i),
                properties: {
                    domain: i < 500 ? 'common.com' : `unique${i}.com`
                }
            }));

            expect(() => engine.createBundleB(companies)).not.toThrow();
            expect(engine.bundles.bundleB).toHaveLength(1);
            expect(engine.bundles.bundleB[0].companyCount).toBe(500);
        });

        it('should handle special characters in company names', () => {
            const companies = [
                {
                    id: '1',
                    properties: {
                        name: 'Company "A" & Co., Ltd.',
                        domain: 'special.com'
                    }
                },
                {
                    id: '2',
                    properties: {
                        name: 'Company\nWith\nNewlines',
                        domain: 'special.com'
                    }
                }
            ];

            engine.createBundleB(companies);
            engine.saveBundles();

            // Should not throw and should escape properly
            expect(fs.writeFileSync).toHaveBeenCalled();
        });
    });

    describe('Integration', () => {
        it('should complete full clustering workflow', async () => {
            const snapshot = {
                hubspot: {
                    companies: [
                        // SF-anchored duplicates
                        {
                            id: '1',
                            properties: {
                                name: 'Acme Corp',
                                salesforceaccountid: 'sf001',
                                domain: 'acme.com',
                                num_associated_contacts: '100',
                                num_associated_deals: '50'
                            }
                        },
                        {
                            id: '2',
                            properties: {
                                name: 'Acme Corporation',
                                salesforceaccountid: 'sf001',
                                domain: 'acme.com',
                                num_associated_contacts: '20',
                                num_associated_deals: '5'
                            }
                        },
                        // HS-only duplicates
                        {
                            id: '3',
                            properties: {
                                name: 'Example Inc',
                                domain: 'https://www.example.com'
                            }
                        },
                        {
                            id: '4',
                            properties: {
                                name: 'Example LLC',
                                domain: 'EXAMPLE.COM'
                            }
                        },
                        // No domain (should be skipped)
                        {
                            id: '5',
                            properties: {
                                name: 'Unknown Company'
                            }
                        },
                        // Unique company (should not create bundle)
                        {
                            id: '6',
                            properties: {
                                name: 'Unique Corp',
                                domain: 'unique.com'
                            }
                        }
                    ]
                }
            };

            const eng = new ClusteringEngine(snapshot, mockConfig);
            const result = await eng.cluster();

            // Should have 1 SF-anchored bundle
            expect(result.bundleA).toHaveLength(1);
            expect(result.bundleA[0].salesforceAccountId).toBe('sf001');
            expect(result.bundleA[0].companyCount).toBe(2);

            // Should have 1 HS-only bundle (example.com duplicates)
            expect(result.bundleB).toHaveLength(1);
            expect(result.bundleB[0].normalizedDomain).toBe('example.com');
            expect(result.bundleB[0].companyCount).toBe(2);

            // Should have 1 skipped company
            expect(result.skipped).toHaveLength(1);
            expect(result.skipped[0].companyId).toBe('5');

            // Files should be saved
            expect(fs.writeFileSync).toHaveBeenCalledTimes(4); // JSON + bundleA CSV + bundleB CSV + skipped CSV
        });
    });
});
