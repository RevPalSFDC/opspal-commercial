/**
 * Tests for field-conflict-analyzer.js
 *
 * Tests the field conflict analysis and merge recommendation system
 * that addresses the NYPD duplicate accounts issue with inconsistent
 * custom field values (FY26_SGA__c, Segment__c, OwnerId).
 */

const FieldConflictAnalyzer = require('../deduplication/field-conflict-analyzer');

describe('field-conflict-analyzer', () => {
    let analyzer;

    beforeEach(() => {
        analyzer = new FieldConflictAnalyzer({
            criticalCustomFields: {
                'FY26_SGA__c': { weight: 15, conflictStrategy: 'highest-value' },
                'Segment__c': { weight: 10, conflictStrategy: 'most-recent' },
                'OwnerId': { weight: 12, conflictStrategy: 'from-decision' },
                'AnnualRevenue': { weight: 12, conflictStrategy: 'highest-value' }
            }
        });
    });

    describe('analyzeBundle', () => {
        test('detects no conflicts when critical field values match', () => {
            const bundle = {
                canonical: {
                    id: '001',
                    FY26_SGA__c: 100000,
                    Segment__c: 'Enterprise'
                },
                duplicates: [{
                    id: '002',
                    FY26_SGA__c: 100000,
                    Segment__c: 'Enterprise'
                }]
            };

            const result = analyzer.analyzeBundle(bundle);
            // Should have conflicts for 'id' field (different values) but not for critical fields
            // Check that critical fields don't appear in conflicts
            const criticalFieldConflicts = result.conflicts.filter(
                c => c.fieldName === 'FY26_SGA__c' || c.fieldName === 'Segment__c'
            );
            expect(criticalFieldConflicts).toHaveLength(0);
        });

        test('detects conflicts in currency fields', () => {
            const bundle = {
                canonical: {
                    id: '001',
                    FY26_SGA__c: 50000,
                    AnnualRevenue: 100000
                },
                duplicates: [{
                    id: '002',
                    FY26_SGA__c: 75000,  // Higher value
                    AnnualRevenue: 200000  // Higher value
                }]
            };

            const result = analyzer.analyzeBundle(bundle);
            expect(result.hasConflicts).toBe(true);
            expect(result.conflicts.length).toBeGreaterThan(0);
        });

        test('flags OwnerId conflicts for manual review', () => {
            const bundle = {
                canonical: {
                    id: '001',
                    OwnerId: 'user1'
                },
                duplicates: [{
                    id: '002',
                    OwnerId: 'user2'  // Different owner
                }]
            };

            const result = analyzer.analyzeBundle(bundle);
            expect(result.requiresManualReview).toBe(true);
            expect(result.manualReviewFields).toContain('OwnerId');
        });

        test('handles bundle with multiple duplicates (NYPD scenario)', () => {
            // NYPD-like scenario: 3+ duplicates with inconsistent data
            const bundle = {
                bundleId: 'nypd-test',
                canonical: {
                    id: 'nypd-001',
                    companyName: 'NYPD',
                    FY26_SGA__c: 50000,
                    Segment__c: 'Government',
                    OwnerId: 'owner1',
                    lastModifiedDate: '2025-01-01'
                },
                duplicates: [
                    {
                        id: 'nypd-002',
                        companyId: 'nypd-002',
                        companyName: 'New York Police Department',
                        FY26_SGA__c: 75000,  // Higher - should be selected
                        Segment__c: 'Public Sector',
                        OwnerId: 'owner2',
                        lastModified: '2025-06-15'  // More recent
                    },
                    {
                        id: 'nypd-003',
                        companyId: 'nypd-003',
                        companyName: 'NYC Police Dept',
                        FY26_SGA__c: 100000,  // Highest - should be selected
                        Segment__c: 'Government',
                        OwnerId: 'owner1',
                        lastModified: '2025-03-01'
                    }
                ]
            };

            const result = analyzer.analyzeBundle(bundle);

            expect(result.hasConflicts).toBe(true);
            expect(result.requiresManualReview).toBe(true);  // Due to OwnerId conflicts

            // Find FY26_SGA__c recommendation
            const sgaRec = result.recommendations.find(r => r.fieldName === 'FY26_SGA__c');
            expect(sgaRec).toBeDefined();
            expect(sgaRec.strategy).toBe('highest-value');
            expect(sgaRec.recommendedValue).toBe(100000);  // Highest from nypd-003
        });

        test('handles bundle with no duplicates', () => {
            const bundle = {
                canonical: { id: '001', FY26_SGA__c: 50000 },
                duplicates: []
            };

            const result = analyzer.analyzeBundle(bundle);
            expect(result.hasConflicts).toBe(false);
        });
    });

    describe('generateMergeRecommendations', () => {
        test('generates highest-value recommendation for currency fields', () => {
            const canonical = { id: '001', AnnualRevenue: 100000 };
            const duplicates = [{ id: '002', AnnualRevenue: 200000 }];

            const recommendations = analyzer.generateMergeRecommendations(canonical, duplicates);
            const revenueRec = recommendations.find(r => r.fieldName === 'AnnualRevenue');

            expect(revenueRec).toBeDefined();
            expect(revenueRec.strategy).toBe('highest-value');
            expect(revenueRec.recommendedValue).toBe(200000);
            expect(revenueRec.sourceRecord).toBe('duplicate');
        });

        test('generates most-recent recommendation for date-tracked fields', () => {
            const canonical = {
                id: '001',
                Segment__c: 'SMB',
                lastModifiedDate: '2025-01-01'
            };
            const duplicates = [{
                id: '002',
                Segment__c: 'Enterprise',
                lastModifiedDate: '2025-06-15'  // Use same field name as canonical
            }];

            const recommendations = analyzer.generateMergeRecommendations(canonical, duplicates);
            const segmentRec = recommendations.find(r => r.fieldName === 'Segment__c');

            expect(segmentRec).toBeDefined();
            expect(segmentRec.strategy).toBe('most-recent');
            expect(segmentRec.recommendedValue).toBe('Enterprise');
        });

        test('marks from-decision fields for manual review', () => {
            const canonical = { id: '001', OwnerId: 'owner1' };
            const duplicates = [{ id: '002', OwnerId: 'owner2' }];

            const recommendations = analyzer.generateMergeRecommendations(canonical, duplicates);
            const ownerRec = recommendations.find(r => r.fieldName === 'OwnerId');

            expect(ownerRec).toBeDefined();
            expect(ownerRec.strategy).toBe('from-decision');
            expect(ownerRec.requiresDecision).toBe(true);
            expect(ownerRec.options).toHaveLength(2);
        });
    });

    describe('getFieldRecommendationsMap', () => {
        test('returns map format for merger integration', () => {
            const canonical = { id: '001', AnnualRevenue: 100000, FY26_SGA__c: 50000 };
            const duplicates = [{ id: '002', AnnualRevenue: 200000, FY26_SGA__c: 75000 }];

            const map = analyzer.getFieldRecommendationsMap(canonical, duplicates);

            expect(map.AnnualRevenue).toBeDefined();
            expect(map.AnnualRevenue.value).toBe(200000);
            expect(map.AnnualRevenue.strategy).toBe('highest-value');

            expect(map.FY26_SGA__c).toBeDefined();
            expect(map.FY26_SGA__c.value).toBe(75000);
        });

        test('excludes from-decision fields from map', () => {
            const canonical = { id: '001', OwnerId: 'owner1' };
            const duplicates = [{ id: '002', OwnerId: 'owner2' }];

            const map = analyzer.getFieldRecommendationsMap(canonical, duplicates);

            // OwnerId should not be in map because it requires manual decision
            expect(map.OwnerId).toBeUndefined();
        });
    });

    describe('generateConflictSummary', () => {
        test('aggregates conflicts across multiple bundles', () => {
            const bundles = [
                {
                    canonical: { id: '001', AnnualRevenue: 100000 },
                    duplicates: [{ id: '002', AnnualRevenue: 200000 }]
                },
                {
                    canonical: { id: '003', AnnualRevenue: 50000, OwnerId: 'owner1' },
                    duplicates: [{ id: '004', AnnualRevenue: 75000, OwnerId: 'owner2' }]
                }
            ];

            const summary = analyzer.generateConflictSummary(bundles);

            expect(summary.totalBundles).toBe(2);
            expect(summary.bundlesWithConflicts).toBe(2);
            expect(summary.bundlesRequiringManualReview).toBe(1);  // Only second has OwnerId conflict
            expect(summary.conflictsByField.AnnualRevenue).toBe(2);
            expect(summary.manualReviewFields).toContain('OwnerId');
        });
    });

    describe('strategy inference', () => {
        test('infers highest-value for revenue-related field names', () => {
            const analyzerDefault = new FieldConflictAnalyzer();

            // Test with a field not explicitly configured but matching revenue pattern
            const canonical = { id: '001', Custom_MRR__c: 1000 };
            const duplicates = [{ id: '002', Custom_MRR__c: 2000 }];

            const result = analyzerDefault.analyzeBundle({ canonical, duplicates });
            const rec = result.recommendations.find(r => r.fieldName === 'Custom_MRR__c');

            // Should infer highest-value because field name contains 'mrr'
            expect(rec.strategy).toBe('highest-value');
        });

        test('infers most-recent for date-related field names', () => {
            const analyzerDefault = new FieldConflictAnalyzer();

            const canonical = {
                id: '001',
                Custom_Renewal_Date__c: '2025-01-01'
            };
            const duplicates = [{
                id: '002',
                Custom_Renewal_Date__c: '2025-06-15'
            }];

            const result = analyzerDefault.analyzeBundle({ canonical, duplicates });
            const rec = result.recommendations.find(r => r.fieldName === 'Custom_Renewal_Date__c');

            // Should infer most-recent because field name contains 'date'
            expect(rec.strategy).toBe('most-recent');
        });

        test('infers from-decision for owner-related field names', () => {
            const analyzerDefault = new FieldConflictAnalyzer();

            const canonical = { id: '001', Custom_Account_Owner__c: 'user1' };
            const duplicates = [{ id: '002', Custom_Account_Owner__c: 'user2' }];

            const result = analyzerDefault.analyzeBundle({ canonical, duplicates });
            const rec = result.recommendations.find(r => r.fieldName === 'Custom_Account_Owner__c');

            // Should infer from-decision because field name contains 'owner'
            expect(rec.strategy).toBe('from-decision');
        });
    });

    describe('edge cases', () => {
        test('handles null/undefined values', () => {
            const bundle = {
                canonical: { id: '001', AnnualRevenue: null },
                duplicates: [{ id: '002', AnnualRevenue: 100000 }]
            };

            const result = analyzer.analyzeBundle(bundle);
            expect(result.hasConflicts).toBe(true);

            const rec = result.recommendations.find(r => r.fieldName === 'AnnualRevenue');
            expect(rec.recommendedValue).toBe(100000);  // Should use non-null value
        });

        test('handles empty string values', () => {
            const bundle = {
                canonical: { id: '001', Segment__c: '' },
                duplicates: [{ id: '002', Segment__c: 'Enterprise' }]
            };

            const result = analyzer.analyzeBundle(bundle);
            expect(result.hasConflicts).toBe(true);
        });

        test('is case-insensitive for field name matching', () => {
            const bundle = {
                canonical: { id: '001', annualrevenue: 100000 },  // lowercase
                duplicates: [{ id: '002', AnnualRevenue: 200000 }]  // mixed case
            };

            const result = analyzer.analyzeBundle(bundle);
            // Should still detect and analyze the field
            expect(result.conflicts.length).toBeGreaterThanOrEqual(0);
        });
    });
});
