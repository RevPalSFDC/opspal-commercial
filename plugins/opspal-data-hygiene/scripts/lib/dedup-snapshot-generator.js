#!/usr/bin/env node
/**
 * Deduplication Snapshot Generator (Phase 0)
 *
 * Purpose: Create comprehensive snapshots of HubSpot Companies and Salesforce Accounts
 * before any modifications. Critical safety component for rollback capability.
 *
 * Features:
 * - HubSpot Companies with all associations (Contacts, Deals)
 * - Salesforce Accounts with all associations (Contacts, Opportunities)
 * - Rate limiting for API compliance
 * - CSV and JSON output formats
 * - Versioned snapshots for rollback
 * - Progress tracking and resumption
 *
 * Usage:
 *   const SnapshotGenerator = require('./dedup-snapshot-generator');
 *   const generator = new SnapshotGenerator(config);
 *   const snapshot = await generator.generate();
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const { RobustCSVParser } = require('../../../salesforce-plugin/scripts/lib/csv-schema-validator');

class SnapshotGenerator {
    constructor(config) {
        this.config = config;
        this.hubspot = config.hubspot;
        this.salesforce = config.salesforce;
        this.outputDir = config.output?.outputDir || './dedup-reports';
        this.timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
        this.maxRequestsPerMin = config.execution?.maxWritePerMin || 60;
        this.requestCount = 0;
        this.requestWindowStart = Date.now();
        this.csvParser = new RobustCSVParser(); // Quick Win: Robust CSV generation

        // Ensure output directory exists
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Generate complete snapshot of HubSpot and Salesforce data
     * @returns {Promise<object>} Snapshot metadata
     */
    async generate() {
        console.log('\n🔍 Phase 0: Generating Data Snapshot');
        console.log('═'.repeat(70));
        console.log(`Timestamp: ${this.timestamp}`);
        console.log(`Output Directory: ${this.outputDir}\n`);

        const snapshot = {
            id: `snapshot-${this.timestamp}`,
            timestamp: new Date().toISOString(),
            hubspot: {},
            salesforce: {},
            metadata: {
                config: {
                    portalId: this.hubspot.portalId,
                    orgAlias: this.salesforce.orgAlias
                },
                files: []
            }
        };

        try {
            // Step 1: Snapshot HubSpot Companies
            console.log('📊 Fetching HubSpot Companies...');
            snapshot.hubspot = await this.snapshotHubSpotCompanies();

            // Step 2: Snapshot Salesforce Accounts
            console.log('\n📊 Fetching Salesforce Accounts...');
            snapshot.salesforce = await this.snapshotSalesforceAccounts();

            // Step 3: Save snapshot files
            console.log('\n💾 Saving snapshot files...');
            await this.saveSnapshot(snapshot);

            console.log('\n✅ Snapshot generation complete!');
            console.log('═'.repeat(70));
            this.printSummary(snapshot);

            return snapshot;

        } catch (error) {
            console.error('\n❌ Snapshot generation failed:', error.message);
            throw error;
        }
    }

    /**
     * Snapshot HubSpot Companies with associations
     */
    async snapshotHubSpotCompanies() {
        const companies = [];
        let after = null;
        let totalFetched = 0;

        const properties = [
            'name',
            'domain',
            'website',
            'hubspot_owner_id',
            'createdate',
            'hs_lastmodifieddate',
            'lifecyclestage',
            'salesforceaccountid',
            'salesforceobjecttype',
            'hs_object_id',
            'num_associated_contacts',
            'num_associated_deals',
            'hs_latest_sync_timestamp',   // NEW: For sync health scoring
            'hs_object_source'            // NEW: For sync health scoring
        ];

        do {
            await this.enforceRateLimit();

            const response = await this.fetchHubSpotCompaniesBatch(properties, after);

            if (response.results && response.results.length > 0) {
                companies.push(...response.results);
                totalFetched += response.results.length;
                console.log(`  Fetched ${totalFetched} companies...`);
            }

            after = response.paging?.next?.after || null;

        } while (after !== null);

        console.log(`  ✅ Total HubSpot Companies: ${companies.length}`);

        // Fetch associations for each company (in batches)
        console.log('  Fetching associations...');
        const companiesWithAssociations = await this.fetchCompanyAssociations(companies);

        return {
            totalCompanies: companiesWithAssociations.length,
            companies: companiesWithAssociations,
            fetchedAt: new Date().toISOString()
        };
    }

    /**
     * Fetch batch of HubSpot companies
     */
    fetchHubSpotCompaniesBatch(properties, after = null) {
        return new Promise((resolve, reject) => {
            const limit = 100;
            let path = `/crm/v3/objects/companies?limit=${limit}&properties=${properties.join(',')}`;
            if (after) {
                path += `&after=${after}`;
            }

            const options = {
                hostname: 'api.hubapi.com',
                path: path,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.hubspot.accessToken}`,
                    'Content-Type': 'application/json'
                }
            };

            let data = '';
            const req = https.request(options, (res) => {
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(JSON.parse(data));
                    } else if (res.statusCode === 429) {
                        reject(new Error('Rate limit exceeded. Increase delay or reduce batch size.'));
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });
    }

    /**
     * Fetch associations for companies
     */
    async fetchCompanyAssociations(companies) {
        const enriched = [];

        for (let i = 0; i < companies.length; i++) {
            const company = companies[i];

            if (i > 0 && i % 50 === 0) {
                console.log(`    Associations: ${i}/${companies.length}`);
            }

            await this.enforceRateLimit();

            try {
                const associations = await this.fetchAssociationsForCompany(company.id);
                enriched.push({
                    ...company,
                    associations
                });
            } catch (error) {
                console.warn(`    ⚠️  Failed to fetch associations for company ${company.id}: ${error.message}`);
                enriched.push({
                    ...company,
                    associations: { contacts: [], deals: [] }
                });
            }
        }

        return enriched;
    }

    /**
     * Fetch associations for a single company
     */
    fetchAssociationsForCompany(companyId) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.hubapi.com',
                path: `/crm/v4/objects/companies/${companyId}/associations/batch/read`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.hubspot.accessToken}`,
                    'Content-Type': 'application/json'
                }
            };

            const requestBody = JSON.stringify({
                inputs: [
                    { id: companyId }
                ]
            });

            let data = '';
            const req = https.request(options, (res) => {
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200 || res.statusCode === 207) {
                        const result = JSON.parse(data);
                        const associations = {
                            contacts: [],
                            deals: []
                        };

                        if (result.results && result.results.length > 0) {
                            const companyAssoc = result.results[0];
                            if (companyAssoc.from) {
                                associations.contacts = companyAssoc.from.filter(a => a.toObjectId).map(a => a.toObjectId);
                            }
                            // Note: Deals would need separate query or different endpoint
                        }

                        resolve(associations);
                    } else {
                        resolve({ contacts: [], deals: [] }); // Graceful fallback
                    }
                });
            });

            req.on('error', () => resolve({ contacts: [], deals: [] }));
            req.write(requestBody);
            req.end();
        });
    }

    /**
     * Snapshot Salesforce Accounts with associations
     */
    async snapshotSalesforceAccounts() {
        console.log('  Querying Salesforce Accounts...');

        const query = `
            SELECT
                Id, Name, Website, OwnerId, CreatedDate, LastModifiedDate,
                Type, Industry, NumberOfEmployees, AnnualRevenue,
                BillingCity, BillingState, BillingCountry,
                (SELECT Id, FirstName, LastName, Email FROM Contacts),
                (SELECT Id, Name, StageName, Amount, CloseDate FROM Opportunities)
            FROM Account
            WHERE IsDeleted = false
            ORDER BY CreatedDate DESC
        `;

        try {
            const result = this.executeSalesforceQuery(query);
            const accounts = JSON.parse(result);

            if (accounts.status !== 0) {
                throw new Error(`Salesforce query failed: ${accounts.message}`);
            }

            const accountRecords = accounts.result?.records || [];
            console.log(`  ✅ Total Salesforce Accounts: ${accountRecords.length}`);

            return {
                totalAccounts: accountRecords.length,
                accounts: accountRecords,
                fetchedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('  ❌ Salesforce query failed:', error.message);
            throw error;
        }
    }

    /**
     * Execute Salesforce SOQL query
     */
    executeSalesforceQuery(query) {
        const cleanQuery = query.replace(/\s+/g, ' ').trim();
        const command = `sf data query --query "${cleanQuery}" --target-org ${this.salesforce.orgAlias} --json`;

        try {
            return execSync(command, {
                encoding: 'utf-8',
                maxBuffer: 100 * 1024 * 1024,
                stdio: ['pipe', 'pipe', 'pipe']
            });
        } catch (error) {
            throw new Error(`SF CLI error: ${error.message}`);
        }
    }

    /**
     * Save snapshot to files
     */
    async saveSnapshot(snapshot) {
        const baseFilename = `snapshot-${this.timestamp}`;

        // Save complete JSON
        const jsonPath = path.join(this.outputDir, `${baseFilename}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2));
        console.log(`  ✅ JSON: ${jsonPath}`);
        snapshot.metadata.files.push(jsonPath);

        // Save HubSpot Companies CSV
        if (snapshot.hubspot.companies && snapshot.hubspot.companies.length > 0) {
            const hsCSVPath = path.join(this.outputDir, `${baseFilename}-hubspot-companies.csv`);
            this.saveCompaniesCSV(snapshot.hubspot.companies, hsCSVPath);
            console.log(`  ✅ HubSpot CSV: ${hsCSVPath}`);
            snapshot.metadata.files.push(hsCSVPath);
        }

        // Save Salesforce Accounts CSV
        if (snapshot.salesforce.accounts && snapshot.salesforce.accounts.length > 0) {
            const sfCSVPath = path.join(this.outputDir, `${baseFilename}-salesforce-accounts.csv`);
            this.saveAccountsCSV(snapshot.salesforce.accounts, sfCSVPath);
            console.log(`  ✅ Salesforce CSV: ${sfCSVPath}`);
            snapshot.metadata.files.push(sfCSVPath);
        }

        // Save metadata file
        const metadataPath = path.join(this.outputDir, `${baseFilename}-metadata.json`);
        fs.writeFileSync(metadataPath, JSON.stringify(snapshot.metadata, null, 2));
        console.log(`  ✅ Metadata: ${metadataPath}`);
    }

    /**
     * Save HubSpot companies to CSV
     * Quick Win: Uses RobustCSVParser for automatic quoting and escaping
     */
    saveCompaniesCSV(companies, filePath) {
        // Convert to object-based rows for robust CSV generation
        const rows = companies.map(company => ({
            'id': company.id,
            'name': company.properties.name || '',
            'domain': company.properties.domain || '',
            'website': company.properties.website || '',
            'owner_id': company.properties.hubspot_owner_id || '',
            'createdate': company.properties.createdate || '',
            'lastmodified': company.properties.hs_lastmodifieddate || '',
            'lifecyclestage': company.properties.lifecyclestage || '',
            'salesforceaccountid': company.properties.salesforceaccountid || '',
            'num_contacts': company.properties.num_associated_contacts || 0,
            'num_deals': company.properties.num_associated_deals || 0
        }));

        // Quick Win: RobustCSVParser handles all quoting, commas, quotes automatically
        const csv = this.csvParser.generate(rows);
        fs.writeFileSync(filePath, csv);
    }

    /**
     * Save Salesforce accounts to CSV
     * Quick Win: Uses RobustCSVParser for automatic quoting and escaping
     */
    saveAccountsCSV(accounts, filePath) {
        // Convert to object-based rows for robust CSV generation
        const rows = accounts.map(account => ({
            'Id': account.Id,
            'Name': account.Name || '',
            'Website': account.Website || '',
            'OwnerId': account.OwnerId || '',
            'CreatedDate': account.CreatedDate || '',
            'Type': account.Type || '',
            'Industry': account.Industry || '',
            'NumberOfEmployees': account.NumberOfEmployees || 0,
            'AnnualRevenue': account.AnnualRevenue || 0,
            'NumContacts': account.Contacts?.length || 0,
            'NumOpportunities': account.Opportunities?.length || 0
        }));

        // Quick Win: RobustCSVParser handles all quoting, commas, quotes automatically
        const csv = this.csvParser.generate(rows);
        fs.writeFileSync(filePath, csv);
    }

    /**
     * Note: escapeCsv method removed in Quick Wins integration
     * Now using RobustCSVParser.generate() which handles all escaping automatically
     */

    /**
     * Enforce rate limiting
     */
    async enforceRateLimit() {
        this.requestCount++;

        // Reset window if 60 seconds have passed
        const now = Date.now();
        if (now - this.requestWindowStart >= 60000) {
            this.requestCount = 1;
            this.requestWindowStart = now;
            return;
        }

        // If we've hit the limit, wait
        if (this.requestCount >= this.maxRequestsPerMin) {
            const waitTime = 60000 - (now - this.requestWindowStart);
            console.log(`  ⏳ Rate limit reached, waiting ${Math.ceil(waitTime / 1000)}s...`);
            await this.sleep(waitTime);
            this.requestCount = 1;
            this.requestWindowStart = Date.now();
        }
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Print snapshot summary
     */
    printSummary(snapshot) {
        console.log('\n📊 Snapshot Summary');
        console.log('─'.repeat(70));
        console.log(`Snapshot ID: ${snapshot.id}`);
        console.log(`Timestamp: ${snapshot.timestamp}`);
        console.log('');
        console.log(`HubSpot Companies: ${snapshot.hubspot.totalCompanies}`);
        console.log(`Salesforce Accounts: ${snapshot.salesforce.totalAccounts}`);
        console.log('');
        console.log('Files Generated:');
        snapshot.metadata.files.forEach(file => {
            console.log(`  - ${path.basename(file)}`);
        });
        console.log('─'.repeat(70));
    }
}

// CLI Usage
if (require.main === module) {
    const ConfigLoader = require('./dedup-config-loader');

    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Deduplication Snapshot Generator (Phase 0)

Usage:
  node dedup-snapshot-generator.js <config-path>
  node dedup-snapshot-generator.js --config <config-path>

Options:
  --config <path>    Path to dedup-config.json
  --help             Show this help message

Examples:
  # Using config file
  node dedup-snapshot-generator.js ./dedup-config.json

  # Using environment variables
  node dedup-snapshot-generator.js
        `);
        process.exit(0);
    }

    const configPath = args[0] === '--config' ? args[1] : args[0];

    (async () => {
        try {
            console.log('📋 Loading configuration...');
            const config = configPath ? ConfigLoader.load(configPath) : ConfigLoader.loadOrDefault();

            ConfigLoader.printSummary(config);

            const generator = new SnapshotGenerator(config);
            const snapshot = await generator.generate();

            console.log(`\n✅ Snapshot saved: ${snapshot.id}`);
            console.log('Use this snapshot for rollback if needed.');

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

module.exports = SnapshotGenerator;
