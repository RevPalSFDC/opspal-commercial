#!/usr/bin/env node
/**
 * Deduplication Guardrails Manager (Phase 4)
 *
 * Purpose: Implement prevention mechanisms to stop duplicate companies from recurring
 * after cleanup. Creates unique constraints and monitoring systems.
 *
 * Features:
 * - Create external_sfdc_account_id property with unique constraint
 * - Copy salesforceaccountid to external_sfdc_account_id
 * - Create exception queries for monitoring
 * - Generate compliance dashboards
 * - Document auto-associate settings
 *
 * Usage:
 *   const GuardrailManager = require('./dedup-guardrail-manager');
 *   const manager = new GuardrailManager(config);
 *   await manager.implement();
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

class GuardrailManager {
    constructor(config) {
        this.config = config;
        this.hubspot = config.hubspot;
        this.outputDir = config.output?.outputDir || './dedup-reports';
        this.guardrails = config.guardrails || {};
        this.dryRun = config.execution?.dryRun !== false;

        this.results = {
            propertyCreated: false,
            valuesPopulated: 0,
            exceptionsCreated: [],
            documentation: []
        };
    }

    /**
     * Implement all guardrails
     * @returns {Promise<object>} Implementation results
     */
    async implement() {
        console.log('\n🛡️  Phase 4: Implementing Guardrails');
        console.log('═'.repeat(70));
        console.log(`Mode: ${this.dryRun ? '🔍 DRY RUN' : '⚠️  LIVE EXECUTION'}`);
        console.log('');

        try {
            // Step 1: Create external_sfdc_account_id property
            if (this.guardrails.createExternalSFDCAccountIdProperty !== false) {
                await this.createExternalAccountIdProperty();
            }

            // Step 2: Populate external_sfdc_account_id values
            if (this.guardrails.enforceUniqueConstraint !== false) {
                await this.populateExternalAccountIds();
            }

            // Step 3: Create exception queries
            await this.createExceptionQueries();

            // Step 4: Generate documentation
            await this.generateDocumentation();

            // Step 5: Save guardrail report
            this.saveGuardrailReport();

            console.log('\n✅ Guardrails implemented successfully!');
            console.log('═'.repeat(70));
            this.printSummary();

            return this.results;

        } catch (error) {
            console.error('\n❌ Guardrail implementation failed:', error.message);
            throw error;
        }
    }

    /**
     * Create external_sfdc_account_id property with unique constraint
     */
    async createExternalAccountIdProperty() {
        console.log('📝 Creating external_sfdc_account_id property...');

        if (this.dryRun) {
            console.log('  [DRY RUN] Would create property with unique constraint');
            this.results.propertyCreated = true;
            return;
        }

        try {
            const propertyDefinition = {
                name: 'external_sfdc_account_id',
                label: 'External Salesforce Account ID',
                type: 'string',
                fieldType: 'text',
                groupName: 'companyinformation',
                description: 'Unique Salesforce Account ID - prevents duplicate company creation',
                hasUniqueValue: true, // CRITICAL: Enforces uniqueness
                hidden: false,
                displayOrder: -1
            };

            await this.createHubSpotProperty(propertyDefinition);

            this.results.propertyCreated = true;
            console.log('  ✅ Property created with unique constraint');

        } catch (error) {
            if (error.message.includes('already exists')) {
                console.log('  ✅ Property already exists');
                this.results.propertyCreated = true;
            } else {
                console.error(`  ❌ Failed to create property: ${error.message}`);
                throw error;
            }
        }
    }

    /**
     * Create HubSpot property
     */
    createHubSpotProperty(propertyDef) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.hubapi.com',
                path: '/crm/v3/properties/companies',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.hubspot.accessToken}`,
                    'Content-Type': 'application/json'
                }
            };

            const requestBody = JSON.stringify(propertyDef);

            let data = '';
            const req = https.request(options, (res) => {
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200 || res.statusCode === 201) {
                        resolve(JSON.parse(data));
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(requestBody);
            req.end();
        });
    }

    /**
     * Populate external_sfdc_account_id values
     */
    async populateExternalAccountIds() {
        console.log('\n📊 Populating external_sfdc_account_id values...');

        try {
            // Step 1: Query companies needing population
            console.log('  📡 Querying companies with salesforceaccountid...');
            const companies = await this.queryCompaniesNeedingPopulation();

            if (companies.length === 0) {
                console.log('  ✅ All companies already have external_sfdc_account_id populated');
                return;
            }

            console.log(`  Found ${companies.length} companies needing population`);

            if (this.dryRun) {
                console.log(`  [DRY RUN] Would update ${companies.length} companies`);
                companies.slice(0, 5).forEach(company => {
                    console.log(`    - ${company.properties.name || 'Unnamed'}: ${company.properties.salesforceaccountid} → external_sfdc_account_id`);
                });
                if (companies.length > 5) {
                    console.log(`    ... and ${companies.length - 5} more`);
                }
                return;
            }

            // Step 2: Batch update via HubSpot API
            console.log('  🔄 Updating companies in batches...');
            const batchSize = 100;
            const batches = [];

            for (let i = 0; i < companies.length; i += batchSize) {
                batches.push(companies.slice(i, i + batchSize));
            }

            let updated = 0;
            let failed = 0;

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                console.log(`  [${i + 1}/${batches.length}] Processing batch of ${batch.length} companies...`);

                try {
                    const result = await this.batchUpdateCompanies(batch);
                    updated += result.updated;
                    failed += result.failed;

                    // Rate limiting (100 requests per 10 seconds)
                    if (i < batches.length - 1) {
                        await this.sleep(100); // Small delay between batches
                    }
                } catch (error) {
                    console.error(`  ⚠️  Batch ${i + 1} failed: ${error.message}`);
                    failed += batch.length;
                    // Continue processing remaining batches - graceful degradation in batch operation
                }
            }

            this.results.valuesPopulated = updated;
            console.log(`  ✅ Updated ${updated} companies`);
            if (failed > 0) {
                console.log(`  ⚠️  Failed to update ${failed} companies`);
            }

            // Add workflow recommendation for ongoing maintenance
            this.results.documentation.push({
                title: 'Ongoing External SFDC Account ID Maintenance',
                description: 'Create workflow to auto-populate for new SF-synced companies',
                manualStep: true,
                instructions: [
                    '1. Go to HubSpot → Automation → Workflows',
                    '2. Create company-based workflow',
                    '3. Enrollment trigger: salesforceaccountid is known AND external_sfdc_account_id is unknown',
                    '4. Action: Copy property value',
                    '5. From: salesforceaccountid → To: external_sfdc_account_id'
                ]
            });

        } catch (error) {
            console.error(`  ❌ Failed to populate values: ${error.message}`);
            throw error;
        }
    }

    /**
     * Query companies that need external_sfdc_account_id populated
     */
    async queryCompaniesNeedingPopulation() {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.hubapi.com',
                path: '/crm/v3/objects/companies/search',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.hubspot.accessToken}`,
                    'Content-Type': 'application/json'
                }
            };

            // Query: Companies with salesforceaccountid but no external_sfdc_account_id
            const searchRequest = {
                filterGroups: [
                    {
                        filters: [
                            {
                                propertyName: 'salesforceaccountid',
                                operator: 'HAS_PROPERTY'
                            },
                            {
                                propertyName: 'external_sfdc_account_id',
                                operator: 'NOT_HAS_PROPERTY'
                            }
                        ]
                    }
                ],
                properties: ['name', 'salesforceaccountid', 'external_sfdc_account_id'],
                limit: 100
            };

            const requestBody = JSON.stringify(searchRequest);

            let data = '';
            const req = https.request(options, (res) => {
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        const parsed = JSON.parse(data);
                        resolve(parsed.results || []);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(requestBody);
            req.end();
        });
    }

    /**
     * Batch update companies
     */
    async batchUpdateCompanies(companies) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.hubapi.com',
                path: '/crm/v3/objects/companies/batch/update',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.hubspot.accessToken}`,
                    'Content-Type': 'application/json'
                }
            };

            // Build batch update inputs
            const inputs = companies.map(company => ({
                id: company.id,
                properties: {
                    external_sfdc_account_id: company.properties.salesforceaccountid
                }
            }));

            const requestBody = JSON.stringify({ inputs });

            let data = '';
            const req = https.request(options, (res) => {
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200 || res.statusCode === 201) {
                        const parsed = JSON.parse(data);
                        resolve({
                            updated: parsed.results?.length || 0,
                            failed: 0
                        });
                    } else {
                        // Parse partial success
                        try {
                            const parsed = JSON.parse(data);
                            resolve({
                                updated: parsed.results?.length || 0,
                                failed: inputs.length - (parsed.results?.length || 0)
                            });
                        } catch (e) {
                            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                        }
                    }
                });
            });

            req.on('error', reject);
            req.write(requestBody);
            req.end();
        });
    }

    /**
     * Sleep helper for rate limiting
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Create exception queries for monitoring
     */
    async createExceptionQueries() {
        console.log('\n🔍 Creating exception queries for monitoring...');

        // Verify property exists before creating queries
        if (!this.dryRun) {
            try {
                await this.verifyPropertyExists('external_sfdc_account_id');
                console.log('  ✅ Property verified, proceeding with query definitions');
            } catch (error) {
                console.log(`  ⚠️  Property verification failed: ${error.message}`);
                console.log('  Continuing with query creation (will work once property is created)');
            }
        }

        const queries = [
            {
                name: 'Duplicate SF Account IDs',
                description: 'Companies sharing the same external_sfdc_account_id (should be zero)',
                listType: 'DYNAMIC',
                filterGroups: [
                    {
                        filters: [
                            {
                                propertyName: 'external_sfdc_account_id',
                                operator: 'HAS_PROPERTY'
                            }
                        ]
                    }
                ],
                severity: 'critical',
                expectedCount: 0,
                hubspotInstructions: [
                    '1. Go to HubSpot → Contacts → Lists → Create list',
                    '2. Select "Company-based"',
                    '3. Add filter: "External Salesforce Account ID" is known',
                    '4. Group by external_sfdc_account_id (requires manual review for duplicates)',
                    '5. Name: "⚠️ Duplicate SF Account IDs"',
                    '6. Set alert for count > 0'
                ]
            },
            {
                name: 'Missing External Account ID',
                description: 'Companies with salesforceaccountid but no external_sfdc_account_id',
                listType: 'DYNAMIC',
                filterGroups: [
                    {
                        filters: [
                            {
                                propertyName: 'salesforceaccountid',
                                operator: 'HAS_PROPERTY'
                            },
                            {
                                propertyName: 'external_sfdc_account_id',
                                operator: 'NOT_HAS_PROPERTY'
                            }
                        ]
                    }
                ],
                severity: 'warning',
                expectedCount: 0,
                hubspotInstructions: [
                    '1. Go to HubSpot → Contacts → Lists → Create list',
                    '2. Select "Company-based"',
                    '3. Add filters:',
                    '   - "Salesforce Account ID" is known',
                    '   - "External Salesforce Account ID" is unknown',
                    '4. Name: "⚠️ Missing External Account ID"',
                    '5. Set alert for count > 10'
                ]
            },
            {
                name: 'Mismatched Account IDs',
                description: 'Companies where salesforceaccountid != external_sfdc_account_id',
                listType: 'DYNAMIC',
                filterGroups: [
                    {
                        filters: [
                            {
                                propertyName: 'salesforceaccountid',
                                operator: 'HAS_PROPERTY'
                            },
                            {
                                propertyName: 'external_sfdc_account_id',
                                operator: 'HAS_PROPERTY'
                            }
                        ]
                    }
                ],
                severity: 'warning',
                expectedCount: 0,
                note: 'Requires manual review - HubSpot cannot compare two properties directly in list filters',
                hubspotInstructions: [
                    '1. Go to HubSpot → Contacts → Lists → Create list',
                    '2. Select "Company-based"',
                    '3. Add filters:',
                    '   - "Salesforce Account ID" is known',
                    '   - "External Salesforce Account ID" is known',
                    '4. Name: "⚠️ Potential Mismatched Account IDs"',
                    '5. Export and manually compare values in CSV',
                    '6. Alternative: Use workflow to flag mismatches with custom property'
                ]
            }
        ];

        console.log(`  Defined ${queries.length} exception queries:`);

        queries.forEach(query => {
            console.log(`    - ${query.name} (${query.severity}): ${query.description}`);
            this.results.exceptionsCreated.push(query);
        });

        if (!this.dryRun) {
            // Save query definitions for manual creation in HubSpot
            const queriesPath = path.join(this.outputDir, 'exception-queries.json');
            fs.writeFileSync(queriesPath, JSON.stringify(queries, null, 2));
            console.log(`\n  ✅ Query definitions saved: ${queriesPath}`);

            // Save detailed setup guide
            const guidePath = path.join(this.outputDir, 'EXCEPTION_QUERIES_SETUP.md');
            this.generateExceptionQueryGuide(queries, guidePath);
            console.log(`  ✅ Setup guide saved: ${guidePath}`);

            console.log('\n  ⚠️  MANUAL STEP REQUIRED:');
            console.log('  These queries must be created in HubSpot UI (Lists cannot be fully automated via API)');
            console.log(`  See ${guidePath} for detailed instructions`);
        } else {
            console.log('  [DRY RUN] Would save query definitions and setup guide');
        }
    }

    /**
     * Verify property exists in HubSpot
     */
    async verifyPropertyExists(propertyName) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.hubapi.com',
                path: `/crm/v3/properties/companies/${propertyName}`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.hubspot.accessToken}`,
                    'Content-Type': 'application/json'
                }
            };

            const req = https.request(options, (res) => {
                if (res.statusCode === 200) {
                    resolve(true);
                } else if (res.statusCode === 404) {
                    reject(new Error(`Property ${propertyName} not found`));
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });

            req.on('error', reject);
            req.end();
        });
    }

    /**
     * Generate exception query setup guide
     */
    generateExceptionQueryGuide(queries, filePath) {
        const lines = [];

        lines.push('# Exception Query Setup Guide');
        lines.push('');
        lines.push('This guide provides step-by-step instructions for creating HubSpot lists to monitor for duplicate companies after deduplication.');
        lines.push('');
        lines.push('## Why Manual Setup?');
        lines.push('');
        lines.push('HubSpot\'s Lists API does not support programmatic creation of all list types, particularly:');
        lines.push('- Lists that group by property values (for duplicate detection)');
        lines.push('- Lists with complex property comparisons');
        lines.push('- Alert configurations');
        lines.push('');
        lines.push('Therefore, these lists must be created through the HubSpot UI.');
        lines.push('');

        queries.forEach((query, index) => {
            lines.push(`## ${index + 1}. ${query.name}`);
            lines.push('');
            lines.push(`**Description**: ${query.description}`);
            lines.push(`**Severity**: ${query.severity.toUpperCase()}`);
            lines.push(`**Expected Count**: ${query.expectedCount}`);
            lines.push('');

            if (query.note) {
                lines.push(`> ⚠️ **Note**: ${query.note}`);
                lines.push('');
            }

            lines.push('**Setup Instructions**:');
            lines.push('');
            query.hubspotInstructions.forEach(instruction => {
                lines.push(instruction);
            });
            lines.push('');

            lines.push('**Monitoring Recommendation**:');
            lines.push('');
            if (query.severity === 'critical') {
                lines.push('- Check daily');
                lines.push('- Set up Slack/email alert for any matches');
                lines.push('- Investigate immediately (same-day resolution)');
            } else {
                lines.push('- Check weekly');
                lines.push('- Set up alert for count > 10');
                lines.push('- Investigate within 48 hours');
            }
            lines.push('');
            lines.push('---');
            lines.push('');
        });

        lines.push('## Verification Checklist');
        lines.push('');
        lines.push('After creating all lists:');
        lines.push('');
        lines.push('- [ ] All 3 lists created in HubSpot');
        lines.push('- [ ] Alerts configured (Slack/email)');
        lines.push('- [ ] Initial counts documented');
        lines.push('- [ ] Monitoring schedule added to calendar');
        lines.push('- [ ] Team trained on alert response');
        lines.push('');

        fs.writeFileSync(filePath, lines.join('\n'));
    }

    /**
     * Generate documentation
     */
    async generateDocumentation() {
        console.log('\n📄 Generating documentation...');

        const docs = {
            autoAssociateSettings: {
                title: 'Auto-Associate Companies Setting',
                recommendation: 'Keep OFF to prevent duplicate creation',
                location: 'HubSpot → Settings → Objects → Companies → Auto-associate companies',
                rationale: 'When ON, HubSpot auto-creates companies based on domain, which can bypass unique constraints',
                tradeoff: 'Manual company creation required, but ensures data quality'
            },
            propertyUsage: {
                title: 'External SFDC Account ID Property',
                purpose: 'Enforce 1:1 mapping between SF Accounts and HS Companies',
                constraint: 'Unique - HubSpot rejects duplicate values',
                maintenance: 'Auto-populated via workflow when salesforceaccountid changes'
            },
            monitoring: {
                title: 'Duplicate Prevention Monitoring',
                schedule: 'Weekly review of exception queries',
                alerts: 'Set up notifications for critical exceptions',
                remediation: 'Investigate and resolve duplicates within 24 hours'
            }
        };

        // Save documentation
        const docsPath = path.join(this.outputDir, 'guardrails-documentation.json');
        fs.writeFileSync(docsPath, JSON.stringify(docs, null, 2));
        console.log(`  ✅ Documentation saved: ${docsPath}`);

        // Generate markdown guide
        const markdownPath = path.join(this.outputDir, 'GUARDRAILS_GUIDE.md');
        this.generateMarkdownGuide(docs, markdownPath);
        console.log(`  ✅ Markdown guide: ${markdownPath}`);

        this.results.documentation.push(...Object.values(docs));
    }

    /**
     * Generate markdown guide
     */
    generateMarkdownGuide(docs, filePath) {
        const lines = [];

        lines.push('# Deduplication Guardrails Guide');
        lines.push('');
        lines.push('## Overview');
        lines.push('');
        lines.push('This guide documents the guardrails implemented to prevent company duplicates from recurring after deduplication.');
        lines.push('');

        Object.entries(docs).forEach(([key, section]) => {
            lines.push(`## ${section.title}`);
            lines.push('');

            Object.entries(section).forEach(([prop, value]) => {
                if (prop !== 'title') {
                    const label = prop.charAt(0).toUpperCase() + prop.slice(1).replace(/([A-Z])/g, ' $1');
                    lines.push(`**${label}**: ${value}`);
                    lines.push('');
                }
            });
        });

        lines.push('## Maintenance Checklist');
        lines.push('');
        lines.push('- [ ] Weekly: Review exception queries for new duplicates');
        lines.push('- [ ] Monthly: Verify workflow is still active and working');
        lines.push('- [ ] Quarterly: Audit auto-associate setting (should be OFF)');
        lines.push('- [ ] Annually: Review and update guardrail documentation');
        lines.push('');

        lines.push('## Troubleshooting');
        lines.push('');
        lines.push('### Duplicate Companies Appearing');
        lines.push('1. Check auto-associate setting (should be OFF)');
        lines.push('2. Verify external_sfdc_account_id workflow is active');
        lines.push('3. Run exception queries to identify root cause');
        lines.push('4. Review recent API integrations that may bypass constraints');
        lines.push('');

        fs.writeFileSync(filePath, lines.join('\n'));
    }

    /**
     * Save guardrail report
     */
    saveGuardrailReport() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
        const reportPath = path.join(this.outputDir, `guardrails-report-${timestamp}.json`);

        const report = {
            timestamp: new Date().toISOString(),
            dryRun: this.dryRun,
            results: this.results,
            recommendations: [
                'Keep auto-associate companies OFF',
                'Review exception queries weekly',
                'Set up alerts for critical exceptions',
                'Document any manual workarounds'
            ]
        };

        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n💾 Report saved: ${reportPath}`);
    }

    /**
     * Print summary
     */
    printSummary() {
        console.log('\n📊 Guardrails Summary');
        console.log('─'.repeat(70));
        console.log(`Property Created: ${this.results.propertyCreated ? '✅' : '❌'}`);
        console.log(`Values Populated: ${this.results.valuesPopulated}`);
        console.log(`Exception Queries: ${this.results.exceptionsCreated.length}`);
        console.log(`Documentation Items: ${this.results.documentation.length}`);
        console.log('─'.repeat(70));
        console.log('\n⚠️  Next Steps:');
        console.log('1. Create exception queries in HubSpot (see exception-queries.json)');
        console.log('2. Create workflow to populate external_sfdc_account_id');
        console.log('3. Verify auto-associate setting is OFF');
        console.log('4. Set up monitoring alerts');
    }
}

// CLI Usage
if (require.main === module) {
    const ConfigLoader = require('./dedup-config-loader');

    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Deduplication Guardrails Manager (Phase 4)

Usage:
  node dedup-guardrail-manager.js <config-file> [--execute]

Arguments:
  config-file    Path to dedup-config.json

Options:
  --execute      Execute for real (without this, runs in DRY RUN mode)
  --help         Show this help message

Examples:
  # Dry run
  node dedup-guardrail-manager.js ./dedup-config.json

  # Live execution
  node dedup-guardrail-manager.js ./dedup-config.json --execute
        `);
        process.exit(0);
    }

    const configPath = args[0];
    const execute = args.includes('--execute');

    if (!fs.existsSync(configPath)) {
        console.error(`❌ Config file not found: ${configPath}`);
        process.exit(1);
    }

    (async () => {
        try {
            console.log('📋 Loading configuration...');
            const config = ConfigLoader.load(configPath);

            if (execute) {
                config.execution.dryRun = false;
            } else {
                config.execution.dryRun = true;
            }

            const manager = new GuardrailManager(config);
            const results = await manager.implement();

            console.log(`\n✅ Guardrails implementation complete`);
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

module.exports = GuardrailManager;
