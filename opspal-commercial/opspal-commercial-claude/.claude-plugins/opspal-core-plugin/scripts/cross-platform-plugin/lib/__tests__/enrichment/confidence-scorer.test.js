/**
 * Tests for Confidence Scorer
 *
 * Comprehensive test suite for the 1-5 confidence scoring system.
 */

'use strict';

const {
    ConfidenceScorer,
    EnrichedValue,
    CONFIDENCE_LEVELS,
    DEFAULT_BASE_SCORES,
    DEFAULT_MODIFIERS
} = require('../../enrichment/confidence-scorer');

describe('ConfidenceScorer', () => {
    let scorer;

    beforeEach(() => {
        scorer = new ConfidenceScorer();
    });

    describe('Exports', () => {
        test('exports ConfidenceScorer class', () => {
            expect(ConfidenceScorer).toBeDefined();
            expect(typeof ConfidenceScorer).toBe('function');
        });

        test('exports EnrichedValue class', () => {
            expect(EnrichedValue).toBeDefined();
            expect(typeof EnrichedValue).toBe('function');
        });

        test('exports CONFIDENCE_LEVELS', () => {
            expect(CONFIDENCE_LEVELS).toBeDefined();
            expect(CONFIDENCE_LEVELS[5]).toBe('VERIFIED');
            expect(CONFIDENCE_LEVELS[4]).toBe('HIGH');
            expect(CONFIDENCE_LEVELS[3]).toBe('MEDIUM');
            expect(CONFIDENCE_LEVELS[2]).toBe('LOW');
            expect(CONFIDENCE_LEVELS[1]).toBe('INFERRED');
        });

        test('exports DEFAULT_BASE_SCORES', () => {
            expect(DEFAULT_BASE_SCORES).toBeDefined();
            expect(DEFAULT_BASE_SCORES.customer_provided).toBe(5);
            expect(DEFAULT_BASE_SCORES.company_website).toBe(4);
            expect(DEFAULT_BASE_SCORES.web_search).toBe(2);
            expect(DEFAULT_BASE_SCORES.ai_inference).toBe(1);
        });

        test('exports DEFAULT_MODIFIERS', () => {
            expect(DEFAULT_MODIFIERS).toBeDefined();
            expect(DEFAULT_MODIFIERS.boosts).toBeDefined();
            expect(DEFAULT_MODIFIERS.penalties).toBeDefined();
        });
    });

    describe('EnrichedValue', () => {
        describe('constructor', () => {
            test('creates instance with value', () => {
                const ev = new EnrichedValue('test@example.com');
                expect(ev.value).toBe('test@example.com');
            });

            test('sets default properties', () => {
                const ev = new EnrichedValue('test');
                expect(ev.confidence).toBe(1);
                expect(ev.level).toBe('INFERRED');
                expect(ev.source).toBe('unknown');
                expect(ev.sourceUrl).toBeNull();
                expect(ev.corroboratedBy).toEqual([]);
                expect(ev.matchType).toBe('exact');
                expect(ev.verified).toBe(false);
            });

            test('accepts custom options', () => {
                const ev = new EnrichedValue('test', {
                    confidence: 4,
                    source: 'company_website',
                    sourceUrl: 'https://example.com',
                    verified: true,
                    corroboratedBy: ['linkedin'],
                    matchType: 'fuzzy',
                    metadata: { custom: true }
                });

                expect(ev.confidence).toBe(4);
                expect(ev.level).toBe('HIGH');
                expect(ev.source).toBe('company_website');
                expect(ev.sourceUrl).toBe('https://example.com');
                expect(ev.verified).toBe(true);
                expect(ev.corroboratedBy).toEqual(['linkedin']);
                expect(ev.matchType).toBe('fuzzy');
                expect(ev.metadata.custom).toBe(true);
            });

            test('sets collectedAt timestamp', () => {
                const before = new Date().toISOString();
                const ev = new EnrichedValue('test');
                const after = new Date().toISOString();

                expect(ev.collectedAt >= before).toBe(true);
                expect(ev.collectedAt <= after).toBe(true);
            });
        });

        describe('meetsThreshold', () => {
            test('returns true when confidence meets threshold', () => {
                const ev = new EnrichedValue('test', { confidence: 4 });
                expect(ev.meetsThreshold(4)).toBe(true);
                expect(ev.meetsThreshold(3)).toBe(true);
            });

            test('returns false when confidence below threshold', () => {
                const ev = new EnrichedValue('test', { confidence: 3 });
                expect(ev.meetsThreshold(4)).toBe(false);
            });
        });

        describe('isExpired', () => {
            test('returns false when no expiresAt set', () => {
                const ev = new EnrichedValue('test');
                expect(ev.isExpired()).toBe(false);
            });

            test('returns false when not expired', () => {
                const future = new Date();
                future.setDate(future.getDate() + 1);
                const ev = new EnrichedValue('test', { expiresAt: future.toISOString() });
                expect(ev.isExpired()).toBe(false);
            });

            test('returns true when expired', () => {
                const past = new Date();
                past.setDate(past.getDate() - 1);
                const ev = new EnrichedValue('test', { expiresAt: past.toISOString() });
                expect(ev.isExpired()).toBe(true);
            });
        });

        describe('isStale', () => {
            test('returns false for recent data', () => {
                const ev = new EnrichedValue('test');
                expect(ev.isStale(365)).toBe(false);
            });

            test('returns true for old data', () => {
                const oldDate = new Date();
                oldDate.setDate(oldDate.getDate() - 400);
                const ev = new EnrichedValue('test', { collectedAt: oldDate.toISOString() });
                expect(ev.isStale(365)).toBe(true);
            });

            test('respects custom days parameter', () => {
                const oldDate = new Date();
                oldDate.setDate(oldDate.getDate() - 40);
                const ev = new EnrichedValue('test', { collectedAt: oldDate.toISOString() });
                expect(ev.isStale(30)).toBe(true);
                expect(ev.isStale(60)).toBe(false);
            });
        });

        describe('toJSON', () => {
            test('returns proper structure', () => {
                const ev = new EnrichedValue('test@example.com', {
                    confidence: 4,
                    source: 'company_website',
                    sourceUrl: 'https://example.com'
                });

                const json = ev.toJSON();

                expect(json.value).toBe('test@example.com');
                expect(json.confidence).toBe(4);
                expect(json.level).toBe('HIGH');
                expect(json.source).toBe('company_website');
                expect(json.sourceUrl).toBe('https://example.com');
                expect(json).toHaveProperty('collectedAt');
            });
        });
    });

    describe('ConfidenceScorer', () => {
        describe('constructor', () => {
            test('creates instance with defaults', () => {
                const s = new ConfidenceScorer();
                expect(s).toBeInstanceOf(ConfidenceScorer);
                expect(s.minScore).toBe(1);
                expect(s.maxScore).toBe(5);
            });

            test('accepts custom base scores', () => {
                const s = new ConfidenceScorer({
                    baseScores: { custom_source: 3.5 }
                });
                expect(s.baseScores.custom_source).toBe(3.5);
                // Should still have defaults
                expect(s.baseScores.company_website).toBe(4);
            });

            test('accepts custom modifiers', () => {
                const s = new ConfidenceScorer({
                    modifiers: {
                        boosts: { custom_boost: 0.8 }
                    }
                });
                expect(s.modifiers.boosts.custom_boost).toBe(0.8);
                // Should still have defaults
                expect(s.modifiers.boosts.corroboration).toBe(0.5);
            });
        });

        describe('getBaseScore', () => {
            test('returns correct score for known sources', () => {
                expect(scorer.getBaseScore('customer_provided')).toBe(5);
                expect(scorer.getBaseScore('company_website')).toBe(4);
                expect(scorer.getBaseScore('linkedin')).toBe(4);
                expect(scorer.getBaseScore('web_search')).toBe(2);
                expect(scorer.getBaseScore('ai_inference')).toBe(1);
            });

            test('normalizes source names', () => {
                expect(scorer.getBaseScore('Company Website')).toBe(4);
                expect(scorer.getBaseScore('company-website')).toBe(4);
            });

            test('returns default for unknown sources', () => {
                expect(scorer.getBaseScore('unknown_source')).toBe(1);
                expect(scorer.getBaseScore(null)).toBe(1);
                expect(scorer.getBaseScore(undefined)).toBe(1);
            });
        });

        describe('calculate', () => {
            test('returns EnrichedValue with 0 confidence for empty values', () => {
                expect(scorer.calculate(null, 'test').confidence).toBe(0);
                expect(scorer.calculate(undefined, 'test').confidence).toBe(0);
                expect(scorer.calculate('', 'test').confidence).toBe(0);
            });

            test('calculates base score from source', () => {
                const result = scorer.calculate('test', 'company_website');
                expect(result.confidence).toBe(4);
                expect(result.source).toBe('company_website');
            });

            test('applies corroboration boost', () => {
                const result = scorer.calculate('test', 'web_search', {
                    corroboratedBy: ['linkedin', 'website']
                });
                // Base 2 + (0.5 * 2 corroboration)
                expect(result.confidence).toBeGreaterThan(2);
            });

            test('applies exact match boost', () => {
                const exact = scorer.calculate('test', 'web_search', { matchType: 'exact' });
                const fuzzy = scorer.calculate('test', 'web_search', { matchType: 'fuzzy' });
                expect(exact.confidence).toBeGreaterThan(fuzzy.confidence);
            });

            test('applies verified boost', () => {
                const verified = scorer.calculate('test', 'web_search', { verified: true });
                const unverified = scorer.calculate('test', 'web_search', { verified: false });
                expect(verified.confidence).toBeGreaterThan(unverified.confidence);
            });

            test('applies recent data boost', () => {
                const recent = scorer.calculate('test', 'web_search', {
                    collectedAt: new Date().toISOString()
                });
                expect(recent.metadata.appliedBoosts.some(b => b.type === 'recent_data')).toBe(true);
            });

            test('applies stale data penalty', () => {
                const oldDate = new Date();
                oldDate.setDate(oldDate.getDate() - 400);
                const stale = scorer.calculate('test', 'company_website', {
                    collectedAt: oldDate.toISOString()
                });
                // Should have penalty applied
                expect(stale.metadata.appliedPenalties.some(p => p.type === 'stale_data')).toBe(true);
            });

            test('applies fuzzy match penalty', () => {
                const result = scorer.calculate('test', 'company_website', {
                    matchType: 'fuzzy',
                    matchConfidence: 0.7
                });
                expect(result.metadata.appliedPenalties.some(p => p.type === 'fuzzy_match')).toBe(true);
            });

            test('clamps score to valid range', () => {
                // Very high score with many boosts
                const high = scorer.calculate('test', 'customer_provided', {
                    verified: true,
                    corroboratedBy: ['a', 'b', 'c', 'd'],
                    isOfficialSource: true
                });
                expect(high.confidence).toBeLessThanOrEqual(5);

                // Very low score with many penalties
                const oldDate = new Date();
                oldDate.setDate(oldDate.getDate() - 500);
                const low = scorer.calculate('test', 'ai_inference', {
                    matchType: 'fuzzy',
                    collectedAt: oldDate.toISOString(),
                    shouldBeVerified: true,
                    isIndirectSource: true
                });
                expect(low.confidence).toBeGreaterThanOrEqual(1);
            });

            test('includes metadata about scoring', () => {
                const result = scorer.calculate('test', 'company_website', {
                    verified: true
                });

                expect(result.metadata).toHaveProperty('baseScore');
                expect(result.metadata).toHaveProperty('appliedBoosts');
                expect(result.metadata).toHaveProperty('appliedPenalties');
            });
        });

        describe('selectBest', () => {
            test('returns non-null value when one is null', () => {
                const v = new EnrichedValue('test', { confidence: 3 });
                expect(scorer.selectBest(null, v)).toBe(v);
                expect(scorer.selectBest(v, null)).toBe(v);
            });

            test('returns higher confidence value', () => {
                const v1 = new EnrichedValue('test1', { confidence: 3 });
                const v2 = new EnrichedValue('test2', { confidence: 4 });
                expect(scorer.selectBest(v1, v2)).toBe(v2);
                expect(scorer.selectBest(v2, v1)).toBe(v2);
            });

            test('prefers verified when confidence equal', () => {
                const v1 = new EnrichedValue('test', { confidence: 4, verified: false });
                const v2 = new EnrichedValue('test', { confidence: 4, verified: true });
                expect(scorer.selectBest(v1, v2)).toBe(v2);
            });

            test('prefers more corroboration when confidence and verified equal', () => {
                const v1 = new EnrichedValue('test', { confidence: 4, corroboratedBy: ['a'] });
                const v2 = new EnrichedValue('test', { confidence: 4, corroboratedBy: ['a', 'b'] });
                expect(scorer.selectBest(v1, v2)).toBe(v2);
            });

            test('prefers more recent when all else equal', () => {
                const older = new Date();
                older.setDate(older.getDate() - 10);
                const v1 = new EnrichedValue('test', { confidence: 4, collectedAt: older.toISOString() });
                const v2 = new EnrichedValue('test', { confidence: 4 });
                expect(scorer.selectBest(v1, v2)).toBe(v2);
            });
        });

        describe('merge', () => {
            test('returns null for empty array', () => {
                expect(scorer.merge([])).toBeNull();
                expect(scorer.merge(null)).toBeNull();
            });

            test('returns single value as-is', () => {
                const v = new EnrichedValue('test', { confidence: 4, source: 'test' });
                expect(scorer.merge([v])).toBe(v);
            });

            test('merges matching values with corroboration', () => {
                const v1 = new EnrichedValue('Acme Inc', { confidence: 3, source: 'website' });
                const v2 = new EnrichedValue('Acme Inc', { confidence: 3, source: 'linkedin' });
                const merged = scorer.merge([v1, v2]);

                // Should have corroboration from both sources
                expect(merged.value).toBe('Acme Inc');
                expect(merged.corroboratedBy.length).toBeGreaterThan(0);
            });

            test('selects group with most corroboration', () => {
                const v1 = new EnrichedValue('Acme', { confidence: 3, source: 'a' });
                const v2 = new EnrichedValue('Acme', { confidence: 3, source: 'b' });
                const v3 = new EnrichedValue('Different', { confidence: 4, source: 'c' });
                const merged = scorer.merge([v1, v2, v3]);

                // "Acme" has more corroboration (2 sources agree)
                expect(merged.value.toLowerCase()).toContain('acme');
            });

            test('handles case-insensitive matching', () => {
                const v1 = new EnrichedValue('ACME INC', { confidence: 3, source: 'a' });
                const v2 = new EnrichedValue('acme inc', { confidence: 3, source: 'b' });
                const merged = scorer.merge([v1, v2]);

                expect(merged.corroboratedBy.length).toBeGreaterThan(0);
            });
        });

        describe('getLevel', () => {
            test('returns correct level for scores', () => {
                expect(scorer.getLevel(5)).toBe('VERIFIED');
                expect(scorer.getLevel(4)).toBe('HIGH');
                expect(scorer.getLevel(3)).toBe('MEDIUM');
                expect(scorer.getLevel(2)).toBe('LOW');
                expect(scorer.getLevel(1)).toBe('INFERRED');
            });

            test('rounds to nearest level', () => {
                expect(scorer.getLevel(4.6)).toBe('VERIFIED');
                expect(scorer.getLevel(4.4)).toBe('HIGH');
                expect(scorer.getLevel(3.5)).toBe('HIGH');
            });

            test('returns UNKNOWN for out of range', () => {
                expect(scorer.getLevel(0)).toBe('UNKNOWN');
                expect(scorer.getLevel(6)).toBe('UNKNOWN');
            });
        });

        describe('meetsThreshold', () => {
            test('returns true when score meets threshold', () => {
                expect(scorer.meetsThreshold(4, 4)).toBe(true);
                expect(scorer.meetsThreshold(5, 4)).toBe(true);
            });

            test('returns false when score below threshold', () => {
                expect(scorer.meetsThreshold(3, 4)).toBe(false);
            });
        });

        describe('static methods', () => {
            test('LEVELS returns confidence levels', () => {
                expect(ConfidenceScorer.LEVELS).toEqual(CONFIDENCE_LEVELS);
            });

            test('DEFAULT_SCORES returns base scores', () => {
                expect(ConfidenceScorer.DEFAULT_SCORES).toEqual(DEFAULT_BASE_SCORES);
            });
        });
    });

    describe('Integration', () => {
        test('full scoring workflow', () => {
            // Simulate enrichment from multiple sources
            const websiteValue = scorer.calculate('Acme Corporation', 'company_website', {
                sourceUrl: 'https://acme.com',
                isOfficialSource: true
            });

            const searchValue = scorer.calculate('Acme Corp', 'web_search', {
                matchType: 'fuzzy',
                matchConfidence: 0.9
            });

            const linkedinValue = scorer.calculate('Acme Corporation', 'linkedin', {
                verified: true
            });

            // Website should have high confidence (4 base + boosts)
            expect(websiteValue.confidence).toBeGreaterThanOrEqual(4);

            // Search should have lower confidence (2 base + penalties)
            expect(searchValue.confidence).toBeLessThan(websiteValue.confidence);

            // LinkedIn with verification should be high
            expect(linkedinValue.confidence).toBeGreaterThanOrEqual(4);

            // Merge should select best and track corroboration
            const merged = scorer.merge([websiteValue, searchValue, linkedinValue]);
            expect(merged.confidence).toBeGreaterThanOrEqual(4);
        });
    });
});
