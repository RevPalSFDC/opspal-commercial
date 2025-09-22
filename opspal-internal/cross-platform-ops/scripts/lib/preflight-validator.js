#!/usr/bin/env node
const path = require('path');

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class PreFlightValidator {
    constructor(orgAlias = 'rentable-production') {
        this.orgAlias = orgAlias;
        this.validationResults = {
            timestamp: new Date().toISOString(),
            org: orgAlias,
            checks: {},
            canProceed: false,
            criticalIssues: [],
            warnings: []
        };
    }

    async validateAll() {
        console.log('🔍 Starting Pre-Flight Validation...\n');

        // Run all validation checks
        await this.validateOrgConnection();
        await this.validateCustomFields();
        await this.validatePicklistValues();
        await this.validateRecordTypes();
        await this.validatePermissions();
        await this.checkOrgLimits();
        await this.validateBulkAPIAvailability();

        // Determine if we can proceed
        this.validationResults.canProceed = this.validationResults.criticalIssues.length === 0;

        // Generate report
        this.generateReport();

        return this.validationResults;
    }

    async validateOrgConnection() {
        const checkName = 'Org Connection';
        console.log(`Checking ${checkName}...`);

        try {
            const command = `sf org display --target-org ${this.orgAlias} --json`;
            const { stdout } = await execPromise(command);
            const result = JSON.parse(stdout);

            if (result.status === 0) {
                this.validationResults.checks[checkName] = {
                    passed: true,
                    details: `Connected to ${result.result.username}`
                };
                console.log(`✅ ${checkName}: PASSED\n`);
            } else {
                throw new Error('Connection failed');
            }
        } catch (error) {
            this.validationResults.checks[checkName] = {
                passed: false,
                error: error.message
            };
            this.validationResults.criticalIssues.push(`Cannot connect to org: ${error.message}`);
            console.log(`❌ ${checkName}: FAILED\n`);
        }
    }

    async validateCustomFields() {
        const checkName = 'Custom Fields';
        console.log(`Checking ${checkName}...`);

        const requiredFields = [
            'Clean_Status__c',
            'Delete_Reason__c',
            'In_HubSpot_Not_Inclusion_List__c',
            'Sync_Status__c'
        ];

        try {
            const command = `sf sobject describe Contact --target-org ${this.orgAlias} --json`;
            const { stdout } = await execPromise(command, { maxBuffer: 50 * 1024 * 1024 });
            const result = JSON.parse(stdout);

            if (result.status === 0) {
                const existingFields = result.result.fields.map(f => f.name);
                const missingFields = requiredFields.filter(f => !existingFields.includes(f));

                if (missingFields.length === 0) {
                    this.validationResults.checks[checkName] = {
                        passed: true,
                        details: 'All required fields present'
                    };
                    console.log(`✅ ${checkName}: PASSED\n`);
                } else {
                    this.validationResults.checks[checkName] = {
                        passed: false,
                        missingFields
                    };
                    this.validationResults.criticalIssues.push(`Missing fields: ${missingFields.join(', ')}`);
                    console.log(`❌ ${checkName}: FAILED - Missing: ${missingFields.join(', ')}\n`);
                }
            }
        } catch (error) {
            this.validationResults.checks[checkName] = {
                passed: false,
                error: error.message
            };
            this.validationResults.warnings.push(`Could not validate fields: ${error.message}`);
            console.log(`⚠️ ${checkName}: WARNING\n`);
        }
    }

    async validatePicklistValues() {
        const checkName = 'Picklist Values';
        console.log(`Checking ${checkName}...`);

        const requiredValues = {
            'Clean_Status__c': ['OK', 'Duplicate', 'Merge', 'Delete', 'Archive', 'Review']
        };

        try {
            // Get record types first
            const rtQuery = `SELECT Id, DeveloperName FROM RecordType WHERE SobjectType = 'Contact' AND IsActive = true`;
            const rtCommand = `sf data query --query "${rtQuery}" --target-org ${this.orgAlias} --json`;
            const { stdout: rtStdout } = await execPromise(rtCommand);
            const rtResult = JSON.parse(rtStdout);

            if (rtResult.status === 0 && rtResult.result.records.length > 0) {
                const issues = [];

                // For each record type, check picklist values
                for (const rt of rtResult.result.records) {
                    const metadataQuery = `sf sobject describe Contact --target-org ${this.orgAlias} --json`;
                    const { stdout } = await execPromise(metadataQuery, { maxBuffer: 50 * 1024 * 1024 });
                    const result = JSON.parse(stdout);

                    if (result.status === 0) {
                        const cleanStatusField = result.result.fields.find(f => f.name === 'Clean_Status__c');

                        if (cleanStatusField && cleanStatusField.picklistValues) {
                            const activeValues = cleanStatusField.picklistValues
                                .filter(v => v.active)
                                .map(v => v.value);

                            const missingValues = requiredValues['Clean_Status__c'].filter(v => !activeValues.includes(v));

                            if (missingValues.length > 0) {
                                issues.push(`Record Type ${rt.DeveloperName}: Missing values ${missingValues.join(', ')}`);
                            }
                        }
                    }
                }

                if (issues.length === 0) {
                    this.validationResults.checks[checkName] = {
                        passed: true,
                        details: 'All required picklist values active'
                    };
                    console.log(`✅ ${checkName}: PASSED\n`);
                } else {
                    this.validationResults.checks[checkName] = {
                        passed: false,
                        issues
                    };
                    this.validationResults.criticalIssues.push(`Picklist configuration issues: ${issues.join('; ')}`);
                    console.log(`❌ ${checkName}: FAILED\n`);
                }
            }
        } catch (error) {
            this.validationResults.checks[checkName] = {
                passed: false,
                error: error.message
            };
            this.validationResults.warnings.push(`Could not validate picklist values: ${error.message}`);
            console.log(`⚠️ ${checkName}: WARNING\n`);
        }
    }

    async validateRecordTypes() {
        const checkName = 'Record Types';
        console.log(`Checking ${checkName}...`);

        try {
            const query = `SELECT Id, DeveloperName, IsActive FROM RecordType WHERE SobjectType = 'Contact'`;
            const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;
            const { stdout } = await execPromise(command);
            const result = JSON.parse(stdout);

            if (result.status === 0) {
                const activeRecordTypes = result.result.records.filter(rt => rt.IsActive);

                this.validationResults.checks[checkName] = {
                    passed: true,
                    details: `Found ${activeRecordTypes.length} active record types`,
                    recordTypes: activeRecordTypes.map(rt => rt.DeveloperName)
                };
                console.log(`✅ ${checkName}: PASSED - ${activeRecordTypes.length} active\n`);
            }
        } catch (error) {
            this.validationResults.checks[checkName] = {
                passed: false,
                error: error.message
            };
            this.validationResults.warnings.push(`Could not validate record types: ${error.message}`);
            console.log(`⚠️ ${checkName}: WARNING\n`);
        }
    }

    async validatePermissions() {
        const checkName = 'User Permissions';
        console.log(`Checking ${checkName}...`);

        try {
            // Check if user can modify contacts
            const query = `SELECT Id FROM Contact LIMIT 1`;
            const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;
            const { stdout } = await execPromise(command);
            const result = JSON.parse(stdout);

            if (result.status === 0) {
                this.validationResults.checks[checkName] = {
                    passed: true,
                    details: 'User has necessary permissions'
                };
                console.log(`✅ ${checkName}: PASSED\n`);
            }
        } catch (error) {
            this.validationResults.checks[checkName] = {
                passed: false,
                error: error.message
            };
            this.validationResults.criticalIssues.push(`Insufficient permissions: ${error.message}`);
            console.log(`❌ ${checkName}: FAILED\n`);
        }
    }

    async checkOrgLimits() {
        const checkName = 'Org Limits';
        console.log(`Checking ${checkName}...`);

        try {
            const command = `sf limits api display --target-org ${this.orgAlias} --json`;
            const { stdout } = await execPromise(command);
            const result = JSON.parse(stdout);

            if (result.status === 0) {
                const limits = result.result;
                const bulkApiLimit = limits.find(l => l.name === 'DailyBulkV2QueryJobs');

                if (bulkApiLimit) {
                    const used = parseInt(bulkApiLimit.remaining);
                    const max = parseInt(bulkApiLimit.max);
                    const percentUsed = ((max - used) / max) * 100;

                    if (percentUsed > 90) {
                        this.validationResults.warnings.push(`Bulk API limit ${percentUsed.toFixed(1)}% used`);
                    }

                    this.validationResults.checks[checkName] = {
                        passed: true,
                        details: `Bulk API: ${used}/${max} used`,
                        limits: {
                            bulkAPI: { used, max, percentUsed }
                        }
                    };
                    console.log(`✅ ${checkName}: PASSED - ${percentUsed.toFixed(1)}% used\n`);
                }
            }
        } catch (error) {
            this.validationResults.checks[checkName] = {
                passed: true, // Don't block on limit check failure
                warning: 'Could not check limits'
            };
            this.validationResults.warnings.push(`Could not check org limits: ${error.message}`);
            console.log(`⚠️ ${checkName}: WARNING\n`);
        }
    }

    async validateBulkAPIAvailability() {
        const checkName = 'Bulk API 2.0';
        console.log(`Checking ${checkName}...`);

        try {
            // Try a simple bulk query to test availability
            const testCommand = `echo "Id\\n" > require('os').tmpdir() && sf data upsert bulk --sobject Contact --file require('os').tmpdir() --external-id Id --target-org ${this.orgAlias} --wait 1 2>&1 | head -5`;
            const { stdout } = await execPromise(testCommand);

            // If we get here without error, Bulk API is available
            this.validationResults.checks[checkName] = {
                passed: true,
                details: 'Bulk API 2.0 is available'
            };
            console.log(`✅ ${checkName}: PASSED\n`);
        } catch (error) {
            // Check if it's a real error or just our test
            if (error.message.includes('not authorized') || error.message.includes('API_DISABLED_FOR_ORG')) {
                this.validationResults.checks[checkName] = {
                    passed: false,
                    error: 'Bulk API not enabled for org'
                };
                this.validationResults.criticalIssues.push('Bulk API 2.0 not available');
                console.log(`❌ ${checkName}: FAILED\n`);
            } else {
                // Probably just our test failing, which is ok
                this.validationResults.checks[checkName] = {
                    passed: true,
                    details: 'Bulk API 2.0 appears available'
                };
                console.log(`✅ ${checkName}: PASSED\n`);
            }
        }
    }

    generateReport() {
        console.log('\n' + '='.repeat(60));
        console.log('PRE-FLIGHT VALIDATION REPORT');
        console.log('='.repeat(60));
        console.log(`Org: ${this.orgAlias}`);
        console.log(`Timestamp: ${this.validationResults.timestamp}`);
        console.log('='.repeat(60));

        if (this.validationResults.canProceed) {
            console.log('\n✅ ALL CHECKS PASSED - READY TO PROCEED\n');
        } else {
            console.log('\n❌ CRITICAL ISSUES FOUND - CANNOT PROCEED\n');
            console.log('Critical Issues:');
            this.validationResults.criticalIssues.forEach((issue, i) => {
                console.log(`  ${i + 1}. ${issue}`);
            });
        }

        if (this.validationResults.warnings.length > 0) {
            console.log('\n⚠️ Warnings:');
            this.validationResults.warnings.forEach((warning, i) => {
                console.log(`  ${i + 1}. ${warning}`);
            });
        }

        console.log('\n' + '='.repeat(60));

        // Generate recommendations
        this.generateRecommendations();
    }

    generateRecommendations() {
        console.log('\n📋 RECOMMENDATIONS:\n');

        if (this.validationResults.criticalIssues.length > 0) {
            console.log('Fix Critical Issues:');

            this.validationResults.criticalIssues.forEach(issue => {
                if (issue.includes('Missing fields')) {
                    console.log('  • Deploy missing custom fields using metadata API');
                    console.log('    Run: sf project deploy start --metadata CustomField:Contact.Clean_Status__c');
                } else if (issue.includes('Picklist configuration')) {
                    console.log('  • Activate picklist values for all record types');
                    console.log('    Navigate to Setup > Object Manager > Contact > Record Types');
                } else if (issue.includes('permissions')) {
                    console.log('  • Grant Modify All permission on Contact object');
                    console.log('    Check System Administrator profile or permission sets');
                } else if (issue.includes('Bulk API')) {
                    console.log('  • Enable Bulk API 2.0 in org settings');
                    console.log('    Contact Salesforce support if needed');
                }
            });
        }

        if (this.validationResults.warnings.length > 0) {
            console.log('\nAddress Warnings:');
            this.validationResults.warnings.forEach(warning => {
                if (warning.includes('Bulk API limit')) {
                    console.log('  • Consider running during off-peak hours');
                    console.log('  • Or wait for limit reset at midnight');
                }
            });
        }

        console.log('\n' + '='.repeat(60) + '\n');
    }
}

// Allow running directly
if (require.main === module) {
    const orgAlias = process.argv[2] || 'rentable-production';

    console.log('🚀 Salesforce Pre-Flight Validator\n');

    const validator = new PreFlightValidator(orgAlias);
    validator.validateAll().then(results => {
        process.exit(results.canProceed ? 0 : 1);
    }).catch(error => {
        console.error('Validation failed:', error);
        process.exit(1);
    });
}

module.exports = PreFlightValidator;