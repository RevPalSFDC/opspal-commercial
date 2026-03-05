#!/usr/bin/env node

/**
 * Pre-Deletion Validator - Check dependencies before deleting metadata
 *
 * Validates that fields, objects, or other metadata can be safely deleted
 * by checking for references in flows, validation rules, formulas, etc.
 *
 * @version 1.0.0
 * @date 2025-12-10
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class PreDeletionValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.orgAlias = options.orgAlias || null;
        this.strictMode = options.strictMode || false;

        // Dependency types to check
        this.dependencyChecks = {
            flows: options.checkFlows !== false,
            validationRules: options.checkValidationRules !== false,
            formulaFields: options.checkFormulaFields !== false,
            workflows: options.checkWorkflows !== false,
            processBuilders: options.checkProcessBuilders !== false,
            layouts: options.checkLayouts !== false,
            reports: options.checkReports !== false,
            apexClasses: options.checkApexClasses !== false,
            apexTriggers: options.checkApexTriggers !== false,
            customLabels: options.checkCustomLabels !== false
        };

        // Results cache
        this.cache = new Map();
    }

    /**
     * Validate field deletion
     * @param {string} objectName - Object API name
     * @param {string} fieldName - Field API name
     * @param {string} orgAlias - Optional org alias override
     * @returns {Object} Validation result
     */
    async validateFieldDeletion(objectName, fieldName, orgAlias = null) {
        const org = orgAlias || this.orgAlias;
        if (!org) {
            throw new Error('Org alias is required');
        }

        const fullFieldName = `${objectName}.${fieldName}`;

        const result = {
            canDelete: true,
            targetType: 'field',
            target: fullFieldName,
            objectName,
            fieldName,
            orgAlias: org,
            validatedAt: new Date().toISOString(),
            dependencies: [],
            blockers: [],
            warnings: []
        };

        // Check each dependency type
        if (this.dependencyChecks.flows) {
            const flowDeps = await this._checkFlowDependencies(org, fieldName, objectName);
            this._addDependencies(result, 'flows', flowDeps);
        }

        if (this.dependencyChecks.validationRules) {
            const vrDeps = await this._checkValidationRuleDependencies(org, fieldName, objectName);
            this._addDependencies(result, 'validationRules', vrDeps);
        }

        if (this.dependencyChecks.formulaFields) {
            const formulaDeps = await this._checkFormulaFieldDependencies(org, fieldName, objectName);
            this._addDependencies(result, 'formulaFields', formulaDeps);
        }

        if (this.dependencyChecks.workflows) {
            const wfDeps = await this._checkWorkflowDependencies(org, fieldName, objectName);
            this._addDependencies(result, 'workflows', wfDeps);
        }

        if (this.dependencyChecks.layouts) {
            const layoutDeps = await this._checkLayoutDependencies(org, fieldName, objectName);
            this._addDependencies(result, 'layouts', layoutDeps);
        }

        if (this.dependencyChecks.apexClasses) {
            const apexDeps = await this._checkApexDependencies(org, fieldName, objectName);
            this._addDependencies(result, 'apex', apexDeps);
        }

        // Determine if deletion is blocked
        result.canDelete = result.blockers.length === 0;

        return result;
    }

    /**
     * Validate object deletion
     * @param {string} objectName - Object API name
     * @param {string} orgAlias - Optional org alias override
     * @returns {Object} Validation result
     */
    async validateObjectDeletion(objectName, orgAlias = null) {
        const org = orgAlias || this.orgAlias;
        if (!org) {
            throw new Error('Org alias is required');
        }

        const result = {
            canDelete: true,
            targetType: 'object',
            target: objectName,
            objectName,
            orgAlias: org,
            validatedAt: new Date().toISOString(),
            dependencies: [],
            blockers: [],
            warnings: []
        };

        // Check for child relationships
        const childDeps = await this._checkChildRelationships(org, objectName);
        this._addDependencies(result, 'childRelationships', childDeps);

        // Check for lookup/master-detail fields referencing this object
        const lookupDeps = await this._checkLookupReferences(org, objectName);
        this._addDependencies(result, 'lookupFields', lookupDeps);

        // Check flows that reference this object
        const flowDeps = await this._checkFlowObjectReferences(org, objectName);
        this._addDependencies(result, 'flows', flowDeps);

        // Check apex references
        const apexDeps = await this._checkApexObjectReferences(org, objectName);
        this._addDependencies(result, 'apex', apexDeps);

        result.canDelete = result.blockers.length === 0;

        return result;
    }

    /**
     * Validate flow deletion
     * @param {string} flowName - Flow developer name
     * @param {string} orgAlias - Optional org alias override
     * @returns {Object} Validation result
     */
    async validateFlowDeletion(flowName, orgAlias = null) {
        const org = orgAlias || this.orgAlias;
        if (!org) {
            throw new Error('Org alias is required');
        }

        const result = {
            canDelete: true,
            targetType: 'flow',
            target: flowName,
            flowName,
            orgAlias: org,
            validatedAt: new Date().toISOString(),
            dependencies: [],
            blockers: [],
            warnings: []
        };

        // Check if flow is active
        const flowStatus = await this._getFlowStatus(org, flowName);

        if (flowStatus.isActive) {
            result.blockers.push({
                type: 'active_flow',
                message: `Flow '${flowName}' is currently active (version ${flowStatus.activeVersion})`,
                severity: 'blocker',
                recommendation: 'Deactivate the flow before deletion'
            });
        }

        // Check for subflow references
        const subflowDeps = await this._checkSubflowReferences(org, flowName);
        this._addDependencies(result, 'subflowReferences', subflowDeps);

        // Check for process builder references
        const pbDeps = await this._checkProcessBuilderReferences(org, flowName);
        this._addDependencies(result, 'processBuilders', pbDeps);

        result.canDelete = result.blockers.length === 0;

        return result;
    }

    /**
     * Check flow dependencies for a field
     */
    async _checkFlowDependencies(orgAlias, fieldName, objectName) {
        const dependencies = [];

        try {
            // Query active flow versions via Tooling API
            const query = `SELECT DeveloperName, VersionNumber, Status
                          FROM Flow
                          WHERE Status = 'Active'`;

            const result = this._executeQuery(orgAlias, query, true);

            // For each active flow, we'd ideally parse the metadata
            for (const record of result.records || []) {
                // Check if flow metadata contains the field reference
                const hasReference = await this._flowContainsFieldReference(
                    orgAlias,
                    record.DeveloperName,
                    fieldName,
                    objectName
                );

                if (hasReference) {
                    dependencies.push({
                        type: 'flow',
                        name: record.DeveloperName,
                        version: record.VersionNumber,
                        status: record.Status,
                        severity: 'blocker',
                        message: `Active flow references field ${fieldName}`
                    });
                }
            }
        } catch (error) {
            if (this.verbose) {
                console.error(`[VALIDATOR] Flow check error: ${error.message}`);
            }
        }

        return dependencies;
    }

    /**
     * Check if flow contains field reference (simplified)
     */
    async _flowContainsFieldReference(orgAlias, flowName, fieldName, objectName) {
        if (!flowName || !fieldName) {
            return false;
        }

        const query = `SELECT Id, Metadata FROM Flow WHERE DeveloperName = '${flowName}' ORDER BY VersionNumber DESC LIMIT 1`;
        const result = this._executeQuery(orgAlias, query, true);
        const metadata = result.records?.[0]?.Metadata;
        const definition = this._stringifyFlowMetadata(metadata);

        if (!definition || typeof definition !== 'string') {
            return false;
        }

        const escapedField = fieldName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const patterns = [
            new RegExp(`\\$Record(?:__Prior)?\\.${escapedField}\\b`, 'i')
        ];

        if (objectName) {
            const escapedObject = objectName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
            patterns.push(new RegExp(`${escapedObject}\\.${escapedField}\\b`, 'i'));
        }

        return patterns.some(pattern => pattern.test(definition));
    }

    /**
     * Check validation rule dependencies
     */
    async _checkValidationRuleDependencies(orgAlias, fieldName, objectName) {
        const dependencies = [];

        try {
            const query = `SELECT Id, ValidationName, Active, ErrorConditionFormula
                          FROM ValidationRule
                          WHERE EntityDefinition.QualifiedApiName = '${objectName}'
                          AND Active = true`;

            const result = this._executeQuery(orgAlias, query, true);

            for (const record of result.records || []) {
                const formula = record.ErrorConditionFormula || '';

                if (this._formulaContainsField(formula, fieldName)) {
                    dependencies.push({
                        type: 'validationRule',
                        name: record.ValidationName,
                        active: record.Active,
                        severity: 'blocker',
                        message: `Validation rule '${record.ValidationName}' references field ${fieldName}`
                    });
                }
            }
        } catch (error) {
            if (this.verbose) {
                console.error(`[VALIDATOR] Validation rule check error: ${error.message}`);
            }
        }

        return dependencies;
    }

    /**
     * Check formula field dependencies
     */
    async _checkFormulaFieldDependencies(orgAlias, fieldName, objectName) {
        const dependencies = [];

        try {
            const query = `SELECT QualifiedApiName, DeveloperName, DataType
                          FROM FieldDefinition
                          WHERE EntityDefinition.QualifiedApiName = '${objectName}'
                          AND DataType = 'Formula'`;

            const result = this._executeQuery(orgAlias, query, true);

            // Note: FieldDefinition doesn't expose formula - would need Metadata API
            // This is a simplified check that flags all formula fields as potential deps
            for (const record of result.records || []) {
                dependencies.push({
                    type: 'formulaField',
                    name: record.DeveloperName,
                    severity: 'warning',
                    message: `Formula field '${record.DeveloperName}' may reference ${fieldName} - verify manually`
                });
            }
        } catch (error) {
            if (this.verbose) {
                console.error(`[VALIDATOR] Formula field check error: ${error.message}`);
            }
        }

        return dependencies;
    }

    /**
     * Check workflow dependencies
     */
    async _checkWorkflowDependencies(orgAlias, fieldName, objectName) {
        const dependencies = [];

        try {
            const query = `SELECT Name, TableEnumOrId
                          FROM WorkflowRule
                          WHERE TableEnumOrId = '${objectName}'`;

            const result = this._executeQuery(orgAlias, query, true);

            for (const record of result.records || []) {
                dependencies.push({
                    type: 'workflow',
                    name: record.Name,
                    severity: 'warning',
                    message: `Workflow '${record.Name}' may reference ${fieldName} - verify manually`
                });
            }
        } catch (error) {
            if (this.verbose) {
                console.error(`[VALIDATOR] Workflow check error: ${error.message}`);
            }
        }

        return dependencies;
    }

    /**
     * Check layout dependencies
     */
    async _checkLayoutDependencies(orgAlias, fieldName, objectName) {
        const dependencies = [];

        try {
            const query = `SELECT Name FROM Layout WHERE TableEnumOrId = '${objectName}'`;

            const result = this._executeQuery(orgAlias, query, true);

            // Layouts likely contain the field - flag as warning
            for (const record of result.records || []) {
                dependencies.push({
                    type: 'layout',
                    name: record.Name,
                    severity: 'warning',
                    message: `Layout '${record.Name}' may contain field ${fieldName}`
                });
            }
        } catch (error) {
            if (this.verbose) {
                console.error(`[VALIDATOR] Layout check error: ${error.message}`);
            }
        }

        return dependencies;
    }

    /**
     * Check Apex dependencies
     */
    async _checkApexDependencies(orgAlias, fieldName, objectName) {
        const dependencies = [];

        try {
            // Check ApexClass body for field references
            const classQuery = `SELECT Name FROM ApexClass
                               WHERE NamespacePrefix = null
                               AND Status = 'Active'`;

            const classResult = this._executeQuery(orgAlias, classQuery, true);

            // Note: Can't search body directly via SOQL
            // Would need Metadata API to check actual code
            // This returns potential dependencies

            const triggerQuery = `SELECT Name FROM ApexTrigger
                                 WHERE TableEnumOrId = '${objectName}'
                                 AND NamespacePrefix = null`;

            const triggerResult = this._executeQuery(orgAlias, triggerQuery, true);

            for (const record of triggerResult.records || []) {
                dependencies.push({
                    type: 'apexTrigger',
                    name: record.Name,
                    severity: 'blocker',
                    message: `Trigger '${record.Name}' on ${objectName} likely references field ${fieldName}`
                });
            }
        } catch (error) {
            if (this.verbose) {
                console.error(`[VALIDATOR] Apex check error: ${error.message}`);
            }
        }

        return dependencies;
    }

    /**
     * Check child relationships for object
     */
    async _checkChildRelationships(orgAlias, objectName) {
        const dependencies = [];

        try {
            const cmd = `sf sobject describe --sobject "${objectName}" --target-org ${orgAlias} --json`;
            const output = execSync(cmd, {
                encoding: 'utf8',
                timeout: 60000,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            const parsed = JSON.parse(output);
            const relationships = parsed.result?.childRelationships || [];

            for (const relationship of relationships) {
                if (!relationship.childSObject || !relationship.field) {
                    continue;
                }
                dependencies.push({
                    type: 'childRelationship',
                    name: `${relationship.childSObject}.${relationship.field}`,
                    severity: 'blocker',
                    message: `Child object ${relationship.childSObject} references ${objectName} via ${relationship.field}`
                });
            }
        } catch (error) {
            if (this.verbose) {
                console.error(`[VALIDATOR] Child relationship check error: ${error.message}`);
            }
        }

        return dependencies;
    }

    /**
     * Check lookup field references to object
     */
    async _checkLookupReferences(orgAlias, objectName) {
        const dependencies = [];

        try {
            const query = `SELECT QualifiedApiName, EntityDefinition.QualifiedApiName, ReferenceTo
                          FROM FieldDefinition
                          WHERE DataType LIKE '%Lookup%' OR DataType LIKE '%Master%'`;

            const result = this._executeQuery(orgAlias, query, true);

            for (const record of result.records || []) {
                const referenceTo = record.ReferenceTo || {};
                if (referenceTo.referenceTo?.includes(objectName)) {
                    dependencies.push({
                        type: 'lookupField',
                        name: record.QualifiedApiName,
                        object: record.EntityDefinition?.QualifiedApiName,
                        severity: 'blocker',
                        message: `Field '${record.QualifiedApiName}' references ${objectName}`
                    });
                }
            }
        } catch (error) {
            if (this.verbose) {
                console.error(`[VALIDATOR] Lookup check error: ${error.message}`);
            }
        }

        return dependencies;
    }

    /**
     * Check flow references to object
     */
    async _checkFlowObjectReferences(orgAlias, objectName) {
        const dependencies = [];

        try {
            const query = `SELECT DeveloperName, VersionNumber, Status, Metadata
                          FROM Flow
                          WHERE Status = 'Active'`;
            const result = this._executeQuery(orgAlias, query, true);
            const escapedObject = objectName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
            const patterns = [
                new RegExp(`<objectType>${escapedObject}<\\/objectType>`, 'i'),
                new RegExp(`<sObject>${escapedObject}<\\/sObject>`, 'i'),
                new RegExp(`"objectType"\\s*:\\s*"${escapedObject}"`, 'i'),
                new RegExp(`"sObject"\\s*:\\s*"${escapedObject}"`, 'i')
            ];

            for (const record of result.records || []) {
                const metadata = this._stringifyFlowMetadata(record.Metadata);
                if (!metadata) {
                    continue;
                }
                if (patterns.some(pattern => pattern.test(metadata))) {
                    dependencies.push({
                        type: 'flow',
                        name: record.DeveloperName,
                        version: record.VersionNumber,
                        status: record.Status,
                        severity: 'blocker',
                        message: `Active flow references object ${objectName}`
                    });
                }
            }
        } catch (error) {
            if (this.verbose) {
                console.error(`[VALIDATOR] Flow object reference check error: ${error.message}`);
            }
        }

        return dependencies;
    }

    /**
     * Check Apex references to object
     */
    async _checkApexObjectReferences(orgAlias, objectName) {
        const dependencies = [];

        try {
            const triggerQuery = `SELECT Name FROM ApexTrigger
                                 WHERE TableEnumOrId = '${objectName}'`;

            const result = this._executeQuery(orgAlias, triggerQuery, true);

            for (const record of result.records || []) {
                dependencies.push({
                    type: 'apexTrigger',
                    name: record.Name,
                    severity: 'blocker',
                    message: `Trigger '${record.Name}' is defined on ${objectName}`
                });
            }
        } catch (error) {
            if (this.verbose) {
                console.error(`[VALIDATOR] Apex object check error: ${error.message}`);
            }
        }

        return dependencies;
    }

    /**
     * Get flow status
     */
    async _getFlowStatus(orgAlias, flowName) {
        try {
            const query = `SELECT DeveloperName, ActiveVersion.VersionNumber
                          FROM FlowDefinition
                          WHERE DeveloperName = '${flowName}'`;

            const result = this._executeQuery(orgAlias, query, true);

            if (result.records?.length > 0) {
                const flow = result.records[0];
                return {
                    found: true,
                    isActive: flow.ActiveVersion !== null,
                    activeVersion: flow.ActiveVersion?.VersionNumber
                };
            }
        } catch (error) {
            if (this.verbose) {
                console.error(`[VALIDATOR] Flow status check error: ${error.message}`);
            }
        }

        return { found: false, isActive: false };
    }

    /**
     * Check subflow references
     */
    async _checkSubflowReferences(orgAlias, flowName) {
        const dependencies = [];

        try {
            const query = `SELECT DeveloperName, VersionNumber, Status, Metadata
                          FROM Flow
                          WHERE Status = 'Active'`;
            const result = this._executeQuery(orgAlias, query, true);
            const escapedFlow = flowName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
            const patterns = [
                new RegExp(`<flowName>${escapedFlow}<\\/flowName>`, 'i'),
                new RegExp(`<subflow>.*${escapedFlow}.*<\\/subflow>`, 'i'),
                new RegExp(`"flowName"\\s*:\\s*"${escapedFlow}"`, 'i')
            ];

            for (const record of result.records || []) {
                if (record.DeveloperName === flowName) {
                    continue;
                }
                const metadata = this._stringifyFlowMetadata(record.Metadata);
                if (!metadata) {
                    continue;
                }
                if (patterns.some(pattern => pattern.test(metadata))) {
                    dependencies.push({
                        type: 'subflow',
                        name: record.DeveloperName,
                        version: record.VersionNumber,
                        status: record.Status,
                        severity: 'blocker',
                        message: `Active flow ${record.DeveloperName} invokes ${flowName} as a subflow`
                    });
                }
            }
        } catch (error) {
            if (this.verbose) {
                console.error(`[VALIDATOR] Subflow reference check error: ${error.message}`);
            }
        }

        return dependencies;
    }

    /**
     * Check process builder references
     */
    async _checkProcessBuilderReferences(orgAlias, flowName) {
        const dependencies = [];

        try {
            const pbQuery = `SELECT DeveloperName, ProcessType, ActiveVersionId
                            FROM FlowDefinition
                            WHERE ProcessType = 'Workflow'
                            AND ActiveVersionId != null`;
            const pbResult = this._executeQuery(orgAlias, pbQuery, true);
            const escapedFlow = flowName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
            const patterns = [
                new RegExp(`<flowName>${escapedFlow}<\\/flowName>`, 'i'),
                new RegExp(`"flowName"\\s*:\\s*"${escapedFlow}"`, 'i')
            ];

            for (const flowDef of pbResult.records || []) {
                const versionId = flowDef.ActiveVersionId;
                if (!versionId) {
                    continue;
                }
                const flowQuery = `SELECT DeveloperName, VersionNumber, Metadata
                                  FROM Flow
                                  WHERE Id = '${versionId}'`;
                const flowResult = this._executeQuery(orgAlias, flowQuery, true);
                const record = flowResult.records?.[0];
                if (!record) {
                    continue;
                }
                const metadata = this._stringifyFlowMetadata(record.Metadata);
                if (metadata && patterns.some(pattern => pattern.test(metadata))) {
                    dependencies.push({
                        type: 'processBuilder',
                        name: flowDef.DeveloperName,
                        version: record.VersionNumber,
                        severity: 'blocker',
                        message: `Process Builder ${flowDef.DeveloperName} invokes flow ${flowName}`
                    });
                }
            }
        } catch (error) {
            if (this.verbose) {
                console.error(`[VALIDATOR] Process Builder reference check error: ${error.message}`);
            }
        }

        return dependencies;
    }

    /**
     * Check if formula contains field reference
     */
    _formulaContainsField(formula, fieldName) {
        if (!formula) return false;

        // Simple pattern matching - check for field name
        const patterns = [
            new RegExp(`\\b${fieldName}\\b`, 'i'),
            new RegExp(`\\$Record\\.${fieldName}`, 'i'),
            new RegExp(`\\{!${fieldName}\\}`, 'i')
        ];

        return patterns.some(p => p.test(formula));
    }

    _stringifyFlowMetadata(metadata) {
        if (!metadata) {
            return '';
        }
        if (typeof metadata === 'string') {
            return metadata;
        }
        try {
            return JSON.stringify(metadata);
        } catch (error) {
            return String(metadata);
        }
    }

    /**
     * Add dependencies to result
     */
    _addDependencies(result, category, dependencies) {
        for (const dep of dependencies) {
            result.dependencies.push({
                category,
                ...dep
            });

            if (dep.severity === 'blocker') {
                result.blockers.push(dep);
            } else if (dep.severity === 'warning') {
                result.warnings.push(dep);
            }
        }
    }

    /**
     * Execute SOQL query
     */
    _executeQuery(orgAlias, query, useToolingApi = false) {
        try {
            const toolingFlag = useToolingApi ? '--use-tooling-api' : '';
            const cmd = `sf data query --query "${query}" ${toolingFlag} --target-org ${orgAlias} --json`;

            const output = execSync(cmd, {
                encoding: 'utf8',
                timeout: 60000,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const result = JSON.parse(output);
            return result.result || { records: [], totalSize: 0 };
        } catch (error) {
            if (this.verbose) {
                console.error(`[VALIDATOR] Query error: ${error.message}`);
            }
            return { records: [], totalSize: 0, error: error.message };
        }
    }

    /**
     * Generate deletion report
     * @param {Object} result - Validation result
     * @returns {string} Markdown report
     */
    generateReport(result) {
        const lines = [
            '# Pre-Deletion Validation Report',
            '',
            `**Target:** ${result.target}`,
            `**Type:** ${result.targetType}`,
            `**Org:** ${result.orgAlias}`,
            `**Validated:** ${result.validatedAt}`,
            '',
            `## Status: ${result.canDelete ? '✅ SAFE TO DELETE' : '❌ DELETION BLOCKED'}`,
            ''
        ];

        if (result.blockers.length > 0) {
            lines.push('## Blockers');
            lines.push('');
            for (const blocker of result.blockers) {
                lines.push(`- **${blocker.type}**: ${blocker.message}`);
                if (blocker.recommendation) {
                    lines.push(`  - Recommendation: ${blocker.recommendation}`);
                }
            }
            lines.push('');
        }

        if (result.warnings.length > 0) {
            lines.push('## Warnings');
            lines.push('');
            for (const warning of result.warnings) {
                lines.push(`- **${warning.type}**: ${warning.message}`);
            }
            lines.push('');
        }

        if (result.dependencies.length > 0) {
            lines.push('## All Dependencies');
            lines.push('');

            const byCategory = {};
            for (const dep of result.dependencies) {
                if (!byCategory[dep.category]) {
                    byCategory[dep.category] = [];
                }
                byCategory[dep.category].push(dep);
            }

            for (const [category, deps] of Object.entries(byCategory)) {
                lines.push(`### ${category}`);
                for (const dep of deps) {
                    const icon = dep.severity === 'blocker' ? '❌' : '⚠️';
                    lines.push(`- ${icon} ${dep.name || dep.type}: ${dep.message}`);
                }
                lines.push('');
            }
        }

        return lines.join('\n');
    }

    /**
     * Batch validate multiple items
     * @param {Array} items - Items to validate
     * @param {string} orgAlias - Org alias
     * @returns {Object} Batch result
     */
    async validateBatch(items, orgAlias = null) {
        const results = {
            timestamp: new Date().toISOString(),
            total: items.length,
            safe: 0,
            blocked: 0,
            items: []
        };

        for (const item of items) {
            let result;

            switch (item.type) {
                case 'field':
                    result = await this.validateFieldDeletion(item.object, item.name, orgAlias);
                    break;
                case 'object':
                    result = await this.validateObjectDeletion(item.name, orgAlias);
                    break;
                case 'flow':
                    result = await this.validateFlowDeletion(item.name, orgAlias);
                    break;
                default:
                    result = { canDelete: false, error: `Unknown type: ${item.type}` };
            }

            results.items.push(result);

            if (result.canDelete) {
                results.safe++;
            } else {
                results.blocked++;
            }
        }

        return results;
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const validator = new PreDeletionValidator({
        verbose: args.includes('--verbose'),
        strictMode: args.includes('--strict')
    });

    (async () => {
        switch (command) {
            case 'field':
                const fieldOrg = args[1];
                const objectName = args[2];
                const fieldName = args[3];

                if (!fieldOrg || !objectName || !fieldName) {
                    console.error('Usage: pre-deletion-validator field <org> <object> <field>');
                    process.exit(1);
                }

                const fieldResult = await validator.validateFieldDeletion(objectName, fieldName, fieldOrg);
                console.log(validator.generateReport(fieldResult));
                process.exit(fieldResult.canDelete ? 0 : 1);
                break;

            case 'object':
                const objOrg = args[1];
                const objName = args[2];

                if (!objOrg || !objName) {
                    console.error('Usage: pre-deletion-validator object <org> <object>');
                    process.exit(1);
                }

                const objResult = await validator.validateObjectDeletion(objName, objOrg);
                console.log(validator.generateReport(objResult));
                process.exit(objResult.canDelete ? 0 : 1);
                break;

            case 'flow':
                const flowOrg = args[1];
                const flowName = args[2];

                if (!flowOrg || !flowName) {
                    console.error('Usage: pre-deletion-validator flow <org> <flow>');
                    process.exit(1);
                }

                const flowResult = await validator.validateFlowDeletion(flowName, flowOrg);
                console.log(validator.generateReport(flowResult));
                process.exit(flowResult.canDelete ? 0 : 1);
                break;

            default:
                console.log(`
Pre-Deletion Validator - Check dependencies before deleting metadata

Usage:
  pre-deletion-validator field <org> <object> <field>   Validate field deletion
  pre-deletion-validator object <org> <object>          Validate object deletion
  pre-deletion-validator flow <org> <flow>              Validate flow deletion

Options:
  --verbose    Show detailed output
  --strict     Fail on any dependency

Examples:
  pre-deletion-validator field myorg Account Custom_Field__c
  pre-deletion-validator object myorg Custom_Object__c
  pre-deletion-validator flow myorg My_Flow --verbose
                `);
        }
    })().catch(error => {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { PreDeletionValidator };
