#!/usr/bin/env node
/**
 * Contact Data Validator
 * Comprehensive validation script for contact data integrity
 */

const { execSync } = require('child_process');
const chalk = require('chalk') || { red: s => s, green: s => s, yellow: s => s, blue: s => s };

const SALESFORCE_ORG = process.argv[2] || 'rentable-production';

class ContactDataValidator {
    constructor(org) {
        this.org = org;
        this.errors = [];
        this.warnings = [];
        this.stats = {};
    }

    async runQuery(query, description) {
        try {
            console.log(`  Checking: ${description}...`);
            const result = execSync(
                `sf data query --query "${query}" --target-org ${this.org} --json`,
                { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
            );
            return JSON.parse(result).result;
        } catch (error) {
            this.errors.push(`Failed to query ${description}: ${error.message}`);
            return { totalSize: 0, records: [] };
        }
    }

    async validateFieldIntegrity() {
        console.log('\n📋 Validating Field Integrity...');
        
        // Check OK status with Delete_Reason populated (should be 0)
        const okWithReason = await this.runQuery(
            "SELECT COUNT(Id) total FROM Contact WHERE Clean_Status__c = 'OK' AND Delete_Reason__c != null AND Delete_Reason__c != ''",
            'OK status with Delete_Reason'
        );
        
        if (okWithReason.records[0]?.total > 0) {
            this.errors.push(`Found ${okWithReason.records[0].total} OK status contacts with Delete_Reason populated`);
        } else {
            console.log('    ✅ No OK status contacts have Delete_Reason');
        }

        // Check Delete status without Delete_Reason (should be 0)
        const deleteWithoutReason = await this.runQuery(
            "SELECT COUNT(Id) total FROM Contact WHERE Clean_Status__c = 'Delete' AND (Delete_Reason__c = null OR Delete_Reason__c = '')",
            'Delete status without Delete_Reason'
        );
        
        if (deleteWithoutReason.records[0]?.total > 0) {
            this.errors.push(`Found ${deleteWithoutReason.records[0].total} Delete status contacts without Delete_Reason`);
        } else {
            console.log('    ✅ All Delete status contacts have Delete_Reason');
        }

        // Check Archive status without Delete_Reason (should be 0)
        const archiveWithoutReason = await this.runQuery(
            "SELECT COUNT(Id) total FROM Contact WHERE Clean_Status__c = 'Archive' AND (Delete_Reason__c = null OR Delete_Reason__c = '')",
            'Archive status without Delete_Reason'
        );
        
        if (archiveWithoutReason.records[0]?.total > 0) {
            this.warnings.push(`Found ${archiveWithoutReason.records[0].total} Archive status contacts without Delete_Reason`);
        } else {
            console.log('    ✅ All Archive status contacts have Delete_Reason');
        }
    }

    async validateClassificationCoverage() {
        console.log('\n📊 Validating Classification Coverage...');
        
        // Check for unclassified contacts
        const unclassified = await this.runQuery(
            "SELECT COUNT(Id) total FROM Contact WHERE Clean_Status__c = null OR Clean_Status__c = ''",
            'Unclassified contacts'
        );
        
        if (unclassified.records[0]?.total > 0) {
            this.errors.push(`Found ${unclassified.records[0].total} contacts without Clean_Status__c`);
        } else {
            console.log('    ✅ All contacts have Clean_Status__c');
        }

        // Get classification distribution
        const distribution = await this.runQuery(
            "SELECT Clean_Status__c, COUNT(Id) total FROM Contact GROUP BY Clean_Status__c",
            'Classification distribution'
        );
        
        console.log('\n    Classification Distribution:');
        distribution.records.forEach(r => {
            const status = r.Clean_Status__c || 'NULL';
            console.log(`      ${status}: ${r.total}`);
            this.stats[status] = r.total;
        });
    }

    async validateDuplicateLogic() {
        console.log('\n🔍 Validating Duplicate Detection...');
        
        // Check for duplicate status with proper Delete_Reason pattern
        const duplicates = await this.runQuery(
            "SELECT COUNT(Id) total FROM Contact WHERE Clean_Status__c = 'Duplicate'",
            'Duplicate status contacts'
        );
        
        const duplicatesWithMaster = await this.runQuery(
            "SELECT COUNT(Id) total FROM Contact WHERE Clean_Status__c = 'Duplicate' AND Delete_Reason__c LIKE 'Master: %'",
            'Duplicates with Master reference'
        );
        
        if (duplicates.records[0]?.total > 0) {
            const withMaster = duplicatesWithMaster.records[0]?.total || 0;
            const withoutMaster = duplicates.records[0].total - withMaster;
            
            if (withoutMaster > 0) {
                this.warnings.push(`Found ${withoutMaster} Duplicate status contacts without proper Master reference`);
            } else {
                console.log('    ✅ All Duplicate contacts have Master reference');
            }
            
            console.log(`      Total duplicates: ${duplicates.records[0].total}`);
            console.log(`      With Master reference: ${withMaster}`);
        }
    }

    async validateSyncStatus() {
        console.log('\n🔄 Validating Sync Status...');
        
        // Check for null Sync_Status__c
        const nullSync = await this.runQuery(
            "SELECT COUNT(Id) total FROM Contact WHERE Sync_Status__c = null OR Sync_Status__c = ''",
            'Contacts without Sync_Status'
        );
        
        if (nullSync.records[0]?.total > 0) {
            this.warnings.push(`Found ${nullSync.records[0].total} contacts without Sync_Status__c`);
        } else {
            console.log('    ✅ All contacts have Sync_Status__c');
        }

        // Get sync status distribution
        const syncDist = await this.runQuery(
            "SELECT Sync_Status__c, COUNT(Id) total FROM Contact GROUP BY Sync_Status__c",
            'Sync status distribution'
        );
        
        console.log('\n    Sync Status Distribution:');
        syncDist.records.forEach(r => {
            const status = r.Sync_Status__c || 'NULL';
            console.log(`      ${status}: ${r.total}`);
        });
    }

    async validateDataQualityRules() {
        console.log('\n✅ Validating Data Quality Rules...');
        
        // Check for contacts marked OK but missing critical data
        const okMissingEmail = await this.runQuery(
            "SELECT COUNT(Id) total FROM Contact WHERE Clean_Status__c = 'OK' AND (Email = null OR Email = '')",
            'OK status without email'
        );
        
        if (okMissingEmail.records[0]?.total > 0) {
            this.warnings.push(`Found ${okMissingEmail.records[0].total} OK status contacts without email`);
        }

        // Check for contacts marked OK but no activity
        const okNoActivity = await this.runQuery(
            "SELECT COUNT(Id) total FROM Contact WHERE Clean_Status__c = 'OK' AND LastActivityDate = null AND CreatedDate < LAST_N_YEARS:2",
            'OK status with no recent activity'
        );
        
        if (okNoActivity.records[0]?.total > 0) {
            this.warnings.push(`Found ${okNoActivity.records[0].total} OK status contacts created 2+ years ago with no activity`);
        }
    }

    async generateReport() {
        console.log('\n' + '='.repeat(60));
        console.log('VALIDATION REPORT');
        console.log('='.repeat(60));
        
        if (this.errors.length === 0 && this.warnings.length === 0) {
            console.log(chalk.green('\n✅ ALL VALIDATIONS PASSED!'));
            console.log('No data integrity issues found.');
        } else {
            if (this.errors.length > 0) {
                console.log(chalk.red(`\n❌ ERRORS (${this.errors.length}):`))
                this.errors.forEach((error, i) => {
                    console.log(chalk.red(`  ${i + 1}. ${error}`));
                });
            }
            
            if (this.warnings.length > 0) {
                console.log(chalk.yellow(`\n⚠️  WARNINGS (${this.warnings.length}):`))
                this.warnings.forEach((warning, i) => {
                    console.log(chalk.yellow(`  ${i + 1}. ${warning}`));
                });
            }
        }
        
        console.log('\n' + '='.repeat(60));
        
        // Return exit code based on errors
        return this.errors.length > 0 ? 1 : 0;
    }

    async run() {
        console.log('='.repeat(60));
        console.log(`CONTACT DATA VALIDATION - ${this.org}`);
        console.log('='.repeat(60));
        
        await this.validateFieldIntegrity();
        await this.validateClassificationCoverage();
        await this.validateDuplicateLogic();
        await this.validateSyncStatus();
        await this.validateDataQualityRules();
        
        const exitCode = await this.generateReport();
        process.exit(exitCode);
    }
}

// Run validator
const validator = new ContactDataValidator(SALESFORCE_ORG);
validator.run().catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
});