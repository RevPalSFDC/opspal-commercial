/**
 * Search Enricher
 *
 * Uses web search to find company/contact information.
 * Serves as a fallback enricher when other sources don't have data.
 *
 * @module enrichment/search-enricher
 */

'use strict';

const { BaseEnricher, EnrichmentResult } = require('./base-enricher');
const { EnrichedValue } = require('./confidence-scorer');

/**
 * Search query templates by field type
 */
const QUERY_TEMPLATES = {
    employee_count: [
        '{company_name} number of employees',
        '{company_name} company size employees',
        '{company_name} headcount workforce size'
    ],
    annual_revenue: [
        '{company_name} annual revenue',
        '{company_name} revenue {year}',
        '{company_name} company revenue sales'
    ],
    founded_year: [
        '{company_name} founded year established',
        '{company_name} company history founded',
        'when was {company_name} founded'
    ],
    headquarters: [
        '{company_name} headquarters location',
        '{company_name} head office address',
        'where is {company_name} located'
    ],
    industry: [
        '{company_name} industry sector',
        '{company_name} what does the company do',
        '{company_name} business type industry'
    ],
    description: [
        '{company_name} company about description',
        '{company_name} what is the company',
        '{company_name} company overview'
    ],
    linkedin_url: [
        '{company_name} linkedin company page',
        'site:linkedin.com/company {company_name}'
    ],
    naics_code: [
        '{company_name} NAICS code',
        '{company_name} industry classification code'
    ],
    stock_symbol: [
        '{company_name} stock ticker symbol',
        '{company_name} NYSE NASDAQ ticker'
    ],
    contact_email: [
        '{company_name} contact email',
        '{company_name} sales email address'
    ],
    contact_phone: [
        '{company_name} phone number contact',
        '{company_name} company phone'
    ]
};

/**
 * Patterns for extracting data from search results
 */
const EXTRACTION_PATTERNS = {
    employee_count: [
        /(\d{1,3}(?:,\d{3})*)\s*(?:\+\s*)?employees?/i,
        /(?:has|employs|with)\s+(\d{1,3}(?:,\d{3})*)\s+(?:employees?|workers?|staff)/i,
        /workforce\s+(?:of\s+)?(\d{1,3}(?:,\d{3})*)/i,
        /(\d{1,3}(?:,\d{3})*)\s*-\s*(\d{1,3}(?:,\d{3})*)\s+employees?/i
    ],
    annual_revenue: [
        /(?:\$|USD\s*)(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:million|M|billion|B)/i,
        /revenue\s+(?:of\s+)?(?:\$|USD\s*)(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:million|M|billion|B)?/i,
        /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:million|M|billion|B)\s+(?:in\s+)?revenue/i
    ],
    founded_year: [
        /(?:founded|established|since)\s+(?:in\s+)?(\d{4})/i,
        /(?:started|began|created)\s+(?:in\s+)?(\d{4})/i,
        /\((\d{4})\s*[-–]\s*(?:present|now)\)/i
    ],
    headquarters: [
        /(?:headquarters?|hq|headquartered|based)\s+(?:in|at)\s+([^,.\n]+(?:,\s*[A-Z]{2})?)/i,
        /(?:located|offices?)\s+(?:in|at)\s+([^,.\n]+(?:,\s*[A-Z]{2})?)/i
    ],
    linkedin_url: [
        /(https?:\/\/(?:www\.)?linkedin\.com\/company\/[a-zA-Z0-9-]+)/i
    ],
    stock_symbol: [
        /(?:ticker|symbol|stock)[:\s]+([A-Z]{1,5})/i,
        /\(([A-Z]{1,5})\)\s+(?:stock|shares)/i,
        /(?:NYSE|NASDAQ)[:\s]+([A-Z]{1,5})/i
    ],
    naics_code: [
        /NAICS[:\s]+(\d{6})/i,
        /(?:NAICS|industry)\s+code[:\s]+(\d{6})/i
    ]
};

/**
 * Trusted domains for search results
 */
const TRUSTED_DOMAINS = {
    high: [
        'linkedin.com',
        'bloomberg.com',
        'reuters.com',
        'sec.gov',
        'crunchbase.com',
        'glassdoor.com',
        'dnb.com',
        'zoominfo.com'
    ],
    medium: [
        'wikipedia.org',
        'forbes.com',
        'wsj.com',
        'businesswire.com',
        'prnewswire.com',
        'yahoo.com/finance'
    ],
    low: [
        // General news and other sources
    ]
};

/**
 * Search Enricher class
 */
class SearchEnricher extends BaseEnricher {
    /**
     * Create a search enricher
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        super({
            name: 'search',
            sourceType: 'web_search',
            timeout_ms: options.timeout_ms || 10000,
            ...options
        });

        this.queryTemplates = { ...QUERY_TEMPLATES, ...options.queryTemplates };
        this.extractionPatterns = { ...EXTRACTION_PATTERNS, ...options.extractionPatterns };
        this.trustedDomains = { ...TRUSTED_DOMAINS, ...options.trustedDomains };
        this.maxResultsPerQuery = options.maxResultsPerQuery || 5;

        // Search function (can be injected for testing)
        this.searchFn = options.searchFn || null;
    }

    /**
     * Get supported fields
     * @returns {string[]}
     */
    get supportedFields() {
        return [
            'employee_count',
            'annual_revenue',
            'founded_year',
            'headquarters',
            'industry',
            'description',
            'linkedin_url',
            'naics_code',
            'stock_symbol',
            'contact_email',
            'contact_phone'
        ];
    }

    /**
     * Enrich a record using web search
     * @param {Object} record - Record to enrich
     * @param {string[]} targetFields - Fields to target
     * @returns {Promise<EnrichmentResult>}
     */
    async enrich(record, targetFields = []) {
        const startTime = Date.now();
        const result = new EnrichmentResult({
            source: this.name,
            metadata: { record_id: record.id || record.Id }
        });

        if (!this.enabled) {
            result.addError('_enricher', 'Search enricher is disabled');
            return result;
        }

        // Get company name for searches
        const companyName = this._getCompanyName(record);
        if (!companyName) {
            result.addError('_enricher', 'No company name found in record');
            result.duration_ms = Date.now() - startTime;
            return result;
        }

        // Filter to only supported fields
        const fieldsToEnrich = targetFields.length > 0
            ? targetFields.filter(f => this.canEnrich(f))
            : this.supportedFields;

        if (fieldsToEnrich.length === 0) {
            result.addError('_enricher', 'No supported fields requested');
            result.duration_ms = Date.now() - startTime;
            return result;
        }

        try {
            // Search for each field
            for (const field of fieldsToEnrich) {
                const searchResult = await this._searchForField(companyName, field, record);

                if (searchResult) {
                    result.addField(field, searchResult);
                    this._stats.fieldsEnriched++;
                }

                result.apiCalls++;
            }

            result.success = result.fieldCount > 0;
            result.metadata.companyName = companyName;
            result.metadata.queriesExecuted = fieldsToEnrich.length;

        } catch (error) {
            result.addError('_enricher', `Search failed: ${error.message}`);
            result.metadata.error = error.message;
        }

        result.duration_ms = Date.now() - startTime;
        this._stats.totalDuration_ms += result.duration_ms;

        return result;
    }

    /**
     * Get company name from record
     * @private
     */
    _getCompanyName(record) {
        const nameFields = [
            'Name', 'name', 'company_name', 'CompanyName',
            'Account', 'account_name', 'AccountName',
            'Organization', 'organization_name'
        ];

        for (const field of nameFields) {
            if (record[field] && typeof record[field] === 'string') {
                return record[field].trim();
            }
        }

        return null;
    }

    /**
     * Search for a specific field
     * @private
     */
    async _searchForField(companyName, field, record) {
        const templates = this.queryTemplates[field];
        if (!templates || templates.length === 0) {
            return null;
        }

        // Build query from template
        const query = this._buildQuery(templates[0], {
            company_name: companyName,
            year: new Date().getFullYear()
        });

        // Execute search
        const searchResults = await this._executeSearch(query);
        if (!searchResults || searchResults.length === 0) {
            return null;
        }

        // Extract value from results
        const extracted = this._extractFromResults(searchResults, field);
        if (!extracted) {
            return null;
        }

        // Calculate confidence based on source quality
        const sourceQuality = this._assessSourceQuality(extracted.source);

        return this.createEnrichedValue(extracted.value, {
            sourceUrl: extracted.sourceUrl,
            matchType: extracted.matchType || 'extracted',
            isIndirectSource: true,
            metadata: {
                query,
                sourceQuality,
                resultCount: searchResults.length
            }
        });
    }

    /**
     * Build search query from template
     * @private
     */
    _buildQuery(template, variables) {
        let query = template;
        for (const [key, value] of Object.entries(variables)) {
            query = query.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
        }
        return query;
    }

    /**
     * Execute search query
     * @private
     */
    async _executeSearch(query) {
        try {
            return await this._rateLimitedRequest(async () => {
                if (this.searchFn) {
                    return await this.searchFn(query);
                }

                // Simulate search for when no searchFn provided
                // In production, this would use WebSearch tool
                return [];
            });
        } catch (error) {
            return [];
        }
    }

    /**
     * Extract field value from search results
     * @private
     */
    _extractFromResults(results, field) {
        const patterns = this.extractionPatterns[field];

        // Sort results by source quality
        const sortedResults = results.sort((a, b) => {
            const qualityA = this._assessSourceQuality(a.url || a.source);
            const qualityB = this._assessSourceQuality(b.url || b.source);
            return qualityB - qualityA;
        });

        for (const result of sortedResults.slice(0, this.maxResultsPerQuery)) {
            const content = result.snippet || result.content || result.description || '';

            if (patterns) {
                // Use extraction patterns
                for (const pattern of patterns) {
                    const match = content.match(pattern);
                    if (match) {
                        return {
                            value: this._processExtractedValue(match, field),
                            source: result.url || result.source,
                            sourceUrl: result.url,
                            matchType: 'pattern_match'
                        };
                    }
                }
            } else {
                // For fields without patterns (description, industry)
                // Return the content directly if it seems relevant
                if (content.length > 50) {
                    return {
                        value: this._cleanContent(content),
                        source: result.url || result.source,
                        sourceUrl: result.url,
                        matchType: 'content'
                    };
                }
            }
        }

        return null;
    }

    /**
     * Process extracted value based on field type
     * @private
     */
    _processExtractedValue(match, field) {
        switch (field) {
            case 'employee_count':
                // Handle range (e.g., "100-500 employees")
                if (match[2]) {
                    const low = parseInt(match[1].replace(/,/g, ''), 10);
                    const high = parseInt(match[2].replace(/,/g, ''), 10);
                    return `${low}-${high}`;
                }
                return parseInt(match[1].replace(/,/g, ''), 10);

            case 'annual_revenue':
                const amount = parseFloat(match[1].replace(/,/g, ''));
                const unit = match[0].toLowerCase();
                if (unit.includes('billion') || unit.includes('b')) {
                    return amount * 1000000000;
                } else if (unit.includes('million') || unit.includes('m')) {
                    return amount * 1000000;
                }
                return amount;

            case 'founded_year':
                const year = parseInt(match[1], 10);
                const currentYear = new Date().getFullYear();
                return (year >= 1800 && year <= currentYear) ? year : null;

            case 'naics_code':
            case 'stock_symbol':
                return match[1];

            case 'linkedin_url':
                return match[1];

            default:
                return match[1] || match[0];
        }
    }

    /**
     * Assess source quality (0-10 scale)
     * @private
     */
    _assessSourceQuality(source) {
        if (!source) return 0;

        const sourceLower = source.toLowerCase();

        // Check trusted domains
        for (const domain of this.trustedDomains.high) {
            if (sourceLower.includes(domain)) return 8;
        }
        for (const domain of this.trustedDomains.medium) {
            if (sourceLower.includes(domain)) return 5;
        }

        // Government sources are high quality
        if (sourceLower.includes('.gov')) return 7;

        // Company's own domain (if detected) is high quality
        // This would need context from the record

        return 3; // Default for unknown sources
    }

    /**
     * Clean content for description fields
     * @private
     */
    _cleanContent(content) {
        return content
            .replace(/<[^>]+>/g, '') // Remove HTML tags
            .replace(/\s+/g, ' ')    // Normalize whitespace
            .trim()
            .slice(0, 500);          // Limit length
    }

    /**
     * Set the search function (for dependency injection)
     * @param {Function} fn - Search function
     */
    setSearchFunction(fn) {
        this.searchFn = fn;
    }

    /**
     * Add custom query template
     * @param {string} field - Field name
     * @param {string[]} templates - Query templates
     */
    addQueryTemplate(field, templates) {
        this.queryTemplates[field] = templates;
    }

    /**
     * Add custom extraction pattern
     * @param {string} field - Field name
     * @param {RegExp[]} patterns - Extraction patterns
     */
    addExtractionPattern(field, patterns) {
        this.extractionPatterns[field] = patterns;
    }
}

module.exports = {
    SearchEnricher,
    QUERY_TEMPLATES,
    EXTRACTION_PATTERNS,
    TRUSTED_DOMAINS
};
