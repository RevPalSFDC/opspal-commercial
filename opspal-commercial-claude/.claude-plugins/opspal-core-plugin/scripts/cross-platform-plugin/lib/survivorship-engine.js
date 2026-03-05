#!/usr/bin/env node
/**
 * Survivorship Engine - Golden Record Selection
 *
 * Part of the RevOps Data Quality System.
 * Determines the winning "golden record" from duplicate clusters.
 *
 * Features:
 * - Multi-strategy survivorship rules (source priority, most recent, most complete)
 * - Field-level granular selection
 * - Source trust scoring with confidence propagation
 * - Protected field enforcement
 * - Field lineage tracking for audit
 * - Merge preview generation
 *
 * Usage:
 *   const { SurvivorshipEngine } = require('./survivorship-engine');
 *   const engine = new SurvivorshipEngine();
 *   const goldenRecord = engine.buildGoldenRecord(cluster);
 */

const fs = require('fs');
const path = require('path');

// Default survivorship rules (used if config file not found)
const DEFAULT_SURVIVORSHIP_RULES = {
    strategies: {
        source_priority: {
            description: 'Use value from highest-priority source',
            applicable_to: ['account_name', 'email', 'phone', 'salesforce_id', 'hubspot_id']
        },
        most_recent: {
            description: 'Use most recently updated value',
            applicable_to: ['title', 'employee_count', 'annual_revenue']
        },
        most_complete: {
            description: 'Use value with most information (non-blank fields)',
            applicable_to: ['address', 'description', 'website']
        },
        quality_score: {
            description: 'Use value with highest data quality score',
            applicable_to: ['email', 'phone'],
            factors: ['deliverability', 'format_valid', 'domain_type']
        },
        verified_preference: {
            description: 'Prefer verified values over unverified',
            applicable_to: ['email', 'phone', 'address']
        }
    },
    conflict_resolution: {
        same_source_type: 'most_recent',
        different_source_type: 'source_priority',
        both_verified: 'most_recent',
        one_verified: 'verified_preference'
    },
    protected_fields: {
        never_overwrite: [
            'do_not_call',
            'do_not_email',
            'gdpr_consent',
            'ccpa_opt_out',
            'lead_source',
            'opportunity_stage',
            'close_date',
            'created_date',
            'created_by_id'
        ],
        require_approval: [
            'owner_id',
            'account_id',
            'annual_revenue',
            'contract_value'
        ]
    }
};

// Default source hierarchy (trust scores)
const DEFAULT_SOURCE_HIERARCHY = {
    customer_provided: { trust_score: 98, confidence_base: 5 },
    crm_user_entered: { trust_score: 95, confidence_base: 5 },
    government_database: { trust_score: 92, confidence_base: 5 },
    product_telemetry: { trust_score: 90, confidence_base: 4 },
    email_engagement: { trust_score: 85, confidence_base: 4 },
    company_website: { trust_score: 80, confidence_base: 4 },
    linkedin: { trust_score: 78, confidence_base: 4 },
    enrichment_tier1: { trust_score: 70, confidence_base: 3 },
    news_article: { trust_score: 60, confidence_base: 3 },
    enrichment_tier2: { trust_score: 55, confidence_base: 2 },
    business_directory: { trust_score: 50, confidence_base: 3 },
    web_search: { trust_score: 40, confidence_base: 2 },
    csv_import: { trust_score: 30, confidence_base: 2 },
    ai_inference: { trust_score: 25, confidence_base: 1 },
    unknown: { trust_score: 20, confidence_base: 1 }
};

/**
 * Field Value class representing a candidate value for a field
 */
class FieldValue {
    constructor(value, source, metadata = {}) {
        this.value = value;
        this.source = source;
        this.metadata = {
            recordId: metadata.recordId || null,
            lastModified: metadata.lastModified || null,
            isVerified: metadata.isVerified || false,
            qualityScore: metadata.qualityScore || null,
            ...metadata
        };
    }

    isEmpty() {
        return this.value === null ||
               this.value === undefined ||
               this.value === '' ||
               (Array.isArray(this.value) && this.value.length === 0);
    }

    toJSON() {
        return {
            value: this.value,
            source: this.source,
            metadata: this.metadata
        };
    }
}

/**
 * Field Lineage class tracking the history of value selection
 */
class FieldLineage {
    constructor(field) {
        this.field = field;
        this.selectedValue = null;
        this.selectedSource = null;
        this.strategy = null;
        this.confidence = 0;
        this.candidates = [];
        this.rationale = '';
    }

    addCandidate(fieldValue) {
        this.candidates.push(fieldValue.toJSON());
    }

    setSelection(value, source, strategy, confidence, rationale) {
        this.selectedValue = value;
        this.selectedSource = source;
        this.strategy = strategy;
        this.confidence = confidence;
        this.rationale = rationale;
    }

    toJSON() {
        return {
            field: this.field,
            selectedValue: this.selectedValue,
            selectedSource: this.selectedSource,
            strategy: this.strategy,
            confidence: this.confidence,
            rationale: this.rationale,
            candidateCount: this.candidates.length,
            candidates: this.candidates
        };
    }
}

/**
 * Survivorship Engine Class
 * Determines golden record from duplicate clusters
 */
class SurvivorshipEngine {
    constructor(options = {}) {
        this.rules = this.loadRules(options.rulesPath);
        this.sourceHierarchy = this.loadSourceHierarchy(options.sourceHierarchyPath);
        this.entityType = options.entityType || 'account';
        this.options = {
            preferMasterRecord: options.preferMasterRecord !== false,
            trackLineage: options.trackLineage !== false,
            preserveHistory: options.preserveHistory || false,
            ...options
        };
    }

    /**
     * Load survivorship rules from file or use defaults
     */
    loadRules(rulesPath) {
        if (rulesPath && fs.existsSync(rulesPath)) {
            return JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
        }

        // Try default location
        const defaultPath = path.join(__dirname, '../config/source-hierarchy.json');
        if (fs.existsSync(defaultPath)) {
            const config = JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
            return config.survivorship_rules || DEFAULT_SURVIVORSHIP_RULES;
        }

        return DEFAULT_SURVIVORSHIP_RULES;
    }

    /**
     * Load source hierarchy from file or use defaults
     */
    loadSourceHierarchy(hierarchyPath) {
        if (hierarchyPath && fs.existsSync(hierarchyPath)) {
            const config = JSON.parse(fs.readFileSync(hierarchyPath, 'utf8'));
            return config.source_definitions || DEFAULT_SOURCE_HIERARCHY;
        }

        // Try default location
        const defaultPath = path.join(__dirname, '../config/source-hierarchy.json');
        if (fs.existsSync(defaultPath)) {
            const config = JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
            return config.source_definitions || DEFAULT_SOURCE_HIERARCHY;
        }

        return DEFAULT_SOURCE_HIERARCHY;
    }

    /**
     * Build golden record from a cluster of duplicate records
     * @param {Array} records - Array of records in the cluster
     * @param {Object} options - Build options
     * @returns {Object} Golden record with lineage
     */
    buildGoldenRecord(records, options = {}) {
        if (!records || records.length === 0) {
            throw new Error('No records provided to build golden record');
        }

        if (records.length === 1) {
            return {
                goldenRecord: records[0],
                fieldLineage: {},
                masterRecordId: records[0].id || records[0].Id || 'single',
                mergeStats: { fieldsProcessed: 0, survivorSelections: 0 }
            };
        }

        const {
            masterRecordId = null,
            fieldMap = null
        } = options;

        // Determine master record (starting point)
        const masterRecord = this.selectMasterRecord(records, masterRecordId);
        const masterIdx = records.indexOf(masterRecord);

        // Get all fields to process
        const allFields = this.getAllFields(records);

        // Build golden record field by field
        const goldenRecord = { ...masterRecord };
        const fieldLineage = {};
        let survivorSelections = 0;

        for (const field of allFields) {
            // Skip protected fields
            if (this.isProtectedField(field)) {
                fieldLineage[field] = new FieldLineage(field);
                fieldLineage[field].setSelection(
                    masterRecord[field],
                    'master_record',
                    'protected',
                    1.0,
                    `Protected field - preserved from master record`
                );
                continue;
            }

            // Collect all values for this field
            const candidates = this.collectFieldValues(records, field);

            // Select survivor value
            const lineage = this.selectSurvivor(field, candidates);
            fieldLineage[field] = lineage;

            // Update golden record
            if (lineage.selectedValue !== undefined) {
                goldenRecord[field] = lineage.selectedValue;
                if (lineage.selectedSource !== 'master_record') {
                    survivorSelections++;
                }
            }
        }

        return {
            goldenRecord,
            fieldLineage: Object.fromEntries(
                Object.entries(fieldLineage).map(([k, v]) => [k, v.toJSON()])
            ),
            masterRecordId: masterRecord.id || masterRecord.Id || masterIdx,
            mergeStats: {
                fieldsProcessed: allFields.size,
                survivorSelections,
                recordsMerged: records.length
            }
        };
    }

    /**
     * Select master record (base for golden record)
     */
    selectMasterRecord(records, preferredId = null) {
        // If preferred ID specified, use it
        if (preferredId) {
            const preferred = records.find(r => r.id === preferredId || r.Id === preferredId);
            if (preferred) return preferred;
        }

        // Score each record
        const scores = records.map((record, idx) => ({
            record,
            index: idx,
            score: this.scoreRecord(record)
        }));

        // Sort by score descending
        scores.sort((a, b) => b.score - a.score);

        return scores[0].record;
    }

    /**
     * Score a record for master record selection
     * Higher score = better candidate for master
     */
    scoreRecord(record) {
        let score = 0;

        // Has Salesforce ID (100 points)
        if (record.salesforce_id || record.salesforceaccountid || record.Id) {
            score += 100;
        }

        // Has HubSpot ID (50 points)
        if (record.hubspot_id || record.hs_object_id) {
            score += 50;
        }

        // Has owner (10 points)
        if (record.owner_id || record.OwnerId || record.hubspot_owner_id) {
            score += 10;
        }

        // Count non-empty fields (1 point each, max 50)
        const nonEmptyFields = Object.values(record).filter(v =>
            v !== null && v !== undefined && v !== ''
        ).length;
        score += Math.min(50, nonEmptyFields);

        // Recency bonus (up to 25 points)
        const lastModified = record.last_modified_date || record.LastModifiedDate ||
                            record.lastmodifieddate || record.updatedate;
        if (lastModified) {
            const daysSinceUpdate = (Date.now() - new Date(lastModified)) / (1000 * 60 * 60 * 24);
            score += Math.max(0, 25 - daysSinceUpdate / 10);
        }

        // Association count bonus
        if (record.num_associated_contacts) {
            score += Math.min(25, parseInt(record.num_associated_contacts) * 2);
        }
        if (record.num_associated_deals) {
            score += Math.min(15, parseInt(record.num_associated_deals) * 3);
        }

        return score;
    }

    /**
     * Get all unique fields from records
     */
    getAllFields(records) {
        const fields = new Set();
        for (const record of records) {
            Object.keys(record).forEach(key => fields.add(key));
        }
        return fields;
    }

    /**
     * Check if field is protected
     */
    isProtectedField(field) {
        const protected_fields = this.rules.protected_fields?.never_overwrite || [];
        return protected_fields.includes(field.toLowerCase());
    }

    /**
     * Check if field requires approval to change
     */
    requiresApproval(field) {
        const approval_fields = this.rules.protected_fields?.require_approval || [];
        return approval_fields.includes(field.toLowerCase());
    }

    /**
     * Collect all values for a field from records
     */
    collectFieldValues(records, field) {
        const candidates = [];

        for (const record of records) {
            const value = record[field];
            if (value !== undefined) {
                const source = this.detectSource(record, field);
                const metadata = {
                    recordId: record.id || record.Id,
                    lastModified: record.last_modified_date || record.LastModifiedDate ||
                                 record.lastmodifieddate || record.updatedate,
                    isVerified: this.isValueVerified(record, field),
                    qualityScore: this.calculateQualityScore(value, field)
                };

                candidates.push(new FieldValue(value, source, metadata));
            }
        }

        return candidates;
    }

    /**
     * Detect source of a field value
     */
    detectSource(record, field) {
        // Check for explicit source tracking
        const sourceField = `${field}_source`;
        if (record[sourceField]) {
            return record[sourceField];
        }

        // Check record-level source
        if (record.data_source) return record.data_source;
        if (record.source) return record.source;

        // Infer from record characteristics
        if (record.salesforce_id || record.Id) return 'crm_user_entered';
        if (record.hubspot_id || record.hs_object_id) return 'crm_user_entered';
        if (record.import_source) return 'csv_import';

        return 'unknown';
    }

    /**
     * Check if a value has been verified
     */
    isValueVerified(record, field) {
        // Check for verification flags
        const verifiedField = `${field}_verified`;
        if (record[verifiedField] === true) return true;

        // Email verification
        if (field === 'email' || field === 'email_address') {
            if (record.email_verified || record.hs_email_verified) return true;
        }

        // Phone verification
        if (field === 'phone' || field === 'phone_number') {
            if (record.phone_verified) return true;
        }

        return false;
    }

    /**
     * Calculate quality score for a value
     */
    calculateQualityScore(value, field) {
        if (value === null || value === undefined || value === '') {
            return 0;
        }

        let score = 50; // Base score for having a value

        // Field-specific quality checks
        switch (field.toLowerCase()) {
            case 'email':
            case 'email_address':
                // Valid email format
                if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) score += 25;
                // Business domain (not free email)
                if (!/\b(gmail|yahoo|hotmail|outlook|aol)\b/i.test(value)) score += 15;
                // Has domain part
                if (value.includes('@') && value.split('@')[1].includes('.')) score += 10;
                break;

            case 'phone':
            case 'phone_number':
                // Has enough digits
                const digits = value.replace(/\D/g, '');
                if (digits.length >= 10) score += 25;
                if (digits.length === 11 || digits.length === 12) score += 15; // International
                // Not all same digit
                if (!/^(.)\1+$/.test(digits)) score += 10;
                break;

            case 'website':
            case 'domain':
                // Has TLD
                if (/\.(com|org|net|io|co|gov|edu)$/i.test(value)) score += 25;
                // Is a domain (not full URL)
                if (!/^https?:\/\//i.test(value) && value.includes('.')) score += 15;
                break;

            case 'address':
            case 'billing_address':
            case 'shipping_address':
                // Has multiple components
                const addressParts = value.split(/[,\n]/).filter(p => p.trim());
                score += Math.min(30, addressParts.length * 10);
                // Has numbers (likely street number)
                if (/\d/.test(value)) score += 10;
                break;

            default:
                // Length-based quality for text fields
                if (typeof value === 'string') {
                    score += Math.min(25, value.length);
                }
        }

        return Math.min(100, score);
    }

    /**
     * Select survivor value from candidates
     */
    selectSurvivor(field, candidates) {
        const lineage = new FieldLineage(field);

        // Add all candidates to lineage
        candidates.forEach(c => lineage.addCandidate(c));

        // Filter out empty values
        const nonEmptyCandidates = candidates.filter(c => !c.isEmpty());

        if (nonEmptyCandidates.length === 0) {
            lineage.setSelection(null, 'none', 'no_value', 0, 'No non-empty values available');
            return lineage;
        }

        if (nonEmptyCandidates.length === 1) {
            const winner = nonEmptyCandidates[0];
            lineage.setSelection(
                winner.value,
                winner.source,
                'single_value',
                0.9,
                'Only one non-empty value available'
            );
            return lineage;
        }

        // Determine strategy for this field
        const strategy = this.getStrategyForField(field);

        // Apply strategy
        let winner;
        let confidence;
        let rationale;

        switch (strategy) {
            case 'source_priority':
                ({ winner, confidence, rationale } = this.applySourcePriority(nonEmptyCandidates, field));
                break;

            case 'most_recent':
                ({ winner, confidence, rationale } = this.applyMostRecent(nonEmptyCandidates, field));
                break;

            case 'most_complete':
                ({ winner, confidence, rationale } = this.applyMostComplete(nonEmptyCandidates, field));
                break;

            case 'quality_score':
                ({ winner, confidence, rationale } = this.applyQualityScore(nonEmptyCandidates, field));
                break;

            case 'verified_preference':
                ({ winner, confidence, rationale } = this.applyVerifiedPreference(nonEmptyCandidates, field));
                break;

            default:
                // Default to source priority
                ({ winner, confidence, rationale } = this.applySourcePriority(nonEmptyCandidates, field));
        }

        lineage.setSelection(winner.value, winner.source, strategy, confidence, rationale);
        return lineage;
    }

    /**
     * Get survivorship strategy for a field
     */
    getStrategyForField(field) {
        const normalizedField = field.toLowerCase();

        for (const [strategy, config] of Object.entries(this.rules.strategies || {})) {
            if (config.applicable_to?.includes(normalizedField)) {
                return strategy;
            }
        }

        // Default strategy
        return 'source_priority';
    }

    /**
     * Apply source priority strategy
     */
    applySourcePriority(candidates, field) {
        // Score each candidate by source trust
        const scored = candidates.map(c => ({
            candidate: c,
            trustScore: this.getSourceTrustScore(c.source)
        }));

        scored.sort((a, b) => b.trustScore - a.trustScore);
        const winner = scored[0].candidate;
        const confidence = scored[0].trustScore / 100;

        return {
            winner,
            confidence,
            rationale: `Selected from ${winner.source} (trust score: ${scored[0].trustScore})`
        };
    }

    /**
     * Apply most recent strategy
     */
    applyMostRecent(candidates, field) {
        // Sort by last modified date
        const dated = candidates.filter(c => c.metadata.lastModified);

        if (dated.length === 0) {
            // Fall back to source priority
            return this.applySourcePriority(candidates, field);
        }

        dated.sort((a, b) => {
            const dateA = new Date(a.metadata.lastModified);
            const dateB = new Date(b.metadata.lastModified);
            return dateB - dateA;
        });

        const winner = dated[0];
        const confidence = 0.8;

        return {
            winner,
            confidence,
            rationale: `Most recently updated (${winner.metadata.lastModified})`
        };
    }

    /**
     * Apply most complete strategy
     */
    applyMostComplete(candidates, field) {
        // Score by completeness
        const scored = candidates.map(c => ({
            candidate: c,
            completeness: this.calculateCompleteness(c.value)
        }));

        scored.sort((a, b) => b.completeness - a.completeness);
        const winner = scored[0].candidate;
        const confidence = Math.min(0.9, scored[0].completeness / 100);

        return {
            winner,
            confidence,
            rationale: `Most complete value (completeness: ${scored[0].completeness}%)`
        };
    }

    /**
     * Apply quality score strategy
     */
    applyQualityScore(candidates, field) {
        const scored = candidates.map(c => ({
            candidate: c,
            quality: c.metadata.qualityScore || this.calculateQualityScore(c.value, field)
        }));

        scored.sort((a, b) => b.quality - a.quality);
        const winner = scored[0].candidate;
        const confidence = scored[0].quality / 100;

        return {
            winner,
            confidence,
            rationale: `Highest quality score (${scored[0].quality})`
        };
    }

    /**
     * Apply verified preference strategy
     */
    applyVerifiedPreference(candidates, field) {
        // Prefer verified values
        const verified = candidates.filter(c => c.metadata.isVerified);

        if (verified.length > 0) {
            // Among verified, use source priority
            const result = this.applySourcePriority(verified, field);
            result.rationale = `Verified value: ${result.rationale}`;
            result.confidence *= 1.1; // Boost confidence for verified
            return result;
        }

        // Fall back to quality score
        return this.applyQualityScore(candidates, field);
    }

    /**
     * Get trust score for a source
     */
    getSourceTrustScore(source) {
        const sourceConfig = this.sourceHierarchy[source] || this.sourceHierarchy.unknown;
        return sourceConfig.trust_score || 20;
    }

    /**
     * Calculate completeness of a value
     */
    calculateCompleteness(value) {
        if (value === null || value === undefined) return 0;
        if (typeof value === 'string') {
            if (value.trim() === '') return 0;
            // Longer values are more complete (up to a point)
            return Math.min(100, 50 + value.length);
        }
        if (typeof value === 'object') {
            const fields = Object.values(value).filter(v => v !== null && v !== '');
            return (fields.length / Object.keys(value).length) * 100;
        }
        return 100; // Non-null non-string values are complete
    }

    /**
     * Preview merge without actually building
     */
    previewMerge(records) {
        const result = this.buildGoldenRecord(records);

        // Add preview-specific information
        return {
            ...result,
            preview: true,
            changes: Object.entries(result.fieldLineage)
                .filter(([field, lineage]) => lineage.strategy !== 'protected')
                .map(([field, lineage]) => ({
                    field,
                    from: lineage.candidates.map(c => ({ value: c.value, source: c.source })),
                    to: { value: lineage.selectedValue, source: lineage.selectedSource },
                    strategy: lineage.strategy,
                    confidence: lineage.confidence
                }))
        };
    }
}

// CLI Usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Survivorship Engine - Golden Record Selection

Usage:
  node survivorship-engine.js <cluster-file> [options]

Options:
  --output <file>         Output file path (default: stdout)
  --master-id <id>        Preferred master record ID
  --preview               Preview mode (show changes without applying)
  --entity-type <type>    Entity type: account, contact (default: account)
  --rules <file>          Path to survivorship rules JSON

Examples:
  node survivorship-engine.js duplicates.json --output golden.json
  node survivorship-engine.js cluster.json --preview
  node survivorship-engine.js cluster.json --master-id 001ABC
        `);
        process.exit(0);
    }

    const clusterFile = args[0];

    if (!fs.existsSync(clusterFile)) {
        console.error(`❌ Cluster file not found: ${clusterFile}`);
        process.exit(1);
    }

    // Parse options
    const options = {
        output: null,
        masterId: null,
        preview: false,
        entityType: 'account',
        rules: null
    };

    for (let i = 1; i < args.length; i++) {
        switch (args[i]) {
            case '--output':
                options.output = args[++i];
                break;
            case '--master-id':
                options.masterId = args[++i];
                break;
            case '--preview':
                options.preview = true;
                break;
            case '--entity-type':
                options.entityType = args[++i];
                break;
            case '--rules':
                options.rules = args[++i];
                break;
        }
    }

    try {
        console.log('📋 Loading cluster...');
        const clusterData = JSON.parse(fs.readFileSync(clusterFile, 'utf8'));

        // Extract records (handle different formats)
        let records;
        if (Array.isArray(clusterData)) {
            records = clusterData;
        } else if (clusterData.records) {
            records = clusterData.records.map(r => r.record || r);
        } else if (clusterData.clusters) {
            // Process first cluster
            records = clusterData.clusters[0].records.map(r => r.record || r);
        } else {
            records = [clusterData];
        }

        console.log(`   Loaded ${records.length} records\n`);

        const engine = new SurvivorshipEngine({
            entityType: options.entityType,
            rulesPath: options.rules
        });

        let result;
        if (options.preview) {
            console.log('👁️  Preview mode - showing proposed changes...');
            result = engine.previewMerge(records);
        } else {
            console.log('🔧 Building golden record...');
            result = engine.buildGoldenRecord(records, {
                masterRecordId: options.masterId
            });
        }

        // Output
        const output = JSON.stringify(result, null, 2);

        if (options.output) {
            fs.writeFileSync(options.output, output);
            console.log(`\n✅ Results written to: ${options.output}`);
        } else {
            console.log('\n📊 Result:');
            console.log(output);
        }

        // Print summary
        console.log('\n📈 Summary:');
        console.log(`   Master record: ${result.masterRecordId}`);
        console.log(`   Fields processed: ${result.mergeStats.fieldsProcessed}`);
        console.log(`   Survivor selections: ${result.mergeStats.survivorSelections}`);
        if (result.changes) {
            console.log(`   Total changes: ${result.changes.length}`);
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

module.exports = { SurvivorshipEngine, FieldValue, FieldLineage };
