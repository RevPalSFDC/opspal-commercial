#!/usr/bin/env node

/**
 * Automation UDM Normalizer
 *
 * Purpose: Normalize all automation types (Apex, Flow, Process Builder, Workflow)
 * into Unified Data Model (UDM) format for consistent processing.
 *
 * Features:
 * - Converts extractor outputs to standardized UDM schema
 * - Handles all automation types
 * - Enriches with risk scores and metadata
 * - Validates required fields
 * - Generates impact summaries
 *
 * Usage:
 *   const normalizer = new AutomationUDMNormalizer();
 *   const udm = normalizer.normalize(automation, 'ApexTrigger');
 *   const udmArray = normalizer.normalizeAll(automations);
 */

const AutomationRiskScorer = require('./automation-risk-scorer');

class AutomationUDMNormalizer {
    constructor() {
        this.riskScorer = new AutomationRiskScorer();
    }

    /**
     * Normalize single automation to UDM
     */
    normalize(automation, type = null) {
        const detectedType = type || automation.type;

        switch (detectedType) {
            case 'ApexTrigger':
                return this.normalizeApexTrigger(automation);
            case 'ApexClass':
                return this.normalizeApexClass(automation);
            case 'Flow':
                return this.normalizeFlow(automation);
            case 'ProcessBuilder':
                return this.normalizeProcessBuilder(automation);
            case 'WorkflowRule':
                return this.normalizeWorkflowRule(automation);
            default:
                throw new Error(`Unknown automation type: ${detectedType}`);
        }
    }

    /**
     * Normalize array of automations
     */
    normalizeAll(automations) {
        const normalized = [];

        for (const automation of automations) {
            try {
                const udm = this.normalize(automation);
                normalized.push(udm);
            } catch (error) {
                console.warn(`Warning: Failed to normalize ${automation.name}: ${error.message}`);
            }
        }

        return normalized;
    }

    /**
     * Normalize Apex Trigger
     */
    normalizeApexTrigger(trigger) {
        const udm = this.createBaseUDM(trigger, 'ApexTrigger');

        // Trigger-specific fields
        udm.objectTargets = [{
            objectApiName: trigger.object,
            when: trigger.events || [],
            conditionsSummary: 'Apex Trigger'
        }];

        udm.entryCriteriaSummary = `Trigger on ${trigger.object}: ${(trigger.events || []).join(', ')}`;
        udm.triggerOrder = null; // Apex triggers don't have explicit order

        // Data access
        udm.reads = trigger.fieldAccess || [];
        // v3.26.0 PHASE 3: Use actual field names from static analysis if available
        // Fall back to DML inference (which adds wildcards) only when field detection failed
        udm.writes = (trigger.fieldsModified && trigger.fieldsModified.length > 0)
            ? trigger.fieldsModified
            : this.inferWritesFromDML(trigger.dmlOperations, trigger.object);
        udm.soql = (trigger.soqlQueries || []).map(q => q.query || q);
        udm.dml = this.normalizeDMLOperations(trigger.dmlOperations);

        // Invocations
        udm.invokes = this.normalizeInvokes(trigger.methodCalls);

        // Risk signals
        udm.riskSignals = this.normalizeRiskSignals(trigger.governorRisks);

        return udm;
    }

    /**
     * Normalize Apex Class
     */
    normalizeApexClass(apexClass) {
        const udm = this.createBaseUDM(apexClass, 'ApexClass');

        // Classes don't have direct trigger targets
        udm.objectTargets = [];

        // Infer objects from field access
        const objects = new Set();
        for (const field of (apexClass.fieldAccess || [])) {
            const obj = field.split('.')[0];
            if (obj) objects.add(obj);
        }

        if (objects.size > 0) {
            udm.objectTargets = Array.from(objects).map(obj => ({
                objectApiName: obj,
                when: ['invoked'],
                conditionsSummary: 'Invoked by other automation'
            }));
        }

        udm.entryCriteriaSummary = 'Invoked by other automation';

        // Data access
        udm.reads = apexClass.fieldAccess || [];
        // v3.26.0 PHASE 3: Use actual field names if available (future enhancement)
        udm.writes = (apexClass.fieldsModified && apexClass.fieldsModified.length > 0)
            ? apexClass.fieldsModified
            : [];
        udm.soql = (apexClass.soqlQueries || []).map(q => q.query || q);
        udm.dml = this.normalizeDMLOperations(apexClass.dmlOperations);

        // Invocations
        udm.invokes = this.normalizeInvokes(apexClass.methodCalls);

        // Risk signals
        udm.riskSignals = this.normalizeRiskSignals(apexClass.governorRisks);

        return udm;
    }

    /**
     * Normalize Flow
     */
    normalizeFlow(flow) {
        // If already normalized, return as-is
        if (flow.objectTargets && Array.isArray(flow.objectTargets)) {
            return flow;
        }

        const udm = this.createBaseUDM(flow, 'Flow');

        // Flow-specific fields
        udm.objectTargets = flow.object ? [{
            objectApiName: flow.object,
            when: [flow.recordTriggerType || 'unknown'],
            conditionsSummary: flow.entryCriteriaSummary || 'No criteria'
        }] : [];

        udm.entryCriteriaSummary = flow.entryCriteriaSummary || 'No criteria';
        udm.triggerOrder = flow.triggerOrder || null;
        udm.recursionSettings = flow.recursionSettings || 'Single evaluation';

        // Data access
        udm.reads = flow.reads || [];
        udm.writes = flow.writes || [];
        udm.soql = flow.soql || [];
        udm.dml = flow.dml || [];

        // Invocations
        udm.invokes = flow.invokes || [];

        // Risk signals
        udm.riskSignals = this.normalizeRiskSignals(flow.riskSignals);

        return udm;
    }

    /**
     * Normalize Process Builder
     */
    normalizeProcessBuilder(process) {
        // If already normalized, return as-is
        if (process.objectTargets && Array.isArray(process.objectTargets)) {
            return process;
        }

        const udm = this.createBaseUDM(process, 'ProcessBuilder');

        // Process Builder-specific fields
        udm.objectTargets = process.object ? [{
            objectApiName: process.object,
            when: [process.recordTriggerType || 'unknown'],
            conditionsSummary: (process.criteria || []).map(c => c.summary).join(' OR ') || 'No criteria'
        }] : [];

        udm.entryCriteriaSummary = (process.criteria || []).map(c => c.summary).join(' OR ') || 'No criteria';
        udm.recursionSettings = process.reevaluateOnChange ? 'Re-evaluates on update' : 'Single evaluation';

        // Data access
        udm.reads = process.reads || [];
        udm.writes = process.writes || [];
        udm.soql = [];
        udm.dml = [];

        // Invocations
        udm.invokes = process.invokes || [];

        // Risk signals
        udm.riskSignals = this.normalizeRiskSignals(process.riskSignals);

        return udm;
    }

    /**
     * Normalize Workflow Rule
     */
    normalizeWorkflowRule(rule) {
        // If already normalized, return as-is
        if (rule.objectTargets && Array.isArray(rule.objectTargets)) {
            return rule;
        }

        const udm = this.createBaseUDM(rule, 'WorkflowRule');

        // Workflow-specific fields
        udm.objectTargets = rule.object ? [{
            objectApiName: rule.object,
            when: [this.mapTriggerType(rule.triggerType)],
            conditionsSummary: rule.criteriaFormula || 'Criteria-based'
        }] : [];

        udm.entryCriteriaSummary = rule.criteriaFormula || 'Criteria items';
        udm.recursionSettings = rule.reevaluateOnChange ? 'Re-evaluates on all changes' : 'Single evaluation';

        // Data access
        udm.reads = rule.reads || [];
        udm.writes = rule.writes || [];
        udm.soql = [];
        udm.dml = rule.writes.length > 0 ? [{
            op: 'update',
            object: rule.object,
            approxRows: 1
        }] : [];

        // Invocations
        udm.invokes = rule.invokes || [];

        // Risk signals
        udm.riskSignals = this.normalizeRiskSignals(rule.riskSignals);

        return udm;
    }

    /**
     * Create base UDM structure
     */
    createBaseUDM(automation, type) {
        return {
            // Core Identity
            id: automation.id,
            name: automation.name,
            type: type,
            status: automation.status || 'Active',
            version: automation.version || null,
            apiVersion: automation.apiVersion || null,

            // Ownership
            owningPackage: automation.owningPackage || null,
            lastModifiedBy: automation.lastModifiedBy || null,
            lastModifiedDate: automation.lastModifiedDate || null,

            // Trigger Context (populated by type-specific methods)
            objectTargets: [],

            // Data Access (populated by type-specific methods)
            reads: [],
            writes: [],
            soql: [],
            dml: [],

            // Dependencies & Invocations (populated by type-specific methods)
            invokes: [],

            // Type-Specific (populated by type-specific methods)
            entryCriteriaSummary: null,
            triggerOrder: null,
            recursionSettings: null,

            // Risk Assessment (populated later)
            riskSignals: [],
            riskScore: 0,

            // Source References
            sourceRefs: {
                api: automation.sourceRefs?.api || 'Unknown',
                urls: automation.sourceRefs?.urls || []
            }
        };
    }

    /**
     * Infer writes from DML operations
     */
    inferWritesFromDML(dmlOperations, defaultObject) {
        const writes = [];
        for (const dml of (dmlOperations || [])) {
            if (dml.object && dml.object !== 'unknown') {
                // Add object-level write
                writes.push(`${dml.object}.*`);
            } else if (defaultObject) {
                writes.push(`${defaultObject}.*`);
            }
        }
        return writes;
    }

    /**
     * Normalize DML operations
     */
    normalizeDMLOperations(dmlOperations) {
        return (dmlOperations || []).map(dml => ({
            op: dml.operation || dml.op,
            object: dml.object || 'unknown',
            approxRows: dml.approxRows || 1
        }));
    }

    /**
     * Normalize invokes
     */
    normalizeInvokes(invokes) {
        return (invokes || []).map(invoke => {
            if (typeof invoke === 'string') {
                return {
                    type: 'ApexClass',
                    name: invoke,
                    id: null
                };
            }

            return {
                type: invoke.type || 'Unknown',
                name: invoke.name || invoke.target,
                id: invoke.id || null
            };
        });
    }

    /**
     * Normalize risk signals
     */
    normalizeRiskSignals(riskSignals) {
        return (riskSignals || []).map(signal => {
            if (typeof signal === 'string') {
                return {
                    code: signal,
                    description: signal
                };
            }

            return {
                code: signal.code || 'UNKNOWN',
                description: signal.description || signal.message || 'Unknown risk'
            };
        });
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
     * Validate UDM
     */
    validate(udm) {
        const errors = [];

        // Required fields
        if (!udm.id) errors.push('Missing required field: id');
        if (!udm.name) errors.push('Missing required field: name');
        if (!udm.type) errors.push('Missing required field: type');

        // Type validation
        const validTypes = ['ApexTrigger', 'ApexClass', 'Flow', 'ProcessBuilder', 'WorkflowRule'];
        if (!validTypes.includes(udm.type)) {
            errors.push(`Invalid type: ${udm.type}`);
        }

        // Array fields
        if (!Array.isArray(udm.objectTargets)) errors.push('objectTargets must be an array');
        if (!Array.isArray(udm.reads)) errors.push('reads must be an array');
        if (!Array.isArray(udm.writes)) errors.push('writes must be an array');
        if (!Array.isArray(udm.soql)) errors.push('soql must be an array');
        if (!Array.isArray(udm.dml)) errors.push('dml must be an array');
        if (!Array.isArray(udm.invokes)) errors.push('invokes must be an array');
        if (!Array.isArray(udm.riskSignals)) errors.push('riskSignals must be an array');

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Enrich UDM with additional computed fields
     */
    enrich(udm, conflicts = []) {
        // Calculate risk score
        udm.riskScore = this.riskScorer.calculateRiskScore(udm, conflicts);

        // Generate impact summary
        udm.impactSummary = this.generateImpactSummary(udm);

        return udm;
    }

    /**
     * Generate 6-line impact summary
     */
    generateImpactSummary(udm) {
        const lines = [];

        // Line 1: What
        const objectStr = udm.objectTargets.map(t => t.objectApiName).join(', ') || 'N/A';
        lines.push(`What: ${udm.type} / ${udm.name} / ${udm.status} / ${udm.version || 'N/A'}`);

        // Line 2: When
        const whenStr = udm.objectTargets.map(t => `${t.objectApiName} ${(t.when || []).join(',')}`).join('; ') || 'N/A';
        const orderStr = udm.triggerOrder ? `, Trigger Order ${udm.triggerOrder}` : '';
        const criteriaStr = udm.entryCriteriaSummary ? `, entry: ${udm.entryCriteriaSummary.substring(0, 50)}` : '';
        lines.push(`When: ${whenStr}${orderStr}${criteriaStr}`);

        // Line 3: Reads/Writes
        const readsStr = udm.reads.slice(0, 3).join(', ') || 'None';
        const writesStr = udm.writes.slice(0, 3).join(', ') || 'None';
        const moreReads = udm.reads.length > 3 ? ` (+${udm.reads.length - 3} more)` : '';
        const moreWrites = udm.writes.length > 3 ? ` (+${udm.writes.length - 3} more)` : '';
        lines.push(`Reads/Writes: ${readsStr}${moreReads} → ${writesStr}${moreWrites}`);

        // Line 4: Side Effects
        const dmlStr = udm.dml.map(d => `${d.op}(${d.object})`).join(', ') || 'None';
        const soqlCount = udm.soql.length > 0 ? `, ${udm.soql.length} SOQL` : '';
        lines.push(`Side Effects: ${dmlStr}${soqlCount}`);

        // Line 5: Dependencies
        const invokesStr = udm.invokes.slice(0, 3).map(i => `${i.type}.${i.name}`).join(', ') || 'None';
        const moreInvokes = udm.invokes.length > 3 ? ` (+${udm.invokes.length - 3} more)` : '';
        lines.push(`Dependencies: ${invokesStr}${moreInvokes}`);

        // Line 6: Risk Signals
        const risksStr = udm.riskSignals.slice(0, 2).map(r => r.code).join(', ') || 'None';
        const moreRisks = udm.riskSignals.length > 2 ? ` (+${udm.riskSignals.length - 2} more)` : '';
        lines.push(`Risk Signals: ${risksStr}${moreRisks}`);

        return lines.join('\n');
    }

    /**
     * Export to CSV row
     */
    toCSVRow(udm) {
        return {
            id: udm.id,
            name: udm.name,
            type: udm.type,
            status: udm.status,
            version: udm.version || '',
            objects: udm.objectTargets.map(t => t.objectApiName).join(';'),
            events: udm.objectTargets.map(t => t.when.join(',')).join(';'),
            reads: udm.reads.join(';'),
            writes: udm.writes.join(';'),
            invokes: udm.invokes.map(i => i.name).join(';'),
            riskScore: udm.riskScore,
            riskSignals: udm.riskSignals.map(r => r.code).join(';')
        };
    }
}

module.exports = AutomationUDMNormalizer;

// CLI Interface
if (require.main === module) {
    const fs = require('fs');
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log(`
Automation UDM Normalizer
=========================

Usage:
  node automation-udm-normalizer.js <input-file.json> [options]

Options:
  --output <file>     Write normalized UDM to file
  --validate          Validate UDM structure
  --enrich            Enrich with risk scores and summaries
  --csv <file>        Export to CSV format

Examples:
  node automation-udm-normalizer.js automations.json --output udm.json
  node automation-udm-normalizer.js automations.json --validate --enrich
  node automation-udm-normalizer.js automations.json --csv automations.csv
        `);
        process.exit(1);
    }

    try {
        const inputFile = args[0];
        const automations = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

        const normalizer = new AutomationUDMNormalizer();
        const udmArray = normalizer.normalizeAll(automations);

        console.log(`Normalized ${udmArray.length} automation(s)`);

        // Validate if requested
        if (args.includes('--validate')) {
            console.log('\nValidating UDM structures...');
            let validCount = 0;
            let invalidCount = 0;

            for (const udm of udmArray) {
                const validation = normalizer.validate(udm);
                if (validation.valid) {
                    validCount++;
                } else {
                    invalidCount++;
                    console.log(`  ✗ ${udm.name}: ${validation.errors.join(', ')}`);
                }
            }

            console.log(`  ✓ Valid: ${validCount}`);
            console.log(`  ✗ Invalid: ${invalidCount}`);
        }

        // Enrich if requested
        if (args.includes('--enrich')) {
            console.log('\nEnriching with risk scores and summaries...');
            for (const udm of udmArray) {
                normalizer.enrich(udm);
            }
        }

        // Output JSON
        if (args.includes('--output')) {
            const outputFile = args[args.indexOf('--output') + 1];
            fs.writeFileSync(outputFile, JSON.stringify(udmArray, null, 2));
            console.log(`\n✓ UDM written to: ${outputFile}`);
        }

        // Export CSV
        if (args.includes('--csv')) {
            const csvFile = args[args.indexOf('--csv') + 1];
            const csvRows = udmArray.map(udm => normalizer.toCSVRow(udm));

            // Write CSV
            const headers = Object.keys(csvRows[0] || {}).join(',');
            const rows = csvRows.map(row =>
                Object.values(row).map(v => `"${v}"`).join(',')
            ).join('\n');

            fs.writeFileSync(csvFile, headers + '\n' + rows);
            console.log(`\n✓ CSV written to: ${csvFile}`);
        }

        // Show sample
        if (!args.includes('--output') && !args.includes('--csv')) {
            console.log('\nSample UDM (first automation):');
            console.log(JSON.stringify(udmArray[0], null, 2));
        }

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}
