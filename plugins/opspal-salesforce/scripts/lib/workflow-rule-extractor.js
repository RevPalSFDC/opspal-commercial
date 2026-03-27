#!/usr/bin/env node

/**
 * Workflow Rule Extractor
 *
 * Purpose: Extract and analyze Workflow Rule metadata for automation inventory
 * and conflict detection.
 *
 * Features:
 * - Extracts Workflow Rules via Metadata API
 * - Parses rule criteria and evaluation triggers
 * - Identifies field updates, email alerts, tasks, outbound messages
 * - Detects time-based actions
 * - Checks re-evaluation settings (high loop risk)
 * - Normalizes to UDM format
 *
 * Usage:
 *   const extractor = new WorkflowRuleExtractor(orgAlias);
 *   const rules = await extractor.extractAllWorkflowRules();
 *   const udm = extractor.normalizeToUDM(rule);
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const { safeExecSfCommand } = require('./safe-sf-result-parser');
const { generateReceipt } = require('./execution-receipt');

class WorkflowRuleExtractor {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.cache = new Map();
        this.tempDir = path.join(__dirname, '../../.temp/workflow-extraction');
        this._lastReceipt = null;
        this._branches = [];
    }

    /**
     * Extract all Workflow Rules
     */
    async extractAllWorkflowRules(objectName = null) {
        console.log('  Extracting Workflow Rules...');

        // Get all objects with workflow rules
        const objects = objectName ? [objectName] : await this.getObjectsWithWorkflows();

        if (objects.length === 0) {
            console.log('    No objects with Workflow Rules found');
            return [];
        }

        console.log(`    Found ${objects.length} object(s) with Workflow Rules`);

        // Extract rules for each object
        const allRules = [];
        for (const obj of objects) {
            try {
                const rules = await this.extractWorkflowRulesForObject(obj);
                allRules.push(...rules);
            } catch (error) {
                console.warn(`    Warning: Failed to extract workflow rules for ${obj}: ${error.message}`);
            }
        }

        this._branches.push({
            name: 'WorkflowRule-extraction',
            status: allRules.length > 0 ? 'success' : (objects.length > 0 ? 'partial' : 'success'),
            recordCount: allRules.length
        });

        // Generate receipt from branch results
        const succeeded = {};
        const failed = {};
        for (const b of this._branches) {
            if (b.status === 'success' || b.status === 'partial') {
                succeeded[b.name] = { totalSize: b.recordCount || 0, records: [] };
            } else {
                failed[b.name] = { error: b.error || 'unknown', failureType: b.failureType || 'unknown' };
            }
        }
        const failedCount = Object.keys(failed).length;
        const succeededCount = Object.keys(succeeded).length;
        const status = failedCount === 0 ? 'complete' : (succeededCount > 0 ? 'partial' : 'failed');
        this._lastReceipt = generateReceipt({
            status,
            orgAlias: this.orgAlias,
            totalQueries: this._branches.length,
            succeededCount, failedCount,
            succeeded, failed,
            fallbacks: this._branches.filter(b => b.usedFallback).map(b => ({ name: b.name, note: 'fallback' })),
            durationMs: 0
        }, { helper: 'workflow-rule-extractor@1.0.0' });

        console.log(`    Extracted ${allRules.length} Workflow Rule(s)`);
        return allRules;
    }

    /**
     * Get the last execution receipt (available after extractAllWorkflowRules completes)
     */
    getLastReceipt() {
        return this._lastReceipt || null;
    }

    /**
     * Get objects that have workflow rules
     */
    async getObjectsWithWorkflows() {
        // Query for objects that have workflow rules
        // Note: Tooling API doesn't expose Active/State field, so we get all workflows
        // and filter by active status later using Metadata API
        const query = `
            SELECT TableEnumOrId, COUNT(Id) cnt
            FROM WorkflowRule
            GROUP BY TableEnumOrId
        `;

        const result = safeExecSfCommand(
            `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`
        );

        if (result.success && result.records) {
            this._branches.push({ name: 'WorkflowRule-discovery', status: 'success', recordCount: result.records.length });
            return result.records.map(r => r.TableEnumOrId);
        }

        this._branches.push({ name: 'WorkflowRule-discovery', status: 'failed', recordCount: 0, failureType: result.failureType, error: (result.error || '').substring(0, 100) });
        console.warn('Warning: Could not query workflow rules, will try metadata retrieval');

        // Fallback: try common objects
        return ['Account', 'Contact', 'Opportunity', 'Lead', 'Case'];
    }

    /**
     * Extract Workflow Rules for specific object
     */
    async extractWorkflowRulesForObject(objectName) {
        console.log(`      Extracting rules for ${objectName}...`);

        // Check cache
        const cacheKey = `workflow_${objectName}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        // Retrieve workflow metadata via Metadata API
        const workflowMetadata = await this.retrieveWorkflowMetadata(objectName);

        if (!workflowMetadata || !workflowMetadata.rules) {
            console.log(`        No rules found for ${objectName}`);
            return [];
        }

        // Parse workflow rules
        const rules = this.parseWorkflowRules(objectName, workflowMetadata);

        // Cache and return
        this.cache.set(cacheKey, rules);
        return rules;
    }

    /**
     * Retrieve Workflow metadata via Metadata API
     */
    async retrieveWorkflowMetadata(objectName) {
        // Create temp directory
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }

        // Create package.xml
        const packageXml = this.createPackageXml(objectName);
        const packagePath = path.join(this.tempDir, 'package.xml');
        fs.writeFileSync(packagePath, packageXml);

        // Retrieve metadata with JSON output to get actual file paths
        try {
            const result = this.execSfCommand(
                `sf project retrieve start --manifest ${packagePath} --target-org ${this.orgAlias} --wait 10 --json`
            );

            // Parse JSON result to find where file was actually retrieved
            if (result?.result?.files && result.result.files.length > 0) {
                const workflowFile = result.result.files.find(f =>
                    f.type === 'Workflow' && f.fullName === objectName
                );

                if (workflowFile && workflowFile.filePath) {
                    const workflowPath = workflowFile.filePath;

                    if (fs.existsSync(workflowPath)) {
                        const xml = fs.readFileSync(workflowPath, 'utf8');
                        const parsed = await xml2js.parseStringPromise(xml);
                        return parsed.Workflow || null;
                    } else {
                        console.warn(`      Warning: File reported but not found: ${workflowPath}`);
                    }
                } else {
                    console.log(`        No workflow file returned for ${objectName}`);
                }
            } else {
                console.warn(`      Warning: Retrieve succeeded but no files returned for ${objectName}`);
            }
        } catch (error) {
            console.warn(`      Warning: Could not retrieve workflow metadata: ${error.message}`);
        }

        return null;
    }

    /**
     * Create package.xml for workflow retrieval
     */
    createPackageXml(objectName) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>${objectName}</members>
        <name>Workflow</name>
    </types>
    <version>65.0</version>
</Package>`;
    }

    /**
     * Parse Workflow Rules from metadata
     */
    parseWorkflowRules(objectName, workflowMetadata) {
        const rules = [];

        // Workflow metadata can have multiple rules
        const ruleArray = Array.isArray(workflowMetadata.rules) ?
            workflowMetadata.rules : [workflowMetadata.rules];

        for (const ruleData of ruleArray) {
            if (!ruleData) continue;

            const rule = {
                id: null, // Workflow rules don't have IDs in metadata
                name: ruleData.fullName?.[0],
                type: 'WorkflowRule',
                object: objectName,
                status: ruleData.active?.[0] === 'true' ? 'Active' : 'Inactive',
                description: ruleData.description?.[0],

                // Rule configuration
                triggerType: ruleData.triggerType?.[0] || 'onCreateOrTriggeringUpdate',
                reevaluateOnChange: false,
                criteriaFormula: ruleData.formula?.[0] || null,
                booleanFilter: ruleData.booleanFilter?.[0] || null,

                // Actions
                fieldUpdates: [],
                emailAlerts: [],
                tasks: [],
                outboundMessages: [],
                timeBasedActions: [],

                // Data access
                reads: [],
                writes: [],
                invokes: [],

                // Tier 3: Field-level operation tracking
                fieldOperations: []
            };

            // Determine re-evaluation setting
            if (ruleData.triggerType?.[0] === 'onAllChanges') {
                rule.reevaluateOnChange = true;
            }

            // Parse criteria items to extract field references
            if (ruleData.criteriaItems) {
                this.parseCriteriaItems(rule, ruleData.criteriaItems);
            }

            // Parse formula for field references
            if (rule.criteriaFormula) {
                this.parseFormula(rule, rule.criteriaFormula);
            }

            // Parse immediate actions
            if (ruleData.actions) {
                this.parseActions(rule, ruleData.actions);
            }

            // Parse time-based workflow actions
            if (workflowMetadata.workflowTimeTriggers) {
                this.parseTimeBasedActions(rule, workflowMetadata.workflowTimeTriggers);
            }

            // Parse field updates (only for actions in THIS rule)
            if (workflowMetadata.fieldUpdates && rule.fieldUpdates.length > 0) {
                this.parseFieldUpdates(rule, workflowMetadata.fieldUpdates, rule.fieldUpdates);
            }

            // Parse email alerts
            if (workflowMetadata.alerts) {
                this.parseEmailAlerts(rule, workflowMetadata.alerts);
            }

            // Parse tasks
            if (workflowMetadata.tasks) {
                this.parseTasks(rule, workflowMetadata.tasks);
            }

            // Parse outbound messages
            if (workflowMetadata.outboundMessages) {
                this.parseOutboundMessages(rule, workflowMetadata.outboundMessages);
            }

            rules.push(rule);
        }

        return rules.filter(r => r.status === 'Active');
    }

    /**
     * Parse criteria items for field references
     */
    parseCriteriaItems(rule, criteriaItems) {
        const items = Array.isArray(criteriaItems) ? criteriaItems : [criteriaItems];

        for (const item of items) {
            if (item.field) {
                const fieldName = item.field[0];
                const fullField = `${rule.object}.${fieldName}`;
                if (!rule.reads.includes(fullField)) {
                    rule.reads.push(fullField);
                }
            }
        }
    }

    /**
     * Parse formula for field references
     */
    parseFormula(rule, formula) {
        // Extract field references from formula (Object.Field pattern)
        const fieldPattern = /\b([A-Z][a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\b/g;
        let match;

        while ((match = fieldPattern.exec(formula)) !== null) {
            const objectName = match[1];
            const fieldName = match[2];
            const fullField = `${objectName}.${fieldName}`;

            if (!rule.reads.includes(fullField)) {
                rule.reads.push(fullField);
            }
        }

        // Also check for ISCHANGED and PRIORVALUE (indicates re-eval behavior)
        if (formula.includes('ISCHANGED') || formula.includes('PRIORVALUE')) {
            rule.reevaluateOnChange = true;
        }
    }

    /**
     * Parse immediate actions
     */
    parseActions(rule, actions) {
        const actionArray = Array.isArray(actions) ? actions : [actions];

        for (const action of actionArray) {
            if (action.name) {
                const actionName = action.name[0];
                const actionType = action.type[0];

                switch (actionType) {
                    case 'FieldUpdate':
                        rule.fieldUpdates.push(actionName);
                        break;
                    case 'Alert':
                        rule.emailAlerts.push(actionName);
                        rule.invokes.push({
                            type: 'EmailAlert',
                            name: actionName,
                            id: null
                        });
                        break;
                    case 'Task':
                        rule.tasks.push(actionName);
                        rule.invokes.push({
                            type: 'Task',
                            name: actionName,
                            id: null
                        });
                        break;
                    case 'OutboundMessage':
                        rule.outboundMessages.push(actionName);
                        rule.invokes.push({
                            type: 'OutboundMessage',
                            name: actionName,
                            id: null
                        });
                        break;
                }
            }
        }
    }

    /**
     * Parse time-based workflow actions
     */
    parseTimeBasedActions(rule, timeTriggers) {
        const triggers = Array.isArray(timeTriggers) ? timeTriggers : [timeTriggers];

        for (const trigger of triggers) {
            if (trigger.workflowTimeTriggerUnit && trigger.timeLength) {
                const action = {
                    offset: `${trigger.timeLength[0]} ${trigger.workflowTimeTriggerUnit[0]}`,
                    actions: []
                };

                if (trigger.actions) {
                    const actions = Array.isArray(trigger.actions) ? trigger.actions : [trigger.actions];
                    action.actions = actions.map(a => a.name?.[0]).filter(Boolean);
                }

                rule.timeBasedActions.push(action);
            }
        }
    }

    /**
     * Parse field updates (only for actions associated with this rule)
     * @param {Object} rule - The workflow rule object
     * @param {Array|Object} fieldUpdates - All field updates from workflow metadata
     * @param {Array} ruleFieldUpdates - Field update names referenced by this rule's actions
     */
    parseFieldUpdates(rule, fieldUpdates, ruleFieldUpdates = []) {
        const updates = Array.isArray(fieldUpdates) ? fieldUpdates : [fieldUpdates];

        for (const update of updates) {
            if (update.field && update.fullName) {
                const updateName = update.fullName[0];

                // CRITICAL FIX: Only add to writes if this field update is referenced by this rule
                if (ruleFieldUpdates.includes(updateName)) {
                    const fieldName = update.field[0];
                    const fullField = `${rule.object}.${fieldName}`;

                    // Maintain backward compatibility: populate writes array
                    if (!rule.writes.includes(fullField)) {
                        rule.writes.push(fullField);
                    }

                    // TIER 3 ENHANCEMENT: Populate fieldOperations array
                    const existingOp = rule.fieldOperations.find(op => op.field === fullField);
                    if (!existingOp) {
                        rule.fieldOperations.push({
                            field: fullField,
                            operation: 'WRITE',
                            context: `workflow_field_update:${updateName}`
                        });
                    }
                }
            }
        }
    }

    /**
     * Parse email alerts
     */
    parseEmailAlerts(rule, alerts) {
        const alertArray = Array.isArray(alerts) ? alerts : [alerts];

        for (const alert of alertArray) {
            if (alert.fullName) {
                const alertName = alert.fullName[0];
                if (!rule.emailAlerts.includes(alertName)) {
                    rule.emailAlerts.push(alertName);
                }
            }
        }
    }

    /**
     * Parse tasks
     */
    parseTasks(rule, tasks) {
        const taskArray = Array.isArray(tasks) ? tasks : [tasks];

        for (const task of taskArray) {
            if (task.fullName) {
                const taskName = task.fullName[0];
                if (!rule.tasks.includes(taskName)) {
                    rule.tasks.push(taskName);
                }
            }
        }
    }

    /**
     * Parse outbound messages
     */
    parseOutboundMessages(rule, messages) {
        const msgArray = Array.isArray(messages) ? messages : [messages];

        for (const msg of msgArray) {
            if (msg.fullName) {
                const msgName = msg.fullName[0];
                if (!rule.outboundMessages.includes(msgName)) {
                    rule.outboundMessages.push(msgName);
                }
            }
        }
    }

    /**
     * Normalize to UDM format
     */
    normalizeToUDM(rule) {
        const udm = {
            // Core Identity
            id: null,
            name: rule.name,
            type: 'WorkflowRule',
            status: rule.status,
            version: null,
            apiVersion: null,

            // Ownership
            owningPackage: null,
            lastModifiedBy: null,
            lastModifiedDate: null,

            // Trigger Context
            objectTargets: [{
                objectApiName: rule.object,
                when: [this.mapTriggerType(rule.triggerType)],
                conditionsSummary: rule.criteriaFormula || 'Criteria-based'
            }],

            // Data Access
            reads: rule.reads,
            writes: rule.writes,
            soql: [], // Workflow rules don't do SOQL
            dml: rule.fieldUpdates.length > 0 ? [{
                op: 'update',
                object: rule.object,
                approxRows: 1
            }] : [],

            // Tier 3: Field-level operation tracking
            fieldOperations: rule.fieldOperations || [],

            // Dependencies & Invocations
            invokes: rule.invokes,

            // Workflow-Specific
            entryCriteriaSummary: rule.criteriaFormula || 'Criteria items',
            triggerOrder: null,
            recursionSettings: rule.reevaluateOnChange ?
                'Re-evaluates on all changes' : 'Single evaluation',

            // Risk Assessment
            riskSignals: this.identifyRiskSignals(rule),

            // Source References
            sourceRefs: {
                api: 'Metadata',
                urls: []
            }
        };

        return udm;
    }

    /**
     * Map trigger type to event
     */
    mapTriggerType(triggerType) {
        switch (triggerType) {
            case 'onCreateOnly':
                return 'afterInsert';
            case 'onCreateOrTriggeringUpdate':
                return 'afterInsert,afterUpdate';
            case 'onAllChanges':
                return 'afterUpdate';
            default:
                return 'afterInsert,afterUpdate';
        }
    }

    /**
     * Identify risk signals in Workflow Rule
     */
    identifyRiskSignals(rule) {
        const signals = [];

        // Re-evaluation risk (CRITICAL)
        if (rule.reevaluateOnChange) {
            signals.push({
                code: 'WORKFLOW_REEVAL_ENABLED',
                description: 'Workflow re-evaluates on all changes (high loop risk)'
            });
        }

        // Time-based actions
        if (rule.timeBasedActions.length > 0) {
            signals.push({
                code: 'TIME_BASED_ACTIONS',
                description: `${rule.timeBasedActions.length} time-based action(s)`
            });
        }

        // Multiple field updates
        if (rule.fieldUpdates.length > 3) {
            signals.push({
                code: 'HIGH_FIELD_UPDATE_COUNT',
                description: `${rule.fieldUpdates.length} field updates`
            });
        }

        // Outbound messages
        if (rule.outboundMessages.length > 0) {
            signals.push({
                code: 'OUTBOUND_MESSAGES',
                description: `${rule.outboundMessages.length} outbound message(s)`
            });
        }

        return signals;
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
            // Silent failures for CLI commands
            return null;
        }
    }

    /**
     * Query WorkflowFieldUpdate via Tooling API (v3.28.0)
     * Gets detailed field update information including operation type, formulas, and literal values
     * @param {Array} workflowRuleIds - Array of WorkflowRule IDs (optional, if empty queries all)
     * @returns {Promise<Array>} WorkflowFieldUpdate records with full details
     */
    async queryWorkflowFieldUpdates(workflowRuleIds = null) {
        let query;

        if (workflowRuleIds && workflowRuleIds.length > 0) {
            // Query for specific workflow rules
            const idsStr = workflowRuleIds.map(id => `'${id}'`).join(',');
            query = `
                SELECT Id, WorkflowRuleId, Field, Operation,
                       Formula, LiteralValue, LookupValue, LookupValueType,
                       Name, TargetObject
                FROM WorkflowFieldUpdate
                WHERE WorkflowRuleId IN (${idsStr})
            `;
        } else {
            // Query all field updates
            query = `
                SELECT Id, WorkflowRuleId, Field, Operation,
                       Formula, LiteralValue, LookupValue, LookupValueType,
                       Name, TargetObject
                FROM WorkflowFieldUpdate
                LIMIT 2000
            `;
        }

        try {
            const result = this.execSfCommand(
                `sf data query --query "${query.replace(/\s+/g, ' ').trim()}" --use-tooling-api --json --target-org ${this.orgAlias}`
            );

            if (result?.result?.records) {
                return result.result.records;
            }

            return [];
        } catch (error) {
            console.warn(`Warning: Could not query WorkflowFieldUpdate: ${error.message}`);
            return [];
        }
    }

    /**
     * Enrich workflow rules with detailed field update information from Tooling API (v3.28.0)
     * @param {Array} rules - Workflow rules to enrich
     * @returns {Promise<Array>} Enriched rules with detailed field update data
     */
    async enrichRulesWithFieldUpdates(rules) {
        if (!rules || rules.length === 0) return rules;

        console.log('    Enriching workflow rules with field update details...');

        // Step 1: Query all WorkflowFieldUpdate records
        const fieldUpdates = await this.queryWorkflowFieldUpdates();

        if (fieldUpdates.length === 0) {
            console.log('      No WorkflowFieldUpdate records found');
            return rules;
        }

        console.log(`      Retrieved ${fieldUpdates.length} field update records`);

        // Step 2: Build lookup map by WorkflowRuleId (if available)
        // Note: WorkflowFieldUpdate.WorkflowRuleId may not always be populated
        // Fall back to matching by name from workflow metadata
        const updatesByName = new Map();
        fieldUpdates.forEach(update => {
            const name = update.Name || update.Id;
            updatesByName.set(name, update);
        });

        // Step 3: Enrich each rule
        for (const rule of rules) {
            if (!rule.fieldUpdates || rule.fieldUpdates.length === 0) continue;

            const enrichedUpdates = [];

            for (const updateName of rule.fieldUpdates) {
                const updateDetail = updatesByName.get(updateName);

                if (updateDetail) {
                    enrichedUpdates.push({
                        name: updateName,
                        field: updateDetail.Field,
                        operation: updateDetail.Operation,
                        formula: updateDetail.Formula || null,
                        literalValue: updateDetail.LiteralValue || null,
                        lookupValue: updateDetail.LookupValue || null,
                        lookupValueType: updateDetail.LookupValueType || null,
                        targetObject: updateDetail.TargetObject || rule.object
                    });

                    // Also update fieldOperations with value information
                    const fullField = `${rule.object}.${updateDetail.Field}`;
                    const existingOp = rule.fieldOperations.find(op => op.field === fullField);

                    if (existingOp) {
                        // Enhance existing operation with value details
                        existingOp.operation = updateDetail.Operation;
                        existingOp.value = this.formatFieldUpdateValue(updateDetail);
                    } else {
                        // Add new operation
                        rule.fieldOperations.push({
                            field: fullField,
                            operation: updateDetail.Operation,
                            value: this.formatFieldUpdateValue(updateDetail),
                            context: `workflow_field_update:${updateName}`
                        });
                    }
                } else {
                    // Update not found in Tooling API - keep basic info from metadata
                    enrichedUpdates.push({
                        name: updateName,
                        field: null,
                        operation: 'Unknown',
                        note: 'Details not available from Tooling API'
                    });
                }
            }

            // Replace simple names array with enriched objects
            rule.fieldUpdatesDetailed = enrichedUpdates;
        }

        console.log('      ✓ Field update enrichment complete');
        return rules;
    }

    /**
     * Format field update value for human-readable display
     * @param {Object} updateDetail - WorkflowFieldUpdate record from Tooling API
     * @returns {string} Formatted value
     */
    formatFieldUpdateValue(updateDetail) {
        switch (updateDetail.Operation) {
            case 'Formula':
                return `Formula: ${updateDetail.Formula || '(not available)'}`;
            case 'Literal':
                return updateDetail.LiteralValue || '(empty)';
            case 'Null':
                return '(null)';
            case 'NextValue':
                return '(next picklist value)';
            case 'PreviousValue':
                return '(previous picklist value)';
            case 'LookupValue':
                return `Lookup: ${updateDetail.LookupValue} (${updateDetail.LookupValueType})`;
            default:
                return `(${updateDetail.Operation})`;
        }
    }
}

module.exports = WorkflowRuleExtractor;

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log(`
Workflow Rule Extractor
=======================

Usage:
  node workflow-rule-extractor.js <org-alias> [object-name] [options]

Options:
  --output <file>     Write output to file (default: stdout)
  --udm               Output in UDM format (default: raw)

Examples:
  node workflow-rule-extractor.js production
  node workflow-rule-extractor.js sandbox Account --udm
  node workflow-rule-extractor.js production --output workflows.json
        `);
        process.exit(1);
    }

    const [orgAlias, objectName] = args;
    const options = {
        udm: args.includes('--udm'),
        outputFile: args.includes('--output') ? args[args.indexOf('--output') + 1] : null
    };

    (async () => {
        try {
            const extractor = new WorkflowRuleExtractor(orgAlias);
            const rules = await extractor.extractAllWorkflowRules(objectName);

            let output;
            if (options.udm) {
                const udmRules = rules.map(r => extractor.normalizeToUDM(r));
                output = JSON.stringify(udmRules, null, 2);
            } else {
                output = JSON.stringify(rules, null, 2);
            }

            if (options.outputFile) {
                require('fs').writeFileSync(options.outputFile, output);
                console.log(`\n✓ Workflow Rules written to: ${options.outputFile}`);
            } else {
                console.log(output);
            }

        } catch (error) {
            console.error(`\n❌ Error: ${error.message}`);
            process.exit(1);
        }
    })();
}
