#!/usr/bin/env node

/**
 * Smart Query Validator
 *
 * Purpose: Wrapper around sf data query that validates SOQL before execution
 *
 * Features:
 * - Pre-validates field names against metadata cache
 * - Fuzzy matching with suggestions for typos
 * - Helpful error messages
 * - Auto-correction for common mistakes
 * - Falls back to discovery if cache miss
 *
 * Usage:
 *   node smart-query-validator.js <org-alias> "<soql-query>"
 *   node smart-query-validator.js wedgewood-production "SELECT Id, FirstName FROM Contact"
 *
 * Or use as a library:
 *   const { validateAndExecute } = require('./smart-query-validator');
 *   const result = await validateAndExecute(orgAlias, soql);
 */

const { execSync } = require('child_process');
const OrgMetadataCache = require('./org-metadata-cache');

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

/**
 * Non-Existent Objects (LLM Hallucinations)
 * These are objects that LLMs commonly attempt to query, but don't actually exist in Salesforce.
 * They are typically inferred from XML node names in Profile/PermissionSet metadata.
 *
 * Root Cause: LLMs see profile.recordTypeVisibilities in XML parsing code and incorrectly
 * infer that "RecordTypeVisibility" must be a queryable object.
 *
 * Reference: See docs/LLM_COMMON_MISTAKES.md for correct approaches
 */
const NON_EXISTENT_OBJECTS = {
    'RecordTypeVisibility': {
        correctApproach: 'Use Metadata API to retrieve Profile XML and parse <recordTypeVisibilities> nodes',
        example: 'const profiles = await retriever.getProfiles(); // Then parse recordTypeVisibilities',
        docs: 'docs/LLM_COMMON_MISTAKES.md#recordtypevisibility'
    },
    'ApplicationVisibility': {
        correctApproach: 'Use Metadata API to retrieve Profile XML and parse <applicationVisibilities> nodes',
        example: 'const profiles = await retriever.getProfiles(); // Then parse applicationVisibilities',
        docs: 'docs/LLM_COMMON_MISTAKES.md#applicationvisibility'
    },
    'FieldPermission': {
        correctApproach: 'Use Metadata API to retrieve Profile/PermissionSet XML and parse <fieldPermissions> nodes',
        example: 'const profiles = await retriever.getProfiles(); // Then parse fieldPermissions',
        docs: 'docs/LLM_COMMON_MISTAKES.md#fieldpermission'
    },
    'ObjectPermission': {
        correctApproach: 'Use Metadata API to retrieve Profile/PermissionSet XML and parse <objectPermissions> nodes',
        example: 'const profiles = await retriever.getProfiles(); // Then parse objectPermissions',
        docs: 'docs/LLM_COMMON_MISTAKES.md#objectpermission'
    },
    'TabVisibility': {
        correctApproach: 'Use Metadata API to retrieve Profile XML and parse <tabSettings> nodes',
        example: 'const profiles = await retriever.getProfiles(); // Then parse tabSettings',
        docs: 'docs/LLM_COMMON_MISTAKES.md#tabvisibility'
    }
};

class SmartQueryValidator {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.cache = new OrgMetadataCache(orgAlias);
    }

    /**
     * Validate and execute SOQL query
     */
    async validateAndExecute(soql, options = {}) {
        const {
            autoCorrect = true,
            verbose = false
        } = options;

        if (verbose) {
            console.log(`\n🔍 Validating query...`);
        }

        // Parse query
        const parsed = this.parseQuery(soql);
        if (!parsed) {
            throw new Error('Could not parse SOQL query');
        }

        // VALIDATE: Check for commonly hallucinated objects
        if (NON_EXISTENT_OBJECTS[parsed.object]) {
            const objInfo = NON_EXISTENT_OBJECTS[parsed.object];
            throw new Error(
                `❌ BLOCKED: Object '${parsed.object}' does not exist in Salesforce\n\n` +
                `🤖 Common LLM Hallucination Detected:\n` +
                `   LLMs often infer this object exists because they see it as an XML node name\n` +
                `   in Profile/PermissionSet metadata. It is NOT a queryable object.\n\n` +
                `✅ Correct Approach:\n` +
                `   ${objInfo.correctApproach}\n\n` +
                `📝 Example:\n` +
                `   ${objInfo.example}\n\n` +
                `📚 Documentation: .claude-plugins/salesforce-plugin/${objInfo.docs}`
            );
        }

        // AUTO-DETECT if object requires Tooling API
        const requiresToolingApi = TOOLING_API_OBJECTS.includes(parsed.object);
        const useToolingApi = options.useToolingApi !== undefined ? options.useToolingApi : requiresToolingApi;

        // Notify user if auto-detection occurred
        if (requiresToolingApi && options.useToolingApi === undefined) {
            console.log(`🔧 Auto-detected Tooling API object: ${parsed.object}`);
            console.log(`   Automatically adding --use-tooling-api flag\n`);
        }

        // Load cache
        let cacheData;
        try {
            cacheData = this.cache.loadCache();
        } catch (error) {
            console.warn(`⚠️  Metadata cache not found. Query will execute without validation.`);
            console.warn(`   Run: node org-metadata-cache.js init ${this.orgAlias}\n`);
            return this.executeQuery(soql, useToolingApi);
        }

        // Validate object
        if (!cacheData.objects[parsed.object]) {
            const suggestion = this.cache.suggestObject(parsed.object);
            throw new Error(
                `Object '${parsed.object}' does not exist.\n` +
                `Did you mean: ${suggestion}?`
            );
        }

        // Validate fields
        const errors = [];
        const corrections = [];
        const validFields = [];

        for (const field of parsed.fields) {
            // Skip special cases
            if (field === '*' || field.includes('(') || field.includes(' AS ')) {
                validFields.push(field);
                continue;
            }

            // Handle relationship fields (e.g., Account.Name)
            const parts = field.split('.');
            let currentObj = parsed.object;
            let valid = true;

            for (let i = 0; i < parts.length; i++) {
                const fieldPart = parts[i];

                // Last part is the actual field, earlier parts are relationships
                if (i === parts.length - 1) {
                    if (!cacheData.objects[currentObj].fields[fieldPart]) {
                        const suggestion = this.cache.suggestField(currentObj, fieldPart);

                        if (autoCorrect) {
                            // Check if suggestion is very close match
                            const topSuggestion = suggestion.split(',')[0].trim();
                            const similarity = this.calculateSimilarity(fieldPart, topSuggestion);

                            if (similarity > 0.8) {
                                corrections.push({
                                    original: field,
                                    corrected: parts.slice(0, i).concat(topSuggestion).join('.'),
                                    reason: `Auto-corrected '${fieldPart}' to '${topSuggestion}'`
                                });
                                validFields.push(parts.slice(0, i).concat(topSuggestion).join('.'));
                                valid = false;
                                break;
                            }
                        }

                        errors.push({
                            field: field,
                            object: currentObj,
                            message: `Field '${fieldPart}' does not exist on ${currentObj}`,
                            suggestion: suggestion
                        });
                        valid = false;
                        break;
                    }
                } else {
                    // This is a relationship field
                    const fieldData = cacheData.objects[currentObj].fields[fieldPart];
                    if (!fieldData) {
                        errors.push({
                            field: field,
                            object: currentObj,
                            message: `Relationship field '${fieldPart}' does not exist on ${currentObj}`,
                            suggestion: this.cache.suggestField(currentObj, fieldPart)
                        });
                        valid = false;
                        break;
                    }

                    // Get the related object
                    if (fieldData.referenceTo && fieldData.referenceTo.length > 0) {
                        currentObj = fieldData.referenceTo[0];
                    } else {
                        errors.push({
                            field: field,
                            object: currentObj,
                            message: `Field '${fieldPart}' is not a relationship field`,
                            suggestion: null
                        });
                        valid = false;
                        break;
                    }
                }
            }

            if (valid) {
                validFields.push(field);
            }
        }

        // Report results
        if (errors.length > 0 && corrections.length === 0) {
            console.error(`\n❌ Query validation failed:\n`);
            errors.forEach(err => {
                console.error(`   ${err.message}`);
                if (err.suggestion) {
                    console.error(`   Suggestion: ${err.suggestion}\n`);
                }
            });
            throw new Error('Query validation failed');
        }

        if (corrections.length > 0) {
            console.log(`\n✏️  Auto-corrected ${corrections.length} field(s):\n`);
            corrections.forEach(corr => {
                console.log(`   ${corr.original} → ${corr.corrected}`);
                console.log(`   (${corr.reason})\n`);
            });

            // Build corrected query
            const correctedSoql = `SELECT ${validFields.join(', ')} FROM ${parsed.object}${parsed.remainder}`;
            console.log(`📝 Corrected query:\n   ${correctedSoql}\n`);

            // Ask for confirmation if verbose
            if (verbose) {
                const readline = require('readline').createInterface({
                    input: process.stdin,
                    output: process.stdout
                });

                return new Promise((resolve, reject) => {
                    readline.question('Execute corrected query? (y/n): ', (answer) => {
                        readline.close();
                        if (answer.toLowerCase() === 'y') {
                            resolve(this.executeQuery(correctedSoql, useToolingApi));
                        } else {
                            reject(new Error('Query execution cancelled'));
                        }
                    });
                });
            } else {
                soql = correctedSoql;
            }
        }

        if (verbose) {
            console.log(`✅ Query validated successfully\n`);
        }

        // Execute query
        return this.executeQuery(soql, useToolingApi);
    }

    /**
     * Parse SOQL query
     */
    parseQuery(soql) {
        // Extract SELECT fields
        const selectMatch = soql.match(/SELECT\s+(.*?)\s+FROM\s+(\w+)(.*)/i);
        if (!selectMatch) {
            return null;
        }

        const fieldsPart = selectMatch[1];
        const object = selectMatch[2];
        const remainder = selectMatch[3] || '';

        // Parse fields (handle commas, but not within parentheses)
        const fields = [];
        let current = '';
        let depth = 0;

        for (let char of fieldsPart) {
            if (char === '(') {
                depth++;
            } else if (char === ')') {
                depth--;
            }

            if (char === ',' && depth === 0) {
                fields.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        if (current.trim()) {
            fields.push(current.trim());
        }

        return {
            object,
            fields,
            remainder
        };
    }

    /**
     * Execute query with SF CLI
     */
    executeQuery(soql, useToolingApi = false) {
        const toolingFlag = useToolingApi ? '--use-tooling-api' : '';
        const command = `sf data query --query "${soql}" ${toolingFlag} --json --target-org ${this.orgAlias}`;

        try {
            const result = execSync(command, {
                encoding: 'utf8',
                maxBuffer: 50 * 1024 * 1024,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            return JSON.parse(result);
        } catch (error) {
            // Enhance error message
            console.error(`\n❌ Query execution failed:`);
            console.error(`   ${error.message}\n`);

            if (error.stderr) {
                const stderr = error.stderr.toString();

                // Check if error is due to missing Tooling API flag
                if (stderr.includes("sObject type") && stderr.includes("is not supported")) {
                    // Extract object name from query
                    const parsed = this.parseQuery(soql);
                    if (parsed && TOOLING_API_OBJECTS.includes(parsed.object)) {
                        console.error(`   ⚠️  This object requires Tooling API!`);
                        console.error(`   Object '${parsed.object}' is a metadata object.`);
                        console.error(`   The query should automatically use --use-tooling-api flag.`);
                        console.error(`   If you're calling this directly, add: { useToolingApi: true }\n`);
                    }
                } else if (stderr.includes('No such column')) {
                    console.error(`   This field does not exist. Try running:`);
                    console.error(`   node org-metadata-cache.js query ${this.orgAlias} <object>\n`);
                }
            }

            throw error;
        }
    }

    /**
     * Calculate similarity between two strings (0-1)
     */
    calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;

        if (longer.length === 0) {
            return 1.0;
        }

        const editDistance = this.levenshtein(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    /**
     * Levenshtein distance
     */
    levenshtein(a, b) {
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
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(`
Smart Query Validator
=====================

Usage:
  node smart-query-validator.js <org-alias> "<soql-query>" [options]

Options:
  --tooling-api      Force use of Tooling API (usually auto-detected)
  --no-auto-correct  Disable auto-correction
  --verbose          Verbose output

Examples:
  node smart-query-validator.js wedgewood-production "SELECT Id, FirstName FROM Contact"
  node smart-query-validator.js wedgewood-production "SELECT Id, MasterLabel FROM Flow"
  node smart-query-validator.js wedgewood-production "SELECT Id, Registred__c FROM Contact" --verbose

The validator will:
  ✓ Check if object exists
  ✓ Check if all fields exist
  ✓ Suggest corrections for typos
  ✓ Auto-correct obvious mistakes
  ✓ Auto-detect Tooling API objects (Flow, ApexClass, ValidationRule, etc.)
  ✓ Execute query if valid

Tooling API Auto-Detection:
  The validator automatically detects when querying metadata objects and adds
  the --use-tooling-api flag. This includes ${TOOLING_API_OBJECTS.length}+ objects like:
  • Flow, FlowDefinition, FlowDefinitionView
  • ApexClass, ApexTrigger, ApexComponent
  • ValidationRule, WorkflowRule
  • Layout, Profile, PermissionSet
  • And many more...

  You no longer need to manually specify --tooling-api for these objects!
        `);
        process.exit(1);
    }

    const orgAlias = args[0];
    const soql = args[1];
    const useToolingApi = args.includes('--tooling-api');
    const autoCorrect = !args.includes('--no-auto-correct');
    const verbose = args.includes('--verbose');

    try {
        const validator = new SmartQueryValidator(orgAlias);
        const result = await validator.validateAndExecute(soql, {
            useToolingApi,
            autoCorrect,
            verbose
        });

        if (result && result.result) {
            console.log(`✅ Query executed successfully`);
            console.log(`   Records returned: ${result.result.totalSize}\n`);

            // Pretty print result
            console.log(JSON.stringify(result.result, null, 2));
        }
    } catch (error) {
        console.error(`\n❌ Error: ${error.message}\n`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    SmartQueryValidator,
    TOOLING_API_OBJECTS,
    NON_EXISTENT_OBJECTS,
    validateAndExecute: async (orgAlias, soql, options) => {
        const validator = new SmartQueryValidator(orgAlias);
        return validator.validateAndExecute(soql, options);
    }
};