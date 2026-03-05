#!/usr/bin/env node

/**
 * Procedure C: Quick Undelete & Separate (Type 1 - Within 15 Days)
 *
 * Quick separation for Type 1 errors still within the 15-day recycle bin window.
 * Simplified version of Procedure B with minimal contact analysis.
 *
 * Example: Merged wrong entities yesterday, need to quickly undo.
 * Solution: Undelete + quick domain-based contact migration + manual review guide.
 *
 * Usage:
 *   node procedure-c-quick-undelete.js <org-alias> <survivor-id> [--dry-run]
 *
 * @author Claude Code
 * @version 1.0.0
 * @date 2025-10-16
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ProcedureCQuickUndelete {
    constructor(orgAlias, survivorId, options = {}) {
        this.orgAlias = orgAlias;
        this.survivorId = survivorId;
        this.options = options;

        this.survivorRecord = null;
        this.deletedRecord = null;
        this.contactsByDomain = {};
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
     * Validate SOQL contract for Salesforce CLI.
     * ALL ROWS must be expressed with --all-rows flag, not inline SOQL.
     */
    validateSfDataQuery(query) {
        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            throw new Error('SOQL query must be a non-empty string');
        }
        if (/\bALL\s+ROWS\b/i.test(query)) {
            throw new Error('Inline "ALL ROWS" is not supported by sf data query. Remove it from SOQL and use includeDeleted=true (adds --all-rows).');
        }
        return query.trim();
    }

    /**
     * Execute SOQL query via Salesforce CLI
     */
    executeSoqlQuery(query, includeDeleted = false) {
        try {
            const normalizedQuery = this.validateSfDataQuery(query);
            const deletedFlag = includeDeleted ? '--all-rows' : '';
            const cmd = `sf data query --query "${normalizedQuery.replace(/"/g, '\\"')}" --json --target-org ${this.orgAlias} ${deletedFlag}`;
            const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
            return JSON.parse(result);
        } catch (error) {
            this.log(`Query failed: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    /**
     * Check if record is within 15-day window
     */
    async checkRecycleBinWindow() {
        this.log('Checking recycle bin window...', 'INFO');

        const query = `SELECT Id, Name, IsDeleted, LastModifiedDate, MasterRecordId FROM Account WHERE IsDeleted = true AND MasterRecordId = '${this.survivorId}'`;

        try {
            const result = this.executeSoqlQuery(query, true);

            if (!result.result || !result.result.records || result.result.records.length === 0) {
                throw new Error(`No deleted record found with MasterRecordId = ${this.survivorId}`);
            }

            this.deletedRecord = result.result.records.sort((a, b) =>
                new Date(b.LastModifiedDate) - new Date(a.LastModifiedDate)
            )[0];

            const deletedDate = new Date(this.deletedRecord.LastModifiedDate);
            const now = new Date();
            const daysSinceDeletion = Math.floor((now - deletedDate) / (1000 * 60 * 60 * 24));

            this.log(`Found deleted record: ${this.deletedRecord.Name}`, 'SUCCESS');
            this.log(`Deleted: ${daysSinceDeletion} day(s) ago`, daysSinceDeletion <= 15 ? 'SUCCESS' : 'WARN');

            if (daysSinceDeletion > 15) {
                this.log('⚠️ WARNING: Record may be outside 15-day recycle bin window', 'WARN');
                this.log('Undelete may not be possible via standard methods', 'WARN');
            }

            return daysSinceDeletion;

        } catch (error) {
            this.log(`Failed to check recycle bin: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    /**
     * Query survivor record
     */
    async querySurvivorRecord() {
        this.log('Querying survivor record...', 'INFO');

        const query = `SELECT Id, Name, Website, BillingCity, BillingState, BillingCountry FROM Account WHERE Id = '${this.survivorId}'`;

        try {
            const result = this.executeSoqlQuery(query);

            if (!result.result || !result.result.records || result.result.records.length === 0) {
                throw new Error(`Survivor record not found: ${this.survivorId}`);
            }

            this.survivorRecord = result.result.records[0];
            this.log(`Found survivor record: ${this.survivorRecord.Name}`, 'SUCCESS');

        } catch (error) {
            this.log(`Failed to query survivor record: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    /**
     * Undelete record
     */
    async undeleteRecord() {
        this.log('Undeleting merged record...', 'INFO');

        if (this.options.dryRun) {
            this.log('DRY RUN: Skipping actual undelete', 'WARN');
            return true;
        }

        try {
            // Attempt undelete via CLI
            const cmd = `sf data delete record --sobject Account --record-id ${this.deletedRecord.Id} --undelete --json --target-org ${this.orgAlias}`;
            execSync(cmd, { encoding: 'utf8' });

            this.log(`✅ Record undeleted: ${this.deletedRecord.Name}`, 'SUCCESS');
            return true;

        } catch (error) {
            this.log('CLI undelete failed, manual action required', 'ERROR');
            console.log('\n' + '═'.repeat(70));
            console.log('MANUAL UNDELETE REQUIRED');
            console.log('═'.repeat(70));
            console.log('1. Log into Salesforce org:', this.orgAlias);
            console.log('2. Navigate to: Setup → Recycle Bin');
            console.log('3. Find record:', this.deletedRecord.Name);
            console.log('4. ID:', this.deletedRecord.Id);
            console.log('5. Click "Undelete"');
            console.log('═'.repeat(70));

            return false;
        }
    }

    /**
     * Quick contact analysis by domain
     */
    async analyzeContactsByDomain() {
        this.log('Analyzing contacts by email domain...', 'INFO');

        const query = `SELECT Id, Name, Email, AccountId FROM Contact WHERE AccountId = '${this.survivorId}'`;

        try {
            const result = this.executeSoqlQuery(query);
            const contacts = result.result.records || [];

            this.log(`Found ${contacts.length} contacts`, 'SUCCESS');

            // Group by domain
            for (const contact of contacts) {
                if (!contact.Email) {
                    if (!this.contactsByDomain['__NO_EMAIL__']) {
                        this.contactsByDomain['__NO_EMAIL__'] = [];
                    }
                    this.contactsByDomain['__NO_EMAIL__'].push(contact);
                    continue;
                }

                const domain = this.extractDomain(contact.Email);
                if (!this.contactsByDomain[domain]) {
                    this.contactsByDomain[domain] = [];
                }
                this.contactsByDomain[domain].push(contact);
            }

            return contacts.length;

        } catch (error) {
            this.log(`Failed to analyze contacts: ${error.message}`, 'ERROR');
            return 0;
        }
    }

    /**
     * Extract domain from email
     */
    extractDomain(email) {
        const match = email.match(/@(.+)$/);
        return match ? match[1].toLowerCase() : 'unknown';
    }

    /**
     * Generate quick separation guide
     */
    generateQuickGuide() {
        const guideDir = path.join(__dirname, '../../quick-guides');
        if (!fs.existsSync(guideDir)) {
            fs.mkdirSync(guideDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const guidePath = path.join(guideDir, `quick-separation-${this.survivorId}-${timestamp}.md`);

        let guide = `# Quick Separation Guide\n\n`;
        guide += `**Generated**: ${new Date().toISOString()}\n`;
        guide += `**Org**: ${this.orgAlias}\n`;
        guide += `**Procedure**: C (Quick Undelete & Separate)\n\n`;

        guide += `## Status\n\n`;
        guide += `- [x] Deleted record identified\n`;
        guide += `- [${this.options.dryRun ? ' ' : 'x'}] Record undeleted\n`;
        guide += `- [ ] Contacts reviewed and reassigned\n`;
        guide += `- [ ] Opportunities reviewed and reassigned\n`;
        guide += `- [ ] Cases reviewed and reassigned\n\n`;

        guide += `## Accounts\n\n`;
        guide += `| Account | ID | Location |\n`;
        guide += `|---------|----|-----------|\n`;
        guide += `| **A (Survivor)** | ${this.survivorId} | ${this.survivorRecord.BillingCity || 'N/A'}, ${this.survivorRecord.BillingState || 'N/A'} |\n`;
        guide += `| **B (Undeleted)** | ${this.deletedRecord.Id} | ${this.deletedRecord.BillingCity || 'N/A'}, ${this.deletedRecord.BillingState || 'N/A'} |\n\n`;

        guide += `### Account A: ${this.survivorRecord.Name}\n`;
        guide += `- **ID**: ${this.survivorId}\n`;
        guide += `- **Website**: ${this.survivorRecord.Website || 'N/A'}\n\n`;

        guide += `### Account B: ${this.deletedRecord.Name}\n`;
        guide += `- **ID**: ${this.deletedRecord.Id}\n`;
        guide += `- **Status**: ${this.options.dryRun ? 'Still Deleted' : 'Undeleted'}\n\n`;

        guide += `## Contact Migration Guide\n\n`;

        if (Object.keys(this.contactsByDomain).length > 0) {
            guide += `Contacts are grouped by email domain for easier review:\n\n`;

            for (const [domain, contacts] of Object.entries(this.contactsByDomain)) {
                const displayDomain = domain === '__NO_EMAIL__' ? '**No Email**' : `**@${domain}**`;
                guide += `### ${displayDomain} (${contacts.length} contact${contacts.length !== 1 ? 's' : ''})\n\n`;

                guide += `| Name | Email | Current Account | Move to Account |\n`;
                guide += `|------|-------|-----------------|------------------|\n`;

                for (const contact of contacts) {
                    guide += `| ${contact.Name} | ${contact.Email || 'no email'} | A (Survivor) | [ ] A [ ] B |\n`;
                }

                guide += `\n`;
            }

            guide += `### How to Migrate Contacts\n\n`;
            guide += `**Option 1: Via Salesforce UI**\n`;
            guide += `1. Open Account A (${this.survivorRecord.Name})\n`;
            guide += `2. Go to Related → Contacts\n`;
            guide += `3. Edit each contact's Account field\n`;
            guide += `4. Change to Account B where appropriate\n\n`;

            guide += `**Option 2: Via Data Loader**\n`;
            guide += `1. Export all contacts: \`SELECT Id, AccountId FROM Contact WHERE AccountId = '${this.survivorId}'\`\n`;
            guide += `2. Update AccountId column to Account B ID where appropriate\n`;
            guide += `3. Update via Data Loader\n\n`;

        } else {
            guide += `No contacts found on survivor account.\n\n`;
        }

        guide += `## Other Child Records\n\n`;

        guide += `### Opportunities\n\n`;
        guide += `⚠️ **Manual Review Required**\n\n`;
        guide += `1. Go to Account A → Related → Opportunities\n`;
        guide += `2. For each opportunity:\n`;
        guide += `   - Determine which entity it belongs to (A or B)\n`;
        guide += `   - Update Account field if needed\n\n`;

        guide += `### Cases\n\n`;
        guide += `⚠️ **Manual Review Required**\n\n`;
        guide += `1. Go to Account A → Related → Cases\n`;
        guide += `2. For each case:\n`;
        guide += `   - Determine which entity it belongs to (A or B)\n`;
        guide += `   - Update Account field if needed\n\n`;

        guide += `## Post-Separation Checklist\n\n`;
        guide += `- [ ] All contacts correctly assigned\n`;
        guide += `- [ ] All opportunities correctly assigned\n`;
        guide += `- [ ] All cases correctly assigned\n`;
        guide += `- [ ] Integration systems updated (if applicable)\n`;
        guide += `- [ ] Users notified of account split\n`;
        guide += `- [ ] Related lists verified\n\n`;

        guide += `## Rollback\n\n`;
        guide += `If this separation was incorrect:\n\n`;
        guide += `1. Re-merge accounts using standard Salesforce merge UI\n`;
        guide += `2. Choose correct survivor this time\n`;
        guide += `3. Verify all child records transferred\n\n`;

        fs.writeFileSync(guidePath, guide);

        this.log(`Generated quick guide: ${guidePath}`, 'SUCCESS');

        return guidePath;
    }

    /**
     * Generate CSV template for contact migration
     */
    generateContactMigrationTemplate() {
        const templateDir = path.join(__dirname, '../../quick-templates');
        if (!fs.existsSync(templateDir)) {
            fs.mkdirSync(templateDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const templatePath = path.join(templateDir, `contact-migration-${this.survivorId}-${timestamp}.csv`);

        let csv = 'Id,Name,Email,CurrentAccountId,CurrentAccountName,NewAccountId,Notes\n';

        for (const [domain, contacts] of Object.entries(this.contactsByDomain)) {
            for (const contact of contacts) {
                csv += `${contact.Id},"${contact.Name}","${contact.Email || ''}",${this.survivorId},"${this.survivorRecord.Name}",${this.deletedRecord.Id},"Domain: ${domain}"\n`;
            }
        }

        fs.writeFileSync(templatePath, csv);

        this.log(`Generated contact migration template: ${templatePath}`, 'SUCCESS');

        return templatePath;
    }

    /**
     * Execute full procedure
     */
    async execute() {
        console.log('═'.repeat(70));
        console.log('PROCEDURE C: QUICK UNDELETE & SEPARATE');
        console.log('(Type 1 - Different Entities, Within 15-Day Window)');
        console.log('═'.repeat(70));
        console.log(`Org: ${this.orgAlias}`);
        console.log(`Survivor ID: ${this.survivorId}`);
        console.log(`Mode: ${this.options.dryRun ? 'DRY RUN' : 'LIVE'}`);
        console.log('═'.repeat(70));

        try {
            // Step 1: Check recycle bin window
            const daysSinceDeletion = await this.checkRecycleBinWindow();

            // Step 2: Query survivor record
            await this.querySurvivorRecord();

            // Step 3: Undelete record
            const undeleteSuccess = await this.undeleteRecord();

            // Step 4: Quick contact analysis
            const contactCount = await this.analyzeContactsByDomain();

            // Step 5: Generate quick guide
            const guidePath = this.generateQuickGuide();

            // Step 6: Generate contact migration template
            if (contactCount > 0) {
                const templatePath = this.generateContactMigrationTemplate();

                console.log('\n' + '═'.repeat(70));
                console.log('CONTACT MIGRATION OPTIONS');
                console.log('═'.repeat(70));
                console.log(`1. Manual UI: Follow guide at ${guidePath}`);
                console.log(`2. Data Loader: Use template at ${templatePath}`);
                console.log(`3. Semi-Automatic: Run Procedure B for interactive migration`);
                console.log('   Command: node procedure-b-entity-separation.js', this.orgAlias, this.survivorId);
            }

            console.log('\n' + '═'.repeat(70));
            console.log('✅ PROCEDURE C COMPLETED');
            console.log('═'.repeat(70));

            if (!undeleteSuccess) {
                console.log('\n⚠️ IMPORTANT: Manual undelete required (see instructions above)');
            }

            console.log('\n📋 NEXT STEPS:');
            console.log(`1. Open quick guide: ${guidePath}`);
            console.log('2. Review and migrate contacts by domain');
            console.log('3. Review and reassign opportunities');
            console.log('4. Review and reassign cases');
            console.log('5. Update integration systems if needed');

            console.log('\n⏱️ TIME REMAINING:');
            console.log(`Deleted ${daysSinceDeletion} day(s) ago → ${15 - daysSinceDeletion} day(s) left in recycle bin`);

        } catch (error) {
            console.log('\n' + '═'.repeat(70));
            console.log('❌ PROCEDURE C FAILED');
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
Procedure C: Quick Undelete & Separate (Type 1 - Within 15 Days)

Usage:
  node procedure-c-quick-undelete.js <org-alias> <survivor-id> [--dry-run]

Arguments:
  org-alias       Salesforce org alias
  survivor-id     ID of the survivor record

Options:
  --dry-run       Simulate without executing (recommended first)

Examples:
  # Dry run (recommended first)
  node procedure-c-quick-undelete.js epsilon-corp2021-revpal 001xx000ABC --dry-run

  # Execute quick undelete
  node procedure-c-quick-undelete.js production 001xx000ABC

When to Use:
  - Type 1 error (different entities merged)
  - Within 15-day recycle bin window
  - Need quick undo without complex analysis
  - Prefer manual review over automated migration

Comparison with Procedure B:
  - Procedure C: Quick undelete + manual review guide
  - Procedure B: Full interactive contact migration by domain
  - Use C when you want maximum control
  - Use B when you have many contacts and clear domain patterns
        `);
        process.exit(0);
    }

    const orgAlias = args[0];
    const survivorId = args[1];
    const options = {
        dryRun: args.includes('--dry-run')
    };

    const procedure = new ProcedureCQuickUndelete(orgAlias, survivorId, options);

    procedure.execute()
        .then(() => {
            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = ProcedureCQuickUndelete;
