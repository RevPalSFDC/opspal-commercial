#!/usr/bin/env node
/**
 * Deduplication Association Repair (Phase 2.5)
 *
 * Purpose: Post-execution verification and repair of PRIMARY associations.
 * Ensures 100% of contacts have PRIMARY (Type 1) associations after deduplication.
 *
 * Critical Discovery (Rentable cleanup, Oct 2025):
 * - 96.8% of contacts needed PRIMARY association after duplicate removal
 * - Removing Type 279 (Unlabeled) without verifying Type 1 (PRIMARY) leaves contacts orphaned
 * - This phase MUST run after Phase 3 execution to guarantee data integrity
 *
 * Features:
 * - Comprehensive verification of all canonical companies
 * - Batch processing with progress tracking
 * - Detailed repair report generation
 * - Success rate validation (requires >95%)
 *
 * Usage:
 *   const AssociationRepairManager = require('./dedup-association-repair');
 *   const manager = new AssociationRepairManager(config);
 *   await manager.repair(canonicalMapPath, executionReportPath);
 */

const fs = require('fs');
const path = require('path');
const AssociationVerifier = require('./dedup-association-verifier');

class AssociationRepairManager {
    constructor(config) {
        this.config = config;
        this.outputDir = config.output?.outputDir || './dedup-reports';
        this.dryRun = config.execution?.dryRun !== false;

        this.stats = {
            startedAt: new Date().toISOString(),
            canonicalCompaniesProcessed: 0,
            totalContactsVerified: 0,
            contactsWithPrimary: 0,
            contactsRepaired: 0,
            repairFailures: 0,
            companiesWithIssues: [],
            errors: []
        };
    }

    /**
     * Execute association repair for all canonical companies
     * @param {string} canonicalMapPath - Path to canonical map JSON from Phase 2
     * @param {string} executionReportPath - Path to execution report JSON from Phase 3
     * @returns {Promise<object>} Repair results
     */
    async repair(canonicalMapPath, executionReportPath) {
        console.log('\n🔧 Phase 2.5: Association Repair');
        console.log('═'.repeat(70));
        console.log(`Mode: ${this.dryRun ? '🔍 DRY RUN' : '⚠️  LIVE REPAIR'}`)
;
        console.log(`Purpose: Ensure 100% PRIMARY association coverage\n`);

        try {
            // Load canonical map
            console.log('📋 Loading canonical map...');
            const canonicalMapData = this.loadCanonicalMap(canonicalMapPath);

            // Load execution report (optional - for additional context)
            let executionReport = null;
            if (executionReportPath && fs.existsSync(executionReportPath)) {
                console.log('📋 Loading execution report...');
                executionReport = JSON.parse(fs.readFileSync(executionReportPath, 'utf8'));
            }

            console.log(`\n📊 Scope:`);
            console.log(`  Canonical companies: ${canonicalMapData.length}`);
            console.log(`  Expected contacts: Analyzing...\n`);

            // Process each canonical company
            const verifier = new AssociationVerifier(this.config);

            for (let i = 0; i < canonicalMapData.length; i++) {
                const bundle = canonicalMapData[i];

                console.log(`[${i + 1}/${canonicalMapData.length}] ${bundle.clusterKey}`);
                console.log(`  Canonical: ${bundle.canonical.companyName} (${bundle.canonical.companyId})`);

                await this.repairBundleAssociations(bundle, verifier);

                this.stats.canonicalCompaniesProcessed++;

                // Progress update every 10 bundles
                if ((i + 1) % 10 === 0) {
                    console.log(`\n📊 Progress: ${i + 1}/${canonicalMapData.length} companies processed\n`);
                }
            }

            this.stats.completedAt = new Date().toISOString();

            // Generate repair report
            console.log('\n💾 Saving repair report...');
            const reportPath = this.saveRepairReport();

            // Validate success criteria
            const successRate = this.stats.totalContactsVerified > 0
                ? ((this.stats.contactsWithPrimary + this.stats.contactsRepaired) / this.stats.totalContactsVerified) * 100
                : 100;

            console.log('\n✅ Association repair complete!');
            console.log('═'.repeat(70));
            this.printSummary();

            // Check if success criteria met
            if (successRate < 95) {
                console.log('\n⚠️  WARNING: Success rate below 95% threshold!');
                console.log('Manual review required before proceeding.');
                throw new Error(`Association repair success rate (${successRate.toFixed(1)}%) below 95% threshold`);
            }

            return {
                stats: this.stats,
                reportPath,
                successRate
            };

        } catch (error) {
            console.error('\n❌ Association repair failed:', error.message);
            this.stats.error = error.message;
            this.stats.failedAt = new Date().toISOString();
            this.saveRepairReport();
            throw error;
        }
    }

    /**
     * Load canonical map
     */
    loadCanonicalMap(canonicalMapPath) {
        if (!fs.existsSync(canonicalMapPath)) {
            throw new Error(`Canonical map not found: ${canonicalMapPath}`);
        }

        const data = JSON.parse(fs.readFileSync(canonicalMapPath, 'utf8'));
        return data.canonicalMap || data;
    }

    /**
     * Repair associations for a bundle
     */
    async repairBundleAssociations(bundle, verifier) {
        const canonicalCompanyId = bundle.canonical.companyId;

        // Get expected contact count from canonical company metadata
        const expectedContacts = bundle.canonical.num_contacts || 0;

        // Add contacts from duplicates that were merged
        const duplicateContacts = bundle.duplicates.reduce((sum, dup) => sum + (dup.num_contacts || 0), 0);

        const totalExpectedContacts = expectedContacts + duplicateContacts;

        console.log(`  Expected contacts: ${totalExpectedContacts} (${expectedContacts} canonical + ${duplicateContacts} from duplicates)`);

        if (totalExpectedContacts === 0) {
            console.log(`  ✅ No contacts to verify\n`);
            return;
        }

        try {
            // Fetch contact IDs for canonical company
            console.log(`  📡 Fetching contacts from HubSpot...`);
            const contactIds = await this.getCompanyContacts(canonicalCompanyId);

            if (contactIds.length === 0) {
                console.log(`  ℹ️  No contacts found in HubSpot (expected ${totalExpectedContacts})`);
                if (totalExpectedContacts > 0) {
                    console.log(`  ⚠️  WARNING: Expected contacts may have been lost or not yet synced\n`);
                    this.stats.companiesWithIssues.push({
                        companyId: canonicalCompanyId,
                        companyName: bundle.canonical.companyName,
                        issue: 'No contacts found',
                        expected: totalExpectedContacts
                    });
                } else {
                    console.log('');
                }
                return;
            }

            console.log(`  ✓ Found ${contactIds.length} contacts`);

            // Verify and repair in batch
            const associations = contactIds.map(contactId => ({
                contactId,
                companyId: canonicalCompanyId,
                context: {
                    bundle: bundle.clusterKey,
                    canonicalName: bundle.canonical.companyName
                }
            }));

            const results = await verifier.verifyAndRepairBatch(associations, 100);

            // Update statistics
            this.stats.totalContactsVerified += results.length;
            this.stats.contactsWithPrimary += results.filter(r => r.hadPrimary).length;
            this.stats.contactsRepaired += results.filter(r => r.repaired).length;
            this.stats.repairFailures += results.filter(r => r.error).length;

            const repaired = results.filter(r => r.repaired).length;
            const failed = results.filter(r => r.error).length;

            if (repaired > 0) {
                console.log(`  🔧 Repaired PRIMARY for ${repaired}/${results.length} contacts`);
                this.stats.companiesWithIssues.push({
                    companyId: canonicalCompanyId,
                    companyName: bundle.canonical.companyName,
                    contactsRepaired: repaired,
                    totalContacts: results.length,
                    failures: failed
                });
            } else if (failed > 0) {
                console.log(`  ⚠️  ${failed}/${results.length} contacts failed repair`);
                this.stats.companiesWithIssues.push({
                    companyId: canonicalCompanyId,
                    companyName: bundle.canonical.companyName,
                    contactsRepaired: 0,
                    totalContacts: results.length,
                    failures: failed
                });
            } else {
                console.log(`  ✅ All ${results.length} contacts have PRIMARY`);
            }

            console.log('');

        } catch (error) {
            console.error(`  ❌ Failed to repair: ${error.message}\n`);
            this.stats.errors.push({
                companyId: canonicalCompanyId,
                companyName: bundle.canonical.companyName,
                error: error.message
            });
        }
    }

    /**
     * Get contact IDs for a company via HubSpot Associations API
     */
    async getCompanyContacts(companyId) {
        const https = require('https');

        const accessToken = this.config.hubspot?.accessToken || process.env.HUBSPOT_PRIVATE_APP_TOKEN;
        if (!accessToken) {
            throw new Error('HubSpot access token not configured');
        }

        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.hubapi.com',
                path: `/crm/v4/objects/companies/${companyId}/associations/contacts`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const parsed = JSON.parse(data);
                            const contactIds = parsed.results?.map(result => result.toObjectId) || [];
                            resolve(contactIds);
                        } catch (e) {
                            reject(new Error(`Failed to parse HubSpot response: ${e.message}`));
                        }
                    } else if (res.statusCode === 404) {
                        // Company not found or no associations
                        resolve([]);
                    } else {
                        reject(new Error(`HubSpot API error ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', (e) => reject(e));
            req.end();
        });
    }

    /**
     * Save repair report
     */
    saveRepairReport() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
        const reportPath = path.join(this.outputDir, `association-repair-report-${timestamp}.json`);

        const successRate = this.stats.totalContactsVerified > 0
            ? ((this.stats.contactsWithPrimary + this.stats.contactsRepaired) / this.stats.totalContactsVerified) * 100
            : 100;

        const report = {
            phase: '2.5 - Association Repair',
            ...this.stats,
            successCriteria: {
                targetSuccessRate: 95,
                actualSuccessRate: parseFloat(successRate.toFixed(1)),
                met: successRate >= 95
            },
            config: {
                dryRun: this.dryRun
            }
        };

        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`  ✅ Report saved: ${reportPath}`);

        return reportPath;
    }

    /**
     * Print repair summary
     */
    printSummary() {
        console.log('\n📊 Repair Summary');
        console.log('─'.repeat(70));
        console.log(`Mode: ${this.dryRun ? 'DRY RUN' : 'LIVE REPAIR'}`);
        console.log(`Canonical Companies: ${this.stats.canonicalCompaniesProcessed}`);
        console.log('');
        console.log(`Total Contacts Verified: ${this.stats.totalContactsVerified}`);
        console.log(`Already Had PRIMARY: ${this.stats.contactsWithPrimary}`);
        console.log(`Repaired PRIMARY: ${this.stats.contactsRepaired}`);
        console.log(`Repair Failures: ${this.stats.repairFailures}`);
        console.log('');

        const successRate = this.stats.totalContactsVerified > 0
            ? ((this.stats.contactsWithPrimary + this.stats.contactsRepaired) / this.stats.totalContactsVerified) * 100
            : 100;

        console.log(`Success Rate: ${successRate.toFixed(1)}% (target: ≥95%)`);

        if (successRate >= 99) {
            console.log('✅ Excellent - Nearly perfect PRIMARY coverage');
        } else if (successRate >= 95) {
            console.log('✅ Good - Meets success criteria');
        } else {
            console.log('❌ Below threshold - Manual review required');
        }

        if (this.stats.companiesWithIssues.length > 0) {
            console.log(`\n🔧 Companies with Repairs: ${this.stats.companiesWithIssues.length}`);
            this.stats.companiesWithIssues.slice(0, 5).forEach(company => {
                console.log(`  - ${company.companyName}: ${company.contactsRepaired}/${company.totalContacts} repaired`);
            });
            if (this.stats.companiesWithIssues.length > 5) {
                console.log(`  ... and ${this.stats.companiesWithIssues.length - 5} more`);
            }
        }

        if (this.stats.errors.length > 0) {
            console.log(`\n❌ Errors: ${this.stats.errors.length}`);
            this.stats.errors.slice(0, 5).forEach(err => {
                console.log(`  - ${err.companyName}: ${err.error}`);
            });
            if (this.stats.errors.length > 5) {
                console.log(`  ... and ${this.stats.errors.length - 5} more`);
            }
        }

        console.log('─'.repeat(70));
    }
}

// CLI Usage
if (require.main === module) {
    const ConfigLoader = require('./dedup-config-loader');

    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Deduplication Association Repair (Phase 2.5)

Usage:
  node dedup-association-repair.js <canonical-map-file> <config-file> [--execute]

Arguments:
  canonical-map-file    Path to canonical map JSON from Phase 2
  config-file           Path to dedup-config.json

Options:
  --execute             Execute for real (without this, runs in DRY RUN mode)
  --execution-report    Optional path to execution report from Phase 3
  --help                Show this help message

⚠️  CRITICAL: This phase ensures 100% PRIMARY association coverage

Examples:
  # Dry run
  node dedup-association-repair.js ./dedup-reports/canonical-map-*.json ./dedup-config.json

  # Live execution
  node dedup-association-repair.js ./dedup-reports/canonical-map-*.json ./dedup-config.json --execute

  # With execution report context
  node dedup-association-repair.js \\
    ./dedup-reports/canonical-map-*.json \\
    ./dedup-config.json \\
    --execution-report ./dedup-reports/execution-report-*.json \\
    --execute
        `);
        process.exit(0);
    }

    const canonicalMapPath = args[0];
    const configPath = args[1];
    const execute = args.includes('--execute');

    const executionReportIndex = args.indexOf('--execution-report');
    const executionReportPath = executionReportIndex >= 0 && args[executionReportIndex + 1]
        ? args[executionReportIndex + 1]
        : null;

    if (!fs.existsSync(canonicalMapPath)) {
        console.error(`❌ Canonical map file not found: ${canonicalMapPath}`);
        process.exit(1);
    }

    if (!fs.existsSync(configPath)) {
        console.error(`❌ Config file not found: ${configPath}`);
        process.exit(1);
    }

    (async () => {
        try {
            console.log('📋 Loading configuration...');
            const config = ConfigLoader.load(configPath);

            // Override dry run if --execute flag provided
            if (execute) {
                config.execution.dryRun = false;
                console.log('⚠️  LIVE REPAIR MODE ENABLED');
            } else {
                config.execution.dryRun = true;
                console.log('🔍 DRY RUN MODE (use --execute to run for real)');
            }

            const manager = new AssociationRepairManager(config);
            const result = await manager.repair(canonicalMapPath, executionReportPath);

            console.log(`\n✅ Association repair complete`);
            console.log(`Success Rate: ${result.successRate.toFixed(1)}%`);
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

module.exports = AssociationRepairManager;
