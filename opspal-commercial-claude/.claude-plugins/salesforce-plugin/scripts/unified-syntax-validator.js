#!/usr/bin/env node

/**
 * Unified Syntax Validator for Salesforce Deployments
 * 
 * Comprehensive validation tool that prevents syntax errors before deployment
 * Addresses root causes identified in Wedgewood Production deployment analysis:
 * - 60% API Limitations
 * - 30% Invalid Syntax Patterns  
 * - 10% Missing Pre-Deployment Validation
 * 
 * Usage: node unified-syntax-validator.js --org <alias> --type <report|field|flow|all> --path <file>
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const LWCApexFieldValidator = require('./lib/lwc-apex-field-validator');

class UnifiedSyntaxValidator {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.errors = [];
        this.warnings = [];
        this.validations = {
            reports: true,
            fields: true,
            flows: true,
            formulas: true,
            dateFilters: true,
            apiLimitations: true,
            lwc: true
        };
        
        // Known API limitations from Wedgewood analysis
        this.apiLimitations = {
            blockedReportTypes: [
                'Activities', 'Tasks', 'Events', 'TasksAndEvents',
                'ActivitiesWithAccounts', 'Task', 'Event'
            ],
            workingReportTypes: {
                'Leads': 'LeadList',
                'Contacts': 'ContactList',
                'Cases': 'CaseList',
                'Accounts': 'AccountList',
                'Opportunities': 'Opportunity'
            },
            validDateFormats: [
                'TODAY', 'YESTERDAY', 'TOMORROW',
                'LAST_WEEK', 'THIS_WEEK', 'NEXT_WEEK',
                'LAST_MONTH', 'THIS_MONTH', 'NEXT_MONTH',
                'LAST_N_DAYS:X', 'NEXT_N_DAYS:X',
                'THIS_QUARTER', 'LAST_QUARTER', 'NEXT_QUARTER',
                'THIS_YEAR', 'LAST_YEAR', 'NEXT_YEAR'
            ],
            fieldNamePatterns: {
                'Opportunity': {
                    owner: 'FULL_NAME',
                    account: 'ACCOUNT.NAME',
                    amount: 'AMOUNT'
                },
                'ContactList': {
                    account: 'ACCOUNT.NAME',
                    owner: 'OWNER.FULL_NAME',
                    name: 'NAME'
                },
                'LeadList': {
                    owner: 'OWNER.FULL_NAME',
                    company: 'COMPANY',
                    status: 'STATUS'
                }
            }
        };
    }

    /**
     * Main validation entry point
     */
    async validate(type = 'all', targetPath = null) {
        console.log('🔍 Starting Unified Syntax Validation...\n');
        console.log(`Org: ${this.orgAlias}`);
        console.log(`Type: ${type}`);
        console.log(`Path: ${targetPath || 'Current directory'}\n`);
        
        try {
            // Validate connection first
            await this.validateOrgConnection();
            
            switch(type) {
                case 'report':
                    await this.validateReports(targetPath);
                    break;
                case 'field':
                    await this.validateFields(targetPath);
                    break;
                case 'flow':
                    await this.validateFlows(targetPath);
                    break;
                case 'lwc':
                    await this.validateLWC(targetPath);
                    break;
                case 'all':
                    await this.validateReports(targetPath);
                    await this.validateFields(targetPath);
                    await this.validateFlows(targetPath);
                    await this.validateLWC(targetPath);
                    break;
            }
            
            // Check for API limitations
            if (this.validations.apiLimitations) {
                await this.checkAPILimitations();
            }
            
        } catch (error) {
            this.errors.push({
                type: 'VALIDATION_ERROR',
                message: error.message,
                severity: 'CRITICAL'
            });
        }
        
        // Report results
        this.reportResults();
        
        return this.errors.length === 0;
    }

    /**
     * Validate org connection
     */
    async validateOrgConnection() {
        console.log('📡 Validating org connection...');
        
        try {
            const result = execSync(
                `sf org display -o ${this.orgAlias} --json`,
                { encoding: 'utf-8' }
            );
            
            const orgInfo = JSON.parse(result);
            if (!orgInfo.result) {
                throw new Error('Invalid org connection');
            }
            
            console.log(`✅ Connected to: ${orgInfo.result.username}\n`);
            
        } catch (error) {
            throw new Error(`Failed to connect to org: ${error.message}`);
        }
    }

    /**
     * Validate report syntax and API limitations
     */
    async validateReports(reportPath) {
        console.log('📊 Validating Reports...\n');
        
        if (!reportPath) {
            console.log('  ⚠️ No report path specified, skipping report validation\n');
            return;
        }
        
        try {
            let reportFiles = [];
            
            if (fs.statSync(reportPath).isDirectory()) {
                reportFiles = this.findFiles(reportPath, '.report-meta.xml');
            } else {
                reportFiles = [reportPath];
            }
            
            for (const file of reportFiles) {
                await this.validateReportFile(file);
            }
            
        } catch (error) {
            this.errors.push({
                type: 'REPORT_VALIDATION',
                message: error.message,
                severity: 'ERROR'
            });
        }
    }

    /**
     * Validate individual report file
     */
    async validateReportFile(filePath) {
        console.log(`  Checking: ${path.basename(filePath)}`);
        
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Check report type
        const reportTypeMatch = content.match(/<reportType>([^<]+)<\/reportType>/);
        if (reportTypeMatch) {
            const reportType = reportTypeMatch[1];
            
            // Check if blocked by API
            if (this.apiLimitations.blockedReportTypes.includes(reportType)) {
                this.errors.push({
                    type: 'API_LIMITATION',
                    file: filePath,
                    message: `Report type '${reportType}' is blocked by Salesforce API. Use workaround or manual deployment.`,
                    severity: 'ERROR',
                    suggestion: this.apiLimitations.workingReportTypes[reportType] 
                        ? `Use '${this.apiLimitations.workingReportTypes[reportType]}' instead`
                        : 'Create via UI or use SOQL alternative'
                });
            }
            
            // Validate field references for this report type
            const columns = content.match(/<columns>([^<]+)<\/columns>/g);
            if (columns) {
                columns.forEach(col => {
                    const field = col.replace(/<\/?columns>/g, '');
                    this.validateFieldReference(field, reportType, filePath);
                });
            }
        }
        
        // Check date filters
        const dateFilters = content.match(/<dateColumn>([^<]+)<\/dateColumn>[\s\S]*?<interval>([^<]+)<\/interval>/g);
        if (dateFilters) {
            dateFilters.forEach(filter => {
                const interval = filter.match(/<interval>([^<]+)<\/interval>/)[1];
                this.validateDateFilter(interval, filePath);
            });
        }
        
        console.log(`    ✅ Validated\n`);
    }

    /**
     * Validate field reference syntax
     */
    validateFieldReference(field, reportType, filePath) {
        // Common invalid patterns from Wedgewood analysis
        const invalidPatterns = [
            { pattern: /^OWNER$/, message: 'Use FULL_NAME or OWNER.FULL_NAME instead of OWNER' },
            { pattern: /^ACCOUNT_NAME$/, message: 'Use ACCOUNT.NAME instead of ACCOUNT_NAME' },
            { pattern: /^LEAD_NAME$/, message: 'Lead name field does not exist, use NAME or FULL_NAME' },
            { pattern: /^PHONE$/, message: 'PHONE may not be available, check report type compatibility' }
        ];
        
        invalidPatterns.forEach(({ pattern, message }) => {
            if (pattern.test(field)) {
                this.warnings.push({
                    type: 'FIELD_REFERENCE',
                    file: filePath,
                    field: field,
                    message: message,
                    severity: 'WARNING'
                });
            }
        });
    }

    /**
     * Validate date filter syntax
     */
    validateDateFilter(interval, filePath) {
        // Invalid formats from Wedgewood analysis
        const invalidFormats = {
            'LAST_90_DAYS': 'LAST_N_DAYS:90',
            'INTERVAL_LAST90DAYS': 'LAST_N_DAYS:90',
            'LAST_30_DAYS': 'LAST_N_DAYS:30',
            'NEXT_30_DAYS': 'NEXT_N_DAYS:30'
        };
        
        if (invalidFormats[interval]) {
            this.errors.push({
                type: 'DATE_FILTER',
                file: filePath,
                message: `Invalid date filter '${interval}'. Use '${invalidFormats[interval]}' instead.`,
                severity: 'ERROR'
            });
        }
    }

    /**
     * Validate field metadata
     */
    async validateFields(fieldPath) {
        console.log('🔧 Validating Fields...\n');
        
        if (!fieldPath) {
            console.log('  ⚠️ No field path specified, skipping field validation\n');
            return;
        }
        
        try {
            let fieldFiles = [];
            
            if (fs.statSync(fieldPath).isDirectory()) {
                fieldFiles = this.findFiles(fieldPath, '.field-meta.xml');
            } else {
                fieldFiles = [fieldPath];
            }
            
            for (const file of fieldFiles) {
                await this.validateFieldFile(file);
            }
            
        } catch (error) {
            this.errors.push({
                type: 'FIELD_VALIDATION',
                message: error.message,
                severity: 'ERROR'
            });
        }
    }

    /**
     * Validate individual field file
     */
    async validateFieldFile(filePath) {
        console.log(`  Checking: ${path.basename(filePath)}`);
        
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Check for picklist formula issues
        if (content.includes('<type>Picklist</type>')) {
            // Check for invalid picklist formulas
            const formulas = content.match(/<formula>([^<]+)<\/formula>/g);
            if (formulas) {
                formulas.forEach(formula => {
                    if (formula.includes('ISBLANK(') || formula.includes('ISNULL(')) {
                        this.errors.push({
                            type: 'PICKLIST_FORMULA',
                            file: filePath,
                            message: 'Never use ISBLANK() or ISNULL() on picklist fields. Use TEXT(field) = "" instead.',
                            severity: 'ERROR'
                        });
                    }
                });
            }
        }
        
        // Check field history tracking
        if (content.includes('<trackHistory>true</trackHistory>')) {
            await this.checkFieldHistoryLimit(filePath);
        }
        
        console.log(`    ✅ Validated\n`);
    }

    /**
     * Check field history tracking limits
     */
    async checkFieldHistoryLimit(filePath) {
        // Extract object name from file path
        const objectMatch = filePath.match(/objects\/([^\/]+)\//);
        if (objectMatch) {
            const objectName = objectMatch[1];
            
            try {
                const query = `SELECT COUNT(Id) fieldCount FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objectName}' AND IsFieldHistoryTracked = true`;
                
                const result = execSync(
                    `sf data query --query "${query}" --use-tooling-api -o ${this.orgAlias} --json`,
                    { encoding: 'utf-8' }
                );
                
                const data = JSON.parse(result);
                if (data.result && data.result.records[0]) {
                    const count = data.result.records[0].fieldCount;
                    if (count >= 20) {
                        this.errors.push({
                            type: 'FIELD_HISTORY_LIMIT',
                            file: filePath,
                            message: `Object ${objectName} already has ${count}/20 tracked fields - LIMIT REACHED`,
                            severity: 'CRITICAL'
                        });
                    } else if (count >= 18) {
                        this.warnings.push({
                            type: 'FIELD_HISTORY_LIMIT',
                            file: filePath,
                            message: `Object ${objectName} has ${count}/20 tracked fields - approaching limit`,
                            severity: 'WARNING'
                        });
                    }
                }
            } catch (error) {
                // Silently continue if query fails
            }
        }
    }

    /**
     * Validate flows
     */
    async validateFlows(flowPath) {
        console.log('⚡ Validating Flows...\n');
        
        if (!flowPath) {
            console.log('  ⚠️ No flow path specified, skipping flow validation\n');
            return;
        }
        
        try {
            let flowFiles = [];
            
            if (fs.statSync(flowPath).isDirectory()) {
                flowFiles = this.findFiles(flowPath, '.flow-meta.xml');
            } else {
                flowFiles = [flowPath];
            }
            
            for (const file of flowFiles) {
                await this.validateFlowFile(file);
            }
            
        } catch (error) {
            this.errors.push({
                type: 'FLOW_VALIDATION',
                message: error.message,
                severity: 'ERROR'
            });
        }
    }

    /**
     * Validate individual flow file
     */
    async validateFlowFile(filePath) {
        console.log(`  Checking: ${path.basename(filePath)}`);
        
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Check for duplicate flow prevention
        const apiNameMatch = content.match(/<apiName>([^<]+)<\/apiName>/);
        if (apiNameMatch) {
            const apiName = apiNameMatch[1];
            
            // Check if flow already exists
            try {
                const query = `SELECT Id, MasterLabel, VersionNumber FROM Flow WHERE Definition.DeveloperName = '${apiName}'`;
                
                const result = execSync(
                    `sf data query --query "${query}" --use-tooling-api -o ${this.orgAlias} --json`,
                    { encoding: 'utf-8' }
                );
                
                const data = JSON.parse(result);
                if (data.result && data.result.records.length > 0) {
                    this.warnings.push({
                        type: 'FLOW_DUPLICATE',
                        file: filePath,
                        message: `Flow '${apiName}' already exists with ${data.result.records.length} version(s). Deployment will create new version, not new flow.`,
                        severity: 'INFO'
                    });
                }
            } catch (error) {
                // Silently continue if query fails
            }
        }
        
        console.log(`    ✅ Validated\n`);
    }

    /**
     * Check for known API limitations
     */
    async checkAPILimitations() {
        console.log('🚫 Checking API Limitations...\n');
        
        if (this.errors.some(e => e.type === 'API_LIMITATION')) {
            console.log('  ⚠️ API limitations detected. Suggesting workarounds...\n');
            
            this.warnings.push({
                type: 'API_WORKAROUND',
                message: 'Consider using SOQL queries or UI automation for blocked report types',
                severity: 'INFO',
                documentation: 'See docs/SALESFORCE_API_LIMITATIONS.md for complete workarounds'
            });
        }
    }

    /**
     * Validate Lightning Web Components
     */
    async validateLWC(lwcPath) {
        console.log('⚡ Validating Lightning Web Components...\n');

        if (!lwcPath) {
            console.log('  ⚠️ No LWC path specified, skipping LWC validation\n');
            return;
        }

        try {
            let lwcDirs = [];

            if (fs.statSync(lwcPath).isDirectory()) {
                const items = fs.readdirSync(lwcPath);
                lwcDirs = items
                    .map(item => path.join(lwcPath, item))
                    .filter(p => {
                        try {
                            return fs.statSync(p).isDirectory();
                        } catch {
                            return false;
                        }
                    });
            } else {
                lwcDirs = [lwcPath];
            }

            for (const lwcDir of lwcDirs) {
                const componentName = path.basename(lwcDir);
                console.log(`  🔍 Validating ${componentName}...`);

                const validator = new LWCApexFieldValidator(lwcDir);
                const result = await validator.validate();

                // Merge results into main validator
                this.errors.push(...result.errors.map(err => ({
                    type: 'LWC_FIELD_MISMATCH',
                    file: lwcDir,
                    component: componentName,
                    ...err
                })));

                this.warnings.push(...result.warnings.map(warn => ({
                    type: 'LWC_NULL_SAFETY',
                    file: lwcDir,
                    component: componentName,
                    ...warn
                })));

                if (result.success && result.warnings.length === 0) {
                    console.log(`  ✅ ${componentName} validation passed\n`);
                } else if (result.success) {
                    console.log(`  ⚠️ ${componentName} has warnings\n`);
                } else {
                    console.log(`  ❌ ${componentName} has errors\n`);
                }
            }

        } catch (error) {
            this.errors.push({
                type: 'LWC_VALIDATION',
                message: `LWC validation failed: ${error.message}`,
                severity: 'ERROR',
                file: lwcPath
            });
        }
    }

    /**
     * Find files with specific extension
     */
    findFiles(dir, ext) {
        const files = [];
        const items = fs.readdirSync(dir);
        
        items.forEach(item => {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                files.push(...this.findFiles(fullPath, ext));
            } else if (item.endsWith(ext)) {
                files.push(fullPath);
            }
        });
        
        return files;
    }

    /**
     * Report validation results
     */
    reportResults() {
        console.log('\n' + '═'.repeat(60));
        console.log('📋 VALIDATION RESULTS');
        console.log('═'.repeat(60) + '\n');
        
        if (this.errors.length === 0 && this.warnings.length === 0) {
            console.log('✅ All validations passed!\n');
            return;
        }
        
        if (this.errors.length > 0) {
            console.log(`❌ ERRORS (${this.errors.length}):\n`);
            this.errors.forEach((error, index) => {
                console.log(`  ${index + 1}. [${error.type}] ${error.message}`);
                if (error.file) {
                    console.log(`     File: ${error.file}`);
                }
                if (error.suggestion) {
                    console.log(`     💡 Suggestion: ${error.suggestion}`);
                }
                console.log();
            });
        }
        
        if (this.warnings.length > 0) {
            console.log(`⚠️ WARNINGS (${this.warnings.length}):\n`);
            this.warnings.forEach((warning, index) => {
                console.log(`  ${index + 1}. [${warning.type}] ${warning.message}`);
                if (warning.file) {
                    console.log(`     File: ${warning.file}`);
                }
                console.log();
            });
        }
        
        console.log('═'.repeat(60));
        console.log(`\n${this.errors.length > 0 ? '❌ Validation FAILED' : '✅ Validation PASSED with warnings'}`);
        console.log(`Errors: ${this.errors.length}, Warnings: ${this.warnings.length}\n`);
        
        if (this.errors.length > 0) {
            console.log('⚠️ Fix all errors before deployment to prevent failures.\n');
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const orgIndex = args.indexOf('--org');
    const typeIndex = args.indexOf('--type');
    const pathIndex = args.indexOf('--path');
    
    const org = orgIndex > -1 ? args[orgIndex + 1] : process.env.SF_TARGET_ORG || 'production';
    const type = typeIndex > -1 ? args[typeIndex + 1] : 'all';
    const targetPath = pathIndex > -1 ? args[pathIndex + 1] : null;
    
    const validator = new UnifiedSyntaxValidator(org);
    
    validator.validate(type, targetPath).then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = UnifiedSyntaxValidator;