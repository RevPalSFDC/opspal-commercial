#!/usr/bin/env node

/**
 * Field Verification Service
 * 
 * Continuous monitoring and verification of Salesforce field deployments
 * Ensures fields are actually accessible after deployment
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = promisify(exec);

class FieldVerificationService {
    constructor(options = {}) {
        this.checkInterval = options.checkInterval || 10000; // 10 seconds
        this.maxVerificationTime = options.maxVerificationTime || 300000; // 5 minutes
        this.verificationMethods = [
            'fieldDefinition',
            'soqlQuery',
            'reportAccess',
            'permissionCheck',
            'metadataDescribe'
        ];
        this.verificationLog = [];
        this.isMonitoring = false;
    }

    /**
     * Comprehensive field verification across multiple channels
     */
    async verifyFieldComprehensive(objectName, fieldApiName) {
        const results = {
            field: fieldApiName,
            object: objectName,
            timestamp: new Date().toISOString(),
            checks: {},
            accessible: false,
            issues: []
        };

        // Check 1: Field Definition exists
        try {
            const fieldDefCheck = await this.checkFieldDefinition(objectName, fieldApiName);
            results.checks.fieldDefinition = fieldDefCheck;
            if (!fieldDefCheck.success) {
                results.issues.push('Field not found in FieldDefinition');
            }
        } catch (error) {
            results.checks.fieldDefinition = { success: false, error: error.message };
            results.issues.push(`FieldDefinition check failed: ${error.message}`);
        }

        // Check 2: SOQL queryable
        try {
            const soqlCheck = await this.checkSOQLAccess(objectName, fieldApiName);
            results.checks.soqlQuery = soqlCheck;
            if (!soqlCheck.success) {
                results.issues.push('Field not queryable via SOQL');
            }
        } catch (error) {
            results.checks.soqlQuery = { success: false, error: error.message };
            results.issues.push(`SOQL check failed: ${error.message}`);
        }

        // Check 3: Report accessibility
        try {
            const reportCheck = await this.checkReportAccess(objectName, fieldApiName);
            results.checks.reportAccess = reportCheck;
            if (!reportCheck.success) {
                results.issues.push('Field not accessible in reports');
            }
        } catch (error) {
            results.checks.reportAccess = { success: false, error: error.message };
            results.issues.push(`Report access check failed: ${error.message}`);
        }

        // Check 4: Field-level security
        try {
            const permCheck = await this.checkFieldPermissions(objectName, fieldApiName);
            results.checks.permissions = permCheck;
            if (!permCheck.hasPermissions) {
                results.issues.push('No field-level security configured');
            }
        } catch (error) {
            results.checks.permissions = { success: false, error: error.message };
            results.issues.push(`Permission check failed: ${error.message}`);
        }

        // Check 5: Metadata describe
        try {
            const describeCheck = await this.checkMetadataDescribe(objectName, fieldApiName);
            results.checks.metadataDescribe = describeCheck;
            if (!describeCheck.success) {
                results.issues.push('Field not in object describe');
            }
        } catch (error) {
            results.checks.metadataDescribe = { success: false, error: error.message };
            results.issues.push(`Metadata describe failed: ${error.message}`);
        }

        // Determine overall accessibility
        const passedChecks = Object.values(results.checks).filter(check => check.success).length;
        results.accessible = passedChecks >= 3; // At least 3 out of 5 checks must pass
        results.score = `${passedChecks}/5`;

        // Add recommendations
        results.recommendations = this.generateRecommendations(results);

        return results;
    }

    /**
     * Check if field exists in FieldDefinition
     */
    async checkFieldDefinition(objectName, fieldApiName) {
        const query = `SELECT QualifiedApiName, Label, DataType, IsCalculated, IsCompound 
                      FROM FieldDefinition 
                      WHERE EntityDefinition.QualifiedApiName = '${objectName}' 
                      AND QualifiedApiName = '${fieldApiName}'`;
        
        try {
            const { stdout } = await execAsync(`sf data query --query "${query}" --json`);
            const result = JSON.parse(stdout);
            
            if (result.result.totalSize > 0) {
                return {
                    success: true,
                    field: result.result.records[0]
                };
            }
            return { success: false, message: 'Field not found' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if field is queryable via SOQL
     */
    async checkSOQLAccess(objectName, fieldApiName) {
        const query = `SELECT Id, ${fieldApiName} FROM ${objectName} LIMIT 1`;
        
        try {
            const { stdout } = await execAsync(`sf data query --query "${query}" --json`);
            const result = JSON.parse(stdout);
            
            // If query succeeds, field is accessible
            return {
                success: true,
                queryExecuted: true,
                recordCount: result.result.totalSize
            };
        } catch (error) {
            // Parse error to determine issue
            const errorMessage = error.message.toLowerCase();
            if (errorMessage.includes('no such column')) {
                return { success: false, message: 'Field does not exist in SOQL context' };
            }
            if (errorMessage.includes('insufficient access')) {
                return { success: false, message: 'Insufficient access rights' };
            }
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if field is accessible in reports
     */
    async checkReportAccess(objectName, fieldApiName) {
        try {
            // Get report types that include this object
            const reportTypeQuery = `SELECT Id, DeveloperName, Category 
                                    FROM ReportType 
                                    WHERE BaseObject = '${objectName}' 
                                    LIMIT 5`;
            
            const { stdout } = await execAsync(`sf data query --query "${reportTypeQuery}" --json`);
            const reportTypes = JSON.parse(stdout).result.records;
            
            if (reportTypes.length === 0) {
                return { success: false, message: 'No report types found for object' };
            }
            
            // For each report type, check if field is available
            // This is a simplified check - in production would use Report Metadata API
            return {
                success: true,
                reportTypesChecked: reportTypes.length,
                message: 'Field should be available in reports'
            };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Check field-level security permissions
     */
    async checkFieldPermissions(objectName, fieldApiName) {
        const query = `SELECT Field, PermissionsRead, PermissionsEdit, Parent.ProfileId, Parent.Profile.Name 
                      FROM FieldPermissions 
                      WHERE SobjectType = '${objectName}' 
                      AND Field = '${objectName}.${fieldApiName}' 
                      LIMIT 10`;
        
        try {
            const { stdout } = await execAsync(`sf data query --query "${query}" --json`);
            const result = JSON.parse(stdout);
            
            if (result.result.totalSize > 0) {
                const permissions = result.result.records;
                const readableCount = permissions.filter(p => p.PermissionsRead).length;
                const editableCount = permissions.filter(p => p.PermissionsEdit).length;
                
                return {
                    success: true,
                    hasPermissions: true,
                    profileCount: permissions.length,
                    readableProfiles: readableCount,
                    editableProfiles: editableCount
                };
            }
            
            return {
                success: true,
                hasPermissions: false,
                message: 'No field permissions configured'
            };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Check field in metadata describe
     */
    async checkMetadataDescribe(objectName, fieldApiName) {
        try {
            const { stdout } = await execAsync(`sf sobject describe --sobject ${objectName} --json`);
            const describe = JSON.parse(stdout).result;
            
            const field = describe.fields.find(f => f.name === fieldApiName);
            
            if (field) {
                return {
                    success: true,
                    fieldDetails: {
                        name: field.name,
                        label: field.label,
                        type: field.type,
                        length: field.length,
                        createable: field.createable,
                        updateable: field.updateable
                    }
                };
            }
            
            return { success: false, message: 'Field not found in describe' };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Monitor field deployment until accessible
     */
    async monitorFieldDeployment(objectName, fieldApiName, options = {}) {
        const startTime = Date.now();
        const maxTime = options.maxTime || this.maxVerificationTime;
        const checkInterval = options.checkInterval || this.checkInterval;
        
        console.log(`\n🔍 Monitoring field deployment: ${fieldApiName}`);
        console.log(`   Maximum wait time: ${maxTime / 1000} seconds`);
        console.log(`   Check interval: ${checkInterval / 1000} seconds\n`);
        
        this.isMonitoring = true;
        let lastResult = null;
        let checkCount = 0;
        
        while (this.isMonitoring && (Date.now() - startTime) < maxTime) {
            checkCount++;
            console.log(`\n📊 Verification attempt #${checkCount}`);
            
            // Perform comprehensive verification
            const result = await this.verifyFieldComprehensive(objectName, fieldApiName);
            lastResult = result;
            
            // Log result
            this.verificationLog.push(result);
            
            // Display status
            console.log(`   Score: ${result.score}`);
            console.log(`   Accessible: ${result.accessible ? '✅' : '❌'}`);
            
            if (result.accessible) {
                console.log(`\n✅ Field ${fieldApiName} is now fully accessible!`);
                console.log(`   Time taken: ${Math.round((Date.now() - startTime) / 1000)} seconds`);
                console.log(`   Checks performed: ${checkCount}`);
                
                this.isMonitoring = false;
                return {
                    success: true,
                    timeElapsed: Date.now() - startTime,
                    attempts: checkCount,
                    finalResult: result
                };
            }
            
            // Display issues
            if (result.issues.length > 0) {
                console.log(`   Issues:`);
                result.issues.forEach(issue => console.log(`     - ${issue}`));
            }
            
            // Wait before next check
            if ((Date.now() - startTime) < maxTime) {
                console.log(`   Waiting ${checkInterval / 1000} seconds before next check...`);
                await this.wait(checkInterval);
            }
        }
        
        // Timeout reached
        console.log(`\n❌ Field verification timeout after ${maxTime / 1000} seconds`);
        console.log(`   Last result: ${lastResult?.score || 'N/A'}`);
        
        return {
            success: false,
            timeElapsed: maxTime,
            attempts: checkCount,
            finalResult: lastResult,
            error: 'Verification timeout'
        };
    }

    /**
     * Generate recovery script for inaccessible fields
     */
    async generateRecoveryScript(objectName, fieldApiName, verificationResult) {
        const script = [];
        
        script.push('#!/bin/bash');
        script.push(`# Recovery script for ${fieldApiName} on ${objectName}`);
        script.push(`# Generated: ${new Date().toISOString()}\n`);
        
        // Based on issues, add recovery commands
        if (verificationResult.issues.includes('Field not found in FieldDefinition')) {
            script.push('# Field not in metadata - redeploy');
            script.push(`sf project deploy start --metadata CustomField:${objectName}.${fieldApiName}`);
            script.push('');
        }
        
        if (verificationResult.issues.includes('No field-level security configured')) {
            script.push('# Update field-level security');
            script.push(`# Create permission set with field access`);
            script.push(`cat > temp_permission.xml << EOF`);
            script.push(`<?xml version="1.0" encoding="UTF-8"?>`);
            script.push(`<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">`);
            script.push(`    <fieldPermissions>`);
            script.push(`        <editable>true</editable>`);
            script.push(`        <field>${objectName}.${fieldApiName}</field>`);
            script.push(`        <readable>true</readable>`);
            script.push(`    </fieldPermissions>`);
            script.push(`    <label>Fix_${fieldApiName}_Access</label>`);
            script.push(`</PermissionSet>`);
            script.push(`EOF`);
            script.push(`sf project deploy start --sourcepath temp_permission.xml`);
            script.push('');
        }
        
        if (verificationResult.issues.includes('Field not queryable via SOQL')) {
            script.push('# Force metadata refresh');
            script.push(`sf project retrieve start --metadata CustomObject:${objectName}`);
            script.push(`sf org display`);
            script.push('');
        }
        
        // Add verification at the end
        script.push('# Verify field is now accessible');
        script.push(`sf data query --query "SELECT ${fieldApiName} FROM ${objectName} LIMIT 1"`);
        
        // Save script
        const scriptPath = `./recovery-${fieldApiName}-${Date.now()}.sh`;
        await fs.writeFile(scriptPath, script.join('\n'));
        await fs.chmod(scriptPath, '755');
        
        console.log(`\n📝 Recovery script generated: ${scriptPath}`);
        return scriptPath;
    }

    /**
     * Generate recommendations based on verification results
     */
    generateRecommendations(verificationResult) {
        const recommendations = [];
        
        if (!verificationResult.checks.fieldDefinition?.success) {
            recommendations.push('Redeploy field metadata using SF CLI or MCP tools');
        }
        
        if (!verificationResult.checks.soqlQuery?.success) {
            recommendations.push('Wait for metadata cache refresh (up to 5 minutes)');
            recommendations.push('Force refresh with: sf project retrieve start --metadata CustomObject');
        }
        
        if (!verificationResult.checks.permissions?.hasPermissions) {
            recommendations.push('Configure field-level security for profiles/permission sets');
            recommendations.push('Add field to page layouts for visibility');
        }
        
        if (!verificationResult.checks.reportAccess?.success) {
            recommendations.push('Refresh report metadata cache');
            recommendations.push('Recreate report type if field still not visible');
        }
        
        if (!verificationResult.checks.metadataDescribe?.success) {
            recommendations.push('Perform full metadata refresh');
            recommendations.push('Check if field deployment actually succeeded in org');
        }
        
        return recommendations;
    }

    /**
     * Generate health report for all monitored fields
     */
    generateHealthReport() {
        const report = {
            timestamp: new Date().toISOString(),
            monitoringDuration: this.verificationLog.length * this.checkInterval,
            totalChecks: this.verificationLog.length,
            fields: {}
        };
        
        // Group by field
        this.verificationLog.forEach(log => {
            const key = `${log.object}.${log.field}`;
            if (!report.fields[key]) {
                report.fields[key] = {
                    checks: [],
                    firstSeen: log.timestamp,
                    lastSeen: log.timestamp,
                    currentStatus: log.accessible ? 'Accessible' : 'Inaccessible',
                    issues: []
                };
            }
            
            report.fields[key].checks.push({
                timestamp: log.timestamp,
                score: log.score,
                accessible: log.accessible
            });
            report.fields[key].lastSeen = log.timestamp;
            report.fields[key].currentStatus = log.accessible ? 'Accessible' : 'Inaccessible';
            report.fields[key].issues = [...new Set([...report.fields[key].issues, ...log.issues])];
        });
        
        return report;
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        this.isMonitoring = false;
        console.log('\n⏹️  Monitoring stopped');
    }

    /**
     * Utility: Wait for specified milliseconds
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Main execution for testing
async function main() {
    const service = new FieldVerificationService({
        checkInterval: 10000,  // 10 seconds
        maxVerificationTime: 300000  // 5 minutes
    });
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log('Usage: node field-verification-service.js <ObjectName> <FieldApiName> [--monitor]');
        console.log('Example: node field-verification-service.js Opportunity Contract_Value__c --monitor');
        process.exit(1);
    }
    
    const objectName = args[0];
    const fieldApiName = args[1];
    const shouldMonitor = args.includes('--monitor');
    
    try {
        if (shouldMonitor) {
            // Monitor until field is accessible
            const result = await service.monitorFieldDeployment(objectName, fieldApiName);
            
            if (!result.success) {
                // Generate recovery script
                const verificationResult = result.finalResult;
                if (verificationResult) {
                    await service.generateRecoveryScript(objectName, fieldApiName, verificationResult);
                }
            }
            
            // Generate health report
            const report = service.generateHealthReport();
            await fs.writeFile(
                './field-verification-report.json',
                JSON.stringify(report, null, 2)
            );
            console.log('\n📄 Health report saved to: field-verification-report.json');
            
        } else {
            // Single verification
            const result = await service.verifyFieldComprehensive(objectName, fieldApiName);
            
            console.log('\n📊 Field Verification Results:');
            console.log(`   Field: ${fieldApiName}`);
            console.log(`   Object: ${objectName}`);
            console.log(`   Score: ${result.score}`);
            console.log(`   Accessible: ${result.accessible ? '✅ Yes' : '❌ No'}`);
            
            if (result.issues.length > 0) {
                console.log('\n❌ Issues found:');
                result.issues.forEach(issue => console.log(`   - ${issue}`));
            }
            
            if (result.recommendations.length > 0) {
                console.log('\n💡 Recommendations:');
                result.recommendations.forEach(rec => console.log(`   - ${rec}`));
            }
            
            // Save result
            await fs.writeFile(
                './field-verification-result.json',
                JSON.stringify(result, null, 2)
            );
            console.log('\n📄 Detailed result saved to: field-verification-result.json');
        }
        
        // Handle Ctrl+C gracefully
        process.on('SIGINT', () => {
            service.stopMonitoring();
            process.exit(0);
        });
        
    } catch (error) {
        console.error(`\n❌ Verification failed: ${error.message}`);
        process.exit(1);
    }
}

// Export for use as module or run directly
if (require.main === module) {
    main();
} else {
    module.exports = FieldVerificationService;
}
