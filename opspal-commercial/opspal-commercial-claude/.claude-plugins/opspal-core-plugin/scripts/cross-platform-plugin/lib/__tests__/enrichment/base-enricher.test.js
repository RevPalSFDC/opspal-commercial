/**
 * Tests for Base Enricher
 *
 * @module enrichment/base-enricher.test
 */

'use strict';

const { BaseEnricher, EnrichmentResult } = require('../../enrichment/base-enricher');
const { ConfidenceScorer, EnrichedValue } = require('../../enrichment/confidence-scorer');

describe('BaseEnricher', () => {
    describe('EnrichmentResult', () => {
        describe('constructor', () => {
            test('creates instance with defaults', () => {
                const result = new EnrichmentResult();

                expect(result.success).toBe(false);
                expect(result.source).toBe('unknown');
                expect(result.fields).toEqual({});
                expect(result.errors).toEqual([]);
                expect(result.metadata).toEqual({});
                expect(result.duration_ms).toBe(0);
                expect(result.apiCalls).toBe(0);
                expect(result.cost).toBe(0);
                expect(result.timestamp).toBeDefined();
            });

            test('accepts custom options', () => {
                const result = new EnrichmentResult({
                    success: true,
                    source: 'website',
                    fields: { industry: { confidence: 4 } },
                    errors: [{ field: 'test', message: 'error' }],
                    metadata: { record_id: '123' },
                    duration_ms: 500,
                    apiCalls: 3,
                    cost: 0.5
                });

                expect(result.success).toBe(true);
                expect(result.source).toBe('website');
                expect(result.fields).toHaveProperty('industry');
                expect(result.errors).toHaveLength(1);
                expect(result.metadata.record_id).toBe('123');
                expect(result.duration_ms).toBe(500);
                expect(result.apiCalls).toBe(3);
                expect(result.cost).toBe(0.5);
            });

            test('sets timestamp to current time', () => {
                const before = new Date().toISOString();
                const result = new EnrichmentResult();
                const after = new Date().toISOString();

                expect(result.timestamp >= before).toBe(true);
                expect(result.timestamp <= after).toBe(true);
            });
        });

        describe('addField', () => {
            test('adds enriched field', () => {
                const result = new EnrichmentResult();
                const enrichedValue = new EnrichedValue('Technology', { confidence: 4 });

                result.addField('industry', enrichedValue);

                expect(result.fields.industry).toBe(enrichedValue);
            });

            test('overwrites existing field', () => {
                const result = new EnrichmentResult();
                const value1 = new EnrichedValue('Tech', { confidence: 3 });
                const value2 = new EnrichedValue('Technology', { confidence: 4 });

                result.addField('industry', value1);
                result.addField('industry', value2);

                expect(result.fields.industry).toBe(value2);
            });
        });

        describe('addError', () => {
            test('adds error with field and message', () => {
                const result = new EnrichmentResult();

                result.addError('employee_count', 'Not found on website');

                expect(result.errors).toHaveLength(1);
                expect(result.errors[0].field).toBe('employee_count');
                expect(result.errors[0].message).toBe('Not found on website');
                expect(result.errors[0].timestamp).toBeDefined();
            });

            test('accumulates multiple errors', () => {
                const result = new EnrichmentResult();

                result.addError('field1', 'Error 1');
                result.addError('field2', 'Error 2');

                expect(result.errors).toHaveLength(2);
            });
        });

        describe('hasField', () => {
            test('returns true for field with positive confidence', () => {
                const result = new EnrichmentResult();
                result.addField('industry', new EnrichedValue('Tech', { confidence: 4 }));

                expect(result.hasField('industry')).toBe(true);
            });

            test('returns false for missing field', () => {
                const result = new EnrichmentResult();

                expect(result.hasField('industry')).toBe(false);
            });

            test('returns false for field with zero confidence', () => {
                const result = new EnrichmentResult();
                result.addField('industry', new EnrichedValue(null, { confidence: 0 }));

                expect(result.hasField('industry')).toBe(false);
            });
        });

        describe('fieldCount', () => {
            test('returns count of fields with positive confidence', () => {
                const result = new EnrichmentResult();
                result.addField('industry', new EnrichedValue('Tech', { confidence: 4 }));
                result.addField('employee_count', new EnrichedValue(500, { confidence: 3 }));
                result.addField('failed', new EnrichedValue(null, { confidence: 0 }));

                expect(result.fieldCount).toBe(2);
            });

            test('returns 0 for empty results', () => {
                const result = new EnrichmentResult();

                expect(result.fieldCount).toBe(0);
            });
        });

        describe('toJSON', () => {
            test('returns proper structure', () => {
                const result = new EnrichmentResult({
                    success: true,
                    source: 'website',
                    duration_ms: 100,
                    apiCalls: 2
                });
                result.addField('industry', new EnrichedValue('Tech', { confidence: 4 }));

                const json = result.toJSON();

                expect(json).toHaveProperty('success', true);
                expect(json).toHaveProperty('source', 'website');
                expect(json).toHaveProperty('fields');
                expect(json).toHaveProperty('errors');
                expect(json).toHaveProperty('metadata');
                expect(json).toHaveProperty('duration_ms', 100);
                expect(json).toHaveProperty('apiCalls', 2);
                expect(json).toHaveProperty('timestamp');
            });

            test('serializes EnrichedValue fields to JSON', () => {
                const result = new EnrichmentResult();
                const enrichedValue = new EnrichedValue('Tech', { confidence: 4, source: 'website' });
                result.addField('industry', enrichedValue);

                const json = result.toJSON();

                expect(json.fields.industry).toHaveProperty('value', 'Tech');
                expect(json.fields.industry).toHaveProperty('confidence', 4);
            });

            test('handles plain object fields', () => {
                const result = new EnrichmentResult();
                result.fields.customField = { custom: 'data' };

                const json = result.toJSON();

                expect(json.fields.customField).toEqual({ custom: 'data' });
            });
        });
    });

    describe('BaseEnricher', () => {
        // Create concrete implementation for testing
        class TestEnricher extends BaseEnricher {
            get supportedFields() {
                return ['field1', 'field2', 'field3'];
            }

            async enrich(record, targetFields) {
                const result = new EnrichmentResult({ source: this.name });

                for (const field of targetFields) {
                    if (this.canEnrich(field) && record[field]) {
                        result.addField(field, this.createEnrichedValue(record[field]));
                    }
                }

                result.success = result.fieldCount > 0;
                return result;
            }
        }

        describe('constructor', () => {
            test('creates instance with defaults', () => {
                const enricher = new TestEnricher();

                expect(enricher.name).toBe('base');
                expect(enricher.sourceType).toBe('unknown');
                expect(enricher.timeout_ms).toBe(10000);
                expect(enricher.maxRetries).toBe(2);
                expect(enricher.retryDelay_ms).toBe(1000);
                expect(enricher.enabled).toBe(true);
                expect(enricher.requestsPerMinute).toBe(30);
                expect(enricher.concurrentRequests).toBe(3);
            });

            test('accepts custom options', () => {
                const customScorer = new ConfidenceScorer();
                const enricher = new TestEnricher({
                    name: 'test-enricher',
                    sourceType: 'test_source',
                    timeout_ms: 5000,
                    maxRetries: 3,
                    retryDelay_ms: 500,
                    enabled: false,
                    requestsPerMinute: 60,
                    concurrentRequests: 5,
                    scorer: customScorer
                });

                expect(enricher.name).toBe('test-enricher');
                expect(enricher.sourceType).toBe('test_source');
                expect(enricher.timeout_ms).toBe(5000);
                expect(enricher.maxRetries).toBe(3);
                expect(enricher.retryDelay_ms).toBe(500);
                expect(enricher.enabled).toBe(false);
                expect(enricher.requestsPerMinute).toBe(60);
                expect(enricher.concurrentRequests).toBe(5);
                expect(enricher.scorer).toBe(customScorer);
            });

            test('initializes stats to zero', () => {
                const enricher = new TestEnricher();

                expect(enricher._stats.totalRequests).toBe(0);
                expect(enricher._stats.successfulRequests).toBe(0);
                expect(enricher._stats.failedRequests).toBe(0);
                expect(enricher._stats.totalDuration_ms).toBe(0);
                expect(enricher._stats.fieldsEnriched).toBe(0);
            });
        });

        describe('abstract methods', () => {
            test('enrich throws error in base class', async () => {
                const enricher = new BaseEnricher();

                await expect(enricher.enrich({}, [])).rejects.toThrow('Subclasses must implement enrich()');
            });

            test('supportedFields throws error in base class', () => {
                const enricher = new BaseEnricher();

                expect(() => enricher.supportedFields).toThrow('Subclasses must implement supportedFields getter');
            });
        });

        describe('canEnrich', () => {
            test('returns true for supported field', () => {
                const enricher = new TestEnricher();

                expect(enricher.canEnrich('field1')).toBe(true);
                expect(enricher.canEnrich('field2')).toBe(true);
            });

            test('returns false for unsupported field', () => {
                const enricher = new TestEnricher();

                expect(enricher.canEnrich('unsupported')).toBe(false);
            });
        });

        describe('getSourceType', () => {
            test('returns source type', () => {
                const enricher = new TestEnricher({ sourceType: 'company_website' });

                expect(enricher.getSourceType()).toBe('company_website');
            });
        });

        describe('createEnrichedValue', () => {
            test('creates EnrichedValue using scorer', () => {
                const enricher = new TestEnricher({ sourceType: 'company_website' });

                const value = enricher.createEnrichedValue('Technology', { verified: true });

                expect(value).toBeInstanceOf(EnrichedValue);
                expect(value.value).toBe('Technology');
                expect(value.confidence).toBeGreaterThan(0);
            });

            test('passes signals to scorer', () => {
                const enricher = new TestEnricher({ sourceType: 'company_website' });

                const value = enricher.createEnrichedValue('Test', {
                    corroboratedBy: ['source1', 'source2']
                });

                expect(value.corroboratedBy).toContain('source1');
                expect(value.corroboratedBy).toContain('source2');
            });
        });

        describe('createEmptyResult', () => {
            test('creates failed EnrichmentResult', () => {
                const enricher = new TestEnricher({ name: 'test' });

                const result = enricher.createEmptyResult('No website found');

                expect(result.success).toBe(false);
                expect(result.source).toBe('test');
                expect(result.metadata.failureReason).toBe('No website found');
            });
        });

        describe('_executeWithRetry', () => {
            test('returns result on success', async () => {
                const enricher = new TestEnricher();
                const operation = jest.fn().mockResolvedValue('success');

                const result = await enricher._executeWithRetry(operation);

                expect(result).toBe('success');
                expect(operation).toHaveBeenCalledTimes(1);
            });

            test('retries on failure', async () => {
                const enricher = new TestEnricher({ maxRetries: 2, retryDelay_ms: 10 });
                const operation = jest.fn()
                    .mockRejectedValueOnce(new Error('Fail 1'))
                    .mockRejectedValueOnce(new Error('Fail 2'))
                    .mockResolvedValue('success');

                const result = await enricher._executeWithRetry(operation);

                expect(result).toBe('success');
                expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
            });

            test('throws after max retries exhausted', async () => {
                const enricher = new TestEnricher({ maxRetries: 1, retryDelay_ms: 10 });
                const operation = jest.fn().mockRejectedValue(new Error('Always fails'));

                await expect(enricher._executeWithRetry(operation)).rejects.toThrow('Always fails');
                expect(operation).toHaveBeenCalledTimes(2); // Initial + 1 retry
            });
        });

        describe('_rateLimitedRequest', () => {
            test('tracks request statistics', async () => {
                const enricher = new TestEnricher({ requestsPerMinute: 6000 }); // High limit for test speed
                const requestFn = jest.fn().mockResolvedValue('result');

                await enricher._rateLimitedRequest(requestFn);
                await enricher._rateLimitedRequest(requestFn);

                expect(enricher._stats.totalRequests).toBe(2);
                expect(enricher._stats.successfulRequests).toBe(2);
            });

            test('tracks failed requests', async () => {
                const enricher = new TestEnricher({ requestsPerMinute: 6000 });
                const requestFn = jest.fn().mockRejectedValue(new Error('Failed'));

                await expect(enricher._rateLimitedRequest(requestFn)).rejects.toThrow('Failed');

                expect(enricher._stats.totalRequests).toBe(1);
                expect(enricher._stats.failedRequests).toBe(1);
            });
        });

        describe('_extractDomain', () => {
            test('extracts domain from website field', () => {
                const enricher = new TestEnricher();

                const domain = enricher._extractDomain({ website: 'https://www.example.com/page' });

                expect(domain).toBe('example.com');
            });

            test('extracts domain from domain field', () => {
                const enricher = new TestEnricher();

                const domain = enricher._extractDomain({ domain: 'example.com' });

                expect(domain).toBe('example.com');
            });

            test('extracts domain from email', () => {
                const enricher = new TestEnricher();

                const domain = enricher._extractDomain({ email: 'user@company.com' });

                expect(domain).toBe('company.com');
            });

            test('returns null when no domain found', () => {
                const enricher = new TestEnricher();

                const domain = enricher._extractDomain({ name: 'Company Name' });

                expect(domain).toBeNull();
            });

            test('tries multiple field names', () => {
                const enricher = new TestEnricher();

                expect(enricher._extractDomain({ web_url: 'example.com' })).toBe('example.com');
                expect(enricher._extractDomain({ company_website: 'example.com' })).toBe('example.com');
                expect(enricher._extractDomain({ Website: 'example.com' })).toBe('example.com');
            });
        });

        describe('_normalizeDomain', () => {
            test('removes protocol', () => {
                const enricher = new TestEnricher();

                expect(enricher._normalizeDomain('https://example.com')).toBe('example.com');
                expect(enricher._normalizeDomain('http://example.com')).toBe('example.com');
            });

            test('removes www prefix', () => {
                const enricher = new TestEnricher();

                expect(enricher._normalizeDomain('www.example.com')).toBe('example.com');
            });

            test('removes path', () => {
                const enricher = new TestEnricher();

                expect(enricher._normalizeDomain('example.com/page/subpage')).toBe('example.com');
            });

            test('lowercases domain', () => {
                const enricher = new TestEnricher();

                expect(enricher._normalizeDomain('EXAMPLE.COM')).toBe('example.com');
            });

            test('handles null/empty input', () => {
                const enricher = new TestEnricher();

                expect(enricher._normalizeDomain(null)).toBeNull();
                expect(enricher._normalizeDomain('')).toBeNull();
            });
        });

        describe('getStats', () => {
            test('returns statistics with calculated fields', () => {
                const enricher = new TestEnricher();
                enricher._stats.totalRequests = 10;
                enricher._stats.successfulRequests = 8;
                enricher._stats.failedRequests = 2;
                enricher._stats.totalDuration_ms = 1000;

                const stats = enricher.getStats();

                expect(stats.totalRequests).toBe(10);
                expect(stats.averageDuration_ms).toBe(100);
                expect(stats.successRate).toBe(0.8);
            });

            test('handles zero requests', () => {
                const enricher = new TestEnricher();

                const stats = enricher.getStats();

                expect(stats.averageDuration_ms).toBe(0);
                expect(stats.successRate).toBe(0);
            });
        });

        describe('resetStats', () => {
            test('resets all statistics to zero', () => {
                const enricher = new TestEnricher();
                enricher._stats.totalRequests = 10;
                enricher._stats.successfulRequests = 8;
                enricher._stats.fieldsEnriched = 20;

                enricher.resetStats();

                expect(enricher._stats.totalRequests).toBe(0);
                expect(enricher._stats.successfulRequests).toBe(0);
                expect(enricher._stats.failedRequests).toBe(0);
                expect(enricher._stats.totalDuration_ms).toBe(0);
                expect(enricher._stats.fieldsEnriched).toBe(0);
            });
        });
    });

    describe('Integration', () => {
        class ConcreteEnricher extends BaseEnricher {
            get supportedFields() {
                return ['industry', 'employee_count'];
            }

            async enrich(record, targetFields) {
                const startTime = Date.now();
                const result = new EnrichmentResult({
                    source: this.name,
                    metadata: { record_id: record.id }
                });

                for (const field of targetFields) {
                    if (this.canEnrich(field)) {
                        try {
                            const value = await this._mockFetch(record, field);
                            if (value) {
                                result.addField(field, this.createEnrichedValue(value));
                                this._stats.fieldsEnriched++;
                            }
                        } catch (error) {
                            result.addError(field, error.message);
                        }
                    }
                }

                result.success = result.fieldCount > 0;
                result.duration_ms = Date.now() - startTime;
                this._stats.totalDuration_ms += result.duration_ms;

                return result;
            }

            async _mockFetch(record, field) {
                // Simulate fetching data
                if (field === 'industry' && record.website) {
                    return 'Technology';
                }
                if (field === 'employee_count' && record.website) {
                    return 500;
                }
                return null;
            }
        }

        test('full enrichment workflow', async () => {
            const enricher = new ConcreteEnricher({
                name: 'concrete',
                sourceType: 'company_website'
            });

            const record = { id: '123', website: 'https://example.com' };
            const result = await enricher.enrich(record, ['industry', 'employee_count', 'unknown_field']);

            expect(result.success).toBe(true);
            expect(result.fieldCount).toBe(2);
            expect(result.hasField('industry')).toBe(true);
            expect(result.hasField('employee_count')).toBe(true);
            expect(result.fields.industry.value).toBe('Technology');
            expect(result.fields.employee_count.value).toBe(500);

            const stats = enricher.getStats();
            expect(stats.fieldsEnriched).toBe(2);
        });

        test('handles missing data gracefully', async () => {
            const enricher = new ConcreteEnricher({ name: 'concrete' });

            const record = { id: '456' }; // No website
            const result = await enricher.enrich(record, ['industry']);

            expect(result.success).toBe(false);
            expect(result.fieldCount).toBe(0);
        });
    });
});
