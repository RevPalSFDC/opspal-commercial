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
            syncHealth: 50,            // NEW: Sync health scoring
            numContacts: 40,
            numDeals: 25,
            ownerPresent: 10,
            createdateOldest: 5
        };
        this.outputDir = config.output?.outputDir || './dedup-reports';
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

        // Save canonical map
        console.log('\n💾 Saving canonical map...');
        this.saveCanonicalMap();

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
                    num_contacts: canonical.num_contacts,
                    num_deals: canonical.num_deals
                },
                duplicates: duplicates.map(d => ({
                    companyId: d.id,
                    companyName: d.name,
                    domain: d.domain,
                    salesforceAccountId: d.salesforceaccountid,
                    score: d.score,
                    num_contacts: d.num_contacts,
                    num_deals: d.num_deals
                })),
                totalCompanies: bundle.companyCount,
                duplicateCount: duplicates.length
            });

            if ((index + 1) % 10 === 0) {
                console.log(`  Processed ${index + 1}/${bundles.length} bundles...`);
            }
        });

        console.log(`  ✅ Processed ${bundles.length} bundles`);
    }

    /**
     * Calculate score for a company
     */
    calculateScore(company, allCompaniesInBundle) {
        let score = 0;

        // 1. Has Salesforce Account ID (100 points)
        if (company.salesforceaccountid) {
            score += this.weights.hasSalesforceAccountId;
        }

        // 2. Sync Health (0-50 points) - NEW
        score += this.calculateSyncHealth(company);

        // 3. Normalized Contact Count (0-40 points)
        const maxContacts = Math.max(...allCompaniesInBundle.map(c => c.num_contacts || 0));
        if (maxContacts > 0) {
            const normalizedContacts = (company.num_contacts || 0) / maxContacts;
            score += normalizedContacts * this.weights.numContacts;
        }

        // 4. Normalized Deal Count (0-25 points)
        const maxDeals = Math.max(...allCompaniesInBundle.map(c => c.num_deals || 0));
        if (maxDeals > 0) {
            const normalizedDeals = (company.num_deals || 0) / maxDeals;
            score += normalizedDeals * this.weights.numDeals;
        }

        // 5. Owner Present (10 points)
        if (company.owner_id) {
            score += this.weights.ownerPresent;
        }

        // 6. Older Created Date (0-5 points)
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
