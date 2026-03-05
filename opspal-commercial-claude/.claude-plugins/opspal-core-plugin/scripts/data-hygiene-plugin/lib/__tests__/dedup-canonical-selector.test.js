/**
 * Comprehensive tests for Deduplication Canonical Selector
 *
 * Tests cover:
 * - Scoring algorithm correctness (230 max points)
 * - Component scoring: SF ID, sync health, contacts, deals, owner, age
 * - Bundle processing (A and B types)
 * - Edge cases: ties, empty bundles, missing data
 * - Output file generation
 */

const fs = require('fs');
const path = require('path');

jest.mock('fs');

const CanonicalSelector = require('../dedup-canonical-selector');

describe('CanonicalSelector', () => {
    let selector;
    let mockBundles;
    let mockConfig;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup fs mocks
        fs.existsSync.mockReturnValue(true);
        fs.writeFileSync.mockImplementation(() => {});

        mockBundles = {
            bundleA: [],
            bundleB: []
        };

        mockConfig = {
            output: {
                outputDir: './test-reports'
            }
        };

        selector = new CanonicalSelector(mockBundles, mockConfig);
    });

    describe('constructor', () => {
        it('should initialize with default weights', () => {
            const sel = new CanonicalSelector({}, {});

            expect(sel.weights).toEqual({
                hasSalesforceAccountId: 100,
                syncHealth: 50,
                numContacts: 40,
                numDeals: 25,
                ownerPresent: 10,
                createdateOldest: 5
            });
        });

        it('should use custom weights when provided', () => {
            const customConfig = {
                canonicalWeights: {
                    hasSalesforceAccountId: 200,
                    syncHealth: 100,
                    numContacts: 50,
                    numDeals: 30,
                    ownerPresent: 20,
                    createdateOldest: 10
                }
            };

            const sel = new CanonicalSelector({}, customConfig);

            expect(sel.weights.hasSalesforceAccountId).toBe(200);
            expect(sel.weights.syncHealth).toBe(100);
        });

        it('should use default output directory when not provided', () => {
            const sel = new CanonicalSelector({}, {});

            expect(sel.outputDir).toBe('./dedup-reports');
        });

        it('should initialize empty canonical map', () => {
            expect(selector.canonicalMap).toEqual([]);
        });
    });

    describe('calculateScore', () => {
        describe('Salesforce Account ID scoring (100 points)', () => {
            it('should give 100 points for company with SF account ID', () => {
                const company = {
                    id: '1',
                    salesforceaccountid: '001ABC123'
                };
                const allCompanies = [company];

                const score = selector.calculateScore(company, allCompanies);

                expect(score).toBeGreaterThanOrEqual(100);
            });

            it('should give 0 points for company without SF account ID', () => {
                const company = {
                    id: '1',
                    salesforceaccountid: null
                };
                const allCompanies = [company];

                const score = selector.calculateScore(company, allCompanies);

                expect(score).toBeLessThan(100);
            });
        });

        describe('Sync health scoring (0-50 points)', () => {
            it('should give 30 points for sync today', () => {
                const today = new Date().toISOString();
                const company = {
                    id: '1',
                    hs_latest_sync_timestamp: today
                };

                const syncScore = selector.calculateSyncHealth(company);

                expect(syncScore).toBeGreaterThanOrEqual(30);
            });

            it('should give 20 points for sync this week', () => {
                const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
                const company = {
                    id: '1',
                    hs_latest_sync_timestamp: threeDaysAgo
                };

                const syncScore = selector.calculateSyncHealth(company);

                expect(syncScore).toBeGreaterThanOrEqual(20);
                expect(syncScore).toBeLessThan(30);
            });

            it('should give 10 points for sync this month', () => {
                const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
                const company = {
                    id: '1',
                    hs_latest_sync_timestamp: twoWeeksAgo
                };

                const syncScore = selector.calculateSyncHealth(company);

                expect(syncScore).toBeGreaterThanOrEqual(10);
                expect(syncScore).toBeLessThan(20);
            });

            it('should give 0 points for stale sync', () => {
                const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
                const company = {
                    id: '1',
                    hs_latest_sync_timestamp: twoMonthsAgo
                };

                const syncScore = selector.calculateSyncHealth(company);

                // Only source validation could add points
                expect(syncScore).toBeLessThanOrEqual(20);
            });

            it('should give 20 points for SALESFORCE source', () => {
                const company = {
                    id: '1',
                    hs_object_source: 'CRM_UI_SALESFORCE'
                };

                const syncScore = selector.calculateSyncHealth(company);

                expect(syncScore).toBe(20);
            });

            it('should give 20 points for INTEGRATION source', () => {
                const company = {
                    id: '1',
                    hs_object_source: 'INTEGRATION_API'
                };

                const syncScore = selector.calculateSyncHealth(company);

                expect(syncScore).toBe(20);
            });

            it('should give 0 points when no sync data', () => {
                const company = { id: '1' };

                const syncScore = selector.calculateSyncHealth(company);

                expect(syncScore).toBe(0);
            });

            it('should combine recency and source scores', () => {
                const today = new Date().toISOString();
                const company = {
                    id: '1',
                    hs_latest_sync_timestamp: today,
                    hs_object_source: 'SALESFORCE_SYNC'
                };

                const syncScore = selector.calculateSyncHealth(company);

                // 30 (today) + 20 (source) = 50
                expect(syncScore).toBe(50);
            });
        });

        describe('Contact count normalization (0-40 points)', () => {
            it('should give 40 points for company with max contacts', () => {
                const companies = [
                    { id: '1', num_contacts: 100 },
                    { id: '2', num_contacts: 50 },
                    { id: '3', num_contacts: 25 }
                ];

                const score = selector.calculateScore(companies[0], companies);

                // Company with 100 contacts (max) gets full 40 points
                expect(score).toBeGreaterThanOrEqual(40);
            });

            it('should give proportional points for partial contacts', () => {
                const companies = [
                    { id: '1', num_contacts: 100 },
                    { id: '2', num_contacts: 50 }
                ];

                const fullScore = selector.calculateScore(companies[0], companies);
                const halfScore = selector.calculateScore(companies[1], companies);

                // 50/100 = 0.5 * 40 = 20 points difference
                expect(fullScore - halfScore).toBeCloseTo(20, 1);
            });

            it('should give 0 points when all contacts are 0', () => {
                const companies = [
                    { id: '1', num_contacts: 0 },
                    { id: '2', num_contacts: 0 }
                ];

                const score = selector.calculateScore(companies[0], companies);

                expect(score).toBeLessThan(40);
            });

            it('should handle missing num_contacts gracefully', () => {
                const companies = [
                    { id: '1' },
                    { id: '2', num_contacts: 10 }
                ];

                const score = selector.calculateScore(companies[0], companies);

                // Should not throw
                expect(typeof score).toBe('number');
            });
        });

        describe('Deal count normalization (0-25 points)', () => {
            it('should give 25 points for company with max deals', () => {
                const companies = [
                    { id: '1', num_deals: 50 },
                    { id: '2', num_deals: 25 }
                ];

                const maxScore = selector.calculateScore(companies[0], companies);
                const halfScore = selector.calculateScore(companies[1], companies);

                expect(maxScore - halfScore).toBeCloseTo(12.5, 1);
            });

            it('should handle zero deals', () => {
                const companies = [
                    { id: '1', num_deals: 0 },
                    { id: '2', num_deals: 0 }
                ];

                const score = selector.calculateScore(companies[0], companies);

                expect(typeof score).toBe('number');
            });
        });

        describe('Owner presence scoring (10 points)', () => {
            it('should give 10 points for company with owner', () => {
                const company = { id: '1', owner_id: 'owner123' };
                const companyWithoutOwner = { id: '2' };

                const withOwner = selector.calculateScore(company, [company, companyWithoutOwner]);
                const withoutOwner = selector.calculateScore(companyWithoutOwner, [company, companyWithoutOwner]);

                expect(withOwner - withoutOwner).toBe(10);
            });
        });

        describe('Create date scoring (0-5 points)', () => {
            it('should give higher score to older company', () => {
                const oldDate = '2020-01-01T00:00:00Z';
                const newDate = '2024-01-01T00:00:00Z';

                const companies = [
                    { id: '1', createdate: oldDate },
                    { id: '2', createdate: newDate }
                ];

                const oldScore = selector.calculateScore(companies[0], companies);
                const newScore = selector.calculateScore(companies[1], companies);

                expect(oldScore).toBeGreaterThan(newScore);
            });

            it('should give full points when all dates are the same', () => {
                const sameDate = '2023-01-01T00:00:00Z';

                const companies = [
                    { id: '1', createdate: sameDate },
                    { id: '2', createdate: sameDate }
                ];

                const score = selector.calculateScore(companies[0], companies);

                // Should include the full 5 points
                expect(score).toBeGreaterThanOrEqual(5);
            });

            it('should handle missing createdate', () => {
                const companies = [
                    { id: '1' },
                    { id: '2', createdate: '2023-01-01T00:00:00Z' }
                ];

                const score = selector.calculateScore(companies[0], companies);

                expect(typeof score).toBe('number');
            });
        });

        describe('Combined scoring', () => {
            it('should calculate maximum possible score (230 points)', () => {
                const today = new Date().toISOString();
                const oldDate = '2015-01-01T00:00:00Z';

                const perfectCompany = {
                    id: '1',
                    salesforceaccountid: '001ABC123',
                    hs_latest_sync_timestamp: today,
                    hs_object_source: 'SALESFORCE',
                    num_contacts: 100,
                    num_deals: 50,
                    owner_id: 'owner123',
                    createdate: oldDate
                };

                // Other company in bundle for comparison
                const otherCompany = {
                    id: '2',
                    num_contacts: 100, // Same max to ensure full contact score
                    num_deals: 50,     // Same max to ensure full deal score
                    createdate: new Date().toISOString() // Newer date
                };

                const score = selector.calculateScore(perfectCompany, [perfectCompany, otherCompany]);

                // 100 + 50 + 40 + 25 + 10 + 5 = 230
                expect(score).toBe(230);
            });

            it('should round score to 2 decimal places', () => {
                const company = {
                    id: '1',
                    num_contacts: 33 // Will create non-integer normalized value
                };

                const companies = [
                    company,
                    { id: '2', num_contacts: 100 }
                ];

                const score = selector.calculateScore(company, companies);

                const decimals = String(score).split('.')[1];
                expect(!decimals || decimals.length <= 2).toBe(true);
            });
        });
    });

    describe('processBundle', () => {
        it('should process empty bundle without error', () => {
            selector.processBundle([], 'bundleA');

            expect(selector.canonicalMap).toHaveLength(0);
        });

        it('should process null bundle without error', () => {
            selector.processBundle(null, 'bundleA');

            expect(selector.canonicalMap).toHaveLength(0);
        });

        it('should select highest scoring company as canonical', () => {
            const bundles = [{
                salesforceAccountId: 'sf001',
                companyCount: 3,
                companies: [
                    { id: '1', name: 'Low Score Co', num_contacts: 10, num_deals: 1 },
                    { id: '2', name: 'High Score Co', salesforceaccountid: 'sf001', num_contacts: 100, num_deals: 50, owner_id: 'own1' },
                    { id: '3', name: 'Mid Score Co', num_contacts: 50, num_deals: 20 }
                ]
            }];

            selector.processBundle(bundles, 'bundleA');

            expect(selector.canonicalMap[0].canonical.companyId).toBe('2');
            expect(selector.canonicalMap[0].duplicates).toHaveLength(2);
        });

        it('should correctly identify duplicates', () => {
            const bundles = [{
                salesforceAccountId: 'sf001',
                companyCount: 2,
                companies: [
                    { id: '1', name: 'Company A', salesforceaccountid: 'sf001' },
                    { id: '2', name: 'Company B' }
                ]
            }];

            selector.processBundle(bundles, 'bundleA');

            expect(selector.canonicalMap[0].duplicates).toHaveLength(1);
            expect(selector.canonicalMap[0].duplicates[0].companyId).toBe('2');
        });

        it('should set correct bundleType', () => {
            const bundles = [{
                normalizedDomain: 'example.com',
                companyCount: 2,
                companies: [
                    { id: '1', name: 'Co1' },
                    { id: '2', name: 'Co2' }
                ]
            }];

            selector.processBundle(bundles, 'bundleB');

            expect(selector.canonicalMap[0].bundleType).toBe('bundleB');
        });

        it('should use salesforceAccountId as clusterKey for bundleA', () => {
            const bundles = [{
                salesforceAccountId: 'sf001',
                companyCount: 2,
                companies: [
                    { id: '1', name: 'Co1' },
                    { id: '2', name: 'Co2' }
                ]
            }];

            selector.processBundle(bundles, 'bundleA');

            expect(selector.canonicalMap[0].clusterKey).toBe('sf001');
        });

        it('should use normalizedDomain as clusterKey for bundleB', () => {
            const bundles = [{
                normalizedDomain: 'example.com',
                companyCount: 2,
                companies: [
                    { id: '1', name: 'Co1', domain: 'example.com' },
                    { id: '2', name: 'Co2', domain: 'www.example.com' }
                ]
            }];

            selector.processBundle(bundles, 'bundleB');

            expect(selector.canonicalMap[0].clusterKey).toBe('example.com');
        });

        it('should handle bundles with single company', () => {
            const bundles = [{
                normalizedDomain: 'solo.com',
                companyCount: 1,
                companies: [
                    { id: '1', name: 'Solo Company' }
                ]
            }];

            selector.processBundle(bundles, 'bundleB');

            expect(selector.canonicalMap[0].canonical.companyId).toBe('1');
            expect(selector.canonicalMap[0].duplicates).toHaveLength(0);
        });
    });

    describe('select', () => {
        it('should process both bundle types', async () => {
            const bundles = {
                bundleA: [{
                    salesforceAccountId: 'sf001',
                    companyCount: 2,
                    companies: [
                        { id: '1', name: 'A1' },
                        { id: '2', name: 'A2' }
                    ]
                }],
                bundleB: [{
                    normalizedDomain: 'b.com',
                    companyCount: 2,
                    companies: [
                        { id: '3', name: 'B1' },
                        { id: '4', name: 'B2' }
                    ]
                }]
            };

            const sel = new CanonicalSelector(bundles, mockConfig);
            await sel.select();

            expect(sel.canonicalMap).toHaveLength(2);
        });

        it('should return canonical map', async () => {
            const bundles = {
                bundleA: [{
                    salesforceAccountId: 'sf001',
                    companyCount: 2,
                    companies: [
                        { id: '1', name: 'Co1' },
                        { id: '2', name: 'Co2' }
                    ]
                }],
                bundleB: []
            };

            const sel = new CanonicalSelector(bundles, mockConfig);
            const result = await sel.select();

            expect(result).toEqual(sel.canonicalMap);
        });
    });

    describe('saveCanonicalMap', () => {
        beforeEach(() => {
            selector.canonicalMap = [{
                bundleType: 'bundleA',
                bundleId: 'bundleA-1',
                clusterKey: 'sf001',
                canonical: {
                    companyId: '1',
                    companyName: 'Canonical Co',
                    domain: 'canonical.com',
                    salesforceAccountId: 'sf001',
                    score: 150,
                    num_contacts: 50,
                    num_deals: 10
                },
                duplicates: [{
                    companyId: '2',
                    companyName: 'Duplicate Co',
                    domain: 'duplicate.com',
                    salesforceAccountId: null,
                    score: 75,
                    num_contacts: 25,
                    num_deals: 5
                }],
                totalCompanies: 2,
                duplicateCount: 1
            }];
        });

        it('should save JSON file with correct structure', () => {
            selector.saveCanonicalMap();

            const jsonCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].includes('.json')
            );

            expect(jsonCall).toBeDefined();

            const savedData = JSON.parse(jsonCall[1]);
            expect(savedData.timestamp).toBeDefined();
            expect(savedData.weights).toEqual(selector.weights);
            expect(savedData.totalBundles).toBe(1);
            expect(savedData.canonicalMap).toHaveLength(1);
        });

        it('should save CSV file with correct headers', () => {
            selector.saveCanonicalMap();

            const csvCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].includes('-actions.csv')
            );

            expect(csvCall).toBeDefined();

            const csvContent = csvCall[1];
            const lines = csvContent.split('\n');

            expect(lines[0]).toContain('Action');
            expect(lines[0]).toContain('Bundle_ID');
            expect(lines[0]).toContain('Company_ID');
            expect(lines[0]).toContain('Score');
        });

        it('should save summary text file', () => {
            selector.saveCanonicalMap();

            const summaryCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].includes('-summary.txt')
            );

            expect(summaryCall).toBeDefined();
            expect(summaryCall[1]).toContain('DEDUPLICATION CANONICAL SELECTION SUMMARY');
        });
    });

    describe('saveActionsCSV', () => {
        it('should create KEEP row for canonical company', () => {
            selector.canonicalMap = [{
                bundleId: 'b1',
                clusterKey: 'test.com',
                canonical: {
                    companyId: '1',
                    companyName: 'Canonical',
                    domain: 'test.com',
                    salesforceAccountId: 'sf001',
                    score: 100,
                    num_contacts: 10,
                    num_deals: 5
                },
                duplicates: []
            }];

            selector.saveActionsCSV('/test/path.csv');

            const csvContent = fs.writeFileSync.mock.calls[0][1];
            const lines = csvContent.split('\n');

            expect(lines[1]).toContain('KEEP');
            expect(lines[1]).toContain('Canonical');
        });

        it('should create MERGE_INTO_CANONICAL row for duplicates', () => {
            selector.canonicalMap = [{
                bundleId: 'b1',
                clusterKey: 'test.com',
                canonical: {
                    companyId: '1',
                    companyName: 'Canonical',
                    domain: 'test.com',
                    score: 100
                },
                duplicates: [{
                    companyId: '2',
                    companyName: 'Duplicate',
                    domain: 'test.com',
                    score: 50
                }]
            }];

            selector.saveActionsCSV('/test/path.csv');

            const csvContent = fs.writeFileSync.mock.calls[0][1];
            const lines = csvContent.split('\n');

            expect(lines[2]).toContain('MERGE_INTO_CANONICAL');
            expect(lines[2]).toContain('Duplicate');
        });
    });

    describe('escapeCsv', () => {
        it('should return empty string for null/undefined', () => {
            expect(selector.escapeCsv(null)).toBe('');
            expect(selector.escapeCsv(undefined)).toBe('');
        });

        it('should not escape simple strings', () => {
            expect(selector.escapeCsv('simple')).toBe('simple');
        });

        it('should escape strings with commas', () => {
            expect(selector.escapeCsv('hello,world')).toBe('"hello,world"');
        });

        it('should escape strings with quotes', () => {
            expect(selector.escapeCsv('say "hello"')).toBe('"say ""hello"""');
        });

        it('should escape strings with newlines', () => {
            expect(selector.escapeCsv('line1\nline2')).toBe('"line1\nline2"');
        });

        it('should handle numbers', () => {
            expect(selector.escapeCsv(123)).toBe('123');
        });
    });

    describe('saveSummaryReport', () => {
        it('should include scoring weights', () => {
            selector.canonicalMap = [];
            selector.saveSummaryReport('/test/summary.txt');

            const content = fs.writeFileSync.mock.calls[0][1];

            expect(content).toContain('Scoring Weights:');
            expect(content).toContain('hasSalesforceAccountId');
        });

        it('should include totals', () => {
            selector.canonicalMap = [{
                bundleId: 'b1',
                clusterKey: 'test',
                canonical: { companyName: 'Canonical', companyId: '1', score: 100 },
                duplicates: [{ companyName: 'Dup', companyId: '2' }],
                duplicateCount: 1
            }];

            selector.saveSummaryReport('/test/summary.txt');

            const content = fs.writeFileSync.mock.calls[0][1];

            expect(content).toContain('Total Bundles: 1');
            expect(content).toContain('Total Companies to Merge: 1');
        });

        it('should show top bundles by duplicate count', () => {
            selector.canonicalMap = Array(15).fill(null).map((_, i) => ({
                bundleId: `b${i}`,
                clusterKey: `cluster${i}.com`,
                canonical: { companyName: `Canonical ${i}`, companyId: `${i}`, score: 100 },
                duplicates: Array(i).fill({ companyName: 'Dup' }),
                duplicateCount: i
            }));

            selector.saveSummaryReport('/test/summary.txt');

            const content = fs.writeFileSync.mock.calls[0][1];

            expect(content).toContain('Top 10 Bundles');
            // Highest duplicate count should appear first
            expect(content).toContain('cluster14.com');
        });
    });

    describe('printSummary', () => {
        it('should print bundle type counts', () => {
            selector.canonicalMap = [
                { bundleType: 'bundleA', duplicateCount: 1, clusterKey: 'sf001', canonical: { companyName: 'Co1', score: 100 }, duplicates: [] },
                { bundleType: 'bundleA', duplicateCount: 2, clusterKey: 'sf002', canonical: { companyName: 'Co2', score: 100 }, duplicates: [] },
                { bundleType: 'bundleB', duplicateCount: 1, clusterKey: 'test.com', canonical: { companyName: 'Co3', score: 50 }, duplicates: [] }
            ];

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            selector.printSummary();

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Bundle A (SF-anchored): 2')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Bundle B (HS-only): 1')
            );

            consoleSpy.mockRestore();
        });

        it('should show example selections', () => {
            selector.canonicalMap = [{
                clusterKey: 'example.com',
                canonical: { companyName: 'Example Inc', score: 150 },
                duplicates: [{ companyName: 'Example LLC', score: 75 }]
            }];

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            selector.printSummary();

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Example Inc')
            );

            consoleSpy.mockRestore();
        });
    });

    describe('Edge cases', () => {
        it('should handle tie scores deterministically', () => {
            const bundles = [{
                normalizedDomain: 'tie.com',
                companyCount: 2,
                companies: [
                    { id: '1', name: 'Company A' },
                    { id: '2', name: 'Company B' }
                ]
            }];

            const sel = new CanonicalSelector({ bundleA: [], bundleB: bundles }, mockConfig);
            sel.processBundle(bundles, 'bundleB');

            // Should select consistently (first in sort order after scoring)
            expect(sel.canonicalMap[0].canonical.companyId).toBeDefined();
        });

        it('should handle companies with all null properties', () => {
            const bundles = [{
                normalizedDomain: 'null.com',
                companyCount: 2,
                companies: [
                    { id: '1', name: null, domain: null, num_contacts: null, num_deals: null },
                    { id: '2', name: 'Has Name' }
                ]
            }];

            const sel = new CanonicalSelector({ bundleA: [], bundleB: bundles }, mockConfig);

            expect(() => sel.processBundle(bundles, 'bundleB')).not.toThrow();
        });

        it('should handle very large bundles', () => {
            const largeBundle = {
                normalizedDomain: 'large.com',
                companyCount: 1000,
                companies: Array(1000).fill(null).map((_, i) => ({
                    id: String(i),
                    name: `Company ${i}`,
                    num_contacts: Math.floor(Math.random() * 100),
                    num_deals: Math.floor(Math.random() * 50)
                }))
            };

            const sel = new CanonicalSelector({ bundleA: [], bundleB: [largeBundle] }, mockConfig);

            expect(() => sel.processBundle([largeBundle], 'bundleB')).not.toThrow();
            expect(sel.canonicalMap[0].duplicates).toHaveLength(999);
        });

        it('should handle invalid date formats in createdate', () => {
            const bundles = [{
                normalizedDomain: 'date.com',
                companyCount: 2,
                companies: [
                    { id: '1', name: 'Co1', createdate: 'invalid-date' },
                    { id: '2', name: 'Co2', createdate: '2023-01-01T00:00:00Z' }
                ]
            }];

            const sel = new CanonicalSelector({ bundleA: [], bundleB: bundles }, mockConfig);

            expect(() => sel.processBundle(bundles, 'bundleB')).not.toThrow();
        });

        it('should handle negative contact/deal counts gracefully', () => {
            const bundles = [{
                normalizedDomain: 'neg.com',
                companyCount: 2,
                companies: [
                    { id: '1', name: 'Co1', num_contacts: -5, num_deals: -10 },
                    { id: '2', name: 'Co2', num_contacts: 10, num_deals: 5 }
                ]
            }];

            const sel = new CanonicalSelector({ bundleA: [], bundleB: bundles }, mockConfig);

            expect(() => sel.processBundle(bundles, 'bundleB')).not.toThrow();
        });
    });

    describe('Integration', () => {
        it('should complete full selection workflow', async () => {
            const bundles = {
                bundleA: [{
                    salesforceAccountId: 'sf001',
                    companyCount: 3,
                    companies: [
                        {
                            id: '1',
                            name: 'Winner Corp',
                            salesforceaccountid: 'sf001',
                            num_contacts: 100,
                            num_deals: 50,
                            owner_id: 'owner1',
                            createdate: '2015-01-01T00:00:00Z',
                            hs_latest_sync_timestamp: new Date().toISOString(),
                            hs_object_source: 'SALESFORCE'
                        },
                        {
                            id: '2',
                            name: 'Runner Up Inc',
                            num_contacts: 50,
                            num_deals: 25
                        },
                        {
                            id: '3',
                            name: 'Last Place LLC',
                            num_contacts: 10,
                            num_deals: 5
                        }
                    ]
                }],
                bundleB: [{
                    normalizedDomain: 'example.com',
                    companyCount: 2,
                    companies: [
                        { id: '4', name: 'Example A', domain: 'example.com', num_contacts: 20 },
                        { id: '5', name: 'Example B', domain: 'www.example.com', num_contacts: 10 }
                    ]
                }]
            };

            const sel = new CanonicalSelector(bundles, mockConfig);
            const result = await sel.select();

            expect(result).toHaveLength(2);

            // Bundle A winner should be the one with SF ID
            expect(result[0].canonical.companyId).toBe('1');
            expect(result[0].canonical.companyName).toBe('Winner Corp');

            // Bundle B winner should be the one with more contacts
            expect(result[1].canonical.companyId).toBe('4');

            // Files should be saved
            expect(fs.writeFileSync).toHaveBeenCalledTimes(3);
        });
    });
});
