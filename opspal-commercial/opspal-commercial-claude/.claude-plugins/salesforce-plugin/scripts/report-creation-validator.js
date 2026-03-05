#!/usr/bin/env node

/**
 * Report Creation Validator
 * 
 * This script validates report specifications before creation to prevent
 * the common issues identified in the remediation plan.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Report type configuration and limits
const REPORT_CONFIGS = {
    'tabular': { 
        maxColumns: 10, 
        recommendedColumns: 6,
        supportsCharts: false,
        description: 'Simple list format, best for detailed data review'
    },
    'summary': { 
        maxColumns: 12, 
        recommendedColumns: 8,
        supportsCharts: true,
        description: 'Grouped data with subtotals, ideal for analysis'
    },
    'matrix': { 
        maxColumns: 8, 
        recommendedColumns: 5,
        supportsCharts: true,
        description: 'Cross-tabulation format, best for comparing categories'
    }
};

// Valid date filter enumeration for Salesforce
const DATE_FILTERS = {
    'TODAY': 'Today',
    'YESTERDAY': 'Yesterday',
    'TOMORROW': 'Tomorrow',
    'LAST_WEEK': 'Last Week',
    'THIS_WEEK': 'This Week',
    'NEXT_WEEK': 'Next Week',
    'LAST_MONTH': 'Last Month', 
    'THIS_MONTH': 'This Month',
    'NEXT_MONTH': 'Next Month',
    'LAST_90_DAYS': 'Last 90 Days',
    'NEXT_90_DAYS': 'Next 90 Days',
    'LAST_N_DAYS': 'Last N Days (use LAST_N_DAYS:30 format)',
    'NEXT_N_DAYS': 'Next N Days (use NEXT_N_DAYS:30 format)', 
    'THIS_QUARTER': 'This Quarter',
    'LAST_QUARTER': 'Last Quarter',
    'NEXT_QUARTER': 'Next Quarter',
    'THIS_YEAR': 'This Year',
    'LAST_YEAR': 'Last Year', 
    'NEXT_YEAR': 'Next Year',
    'THIS_FISCAL_QUARTER': 'This Fiscal Quarter',
    'LAST_FISCAL_QUARTER': 'Last Fiscal Quarter',
    'NEXT_FISCAL_QUARTER': 'Next Fiscal Quarter',
    'THIS_FISCAL_YEAR': 'This Fiscal Year',
    'LAST_FISCAL_YEAR': 'Last Fiscal Year',
    'NEXT_FISCAL_YEAR': 'Next Fiscal Year'
};

class ReportCreationValidator {
    constructor() {
        this.validationResults = {
            passed: [],
            failed: [],
            warnings: []
        };
        this.fieldCache = new Map();
    }

    async validateSalesforceConnection() {
        try {
            const { stdout } = await execAsync('sf org display --json');
            const orgInfo = JSON.parse(stdout);
            
            if (orgInfo.status !== 0) {
                throw new Error('No authenticated Salesforce org found. Run: sf org login web');
            }
            
            return orgInfo.result;
        } catch (error) {
            throw new Error(`Salesforce connection failed: ${error.message}`);
        }
    }

    async getObjectFields(objectName) {
        if (this.fieldCache.has(objectName)) {
            return this.fieldCache.get(objectName);
        }

        try {
            const query = `SELECT QualifiedApiName, Label, DataType, IsAccessible FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objectName}'`;
            const { stdout } = await execAsync(`sf data query --query "${query}" --json`);
            const result = JSON.parse(stdout);

            if (result.status !== 0) {
                throw new Error(result.message || `Failed to query fields for ${objectName}`);
            }

            const fields = result.result.records || [];
            this.fieldCache.set(objectName, fields);
            return fields;

        } catch (error) {
            throw new Error(`Failed to retrieve fields for ${objectName}: ${error.message}`);
        }
    }

    validateReportType(reportType) {
        if (!REPORT_CONFIGS[reportType]) {
            return {
                valid: false,
                error: `Invalid report type: ${reportType}. Valid types: ${Object.keys(REPORT_CONFIGS).join(', ')}`,
                suggestion: 'Use "tabular" for simple lists, "summary" for grouped data, or "matrix" for cross-tabulation'
            };
        }

        return {
            valid: true,
            type: reportType,
            config: REPORT_CONFIGS[reportType]
        };
    }

    async validateFields(reportSpec) {
        const results = [];
        const uniqueObjects = [...new Set(reportSpec.fields.map(f => f.objectName))];

        for (const objectName of uniqueObjects) {
            try {
                const objectFields = await this.getObjectFields(objectName);
                const objectFieldNames = objectFields.map(f => f.QualifiedApiName);

                const reportFieldsForObject = reportSpec.fields.filter(f => f.objectName === objectName);

                for (const field of reportFieldsForObject) {
                    const fieldExists = objectFieldNames.includes(field.fieldName);
                    const fieldInfo = objectFields.find(f => f.QualifiedApiName === field.fieldName);

                    if (!fieldExists) {
                        results.push({
                            valid: false,
                            field: field.fieldName,
                            object: objectName,
                            error: `Field ${field.fieldName} does not exist on ${objectName}`,
                            suggestion: `Available fields: ${objectFieldNames.slice(0, 5).join(', ')}${objectFieldNames.length > 5 ? '...' : ''}`
                        });
                    } else if (fieldInfo && !fieldInfo.IsAccessible) {
                        results.push({
                            valid: false,
                            field: field.fieldName,
                            object: objectName,
                            error: `Field ${field.fieldName} exists but is not accessible (check field-level security)`,
                            suggestion: 'Contact your Salesforce administrator to grant field access'
                        });
                    } else {
                        results.push({
                            valid: true,
                            field: field.fieldName,
                            object: objectName,
                            type: fieldInfo?.DataType,
                            accessible: fieldInfo?.IsAccessible
                        });
                    }
                }

            } catch (error) {
                results.push({
                    valid: false,
                    object: objectName,
                    error: `Failed to validate fields for ${objectName}: ${error.message}`,
                    suggestion: 'Verify the object name and your access permissions'
                });
            }
        }

        return results;
    }

    validateColumns(reportType, columns) {
        const config = REPORT_CONFIGS[reportType];
        if (!config) {
            return { valid: false, error: 'Invalid report type for column validation' };
        }

        const columnCount = columns.length;
        
        if (columnCount > config.maxColumns) {
            return {
                valid: false,
                count: columnCount,
                maxAllowed: config.maxColumns,
                error: `Too many columns (${columnCount}). Maximum allowed for ${reportType}: ${config.maxColumns}`,
                suggestion: `Reduce to ${config.recommendedColumns} columns for optimal readability`
            };
        }

        const result = {
            valid: true,
            count: columnCount,
            maxAllowed: config.maxColumns,
            recommended: config.recommendedColumns
        };

        if (columnCount > config.recommendedColumns) {
            result.warning = `${columnCount} columns may be cluttered. Consider reducing to ${config.recommendedColumns} for better user experience`;
        }

        return result;
    }

    validateDateFilters(filters) {
        const results = [];
        
        if (!filters || !Array.isArray(filters)) {
            return [{ valid: true, message: 'No date filters to validate' }];
        }

        for (const filter of filters) {
            if (filter.type !== 'date') continue;

            let filterValue = filter.value;
            let valid = false;
            let error = null;

            // Handle LAST_N_DAYS:30 format
            if (filterValue.includes(':')) {
                const [baseFilter, dayValue] = filterValue.split(':');
                if (['LAST_N_DAYS', 'NEXT_N_DAYS'].includes(baseFilter)) {
                    const days = parseInt(dayValue);
                    if (!isNaN(days) && days > 0 && days <= 1000) {
                        valid = true;
                    } else {
                        error = `Invalid day value: ${dayValue}. Must be a number between 1 and 1000`;
                    }
                } else {
                    error = `Invalid parameterized filter: ${baseFilter}. Use LAST_N_DAYS or NEXT_N_DAYS`;
                }
            } else {
                // Check standard filters
                valid = Object.keys(DATE_FILTERS).includes(filterValue);
                if (!valid) {
                    error = `Invalid date filter: ${filterValue}`;
                }
            }

            results.push({
                valid,
                filter: filterValue,
                field: filter.field,
                error,
                suggestion: valid ? null : `Valid options: ${Object.keys(DATE_FILTERS).slice(0, 5).join(', ')}...`
            });
        }

        return results;
    }

    validateTitles(reportSpec) {
        const results = [];
        const MAX_TITLE_LENGTH = 40;
        const MAX_CHART_TITLE_LENGTH = 40;

        // Validate report title
        if (reportSpec.title) {
            const titleResult = this.validateTitle(reportSpec.title, MAX_TITLE_LENGTH, 'report');
            results.push(titleResult);
        }

        // Validate chart titles
        if (reportSpec.charts && Array.isArray(reportSpec.charts)) {
            for (const chart of reportSpec.charts) {
                if (chart.title) {
                    const chartTitleResult = this.validateTitle(chart.title, MAX_CHART_TITLE_LENGTH, 'chart');
                    results.push(chartTitleResult);
                }
            }
        }

        return results;
    }

    validateTitle(title, maxLength, type) {
        if (title.length <= maxLength) {
            return {
                valid: true,
                title,
                type,
                length: title.length,
                maxLength
            };
        }

        // Generate smart truncation suggestions
        const suggestions = [
            title.substring(0, maxLength - 3) + '...',
            title.replace(/\s+/g, ' ').trim().substring(0, maxLength - 3) + '...',
            title.replace(/Revenue/g, 'Rev').replace(/Contract/g, 'Cont').replace(/Monthly/g, 'Mo').replace(/Annual/g, 'Ann'),
            title.split(' ').slice(0, Math.max(2, Math.floor(maxLength / 10))).join(' ')
        ].filter(s => s.length <= maxLength && s.length > 0);

        // Remove duplicates
        const uniqueSuggestions = [...new Set(suggestions)];

        return {
            valid: false,
            title,
            type,
            length: title.length,
            maxLength,
            error: `${type} title too long (${title.length} chars). Maximum: ${maxLength}`,
            suggestions: uniqueSuggestions
        };
    }

    async validatePermissions(reportSpec) {
        try {
            // Check basic report permissions
            const permissionQuery = `SELECT PermissionsCreateCustomizeReports, PermissionsRunReports, PermissionsExportReport FROM Profile WHERE Id IN (SELECT ProfileId FROM User WHERE Username = '${process.env.SF_TARGET_ORG || 'current'}')`;
            
            const { stdout } = await execAsync(`sf data query --query "${permissionQuery}" --json`);
            const result = JSON.parse(stdout);

            if (result.status !== 0 || result.result.totalSize === 0) {
                return {
                    valid: false,
                    error: 'Unable to validate user permissions',
                    suggestion: 'Verify your org authentication and permissions'
                };
            }

            const permissions = result.result.records[0];
            const issues = [];

            if (!permissions.PermissionsCreateCustomizeReports) {
                issues.push('Missing "Create and Customize Reports" permission');
            }
            if (!permissions.PermissionsRunReports) {
                issues.push('Missing "Run Reports" permission');
            }
            if (!permissions.PermissionsExportReport) {
                issues.push('Missing "Export Report" permission (optional but recommended)');
            }

            return {
                valid: issues.length === 0,
                permissions,
                issues,
                suggestion: issues.length > 0 ? 'Contact your Salesforce administrator to update your profile permissions' : null
            };

        } catch (error) {
            return {
                valid: false,
                error: `Permission validation failed: ${error.message}`,
                suggestion: 'Verify your org connection and try again'
            };
        }
    }

    async validateReportSpecification(reportSpec) {
        console.log('🔍 Validating report specification...\n');

        const validations = {
            connection: null,
            reportType: null,
            fields: null,
            columns: null,
            dateFilters: null,
            titles: null,
            permissions: null
        };

        // 1. Validate Salesforce connection
        try {
            console.log('   Checking Salesforce connection...');
            validations.connection = await this.validateSalesforceConnection();
            console.log('   ✅ Salesforce connection validated');
        } catch (error) {
            console.log(`   ❌ Connection failed: ${error.message}`);
            validations.connection = { valid: false, error: error.message };
            return validations; // Can't proceed without connection
        }

        // 2. Validate report type
        console.log('   Validating report type...');
        validations.reportType = this.validateReportType(reportSpec.type);
        if (validations.reportType.valid) {
            console.log(`   ✅ Report type "${reportSpec.type}" is valid`);
        } else {
            console.log(`   ❌ ${validations.reportType.error}`);
        }

        // 3. Validate fields
        if (reportSpec.fields && reportSpec.fields.length > 0) {
            console.log('   Validating field existence and accessibility...');
            validations.fields = await this.validateFields(reportSpec);
            const validFields = validations.fields.filter(f => f.valid);
            const invalidFields = validations.fields.filter(f => !f.valid);
            
            console.log(`   ✅ Valid fields: ${validFields.length}`);
            if (invalidFields.length > 0) {
                console.log(`   ❌ Invalid fields: ${invalidFields.length}`);
                invalidFields.forEach(f => console.log(`      - ${f.field}: ${f.error}`));
            }
        }

        // 4. Validate column count
        if (reportSpec.columns) {
            console.log('   Validating column configuration...');
            validations.columns = this.validateColumns(reportSpec.type, reportSpec.columns);
            if (validations.columns.valid) {
                console.log(`   ✅ Column count (${validations.columns.count}) is acceptable`);
                if (validations.columns.warning) {
                    console.log(`   ⚠️  Warning: ${validations.columns.warning}`);
                }
            } else {
                console.log(`   ❌ ${validations.columns.error}`);
            }
        }

        // 5. Validate date filters
        if (reportSpec.filters) {
            console.log('   Validating date filters...');
            validations.dateFilters = this.validateDateFilters(reportSpec.filters);
            const validFilters = validations.dateFilters.filter(f => f.valid);
            const invalidFilters = validations.dateFilters.filter(f => !f.valid);
            
            if (invalidFilters.length > 0) {
                console.log(`   ❌ Invalid date filters: ${invalidFilters.length}`);
                invalidFilters.forEach(f => console.log(`      - ${f.filter}: ${f.error}`));
            } else if (validFilters.length > 0) {
                console.log(`   ✅ All date filters valid (${validFilters.length})`);
            }
        }

        // 6. Validate titles
        console.log('   Validating titles...');
        validations.titles = this.validateTitles(reportSpec);
        const validTitles = validations.titles.filter(t => t.valid);
        const invalidTitles = validations.titles.filter(t => !t.valid);
        
        if (invalidTitles.length > 0) {
            console.log(`   ❌ Invalid titles: ${invalidTitles.length}`);
            invalidTitles.forEach(t => {
                console.log(`      - ${t.type} title too long: "${t.title}" (${t.length} chars)`);
                if (t.suggestions && t.suggestions.length > 0) {
                    console.log(`        Suggestions: ${t.suggestions.slice(0, 2).join(', ')}`);
                }
            });
        } else if (validTitles.length > 0) {
            console.log(`   ✅ All titles valid (${validTitles.length})`);
        }

        // 7. Validate permissions
        console.log('   Validating user permissions...');
        validations.permissions = await this.validatePermissions(reportSpec);
        if (validations.permissions.valid) {
            console.log('   ✅ User has required report permissions');
        } else {
            console.log(`   ❌ Permission issues: ${validations.permissions.error}`);
            if (validations.permissions.issues) {
                validations.permissions.issues.forEach(issue => console.log(`      - ${issue}`));
            }
        }

        return validations;
    }

    generateValidationSummary(validations) {
        const summary = {
            timestamp: new Date().toISOString(),
            overallStatus: 'UNKNOWN',
            criticalIssues: [],
            warnings: [],
            recommendations: [],
            readyForDeployment: false
        };

        // Determine overall status
        const criticalFailures = [];
        
        if (!validations.connection?.valid) {
            criticalFailures.push('Salesforce connection failed');
        }
        if (!validations.reportType?.valid) {
            criticalFailures.push('Invalid report type');
        }
        if (validations.fields?.some(f => !f.valid)) {
            criticalFailures.push('Invalid or inaccessible fields detected');
        }
        if (!validations.columns?.valid) {
            criticalFailures.push('Too many columns for report type');
        }
        if (validations.dateFilters?.some(f => !f.valid)) {
            criticalFailures.push('Invalid date filters');
        }
        if (validations.titles?.some(t => !t.valid)) {
            criticalFailures.push('Title length violations');
        }
        if (!validations.permissions?.valid) {
            criticalFailures.push('Insufficient user permissions');
        }

        summary.criticalIssues = criticalFailures;
        summary.overallStatus = criticalFailures.length === 0 ? 'PASS' : 'FAIL';
        summary.readyForDeployment = criticalFailures.length === 0;

        // Add warnings
        if (validations.columns?.warning) {
            summary.warnings.push(validations.columns.warning);
        }

        // Add recommendations
        if (!summary.readyForDeployment) {
            summary.recommendations.push('Fix all critical issues before proceeding with report creation');
        }
        
        summary.recommendations.push('Run this validation before every report creation');
        summary.recommendations.push('Consider implementing this validation in your CI/CD pipeline');
        
        if (validations.fields?.filter(f => f.valid).length > 8) {
            summary.recommendations.push('Consider reducing field count for better performance');
        }

        return summary;
    }
}

// Sample report specification for testing
const SAMPLE_REPORT_SPEC = {
    name: 'Revenue Analysis Report',
    title: 'Quarterly Revenue Analysis by Region and Product Line',
    type: 'summary',
    fields: [
        { objectName: 'Opportunity', fieldName: 'Name' },
        { objectName: 'Opportunity', fieldName: 'Amount' },
        { objectName: 'Opportunity', fieldName: 'Contract_Value__c' },
        { objectName: 'Opportunity', fieldName: 'Monthly_Recurring_Revenue__c' },
        { objectName: 'Opportunity', fieldName: 'Annual_Contract_Value__c' },
        { objectName: 'Opportunity', fieldName: 'CloseDate' },
        { objectName: 'Opportunity', fieldName: 'StageName' },
        { objectName: 'Account', fieldName: 'Name' }
    ],
    columns: ['Name', 'Amount', 'Contract_Value__c', 'Monthly_Recurring_Revenue__c', 'Annual_Contract_Value__c', 'CloseDate'],
    filters: [
        { type: 'date', field: 'CloseDate', value: 'THIS_FISCAL_QUARTER' },
        { type: 'date', field: 'CreatedDate', value: 'LAST_N_DAYS:90' }
    ],
    charts: [
        { title: 'Revenue by Region - Quarterly Analysis', type: 'column' }
    ]
};

// Main execution
async function main() {
    const validator = new ReportCreationValidator();
    
    try {
        console.log('🚀 Starting Report Creation Validation...\n');
        
        // Use sample spec or load from arguments
        const reportSpec = SAMPLE_REPORT_SPEC;
        console.log(`📊 Validating: ${reportSpec.name}\n`);
        
        const validations = await validator.validateReportSpecification(reportSpec);
        const summary = validator.generateValidationSummary(validations);
        
        console.log('\n' + '='.repeat(60));
        console.log('📋 VALIDATION SUMMARY');
        console.log('='.repeat(60));
        
        console.log(`Status: ${summary.overallStatus === 'PASS' ? '✅ PASSED' : '❌ FAILED'}`);
        console.log(`Ready for Deployment: ${summary.readyForDeployment ? 'Yes' : 'No'}`);
        
        if (summary.criticalIssues.length > 0) {
            console.log('\n🚨 Critical Issues:');
            summary.criticalIssues.forEach(issue => console.log(`   - ${issue}`));
        }
        
        if (summary.warnings.length > 0) {
            console.log('\n⚠️  Warnings:');
            summary.warnings.forEach(warning => console.log(`   - ${warning}`));
        }
        
        if (summary.recommendations.length > 0) {
            console.log('\n💡 Recommendations:');
            summary.recommendations.forEach(rec => console.log(`   - ${rec}`));
        }
        
        console.log(`\n⏰ Validation completed at: ${summary.timestamp}`);
        
        // Exit with appropriate code
        process.exit(summary.overallStatus === 'PASS' ? 0 : 1);
        
    } catch (error) {
        console.error(`\n❌ Validation failed: ${error.message}`);
        process.exit(1);
    }
}

// Export for module use or run directly
if (require.main === module) {
    main();
} else {
    module.exports = { ReportCreationValidator, SAMPLE_REPORT_SPEC };
}
