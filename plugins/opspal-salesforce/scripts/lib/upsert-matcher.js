#!/usr/bin/env node

/**
 * Upsert Matcher Library
 * Multi-pass matching engine for Lead/Contact/Account upsert operations
 *
 * Features:
 * - Unique identifier matching (Salesforce ID, External ID, Email)
 * - Multi-field composite matching
 * - Fuzzy matching with confidence scoring
 * - Domain-based Lead-to-Account matching
 * - Cross-object duplicate detection
 * - Audit trail generation
 *
 * @version 1.0.0
 * @license Proprietary - RevPal Corp.
 *
 * Usage:
 *   const { UpsertMatcher } = require('./scripts/lib/upsert-matcher');
 *   const matcher = new UpsertMatcher({ orgAlias: 'acme-prod' });
 *   const results = await matcher.matchRecords(records, options);
 */

const path = require('path');
const fs = require('fs');

// Import fuzzy matcher
let FuzzyMatcher;
try {
    FuzzyMatcher = require('./fuzzy-matcher').FuzzyMatcher;
} catch (error) {
    console.warn('FuzzyMatcher not available, fuzzy matching disabled');
}

// Import lead-to-account matcher
let LeadToAccountMatcher;
try {
    LeadToAccountMatcher = require('./lead-to-account-matcher').LeadToAccountMatcher;
} catch (error) {
    // Will be created separately
}

/**
 * Match type definitions with confidence ranges
 */
const MATCH_TYPES = {
    ID_EXACT: { name: 'ID_EXACT', confidence: 1.0, description: 'Salesforce ID match' },
    EXTERNAL_ID_EXACT: { name: 'EXTERNAL_ID_EXACT', confidence: 1.0, description: 'External ID match' },
    EMAIL_EXACT: { name: 'EMAIL_EXACT', confidence: 1.0, description: 'Email address match' },
    COMPOSITE_EXACT: { name: 'COMPOSITE_EXACT', confidence: 0.90, description: 'Company+State+Phone match' },
    FUZZY_HIGH: { name: 'FUZZY_HIGH', confidence: 0.85, description: 'High confidence fuzzy match' },
    FUZZY_MEDIUM: { name: 'FUZZY_MEDIUM', confidence: 0.75, description: 'Medium confidence fuzzy match' },
    DOMAIN_MATCH: { name: 'DOMAIN_MATCH', confidence: 0.75, description: 'Email domain to Account match' },
    NO_MATCH: { name: 'NO_MATCH', confidence: 0.0, description: 'No matches found' }
};

/**
 * Recommended actions based on match type
 */
const MATCH_ACTIONS = {
    ID_EXACT: 'UPDATE',
    EXTERNAL_ID_EXACT: 'UPDATE',
    EMAIL_EXACT: 'UPDATE',
    COMPOSITE_EXACT: 'UPDATE',
    FUZZY_HIGH: 'UPDATE_WITH_VERIFICATION',
    FUZZY_MEDIUM: 'MANUAL_REVIEW',
    DOMAIN_MATCH: 'CREATE_CONTACT_UNDER_ACCOUNT',
    NO_MATCH: 'CREATE_NEW'
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
    matching: {
        primaryIdentifiers: ['Email', 'External_ID__c'],
        fuzzyMatchThreshold: 0.75,
        highConfidenceThreshold: 0.85,
        domainMatchEnabled: true,
        crossObjectDedup: true,
        compositeFields: ['Company', 'State', 'Phone'],
        excludeStatuses: ['Converted', 'Disqualified'],
        maxFuzzyResults: 5,
        batchSize: 200
    },
    normalization: {
        email: 'lowercase',
        phone: 'digitsOnly',
        company: 'removeCorpSuffixes'
    },
    objects: {
        lead: {
            enabled: true,
            fields: ['Id', 'Name', 'FirstName', 'LastName', 'Email', 'Company', 'Phone', 'State', 'Status', 'OwnerId']
        },
        contact: {
            enabled: true,
            fields: ['Id', 'Name', 'FirstName', 'LastName', 'Email', 'Phone', 'AccountId', 'OwnerId']
        },
        account: {
            enabled: true,
            fields: ['Id', 'Name', 'Website', 'Phone', 'BillingState', 'Type', 'OwnerId']
        }
    }
};

/**
 * Company suffixes to remove during normalization
 */
const COMPANY_SUFFIXES = [
    'Inc', 'Inc.', 'Incorporated',
    'LLC', 'L.L.C.', 'Limited Liability Company',
    'Corp', 'Corp.', 'Corporation',
    'Ltd', 'Ltd.', 'Limited',
    'Co', 'Co.', 'Company',
    'LP', 'L.P.', 'Limited Partnership',
    'LLP', 'L.L.P.',
    'PC', 'P.C.', 'Professional Corporation',
    'PLLC', 'P.L.L.C.',
    'NA', 'N.A.', 'National Association'
];

/**
 * Main UpsertMatcher class
 */
class UpsertMatcher {
    /**
     * Create an UpsertMatcher instance
     * @param {Object} options - Configuration options
     * @param {string} options.orgAlias - Salesforce org alias
     * @param {Object} options.config - Custom configuration overrides
     * @param {Function} options.queryExecutor - Function to execute SOQL queries
     */
    constructor(options = {}) {
        this.orgAlias = options.orgAlias;
        this.config = this._mergeConfig(DEFAULT_CONFIG, options.config || {});
        this.queryExecutor = options.queryExecutor || this._defaultQueryExecutor.bind(this);

        // Initialize fuzzy matcher
        if (FuzzyMatcher) {
            this.fuzzyMatcher = new FuzzyMatcher({
                autoDetectDomain: true,
                threshold: this.config.matching.fuzzyMatchThreshold
            });
        }

        // Initialize lead-to-account matcher
        if (LeadToAccountMatcher) {
            this.leadToAccountMatcher = new LeadToAccountMatcher({
                orgAlias: this.orgAlias,
                queryExecutor: this.queryExecutor
            });
        }

        // Statistics tracking
        this.stats = {
            totalProcessed: 0,
            matched: 0,
            unmatched: 0,
            errors: 0,
            queriesExecuted: 0
        };

        // Audit trail
        this.auditTrail = [];
    }

    /**
     * Deep merge configuration with defaults
     */
    _mergeConfig(defaults, overrides) {
        const result = JSON.parse(JSON.stringify(defaults));

        const merge = (target, source) => {
            for (const key in source) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    target[key] = target[key] || {};
                    merge(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            }
        };

        merge(result, overrides);
        return result;
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
     * Main entry point: Match records against Salesforce
     * @param {Array} records - Array of records to match
     * @param {Object} options - Matching options
     * @returns {Object} Matching results
     */
    async matchRecords(records, options = {}) {
        const startTime = Date.now();

        // Reset statistics
        this.stats = { totalProcessed: 0, matched: 0, unmatched: 0, errors: 0, queriesExecuted: 0 };
        this.auditTrail = [];

        // Validate and normalize input
        const validatedRecords = this._validateAndNormalize(records);

        // Process in batches
        const batchSize = options.batchSize || this.config.matching.batchSize;
        const results = {
            matches: [],
            unmatched: [],
            reviewQueue: [],
            errors: []
        };

        for (let i = 0; i < validatedRecords.length; i += batchSize) {
            const batch = validatedRecords.slice(i, i + batchSize);
            const batchResults = await this._processBatch(batch, options);

            results.matches.push(...batchResults.matches);
            results.unmatched.push(...batchResults.unmatched);
            results.reviewQueue.push(...batchResults.reviewQueue);
            results.errors.push(...batchResults.errors);
        }

        // Generate summary
        const duration = Date.now() - startTime;

        return {
            matchingResults: {
                summary: {
                    totalRecords: records.length,
                    matched: results.matches.length,
                    unmatched: results.unmatched.length,
                    reviewQueue: results.reviewQueue.length,
                    errors: results.errors.length,
                    matchRate: `${Math.round((results.matches.length / records.length) * 100)}%`,
                    durationMs: duration
                },
                matches: results.matches,
                unmatched: results.unmatched,
                reviewQueue: results.reviewQueue,
                errors: results.errors
            },
            auditTrail: {
                executedAt: new Date().toISOString(),
                orgAlias: this.orgAlias,
                matchingConfig: this.config.matching,
                queriesExecuted: this.stats.queriesExecuted,
                durationMs: duration
            }
        };
    }

    /**
     * Validate and normalize input records
     */
    _validateAndNormalize(records) {
        return records.map((record, index) => {
            const normalized = { ...record, _index: index };

            // Email normalization
            if (normalized.Email) {
                normalized.Email = this._normalizeEmail(normalized.Email);
                normalized._emailDomain = this._extractDomain(normalized.Email);
            }

            // Phone normalization
            if (normalized.Phone) {
                normalized.Phone = this._normalizePhone(normalized.Phone);
            }

            // Company normalization
            if (normalized.Company) {
                normalized._normalizedCompany = this._normalizeCompany(normalized.Company);
            }

            return normalized;
        });
    }

    /**
     * Process a batch of records
     */
    async _processBatch(records, options) {
        const results = {
            matches: [],
            unmatched: [],
            reviewQueue: [],
            errors: []
        };

        for (const record of records) {
            try {
                const matchResult = await this._matchSingleRecord(record, options);

                if (matchResult.matchType === 'NO_MATCH') {
                    results.unmatched.push(matchResult);
                } else if (matchResult.action === 'MANUAL_REVIEW') {
                    results.reviewQueue.push(matchResult);
                } else {
                    results.matches.push(matchResult);
                }

                this.stats.totalProcessed++;
            } catch (error) {
                results.errors.push({
                    inputRecord: record,
                    error: error.message,
                    stack: error.stack
                });
                this.stats.errors++;
            }
        }

        return results;
    }

    /**
     * Match a single record using waterfall strategy
     */
    async _matchSingleRecord(record, options) {
        // Priority 1: Salesforce ID match
        if (record.Id && this._isValidSalesforceId(record.Id)) {
            const match = await this._matchById(record.Id, options);
            if (match) {
                return this._createMatchResult(record, match, MATCH_TYPES.ID_EXACT);
            }
        }

        // Priority 2: External ID match
        for (const externalIdField of this.config.matching.primaryIdentifiers) {
            if (externalIdField !== 'Email' && record[externalIdField]) {
                const match = await this._matchByExternalId(externalIdField, record[externalIdField], options);
                if (match) {
                    return this._createMatchResult(record, match, MATCH_TYPES.EXTERNAL_ID_EXACT);
                }
            }
        }

        // Priority 3: Email exact match
        if (record.Email) {
            const match = await this._matchByEmail(record.Email, options);
            if (match) {
                return this._createMatchResult(record, match, MATCH_TYPES.EMAIL_EXACT);
            }
        }

        // Priority 4: Composite field match
        if (record._normalizedCompany && (record.State || record.Phone)) {
            const match = await this._matchByComposite(record, options);
            if (match) {
                return this._createMatchResult(record, match, MATCH_TYPES.COMPOSITE_EXACT);
            }
        }

        // Priority 5: Fuzzy match
        if (this.fuzzyMatcher && record._normalizedCompany) {
            const fuzzyMatches = await this._matchByFuzzy(record, options);
            if (fuzzyMatches.length > 0) {
                const bestMatch = fuzzyMatches[0];
                const matchType = bestMatch.confidence >= this.config.matching.highConfidenceThreshold
                    ? MATCH_TYPES.FUZZY_HIGH
                    : MATCH_TYPES.FUZZY_MEDIUM;

                // Multiple close matches = manual review
                if (fuzzyMatches.length > 1 &&
                    fuzzyMatches[1].confidence >= this.config.matching.fuzzyMatchThreshold) {
                    return this._createReviewResult(record, fuzzyMatches);
                }

                return this._createMatchResult(record, bestMatch.record, matchType, bestMatch.confidence);
            }
        }

        // Priority 6: Domain-based Lead-to-Account match
        if (this.config.matching.domainMatchEnabled && record._emailDomain) {
            const accountMatch = await this._matchByDomain(record._emailDomain, options);
            if (accountMatch) {
                // Check for existing contact on this account
                if (this.config.matching.crossObjectDedup && record.Email) {
                    const existingContact = await this._checkExistingContact(record.Email, accountMatch.Id);
                    if (existingContact) {
                        return this._createMatchResult(record, existingContact, MATCH_TYPES.EMAIL_EXACT);
                    }
                }

                return this._createMatchResult(record, accountMatch, MATCH_TYPES.DOMAIN_MATCH);
            }
        }

        // Priority 7: No match found
        return this._createNoMatchResult(record);
    }

    /**
     * Match by Salesforce ID
     */
    async _matchById(id, options) {
        const objectType = this._detectObjectType(id);
        if (!objectType) return null;

        const fields = this.config.objects[objectType]?.fields?.join(', ') || 'Id, Name';
        const query = `SELECT ${fields} FROM ${this._capitalize(objectType)} WHERE Id = '${id}' LIMIT 1`;

        const results = await this.queryExecutor(query);
        return results[0] || null;
    }

    /**
     * Match by External ID field
     */
    async _matchByExternalId(field, value, options) {
        const queries = [];

        if (this.config.objects.lead.enabled) {
            queries.push({
                object: 'Lead',
                query: `SELECT ${this.config.objects.lead.fields.join(', ')} FROM Lead WHERE ${field} = '${this._escapeSOQL(value)}' LIMIT 1`
            });
        }

        if (this.config.objects.contact.enabled) {
            queries.push({
                object: 'Contact',
                query: `SELECT ${this.config.objects.contact.fields.join(', ')} FROM Contact WHERE ${field} = '${this._escapeSOQL(value)}' LIMIT 1`
            });
        }

        for (const q of queries) {
            try {
                const results = await this.queryExecutor(q.query);
                if (results.length > 0) {
                    return { ...results[0], _matchedObject: q.object };
                }
            } catch (error) {
                // Field might not exist on this object, continue
            }
        }

        return null;
    }

    /**
     * Match by Email address
     */
    async _matchByEmail(email, options) {
        const normalizedEmail = this._normalizeEmail(email);
        const excludeClause = this._buildExcludeStatusClause();

        // Check Leads
        if (this.config.objects.lead.enabled) {
            const leadQuery = `SELECT ${this.config.objects.lead.fields.join(', ')} FROM Lead WHERE Email = '${this._escapeSOQL(normalizedEmail)}' ${excludeClause} LIMIT 1`;
            const leads = await this.queryExecutor(leadQuery);
            if (leads.length > 0) {
                return { ...leads[0], _matchedObject: 'Lead' };
            }
        }

        // Check Contacts
        if (this.config.objects.contact.enabled) {
            const contactQuery = `SELECT ${this.config.objects.contact.fields.join(', ')} FROM Contact WHERE Email = '${this._escapeSOQL(normalizedEmail)}' LIMIT 1`;
            const contacts = await this.queryExecutor(contactQuery);
            if (contacts.length > 0) {
                return { ...contacts[0], _matchedObject: 'Contact' };
            }
        }

        return null;
    }

    /**
     * Match by composite fields (Company + State + Phone)
     */
    async _matchByComposite(record, options) {
        const conditions = [];

        if (record._normalizedCompany) {
            conditions.push(`Company LIKE '%${this._escapeSOQL(record._normalizedCompany)}%'`);
        }

        if (record.State) {
            conditions.push(`State = '${this._escapeSOQL(record.State)}'`);
        }

        if (record.Phone) {
            const phoneDigits = record.Phone.replace(/\D/g, '').slice(-10);
            conditions.push(`Phone LIKE '%${phoneDigits}%'`);
        }

        if (conditions.length < 2) return null;

        const excludeClause = this._buildExcludeStatusClause();
        const query = `SELECT ${this.config.objects.lead.fields.join(', ')} FROM Lead WHERE ${conditions.join(' AND ')} ${excludeClause} LIMIT 5`;

        const results = await this.queryExecutor(query);

        if (results.length === 1) {
            return { ...results[0], _matchedObject: 'Lead' };
        }

        return null;
    }

    /**
     * Match using fuzzy matching
     */
    async _matchByFuzzy(record, options) {
        if (!this.fuzzyMatcher) return [];

        const excludeClause = this._buildExcludeStatusClause();
        const query = `SELECT ${this.config.objects.lead.fields.join(', ')} FROM Lead WHERE Company != null ${excludeClause} LIMIT 1000`;

        const candidates = await this.queryExecutor(query);
        if (candidates.length === 0) return [];

        const targetNames = candidates.map(c => c.Company || c.Name);
        const matches = this.fuzzyMatcher.match(record._normalizedCompany, targetNames, {
            returnMultiple: true,
            maxResults: this.config.matching.maxFuzzyResults
        });

        return matches
            .filter(m => m.confidence >= this.config.matching.fuzzyMatchThreshold)
            .map(m => ({
                record: { ...candidates[m.index], _matchedObject: 'Lead' },
                confidence: m.confidence,
                matchReason: m.reason
            }));
    }

    /**
     * Match by email domain to Account website
     */
    async _matchByDomain(domain, options) {
        if (!domain) return null;

        // Common email providers should not match
        const commonProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'mail.com'];
        if (commonProviders.includes(domain.toLowerCase())) {
            return null;
        }

        const query = `
            SELECT ${this.config.objects.account.fields.join(', ')}
            FROM Account
            WHERE Website LIKE '%${this._escapeSOQL(domain)}%'
            LIMIT 5
        `;

        const results = await this.queryExecutor(query);

        if (results.length === 1) {
            return { ...results[0], _matchedObject: 'Account' };
        }

        // Multiple accounts with same domain - need manual review
        if (results.length > 1) {
            this._addToAuditTrail('DOMAIN_MATCH_MULTIPLE', {
                domain,
                matchCount: results.length,
                accounts: results.map(a => ({ Id: a.Id, Name: a.Name }))
            });
        }

        return results.length === 1 ? { ...results[0], _matchedObject: 'Account' } : null;
    }

    /**
     * Check for existing contact with email on account
     */
    async _checkExistingContact(email, accountId) {
        const query = `
            SELECT ${this.config.objects.contact.fields.join(', ')}
            FROM Contact
            WHERE Email = '${this._escapeSOQL(email)}'
              AND AccountId = '${accountId}'
            LIMIT 1
        `;

        const results = await this.queryExecutor(query);
        return results[0] ? { ...results[0], _matchedObject: 'Contact' } : null;
    }

    /**
     * Build exclude status clause for queries
     */
    _buildExcludeStatusClause() {
        if (this.config.matching.excludeStatuses.length === 0) return '';

        const statuses = this.config.matching.excludeStatuses.map(s => `'${s}'`).join(', ');
        return `AND Status NOT IN (${statuses})`;
    }

    /**
     * Create match result object
     */
    _createMatchResult(inputRecord, matchedRecord, matchType, confidence = null) {
        const result = {
            inputRecord: this._sanitizeRecord(inputRecord),
            matchedRecord: this._sanitizeRecord(matchedRecord),
            matchType: matchType.name,
            confidence: confidence !== null ? confidence : matchType.confidence,
            matchedObject: matchedRecord._matchedObject || this._detectObjectFromId(matchedRecord.Id),
            action: MATCH_ACTIONS[matchType.name]
        };

        this._addToAuditTrail('MATCH_FOUND', result);
        this.stats.matched++;

        return result;
    }

    /**
     * Create review result for ambiguous matches
     */
    _createReviewResult(inputRecord, potentialMatches) {
        const result = {
            inputRecord: this._sanitizeRecord(inputRecord),
            potentialMatches: potentialMatches.map(m => ({
                Id: m.record.Id,
                Name: m.record.Name || m.record.Company,
                confidence: m.confidence,
                matchReason: m.matchReason
            })),
            reason: 'Multiple potential matches with similar confidence',
            action: 'MANUAL_REVIEW'
        };

        this._addToAuditTrail('MANUAL_REVIEW_REQUIRED', result);
        return result;
    }

    /**
     * Create no match result
     */
    _createNoMatchResult(inputRecord) {
        const result = {
            inputRecord: this._sanitizeRecord(inputRecord),
            reason: 'No matching records found',
            action: 'CREATE_NEW'
        };

        this._addToAuditTrail('NO_MATCH', result);
        this.stats.unmatched++;

        return result;
    }

    /**
     * Sanitize record by removing internal fields
     */
    _sanitizeRecord(record) {
        const sanitized = { ...record };
        delete sanitized._index;
        delete sanitized._emailDomain;
        delete sanitized._normalizedCompany;
        delete sanitized._matchedObject;
        return sanitized;
    }

    // ==================== Utility Functions ====================

    /**
     * Normalize email address
     */
    _normalizeEmail(email) {
        if (!email) return null;
        return email.toLowerCase().trim();
    }

    /**
     * Extract domain from email
     */
    _extractDomain(email) {
        if (!email || !email.includes('@')) return null;
        return email.split('@')[1].toLowerCase();
    }

    /**
     * Normalize phone number to digits only
     */
    _normalizePhone(phone) {
        if (!phone) return null;
        return phone.replace(/\D/g, '');
    }

    /**
     * Normalize company name
     */
    _normalizeCompany(company) {
        if (!company) return null;

        let normalized = company.trim();

        // Remove common suffixes
        for (const suffix of COMPANY_SUFFIXES) {
            const pattern = new RegExp(`\\s*,?\\s*${suffix}\\s*$`, 'i');
            normalized = normalized.replace(pattern, '');
        }

        // Remove extra whitespace
        normalized = normalized.replace(/\s+/g, ' ').trim();

        return normalized;
    }

    /**
     * Validate Salesforce ID format
     */
    _isValidSalesforceId(id) {
        if (!id) return false;
        return /^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$/.test(id);
    }

    /**
     * Detect object type from Salesforce ID prefix
     */
    _detectObjectType(id) {
        if (!id || id.length < 3) return null;

        const prefix = id.substring(0, 3);
        const prefixMap = {
            '00Q': 'lead',
            '003': 'contact',
            '001': 'account',
            '006': 'opportunity'
        };

        return prefixMap[prefix] || null;
    }

    /**
     * Detect object from ID
     */
    _detectObjectFromId(id) {
        const type = this._detectObjectType(id);
        return type ? this._capitalize(type) : 'Unknown';
    }

    /**
     * Capitalize first letter
     */
    _capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Escape SOQL special characters
     */
    _escapeSOQL(str) {
        if (!str) return '';
        return str.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
    }

    /**
     * Add entry to audit trail
     */
    _addToAuditTrail(action, details) {
        this.auditTrail.push({
            timestamp: new Date().toISOString(),
            action,
            details
        });
    }
}

// ==================== CLI Support ====================

if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(`
Usage: node upsert-matcher.js <org-alias> <command> [options]

Commands:
  match <file.json>     Match records from JSON file
  test <email>          Test email matching
  config                Show current configuration

Options:
  --output <file>       Write results to file
  --verbose             Show detailed output

Examples:
  node upsert-matcher.js acme-prod match ./leads.json
  node upsert-matcher.js acme-prod test john@acme.com
        `);
        process.exit(1);
    }

    const [orgAlias, command, ...rest] = args;
    const matcher = new UpsertMatcher({ orgAlias });

    (async () => {
        try {
            switch (command) {
                case 'match':
                    const inputFile = rest[0];
                    if (!inputFile) {
                        console.error('Error: Input file required');
                        process.exit(1);
                    }

                    const records = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
                    const results = await matcher.matchRecords(records);

                    console.log(JSON.stringify(results, null, 2));
                    break;

                case 'test':
                    const email = rest[0];
                    if (!email) {
                        console.error('Error: Email required');
                        process.exit(1);
                    }

                    const testResult = await matcher.matchRecords([{ Email: email }]);
                    console.log(JSON.stringify(testResult, null, 2));
                    break;

                case 'config':
                    console.log(JSON.stringify(matcher.config, null, 2));
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

module.exports = { UpsertMatcher, MATCH_TYPES, MATCH_ACTIONS, DEFAULT_CONFIG };
