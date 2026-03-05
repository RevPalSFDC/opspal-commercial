#!/usr/bin/env node
/**
 * Probabilistic Matcher - Fuzzy Matching for Entity Resolution
 *
 * Part of the RevOps Data Quality System.
 * Performs Phase 2 of multi-layer deduplication: fuzzy/probabilistic matching.
 *
 * Features:
 * - Multi-field similarity scoring with configurable weights
 * - Multiple algorithms: Jaro-Winkler, Dice, Soundex, Token-based
 * - Threshold-based classification (auto-merge, review, no-match)
 * - Blocking strategies for performance optimization
 * - Phonetic matching for names
 * - Address component matching
 *
 * Usage:
 *   const { ProbabilisticMatcher } = require('./probabilistic-matcher');
 *   const matcher = new ProbabilisticMatcher({ entityType: 'account' });
 *   const matches = matcher.findMatches(newRecord, existingRecords);
 */

const stringSimilarity = require('./string-similarity');
const { NormalizationEngine } = require('./normalization-engine');

// Default field weights by entity type (sum to 100)
const DEFAULT_WEIGHTS = {
    account: {
        name: 40,          // Company name is primary
        domain: 25,        // Domain is strong signal
        address: 15,       // Address for validation
        phone: 10,         // Phone less reliable
        industry: 10       // Industry for context
    },
    contact: {
        email: 35,         // Email is strong identifier
        name: 30,          // Full name matching
        phone: 15,         // Direct phone
        company: 15,       // Company association
        title: 5           // Job title for context
    },
    lead: {
        email: 35,
        name: 30,
        phone: 15,
        company: 15,
        title: 5
    }
};

// Default thresholds
const DEFAULT_THRESHOLDS = {
    autoMerge: 95,      // Score >= this: automatic merge candidate
    review: 80,         // Score >= this but < autoMerge: needs human review
    probable: 65,       // Score >= this but < review: possible match
    noMatch: 0          // Score < probable: not a match
};

// Similarity algorithm configuration
const ALGORITHM_CONFIG = {
    name: {
        primary: 'jaroWinkler',
        secondary: 'tokenSimilarity',
        usePhonetic: true,
        weight: { primary: 0.5, secondary: 0.3, phonetic: 0.2 }
    },
    domain: {
        primary: 'exact',
        secondary: 'diceCoefficient',
        weight: { primary: 0.8, secondary: 0.2 }
    },
    email: {
        primary: 'exact',
        secondary: 'localPartSimilarity',
        weight: { primary: 0.9, secondary: 0.1 }
    },
    address: {
        primary: 'componentMatch',
        secondary: 'tokenSimilarity',
        weight: { primary: 0.7, secondary: 0.3 }
    },
    phone: {
        primary: 'exact',
        secondary: 'lastDigits',
        weight: { primary: 0.8, secondary: 0.2 }
    },
    title: {
        primary: 'tokenSimilarity',
        secondary: 'jaroWinkler',
        weight: { primary: 0.6, secondary: 0.4 }
    },
    industry: {
        primary: 'exact',
        secondary: 'tokenSimilarity',
        weight: { primary: 0.7, secondary: 0.3 }
    }
};

/**
 * Match Candidate class to represent potential matches
 */
class MatchCandidate {
    constructor(record, score, classification) {
        this.record = record;
        this.score = score;
        this.classification = classification;
        this.fieldScores = {};
        this.matchSignals = [];
        this.metadata = {
            calculatedAt: new Date().toISOString()
        };
    }

    addFieldScore(field, score, algorithm) {
        this.fieldScores[field] = { score, algorithm };
    }

    addSignal(signal) {
        this.matchSignals.push(signal);
    }

    toJSON() {
        return {
            score: Math.round(this.score * 100) / 100,
            classification: this.classification,
            fieldScores: this.fieldScores,
            matchSignals: this.matchSignals,
            record: this.record,
            metadata: this.metadata
        };
    }
}

/**
 * Probabilistic Matcher Class
 * Performs fuzzy matching using multiple similarity algorithms
 */
class ProbabilisticMatcher {
    constructor(options = {}) {
        this.entityType = options.entityType || 'account';
        this.weights = { ...DEFAULT_WEIGHTS[this.entityType], ...options.weights };
        this.thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
        this.algorithmConfig = { ...ALGORITHM_CONFIG, ...options.algorithmConfig };
        this.normalizationEngine = options.normalizationEngine || new NormalizationEngine();
        this.blockingEnabled = options.blockingEnabled !== false;
        this.stats = this.initStats();
    }

    /**
     * Initialize statistics tracking
     */
    initStats() {
        return {
            comparisons: 0,
            matchesFound: 0,
            autoMerge: 0,
            needsReview: 0,
            probable: 0,
            noMatch: 0,
            processingTime: 0,
            blockedComparisons: 0
        };
    }

    /**
     * Find matches for a single record against a set of existing records
     * @param {Object} newRecord - Record to find matches for
     * @param {Array} existingRecords - Records to match against
     * @param {Object} options - Matching options
     * @returns {Object} Match results
     */
    findMatches(newRecord, existingRecords, options = {}) {
        const startTime = Date.now();
        this.stats = this.initStats();

        const {
            returnAll = false,
            minScore = this.thresholds.probable,
            maxResults = 10
        } = options;

        // Apply blocking if enabled
        let candidateRecords = existingRecords;
        if (this.blockingEnabled) {
            candidateRecords = this.applyBlocking(newRecord, existingRecords);
            this.stats.blockedComparisons = existingRecords.length - candidateRecords.length;
        }

        const matches = [];

        for (const existingRecord of candidateRecords) {
            this.stats.comparisons++;
            const similarity = this.calculateSimilarity(newRecord, existingRecord);

            if (similarity.score >= minScore || returnAll) {
                const candidate = new MatchCandidate(
                    existingRecord,
                    similarity.score,
                    this.classifyScore(similarity.score)
                );

                // Add field scores
                Object.entries(similarity.fieldScores).forEach(([field, data]) => {
                    candidate.addFieldScore(field, data.score, data.algorithm);
                });

                // Add match signals
                similarity.signals.forEach(signal => candidate.addSignal(signal));

                matches.push(candidate);

                // Update stats
                this.stats.matchesFound++;
                switch (candidate.classification) {
                    case 'auto_merge': this.stats.autoMerge++; break;
                    case 'needs_review': this.stats.needsReview++; break;
                    case 'probable': this.stats.probable++; break;
                    default: this.stats.noMatch++;
                }
            }
        }

        // Sort by score descending
        matches.sort((a, b) => b.score - a.score);

        // Limit results
        const limitedMatches = matches.slice(0, maxResults);

        this.stats.processingTime = Date.now() - startTime;

        return {
            matches: limitedMatches.map(m => m.toJSON()),
            bestMatch: limitedMatches[0]?.toJSON() || null,
            hasAutoMerge: limitedMatches.some(m => m.classification === 'auto_merge'),
            hasReviewNeeded: limitedMatches.some(m => m.classification === 'needs_review'),
            stats: this.stats
        };
    }

    /**
     * Calculate similarity between two records
     * @param {Object} record1 - First record
     * @param {Object} record2 - Second record
     * @returns {Object} Similarity result with score and field breakdowns
     */
    calculateSimilarity(record1, record2) {
        const fieldScores = {};
        const signals = [];
        let totalWeight = 0;
        let weightedSum = 0;

        // Normalize records for comparison
        const norm1 = this.normalizeRecord(record1);
        const norm2 = this.normalizeRecord(record2);

        // Calculate similarity for each weighted field
        for (const [field, weight] of Object.entries(this.weights)) {
            const value1 = this.extractFieldValue(norm1, field);
            const value2 = this.extractFieldValue(norm2, field);

            if (value1 && value2) {
                const fieldResult = this.calculateFieldSimilarity(field, value1, value2);
                fieldScores[field] = fieldResult;

                weightedSum += fieldResult.score * weight;
                totalWeight += weight;

                // Generate signals for high-confidence matches
                if (fieldResult.score >= 95) {
                    signals.push({
                        type: 'exact_match',
                        field,
                        confidence: 'high'
                    });
                } else if (fieldResult.score >= 80) {
                    signals.push({
                        type: 'strong_match',
                        field,
                        confidence: 'medium'
                    });
                }
            }
        }

        // Calculate final score (0-100)
        const score = totalWeight > 0 ? weightedSum / totalWeight : 0;

        // Add composite signals
        if (fieldScores.name?.score >= 90 && fieldScores.domain?.score >= 90) {
            signals.push({
                type: 'name_domain_match',
                confidence: 'very_high',
                boost: 5
            });
        }

        if (fieldScores.email?.score >= 95) {
            signals.push({
                type: 'email_exact',
                confidence: 'definitive',
                boost: 10
            });
        }

        return {
            score: Math.min(100, score),
            fieldScores,
            signals,
            fieldsCompared: Object.keys(fieldScores).length
        };
    }

    /**
     * Calculate similarity for a specific field
     */
    calculateFieldSimilarity(field, value1, value2) {
        const config = this.algorithmConfig[field] || {
            primary: 'jaroWinkler',
            weight: { primary: 1.0 }
        };

        let score = 0;
        let algorithm = config.primary;

        // Primary algorithm
        const primaryScore = this.runAlgorithm(config.primary, value1, value2, field);
        score = primaryScore * (config.weight?.primary || 1.0);

        // Secondary algorithm (if configured)
        if (config.secondary && config.weight?.secondary) {
            const secondaryScore = this.runAlgorithm(config.secondary, value1, value2, field);
            score += secondaryScore * config.weight.secondary;
        }

        // Phonetic matching for names
        if (config.usePhonetic && config.weight?.phonetic) {
            if (stringSimilarity.isPhoneticMatch(value1, value2)) {
                score += 100 * config.weight.phonetic;
            }
        }

        return {
            score: Math.min(100, score),
            algorithm,
            value1,
            value2
        };
    }

    /**
     * Run a specific similarity algorithm
     */
    runAlgorithm(algorithm, value1, value2, field) {
        switch (algorithm) {
            case 'exact':
                return value1.toLowerCase() === value2.toLowerCase() ? 100 : 0;

            case 'jaroWinkler':
                return stringSimilarity.jaroWinkler(value1, value2) * 100;

            case 'diceCoefficient':
                return stringSimilarity.diceCoefficient(value1, value2) * 100;

            case 'tokenSimilarity':
                return stringSimilarity.tokenSimilarity(value1, value2) * 100;

            case 'levenshtein':
                return stringSimilarity.levenshteinSimilarity(value1, value2) * 100;

            case 'soundex':
                return stringSimilarity.soundex(value1) === stringSimilarity.soundex(value2) ? 100 : 0;

            case 'componentMatch':
                return this.componentMatch(value1, value2, field) * 100;

            case 'localPartSimilarity':
                return this.localPartSimilarity(value1, value2) * 100;

            case 'lastDigits':
                return this.lastDigitsSimilarity(value1, value2) * 100;

            default:
                return stringSimilarity.jaroWinkler(value1, value2) * 100;
        }
    }

    /**
     * Component-based matching (for addresses)
     */
    componentMatch(addr1, addr2, field) {
        // Normalize addresses
        const norm1 = this.normalizationEngine.normalizeAddress(addr1);
        const norm2 = this.normalizationEngine.normalizeAddress(addr2);

        let matches = 0;
        let total = 0;

        // Compare components
        const components = ['street', 'city', 'state', 'zip'];
        components.forEach(comp => {
            const c1 = norm1.components?.[comp] || '';
            const c2 = norm2.components?.[comp] || '';
            if (c1 && c2) {
                total++;
                if (c1.toLowerCase() === c2.toLowerCase()) {
                    matches++;
                } else {
                    // Partial match for street
                    if (comp === 'street') {
                        matches += stringSimilarity.tokenSimilarity(c1, c2);
                    }
                }
            }
        });

        return total > 0 ? matches / total : 0;
    }

    /**
     * Email local part similarity
     */
    localPartSimilarity(email1, email2) {
        const local1 = email1.split('@')[0] || '';
        const local2 = email2.split('@')[0] || '';
        return stringSimilarity.jaroWinkler(local1, local2);
    }

    /**
     * Phone last digits similarity
     */
    lastDigitsSimilarity(phone1, phone2) {
        const digits1 = phone1.replace(/\D/g, '').slice(-7);
        const digits2 = phone2.replace(/\D/g, '').slice(-7);
        return digits1 === digits2 ? 1 : 0;
    }

    /**
     * Normalize a record for comparison
     */
    normalizeRecord(record) {
        const normalized = { ...record };

        // Normalize common fields
        if (record.name || record.account_name || record.company_name) {
            const nameField = record.name || record.account_name || record.company_name;
            const result = this.normalizationEngine.normalizeCompanyName(nameField);
            normalized._normalized_name = result.normalized;
        }

        if (record.domain || record.website) {
            const domainField = record.domain || record.website;
            const result = this.normalizationEngine.normalizeDomain(domainField);
            normalized._normalized_domain = result.normalized;
        }

        if (record.email) {
            const result = this.normalizationEngine.normalizeEmail(record.email);
            normalized._normalized_email = result.normalized;
        }

        if (record.phone) {
            const result = this.normalizationEngine.normalizePhone(record.phone);
            normalized._normalized_phone = result.normalized;
        }

        return normalized;
    }

    /**
     * Extract field value from record
     */
    extractFieldValue(record, field) {
        // Check for normalized version first
        if (record[`_normalized_${field}`]) {
            return record[`_normalized_${field}`];
        }

        // Field name variations
        const variations = {
            name: ['name', 'account_name', 'company_name', 'Name', 'properties.name'],
            domain: ['domain', 'website', 'website_domain', 'properties.domain', 'properties.website'],
            email: ['email', 'email_address', 'Email', 'properties.email'],
            phone: ['phone', 'phone_number', 'Phone', 'properties.phone'],
            address: ['address', 'billing_address', 'shipping_address', 'BillingStreet', 'properties.address'],
            title: ['title', 'job_title', 'Title', 'properties.jobtitle'],
            industry: ['industry', 'Industry', 'properties.industry'],
            company: ['company', 'company_name', 'associated_company', 'properties.company']
        };

        const fieldVariations = variations[field] || [field];

        for (const variation of fieldVariations) {
            const value = this.getNestedValue(record, variation);
            if (value) return String(value);
        }

        return null;
    }

    /**
     * Get nested value from object
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
     * Classify score into match category
     */
    classifyScore(score) {
        if (score >= this.thresholds.autoMerge) return 'auto_merge';
        if (score >= this.thresholds.review) return 'needs_review';
        if (score >= this.thresholds.probable) return 'probable';
        return 'no_match';
    }

    /**
     * Apply blocking strategy to reduce comparison space
     * Blocking filters records to only those that could possibly match
     */
    applyBlocking(newRecord, existingRecords) {
        const blocks = new Set();
        const blockingKeys = this.getBlockingKeys(newRecord);

        // First pass: find records that share blocking keys
        existingRecords.forEach((record, idx) => {
            const recordKeys = this.getBlockingKeys(record);
            for (const key of blockingKeys) {
                if (recordKeys.has(key)) {
                    blocks.add(idx);
                    break;
                }
            }
        });

        // If blocking would eliminate all candidates, return all (safety)
        if (blocks.size === 0) return existingRecords;

        return Array.from(blocks).map(idx => existingRecords[idx]);
    }

    /**
     * Generate blocking keys for a record
     */
    getBlockingKeys(record) {
        const keys = new Set();

        // Domain first 3 chars
        const domain = this.extractFieldValue(record, 'domain');
        if (domain && domain.length >= 3) {
            keys.add(`dom:${domain.slice(0, 3).toLowerCase()}`);
        }

        // Name first 3 chars
        const name = this.extractFieldValue(record, 'name');
        if (name && name.length >= 3) {
            keys.add(`nam:${name.slice(0, 3).toLowerCase()}`);
        }

        // Email domain
        const email = this.extractFieldValue(record, 'email');
        if (email) {
            const emailDomain = email.split('@')[1];
            if (emailDomain) {
                keys.add(`eml:${emailDomain.toLowerCase()}`);
            }
        }

        // Phone area code (first 3 digits after country code)
        const phone = this.extractFieldValue(record, 'phone');
        if (phone) {
            const digits = phone.replace(/\D/g, '');
            if (digits.length >= 3) {
                // Try to get area code (skip 1 if US)
                const start = digits.startsWith('1') ? 1 : 0;
                keys.add(`phn:${digits.slice(start, start + 3)}`);
            }
        }

        // Soundex of name (phonetic blocking)
        if (name) {
            keys.add(`sdx:${stringSimilarity.soundex(name)}`);
        }

        return keys;
    }

    /**
     * Batch matching - find all pairs in a set of records
     */
    findAllPairs(records, options = {}) {
        const startTime = Date.now();
        const {
            minScore = this.thresholds.probable,
            reportProgress = false
        } = options;

        const pairs = [];
        const n = records.length;

        for (let i = 0; i < n; i++) {
            if (reportProgress && i % 100 === 0) {
                console.log(`Processing ${i}/${n}...`);
            }

            // Apply blocking
            let candidates = this.blockingEnabled
                ? this.applyBlocking(records[i], records.slice(i + 1))
                : records.slice(i + 1);

            for (const candidate of candidates) {
                const j = records.indexOf(candidate);
                if (j <= i) continue; // Avoid duplicate comparisons

                const similarity = this.calculateSimilarity(records[i], candidate);

                if (similarity.score >= minScore) {
                    pairs.push({
                        record1Index: i,
                        record2Index: j,
                        score: similarity.score,
                        classification: this.classifyScore(similarity.score),
                        fieldScores: similarity.fieldScores,
                        signals: similarity.signals
                    });
                }
            }
        }

        // Sort by score descending
        pairs.sort((a, b) => b.score - a.score);

        return {
            pairs,
            totalRecords: n,
            totalComparisons: (n * (n - 1)) / 2,
            matchesFound: pairs.length,
            processingTime: Date.now() - startTime
        };
    }

    /**
     * Find duplicates within records (returns clusters)
     */
    findDuplicates(records, options = {}) {
        const pairs = this.findAllPairs(records, options);

        // Build clusters from pairs using union-find
        const parent = records.map((_, i) => i);

        const find = (x) => {
            if (parent[x] !== x) parent[x] = find(parent[x]);
            return parent[x];
        };

        const union = (x, y) => {
            const px = find(x);
            const py = find(y);
            if (px !== py) parent[px] = py;
        };

        // Union all matched pairs
        pairs.pairs.forEach(pair => {
            union(pair.record1Index, pair.record2Index);
        });

        // Group into clusters
        const clusters = new Map();
        records.forEach((record, idx) => {
            const root = find(idx);
            if (!clusters.has(root)) {
                clusters.set(root, []);
            }
            clusters.get(root).push({ record, index: idx });
        });

        // Filter to only clusters with duplicates (2+ records)
        const duplicateClusters = Array.from(clusters.values())
            .filter(cluster => cluster.length > 1)
            .map((cluster, idx) => {
                // Find the best pair score for this cluster
                const clusterIndices = new Set(cluster.map(c => c.index));
                const clusterPairs = pairs.pairs.filter(p =>
                    clusterIndices.has(p.record1Index) && clusterIndices.has(p.record2Index)
                );
                const maxScore = clusterPairs.length > 0
                    ? Math.max(...clusterPairs.map(p => p.score))
                    : 0;

                return {
                    id: `prob-cluster-${idx + 1}`,
                    recordCount: cluster.length,
                    maxScore,
                    classification: this.classifyScore(maxScore),
                    records: cluster.map(c => c.record),
                    pairs: clusterPairs
                };
            });

        return {
            clusters: duplicateClusters,
            clusterCount: duplicateClusters.length,
            totalDuplicates: duplicateClusters.reduce((sum, c) => sum + c.recordCount, 0),
            ...pairs
        };
    }

    /**
     * Update weights
     */
    setWeights(weights) {
        this.weights = { ...this.weights, ...weights };
    }

    /**
     * Update thresholds
     */
    setThresholds(thresholds) {
        this.thresholds = { ...this.thresholds, ...thresholds };
    }
}

// CLI Usage
if (require.main === module) {
    const fs = require('fs');
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Probabilistic Matcher - Fuzzy Matching for Entity Resolution

Usage:
  node probabilistic-matcher.js <records-file> [options]

Options:
  --entity-type <type>    Entity type: account, contact, lead (default: account)
  --output <file>         Output file path (default: stdout)
  --mode <mode>           Mode: single, pairs, duplicates (default: duplicates)
  --target <file>         Target record file (for single mode)
  --min-score <n>         Minimum match score (default: 65)
  --auto-merge <n>        Auto-merge threshold (default: 95)
  --review <n>            Review threshold (default: 80)
  --no-blocking           Disable blocking optimization

Examples:
  # Find duplicates within a set
  node probabilistic-matcher.js accounts.json --mode duplicates

  # Match single record against set
  node probabilistic-matcher.js existing.json --mode single --target new.json

  # Find all matching pairs
  node probabilistic-matcher.js contacts.json --mode pairs --min-score 75
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
        output: null,
        mode: 'duplicates',
        target: null,
        minScore: 65,
        autoMerge: 95,
        review: 80,
        blocking: true
    };

    for (let i = 1; i < args.length; i++) {
        switch (args[i]) {
            case '--entity-type':
                options.entityType = args[++i];
                break;
            case '--output':
                options.output = args[++i];
                break;
            case '--mode':
                options.mode = args[++i];
                break;
            case '--target':
                options.target = args[++i];
                break;
            case '--min-score':
                options.minScore = parseInt(args[++i], 10);
                break;
            case '--auto-merge':
                options.autoMerge = parseInt(args[++i], 10);
                break;
            case '--review':
                options.review = parseInt(args[++i], 10);
                break;
            case '--no-blocking':
                options.blocking = false;
                break;
        }
    }

    try {
        console.log('📋 Loading records...');
        const records = JSON.parse(fs.readFileSync(recordsFile, 'utf8'));
        const recordArray = Array.isArray(records) ? records : [records];

        console.log(`   Loaded ${recordArray.length} records\n`);

        const matcher = new ProbabilisticMatcher({
            entityType: options.entityType,
            thresholds: {
                autoMerge: options.autoMerge,
                review: options.review,
                probable: options.minScore
            },
            blockingEnabled: options.blocking
        });

        let results;

        switch (options.mode) {
            case 'single':
                if (!options.target) {
                    console.error('❌ Target file required for single mode (--target)');
                    process.exit(1);
                }
                const targetRecord = JSON.parse(fs.readFileSync(options.target, 'utf8'));
                console.log(`🔍 Finding matches for target record...`);
                results = matcher.findMatches(targetRecord, recordArray, {
                    minScore: options.minScore
                });
                break;

            case 'pairs':
                console.log(`🔍 Finding all matching pairs...`);
                results = matcher.findAllPairs(recordArray, {
                    minScore: options.minScore,
                    reportProgress: true
                });
                break;

            case 'duplicates':
            default:
                console.log(`🔍 Finding duplicate clusters...`);
                results = matcher.findDuplicates(recordArray, {
                    minScore: options.minScore
                });
                break;
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
        if (results.clusters) {
            console.log(`   Duplicate clusters: ${results.clusterCount}`);
            console.log(`   Total duplicates: ${results.totalDuplicates}`);
        }
        if (results.matches) {
            console.log(`   Matches found: ${results.matches.length}`);
            console.log(`   Has auto-merge: ${results.hasAutoMerge}`);
            console.log(`   Needs review: ${results.hasReviewNeeded}`);
        }
        if (results.pairs) {
            console.log(`   Matching pairs: ${results.pairs.length}`);
        }
        console.log(`   Processing time: ${results.processingTime}ms`);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}

module.exports = {
    ProbabilisticMatcher,
    MatchCandidate,
    DEFAULT_WEIGHTS,
    DEFAULT_THRESHOLDS,
    ALGORITHM_CONFIG
};
