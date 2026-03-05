#!/usr/bin/env node

/**
 * Approval Framework Validator
 *
 * Pre-deployment validation for Salesforce custom approval frameworks.
 * Prevents common deployment failures by validating:
 * - Approval rule approver configuration
 * - Required field population
 * - Permission set FLS entries
 * - Object field access patterns
 *
 * Usage:
 *   node scripts/lib/approval-framework-validator.js <org-alias> [--fix]
 *
 * Exit codes:
 *   0 = All validations passed
 *   1 = Critical issues found (blocks deployment)
 *   2 = Warnings found (review recommended)
 *
 * @author Advanced Approvals Framework
 * @date 2025-10-04
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ApprovalFrameworkValidator {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.autoFix = options.fix || false;
        this.errors = [];
        this.warnings = [];
        this.fixes = [];
    }

    /**
     * Run all validations
     */
    async validate() {
        console.log(`\n${'='.repeat(70)}`);
        console.log('APPROVAL FRAMEWORK VALIDATION');
        console.log(`Org: ${this.orgAlias}`);
        console.log(`${'='.repeat(70)}\n`);

        await this.validateApprovalRules();
        await this.validateRequiredFields();
        await this.validatePermissionSets();
        await this.validateObjectFieldPaths();

        this.printReport();
        return this.getExitCode();
    }

    /**
     * Validation 1: Check approval rules have valid approver assignments
     */
    async validateApprovalRules() {
        console.log('📋 Validating approval rule configuration...');

        try {
            // Query approval rules
            const query = `
                SELECT Id, Rule_Name__c, Policy__c, Approver_Type__c,
                       Approver_User__c, Approver_Queue__c, Approver_Role__c,
                       Approver_Field__c, Active__c
                FROM Approval_Rule_Config__c
                WHERE Active__c = true
            `;

            const result = this.querySalesforce(query);

            if (!result.records || result.records.length === 0) {
                this.warnings.push({
                    check: 'Approval Rules',
                    message: 'No active approval rules found',
                    severity: 'WARNING'
                });
                return;
            }

            // Validate each rule has appropriate approver
            result.records.forEach(rule => {
                const issues = this.validateRuleApprover(rule);
                if (issues.length > 0) {
                    this.errors.push({
                        check: 'Approval Rules',
                        rule: rule.Rule_Name__c,
                        policy: rule.Policy__c,
                        issues: issues,
                        severity: 'CRITICAL'
                    });
                }
            });

            // Check for ManagerOfOwner rules - validate users have managers
            const hasManagerRules = result.records.some(
                r => r.Approver_Type__c === 'ManagerOfOwner'
            );

            if (hasManagerRules) {
                await this.validateManagerAssignments();
            }

            if (this.errors.filter(e => e.check === 'Approval Rules').length === 0) {
                console.log('  ✅ All approval rules have valid approver configuration\n');
            }

        } catch (error) {
            this.errors.push({
                check: 'Approval Rules',
                message: `Query failed: ${error.message}`,
                severity: 'CRITICAL'
            });
        }
    }

    /**
     * Validate a single rule's approver configuration
     */
    validateRuleApprover(rule) {
        const issues = [];

        switch (rule.Approver_Type__c) {
            case 'UserIdLiteral':
                if (!rule.Approver_User__c) {
                    issues.push('Approver_Type__c=UserIdLiteral but Approver_User__c is NULL');
                }
                break;
            case 'QueueIdLiteral':
                if (!rule.Approver_Queue__c) {
                    issues.push('Approver_Type__c=QueueIdLiteral but Approver_Queue__c is NULL');
                }
                break;
            case 'RoleIdLiteral':
                if (!rule.Approver_Role__c) {
                    issues.push('Approver_Type__c=RoleIdLiteral but Approver_Role__c is NULL');
                }
                break;
            case 'FieldValue':
                if (!rule.Approver_Field__c) {
                    issues.push('Approver_Type__c=FieldValue but Approver_Field__c is NULL');
                }
                break;
            case 'ManagerOfOwner':
            case 'ManagerOfOwner2Levels':
                // Validated separately
                break;
            default:
                issues.push(`Unknown Approver_Type__c: ${rule.Approver_Type__c}`);
        }

        return issues;
    }

    /**
     * Validate users have manager assignments for ManagerOfOwner rules
     */
    async validateManagerAssignments() {
        try {
            const query = `
                SELECT COUNT(Id) managerCount
                FROM User
                WHERE IsActive = true AND ManagerId != null
            `;

            const result = this.querySalesforce(query);
            const managerCount = result.records[0].managerCount;

            if (managerCount === 0) {
                this.errors.push({
                    check: 'Manager Assignments',
                    message: 'ManagerOfOwner rules exist but no active users have managers assigned',
                    severity: 'CRITICAL',
                    fix: 'Run: node scripts/lib/org-hierarchy-seeder.js to create test hierarchy'
                });
            } else {
                console.log(`  ✅ ${managerCount} active users have manager assignments\n`);
            }

        } catch (error) {
            this.warnings.push({
                check: 'Manager Assignments',
                message: `Could not verify manager assignments: ${error.message}`,
                severity: 'WARNING'
            });
        }
    }

    /**
     * Validation 2: Check required fields are populated in code
     */
    async validateRequiredFields() {
        console.log('📋 Validating required fields...');

        const objectsToCheck = [
            'Approval_Request__c',
            'Approval_Snapshot__c'
        ];

        for (const objectName of objectsToCheck) {
            await this.validateObjectRequiredFields(objectName);
        }
    }

    /**
     * Validate required fields for a specific object
     */
    async validateObjectRequiredFields(objectName) {
        try {
            // Describe object to get required fields
            const cmd = `sf sobject describe --sobject ${objectName} --target-org ${this.orgAlias} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

            const requiredFields = result.result.fields
                .filter(f => !f.nillable && !f.defaultedOnCreate && f.createable)
                .map(f => f.name);

            if (requiredFields.length === 0) {
                console.log(`  ✅ ${objectName}: No required fields\n`);
                return;
            }

            // Check if ApprovalEngine.cls populates these fields
            const apexFile = this.findApexFile('ApprovalEngine.cls');

            if (!apexFile) {
                this.warnings.push({
                    check: 'Required Fields',
                    object: objectName,
                    message: 'Could not find ApprovalEngine.cls to validate field population',
                    severity: 'WARNING'
                });
                return;
            }

            const apexContent = fs.readFileSync(apexFile, 'utf8');
            const missingFields = [];

            requiredFields.forEach(fieldName => {
                // Check if field referenced in object instantiation (handles multi-line)
                const pattern = new RegExp(`new\\s+${objectName}\\s*\\([\\s\\S]*?${fieldName}`, 'i');
                if (!pattern.test(apexContent)) {
                    missingFields.push(fieldName);
                }
            });

            if (missingFields.length > 0) {
                this.errors.push({
                    check: 'Required Fields',
                    object: objectName,
                    message: `Required fields not populated in ApprovalEngine.cls: ${missingFields.join(', ')}`,
                    severity: 'CRITICAL',
                    fix: `Add fields to ${objectName} instantiation in ApprovalEngine.cls`
                });
            } else {
                console.log(`  ✅ ${objectName}: All ${requiredFields.length} required fields populated\n`);
            }

        } catch (error) {
            this.warnings.push({
                check: 'Required Fields',
                object: objectName,
                message: `Validation failed: ${error.message}`,
                severity: 'WARNING'
            });
        }
    }

    /**
     * Validation 3: Check permission sets have FLS for custom fields
     */
    async validatePermissionSets() {
        console.log('📋 Validating permission set FLS...');

        const fieldToCheck = 'Approval_Request__c.Approver__c';
        const permissionSets = [
            'Approval_Framework_Access',
            'Approval_Framework_Admin',
            'Approval_Framework_Approver',
            'Approval_Framework_Submitter'
        ];

        for (const psName of permissionSets) {
            await this.validatePermissionSetFLS(psName, fieldToCheck);
        }
    }

    /**
     * Validate FLS in a specific permission set
     */
    async validatePermissionSetFLS(psName, field) {
        try {
            // Find permission set file
            const psFile = this.findPermissionSetFile(psName);

            if (!psFile) {
                this.errors.push({
                    check: 'Permission Set FLS',
                    permissionSet: psName,
                    message: `Permission set file not found`,
                    severity: 'CRITICAL'
                });
                return;
            }

            const psContent = fs.readFileSync(psFile, 'utf8');
            const fieldName = field.split('.')[1];

            // Check if field is referenced in permission set
            if (!psContent.includes(`<field>${field}</field>`)) {
                this.errors.push({
                    check: 'Permission Set FLS',
                    permissionSet: psName,
                    field: field,
                    message: `Missing FLS entry for ${field}`,
                    severity: 'CRITICAL',
                    fix: `Add fieldPermissions block for ${fieldName} to ${psFile}`
                });
            } else {
                console.log(`  ✅ ${psName}: FLS configured for ${fieldName}\n`);
            }

        } catch (error) {
            this.warnings.push({
                check: 'Permission Set FLS',
                permissionSet: psName,
                message: `Validation failed: ${error.message}`,
                severity: 'WARNING'
            });
        }
    }

    /**
     * Validation 4: Check object field access patterns
     */
    async validateObjectFieldPaths() {
        console.log('📋 Validating object field access patterns...');

        // Check if ApprovalEngine handles Quote objects correctly
        const apexFile = this.findApexFile('ApprovalEngine.cls');

        if (!apexFile) {
            this.warnings.push({
                check: 'Field Access Patterns',
                message: 'Could not find ApprovalEngine.cls',
                severity: 'WARNING'
            });
            return;
        }

        const apexContent = fs.readFileSync(apexFile, 'utf8');

        // Check for Quote object handling
        const hasQuoteCheck = /if\s*\(\s*objectType\s*==\s*['"]Quote['"]\s*\)/i.test(apexContent);
        const hasOppOwnerPath = /Opportunity\.OwnerId/i.test(apexContent);

        if (!hasQuoteCheck || !hasOppOwnerPath) {
            this.errors.push({
                check: 'Field Access Patterns',
                message: 'ApprovalEngine.cls missing Quote object special handling (Quote → Opportunity.OwnerId)',
                severity: 'CRITICAL',
                fix: 'Add Quote object detection and relationship traversal for OwnerId field'
            });
        } else {
            console.log('  ✅ Quote object field access pattern implemented\n');
        }
    }

    /**
     * Helper: Query Salesforce
     */
    querySalesforce(soql) {
        const cmd = `sf data query --query "${soql.replace(/\n/g, ' ').trim()}" --target-org ${this.orgAlias} --json`;
        const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));
        return result.result;
    }

    /**
     * Helper: Find Apex file
     */
    findApexFile(fileName) {
        const possiblePaths = [
            `force-app/main/default/classes/${fileName}`,
            `classes/${fileName}`,
            `src/classes/${fileName}`
        ];

        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }

        return null;
    }

    /**
     * Helper: Find permission set file
     */
    findPermissionSetFile(psName) {
        const possiblePaths = [
            `force-app/main/default/permissionsets/${psName}.permissionset-meta.xml`,
            `metadata/permissionsets/${psName}.permissionset-meta.xml`,
            `permissionsets/${psName}.permissionset-meta.xml`
        ];

        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }

        return null;
    }

    /**
     * Print validation report
     */
    printReport() {
        console.log(`\n${'='.repeat(70)}`);
        console.log('VALIDATION REPORT');
        console.log(`${'='.repeat(70)}\n`);

        if (this.errors.length === 0 && this.warnings.length === 0) {
            console.log('✅ ALL VALIDATIONS PASSED\n');
            console.log('Approval framework is ready for deployment.\n');
            return;
        }

        if (this.errors.length > 0) {
            console.log(`❌ CRITICAL ISSUES: ${this.errors.length}\n`);
            this.errors.forEach((error, idx) => {
                console.log(`${idx + 1}. [${error.check}] ${error.severity}`);
                if (error.rule) console.log(`   Rule: ${error.rule} (${error.policy})`);
                if (error.object) console.log(`   Object: ${error.object}`);
                if (error.permissionSet) console.log(`   Permission Set: ${error.permissionSet}`);
                if (error.field) console.log(`   Field: ${error.field}`);

                if (error.issues) {
                    error.issues.forEach(issue => console.log(`   - ${issue}`));
                } else {
                    console.log(`   ${error.message}`);
                }

                if (error.fix) {
                    console.log(`   💡 Fix: ${error.fix}`);
                }
                console.log('');
            });
        }

        if (this.warnings.length > 0) {
            console.log(`⚠️  WARNINGS: ${this.warnings.length}\n`);
            this.warnings.forEach((warning, idx) => {
                console.log(`${idx + 1}. [${warning.check}] ${warning.severity}`);
                if (warning.object) console.log(`   Object: ${warning.object}`);
                console.log(`   ${warning.message}\n`);
            });
        }

        console.log(`${'='.repeat(70)}\n`);
    }

    /**
     * Get exit code based on validation results
     */
    getExitCode() {
        if (this.errors.length > 0) {
            console.log('❌ DEPLOYMENT BLOCKED: Critical issues must be resolved\n');
            return 1;
        }

        if (this.warnings.length > 0) {
            console.log('⚠️  REVIEW RECOMMENDED: Warnings should be addressed\n');
            return 2;
        }

        return 0;
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Usage: node approval-framework-validator.js <org-alias> [--fix]');
        process.exit(1);
    }

    const orgAlias = args[0];
    const autoFix = args.includes('--fix');

    const validator = new ApprovalFrameworkValidator(orgAlias, { fix: autoFix });

    validator.validate()
        .then(exitCode => process.exit(exitCode))
        .catch(error => {
            console.error('Validation failed:', error.message);
            process.exit(1);
        });
}

module.exports = ApprovalFrameworkValidator;
