#!/usr/bin/env node

/**
 * Procedure A: Field Restoration (Type 2 - Wrong Survivor)
 *
 * Restores superior field values from deleted record to survivor.
 * Used when the correct entities were merged but the wrong survivor was selected.
 *
 * Example: Prospect account absorbed Paying Customer account.
 * Solution: Restore critical fields from deleted record to survivor.
 *
 * Usage:
 *   node procedure-a-field-restoration.js <org-alias> <survivor-id> [--dry-run] [--fields field1,field2,...]
 *
 * @author Claude Code
 * @version 1.0.0
 * @date 2025-10-16
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ProcedureAFieldRestoration {
    constructor(orgAlias, survivorId, options = {}) {
        this.orgAlias = orgAlias;
        this.survivorId = survivorId;
        this.options = options;

        this.survivorRecord = null;
        this.deletedRecord = null;
        this.fieldsToRestore = [];
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
    executeSoqlQuery(query, useToolingApi = false, includeDeleted = false) {
        try {
            const normalizedQuery = this.validateSfDataQuery(query);
            const apiFlag = useToolingApi ? '--use-tooling-api' : '';
            const deletedFlag = includeDeleted ? '--all-rows' : '';
            const cmd = `sf data query --query "${normalizedQuery.replace(/"/g, '\\"')}" --json --target-org ${this.orgAlias} ${apiFlag} ${deletedFlag}`;
            const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
            return JSON.parse(result);
        } catch (error) {
            this.log(`Query failed: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    /**
     * Describe Account object to get all fields
     */
    describeObject() {
        try {
            const cmd = `sf sobject describe --sobject Account --json --target-org ${this.orgAlias}`;
            const result = execSync(cmd, { encoding: 'utf8' });
            return JSON.parse(result).result;
        } catch (error) {
            this.log(`Object describe failed: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    /**
     * Step 1: Query deleted record (merged record)
     */
    async queryDeletedRecord() {
        this.log('Querying deleted record with MasterRecordId...', 'INFO');

        // Query deleted records that were merged into this survivor
        const query = `SELECT FIELDS(ALL) FROM Account WHERE IsDeleted = true AND MasterRecordId = '${this.survivorId}'`;

        try {
            const result = this.executeSoqlQuery(query, false, true);

            if (!result.result || !result.result.records || result.result.records.length === 0) {
                throw new Error(`No deleted record found with MasterRecordId = ${this.survivorId}`);
            }

            if (result.result.records.length > 1) {
                this.log(`Found ${result.result.records.length} deleted records merged into survivor. Using most recent.`, 'WARN');
            }

            // Use most recently deleted
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
     * Step 2: Query current survivor record
     */
    async querySurvivorRecord() {
        this.log('Querying current survivor record...', 'INFO');

        const query = `SELECT FIELDS(ALL) FROM Account WHERE Id = '${this.survivorId}'`;

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
     * Step 3: Identify fields to restore
     */
    async identifyFieldsToRestore() {
        this.log('Analyzing field differences...', 'INFO');

        const objectMetadata = this.describeObject();

        // Importance keywords for auto-detection
        const importanceKeywords = {
            high: ['customer', 'active', 'paying', 'premium', 'enterprise', 'platinum', 'gold', 'revenue', 'mrr', 'arr'],
            status: ['status', 'stage', 'phase', 'lifecycle'],
            revenue: ['revenue', 'amount', 'value', 'mrr', 'arr', 'acv', 'tcv']
        };

        // If specific fields provided, use those
        if (this.options.fields && this.options.fields.length > 0) {
            this.fieldsToRestore = this.options.fields.map(f => ({
                name: f,
                reason: 'User-specified',
                survivorValue: this.survivorRecord[f],
                deletedValue: this.deletedRecord[f]
            }));
            return;
        }

        // Auto-detect important fields to restore
        for (const field of objectMetadata.fields) {
            // Skip non-updateable fields
            if (!field.updateable) continue;

            // Skip system fields
            if (['Id', 'IsDeleted', 'CreatedDate', 'CreatedById', 'LastModifiedDate', 'LastModifiedById', 'SystemModstamp'].includes(field.name)) {
                continue;
            }

            const survivorValue = this.survivorRecord[field.name];
            const deletedValue = this.deletedRecord[field.name];

            // Skip if both are null or equal
            if (survivorValue === deletedValue) continue;
            if (!deletedValue || deletedValue === null || deletedValue === '') continue;

            // Determine if this field is important
            let isImportant = false;
            let reason = '';

            // Check field name/label for importance
            const fieldLower = field.name.toLowerCase();
            const labelLower = field.label.toLowerCase();

            if (importanceKeywords.high.some(kw => fieldLower.includes(kw) || labelLower.includes(kw))) {
                isImportant = true;
                reason = 'High importance field';
            } else if (importanceKeywords.status.some(kw => fieldLower.includes(kw) || labelLower.includes(kw))) {
                // Check if deleted value is superior for status fields
                const deletedValueLower = String(deletedValue).toLowerCase();
                if (importanceKeywords.high.some(kw => deletedValueLower.includes(kw))) {
                    isImportant = true;
                    reason = 'Superior status value';
                }
            } else if (field.type === 'currency' || field.type === 'double' || field.type === 'percent') {
                // Numeric fields: deleted value is superior if greater
                if (parseFloat(deletedValue) > parseFloat(survivorValue || 0)) {
                    isImportant = true;
                    reason = 'Higher numeric value';
                }
            } else if (field.type === 'date' || field.type === 'datetime') {
                // Date fields: deleted value is more recent
                if (new Date(deletedValue) > new Date(survivorValue || '1970-01-01')) {
                    isImportant = true;
                    reason = 'More recent date';
                }
            } else if (!survivorValue || survivorValue === null || survivorValue === '') {
                // Survivor is empty, deleted has value
                isImportant = true;
                reason = 'Survivor field is empty';
            }

            if (isImportant) {
                this.fieldsToRestore.push({
                    name: field.name,
                    label: field.label,
                    type: field.type,
                    reason,
                    survivorValue,
                    deletedValue
                });
            }
        }

        this.log(`Identified ${this.fieldsToRestore.length} fields to restore`, 'SUCCESS');
    }

    /**
     * Step 4: Generate field update statements
     */
    async generateUpdateStatements() {
        console.log('\n' + '═'.repeat(70));
        console.log('FIELDS TO RESTORE');
        console.log('═'.repeat(70));

        for (let i = 0; i < this.fieldsToRestore.length; i++) {
            const field = this.fieldsToRestore[i];
            console.log(`\n${i + 1}. ${field.name} (${field.label || field.name})`);
            console.log(`   Type: ${field.type || 'unknown'}`);
            console.log(`   Reason: ${field.reason}`);
            console.log(`   Current (Survivor): ${this.formatValue(field.survivorValue)}`);
            console.log(`   Restore (Deleted): ${this.formatValue(field.deletedValue)}`);
        }

        console.log('\n' + '═'.repeat(70));
    }

    /**
     * Format value for display
     */
    formatValue(value) {
        if (value === null || value === undefined) return '<null>';
        if (value === '') return '<empty>';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    /**
     * Step 5: Execute field updates
     */
    async executeUpdates() {
        if (this.fieldsToRestore.length === 0) {
            this.log('No fields to restore', 'INFO');
            return;
        }

        if (this.options.dryRun) {
            this.log('DRY RUN: Skipping actual updates', 'WARN');
            this.generateUpdateScript();
            return;
        }

        // Generate CSV for bulk update
        const csvPath = this.generateUpdateCSV();

        this.log(`Executing field restoration via bulk CSV update...`, 'INFO');

        try {
            const cmd = `sf data upsert bulk --sobject Account --file ${csvPath} --external-id Id --target-org ${this.orgAlias} --wait 10`;
            const result = execSync(cmd, { encoding: 'utf8' });

            this.log('Field restoration completed successfully', 'SUCCESS');
            console.log(result);

            // Cleanup CSV
            fs.unlinkSync(csvPath);

        } catch (error) {
            this.log(`Field restoration failed: ${error.message}`, 'ERROR');
            this.log(`CSV file preserved at: ${csvPath}`, 'INFO');
            throw error;
        }
    }

    /**
     * Generate CSV for bulk update
     */
    generateUpdateCSV() {
        const csvDir = path.join(__dirname, '../../restoration-temp');
        if (!fs.existsSync(csvDir)) {
            fs.mkdirSync(csvDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const csvPath = path.join(csvDir, `restoration-${this.survivorId}-${timestamp}.csv`);

        // Generate CSV header
        const fields = ['Id', ...this.fieldsToRestore.map(f => f.name)];
        let csv = fields.join(',') + '\n';

        // Generate CSV data row
        const values = [
            this.survivorId,
            ...this.fieldsToRestore.map(f => this.escapeCSVValue(f.deletedValue))
        ];
        csv += values.join(',') + '\n';

        fs.writeFileSync(csvPath, csv);

        return csvPath;
    }

    /**
     * Escape CSV value
     */
    escapeCSVValue(value) {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    /**
     * Generate manual update script (for dry-run)
     */
    generateUpdateScript() {
        const scriptDir = path.join(__dirname, '../../restoration-scripts');
        if (!fs.existsSync(scriptDir)) {
            fs.mkdirSync(scriptDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const scriptPath = path.join(scriptDir, `restoration-${this.survivorId}-${timestamp}.apex`);

        let script = `// Procedure A: Field Restoration Script\n`;
        script += `// Generated: ${new Date().toISOString()}\n`;
        script += `// Org: ${this.orgAlias}\n`;
        script += `// Survivor: ${this.survivorRecord.Name} (${this.survivorId})\n`;
        script += `// Deleted: ${this.deletedRecord.Name} (${this.deletedRecord.Id})\n\n`;

        script += `Account survivor = [SELECT Id, ${this.fieldsToRestore.map(f => f.name).join(', ')} FROM Account WHERE Id = '${this.survivorId}'];\n\n`;

        for (const field of this.fieldsToRestore) {
            const value = this.formatApexValue(field.deletedValue, field.type);
            script += `survivor.${field.name} = ${value}; // ${field.reason}\n`;
        }

        script += `\nupdate survivor;\n`;
        script += `System.debug('Field restoration completed: ' + survivor);\n`;

        fs.writeFileSync(scriptPath, script);

        this.log(`Generated Apex script: ${scriptPath}`, 'INFO');
        console.log('\nTo execute manually:');
        console.log(`1. Open Developer Console in ${this.orgAlias}`);
        console.log(`2. Execute Anonymous: Copy contents of ${scriptPath}`);
        console.log(`3. Verify results`);
    }

    /**
     * Format value for Apex
     */
    formatApexValue(value, type) {
        if (value === null || value === undefined) return 'null';
        if (type === 'string' || type === 'textarea' || type === 'email' || type === 'url' || type === 'phone' || type === 'picklist') {
            return `'${String(value).replace(/'/g, "\\'")}'`;
        }
        if (type === 'boolean') {
            return value ? 'true' : 'false';
        }
        if (type === 'date') {
            return `Date.valueOf('${value}')`;
        }
        if (type === 'datetime') {
            return `DateTime.valueOf('${value}')`;
        }
        return String(value);
    }

    /**
     * Generate rollback script
     */
    generateRollbackScript() {
        const scriptDir = path.join(__dirname, '../../restoration-scripts');
        if (!fs.existsSync(scriptDir)) {
            fs.mkdirSync(scriptDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const scriptPath = path.join(scriptDir, `rollback-${this.survivorId}-${timestamp}.apex`);

        let script = `// Rollback Script for Procedure A\n`;
        script += `// Generated: ${new Date().toISOString()}\n\n`;

        script += `Account survivor = [SELECT Id, ${this.fieldsToRestore.map(f => f.name).join(', ')} FROM Account WHERE Id = '${this.survivorId}'];\n\n`;

        for (const field of this.fieldsToRestore) {
            const value = this.formatApexValue(field.survivorValue, field.type);
            script += `survivor.${field.name} = ${value}; // Restore original value\n`;
        }

        script += `\nupdate survivor;\n`;
        script += `System.debug('Rollback completed: ' + survivor);\n`;

        fs.writeFileSync(scriptPath, script);

        this.log(`Generated rollback script: ${scriptPath}`, 'INFO');
    }

    /**
     * Execute full procedure
     */
    async execute() {
        console.log('═'.repeat(70));
        console.log('PROCEDURE A: FIELD RESTORATION (Type 2 - Wrong Survivor)');
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

            // Step 3: Identify fields to restore
            await this.identifyFieldsToRestore();

            // Step 4: Show fields to restore
            await this.generateUpdateStatements();

            // Step 5: Generate rollback script
            this.generateRollbackScript();

            // Step 6: Execute updates
            if (!this.options.dryRun && this.fieldsToRestore.length > 0) {
                console.log('\n⚠ WARNING: This will modify the survivor record.');
                console.log('Rollback script has been generated in case you need to undo changes.');
                console.log('\nProceed with field restoration? This action will execute immediately.');

                await this.executeUpdates();
            } else {
                await this.executeUpdates();
            }

            console.log('\n' + '═'.repeat(70));
            console.log('✅ PROCEDURE A COMPLETED');
            console.log('═'.repeat(70));

        } catch (error) {
            console.log('\n' + '═'.repeat(70));
            console.log('❌ PROCEDURE A FAILED');
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
Procedure A: Field Restoration (Type 2 - Wrong Survivor)

Usage:
  node procedure-a-field-restoration.js <org-alias> <survivor-id> [options]

Arguments:
  org-alias       Salesforce org alias
  survivor-id     ID of the survivor record (Account that absorbed the deleted record)

Options:
  --dry-run       Generate scripts without executing (recommended first)
  --fields        Comma-separated list of specific fields to restore
                  (if not provided, auto-detects important fields)

Examples:
  # Dry run (recommended first)
  node procedure-a-field-restoration.js epsilon-corp2021-revpal 001xx000ABC --dry-run

  # Execute restoration (all auto-detected fields)
  node procedure-a-field-restoration.js production 001xx000ABC

  # Restore specific fields only
  node procedure-a-field-restoration.js production 001xx000ABC --fields Customer_Status__c,Revenue__c

When to Use:
  - Same entity, but wrong survivor selected
  - Example: Prospect account absorbed Paying Customer account
  - Solution: Restore critical fields from deleted to survivor
        `);
        process.exit(0);
    }

    const orgAlias = args[0];
    const survivorId = args[1];
    const options = {
        dryRun: args.includes('--dry-run'),
        fields: []
    };

    // Parse --fields option
    const fieldsIndex = args.indexOf('--fields');
    if (fieldsIndex !== -1 && args[fieldsIndex + 1]) {
        options.fields = args[fieldsIndex + 1].split(',').map(f => f.trim());
    }

    const procedure = new ProcedureAFieldRestoration(orgAlias, survivorId, options);

    procedure.execute()
        .then(() => {
            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = ProcedureAFieldRestoration;
