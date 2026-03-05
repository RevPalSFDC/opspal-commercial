#!/usr/bin/env node
/**
 * Deterministic Matcher - Exact Key Matching for Entity Resolution
 *
 * Part of the RevOps Data Quality System.
 * Performs Phase 1 of multi-layer deduplication: exact key matching.
 *
 * Features:
 * - Domain-based matching (normalized)
 * - Email-based matching (normalized)
 * - External ID matching (Salesforce ID, HubSpot ID, DUNS, etc.)
 * - Configurable matching strategies per entity type
 * - Match confidence scoring
 * - Cluster generation for downstream processing
 *
 * Usage:
 *   const { DeterministicMatcher } = require('./deterministic-matcher');
 *   const matcher = new DeterministicMatcher({ entityType: 'account' });
 *   const clusters = matcher.match(records);
 */

const { NormalizationEngine } = require('./normalization-engine');

// Default matching configuration
const DEFAULT_CONFIG = {
    account: {
        primaryKeys: ['salesforce_id', 'hubspot_id', 'duns_number'],
        secondaryKeys: ['domain'],
        tertiaryKeys: ['ein', 'linkedin_company_id'],
        matchHierarchy: ['salesforce_id', 'hubspot_id', 'duns_number', 'domain'],
        requireMinimumKeys: 1
    },
    contact: {
        primaryKeys: ['salesforce_id', 'hubspot_id'],
        secondaryKeys: ['email'],
        tertiaryKeys: ['linkedin_url', 'phone'],
        matchHierarchy: ['email', 'salesforce_id', 'hubspot_id'],
        requireMinimumKeys: 1
    },
    lead: {
        primaryKeys: ['salesforce_id', 'hubspot_id'],
        secondaryKeys: ['email'],
        tertiaryKeys: ['phone', 'linkedin_url'],
        matchHierarchy: ['email', 'salesforce_id', 'hubspot_id'],
        requireMinimumKeys: 1
    }
};

// Match type confidence scores (0-100)
const MATCH_CONFIDENCE = {
    salesforce_id: 100,      // Exact SF ID match - definitive
    hubspot_id: 100,         // Exact HS ID match - definitive
    duns_number: 98,         // DUNS is authoritative for companies
    ein: 95,                 // EIN is authoritative for US companies
    domain: 90,              // Domain is strong but companies may share
    email: 95,               // Email is strong for contacts
    linkedin_company_id: 85, // LinkedIn company ID
    linkedin_url: 80,        // LinkedIn profile URL
    phone: 70                // Phone less reliable (shared numbers)
};

/**
 * Cluster class to represent a group of matching records
 */
class MatchCluster {
    constructor(id, matchKey, matchType) {
        this.id = id;
        this.matchKey = matchKey;
        this.matchType = matchType;
        this.confidence = MATCH_CONFIDENCE[matchType] || 50;
        this.records = [];
        this.metadata = {
            createdAt: new Date().toISOString(),
            recordCount: 0,
            sources: new Set()
        };
    }

    addRecord(record, source = 'unknown') {
        this.records.push({
            record,
            source,
            addedAt: new Date().toISOString()
        });
        this.metadata.recordCount = this.records.length;
        this.metadata.sources.add(source);
    }

    getRecords() {
        return this.records.map(r => r.record);
    }

    toJSON() {
        return {
            id: this.id,
            matchKey: this.matchKey,
            matchType: this.matchType,
            confidence: this.confidence,
            recordCount: this.metadata.recordCount,
            sources: Array.from(this.metadata.sources),
            createdAt: this.metadata.createdAt,
            records: this.records
        };
    }
}

/**
 * Deterministic Matcher Class
 * Performs exact key matching for entity resolution
 */
class DeterministicMatcher {
    constructor(options = {}) {
        this.entityType = options.entityType || 'account';
        this.config = { ...DEFAULT_CONFIG[this.entityType], ...options.config };
        this.normalizationEngine = options.normalizationEngine || new NormalizationEngine();
        this.clusterIdCounter = 0;
        this.stats = this.initStats();
    }

    /**
     * Initialize statistics tracking
     */
    initStats() {
        return {
            totalRecords: 0,
            recordsMatched: 0,
            recordsUnmatched: 0,
            clustersCreated: 0,
            matchesByType: {},
            processingTime: 0
        };
    }

    /**
     * Main matching method - processes records and returns clusters
     * @param {Array} records - Records to match
     * @param {Object} options - Matching options
     * @returns {Object} Matching results with clusters
     */
    match(records, options = {}) {
        const startTime = Date.now();
        this.stats = this.initStats();
        this.stats.totalRecords = records.length;

        const {
            source = 'unknown',
            includeUnmatched = true,
            minClusterSize = 2
        } = options;

        // Index for tracking which records have been matched
        const matchedRecordIds = new Set();
        const clusters = [];
        const indexedRecords = this.indexRecords(records);

        // Process each key type in hierarchy order
        for (const keyType of this.config.matchHierarchy) {
            const keyMatches = this.matchByKeyType(
                records,
                indexedRecords,
                keyType,
                matchedRecordIds,
                source
            );
            clusters.push(...keyMatches);
        }

        // Track unmatched records
        const unmatchedRecords = records.filter((r, idx) => !matchedRecordIds.has(idx));
        this.stats.recordsUnmatched = unmatchedRecords.length;

        // Filter clusters by minimum size
        const validClusters = clusters.filter(c => c.records.length >= minClusterSize);
        this.stats.clustersCreated = validClusters.length;

        // Calculate matched count
        const matchedInClusters = new Set();
        validClusters.forEach(cluster => {
            cluster.records.forEach(r => {
                const idx = records.indexOf(r.record);
                if (idx !== -1) matchedInClusters.add(idx);
            });
        });
        this.stats.recordsMatched = matchedInClusters.size;

        this.stats.processingTime = Date.now() - startTime;

        return {
            clusters: validClusters.map(c => c.toJSON()),
            unmatched: includeUnmatched ? unmatchedRecords : [],
            stats: this.stats,
            metadata: {
                entityType: this.entityType,
                matchHierarchy: this.config.matchHierarchy,
                processedAt: new Date().toISOString(),
                source
            }
        };
    }

    /**
     * Index records by all potential matching keys
     * @param {Array} records - Records to index
     * @returns {Object} Indexed records by key type
     */
    indexRecords(records) {
        const indexes = {};
        const allKeyTypes = [
            ...this.config.primaryKeys,
            ...this.config.secondaryKeys,
            ...this.config.tertiaryKeys
        ];

        // Initialize indexes for each key type
        allKeyTypes.forEach(keyType => {
            indexes[keyType] = new Map();
        });

        // Index each record
        records.forEach((record, idx) => {
            for (const keyType of allKeyTypes) {
                const normalizedKey = this.extractAndNormalizeKey(record, keyType);
                if (normalizedKey && normalizedKey !== 'unknown') {
                    if (!indexes[keyType].has(normalizedKey)) {
                        indexes[keyType].set(normalizedKey, []);
                    }
                    indexes[keyType].get(normalizedKey).push({ record, index: idx });
                }
            }
        });

        return indexes;
    }

    /**
     * Extract and normalize a key from a record
     * @param {Object} record - Record to extract from
     * @param {string} keyType - Type of key to extract
     * @returns {string|null} Normalized key value
     */
    extractAndNormalizeKey(record, keyType) {
        // Get raw value from record (support nested paths)
        let rawValue = this.getNestedValue(record, keyType);

        if (!rawValue) {
            // Try common field name variations
            const variations = this.getFieldVariations(keyType);
            for (const variation of variations) {
                rawValue = this.getNestedValue(record, variation);
                if (rawValue) break;
            }
        }

        if (!rawValue) return null;

        // Normalize based on key type
        switch (keyType) {
            case 'domain':
            case 'website':
            case 'website_domain':
                const domainResult = this.normalizationEngine.normalizeDomain(rawValue);
                return domainResult.valid ? domainResult.normalized : null;

            case 'email':
            case 'email_address':
                const emailResult = this.normalizationEngine.normalizeEmail(rawValue);
                return emailResult.valid ? emailResult.normalized : null;

            case 'phone':
            case 'phone_number':
                const phoneResult = this.normalizationEngine.normalizePhone(rawValue);
                return phoneResult.valid ? phoneResult.normalized : null;

            case 'salesforce_id':
            case 'salesforceaccountid':
            case 'sf_account_id':
            case 'sf_id':
                return this.normalizeSalesforceId(rawValue);

            case 'hubspot_id':
            case 'hs_object_id':
            case 'hubspot_company_id':
                return this.normalizeHubSpotId(rawValue);

            case 'duns_number':
            case 'duns':
                return this.normalizeDunsNumber(rawValue);

            case 'ein':
            case 'tax_id':
                return this.normalizeEIN(rawValue);

            case 'linkedin_url':
            case 'linkedin_company_url':
                return this.normalizeLinkedInUrl(rawValue);

            case 'linkedin_company_id':
                return String(rawValue).trim();

            default:
                // Generic normalization for unknown key types
                return String(rawValue).toLowerCase().trim();
        }
    }

    /**
     * Get nested value from object using dot notation
     */
    getNestedValue(obj, path) {
        const keys = path.split('.');
        let value = obj;
        for (const key of keys) {
            if (value === null || value === undefined) return null;
            value = value[key];
        }
        return value;
    }

    /**
     * Get common field name variations for a key type
     */
    getFieldVariations(keyType) {
        const variations = {
            domain: ['domain', 'website', 'website_domain', 'company_domain', 'properties.domain', 'properties.website'],
            email: ['email', 'email_address', 'work_email', 'properties.email'],
            phone: ['phone', 'phone_number', 'work_phone', 'mobile_phone', 'properties.phone'],
            salesforce_id: ['salesforce_id', 'salesforceaccountid', 'sf_account_id', 'sf_id', 'properties.salesforceaccountid', 'Id'],
            hubspot_id: ['hubspot_id', 'hs_object_id', 'id', 'properties.hs_object_id'],
            duns_number: ['duns_number', 'duns', 'd_u_n_s_number__c', 'DUNSNumber__c'],
            ein: ['ein', 'tax_id', 'employer_id', 'EIN__c'],
            linkedin_url: ['linkedin_url', 'linkedin_company_url', 'linkedin', 'LinkedInURL__c'],
            linkedin_company_id: ['linkedin_company_id', 'li_company_id', 'LinkedInCompanyId__c']
        };
        return variations[keyType] || [keyType];
    }

    /**
     * Match records by a specific key type
     */
    matchByKeyType(records, indexedRecords, keyType, matchedRecordIds, source) {
        const clusters = [];
        const index = indexedRecords[keyType];

        if (!index) return clusters;

        index.forEach((recordEntries, normalizedKey) => {
            // Only create cluster if multiple records share this key
            if (recordEntries.length > 1) {
                // Filter out already-matched records
                const unmatchedEntries = recordEntries.filter(
                    entry => !matchedRecordIds.has(entry.index)
                );

                if (unmatchedEntries.length > 1) {
                    const cluster = new MatchCluster(
                        this.generateClusterId(),
                        normalizedKey,
                        keyType
                    );

                    unmatchedEntries.forEach(entry => {
                        cluster.addRecord(entry.record, source);
                        matchedRecordIds.add(entry.index);
                    });

                    clusters.push(cluster);
                    this.stats.matchesByType[keyType] = (this.stats.matchesByType[keyType] || 0) + 1;
                }
            }
        });

        return clusters;
    }

    /**
     * Generate unique cluster ID
     */
    generateClusterId() {
        this.clusterIdCounter++;
        return `cluster-${this.entityType}-${Date.now()}-${this.clusterIdCounter}`;
    }

    /**
     * Normalize Salesforce ID (15 or 18 character)
     */
    normalizeSalesforceId(id) {
        if (!id || typeof id !== 'string') return null;
        const cleaned = id.trim();

        // Validate SF ID format (15 or 18 alphanumeric characters)
        if (!/^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(cleaned)) {
            return null;
        }

        // Convert 15-char to 18-char for consistency
        if (cleaned.length === 15) {
            return this.convertTo18CharId(cleaned);
        }

        return cleaned;
    }

    /**
     * Convert 15-character Salesforce ID to 18-character
     */
    convertTo18CharId(id15) {
        const suffix = [];
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';

        for (let i = 0; i < 3; i++) {
            let flags = 0;
            for (let j = 0; j < 5; j++) {
                const c = id15.charAt(i * 5 + j);
                if (c >= 'A' && c <= 'Z') {
                    flags += 1 << j;
                }
            }
            suffix.push(chars.charAt(flags));
        }

        return id15 + suffix.join('');
    }

    /**
     * Normalize HubSpot ID
     */
    normalizeHubSpotId(id) {
        if (!id) return null;
        const cleaned = String(id).trim();

        // HubSpot IDs are numeric
        if (!/^\d+$/.test(cleaned)) return null;

        return cleaned;
    }

    /**
     * Normalize DUNS number (9 digits)
     */
    normalizeDunsNumber(duns) {
        if (!duns) return null;
        const cleaned = String(duns).replace(/[^0-9]/g, '');

        // DUNS must be 9 digits
        if (cleaned.length !== 9) return null;

        return cleaned;
    }

    /**
     * Normalize EIN (Employer Identification Number)
     */
    normalizeEIN(ein) {
        if (!ein) return null;
        const cleaned = String(ein).replace(/[^0-9]/g, '');

        // EIN must be 9 digits
        if (cleaned.length !== 9) return null;

        // Format as XX-XXXXXXX
        return `${cleaned.slice(0, 2)}-${cleaned.slice(2)}`;
    }

    /**
     * Normalize LinkedIn URL
     */
    normalizeLinkedInUrl(url) {
        if (!url || typeof url !== 'string') return null;

        let cleaned = url.toLowerCase().trim();

        // Remove protocol
        cleaned = cleaned.replace(/^https?:\/\//, '');

        // Remove www
        cleaned = cleaned.replace(/^www\./, '');

        // Ensure it's a LinkedIn URL
        if (!cleaned.startsWith('linkedin.com/')) return null;

        // Remove trailing slash and query params
        cleaned = cleaned.split('?')[0].replace(/\/$/, '');

        return cleaned;
    }

    /**
     * Match a single record against existing clusters
     * @param {Object} record - Record to match
     * @param {Array} existingRecords - Existing records to match against
     * @returns {Object} Match results
     */
    matchSingle(record, existingRecords) {
        const candidates = [];

        for (const keyType of this.config.matchHierarchy) {
            const recordKey = this.extractAndNormalizeKey(record, keyType);
            if (!recordKey) continue;

            for (const existing of existingRecords) {
                const existingKey = this.extractAndNormalizeKey(existing, keyType);
                if (existingKey && recordKey === existingKey) {
                    candidates.push({
                        record: existing,
                        matchType: keyType,
                        matchKey: recordKey,
                        confidence: MATCH_CONFIDENCE[keyType] || 50
                    });
                }
            }
        }

        // Sort by confidence (highest first)
        candidates.sort((a, b) => b.confidence - a.confidence);

        return {
            hasMatch: candidates.length > 0,
            bestMatch: candidates[0] || null,
            allMatches: candidates,
            matchCount: candidates.length
        };
    }

    /**
     * Match by domain specifically (convenience method)
     */
    matchByDomain(records, options = {}) {
        const domainClusters = new Map();
        const source = options.source || 'unknown';

        records.forEach((record, idx) => {
            const domain = this.extractAndNormalizeKey(record, 'domain');
            if (domain && domain !== 'unknown') {
                if (!domainClusters.has(domain)) {
                    domainClusters.set(domain, new MatchCluster(
                        this.generateClusterId(),
                        domain,
                        'domain'
                    ));
                }
                domainClusters.get(domain).addRecord(record, source);
            }
        });

        // Filter to only duplicates (2+ records)
        const duplicateClusters = Array.from(domainClusters.values())
            .filter(c => c.records.length > 1);

        return {
            clusters: duplicateClusters.map(c => c.toJSON()),
            totalDomains: domainClusters.size,
            duplicateDomains: duplicateClusters.length
        };
    }

    /**
     * Match by email specifically (convenience method)
     */
    matchByEmail(records, options = {}) {
        const emailClusters = new Map();
        const source = options.source || 'unknown';

        records.forEach((record, idx) => {
            const email = this.extractAndNormalizeKey(record, 'email');
            if (email) {
                if (!emailClusters.has(email)) {
                    emailClusters.set(email, new MatchCluster(
                        this.generateClusterId(),
                        email,
                        'email'
                    ));
                }
                emailClusters.get(email).addRecord(record, source);
            }
        });

        // Filter to only duplicates (2+ records)
        const duplicateClusters = Array.from(emailClusters.values())
            .filter(c => c.records.length > 1);

        return {
            clusters: duplicateClusters.map(c => c.toJSON()),
            totalEmails: emailClusters.size,
            duplicateEmails: duplicateClusters.length
        };
    }

    /**
     * Match by external ID (Salesforce, HubSpot, DUNS, etc.)
     */
    matchByExternalId(records, idField, options = {}) {
        const idClusters = new Map();
        const source = options.source || 'unknown';

        records.forEach((record, idx) => {
            const id = this.extractAndNormalizeKey(record, idField);
            if (id) {
                if (!idClusters.has(id)) {
                    idClusters.set(id, new MatchCluster(
                        this.generateClusterId(),
                        id,
                        idField
                    ));
                }
                idClusters.get(id).addRecord(record, source);
            }
        });

        // Filter to only duplicates (2+ records)
        const duplicateClusters = Array.from(idClusters.values())
            .filter(c => c.records.length > 1);

        return {
            clusters: duplicateClusters.map(c => c.toJSON()),
            totalIds: idClusters.size,
            duplicateIds: duplicateClusters.length
        };
    }

    /**
     * Cross-platform matching (Salesforce + HubSpot records)
     */
    matchCrossPlatform(salesforceRecords, hubspotRecords, options = {}) {
        const {
            matchKeys = ['domain', 'salesforce_id'],
            createClusters = true
        } = options;

        const matches = [];
        const sfIndexes = {};
        const hsIndexes = {};

        // Index Salesforce records
        matchKeys.forEach(key => {
            sfIndexes[key] = new Map();
            salesforceRecords.forEach((record, idx) => {
                const normalizedKey = this.extractAndNormalizeKey(record, key);
                if (normalizedKey) {
                    if (!sfIndexes[key].has(normalizedKey)) {
                        sfIndexes[key].set(normalizedKey, []);
                    }
                    sfIndexes[key].get(normalizedKey).push({ record, index: idx, source: 'salesforce' });
                }
            });
        });

        // Index HubSpot records
        matchKeys.forEach(key => {
            hsIndexes[key] = new Map();
            hubspotRecords.forEach((record, idx) => {
                const normalizedKey = this.extractAndNormalizeKey(record, key);
                if (normalizedKey) {
                    if (!hsIndexes[key].has(normalizedKey)) {
                        hsIndexes[key].set(normalizedKey, []);
                    }
                    hsIndexes[key].get(normalizedKey).push({ record, index: idx, source: 'hubspot' });
                }
            });
        });

        // Find cross-platform matches
        matchKeys.forEach(key => {
            sfIndexes[key].forEach((sfEntries, normalizedKey) => {
                const hsEntries = hsIndexes[key].get(normalizedKey);
                if (hsEntries && hsEntries.length > 0) {
                    if (createClusters) {
                        const cluster = new MatchCluster(
                            this.generateClusterId(),
                            normalizedKey,
                            key
                        );
                        sfEntries.forEach(e => cluster.addRecord(e.record, 'salesforce'));
                        hsEntries.forEach(e => cluster.addRecord(e.record, 'hubspot'));
                        matches.push(cluster.toJSON());
                    } else {
                        matches.push({
                            matchKey: normalizedKey,
                            matchType: key,
                            confidence: MATCH_CONFIDENCE[key] || 50,
                            salesforceRecords: sfEntries.map(e => e.record),
                            hubspotRecords: hsEntries.map(e => e.record)
                        });
                    }
                }
            });
        });

        return {
            matches,
            matchCount: matches.length,
            salesforceRecordCount: salesforceRecords.length,
            hubspotRecordCount: hubspotRecords.length
        };
    }
}

// CLI Usage
if (require.main === module) {
    const fs = require('fs');
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Deterministic Matcher - Exact Key Matching

Usage:
  node deterministic-matcher.js <records-file> [options]

Options:
  --entity-type <type>  Entity type: account, contact, lead (default: account)
  --source <source>     Data source identifier (default: unknown)
  --output <file>       Output file path (default: stdout)
  --key <key>          Match by specific key only (e.g., domain, email)
  --min-size <n>       Minimum cluster size (default: 2)

Examples:
  node deterministic-matcher.js accounts.json --entity-type account
  node deterministic-matcher.js contacts.json --entity-type contact --key email
  node deterministic-matcher.js companies.json --output clusters.json
        `);
        process.exit(0);
    }

    const recordsFile = args[0];

    if (!fs.existsSync(recordsFile)) {
        console.error(`❌ Records file not found: ${recordsFile}`);
        process.exit(1);
    }

    // Parse options
    const options = {
        entityType: 'account',
        source: 'unknown',
        output: null,
        key: null,
        minSize: 2
    };

    for (let i = 1; i < args.length; i++) {
        switch (args[i]) {
            case '--entity-type':
                options.entityType = args[++i];
                break;
            case '--source':
                options.source = args[++i];
                break;
            case '--output':
                options.output = args[++i];
                break;
            case '--key':
                options.key = args[++i];
                break;
            case '--min-size':
                options.minSize = parseInt(args[++i], 10);
                break;
        }
    }

    try {
        console.log('📋 Loading records...');
        const records = JSON.parse(fs.readFileSync(recordsFile, 'utf8'));
        const recordArray = Array.isArray(records) ? records : [records];

        console.log(`   Loaded ${recordArray.length} records\n`);

        const matcher = new DeterministicMatcher({ entityType: options.entityType });

        let results;
        if (options.key) {
            console.log(`🔍 Matching by ${options.key}...`);
            if (options.key === 'domain') {
                results = matcher.matchByDomain(recordArray, { source: options.source });
            } else if (options.key === 'email') {
                results = matcher.matchByEmail(recordArray, { source: options.source });
            } else {
                results = matcher.matchByExternalId(recordArray, options.key, { source: options.source });
            }
        } else {
            console.log(`🔍 Running full deterministic matching...`);
            results = matcher.match(recordArray, {
                source: options.source,
                minClusterSize: options.minSize
            });
        }

        // Output results
        const output = JSON.stringify(results, null, 2);

        if (options.output) {
            fs.writeFileSync(options.output, output);
            console.log(`\n✅ Results written to: ${options.output}`);
        } else {
            console.log('\n📊 Results:');
            console.log(output);
        }

        // Print summary
        console.log('\n📈 Summary:');
        console.log(`   Clusters found: ${results.clusters?.length || 0}`);
        if (results.stats) {
            console.log(`   Records matched: ${results.stats.recordsMatched}`);
            console.log(`   Records unmatched: ${results.stats.recordsUnmatched}`);
            console.log(`   Processing time: ${results.stats.processingTime}ms`);
        }

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}

module.exports = { DeterministicMatcher, MatchCluster, MATCH_CONFIDENCE, DEFAULT_CONFIG };
