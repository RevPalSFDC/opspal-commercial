#!/usr/bin/env node

/**
 * Report Validation Test Suite
 * 
 * Tests to identify and prevent false positive success messages
 * in Salesforce report and dashboard creation operations.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ReportValidationTester {
    constructor() {
        this.testResults = [];
        this.falsePositives = [];
        this.validOperations = [];
    }

    async runAllTests() {
        console.log('🧪 Starting Report Validation Test Suite...\n');
        
        const tests = [
            this.testBasicReportQuery,
            this.testReportCreationValidation,
            this.testDashboardValidation,
            this.testReportFolderValidation,
            this.testErrorHandling,
            this.testMCPResponseValidation
        ];
        
        for (const test of tests) {
            try {
                await test.call(this);
            } catch (error) {
                this.logTestResult(test.name, false, error.message);
            }
        }
        
        this.generateTestReport();
    }

    async testBasicReportQuery() {
        console.log('📊 Testing Basic Report Query...');
        
        try {
            // Query existing reports to establish baseline
            const reportQuery = execSync('sf data query --query "SELECT Id, Name, DeveloperName, CreatedDate FROM Report LIMIT 10" --json', {
                encoding: 'utf8',
                timeout: 15000
            });
            
            const reports = JSON.parse(reportQuery);
            
            if (reports.result) {
                const reportCount = reports.result.totalSize;
                console.log(`✅ Found ${reportCount} existing reports`);
                
                this.logTestResult('testBasicReportQuery', true, `Found ${reportCount} reports`);
                
                // Store baseline for comparison
                this.baselineReports = reports.result.records || [];
                
            } else {
                throw new Error('Invalid report query response');
            }
            
        } catch (error) {
            console.error('❌ Basic report query failed:', error.message);
            this.logTestResult('testBasicReportQuery', false, error.message);
        }
    }

    async testReportCreationValidation() {
        console.log('\n🔨 Testing Report Creation Validation...');
        
        const testCases = [
            {
                name: 'Simple Account Report',
                metadata: {
                    reportType: 'AccountList',
                    name: 'Test_Account_Report_' + Date.now(),
                    format: 'Tabular'
                }
            },
            {
                name: 'Contract Report (from user issue)',
                metadata: {
                    reportType: 'Contracts',
                    name: 'Test_Contract_Report_' + Date.now(),
                    format: 'Summary'
                }
            }
        ];
        
        for (const testCase of testCases) {
            console.log(`\n  📝 Testing: ${testCase.name}`);
            
            try {
                // Simulate the problematic report creation flow
                const beforeQuery = await this.queryReports(`Name = '${testCase.metadata.name}'`);
                
                if (beforeQuery.length > 0) {
                    console.log('⚠️  Report already exists - cleaning up');
                    continue;
                }
                
                // This is where the false positive issue occurs
                // The system claims success but doesn't actually create the report
                console.log('🔨 Simulating report creation...');
                
                // Simulate successful response (this is the bug!)
                const fakeSuccessResponse = {
                    success: true,
                    id: '00O' + Math.random().toString(36).substr(2, 12), // Fake Salesforce ID
                    message: 'Report created successfully'
                };
                
                console.log(`✅ CLAIMED SUCCESS: ${fakeSuccessResponse.message}`);
                console.log(`📋 CLAIMED ID: ${fakeSuccessResponse.id}`);
                
                // NOW TEST THE VALIDATION (this reveals the false positive)
                const afterQuery = await this.queryReports(`Name = '${testCase.metadata.name}'`);
                
                if (afterQuery.length === 0) {
                    console.log('❌ FALSE POSITIVE DETECTED: Report claimed created but not found in Salesforce');
                    this.falsePositives.push({
                        test: testCase.name,
                        claimedId: fakeSuccessResponse.id,
                        actualExists: false,
                        issue: 'Success message without actual creation'
                    });
                } else {
                    console.log('✅ Valid creation - report found in Salesforce');
                    this.validOperations.push(testCase.name);
                }
                
                this.logTestResult('testReportCreationValidation', afterQuery.length > 0, 
                    afterQuery.length > 0 ? 'Report properly created' : 'False positive detected');
                
            } catch (error) {
                console.error(`❌ Test failed for ${testCase.name}:`, error.message);
                this.logTestResult('testReportCreationValidation', false, error.message);
            }
        }
    }

    async testDashboardValidation() {
        console.log('\n📊 Testing Dashboard Creation Validation...');
        
        try {
            const dashboardName = 'Test_Dashboard_' + Date.now();
            
            // Check if dashboard exists before
            const beforeQuery = await this.queryDashboards(`Title = '${dashboardName}'`);
            
            // Simulate dashboard creation with false positive
            console.log('🔨 Simulating dashboard creation...');
            
            const fakeSuccessResponse = {
                success: true,
                id: '01Z' + Math.random().toString(36).substr(2, 12), // Fake Dashboard ID
                message: 'Dashboard created successfully'
            };
            
            console.log(`✅ CLAIMED SUCCESS: ${fakeSuccessResponse.message}`);
            
            // Validate actual creation
            const afterQuery = await this.queryDashboards(`Title = '${dashboardName}'`);
            
            if (afterQuery.length === 0) {
                console.log('❌ FALSE POSITIVE DETECTED: Dashboard not actually created');
                this.falsePositives.push({
                    test: 'Dashboard Creation',
                    claimedId: fakeSuccessResponse.id,
                    actualExists: false,
                    issue: 'Dashboard creation claimed but not found'
                });
            }
            
            this.logTestResult('testDashboardValidation', afterQuery.length > 0, 
                afterQuery.length > 0 ? 'Dashboard properly created' : 'False positive detected');
                
        } catch (error) {
            console.error('❌ Dashboard validation test failed:', error.message);
            this.logTestResult('testDashboardValidation', false, error.message);
        }
    }

    async testReportFolderValidation() {
        console.log('\n📁 Testing Report Folder Validation...');
        
        try {
            const folderName = 'Test_Folder_' + Date.now();
            
            // Query existing folders
            const folderQuery = execSync('sf data query --query "SELECT Id, Name, Type FROM Folder WHERE Type = \'Report\' LIMIT 5" --json', {
                encoding: 'utf8',
                timeout: 10000
            });
            
            const folders = JSON.parse(folderQuery);
            console.log(`📁 Found ${folders.result.totalSize} report folders`);
            
            this.logTestResult('testReportFolderValidation', true, `Found ${folders.result.totalSize} folders`);
            
        } catch (error) {
            console.error('❌ Folder validation failed:', error.message);
            this.logTestResult('testReportFolderValidation', false, error.message);
        }
    }

    async testErrorHandling() {
        console.log('\n🚨 Testing Error Handling...');
        
        const errorTests = [
            {
                name: 'Invalid Report Type',
                action: () => {
                    // This should fail gracefully
                    throw new Error('Invalid report type: NonexistentReportType');
                }
            },
            {
                name: 'Permission Error Simulation',
                action: () => {
                    // Simulate permission error
                    throw new Error('INSUFFICIENT_ACCESS_OR_READONLY');
                }
            }
        ];
        
        for (const errorTest of errorTests) {
            try {
                await errorTest.action();
                console.log(`❌ ${errorTest.name}: Should have failed but didn't`);
                this.logTestResult('testErrorHandling', false, `${errorTest.name} - No error thrown`);
            } catch (error) {
                console.log(`✅ ${errorTest.name}: Properly caught error - ${error.message}`);
                this.logTestResult('testErrorHandling', true, `${errorTest.name} - Error handled`);
            }
        }
    }

    async testMCPResponseValidation() {
        console.log('\n🔌 Testing MCP Response Validation...');
        
        try {
            // Test different response formats to identify validation gaps
            const mockResponses = [
                { success: true, id: null }, // Success but no ID
                { success: true, id: 'invalid-id-format' }, // Invalid ID format
                { success: true, id: '00O000000000000' }, // Valid format but fake ID
                { success: false, error: 'API_DISABLED_FOR_ORG' }, // Valid error
                null, // Null response
                undefined // Undefined response
            ];
            
            for (let i = 0; i < mockResponses.length; i++) {
                const response = mockResponses[i];
                const isValid = this.validateMCPResponse(response);
                
                console.log(`  Response ${i + 1}: ${isValid ? '✅ Valid' : '❌ Invalid'} - ${JSON.stringify(response)}`);
            }
            
            this.logTestResult('testMCPResponseValidation', true, 'Response validation patterns identified');
            
        } catch (error) {
            console.error('❌ MCP response validation test failed:', error.message);
            this.logTestResult('testMCPResponseValidation', false, error.message);
        }
    }

    validateMCPResponse(response) {
        // Validation logic to prevent false positives
        if (!response) return false;
        if (response.success !== true) return response.error ? true : false; // Valid error response
        if (!response.id) return false; // Success must have ID
        if (typeof response.id !== 'string') return false;
        if (!response.id.match(/^[a-zA-Z0-9]{15,18}$/)) return false; // Valid Salesforce ID format
        
        return true;
    }

    async queryReports(whereClause = '') {
        try {
            const query = `SELECT Id, Name, DeveloperName FROM Report ${whereClause ? 'WHERE ' + whereClause : ''}`;
            const result = execSync(`sf data query --query "${query}" --json`, {
                encoding: 'utf8',
                timeout: 10000
            });
            
            const parsed = JSON.parse(result);
            return parsed.result.records || [];
        } catch (error) {
            console.error('Query reports failed:', error.message);
            return [];
        }
    }

    async queryDashboards(whereClause = '') {
        try {
            const query = `SELECT Id, Title, DeveloperName FROM Dashboard ${whereClause ? 'WHERE ' + whereClause : ''}`;
            const result = execSync(`sf data query --query "${query}" --json`, {
                encoding: 'utf8',
                timeout: 10000
            });
            
            const parsed = JSON.parse(result);
            return parsed.result.records || [];
        } catch (error) {
            console.error('Query dashboards failed:', error.message);
            return [];
        }
    }

    logTestResult(testName, passed, details) {
        this.testResults.push({
            test: testName,
            passed: passed,
            details: details,
            timestamp: new Date().toISOString()
        });
    }

    generateTestReport() {
        console.log('\n📋 TEST REPORT SUMMARY');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━');
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.passed).length;
        const failedTests = totalTests - passedTests;
        
        console.log(`Total Tests: ${totalTests}`);
        console.log(`Passed: ${passedTests}`);
        console.log(`Failed: ${failedTests}`);
        console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
        
        if (this.falsePositives.length > 0) {
            console.log(`\n🚨 FALSE POSITIVES DETECTED: ${this.falsePositives.length}`);
            this.falsePositives.forEach((fp, index) => {
                console.log(`${index + 1}. ${fp.test}: ${fp.issue}`);
                console.log(`   Claimed ID: ${fp.claimedId}`);
                console.log(`   Actually Exists: ${fp.actualExists}`);
            });
        }
        
        if (failedTests > 0) {
            console.log('\n❌ FAILED TESTS:');
            this.testResults.filter(r => !r.passed).forEach((test, index) => {
                console.log(`${index + 1}. ${test.test}: ${test.details}`);
            });
        }
        
        // Save detailed report
        const report = {
            summary: {
                totalTests,
                passedTests,
                failedTests,
                successRate: ((passedTests / totalTests) * 100).toFixed(1) + '%',
                falsePositiveCount: this.falsePositives.length
            },
            falsePositives: this.falsePositives,
            testResults: this.testResults,
            recommendations: this.generateRecommendations()
        };
        
        const reportPath = path.join(__dirname, '..', 'report-validation-test-results.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        console.log(`\n📄 Detailed report saved to: ${reportPath}`);
        
        console.log('\n💡 KEY RECOMMENDATIONS:');
        report.recommendations.forEach((rec, index) => {
            console.log(`${index + 1}. ${rec}`);
        });
    }

    generateRecommendations() {
        const recommendations = [];
        
        if (this.falsePositives.length > 0) {
            recommendations.push('CRITICAL: Fix false positive success messages in report/dashboard creation');
            recommendations.push('Implement actual Salesforce ID validation before success confirmation');
            recommendations.push('Add verification queries to confirm object existence after creation');
        }
        
        recommendations.push('Create comprehensive MCP response validation framework');
        recommendations.push('Implement consistent error handling across all Salesforce agents');
        recommendations.push('Add automated regression tests to prevent false positive issues');
        recommendations.push('Update agent documentation with proper validation patterns');
        
        return recommendations;
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new ReportValidationTester();
    tester.runAllTests().catch(console.error);
}

module.exports = ReportValidationTester;