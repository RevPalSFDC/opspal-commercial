/**
 * Website Enricher
 *
 * Crawls company websites to extract firmographic data.
 * Uses WebFetch tool capabilities for content retrieval.
 *
 * @module enrichment/website-enricher
 */

'use strict';

const { BaseEnricher, EnrichmentResult } = require('./base-enricher');
const { EnrichedValue } = require('./confidence-scorer');

/**
 * Patterns for extracting data from website content
 */
const EXTRACTION_PATTERNS = {
    // Employee count patterns
    employee_count: [
        /(\d{1,3}(?:,\d{3})*)\s*(?:\+\s*)?employees?/i,
        /team\s+of\s+(\d{1,3}(?:,\d{3})*)/i,
        /(?:over|more than)\s+(\d{1,3}(?:,\d{3})*)\s+(?:employees?|people|team members)/i,
        /(\d{1,3}(?:,\d{3})*)\s*(?:-|to)\s*(\d{1,3}(?:,\d{3})*)\s+employees?/i
    ],

    // Founded year patterns
    founded_year: [
        /(?:founded|established|since)\s+(?:in\s+)?(\d{4})/i,
        /(?:founded|established|since)\s+(\d{4})/i,
        /©\s*(\d{4})/
    ],

    // Headquarters patterns
    headquarters: [
        /(?:headquarters?|hq|head office|based in)[:\s]+([^,\n]+(?:,\s*[A-Z]{2})?)/i,
        /(?:located in|offices? in)[:\s]+([^,\n]+(?:,\s*[A-Z]{2})?)/i
    ],

    // Phone patterns
    phone: [
        /(?:phone|tel|call)[:\s]*([+\d\s()-]{10,20})/i,
        /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/
    ],

    // Email patterns
    email: [
        /(?:email|contact)[:\s]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
        /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
    ],

    // Industry keywords
    industry_keywords: {
        technology: ['software', 'saas', 'cloud', 'ai', 'machine learning', 'data', 'platform', 'digital'],
        healthcare: ['health', 'medical', 'patient', 'care', 'hospital', 'clinic', 'pharma'],
        finance: ['financial', 'banking', 'investment', 'capital', 'fund', 'insurance'],
        manufacturing: ['manufacturing', 'industrial', 'factory', 'production', 'assembly'],
        retail: ['retail', 'ecommerce', 'shop', 'store', 'consumer'],
        government: ['government', 'public sector', 'agency', 'federal', 'state', 'municipal']
    },

    // Social links
    social_links: {
        linkedin: /(?:linkedin\.com\/company\/|linkedin\.com\/in\/)([a-zA-Z0-9-]+)/i,
        twitter: /(?:twitter\.com\/|x\.com\/)([a-zA-Z0-9_]+)/i,
        facebook: /(?:facebook\.com\/)([a-zA-Z0-9.]+)/i
    }
};

/**
 * Page types to check on websites
 */
const PAGE_PATHS = {
    about: ['/about', '/about-us', '/company', '/who-we-are'],
    contact: ['/contact', '/contact-us', '/get-in-touch'],
    team: ['/team', '/our-team', '/leadership', '/about/team'],
    careers: ['/careers', '/jobs', '/join-us']
};

/**
 * Website Enricher class
 */
class WebsiteEnricher extends BaseEnricher {
    /**
     * Create a website enricher
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        super({
            name: 'website',
            sourceType: 'company_website',
            timeout_ms: options.timeout_ms || 15000,
            ...options
        });

        this.maxPagesPerSite = options.maxPagesPerSite || 3;
        this.extractionPatterns = { ...EXTRACTION_PATTERNS, ...options.extractionPatterns };
        this.pagePaths = { ...PAGE_PATHS, ...options.pagePaths };

        // WebFetch function (can be injected for testing)
        this.fetchFn = options.fetchFn || null;
    }

    /**
     * Get supported fields
     * @returns {string[]}
     */
    get supportedFields() {
        return [
            'description',
            'industry',
            'employee_count',
            'founded_year',
            'headquarters',
            'phone',
            'email',
            'linkedin_url',
            'twitter_url',
            'facebook_url'
        ];
    }

    /**
     * Enrich a record from website data
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
            result.addError('_enricher', 'Website enricher is disabled');
            return result;
        }

        // Get domain to crawl
        const domain = this._extractDomain(record);
        if (!domain) {
            result.addError('_enricher', 'No website/domain found in record');
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
            // Fetch and extract data
            const websiteData = await this._crawlWebsite(domain, fieldsToEnrich);

            // Process extracted data into enriched values
            for (const field of fieldsToEnrich) {
                const extractedValue = websiteData[field];
                if (extractedValue !== null && extractedValue !== undefined) {
                    const enrichedValue = this.createEnrichedValue(extractedValue, {
                        sourceUrl: `https://${domain}`,
                        isOfficialSource: true,
                        matchType: 'exact'
                    });
                    result.addField(field, enrichedValue);
                    this._stats.fieldsEnriched++;
                }
            }

            result.success = result.fieldCount > 0;
            result.metadata.domain = domain;
            result.metadata.pagesChecked = websiteData._pagesChecked || 1;
            result.apiCalls = websiteData._apiCalls || 1;

        } catch (error) {
            result.addError('_enricher', `Website crawl failed: ${error.message}`);
            result.metadata.error = error.message;
        }

        result.duration_ms = Date.now() - startTime;
        this._stats.totalDuration_ms += result.duration_ms;

        return result;
    }

    /**
     * Crawl a website and extract data
     * @private
     */
    async _crawlWebsite(domain, targetFields) {
        const extractedData = {
            _pagesChecked: 0,
            _apiCalls: 0
        };

        // Determine which pages to check based on target fields
        const pagesToCheck = this._getPagesForFields(targetFields);

        // Start with homepage
        const homeContent = await this._fetchPage(`https://${domain}`);
        extractedData._apiCalls++;
        extractedData._pagesChecked++;

        if (homeContent) {
            this._extractFromContent(homeContent, targetFields, extractedData, domain);
        }

        // Check additional pages if needed
        const remainingFields = targetFields.filter(f => !extractedData[f]);

        if (remainingFields.length > 0 && extractedData._pagesChecked < this.maxPagesPerSite) {
            for (const pageType of pagesToCheck) {
                if (extractedData._pagesChecked >= this.maxPagesPerSite) break;

                const paths = this.pagePaths[pageType] || [];
                for (const path of paths) {
                    if (extractedData._pagesChecked >= this.maxPagesPerSite) break;

                    const pageContent = await this._fetchPage(`https://${domain}${path}`);
                    extractedData._apiCalls++;
                    extractedData._pagesChecked++;

                    if (pageContent) {
                        this._extractFromContent(pageContent, remainingFields, extractedData, domain);
                    }

                    // Check if all fields found
                    const stillMissing = remainingFields.filter(f => !extractedData[f]);
                    if (stillMissing.length === 0) break;
                }
            }
        }

        return extractedData;
    }

    /**
     * Determine which page types to check based on fields
     * @private
     */
    _getPagesForFields(fields) {
        const pages = new Set();

        for (const field of fields) {
            switch (field) {
                case 'description':
                case 'founded_year':
                case 'headquarters':
                case 'industry':
                    pages.add('about');
                    break;
                case 'phone':
                case 'email':
                    pages.add('contact');
                    break;
                case 'employee_count':
                    pages.add('about');
                    pages.add('careers');
                    break;
                default:
                    pages.add('about');
            }
        }

        return Array.from(pages);
    }

    /**
     * Fetch a webpage
     * @private
     */
    async _fetchPage(url) {
        try {
            return await this._rateLimitedRequest(async () => {
                if (this.fetchFn) {
                    return await this.fetchFn(url);
                }

                // Simulate fetch for when no fetchFn provided
                // In production, this would use WebFetch tool
                return null;
            });
        } catch (error) {
            // Page not found or error - return null
            return null;
        }
    }

    /**
     * Extract data from page content
     * @private
     */
    _extractFromContent(content, targetFields, extractedData, domain) {
        for (const field of targetFields) {
            // Skip if already extracted
            if (extractedData[field]) continue;

            const value = this._extractField(content, field, domain);
            if (value !== null) {
                extractedData[field] = value;
            }
        }
    }

    /**
     * Extract a specific field from content
     * @private
     */
    _extractField(content, field, domain) {
        switch (field) {
            case 'employee_count':
                return this._extractEmployeeCount(content);
            case 'founded_year':
                return this._extractFoundedYear(content);
            case 'headquarters':
                return this._extractHeadquarters(content);
            case 'phone':
                return this._extractPhone(content);
            case 'email':
                return this._extractEmail(content, domain);
            case 'industry':
                return this._inferIndustry(content);
            case 'description':
                return this._extractDescription(content);
            case 'linkedin_url':
            case 'twitter_url':
            case 'facebook_url':
                return this._extractSocialLink(content, field.replace('_url', ''));
            default:
                return null;
        }
    }

    /**
     * Extract employee count
     * @private
     */
    _extractEmployeeCount(content) {
        for (const pattern of this.extractionPatterns.employee_count) {
            const match = content.match(pattern);
            if (match) {
                // Handle range (e.g., "100-500 employees")
                if (match[2]) {
                    const low = parseInt(match[1].replace(/,/g, ''), 10);
                    const high = parseInt(match[2].replace(/,/g, ''), 10);
                    return `${low}-${high}`;
                }
                return parseInt(match[1].replace(/,/g, ''), 10);
            }
        }
        return null;
    }

    /**
     * Extract founded year
     * @private
     */
    _extractFoundedYear(content) {
        for (const pattern of this.extractionPatterns.founded_year) {
            const match = content.match(pattern);
            if (match) {
                const year = parseInt(match[1], 10);
                const currentYear = new Date().getFullYear();
                // Validate year is reasonable (1800 - current year)
                if (year >= 1800 && year <= currentYear) {
                    return year;
                }
            }
        }
        return null;
    }

    /**
     * Extract headquarters location
     * @private
     */
    _extractHeadquarters(content) {
        for (const pattern of this.extractionPatterns.headquarters) {
            const match = content.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        return null;
    }

    /**
     * Extract phone number
     * @private
     */
    _extractPhone(content) {
        for (const pattern of this.extractionPatterns.phone) {
            const match = content.match(pattern);
            if (match) {
                const phone = match[1].replace(/[^\d+]/g, '');
                // Validate phone has enough digits
                if (phone.length >= 10) {
                    return phone;
                }
            }
        }
        return null;
    }

    /**
     * Extract email address
     * @private
     */
    _extractEmail(content, domain) {
        for (const pattern of this.extractionPatterns.email) {
            const matches = content.match(new RegExp(pattern.source, 'gi'));
            if (matches) {
                // Prefer emails from the company domain
                const domainEmail = matches.find(e =>
                    e.toLowerCase().endsWith(`@${domain}`)
                );
                if (domainEmail) return domainEmail;

                // Otherwise return first valid email
                return matches[0];
            }
        }
        return null;
    }

    /**
     * Infer industry from content keywords
     * @private
     */
    _inferIndustry(content) {
        const contentLower = content.toLowerCase();
        const scores = {};

        for (const [industry, keywords] of Object.entries(this.extractionPatterns.industry_keywords)) {
            let score = 0;
            for (const keyword of keywords) {
                const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
                const matches = contentLower.match(regex);
                if (matches) {
                    score += matches.length;
                }
            }
            if (score > 0) {
                scores[industry] = score;
            }
        }

        // Return industry with highest score
        if (Object.keys(scores).length > 0) {
            const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
            return this._formatIndustry(sorted[0][0]);
        }

        return null;
    }

    /**
     * Format industry name
     * @private
     */
    _formatIndustry(industry) {
        const mapping = {
            technology: 'Technology',
            healthcare: 'Healthcare',
            finance: 'Financial Services',
            manufacturing: 'Manufacturing',
            retail: 'Retail',
            government: 'Government'
        };
        return mapping[industry] || industry;
    }

    /**
     * Extract company description
     * @private
     */
    _extractDescription(content) {
        // Look for meta description or first substantial paragraph
        const metaMatch = content.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
        if (metaMatch && metaMatch[1].length > 50) {
            return metaMatch[1].trim();
        }

        // Look for "About" section content
        const aboutMatch = content.match(/(?:about\s+us|who\s+we\s+are|our\s+mission)[^<]*<[^>]+>([^<]{100,500})/i);
        if (aboutMatch) {
            return aboutMatch[1].trim();
        }

        return null;
    }

    /**
     * Extract social media link
     * @private
     */
    _extractSocialLink(content, platform) {
        const pattern = this.extractionPatterns.social_links[platform];
        if (!pattern) return null;

        const match = content.match(pattern);
        if (match) {
            switch (platform) {
                case 'linkedin':
                    return `https://linkedin.com/company/${match[1]}`;
                case 'twitter':
                    return `https://twitter.com/${match[1]}`;
                case 'facebook':
                    return `https://facebook.com/${match[1]}`;
                default:
                    return match[0];
            }
        }
        return null;
    }

    /**
     * Set the fetch function (for dependency injection)
     * @param {Function} fn - Fetch function
     */
    setFetchFunction(fn) {
        this.fetchFn = fn;
    }
}

module.exports = {
    WebsiteEnricher,
    EXTRACTION_PATTERNS,
    PAGE_PATHS
};
