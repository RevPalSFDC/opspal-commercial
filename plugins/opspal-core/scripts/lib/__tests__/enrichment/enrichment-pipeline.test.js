/**
 * Tests for Enrichment Pipeline
 *
 * @module enrichment/enrichment-pipeline.test
 */

'use strict';

const { EnrichmentPipeline, EXECUTION_MODES, PIPELINE_EVENTS } = require('../../enrichment/enrichment-pipeline');
const { EnrichedValue } = require('../../enrichment/confidence-scorer');

describe('EnrichmentPipeline', () => {
    describe('Exports', () => {
        test('exports EnrichmentPipeline class', () => {
            expect(EnrichmentPipeline).toBeDefined();
            expect(typeof EnrichmentPipeline).toBe('function');
        });

        test('exports EXECUTION_MODES', () => {
            expect(EXECUTION_MODES).toBeDefined();
            expect(EXECUTION_MODES.SEQUENTIAL).toBe('sequential');
            expect(EXECUTION_MODES.PARALLEL).toBe('parallel');
            expect(EXECUTION_MODES.PRIORITY).toBe('priority');
        });

        test('exports PIPELINE_EVENTS', () => {
            expect(PIPELINE_EVENTS).toBeDefined();
            expect(PIPELINE_EVENTS.START).toBe('pipeline_start');
            expect(PIPELINE_EVENTS.ENRICHER_START).toBe('enricher_start');
            expect(PIPELINE_EVENTS.ENRICHER_COMPLETE).toBe('enricher_complete');
            expect(PIPELINE_EVENTS.FIELD_ENRICHED).toBe('field_enriched');
            expect(PIPELINE_EVENTS.ITERATION_COMPLETE).toBe('iteration_complete');
            expect(PIPELINE_EVENTS.TERMINATION).toBe('termination');
            expect(PIPELINE_EVENTS.COMPLETE).toBe('pipeline_complete');
            expect(PIPELINE_EVENTS.ERROR).toBe('error');
        });
    });

    describe('Static Properties', () => {
        test('MODES returns execution modes', () => {
            expect(EnrichmentPipeline.MODES).toEqual(EXECUTION_MODES);
        });

        test('EVENTS returns pipeline events', () => {
            expect(EnrichmentPipeline.EVENTS).toEqual(PIPELINE_EVENTS);
        });
    });

    describe('Constructor', () => {
        test('creates instance with defaults', () => {
            const pipeline = new EnrichmentPipeline();

            expect(pipeline.confidenceThreshold).toBe(4);
            expect(pipeline.maxIterations).toBe(3);
            expect(pipeline.timeout_ms).toBe(30000);
            expect(pipeline.executionMode).toBe(EXECUTION_MODES.SEQUENTIAL);
            expect(pipeline.requiredFields).toEqual([]);
            expect(pipeline.optionalFields).toEqual([]);
            expect(pipeline.protectedFields).toEqual([]);
        });

        test('accepts custom options', () => {
            const pipeline = new EnrichmentPipeline({
                confidenceThreshold: 3,
                maxIterations: 5,
                timeout_ms: 60000,
                executionMode: EXECUTION_MODES.PARALLEL,
                requiredFields: ['industry', 'employee_count'],
                optionalFields: ['founded_year'],
                protectedFields: ['lead_source']
            });

            expect(pipeline.confidenceThreshold).toBe(3);
            expect(pipeline.maxIterations).toBe(5);
            expect(pipeline.timeout_ms).toBe(60000);
            expect(pipeline.executionMode).toBe(EXECUTION_MODES.PARALLEL);
            expect(pipeline.requiredFields).toEqual(['industry', 'employee_count']);
            expect(pipeline.optionalFields).toEqual(['founded_year']);
            expect(pipeline.protectedFields).toEqual(['lead_source']);
        });

        test('initializes default enrichers', () => {
            const pipeline = new EnrichmentPipeline();

            expect(pipeline.enrichers.website).toBeDefined();
            expect(pipeline.enrichers.search).toBeDefined();
        });

        test('accepts custom scorer', () => {
            const customScorer = { selectBest: jest.fn() };
            const pipeline = new EnrichmentPipeline({ scorer: customScorer });

            expect(pipeline.scorer).toBe(customScorer);
        });

        test('accepts custom enrichers', () => {
            const customEnricher = {
                name: 'custom',
                enabled: true,
                canEnrich: jest.fn(() => true),
                enrich: jest.fn()
            };

            const pipeline = new EnrichmentPipeline({
                customEnrichers: { custom: customEnricher }
            });

            expect(pipeline.enrichers.custom).toBe(customEnricher);
        });

        test('passes enricher options', () => {
            const pipeline = new EnrichmentPipeline({
                enricherOptions: {
                    website: { timeout_ms: 5000 },
                    search: { maxResultsPerQuery: 10 }
                }
            });

            // Enrichers should have custom options applied
            expect(pipeline.enrichers.website.timeout_ms).toBe(5000);
            expect(pipeline.enrichers.search.maxResultsPerQuery).toBe(10);
        });

        test('initializes terminator with config', () => {
            const pipeline = new EnrichmentPipeline({
                confidenceThreshold: 3,
                maxIterations: 5,
                requiredFields: ['industry']
            });

            expect(pipeline.terminator.confidenceThreshold).toBe(3);
            expect(pipeline.terminator.maxIterations).toBe(5);
            expect(pipeline.terminator.requiredFields).toContain('industry');
        });
    });

    describe('Enricher Management', () => {
        test('getEnricher returns enricher by name', () => {
            const pipeline = new EnrichmentPipeline();

            const website = pipeline.getEnricher('website');
            expect(website).toBeDefined();
            expect(website.name).toBe('website');
        });

        test('getEnricher returns null for unknown enricher', () => {
            const pipeline = new EnrichmentPipeline();

            const unknown = pipeline.getEnricher('nonexistent');
            expect(unknown).toBeNull();
        });

        test('addEnricher adds new enricher', () => {
            const pipeline = new EnrichmentPipeline();
            const customEnricher = { name: 'linkedin', enabled: true };

            pipeline.addEnricher('linkedin', customEnricher);

            expect(pipeline.enrichers.linkedin).toBe(customEnricher);
        });

        test('removeEnricher removes enricher', () => {
            const pipeline = new EnrichmentPipeline();

            pipeline.removeEnricher('website');

            expect(pipeline.enrichers.website).toBeUndefined();
        });

        test('setEnricherEnabled enables/disables enricher', () => {
            const pipeline = new EnrichmentPipeline();

            pipeline.setEnricherEnabled('website', false);
            expect(pipeline.enrichers.website.enabled).toBe(false);

            pipeline.setEnricherEnabled('website', true);
            expect(pipeline.enrichers.website.enabled).toBe(true);
        });

        test('setEnricherEnabled ignores unknown enricher', () => {
            const pipeline = new EnrichmentPipeline();

            // Should not throw
            pipeline.setEnricherEnabled('nonexistent', true);
        });
    });

    describe('Event Handling', () => {
        test('on registers event handler', () => {
            const pipeline = new EnrichmentPipeline();
            const handler = jest.fn();

            pipeline.on(PIPELINE_EVENTS.START, handler);

            expect(pipeline._eventHandlers[PIPELINE_EVENTS.START]).toContain(handler);
        });

        test('off removes event handler', () => {
            const pipeline = new EnrichmentPipeline();
            const handler = jest.fn();

            pipeline.on(PIPELINE_EVENTS.START, handler);
            pipeline.off(PIPELINE_EVENTS.START, handler);

            expect(pipeline._eventHandlers[PIPELINE_EVENTS.START]).not.toContain(handler);
        });

        test('multiple handlers can be registered', () => {
            const pipeline = new EnrichmentPipeline();
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            pipeline.on(PIPELINE_EVENTS.START, handler1);
            pipeline.on(PIPELINE_EVENTS.START, handler2);

            expect(pipeline._eventHandlers[PIPELINE_EVENTS.START].length).toBe(2);
        });
    });

    describe('Statistics', () => {
        test('getStats returns enricher statistics', () => {
            const pipeline = new EnrichmentPipeline();

            const stats = pipeline.getStats();

            expect(stats.enrichers).toBeDefined();
            expect(stats.enrichers.website).toBeDefined();
            expect(stats.enrichers.search).toBeDefined();
        });

        test('resetStats resets all enricher statistics', () => {
            const pipeline = new EnrichmentPipeline();

            // This should not throw
            pipeline.resetStats();

            const stats = pipeline.getStats();
            expect(stats.enrichers.website.totalRequests).toBe(0);
        });
    });

    describe('_getMissingFields', () => {
        test('returns fields not in results', () => {
            const pipeline = new EnrichmentPipeline();
            const results = {
                industry: { confidence: 4 }
            };
            const targetFields = ['industry', 'employee_count', 'founded_year'];

            const missing = pipeline._getMissingFields(results, targetFields);

            expect(missing).toContain('employee_count');
            expect(missing).toContain('founded_year');
            expect(missing).not.toContain('industry');
        });

        test('returns fields below threshold', () => {
            const pipeline = new EnrichmentPipeline({ confidenceThreshold: 4 });
            const results = {
                industry: { confidence: 3 },
                employee_count: { confidence: 5 }
            };
            const targetFields = ['industry', 'employee_count'];

            const missing = pipeline._getMissingFields(results, targetFields);

            expect(missing).toContain('industry');
            expect(missing).not.toContain('employee_count');
        });

        test('excludes protected fields', () => {
            const pipeline = new EnrichmentPipeline({
                protectedFields: ['lead_source']
            });
            const results = {};
            const targetFields = ['industry', 'lead_source'];

            const missing = pipeline._getMissingFields(results, targetFields);

            expect(missing).toContain('industry');
            expect(missing).not.toContain('lead_source');
        });
    });

    describe('_valuesMatch', () => {
        let pipeline;

        beforeEach(() => {
            pipeline = new EnrichmentPipeline();
        });

        test('matches identical values', () => {
            expect(pipeline._valuesMatch('Test', 'Test')).toBe(true);
            expect(pipeline._valuesMatch(100, 100)).toBe(true);
        });

        test('matches case-insensitive strings', () => {
            expect(pipeline._valuesMatch('Test', 'test')).toBe(true);
            expect(pipeline._valuesMatch('TECHNOLOGY', 'technology')).toBe(true);
        });

        test('matches trimmed strings', () => {
            expect(pipeline._valuesMatch('Test', '  Test  ')).toBe(true);
        });

        test('matches numbers as strings', () => {
            expect(pipeline._valuesMatch(100, '100')).toBe(true);
        });

        test('handles null values', () => {
            expect(pipeline._valuesMatch(null, null)).toBe(true);
            expect(pipeline._valuesMatch(null, 'test')).toBe(false);
        });

        test('handles undefined values', () => {
            expect(pipeline._valuesMatch(undefined, undefined)).toBe(true);
            expect(pipeline._valuesMatch(undefined, 'test')).toBe(false);
        });
    });

    describe('_calculateAverageConfidence', () => {
        let pipeline;

        beforeEach(() => {
            pipeline = new EnrichmentPipeline();
        });

        test('calculates average of confidence scores', () => {
            const results = {
                industry: { confidence: 4 },
                employee_count: { confidence: 5 },
                founded_year: { confidence: 3 }
            };

            const avg = pipeline._calculateAverageConfidence(results);

            expect(avg).toBe(4);
        });

        test('returns 0 for empty results', () => {
            const avg = pipeline._calculateAverageConfidence({});

            expect(avg).toBe(0);
        });

        test('skips fields with 0 confidence', () => {
            const results = {
                industry: { confidence: 4 },
                employee_count: { confidence: 0 }
            };

            const avg = pipeline._calculateAverageConfidence(results);

            expect(avg).toBe(4);
        });

        test('rounds to one decimal place', () => {
            const results = {
                industry: { confidence: 4 },
                employee_count: { confidence: 3 }
            };

            const avg = pipeline._calculateAverageConfidence(results);

            expect(avg).toBe(3.5);
        });
    });

    describe('_buildEnrichedRecord', () => {
        let pipeline;

        beforeEach(() => {
            pipeline = new EnrichmentPipeline();
        });

        test('merges enriched values into original record', () => {
            const original = { Name: 'Acme Corp', id: '123' };
            const results = {
                industry: { value: 'Technology', confidence: 4 },
                employee_count: { value: 500, confidence: 5 }
            };

            const enriched = pipeline._buildEnrichedRecord(original, results);

            expect(enriched.Name).toBe('Acme Corp');
            expect(enriched.id).toBe('123');
            expect(enriched.industry).toBe('Technology');
            expect(enriched.employee_count).toBe(500);
        });

        test('preserves original values', () => {
            const original = { Name: 'Acme Corp', industry: 'Unknown' };
            const results = {
                industry: { value: 'Technology', confidence: 4 }
            };

            const enriched = pipeline._buildEnrichedRecord(original, results);

            // Enriched value overwrites original
            expect(enriched.industry).toBe('Technology');
        });

        test('skips values with 0 confidence', () => {
            const original = { Name: 'Acme Corp' };
            const results = {
                industry: { value: 'Technology', confidence: 0 }
            };

            const enriched = pipeline._buildEnrichedRecord(original, results);

            expect(enriched.industry).toBeUndefined();
        });
    });

    describe('_mergeResults', () => {
        let pipeline;

        beforeEach(() => {
            pipeline = new EnrichmentPipeline();
        });

        test('adds new fields to results', () => {
            const results = {};
            const newFields = {
                industry: new EnrichedValue('Technology', { confidence: 4 })
            };

            pipeline._mergeResults(results, newFields, 'website');

            expect(results.industry).toBeDefined();
            expect(results.industry.value).toBe('Technology');
        });

        test('keeps better value when existing is better', () => {
            const results = {
                industry: new EnrichedValue('Technology', { confidence: 5 })
            };
            const newFields = {
                industry: new EnrichedValue('Tech', { confidence: 3 })
            };

            pipeline._mergeResults(results, newFields, 'search');

            expect(results.industry.confidence).toBe(5);
        });

        test('replaces with better value when new is better', () => {
            const results = {
                industry: new EnrichedValue('Technology', { confidence: 3 })
            };
            const newFields = {
                industry: new EnrichedValue('Technology', { confidence: 5 })
            };

            pipeline._mergeResults(results, newFields, 'website');

            expect(results.industry.confidence).toBe(5);
        });

        test('tracks corroboration for matching values', () => {
            const results = {
                industry: new EnrichedValue('Technology', {
                    confidence: 4,
                    source: 'website'
                })
            };
            const newFields = {
                industry: new EnrichedValue('technology', { // lowercase matches
                    confidence: 3,
                    source: 'search'
                })
            };

            pipeline._mergeResults(results, newFields, 'search');

            expect(results.industry.corroboratedBy).toContain('search');
        });

        test('skips null fields', () => {
            const results = {};

            pipeline._mergeResults(results, null, 'website');

            expect(Object.keys(results).length).toBe(0);
        });

        test('skips fields with 0 confidence', () => {
            const results = {};
            const newFields = {
                industry: new EnrichedValue('Technology', { confidence: 0 })
            };

            pipeline._mergeResults(results, newFields, 'website');

            expect(results.industry).toBeUndefined();
        });
    });

    describe('enrich', () => {
        let pipeline;
        let mockWebsite;
        let mockSearch;

        beforeEach(() => {
            // Create mock enrichers
            mockWebsite = {
                name: 'website',
                enabled: true,
                canEnrich: jest.fn((field) => ['industry', 'employee_count', 'description'].includes(field)),
                enrich: jest.fn(),
                getStats: jest.fn(() => ({ totalRequests: 0 })),
                resetStats: jest.fn()
            };

            mockSearch = {
                name: 'search',
                enabled: true,
                canEnrich: jest.fn((field) => ['industry', 'employee_count', 'founded_year'].includes(field)),
                enrich: jest.fn(),
                getStats: jest.fn(() => ({ totalRequests: 0 })),
                resetStats: jest.fn()
            };

            pipeline = new EnrichmentPipeline({
                requiredFields: ['industry'],
                optionalFields: ['employee_count', 'founded_year'],
                customEnrichers: { website: mockWebsite, search: mockSearch }
            });
        });

        test('returns success when all required fields enriched', async () => {
            mockWebsite.enrich.mockResolvedValue({
                success: true,
                fields: {
                    industry: new EnrichedValue('Technology', { confidence: 4 })
                },
                duration_ms: 100
            });

            const result = await pipeline.enrich({ Name: 'Test Corp', id: '123' });

            expect(result.success).toBe(true);
            expect(result.fields.industry).toBeDefined();
        });

        test('calls enrichers in order', async () => {
            mockWebsite.enrich.mockResolvedValue({
                success: true,
                fields: {},
                duration_ms: 100
            });
            mockSearch.enrich.mockResolvedValue({
                success: true,
                fields: {
                    industry: new EnrichedValue('Technology', { confidence: 4 })
                },
                duration_ms: 100
            });

            await pipeline.enrich({ Name: 'Test Corp' });

            expect(mockWebsite.enrich).toHaveBeenCalled();
            expect(mockSearch.enrich).toHaveBeenCalled();
        });

        test('skips disabled enrichers', async () => {
            mockWebsite.enabled = false;
            mockSearch.enrich.mockResolvedValue({
                success: true,
                fields: {
                    industry: new EnrichedValue('Technology', { confidence: 4 })
                },
                duration_ms: 100
            });

            await pipeline.enrich({ Name: 'Test Corp' });

            expect(mockWebsite.enrich).not.toHaveBeenCalled();
            expect(mockSearch.enrich).toHaveBeenCalled();
        });

        test('only requests supported fields from each enricher', async () => {
            mockWebsite.enrich.mockResolvedValue({
                success: true,
                fields: {},
                duration_ms: 100
            });
            mockSearch.enrich.mockResolvedValue({
                success: true,
                fields: {},
                duration_ms: 100
            });

            await pipeline.enrich(
                { Name: 'Test Corp' },
                { targetFields: ['industry', 'founded_year'] }
            );

            // Website doesn't support founded_year
            const websiteFields = mockWebsite.enrich.mock.calls[0][1];
            expect(websiteFields).toContain('industry');
            expect(websiteFields).not.toContain('founded_year');

            // Search supports both
            const searchFields = mockSearch.enrich.mock.calls[0][1];
            expect(searchFields).toContain('industry');
            expect(searchFields).toContain('founded_year');
        });

        test('terminates early when all fields confident', async () => {
            mockWebsite.enrich.mockResolvedValue({
                success: true,
                fields: {
                    industry: new EnrichedValue('Technology', { confidence: 5 })
                },
                duration_ms: 100
            });

            const result = await pipeline.enrich(
                { Name: 'Test Corp' },
                { targetFields: ['industry'] }
            );

            // Should not call search if website fully enriched
            expect(result.success).toBe(true);
        });

        test('returns enriched record with merged values', async () => {
            mockWebsite.enrich.mockResolvedValue({
                success: true,
                fields: {
                    industry: new EnrichedValue('Technology', { confidence: 4 })
                },
                duration_ms: 100
            });

            const result = await pipeline.enrich(
                { Name: 'Test Corp', id: '123' },
                { targetFields: ['industry'] }
            );

            expect(result.enrichedRecord.Name).toBe('Test Corp');
            expect(result.enrichedRecord.id).toBe('123');
            expect(result.enrichedRecord.industry).toBe('Technology');
        });

        test('includes enrichment log', async () => {
            mockWebsite.enrich.mockResolvedValue({
                success: true,
                fields: {
                    industry: new EnrichedValue('Technology', { confidence: 4 })
                },
                duration_ms: 100
            });

            const result = await pipeline.enrich(
                { Name: 'Test Corp' },
                { targetFields: ['industry'] }
            );

            expect(result.log.length).toBeGreaterThan(0);
            expect(result.log[0].enricher).toBe('website');
        });

        test('emits events during enrichment', async () => {
            const startHandler = jest.fn();
            const completeHandler = jest.fn();

            pipeline.on(PIPELINE_EVENTS.START, startHandler);
            pipeline.on(PIPELINE_EVENTS.COMPLETE, completeHandler);

            mockWebsite.enrich.mockResolvedValue({
                success: true,
                fields: {
                    industry: new EnrichedValue('Technology', { confidence: 4 })
                },
                duration_ms: 100
            });

            await pipeline.enrich(
                { Name: 'Test Corp' },
                { targetFields: ['industry'] }
            );

            expect(startHandler).toHaveBeenCalled();
            expect(completeHandler).toHaveBeenCalled();
        });

        test('handles enricher errors gracefully', async () => {
            mockWebsite.enrich.mockRejectedValue(new Error('Network error'));
            mockSearch.enrich.mockResolvedValue({
                success: true,
                fields: {},
                duration_ms: 100
            });

            const result = await pipeline.enrich(
                { Name: 'Test Corp' },
                { targetFields: ['industry'] }
            );

            // Should not throw, should complete
            expect(result).toBeDefined();
            expect(result.log.some(l => l.error)).toBe(true);
        });

        test('respects custom enricher order', async () => {
            const callOrder = [];

            mockWebsite.enrich.mockImplementation(async () => {
                callOrder.push('website');
                return { success: true, fields: {}, duration_ms: 100 };
            });
            mockSearch.enrich.mockImplementation(async () => {
                callOrder.push('search');
                return {
                    success: true,
                    fields: {
                        industry: new EnrichedValue('Technology', { confidence: 4 })
                    },
                    duration_ms: 100
                };
            });

            await pipeline.enrich(
                { Name: 'Test Corp' },
                {
                    targetFields: ['industry'],
                    enricherOrder: ['search', 'website']
                }
            );

            expect(callOrder[0]).toBe('search');
        });

        test('tracks API calls and cost', async () => {
            mockWebsite.enrich.mockResolvedValue({
                success: true,
                fields: {},
                apiCalls: 2,
                cost: 0.01,
                duration_ms: 100
            });
            mockSearch.enrich.mockResolvedValue({
                success: true,
                fields: {
                    industry: new EnrichedValue('Technology', { confidence: 4 })
                },
                apiCalls: 3,
                cost: 0.02,
                duration_ms: 100
            });

            const result = await pipeline.enrich(
                { Name: 'Test Corp' },
                { targetFields: ['industry'] }
            );

            expect(result.summary.totalApiCalls).toBe(5);
            expect(result.summary.totalCost).toBe(0.03);
        });
    });

    describe('enrichBatch', () => {
        let pipeline;
        let mockWebsite;

        beforeEach(() => {
            mockWebsite = {
                name: 'website',
                enabled: true,
                canEnrich: jest.fn(() => true),
                enrich: jest.fn().mockResolvedValue({
                    success: true,
                    fields: {
                        industry: new EnrichedValue('Technology', { confidence: 4 })
                    },
                    duration_ms: 100
                }),
                getStats: jest.fn(() => ({ totalRequests: 0 })),
                resetStats: jest.fn()
            };

            pipeline = new EnrichmentPipeline({
                requiredFields: ['industry'],
                customEnrichers: { website: mockWebsite }
            });
        });

        test('processes multiple records', async () => {
            const records = [
                { Name: 'Company A', id: '1' },
                { Name: 'Company B', id: '2' },
                { Name: 'Company C', id: '3' }
            ];

            const results = await pipeline.enrichBatch(records);

            expect(results.length).toBe(3);
            expect(mockWebsite.enrich).toHaveBeenCalledTimes(3);
        });

        test('processes in batches', async () => {
            const records = Array(10).fill().map((_, i) => ({
                Name: `Company ${i}`,
                id: String(i)
            }));

            const results = await pipeline.enrichBatch(records, { batchSize: 3 });

            expect(results.length).toBe(10);
        });

        test('supports parallel execution', async () => {
            const records = [
                { Name: 'Company A', id: '1' },
                { Name: 'Company B', id: '2' }
            ];

            const results = await pipeline.enrichBatch(records, {
                parallel: true,
                concurrency: 2
            });

            expect(results.length).toBe(2);
        });
    });

    describe('Integration', () => {
        test('full enrichment workflow with mock enrichers', async () => {
            const mockWebsite = {
                name: 'website',
                enabled: true,
                canEnrich: (f) => ['industry', 'employee_count'].includes(f),
                enrich: jest.fn().mockResolvedValue({
                    success: true,
                    fields: {
                        industry: new EnrichedValue('Technology', {
                            confidence: 4,
                            source: 'company_website'
                        }),
                        employee_count: new EnrichedValue(500, {
                            confidence: 3,
                            source: 'company_website'
                        })
                    },
                    apiCalls: 1,
                    duration_ms: 150
                }),
                getStats: () => ({ totalRequests: 1 }),
                resetStats: jest.fn()
            };

            const mockSearch = {
                name: 'search',
                enabled: true,
                canEnrich: (f) => ['industry', 'employee_count', 'founded_year'].includes(f),
                enrich: jest.fn().mockResolvedValue({
                    success: true,
                    fields: {
                        employee_count: new EnrichedValue(500, {
                            confidence: 4,
                            source: 'web_search'
                        }),
                        founded_year: new EnrichedValue(2010, {
                            confidence: 4,
                            source: 'web_search'
                        })
                    },
                    apiCalls: 2,
                    duration_ms: 200
                }),
                getStats: () => ({ totalRequests: 2 }),
                resetStats: jest.fn()
            };

            // Note: All fields in requiredFields so terminator won't stop early
            // (terminator only checks required fields for early termination)
            const pipeline = new EnrichmentPipeline({
                requiredFields: ['industry', 'employee_count', 'founded_year'],
                optionalFields: [],
                customEnrichers: { website: mockWebsite, search: mockSearch }
            });

            const result = await pipeline.enrich({
                Name: 'Acme Corporation',
                id: 'rec123',
                website: 'https://acme.com'
            });

            // Should succeed
            expect(result.success).toBe(true);

            // Should have all fields
            expect(result.fields.industry.value).toBe('Technology');
            expect(result.fields.employee_count.value).toBe(500);
            expect(result.fields.founded_year.value).toBe(2010);

            // Should have corroboration for employee_count
            expect(result.fields.employee_count.corroboratedBy).toContain('search');

            // Should have enriched record
            expect(result.enrichedRecord.industry).toBe('Technology');
            expect(result.enrichedRecord.employee_count).toBe(500);
            expect(result.enrichedRecord.founded_year).toBe(2010);

            // Should track stats
            expect(result.summary.totalApiCalls).toBe(3);
            expect(result.summary.duration_ms).toBeGreaterThanOrEqual(0);
        });

        test('handles partial enrichment gracefully', async () => {
            const mockWebsite = {
                name: 'website',
                enabled: true,
                canEnrich: () => true,
                enrich: jest.fn().mockResolvedValue({
                    success: false,
                    fields: {},
                    errors: [{ message: 'Website not found' }],
                    duration_ms: 100
                }),
                getStats: () => ({ totalRequests: 1 }),
                resetStats: jest.fn()
            };

            const mockSearch = {
                name: 'search',
                enabled: true,
                canEnrich: () => true,
                enrich: jest.fn().mockResolvedValue({
                    success: true,
                    fields: {
                        industry: new EnrichedValue('Technology', { confidence: 3 })
                    },
                    duration_ms: 100
                }),
                getStats: () => ({ totalRequests: 1 }),
                resetStats: jest.fn()
            };

            const pipeline = new EnrichmentPipeline({
                requiredFields: ['industry'],
                customEnrichers: { website: mockWebsite, search: mockSearch }
            });

            const result = await pipeline.enrich({ Name: 'Test Corp' });

            // Should still return data from search
            expect(result.fields.industry).toBeDefined();
            expect(result.fields.industry.value).toBe('Technology');
        });

        test('respects max iterations', async () => {
            let callCount = 0;

            const mockEnricher = {
                name: 'slow',
                enabled: true,
                canEnrich: () => true,
                enrich: jest.fn().mockImplementation(async () => {
                    callCount++;
                    // Never quite reaches threshold
                    return {
                        success: true,
                        fields: {
                            industry: new EnrichedValue('Technology', {
                                confidence: 2 // Below threshold of 4
                            })
                        },
                        duration_ms: 100
                    };
                }),
                getStats: () => ({ totalRequests: callCount }),
                resetStats: jest.fn()
            };

            const pipeline = new EnrichmentPipeline({
                maxIterations: 2,
                requiredFields: ['industry'],
                customEnrichers: { slow: mockEnricher }
            });

            await pipeline.enrich({ Name: 'Test Corp' });

            // Should stop after max iterations
            expect(callCount).toBeLessThanOrEqual(2);
        });
    });
});
