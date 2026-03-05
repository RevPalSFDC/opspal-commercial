#!/usr/bin/env node

/**
 * Pre-Flight Validation Framework (Enhanced with OOO Integration)
 *
 * Comprehensive validation system that checks all requirements before executing
 * Salesforce operations to prevent errors and optimize execution strategy.
 *
 * Features:
 * - Field requirement validation
 * - Picklist value enumeration
 * - Unique constraint checking
 * - Validation rule analysis (enhanced with OOO)
 * - Operation time estimation
 * - Governor limit checking
 * - OOO-enhanced dependency checking
 * - Blocking rule detection with formulas
 *
 * @see docs/SALESFORCE_ORDER_OF_OPERATIONS.md for OOO integration
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { OOOValidationRuleAnalyzer } = require('./ooo-validation-rule-analyzer');
const { OOODependencyEnforcer } = require('./ooo-dependency-enforcer');

class PreFlightValidator {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.metadataCache = new Map();
        this.cacheTimeout = 3600000; // 1 hour
        this.validationResults = [];
    }

    /**
     * Main validation entry point
     */
    async validateOperation(operation) {
        console.log('🔍 Running Pre-Flight Validation...');
        const startTime = Date.now();
        
        const validation = {
            operation: operation.type,
            object: operation.object,
            recordCount: operation.data ? operation.data.length : 0,
            timestamp: new Date().toISOString(),
            checks: {},
            issues: [],
            warnings: [],
            suggestions: {},
            canProceed: true
        };

        try {
            // Run all validation checks
            validation.checks.metadata = await this.checkMetadata(operation);
            validation.checks.requiredFields = await this.checkRequiredFields(operation);
            validation.checks.picklistValues = await this.checkPicklistValues(operation);
            validation.checks.uniqueConstraints = await this.checkUniqueConstraints(operation);
            validation.checks.validationRules = await this.checkValidationRules(operation);
            validation.checks.governorLimits = await this.checkGovernorLimits(operation);
            validation.checks.timeEstimate = await this.estimateOperationTime(operation);

            // Process results
            this.processValidationResults(validation);

            // Generate report
            validation.duration = Date.now() - startTime;
            validation.report = this.generateReport(validation);

        } catch (error) {
            validation.error = error.message;
            validation.canProceed = false;
            validation.issues.push(`Validation error: ${error.message}`);
        }

        this.validationResults.push(validation);
        return validation;
    }

    /**
     * Check object metadata
     */
    async checkMetadata(operation) {
        const cacheKey = `metadata_${operation.object}`;
        let metadata = this.getCached(cacheKey);

        if (!metadata) {
            const query = `
                SELECT QualifiedApiName, Label, IsCustomizable, 
                       RecordTypesSupported, IsLayoutable, KeyPrefix
                FROM EntityDefinition
                WHERE QualifiedApiName = '${operation.object}'
            `;
            
            const result = await this.executeQuery(query, true);
            metadata = result.records?.[0];
            
            if (metadata) {
                this.setCache(cacheKey, metadata);
            }
        }

        return {
            exists: !!metadata,
            details: metadata,
            issues: metadata ? [] : [`Object ${operation.object} not found`]
        };
    }

    /**
     * Check required fields
     */
    async checkRequiredFields(operation) {
        if (!operation.data || operation.data.length === 0) {
            return { missing: [], satisfied: true };
        }

        const fields = await this.getFieldMetadata(operation.object);
        const requiredFields = fields.filter(f => 
            !f.IsNillable && 
            !f.IsCalculated && 
            !f.IsAutoNumber &&
            (operation.type === 'insert' || f.DeveloperName !== 'Id')
        );

        const result = {
            required: requiredFields.map(f => f.QualifiedApiName),
            missing: [],
            missingSuggestions: {},
            satisfied: true
        };

        // Check each record
        for (const record of operation.data) {
            for (const field of requiredFields) {
                const fieldName = field.QualifiedApiName;
                if (!record[fieldName] && record[fieldName] !== 0 && record[fieldName] !== false) {
                    if (!result.missing.includes(fieldName)) {
                        result.missing.push(fieldName);
                        
                        // Suggest default value
                        if (field.DefaultValue) {
                            result.missingSuggestions[fieldName] = {
                                defaultValue: field.DefaultValue,
                                type: field.DataType
                            };
                        } else {
                            result.missingSuggestions[fieldName] = await this.suggestFieldValue(
                                operation.object, fieldName, field.DataType
                            );
                        }
                    }
                }
            }
        }

        result.satisfied = result.missing.length === 0;
        return result;
    }

    /**
     * Check picklist values
     */
    async checkPicklistValues(operation) {
        if (!operation.data || operation.data.length === 0) {
            return { invalid: [], satisfied: true };
        }

        const fields = await this.getFieldMetadata(operation.object);
        const picklistFields = fields.filter(f => f.DataType === 'Picklist');
        
        const result = {
            fields: picklistFields.map(f => f.QualifiedApiName),
            invalid: [],
            suggestions: {},
            satisfied: true
        };

        for (const field of picklistFields) {
            const fieldName = field.QualifiedApiName;
            const validValues = await this.getPicklistValues(operation.object, field.DeveloperName);
            
            for (const record of operation.data) {
                if (record[fieldName]) {
                    const value = record[fieldName];
                    const isValid = validValues.some(v => v.value === value && v.active);
                    
                    if (!isValid) {
                        const invalidEntry = {
                            field: fieldName,
                            value: value,
                            record: record.Id || record.Name || 'New Record'
                        };
                        
                        result.invalid.push(invalidEntry);
                        
                        // Suggest closest match
                        const suggestion = this.findClosestMatch(value, validValues.filter(v => v.active).map(v => v.value));
                        if (suggestion) {
                            result.suggestions[`${fieldName}_${value}`] = suggestion;
                        }
                    }
                }
            }
        }

        result.satisfied = result.invalid.length === 0;
        return result;
    }

    /**
     * Check unique constraints
     */
    async checkUniqueConstraints(operation) {
        if (!operation.data || operation.data.length === 0 || operation.type === 'delete') {
            return { violations: [], satisfied: true };
        }

        const fields = await this.getFieldMetadata(operation.object);
        const uniqueFields = fields.filter(f => f.IsUnique || f.IsExternalId);
        
        const result = {
            fields: uniqueFields.map(f => f.QualifiedApiName),
            violations: [],
            suggestions: {},
            satisfied: true
        };

        for (const field of uniqueFields) {
            const fieldName = field.QualifiedApiName;
            const valuesToCheck = new Set();
            
            // Collect values to check
            for (const record of operation.data) {
                if (record[fieldName]) {
                    valuesToCheck.add(record[fieldName]);
                }
            }
            
            // Check for existing records
            for (const value of valuesToCheck) {
                const query = `SELECT Id FROM ${operation.object} WHERE ${fieldName} = '${value}' LIMIT 1`;
                
                try {
                    const existing = await this.executeQuery(query);
                    if (existing.totalSize > 0) {
                        result.violations.push({
                            field: fieldName,
                            value: value,
                            existingId: existing.records[0].Id
                        });
                        
                        // Suggest alternative
                        result.suggestions[`${fieldName}_${value}`] = `${value}_${Date.now()}`;
                    }
                } catch (error) {
                    // Field might not be queryable, skip
                }
            }
        }

        result.satisfied = result.violations.length === 0;
        return result;
    }

    /**
     * Check validation rules
     */
    async checkValidationRules(operation) {
        const cacheKey = `validation_rules_${operation.object}`;
        let rules = this.getCached(cacheKey);

        if (!rules) {
            const query = `
                SELECT Id, ValidationName, Active, Description, ErrorMessage
                FROM ValidationRule
                WHERE EntityDefinition.DeveloperName = '${operation.object}'
                AND Active = true
            `;
            
            try {
                const result = await this.executeToolingQuery(query);
                rules = result.records || [];
                this.setCache(cacheKey, rules);
            } catch (error) {
                rules = [];
            }
        }

        return {
            activeRules: rules.length,
            rules: rules.map(r => ({
                name: r.ValidationName,
                description: r.Description,
                errorMessage: r.ErrorMessage
            })),
            warnings: rules.length > 0 ? 
                [`${rules.length} active validation rules may affect this operation`] : []
        };
    }

    /**
     * Check governor limits
     */
    async checkGovernorLimits(operation) {
        const recordCount = operation.data ? operation.data.length : 0;
        
        const limits = {
            dmlRows: 10000,
            dmlStatements: 150,
            soqlQueries: 100,
            apiCalls: 100,
            cpuTime: 10000
        };

        const usage = {
            dmlRows: recordCount,
            dmlStatements: Math.ceil(recordCount / 200), // Bulk operations
            estimatedApiCalls: Math.ceil(recordCount / 200)
        };

        const warnings = [];
        if (usage.dmlRows > limits.dmlRows * 0.8) {
            warnings.push(`Operation will use ${usage.dmlRows}/${limits.dmlRows} DML rows (${Math.round(usage.dmlRows/limits.dmlRows*100)}%)`);
        }

        return {
            limits,
            usage,
            warnings,
            withinLimits: usage.dmlRows <= limits.dmlRows
        };
    }

    /**
     * Estimate operation time
     */
    async estimateOperationTime(operation) {
        const recordCount = operation.data ? operation.data.length : 0;
        
        const timePerRecord = {
            insert: 50,
            update: 60,
            upsert: 70,
            delete: 40,
            query: 10
        };

        const baseTime = timePerRecord[operation.type] || 50;
        const totalMs = (recordCount * baseTime) + 2000; // Add network overhead
        
        const estimate = {
            milliseconds: totalMs,
            seconds: Math.round(totalMs / 1000),
            formatted: this.formatTime(totalMs),
            warning: null
        };

        if (totalMs > 120000) {
            estimate.warning = 'Operation may exceed 2-minute timeout limit';
        } else if (totalMs > 60000) {
            estimate.warning = 'Consider using background processing for better reliability';
        }

        return estimate;
    }

    /**
     * Get field metadata with caching
     */
    async getFieldMetadata(objectName) {
        const cacheKey = `fields_${objectName}`;
        let fields = this.getCached(cacheKey);

        if (!fields) {
            const query = `
                SELECT QualifiedApiName, DeveloperName, Label, DataType, Length,
                       IsNillable, DefaultValue, IsUnique, IsExternalId, 
                       IsCalculated, IsAutoNumber, IsRestrictedPicklist
                FROM FieldDefinition
                WHERE EntityDefinition.QualifiedApiName = '${objectName}'
            `;
            
            const result = await this.executeQuery(query, true);
            fields = result.records || [];
            this.setCache(cacheKey, fields);
        }

        return fields;
    }

    /**
     * Get picklist values
     */
    async getPicklistValues(objectName, fieldName) {
        const cacheKey = `picklist_${objectName}_${fieldName}`;
        let values = this.getCached(cacheKey);

        if (!values) {
            const query = `
                SELECT Label, Value, IsActive, IsDefaultValue
                FROM PicklistValueInfo
                WHERE EntityParticle.EntityDefinition.QualifiedApiName = '${objectName}'
                AND EntityParticle.DeveloperName = '${fieldName}'
            `;
            
            try {
                const result = await this.executeQuery(query, true);
                values = result.records?.map(r => ({
                    label: r.Label,
                    value: r.Value,
                    active: r.IsActive,
                    default: r.IsDefaultValue
                })) || [];
                this.setCache(cacheKey, values);
            } catch (error) {
                // Fallback to describe
                values = await this.getPicklistValuesViaDescribe(objectName, fieldName);
            }
        }

        return values;
    }

    /**
     * Get picklist values via describe (fallback)
     */
    async getPicklistValuesViaDescribe(objectName, fieldName) {
        const cmd = `sf sobject describe --sobject ${objectName} --json --target-org ${this.orgAlias}`;
        const result = await execAsync(cmd);
        const describe = JSON.parse(result.stdout);
        
        const field = describe.result?.fields?.find(f => 
            f.name === fieldName || f.name === fieldName.replace('__c', '')
        );
        
        if (field?.picklistValues) {
            return field.picklistValues.map(v => ({
                label: v.label,
                value: v.value,
                active: v.active,
                default: v.defaultValue
            }));
        }
        
        return [];
    }

    /**
     * Suggest field value
     */
    async suggestFieldValue(objectName, fieldName, dataType) {
        const suggestion = {
            field: fieldName,
            type: dataType
        };

        // Try to find common values
        try {
            const query = `
                SELECT ${fieldName}, COUNT(Id) cnt
                FROM ${objectName}
                WHERE ${fieldName} != null
                GROUP BY ${fieldName}
                ORDER BY COUNT(Id) DESC
                LIMIT 1
            `;
            
            const result = await this.executeQuery(query);
            if (result.records?.length > 0) {
                suggestion.commonValue = result.records[0][fieldName];
                suggestion.source = 'common_value';
                return suggestion;
            }
        } catch (error) {
            // Field might not be groupable
        }

        // Provide type-based defaults
        switch (dataType) {
            case 'String':
            case 'TextArea':
                suggestion.defaultValue = 'TBD';
                break;
            case 'Number':
            case 'Currency':
            case 'Percent':
                suggestion.defaultValue = 0;
                break;
            case 'Date':
                suggestion.defaultValue = new Date().toISOString().split('T')[0];
                break;
            case 'DateTime':
                suggestion.defaultValue = new Date().toISOString();
                break;
            case 'Boolean':
                suggestion.defaultValue = false;
                break;
            case 'Email':
                suggestion.defaultValue = 'placeholder@example.com';
                break;
            case 'Phone':
                suggestion.defaultValue = '555-0100';
                break;
            case 'Url':
                suggestion.defaultValue = 'https://example.com';
                break;
            default:
                suggestion.defaultValue = null;
        }

        suggestion.source = 'type_default';
        return suggestion;
    }

    /**
     * Find closest match for picklist value
     */
    findClosestMatch(value, options) {
        if (!value || !options || options.length === 0) return null;
        
        const valueLower = value.toLowerCase();
        
        // Exact match (case insensitive)
        const exactMatch = options.find(o => o.toLowerCase() === valueLower);
        if (exactMatch) return exactMatch;
        
        // Starts with
        const startsMatch = options.find(o => o.toLowerCase().startsWith(valueLower));
        if (startsMatch) return startsMatch;
        
        // Contains
        const containsMatch = options.find(o => o.toLowerCase().includes(valueLower));
        if (containsMatch) return containsMatch;
        
        // Levenshtein distance (simple implementation)
        let bestMatch = null;
        let bestDistance = Infinity;
        
        for (const option of options) {
            const distance = this.levenshteinDistance(valueLower, option.toLowerCase());
            if (distance < bestDistance && distance <= 3) {
                bestDistance = distance;
                bestMatch = option;
            }
        }
        
        return bestMatch;
    }

    /**
     * Simple Levenshtein distance
     */
    levenshteinDistance(a, b) {
        const matrix = [];
        
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[b.length][a.length];
    }

    /**
     * Process validation results
     */
    processValidationResults(validation) {
        // Check required fields
        if (!validation.checks.requiredFields.satisfied) {
            validation.issues.push(
                `Missing required fields: ${validation.checks.requiredFields.missing.join(', ')}`
            );
            validation.suggestions.requiredFields = validation.checks.requiredFields.missingSuggestions;
        }

        // Check picklist values
        if (!validation.checks.picklistValues.satisfied) {
            validation.issues.push(
                `Invalid picklist values found (${validation.checks.picklistValues.invalid.length} issues)`
            );
            validation.suggestions.picklistValues = validation.checks.picklistValues.suggestions;
        }

        // Check unique constraints
        if (!validation.checks.uniqueConstraints.satisfied) {
            validation.issues.push(
                `Unique constraint violations (${validation.checks.uniqueConstraints.violations.length} conflicts)`
            );
            validation.suggestions.uniqueConstraints = validation.checks.uniqueConstraints.suggestions;
        }

        // Add warnings
        if (validation.checks.validationRules.warnings.length > 0) {
            validation.warnings.push(...validation.checks.validationRules.warnings);
        }

        if (validation.checks.governorLimits.warnings.length > 0) {
            validation.warnings.push(...validation.checks.governorLimits.warnings);
        }

        if (validation.checks.timeEstimate.warning) {
            validation.warnings.push(validation.checks.timeEstimate.warning);
        }

        // Determine if can proceed
        validation.canProceed = validation.issues.length === 0;
    }

    /**
     * Generate validation report
     */
    generateReport(validation) {
        const lines = [];
        
        lines.push('═══════════════════════════════════════');
        lines.push('       PRE-FLIGHT VALIDATION REPORT     ');
        lines.push('═══════════════════════════════════════');
        lines.push(`Operation: ${validation.operation} on ${validation.object}`);
        lines.push(`Records: ${validation.recordCount}`);
        lines.push(`Time: ${validation.timestamp}`);
        lines.push('');
        
        // Status
        if (validation.canProceed) {
            lines.push('✅ VALIDATION PASSED - Safe to proceed');
        } else {
            lines.push('❌ VALIDATION FAILED - Issues must be resolved');
        }
        lines.push('');
        
        // Issues
        if (validation.issues.length > 0) {
            lines.push('🚨 ISSUES FOUND:');
            validation.issues.forEach((issue, i) => {
                lines.push(`   ${i + 1}. ${issue}`);
            });
            lines.push('');
        }
        
        // Warnings
        if (validation.warnings.length > 0) {
            lines.push('⚠️  WARNINGS:');
            validation.warnings.forEach((warning, i) => {
                lines.push(`   ${i + 1}. ${warning}`);
            });
            lines.push('');
        }
        
        // Suggestions
        if (Object.keys(validation.suggestions).length > 0) {
            lines.push('💡 SUGGESTIONS:');
            for (const [category, suggestions] of Object.entries(validation.suggestions)) {
                lines.push(`   ${category}:`);
                if (typeof suggestions === 'object') {
                    for (const [key, value] of Object.entries(suggestions)) {
                        lines.push(`     • ${key}: ${JSON.stringify(value)}`);
                    }
                }
            }
            lines.push('');
        }
        
        // Detailed checks
        lines.push('📋 VALIDATION CHECKS:');
        lines.push(`   • Metadata: ${validation.checks.metadata.exists ? '✓' : '✗'}`);
        lines.push(`   • Required Fields: ${validation.checks.requiredFields.satisfied ? '✓' : '✗'}`);
        lines.push(`   • Picklist Values: ${validation.checks.picklistValues.satisfied ? '✓' : '✗'}`);
        lines.push(`   • Unique Constraints: ${validation.checks.uniqueConstraints.satisfied ? '✓' : '✗'}`);
        lines.push(`   • Governor Limits: ${validation.checks.governorLimits.withinLimits ? '✓' : '✗'}`);
        lines.push('');
        
        // Time estimate
        lines.push(`⏱️  Estimated Time: ${validation.checks.timeEstimate.formatted}`);
        lines.push(`📊 Validation completed in ${validation.duration}ms`);
        lines.push('═══════════════════════════════════════');
        
        return lines.join('\n');
    }

    /**
     * Execute SOQL query
     */
    async executeQuery(query, useTooling = false) {
        const cmd = `sf data query --query "${query.replace(/\n/g, ' ')}" --json --target-org ${this.orgAlias}${useTooling ? ' --use-tooling-api' : ''}`;
        const result = await execAsync(cmd);
        return JSON.parse(result.stdout).result;
    }

    /**
     * Execute Tooling API query
     */
    async executeToolingQuery(query) {
        return this.executeQuery(query, true);
    }

    /**
     * Cache management
     */
    getCached(key) {
        const cached = this.metadataCache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    setCache(key, data) {
        this.metadataCache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Format time
     */
    formatTime(ms) {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
    }

    // ========== OOO-Enhanced Methods (NEW) ==========

    /**
     * OOO: Get Active Validation Rules with Formulas
     *
     * Enhanced validation rule checking with formula extraction.
     * Integrates with ooo-validation-rule-analyzer for formula-based prediction.
     *
     * @param {string} objectName - Salesforce object API name
     * @returns {Promise<object>} Enhanced validation rule analysis
     */
    async getActiveValidationRulesWithFormulas(objectName) {
        try {
            const analyzer = new OOOValidationRuleAnalyzer(this.orgAlias, { verbose: false });
            const rules = await analyzer.getActiveValidationRulesWithFormulas(objectName);

            return {
                count: rules.length,
                rules: rules,
                hasFormulas: rules.filter(r => r.formula && r.formula !== 'N/A').length
            };
        } catch (error) {
            return {
                count: 0,
                rules: [],
                hasFormulas: 0,
                error: error.message
            };
        }
    }

    /**
     * OOO: Detect Blocking Rules
     *
     * Predicts which validation rules would block a specific payload.
     * Uses formula pattern matching from ooo-validation-rule-analyzer.
     *
     * @param {string} objectName - Salesforce object API name
     * @param {object} payload - Planned record data
     * @returns {Promise<object>} Blocking rule predictions
     */
    async detectBlockingRules(objectName, payload) {
        try {
            const analyzer = new OOOValidationRuleAnalyzer(this.orgAlias, { verbose: false });
            const blockingRules = await analyzer.predictBlockingRules(objectName, payload);

            return {
                wouldBlock: blockingRules.length > 0,
                count: blockingRules.length,
                rules: blockingRules.map(r => ({
                    name: r.name,
                    errorMessage: r.errorMessage,
                    formula: r.formula,
                    likelihood: r.likelihood,
                    reason: r.reason,
                    remediation: r.remediation
                }))
            };
        } catch (error) {
            return {
                wouldBlock: false,
                count: 0,
                rules: [],
                error: error.message
            };
        }
    }

    /**
     * OOO: Check Dependent Picklists
     *
     * Validates dependent/controlling picklist relationships and ensures
     * proper write order.
     *
     * @param {string} objectName - Salesforce object API name
     * @param {object} payload - Planned record data
     * @returns {Promise<object>} Picklist dependency validation
     */
    async checkDependentPicklists(objectName, payload) {
        try {
            // Get picklist fields from metadata
            const fields = await this.getFieldMetadata(objectName);
            const picklistFields = fields.filter(f => f.DataType === 'Picklist');

            const issues = [];
            const warnings = [];

            for (const field of picklistFields) {
                const fieldName = field.QualifiedApiName;

                // Check if field has controlling field
                if (field.ControllingFieldDefinitionId) {
                    // Find controlling field
                    const controllingField = fields.find(f =>
                        f.Id === field.ControllingFieldDefinitionId
                    );

                    if (controllingField && payload[fieldName] && payload[controllingField.QualifiedApiName]) {
                        warnings.push({
                            dependent: fieldName,
                            controlling: controllingField.QualifiedApiName,
                            message: `Ensure ${controllingField.QualifiedApiName} is set before ${fieldName}`,
                            recommendation: 'Set controlling field first in payload order'
                        });
                    } else if (controllingField && payload[fieldName] && !payload[controllingField.QualifiedApiName]) {
                        issues.push({
                            dependent: fieldName,
                            controlling: controllingField.QualifiedApiName,
                            message: `Dependent field ${fieldName} requires controlling field ${controllingField.QualifiedApiName}`,
                            severity: 'HIGH'
                        });
                    }
                }
            }

            return {
                hasDependencies: warnings.length > 0 || issues.length > 0,
                issues,
                warnings
            };
        } catch (error) {
            return {
                hasDependencies: false,
                issues: [],
                warnings: [],
                error: error.message
            };
        }
    }

    /**
     * OOO: Validate Write Dependencies
     *
     * Comprehensive dependency validation using OOO dependency enforcer.
     * Checks all 5 dependency rules before write operation.
     *
     * @param {object} writeContext - Write operation context
     * @returns {Promise<object>} Dependency validation result
     */
    async validateWriteDependencies(writeContext) {
        try {
            const enforcer = new OOODependencyEnforcer(this.orgAlias, { verbose: false });
            const validation = await enforcer.validateAll(writeContext);

            return {
                passed: validation.passed,
                violations: validation.violations,
                summary: validation.summary,
                blocking: validation.violations.filter(v =>
                    v.action === 'BLOCK_WRITE' || v.action === 'BLOCK_ACTIVATION'
                ).length
            };
        } catch (error) {
            return {
                passed: false,
                violations: [],
                summary: {},
                error: error.message
            };
        }
    }
}

// Export for use in other modules
module.exports = PreFlightValidator;

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
Pre-Flight Validation Framework

Usage:
  node preflight-validator.js <command> [options]

Commands:
  validate <file>           Validate operation from JSON file
  check-fields <object>     Check required fields for an object
  check-picklist <object>   List all picklist values for an object
  analyze <object>          Complete analysis of an object
  validate-layout <file>    Validate Salesforce layout XML (structure + fields)

Options:
  --org <alias>             Target org alias
  --output <file>           Save report to file
  --layout <file>           Layout file path (for validate-layout)

Examples:
  node preflight-validator.js validate operation.json --org myorg
  node preflight-validator.js check-fields Account --org production
  node preflight-validator.js analyze Opportunity --output report.txt
  node preflight-validator.js validate-layout --org myorg --layout force-app/main/default/layouts/Opportunity-Layout.layout-meta.xml
        `);
        process.exit(0);
    }

    (async () => {
        try {
            const command = args[0];
            const orgAlias = args.includes('--org') ? args[args.indexOf('--org') + 1] : process.env.SF_TARGET_ORG;
            const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
            
            const validator = new PreFlightValidator(orgAlias);
            let result;

            switch (command) {
                case 'validate': {
                    const file = args[1];
                    const fs = require('fs');
                    const operation = JSON.parse(fs.readFileSync(file, 'utf8'));
                    result = await validator.validateOperation(operation);
                    console.log(result.report);
                    break;
                }

                case 'check-fields': {
                    const object = args[1];
                    const fields = await validator.getFieldMetadata(object);
                    const required = fields.filter(f => !f.IsNillable && !f.IsCalculated);
                    console.log(`Required fields for ${object}:`);
                    required.forEach(f => {
                        console.log(`  • ${f.QualifiedApiName} (${f.DataType})`);
                    });
                    break;
                }

                case 'check-picklist': {
                    const object = args[1];
                    const fields = await validator.getFieldMetadata(object);
                    const picklists = fields.filter(f => f.DataType === 'Picklist');
                    
                    for (const field of picklists) {
                        const values = await validator.getPicklistValues(object, field.DeveloperName);
                        console.log(`\n${field.QualifiedApiName}:`);
                        values.filter(v => v.active).forEach(v => {
                            console.log(`  • ${v.value}${v.default ? ' (default)' : ''}`);
                        });
                    }
                    break;
                }

                case 'analyze': {
                    const object = args[1];
                    const operation = {
                        type: 'insert',
                        object: object,
                        data: []
                    };
                    result = await validator.validateOperation(operation);
                    console.log(result.report);
                    break;
                }

                case 'validate-layout': {
                    const layoutFile = args.includes('--layout') ? args[args.indexOf('--layout') + 1] : null;

                    if (!layoutFile) {
                        throw new Error('--layout parameter is required for validate-layout command');
                    }

                    if (!orgAlias) {
                        throw new Error('--org parameter is required for layout field validation');
                    }

                    console.log('🔍 Running Comprehensive Layout Validation...\n');

                    // Step 1: XML Structure Validation
                    console.log('Step 1: Validating XML structure...');
                    const { execSync } = require('child_process');
                    const path = require('path');
                    const scriptDir = path.dirname(__filename);

                    let structureValid = false;
                    try {
                        execSync(
                            `node "${path.join(scriptDir, 'salesforce-layout-validator.js')}" validate "${layoutFile}"`,
                            { stdio: 'inherit' }
                        );
                        structureValid = true;
                    } catch (error) {
                        console.error('\n❌ XML structure validation failed\n');
                        structureValid = false;
                    }

                    // Step 2: Field Reference Validation
                    console.log('\nStep 2: Validating field references...');
                    let fieldsValid = false;
                    try {
                        execSync(
                            `node "${path.join(scriptDir, 'layout-field-validator.js')}" --org "${orgAlias}" --layout "${layoutFile}"`,
                            { stdio: 'inherit' }
                        );
                        fieldsValid = true;
                    } catch (error) {
                        console.error('\n❌ Field reference validation failed\n');
                        fieldsValid = false;
                    }

                    // Overall Result
                    console.log('\n' + '='.repeat(80));
                    console.log('Overall Layout Validation Result');
                    console.log('='.repeat(80) + '\n');

                    if (structureValid && fieldsValid) {
                        console.log('✅ Layout passed all validations - READY TO DEPLOY\n');
                        process.exit(0);
                    } else {
                        console.log('❌ Layout validation FAILED:');
                        if (!structureValid) console.log('   • XML structure issues detected');
                        if (!fieldsValid) console.log('   • Invalid field references detected');
                        console.log('\n🚫 DEPLOYMENT BLOCKED - Fix errors before deploying\n');
                        process.exit(1);
                    }
                    break;
                }

                default:
                    throw new Error(`Unknown command: ${command}`);
            }

            if (outputFile && result) {
                const fs = require('fs');
                fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
                console.log(`\nReport saved to ${outputFile}`);
            }

        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}