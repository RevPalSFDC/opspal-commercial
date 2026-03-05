#!/usr/bin/env node

/**
 * Lead-to-Account Matcher Library
 * Specialized matching engine for associating Leads with existing Accounts
 *
 * Features:
 * - Email domain extraction and matching
 * - Website URL normalization and matching
 * - Parent/subsidiary account detection
 * - Confidence scoring with detailed reasons
 * - Common email provider filtering
 * - Audit trail generation
 *
 * @version 1.0.0
 * @license Proprietary - RevPal Corp.
 *
 * Usage:
 *   const { LeadToAccountMatcher } = require('./scripts/lib/lead-to-account-matcher');
 *   const matcher = new LeadToAccountMatcher({ orgAlias: 'acme-prod' });
 *   const results = await matcher.findAccountsForLeads(leads);
 */

const path = require('path');
const fs = require('fs');

/**
 * Common email providers that should not trigger domain matching
 */
const COMMON_EMAIL_PROVIDERS = new Set([
    // Consumer email providers
    'gmail.com', 'googlemail.com',
    'yahoo.com', 'yahoo.co.uk', 'yahoo.ca', 'yahoo.com.au',
    'hotmail.com', 'hotmail.co.uk', 'hotmail.fr',
    'outlook.com', 'outlook.co.uk',
    'live.com', 'live.co.uk',
    'msn.com',
    'aol.com', 'aol.co.uk',
    'icloud.com', 'me.com', 'mac.com',
    'mail.com', 'email.com',
    'protonmail.com', 'proton.me',
    'zoho.com',
    'yandex.com', 'yandex.ru',
    'gmx.com', 'gmx.net',
    'fastmail.com',
    'tutanota.com',

    // Temporary/disposable
    'mailinator.com', 'guerrillamail.com', 'tempmail.com', '10minutemail.com',

    // ISP email
    'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'cox.net', 'charter.net',
    'spectrum.net', 'frontier.com', 'earthlink.net'
]);

/**
 * Website URL variations to try when matching
 */
const URL_VARIATIONS = [
    (domain) => domain,
    (domain) => `www.${domain}`,
    (domain) => `http://${domain}`,
    (domain) => `https://${domain}`,
    (domain) => `http://www.${domain}`,
    (domain) => `https://www.${domain}`
];

/**
 * Match confidence levels
 */
const CONFIDENCE_LEVELS = {
    EXACT_DOMAIN: { score: 0.95, description: 'Exact domain match' },
    WWW_VARIANT: { score: 0.90, description: 'WWW variant match' },
    SUBDOMAIN: { score: 0.85, description: 'Subdomain match' },
    PARENT_DOMAIN: { score: 0.80, description: 'Parent domain match' },
    FUZZY_DOMAIN: { score: 0.70, description: 'Fuzzy domain match' },
    COMPANY_NAME: { score: 0.65, description: 'Company name match only' }
};

/**
 * Main LeadToAccountMatcher class
 */
class LeadToAccountMatcher {
    /**
     * Create a LeadToAccountMatcher instance
     * @param {Object} options - Configuration options
     * @param {string} options.orgAlias - Salesforce org alias
     * @param {Function} options.queryExecutor - Function to execute SOQL queries
     * @param {Object} options.config - Custom configuration
     */
    constructor(options = {}) {
        this.orgAlias = options.orgAlias;
        this.queryExecutor = options.queryExecutor || this._defaultQueryExecutor.bind(this);
        this.config = {
            minConfidence: options.minConfidence || 0.70,
            includeParentAccounts: options.includeParentAccounts !== false,
            accountFields: options.accountFields || [
                'Id', 'Name', 'Website', 'Type', 'Industry',
                'BillingState', 'BillingCountry', 'OwnerId', 'ParentId'
            ],
            excludeAccountTypes: options.excludeAccountTypes || [],
            maxResults: options.maxResults || 5,
            ...options.config
        };

        // Cache for account lookups
        this._accountCache = new Map();
        this._cacheExpiry = 5 * 60 * 1000; // 5 minutes

        // Statistics
        this.stats = {
            leadsProcessed: 0,
            accountsMatched: 0,
            noMatchCommonProvider: 0,
            noMatchNotFound: 0,
            queriesExecuted: 0
        };

        // Audit trail
        this.auditTrail = [];
    }

    /**
     * Default query executor using sf CLI
     */
    async _defaultQueryExecutor(query) {
        const { execSync } = require('child_process');

        try {
            const cmd = `sf data query --query "${query.replace(/"/g, '\\"')}" --target-org ${this.orgAlias} --json`;
            const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
            const parsed = JSON.parse(result);
            this.stats.queriesExecuted++;
            return parsed.result?.records || [];
        } catch (error) {
            console.error('Query execution failed:', error.message);
            return [];
        }
    }

    /**
     * Find matching Accounts for a list of Leads
     * @param {Array} leads - Array of Lead records with Email field
     * @param {Object} options - Processing options
     * @returns {Object} Matching results
     */
    async findAccountsForLeads(leads, options = {}) {
        const startTime = Date.now();

        // Reset stats
        this.stats = {
            leadsProcessed: 0,
            accountsMatched: 0,
            noMatchCommonProvider: 0,
            noMatchNotFound: 0,
            queriesExecuted: 0
        };
        this.auditTrail = [];

        const results = {
            matches: [],
            noMatches: [],
            skipped: []
        };

        // Extract unique domains for batch processing
        const domainLeadMap = this._groupLeadsByDomain(leads);

        // Process each domain
        for (const [domain, domainLeads] of domainLeadMap.entries()) {
            if (this._isCommonProvider(domain)) {
                // Skip common email providers
                for (const lead of domainLeads) {
                    results.skipped.push({
                        lead: this._sanitizeLead(lead),
                        reason: 'Common email provider',
                        domain
                    });
                    this.stats.noMatchCommonProvider++;
                }
                continue;
            }

            // Find matching account for this domain
            const accountMatch = await this._findAccountByDomain(domain, options);

            if (accountMatch) {
                for (const lead of domainLeads) {
                    results.matches.push({
                        lead: this._sanitizeLead(lead),
                        account: accountMatch.account,
                        confidence: accountMatch.confidence,
                        matchType: accountMatch.matchType,
                        matchReason: accountMatch.reason
                    });
                    this.stats.accountsMatched++;
                }
            } else {
                for (const lead of domainLeads) {
                    results.noMatches.push({
                        lead: this._sanitizeLead(lead),
                        domain,
                        reason: 'No matching Account found'
                    });
                    this.stats.noMatchNotFound++;
                }
            }

            this.stats.leadsProcessed += domainLeads.length;
        }

        const duration = Date.now() - startTime;

        return {
            summary: {
                totalLeads: leads.length,
                matched: results.matches.length,
                noMatches: results.noMatches.length,
                skipped: results.skipped.length,
                matchRate: leads.length > 0 ?
                    `${Math.round((results.matches.length / leads.length) * 100)}%` : '0%',
                uniqueDomains: domainLeadMap.size,
                durationMs: duration
            },
            matches: results.matches,
            noMatches: results.noMatches,
            skipped: results.skipped,
            auditTrail: {
                executedAt: new Date().toISOString(),
                orgAlias: this.orgAlias,
                config: this.config,
                stats: this.stats,
                durationMs: duration
            }
        };
    }

    /**
     * Find Account by email domain
     * @param {string} domain - Email domain to match
     * @param {Object} options - Search options
     * @returns {Object|null} Matched account with confidence
     */
    async _findAccountByDomain(domain, options = {}) {
        // Check cache first
        const cacheKey = domain.toLowerCase();
        const cached = this._getFromCache(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        // Normalize domain
        const normalizedDomain = this._normalizeDomain(domain);
        if (!normalizedDomain) return null;

        // Build search query
        const websiteConditions = this._buildWebsiteConditions(normalizedDomain);
        const excludeClause = this._buildExcludeClause();

        const query = `
            SELECT ${this.config.accountFields.join(', ')}
            FROM Account
            WHERE (${websiteConditions})
            ${excludeClause}
            LIMIT ${this.config.maxResults}
        `;

        const accounts = await this.queryExecutor(query);

        if (accounts.length === 0) {
            // Try company name matching as fallback
            const companyMatch = await this._findAccountByCompanyName(normalizedDomain, options);
            this._addToCache(cacheKey, companyMatch);
            return companyMatch;
        }

        // Score and rank matches
        const scoredMatches = accounts.map(account => ({
            account,
            ...this._scoreMatch(account, normalizedDomain)
        })).sort((a, b) => b.confidence - a.confidence);

        const bestMatch = scoredMatches[0];

        // Log if multiple matches
        if (scoredMatches.length > 1) {
            this._addToAuditTrail('MULTIPLE_ACCOUNTS_FOR_DOMAIN', {
                domain: normalizedDomain,
                matchCount: scoredMatches.length,
                accounts: scoredMatches.map(m => ({
                    Id: m.account.Id,
                    Name: m.account.Name,
                    confidence: m.confidence
                }))
            });
        }

        const result = bestMatch.confidence >= this.config.minConfidence ? bestMatch : null;
        this._addToCache(cacheKey, result);

        return result;
    }

    /**
     * Find Account by company name (fallback)
     */
    async _findAccountByCompanyName(domain, options) {
        // Extract potential company name from domain
        const companyName = this._extractCompanyName(domain);
        if (!companyName || companyName.length < 3) return null;

        const query = `
            SELECT ${this.config.accountFields.join(', ')}
            FROM Account
            WHERE Name LIKE '%${this._escapeSOQL(companyName)}%'
            ${this._buildExcludeClause()}
            LIMIT 5
        `;

        const accounts = await this.queryExecutor(query);

        if (accounts.length === 1) {
            return {
                account: accounts[0],
                confidence: CONFIDENCE_LEVELS.COMPANY_NAME.score,
                matchType: 'COMPANY_NAME',
                reason: `Company name match: "${companyName}"`
            };
        }

        return null;
    }

    /**
     * Group leads by email domain
     */
    _groupLeadsByDomain(leads) {
        const domainMap = new Map();

        for (const lead of leads) {
            if (!lead.Email) continue;

            const domain = this._extractDomain(lead.Email);
            if (!domain) continue;

            if (!domainMap.has(domain)) {
                domainMap.set(domain, []);
            }
            domainMap.get(domain).push(lead);
        }

        return domainMap;
    }

    /**
     * Extract domain from email address
     */
    _extractDomain(email) {
        if (!email || typeof email !== 'string') return null;
        const parts = email.toLowerCase().trim().split('@');
        return parts.length === 2 ? parts[1] : null;
    }

    /**
     * Normalize domain (remove www, etc.)
     */
    _normalizeDomain(domain) {
        if (!domain) return null;

        let normalized = domain.toLowerCase().trim();

        // Remove protocol if present
        normalized = normalized.replace(/^https?:\/\//, '');

        // Remove www. prefix
        normalized = normalized.replace(/^www\./, '');

        // Remove trailing slash and path
        normalized = normalized.split('/')[0];

        return normalized;
    }

    /**
     * Build website search conditions
     */
    _buildWebsiteConditions(domain) {
        const conditions = [];

        // Exact domain match
        conditions.push(`Website LIKE '%${this._escapeSOQL(domain)}'`);
        conditions.push(`Website LIKE '%${this._escapeSOQL(domain)}/'`);

        // With www prefix
        conditions.push(`Website LIKE '%www.${this._escapeSOQL(domain)}'`);
        conditions.push(`Website LIKE '%www.${this._escapeSOQL(domain)}/'`);

        // With protocols
        conditions.push(`Website = 'http://${this._escapeSOQL(domain)}'`);
        conditions.push(`Website = 'https://${this._escapeSOQL(domain)}'`);
        conditions.push(`Website = 'http://www.${this._escapeSOQL(domain)}'`);
        conditions.push(`Website = 'https://www.${this._escapeSOQL(domain)}'`);

        return conditions.join(' OR ');
    }

    /**
     * Build exclude clause for account types
     */
    _buildExcludeClause() {
        if (this.config.excludeAccountTypes.length === 0) return '';

        const types = this.config.excludeAccountTypes.map(t => `'${t}'`).join(', ');
        return `AND Type NOT IN (${types})`;
    }

    /**
     * Score a match between account and domain
     */
    _scoreMatch(account, domain) {
        const website = this._normalizeDomain(account.Website || '');

        if (!website) {
            return {
                confidence: CONFIDENCE_LEVELS.COMPANY_NAME.score,
                matchType: 'COMPANY_NAME',
                reason: 'No website, matched by query criteria'
            };
        }

        // Exact match
        if (website === domain) {
            return {
                confidence: CONFIDENCE_LEVELS.EXACT_DOMAIN.score,
                matchType: 'EXACT_DOMAIN',
                reason: `Exact domain match: ${domain}`
            };
        }

        // WWW variant
        if (website === `www.${domain}` || `www.${website}` === domain) {
            return {
                confidence: CONFIDENCE_LEVELS.WWW_VARIANT.score,
                matchType: 'WWW_VARIANT',
                reason: `WWW variant match: ${website} ↔ ${domain}`
            };
        }

        // Subdomain match (e.g., sales.acme.com matches acme.com)
        if (website.endsWith(`.${domain}`) || domain.endsWith(`.${website}`)) {
            return {
                confidence: CONFIDENCE_LEVELS.SUBDOMAIN.score,
                matchType: 'SUBDOMAIN',
                reason: `Subdomain match: ${website} ↔ ${domain}`
            };
        }

        // Parent domain match
        const websiteParts = website.split('.');
        const domainParts = domain.split('.');

        if (websiteParts.length > 2 && domainParts.length === 2) {
            const parentDomain = websiteParts.slice(-2).join('.');
            if (parentDomain === domain) {
                return {
                    confidence: CONFIDENCE_LEVELS.PARENT_DOMAIN.score,
                    matchType: 'PARENT_DOMAIN',
                    reason: `Parent domain match: ${website} parent is ${domain}`
                };
            }
        }

        // Fuzzy match (domain is contained in website or vice versa)
        if (website.includes(domain) || domain.includes(website)) {
            return {
                confidence: CONFIDENCE_LEVELS.FUZZY_DOMAIN.score,
                matchType: 'FUZZY_DOMAIN',
                reason: `Partial domain match: ${website} ↔ ${domain}`
            };
        }

        return {
            confidence: CONFIDENCE_LEVELS.COMPANY_NAME.score,
            matchType: 'WEAK_MATCH',
            reason: 'Matched by query but domains differ significantly'
        };
    }

    /**
     * Extract potential company name from domain
     */
    _extractCompanyName(domain) {
        if (!domain) return null;

        // Remove TLD
        const parts = domain.split('.');
        if (parts.length < 2) return null;

        // Get the main part (before TLD)
        let companyPart = parts[0];

        // Handle multi-part TLDs (co.uk, com.au)
        if (parts.length > 2 && ['co', 'com', 'org', 'net'].includes(parts[parts.length - 2])) {
            companyPart = parts[parts.length - 3];
        }

        // Clean up
        return companyPart
            .replace(/[-_]/g, ' ')
            .replace(/\d+/g, '')
            .trim();
    }

    /**
     * Check if domain is a common email provider
     */
    _isCommonProvider(domain) {
        return COMMON_EMAIL_PROVIDERS.has(domain.toLowerCase());
    }

    /**
     * Sanitize lead for output
     */
    _sanitizeLead(lead) {
        return {
            Id: lead.Id,
            Name: lead.Name || `${lead.FirstName || ''} ${lead.LastName || ''}`.trim(),
            Email: lead.Email,
            Company: lead.Company
        };
    }

    /**
     * Escape SOQL special characters
     */
    _escapeSOQL(str) {
        if (!str) return '';
        return str.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
    }

    // ==================== Caching ====================

    _getFromCache(key) {
        const entry = this._accountCache.get(key);
        if (!entry) return undefined;

        if (Date.now() - entry.timestamp > this._cacheExpiry) {
            this._accountCache.delete(key);
            return undefined;
        }

        return entry.value;
    }

    _addToCache(key, value) {
        this._accountCache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    clearCache() {
        this._accountCache.clear();
    }

    // ==================== Audit Trail ====================

    _addToAuditTrail(action, details) {
        this.auditTrail.push({
            timestamp: new Date().toISOString(),
            action,
            details
        });
    }

    /**
     * Check for existing Contact on Account with same email
     * @param {string} email - Contact email to check
     * @param {string} accountId - Account ID to check
     * @returns {Object|null} Existing contact if found
     */
    async checkExistingContact(email, accountId) {
        if (!email || !accountId) return null;

        const query = `
            SELECT Id, Name, Email, Title, OwnerId
            FROM Contact
            WHERE Email = '${this._escapeSOQL(email.toLowerCase())}'
              AND AccountId = '${accountId}'
            LIMIT 1
        `;

        const contacts = await this.queryExecutor(query);
        return contacts[0] || null;
    }

    /**
     * Get all Contacts for an Account
     * @param {string} accountId - Account ID
     * @returns {Array} List of Contacts
     */
    async getAccountContacts(accountId) {
        if (!accountId) return [];

        const query = `
            SELECT Id, Name, Email, Title, Phone, OwnerId
            FROM Contact
            WHERE AccountId = '${accountId}'
            ORDER BY CreatedDate DESC
            LIMIT 100
        `;

        return await this.queryExecutor(query);
    }

    /**
     * Get parent account hierarchy
     * @param {string} accountId - Account ID
     * @returns {Array} Account hierarchy (child to ultimate parent)
     */
    async getAccountHierarchy(accountId) {
        if (!accountId) return [];

        const hierarchy = [];
        let currentId = accountId;
        const visited = new Set();

        while (currentId && !visited.has(currentId)) {
            visited.add(currentId);

            const query = `
                SELECT ${this.config.accountFields.join(', ')}
                FROM Account
                WHERE Id = '${currentId}'
                LIMIT 1
            `;

            const accounts = await this.queryExecutor(query);
            if (accounts.length === 0) break;

            hierarchy.push(accounts[0]);
            currentId = accounts[0].ParentId;
        }

        return hierarchy;
    }
}

// ==================== CLI Support ====================

if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(`
Usage: node lead-to-account-matcher.js <org-alias> <command> [options]

Commands:
  match <file.json>     Find Accounts for Leads in JSON file
  domain <domain>       Test domain matching
  contact <email> <accountId>  Check for existing contact

Examples:
  node lead-to-account-matcher.js acme-prod match ./leads.json
  node lead-to-account-matcher.js acme-prod domain acme.com
  node lead-to-account-matcher.js acme-prod contact john@acme.com 001ABC
        `);
        process.exit(1);
    }

    const [orgAlias, command, ...rest] = args;
    const matcher = new LeadToAccountMatcher({ orgAlias });

    (async () => {
        try {
            switch (command) {
                case 'match':
                    const inputFile = rest[0];
                    if (!inputFile) {
                        console.error('Error: Input file required');
                        process.exit(1);
                    }

                    const leads = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
                    const results = await matcher.findAccountsForLeads(leads);

                    console.log(JSON.stringify(results, null, 2));
                    break;

                case 'domain':
                    const domain = rest[0];
                    if (!domain) {
                        console.error('Error: Domain required');
                        process.exit(1);
                    }

                    const domainResult = await matcher._findAccountByDomain(domain);
                    console.log(JSON.stringify(domainResult, null, 2));
                    break;

                case 'contact':
                    const email = rest[0];
                    const accountId = rest[1];
                    if (!email || !accountId) {
                        console.error('Error: Email and Account ID required');
                        process.exit(1);
                    }

                    const contact = await matcher.checkExistingContact(email, accountId);
                    console.log(JSON.stringify(contact, null, 2));
                    break;

                default:
                    console.error(`Unknown command: ${command}`);
                    process.exit(1);
            }
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = {
    LeadToAccountMatcher,
    COMMON_EMAIL_PROVIDERS,
    CONFIDENCE_LEVELS
};
