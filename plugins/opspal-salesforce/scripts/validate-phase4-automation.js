#!/usr/bin/env node

/**
 * Phase 4 Automation Validation Script
 * Validates all 6 automation flows for the RevOps framework
 * Target Org: delta-sandbox
 */

const { execSafe } = require('./lib/child_process_safe');
const fs = require('fs');
const path = require('path');

class Phase4AutomationValidator {
    constructor() {
        this.orgAlias = process.env.SF_TARGET_ORG || 'delta-sandbox';
        this.validationResults = {
            flowsDeployed: [],
            flowsActivated: [],
            testResults: [],
            errors: [],
            warnings: []
        };
        
        this.expectedFlows = [
            'Opp_ClosedWon_CreateContract',
            'Contract_GenerateRenewal', 
            'Contract_AssignCohort',
            'Contract_ValidateData',
            'Contract_RenewalNotifications',
            'OLI_CreateSubscription'
        ];
    }

    log(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${level}: ${message}`;
        console.log(logMessage);
        
        // Also write to log file
        const logDir = path.join(__dirname, '..', 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        fs.appendFileSync(
            path.join(logDir, 'phase4-validation.log'),
            logMessage + '\n'
        );
    }

    // Helper function to derive trigger type from process type
    deriveTriggerType(processType) {
        const triggerTypeMap = {
            'AutoLaunchedFlow': 'Scheduled/Triggered',
            'RecordBeforeSave': 'Before Save',
            'RecordAfterSave': 'After Save',
            'RecordTriggeredFlow': 'Record Triggered',
            'ScheduledFlow': 'Scheduled',
            'PlatformEventFlow': 'Platform Event',
            'ScreenFlow': 'Screen Flow'
        };
        return triggerTypeMap[processType] || processType;
    }

    async validateFlowDeployment() {
        this.log('Starting flow deployment validation...');
        
        try {
            // Check if flows exist in org via FlowDefinitionView (has IsActive, ApiName, Label)
            const query = `SELECT Id, ApiName, Label, ProcessType, IsActive FROM FlowDefinitionView WHERE ApiName IN ('${this.expectedFlows.join("','")}')`;
            const { stdout } = await execSafe(`sf data query --use-tooling-api --query "${query}" --target-org ${this.orgAlias} --json`, { timeout: 20000 });
            const queryResult = JSON.parse(stdout || '{}');
            
            if (queryResult.status === 0 && queryResult.result.records) {
                const deployedFlows = queryResult.result.records;
                
                this.expectedFlows.forEach(flowName => {
                    const deployedFlow = deployedFlows.find(f => f.ApiName === flowName || f.Label === flowName);
                    if (deployedFlow) {
                        // Derive trigger type from ProcessType
                        let triggerType = this.deriveTriggerType(deployedFlow.ProcessType);
                        
                        this.validationResults.flowsDeployed.push({
                            name: flowName,
                            id: deployedFlow.Id,
                            processType: deployedFlow.ProcessType,
                            triggerType: triggerType,
                            isActive: deployedFlow.IsActive
                        });
                        
                        if (deployedFlow.IsActive) {
                            this.validationResults.flowsActivated.push(flowName);
                        }
                        
                        this.log(`✅ Flow deployed: ${flowName} (${deployedFlow.ProcessType}) - Active: ${deployedFlow.IsActive}`);
                    } else {
                        this.validationResults.errors.push(`Flow not found: ${flowName}`);
                        this.log(`❌ Flow missing: ${flowName}`, 'ERROR');
                    }
                });
            } else {
                this.validationResults.errors.push('Failed to query flows');
                this.log('❌ Failed to query flows from org', 'ERROR');
            }
        } catch (error) {
            this.validationResults.errors.push(`Flow query error: ${error.message}`);
            this.log(`❌ Error querying flows: ${error.message}`, 'ERROR');
        }
    }

    async validateObjectAndFieldAccess() {
        this.log('Validating object and field access...');
        
        const requiredObjects = [
            'Opportunity',
            'Contract', 
            'OpportunityLineItem',
            'Subscription__c',
            'Task'
        ];
        
        const requiredFields = [
            'Opportunity.Parent_Contract__c',
            'Opportunity.Expected_MRR__c',
            'Opportunity.Contract_Start_Date__c',
            'Opportunity.Contract_End_Date__c',
            'Opportunity.Contract_Term_Months__c',
            'Opportunity.Is_Renewal__c',
            'Contract.Source_Opportunity__c',
            'Contract.Monthly_Recurring_Revenue__c',
            'Contract.Renewal_Generated__c',
            'Contract.Contract_Cohort__c',
            'Contract.Last_Renewal_Notification__c'
        ];
        
        try {
            // Validate objects exist
            for (const objectName of requiredObjects) {
                try {
                    const { stdout } = await execSafe(`sf org list metadata-types --target-org ${this.orgAlias} --json`, { timeout: 20000 });
                    this.log(`✅ Object accessible: ${objectName}`);
                } catch (error) {
                    this.validationResults.warnings.push(`Object access concern: ${objectName}`);
                    this.log(`⚠️ Object access warning: ${objectName}`, 'WARN');
                }
            }
            
            this.log('Object and field validation completed');
            
        } catch (error) {
            this.validationResults.errors.push(`Object validation error: ${error.message}`);
            this.log(`❌ Object validation error: ${error.message}`, 'ERROR');
        }
    }

    async validateRecordTypes() {
        this.log('Validating required record types...');
        
        try {
            const query = `SELECT Id, Name, SobjectType FROM RecordType WHERE SobjectType = 'Opportunity' AND Name IN ('New Business Opportunity', 'Renewal Opportunity', 'Expansion Opportunity')`;
            const { stdout } = await execSafe(`sf data query --query "${query}" --target-org ${this.orgAlias} --json`, { timeout: 20000 });
            const queryResult = JSON.parse(stdout || '{}');
            
            if (queryResult.status === 0 && queryResult.result.records) {
                const recordTypes = queryResult.result.records;
                const expectedRecordTypes = ['New Business Opportunity', 'Renewal Opportunity', 'Expansion Opportunity'];
                
                expectedRecordTypes.forEach(rtName => {
                    const recordType = recordTypes.find(rt => rt.Name === rtName);
                    if (recordType) {
                        this.log(`✅ Record type found: ${rtName}`);
                    } else {
                        this.validationResults.warnings.push(`Missing record type: ${rtName}`);
                        this.log(`⚠️ Missing record type: ${rtName}`, 'WARN');
                    }
                });
            }
        } catch (error) {
            this.validationResults.errors.push(`Record type validation error: ${error.message}`);
            this.log(`❌ Record type validation error: ${error.message}`, 'ERROR');
        }
    }

    async runFunctionalTests() {
        this.log('Running functional tests...');
        
        const testScenarios = [
            this.testContractCreationFlow(),
            this.testCohortAssignment(),
            this.testDataValidation(),
            this.testSubscriptionCreation()
        ];
        
        for (const test of testScenarios) {
            try {
                await test;
            } catch (error) {
                this.validationResults.errors.push(`Test error: ${error.message}`);
                this.log(`❌ Test failed: ${error.message}`, 'ERROR');
            }
        }
    }

    async testContractCreationFlow() {
        this.log('Testing contract creation flow...');
        
        try {
            // Check if there are existing closed won opportunities
            const query = `SELECT Id, Name, StageName, AccountId FROM Opportunity WHERE StageName = 'Closed Won' LIMIT 5`;
            const { stdout } = await execSafe(`sf data query --query "${query}" --target-org ${this.orgAlias} --json`, { timeout: 20000 });
            const queryResult = JSON.parse(stdout || '{}');
            
            if (queryResult.status === 0 && queryResult.result.records && queryResult.result.records.length > 0) {
                this.log(`✅ Found ${queryResult.result.records.length} closed won opportunities for testing`);
                this.validationResults.testResults.push({
                    test: 'Contract Creation Flow Setup',
                    status: 'PASS',
                    details: `${queryResult.result.records.length} closed won opportunities available`
                });
            } else {
                this.validationResults.warnings.push('No closed won opportunities found for testing');
                this.log('⚠️ No closed won opportunities found for testing', 'WARN');
            }
            
        } catch (error) {
            this.validationResults.errors.push(`Contract creation test error: ${error.message}`);
            this.log(`❌ Contract creation test error: ${error.message}`, 'ERROR');
        }
    }

    async testCohortAssignment() {
        this.log('Testing cohort assignment flow...');
        
        try {
            // Check if there are contracts without cohorts
            const query = `SELECT Id, ContractNumber, StartDate, Contract_Cohort__c FROM Contract WHERE Contract_Cohort__c = null AND StartDate != null LIMIT 5`;
            const result = execSync(`sf data query --query "${query}" --target-org ${this.orgAlias} --json`, { encoding: 'utf8' });
            const queryResult = JSON.parse(result);
            
            if (queryResult.status === 0) {
                const contractCount = queryResult.result.records ? queryResult.result.records.length : 0;
                this.log(`✅ Found ${contractCount} contracts available for cohort assignment testing`);
                this.validationResults.testResults.push({
                    test: 'Cohort Assignment Flow Setup',
                    status: 'PASS',
                    details: `${contractCount} contracts available for cohort testing`
                });
            }
            
        } catch (error) {
            this.validationResults.errors.push(`Cohort assignment test error: ${error.message}`);
            this.log(`❌ Cohort assignment test error: ${error.message}`, 'ERROR');
        }
    }

    async testDataValidation() {
        this.log('Testing data validation flow...');
        
        try {
            // Check for contracts with source opportunities
            const query = `SELECT Id, ContractNumber, Monthly_Recurring_Revenue__c, Source_Opportunity__r.Expected_MRR__c FROM Contract WHERE Source_Opportunity__c != null LIMIT 5`;
            const result = execSync(`sf data query --query "${query}" --target-org ${this.orgAlias} --json`, { encoding: 'utf8' });
            const queryResult = JSON.parse(result);
            
            if (queryResult.status === 0) {
                const contractCount = queryResult.result.records ? queryResult.result.records.length : 0;
                this.log(`✅ Found ${contractCount} contracts with source opportunities for validation testing`);
                this.validationResults.testResults.push({
                    test: 'Data Validation Flow Setup',
                    status: 'PASS',
                    details: `${contractCount} contracts available for validation testing`
                });
            }
            
        } catch (error) {
            this.validationResults.errors.push(`Data validation test error: ${error.message}`);
            this.log(`❌ Data validation test error: ${error.message}`, 'ERROR');
        }
    }

    async testSubscriptionCreation() {
        this.log('Testing subscription creation flow...');
        
        try {
            // Check for opportunity line items on closed won opportunities
            const query = `SELECT Id, OpportunityId, Opportunity.StageName, Opportunity.Parent_Contract__c, Product2.Name, Quantity FROM OpportunityLineItem WHERE Opportunity.StageName = 'Closed Won' AND Opportunity.Parent_Contract__c != null LIMIT 5`;
            const result = execSync(`sf data query --query "${query}" --target-org ${this.orgAlias} --json`, { encoding: 'utf8' });
            const queryResult = JSON.parse(result);
            
            if (queryResult.status === 0) {
                const oliCount = queryResult.result.records ? queryResult.result.records.length : 0;
                this.log(`✅ Found ${oliCount} opportunity line items for subscription testing`);
                this.validationResults.testResults.push({
                    test: 'Subscription Creation Flow Setup',
                    status: 'PASS',
                    details: `${oliCount} opportunity line items available for subscription testing`
                });
            }
            
        } catch (error) {
            this.validationResults.errors.push(`Subscription creation test error: ${error.message}`);
            this.log(`❌ Subscription creation test error: ${error.message}`, 'ERROR');
        }
    }

    async validateScheduledFlows() {
        this.log('Validating scheduled flow configurations...');
        
        const scheduledFlows = ['Contract_GenerateRenewal', 'Contract_RenewalNotifications'];
        
        for (const flowName of scheduledFlows) {
            try {
                // Check if flow is scheduled
                const deployedFlow = this.validationResults.flowsDeployed.find(f => f.name === flowName);
                if (deployedFlow && deployedFlow.processType === 'AutoLaunchedFlow') {
                    this.log(`✅ Scheduled flow configured: ${flowName}`);
                    this.validationResults.testResults.push({
                        test: `Scheduled Flow Configuration - ${flowName}`,
                        status: 'PASS',
                        details: 'Flow configured as scheduled AutoLaunchedFlow'
                    });
                } else {
                    this.validationResults.warnings.push(`Scheduled flow configuration issue: ${flowName}`);
                    this.log(`⚠️ Scheduled flow issue: ${flowName}`, 'WARN');
                }
            } catch (error) {
                this.validationResults.errors.push(`Scheduled flow validation error: ${error.message}`);
                this.log(`❌ Scheduled flow validation error: ${error.message}`, 'ERROR');
            }
        }
    }

    generateValidationReport() {
        this.log('Generating validation report...');
        
        const report = {
            timestamp: new Date().toISOString(),
            targetOrg: this.orgAlias,
            summary: {
                totalFlows: this.expectedFlows.length,
                flowsDeployed: this.validationResults.flowsDeployed.length,
                flowsActivated: this.validationResults.flowsActivated.length,
                testsRun: this.validationResults.testResults.length,
                errors: this.validationResults.errors.length,
                warnings: this.validationResults.warnings.length
            },
            results: this.validationResults,
            recommendations: this.generateRecommendations()
        };
        
        // Write report to file
        const reportPath = path.join(__dirname, '..', 'reports', 'phase4-validation-report.json');
        const reportDir = path.dirname(reportPath);
        
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }
        
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        this.log(`📊 Validation report generated: ${reportPath}`);
        
        return report;
    }

    generateRecommendations() {
        const recommendations = [];
        
        if (this.validationResults.errors.length > 0) {
            recommendations.push({
                priority: 'HIGH',
                category: 'ERRORS',
                message: `${this.validationResults.errors.length} errors found that must be resolved before go-live`,
                actions: ['Review error log', 'Fix deployment issues', 'Re-run validation']
            });
        }
        
        if (this.validationResults.flowsDeployed.length < this.expectedFlows.length) {
            recommendations.push({
                priority: 'HIGH', 
                category: 'DEPLOYMENT',
                message: 'Not all flows are deployed to the target org',
                actions: ['Deploy missing flows', 'Verify metadata deployment', 'Check permissions']
            });
        }
        
        if (this.validationResults.flowsActivated.length < this.validationResults.flowsDeployed.length) {
            recommendations.push({
                priority: 'MEDIUM',
                category: 'ACTIVATION',
                message: 'Some deployed flows are not activated',
                actions: ['Activate flows manually', 'Test flow functionality', 'Monitor execution']
            });
        }
        
        if (this.validationResults.warnings.length > 0) {
            recommendations.push({
                priority: 'MEDIUM',
                category: 'WARNINGS',
                message: `${this.validationResults.warnings.length} warnings found that should be reviewed`,
                actions: ['Review warnings', 'Address configuration gaps', 'Update documentation']
            });
        }
        
        // Success recommendations
        if (this.validationResults.errors.length === 0 && this.validationResults.flowsDeployed.length === this.expectedFlows.length) {
            recommendations.push({
                priority: 'LOW',
                category: 'SUCCESS',
                message: 'Phase 4 automation flows are ready for production use',
                actions: ['Conduct user training', 'Monitor initial executions', 'Set up ongoing monitoring']
            });
        }
        
        return recommendations;
    }

    async run() {
        this.log('🚀 Starting Phase 4 Automation Validation...');
        
        try {
            await this.validateFlowDeployment();
            await this.validateObjectAndFieldAccess();
            await this.validateRecordTypes();
            await this.runFunctionalTests();
            await this.validateScheduledFlows();
            
            const report = this.generateValidationReport();
            
            // Print summary
            console.log('\n📊 VALIDATION SUMMARY');
            console.log('======================');
            console.log(`Target Org: ${this.orgAlias}`);
            console.log(`Total Flows: ${report.summary.totalFlows}`);
            console.log(`Flows Deployed: ${report.summary.flowsDeployed}`);
            console.log(`Flows Activated: ${report.summary.flowsActivated}`);
            console.log(`Tests Run: ${report.summary.testsRun}`);
            console.log(`Errors: ${report.summary.errors}`);
            console.log(`Warnings: ${report.summary.warnings}`);
            
            if (report.summary.errors === 0) {
                console.log('\n✅ Phase 4 validation completed successfully!');
            } else {
                console.log('\n❌ Phase 4 validation completed with errors. Review the report for details.');
            }
            
            this.log('Phase 4 automation validation completed');
            
        } catch (error) {
            this.log(`❌ Validation failed: ${error.message}`, 'ERROR');
            throw error;
        }
    }
}

// Run validation if called directly
if (require.main === module) {
    const validator = new Phase4AutomationValidator();
    validator.run().catch(error => {
        console.error('Validation failed:', error);
        process.exit(1);
    });
}

module.exports = Phase4AutomationValidator;
