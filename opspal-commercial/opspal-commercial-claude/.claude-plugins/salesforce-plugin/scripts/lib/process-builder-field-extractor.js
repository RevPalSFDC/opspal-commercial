#!/usr/bin/env node

/**
 * Process Builder Field Extractor (v3.29.0)
 *
 * Purpose: Extract field write operations and cascade calls from Process Builder
 * processes for integration into Field Write Map and Cascade Mapping.
 *
 * Features:
 * - Parses Process Builder recordUpdate/recordCreate nodes for field assignments
 * - Extracts subflow calls for cascade detection
 * - Extracts ApexAction invocations for cascade chains
 * - Detects scheduled vs immediate actions
 * - Returns structured data for Field Write Map Builder
 *
 * Process Builder is stored as Flow metadata with ProcessType = 'Workflow'
 *
 * Usage:
 *   const extractor = new ProcessBuilderFieldExtractor(orgAlias);
 *   const fieldWrites = await extractor.extractFieldWrites(process, processMetadata);
 *   const cascadeCalls = await extractor.extractCascadeCalls(process, processMetadata);
 *
 * @version 1.0.0
 * @date 2025-10-22
 */

const ProcessBuilderExtractor = require('./process-builder-extractor');

class ProcessBuilderFieldExtractor extends ProcessBuilderExtractor {
    constructor(orgAlias) {
        super(orgAlias);
    }

    /**
     * Extract field write operations from Process Builder process
     * @param {Object} process - Process Builder process object
     * @param {Object} metadata - Flow metadata (if available)
     * @returns {Array} Array of field write operations
     */
    async extractFieldWrites(process, metadata = null) {
        const fieldWrites = [];

        // If metadata not provided, fetch it
        if (!metadata && process.id) {
            const flowData = await this.getFlowVersion(process.id);
            metadata = flowData?.Metadata;
        }

        if (!metadata) {
            console.warn(`No metadata available for process: ${process.name}`);
            return fieldWrites;
        }

        // Extract from recordUpdates (field updates on triggering record or related records)
        if (metadata.recordUpdates) {
            const updates = Array.isArray(metadata.recordUpdates) ?
                metadata.recordUpdates : [metadata.recordUpdates];

            updates.forEach(update => {
                const writes = this.parseRecordUpdateFields(process, update);
                fieldWrites.push(...writes);
            });
        }

        // Extract from recordCreates (new record creation with field values)
        if (metadata.recordCreates) {
            const creates = Array.isArray(metadata.recordCreates) ?
                metadata.recordCreates : [metadata.recordCreates];

            creates.forEach(create => {
                const writes = this.parseRecordCreateFields(process, create);
                fieldWrites.push(...writes);
            });
        }

        return fieldWrites;
    }

    /**
     * Parse field assignments from recordUpdate node
     * @param {Object} process - Process object
     * @param {Object} updateNode - recordUpdate XML node
     * @returns {Array} Field write objects
     */
    parseRecordUpdateFields(process, updateNode) {
        const fieldWrites = [];

        if (!updateNode.inputAssignments) {
            return fieldWrites;
        }

        const assignments = Array.isArray(updateNode.inputAssignments) ?
            updateNode.inputAssignments : [updateNode.inputAssignments];

        assignments.forEach(assignment => {
            const fieldName = assignment.field;
            const value = this.extractAssignmentValue(assignment);
            const isScheduled = this.isScheduledAction(updateNode);

            // Determine target object (could be triggering record or related record)
            const targetObject = updateNode.object || process.object;

            if (fieldName && targetObject) {
                fieldWrites.push({
                    object: targetObject,
                    field: fieldName,
                    value: value,
                    valueType: this.determineValueType(assignment),
                    automationType: 'ProcessBuilder',
                    automationName: process.name || process.developerName,
                    timing: isScheduled ? 'Scheduled' : 'Immediate',
                    conditions: this.extractNodeConditions(updateNode),
                    elementName: updateNode.name,
                    processVersion: process.version
                });
            }
        });

        return fieldWrites;
    }

    /**
     * Parse field assignments from recordCreate node
     * @param {Object} process - Process object
     * @param {Object} createNode - recordCreate XML node
     * @returns {Array} Field write objects
     */
    parseRecordCreateFields(process, createNode) {
        const fieldWrites = [];

        if (!createNode.inputAssignments) {
            return fieldWrites;
        }

        const assignments = Array.isArray(createNode.inputAssignments) ?
            createNode.inputAssignments : [createNode.inputAssignments];

        const targetObject = createNode.object;
        const isScheduled = this.isScheduledAction(createNode);

        assignments.forEach(assignment => {
            const fieldName = assignment.field;
            const value = this.extractAssignmentValue(assignment);

            if (fieldName && targetObject) {
                fieldWrites.push({
                    object: targetObject,
                    field: fieldName,
                    value: value,
                    valueType: this.determineValueType(assignment),
                    automationType: 'ProcessBuilder',
                    automationName: process.name || process.developerName,
                    timing: isScheduled ? 'Scheduled' : 'Immediate',
                    conditions: this.extractNodeConditions(createNode),
                    elementName: createNode.name,
                    operation: 'CREATE',
                    processVersion: process.version
                });
            }
        });

        return fieldWrites;
    }

    /**
     * Extract value from assignment
     * @param {Object} assignment - inputAssignment node
     * @returns {string} Value expression
     */
    extractAssignmentValue(assignment) {
        if (assignment.value) {
            // Could be literal value, reference, or formula
            if (assignment.value.stringValue) return assignment.value.stringValue;
            if (assignment.value.numberValue) return String(assignment.value.numberValue);
            if (assignment.value.booleanValue) return String(assignment.value.booleanValue);
            if (assignment.value.elementReference) return `{!${assignment.value.elementReference}}`;

            // Generic fallback
            return JSON.stringify(assignment.value);
        }

        return 'N/A';
    }

    /**
     * Determine value type (Literal, Reference, Formula)
     * @param {Object} assignment - inputAssignment node
     * @returns {string} Value type
     */
    determineValueType(assignment) {
        if (!assignment.value) return 'Unknown';

        if (assignment.value.stringValue || assignment.value.numberValue || assignment.value.booleanValue) {
            return 'Literal';
        }

        if (assignment.value.elementReference) {
            return 'Reference';
        }

        return 'Formula';
    }

    /**
     * Check if action is scheduled (time-based)
     * @param {Object} node - Action node
     * @returns {boolean} True if scheduled
     */
    isScheduledAction(node) {
        // Scheduled actions have scheduleOffset or waitOffsetValue
        return !!(node.scheduleOffset || node.waitOffsetValue || node.scheduledPath);
    }

    /**
     * Extract conditions from node (linked to criteria)
     * @param {Object} node - Action node
     * @returns {string} Condition expression
     */
    extractNodeConditions(node) {
        // Process Builder nodes reference decision nodes via connector
        // For now, return generic indicator if connector exists
        if (node.connector) {
            return `Conditional (via ${node.connector.targetReference})`;
        }

        return 'Always runs';
    }

    /**
     * Extract cascade calls (subflows and Apex invocations)
     * @param {Object} process - Process object
     * @param {Object} metadata - Flow metadata
     * @returns {Array} Cascade call objects
     */
    async extractCascadeCalls(process, metadata = null) {
        const cascadeCalls = [];

        // If metadata not provided, fetch it
        if (!metadata && process.id) {
            const flowData = await this.getFlowVersion(process.id);
            metadata = flowData?.Metadata;
        }

        if (!metadata) {
            return cascadeCalls;
        }

        // Extract subflow calls
        if (metadata.subflows) {
            const subflows = Array.isArray(metadata.subflows) ?
                metadata.subflows : [metadata.subflows];

            subflows.forEach(subflow => {
                cascadeCalls.push({
                    sourceType: 'ProcessBuilder',
                    sourceName: process.name || process.developerName,
                    targetType: 'Flow',
                    targetName: subflow.flowName,
                    callType: 'Subflow',
                    isScheduled: this.isScheduledAction(subflow),
                    elementName: subflow.name
                });
            });
        }

        // Extract Apex action calls (ApexAction)
        if (metadata.actionCalls) {
            const actions = Array.isArray(metadata.actionCalls) ?
                metadata.actionCalls : [metadata.actionCalls];

            actions.forEach(action => {
                // Only include Apex invocations
                if (action.actionType === 'apex' || action.actionName?.startsWith('Apex')) {
                    cascadeCalls.push({
                        sourceType: 'ProcessBuilder',
                        sourceName: process.name || process.developerName,
                        targetType: 'ApexClass',
                        targetName: action.actionName,
                        callType: 'ApexInvocable',
                        isScheduled: this.isScheduledAction(action),
                        elementName: action.name
                    });
                }
            });
        }

        return cascadeCalls;
    }

    /**
     * Get Process Builder processes with field write details
     * @param {string} objectName - Optional: filter by object
     * @returns {Array} Processes with field writes
     */
    async getProcessesWithFieldWrites(objectName = null) {
        const processes = await this.extractAllProcesses(objectName);
        const enriched = [];

        for (const process of processes) {
            try {
                const fieldWrites = await this.extractFieldWrites(process);
                const cascadeCalls = await this.extractCascadeCalls(process);

                enriched.push({
                    ...process,
                    fieldWrites,
                    cascadeCalls,
                    stats: {
                        fieldWriteCount: fieldWrites.length,
                        cascadeCallCount: cascadeCalls.length,
                        scheduledActions: fieldWrites.filter(w => w.timing === 'Scheduled').length
                    }
                });
            } catch (error) {
                console.warn(`Failed to extract field writes for ${process.name}: ${error.message}`);
                enriched.push({
                    ...process,
                    fieldWrites: [],
                    cascadeCalls: [],
                    error: error.message
                });
            }
        }

        return enriched;
    }

    /**
     * Get field write summary statistics
     * @param {Array} processes - Processes with field writes
     * @returns {Object} Summary statistics
     */
    getFieldWriteSummary(processes) {
        const summary = {
            totalProcesses: processes.length,
            totalFieldWrites: 0,
            totalCascadeCalls: 0,
            scheduledActions: 0,
            objectsAffected: new Set(),
            fieldsAffected: new Set()
        };

        processes.forEach(process => {
            if (process.fieldWrites) {
                summary.totalFieldWrites += process.fieldWrites.length;
                summary.scheduledActions += process.fieldWrites.filter(w => w.timing === 'Scheduled').length;

                process.fieldWrites.forEach(write => {
                    summary.objectsAffected.add(write.object);
                    summary.fieldsAffected.add(`${write.object}.${write.field}`);
                });
            }

            if (process.cascadeCalls) {
                summary.totalCascadeCalls += process.cascadeCalls.length;
            }
        });

        summary.objectsAffected = Array.from(summary.objectsAffected);
        summary.fieldsAffected = Array.from(summary.fieldsAffected);

        return summary;
    }
}

module.exports = ProcessBuilderFieldExtractor;

// CLI usage
if (require.main === module) {
    const orgAlias = process.argv[2];
    const objectName = process.argv[3] || null;

    if (!orgAlias) {
        console.error('Usage: node process-builder-field-extractor.js <org-alias> [object-name]');
        process.exit(1);
    }

    (async () => {
        const extractor = new ProcessBuilderFieldExtractor(orgAlias);
        const processes = await extractor.getProcessesWithFieldWrites(objectName);
        const summary = extractor.getFieldWriteSummary(processes);

        console.log('\n=== Process Builder Field Write Summary ===');
        console.log(`Total Processes: ${summary.totalProcesses}`);
        console.log(`Total Field Writes: ${summary.totalFieldWrites}`);
        console.log(`Scheduled Actions: ${summary.scheduledActions}`);
        console.log(`Objects Affected: ${summary.objectsAffected.length}`);
        console.log(`Fields Affected: ${summary.fieldsAffected.length}`);
        console.log(`Cascade Calls: ${summary.totalCascadeCalls}`);

        console.log('\n=== Detailed Field Writes ===');
        processes.forEach(process => {
            if (process.fieldWrites && process.fieldWrites.length > 0) {
                console.log(`\n${process.name}:`);
                process.fieldWrites.forEach(write => {
                    console.log(`  - ${write.object}.${write.field} = ${write.value} (${write.timing})`);
                });
            }
        });

        process.exit(0);
    })().catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
    });
}
