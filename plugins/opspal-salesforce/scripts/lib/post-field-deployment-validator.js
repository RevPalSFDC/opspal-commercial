#!/usr/bin/env node

/**
 * Post-Field Deployment Validator
 *
 * Automatically verifies permission set FLS entries after custom field deployment.
 * Detects missing field-level security configurations that would prevent users
 * from accessing newly deployed fields.
 *
 * Features:
 * - Queries all permission sets for FLS on specified field
 * - Verifies field accessibility to expected profiles
 * - Checks validation rules that reference the field
 * - Identifies layouts that should display the field
 * - Generates remediation checklist
 *
 * Usage:
 *   node scripts/lib/post-field-deployment-validator.js <org-alias> <object-api-name> <field-api-name>
 *
 * Example:
 *   node scripts/lib/post-field-deployment-validator.js delta-sandbox Approval_Request__c Approver__c
 *
 * Exit codes:
 *   0 = All FLS configured correctly
 *   1 = Missing critical FLS entries
 *   2 = FLS present but potential improvements
 *
 * @author Approval Framework QA Learnings
 * @date 2025-10-04
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class PostFieldDeploymentValidator {
    constructor(orgAlias, objectName, fieldName) {
        this.orgAlias = orgAlias;
        this.objectName = objectName;
        this.fieldName = fieldName;
        this.issues = {
            CRITICAL: [],
            WARNING: [],
            INFO: []
        };
        this.fieldMetadata = null;
    }

    /**
     * Run validation
     */
    async validate() {
        console.log(`\n${'='.repeat(70)}`);
        console.log('POST-FIELD DEPLOYMENT VALIDATION');
        console.log(`Org: ${this.orgAlias}`);
        console.log(`Object: ${this.objectName}`);
        console.log(`Field: ${this.fieldName}`);
        console.log(`${'='.repeat(70)}\n`);

        // 1. Verify field exists
        console.log('📋 Step 1: Verifying field deployment...');
        if (!await this.verifyFieldExists()) {
            console.error('❌ ERROR: Field not found in org\n');
            return 1;
        }
        console.log('✅ Field found in org\n');

        // 2. Check permission set FLS
        console.log('📋 Step 2: Checking permission set FLS...');
        await this.checkPermissionSetFLS();

        // 3. Check profile FLS
        console.log('📋 Step 3: Checking profile FLS...');
        await this.checkProfileFLS();

        // 4. Check validation rules
        console.log('📋 Step 4: Checking validation rules...');
        await this.checkValidationRules();

        // 5. Check page layouts
        console.log('📋 Step 5: Checking page layouts...');
        await this.checkPageLayouts();

        // 6. Check flows
        console.log('📋 Step 6: Checking flows...');
        await this.checkFlows();

        // Print results
        this.printReport();
        return this.getExitCode();
    }

    /**
     * Verify field exists in org
     */
    async verifyFieldExists() {
        try {
            const cmd = `sf sobject describe --sobject ${this.objectName} --target-org ${this.orgAlias} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

            if (!result.result || !result.result.fields) {
                return false;
            }

            const field = result.result.fields.find(f => f.name === this.fieldName);

            if (field) {
                this.fieldMetadata = field;
                console.log(`  Field Type: ${field.type}`);
                console.log(`  Required: ${!field.nillable && !field.defaultedOnCreate}`);
                console.log(`  Custom: ${field.custom}`);
                return true;
            }

            return false;

        } catch (error) {
            console.error(`  Error verifying field: ${error.message}`);
            return false;
        }
    }

    /**
     * Check permission set FLS
     */
    async checkPermissionSetFLS() {
        try {
            const fullFieldName = `${this.objectName}.${this.fieldName}`;

            // Query all permission sets with FLS for this field
            const query = `
                SELECT Parent.Label, Parent.Name, Field, PermissionsRead, PermissionsEdit
                FROM FieldPermissions
                WHERE Field = '${fullFieldName}'
                AND Parent.IsOwnedByProfile = false
            `.replace(/\n/g, ' ').trim();

            const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

            const permSets = result.result.records || [];

            if (permSets.length === 0) {
                this.issues.CRITICAL.push({
                    category: 'Permission Set FLS',
                    issue: 'No permission sets grant access to this field',
                    impact: 'Users cannot access field unless profile grants access',
                    recommendation: 'Add field to relevant permission sets with appropriate read/edit access'
                });
                console.log('  ❌ No permission sets found with FLS for this field\n');
            } else {
                console.log(`  ✅ Found ${permSets.length} permission set(s) with FLS:\n`);

                permSets.forEach(ps => {
                    const label = ps.Parent?.Label || ps.Parent?.Name || 'Unknown';
                    const read = ps.PermissionsRead ? '✓' : '✗';
                    const edit = ps.PermissionsEdit ? '✓' : '✗';

                    console.log(`    ${label}`);
                    console.log(`      Read: ${read}  Edit: ${edit}`);

                    // Check if read-only when field is required
                    if (this.fieldMetadata && !this.fieldMetadata.nillable && ps.PermissionsRead && !ps.PermissionsEdit) {
                        this.issues.WARNING.push({
                            category: 'Permission Set FLS',
                            issue: `${label} has read-only access to required field`,
                            impact: 'Users cannot create/edit records with this permission set',
                            recommendation: `Grant edit permission in ${label} permission set`
                        });
                    }
                });
                console.log('');
            }

        } catch (error) {
            console.error(`  ⚠️  Error checking permission sets: ${error.message}\n`);
            this.issues.WARNING.push({
                category: 'Permission Set FLS',
                issue: 'Unable to verify permission set FLS',
                impact: 'Manual verification required',
                recommendation: 'Check permission sets manually in Setup'
            });
        }
    }

    /**
     * Check profile FLS
     */
    async checkProfileFLS() {
        try {
            const fullFieldName = `${this.objectName}.${this.fieldName}`;

            // Query all profiles with FLS for this field
            const query = `
                SELECT Parent.Name, Field, PermissionsRead, PermissionsEdit
                FROM FieldPermissions
                WHERE Field = '${fullFieldName}'
                AND Parent.IsOwnedByProfile = true
            `.replace(/\n/g, ' ').trim();

            const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

            const profiles = result.result.records || [];

            if (profiles.length === 0) {
                this.issues.INFO.push({
                    category: 'Profile FLS',
                    issue: 'No profiles grant access to this field',
                    impact: 'Access controlled via permission sets only',
                    recommendation: 'Verify this is intentional for your permission strategy'
                });
                console.log('  ℹ️  No profiles found with FLS (permission set strategy)\n');
            } else {
                console.log(`  ✅ Found ${profiles.length} profile(s) with FLS:\n`);

                profiles.forEach(prof => {
                    const name = prof.Parent?.Name || 'Unknown';
                    const read = prof.PermissionsRead ? '✓' : '✗';
                    const edit = prof.PermissionsEdit ? '✓' : '✗';

                    console.log(`    ${name}`);
                    console.log(`      Read: ${read}  Edit: ${edit}`);
                });
                console.log('');
            }

        } catch (error) {
            console.error(`  ⚠️  Error checking profiles: ${error.message}\n`);
        }
    }

    /**
     * Check validation rules that reference this field
     */
    async checkValidationRules() {
        try {
            const query = `
                SELECT ValidationName, Active, ErrorDisplayField
                FROM ValidationRule
                WHERE EntityDefinition.QualifiedApiName = '${this.objectName}'
            `.replace(/\n/g, ' ').trim();

            const cmd = `sf data query --query "${query}" --use-tooling-api --target-org ${this.orgAlias} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

            const rules = result.result.records || [];

            // Filter rules that might reference this field (basic check)
            const relevantRules = rules.filter(r =>
                r.ErrorDisplayField === this.fieldName
            );

            if (relevantRules.length > 0) {
                console.log(`  ℹ️  Found ${relevantRules.length} validation rule(s) with this field as error display:\n`);

                relevantRules.forEach(rule => {
                    console.log(`    ${rule.ValidationName} (${rule.Active ? 'Active' : 'Inactive'})`);
                });
                console.log('');

                this.issues.INFO.push({
                    category: 'Validation Rules',
                    issue: `${relevantRules.length} validation rule(s) display errors on this field`,
                    impact: 'Users need edit access to see validation errors',
                    recommendation: 'Ensure permission sets grant edit access for users who trigger these rules'
                });
            } else {
                console.log('  ✅ No validation rules display errors on this field\n');
            }

        } catch (error) {
            console.log(`  ⚠️  Unable to query validation rules: ${error.message}\n`);
        }
    }

    /**
     * Check page layouts
     */
    async checkPageLayouts() {
        try {
            const query = `
                SELECT Name, TableEnumOrId
                FROM Layout
                WHERE TableEnumOrId = '${this.objectName}'
            `.replace(/\n/g, ' ').trim();

            const cmd = `sf data query --query "${query}" --use-tooling-api --target-org ${this.orgAlias} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

            const layouts = result.result.records || [];

            if (layouts.length > 0) {
                console.log(`  ℹ️  Found ${layouts.length} page layout(s) for ${this.objectName}:\n`);

                layouts.forEach(layout => {
                    console.log(`    ${layout.Name}`);
                });
                console.log('');

                this.issues.INFO.push({
                    category: 'Page Layouts',
                    issue: `${layouts.length} page layout(s) exist for this object`,
                    impact: 'Field may need to be added to layouts for visibility',
                    recommendation: 'Verify field is placed on relevant page layouts'
                });
            }

        } catch (error) {
            console.log(`  ⚠️  Unable to query page layouts: ${error.message}\n`);
        }
    }

    /**
     * Check flows that might need this field
     */
    async checkFlows() {
        try {
            const query = `
                SELECT Definition.DeveloperName, MasterLabel, VersionNumber
                FROM Flow
                WHERE ProcessType = 'AutoLaunchedFlow' OR ProcessType = 'Workflow'
            `.replace(/\n/g, ' ').trim();

            const cmd = `sf data query --query "${query}" --use-tooling-api --target-org ${this.orgAlias} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

            const flows = result.result.records || [];

            if (flows.length > 0) {
                console.log(`  ℹ️  Found ${flows.length} flow(s) in org\n`);
                console.log(`  💡 Recommendation: Review flows that operate on ${this.objectName}\n`);
                console.log(`     to ensure they handle the new ${this.fieldName} field\n`);

                this.issues.INFO.push({
                    category: 'Flows',
                    issue: `${flows.length} flow(s) exist in org`,
                    impact: 'Flows on this object may need to populate/read this field',
                    recommendation: `Review flows that operate on ${this.objectName}`
                });
            }

        } catch (error) {
            console.log(`  ⚠️  Unable to query flows: ${error.message}\n`);
        }
    }

    /**
     * Print validation report
     */
    printReport() {
        console.log(`\n${'='.repeat(70)}`);
        console.log('VALIDATION REPORT');
        console.log(`${'='.repeat(70)}\n`);

        const criticalCount = this.issues.CRITICAL.length;
        const warningCount = this.issues.WARNING.length;
        const infoCount = this.issues.INFO.length;

        if (criticalCount === 0 && warningCount === 0) {
            console.log('✅ ALL CHECKS PASSED\n');
            console.log('Field is properly configured with FLS and ready for use.\n');

            if (infoCount > 0) {
                console.log(`ℹ️  ${infoCount} informational item(s):\n`);
                this.printIssues(this.issues.INFO);
            }
            return;
        }

        // Print critical issues
        if (criticalCount > 0) {
            console.log(`❌ CRITICAL ISSUES: ${criticalCount}\n`);
            this.printIssues(this.issues.CRITICAL);
        }

        // Print warnings
        if (warningCount > 0) {
            console.log(`⚠️  WARNINGS: ${warningCount}\n`);
            this.printIssues(this.issues.WARNING);
        }

        // Print info
        if (infoCount > 0) {
            console.log(`ℹ️  INFORMATIONAL: ${infoCount}\n`);
            this.printIssues(this.issues.INFO);
        }

        // Remediation checklist
        console.log(`${'='.repeat(70)}`);
        console.log('REMEDIATION CHECKLIST');
        console.log(`${'='.repeat(70)}\n`);

        if (criticalCount > 0 || warningCount > 0) {
            console.log('Follow these steps to complete field setup:\n');

            let step = 1;

            [...this.issues.CRITICAL, ...this.issues.WARNING].forEach(issue => {
                console.log(`${step}. [${issue.category}] ${issue.recommendation}`);
                step++;
            });
            console.log('');
        }

        console.log(`${'='.repeat(70)}\n`);
    }

    /**
     * Print issue details
     */
    printIssues(issues) {
        issues.forEach((issue, idx) => {
            console.log(`${idx + 1}. [${issue.category}]`);
            console.log(`   Issue: ${issue.issue}`);
            console.log(`   Impact: ${issue.impact}`);
            console.log(`   Recommendation: ${issue.recommendation}`);
            console.log('');
        });
    }

    /**
     * Get exit code based on issues
     */
    getExitCode() {
        if (this.issues.CRITICAL.length > 0) {
            console.log('❌ CRITICAL ISSUES: Field deployment incomplete\n');
            return 1;
        }

        if (this.issues.WARNING.length > 0) {
            console.log('⚠️  WARNINGS: Review recommended before production use\n');
            return 2;
        }

        console.log('✅ SUCCESS: Field is properly configured\n');
        return 0;
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.error('Usage: node post-field-deployment-validator.js <org-alias> <object-api-name> <field-api-name>');
        console.error('\nExample:');
        console.error('  node post-field-deployment-validator.js delta-sandbox Approval_Request__c Approver__c');
        process.exit(1);
    }

    const orgAlias = args[0];
    const objectName = args[1];
    const fieldName = args[2];

    const validator = new PostFieldDeploymentValidator(orgAlias, objectName, fieldName);

    validator.validate()
        .then(exitCode => process.exit(exitCode))
        .catch(error => {
            console.error('Validation failed:', error.message);
            console.error(error.stack);
            process.exit(1);
        });
}

module.exports = PostFieldDeploymentValidator;
