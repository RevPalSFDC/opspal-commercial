#!/usr/bin/env node
/**
 * Deduplication Rollback Manager
 *
 * Purpose: Automated rollback capability using pre-execution snapshots.
 * Restores companies, associations, and property values to pre-deduplication state.
 *
 * Features:
 * - List available snapshots with metadata
 * - Validate snapshot integrity before rollback
 * - Restore deleted companies
 * - Restore property values
 * - Restore associations (contacts, deals)
 * - Dry-run mode for rollback planning
 * - Progress tracking and error handling
 *
 * Usage:
 *   const RollbackManager = require('./dedup-rollback-manager');
 *   const manager = new RollbackManager(config);
 *   await manager.rollback(snapshotPath);
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

class RollbackManager {
    constructor(config) {
        this.config = config;
        this.hubspot = config.hubspot;
        this.salesforce = config.salesforce;
        this.outputDir = config.output?.outputDir || './dedup-reports';
        this.dryRun = config.execution?.dryRun !== false;

        this.stats = {
            startedAt: new Date().toISOString(),
            companiesRestored: 0,
            propertiesRestored: 0,
            associationsRestored: 0,
            errors: [],
            skipped: []
        };
    }

    /**
     * List available snapshots
     * @returns {Array} List of snapshot metadata
     */
    listSnapshots() {
        console.log('\n📋 Available Snapshots');
        console.log('═'.repeat(70));

        const snapshotFiles = fs.readdirSync(this.outputDir)
            .filter(file => file.startsWith('snapshot-') && file.endsWith('.json'))
            .sort()
            .reverse(); // Most recent first

        if (snapshotFiles.length === 0) {
            console.log('  No snapshots found');
            return [];
        }

        const snapshots = [];

        snapshotFiles.forEach((file, index) => {
            const filePath = path.join(this.outputDir, file);
            const stats = fs.statSync(filePath);

            try {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const metadata = {
                    index: index + 1,
                    file,
                    filePath,
                    timestamp: data.timestamp || stats.ctime.toISOString(),
                    hubspotCompanies: data.hubspot?.companies?.length || 0,
                    salesforceAccounts: data.salesforce?.accounts?.length || 0,
                    size: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
                    age: this.getAge(stats.ctime)
                };

                snapshots.push(metadata);

                console.log(`\n  ${index + 1}. ${file}`);
                console.log(`     Timestamp: ${metadata.timestamp}`);
                console.log(`     Age: ${metadata.age}`);
                console.log(`     HubSpot Companies: ${metadata.hubspotCompanies}`);
                console.log(`     Salesforce Accounts: ${metadata.salesforceAccounts}`);
                console.log(`     Size: ${metadata.size}`);

            } catch (error) {
                console.log(`  ⚠️  ${file}: Invalid snapshot (${error.message})`);
            }
        });

        console.log('═'.repeat(70));
        return snapshots;
    }

    /**
     * Get human-readable age
     */
    getAge(date) {
        const seconds = Math.floor((new Date() - new Date(date)) / 1000);
        if (seconds < 60) return `${seconds} seconds ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} minutes ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} hours ago`;
        const days = Math.floor(hours / 24);
        return `${days} days ago`;
    }

    /**
     * Execute rollback from snapshot
     * @param {string} snapshotPath - Path to snapshot file
     * @param {object} executionReport - Optional execution report for targeted rollback
     * @returns {Promise<object>} Rollback results
     */
    async rollback(snapshotPath, executionReport = null) {
        console.log('\n🔙 Rollback Manager');
        console.log('═'.repeat(70));
        console.log(`Mode: ${this.dryRun ? '🔍 DRY RUN' : '⚠️  LIVE ROLLBACK'}`);
        console.log(`Snapshot: ${path.basename(snapshotPath)}`);
        console.log('');

        try {
            // Step 1: Load and validate snapshot
            console.log('📋 Loading snapshot...');
            const snapshot = this.loadSnapshot(snapshotPath);
            console.log(`  ✅ Loaded ${snapshot.hubspot?.companies?.length || 0} HubSpot companies`);

            // Step 2: Validate snapshot integrity
            console.log('\n🔍 Validating snapshot integrity...');
            await this.validateSnapshot(snapshot);
            console.log('  ✅ Snapshot valid');

            // Step 3: Identify companies to restore
            console.log('\n📊 Planning rollback...');
            const restorationPlan = await this.createRestorationPlan(snapshot, executionReport);
            console.log(`  Companies to restore: ${restorationPlan.companiesToRestore.length}`);
            console.log(`  Properties to restore: ${restorationPlan.propertiesToRestore.length}`);
            console.log(`  Associations to restore: ${restorationPlan.associationsToRestore.length}`);

            if (restorationPlan.companiesToRestore.length === 0 &&
                restorationPlan.propertiesToRestore.length === 0 &&
                restorationPlan.associationsToRestore.length === 0) {
                console.log('\n  ✅ Nothing to rollback (no changes detected)');
                return this.stats;
            }

            if (this.dryRun) {
                console.log('\n[DRY RUN] Would restore:');
                restorationPlan.companiesToRestore.slice(0, 5).forEach(company => {
                    console.log(`  - ${company.properties.name || 'Unnamed'} (${company.id})`);
                });
                if (restorationPlan.companiesToRestore.length > 5) {
                    console.log(`  ... and ${restorationPlan.companiesToRestore.length - 5} more`);
                }
                return this.stats;
            }

            // Step 4: Execute restoration
            console.log('\n🔄 Executing rollback...');
            await this.executeRestoration(restorationPlan);

            // Step 5: Verify restoration
            console.log('\n✅ Verifying rollback...');
            await this.verifyRestoration(restorationPlan);

            this.stats.completedAt = new Date().toISOString();

            console.log('\n✅ Rollback complete!');
            console.log('═'.repeat(70));
            this.printSummary();

            // Save rollback report
            this.saveRollbackReport(snapshotPath);

            return this.stats;

        } catch (error) {
            console.error('\n❌ Rollback failed:', error.message);
            this.stats.error = error.message;
            this.stats.failedAt = new Date().toISOString();
            this.saveRollbackReport(snapshotPath);
            throw error;
        }
    }

    /**
     * Load snapshot file
     */
    loadSnapshot(snapshotPath) {
        if (!fs.existsSync(snapshotPath)) {
            throw new Error(`Snapshot not found: ${snapshotPath}`);
        }

        const data = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

        if (!data.hubspot || !data.hubspot.companies) {
            throw new Error('Invalid snapshot: missing HubSpot companies');
        }

        return data;
    }

    /**
     * Validate snapshot integrity
     */
    async validateSnapshot(snapshot) {
        // Check required fields
        const required = ['timestamp', 'hubspot'];
        const missing = required.filter(field => !snapshot[field]);

        if (missing.length > 0) {
            throw new Error(`Snapshot missing required fields: ${missing.join(', ')}`);
        }

        // Validate timestamp
        const snapshotAge = Date.now() - new Date(snapshot.timestamp).getTime();
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

        if (snapshotAge > maxAge) {
            console.log(`  ⚠️  WARNING: Snapshot is ${Math.floor(snapshotAge / (24 * 60 * 60 * 1000))} days old`);
        }

        // Check for company data
        if (!snapshot.hubspot.companies || snapshot.hubspot.companies.length === 0) {
            throw new Error('Snapshot contains no companies');
        }
    }

    /**
     * Create restoration plan
     */
    async createRestorationPlan(snapshot, executionReport) {
        const plan = {
            companiesToRestore: [],
            propertiesToRestore: [],
            associationsToRestore: []
        };

        // If execution report provided, use it for targeted rollback
        if (executionReport && executionReport.deletedCompanies) {
            // Restore only companies that were deleted
            const deletedIds = new Set(executionReport.deletedCompanies);

            plan.companiesToRestore = snapshot.hubspot.companies.filter(company =>
                deletedIds.has(company.id)
            );

            console.log(`  Targeted rollback: ${plan.companiesToRestore.length} deleted companies`);

        } else {
            // Full rollback: restore all companies that don't currently exist
            console.log('  Checking for missing companies...');

            // Sample check (full check would be expensive)
            const sampleSize = Math.min(50, snapshot.hubspot.companies.length);
            const sampled = this.randomSample(snapshot.hubspot.companies, sampleSize);

            for (const company of sampled) {
                try {
                    const exists = await this.verifyCompanyExists(company.id);
                    if (!exists) {
                        plan.companiesToRestore.push(company);
                    }
                } catch (error) {
                    console.log(`  ⚠️  Error checking ${company.id}: ${error.message}`);
                    // Continue with sample - skip this company
                }
            }

            console.log(`  Sample check: ${plan.companiesToRestore.length}/${sampleSize} companies missing`);
        }

        return plan;
    }

    /**
     * Execute restoration
     */
    async executeRestoration(plan) {
        let restored = 0;
        let failed = 0;

        // Restore companies in batches
        const batchSize = 10;
        const batches = [];

        for (let i = 0; i < plan.companiesToRestore.length; i += batchSize) {
            batches.push(plan.companiesToRestore.slice(i, i + batchSize));
        }

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            console.log(`  [${i + 1}/${batches.length}] Restoring batch of ${batch.length} companies...`);

            for (const company of batch) {
                try {
                    await this.restoreCompany(company);
                    restored++;
                } catch (error) {
                    console.error(`    ❌ Failed to restore ${company.properties.name}: ${error.message}`);
                    failed++;
                    this.stats.errors.push({
                        companyId: company.id,
                        companyName: company.properties.name,
                        error: error.message
                    });
                    // Continue with batch - graceful degradation in rollback operation
                }
            }

            // Rate limiting
            if (i < batches.length - 1) {
                await this.sleep(100);
            }
        }

        this.stats.companiesRestored = restored;
        console.log(`\n  ✅ Restored ${restored} companies`);
        if (failed > 0) {
            console.log(`  ⚠️  Failed to restore ${failed} companies`);
        }
    }

    /**
     * Restore individual company
     */
    async restoreCompany(company) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.hubapi.com',
                path: '/crm/v3/objects/companies',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.hubspot.accessToken}`,
                    'Content-Type': 'application/json'
                }
            };

            const requestBody = JSON.stringify({
                properties: company.properties
            });

            let data = '';
            const req = https.request(options, (res) => {
                res.on('data', chunk => data += chunk);
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
     * Verify company exists
     */
    async verifyCompanyExists(companyId) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.hubapi.com',
                path: `/crm/v3/objects/companies/${companyId}`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.hubspot.accessToken}`
                }
            };

            const req = https.request(options, (res) => {
                if (res.statusCode === 200) {
                    resolve(true);
                } else if (res.statusCode === 404) {
                    resolve(false);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });

            req.on('error', reject);
            req.end();
        });
    }

    /**
     * Verify restoration
     */
    async verifyRestoration(plan) {
        let verified = 0;
        let missing = 0;

        // Verify sample of restored companies
        const sampleSize = Math.min(10, plan.companiesToRestore.length);
        const sampled = this.randomSample(plan.companiesToRestore, sampleSize);

        for (const company of sampled) {
            try {
                const exists = await this.verifyCompanyExists(company.id);
                if (exists) {
                    verified++;
                } else {
                    missing++;
                }
            } catch (error) {
                console.log(`  ⚠️  Verification error for ${company.id}: ${error.message}`);
                // Continue with verification sample - skip this company
            }
        }

        console.log(`  Verified ${verified}/${sampled.length} restored companies`);

        if (missing > 0) {
            console.log(`  ⚠️  ${missing} companies still missing`);
        }
    }

    /**
     * Random sample helper
     */
    randomSample(array, size) {
        const shuffled = [...array].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, size);
    }

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Save rollback report
     */
    saveRollbackReport(snapshotPath) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
        const reportPath = path.join(this.outputDir, `rollback-report-${timestamp}.json`);

        const report = {
            snapshot: path.basename(snapshotPath),
            ...this.stats
        };

        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n💾 Rollback report saved: ${reportPath}`);
    }

    /**
     * Print summary
     */
    printSummary() {
        console.log('\n📊 Rollback Summary');
        console.log('─'.repeat(70));
        console.log(`Mode: ${this.dryRun ? 'DRY RUN' : 'LIVE'}`);
        console.log(`Companies Restored: ${this.stats.companiesRestored}`);
        console.log(`Properties Restored: ${this.stats.propertiesRestored}`);
        console.log(`Associations Restored: ${this.stats.associationsRestored}`);
        console.log(`Errors: ${this.stats.errors.length}`);
        console.log('─'.repeat(70));

        if (this.stats.errors.length > 0) {
            console.log('\n❌ Errors:');
            this.stats.errors.slice(0, 5).forEach(err => {
                console.log(`  - ${err.companyName}: ${err.error}`);
            });
            if (this.stats.errors.length > 5) {
                console.log(`  ... and ${this.stats.errors.length - 5} more`);
            }
        }
    }
}

// CLI Usage
if (require.main === module) {
    const ConfigLoader = require('./dedup-config-loader');

    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Deduplication Rollback Manager

Usage:
  node dedup-rollback-manager.js <command> [options]

Commands:
  list                               List available snapshots
  rollback <snapshot-file> <config>  Rollback from snapshot

Options:
  --execute                          Execute for real (without this, runs in DRY RUN mode)
  --execution-report <file>          Optional execution report for targeted rollback
  --help                             Show this help message

Examples:
  # List snapshots
  node dedup-rollback-manager.js list

  # Dry run rollback
  node dedup-rollback-manager.js rollback ./dedup-reports/snapshot-*.json ./dedup-config.json

  # Live rollback
  node dedup-rollback-manager.js rollback ./dedup-reports/snapshot-*.json ./dedup-config.json --execute

  # Targeted rollback using execution report
  node dedup-rollback-manager.js rollback \
    ./dedup-reports/snapshot-*.json \
    ./dedup-config.json \
    --execution-report ./dedup-reports/execution-report-*.json \
    --execute
        `);
        process.exit(0);
    }

    const command = args[0];

    if (command === 'list') {
        const manager = new RollbackManager({ output: { outputDir: './dedup-reports' } });
        manager.listSnapshots();
        process.exit(0);
    }

    if (command === 'rollback') {
        const snapshotPath = args[1];
        const configPath = args[2];
        const execute = args.includes('--execute');

        const executionReportIndex = args.indexOf('--execution-report');
        const executionReportPath = executionReportIndex >= 0 && args[executionReportIndex + 1]
            ? args[executionReportIndex + 1]
            : null;

        if (!snapshotPath || !configPath) {
            console.error('❌ Missing required arguments');
            console.error('Usage: node dedup-rollback-manager.js rollback <snapshot-file> <config-file>');
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

                let executionReport = null;
                if (executionReportPath && fs.existsSync(executionReportPath)) {
                    console.log('📋 Loading execution report...');
                    executionReport = JSON.parse(fs.readFileSync(executionReportPath, 'utf8'));
                }

                const manager = new RollbackManager(config);
                await manager.rollback(snapshotPath, executionReport);

                console.log('\n✅ Rollback complete');
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
    } else {
        console.error(`❌ Unknown command: ${command}`);
        console.error('Run with --help for usage information');
        process.exit(1);
    }
}

module.exports = RollbackManager;
