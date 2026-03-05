#!/usr/bin/env node

/**
 * Procedure B: Entity Separation (Type 1 - Different Entities, Semi-Automatic)
 *
 * Separates two different entities that were incorrectly merged.
 * Uses semi-automatic contact migration by email domain.
 *
 * Example: Two different Housing Authorities in same city were merged.
 * Solution: Undelete merged record + migrate contacts by email domain (with approval).
 *
 * Usage:
 *   node procedure-b-entity-separation.js <org-alias> <survivor-id> [--auto-approve] [--dry-run]
 *
 * @author Claude Code
 * @version 1.0.0
 * @date 2025-10-16
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

class ProcedureBEntitySeparation {
    constructor(orgAlias, survivorId, options = {}) {
        this.orgAlias = orgAlias;
        this.survivorId = survivorId;
        this.options = options;

        this.survivorRecord = null;
        this.deletedRecord = null;
        this.contactGroups = {};
        this.migrationPlan = [];
    }

    log(message, level = 'INFO') {
        const prefix = {
            'INFO': '✓',
            'WARN': '⚠',
            'ERROR': '✗',
            'SUCCESS': '✅'
        }[level] || 'ℹ';
        console.log(`${prefix} ${message}`);
    }

    /**
     * Execute SOQL query via Salesforce CLI
     */
    executeSoqlQuery(query, includeDeleted = false) {
        try {
            const deletedFlag = includeDeleted ? '--all-rows' : '';
            const cmd = `sf data query --query "${query.replace(/"/g, '\\"')}" --json --target-org ${this.orgAlias} ${deletedFlag}`;
            const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
            return JSON.parse(result);
        } catch (error) {
            this.log(`Query failed: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    /**
     * Step 1: Query deleted record
     */
    async queryDeletedRecord() {
        this.log('Querying deleted record...', 'INFO');

        const query = `SELECT Id, Name, IsDeleted, MasterRecordId, Website, BillingCity, BillingState FROM Account WHERE IsDeleted = true AND MasterRecordId = '${this.survivorId}' ALL ROWS`;

        try {
            const result = this.executeSoqlQuery(query, true);

            if (!result.result || !result.result.records || result.result.records.length === 0) {
                throw new Error(`No deleted record found with MasterRecordId = ${this.survivorId}`);
            }

            if (result.result.records.length > 1) {
                this.log(`Found ${result.result.records.length} deleted records. Using most recent.`, 'WARN');
            }

            this.deletedRecord = result.result.records.sort((a, b) =>
                new Date(b.LastModifiedDate) - new Date(a.LastModifiedDate)
            )[0];

            this.log(`Found deleted record: ${this.deletedRecord.Name} (${this.deletedRecord.Id})`, 'SUCCESS');

        } catch (error) {
            this.log(`Failed to query deleted record: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    /**
     * Step 2: Query survivor record
     */
    async querySurvivorRecord() {
        this.log('Querying survivor record...', 'INFO');

        const query = `SELECT Id, Name, Website, BillingCity, BillingState FROM Account WHERE Id = '${this.survivorId}'`;

        try {
            const result = this.executeSoqlQuery(query);

            if (!result.result || !result.result.records || result.result.records.length === 0) {
                throw new Error(`Survivor record not found: ${this.survivorId}`);
            }

            this.survivorRecord = result.result.records[0];
            this.log(`Found survivor record: ${this.survivorRecord.Name} (${this.survivorRecord.Id})`, 'SUCCESS');

        } catch (error) {
            this.log(`Failed to query survivor record: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    /**
     * Step 3: Undelete merged record
     */
    async undeleteRecord() {
        this.log('Undeleting merged record...', 'INFO');

        if (this.options.dryRun) {
            this.log('DRY RUN: Skipping actual undelete', 'WARN');
            return;
        }

        try {
            // Use Salesforce CLI to undelete
            const cmd = `sf data delete record --sobject Account --record-id ${this.deletedRecord.Id} --undelete --json --target-org ${this.orgAlias}`;
            const result = execSync(cmd, { encoding: 'utf8' });

            this.log(`Record undeleted successfully: ${this.deletedRecord.Name}`, 'SUCCESS');

        } catch (error) {
            // Try alternative REST API approach
            this.log('CLI undelete failed, trying REST API...', 'WARN');

            try {
                const restCmd = `sf data create record --sobject Account --values "Id='${this.deletedRecord.Id}'" --use-tooling-api --json --target-org ${this.orgAlias}`;
                execSync(restCmd, { encoding: 'utf8' });

                this.log(`Record undeleted via REST API: ${this.deletedRecord.Name}`, 'SUCCESS');

            } catch (restError) {
                this.log(`Undelete failed: ${restError.message}`, 'ERROR');
                this.log('MANUAL ACTION REQUIRED:', 'ERROR');
                this.log(`1. Open ${this.orgAlias}`, 'INFO');
                this.log(`2. Go to Recycle Bin`, 'INFO');
                this.log(`3. Find and undelete: ${this.deletedRecord.Name} (${this.deletedRecord.Id})`, 'INFO');
                throw new Error('Manual undelete required');
            }
        }
    }

    /**
     * Step 4: Query all child records (Contacts, Opportunities, Cases)
     */
    async queryChildRecords() {
        this.log('Querying child records...', 'INFO');

        // Query Contacts
        const contactQuery = `SELECT Id, Name, Email, AccountId, Title, Phone FROM Contact WHERE AccountId = '${this.survivorId}'`;
        const contactResult = this.executeSoqlQuery(contactQuery);
        const contacts = contactResult.result.records || [];

        // Query Opportunities
        const oppQuery = `SELECT Id, Name, AccountId, StageName, Amount FROM Opportunity WHERE AccountId = '${this.survivorId}'`;
        const oppResult = this.executeSoqlQuery(oppQuery);
        const opportunities = oppResult.result.records || [];

        // Query Cases
        const caseQuery = `SELECT Id, CaseNumber, AccountId, Subject, Status FROM Case WHERE AccountId = '${this.survivorId}'`;
        const caseResult = this.executeSoqlQuery(caseQuery);
        const cases = caseResult.result.records || [];

        this.log(`Found ${contacts.length} Contacts, ${opportunities.length} Opportunities, ${cases.length} Cases`, 'SUCCESS');

        return { contacts, opportunities, cases };
    }

    /**
     * Step 5: Group contacts by email domain
     */
    async groupContactsByDomain(contacts) {
        this.log('Grouping contacts by email domain...', 'INFO');

        for (const contact of contacts) {
            if (!contact.Email) {
                if (!this.contactGroups['__NO_EMAIL__']) {
                    this.contactGroups['__NO_EMAIL__'] = [];
                }
                this.contactGroups['__NO_EMAIL__'].push(contact);
                continue;
            }

            const domain = this.extractDomain(contact.Email);
            if (!this.contactGroups[domain]) {
                this.contactGroups[domain] = [];
            }
            this.contactGroups[domain].push(contact);
        }

        const domainCount = Object.keys(this.contactGroups).length;
        this.log(`Grouped into ${domainCount} email domain(s)`, 'SUCCESS');

        return this.contactGroups;
    }

    /**
     * Extract domain from email
     */
    extractDomain(email) {
        const match = email.match(/@(.+)$/);
        return match ? match[1].toLowerCase() : 'unknown';
    }

    /**
     * Step 6: Show contact groupings and get approval
     */
    async getContactMigrationApproval() {
        console.log('\n' + '═'.repeat(70));
        console.log('CONTACT MIGRATION PLAN (Semi-Automatic)');
        console.log('═'.repeat(70));

        console.log(`\nSurvivor Account: ${this.survivorRecord.Name} (${this.survivorId})`);
        console.log(`Undeleted Account: ${this.deletedRecord.Name} (${this.deletedRecord.Id})`);

        console.log('\n' + '─'.repeat(70));
        console.log('CONTACTS GROUPED BY EMAIL DOMAIN');
        console.log('─'.repeat(70));

        let groupNumber = 1;
        for (const [domain, contacts] of Object.entries(this.contactGroups)) {
            const displayDomain = domain === '__NO_EMAIL__' ? 'No Email' : domain;
            console.log(`\n${groupNumber}. Domain: ${displayDomain} (${contacts.length} contact${contacts.length !== 1 ? 's' : ''})`);

            for (const contact of contacts.slice(0, 5)) { // Show first 5
                console.log(`   - ${contact.Name} (${contact.Email || 'no email'}) - ${contact.Title || 'No Title'}`);
            }

            if (contacts.length > 5) {
                console.log(`   ... and ${contacts.length - 5} more`);
            }

            groupNumber++;
        }

        console.log('\n' + '═'.repeat(70));

        // If auto-approve, use default strategy
        if (this.options.autoApprove) {
            this.log('AUTO-APPROVE: Using default migration strategy', 'WARN');
            await this.applyDefaultMigrationStrategy();
            return;
        }

        // Interactive approval
        await this.interactiveContactMigration();
    }

    /**
     * Apply default migration strategy (for auto-approve)
     */
    async applyDefaultMigrationStrategy() {
        // Strategy: Leave all contacts on survivor by default
        // User can manually review and reassign specific contacts later

        this.log('Default strategy: All contacts remain on survivor account', 'INFO');
        this.log('Opportunities and Cases require manual review', 'WARN');

        // Generate manual review guide
        this.generateManualReviewGuide();
    }

    /**
     * Interactive contact migration
     */
    async interactiveContactMigration() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const question = (query) => new Promise(resolve => rl.question(query, resolve));

        console.log('\nFor each domain group, choose migration target:');
        console.log('  S = Keep on Survivor account');
        console.log('  U = Move to Undeleted account');
        console.log('  M = Manual review (don\'t move)');

        for (const [domain, contacts] of Object.entries(this.contactGroups)) {
            const displayDomain = domain === '__NO_EMAIL__' ? 'No Email' : domain;

            const answer = await question(`\n${displayDomain} (${contacts.length} contacts) → Move to [S/U/M]? `);

            const choice = answer.trim().toUpperCase();

            if (choice === 'U') {
                this.migrationPlan.push({
                    domain,
                    contacts,
                    targetAccount: this.deletedRecord.Id,
                    targetName: this.deletedRecord.Name
                });
            } else if (choice === 'M') {
                this.migrationPlan.push({
                    domain,
                    contacts,
                    targetAccount: 'MANUAL_REVIEW',
                    targetName: 'Manual Review Required'
                });
            } else {
                // Default: Keep on survivor (no action needed)
                this.log(`${displayDomain}: Keeping on survivor`, 'INFO');
            }
        }

        rl.close();
    }

    /**
     * Step 7: Execute contact migration
     */
    async executeContactMigration() {
        if (this.migrationPlan.length === 0) {
            this.log('No contacts to migrate', 'INFO');
            return;
        }

        console.log('\n' + '═'.repeat(70));
        console.log('EXECUTING CONTACT MIGRATION');
        console.log('═'.repeat(70));

        for (const plan of this.migrationPlan) {
            if (plan.targetAccount === 'MANUAL_REVIEW') {
                this.log(`${plan.domain}: Marked for manual review (${plan.contacts.length} contacts)`, 'INFO');
                continue;
            }

            this.log(`Migrating ${plan.contacts.length} contacts from ${plan.domain} to ${plan.targetName}...`, 'INFO');

            if (this.options.dryRun) {
                this.log('DRY RUN: Skipping actual migration', 'WARN');
                continue;
            }

            // Generate CSV for bulk update
            const csvPath = this.generateMigrationCSV(plan);

            try {
                const cmd = `sf data upsert bulk --sobject Contact --file ${csvPath} --external-id Id --target-org ${this.orgAlias} --wait 10`;
                execSync(cmd, { encoding: 'utf8' });

                this.log(`✅ Migrated ${plan.contacts.length} contacts to ${plan.targetName}`, 'SUCCESS');

                // Cleanup CSV
                fs.unlinkSync(csvPath);

            } catch (error) {
                this.log(`Migration failed for ${plan.domain}: ${error.message}`, 'ERROR');
                this.log(`CSV preserved at: ${csvPath}`, 'INFO');
            }
        }
    }

    /**
     * Generate CSV for contact migration
     */
    generateMigrationCSV(plan) {
        const csvDir = path.join(__dirname, '../../separation-temp');
        if (!fs.existsSync(csvDir)) {
            fs.mkdirSync(csvDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const csvPath = path.join(csvDir, `migration-${plan.domain}-${timestamp}.csv`);

        let csv = 'Id,AccountId\n';

        for (const contact of plan.contacts) {
            csv += `${contact.Id},${plan.targetAccount}\n`;
        }

        fs.writeFileSync(csvPath, csv);

        return csvPath;
    }

    /**
     * Generate manual review guide
     */
    generateManualReviewGuide() {
        const guideDir = path.join(__dirname, '../../separation-guides');
        if (!fs.existsSync(guideDir)) {
            fs.mkdirSync(guideDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const guidePath = path.join(guideDir, `manual-review-${this.survivorId}-${timestamp}.md`);

        let guide = `# Manual Review Guide: Entity Separation\n\n`;
        guide += `**Generated**: ${new Date().toISOString()}\n`;
        guide += `**Org**: ${this.orgAlias}\n\n`;

        guide += `## Accounts\n\n`;
        guide += `- **Account A**: ${this.survivorRecord.Name} (${this.survivorId})\n`;
        guide += `- **Account B**: ${this.deletedRecord.Name} (${this.deletedRecord.Id})\n\n`;

        guide += `## Contact Migration Summary\n\n`;

        for (const [domain, contacts] of Object.entries(this.contactGroups)) {
            const displayDomain = domain === '__NO_EMAIL__' ? 'No Email' : domain;
            guide += `### ${displayDomain} (${contacts.length} contacts)\n\n`;

            for (const contact of contacts) {
                guide += `- [ ] ${contact.Name} (${contact.Email || 'no email'}) - ${contact.Title || 'No Title'}\n`;
                guide += `      Current: Account A | Move to: [ ] A [ ] B\n`;
            }

            guide += `\n`;
        }

        guide += `## Opportunities (Require Manual Review)\n\n`;
        guide += `⚠️ **Action Required**: Review and reassign opportunities manually in Salesforce UI.\n\n`;

        guide += `1. Navigate to: ${this.survivorRecord.Name} → Related → Opportunities\n`;
        guide += `2. For each opportunity:\n`;
        guide += `   - Verify which entity it belongs to\n`;
        guide += `   - Change Account field if needed\n\n`;

        guide += `## Cases (Require Manual Review)\n\n`;
        guide += `⚠️ **Action Required**: Review and reassign cases manually in Salesforce UI.\n\n`;

        guide += `1. Navigate to: ${this.survivorRecord.Name} → Related → Cases\n`;
        guide += `2. For each case:\n`;
        guide += `   - Verify which entity it belongs to\n`;
        guide += `   - Change Account field if needed\n\n`;

        fs.writeFileSync(guidePath, guide);

        this.log(`Generated manual review guide: ${guidePath}`, 'INFO');
    }

    /**
     * Execute full procedure
     */
    async execute() {
        console.log('═'.repeat(70));
        console.log('PROCEDURE B: ENTITY SEPARATION (Type 1 - Different Entities)');
        console.log('═'.repeat(70));
        console.log(`Org: ${this.orgAlias}`);
        console.log(`Survivor ID: ${this.survivorId}`);
        console.log(`Mode: ${this.options.dryRun ? 'DRY RUN' : 'LIVE'}`);
        console.log('═'.repeat(70));

        try {
            // Step 1: Query deleted record
            await this.queryDeletedRecord();

            // Step 2: Query survivor record
            await this.querySurvivorRecord();

            // Step 3: Undelete merged record
            await this.undeleteRecord();

            // Step 4: Query child records
            const childRecords = await this.queryChildRecords();

            // Step 5: Group contacts by email domain
            await this.groupContactsByDomain(childRecords.contacts);

            // Step 6: Get approval for contact migration
            await this.getContactMigrationApproval();

            // Step 7: Execute contact migration
            await this.executeContactMigration();

            // Step 8: Generate manual review guide
            this.generateManualReviewGuide();

            console.log('\n' + '═'.repeat(70));
            console.log('✅ PROCEDURE B COMPLETED');
            console.log('═'.repeat(70));
            console.log('\n⚠️ NEXT STEPS:');
            console.log('1. Review manual review guide for Opportunities and Cases');
            console.log('2. Verify contact assignments in Salesforce UI');
            console.log('3. Update integration systems with new Account IDs if needed');

        } catch (error) {
            console.log('\n' + '═'.repeat(70));
            console.log('❌ PROCEDURE B FAILED');
            console.log('═'.repeat(70));
            console.error('Error:', error.message);
            process.exit(1);
        }
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2 || args.includes('--help')) {
        console.log(`
Procedure B: Entity Separation (Type 1 - Different Entities)

Usage:
  node procedure-b-entity-separation.js <org-alias> <survivor-id> [options]

Arguments:
  org-alias       Salesforce org alias
  survivor-id     ID of the survivor record (Account that absorbed wrong entity)

Options:
  --dry-run       Simulate without executing (recommended first)
  --auto-approve  Use default migration strategy without interactive prompts

Examples:
  # Dry run (recommended first)
  node procedure-b-entity-separation.js bluerabbit2021-revpal 001xx000ABC --dry-run

  # Interactive mode (prompts for each domain group)
  node procedure-b-entity-separation.js production 001xx000ABC

  # Auto mode (uses default strategy)
  node procedure-b-entity-separation.js production 001xx000ABC --auto-approve

When to Use:
  - Two different entities were incorrectly merged
  - Example: Two different Housing Authorities in same city
  - Solution: Undelete + semi-automatic contact migration by domain
        `);
        process.exit(0);
    }

    const orgAlias = args[0];
    const survivorId = args[1];
    const options = {
        dryRun: args.includes('--dry-run'),
        autoApprove: args.includes('--auto-approve')
    };

    const procedure = new ProcedureBEntitySeparation(orgAlias, survivorId, options);

    procedure.execute()
        .then(() => {
            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = ProcedureBEntitySeparation;
