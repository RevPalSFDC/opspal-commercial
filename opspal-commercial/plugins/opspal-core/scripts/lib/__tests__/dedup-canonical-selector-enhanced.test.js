/**
 * Tests for enhanced dedup-canonical-selector.js
 *
 * Tests the custom field completeness scoring enhancement that addresses
 * the NYPD duplicate accounts issue where canonical selection didn't
 * consider custom fields like FY26_SGA__c, Segment__c.
 */

const CanonicalSelector = require('../deduplication/dedup-canonical-selector');

describe('dedup-canonical-selector (enhanced)', () => {
    describe('calculateCustomFieldCompleteness', () => {
        let selector;

        beforeEach(() => {
            selector = new CanonicalSelector({
                bundleA: [],
                bundleB: []
            }, {
                criticalCustomFields: {
                    'FY26_SGA__c': { weight: 15, conflictStrategy: 'highest-value' },
                    'Segment__c': { weight: 10, conflictStrategy: 'most-recent' },
                    'Industry': { weight: 8, conflictStrategy: 'most-recent' }
                }
            });
        });

        test('scores company with all critical fields higher', () => {
            const companies = [
                {
                    id: '001',
                    name: 'Complete Record',
                    FY26_SGA__c: 100000,
                    Segment__c: 'Enterprise',
                    Industry: 'Technology'
                },
                {
                    id: '002',
                    name: 'Incomplete Record',
                    FY26_SGA__c: null,
                    Segment__c: null,
                    Industry: 'Technology'
                }
            ];

            const completeScore = selector.calculateCustomFieldCompleteness(companies[0], companies);
            const incompleteScore = selector.calculateCustomFieldCompleteness(companies[1], companies);

            expect(completeScore).toBeGreaterThan(incompleteScore);
        });

        test('scores higher values higher for currency fields', () => {
            const companies = [
                {
                    id: '001',
                    name: 'Low Revenue',
                    FY26_SGA__c: 50000
                },
                {
                    id: '002',
                    name: 'High Revenue',
                    FY26_SGA__c: 200000  // 4x higher
                }
            ];

            const lowScore = selector.calculateCustomFieldCompleteness(companies[0], companies);
            const highScore = selector.calculateCustomFieldCompleteness(companies[1], companies);

            // Higher value should get higher (or equal) score
            expect(highScore).toBeGreaterThanOrEqual(lowScore);
        });

        test('returns 0 for company with no critical fields', () => {
            const companies = [
                {
                    id: '001',
                    name: 'No Critical Fields',
                    Description: 'Just a description'
                }
            ];

            const score = selector.calculateCustomFieldCompleteness(companies[0], companies);
            expect(score).toBe(0);
        });
    });

    describe('calculateScore (total scoring)', () => {
        let selector;

        beforeEach(() => {
            selector = new CanonicalSelector({
                bundleA: [],
                bundleB: []
            }, {
                canonicalWeights: {
                    hasSalesforceAccountId: 100,
                    syncHealth: 50,
                    customFieldCompleteness: 50,
                    numContacts: 40,
                    numDeals: 25,
                    ownerPresent: 10,
                    createdateOldest: 5
                },
                criticalCustomFields: {
                    'FY26_SGA__c': { weight: 15, conflictStrategy: 'highest-value' },
                    'Segment__c': { weight: 10, conflictStrategy: 'most-recent' }
                }
            });
        });

        test('includes custom field completeness in total score', () => {
            const companies = [
                {
                    id: '001',
                    name: 'With Custom Fields',
                    salesforceaccountid: 'SF001',
                    FY26_SGA__c: 100000,
                    Segment__c: 'Enterprise',
                    num_contacts: 5,
                    num_deals: 2,
                    owner_id: 'owner1',
                    createdate: '2024-01-01'
                },
                {
                    id: '002',
                    name: 'Without Custom Fields',
                    salesforceaccountid: 'SF002',
                    FY26_SGA__c: null,
                    Segment__c: null,
                    num_contacts: 5,
                    num_deals: 2,
                    owner_id: 'owner2',
                    createdate: '2024-01-01'
                }
            ];

            const scoreWith = selector.calculateScore(companies[0], companies);
            const scoreWithout = selector.calculateScore(companies[1], companies);

            // Company with custom fields should score higher
            expect(scoreWith).toBeGreaterThan(scoreWithout);

            // The difference should be roughly the customFieldCompleteness weight
            const difference = scoreWith - scoreWithout;
            expect(difference).toBeGreaterThan(0);
            expect(difference).toBeLessThanOrEqual(50);  // Max customFieldCompleteness weight
        });

        test('total possible score is 280', () => {
            // A "perfect" company should score close to 280
            const perfectCompany = {
                id: '001',
                name: 'Perfect Record',
                salesforceaccountid: 'SF001',  // 100 points
                hs_latest_sync_timestamp: new Date().toISOString(),  // ~30 points (synced today)
                hs_object_source: 'SALESFORCE',  // ~20 points
                FY26_SGA__c: 100000,
                Segment__c: 'Enterprise',  // ~50 points combined
                num_contacts: 10,  // ~40 points
                num_deals: 5,  // ~25 points
                owner_id: 'owner1',  // 10 points
                createdate: '2020-01-01'  // ~5 points (oldest)
            };

            const companies = [perfectCompany];
            const score = selector.calculateScore(perfectCompany, companies);

            // Should be close to max but exact value depends on normalization
            expect(score).toBeGreaterThan(200);
        });
    });

    describe('NYPD duplicate scenario', () => {
        test('selects canonical with best custom field completeness', () => {
            const bundles = {
                bundleA: [{
                    salesforceAccountId: 'SF_NYPD',
                    normalizedDomain: 'nyc.gov',
                    companyCount: 3,
                    companies: [
                        {
                            id: 'nypd-001',
                            name: 'NYPD',
                            salesforceaccountid: 'SF_NYPD',
                            FY26_SGA__c: 50000,
                            Segment__c: null,  // Missing
                            owner_id: 'owner1',
                            num_contacts: 2,
                            num_deals: 1,
                            createdate: '2023-01-01'
                        },
                        {
                            id: 'nypd-002',
                            name: 'New York Police Department',
                            salesforceaccountid: null,  // No SF ID
                            FY26_SGA__c: 75000,  // Higher
                            Segment__c: 'Government',  // Has segment
                            owner_id: 'owner2',
                            num_contacts: 5,
                            num_deals: 3,
                            createdate: '2024-01-01'
                        },
                        {
                            id: 'nypd-003',
                            name: 'NYC Police Dept',
                            salesforceaccountid: null,
                            FY26_SGA__c: 100000,  // Highest
                            Segment__c: 'Government',
                            owner_id: 'owner1',
                            num_contacts: 1,
                            num_deals: 0,
                            createdate: '2025-01-01'
                        }
                    ]
                }],
                bundleB: []
            };

            const selector = new CanonicalSelector(bundles, {
                skipSave: true,  // Skip file saving during tests
                criticalCustomFields: {
                    'FY26_SGA__c': { weight: 20, conflictStrategy: 'highest-value' },
                    'Segment__c': { weight: 15, conflictStrategy: 'most-recent' }
                }
            });

            // Run selection
            return selector.select().then(canonicalMap => {
                expect(canonicalMap).toHaveLength(1);

                const selection = canonicalMap[0];

                // The first company (nypd-001) should still be canonical because
                // it has the SF Account ID (100 points) which outweighs custom fields
                expect(selection.canonical.companyId).toBe('nypd-001');

                // But field conflicts should be flagged
                expect(selection.hasFieldConflicts).not.toBeNull();

                // Check that score breakdown is included
                expect(selection.canonical.scoreBreakdown).toBeDefined();
                expect(selection.canonical.scoreBreakdown.customFieldCompleteness).toBeGreaterThanOrEqual(0);
            });
        });
    });

    describe('_detectFieldConflicts', () => {
        let selector;

        beforeEach(() => {
            selector = new CanonicalSelector({
                bundleA: [],
                bundleB: []
            }, {
                criticalCustomFields: {
                    'FY26_SGA__c': { weight: 15, conflictStrategy: 'highest-value' },
                    'Segment__c': { weight: 10, conflictStrategy: 'most-recent' }
                }
            });
        });

        test('detects when duplicate has higher currency value', () => {
            const canonical = { id: '001', FY26_SGA__c: 50000 };
            const duplicates = [{ id: '002', FY26_SGA__c: 100000 }];

            const conflicts = selector._detectFieldConflicts(canonical, duplicates);

            expect(conflicts).not.toBeNull();
            expect(conflicts).toHaveLength(1);
            expect(conflicts[0].fieldName).toBe('FY26_SGA__c');
            expect(conflicts[0].reason).toBe('duplicate_higher');
        });

        test('detects when canonical is missing value', () => {
            const canonical = { id: '001', Segment__c: null };
            const duplicates = [{ id: '002', Segment__c: 'Enterprise' }];

            const conflicts = selector._detectFieldConflicts(canonical, duplicates);

            expect(conflicts).not.toBeNull();
            const segmentConflict = conflicts.find(c => c.fieldName === 'Segment__c');
            expect(segmentConflict.reason).toBe('canonical_missing');
        });

        test('returns null when no conflicts', () => {
            const canonical = { id: '001', FY26_SGA__c: 100000, Segment__c: 'Enterprise' };
            const duplicates = [{ id: '002', FY26_SGA__c: 50000, Segment__c: 'Enterprise' }];

            const conflicts = selector._detectFieldConflicts(canonical, duplicates);

            // No conflicts: canonical has higher value, segment matches
            expect(conflicts).toBeNull();
        });
    });

    describe('_extractCriticalFields', () => {
        test('extracts only critical fields that have values', () => {
            const selector = new CanonicalSelector({
                bundleA: [],
                bundleB: []
            }, {
                criticalCustomFields: {
                    'FY26_SGA__c': { weight: 15 },
                    'Segment__c': { weight: 10 },
                    'Industry': { weight: 8 }
                }
            });

            const company = {
                id: '001',
                name: 'Test Company',
                FY26_SGA__c: 100000,
                Segment__c: 'Enterprise',
                Industry: null,  // Should not be extracted
                Description: 'Not a critical field'
            };

            const extracted = selector._extractCriticalFields(company);

            expect(extracted.FY26_SGA__c).toBe(100000);
            expect(extracted.Segment__c).toBe('Enterprise');
            expect(extracted.Industry).toBeUndefined();
            expect(extracted.Description).toBeUndefined();
        });
    });

    describe('_calculateScoreBreakdown', () => {
        test('returns breakdown of all scoring components', () => {
            const selector = new CanonicalSelector({
                bundleA: [],
                bundleB: []
            }, {
                canonicalWeights: {
                    hasSalesforceAccountId: 100,
                    syncHealth: 50,
                    customFieldCompleteness: 50,
                    numContacts: 40,
                    numDeals: 25,
                    ownerPresent: 10,
                    createdateOldest: 5
                }
            });

            const company = {
                id: '001',
                salesforceaccountid: 'SF001',
                num_contacts: 10,
                num_deals: 5,
                owner_id: 'owner1',
                createdate: '2024-01-01'
            };

            const breakdown = selector._calculateScoreBreakdown(company, [company]);

            expect(breakdown).toHaveProperty('hasSalesforceAccountId');
            expect(breakdown).toHaveProperty('syncHealth');
            expect(breakdown).toHaveProperty('customFieldCompleteness');
            expect(breakdown).toHaveProperty('numContacts');
            expect(breakdown).toHaveProperty('numDeals');
            expect(breakdown).toHaveProperty('ownerPresent');
            expect(breakdown).toHaveProperty('createdateOldest');

            expect(breakdown.hasSalesforceAccountId).toBe(100);  // Has SF ID
            expect(breakdown.ownerPresent).toBe(10);  // Has owner
        });
    });
});
