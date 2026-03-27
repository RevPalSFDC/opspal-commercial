#!/usr/bin/env node

/**
 * Process Builder Extractor
 *
 * Purpose: Extract and analyze Process Builder metadata (treated as Flows with ProcessType = 'Workflow')
 * for automation inventory and conflict detection.
 *
 * Features:
 * - Extracts Process Builder processes (via Flow metadata)
 * - Parses process criteria and entry conditions
 * - Identifies field updates and actions
 * - Extracts invoked actions (Apex, Email, Tasks)
 * - Detects re-evaluation settings
 * - Normalizes to UDM format
 *
 * Usage:
 *   const extractor = new ProcessBuilderExtractor(orgAlias);
 *   const processes = await extractor.extractAllProcesses();
 *   const udm = extractor.normalizeToUDM(process);
 */

const { execSync } = require('child_process');
const FlowDiscoveryMapper = require('./flow-discovery-mapper');
const { safeExecSfCommand } = require('./safe-sf-result-parser');
const { generateReceipt } = require('./execution-receipt');

class ProcessBuilderExtractor {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.flowMapper = new FlowDiscoveryMapper(orgAlias);
        this.cache = new Map();
    }

    /**
     * Extract all Process Builder processes
     */
    async extractAllProcesses(objectName = null) {
        console.log('  Extracting Process Builder processes...');

        // Track execution branches for receipt
        const branches = [];
        let usedFallback = false;

        // Primary: FlowDefinitionView query via receipt-enabled helper
        const query = `SELECT DurableId, ActiveVersionId, LatestVersionId, ProcessType, DeveloperName, NamespacePrefix, LastModifiedDate FROM FlowDefinitionView WHERE IsActive = true AND ProcessType IN ('Workflow', 'AutoLaunchedFlow') ORDER BY DeveloperName`;

        let result = safeExecSfCommand(
            `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`
        );

        if (result.success) {
            branches.push({ name: 'FlowDefinitionView', status: 'success', recordCount: result.totalSize || 0 });
        } else {
            branches.push({ name: 'FlowDefinitionView', status: 'failed', recordCount: 0, failureType: result.failureType, error: (result.error || '').substring(0, 100) });

            // Fallback: Flow object
            console.log('    FlowDefinitionView query failed — trying Flow object fallback...');
            usedFallback = true;
            const fallbackQuery = `SELECT Id, DefinitionId, ProcessType, Status, VersionNumber FROM Flow WHERE Status = 'Active' AND ProcessType IN ('Workflow', 'AutoLaunchedFlow') ORDER BY ProcessType`;

            result = safeExecSfCommand(
                `sf data query --query "${fallbackQuery}" --use-tooling-api --json --target-org ${this.orgAlias}`
            );

            if (result.success) {
                branches.push({ name: 'Flow-fallback', status: 'success', recordCount: result.totalSize || 0, usedFallback: true });
                console.log(`    ✓ Flow fallback succeeded`);
            } else {
                branches.push({ name: 'Flow-fallback', status: 'failed', recordCount: 0, failureType: result.failureType, error: (result.error || '').substring(0, 100) });
                console.warn('    ⚠ Both FlowDefinitionView and Flow queries failed — cannot confirm process count');

                // Generate failure receipt and return
                this._lastReceipt = this._buildReceipt(branches, 'failed');
                return [];
            }
        }

        const records = result.records || [];
        if (records.length === 0) {
            console.log('    No Process Builder processes found (confirmed zero-count)');
            this._lastReceipt = this._buildReceipt(branches, 'complete');
            return [];
        }

        const definitions = records;
        console.log(`    Found ${definitions.length} Process Builder definition(s)`);

        // Extract detailed metadata for each process
        const processes = [];
        let detailSucceeded = 0;
        let detailFailed = 0;
        for (const def of definitions) {
            try {
                const process = await this.extractProcess(def.ActiveVersionId || def.LatestVersionId || def.Id);
                if (process && (!objectName || process.object === objectName)) {
                    processes.push(process);
                    detailSucceeded++;
                }
            } catch (error) {
                detailFailed++;
                console.warn(`    Warning: Failed to extract process ${def.DeveloperName || def.Id}: ${error.message}`);
            }
        }

        branches.push({
            name: 'process-detail-extraction',
            status: detailFailed === 0 ? 'success' : (detailSucceeded > 0 ? 'partial' : 'failed'),
            recordCount: processes.length,
            detailSucceeded,
            detailFailed
        });

        const receiptStatus = detailFailed === 0 ? 'complete' : (detailSucceeded > 0 ? 'partial' : 'failed');
        this._lastReceipt = this._buildReceipt(branches, receiptStatus);

        console.log(`    Extracted ${processes.length} Process Builder process(es)`);
        return processes;
    }

    /**
     * Build an execution receipt from branch results.
     * @private
     */
    _buildReceipt(branches, status) {
        const succeeded = {};
        const failed = {};
        for (const b of branches) {
            if (b.status === 'success' || b.status === 'partial') {
                succeeded[b.name] = { totalSize: b.recordCount || 0, records: [] };
            } else {
                failed[b.name] = { error: b.error || 'unknown', failureType: b.failureType || 'unknown' };
            }
        }
        return generateReceipt({
            status,
            orgAlias: this.orgAlias,
            totalQueries: branches.length,
            succeededCount: Object.keys(succeeded).length,
            failedCount: Object.keys(failed).length,
            succeeded,
            failed,
            fallbacks: branches.filter(b => b.usedFallback).map(b => ({ name: b.name, note: 'fallback used' })),
            durationMs: 0
        }, { helper: 'process-builder-extractor@1.0.0' });
    }

    /**
     * Get the last execution receipt (available after extractAllProcesses completes)
     */
    getLastReceipt() {
        return this._lastReceipt || null;
    }

    /**
     * Extract individual Process Builder process
     */
    async extractProcess(flowVersionId) {
        // Check cache
        if (this.cache.has(flowVersionId)) {
            return this.cache.get(flowVersionId);
        }

        // Get flow version metadata
        const flowData = await this.getFlowVersion(flowVersionId);
        if (!flowData) {
            return null;
        }

        // Parse flow metadata
        const metadata = flowData.Metadata;
        if (!metadata) {
            return null;
        }

        const process = {
            id: flowVersionId,
            definitionId: flowData.DefinitionId,
            name: flowData.MasterLabel,
            developerName: flowData.ApiName,
            type: 'ProcessBuilder',
            status: flowData.Status,
            version: flowData.VersionNumber,
            processType: flowData.ProcessType,
            lastModifiedDate: flowData.LastModifiedDate,

            // Process-specific fields
            object: null,
            triggerType: null,
            recordTriggerType: null,
            reevaluateOnChange: false,

            // Parsed elements
            criteria: [],
            actions: [],
            fieldUpdates: [],
            reads: [],
            writes: [],
            invokes: []
        };

        // Extract trigger information
        if (metadata.start) {
            process.object = metadata.start.object;
            process.triggerType = metadata.start.triggerType;
            process.recordTriggerType = metadata.start.recordTriggerType;

            // Check for record update re-evaluation
            if (metadata.start.recordTriggerType?.includes('Update')) {
                process.reevaluateOnChange = this.checkReevaluation(metadata);
            }
        }

        // Parse criteria nodes (decision logic)
        if (metadata.decisions) {
            this.parseCriteria(process, metadata.decisions);
        }

        // Parse action nodes
        if (metadata.recordUpdates) {
            this.parseFieldUpdates(process, metadata.recordUpdates);
        }

        if (metadata.actionCalls) {
            this.parseActionCalls(process, metadata.actionCalls);
        }

        if (metadata.recordCreates) {
            this.parseRecordCreates(process, metadata.recordCreates);
        }

        if (metadata.recordDeletes) {
            this.parseRecordDeletes(process, metadata.recordDeletes);
        }

        // Cache and return
        this.cache.set(flowVersionId, process);
        return process;
    }

    /**
     * Get flow version metadata
     */
    async getFlowVersion(flowVersionId) {
        const query = `SELECT Id, DefinitionId, MasterLabel, ApiName, ProcessType, Status, VersionNumber, LastModifiedDate, Metadata FROM Flow WHERE Id = '${flowVersionId}'`;

        const result = safeExecSfCommand(
            `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`
        );

        if (result.success && result.records?.[0]) {
            return result.records[0];
        }

        if (!result.success) {
            console.error(`Error fetching flow version ${flowVersionId}: ${result.error}`);
        }

        return null;
    }

    /**
     * Check if process re-evaluates on record update
     */
    checkReevaluation(metadata) {
        // Process Builder re-evaluates if it's set to run on update and evaluate new/changed records
        if (metadata.start?.recordTriggerType === 'Update' ||
            metadata.start?.recordTriggerType === 'CreateAndUpdate') {
            // Check if filter logic evaluates changed records
            if (metadata.start?.filterLogic?.includes('ISCHANGED') ||
                metadata.start?.filterLogic?.includes('PRIORVALUE')) {
                return true;
            }

            // Default: Process Builder on update re-evaluates
            return true;
        }
        return false;
    }

    /**
     * Parse criteria nodes (decision logic)
     */
    parseCriteria(process, decisions) {
        const decisionArray = Array.isArray(decisions) ? decisions : [decisions];

        for (const decision of decisionArray) {
            if (!decision.rules) continue;

            const rules = Array.isArray(decision.rules) ? decision.rules : [decision.rules];

            for (const rule of rules) {
                const criterion = {
                    name: rule.name,
                    label: rule.label,
                    conditions: []
                };

                // Parse conditions
                if (rule.conditions) {
                    const conditions = Array.isArray(rule.conditions) ? rule.conditions : [rule.conditions];

                    for (const condition of conditions) {
                        criterion.conditions.push({
                            field: condition.leftValueReference,
                            operator: condition.operator,
                            value: condition.rightValue?.stringValue || condition.rightValue?.elementReference
                        });

                        // Track field reads
                        if (condition.leftValueReference) {
                            const field = this.resolveFieldReference(condition.leftValueReference, process.object);
                            if (field && !process.reads.includes(field)) {
                                process.reads.push(field);
                            }
                        }
                    }
                }

                // Build criteria summary
                criterion.summary = this.buildCriteriaSummary(criterion.conditions);
                process.criteria.push(criterion);
            }
        }
    }

    /**
     * Parse field update actions
     */
    parseFieldUpdates(process, recordUpdates) {
        const updates = Array.isArray(recordUpdates) ? recordUpdates : [recordUpdates];

        for (const update of updates) {
            const action = {
                name: update.name,
                type: 'FieldUpdate',
                object: update.object || process.object,
                fields: []
            };

            // Parse field assignments
            if (update.inputAssignments) {
                const assignments = Array.isArray(update.inputAssignments) ?
                    update.inputAssignments : [update.inputAssignments];

                for (const assignment of assignments) {
                    action.fields.push({
                        field: assignment.field,
                        value: assignment.value?.stringValue ||
                               assignment.value?.elementReference ||
                               assignment.value?.booleanValue
                    });

                    // Track field writes
                    const fullField = `${action.object}.${assignment.field}`;
                    if (!process.writes.includes(fullField)) {
                        process.writes.push(fullField);
                    }
                }
            }

            process.actions.push(action);
            process.fieldUpdates.push(action);
        }
    }

    /**
     * Parse action call nodes (Apex, Email, etc.)
     */
    parseActionCalls(process, actionCalls) {
        const calls = Array.isArray(actionCalls) ? actionCalls : [actionCalls];

        for (const call of calls) {
            const action = {
                name: call.name,
                type: 'ActionCall',
                actionName: call.actionName,
                actionType: call.actionType
            };

            // Determine invocation type
            let invokeType = 'Unknown';
            if (call.actionType === 'apex') {
                invokeType = 'ApexClass';
            } else if (call.actionType === 'emailAlert') {
                invokeType = 'EmailAlert';
            } else if (call.actionType === 'quickAction') {
                invokeType = 'QuickAction';
            } else if (call.actionType === 'submit') {
                invokeType = 'SubmitForApproval';
            }

            process.invokes.push({
                type: invokeType,
                name: call.actionName || call.name,
                id: null
            });

            process.actions.push(action);
        }
    }

    /**
     * Parse record create actions
     */
    parseRecordCreates(process, recordCreates) {
        const creates = Array.isArray(recordCreates) ? recordCreates : [recordCreates];

        for (const create of creates) {
            const action = {
                name: create.name,
                type: 'RecordCreate',
                object: create.object
            };

            // Track DML
            process.invokes.push({
                type: 'DML',
                operation: 'insert',
                object: create.object
            });

            process.actions.push(action);
        }
    }

    /**
     * Parse record delete actions
     */
    parseRecordDeletes(process, recordDeletes) {
        const deletes = Array.isArray(recordDeletes) ? recordDeletes : [recordDeletes];

        for (const del of deletes) {
            const action = {
                name: del.name,
                type: 'RecordDelete',
                object: del.inputReference
            };

            // Track DML
            process.invokes.push({
                type: 'DML',
                operation: 'delete',
                object: del.inputReference || process.object
            });

            process.actions.push(action);
        }
    }

    /**
     * Resolve field reference to full field name
     */
    resolveFieldReference(reference, defaultObject) {
        // Remove $Record prefix if present
        reference = reference.replace('$Record.', '').replace('$Record__Prior.', '');

        // Check if reference includes object
        if (reference.includes('.')) {
            return reference;
        }

        // Add default object
        if (defaultObject) {
            return `${defaultObject}.${reference}`;
        }

        return reference;
    }

    /**
     * Build criteria summary from conditions
     */
    buildCriteriaSummary(conditions) {
        if (conditions.length === 0) {
            return 'Always true';
        }

        return conditions.map(c =>
            `${c.field} ${c.operator} ${c.value || '(empty)'}`
        ).join(' AND ');
    }

    /**
     * Normalize to UDM format
     */
    normalizeToUDM(process) {
        const udm = {
            // Core Identity
            id: process.id,
            name: process.name,
            type: 'ProcessBuilder',
            status: process.status,
            version: `v${process.version}`,
            apiVersion: null,

            // Ownership
            owningPackage: null,
            lastModifiedBy: null,
            lastModifiedDate: process.lastModifiedDate,

            // Trigger Context
            objectTargets: process.object ? [{
                objectApiName: process.object,
                when: [process.recordTriggerType || 'unknown'],
                conditionsSummary: process.criteria.map(c => c.summary).join(' OR ')
            }] : [],

            // Data Access
            reads: process.reads,
            writes: process.writes,
            soql: [], // Process Builder doesn't do direct SOQL
            dml: process.invokes
                .filter(inv => inv.type === 'DML')
                .map(inv => ({
                    op: inv.operation,
                    object: inv.object,
                    approxRows: 1
                })),

            // Dependencies & Invocations
            invokes: process.invokes.filter(inv => inv.type !== 'DML'),

            // Process-Specific
            entryCriteriaSummary: process.criteria.length > 0 ?
                process.criteria.map(c => c.summary).join(' OR ') :
                'No criteria (always runs)',
            triggerOrder: null,
            recursionSettings: process.reevaluateOnChange ?
                'Re-evaluates on update' : 'Single evaluation',

            // Risk Assessment
            riskSignals: this.identifyRiskSignals(process),

            // Source References
            sourceRefs: {
                api: 'Tooling',
                urls: []
            }
        };

        return udm;
    }

    /**
     * Identify risk signals in Process Builder
     */
    identifyRiskSignals(process) {
        const signals = [];

        // Re-evaluation risk
        if (process.reevaluateOnChange) {
            signals.push({
                code: 'REEVAL_ON_UPDATE',
                description: 'Process re-evaluates on record update (loop risk)'
            });
        }

        // Multiple field updates
        if (process.fieldUpdates.length > 5) {
            signals.push({
                code: 'HIGH_FIELD_UPDATE_COUNT',
                description: `${process.fieldUpdates.length} field updates in process`
            });
        }

        // Apex invocations
        const apexInvokes = process.invokes.filter(inv => inv.type === 'ApexClass');
        if (apexInvokes.length > 0) {
            signals.push({
                code: 'INVOKES_APEX',
                description: `Invokes ${apexInvokes.length} Apex action(s)`
            });
        }

        // Complex criteria
        if (process.criteria.length > 3) {
            signals.push({
                code: 'COMPLEX_CRITERIA',
                description: `${process.criteria.length} decision nodes`
            });
        }

        return signals;
    }

    /**
     * Execute SF CLI command
     * @deprecated Use safeExecSfCommand from safe-sf-result-parser.js for receipt coverage
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
}

module.exports = ProcessBuilderExtractor;

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log(`
Process Builder Extractor
=========================

Usage:
  node process-builder-extractor.js <org-alias> [object-name] [options]

Options:
  --output <file>     Write output to file (default: stdout)
  --udm               Output in UDM format (default: raw)

Examples:
  node process-builder-extractor.js production
  node process-builder-extractor.js sandbox Account --udm
  node process-builder-extractor.js production --output processes.json
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
            const extractor = new ProcessBuilderExtractor(orgAlias);
            const processes = await extractor.extractAllProcesses(objectName);

            let output;
            if (options.udm) {
                const udmProcesses = processes.map(p => extractor.normalizeToUDM(p));
                output = JSON.stringify(udmProcesses, null, 2);
            } else {
                output = JSON.stringify(processes, null, 2);
            }

            if (options.outputFile) {
                require('fs').writeFileSync(options.outputFile, output);
                console.log(`\n✓ Processes written to: ${options.outputFile}`);
            } else {
                console.log(output);
            }

        } catch (error) {
            console.error(`\n❌ Error: ${error.message}`);
            process.exit(1);
        }
    })();
}
