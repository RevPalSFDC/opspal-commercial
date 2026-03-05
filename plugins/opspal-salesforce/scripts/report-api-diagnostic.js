#!/usr/bin/env node

/**
 * Report API Diagnostic Tool
 * 
 * This script performs comprehensive diagnostics to identify and resolve
 * the three main issues with Salesforce report creation:
 * 1. Wrong tool usage (CLI analytics vs Reports API)
 * 2. UI names vs API names mismatch
 * 3. Folder access and API behavior issues
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const https = require('https');
const fs = require('fs').promises;

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m',
    magenta: '\x1b[35m'
};

class ReportAPIDiagnostic {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.auth = null;
        this.diagnosticResults = {
            timestamp: new Date().toISOString(),
            orgAlias: orgAlias,
            tests: [],
            recommendations: [],
            errors: []
        };
    }

    log(message, level = 'info') {
        const colorMap = {
            'success': colors.green,
            'error': colors.red,
            'warning': colors.yellow,
            'info': colors.blue,
            'header': colors.magenta
        };
        const color = colorMap[level] || colors.reset;
        console.log(`${color}${message}${colors.reset}`);
    }

    async authenticate() {
        try {
            let authCommand = 'sf org display --json';
            if (this.orgAlias) {
                authCommand += ` --target-org ${this.orgAlias}`;
            }

            const { stdout } = await execAsync(authCommand);
            const authData = JSON.parse(stdout);
            
            if (authData.status !== 0) {
                throw new Error('Authentication failed');
            }

            this.auth = {
                accessToken: authData.result.accessToken,
                instanceUrl: authData.result.instanceUrl,
                username: authData.result.username
            };

            this.log(`✓ Authenticated as ${this.auth.username}`, 'success');
            return true;
        } catch (error) {
            this.log(`✗ Authentication failed: ${error.message}`, 'error');
            this.diagnosticResults.errors.push(`Authentication: ${error.message}`);
            return false;
        }
    }

    async makeAPIRequest(endpoint, method = 'GET', body = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(`${this.auth.instanceUrl}${endpoint}`);
            const options = {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method: method,
                headers: {
                    'Authorization': `Bearer ${this.auth.accessToken}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (res.statusCode >= 400) {
                            reject({ statusCode: res.statusCode, body: result });
                        } else {
                            resolve(result);
                        }
                    } catch (e) {
                        reject({ statusCode: res.statusCode, body: data });
                    }
                });
            });

            req.on('error', reject);
            
            if (body) {
                req.write(JSON.stringify(body));
            }
            
            req.end();
        });
    }

    async testCLIAnalyticsVsReportsAPI() {
        this.log('\n=== Test 1: CLI Analytics vs Reports API ===', 'header');
        
        const test = {
            name: 'CLI Analytics vs Reports API',
            status: 'pending',
            details: {}
        };

        // Test 1A: Try CLI analytics command (should fail for classic reports)
        this.log('Testing CLI analytics command...', 'info');
        try {
            const { stdout, stderr } = await execAsync(
                `sf analytics report list --target-org ${this.orgAlias} 2>&1`,
                { timeout: 10000 }
            );
            
            if (stderr || stdout.includes('No results found')) {
                this.log('✓ CLI analytics correctly shows no classic reports', 'success');
                test.details.cliAnalytics = 'No classic reports (expected)';
            } else {
                this.log('⚠ CLI analytics returned unexpected results', 'warning');
                test.details.cliAnalytics = 'Unexpected results';
            }
        } catch (error) {
            this.log('✓ CLI analytics command not suitable for classic reports', 'success');
            test.details.cliAnalytics = 'Not for classic reports (correct)';
        }

        // Test 1B: Use proper Reports REST API
        this.log('Testing Reports REST API...', 'info');
        try {
            const reports = await this.makeAPIRequest('/services/data/v65.0/analytics/reports');
            this.log(`✓ Reports API returned ${reports.length || 0} reports`, 'success');
            test.details.reportsAPI = `Found ${reports.length || 0} reports`;
            test.status = 'passed';
        } catch (error) {
            this.log(`✗ Reports API failed: ${error.message}`, 'error');
            test.details.reportsAPI = `Failed: ${error.message}`;
            test.status = 'failed';
        }

        this.diagnosticResults.tests.push(test);
        
        if (test.status === 'passed') {
            this.diagnosticResults.recommendations.push(
                '✓ Use Reports REST API (/services/data/vXX.X/analytics/reports) for classic reports'
            );
            this.diagnosticResults.recommendations.push(
                '✗ Never use "sf analytics" CLI for classic Salesforce reports'
            );
        }
    }

    async testReportTypes() {
        this.log('\n=== Test 2: Report Type Discovery ===', 'header');
        
        const test = {
            name: 'Report Type Discovery',
            status: 'pending',
            details: {
                totalTypes: 0,
                activityTypes: [],
                gongTypes: []
            }
        };

        try {
            // Get all report types
            this.log('Fetching all report types...', 'info');
            const reportTypes = await this.makeAPIRequest('/services/data/v65.0/analytics/reportTypes');
            
            test.details.totalTypes = reportTypes.reportTypes?.length || 0;
            this.log(`✓ Found ${test.details.totalTypes} report types`, 'success');

            // Find Activities-related types
            const activityTypes = reportTypes.reportTypes?.filter(rt => 
                rt.label?.toLowerCase().includes('activities') ||
                rt.label?.toLowerCase().includes('task') ||
                rt.label?.toLowerCase().includes('event')
            ) || [];

            test.details.activityTypes = activityTypes.map(rt => ({
                type: rt.type,
                label: rt.label
            }));

            if (activityTypes.length > 0) {
                this.log('\nActivities-related report types:', 'info');
                activityTypes.forEach(rt => {
                    this.log(`  • ${rt.type}: ${rt.label}`, 'success');
                });
            }

            // Find Gong-related types
            const gongTypes = reportTypes.reportTypes?.filter(rt => 
                rt.label?.toLowerCase().includes('gong') ||
                rt.type?.toLowerCase().includes('gong')
            ) || [];

            test.details.gongTypes = gongTypes.map(rt => ({
                type: rt.type,
                label: rt.label
            }));

            if (gongTypes.length > 0) {
                this.log('\nGong-related report types:', 'info');
                gongTypes.forEach(rt => {
                    this.log(`  • ${rt.type}: ${rt.label}`, 'success');
                });
            }

            test.status = 'passed';
            
            this.diagnosticResults.recommendations.push(
                `✓ Always use exact report type tokens from API, not UI labels`
            );
            
            if (activityTypes.length > 0) {
                this.diagnosticResults.recommendations.push(
                    `✓ For "Tasks and Events", use type: "${activityTypes[0].type}"`
                );
            }

        } catch (error) {
            this.log(`✗ Failed to fetch report types: ${error.message}`, 'error');
            test.status = 'failed';
            test.details.error = error.message;
        }

        this.diagnosticResults.tests.push(test);
    }

    async testFolderAccess() {
        this.log('\n=== Test 3: Folder Access & Permissions ===', 'header');
        
        const test = {
            name: 'Folder Access',
            status: 'pending',
            details: {
                totalFolders: 0,
                writableFolders: [],
                readOnlyFolders: []
            }
        };

        try {
            // Get all report folders
            this.log('Fetching report folders...', 'info');
            const folders = await this.makeAPIRequest('/services/data/v65.0/folders?types=report');
            
            test.details.totalFolders = folders.length || 0;
            this.log(`✓ Found ${test.details.totalFolders} folders`, 'success');

            // Check folder permissions
            for (const folder of folders.slice(0, 5)) { // Test first 5 folders
                try {
                    // Attempt to get folder details
                    const folderDetails = await this.makeAPIRequest(
                        `/services/data/v65.0/folders/${folder.id}`
                    );
                    
                    const canWrite = folderDetails.accessType === 'Manager' || 
                                    folderDetails.accessType === 'Editor';
                    
                    if (canWrite) {
                        test.details.writableFolders.push({
                            id: folder.id,
                            name: folder.name,
                            access: folderDetails.accessType
                        });
                        this.log(`  ✓ ${folder.name}: Writable (${folderDetails.accessType})`, 'success');
                    } else {
                        test.details.readOnlyFolders.push({
                            id: folder.id,
                            name: folder.name,
                            access: folderDetails.accessType || 'Viewer'
                        });
                        this.log(`  ⚠ ${folder.name}: Read-only`, 'warning');
                    }
                } catch (err) {
                    // Folder access denied
                    test.details.readOnlyFolders.push({
                        id: folder.id,
                        name: folder.name,
                        access: 'No Access'
                    });
                }
            }

            test.status = test.details.writableFolders.length > 0 ? 'passed' : 'failed';
            
            if (test.details.writableFolders.length > 0) {
                this.diagnosticResults.recommendations.push(
                    `✓ Use folder ID "${test.details.writableFolders[0].id}" for report creation`
                );
            } else {
                this.diagnosticResults.recommendations.push(
                    '✗ No writable folders found - request Editor/Manager access'
                );
            }

        } catch (error) {
            this.log(`✗ Failed to fetch folders: ${error.message}`, 'error');
            test.status = 'failed';
            test.details.error = error.message;
        }

        this.diagnosticResults.tests.push(test);
    }

    async testSmokeReport() {
        this.log('\n=== Test 4: Smoke Test - Create Simple Report ===', 'header');
        
        const test = {
            name: 'Smoke Test Report Creation',
            status: 'pending',
            details: {}
        };

        // Find a writable folder from previous test
        const folderTest = this.diagnosticResults.tests.find(t => t.name === 'Folder Access');
        const writableFolder = folderTest?.details?.writableFolders?.[0];
        
        if (!writableFolder) {
            this.log('✗ No writable folder available for smoke test', 'error');
            test.status = 'skipped';
            test.details.reason = 'No writable folder';
            this.diagnosticResults.tests.push(test);
            return;
        }

        try {
            this.log(`Using folder: ${writableFolder.name} (${writableFolder.id})`, 'info');
            
            const reportMetadata = {
                reportMetadata: {
                    name: `ZZZ_Smoke_Test_${Date.now()}`,
                    reportType: { type: 'Opportunity' },
                    reportFormat: 'TABULAR',
                    folderId: writableFolder.id,
                    detailColumns: ['OPPORTUNITY_NAME', 'AMOUNT', 'CLOSE_DATE']
                }
            };

            this.log('Creating smoke test report...', 'info');
            const result = await this.makeAPIRequest(
                '/services/data/v65.0/analytics/reports',
                'POST',
                reportMetadata
            );

            if (result.id) {
                this.log(`✓ Successfully created report: ${result.id}`, 'success');
                test.status = 'passed';
                test.details.reportId = result.id;
                test.details.reportName = reportMetadata.reportMetadata.name;
                
                // Clean up - delete the test report
                try {
                    await this.makeAPIRequest(
                        `/services/data/v65.0/analytics/reports/${result.id}`,
                        'DELETE'
                    );
                    this.log('✓ Cleaned up test report', 'success');
                } catch (cleanupError) {
                    this.log('⚠ Could not clean up test report', 'warning');
                }
            } else {
                throw new Error('No report ID returned');
            }

        } catch (error) {
            this.log(`✗ Smoke test failed: ${JSON.stringify(error)}`, 'error');
            test.status = 'failed';
            test.details.error = error.body || error.message;
            
            // Parse error for common issues
            if (error.statusCode === 403) {
                this.diagnosticResults.recommendations.push(
                    '✗ Permission denied - check folder access and user permissions'
                );
            } else if (error.body?.message?.includes('reportType')) {
                this.diagnosticResults.recommendations.push(
                    '✗ Invalid report type - use exact API tokens from reportTypes endpoint'
                );
            }
        }

        this.diagnosticResults.tests.push(test);
    }

    async testMatrixReportGranularity() {
        this.log('\n=== Test 5: Matrix Report Date Granularity ===', 'header');
        
        const test = {
            name: 'Matrix Report Granularity',
            status: 'pending',
            details: {}
        };

        // Find a writable folder
        const folderTest = this.diagnosticResults.tests.find(t => t.name === 'Folder Access');
        const writableFolder = folderTest?.details?.writableFolders?.[0];
        
        if (!writableFolder) {
            test.status = 'skipped';
            test.details.reason = 'No writable folder';
            this.diagnosticResults.tests.push(test);
            return;
        }

        try {
            // Test with missing granularity (should fail)
            this.log('Testing matrix report WITHOUT date granularity...', 'info');
            const badMetadata = {
                reportMetadata: {
                    name: `ZZZ_Matrix_Bad_${Date.now()}`,
                    reportType: { type: 'Opportunity' },
                    reportFormat: 'MATRIX',
                    folderId: writableFolder.id,
                    groupingsAcross: [{
                        name: 'CLOSE_DATE',
                        sortOrder: 'ASC'
                        // Missing dateGranularity!
                    }],
                    groupingsDown: [{
                        name: 'ACCOUNT_NAME',
                        sortOrder: 'ASC'
                    }],
                    aggregates: [{ name: 'AMOUNT' }]
                }
            };

            try {
                await this.makeAPIRequest('/services/data/v65.0/analytics/reports', 'POST', badMetadata);
                this.log('⚠ Report created without granularity (unexpected)', 'warning');
            } catch (error) {
                this.log('✓ Correctly rejected report without date granularity', 'success');
                test.details.withoutGranularity = 'Correctly rejected';
            }

            // Test with proper granularity (should pass)
            this.log('Testing matrix report WITH date granularity...', 'info');
            const goodMetadata = {
                reportMetadata: {
                    name: `ZZZ_Matrix_Good_${Date.now()}`,
                    reportType: { type: 'Opportunity' },
                    reportFormat: 'MATRIX',
                    folderId: writableFolder.id,
                    groupingsAcross: [{
                        name: 'CLOSE_DATE',
                        sortOrder: 'ASC',
                        dateGranularity: 'DAY'  // Required for date fields!
                    }],
                    groupingsDown: [{
                        name: 'ACCOUNT_NAME',
                        sortOrder: 'ASC'
                    }],
                    aggregates: [{ name: 'AMOUNT' }]
                }
            };

            const result = await this.makeAPIRequest('/services/data/v65.0/analytics/reports', 'POST', goodMetadata);
            
            if (result.id) {
                this.log('✓ Successfully created matrix report with date granularity', 'success');
                test.status = 'passed';
                test.details.withGranularity = 'Success';
                
                // Clean up
                await this.makeAPIRequest(`/services/data/v65.0/analytics/reports/${result.id}`, 'DELETE');
            }

            this.diagnosticResults.recommendations.push(
                '✓ Always include dateGranularity for date fields in matrix reports'
            );

        } catch (error) {
            test.status = 'failed';
            test.details.error = error.message;
        }

        this.diagnosticResults.tests.push(test);
    }

    async runFullDiagnostic() {
        this.log(`${colors.bright}\n${'='.repeat(60)}${colors.reset}`, 'header');
        this.log(`${colors.bright}Salesforce Report API Diagnostic Tool${colors.reset}`, 'header');
        this.log(`${colors.bright}${'='.repeat(60)}${colors.reset}\n`, 'header');

        // Authenticate first
        const authSuccess = await this.authenticate();
        if (!authSuccess) {
            this.log('\n✗ Cannot proceed without authentication', 'error');
            return this.diagnosticResults;
        }

        // Run all tests
        await this.testCLIAnalyticsVsReportsAPI();
        await this.testReportTypes();
        await this.testFolderAccess();
        await this.testSmokeReport();
        await this.testMatrixReportGranularity();

        // Generate summary
        this.generateSummary();
        
        // Save results to file
        await this.saveResults();
        
        return this.diagnosticResults;
    }

    generateSummary() {
        this.log(`\n${colors.bright}${'='.repeat(60)}${colors.reset}`, 'header');
        this.log(`${colors.bright}DIAGNOSTIC SUMMARY${colors.reset}`, 'header');
        this.log(`${colors.bright}${'='.repeat(60)}${colors.reset}\n`, 'header');

        // Test results
        const passed = this.diagnosticResults.tests.filter(t => t.status === 'passed').length;
        const failed = this.diagnosticResults.tests.filter(t => t.status === 'failed').length;
        const skipped = this.diagnosticResults.tests.filter(t => t.status === 'skipped').length;
        
        this.log(`Tests Passed: ${passed}`, passed > 0 ? 'success' : 'info');
        this.log(`Tests Failed: ${failed}`, failed > 0 ? 'error' : 'info');
        this.log(`Tests Skipped: ${skipped}`, skipped > 0 ? 'warning' : 'info');

        // Key findings
        this.log(`\n${colors.bright}KEY FINDINGS:${colors.reset}`, 'header');
        this.diagnosticResults.tests.forEach(test => {
            const icon = test.status === 'passed' ? '✓' : test.status === 'failed' ? '✗' : '○';
            const color = test.status === 'passed' ? 'success' : test.status === 'failed' ? 'error' : 'warning';
            this.log(`${icon} ${test.name}: ${test.status.toUpperCase()}`, color);
        });

        // Recommendations
        if (this.diagnosticResults.recommendations.length > 0) {
            this.log(`\n${colors.bright}RECOMMENDATIONS:${colors.reset}`, 'header');
            this.diagnosticResults.recommendations.forEach(rec => {
                this.log(rec, rec.startsWith('✓') ? 'success' : 'warning');
            });
        }

        // Critical actions
        this.log(`\n${colors.bright}CRITICAL ACTIONS:${colors.reset}`, 'header');
        this.log('1. NEVER use "sf analytics" CLI for classic reports', 'error');
        this.log('2. ALWAYS use Reports REST API endpoints', 'success');
        this.log('3. ALWAYS use exact API tokens from reportTypes endpoint', 'success');
        this.log('4. ALWAYS verify folder write permissions before creation', 'success');
        this.log('5. ALWAYS include dateGranularity for date fields in matrix reports', 'success');
    }

    async saveResults() {
        const filename = `report-diagnostic-${new Date().toISOString().split('T')[0]}.json`;
        try {
            await fs.writeFile(filename, JSON.stringify(this.diagnosticResults, null, 2));
            this.log(`\nResults saved to: ${filename}`, 'info');
        } catch (error) {
            this.log(`\nCould not save results: ${error.message}`, 'warning');
        }
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    const orgAlias = args[0] || process.env.SF_TARGET_ORG || process.env.SF_TARGET_ORG;
    
    if (!orgAlias) {
        console.error('Usage: node report-api-diagnostic.js [org-alias]');
        console.error('Or set SF_TARGET_ORG or SF_TARGET_ORG environment variable');
        process.exit(1);
    }

    const diagnostic = new ReportAPIDiagnostic(orgAlias);
    const results = await diagnostic.runFullDiagnostic();
    
    // Exit with appropriate code
    const failed = results.tests.filter(t => t.status === 'failed').length;
    process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
    main().catch(error => {
        console.error('Diagnostic failed:', error);
        process.exit(1);
    });
}

module.exports = { ReportAPIDiagnostic };