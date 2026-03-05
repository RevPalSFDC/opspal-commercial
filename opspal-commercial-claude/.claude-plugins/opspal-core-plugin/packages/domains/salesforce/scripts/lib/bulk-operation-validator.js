#!/usr/bin/env node

/**
 * Bulk Operation Validator
 *
 * Pre-flight validation for bulk Salesforce operations to prevent common errors:
 * - Wrong org execution
 * - Inactive user assignments
 * - Missing backups
 * - Production operations without confirmation
 * - Record count threshold violations
 *
 * Usage:
 *   const { BulkOperationValidator } = require('./lib/bulk-operation-validator');
 *
 *   const validator = new BulkOperationValidator({
 *       orgAlias: 'peregrine-main',
 *       operationType: 'ownership-transfer',
 *       recordCount: 389,
 *       sourceUserId: '005xxx',
 *       targetUserId: '005yyy'
 *   });
 *
 *   const validation = await validator.validate();
 *   if (!validation.passed) {
 *       console.error('Validation failed:', validation.errors);
 *       process.exit(1);
 *   }
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { resolveOrgAlias } = require('./instance-alias-resolver');
const { InstanceConfig } = require('./instance-config-registry');

class BulkOperationValidator {
    constructor(options = {}) {
        this.orgAlias = options.orgAlias;
        this.operationType = options.operationType;
        this.recordCount = options.recordCount || 0;
        this.sourceUserId = options.sourceUserId;
        this.targetUserId = options.targetUserId;
        this.backupRequired = options.backupRequired !== false;
        this.requiresUserValidation = options.requiresUserValidation || false;
        this.options = options;

        this.errors = [];
        this.warnings = [];
        this.safeguards = [];
        this.orgResolution = null;
        this.envType = null;
    }

    /**
     * Run all validations
     */
    async validate() {
        console.log('Running bulk operation pre-flight validation...\n');

        // 1. Resolve org alias
        await this.validateOrgResolution();

        // 2. Determine required safeguards
        this.determineSafeguards();

        // 3. Validate users if required
        if (this.requiresUserValidation) {
            await this.validateUsers();
        }

        // 4. Check production environment
        if (this.envType === 'production') {
            this.validateProductionOperation();
        }

        // 5. Validate backup requirements
        if (this.backupRequired) {
            this.validateBackupRequirements();
        }

        // 6. Check record count thresholds
        this.validateRecordCountThresholds();

        // Summary
        const passed = this.errors.length === 0;

        return {
            passed,
            errors: this.errors,
            warnings: this.warnings,
            safeguards: this.safeguards,
            orgResolution: this.orgResolution,
            envType: this.envType,
            summary: this.generateSummary()
        };
    }

    /**
     * Validate and resolve org alias
     */
    async validateOrgResolution() {
        if (!this.orgAlias) {
            this.errors.push('Org alias is required');
            return;
        }

        try {
            this.orgResolution = await resolveOrgAlias(this.orgAlias, {
                interactive: false,
                confidenceThreshold: 80
            });

            if (!this.orgResolution.success) {
                this.errors.push(`Could not resolve org alias: ${this.orgAlias}`);
                if (this.orgResolution.matches && this.orgResolution.matches.length > 0) {
                    this.errors.push('Possible matches:');
                    this.orgResolution.matches.slice(0, 3).forEach(m => {
                        this.errors.push(`  - ${m.orgAlias} (${m.environmentType})`);
                    });
                }
                return;
            }

            this.envType = this.orgResolution.match.environmentType;

            console.log(`✓ Org resolved: ${this.orgResolution.orgAlias}`);
            console.log(`  Environment: ${this.envType}`);
            console.log(`  Business Name: ${this.orgResolution.match.businessName || 'N/A'}`);
            console.log('');

        } catch (error) {
            this.errors.push(`Org resolution failed: ${error.message}`);
        }
    }

    /**
     * Determine required safeguards based on operation characteristics
     */
    determineSafeguards() {
        const recordCount = this.recordCount;
        const envType = this.envType;

        // Base safeguards
        this.safeguards.push('confirmation');

        // Record count thresholds
        if (recordCount > 10) {
            this.safeguards.push('show_records');
        }

        if (recordCount > 100) {
            this.safeguards.push('backup', 'org_confirmation');
        }

        if (recordCount > 1000) {
            this.safeguards.push('phased_execution');
            this.warnings.push(
                `Large operation (${recordCount} records) will use phased execution (batches of 1000)`
            );
        }

        if (recordCount > 10000) {
            this.safeguards.push('executive_approval', 'split_day_execution');
            this.warnings.push(
                `Very large operation (${recordCount} records) requires executive approval and split-day execution`
            );
        }

        // Production environment
        if (envType === 'production' && recordCount > 50) {
            this.safeguards.push('production_warning', 'double_confirmation');
        }

        console.log(`Safeguards required: ${this.safeguards.join(', ')}`);
        console.log('');
    }

    /**
     * Validate user status for ownership transfers
     */
    async validateUsers() {
        if (!this.sourceUserId && !this.targetUserId) {
            return; // No user validation needed
        }

        try {
            // Query source user
            if (this.sourceUserId) {
                const sourceUser = await this.queryUser(this.sourceUserId);

                if (!sourceUser) {
                    this.errors.push(`Source user not found: ${this.sourceUserId}`);
                } else if (!sourceUser.IsActive) {
                    this.warnings.push(
                        `Source user is INACTIVE: ${sourceUser.Name} (${sourceUser.Email}). ` +
                        `This is expected when transferring from departed employees.`
                    );
                } else {
                    console.log(`✓ Source user validated: ${sourceUser.Name} (Active)`);
                }
            }

            // Query target user
            if (this.targetUserId) {
                const targetUser = await this.queryUser(this.targetUserId);

                if (!targetUser) {
                    this.errors.push(`Target user not found: ${this.targetUserId}`);
                } else if (!targetUser.IsActive) {
                    this.errors.push(
                        `❌ Target user is INACTIVE: ${targetUser.Name} (${targetUser.Email}). ` +
                        `Cannot assign records to inactive user.`
                    );
                } else {
                    console.log(`✓ Target user validated: ${targetUser.Name} (Active)`);
                }
            }

            console.log('');

        } catch (error) {
            this.errors.push(`User validation failed: ${error.message}`);
        }
    }

    /**
     * Query user from Salesforce
     */
    async queryUser(userId) {
        try {
            const query = `SELECT Id, Name, Email, Username, IsActive FROM User WHERE Id = '${userId}'`;
            const result = execSync(
                `sf data query --query "${query}" --target-org ${this.orgResolution.orgAlias} --json`,
                { encoding: 'utf8' }
            );

            const parsed = JSON.parse(result);
            if (parsed.status === 0 && parsed.result.records.length > 0) {
                return parsed.result.records[0];
            }

            return null;
        } catch (error) {
            throw new Error(`Failed to query user ${userId}: ${error.message}`);
        }
    }

    /**
     * Validate production environment requirements
     */
    validateProductionOperation() {
        if (this.recordCount > 50) {
            this.warnings.push(
                '⚠️  PRODUCTION ENVIRONMENT: This operation will modify live production data!'
            );
        }

        if (this.recordCount > 500) {
            this.safeguards.push('manager_approval');
            this.warnings.push(
                'Large production operation requires manager approval before execution'
            );
        }
    }

    /**
     * Validate backup requirements
     */
    validateBackupRequirements() {
        if (this.recordCount > 100 && !this.options.backupFile) {
            this.errors.push(
                'Backup is required for operations affecting >100 records. ' +
                'Provide backupFile option or set backupRequired=false.'
            );
        }

        if (this.options.backupFile) {
            // Verify backup file will be created in correct location
            const instancesDir = path.join(__dirname, '../../instances');
            const expectedPath = path.join(
                instancesDir,
                this.orgResolution.orgAlias,
                'backups'
            );

            if (!this.options.backupFile.includes(expectedPath)) {
                this.warnings.push(
                    `Backup file should be in: ${expectedPath}`
                );
            }

            console.log(`✓ Backup will be created: ${this.options.backupFile}`);
            console.log('');
        }
    }

    /**
     * Validate record count thresholds
     */
    validateRecordCountThresholds() {
        if (this.recordCount === 0) {
            this.warnings.push('Record count is 0. Verify this is intentional.');
        }

        if (this.recordCount > 100 && !this.safeguards.includes('backup')) {
            this.errors.push('Backup required for operations affecting >100 records');
        }

        if (this.recordCount > 1000 && !this.safeguards.includes('phased_execution')) {
            this.warnings.push(
                'Consider using phased execution for operations affecting >1000 records'
            );
        }

        console.log(`✓ Record count validated: ${this.recordCount} records`);
        console.log('');
    }

    /**
     * Generate validation summary
     */
    generateSummary() {
        const lines = [];

        lines.push('═'.repeat(60));
        lines.push('BULK OPERATION PRE-FLIGHT VALIDATION');
        lines.push('═'.repeat(60));

        if (this.orgResolution) {
            lines.push(`Org: ${this.orgResolution.orgAlias}`);
            lines.push(`Environment: ${this.envType}`);
        }

        lines.push(`Operation: ${this.operationType}`);
        lines.push(`Records: ${this.recordCount}`);
        lines.push(`Safeguards: ${this.safeguards.length}`);
        lines.push('═'.repeat(60));

        if (this.errors.length > 0) {
            lines.push('');
            lines.push('❌ ERRORS:');
            this.errors.forEach(err => lines.push(`  - ${err}`));
        }

        if (this.warnings.length > 0) {
            lines.push('');
            lines.push('⚠️  WARNINGS:');
            this.warnings.forEach(warn => lines.push(`  - ${warn}`));
        }

        if (this.safeguards.length > 0) {
            lines.push('');
            lines.push('✓ SAFEGUARDS:');
            this.safeguards.forEach(sg => lines.push(`  - ${sg}`));
        }

        lines.push('═'.repeat(60));

        return lines.join('\n');
    }

    /**
     * Get required confirmation type
     */
    getConfirmationType() {
        if (this.envType === 'production' && this.recordCount > 100) {
            return 'CONFIRM'; // Requires typing "CONFIRM"
        }

        if (this.safeguards.includes('double_confirmation')) {
            return 'CONFIRM';
        }

        return 'yes'; // Simple yes/no
    }
}

/**
 * Quick validation function
 */
async function validateBulkOperation(options) {
    const validator = new BulkOperationValidator(options);
    return await validator.validate();
}

module.exports = {
    BulkOperationValidator,
    validateBulkOperation
};

// CLI usage
if (require.main === module) {
    (async () => {
        const args = process.argv.slice(2);

        if (args.length < 3) {
            console.log('Usage: bulk-operation-validator.js <org-alias> <operation-type> <record-count> [options]');
            console.log('');
            console.log('Options:');
            console.log('  --source-user <id>      Source user ID for ownership transfers');
            console.log('  --target-user <id>      Target user ID for ownership transfers');
            console.log('  --backup-file <path>    Path to backup file');
            console.log('  --no-backup            Skip backup requirement');
            console.log('');
            console.log('Examples:');
            console.log('  bulk-operation-validator.js peregrine-main ownership-transfer 389 \\');
            console.log('    --source-user 005xxx --target-user 005yyy --backup-file /path/to/backup.json');
            console.log('');
            console.log('  bulk-operation-validator.js "peregrine production" bulk-update 150');
            process.exit(1);
        }

        const orgAlias = args[0];
        const operationType = args[1];
        const recordCount = parseInt(args[2]);

        const options = {
            orgAlias,
            operationType,
            recordCount,
            requiresUserValidation: false,
            backupRequired: true
        };

        // Parse flags
        for (let i = 3; i < args.length; i++) {
            if (args[i] === '--source-user' && args[i + 1]) {
                options.sourceUserId = args[i + 1];
                options.requiresUserValidation = true;
                i++;
            } else if (args[i] === '--target-user' && args[i + 1]) {
                options.targetUserId = args[i + 1];
                options.requiresUserValidation = true;
                i++;
            } else if (args[i] === '--backup-file' && args[i + 1]) {
                options.backupFile = args[i + 1];
                i++;
            } else if (args[i] === '--no-backup') {
                options.backupRequired = false;
            }
        }

        const validation = await validateBulkOperation(options);

        console.log('\n' + validation.summary);

        if (!validation.passed) {
            console.log('\n❌ Validation failed. Please address errors before proceeding.');
            process.exit(1);
        }

        console.log('\n✅ Validation passed. Operation can proceed with required safeguards.');

        // Show confirmation type needed
        const validator = new BulkOperationValidator(options);
        validator.orgResolution = validation.orgResolution;
        validator.envType = validation.envType;
        validator.safeguards = validation.safeguards;

        const confirmType = validator.getConfirmationType();
        console.log(`\nRequired confirmation: ${confirmType === 'CONFIRM' ? 'Type "CONFIRM"' : 'Type "yes"'}`);
    })();
}
