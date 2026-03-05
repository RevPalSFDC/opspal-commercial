#!/usr/bin/env node

/**
 * Metadata Query Fixer
 *
 * Instance-agnostic utility to fix common SOQL query issues with Salesforce metadata objects.
 * Handles CustomField, FieldDefinition, and SetupAuditTrail queries across different org types.
 *
 * Root Cause Analysis:
 * 1. CustomField object doesn't exist in standard API - use FieldDefinition instead
 * 2. FieldDefinition has limited relationships - no CreatedBy/LastModifiedBy
 * 3. SetupAuditTrail has limited filterable fields - Section is not filterable
 * 4. Different orgs may have different metadata API versions and available fields
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class MetadataQueryFixer {
    constructor(orgAlias = '') {
        this.orgAlias = orgAlias;

        // Map incorrect object names to correct ones
        this.objectMapping = {
            'CustomField': 'FieldDefinition',
            'CustomFields': 'FieldDefinition',
            'Field': 'FieldDefinition',
            'Fields': 'FieldDefinition'
        };

        // Known available fields for metadata objects
        this.knownFields = {
            'FieldDefinition': {
                queryable: [
                    'Id', 'DurableId', 'QualifiedApiName', 'EntityDefinitionId',
                    'NamespacePrefix', 'DeveloperName', 'MasterLabel', 'Label',
                    'Length', 'DataType', 'ServiceDataTypeId', 'ValueTypeId',
                    'ExtraTypeInfo', 'IsCalculated', 'IsHighScaleNumber',
                    'IsHtmlFormatted', 'IsNameField', 'IsNillable',
                    'IsWorkflowFilterable', 'IsCompactLayoutable', 'Precision',
                    'Scale', 'IsFieldHistoryTracked', 'IsIndexed', 'IsApiFilterable',
                    'IsApiSortable', 'IsListFilterable', 'IsListSortable',
                    'IsApiGroupable', 'IsListVisible', 'ControllingFieldDefinitionId',
                    'LastModifiedDate', 'LastModifiedById', 'IsCompound',
                    'IsSearchPrefilterable', 'IsPolymorphicForeignKey', 'IsAiPredictionField',
                    'BusinessOwnerId', 'BusinessStatus', 'SecurityClassification',
                    'ComplianceGroup', 'Description'
                ],
                relationships: [], // No standard relationships available
                filterable: [
                    'Id', 'DurableId', 'QualifiedApiName', 'EntityDefinitionId',
                    'DeveloperName', 'DataType', 'IsCustom'
                ]
            },
            'SetupAuditTrail': {
                queryable: [
                    'Id', 'Action', 'Section', 'CreatedDate', 'CreatedById',
                    'Display', 'DelegateUser', 'ResponsibleNamespacePrefix',
                    'CreatedByContext', 'CreatedByIssuer'
                ],
                relationships: ['CreatedBy'], // Has CreatedBy relationship
                filterable: [
                    'Id', 'Action', 'CreatedDate', 'CreatedById',
                    'DelegateUser', 'ResponsibleNamespacePrefix',
                    'CreatedByContext', 'CreatedByIssuer'
                    // Note: Section is NOT filterable in WHERE clause
                ]
            },
            'EntityDefinition': {
                queryable: [
                    'Id', 'DurableId', 'QualifiedApiName', 'NamespacePrefix',
                    'DeveloperName', 'MasterLabel', 'Label', 'PluralLabel',
                    'DefaultCompactLayoutId', 'IsCustomizable', 'IsApexTriggerable',
                    'IsWorkflowEnabled', 'IsProcessEnabled', 'IsCompactLayoutable',
                    'DeploymentStatus', 'KeyPrefix', 'IsCustomSetting', 'IsDeprecatedAndHidden',
                    'IsReplicateable', 'IsRetrieveable', 'IsSearchLayoutable',
                    'IsSearchable', 'IsTriggerable', 'IsIdEnabled', 'IsEverCreatable',
                    'IsEverUpdatable', 'IsEverDeletable', 'IsFeedEnabled',
                    'IsQueryable', 'IsMruEnabled'
                ],
                relationships: [],
                filterable: [
                    'Id', 'DurableId', 'QualifiedApiName', 'DeveloperName',
                    'KeyPrefix', 'IsCustomizable', 'IsCustomSetting'
                ]
            }
        };
    }

    /**
     * Get org parameter for SF CLI commands
     */
    getOrgParam() {
        return this.orgAlias ? `--target-org ${this.orgAlias}` : '';
    }

    /**
     * Fix common query patterns
     */
    fixQuery(originalQuery) {
        let fixedQuery = originalQuery;
        let issues = [];
        let fixes = [];

        // Extract object name from query
        const fromMatch = fixedQuery.match(/FROM\s+(\w+)/i);
        if (!fromMatch) {
            return {
                original: originalQuery,
                fixed: fixedQuery,
                issues: ['Could not parse object name from query'],
                fixes: [],
                executable: false
            };
        }

        let objectName = fromMatch[1];

        // Fix 1: Replace incorrect object names
        if (this.objectMapping[objectName]) {
            const correctObject = this.objectMapping[objectName];
            fixedQuery = fixedQuery.replace(new RegExp(`FROM\\s+${objectName}`, 'i'), `FROM ${correctObject}`);
            issues.push(`'${objectName}' object doesn't exist in metadata API`);
            fixes.push(`Replaced '${objectName}' with '${correctObject}'`);
            objectName = correctObject;
        }

        // Get known fields for this object
        const objectInfo = this.knownFields[objectName];
        if (!objectInfo) {
            // Unknown object, return as-is
            return {
                original: originalQuery,
                fixed: fixedQuery,
                issues: [`Unknown metadata object: ${objectName}`],
                fixes,
                executable: true
            };
        }

        // Fix 2: Remove invalid relationships from SELECT
        const selectMatch = fixedQuery.match(/SELECT\s+(.*?)\s+FROM/i);
        if (selectMatch) {
            const selectClause = selectMatch[1];
            const fields = selectClause.split(',').map(f => f.trim());
            const validFields = [];
            const invalidFields = [];

            for (const field of fields) {
                // Check for relationship fields (e.g., CreatedBy.Name)
                if (field.includes('.')) {
                    const [relationship, relField] = field.split('.');
                    if (!objectInfo.relationships.includes(relationship)) {
                        invalidFields.push(field);
                        issues.push(`Relationship '${relationship}' not available on ${objectName}`);
                    } else {
                        validFields.push(field);
                    }
                } else {
                    // Check if field exists
                    if (objectInfo.queryable.includes(field) || field === '*') {
                        validFields.push(field);
                    } else {
                        // Try case-insensitive match
                        const matchedField = objectInfo.queryable.find(f =>
                            f.toLowerCase() === field.toLowerCase()
                        );
                        if (matchedField) {
                            validFields.push(matchedField);
                            if (matchedField !== field) {
                                fixes.push(`Fixed field case: '${field}' → '${matchedField}'`);
                            }
                        } else {
                            invalidFields.push(field);
                            issues.push(`Field '${field}' not available on ${objectName}`);
                        }
                    }
                }
            }

            if (invalidFields.length > 0) {
                const newSelect = validFields.join(', ');
                fixedQuery = fixedQuery.replace(selectMatch[0], `SELECT ${newSelect} FROM`);
                fixes.push(`Removed invalid fields: ${invalidFields.join(', ')}`);
            }
        }

        // Fix 3: Remove non-filterable fields from WHERE clause
        const whereMatch = fixedQuery.match(/WHERE\s+(.*?)(?:ORDER|GROUP|LIMIT|$)/i);
        if (whereMatch) {
            let whereClause = whereMatch[1];
            const originalWhere = whereClause;

            // Check for non-filterable fields
            for (const field of objectInfo.queryable) {
                if (!objectInfo.filterable.includes(field)) {
                    // Check if this field is used in WHERE clause
                    const fieldPattern = new RegExp(`\\b${field}\\b`, 'i');
                    if (fieldPattern.test(whereClause)) {
                        // Special handling for SetupAuditTrail.Section
                        if (objectName === 'SetupAuditTrail' && field === 'Section') {
                            // Remove the Section filter entirely
                            whereClause = whereClause.replace(/AND\s+Section\s+LIKE\s+'[^']*'/gi, '');
                            whereClause = whereClause.replace(/Section\s+LIKE\s+'[^']*'\s+AND/gi, '');
                            whereClause = whereClause.replace(/Section\s+LIKE\s+'[^']*'/gi, '');
                            issues.push(`Field 'Section' cannot be filtered in SetupAuditTrail`);
                            fixes.push(`Removed Section filter from WHERE clause`);
                        }
                    }
                }
            }

            if (whereClause !== originalWhere) {
                fixedQuery = fixedQuery.replace(originalWhere, whereClause);
            }

            // Clean up any double ANDs or trailing ANDs
            fixedQuery = fixedQuery.replace(/AND\s+AND/gi, 'AND');
            fixedQuery = fixedQuery.replace(/WHERE\s+AND/gi, 'WHERE');
            fixedQuery = fixedQuery.replace(/AND\s+ORDER/gi, 'ORDER');
            fixedQuery = fixedQuery.replace(/AND\s+$/gi, '');
        }

        return {
            original: originalQuery,
            fixed: fixedQuery.trim(),
            issues,
            fixes,
            executable: true,
            objectName
        };
    }

    /**
     * Suggest alternative query for common use cases
     */
    suggestAlternative(originalQuery, purpose = '') {
        const suggestions = [];

        // Detect common patterns
        if (/custom\s*field/i.test(originalQuery) || /CustomField/i.test(originalQuery)) {
            suggestions.push({
                purpose: 'Query custom fields for an object',
                query: "SELECT Id, DeveloperName, QualifiedApiName, DataType, Length FROM FieldDefinition WHERE EntityDefinitionId = 'Account' AND DeveloperName LIKE '%__c'"
            });
        }

        if (/recently\s*created/i.test(originalQuery) || /new\s*field/i.test(originalQuery)) {
            suggestions.push({
                purpose: 'Find recently created custom fields',
                query: "SELECT Id, DeveloperName, QualifiedApiName, EntityDefinitionId, DataType FROM FieldDefinition WHERE DeveloperName LIKE '%__c' AND LastModifiedDate >= LAST_N_DAYS:7"
            });
        }

        if (/SetupAuditTrail.*field/i.test(originalQuery)) {
            suggestions.push({
                purpose: 'Query Setup Audit Trail for field changes',
                query: "SELECT Id, Action, Display, CreatedDate, CreatedBy.Name FROM SetupAuditTrail WHERE CreatedDate >= LAST_N_DAYS:7 ORDER BY CreatedDate DESC LIMIT 100",
                note: "Filter for field-related actions in the Display field after querying"
            });
        }

        if (/created\s*by.*chris/i.test(originalQuery) || /CreatedBy\.Name.*Chris/i.test(originalQuery)) {
            suggestions.push({
                purpose: 'Find items created by a specific user',
                query: "SELECT Id, Action, Display, CreatedDate FROM SetupAuditTrail WHERE CreatedById = '005...' ORDER BY CreatedDate DESC",
                note: "First query User object to get the UserId, then use it in the filter"
            });
        }

        return suggestions;
    }

    /**
     * Execute the fixed query
     */
    async executeQuery(query) {
        try {
            const cmd = `sf data query --query "${query}" ${this.getOrgParam()} --json`;
            const { stdout } = await execAsync(cmd);
            const result = JSON.parse(stdout);

            if (result.status !== 0) {
                return {
                    success: false,
                    error: result.message || result.result?.message,
                    records: []
                };
            }

            return {
                success: true,
                records: result.result.records,
                totalSize: result.result.totalSize
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                records: []
            };
        }
    }

    /**
     * Discover available metadata objects in the org
     */
    async discoverMetadataObjects() {
        const metadataObjects = [
            'EntityDefinition',
            'FieldDefinition',
            'EntityParticle',
            'FieldPermissions',
            'SetupAuditTrail',
            'FlowDefinitionView',
            'ValidationRule',
            'CustomField',
            'Layout',
            'ProfileLayout',
            'PermissionSet',
            'Profile'
        ];

        const available = [];
        const unavailable = [];

        for (const obj of metadataObjects) {
            const testQuery = `SELECT Id FROM ${obj} LIMIT 1`;
            const result = await this.executeQuery(testQuery);

            if (result.success) {
                available.push(obj);
            } else {
                unavailable.push(obj);
            }
        }

        return { available, unavailable };
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
Metadata Query Fixer
====================

Fixes common SOQL query issues with Salesforce metadata objects.

Usage:
  ${process.argv[1]} fix "<query>" [--org alias]
    Fix a problematic query

  ${process.argv[1]} suggest "<query or description>" [--org alias]
    Suggest alternative queries

  ${process.argv[1]} discover [--org alias]
    Discover available metadata objects in the org

  ${process.argv[1]} execute "<query>" [--org alias] [--fix]
    Execute a query (optionally fix it first)

Examples:
  # Fix a query with invalid object/fields
  ${process.argv[1]} fix "SELECT DataType FROM CustomField WHERE TableEnumOrId = 'Account'"

  # Get suggestions for common tasks
  ${process.argv[1]} suggest "find recently created custom fields"

  # Execute with automatic fixing
  ${process.argv[1]} execute "SELECT CreatedBy.Name FROM FieldDefinition" --fix

Root Causes Fixed:
  • CustomField → FieldDefinition (correct metadata object)
  • Removes invalid relationships (CreatedBy.Name on FieldDefinition)
  • Removes non-filterable fields from WHERE clause
  • Fixes field name casing issues
  • Handles SetupAuditTrail limitations
`);
        process.exit(0);
    }

    const command = args[0];
    const orgIndex = args.indexOf('--org');
    const orgAlias = orgIndex > -1 ? args[orgIndex + 1] : '';

    const fixer = new MetadataQueryFixer(orgAlias);

    try {
        switch (command) {
            case 'fix': {
                if (args.length < 2) {
                    console.error('Error: Query required');
                    process.exit(1);
                }

                const query = args[1];
                const result = fixer.fixQuery(query);

                console.log('\n📋 Original Query:');
                console.log(result.original);

                if (result.issues.length > 0) {
                    console.log('\n⚠️  Issues Found:');
                    result.issues.forEach(issue => console.log(`  • ${issue}`));
                }

                if (result.fixes.length > 0) {
                    console.log('\n✅ Fixes Applied:');
                    result.fixes.forEach(fix => console.log(`  • ${fix}`));
                }

                console.log('\n📝 Fixed Query:');
                console.log(result.fixed);

                // Get suggestions
                const suggestions = fixer.suggestAlternative(query);
                if (suggestions.length > 0) {
                    console.log('\n💡 Alternative Queries:');
                    suggestions.forEach(s => {
                        console.log(`\n  ${s.purpose}:`);
                        console.log(`  ${s.query}`);
                        if (s.note) {
                            console.log(`  Note: ${s.note}`);
                        }
                    });
                }
                break;
            }

            case 'suggest': {
                if (args.length < 2) {
                    console.error('Error: Query or description required');
                    process.exit(1);
                }

                const input = args[1];
                const suggestions = fixer.suggestAlternative(input);

                if (suggestions.length === 0) {
                    // Provide generic suggestions
                    console.log('\n📚 Common Metadata Queries:');
                    console.log('\n1. List all custom fields:');
                    console.log("   SELECT Id, DeveloperName, QualifiedApiName, DataType FROM FieldDefinition WHERE DeveloperName LIKE '%__c'");

                    console.log('\n2. Find fields by object:');
                    console.log("   SELECT Id, DeveloperName, DataType, Label FROM FieldDefinition WHERE EntityDefinitionId = 'Account'");

                    console.log('\n3. Recent setup changes:');
                    console.log("   SELECT Id, Action, Display, CreatedDate FROM SetupAuditTrail WHERE CreatedDate = TODAY");

                    console.log('\n4. List all custom objects:');
                    console.log("   SELECT Id, DeveloperName, Label FROM EntityDefinition WHERE QualifiedApiName LIKE '%__c'");
                } else {
                    console.log('\n💡 Suggested Queries:');
                    suggestions.forEach(s => {
                        console.log(`\n${s.purpose}:`);
                        console.log(s.query);
                        if (s.note) {
                            console.log(`Note: ${s.note}`);
                        }
                    });
                }
                break;
            }

            case 'discover': {
                console.log('\n🔍 Discovering available metadata objects...\n');
                const { available, unavailable } = await fixer.discoverMetadataObjects();

                if (available.length > 0) {
                    console.log('✅ Available:');
                    available.forEach(obj => console.log(`  • ${obj}`));
                }

                if (unavailable.length > 0) {
                    console.log('\n❌ Not Available:');
                    unavailable.forEach(obj => console.log(`  • ${obj}`));
                }
                break;
            }

            case 'execute': {
                if (args.length < 2) {
                    console.error('Error: Query required');
                    process.exit(1);
                }

                let query = args[1];
                const shouldFix = args.includes('--fix');

                if (shouldFix) {
                    const fixResult = fixer.fixQuery(query);
                    if (fixResult.fixes.length > 0) {
                        console.log('\n🔧 Fixed query issues:');
                        fixResult.fixes.forEach(fix => console.log(`  • ${fix}`));
                        query = fixResult.fixed;
                    }
                }

                console.log('\n⚡ Executing query:');
                console.log(query);

                const result = await fixer.executeQuery(query);

                if (result.success) {
                    console.log(`\n✅ Success! Found ${result.totalSize} records`);
                    if (result.records.length > 0) {
                        console.log('\nRecords:');
                        console.log(JSON.stringify(result.records, null, 2));
                    }
                } else {
                    console.error(`\n❌ Query failed: ${result.error}`);

                    // Try to fix and re-execute
                    if (!shouldFix) {
                        console.log('\n🔧 Attempting automatic fix...');
                        const fixResult = fixer.fixQuery(query);
                        if (fixResult.fixes.length > 0) {
                            console.log('Fixes applied:');
                            fixResult.fixes.forEach(fix => console.log(`  • ${fix}`));

                            const retryResult = await fixer.executeQuery(fixResult.fixed);
                            if (retryResult.success) {
                                console.log(`\n✅ Fixed query succeeded! Found ${retryResult.totalSize} records`);
                                if (retryResult.records.length > 0) {
                                    console.log('\nRecords:');
                                    console.log(JSON.stringify(retryResult.records, null, 2));
                                }
                            }
                        }
                    }
                }
                break;
            }

            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Export for use as module
module.exports = MetadataQueryFixer;

// Run CLI if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}