/**
 * Salesforce Metadata Verifier
 * Instance-agnostic tool for verifying deployed metadata exists in org
 *
 * Provides post-deployment verification for all metadata types
 * Used as fallback when "Report is Obsolete" or other transient errors occur
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class MetadataVerifier {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.verificationStrategies = this.initStrategies();
    }

    /**
     * Initialize verification strategies for each metadata type
     */
    initStrategies() {
        return {
            Report: {
                query: (name) => `SELECT Id, Name, DeveloperName FROM Report WHERE Name = '${name}' OR DeveloperName = '${name.replace(/ /g, '_')}'`,
                useToolingAPI: false,
                nameField: 'Name'
            },
            Dashboard: {
                query: (name) => `SELECT Id, Title, DeveloperName FROM Dashboard WHERE Title = '${name}' OR DeveloperName = '${name.replace(/ /g, '_')}'`,
                useToolingAPI: false,
                nameField: 'Title'
            },
            CustomField: {
                query: (name) => {
                    const [obj, field] = name.split('.');
                    return `SELECT Id, QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${obj}' AND QualifiedApiName = '${field}'`;
                },
                useToolingAPI: true,
                nameField: 'QualifiedApiName'
            },
            CustomObject: {
                query: (name) => `SELECT Id, QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName = '${name}'`,
                useToolingAPI: true,
                nameField: 'QualifiedApiName'
            },
            Flow: {
                query: (name) => `SELECT Id, MasterLabel, DeveloperName, VersionNumber, Status FROM Flow WHERE DeveloperName = '${name}'`,
                useToolingAPI: true,
                nameField: 'DeveloperName'
            },
            Layout: {
                query: (name) => {
                    const layoutName = name.replace(/-/g, ' ');
                    return `SELECT Id, Name FROM Layout WHERE Name LIKE '%${layoutName}%'`;
                },
                useToolingAPI: true,
                nameField: 'Name'
            },
            PermissionSet: {
                query: (name) => `SELECT Id, Name, Label FROM PermissionSet WHERE Name = '${name}'`,
                useToolingAPI: false,
                nameField: 'Name'
            },
            ApexClass: {
                query: (name) => `SELECT Id, Name, Status FROM ApexClass WHERE Name = '${name}'`,
                useToolingAPI: true,
                nameField: 'Name'
            },
            ApexTrigger: {
                query: (name) => `SELECT Id, Name, Status FROM ApexTrigger WHERE Name = '${name}'`,
                useToolingAPI: true,
                nameField: 'Name'
            },
            LightningComponentBundle: {
                query: (name) => `SELECT Id, DeveloperName FROM LightningComponentBundle WHERE DeveloperName = '${name}'`,
                useToolingAPI: true,
                nameField: 'DeveloperName'
            },
            FlexiPage: {
                query: (name) => `SELECT Id, DeveloperName, MasterLabel FROM FlexiPage WHERE DeveloperName = '${name}'`,
                useToolingAPI: true,
                nameField: 'DeveloperName'
            },
            CustomTab: {
                query: (name) => `SELECT Id, Name FROM CustomTab WHERE Name = '${name}'`,
                useToolingAPI: true,
                nameField: 'Name'
            },
            ValidationRule: {
                query: (name) => {
                    const [obj, rule] = name.split('.');
                    return `SELECT Id, ValidationName FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '${obj}' AND ValidationName = '${rule}'`;
                },
                useToolingAPI: true,
                nameField: 'ValidationName'
            },
            WorkflowRule: {
                query: (name) => {
                    const [obj, rule] = name.split('.');
                    return `SELECT Id, Name FROM WorkflowRule WHERE TableEnumOrId = '${obj}' AND Name = '${rule}'`;
                },
                useToolingAPI: true,
                nameField: 'Name'
            },
            Profile: {
                query: (name) => `SELECT Id, Name FROM Profile WHERE Name = '${name}'`,
                useToolingAPI: false,
                nameField: 'Name'
            },
            RecordType: {
                query: (name) => {
                    const [obj, rt] = name.split('.');
                    return `SELECT Id, Name, DeveloperName FROM RecordType WHERE SObjectType = '${obj}' AND DeveloperName = '${rt}'`;
                },
                useToolingAPI: false,
                nameField: 'DeveloperName'
            },
            Queue: {
                query: (name) => `SELECT Id, Name FROM Group WHERE Type = 'Queue' AND Name = '${name}'`,
                useToolingAPI: false,
                nameField: 'Name'
            },
            CustomMetadata: {
                query: (name) => {
                    const [type, record] = name.split('.');
                    return `SELECT Id, DeveloperName FROM ${type} WHERE DeveloperName = '${record}'`;
                },
                useToolingAPI: false,
                nameField: 'DeveloperName'
            }
        };
    }

    /**
     * Execute SF CLI command and return JSON
     */
    async exJSON(cmd) {
        try {
            const result = await execAsync(cmd);
            return JSON.parse(result.stdout);
        } catch (e) {
            if (e.stdout) {
                try {
                    return JSON.parse(e.stdout);
                } catch {}
            }
            // Log the error but don't throw - verification should be resilient
            console.log(`    Query error: ${e.message.split('\n')[0]}`);
            return null;
        }
    }

    /**
     * Verify a single metadata component
     */
    async verifyComponent(type, name) {
        const strategy = this.verificationStrategies[type];
        if (!strategy) {
            console.log(`  ⚠️  No verification strategy for type: ${type}`);
            return { verified: false, reason: 'Unknown type' };
        }

        try {
            const query = strategy.query(name);
            const apiFlag = strategy.useToolingAPI ? '--use-tooling-api' : '';
            const cmd = `sf data query --query "${query}" ${apiFlag} --target-org ${this.orgAlias} --json`;

            const result = await this.exJSON(cmd);
            const records = result?.result?.records;

            if (records && records.length > 0) {
                const record = records[0];
                const displayName = record[strategy.nameField] || record.Name || record.Id;
                return {
                    verified: true,
                    id: record.Id,
                    name: displayName,
                    details: record
                };
            }

            return { verified: false, reason: 'Not found in org' };
        } catch (e) {
            return { verified: false, reason: e.message };
        }
    }

    /**
     * Verify multiple components
     */
    async verifyComponents(components) {
        const results = {
            verified: [],
            failed: [],
            summary: {
                total: components.length,
                verified: 0,
                failed: 0
            }
        };

        for (const component of components) {
            const { type, name } = component;
            console.log(`  Verifying ${type}: ${name}`);

            const result = await this.verifyComponent(type, name);

            if (result.verified) {
                console.log(`    ✓ Verified: ${result.name} (${result.id})`);
                results.verified.push({ ...component, ...result });
                results.summary.verified++;
            } else {
                console.log(`    ✗ Not verified: ${result.reason}`);
                results.failed.push({ ...component, reason: result.reason });
                results.summary.failed++;
            }
        }

        return results;
    }

    /**
     * Parse deployment result and extract components
     */
    parseDeploymentResult(deployResult) {
        const components = [];

        // Check for deployed components
        if (deployResult?.deployedSource) {
            deployResult.deployedSource.forEach(item => {
                components.push({
                    type: item.type,
                    name: item.fullName || item.name
                });
            });
        }

        // Check for component successes
        if (deployResult?.details?.componentSuccesses) {
            deployResult.details.componentSuccesses.forEach(item => {
                if (item.fullName && item.componentType) {
                    components.push({
                        type: item.componentType,
                        name: item.fullName
                    });
                }
            });
        }

        // Check for failures that might actually be deployed
        if (deployResult?.details?.componentFailures) {
            deployResult.details.componentFailures.forEach(item => {
                if (item.problem?.includes('Report is Obsolete') && item.fullName) {
                    // These might actually be deployed despite the error
                    components.push({
                        type: item.componentType,
                        name: item.fullName,
                        possiblyDeployed: true
                    });
                }
            });
        }

        return components;
    }

    /**
     * Verify from deployment job ID
     */
    async verifyDeployment(jobId) {
        try {
            console.log(`\nFetching deployment details for job: ${jobId}`);

            const cmd = `sf project deploy report --job-id ${jobId} --target-org ${this.orgAlias} --json`;
            const result = await this.exJSON(cmd);

            if (!result?.result) {
                console.log('  ⚠️  Could not fetch deployment details');
                return null;
            }

            const components = this.parseDeploymentResult(result.result);

            if (components.length === 0) {
                console.log('  No components found in deployment');
                return null;
            }

            console.log(`\nVerifying ${components.length} components from deployment...`);
            return await this.verifyComponents(components);

        } catch (e) {
            console.error(`  Error verifying deployment: ${e.message}`);
            return null;
        }
    }

    /**
     * Quick verify - check if critical components exist
     */
    async quickVerify(patterns) {
        const results = {
            allExist: true,
            details: []
        };

        for (const pattern of patterns) {
            const { type, namePattern } = pattern;

            // Build appropriate query based on type
            let query;
            if (type === 'Report') {
                query = `SELECT COUNT() FROM Report WHERE Name LIKE '%${namePattern}%'`;
            } else if (type === 'Flow') {
                query = `SELECT COUNT() FROM Flow WHERE MasterLabel LIKE '%${namePattern}%'`;
            } else if (type === 'CustomField') {
                const [obj] = namePattern.split('.');
                query = `SELECT COUNT() FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${obj}'`;
            } else {
                continue; // Skip unknown types
            }

            const apiFlag = this.verificationStrategies[type]?.useToolingAPI ? '--use-tooling-api' : '';
            const cmd = `sf data query --query "${query}" ${apiFlag} --target-org ${this.orgAlias} --json`;

            const result = await this.exJSON(cmd);
            const count = result?.result?.totalSize || 0;

            results.details.push({
                type,
                pattern: namePattern,
                found: count > 0,
                count
            });

            if (count === 0) {
                results.allExist = false;
            }
        }

        return results;
    }

    /**
     * Verify report exists and is accessible
     */
    async verifyReportAccess(reportName) {
        try {
            // First check if report exists
            const existsQuery = `SELECT Id, Name, DeveloperName, FolderName FROM Report WHERE Name = '${reportName}' OR DeveloperName = '${reportName.replace(/ /g, '_')}'`;
            const existsCmd = `sf data query --query "${existsQuery}" --target-org ${this.orgAlias} --json`;

            const existsResult = await this.exJSON(existsCmd);
            const report = existsResult?.result?.records?.[0];

            if (!report) {
                return { exists: false };
            }

            // Try to get report metadata to verify it's accessible
            const metadataCmd = `sf project retrieve start --metadata Report:${report.FolderName}/${report.DeveloperName} --target-org ${this.orgAlias} --json`;
            const metadataResult = await this.exJSON(metadataCmd);

            const accessible = metadataResult?.result?.status === 'Succeeded';

            return {
                exists: true,
                accessible,
                id: report.Id,
                name: report.Name,
                developerName: report.DeveloperName,
                folder: report.FolderName
            };
        } catch (e) {
            return { exists: false, error: e.message };
        }
    }
}

// Export for use as module
module.exports = { MetadataVerifier };

// CLI interface
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: node metadata-verifier.js <org-alias> <action> [options]');
        console.log('\nActions:');
        console.log('  verify <type> <name>           Verify single component');
        console.log('  batch <json>                   Verify multiple components (JSON array)');
        console.log('  job <jobId>                    Verify from deployment job');
        console.log('  report <name>                  Verify report exists and is accessible');
        console.log('\nTypes:');
        console.log('  Report, Dashboard, CustomField, CustomObject, Flow, Layout,');
        console.log('  PermissionSet, ApexClass, ApexTrigger, FlexiPage, ValidationRule');
        console.log('\nExamples:');
        console.log('  node metadata-verifier.js myorg verify Report "Sales Report"');
        console.log('  node metadata-verifier.js myorg verify CustomField Account.CustomField__c');
        console.log('  node metadata-verifier.js myorg job 0AfXXXXXXXXXXXX');
        console.log('  node metadata-verifier.js myorg batch \'[{"type":"Report","name":"My Report"}]\'');
        process.exit(1);
    }

    const [orgAlias, action, ...params] = args;
    const verifier = new MetadataVerifier(orgAlias);

    try {
        switch (action) {
            case 'verify': {
                const [type, name] = params;
                if (!type || !name) {
                    console.log('Type and name required for verify action');
                    process.exit(1);
                }

                const result = await verifier.verifyComponent(type, name);
                if (result.verified) {
                    console.log(`\n✅ Component verified`);
                    console.log(`  Type: ${type}`);
                    console.log(`  Name: ${result.name}`);
                    console.log(`  ID: ${result.id}`);
                } else {
                    console.log(`\n❌ Component not verified`);
                    console.log(`  Type: ${type}`);
                    console.log(`  Name: ${name}`);
                    console.log(`  Reason: ${result.reason}`);
                }
                break;
            }

            case 'batch': {
                const json = params[0];
                if (!json) {
                    console.log('JSON array required for batch action');
                    process.exit(1);
                }

                const components = JSON.parse(json);
                const results = await verifier.verifyComponents(components);

                console.log('\n=== Verification Results ===');
                console.log(`Total: ${results.summary.total}`);
                console.log(`Verified: ${results.summary.verified}`);
                console.log(`Failed: ${results.summary.failed}`);

                if (results.failed.length > 0) {
                    console.log('\nFailed components:');
                    results.failed.forEach(f => {
                        console.log(`  - ${f.type}: ${f.name} (${f.reason})`);
                    });
                }
                break;
            }

            case 'job': {
                const jobId = params[0];
                if (!jobId) {
                    console.log('Job ID required for job action');
                    process.exit(1);
                }

                const results = await verifier.verifyDeployment(jobId);
                if (results) {
                    console.log('\n=== Deployment Verification ===');
                    console.log(`Total: ${results.summary.total}`);
                    console.log(`Verified: ${results.summary.verified}`);
                    console.log(`Failed: ${results.summary.failed}`);

                    const success = results.summary.failed === 0;
                    console.log(success ? '\n✅ All components verified!' : '\n⚠️  Some components not verified');
                } else {
                    console.log('\n❌ Could not verify deployment');
                }
                break;
            }

            case 'report': {
                const name = params.join(' ');
                if (!name) {
                    console.log('Report name required');
                    process.exit(1);
                }

                const result = await verifier.verifyReportAccess(name);
                if (result.exists) {
                    console.log(`\n✅ Report verified`);
                    console.log(`  Name: ${result.name}`);
                    console.log(`  Developer Name: ${result.developerName}`);
                    console.log(`  ID: ${result.id}`);
                    console.log(`  Folder: ${result.folder}`);
                    console.log(`  Accessible: ${result.accessible ? 'Yes' : 'No'}`);
                } else {
                    console.log(`\n❌ Report not found: ${name}`);
                    if (result.error) {
                        console.log(`  Error: ${result.error}`);
                    }
                }
                break;
            }

            default:
                console.log(`Unknown action: ${action}`);
                process.exit(1);
        }
    } catch (e) {
        console.error(`\nError: ${e.message}`);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}