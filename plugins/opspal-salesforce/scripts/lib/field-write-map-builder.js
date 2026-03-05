#!/usr/bin/env node

/**
 * Field Write Map Builder (v3.28.0)
 *
 * Purpose: Build comprehensive map of all field write operations across all automation types
 * (Apex Triggers, Flows, Workflow Rules) and detect field-level collisions.
 *
 * Features:
 * - Tracks which automations write to each Object.Field
 * - Detects multiple automations writing to same field
 * - Analyzes condition overlap (definite/likely/possible)
 * - Generates detailed collision reports with recommendations
 *
 * Usage:
 *   const builder = new FieldWriteMapBuilder();
 *   builder.addApexTriggerWrites(trigger, triggerBody);
 *   builder.addFlowWrites(flow, flowMetadata);
 *   builder.addWorkflowWrites(workflowRule, fieldUpdates);
 *   const collisions = builder.detectCollisions();
 *
 * @version 1.0.0
 * @date 2025-10-22
 */

class FieldWriteMapBuilder {
    constructor() {
        this.writeMap = new Map(); // "Object.Field" -> [automations]
        this.stats = {
            totalWrites: 0,
            uniqueFields: 0,
            collisions: 0
        };
    }

    /**
     * Add field writes from Apex Trigger
     * Uses regex to extract field assignments from trigger body
     * @param {Object} trigger - ApexTrigger record
     * @param {string} triggerBody - Trigger source code
     */
    addApexTriggerWrites(trigger, triggerBody) {
        if (!triggerBody) return;

        // Pattern: object.Field__c = value; or object.Field = value;
        const pattern = /\b(\w+)\.(\w+__c|\w+)\s*=\s*([^;]+);/g;
        let match;

        while ((match = pattern.exec(triggerBody)) !== null) {
            const varName = match[1];
            const fieldName = match[2];
            const valueExpr = match[3];

            // Construct field key
            const fullField = `${trigger.TableEnumOrId}.${fieldName}`;

            this.addWrite(
                trigger.TableEnumOrId,
                fieldName,
                'ApexTrigger',
                trigger.Name,
                this.extractTriggerTiming(triggerBody),
                this.extractTriggerConditions(triggerBody),
                valueExpr.trim()
            );
        }
    }

    /**
     * Extract trigger timing from source code
     * @param {string} triggerBody - Trigger source code
     * @returns {string} Trigger timing (e.g., "before insert, after update")
     */
    extractTriggerTiming(triggerBody) {
        // Extract from trigger definition line: trigger MyTrigger on Account (before insert, after update)
        const triggerDefPattern = /trigger\s+\w+\s+on\s+\w+\s*\(([^)]+)\)/i;
        const match = triggerBody.match(triggerDefPattern);

        if (match && match[1]) {
            return match[1].trim();
        }

        return 'unknown timing';
    }

    /**
     * Extract conditions from trigger body (basic heuristics)
     * @param {string} triggerBody - Trigger source code
     * @returns {string} Condition description
     */
    extractTriggerConditions(triggerBody) {
        const conditions = [];

        // Check for RecordType checks
        if (triggerBody.match(/RecordType\w*\.(?:Name|DeveloperName)\s*[=!]=\s*['"][^'"]+['"]/)) {
            conditions.push('RecordType filtering');
        }

        // Check for Type/Status checks
        if (triggerBody.match(/\bType\s*[=!]=\s*['"][^'"]+['"]/)) {
            conditions.push('Type filtering');
        }
        if (triggerBody.match(/\bStatus\s*[=!]=\s*['"][^'"]+['"]/)) {
            conditions.push('Status filtering');
        }

        // Check for field change detection
        if (triggerBody.match(/oldRecord\.\w+\s*!=\s*newRecord\.\w+/) ||
            triggerBody.match(/Trigger\.old/)) {
            conditions.push('Field change detection');
        }

        return conditions.length > 0 ? conditions.join('; ') : 'Always (no explicit conditions)';
    }

    /**
     * Add field writes from Flow
     * @param {Object} flow - Flow record from FlowDefinitionView
     * @param {Object} flowMetadata - Parsed flow metadata with fieldOperations
     */
    addFlowWrites(flow, flowMetadata) {
        if (!flowMetadata || !flowMetadata.fieldOperations) return;

        flowMetadata.fieldOperations.forEach(op => {
            this.addWrite(
                op.object,
                op.field,
                'Flow',
                flow.DeveloperName,
                this.formatFlowTiming(flow.TriggerType, flow.RecordTriggerType),
                flowMetadata.entryCriteria?.summary || 'Always (no entry criteria)',
                op.value
            );
        });
    }

    /**
     * Format Flow timing for display
     * @param {string} triggerType - TriggerType from FlowDefinitionView
     * @param {string} recordTriggerType - RecordTriggerType from FlowDefinitionView
     * @returns {string} Formatted timing
     */
    formatFlowTiming(triggerType, recordTriggerType) {
        if (!triggerType) return 'unknown';

        const typeMap = {
            'RecordBeforeSave': 'before save',
            'RecordAfterSave': 'after save',
            'Scheduled': 'scheduled',
            'PlatformEvent': 'platform event'
        };

        const timing = typeMap[triggerType] || triggerType;
        const events = recordTriggerType ? ` (${recordTriggerType})` : '';

        return `${timing}${events}`;
    }

    /**
     * Add field writes from Process Builder (v3.29.0)
     * @param {Object} process - Process Builder process object
     * @param {Array} fieldWrites - Field writes from ProcessBuilderFieldExtractor
     */
    addProcessBuilderWrites(process, fieldWrites) {
        if (!fieldWrites || fieldWrites.length === 0) return;

        fieldWrites.forEach(write => {
            this.addWrite(
                write.object,
                write.field,
                'ProcessBuilder',
                write.automationName,
                write.timing,
                write.conditions || 'See process criteria',
                write.value
            );
        });
    }

    /**
     * Add field writes from Workflow Rule
     * @param {Object} workflowRule - WorkflowRule metadata
     * @param {Array} fieldUpdatesDetailed - Detailed field update records from Tooling API
     */
    addWorkflowWrites(workflowRule, fieldUpdatesDetailed) {
        if (!fieldUpdatesDetailed || fieldUpdatesDetailed.length === 0) return;

        fieldUpdatesDetailed.forEach(update => {
            if (!update.field) return;

            const value = update.operation === 'Formula'
                ? `Formula: ${update.formula}`
                : update.literalValue || `(${update.operation})`;

            this.addWrite(
                workflowRule.object,
                update.field,
                'WorkflowFieldUpdate',
                workflowRule.name,
                'after save (workflow)',
                workflowRule.criteriaFormula || 'See rule criteria',
                value
            );
        });
    }

    /**
     * Add a single write operation to the map
     * @param {string} object - Object API name
     * @param {string} field - Field API name
     * @param {string} sourceType - Type of automation (ApexTrigger, Flow, WorkflowFieldUpdate)
     * @param {string} sourceName - Name of automation
     * @param {string} timing - When it executes
     * @param {string} condition - Entry conditions
     * @param {string} value - Value being assigned
     */
    addWrite(object, field, sourceType, sourceName, timing, condition, value) {
        const key = `${object}.${field}`;

        if (!this.writeMap.has(key)) {
            this.writeMap.set(key, []);
        }

        this.writeMap.get(key).push({
            sourceType,
            sourceName,
            timing,
            condition,
            value
        });

        this.stats.totalWrites++;
    }

    /**
     * Detect field-level collisions (multiple automations writing to same field)
     * @returns {Array} Collision objects with severity, analysis, and recommendations
     */
    detectCollisions() {
        const collisions = [];

        for (const [key, automations] of this.writeMap) {
            if (automations.length > 1) {
                const [object, field] = key.split('.');

                const collision = {
                    conflictId: `FIELD_COLLISION_${object}_${field}`,
                    severity: this.calculateCollisionSeverity(automations),
                    rule: 'FIELD_WRITE_COLLISION',
                    object: object,
                    field: field,
                    automationCount: automations.length,
                    automations: automations,
                    specificConflict: this.describeCollision(object, field, automations),
                    overlapAnalysis: this.analyzeConditionOverlap(automations),
                    recommendation: this.generateRecommendation(object, field, automations)
                };

                collisions.push(collision);
                this.stats.collisions++;
            }
        }

        this.stats.uniqueFields = this.writeMap.size;

        return collisions.sort((a, b) => {
            // Sort by severity: CRITICAL > HIGH > MEDIUM > LOW
            const severityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
            return severityOrder[a.severity] - severityOrder[b.severity];
        });
    }

    /**
     * Calculate collision severity based on automation count and types
     * @param {Array} automations - Automations writing to same field
     * @returns {string} Severity (CRITICAL, HIGH, MEDIUM, LOW)
     */
    calculateCollisionSeverity(automations) {
        const count = automations.length;
        const hasWorkflow = automations.some(a => a.sourceType === 'WorkflowFieldUpdate');
        const hasMultipleAfterSave = automations.filter(a =>
            a.timing.includes('after')
        ).length > 1;

        if (count >= 4) return 'CRITICAL';
        if (count === 3 && (hasWorkflow || hasMultipleAfterSave)) return 'CRITICAL';
        if (count === 3) return 'HIGH';
        if (count === 2 && hasWorkflow && hasMultipleAfterSave) return 'HIGH';
        if (count === 2 && hasWorkflow) return 'MEDIUM';
        return 'MEDIUM';
    }

    /**
     * Describe the specific collision with execution order details
     * @param {string} object - Object name
     * @param {string} field - Field name
     * @param {Array} automations - Colliding automations
     * @returns {string} Detailed collision description
     */
    describeCollision(object, field, automations) {
        const descriptions = automations.map((auto, i) => {
            return `${i + 1}. **${auto.sourceName}** (${auto.sourceType}) - ` +
                `Timing: ${auto.timing}, ` +
                `Condition: ${auto.condition}, ` +
                `Sets ${field} = ${auto.value}`;
        }).join('\n');

        const executionNote = this.analyzeExecutionOrder(automations);

        return `**Multiple automations writing to ${object}.${field}**\n\n${descriptions}\n\n**Execution Order**: ${executionNote}`;
    }

    /**
     * Analyze execution order based on timing
     * @param {Array} automations - Automations to analyze
     * @returns {string} Execution order explanation
     */
    analyzeExecutionOrder(automations) {
        const hasBeforeSave = automations.some(a => a.timing.includes('before'));
        const hasAfterSave = automations.some(a => a.timing.includes('after'));
        const hasWorkflow = automations.some(a => a.sourceType === 'WorkflowFieldUpdate');

        let notes = [];

        if (hasBeforeSave && hasAfterSave) {
            notes.push('Before-save automations execute first, then after-save');
        }

        if (hasWorkflow) {
            notes.push('Workflow field updates execute LAST (after all flows/triggers), will override previous values');
        }

        const afterSaveAutomations = automations.filter(a => a.timing.includes('after'));
        if (afterSaveAutomations.length > 1) {
            const flowsWithoutOrder = afterSaveAutomations.filter(a =>
                a.sourceType === 'Flow' && !a.timing.includes('(')
            );

            if (flowsWithoutOrder.length > 0) {
                notes.push('Multiple after-save automations with undefined execution order (last write wins)');
            }
        }

        return notes.length > 0 ? notes.join('. ') : 'Execution order depends on automation type and timing';
    }

    /**
     * Analyze condition overlap between automations
     * Implements Option B: Basic automated detection + manual review
     * @param {Array} automations - Automations to analyze
     * @returns {Object} Overlap analysis with type and reason
     */
    analyzeConditionOverlap(automations) {
        // Rule 1: Any automation with no condition overlaps with everything
        const noCondition = automations.find(a =>
            a.condition === 'Always (no entry criteria)' ||
            a.condition === 'Always (no explicit conditions)'
        );

        if (noCondition) {
            return {
                overlap: 'DEFINITE',
                reason: `${noCondition.sourceName} has no entry conditions (runs for all records)`
            };
        }

        // Rule 2: Check if conditions reference same discriminator fields
        const extractFields = (condition) => {
            const fieldPattern = /\b([A-Z][a-zA-Z0-9_]*)\b/g;
            return [...condition.matchAll(fieldPattern)].map(m => m[1]);
        };

        const conditionFields = automations.map(a => extractFields(a.condition));

        // Find common fields across all conditions
        const allFields = conditionFields.flat();
        const uniqueFields = [...new Set(allFields)];

        const sharedFields = uniqueFields.filter(f =>
            conditionFields.every(cf => cf.includes(f))
        );

        if (sharedFields.length > 0) {
            return {
                overlap: 'LIKELY',
                reason: `Both conditions reference ${sharedFields.join(', ')} - may target same records`
            };
        }

        // Rule 3: Different fields mentioned -> possible overlap
        return {
            overlap: 'POSSIBLE',
            reason: 'Conditions use different fields - manual review required to determine if they can both be true'
        };
    }

    /**
     * Generate recommendation for resolving collision
     * @param {string} object - Object name
     * @param {string} field - Field name
     * @param {Array} automations - Colliding automations
     * @returns {Object} Recommendation with action and steps
     */
    generateRecommendation(object, field, automations) {
        const hasWorkflow = automations.some(a => a.sourceType === 'WorkflowFieldUpdate');
        const hasFlow = automations.some(a => a.sourceType === 'Flow');
        const hasTrigger = automations.some(a => a.sourceType === 'ApexTrigger');

        let action, steps;

        if (hasTrigger && hasFlow) {
            action = 'CONSOLIDATE_TO_TRIGGER';
            steps = [
                `Move ${field} assignment logic from Flow to trigger handler`,
                'Add combined conditions to determine final value',
                'Test with bulk data (200 records)',
                'Deactivate redundant Flow after validation'
            ];
        } else if (hasWorkflow) {
            action = 'MIGRATE_WORKFLOW_TO_FLOW';
            steps = [
                'Create Flow to replace Workflow field update',
                `Combine ${field} assignment logic with existing Flow (if applicable)`,
                'Set appropriate trigger order if multiple Flows',
                'Test in sandbox',
                'Deactivate Workflow rule after validation'
            ];
        } else if (hasFlow && automations.length > 1) {
            action = 'CONSOLIDATE_FLOWS';
            steps = [
                `Create single Flow for ${field} assignment with combined criteria`,
                'Use Decision element to determine final value based on all conditions',
                'Set clear trigger order (lower number = higher priority)',
                'Test thoroughly',
                'Deactivate redundant Flows after validation'
            ];
        } else {
            action = 'REVIEW_AND_PRIORITIZE';
            steps = [
                `Review business logic for ${field} assignment`,
                'Determine which automation should take precedence',
                'Document decision in automation description',
                'Consider consolidation if logic is related'
            ];
        }

        return {
            action,
            steps,
            priority: this.calculateCollisionSeverity(automations)
        };
    }

    /**
     * Get statistics about field writes
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            ...this.stats,
            fieldsWithCollisions: this.stats.collisions,
            fieldsWithSingleWriter: this.stats.uniqueFields - this.stats.collisions
        };
    }

    /**
     * Get all field writes for debugging/reporting
     * @returns {Map} Write map
     */
    getWriteMap() {
        return this.writeMap;
    }
}

module.exports = FieldWriteMapBuilder;

// CLI usage
if (require.main === module) {
    console.log('FieldWriteMapBuilder is a library class.');
    console.log('Use it programmatically in automation audit scripts.');
    console.log('\nExample:');
    console.log('  const builder = new FieldWriteMapBuilder();');
    console.log('  builder.addApexTriggerWrites(trigger, body);');
    console.log('  const collisions = builder.detectCollisions();');
}
