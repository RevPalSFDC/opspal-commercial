#!/usr/bin/env node

const BaseAgent = require('../BaseAgent');
const { UnionFind } = require('../../lib/contactHygiene');
const crypto = require('crypto');

/**
 * DeduplicationEngine - Unified deduplication agent
 * Consolidates logic from 8+ duplicate detection scripts into a single, intelligent agent
 */
class DeduplicationEngine extends BaseAgent {
    constructor(config = {}) {
        super({
            name: 'deduplication-engine',
            type: 'data-processing',
            ...config
        });

        this.config = {
            ...this.config,
            strategies: {
                email: { enabled: true, weight: 1.0 },
                phone: { enabled: true, weight: 0.9 },
                nameCompany: { enabled: true, weight: 0.7 },
                fuzzyName: { enabled: true, weight: 0.5, threshold: 0.85 },
                address: { enabled: true, weight: 0.6 }
            },
            batchSize: 1000,
            parallelWorkers: 4,
            cacheSize: 10000
        };

        // Duplicate detection cache
        this.cache = new Map();
        this.unionFind = null;

        // Statistics
        this.stats = {
            totalProcessed: 0,
            duplicatesFound: 0,
            mergeGroups: 0,
            processingTime: 0
        };
    }

    /**
     * Main execution method
     */
    async execute(task) {
        const { records, strategy = 'all', options = {} } = task;

        this.log('info', `Starting deduplication for ${records.length} records`);
        const startTime = Date.now();

        // Initialize Union-Find for this batch
        this.unionFind = new UnionFind(records.length);

        // Build normalized lookup indices
        const indices = this.buildIndices(records);

        // Apply selected deduplication strategies
        const duplicateGroups = await this.detectDuplicates(records, indices, strategy);

        // Determine master records
        const results = this.selectMasterRecords(records, duplicateGroups);

        // Update statistics
        this.stats.totalProcessed += records.length;
        this.stats.duplicatesFound += results.duplicates.length;
        this.stats.mergeGroups += duplicateGroups.length;
        this.stats.processingTime = Date.now() - startTime;

        this.log('info', `Deduplication complete: ${results.duplicates.length} duplicates found in ${duplicateGroups.length} groups`);

        return {
            ...results,
            stats: { ...this.stats },
            strategy
        };
    }

    /**
     * Build normalized indices for fast lookup
     */
    buildIndices(records) {
        const indices = {
            email: new Map(),
            phone: new Map(),
            nameCompany: new Map(),
            fuzzyName: new Map(),
            address: new Map()
        };

        records.forEach((record, index) => {
            // Email index
            if (record.Email) {
                const normalizedEmail = this.normalizeEmail(record.Email);
                if (!indices.email.has(normalizedEmail)) {
                    indices.email.set(normalizedEmail, []);
                }
                indices.email.get(normalizedEmail).push(index);
            }

            // Phone index
            if (record.Phone || record.MobilePhone) {
                const phone = record.Phone || record.MobilePhone;
                const normalizedPhone = this.normalizePhone(phone);
                if (normalizedPhone && !indices.phone.has(normalizedPhone)) {
                    indices.phone.set(normalizedPhone, []);
                }
                if (normalizedPhone) {
                    indices.phone.get(normalizedPhone).push(index);
                }
            }

            // Name + Company index
            if (record.FirstName && record.LastName && record.Company) {
                const key = `${this.normalize(record.FirstName)}_${this.normalize(record.LastName)}_${this.normalize(record.Company)}`;
                if (!indices.nameCompany.has(key)) {
                    indices.nameCompany.set(key, []);
                }
                indices.nameCompany.get(key).push(index);
            }

            // Fuzzy name index (soundex/metaphone)
            if (record.FirstName && record.LastName) {
                const fuzzyKey = this.generateFuzzyKey(record.FirstName, record.LastName);
                if (!indices.fuzzyName.has(fuzzyKey)) {
                    indices.fuzzyName.set(fuzzyKey, []);
                }
                indices.fuzzyName.get(fuzzyKey).push(index);
            }

            // Address index
            if (record.MailingStreet && record.MailingPostalCode) {
                const addressKey = `${this.normalize(record.MailingStreet)}_${this.normalize(record.MailingPostalCode)}`;
                if (!indices.address.has(addressKey)) {
                    indices.address.set(addressKey, []);
                }
                indices.address.get(addressKey).push(index);
            }
        });

        return indices;
    }

    /**
     * Detect duplicates using selected strategies
     */
    async detectDuplicates(records, indices, strategy) {
        const strategies = strategy === 'all'
            ? Object.keys(this.config.strategies)
            : [strategy];

        // Apply each strategy
        for (const strat of strategies) {
            if (this.config.strategies[strat]?.enabled) {
                await this.applyStrategy(strat, indices, records);
            }
        }

        // Extract duplicate groups from Union-Find
        const groups = new Map();
        for (let i = 0; i < records.length; i++) {
            const root = this.unionFind.find(i);
            if (!groups.has(root)) {
                groups.set(root, []);
            }
            groups.get(root).push(i);
        }

        // Filter out single-member groups
        const duplicateGroups = Array.from(groups.values())
            .filter(group => group.length > 1)
            .map(group => ({
                indices: group,
                records: group.map(i => records[i]),
                matchType: this.determineMatchType(group, indices)
            }));

        return duplicateGroups;
    }

    /**
     * Apply a specific deduplication strategy
     */
    async applyStrategy(strategy, indices, records) {
        const index = indices[strategy];
        const weight = this.config.strategies[strategy].weight;

        // Find groups with multiple records
        for (const [key, recordIndices] of index) {
            if (recordIndices.length > 1) {
                // Connect all records in this group
                for (let i = 1; i < recordIndices.length; i++) {
                    // Additional validation for fuzzy matching
                    if (strategy === 'fuzzyName') {
                        const similarity = this.calculateNameSimilarity(
                            records[recordIndices[0]],
                            records[recordIndices[i]]
                        );
                        if (similarity >= this.config.strategies.fuzzyName.threshold) {
                            this.unionFind.union(recordIndices[0], recordIndices[i]);
                        }
                    } else {
                        this.unionFind.union(recordIndices[0], recordIndices[i]);
                    }
                }
            }
        }
    }

    /**
     * Select master records for each duplicate group
     */
    selectMasterRecords(records, duplicateGroups) {
        const masters = [];
        const duplicates = [];
        const mergeInstructions = [];

        for (const group of duplicateGroups) {
            // Score each record in the group
            const scoredRecords = group.records.map((record, idx) => ({
                record,
                index: group.indices[idx],
                score: this.scoreRecord(record)
            }));

            // Sort by score (highest first)
            scoredRecords.sort((a, b) => b.score - a.score);

            // First record is master
            const master = scoredRecords[0];
            masters.push({
                ...master.record,
                _dedup: {
                    isMaster: true,
                    duplicateCount: scoredRecords.length - 1,
                    score: master.score
                }
            });

            // Rest are duplicates
            for (let i = 1; i < scoredRecords.length; i++) {
                const dup = scoredRecords[i];
                duplicates.push({
                    ...dup.record,
                    _dedup: {
                        isMaster: false,
                        masterId: master.record.Id || master.index,
                        matchType: group.matchType,
                        score: dup.score
                    }
                });

                // Generate merge instruction
                mergeInstructions.push({
                    source: dup.record.Id || dup.index,
                    target: master.record.Id || master.index,
                    matchType: group.matchType,
                    confidence: this.calculateConfidence(master.record, dup.record)
                });
            }
        }

        return {
            masters,
            duplicates,
            mergeInstructions,
            totalGroups: duplicateGroups.length
        };
    }

    /**
     * Score a record for master selection
     */
    scoreRecord(record) {
        let score = 0;

        // Completeness score
        const fields = ['Email', 'Phone', 'FirstName', 'LastName', 'Company',
                       'Title', 'MailingStreet', 'MailingCity', 'MailingState'];

        fields.forEach(field => {
            if (record[field] && record[field].trim()) {
                score += 10;
            }
        });

        // Data quality indicators
        if (record.Email && !this.isGenericEmail(record.Email)) score += 20;
        if (record.Phone && this.isValidPhone(record.Phone)) score += 15;
        if (record.Title && record.Title.length > 3) score += 10;

        // Activity indicators
        if (record.LastActivityDate) {
            const daysSince = (Date.now() - new Date(record.LastActivityDate)) / (1000 * 60 * 60 * 24);
            if (daysSince < 30) score += 30;
            else if (daysSince < 90) score += 20;
            else if (daysSince < 365) score += 10;
        }

        // Source system priority
        if (record.SystemModstamp) {
            const daysSince = (Date.now() - new Date(record.SystemModstamp)) / (1000 * 60 * 60 * 24);
            if (daysSince < 7) score += 15;
        }

        return score;
    }

    /**
     * Determine match type for a group
     */
    determineMatchType(group, indices) {
        const types = [];

        // Check which indices contain this group
        for (const [type, index] of Object.entries(indices)) {
            for (const recordIndices of index.values()) {
                if (recordIndices.some(i => group.includes(i))) {
                    types.push(type);
                    break;
                }
            }
        }

        return types.join(',');
    }

    /**
     * Calculate confidence score for merge
     */
    calculateConfidence(master, duplicate) {
        let confidence = 0;
        let factors = 0;

        // Email match
        if (master.Email && duplicate.Email &&
            this.normalizeEmail(master.Email) === this.normalizeEmail(duplicate.Email)) {
            confidence += 30;
            factors++;
        }

        // Phone match
        if (master.Phone && duplicate.Phone &&
            this.normalizePhone(master.Phone) === this.normalizePhone(duplicate.Phone)) {
            confidence += 25;
            factors++;
        }

        // Name similarity
        if (master.FirstName && duplicate.FirstName && master.LastName && duplicate.LastName) {
            const nameSim = this.calculateNameSimilarity(master, duplicate);
            confidence += nameSim * 20;
            factors++;
        }

        // Company match
        if (master.Company && duplicate.Company &&
            this.normalize(master.Company) === this.normalize(duplicate.Company)) {
            confidence += 15;
            factors++;
        }

        // Address match
        if (master.MailingStreet && duplicate.MailingStreet &&
            this.normalize(master.MailingStreet) === this.normalize(duplicate.MailingStreet)) {
            confidence += 10;
            factors++;
        }

        return factors > 0 ? confidence / factors : 0;
    }

    /**
     * Normalization utilities
     */
    normalize(str) {
        if (!str) return '';
        return str.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    }

    normalizeEmail(email) {
        if (!email) return '';
        email = email.toLowerCase().trim();

        // Handle Gmail aliases
        if (email.includes('@gmail.com')) {
            let [localPart, domain] = email.split('@');
            localPart = localPart.replace(/\./g, '').split('+')[0];
            email = `${localPart}@${domain}`;
        }

        return email;
    }

    normalizePhone(phone) {
        if (!phone) return '';
        const cleaned = phone.replace(/\D/g, '');

        if (cleaned.length === 10) {
            return `1${cleaned}`;
        } else if (cleaned.length === 11 && cleaned[0] === '1') {
            return cleaned;
        }

        return cleaned;
    }

    /**
     * Generate fuzzy key for name matching
     */
    generateFuzzyKey(firstName, lastName) {
        const first = this.soundex(firstName);
        const last = this.soundex(lastName);
        return `${first}_${last}`;
    }

    /**
     * Soundex algorithm for fuzzy matching
     */
    soundex(name) {
        if (!name) return '';

        const a = name.toLowerCase().split('');
        const codes = {
            b: 1, f: 1, p: 1, v: 1,
            c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2,
            d: 3, t: 3,
            l: 4,
            m: 5, n: 5,
            r: 6
        };

        const firstLetter = a[0];
        const coded = a.map(letter => codes[letter] || '').join('');

        return (firstLetter + coded + '000').slice(0, 4);
    }

    /**
     * Calculate name similarity using Levenshtein distance
     */
    calculateNameSimilarity(record1, record2) {
        const name1 = `${record1.FirstName} ${record1.LastName}`.toLowerCase();
        const name2 = `${record2.FirstName} ${record2.LastName}`.toLowerCase();

        const distance = this.levenshteinDistance(name1, name2);
        const maxLength = Math.max(name1.length, name2.length);

        return 1 - (distance / maxLength);
    }

    /**
     * Levenshtein distance implementation
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    }

    /**
     * Check if email is generic
     */
    isGenericEmail(email) {
        const genericDomains = ['example.com', 'test.com', 'email.com', 'noemail.com'];
        const genericPatterns = ['noreply', 'donotreply', 'no-reply', 'admin@', 'info@'];

        const lower = email.toLowerCase();
        return genericDomains.some(d => lower.includes(d)) ||
               genericPatterns.some(p => lower.includes(p));
    }

    /**
     * Validate phone number format
     */
    isValidPhone(phone) {
        const cleaned = phone.replace(/\D/g, '');
        return cleaned.length >= 10 && cleaned.length <= 15;
    }

    /**
     * Get current statistics
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.cache.size,
            avgProcessingTime: this.stats.totalProcessed > 0
                ? this.stats.processingTime / this.stats.totalProcessed
                : 0
        };
    }

    /**
     * Clear cache and reset statistics
     */
    reset() {
        this.cache.clear();
        this.unionFind = null;
        this.stats = {
            totalProcessed: 0,
            duplicatesFound: 0,
            mergeGroups: 0,
            processingTime: 0
        };
    }
}

// Export for use as library
module.exports = DeduplicationEngine;

// CLI interface
if (require.main === module) {
    const fs = require('fs');
    const csv = require('csv-parse');
    const { program } = require('commander');

    program
        .name('deduplication-engine')
        .description('Unified deduplication engine for contact data')
        .option('-i, --input <file>', 'Input CSV file')
        .option('-o, --output <file>', 'Output directory', './dedup-output')
        .option('-s, --strategy <type>', 'Strategy: email, phone, nameCompany, fuzzy, address, all', 'all')
        .option('-b, --batch-size <n>', 'Batch size for processing', '1000')
        .parse(process.argv);

    const options = program.opts();

    async function main() {
        const engine = new DeduplicationEngine();

        // Read input CSV
        const records = [];
        const parser = fs.createReadStream(options.input)
            .pipe(csv.parse({ columns: true }));

        for await (const record of parser) {
            records.push(record);
        }

        console.log(`Processing ${records.length} records...`);

        // Run deduplication
        const result = await engine.run({
            records,
            strategy: options.strategy
        });

        // Create output directory
        fs.mkdirSync(options.output, { recursive: true });

        // Write results
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        // Masters file
        fs.writeFileSync(
            `${options.output}/masters-${timestamp}.json`,
            JSON.stringify(result.masters, null, 2)
        );

        // Duplicates file
        fs.writeFileSync(
            `${options.output}/duplicates-${timestamp}.json`,
            JSON.stringify(result.duplicates, null, 2)
        );

        // Merge instructions
        fs.writeFileSync(
            `${options.output}/merge-instructions-${timestamp}.json`,
            JSON.stringify(result.mergeInstructions, null, 2)
        );

        // Statistics
        console.log('\n📊 Deduplication Results:');
        console.log(`  Total Records: ${records.length}`);
        console.log(`  Duplicate Groups: ${result.totalGroups}`);
        console.log(`  Duplicates Found: ${result.duplicates.length}`);
        console.log(`  Master Records: ${result.masters.length}`);
        console.log(`  Processing Time: ${result.stats.processingTime}ms`);

        await engine.shutdown();
    }

    main().catch(console.error);
}