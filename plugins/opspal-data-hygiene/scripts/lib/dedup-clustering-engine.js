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

// Lazy load domain-aware matching modules from opspal-core
let NormalizationEngine = null;
let FuzzyMatcher = null;
let DomainDetector = null;

function getNormalizationEngine() {
    if (!NormalizationEngine) {
        try {
            const corePath = path.join(__dirname, '..', '..', '..', 'opspal-core', 'scripts', 'lib');
            NormalizationEngine = require(path.join(corePath, 'normalization-engine')).NormalizationEngine;
        } catch (error) {
            return null;
        }
    }
    return NormalizationEngine;
}

function getFuzzyMatcher() {
    if (!FuzzyMatcher) {
        try {
            const sfdcPath = path.join(__dirname, '..', '..', '..', 'salesforce-plugin', 'scripts', 'lib');
            FuzzyMatcher = require(path.join(sfdcPath, 'fuzzy-matcher')).FuzzyMatcher;
        } catch (error) {
            return null;
        }
    }
    return FuzzyMatcher;
}

function getDomainDetector() {
    if (!DomainDetector) {
        try {
            const corePath = path.join(__dirname, '..', '..', '..', 'opspal-core', 'scripts', 'lib');
            DomainDetector = require(path.join(corePath, 'domain-detector')).DomainDetector;
        } catch (error) {
            return null;
        }
    }
    return DomainDetector;
}

class ClusteringEngine {
    constructor(snapshot, config = {}) {
        this.snapshot = snapshot;
        this.config = config;
        this.outputDir = config.output?.outputDir || './dedup-reports';
        this.bundles = {
            bundleA: [], // SF-anchored duplicates
            bundleB: [], // HS-only duplicates
            bundleC: [], // Name-based duplicates (domain-aware)
            skipped: []  // Companies requiring manual review
        };

        // Domain-aware matching configuration
        this.domain = config.domain || null;
        this.autoDetectDomain = config.autoDetectDomain !== false; // Default true
        this.orgOverride = config.orgOverride || null;
        this.nameMatchThreshold = config.nameMatchThreshold || 0.85; // Fuzzy match threshold
        this.enableNameClustering = config.enableNameClustering !== false; // Default true

        // Lazy-loaded matching components
        this._normalizer = null;
        this._fuzzyMatcher = null;
        this._domainDetector = null;
        this._detectedDomain = null;
    }

    /**
     * Initialize domain-aware matching components
     * @private
     */
    _initializeMatching() {
        // Initialize NormalizationEngine
        const NormEngineClass = getNormalizationEngine();
        if (NormEngineClass) {
            this._normalizer = new NormEngineClass({
                domain: this.domain,
                autoDetectDomain: this.autoDetectDomain,
                orgOverride: this.orgOverride
            });
        }

        // Initialize FuzzyMatcher
        const FuzzyMatcherClass = getFuzzyMatcher();
        if (FuzzyMatcherClass) {
            this._fuzzyMatcher = new FuzzyMatcherClass({
                domain: this.domain,
                autoDetectDomain: this.autoDetectDomain,
                orgOverride: this.orgOverride
            });
        }

        // Initialize DomainDetector for auto-detection
        const DetectorClass = getDomainDetector();
        if (DetectorClass && this.autoDetectDomain && !this.domain) {
            this._domainDetector = new DetectorClass();
        }
    }

    /**
     * Detect domain from company data
     * @private
     */
    _detectDomain(companies) {
        if (this.domain) {
            this._detectedDomain = { domain: this.domain, confidence: 1.0, source: 'explicit' };
            return;
        }

        if (!this._domainDetector || !this.autoDetectDomain) {
            return;
        }

        // Collect company names for detection
        const companyNames = companies
            .map(c => c.properties.name)
            .filter(Boolean)
            .slice(0, 100); // Sample first 100 for efficiency

        if (companyNames.length === 0) {
            return;
        }

        // Detect domain
        const result = this._domainDetector.detect(companyNames);
        if (result && result.confidence >= 0.5) {
            this._detectedDomain = result;
            console.log(`  🎯 Auto-detected domain: ${result.domain} (confidence: ${(result.confidence * 100).toFixed(0)}%)`);

            // Update normalizer and matcher with detected domain
            if (this._normalizer && this._normalizer.setDomain) {
                this._normalizer.setDomain(result.domain);
            }
            if (this._fuzzyMatcher && this._fuzzyMatcher.setDomain) {
                this._fuzzyMatcher.setDomain(result.domain);
            }
        }
    }

    /**
     * Set domain for matching
     * @param {string} domain - Domain name (e.g., 'government', 'healthcare')
     */
    setDomain(domain) {
        this.domain = domain;
        if (this._normalizer && this._normalizer.setDomain) {
            this._normalizer.setDomain(domain);
        }
        if (this._fuzzyMatcher && this._fuzzyMatcher.setDomain) {
            this._fuzzyMatcher.setDomain(domain);
        }
    }

    /**
     * Get current domain info
     * @returns {object|null} Domain detection result
     */
    getDomainInfo() {
        return this._detectedDomain;
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

        // Initialize domain-aware matching components
        console.log('🎯 Initializing domain-aware matching...');
        this._initializeMatching();

        // Auto-detect domain from company data
        this._detectDomain(companies);

        // Step 1: Create Bundle A (SF-anchored)
        console.log('\n📦 Creating Bundle A (SF-anchored duplicates)...');
        this.createBundleA(companies);

        // Step 2: Create Bundle B (HS-only domain-based)
        console.log('\n📦 Creating Bundle B (HS-only domain duplicates)...');
        this.createBundleB(companies);

        // Step 3: Create Bundle C (Name-based duplicates with domain-aware matching)
        if (this.enableNameClustering && this._fuzzyMatcher) {
            console.log('\n📦 Creating Bundle C (Name-based duplicates)...');
            this.createBundleC(companies);
        }

        // Step 4: Save bundles
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
     * Create Bundle C: Companies grouped by similar company names using domain-aware fuzzy matching
     * This catches duplicates that have different domains but similar names
     * (e.g., "San Diego PD" and "San Diego Police Department")
     */
    createBundleC(companies) {
        if (!this._fuzzyMatcher) {
            console.log('  ⚠️  Fuzzy matcher not available, skipping name-based clustering');
            return;
        }

        // Get companies NOT already in Bundle A or B
        const bundleAIds = new Set();
        const bundleBIds = new Set();

        this.bundles.bundleA.forEach(bundle => {
            bundle.companies.forEach(c => bundleAIds.add(c.id));
        });

        this.bundles.bundleB.forEach(bundle => {
            bundle.companies.forEach(c => bundleBIds.add(c.id));
        });

        // Companies to analyze - those with unique domains or no domain that aren't already clustered
        const candidateCompanies = companies.filter(c => {
            const id = c.id;
            const name = c.properties.name;
            return name && !bundleAIds.has(id) && !bundleBIds.has(id);
        });

        console.log(`  Candidate companies for name matching: ${candidateCompanies.length}`);

        if (candidateCompanies.length < 2) {
            console.log('  Not enough candidates for name-based clustering');
            return;
        }

        // Normalize company names with domain awareness
        const normalizedCompanies = candidateCompanies.map(c => {
            const name = c.properties.name;
            let normalizedName = name;
            let matchingForm = name;

            // Use NormalizationEngine if available
            if (this._normalizer) {
                const result = this._normalizer.normalizeCompanyName(name, {
                    domain: this._detectedDomain?.domain
                });
                normalizedName = result.normalized;
                matchingForm = result.matchingForm;
            }

            return {
                company: c,
                originalName: name,
                normalizedName,
                matchingForm
            };
        });

        // Build clusters using fuzzy matching
        const clusters = [];
        const clustered = new Set();

        for (let i = 0; i < normalizedCompanies.length; i++) {
            if (clustered.has(normalizedCompanies[i].company.id)) {
                continue;
            }

            const anchor = normalizedCompanies[i];
            const cluster = [anchor];
            clustered.add(anchor.company.id);

            // Find similar companies
            for (let j = i + 1; j < normalizedCompanies.length; j++) {
                if (clustered.has(normalizedCompanies[j].company.id)) {
                    continue;
                }

                const candidate = normalizedCompanies[j];

                // Use fuzzy matcher with domain context
                const matches = this._fuzzyMatcher.match(
                    candidate.matchingForm,
                    [{ name: anchor.matchingForm, id: anchor.company.id }],
                    { threshold: this.nameMatchThreshold }
                );

                if (matches.length > 0 && matches[0].similarity >= this.nameMatchThreshold) {
                    cluster.push(candidate);
                    clustered.add(candidate.company.id);
                }
            }

            // Only keep clusters with multiple companies
            if (cluster.length > 1) {
                clusters.push(cluster);
            }
        }

        // Convert clusters to bundles
        clusters.forEach((cluster, index) => {
            // Find representative name for cluster key
            const clusterKey = cluster[0].matchingForm.toLowerCase().replace(/\s+/g, '-').slice(0, 50);

            this.bundles.bundleC.push({
                type: 'name-based',
                clusterKey,
                matchThreshold: this.nameMatchThreshold,
                domain: this._detectedDomain?.domain || null,
                companyCount: cluster.length,
                companies: cluster.map(item => ({
                    id: item.company.id,
                    name: item.company.properties.name,
                    normalizedName: item.normalizedName,
                    matchingForm: item.matchingForm,
                    domain: item.company.properties.domain,
                    website: item.company.properties.website,
                    owner_id: item.company.properties.hubspot_owner_id,
                    createdate: item.company.properties.createdate,
                    salesforceaccountid: item.company.properties.salesforceaccountid || null,
                    num_contacts: parseInt(item.company.properties.num_associated_contacts) || 0,
                    num_deals: parseInt(item.company.properties.num_associated_deals) || 0,
                    associations: item.company.associations
                }))
            });
        });

        console.log(`  Found ${this.bundles.bundleC.length} name-based duplicate groups`);
        console.log(`  Total duplicate companies: ${this.bundles.bundleC.reduce((sum, b) => sum + b.companyCount, 0)}`);

        if (this._detectedDomain) {
            console.log(`  Domain context: ${this._detectedDomain.domain} (${(this._detectedDomain.confidence * 100).toFixed(0)}% confidence)`);
        }
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

        // Save Bundle C CSV (name-based)
        if (this.bundles.bundleC && this.bundles.bundleC.length > 0) {
            const bundleCPath = path.join(this.outputDir, `${baseFilename}-bundleC.csv`);
            this.saveBundleCCSV(this.bundles.bundleC, bundleCPath);
            console.log(`  ✅ Bundle C CSV: ${bundleCPath}`);
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
     * Save Bundle C to CSV with additional name matching fields
     */
    saveBundleCCSV(bundles, filePath) {
        const headers = [
            'Bundle_ID', 'Type', 'Cluster_Key', 'Match_Threshold', 'Domain_Context',
            'Company_Count', 'Company_ID', 'Company_Name', 'Normalized_Name',
            'Matching_Form', 'Domain', 'SF_Account_ID', 'Owner_ID',
            'Created_Date', 'Num_Contacts', 'Num_Deals'
        ];

        const rows = [];

        bundles.forEach((bundle, bundleIndex) => {
            const bundleId = `name-based-${bundleIndex + 1}`;

            bundle.companies.forEach(company => {
                rows.push([
                    bundleId,
                    bundle.type,
                    this.escapeCsv(bundle.clusterKey),
                    bundle.matchThreshold,
                    bundle.domain || '',
                    bundle.companyCount,
                    company.id,
                    this.escapeCsv(company.name),
                    this.escapeCsv(company.normalizedName),
                    this.escapeCsv(company.matchingForm),
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

        console.log(`\nBundle B (HS-only domain): ${this.bundles.bundleB.length} groups`);
        console.log(`  Total companies: ${this.bundles.bundleB.reduce((sum, b) => sum + b.companyCount, 0)}`);
        console.log(`  Avg per group: ${(this.bundles.bundleB.reduce((sum, b) => sum + b.companyCount, 0) / Math.max(this.bundles.bundleB.length, 1)).toFixed(1)}`);

        // Bundle C stats (name-based)
        if (this.bundles.bundleC && this.bundles.bundleC.length > 0) {
            console.log(`\nBundle C (Name-based): ${this.bundles.bundleC.length} groups`);
            console.log(`  Total companies: ${this.bundles.bundleC.reduce((sum, b) => sum + b.companyCount, 0)}`);
            console.log(`  Avg per group: ${(this.bundles.bundleC.reduce((sum, b) => sum + b.companyCount, 0) / Math.max(this.bundles.bundleC.length, 1)).toFixed(1)}`);
            console.log(`  Match threshold: ${this.nameMatchThreshold}`);
            if (this._detectedDomain) {
                console.log(`  Domain context: ${this._detectedDomain.domain}`);
            }
        }

        console.log(`\nSkipped: ${this.bundles.skipped.length} companies`);
        console.log('─'.repeat(70));

        // Show top 5 largest groups (include Bundle C)
        const allBundles = [
            ...this.bundles.bundleA,
            ...this.bundles.bundleB,
            ...(this.bundles.bundleC || [])
        ]
            .sort((a, b) => b.companyCount - a.companyCount)
            .slice(0, 5);

        if (allBundles.length > 0) {
            console.log('\n🔝 Top 5 Largest Duplicate Groups:');
            allBundles.forEach((bundle, index) => {
                const key = bundle.salesforceAccountId || bundle.normalizedDomain || bundle.clusterKey;
                console.log(`  ${index + 1}. ${bundle.type}: ${key} (${bundle.companyCount} companies)`);
            });
        }

        // Show domain detection info
        if (this._detectedDomain) {
            console.log(`\n🎯 Domain Detection:`);
            console.log(`  Detected: ${this._detectedDomain.domain}`);
            console.log(`  Confidence: ${(this._detectedDomain.confidence * 100).toFixed(0)}%`);
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
  node dedup-clustering-engine.js <snapshot-file> [options]

Arguments:
  snapshot-file    Path to snapshot JSON file from Phase 0

Options:
  --domain <name>       Set domain context (government, healthcare, property-management, etc.)
  --threshold <0.0-1.0> Name match threshold (default: 0.85)
  --no-name-clustering  Disable Bundle C (name-based clustering)
  --no-auto-detect      Disable domain auto-detection

Examples:
  node dedup-clustering-engine.js ./dedup-reports/snapshot-2025-10-14.json
  node dedup-clustering-engine.js ./snapshot.json --domain government
  node dedup-clustering-engine.js ./snapshot.json --threshold 0.9
  node dedup-clustering-engine.js ./snapshot.json --no-name-clustering
        `);
        process.exit(0);
    }

    // Parse arguments
    const snapshotPath = args.find(a => !a.startsWith('--'));

    if (!snapshotPath) {
        console.error('❌ Snapshot file path required');
        process.exit(1);
    }

    if (!fs.existsSync(snapshotPath)) {
        console.error(`❌ Snapshot file not found: ${snapshotPath}`);
        process.exit(1);
    }

    // Parse options
    const domainIndex = args.indexOf('--domain');
    const domain = domainIndex !== -1 ? args[domainIndex + 1] : null;

    const thresholdIndex = args.indexOf('--threshold');
    const threshold = thresholdIndex !== -1 ? parseFloat(args[thresholdIndex + 1]) : 0.85;

    const enableNameClustering = !args.includes('--no-name-clustering');
    const autoDetectDomain = !args.includes('--no-auto-detect');

    (async () => {
        try {
            console.log('📋 Loading snapshot...');
            const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

            const config = {
                output: { outputDir: path.dirname(snapshotPath) },
                domain,
                autoDetectDomain,
                nameMatchThreshold: threshold,
                enableNameClustering
            };

            if (domain) {
                console.log(`🎯 Using explicit domain: ${domain}`);
            }
            if (!enableNameClustering) {
                console.log('⚠️  Name-based clustering disabled');
            }

            const engine = new ClusteringEngine(snapshot, config);
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
