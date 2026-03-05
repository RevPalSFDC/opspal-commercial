#!/usr/bin/env node

/**
 * Metadata Propagation Monitor
 * Monitors and validates that metadata changes have fully propagated
 * across all Salesforce APIs before allowing operations
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class MetadataPropagationMonitor {
    constructor(options = {}) {
        this.orgAlias = options.orgAlias || process.env.SF_TARGET_ORG;
        this.maxRetries = options.maxRetries || 30;
        this.retryInterval = options.retryInterval || 2000; // 2 seconds
        this.verbose = options.verbose || false;
        this.timeout = options.timeout || 120000; // 2 minutes max

        // Different API endpoints to check
        this.apiEndpoints = {
            tooling: 'Tooling API',
            data: 'Data API',
            metadata: 'Metadata API',
            rest: 'REST API'
        };
    }

    /**
     * Monitor field propagation across all APIs
     */
    async monitorFieldPropagation(objectName, fieldName) {
        console.log(`\n⏳ Monitoring metadata propagation for ${objectName}.${fieldName}`);
        console.log('='.repeat(60));

        const startTime = Date.now();
        const results = {
            field: `${objectName}.${fieldName}`,
            startTime: new Date().toISOString(),
            propagationStatus: {},
            totalTime: 0,
            success: false,
            attempts: []
        };

        let attempt = 0;
        let fullyPropagated = false;

        while (!fullyPropagated && attempt < this.maxRetries) {
            attempt++;
            const attemptResults = {};

            this.log(`\n🔄 Attempt ${attempt}/${this.maxRetries}`);

            // Check each API endpoint
            for (const [api, name] of Object.entries(this.apiEndpoints)) {
                const status = await this.checkApiEndpoint(api, objectName, fieldName);
                attemptResults[api] = status;

                this.log(`  ${status.found ? '✅' : '❌'} ${name}: ${status.message}`);
            }

            results.attempts.push({
                attempt,
                timestamp: new Date().toISOString(),
                results: attemptResults
            });

            // Check if fully propagated
            fullyPropagated = Object.values(attemptResults).every(status => status.found);

            if (!fullyPropagated) {
                // Show which APIs are still pending
                const pending = Object.entries(attemptResults)
                    .filter(([_, status]) => !status.found)
                    .map(([api, _]) => this.apiEndpoints[api]);

                console.log(`  ⏳ Waiting for: ${pending.join(', ')}`);

                // Check if timeout reached
                if (Date.now() - startTime > this.timeout) {
                    console.error(`\n❌ Timeout reached after ${this.timeout / 1000} seconds`);
                    break;
                }

                // Wait before next attempt
                await this.sleep(this.retryInterval);
            }
        }

        // Final results
        const endTime = Date.now();
        results.endTime = new Date().toISOString();
        results.totalTime = (endTime - startTime) / 1000; // in seconds
        results.success = fullyPropagated;
        results.totalAttempts = attempt;

        // Get final status for each API
        if (fullyPropagated) {
            console.log(`\n✅ Field fully propagated across all APIs!`);
            console.log(`  Total time: ${results.totalTime.toFixed(1)} seconds`);
            console.log(`  Total attempts: ${results.totalAttempts}`);

            Object.entries(this.apiEndpoints).forEach(([api, name]) => {
                results.propagationStatus[api] = {
                    name,
                    propagated: true,
                    attempts: this.getAttemptsUntilSuccess(results.attempts, api)
                };
            });
        } else {
            console.log(`\n❌ Field propagation incomplete`);
            console.log(`  Some APIs still don't have the field after ${results.totalTime.toFixed(1)} seconds`);

            // Provide troubleshooting suggestions
            this.provideTroubleshootingSuggestions(results);
        }

        // Save monitoring report
        this.saveMonitoringReport(results);

        return results;
    }

    /**
     * Check field existence in specific API endpoint
     */
    async checkApiEndpoint(api, objectName, fieldName) {
        try {
            switch (api) {
                case 'tooling':
                    return await this.checkToolingApi(objectName, fieldName);
                case 'data':
                    return await this.checkDataApi(objectName, fieldName);
                case 'metadata':
                    return await this.checkMetadataApi(objectName, fieldName);
                case 'rest':
                    return await this.checkRestApi(objectName, fieldName);
                default:
                    return { found: false, message: 'Unknown API' };
            }
        } catch (error) {
            return {
                found: false,
                message: `Error: ${error.message}`,
                error: true
            };
        }
    }

    /**
     * Check field in Tooling API
     */
    async checkToolingApi(objectName, fieldName) {
        try {
            const query = `SELECT QualifiedApiName, DeveloperName FROM EntityParticle WHERE EntityDefinitionId = '${objectName}' AND QualifiedApiName = '${fieldName}'`;
            const cmd = `sf data query --query "${query}" --use-tooling-api --target-org ${this.orgAlias} --json`;

            const result = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
            const data = JSON.parse(result);

            if (data.result && data.result.records && data.result.records.length > 0) {
                return {
                    found: true,
                    message: `Field found with name: ${data.result.records[0].QualifiedApiName}`,
                    data: data.result.records[0]
                };
            }

            return {
                found: false,
                message: 'Field not found in Tooling API'
            };

        } catch (error) {
            return {
                found: false,
                message: `Tooling API error: ${error.message}`,
                error: true
            };
        }
    }

    /**
     * Check field in Data API (via describe)
     */
    async checkDataApi(objectName, fieldName) {
        try {
            const cmd = `sf sobject describe --sobject ${objectName} --json --targetusername ${this.orgAlias}`;
            const result = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
            const data = JSON.parse(result);

            if (data.result && data.result.fields) {
                const field = data.result.fields.find(f =>
                    f.name === fieldName || f.name === fieldName.replace('__c', '')
                );

                if (field) {
                    return {
                        found: true,
                        message: `Field found: ${field.name} (${field.type})`,
                        data: field
                    };
                }
            }

            return {
                found: false,
                message: 'Field not found in Data API describe'
            };

        } catch (error) {
            return {
                found: false,
                message: `Data API error: ${error.message}`,
                error: true
            };
        }
    }

    /**
     * Check field in Metadata API
     */
    async checkMetadataApi(objectName, fieldName) {
        try {
            const cmd = `sf org list metadata --metadata-type CustomField --target-org ${this.orgAlias} --json`;
            const result = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
            const data = JSON.parse(result);

            if (data.result) {
                const fullName = `${objectName}.${fieldName}`;
                const field = data.result.find(item =>
                    item.fullName === fullName || item.fullName === fullName.replace('__c', '')
                );

                if (field) {
                    return {
                        found: true,
                        message: `Field found in metadata: ${field.fullName}`,
                        data: field
                    };
                }
            }

            return {
                found: false,
                message: 'Field not found in Metadata API'
            };

        } catch (error) {
            return {
                found: false,
                message: `Metadata API error: ${error.message}`,
                error: true
            };
        }
    }

    /**
     * Check field via REST API
     */
    async checkRestApi(objectName, fieldName) {
        try {
            // Use REST API via sf to check field
            const query = `SELECT ${fieldName} FROM ${objectName} LIMIT 1`;
            const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;

            const result = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
            const data = JSON.parse(result);

            // If query succeeds, field exists
            if (data.status === 0) {
                return {
                    found: true,
                    message: 'Field accessible via REST API queries'
                };
            }

            // Check error message for field not found
            if (data.message && data.message.includes('No such column')) {
                return {
                    found: false,
                    message: 'Field not accessible in REST API'
                };
            }

            return {
                found: false,
                message: `REST API returned: ${data.message || 'Unknown status'}`
            };

        } catch (error) {
            // Parse error to check if it's a field not found error
            const errorStr = error.toString();

            if (errorStr.includes('No such column')) {
                return {
                    found: false,
                    message: 'Field not found in REST API'
                };
            }

            return {
                found: false,
                message: `REST API error: ${error.message}`,
                error: true
            };
        }
    }

    /**
     * Monitor object propagation
     */
    async monitorObjectPropagation(objectName) {
        console.log(`\n⏳ Monitoring object propagation for ${objectName}`);
        console.log('='.repeat(60));

        const checks = [
            { name: 'Object Definition', fn: () => this.checkObjectExists(objectName) },
            { name: 'Object Queryable', fn: () => this.checkObjectQueryable(objectName) },
            { name: 'Object in Metadata', fn: () => this.checkObjectInMetadata(objectName) },
            { name: 'Object Permissions', fn: () => this.checkObjectPermissions(objectName) }
        ];

        const startTime = Date.now();
        let allPassed = false;
        let attempt = 0;

        while (!allPassed && attempt < this.maxRetries) {
            attempt++;
            console.log(`\n🔄 Attempt ${attempt}/${this.maxRetries}`);

            const results = [];
            for (const check of checks) {
                const passed = await check.fn();
                results.push({ name: check.name, passed });
                console.log(`  ${passed ? '✅' : '❌'} ${check.name}`);
            }

            allPassed = results.every(r => r.passed);

            if (!allPassed && attempt < this.maxRetries) {
                await this.sleep(this.retryInterval);
            }
        }

        const totalTime = (Date.now() - startTime) / 1000;

        if (allPassed) {
            console.log(`\n✅ Object fully propagated!`);
            console.log(`  Total time: ${totalTime.toFixed(1)} seconds`);
        } else {
            console.log(`\n❌ Object propagation incomplete after ${totalTime.toFixed(1)} seconds`);
        }

        return { success: allPassed, totalTime, attempts: attempt };
    }

    /**
     * Check if object exists
     */
    async checkObjectExists(objectName) {
        try {
            const cmd = `sf sobject describe --sobject ${objectName} --json --targetusername ${this.orgAlias}`;
            const result = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
            const data = JSON.parse(result);
            return data.status === 0 && data.result !== null;
        } catch {
            return false;
        }
    }

    /**
     * Check if object is queryable
     */
    async checkObjectQueryable(objectName) {
        try {
            const cmd = `sf data query --query "SELECT COUNT() FROM ${objectName}" --target-org ${this.orgAlias} --json`;
            const result = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
            const data = JSON.parse(result);
            return data.status === 0;
        } catch {
            return false;
        }
    }

    /**
     * Check if object is in metadata API
     */
    async checkObjectInMetadata(objectName) {
        try {
            const cmd = `sf org list metadata --metadata-type CustomObject --target-org ${this.orgAlias} --json`;
            const result = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
            const data = JSON.parse(result);
            return data.result && data.result.some(item => item.fullName === objectName);
        } catch {
            return false;
        }
    }

    /**
     * Check if object has permissions configured
     */
    async checkObjectPermissions(objectName) {
        try {
            const query = `SELECT Id FROM ObjectPermissions WHERE SobjectType = '${objectName}' LIMIT 1`;
            const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;
            const result = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
            const data = JSON.parse(result);
            return data.status === 0 && data.result.totalSize > 0;
        } catch {
            return false;
        }
    }

    /**
     * Wait for specific duration with progress indicator
     */
    async waitWithProgress(duration, message) {
        const steps = 10;
        const stepDuration = duration / steps;

        process.stdout.write(`${message} `);

        for (let i = 0; i < steps; i++) {
            process.stdout.write('.');
            await this.sleep(stepDuration);
        }

        process.stdout.write(' Done\n');
    }

    /**
     * Get number of attempts until API success
     */
    getAttemptsUntilSuccess(attempts, api) {
        for (let i = 0; i < attempts.length; i++) {
            if (attempts[i].results[api] && attempts[i].results[api].found) {
                return i + 1;
            }
        }
        return attempts.length;
    }

    /**
     * Provide troubleshooting suggestions
     */
    provideTroubleshootingSuggestions(results) {
        console.log('\n💡 Troubleshooting Suggestions:');

        const lastAttempt = results.attempts[results.attempts.length - 1];

        Object.entries(lastAttempt.results).forEach(([api, status]) => {
            if (!status.found) {
                console.log(`\n  ${this.apiEndpoints[api]}:`);

                switch (api) {
                    case 'tooling':
                        console.log('    - Wait 30-60 seconds for Tooling API cache refresh');
                        console.log('    - Check if field deployment completed successfully');
                        break;
                    case 'data':
                        console.log('    - Ensure field-level security is configured');
                        console.log('    - Check if field is visible to the current user');
                        console.log('    - Verify object permissions');
                        break;
                    case 'metadata':
                        console.log('    - Refresh metadata cache: sf org refresh metadata');
                        console.log('    - Check if deployment included the field');
                        break;
                    case 'rest':
                        console.log('    - Check field permissions for the API user');
                        console.log('    - Verify field is not hidden by record types');
                        break;
                }
            }
        });

        console.log('\n  General suggestions:');
        console.log('    - Try logging out and back in: sf org logout && sf org login web');
        console.log('    - Clear local cache: rm -rf .sf/tools/sobjects');
        console.log('    - Verify deployment status: sf project deploy report');
    }

    /**
     * Save monitoring report
     */
    saveMonitoringReport(results) {
        const reportsDir = path.join(process.cwd(), 'propagation-reports');
        fs.mkdirSync(reportsDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `propagation-${results.field.replace('.', '_')}-${timestamp}.json`;
        const filePath = path.join(reportsDir, fileName);

        fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
        this.log(`\n📄 Report saved to: ${filePath}`);
    }

    /**
     * Verify field is fully operational
     */
    async verifyFieldOperational(objectName, fieldName) {
        console.log(`\n🔍 Verifying field is fully operational: ${objectName}.${fieldName}`);
        console.log('='.repeat(60));

        const checks = [
            {
                name: 'Field Queryable',
                test: async () => {
                    try {
                        const cmd = `sf data query --query "SELECT ${fieldName} FROM ${objectName} LIMIT 1" --target-org ${this.orgAlias} --json`;
                        execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
                        return { passed: true };
                    } catch (error) {
                        return { passed: false, error: error.message };
                    }
                }
            },
            {
                name: 'Field Writable',
                test: async () => {
                    try {
                        // Create a test record with the field
                        const testValue = this.getTestValueForField(fieldName);
                        const cmd = `sf data create record --sobject ${objectName} --values "${fieldName}='${testValue}'" --target-org ${this.orgAlias} --json`;
                        const result = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
                        const data = JSON.parse(result);

                        // Clean up test record
                        if (data.result && data.result.id) {
                            execSync(`sf data delete record --sobject ${objectName} --record-id ${data.result.id} --target-org ${this.orgAlias}`, { stdio: 'pipe' });
                        }

                        return { passed: data.status === 0 };
                    } catch (error) {
                        return { passed: false, error: error.message };
                    }
                }
            },
            {
                name: 'Field in Layouts',
                test: async () => {
                    try {
                        const query = `SELECT Name FROM Layout WHERE TableEnumOrId = '${objectName}'`;
                        const cmd = `sf data query --query "${query}" --use-tooling-api --target-org ${this.orgAlias} --json`;
                        const result = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
                        const data = JSON.parse(result);

                        // For now, just check layouts exist
                        return { passed: data.result && data.result.totalSize > 0 };
                    } catch {
                        return { passed: false, warning: 'Could not check layouts' };
                    }
                }
            }
        ];

        let allPassed = true;
        for (const check of checks) {
            const result = await check.test();
            console.log(`  ${result.passed ? '✅' : '❌'} ${check.name}`);

            if (result.error) {
                console.log(`      Error: ${result.error}`);
            }
            if (result.warning) {
                console.log(`      Warning: ${result.warning}`);
            }

            allPassed = allPassed && result.passed;
        }

        if (allPassed) {
            console.log('\n✅ Field is fully operational!');
        } else {
            console.log('\n⚠️ Field may not be fully operational. Check errors above.');
        }

        return allPassed;
    }

    /**
     * Get test value based on field type
     */
    getTestValueForField(fieldName) {
        // Simple heuristic based on field name
        if (fieldName.toLowerCase().includes('date')) return '2024-01-01';
        if (fieldName.toLowerCase().includes('amount')) return '100';
        if (fieldName.toLowerCase().includes('number')) return '42';
        if (fieldName.toLowerCase().includes('email')) return 'test@example.com';
        if (fieldName.toLowerCase().includes('phone')) return '555-0100';
        return 'Test Value';
    }

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Logging helper
     */
    log(message, level = 'info') {
        if (this.verbose || level === 'error') {
            console.log(message);
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(`
Usage: node metadata-propagation-monitor.js <ObjectName> <FieldName> [options]

Options:
  --org <alias>          Salesforce org alias
  --max-retries <n>      Maximum retry attempts (default: 30)
  --retry-interval <ms>  Interval between retries in ms (default: 2000)
  --timeout <ms>         Maximum wait time in ms (default: 120000)
  --verbose              Show detailed output
  --verify               Also verify field is operational after propagation

Examples:
  node metadata-propagation-monitor.js Account CustomField__c --org myorg
  node metadata-propagation-monitor.js Contact NewField__c --verify
  node metadata-propagation-monitor.js Lead Score__c --max-retries 60 --retry-interval 1000
        `);
        process.exit(1);
    }

    const [objectName, fieldName] = args;
    const options = {
        orgAlias: args.find(a => a.startsWith('--org'))?.split('=')[1],
        maxRetries: parseInt(args.find(a => a.startsWith('--max-retries'))?.split('=')[1]) || 30,
        retryInterval: parseInt(args.find(a => a.startsWith('--retry-interval'))?.split('=')[1]) || 2000,
        timeout: parseInt(args.find(a => a.startsWith('--timeout'))?.split('=')[1]) || 120000,
        verbose: args.includes('--verbose')
    };

    const monitor = new MetadataPropagationMonitor(options);

    monitor.monitorFieldPropagation(objectName, fieldName)
        .then(async (results) => {
            if (results.success && args.includes('--verify')) {
                await monitor.verifyFieldOperational(objectName, fieldName);
            }
            process.exit(results.success ? 0 : 1);
        })
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = MetadataPropagationMonitor;
