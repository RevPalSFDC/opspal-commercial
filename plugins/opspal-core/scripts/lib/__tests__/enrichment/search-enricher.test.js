/**
 * Tests for Search Enricher
 *
 * @module enrichment/search-enricher.test
 */

'use strict';

const { SearchEnricher, QUERY_TEMPLATES, EXTRACTION_PATTERNS, TRUSTED_DOMAINS } = require('../../enrichment/search-enricher');
const { EnrichedValue } = require('../../enrichment/confidence-scorer');

describe('SearchEnricher', () => {
    describe('Exports', () => {
        test('exports SearchEnricher class', () => {
            expect(SearchEnricher).toBeDefined();
            expect(typeof SearchEnricher).toBe('function');
        });

        test('exports QUERY_TEMPLATES', () => {
            expect(QUERY_TEMPLATES).toBeDefined();
            expect(QUERY_TEMPLATES.employee_count).toBeDefined();
            expect(QUERY_TEMPLATES.annual_revenue).toBeDefined();
            expect(QUERY_TEMPLATES.founded_year).toBeDefined();
        });

        test('exports EXTRACTION_PATTERNS', () => {
            expect(EXTRACTION_PATTERNS).toBeDefined();
            expect(EXTRACTION_PATTERNS.employee_count).toBeDefined();
            expect(EXTRACTION_PATTERNS.annual_revenue).toBeDefined();
            expect(EXTRACTION_PATTERNS.linkedin_url).toBeDefined();
        });

        test('exports TRUSTED_DOMAINS', () => {
            expect(TRUSTED_DOMAINS).toBeDefined();
            expect(TRUSTED_DOMAINS.high).toContain('linkedin.com');
            expect(TRUSTED_DOMAINS.medium).toContain('wikipedia.org');
        });
    });

    describe('Constructor', () => {
        test('creates instance with defaults', () => {
            const enricher = new SearchEnricher();

            expect(enricher.name).toBe('search');
            expect(enricher.sourceType).toBe('web_search');
            expect(enricher.timeout_ms).toBe(10000);
            expect(enricher.maxResultsPerQuery).toBe(5);
            expect(enricher.enabled).toBe(true);
        });

        test('accepts custom options', () => {
            const enricher = new SearchEnricher({
                timeout_ms: 5000,
                maxResultsPerQuery: 10,
                enabled: false
            });

            expect(enricher.timeout_ms).toBe(5000);
            expect(enricher.maxResultsPerQuery).toBe(10);
            expect(enricher.enabled).toBe(false);
        });

        test('allows custom query templates', () => {
            const customTemplates = {
                custom_field: ['{company_name} custom query']
            };
            const enricher = new SearchEnricher({
                queryTemplates: customTemplates
            });

            expect(enricher.queryTemplates.custom_field).toBeDefined();
        });

        test('allows custom extraction patterns', () => {
            const customPatterns = {
                custom_field: [/custom pattern/]
            };
            const enricher = new SearchEnricher({
                extractionPatterns: customPatterns
            });

            expect(enricher.extractionPatterns.custom_field).toBeDefined();
        });

        test('accepts searchFn for dependency injection', () => {
            const mockSearch = jest.fn();
            const enricher = new SearchEnricher({ searchFn: mockSearch });

            expect(enricher.searchFn).toBe(mockSearch);
        });
    });

    describe('supportedFields', () => {
        test('returns expected fields', () => {
            const enricher = new SearchEnricher();
            const fields = enricher.supportedFields;

            expect(fields).toContain('employee_count');
            expect(fields).toContain('annual_revenue');
            expect(fields).toContain('founded_year');
            expect(fields).toContain('headquarters');
            expect(fields).toContain('industry');
            expect(fields).toContain('description');
            expect(fields).toContain('linkedin_url');
            expect(fields).toContain('naics_code');
            expect(fields).toContain('stock_symbol');
        });
    });

    describe('canEnrich', () => {
        test('returns true for supported fields', () => {
            const enricher = new SearchEnricher();

            expect(enricher.canEnrich('employee_count')).toBe(true);
            expect(enricher.canEnrich('annual_revenue')).toBe(true);
        });

        test('returns false for unsupported fields', () => {
            const enricher = new SearchEnricher();

            expect(enricher.canEnrich('unknown_field')).toBe(false);
        });
    });

    describe('enrich', () => {
        let enricher;
        let mockSearch;

        beforeEach(() => {
            mockSearch = jest.fn();
            enricher = new SearchEnricher({ searchFn: mockSearch });
        });

        test('returns error when disabled', async () => {
            enricher.enabled = false;
            const result = await enricher.enrich({ Name: 'Test Company' }, ['industry']);

            expect(result.success).toBe(false);
            expect(result.errors[0].message).toContain('disabled');
        });

        test('returns error when no company name found', async () => {
            const result = await enricher.enrich({}, ['industry']);

            expect(result.success).toBe(false);
            expect(result.errors[0].message).toContain('No company name found');
        });

        test('returns error when no supported fields requested', async () => {
            const result = await enricher.enrich(
                { Name: 'Test Company' },
                ['unsupported_field']
            );

            expect(result.success).toBe(false);
            expect(result.errors[0].message).toContain('No supported fields');
        });

        test('extracts data from search results', async () => {
            mockSearch.mockResolvedValue([
                {
                    snippet: 'Test Company has 500 employees and was founded in 2010.',
                    url: 'https://linkedin.com/company/test'
                }
            ]);

            const result = await enricher.enrich(
                { Name: 'Test Company' },
                ['employee_count', 'founded_year']
            );

            expect(result.success).toBe(true);
            expect(result.hasField('employee_count')).toBe(true);
            expect(result.hasField('founded_year')).toBe(true);
        });

        test('records metadata', async () => {
            mockSearch.mockResolvedValue([]);

            const result = await enricher.enrich(
                { Name: 'Test Company', id: '123' },
                ['industry']
            );

            expect(result.metadata.record_id).toBe('123');
            expect(result.metadata.companyName).toBe('Test Company');
        });

        test('handles search errors gracefully', async () => {
            mockSearch.mockRejectedValue(new Error('Search API error'));

            const result = await enricher.enrich(
                { Name: 'Test Company' },
                ['employee_count']
            );

            // Should not throw, but result may not be successful
            expect(result).toBeDefined();
        });

        test('returns empty results when no search matches', async () => {
            mockSearch.mockResolvedValue([]);

            const result = await enricher.enrich(
                { Name: 'Test Company' },
                ['employee_count']
            );

            expect(result.success).toBe(false);
            expect(result.fieldCount).toBe(0);
        });
    });

    describe('_getCompanyName', () => {
        let enricher;

        beforeEach(() => {
            enricher = new SearchEnricher();
        });

        test('extracts from Name field', () => {
            const name = enricher._getCompanyName({ Name: 'Acme Corp' });
            expect(name).toBe('Acme Corp');
        });

        test('extracts from name field (lowercase)', () => {
            const name = enricher._getCompanyName({ name: 'Acme Corp' });
            expect(name).toBe('Acme Corp');
        });

        test('extracts from company_name field', () => {
            const name = enricher._getCompanyName({ company_name: 'Acme Corp' });
            expect(name).toBe('Acme Corp');
        });

        test('extracts from Account field', () => {
            const name = enricher._getCompanyName({ Account: 'Acme Corp' });
            expect(name).toBe('Acme Corp');
        });

        test('trims whitespace', () => {
            const name = enricher._getCompanyName({ Name: '  Acme Corp  ' });
            expect(name).toBe('Acme Corp');
        });

        test('returns null when not found', () => {
            const name = enricher._getCompanyName({ id: '123' });
            expect(name).toBeNull();
        });
    });

    describe('_buildQuery', () => {
        test('replaces company_name placeholder', () => {
            const enricher = new SearchEnricher();
            const query = enricher._buildQuery('{company_name} employees', { company_name: 'Acme' });

            expect(query).toBe('Acme employees');
        });

        test('replaces year placeholder', () => {
            const enricher = new SearchEnricher();
            const query = enricher._buildQuery('{company_name} revenue {year}', {
                company_name: 'Acme',
                year: 2024
            });

            expect(query).toBe('Acme revenue 2024');
        });

        test('replaces multiple occurrences', () => {
            const enricher = new SearchEnricher();
            const query = enricher._buildQuery('{company_name} - {company_name}', { company_name: 'Test' });

            expect(query).toBe('Test - Test');
        });
    });

    describe('_assessSourceQuality', () => {
        let enricher;

        beforeEach(() => {
            enricher = new SearchEnricher();
        });

        test('returns high score for trusted high domains', () => {
            expect(enricher._assessSourceQuality('https://linkedin.com/company/test')).toBe(8);
            expect(enricher._assessSourceQuality('https://crunchbase.com/organization/test')).toBe(8);
            expect(enricher._assessSourceQuality('https://bloomberg.com/profile/test')).toBe(8);
        });

        test('returns medium score for trusted medium domains', () => {
            expect(enricher._assessSourceQuality('https://en.wikipedia.org/wiki/Test')).toBe(5);
            expect(enricher._assessSourceQuality('https://forbes.com/test')).toBe(5);
        });

        test('returns high score for government domains', () => {
            expect(enricher._assessSourceQuality('https://sec.gov/cgi-bin/test')).toBe(8); // Also in high
        });

        test('returns default score for unknown domains', () => {
            expect(enricher._assessSourceQuality('https://random-site.com/page')).toBe(3);
        });

        test('handles null source', () => {
            expect(enricher._assessSourceQuality(null)).toBe(0);
        });
    });

    describe('_processExtractedValue', () => {
        let enricher;

        beforeEach(() => {
            enricher = new SearchEnricher();
        });

        test('parses employee count', () => {
            const match = ['500 employees', '500'];
            const result = enricher._processExtractedValue(match, 'employee_count');

            expect(result).toBe(500);
        });

        test('parses employee count with comma', () => {
            const match = ['1,500 employees', '1,500'];
            const result = enricher._processExtractedValue(match, 'employee_count');

            expect(result).toBe(1500);
        });

        test('parses employee count range', () => {
            const match = ['100-500 employees', '100', '500'];
            const result = enricher._processExtractedValue(match, 'employee_count');

            expect(result).toBe('100-500');
        });

        test('parses annual revenue in millions', () => {
            const match = ['$50 million revenue', '50'];
            const result = enricher._processExtractedValue(match, 'annual_revenue');

            expect(result).toBe(50000000);
        });

        test('parses annual revenue in billions', () => {
            const match = ['$2.5 billion revenue', '2.5'];
            const result = enricher._processExtractedValue(match, 'annual_revenue');

            expect(result).toBe(2500000000);
        });

        test('parses founded year', () => {
            const match = ['founded in 2010', '2010'];
            const result = enricher._processExtractedValue(match, 'founded_year');

            expect(result).toBe(2010);
        });

        test('rejects invalid founded year', () => {
            const match = ['founded in 1500', '1500']; // Too old
            const result = enricher._processExtractedValue(match, 'founded_year');

            expect(result).toBeNull();
        });

        test('extracts stock symbol', () => {
            const match = ['NYSE: AAPL', 'AAPL'];
            const result = enricher._processExtractedValue(match, 'stock_symbol');

            expect(result).toBe('AAPL');
        });

        test('extracts LinkedIn URL', () => {
            // The regex captures the URL in group 1, match[0] is the full match
            const match = ['https://linkedin.com/company/acme-corp', 'https://linkedin.com/company/acme-corp'];
            const result = enricher._processExtractedValue(match, 'linkedin_url');

            expect(result).toBe('https://linkedin.com/company/acme-corp');
        });
    });

    describe('_cleanContent', () => {
        let enricher;

        beforeEach(() => {
            enricher = new SearchEnricher();
        });

        test('removes HTML tags', () => {
            const result = enricher._cleanContent('<p>Hello <strong>World</strong></p>');
            expect(result).toBe('Hello World');
        });

        test('normalizes whitespace', () => {
            const result = enricher._cleanContent('Multiple    spaces   here');
            expect(result).toBe('Multiple spaces here');
        });

        test('trims content', () => {
            const result = enricher._cleanContent('  Trimmed  ');
            expect(result).toBe('Trimmed');
        });

        test('limits length to 500 characters', () => {
            const longContent = 'A'.repeat(600);
            const result = enricher._cleanContent(longContent);

            expect(result.length).toBe(500);
        });
    });

    describe('setSearchFunction', () => {
        test('sets search function', () => {
            const enricher = new SearchEnricher();
            const mockSearch = jest.fn();

            enricher.setSearchFunction(mockSearch);

            expect(enricher.searchFn).toBe(mockSearch);
        });
    });

    describe('addQueryTemplate', () => {
        test('adds new query template', () => {
            const enricher = new SearchEnricher();

            enricher.addQueryTemplate('custom_field', ['{company_name} custom query']);

            expect(enricher.queryTemplates.custom_field).toBeDefined();
            expect(enricher.queryTemplates.custom_field[0]).toBe('{company_name} custom query');
        });
    });

    describe('addExtractionPattern', () => {
        test('adds new extraction pattern', () => {
            const enricher = new SearchEnricher();
            const pattern = [/custom pattern/];

            enricher.addExtractionPattern('custom_field', pattern);

            expect(enricher.extractionPatterns.custom_field).toBe(pattern);
        });
    });

    describe('Integration', () => {
        test('full enrichment workflow with mock search', async () => {
            const mockSearch = jest.fn().mockImplementation((query) => {
                if (query.includes('employees')) {
                    return Promise.resolve([
                        {
                            snippet: 'Acme Corporation has over 500 employees worldwide.',
                            url: 'https://linkedin.com/company/acme'
                        }
                    ]);
                }
                if (query.includes('revenue')) {
                    return Promise.resolve([
                        {
                            snippet: 'Acme reported $25 million in annual revenue.',
                            url: 'https://crunchbase.com/organization/acme'
                        }
                    ]);
                }
                return Promise.resolve([]);
            });

            const enricher = new SearchEnricher({ searchFn: mockSearch });

            const result = await enricher.enrich(
                { Name: 'Acme Corporation', id: 'rec1' },
                ['employee_count', 'annual_revenue', 'unknown_field']
            );

            expect(result.success).toBe(true);
            expect(result.hasField('employee_count')).toBe(true);
            expect(result.hasField('annual_revenue')).toBe(true);
            expect(result.fields.employee_count.value).toBe(500);
        });

        test('handles partial results', async () => {
            const mockSearch = jest.fn().mockImplementation((query) => {
                if (query.includes('employees')) {
                    return Promise.resolve([
                        { snippet: '250 employees', url: 'https://test.com' }
                    ]);
                }
                return Promise.resolve([]); // No results for other queries
            });

            const enricher = new SearchEnricher({ searchFn: mockSearch });

            const result = await enricher.enrich(
                { Name: 'Test Company' },
                ['employee_count', 'annual_revenue', 'founded_year']
            );

            expect(result.success).toBe(true);
            expect(result.fieldCount).toBe(1);
            expect(result.hasField('employee_count')).toBe(true);
        });

        test('prioritizes trusted sources', async () => {
            const mockSearch = jest.fn().mockResolvedValue([
                { snippet: '100 employees', url: 'https://random-blog.com' },
                { snippet: '500 employees', url: 'https://linkedin.com/company/test' }
            ]);

            const enricher = new SearchEnricher({ searchFn: mockSearch });

            const result = await enricher.enrich(
                { Name: 'Test Company' },
                ['employee_count']
            );

            // The LinkedIn result should be selected due to higher source quality
            expect(result.hasField('employee_count')).toBe(true);
            expect(result.fields.employee_count.value).toBe(500);
        });
    });
});
