#!/usr/bin/env node
/**
 * Deduplication Clustering Engine (Phase 1)
 *
 * Purpose: Group duplicate HubSpot Companies into "bundles" for processing.
 * Uses two clustering strategies: SF Account ID and normalized domain.
 *
 * Features:
 * - Bundle A: Companies grouped by salesforceaccountid
 * - Bundle B: Companies grouped by normalized domain
 * - Domain normalization (lowercase, no protocol/www)
 * - Conflict detection (multiple companies per SF Account)
 * - Bundle persistence to JSON
 *
 * Usage:
 *   const ClusteringEngine = require('./dedup-clustering-engine');
 *   const engine = new ClusteringEngine(snapshot);
 *   const bundles = await engine.cluster();
 */

const fs = require('fs');
const path = require('path');

class ClusteringEngine {
    constructor(snapshot, config = {}) {
        this.snapshot = snapshot;
        this.config = config;
        this.outputDir = config.output?.outputDir || './dedup-reports';
        this.bundles = {
            bundleA: [], // SF-anchored duplicates
            bundleB: [], // HS-only duplicates
            skipped: []  // Companies requiring manual review
        };
    }

    /**
     * Cluster companies into bundles
     * @returns {Promise<object>} Clustering results
     */
    async cluster() {
        console.log('\n🔍 Phase 1: Clustering Duplicate Companies');
        console.log('═'.repeat(70));

        const companies = this.snapshot.hubspot.companies || [];

        if (companies.length === 0) {
            console.log('⚠️  No companies found in snapshot');
            return this.bundles;
        }

        console.log(`Total Companies: ${companies.length}\n`);

        // Step 1: Create Bundle A (SF-anchored)
        console.log('📦 Creating Bundle A (SF-anchored duplicates)...');
        this.createBundleA(companies);

        // Step 2: Create Bundle B (HS-only)
        console.log('\n📦 Creating Bundle B (HS-only duplicates)...');
        this.createBundleB(companies);

        // Step 3: Save bundles
        console.log('\n💾 Saving bundle files...');
        this.saveBundles();

        console.log('\n✅ Clustering complete!');
        console.log('═'.repeat(70));
        this.printSummary();

        return this.bundles;
    }

    /**
     * Create Bundle A: Companies grouped by salesforceaccountid
     */
    createBundleA(companies) {
        // Group by salesforceaccountid
        const grouped = {};

        companies.forEach(company => {
            const sfAccountId = company.properties.salesforceaccountid;

            if (sfAccountId) {
                if (!grouped[sfAccountId]) {
                    grouped[sfAccountId] = [];
                }
                grouped[sfAccountId].push(company);
            }
        });

        // Filter to only groups with multiple companies (duplicates)
        Object.entries(grouped).forEach(([sfAccountId, companyGroup]) => {
            if (companyGroup.length > 1) {
                this.bundles.bundleA.push({
                    type: 'sf-anchored',
                    salesforceAccountId: sfAccountId,
                    companyCount: companyGroup.length,
                    companies: companyGroup.map(c => ({
                        id: c.id,
                        name: c.properties.name,
                        domain: c.properties.domain,
                        website: c.properties.website,
                        owner_id: c.properties.hubspot_owner_id,
                        createdate: c.properties.createdate,
                        salesforceaccountid: c.properties.salesforceaccountid,
                        num_contacts: parseInt(c.properties.num_associated_contacts) || 0,
                        num_deals: parseInt(c.properties.num_associated_deals) || 0,
                        associations: c.associations
                    }))
                });
            }
        });

        console.log(`  Found ${this.bundles.bundleA.length} SF-anchored duplicate groups`);
        console.log(`  Total duplicate companies: ${this.bundles.bundleA.reduce((sum, b) => sum + b.companyCount, 0)}`);
    }

    /**
     * Create Bundle B: Companies grouped by normalized domain
     */
    createBundleB(companies) {
        // Filter to companies WITHOUT salesforceaccountid
        const hsOnlyCompanies = companies.filter(c => !c.properties.salesforceaccountid);

        console.log(`  HubSpot-only companies: ${hsOnlyCompanies.length}`);

        // Group by normalized domain
        const grouped = {};

        hsOnlyCompanies.forEach(company => {
            const domain = this.normalizeDomain(company.properties.domain || company.properties.website);

            if (domain && domain !== 'unknown') {
                if (!grouped[domain]) {
                    grouped[domain] = [];
                }
                grouped[domain].push(company);
            } else {
                // Skip companies with no domain
                this.bundles.skipped.push({
                    companyId: company.id,
                    companyName: company.properties.name,
                    reason: 'no_domain',
                    message: 'No domain available for clustering'
                });
            }
        });

        // Filter to only groups with multiple companies (duplicates)
        Object.entries(grouped).forEach(([domain, companyGroup]) => {
            if (companyGroup.length > 1) {
                this.bundles.bundleB.push({
                    type: 'hs-only',
                    normalizedDomain: domain,
                    companyCount: companyGroup.length,
                    companies: companyGroup.map(c => ({
                        id: c.id,
                        name: c.properties.name,
                        domain: c.properties.domain,
                        website: c.properties.website,
                        owner_id: c.properties.hubspot_owner_id,
                        createdate: c.properties.createdate,
                        salesforceaccountid: null,
                        num_contacts: parseInt(c.properties.num_associated_contacts) || 0,
                        num_deals: parseInt(c.properties.num_associated_deals) || 0,
                        associations: c.associations
                    }))
                });
            }
        });

        console.log(`  Found ${this.bundles.bundleB.length} HS-only duplicate groups`);
        console.log(`  Total duplicate companies: ${this.bundles.bundleB.reduce((sum, b) => sum + b.companyCount, 0)}`);
        console.log(`  Skipped (no domain): ${this.bundles.skipped.filter(s => s.reason === 'no_domain').length}`);
    }

    /**
     * Normalize domain for clustering
     * - Lowercase
     * - Remove protocol (http://, https://)
     * - Remove www prefix
     * - Extract domain only (no path)
     */
    normalizeDomain(domain) {
        if (!domain || typeof domain !== 'string') {
            return 'unknown';
        }

        let normalized = domain.toLowerCase().trim();

        // Remove protocol
        normalized = normalized.replace(/^https?:\/\//, '');

        // Remove www prefix
        normalized = normalized.replace(/^www\./, '');

        // Remove path (everything after first /)
        normalized = normalized.split('/')[0];

        // Remove trailing dots
        normalized = normalized.replace(/\.$/, '');

        // Return unknown if empty
        return normalized || 'unknown';
    }

    /**
     * Save bundles to files
     */
    saveBundles() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
        const baseFilename = `bundles-${timestamp}`;

        // Save complete bundles JSON
        const jsonPath = path.join(this.outputDir, `${baseFilename}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(this.bundles, null, 2));
        console.log(`  ✅ Bundles JSON: ${jsonPath}`);

        // Save Bundle A CSV
        if (this.bundles.bundleA.length > 0) {
            const bundleAPath = path.join(this.outputDir, `${baseFilename}-bundleA.csv`);
            this.saveBundleCSV(this.bundles.bundleA, bundleAPath, 'Bundle A (SF-anchored)');
            console.log(`  ✅ Bundle A CSV: ${bundleAPath}`);
        }

        // Save Bundle B CSV
        if (this.bundles.bundleB.length > 0) {
            const bundleBPath = path.join(this.outputDir, `${baseFilename}-bundleB.csv`);
            this.saveBundleCSV(this.bundles.bundleB, bundleBPath, 'Bundle B (HS-only)');
            console.log(`  ✅ Bundle B CSV: ${bundleBPath}`);
        }

        // Save skipped items CSV
        if (this.bundles.skipped.length > 0) {
            const skippedPath = path.join(this.outputDir, `${baseFilename}-skipped.csv`);
            this.saveSkippedCSV(this.bundles.skipped, skippedPath);
            console.log(`  ✅ Skipped CSV: ${skippedPath}`);
        }
    }

    /**
     * Save bundle to CSV
     */
    saveBundleCSV(bundles, filePath, title) {
        const headers = [
            'Bundle_ID', 'Type', 'Cluster_Key', 'Company_Count',
            'Company_ID', 'Company_Name', 'Domain', 'SF_Account_ID',
            'Owner_ID', 'Created_Date', 'Num_Contacts', 'Num_Deals'
        ];

        const rows = [];

        bundles.forEach((bundle, bundleIndex) => {
            const bundleId = `${bundle.type}-${bundleIndex + 1}`;
            const clusterKey = bundle.salesforceAccountId || bundle.normalizedDomain;

            bundle.companies.forEach(company => {
                rows.push([
                    bundleId,
                    bundle.type,
                    clusterKey,
                    bundle.companyCount,
                    company.id,
                    this.escapeCsv(company.name),
                    this.escapeCsv(company.domain),
                    company.salesforceaccountid || '',
                    company.owner_id || '',
                    company.createdate || '',
                    company.num_contacts,
                    company.num_deals
                ].join(','));
            });
        });

        const csv = [headers.join(',')].concat(rows).join('\n');
        fs.writeFileSync(filePath, csv);
    }

    /**
     * Save skipped items to CSV
     */
    saveSkippedCSV(skipped, filePath) {
        const headers = ['Company_ID', 'Company_Name', 'Reason', 'Message'];

        const rows = skipped.map(item => [
            item.companyId,
            this.escapeCsv(item.companyName),
            item.reason,
            this.escapeCsv(item.message)
        ].join(','));

        const csv = [headers.join(',')].concat(rows).join('\n');
        fs.writeFileSync(filePath, csv);
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
     * Print clustering summary
     */
    printSummary() {
        console.log('\n📊 Clustering Summary');
        console.log('─'.repeat(70));
        console.log(`Bundle A (SF-anchored): ${this.bundles.bundleA.length} groups`);
        console.log(`  Total companies: ${this.bundles.bundleA.reduce((sum, b) => sum + b.companyCount, 0)}`);
        console.log(`  Avg per group: ${(this.bundles.bundleA.reduce((sum, b) => sum + b.companyCount, 0) / Math.max(this.bundles.bundleA.length, 1)).toFixed(1)}`);

        console.log(`\nBundle B (HS-only): ${this.bundles.bundleB.length} groups`);
        console.log(`  Total companies: ${this.bundles.bundleB.reduce((sum, b) => sum + b.companyCount, 0)}`);
        console.log(`  Avg per group: ${(this.bundles.bundleB.reduce((sum, b) => sum + b.companyCount, 0) / Math.max(this.bundles.bundleB.length, 1)).toFixed(1)}`);

        console.log(`\nSkipped: ${this.bundles.skipped.length} companies`);
        console.log('─'.repeat(70));

        // Show top 5 largest groups
        const allBundles = [...this.bundles.bundleA, ...this.bundles.bundleB]
            .sort((a, b) => b.companyCount - a.companyCount)
            .slice(0, 5);

        if (allBundles.length > 0) {
            console.log('\n🔝 Top 5 Largest Duplicate Groups:');
            allBundles.forEach((bundle, index) => {
                const key = bundle.salesforceAccountId || bundle.normalizedDomain;
                console.log(`  ${index + 1}. ${bundle.type}: ${key} (${bundle.companyCount} companies)`);
            });
        }
    }
}

// CLI Usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Deduplication Clustering Engine (Phase 1)

Usage:
  node dedup-clustering-engine.js <snapshot-file>

Arguments:
  snapshot-file    Path to snapshot JSON file from Phase 0

Examples:
  node dedup-clustering-engine.js ./dedup-reports/snapshot-2025-10-14.json
        `);
        process.exit(0);
    }

    const snapshotPath = args[0];

    if (!fs.existsSync(snapshotPath)) {
        console.error(`❌ Snapshot file not found: ${snapshotPath}`);
        process.exit(1);
    }

    (async () => {
        try {
            console.log('📋 Loading snapshot...');
            const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

            const engine = new ClusteringEngine(snapshot, {
                output: { outputDir: path.dirname(snapshotPath) }
            });

            const bundles = await engine.cluster();

            console.log(`\n✅ Bundles created successfully`);
            console.log(`Files saved in: ${path.dirname(snapshotPath)}`);

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

module.exports = ClusteringEngine;
