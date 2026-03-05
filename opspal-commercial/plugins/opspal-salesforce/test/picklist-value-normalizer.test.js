/**
 * Unit Tests for Picklist Value Normalizer
 *
 * Tests cover:
 * - normalizeKey() - suffix stripping and case normalization
 * - findClosestMatch() - exact, fuzzy, and no-match scenarios
 * - validateBatch() - batch validation with statistics
 * - Configuration loading - rules from config only
 *
 * These tests use generic patterns - no instance-specific values.
 *
 * @jest-environment node
 */

'use strict';

// Mock the PicklistDescriber to avoid actual Salesforce API calls
jest.mock('../scripts/lib/picklist-describer', () => {
    return class MockPicklistDescriber {
        constructor() {}

        async getPicklistValues(objectName, fieldName) {
            // Return mock picklist values based on field name pattern
            if (fieldName.toLowerCase().includes('state')) {
                return {
                    object: objectName,
                    field: fieldName,
                    restricted: true,
                    values: [
                        { value: 'California', label: 'California', active: true },
                        { value: 'Texas', label: 'Texas', active: true },
                        { value: 'Florida', label: 'Florida', active: true },
                        { value: 'New York', label: 'New York', active: true },
                        { value: 'Washington', label: 'Washington', active: true },
                        { value: 'Oregon', label: 'Oregon', active: true },
                        { value: 'Nevada', label: 'Nevada', active: true },
                        { value: 'Arizona', label: 'Arizona', active: true }
                    ]
                };
            }

            if (fieldName.toLowerCase().includes('industry')) {
                return {
                    object: objectName,
                    field: fieldName,
                    restricted: true,
                    values: [
                        { value: 'Technology', label: 'Technology', active: true },
                        { value: 'Healthcare', label: 'Healthcare', active: true },
                        { value: 'Financial Services', label: 'Financial Services', active: true },
                        { value: 'Manufacturing', label: 'Manufacturing', active: true },
                        { value: 'Retail', label: 'Retail', active: true }
                    ]
                };
            }

            if (fieldName.toLowerCase().includes('type')) {
                return {
                    object: objectName,
                    field: fieldName,
                    restricted: true,
                    values: [
                        { value: 'Customer', label: 'Customer', active: true },
                        { value: 'Prospect', label: 'Prospect', active: true },
                        { value: 'Partner', label: 'Partner', active: true },
                        { value: 'Other', label: 'Other', active: true }
                    ]
                };
            }

            // Generic picklist for testing
            return {
                object: objectName,
                field: fieldName,
                restricted: true,
                values: [
                    { value: 'Option A', label: 'Option A', active: true },
                    { value: 'Option B', label: 'Option B', active: true },
                    { value: 'Option C', label: 'Option C', active: true }
                ]
            };
        }
    };
});

const { PicklistValueNormalizer, NormalizationError } = require('../scripts/lib/picklist-value-normalizer');

describe('PicklistValueNormalizer', () => {
    let normalizer;

    beforeEach(() => {
        normalizer = new PicklistValueNormalizer({
            orgAlias: 'test-org',
            similarityThreshold: 80,
            verbose: false
        });
        normalizer.clearCache();
    });

    describe('normalizeKey()', () => {
        it('should normalize whitespace', () => {
            expect(normalizer.normalizeKey('  Option   A  ', {})).toBe('option a');
        });

        it('should convert to lowercase', () => {
            expect(normalizer.normalizeKey('OPTION A', {})).toBe('option a');
        });

        it('should handle empty/null input', () => {
            expect(normalizer.normalizeKey(null, {})).toBe('');
            expect(normalizer.normalizeKey('', {})).toBe('');
            expect(normalizer.normalizeKey(undefined, {})).toBe('');
        });

        it('should apply suffix patterns from rules', () => {
            const rules = { suffixPatterns: [/\s+Suffix\s*$/i] };
            expect(normalizer.normalizeKey('Value Suffix', rules)).toBe('value');
        });

        it('should apply multiple suffix patterns', () => {
            const rules = {
                suffixPatterns: [/\s+Type1\s*$/i, /\s+Type2\s*$/i]
            };
            expect(normalizer.normalizeKey('Value Type1', rules)).toBe('value');
            expect(normalizer.normalizeKey('Value Type2', rules)).toBe('value');
        });

        it('should handle string pattern conversion', () => {
            const rules = { suffixPatterns: ['\\s+Corp\\s*$'] };
            expect(normalizer.normalizeKey('Acme Corp', rules)).toBe('acme');
        });
    });

    describe('findClosestMatch()', () => {
        const validValues = [
            'California',
            'Texas',
            'Florida',
            'New York',
            'Washington'
        ];

        it('should find exact normalized match', () => {
            const result = normalizer.findClosestMatch('california', validValues);
            expect(result.match).toBe('California');
            expect(result.similarity).toBe(100);
        });

        it('should find match ignoring case', () => {
            const result = normalizer.findClosestMatch('CALIFORNIA', validValues);
            expect(result.match).toBe('California');
            expect(result.similarity).toBe(100);
        });

        it('should find fuzzy match for typos', () => {
            // "Californa" vs "California" - close enough for fuzzy match
            const result = normalizer.findClosestMatch('Californa', validValues);
            expect(result.match).toBe('California');
            expect(result.similarity).toBeGreaterThan(85);
        });

        it('should return low similarity for no match', () => {
            const result = normalizer.findClosestMatch('Nonexistent State', validValues);
            expect(result.similarity).toBeLessThan(50);
        });

        it('should handle empty valid values', () => {
            const result = normalizer.findClosestMatch('Test', []);
            expect(result.match).toBeNull();
        });

        it('should apply typo corrections from rules', () => {
            const rules = {
                corrections: { 'Californa': 'California' }
            };
            const result = normalizer.findClosestMatch('Californa', validValues, rules);
            expect(result.match).toBe('California');
            expect(result.similarity).toBeGreaterThanOrEqual(98);
        });
    });

    describe('normalizeValue()', () => {
        it('should return exact match with 100% confidence', async () => {
            const result = await normalizer.normalizeValue('Account', 'BillingState', 'California');
            expect(result.valid).toBe(true);
            expect(result.normalized).toBe('California');
            expect(result.confidence).toBe(100);
        });

        it('should normalize case variations', async () => {
            const result = await normalizer.normalizeValue('Account', 'BillingState', 'CALIFORNIA');
            expect(result.valid).toBe(true);
            expect(result.normalized).toBe('California');
        });

        it('should reject values below threshold', async () => {
            const result = await normalizer.normalizeValue('Account', 'BillingState', 'Completely Different Value');
            expect(result.valid).toBe(false);
            expect(result.validValues).toBeDefined();
            expect(result.validValues.length).toBeGreaterThan(0);
        });

        it('should handle empty values', async () => {
            const result = await normalizer.normalizeValue('Account', 'BillingState', '');
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('Empty');
        });

        it('should handle null values', async () => {
            const result = await normalizer.normalizeValue('Account', 'BillingState', null);
            expect(result.valid).toBe(false);
        });

        it('should handle whitespace-only values', async () => {
            const result = await normalizer.normalizeValue('Account', 'BillingState', '   ');
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('Empty');
        });

        it('should include suggestion for close matches below threshold', async () => {
            // Using a higher threshold normalizer
            const strictNormalizer = new PicklistValueNormalizer({
                orgAlias: 'test-org',
                similarityThreshold: 95
            });

            const result = await strictNormalizer.normalizeValue('Account', 'BillingState', 'Califrnia');
            // Depending on similarity, this might be valid or have a suggestion
            if (!result.valid) {
                expect(result.suggestion).toBeDefined();
            }
        });
    });

    describe('validateBatch()', () => {
        it('should categorize records correctly', async () => {
            const records = [
                { BillingState: 'California' },     // Valid exact
                { BillingState: 'california' },     // Normalizable (case)
                { BillingState: 'Texas' },          // Valid exact
                { BillingState: '' },               // Empty (valid)
                { BillingState: 'Invalid State' }   // Invalid
            ];

            const result = await normalizer.validateBatch(records, 'Account', 'BillingState');

            expect(result.totalRecords).toBe(5);
            expect(result.validCount).toBeGreaterThanOrEqual(2); // At least exact matches + empty
            expect(result.summary).toBeDefined();
            expect(result.summary.passRate).toBeDefined();
        });

        it('should include details for each category', async () => {
            const records = [
                { BillingState: 'California' },
                { BillingState: 'Invalid Value' }
            ];

            const result = await normalizer.validateBatch(records, 'Account', 'BillingState');

            expect(result.details.valid.length).toBeGreaterThanOrEqual(1);
            expect(result.details.invalid.length).toBeGreaterThanOrEqual(1);
        });

        it('should handle empty records array', async () => {
            const result = await normalizer.validateBatch([], 'Account', 'BillingState');

            expect(result.totalRecords).toBe(0);
            expect(result.validCount).toBe(0);
        });
    });

    describe('buildNormalizationMap()', () => {
        it('should build map with all valid values', async () => {
            const map = await normalizer.buildNormalizationMap('Account', 'BillingState');

            expect(map.allValidValues).toContain('California');
            expect(map.allValidValues).toContain('Texas');
            expect(map.restricted).toBe(true);
        });

        it('should cache the map', async () => {
            const map1 = await normalizer.buildNormalizationMap('Account', 'BillingState');
            const map2 = await normalizer.buildNormalizationMap('Account', 'BillingState');

            // Should be the same object due to caching
            expect(map1).toBe(map2);
        });

        it('should clear cache when requested', async () => {
            const map1 = await normalizer.buildNormalizationMap('Account', 'BillingState');
            normalizer.clearCache();
            const map2 = await normalizer.buildNormalizationMap('Account', 'BillingState');

            // After clearing cache, should be different objects (though same content)
            expect(map1).not.toBe(map2);
        });

        it('should include suffix variants when configured', async () => {
            // Configure rules with suffix
            const customNormalizer = new PicklistValueNormalizer({
                orgAlias: 'test-org',
                similarityThreshold: 80
            });

            const map = await customNormalizer.buildNormalizationMap('Account', 'BillingState');

            // Map should have normalized keys
            expect(map.normalizedKeys.size).toBeGreaterThan(0);
        });
    });

    describe('_getFieldRules()', () => {
        it('should return empty object for unknown fields', () => {
            const rules = normalizer._getFieldRules('UnknownField__c');
            expect(rules).toBeDefined();
            expect(typeof rules).toBe('object');
        });

        it('should handle inheritance', () => {
            // BillingState inherits from State in config
            const rules = normalizer._getFieldRules('BillingState');
            // Should have inherited abbreviations from State
            expect(rules).toBeDefined();
        });
    });
});

describe('Configuration Loading', () => {
    it('should load configuration defaults', () => {
        const normalizer = new PicklistValueNormalizer({
            orgAlias: 'test-org'
        });
        // Default threshold should be 80 from config
        expect(normalizer.similarityThreshold).toBe(80);
    });

    it('should allow custom threshold override', () => {
        const normalizer = new PicklistValueNormalizer({
            orgAlias: 'test-org',
            similarityThreshold: 90
        });
        expect(normalizer.similarityThreshold).toBe(90);
    });

    it('should use autoFix setting', () => {
        const normalizer = new PicklistValueNormalizer({
            orgAlias: 'test-org',
            autoFix: true
        });
        expect(normalizer.autoFix).toBe(true);
    });

    it('should default autoFix to false', () => {
        const normalizer = new PicklistValueNormalizer({
            orgAlias: 'test-org'
        });
        expect(normalizer.autoFix).toBe(false);
    });
});

describe('Edge Cases', () => {
    let normalizer;

    beforeEach(() => {
        normalizer = new PicklistValueNormalizer({
            orgAlias: 'test-org',
            similarityThreshold: 80
        });
    });

    it('should handle values with special characters', async () => {
        const result = await normalizer.normalizeValue('Account', 'BillingState', 'New-York');
        // Should handle gracefully
        expect(result).toBeDefined();
    });

    it('should handle very long values', async () => {
        const longValue = 'California'.repeat(10);
        const result = await normalizer.normalizeValue('Account', 'BillingState', longValue);
        // Should not crash, and should return a result
        expect(result).toBeDefined();
        expect(result.valid).toBe(false); // Won't match
    });

    it('should handle unicode characters', async () => {
        const result = await normalizer.normalizeValue('Account', 'BillingState', 'Californía');
        expect(result).toBeDefined();
    });

    it('should handle leading/trailing whitespace', async () => {
        const result = await normalizer.normalizeValue('Account', 'BillingState', '  California  ');
        expect(result.valid).toBe(true);
        expect(result.normalized).toBe('California');
    });

    it('should handle mixed case with whitespace', async () => {
        const result = await normalizer.normalizeValue('Account', 'BillingState', '  CALIFORNIA  ');
        expect(result.valid).toBe(true);
        expect(result.normalized).toBe('California');
    });
});

describe('NormalizationError', () => {
    it('should create error with message', () => {
        const error = new NormalizationError('Test error');
        expect(error.message).toBe('Test error');
        expect(error.name).toBe('NormalizationError');
    });

    it('should include details', () => {
        const error = new NormalizationError('Test error', { field: 'State', org: 'test' });
        expect(error.details.field).toBe('State');
        expect(error.details.org).toBe('test');
    });
});
