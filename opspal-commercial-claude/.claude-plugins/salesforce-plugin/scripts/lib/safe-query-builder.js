#!/usr/bin/env node
/**
 * Safe Query Builder - Prevents Shell Escaping Issues
 *
 * Purpose: Build SOQL queries that work correctly in shell commands without
 * escaping issues. Addresses the common "!= null" vs "IS NOT NULL" problem.
 *
 * Key Features:
 * - Automatic conversion of != to IS NOT NULL / IS NULL
 * - Proper field reference formatting (ACCOUNT.NAME not ACCOUNT_NAME)
 * - Date literal validation
 * - WHERE clause builder with proper operators
 * - Query validation before execution
 * - Safe string escaping for LIKE operators
 *
 * Usage Examples:
 *
 * // Build a simple query
 * const query = new SafeQueryBuilder('Contact')
 *   .select(['Id', 'Name', 'Email'])
 *   .where('Email', 'IS NOT NULL')
 *   .where('Clean_Status__c', 'IN', ['Review', 'Merge'])
 *   .build();
 *
 * // Execute query safely
 * const records = await query.execute('rentable-production');
 *
 * // Complex query with relationships
 * const query = new SafeQueryBuilder('Contact')
 *   .select(['Id', 'Name', 'Account.Name', 'Account.Website'])
 *   .where('Account.Type', '=', 'Customer')
 *   .where('CreatedDate', '>', 'LAST_N_DAYS:90')
 *   .orderBy('CreatedDate', 'DESC')
 *   .limit(1000)
 *   .build();
 */

const { execSync } = require('child_process');

// FP-002 Integration: Field validator for non-queryable field detection
let fieldValidator;
try {
    fieldValidator = require('./schema-field-validator-wrapper');
} catch (error) {
    // Validator not available - will skip validation
}

/**
 * Salesforce Tooling API Objects
 * These objects MUST be queried with --use-tooling-api flag
 *
 * Reference: https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/
 */
const TOOLING_API_OBJECTS = [
    // Flow & Process Builder
    'Flow', 'FlowDefinition', 'FlowDefinitionView', 'FlowInterview', 'FlowRecordRelation',
    'FlowStageRelation', 'FlowTestRelation', 'FlowTestResult', 'FlowVariableView', 'FlowVersionView',
    'ProcessDefinition', 'ProcessInstance', 'ProcessInstanceHistory', 'ProcessInstanceNode',
    'ProcessInstanceStep', 'ProcessInstanceWorkitem', 'ProcessNode',

    // Apex Code
    'ApexClass', 'ApexClassMember', 'ApexComponent', 'ApexComponentMember', 'ApexExecutionOverlayAction',
    'ApexLog', 'ApexPage', 'ApexPageInfo', 'ApexPageMember', 'ApexTestQueueItem', 'ApexTestResult',
    'ApexTestResultLimits', 'ApexTestRunResult', 'ApexTestSuite', 'ApexTrigger', 'ApexTriggerMember',

    // Validation Rules & Workflows
    'ValidationRule', 'WorkflowAlert', 'WorkflowFieldUpdate', 'WorkflowOutboundMessage',
    'WorkflowRule', 'WorkflowTask',

    // Layouts & UI
    'Layout', 'LayoutSection', 'LayoutItem', 'FlexiPage', 'QuickActionDefinition',

    // Profiles & Permissions
    'Profile', 'PermissionSet', 'PermissionSetAssignment', 'PermissionSetGroup',
    'PermissionSetGroupComponent', 'PermissionSetLicense', 'PermissionSetLicenseAssign',
    'PermissionSetTabSetting', 'ProfileTabSetting',

    // Custom Objects & Fields
    'CustomObject', 'CustomField', 'EntityDefinition', 'FieldDefinition',
    'EntityParticle', 'RelationshipDomain', 'RelationshipInfo',

    // Email Templates
    'EmailTemplate', 'EmailTemplateMember',

    // Reports & Dashboards
    'Report', 'ReportType', 'Dashboard', 'DashboardComponent',

    // Metadata
    'MetadataContainer', 'ContainerAsyncRequest', 'DeployDetails', 'DeployMessage',

    // Debugging & Logs
    'TraceFlag', 'DebugLevel', 'ApexLog', 'EventLogFile',

    // Lightning
    'AuraDefinition', 'AuraDefinitionBundle', 'LightningComponentBundle',
    'LightningComponentResource',

    // Platform Events
    'PlatformEventChannel', 'PlatformEventChannelMember',

    // Other Metadata
    'StaticResource', 'RemoteSiteSetting', 'CustomTab', 'CustomApplication',
    'SandboxInfo', 'SandboxProcess', 'NamespaceRegistry'
];

class SafeQueryBuilder {
    constructor(sobject) {
        this.sobject = sobject;
        this.fields = [];
        this.conditions = [];
        this.orderByClause = null;
        this.limitClause = null;
        this.offsetClause = null;
        this.orgAlias = null; // Set when execute() is called
        this.fieldValidationEnabled = true; // Can be disabled
    }

    /**
     * Select fields to retrieve
     * @param {Array<string>} fields - Field names (e.g., ['Id', 'Name', 'Account.Name'])
     * @returns {SafeQueryBuilder} this (for chaining)
     */
    select(fields) {
        this.fields = fields.map(f => this._normalizeFieldName(f));
        return this;
    }

    /**
     * Add WHERE condition
     * @param {string} field - Field name
     * @param {string} operator - Operator (=, !=, >, <, >=, <=, LIKE, IN, IS NULL, IS NOT NULL)
     * @param {*} value - Value to compare (optional for IS NULL/IS NOT NULL)
     * @returns {SafeQueryBuilder} this (for chaining)
     */
    where(field, operator, value = null) {
        const normalizedField = this._normalizeFieldName(field);

        // Handle IS NULL / IS NOT NULL
        if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
            this.conditions.push(`${normalizedField} ${operator}`);
            return this;
        }

        // Auto-convert != null to IS NOT NULL
        if (operator === '!=' && (value === null || value === 'null')) {
            this.conditions.push(`${normalizedField} IS NOT NULL`);
            return this;
        }

        // Auto-convert = null to IS NULL
        if (operator === '=' && (value === null || value === 'null')) {
            this.conditions.push(`${normalizedField} IS NULL`);
            return this;
        }

        // Handle IN operator
        if (operator === 'IN') {
            if (!Array.isArray(value)) {
                throw new Error('IN operator requires array value');
            }
            const formattedValues = value.map(v => this._formatValue(v)).join(', ');
            this.conditions.push(`${normalizedField} IN (${formattedValues})`);
            return this;
        }

        // Handle LIKE operator
        if (operator === 'LIKE') {
            const escapedValue = this._escapeString(value);
            this.conditions.push(`${normalizedField} LIKE '${escapedValue}'`);
            return this;
        }

        // Handle standard operators
        const formattedValue = this._formatValue(value);
        this.conditions.push(`${normalizedField} ${operator} ${formattedValue}`);
        return this;
    }

    /**
     * Add ORDER BY clause
     * @param {string} field - Field to order by
     * @param {string} direction - ASC or DESC (default: ASC)
     * @returns {SafeQueryBuilder} this (for chaining)
     */
    orderBy(field, direction = 'ASC') {
        const normalizedField = this._normalizeFieldName(field);
        this.orderByClause = `ORDER BY ${normalizedField} ${direction}`;
        return this;
    }

    /**
     * Add LIMIT clause
     * @param {number} limit - Maximum records to return
     * @returns {SafeQueryBuilder} this (for chaining)
     */
    limit(limit) {
        this.limitClause = `LIMIT ${limit}`;
        return this;
    }

    /**
     * Add OFFSET clause
     * @param {number} offset - Number of records to skip
     * @returns {SafeQueryBuilder} this (for chaining)
     */
    offset(offset) {
        if (offset > 2000) {
            console.warn('⚠️  OFFSET maximum is 2,000. Consider using cursor-based pagination for larger offsets.');
        }
        this.offsetClause = `OFFSET ${offset}`;
        return this;
    }

    /**
     * Build the final SOQL query string
     * @returns {string} Complete SOQL query
     */
    build() {
        if (this.fields.length === 0) {
            throw new Error('No fields selected. Use .select([fields]) to specify fields.');
        }

        let query = `SELECT ${this.fields.join(', ')} FROM ${this.sobject}`;

        if (this.conditions.length > 0) {
            query += ` WHERE ${this.conditions.join(' AND ')}`;
        }

        if (this.orderByClause) {
            query += ` ${this.orderByClause}`;
        }

        if (this.limitClause) {
            query += ` ${this.limitClause}`;
        }

        if (this.offsetClause) {
            query += ` ${this.offsetClause}`;
        }

        return query;
    }

    /**
     * Execute the query against a Salesforce org
     * @param {string} orgAlias - Salesforce org alias
     * @param {object} options - Execution options
     * @param {boolean} options.validateFields - Validate fields before execution (default: true)
     * @param {boolean} options.toolingApi - Force use of Tooling API (auto-detected for metadata objects)
     * @returns {Promise<Array>} Query results
     *
     * Note: The execute method automatically detects when querying Tooling API objects
     * (Flow, ApexClass, ValidationRule, etc.) and adds the --use-tooling-api flag.
     */
    async execute(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        const validateFields = options.validateFields !== false;

        // FP-002: Validate fields before building query
        if (validateFields && fieldValidator && this.fieldValidationEnabled && this.fields.length > 0) {
            try {
                const validFields = await fieldValidator.validateQueryFieldsOrThrow(
                    this.sobject,
                    this.fields,
                    orgAlias,
                    { verbose: false }
                );

                // Update fields to only valid ones
                if (validFields.length < this.fields.length) {
                    console.warn(`⚠️  Field validation filtered ${this.fields.length - validFields.length} non-queryable fields`);
                    this.fields = validFields.map(f => this._normalizeFieldName(f));
                }
            } catch (error) {
                console.warn(`⚠️  Field validation failed: ${error.message} - proceeding without validation`);
            }
        }

        const query = this.build();
        const resultFormat = options.format || 'json';

        // AUTO-DETECT if object requires Tooling API
        const requiresToolingApi = TOOLING_API_OBJECTS.includes(this.sobject);
        const useToolingApi = options.toolingApi !== undefined ? options.toolingApi : requiresToolingApi;

        // Notify user if auto-detection occurred
        if (requiresToolingApi && options.toolingApi === undefined) {
            console.log(`🔧 Auto-detected Tooling API object: ${this.sobject}`);
            console.log(`   Automatically adding --use-tooling-api flag\n`);
        }

        console.log(`\n🔍 Executing query against ${orgAlias}:`);
        console.log(`   ${query}\n`);

        try {
            const toolingFlag = useToolingApi ? '--use-tooling-api' : '';
            const command = `sf data query --query "${query}" --target-org ${orgAlias} ${toolingFlag} --json`;

            const result = execSync(command, {
                encoding: 'utf-8',
                maxBuffer: 100 * 1024 * 1024,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const data = JSON.parse(result);

            if (data.status !== 0) {
                throw new Error(`Query failed: ${data.message}`);
            }

            const records = data.result.records || [];
            console.log(`✅ Retrieved ${records.length.toLocaleString()} records\n`);

            return records;

        } catch (error) {
            console.error(`❌ Query execution failed:`, error.message);
            throw error;
        }
    }

    /**
     * Count records matching the query
     * @param {string} orgAlias - Salesforce org alias
     * @returns {Promise<number>} Record count
     */
    async count(orgAlias) {
        const countQuery = new SafeQueryBuilder(this.sobject);
        countQuery.select(['COUNT(Id)']);
        countQuery.conditions = this.conditions;

        const query = countQuery.build();

        try {
            const command = `sf data query --query "${query}" --target-org ${orgAlias} --json`;

            const result = execSync(command, {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const data = JSON.parse(result);

            if (data.status !== 0) {
                throw new Error(`Count query failed: ${data.message}`);
            }

            return data.result.records[0]?.expr0 || 0;

        } catch (error) {
            console.error(`❌ Count query failed:`, error.message);
            throw error;
        }
    }

    /**
     * Normalize field name (handles relationship fields)
     * @private
     */
    _normalizeFieldName(field) {
        // Already normalized if contains dot
        if (field.includes('.')) {
            return field;
        }

        // Handle COUNT, SUM, AVG, etc.
        if (/^(COUNT|SUM|AVG|MIN|MAX)\(/i.test(field)) {
            return field;
        }

        return field;
    }

    /**
     * Format value for SOQL
     * @private
     */
    _formatValue(value) {
        // Handle date literals
        if (typeof value === 'string') {
            // Date literals (TODAY, YESTERDAY, LAST_N_DAYS:90, etc.)
            if (this._isDateLiteral(value)) {
                return value;
            }

            // ISO date strings
            if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
                return value;
            }

            // Regular strings - add quotes
            return `'${this._escapeString(value)}'`;
        }

        // Numbers
        if (typeof value === 'number') {
            return value;
        }

        // Booleans
        if (typeof value === 'boolean') {
            return value ? 'TRUE' : 'FALSE';
        }

        // Null
        if (value === null) {
            return 'NULL';
        }

        return `'${value}'`;
    }

    /**
     * Check if value is a SOQL date literal
     * @private
     */
    _isDateLiteral(value) {
        const dateLiterals = [
            'TODAY', 'YESTERDAY', 'TOMORROW',
            'THIS_WEEK', 'LAST_WEEK', 'NEXT_WEEK',
            'THIS_MONTH', 'LAST_MONTH', 'NEXT_MONTH',
            'THIS_QUARTER', 'LAST_QUARTER', 'NEXT_QUARTER',
            'THIS_YEAR', 'LAST_YEAR', 'NEXT_YEAR',
            'THIS_FISCAL_QUARTER', 'LAST_FISCAL_QUARTER', 'NEXT_FISCAL_QUARTER',
            'THIS_FISCAL_YEAR', 'LAST_FISCAL_YEAR', 'NEXT_FISCAL_YEAR'
        ];

        // Check exact matches
        if (dateLiterals.includes(value.toUpperCase())) {
            return true;
        }

        // Check LAST_N_DAYS:90, NEXT_N_QUARTERS:4, etc.
        if (/^(LAST|NEXT)_N_(DAYS|WEEKS|MONTHS|QUARTERS|YEARS|FISCAL_QUARTERS|FISCAL_YEARS):\d+$/i.test(value)) {
            return true;
        }

        return false;
    }

    /**
     * Escape string for SOQL (handle quotes)
     * @private
     */
    _escapeString(str) {
        if (typeof str !== 'string') {
            return str;
        }
        // Escape single quotes by doubling them
        return str.replace(/'/g, "''");
    }

    /**
     * Validate query syntax
     * @returns {object} Validation result { valid: boolean, errors: Array }
     */
    validate() {
        const errors = [];

        if (this.fields.length === 0) {
            errors.push('No fields selected');
        }

        if (!this.sobject) {
            errors.push('No sobject specified');
        }

        // Check for common mistakes
        this.conditions.forEach(condition => {
            // Check for != null (should use IS NOT NULL)
            if (condition.includes('!= null') || condition.includes('!= NULL')) {
                errors.push(`Use "IS NOT NULL" instead of "!= null": ${condition}`);
            }

            // Check for = null (should use IS NULL)
            if (condition.includes('= null') || condition.includes('= NULL')) {
                errors.push(`Use "IS NULL" instead of "= null": ${condition}`);
            }
        });

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

/**
 * Quick helper functions
 */
const SafeQuery = {
    /**
     * Build and execute a simple query
     */
    async query(sobject, fields, conditions, orgAlias) {
        const builder = new SafeQueryBuilder(sobject).select(fields);

        // Add conditions
        if (conditions) {
            Object.entries(conditions).forEach(([field, value]) => {
                if (value === null) {
                    builder.where(field, 'IS NOT NULL');
                } else if (Array.isArray(value)) {
                    builder.where(field, 'IN', value);
                } else {
                    builder.where(field, '=', value);
                }
            });
        }

        return builder.execute(orgAlias);
    },

    /**
     * Count records matching conditions
     */
    async count(sobject, conditions, orgAlias) {
        const builder = new SafeQueryBuilder(sobject).select(['COUNT(Id)']);

        if (conditions) {
            Object.entries(conditions).forEach(([field, value]) => {
                if (value === null) {
                    builder.where(field, 'IS NOT NULL');
                } else if (Array.isArray(value)) {
                    builder.where(field, 'IN', value);
                } else {
                    builder.where(field, '=', value);
                }
            });
        }

        return builder.count(orgAlias);
    },

    /**
     * Find records with non-null field values
     */
    async findWithValues(sobject, fields, nonNullFields, orgAlias) {
        const builder = new SafeQueryBuilder(sobject).select(fields);

        nonNullFields.forEach(field => {
            builder.where(field, 'IS NOT NULL');
        });

        return builder.execute(orgAlias);
    }
};

// Export
module.exports = { SafeQueryBuilder, SafeQuery };

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.log(`
Safe Query Builder

Usage:
  node safe-query-builder.js <sobject> <fields> <org-alias> [conditions]

Examples:
  # Simple query
  node safe-query-builder.js Contact "Id,Name,Email" rentable-production

  # With conditions
  node safe-query-builder.js Contact "Id,Name,Email" rentable-production "Email IS NOT NULL"

  # Count records
  node safe-query-builder.js Contact "COUNT(Id)" rentable-production "Clean_Status__c = 'Review'"
        `);
        process.exit(0);
    }

    const [sobject, fieldsStr, orgAlias, conditionsStr] = args;
    const fields = fieldsStr.split(',').map(f => f.trim());

    (async () => {
        const builder = new SafeQueryBuilder(sobject).select(fields);

        // Parse simple conditions (field operator value)
        if (conditionsStr) {
            const parts = conditionsStr.match(/(\w+\.?\w*)\s+(IS NULL|IS NOT NULL|=|!=|>|<|>=|<=|LIKE|IN)\s*(.+)?/);
            if (parts) {
                const [, field, operator, value] = parts;
                if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
                    builder.where(field, operator);
                } else if (operator === 'IN') {
                    const values = value.replace(/[()]/g, '').split(',').map(v => v.trim().replace(/'/g, ''));
                    builder.where(field, operator, values);
                } else {
                    builder.where(field, operator, value.trim().replace(/'/g, ''));
                }
            }
        }

        const records = await builder.execute(orgAlias);
        console.log(JSON.stringify(records, null, 2));

    })().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}