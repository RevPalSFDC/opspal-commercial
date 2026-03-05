#!/usr/bin/env node

/**
 * Lead Conversion Diagnostic Tool
 *
 * Purpose: Comprehensive analysis of Lead conversion blockers
 *
 * Features:
 * - Analyzes specific Lead record for conversion readiness
 * - Checks Contact required fields and validation rules
 * - Validates field mappings from LeadConvertSettings
 * - Tests validation rules against Lead data
 * - Identifies RecordType mapping issues
 * - Ranks blockers by likelihood
 * - Provides specific remediation steps
 *
 * Usage:
 *   node lead-conversion-diagnostics.js <org-alias> <lead-id>
 *   node lead-conversion-diagnostics.js wedgewood-production 00QUw00000SHtL2MAL
 *
 * Output:
 *   Comprehensive diagnostic report with root cause and solutions
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const OrgMetadataCache = require('./org-metadata-cache');

class LeadConversionDiagnostics {
    constructor(orgAlias, leadId) {
        this.orgAlias = orgAlias;
        this.leadId = leadId;
        this.cache = new OrgMetadataCache(orgAlias);
        this.issues = [];
        this.warnings = [];
        this.solutions = [];
    }

    /**
     * Execute SF CLI command
     */
    execSfCommand(command) {
        try {
            const result = execSync(command, {
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            return JSON.parse(result);
        } catch (error) {
            console.error(`Error executing: ${command}`);
            console.error(error.message);
            return null;
        }
    }

    /**
     * Run comprehensive diagnostic
     */
    async diagnose() {
        console.log(`\n🔍 Lead Conversion Diagnostic Tool v2.0`);
        console.log(`=========================================\n`);
        console.log(`Org: ${this.orgAlias}`);
        console.log(`Lead ID: ${this.leadId}\n`);

        // Step 1: Load metadata cache
        console.log('📦 Loading metadata cache...');
        try {
            this.cacheData = this.cache.loadCache();
            console.log('   ✓ Cache loaded\n');
        } catch (error) {
            console.error('   ❌ Cache not found. Building now...\n');
            await this.cache.buildCache();
            this.cacheData = this.cache.loadCache();
        }

        // Step 2: Get Lead data
        console.log('👤 Fetching Lead record...');
        this.leadData = await this.fetchLeadData();
        if (!this.leadData) {
            console.error('   ❌ Failed to fetch Lead data');
            return;
        }
        console.log(`   ✓ Lead: ${this.leadData.FirstName} ${this.leadData.LastName} (${this.leadData.Company})\n`);

        // Step 3: Analyze Lead conversion settings
        console.log('🔄 Analyzing Lead conversion settings...');
        this.fieldMappings = await this.analyzeLeadConvertSettings();
        console.log(`   ✓ Found ${this.fieldMappings.length} field mappings\n`);

        // Step 4: Check Contact required fields
        console.log('📋 Checking Contact required fields...');
        await this.checkRequiredFields();
        console.log(`   ✓ Analyzed ${this.requiredFields.length} required fields\n`);

        // Step 5: Test validation rules
        console.log('✅ Testing validation rules...');
        await this.testValidationRules();
        console.log(`   ✓ Tested ${this.validationRules.length} validation rules\n`);

        // Step 6: Check RecordType mapping
        console.log('🏷️  Checking RecordType mapping...');
        await this.checkRecordTypeMapping();
        console.log('   ✓ RecordType analysis complete\n');

        // Step 7: Check for interfering Flows (NEW)
        console.log('⚡ Checking for automation conflicts...');
        await this.checkContactFlows();
        console.log('   ✓ Flow analysis complete\n');

        // Step 8: Calculate readiness score (NEW)
        this.calculateReadinessScore();

        // Step 9: Generate report
        this.generateReport();
    }

    /**
     * Fetch Lead record data
     */
    async fetchLeadData() {
        // Get all fields on Lead
        const leadMetadata = this.cacheData.objects['Lead'];
        if (!leadMetadata) {
            throw new Error('Lead object not found in cache');
        }

        // Build SOQL with all queryable fields
        const fields = Object.keys(leadMetadata.fields)
            .filter(f => !leadMetadata.fields[f].calculated)
            .filter(f => !f.includes('.'))
            .slice(0, 50); // Limit to avoid query complexity

        // Add critical fields if not included
        const criticalFields = ['Id', 'FirstName', 'LastName', 'Email', 'Company',
                               'Phone', 'Status', 'RecordTypeId', 'IsConverted',
                               'ConvertedContactId'];
        for (const field of criticalFields) {
            if (!fields.includes(field)) {
                fields.push(field);
            }
        }

        const soql = `SELECT ${fields.join(', ')} FROM Lead WHERE Id = '${this.leadId}'`;

        const result = this.execSfCommand(
            `sf data query --query "${soql}" --json --target-org ${this.orgAlias}`
        );

        if (!result || !result.result || !result.result.records || result.result.records.length === 0) {
            return null;
        }

        return result.result.records[0];
    }

    /**
     * Analyze LeadConvertSettings
     */
    async analyzeLeadConvertSettings() {
        const mappings = [];

        if (!this.cacheData.leadConvertSettings) {
            this.warnings.push('No LeadConvertSettings found in cache');
            return mappings;
        }

        // Parse XML to extract mappings
        const xml = this.cacheData.leadConvertSettings;

        // Extract Contact mappings
        const contactMappingMatch = xml.match(/<outputObject>Contact<\/outputObject>([\s\S]*?)<\/objectMapping>/);
        if (contactMappingMatch) {
            const mappingSection = contactMappingMatch[1];
            const fieldMatches = mappingSection.matchAll(/<inputField>(.*?)<\/inputField>[\s\S]*?<outputField>(.*?)<\/outputField>/g);

            for (const match of fieldMatches) {
                mappings.push({
                    leadField: match[1],
                    contactField: match[2]
                });
            }
        }

        return mappings;
    }

    /**
     * Check Contact required fields
     */
    async checkRequiredFields() {
        const contactMetadata = this.cacheData.objects['Contact'];
        if (!contactMetadata) {
            throw new Error('Contact object not found in cache');
        }

        this.requiredFields = [];

        for (const [fieldName, fieldData] of Object.entries(contactMetadata.fields)) {
            if (!fieldData.nillable && fieldData.createable && !fieldData.calculated) {
                this.requiredFields.push({
                    name: fieldName,
                    type: fieldData.type,
                    defaultValue: fieldData.defaultValue,
                    label: fieldData.label,
                    picklistValues: fieldData.picklistValues
                });

                // Check if field has mapping or default
                const hasMapping = this.fieldMappings.some(m => m.contactField === fieldName);
                const hasDefault = fieldData.defaultValue !== null && fieldData.defaultValue !== undefined;
                const isSystem = ['OwnerId', 'LastName'].includes(fieldName);

                if (!hasMapping && !hasDefault && !isSystem) {
                    // Check if Lead has corresponding value
                    const leadFieldName = fieldName.replace('__c', '__c'); // Try exact match first
                    const leadValue = this.leadData[leadFieldName] || this.leadData[fieldName];

                    if (!leadValue) {
                        this.issues.push({
                            severity: 'CRITICAL',
                            field: fieldName,
                            type: 'MISSING_REQUIRED_VALUE',
                            message: `Required field '${fieldName}' (${fieldData.label}) has no default value and no field mapping from Lead`,
                            leadFieldValue: null,
                            contactFieldType: fieldData.type,
                            picklistValues: fieldData.picklistValues,
                            solution: this.generateSolutionForRequiredField(fieldName, fieldData)
                        });
                    }
                }
            }
        }
    }

    /**
     * Test validation rules against Lead data
     */
    async testValidationRules() {
        this.validationRules = [];

        const contactMetadata = this.cacheData.objects['Contact'];
        if (!contactMetadata || !contactMetadata.validationRules) {
            return;
        }

        // Get full validation rule formulas
        for (const rule of contactMetadata.validationRules) {
            const fullRule = await this.fetchValidationRuleFormula(rule.name);
            if (fullRule) {
                this.validationRules.push(fullRule);

                // Analyze if rule could be triggered
                const couldTrigger = this.analyzeValidationRule(fullRule);
                if (couldTrigger) {
                    this.issues.push({
                        severity: 'HIGH',
                        field: fullRule.errorDisplayField,
                        type: 'VALIDATION_RULE',
                        message: `Validation rule '${rule.name}' might fail: ${fullRule.errorMessage}`,
                        ruleFormula: fullRule.formula,
                        solution: this.generateSolutionForValidationRule(fullRule)
                    });
                }
            }
        }
    }

    /**
     * Fetch validation rule formula
     */
    async fetchValidationRuleFormula(ruleName) {
        const result = this.execSfCommand(
            `sf data query --query "SELECT Id, Metadata FROM ValidationRule WHERE ValidationName = '${ruleName}' AND EntityDefinitionId = 'Contact'" --use-tooling-api --json --target-org ${this.orgAlias}`
        );

        if (!result || !result.result || !result.result.records || result.result.records.length === 0) {
            return null;
        }

        const metadata = result.result.records[0].Metadata;
        return {
            name: ruleName,
            formula: metadata.errorConditionFormula,
            errorMessage: metadata.errorMessage,
            errorDisplayField: metadata.errorDisplayField,
            active: metadata.active
        };
    }

    /**
     * Analyze if validation rule could trigger
     */
    analyzeValidationRule(rule) {
        // Simple heuristic: check if formula references fields with null values
        const formula = rule.formula.toUpperCase();

        // Check for ISBLANK/ISNULL checks
        if (formula.includes('ISBLANK') || formula.includes('ISNULL') || formula.includes('ISPICKVAL')) {
            // Try to extract field names
            const fieldMatches = formula.match(/\b[A-Z_]+__c\b/gi);
            if (fieldMatches) {
                for (const field of fieldMatches) {
                    // Check if this field would be empty after conversion
                    const mapping = this.fieldMappings.find(m =>
                        m.contactField.toUpperCase() === field.toUpperCase()
                    );

                    if (!mapping) {
                        // Field not mapped and might be empty
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * Check RecordType mapping
     */
    async checkRecordTypeMapping() {
        const leadRecordTypeId = this.leadData.RecordTypeId;
        const contactMetadata = this.cacheData.objects['Contact'];

        if (!leadRecordTypeId || !contactMetadata.recordTypes || contactMetadata.recordTypes.length === 0) {
            this.warnings.push('No RecordType analysis required');
            return;
        }

        // Get Lead RecordType info
        const leadMetadata = this.cacheData.objects['Lead'];
        const leadRecordType = leadMetadata.recordTypes.find(rt => rt.recordTypeId === leadRecordTypeId);

        console.log(`   Lead RecordType: ${leadRecordType ? leadRecordType.name : 'Unknown'}`);
        console.log(`   Available Contact RecordTypes: ${contactMetadata.recordTypes.map(rt => rt.name).join(', ')}`);

        // Note: Default RecordType will be used if no specific mapping
        this.warnings.push(`Lead will convert to default Contact RecordType (user will select during conversion)`);
    }

    /**
     * Generate solution for required field
     */
    generateSolutionForRequiredField(fieldName, fieldData) {
        const solutions = [];

        if (fieldData.type === 'picklist' && fieldData.picklistValues && fieldData.picklistValues.length > 0) {
            solutions.push({
                option: 1,
                title: 'Set Default Value',
                steps: [
                    `Navigate to: Setup → Object Manager → Contact → ${fieldName}`,
                    `Set Default Value: "${fieldData.picklistValues[0].value}"`,
                    'Save'
                ],
                pros: ['Quick fix', 'No code required', 'Immediate effect'],
                cons: ['All future conversions will use this default'],
                estimatedTime: '2 minutes'
            });
        }

        if (fieldData.type === 'boolean') {
            solutions.push({
                option: 1,
                title: 'Set Default Value to False',
                steps: [
                    `Navigate to: Setup → Object Manager → Contact → ${fieldName}`,
                    'Set Default Value: false',
                    'Save'
                ],
                pros: ['Instant fix'],
                cons: ['None'],
                estimatedTime: '1 minute'
            });
        }

        solutions.push({
            option: solutions.length + 1,
            title: 'Create Field Mapping',
            steps: [
                'Identify corresponding Lead field',
                'Update LeadConvertSettings metadata',
                'Deploy changes',
                'Test conversion'
            ],
            pros: ['Proper data mapping', 'Maintains data integrity'],
            cons: ['Requires deployment', 'More complex'],
            estimatedTime: '15 minutes'
        });

        solutions.push({
            option: solutions.length + 1,
            title: 'Make Field Optional',
            steps: [
                `Navigate to: Setup → Object Manager → Contact → ${fieldName}`,
                'Uncheck "Required"',
                'Save'
            ],
            pros: ['Removes blocker immediately'],
            cons: ['May compromise data quality', 'Might be business-critical field'],
            estimatedTime: '2 minutes'
        });

        return solutions;
    }

    /**
     * Generate solution for validation rule
     */
    generateSolutionForValidationRule(rule) {
        return [
            {
                option: 1,
                title: 'Temporarily Deactivate Rule',
                steps: [
                    `Navigate to: Setup → Object Manager → Contact → Validation Rules → ${rule.name}`,
                    'Click "Deactivate"',
                    'Convert Lead',
                    'Manually populate required fields on Contact',
                    'Reactivate validation rule'
                ],
                pros: ['Quick workaround'],
                cons: ['Manual process', 'Risk of forgetting to reactivate'],
                estimatedTime: '5 minutes'
            },
            {
                option: 2,
                title: 'Update Lead Data Before Conversion',
                steps: [
                    'Identify missing field values causing validation failure',
                    'Update Lead record with required data',
                    'Convert Lead'
                ],
                pros: ['Permanent fix', 'Maintains data quality'],
                cons: ['Requires identifying exact values needed'],
                estimatedTime: '10 minutes'
            },
            {
                option: 3,
                title: 'Modify Validation Rule',
                steps: [
                    'Analyze validation rule formula',
                    'Add exception for new Contact records from Lead conversion',
                    'Example: Add "OR( ISNEW(), ... )" to formula',
                    'Deploy and test'
                ],
                pros: ['Allows conversion without data', 'Maintains validation for other scenarios'],
                cons: ['Changes business logic', 'Requires testing'],
                estimatedTime: '20 minutes'
            }
        ];
    }

    /**
     * Check for Flows that run on Contact creation (NEW)
     * Identifies automation that might interfere with Lead conversion
     */
    async checkContactFlows() {
        this.contactFlows = [];

        try {
            // Query for Flows on Contact with Create trigger
            const result = this.execSfCommand(
                `sf data query --query "SELECT Id, MasterLabel, ProcessType, Description FROM Flow WHERE Status = 'Active' AND ProcessType = 'AutoLaunchedFlow'" --use-tooling-api --json --target-org ${this.orgAlias}`
            );

            if (!result || !result.result || !result.result.records) {
                return;
            }

            // For each active Flow, check if it's on Contact
            for (const flow of result.result.records) {
                // Retrieve full Flow metadata to check object and trigger
                const flowDetail = this.execSfCommand(
                    `sf data query --query "SELECT Metadata FROM Flow WHERE Id = '${flow.Id}'" --use-tooling-api --json --target-org ${this.orgAlias}`
                );

                if (flowDetail && flowDetail.result && flowDetail.result.records && flowDetail.result.records[0]) {
                    const metadata = flowDetail.result.records[0].Metadata;

                    // Check if Flow is on Contact object with Create trigger
                    if (metadata.start && metadata.start.object === 'Contact') {
                        const isCreate = metadata.start.recordTriggerType === 'Create' ||
                                       metadata.start.recordTriggerType === 'CreateAndUpdate';
                        const isBeforeSave = metadata.start.triggerType === 'RecordBeforeSave';

                        if (isCreate) {
                            this.contactFlows.push({
                                name: flow.MasterLabel,
                                id: flow.Id,
                                triggerType: metadata.start.triggerType,
                                recordTriggerType: metadata.start.recordTriggerType,
                                description: flow.Description,
                                entryCriteria: this.extractFlowEntryCriteria(metadata.start)
                            });

                            // Check for hard-coded RecordTypeId assignments
                            const hasHardCodedRecordType = this.checkForHardCodedValues(metadata, 'RecordTypeId');
                            const hasHardCodedFields = this.checkForHardCodedValues(metadata);

                            if (hasHardCodedRecordType) {
                                this.issues.push({
                                    severity: 'CRITICAL',
                                    field: 'RecordTypeId',
                                    type: 'FLOW_CONFLICT',
                                    message: `Flow "${flow.MasterLabel}" hard-codes RecordTypeId, which will OVERRIDE Profile defaults`,
                                    flowName: flow.MasterLabel,
                                    solution: this.generateSolutionForFlowConflict(flow.MasterLabel, 'RecordTypeId')
                                });
                            }

                            if (hasHardCodedFields.length > 0 && !hasHardCodedRecordType) {
                                this.warnings.push(`Flow "${flow.MasterLabel}" sets fields: ${hasHardCodedFields.join(', ')}`);
                            }

                            // Check if Flow checks LeadID__c (conversion detection)
                            const checksLeadId = this.extractFlowEntryCriteria(metadata.start).includes('LeadID__c');
                            if (checksLeadId && isBeforeSave) {
                                console.log(`   ℹ️  Flow "${flow.MasterLabel}" runs on Lead conversion (checks LeadID__c)`);
                            }
                        }
                    }
                }
            }

            console.log(`   Found ${this.contactFlows.length} active Flow(s) on Contact creation`);

        } catch (error) {
            this.warnings.push(`Flow analysis failed: ${error.message}`);
        }
    }

    /**
     * Extract Flow entry criteria as readable string
     */
    extractFlowEntryCriteria(startElement) {
        if (!startElement.filters) {
            return 'No entry criteria';
        }

        const filters = Array.isArray(startElement.filters) ? startElement.filters : [startElement.filters];
        const criteria = filters.map(f => `${f.field} ${f.operator} ${f.value ? f.value.stringValue || f.value.booleanValue : '?'}`);

        const logic = startElement.filterLogic || 'and';
        return `${logic.toUpperCase()}: ${criteria.join(', ')}`;
    }

    /**
     * Check for hard-coded values in Flow
     */
    checkForHardCodedValues(metadata, specificField = null) {
        const hardCodedFields = [];

        if (!metadata.recordUpdates) {
            return specificField ? false : hardCodedFields;
        }

        const updates = Array.isArray(metadata.recordUpdates) ? metadata.recordUpdates : [metadata.recordUpdates];

        for (const update of updates) {
            if (!update.inputAssignments) continue;

            const assignments = Array.isArray(update.inputAssignments) ? update.inputAssignments : [update.inputAssignments];

            for (const assignment of assignments) {
                if (assignment.field && assignment.value && assignment.value.stringValue) {
                    if (specificField) {
                        if (assignment.field === specificField) {
                            return true; // Found hard-coded value for specific field
                        }
                    } else {
                        // Check if value looks hard-coded (not a formula, not a variable reference)
                        if (!assignment.value.elementReference && assignment.value.stringValue) {
                            hardCodedFields.push(assignment.field);
                        }
                    }
                }
            }
        }

        return specificField ? false : hardCodedFields;
    }

    /**
     * Generate solution for Flow conflicts
     */
    generateSolutionForFlowConflict(flowName, field) {
        return [
            {
                option: 1,
                title: 'Deactivate Conflicting Flow',
                steps: [
                    `Navigate to: Setup → Flows → "${flowName}"`,
                    'Click "Deactivate"',
                    'This allows Profile defaults to work correctly'
                ],
                pros: ['Immediate fix', 'Allows Profile default changes'],
                cons: ['Loses Flow functionality', 'May need replacement Flow'],
                estimatedTime: '2 minutes'
            },
            {
                option: 2,
                title: 'Replace Hard-Coded Value with Conditional Logic',
                steps: [
                    'Retrieve Flow metadata',
                    `Replace hard-coded ${field} with conditional assignment based on RecordType.DeveloperName`,
                    'Deploy corrected Flow',
                    'Test with different scenarios'
                ],
                pros: ['Maintains automation', 'Respects Profile defaults', 'More flexible'],
                cons: ['Requires Flow development', 'Testing needed'],
                estimatedTime: '30-60 minutes'
            },
            {
                option: 3,
                title: 'Create New Flow Without Hard-Coded Values',
                steps: [
                    'Design new Flow that dynamically sets fields based on RecordType',
                    'Does NOT override RecordTypeId - let Profile default apply',
                    'Deploy and test new Flow',
                    'Deactivate old Flow',
                    'See: instances/wedgewood-uat/lead-conversion-dependencies-2025-10-04/ for example'
                ],
                pros: ['Clean implementation', 'Best practice', 'Future-proof'],
                cons: ['More work upfront', 'Comprehensive testing required'],
                estimatedTime: '1-2 hours'
            }
        ];
    }

    /**
     * Calculate conversion readiness score (NEW)
     * Score from 0-100 indicating likelihood of successful conversion
     */
    calculateReadinessScore() {
        let score = 100;
        let deductions = [];

        // Deduct for CRITICAL issues
        const criticalCount = this.issues.filter(i => i.severity === 'CRITICAL').length;
        const criticalDeduction = criticalCount * 30; // Each critical issue = -30 points
        score -= criticalDeduction;
        if (criticalCount > 0) {
            deductions.push(`-${criticalDeduction} (${criticalCount} critical issue${criticalCount > 1 ? 's' : ''})`);
        }

        // Deduct for HIGH issues
        const highCount = this.issues.filter(i => i.severity === 'HIGH').length;
        const highDeduction = highCount * 10; // Each high issue = -10 points
        score -= highDeduction;
        if (highCount > 0) {
            deductions.push(`-${highDeduction} (${highCount} high issue${highCount > 1 ? 's' : ''})`);
        }

        // Deduct for missing field mappings
        const requiredFieldsWithoutMapping = this.requiredFields.filter(f => {
            const hasMapping = this.fieldMappings.some(m => m.contactField === f.name);
            const hasDefault = f.defaultValue !== null && f.defaultValue !== undefined;
            const isSystem = ['OwnerId', 'LastName'].includes(f.name);
            return !hasMapping && !hasDefault && !isSystem;
        }).length;

        if (requiredFieldsWithoutMapping > 0 && criticalCount === 0) {
            // Only deduct if not already counted as critical
            const mappingDeduction = Math.min(requiredFieldsWithoutMapping * 5, 20);
            score -= mappingDeduction;
            deductions.push(`-${mappingDeduction} (${requiredFieldsWithoutMapping} field${requiredFieldsWithoutMapping > 1 ? 's' : ''} without mapping)`);
        }

        // Ensure score doesn't go below 0
        score = Math.max(0, score);

        this.readinessScore = {
            score: score,
            grade: this.getReadinessGrade(score),
            deductions: deductions,
            canConvert: score >= 70
        };
    }

    /**
     * Get letter grade for readiness score
     */
    getReadinessGrade(score) {
        if (score >= 90) return 'A - Ready to Convert';
        if (score >= 80) return 'B - Minor Issues';
        if (score >= 70) return 'C - Will Likely Succeed';
        if (score >= 50) return 'D - May Fail';
        return 'F - Will Fail';
    }

    /**
     * Generate diagnostic report
     */
    generateReport() {
        console.log('\n' + '='.repeat(80));
        console.log('📊 DIAGNOSTIC REPORT v2.0');
        console.log('='.repeat(80) + '\n');

        // Readiness Score (NEW)
        console.log('🎯 CONVERSION READINESS SCORE');
        console.log('============================\n');
        console.log(`Score: ${this.readinessScore.score}/100`);
        console.log(`Grade: ${this.readinessScore.grade}`);
        console.log(`Can Convert: ${this.readinessScore.canConvert ? '✅ YES' : '❌ NO'}`);

        if (this.readinessScore.deductions.length > 0) {
            console.log('\nDeductions:');
            this.readinessScore.deductions.forEach(d => console.log(`  ${d}`));
        }
        console.log();

        // Summary
        console.log('SUMMARY');
        console.log('-------');
        const criticalIssues = this.issues.filter(i => i.severity === 'CRITICAL');
        const highIssues = this.issues.filter(i => i.severity === 'HIGH');

        if (criticalIssues.length === 0 && highIssues.length === 0) {
            console.log('✅ No blockers found. Lead should convert successfully.\n');
        } else {
            console.log(`❌ Found ${criticalIssues.length} CRITICAL and ${highIssues.length} HIGH severity issues\n`);
        }

        // Lead Information
        console.log('LEAD INFORMATION');
        console.log('----------------');
        console.log(`Name: ${this.leadData.FirstName} ${this.leadData.LastName}`);
        console.log(`Company: ${this.leadData.Company}`);
        console.log(`Email: ${this.leadData.Email}`);
        console.log(`Status: ${this.leadData.Status}`);
        console.log(`Converted: ${this.leadData.IsConverted ? 'Yes' : 'No'}`);
        console.log();

        // Critical Issues (Root Causes)
        if (criticalIssues.length > 0) {
            console.log('🚨 CRITICAL ISSUES (ROOT CAUSES)');
            console.log('================================\n');

            criticalIssues.forEach((issue, index) => {
                console.log(`${index + 1}. ${issue.message}`);
                console.log(`   Field: ${issue.field}`);
                console.log(`   Type: ${issue.contactFieldType}`);

                if (issue.picklistValues && issue.picklistValues.length > 0) {
                    console.log(`   Valid Values: ${issue.picklistValues.map(v => v.value).join(', ')}`);
                }

                console.log('\n   RECOMMENDED SOLUTIONS:\n');
                issue.solution.forEach(sol => {
                    console.log(`   Option ${sol.option}: ${sol.title} (${sol.estimatedTime})`);
                    console.log(`   Steps:`);
                    sol.steps.forEach(step => console.log(`     ${step}`));
                    console.log(`   Pros: ${sol.pros.join(', ')}`);
                    console.log(`   Cons: ${sol.cons.join(', ')}`);
                    console.log();
                });
            });
        }

        // High Priority Issues
        if (highIssues.length > 0) {
            console.log('⚠️  HIGH PRIORITY ISSUES');
            console.log('========================\n');

            highIssues.forEach((issue, index) => {
                console.log(`${index + 1}. ${issue.message}`);
                if (issue.ruleFormula) {
                    console.log(`   Formula: ${issue.ruleFormula}`);
                }
                console.log();
            });
        }

        // Warnings
        if (this.warnings.length > 0) {
            console.log('ℹ️  WARNINGS');
            console.log('===========\n');
            this.warnings.forEach(w => console.log(`  - ${w}`));
            console.log();
        }

        // Field Mappings
        console.log('FIELD MAPPINGS (Lead → Contact)');
        console.log('================================\n');
        if (this.fieldMappings.length > 0) {
            this.fieldMappings.forEach(m => {
                const leadValue = this.leadData[m.leadField];
                console.log(`  ${m.leadField} → ${m.contactField}: ${leadValue || '(null)'}`);
            });
        } else {
            console.log('  No custom field mappings configured');
        }
        console.log();

        // Next Steps
        console.log('RECOMMENDED NEXT STEPS');
        console.log('======================\n');

        if (criticalIssues.length > 0) {
            console.log('1. Review CRITICAL ISSUES above and choose a solution');
            console.log('2. Implement the chosen solution');
            console.log('3. Re-run this diagnostic to verify fix');
            console.log('4. Attempt Lead conversion');
        } else {
            console.log('1. Review HIGH PRIORITY ISSUES if any');
            console.log('2. Proceed with Lead conversion');
            console.log('3. Monitor for any validation errors');
        }
        console.log();

        // Save report
        this.saveReport();
    }

    /**
     * Save report to file
     */
    saveReport() {
        const reportDir = path.join(
            this.cache.instanceDir,
            `lead-conversion-diagnostic-${Date.now()}`
        );

        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }

        const reportPath = path.join(reportDir, 'diagnostic-report.json');
        const report = {
            version: '2.0',
            timestamp: new Date().toISOString(),
            orgAlias: this.orgAlias,
            leadId: this.leadId,
            leadData: this.leadData,
            readinessScore: this.readinessScore, // NEW
            issues: this.issues,
            warnings: this.warnings,
            fieldMappings: this.fieldMappings,
            requiredFields: this.requiredFields,
            validationRules: this.validationRules,
            contactFlows: this.contactFlows || [] // NEW
        };

        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n📁 Full report saved to: ${reportPath}\n`);
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(`
Lead Conversion Diagnostic Tool
================================

Usage:
  node lead-conversion-diagnostics.js <org-alias> <lead-id>

Example:
  node lead-conversion-diagnostics.js wedgewood-production 00QUw00000SHtL2MAL

This tool will:
  ✓ Analyze Lead record data
  ✓ Check Contact required fields
  ✓ Validate field mappings
  ✓ Test validation rules
  ✓ Identify conversion blockers
  ✓ Provide specific solutions
        `);
        process.exit(1);
    }

    const [orgAlias, leadId] = args;

    try {
        const diagnostics = new LeadConversionDiagnostics(orgAlias, leadId);
        await diagnostics.diagnose();
    } catch (error) {
        console.error(`\n❌ Error: ${error.message}\n`);
        console.error(error.stack);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = LeadConversionDiagnostics;