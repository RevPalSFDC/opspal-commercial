#!/usr/bin/env node

/**
 * Deployment Verification Script
 *
 * This script performs comprehensive verification of Salesforce deployments
 * to prevent false success reports and ensure changes are actually applied.
 *
 * Usage: node deployment-verifier.js --org [alias] --type [field|flow|permset|all]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DeploymentVerifier {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.results = {
            preChecks: [],
            deploymentIssues: [],
            postChecks: [],
            recommendations: []
        };
    }

    /**
     * Run a Salesforce CLI command and return the result
     */
    runCommand(command, parseJson = true) {
        try {
            const result = execSync(command, { encoding: 'utf8' });
            return parseJson ? JSON.parse(result) : result;
        } catch (error) {
            console.error(`Command failed: ${command}`);
            console.error(error.message);
            return null;
        }
    }

    /**
     * Pre-deployment checks
     */
    async runPreDeploymentChecks(objectName, fields = []) {
        console.log('\n🔍 Running Pre-Deployment Checks...\n');

        // Check if object exists
        const objectQuery = `SELECT QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName = '${objectName}'`;
        const objectResult = this.runCommand(
            `sf data query --query "${objectQuery}" --target-org ${this.orgAlias} --use-tooling-api --json`
        );

        if (!objectResult?.result?.records?.length) {
            this.results.preChecks.push({
                status: 'ERROR',
                message: `Object ${objectName} does not exist in org`
            });
            return false;
        }

        this.results.preChecks.push({
            status: 'SUCCESS',
            message: `Object ${objectName} exists`
        });

        // Check existing fields
        if (fields.length > 0) {
            const fieldQuery = `SELECT QualifiedApiName, DataType FROM FieldDefinition WHERE EntityDefinitionId = '${objectName}'`;
            const fieldResult = this.runCommand(
                `sf data query --query "${fieldQuery}" --target-org ${this.orgAlias} --use-tooling-api --json`
            );

            const existingFields = fieldResult?.result?.records?.map(r => r.QualifiedApiName) || [];

            fields.forEach(field => {
                if (existingFields.includes(field)) {
                    this.results.preChecks.push({
                        status: 'WARNING',
                        message: `Field ${field} already exists on ${objectName}`
                    });
                } else {
                    this.results.preChecks.push({
                        status: 'INFO',
                        message: `Field ${field} will be created on ${objectName}`
                    });
                }
            });
        }

        return true;
    }

    /**
     * Verify field deployment
     */
    async verifyFieldDeployment(objectName, fieldName) {
        console.log(`\n✓ Verifying field ${objectName}.${fieldName}...`);

        // Check if field exists in metadata (remove IsCreateable and IsUpdateable as they don't exist on FieldDefinition)
        const fieldQuery = `SELECT QualifiedApiName, DataType FROM FieldDefinition WHERE EntityDefinitionId = '${objectName}' AND QualifiedApiName = '${fieldName}'`;
        const result = this.runCommand(
            `sf data query --query "${fieldQuery}" --target-org ${this.orgAlias} --use-tooling-api --json`
        );

        if (!result?.result?.records?.length) {
            this.results.postChecks.push({
                status: 'ERROR',
                message: `Field ${fieldName} NOT found on ${objectName}`
            });
            return false;
        }

        const field = result.result.records[0];
        this.results.postChecks.push({
            status: 'SUCCESS',
            message: `Field ${fieldName} exists - Type: ${field.DataType}`
        });

        // Test field accessibility with SOQL
        try {
            const testQuery = `SELECT Id, ${fieldName} FROM ${objectName} LIMIT 1`;
            this.runCommand(
                `sf data query --query "${testQuery}" --target-org ${this.orgAlias} --json`
            );
            this.results.postChecks.push({
                status: 'SUCCESS',
                message: `Field ${fieldName} is queryable via SOQL`
            });
        } catch (error) {
            this.results.postChecks.push({
                status: 'ERROR',
                message: `Field ${fieldName} is NOT queryable - may have permission issues`
            });
            return false;
        }

        return true;
    }

    /**
     * Verify permission set deployment
     */
    async verifyPermissionSet(permSetName, expectedFields = []) {
        console.log(`\n✓ Verifying permission set ${permSetName}...`);

        // Check if permission set exists
        const permSetQuery = `SELECT Id, Name FROM PermissionSet WHERE Name = '${permSetName}'`;
        const permSetResult = this.runCommand(
            `sf data query --query "${permSetQuery}" --target-org ${this.orgAlias} --json`
        );

        if (!permSetResult?.result?.records?.length) {
            this.results.postChecks.push({
                status: 'ERROR',
                message: `Permission Set ${permSetName} NOT found`
            });
            return false;
        }

        const permSetId = permSetResult.result.records[0].Id;
        this.results.postChecks.push({
            status: 'SUCCESS',
            message: `Permission Set ${permSetName} exists (${permSetId})`
        });

        // Check field permissions
        if (expectedFields.length > 0) {
            const fieldList = expectedFields.map(f => `'${f}'`).join(',');
            const fieldPermQuery = `SELECT Field, PermissionsEdit, PermissionsRead FROM FieldPermissions WHERE ParentId = '${permSetId}' AND Field IN (${fieldList})`;
            const fieldPermResult = this.runCommand(
                `sf data query --query "${fieldPermQuery}" --target-org ${this.orgAlias} --json`
            );

            const grantedFields = fieldPermResult?.result?.records || [];
            const grantedFieldNames = grantedFields.map(f => f.Field);

            expectedFields.forEach(field => {
                const permission = grantedFields.find(f => f.Field === field);
                if (permission) {
                    this.results.postChecks.push({
                        status: 'SUCCESS',
                        message: `${field} - Read: ${permission.PermissionsRead}, Edit: ${permission.PermissionsEdit}`
                    });
                } else {
                    this.results.postChecks.push({
                        status: 'ERROR',
                        message: `${field} - NO permissions found in permission set`
                    });
                }
            });
        }

        return true;
    }

    /**
     * Verify flow deployment
     */
    async verifyFlow(flowName) {
        console.log(`\n✓ Verifying flow ${flowName}...`);

        // Check if flow exists and is active
        const flowQuery = `SELECT Id, Definition.DeveloperName, MasterLabel, Status, VersionNumber FROM Flow WHERE Definition.DeveloperName = '${flowName}'`;
        const result = this.runCommand(
            `sf data query --query "${flowQuery}" --target-org ${this.orgAlias} --use-tooling-api --json`
        );

        if (!result?.result?.records?.length) {
            this.results.postChecks.push({
                status: 'ERROR',
                message: `Flow ${flowName} NOT found`
            });
            return false;
        }

        const flow = result.result.records[0];
        this.results.postChecks.push({
            status: flow.Status === 'Active' ? 'SUCCESS' : 'WARNING',
            message: `Flow ${flowName} - Status: ${flow.Status}, Version: ${flow.VersionNumber}`
        });

        return true;
    }

    /**
     * Generate recommendations based on results
     */
    generateRecommendations() {
        const errors = [...this.results.preChecks, ...this.results.postChecks]
            .filter(r => r.status === 'ERROR');

        if (errors.length > 0) {
            this.results.recommendations.push('🔴 Critical issues found:');
            errors.forEach(error => {
                this.results.recommendations.push(`  - ${error.message}`);

                // Specific recommendations based on error type
                if (error.message.includes('NOT queryable')) {
                    this.results.recommendations.push('    → Check field-level security and permission sets');
                }
                if (error.message.includes('NOT found on')) {
                    this.results.recommendations.push('    → Redeploy the field metadata');
                }
                if (error.message.includes('NO permissions')) {
                    this.results.recommendations.push('    → Update permission set to include this field');
                }
            });
        }

        const warnings = [...this.results.preChecks, ...this.results.postChecks]
            .filter(r => r.status === 'WARNING');

        if (warnings.length > 0) {
            this.results.recommendations.push('\n⚠️  Warnings:');
            warnings.forEach(warning => {
                this.results.recommendations.push(`  - ${warning.message}`);
            });
        }
    }

    /**
     * Print results summary
     */
    printResults() {
        console.log('\n' + '='.repeat(60));
        console.log('DEPLOYMENT VERIFICATION SUMMARY');
        console.log('='.repeat(60));

        // Count results by status
        const allResults = [...this.results.preChecks, ...this.results.postChecks];
        const summary = {
            SUCCESS: allResults.filter(r => r.status === 'SUCCESS').length,
            ERROR: allResults.filter(r => r.status === 'ERROR').length,
            WARNING: allResults.filter(r => r.status === 'WARNING').length,
            INFO: allResults.filter(r => r.status === 'INFO').length
        };

        console.log(`\n✅ Success: ${summary.SUCCESS}`);
        console.log(`❌ Errors: ${summary.ERROR}`);
        console.log(`⚠️  Warnings: ${summary.WARNING}`);
        console.log(`ℹ️  Info: ${summary.INFO}`);

        if (this.results.recommendations.length > 0) {
            console.log('\n📋 RECOMMENDATIONS:');
            this.results.recommendations.forEach(rec => console.log(rec));
        }

        // Overall status
        console.log('\n' + '='.repeat(60));
        if (summary.ERROR === 0) {
            console.log('✅ DEPLOYMENT VERIFIED SUCCESSFULLY');
        } else {
            console.log('❌ DEPLOYMENT VERIFICATION FAILED');
            console.log(`   ${summary.ERROR} critical issue(s) need to be resolved`);
        }
        console.log('='.repeat(60) + '\n');

        return summary.ERROR === 0;
    }
}

/**
 * Main execution
 */
async function main() {
    const args = process.argv.slice(2);
    const orgIndex = args.indexOf('--org');
    const typeIndex = args.indexOf('--type');

    if (orgIndex === -1 || orgIndex === args.length - 1) {
        console.error('Usage: node deployment-verifier.js --org [alias] --type [field|flow|permset|all]');
        process.exit(1);
    }

    const orgAlias = args[orgIndex + 1];
    const verificationType = typeIndex !== -1 ? args[typeIndex + 1] : 'all';

    const verifier = new DeploymentVerifier(orgAlias);

    // Example verification (customize based on your deployment)
    if (verificationType === 'field' || verificationType === 'all') {
        await verifier.verifyFieldDeployment('Implementation__c', 'Account__c');
        await verifier.verifyFieldDeployment('Implementation__c', 'Opportunity__c');
        await verifier.verifyFieldDeployment('Implementation__c', 'Implementation_Status__c');
        await verifier.verifyFieldDeployment('Account', 'Last_Onboarding_Complete_Date__c');
    }

    if (verificationType === 'permset' || verificationType === 'all') {
        await verifier.verifyPermissionSet('GTM_Internal', [
            'Implementation__c.Account__c',
            'Implementation__c.Opportunity__c',
            'Implementation__c.Implementation_Status__c',
            'Account.Last_Onboarding_Complete_Date__c'
        ]);
    }

    if (verificationType === 'flow' || verificationType === 'all') {
        await verifier.verifyFlow('Implementation_Data_Handler');
        await verifier.verifyFlow('Opportunity_Data_Handler');
    }

    verifier.generateRecommendations();
    const success = verifier.printResults();

    process.exit(success ? 0 : 1);
}

// Run if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('Verification failed:', error);
        process.exit(1);
    });
}

module.exports = { DeploymentVerifier };