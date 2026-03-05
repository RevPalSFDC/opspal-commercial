#!/usr/bin/env node
/**
 * Deduplication Canonical Selector (Phase 2)
 *
 * Purpose: Select the "canonical" (master) company from each bundle using a weighted
 * scoring algorithm. The canonical company will be kept, others will be merged into it.
 *
 * Scoring Algorithm (configurable weights):
 * - 100 points: has salesforceaccountid
 * - 50 points: sync health (recency + source validation)
 * - 40 points: normalized contact count
 * - 25 points: normalized deal count
 * - 10 points: owner present
 * - 5 points: older createdate
 *
 * Total possible: 230 points (enhanced from 180)
 *
 * Usage:
 *   const CanonicalSelector = require('./dedup-canonical-selector');
 *   const selector = new CanonicalSelector(bundles, config);
 *   const canonicalMap = await selector.select();
 */

const fs = require('fs');
const path = require('path');

class CanonicalSelector {
    constructor(bundles, config = {}) {
        this.bundles = bundles;
        this.config = config;
        this.weights = config.canonicalWeights || {
            hasSalesforceAccountId: 100,
            syncHealth: 50,            // Sync health scoring
            customFieldCompleteness: 50, // NEW: Custom field completeness scoring
            numContacts: 40,
            numDeals: 25,
            ownerPresent: 10,
            createdateOldest: 5
        };

        // NEW: Critical custom fields configuration for completeness scoring
        // Fields that indicate a more "complete" or "authoritative" record
        this.criticalCustomFields = config.criticalCustomFields || {
            // Revenue/financial fields (high importance)
            'FY26_SGA__c': { weight: 15, conflictStrategy: 'highest-value' },
            'AnnualRevenue': { weight: 12, conflictStrategy: 'highest-value' },
            'ARR__c': { weight: 12, conflictStrategy: 'highest-value' },
            'ACV__c': { weight: 10, conflictStrategy: 'highest-value' },

            // Segmentation fields (medium importance)
            'Segment__c': { weight: 10, conflictStrategy: 'most-recent' },
            'Industry': { weight: 8, conflictStrategy: 'most-recent' },
            'Type': { weight: 6, conflictStrategy: 'favor-master' },

            // Owner (critical - determines account responsibility)
            'OwnerId': { weight: 12, conflictStrategy: 'from-decision' }
        };

        // Merge user-provided criticalCustomFields
        if (config.criticalCustomFields) {
            this.criticalCustomFields = { ...this.criticalCustomFields, ...config.criticalCustomFields };
        }

        this.outputDir = config.output?.outputDir || './dedup-reports';
        this.skipSave = config.skipSave || false;  // Allow tests to skip file saving
        this.canonicalMap = [];
    }

    /**
     * Select canonical companies for all bundles
     * @returns {Promise<Array>} Canonical map
     */
    async select() {
        console.log('\n🎯 Phase 2: Selecting Canonical Companies');
        console.log('═'.repeat(70));
        console.log('Scoring Weights:');
        Object.entries(this.weights).forEach(([key, value]) => {
            console.log(`  ${key}: ${value}`);
        });
        console.log('');

        // Process Bundle A (SF-anchored)
        console.log('📊 Processing Bundle A (SF-anchored)...');
        this.processBundle(this.bundles.bundleA, 'bundleA');

        // Process Bundle B (HS-only)
        console.log('\n📊 Processing Bundle B (HS-only)...');
        this.processBundle(this.bundles.bundleB, 'bundleB');

        // Save canonical map (skip during tests)
        if (!this.skipSave) {
            console.log('\n💾 Saving canonical map...');
            this.saveCanonicalMap();
        }

        console.log('\n✅ Canonical selection complete!');
        console.log('═'.repeat(70));
        this.printSummary();

        return this.canonicalMap;
    }

    /**
     * Process a bundle (A or B)
     */
    processBundle(bundles, bundleType) {
        if (!bundles || bundles.length === 0) {
            console.log(`  No bundles to process`);
            return;
        }

        bundles.forEach((bundle, index) => {
            // Score each company in the bundle
            const scoredCompanies = bundle.companies.map(company => ({
                ...company,
                score: this.calculateScore(company, bundle.companies)
            }));

            // Sort by score (highest first)
            scoredCompanies.sort((a, b) => b.score - a.score);

            // Select canonical (highest score)
            const canonical = scoredCompanies[0];
            const duplicates = scoredCompanies.slice(1);

            // Calculate detailed scoring breakdown for transparency
            const canonicalScoreBreakdown = this._calculateScoreBreakdown(canonical, bundle.companies);
            const duplicateScoreBreakdowns = duplicates.map(d => this._calculateScoreBreakdown(d, bundle.companies));

            this.canonicalMap.push({
                bundleType,
                bundleId: `${bundleType}-${index + 1}`,
                clusterKey: bundle.salesforceAccountId || bundle.normalizedDomain,
                canonical: {
                    companyId: canonical.id,
                    companyName: canonical.name,
                    domain: canonical.domain,
                    salesforceAccountId: canonical.salesforceaccountid,
                    score: canonical.score,
                    scoreBreakdown: canonicalScoreBreakdown,  // NEW: Score breakdown
                    num_contacts: canonical.num_contacts,
                    num_deals: canonical.num_deals,
                    // Include critical custom fields for transparency
                    criticalFields: this._extractCriticalFields(canonical)
                },
                duplicates: duplicates.map((d, i) => ({
                    companyId: d.id,
                    companyName: d.name,
                    domain: d.domain,
                    salesforceAccountId: d.salesforceaccountid,
                    score: d.score,
                    scoreBreakdown: duplicateScoreBreakdowns[i],  // NEW: Score breakdown
                    num_contacts: d.num_contacts,
                    num_deals: d.num_deals,
                    criticalFields: this._extractCriticalFields(d)
                })),
                totalCompanies: bundle.companyCount,
                duplicateCount: duplicates.length,
                // NEW: Flag if duplicates have better custom field values
                hasFieldConflicts: this._detectFieldConflicts(canonical, duplicates)
            });

            if ((index + 1) % 10 === 0) {
                console.log(`  Processed ${index + 1}/${bundles.length} bundles...`);
            }
        });

        console.log(`  ✅ Processed ${bundles.length} bundles`);
    }

    /**
     * Calculate score for a company
     * Total possible: 280 points (enhanced from 230 with custom field completeness)
     */
    calculateScore(company, allCompaniesInBundle) {
        let score = 0;

        // 1. Has Salesforce Account ID (100 points)
        if (company.salesforceaccountid) {
            score += this.weights.hasSalesforceAccountId;
        }

        // 2. Sync Health (0-50 points)
        score += this.calculateSyncHealth(company);

        // 3. Custom Field Completeness (0-50 points) - NEW
        score += this.calculateCustomFieldCompleteness(company, allCompaniesInBundle);

        // 4. Normalized Contact Count (0-40 points)
        const maxContacts = Math.max(...allCompaniesInBundle.map(c => c.num_contacts || 0));
        if (maxContacts > 0) {
            const normalizedContacts = (company.num_contacts || 0) / maxContacts;
            score += normalizedContacts * this.weights.numContacts;
        }

        // 5. Normalized Deal Count (0-25 points)
        const maxDeals = Math.max(...allCompaniesInBundle.map(c => c.num_deals || 0));
        if (maxDeals > 0) {
            const normalizedDeals = (company.num_deals || 0) / maxDeals;
            score += normalizedDeals * this.weights.numDeals;
        }

        // 6. Owner Present (10 points)
        if (company.owner_id) {
            score += this.weights.ownerPresent;
        }

        // 7. Older Created Date (0-5 points)
        const createDates = allCompaniesInBundle
            .map(c => c.createdate ? new Date(c.createdate).getTime() : Date.now())
            .filter(d => !isNaN(d));

        if (createDates.length > 0 && company.createdate) {
            const companyDate = new Date(company.createdate).getTime();
            const oldestDate = Math.min(...createDates);
            const newestDate = Math.max(...createDates);
            const range = newestDate - oldestDate;

            if (range > 0) {
                // Older = higher score
                const normalizedAge = 1 - ((companyDate - oldestDate) / range);
                score += normalizedAge * this.weights.createdateOldest;
            } else {
                // All same date, give full points
                score += this.weights.createdateOldest;
            }
        }

        return Math.round(score * 100) / 100; // Round to 2 decimal places
    }

    /**
     * Calculate custom field completeness score (0-50 points)
     *
     * Scores based on the presence and quality of critical business fields.
     * This addresses the NYPD duplicate issue where canonical selection didn't
     * consider custom fields like FY26_SGA__c, Segment__c.
     *
     * @param {object} company - Company object
     * @param {object[]} allCompaniesInBundle - All companies for comparison
     * @returns {number} Custom field completeness score (0-50)
     */
    calculateCustomFieldCompleteness(company, allCompaniesInBundle) {
        let completenessScore = 0;
        let maxPossibleWeight = 0;

        // Calculate max possible weight from criticalCustomFields
        for (const [fieldName, fieldConfig] of Object.entries(this.criticalCustomFields)) {
            maxPossibleWeight += fieldConfig.weight || 10;
        }

        // Calculate actual score based on field presence and quality
        for (const [fieldName, fieldConfig] of Object.entries(this.criticalCustomFields)) {
            const weight = fieldConfig.weight || 10;
            const value = this._getFieldValue(company, fieldName);

            if (value !== null && value !== undefined && value !== '') {
                // Field has a value - award points

                // For numeric fields, compare to other records in bundle
                if (fieldConfig.conflictStrategy === 'highest-value') {
                    const allValues = allCompaniesInBundle
                        .map(c => parseFloat(this._getFieldValue(c, fieldName)) || 0)
                        .filter(v => !isNaN(v) && v > 0);

                    if (allValues.length > 0) {
                        const maxValue = Math.max(...allValues);
                        const companyValue = parseFloat(value) || 0;

                        if (maxValue > 0 && companyValue > 0) {
                            // Score proportional to value (higher value = higher score)
                            completenessScore += (companyValue / maxValue) * weight;
                        } else {
                            // Has value but can't compare - give partial credit
                            completenessScore += weight * 0.5;
                        }
                    } else {
                        // No other values to compare - give full credit for having value
                        completenessScore += weight;
                    }
                } else {
                    // Non-numeric fields - give full credit for having value
                    completenessScore += weight;
                }
            }
            // No value = 0 points for this field
        }

        // Normalize to 0-50 scale based on configured weight
        const normalizedScore = maxPossibleWeight > 0
            ? (completenessScore / maxPossibleWeight) * (this.weights.customFieldCompleteness || 50)
            : 0;

        return Math.round(normalizedScore * 100) / 100;
    }

    /**
     * Helper to get field value from company object (case-insensitive)
     */
    _getFieldValue(company, fieldName) {
        if (!company) return null;

        // Direct match
        if (company[fieldName] !== undefined) {
            return company[fieldName];
        }

        // Case-insensitive search
        const lowerFieldName = fieldName.toLowerCase();
        for (const key of Object.keys(company)) {
            if (key.toLowerCase() === lowerFieldName) {
                return company[key];
            }
        }

        return null;
    }

    /**
     * Calculate sync health score (0-50 points)
     * Based on production patterns from delta-corp cleanup (Oct 2025)
     *
     * Scoring:
     * - 30 pts: Recent sync timestamp (today=30, this week=20, this month=10, else=0)
     * - 20 pts: Object source includes "SALESFORCE"
     *
     * @param {object} company - Company object
     * @returns {number} Sync health score (0-50)
     */
    calculateSyncHealth(company) {
        let syncScore = 0;

        // 1. Sync Recency (0-30 points)
        if (company.hs_latest_sync_timestamp) {
            const syncDate = new Date(company.hs_latest_sync_timestamp);
            const daysSinceSync = (Date.now() - syncDate.getTime()) / (1000 * 60 * 60 * 24);

            if (daysSinceSync < 1) {
                syncScore += 30; // Synced today
            } else if (daysSinceSync < 7) {
                syncScore += 20; // This week
            } else if (daysSinceSync < 30) {
                syncScore += 10; // This month
            }
            // Else: stale sync = 0 points
        }

        // 2. Object Source Validation (0-20 points)
        if (company.hs_object_source &&
            (company.hs_object_source.includes('SALESFORCE') ||
             company.hs_object_source.includes('INTEGRATION'))) {
            syncScore += 20;
        }

        return syncScore * (this.weights.syncHealth / 50); // Normalize to configured weight
    }

    /**
     * Save canonical map to files
     */
    saveCanonicalMap() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
        const baseFilename = `canonical-map-${timestamp}`;

        // Save complete JSON
        const jsonPath = path.join(this.outputDir, `${baseFilename}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            weights: this.weights,
            totalBundles: this.canonicalMap.length,
            canonicalMap: this.canonicalMap
        }, null, 2));
        console.log(`  ✅ Canonical Map JSON: ${jsonPath}`);

        // Save CSV (proposed actions)
        const csvPath = path.join(this.outputDir, `${baseFilename}-actions.csv`);
        this.saveActionsCSV(csvPath);
        console.log(`  ✅ Actions CSV: ${csvPath}`);

        // Save summary report
        const summaryPath = path.join(this.outputDir, `${baseFilename}-summary.txt`);
        this.saveSummaryReport(summaryPath);
        console.log(`  ✅ Summary Report: ${summaryPath}`);
    }

    /**
     * Save actions CSV
     */
    saveActionsCSV(filePath) {
        const headers = [
            'Action', 'Bundle_ID', 'Cluster_Key',
            'Company_ID', 'Company_Name', 'Domain', 'SF_Account_ID',
            'Score', 'Num_Contacts', 'Num_Deals', 'Rationale'
        ];

        const rows = [];

        this.canonicalMap.forEach(bundle => {
            // Canonical (KEEP)
            rows.push([
                'KEEP',
                bundle.bundleId,
                this.escapeCsv(bundle.clusterKey),
                bundle.canonical.companyId,
                this.escapeCsv(bundle.canonical.companyName),
                this.escapeCsv(bundle.canonical.domain),
                bundle.canonical.salesforceAccountId || '',
                bundle.canonical.score,
                bundle.canonical.num_contacts,
                bundle.canonical.num_deals,
                'Highest score - selected as canonical'
            ].join(','));

            // Duplicates (MERGE/DELETE)
            bundle.duplicates.forEach(dup => {
                rows.push([
                    'MERGE_INTO_CANONICAL',
                    bundle.bundleId,
                    this.escapeCsv(bundle.clusterKey),
                    dup.companyId,
                    this.escapeCsv(dup.companyName),
                    this.escapeCsv(dup.domain),
                    dup.salesforceAccountId || '',
                    dup.score,
                    dup.num_contacts,
                    dup.num_deals,
                    `Lower score (${dup.score}) - merge into ${bundle.canonical.companyId}`
                ].join(','));
            });
        });

        const csv = [headers.join(',')].concat(rows).join('\n');
        fs.writeFileSync(filePath, csv);
    }

    /**
     * Save summary report
     */
    saveSummaryReport(filePath) {
        const lines = [];

        lines.push('═'.repeat(70));
        lines.push('DEDUPLICATION CANONICAL SELECTION SUMMARY');
        lines.push('═'.repeat(70));
        lines.push('');
        lines.push(`Generated: ${new Date().toISOString()}`);
        lines.push('');

        lines.push('Scoring Weights:');
        Object.entries(this.weights).forEach(([key, value]) => {
            lines.push(`  ${key}: ${value}`);
        });
        lines.push('');

        lines.push(`Total Bundles: ${this.canonicalMap.length}`);
        lines.push(`Total Companies to Merge: ${this.canonicalMap.reduce((sum, b) => sum + b.duplicateCount, 0)}`);
        lines.push(`Total Companies to Keep: ${this.canonicalMap.length}`);
        lines.push('');

        lines.push('Top 10 Bundles by Duplicate Count:');
        const topBundles = [...this.canonicalMap]
            .sort((a, b) => b.duplicateCount - a.duplicateCount)
            .slice(0, 10);

        topBundles.forEach((bundle, index) => {
            lines.push(`  ${index + 1}. ${bundle.clusterKey}`);
            lines.push(`     Canonical: ${bundle.canonical.companyName} (ID: ${bundle.canonical.companyId}, Score: ${bundle.canonical.score})`);
            lines.push(`     Duplicates: ${bundle.duplicateCount} companies`);
            lines.push('');
        });

        lines.push('═'.repeat(70));
        lines.push('REVIEW THIS REPORT BEFORE PROCEEDING TO EXECUTION');
        lines.push('═'.repeat(70));

        fs.writeFileSync(filePath, lines.join('\n'));
    }

    /**
     * Calculate score breakdown for transparency
     */
    _calculateScoreBreakdown(company, allCompaniesInBundle) {
        const breakdown = {
            hasSalesforceAccountId: 0,
            syncHealth: 0,
            customFieldCompleteness: 0,
            numContacts: 0,
            numDeals: 0,
            ownerPresent: 0,
            createdateOldest: 0
        };

        // 1. Salesforce Account ID
        if (company.salesforceaccountid) {
            breakdown.hasSalesforceAccountId = this.weights.hasSalesforceAccountId;
        }

        // 2. Sync Health
        breakdown.syncHealth = this.calculateSyncHealth(company);

        // 3. Custom Field Completeness
        breakdown.customFieldCompleteness = this.calculateCustomFieldCompleteness(company, allCompaniesInBundle);

        // 4. Contacts
        const maxContacts = Math.max(...allCompaniesInBundle.map(c => c.num_contacts || 0));
        if (maxContacts > 0) {
            const normalizedContacts = (company.num_contacts || 0) / maxContacts;
            breakdown.numContacts = Math.round(normalizedContacts * this.weights.numContacts * 100) / 100;
        }

        // 5. Deals
        const maxDeals = Math.max(...allCompaniesInBundle.map(c => c.num_deals || 0));
        if (maxDeals > 0) {
            const normalizedDeals = (company.num_deals || 0) / maxDeals;
            breakdown.numDeals = Math.round(normalizedDeals * this.weights.numDeals * 100) / 100;
        }

        // 6. Owner
        if (company.owner_id) {
            breakdown.ownerPresent = this.weights.ownerPresent;
        }

        // 7. Create Date
        const createDates = allCompaniesInBundle
            .map(c => c.createdate ? new Date(c.createdate).getTime() : Date.now())
            .filter(d => !isNaN(d));

        if (createDates.length > 0 && company.createdate) {
            const companyDate = new Date(company.createdate).getTime();
            const oldestDate = Math.min(...createDates);
            const newestDate = Math.max(...createDates);
            const range = newestDate - oldestDate;

            if (range > 0) {
                const normalizedAge = 1 - ((companyDate - oldestDate) / range);
                breakdown.createdateOldest = Math.round(normalizedAge * this.weights.createdateOldest * 100) / 100;
            } else {
                breakdown.createdateOldest = this.weights.createdateOldest;
            }
        }

        return breakdown;
    }

    /**
     * Extract critical custom field values for reporting
     */
    _extractCriticalFields(company) {
        const extracted = {};

        for (const fieldName of Object.keys(this.criticalCustomFields)) {
            const value = this._getFieldValue(company, fieldName);
            if (value !== null && value !== undefined && value !== '') {
                extracted[fieldName] = value;
            }
        }

        return extracted;
    }

    /**
     * Detect if duplicates have better values for any critical fields
     */
    _detectFieldConflicts(canonical, duplicates) {
        const conflicts = [];

        for (const [fieldName, fieldConfig] of Object.entries(this.criticalCustomFields)) {
            const canonicalValue = this._getFieldValue(canonical, fieldName);

            for (const dup of duplicates) {
                const dupValue = this._getFieldValue(dup, fieldName);

                if (dupValue !== null && dupValue !== undefined && dupValue !== '') {
                    // Check if duplicate has value when canonical doesn't
                    if (canonicalValue === null || canonicalValue === undefined || canonicalValue === '') {
                        conflicts.push({
                            fieldName,
                            reason: 'canonical_missing',
                            duplicateId: dup.id,
                            duplicateValue: dupValue
                        });
                    }
                    // For highest-value strategy, check if duplicate has higher value
                    else if (fieldConfig.conflictStrategy === 'highest-value') {
                        const canonicalNum = parseFloat(canonicalValue) || 0;
                        const dupNum = parseFloat(dupValue) || 0;

                        if (dupNum > canonicalNum) {
                            conflicts.push({
                                fieldName,
                                reason: 'duplicate_higher',
                                canonicalValue: canonicalNum,
                                duplicateId: dup.id,
                                duplicateValue: dupNum
                            });
                        }
                    }
                    // For different values, flag potential conflict
                    else if (String(canonicalValue) !== String(dupValue)) {
                        conflicts.push({
                            fieldName,
                            reason: 'values_differ',
                            canonicalValue,
                            duplicateId: dup.id,
                            duplicateValue: dupValue
                        });
                    }
                }
            }
        }

        return conflicts.length > 0 ? conflicts : null;
    }

    /**
     * Escape CSV values
     */
    escapeCsv(value) {
        if (!value) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }

    /**
     * Print selection summary
     */
    printSummary() {
        console.log('\n📊 Selection Summary');
        console.log('─'.repeat(70));
        console.log(`Total Bundles: ${this.canonicalMap.length}`);
        console.log(`Companies to Keep: ${this.canonicalMap.length}`);
        console.log(`Companies to Merge: ${this.canonicalMap.reduce((sum, b) => sum + b.duplicateCount, 0)}`);
        console.log('');

        const bundleACount = this.canonicalMap.filter(b => b.bundleType === 'bundleA').length;
        const bundleBCount = this.canonicalMap.filter(b => b.bundleType === 'bundleB').length;

        console.log(`Bundle A (SF-anchored): ${bundleACount} canonical selections`);
        console.log(`Bundle B (HS-only): ${bundleBCount} canonical selections`);
        console.log('─'.repeat(70));

        // Show examples
        if (this.canonicalMap.length > 0) {
            console.log('\n📋 Example Selections:');
            this.canonicalMap.slice(0, 3).forEach((bundle, index) => {
                console.log(`\n  ${index + 1}. ${bundle.clusterKey}`);
                console.log(`     ✅ KEEP: ${bundle.canonical.companyName} (Score: ${bundle.canonical.score})`);
                bundle.duplicates.slice(0, 2).forEach(dup => {
                    console.log(`     ❌ MERGE: ${dup.companyName} (Score: ${dup.score})`);
                });
                if (bundle.duplicates.length > 2) {
                    console.log(`     ... and ${bundle.duplicates.length - 2} more`);
                }
            });
        }
    }
}

// CLI Usage
if (require.main === module) {
    const ConfigLoader = require('./dedup-config-loader');

    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Deduplication Canonical Selector (Phase 2)

Usage:
  node dedup-canonical-selector.js <bundles-file> [config-file]

Arguments:
  bundles-file     Path to bundles JSON file from Phase 1
  config-file      Optional path to dedup-config.json for custom weights

Examples:
  node dedup-canonical-selector.js ./dedup-reports/bundles-2025-10-14.json
  node dedup-canonical-selector.js ./dedup-reports/bundles-2025-10-14.json ./dedup-config.json
        `);
        process.exit(0);
    }

    const bundlesPath = args[0];
    const configPath = args[1];

    if (!fs.existsSync(bundlesPath)) {
        console.error(`❌ Bundles file not found: ${bundlesPath}`);
        process.exit(1);
    }

    (async () => {
        try {
            console.log('📋 Loading bundles...');
            const bundlesData = JSON.parse(fs.readFileSync(bundlesPath, 'utf8'));

            let config = { output: { outputDir: path.dirname(bundlesPath) } };
            if (configPath && fs.existsSync(configPath)) {
                console.log('📋 Loading configuration...');
                config = ConfigLoader.load(configPath);
            } else {
                console.log('⚠️  Using default weights (no config provided)');
            }

            const selector = new CanonicalSelector(bundlesData, config);
            const canonicalMap = await selector.select();

            console.log(`\n✅ Canonical selection complete`);
            console.log(`Files saved in: ${path.dirname(bundlesPath)}`);
            console.log('\n⚠️  IMPORTANT: Review the canonical-map-actions.csv before proceeding to execution!');

            process.exit(0);

        } catch (error) {
            console.error('\n❌ Fatal error:', error.message);
            if (error.stack) {
                console.error('\nStack trace:');
                console.error(error.stack);
            }
            process.exit(1);
        }
    })();
}

module.exports = CanonicalSelector;
