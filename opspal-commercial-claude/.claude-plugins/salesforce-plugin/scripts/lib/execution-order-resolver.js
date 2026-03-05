#!/usr/bin/env node

/**
 * Execution Order Resolver (v3.29.0)
 *
 * Purpose: Determine the "final writer" for field collisions based on Salesforce's
 * standard order-of-execution.
 *
 * Features:
 * - Maps automation types to execution order positions
 * - Resolves "probable last writer" for field collisions
 * - Handles Flow TriggerOrder for deterministic resolution
 * - Flags ORDER-DEPENDENT when order is non-deterministic
 * - Generates human-readable rationale for determinations
 *
 * Salesforce Order of Execution:
 * 1. System Validation Rules (required fields, data types)
 * 2. Before-save Apex Triggers
 * 3. Custom Validation Rules
 * 4. Duplicate Rules
 * 5. After-save Apex Triggers
 * 6. Assignment Rules (Lead/Case OwnerId)
 * 7. Auto-Response Rules (Case/Lead email)
 * 8. Workflow Rules (immediate actions)
 * 9. Escalation Rules
 * 10. Process Builder (immediate actions)
 * 11. Record-Triggered Flows (after-save, ordered by TriggerOrder)
 * 12. Workflow Field Updates
 * 13. Post-commit logic (async: @future, Queueable, Batch, Platform Events)
 *
 * Usage:
 *   const resolver = new ExecutionOrderResolver();
 *   const result = resolver.determineFinalWriter(collision);
 *   // Returns: { finalWriter, confidence, rationale, orderPosition }
 *
 * @version 1.0.0
 * @date 2025-10-22
 */

class ExecutionOrderResolver {
    constructor() {
        // Standard Salesforce execution order mapping
        this.ORDER_OF_EXECUTION = [
            { position: 1, type: 'SystemValidation', label: 'System Validation Rules', phase: 'before-save' },
            { position: 2, type: 'ApexTrigger:before', label: 'Before-save Apex Triggers', phase: 'before-save' },
            { position: 3, type: 'ValidationRule', label: 'Custom Validation Rules', phase: 'before-save' },
            { position: 4, type: 'DuplicateRule', label: 'Duplicate Rules', phase: 'before-save' },
            { position: 5, type: 'ApexTrigger:after', label: 'After-save Apex Triggers', phase: 'after-save' },
            { position: 6, type: 'AssignmentRule', label: 'Assignment Rules (OwnerId)', phase: 'after-save' },
            { position: 7, type: 'AutoResponseRule', label: 'Auto-Response Rules', phase: 'after-save' },
            { position: 8, type: 'WorkflowRule:immediate', label: 'Workflow Rules (immediate)', phase: 'after-save' },
            { position: 9, type: 'EscalationRule', label: 'Escalation Rules', phase: 'after-save' },
            { position: 10, type: 'ProcessBuilder:immediate', label: 'Process Builder (immediate)', phase: 'after-save' },
            { position: 11, type: 'Flow:after', label: 'Record-Triggered Flows (after-save)', phase: 'after-save' },
            { position: 12, type: 'WorkflowFieldUpdate', label: 'Workflow Field Updates', phase: 'after-save' },
            { position: 13, type: 'Async', label: 'Post-commit async logic', phase: 'post-commit' }
        ];

        // Confidence levels
        this.CONFIDENCE = {
            CERTAIN: 'CERTAIN',           // Deterministic: different order positions
            LIKELY: 'LIKELY',             // Same position but TriggerOrder differs
            ORDER_DEPENDENT: 'ORDER-DEPENDENT' // Same position, same/unknown TriggerOrder
        };
    }

    /**
     * Determine the final writer for a field collision
     * @param {Object} collision - Collision object with writers array
     * @returns {Object} { finalWriter, confidence, rationale, orderPosition }
     */
    determineFinalWriter(collision) {
        if (!collision || !collision.writers || collision.writers.length === 0) {
            return {
                finalWriter: null,
                confidence: this.CONFIDENCE.ORDER_DEPENDENT,
                rationale: 'No writers provided',
                orderPosition: null
            };
        }

        // Single writer - no collision
        if (collision.writers.length === 1) {
            const writer = collision.writers[0];
            return {
                finalWriter: writer,
                confidence: this.CONFIDENCE.CERTAIN,
                rationale: 'Only one writer detected',
                orderPosition: this.getOrderPosition(writer)
            };
        }

        // Multiple writers - determine final writer
        return this.resolveMultipleWriters(collision.writers);
    }

    /**
     * Resolve final writer among multiple writers
     * @param {Array} writers - Array of writer objects
     * @returns {Object} Final writer determination
     */
    resolveMultipleWriters(writers) {
        // Map each writer to its execution order position
        const writerOrder = writers.map(writer => ({
            writer,
            orderPos: this.getOrderPosition(writer),
            triggerOrder: this.getTriggerOrder(writer)
        })).sort((a, b) => b.orderPos - a.orderPos); // Sort descending (last wins)

        const lastWriter = writerOrder[0];
        const secondLastWriter = writerOrder.length > 1 ? writerOrder[1] : null;

        // Check if there are writers with same order position
        const sameOrderWriters = writerOrder.filter(w => w.orderPos === lastWriter.orderPos);

        if (sameOrderWriters.length === 1) {
            // Clear winner: only one writer at this position
            return {
                finalWriter: lastWriter.writer,
                confidence: this.CONFIDENCE.CERTAIN,
                rationale: this.generateRationale(lastWriter, secondLastWriter, 'position'),
                orderPosition: lastWriter.orderPos
            };
        }

        // Multiple writers at same order position - check TriggerOrder
        if (this.canResolveTriggerOrder(sameOrderWriters)) {
            // Sort by TriggerOrder (highest wins for after-save flows)
            const sorted = sameOrderWriters.sort((a, b) =>
                (b.triggerOrder || 0) - (a.triggerOrder || 0)
            );

            const hasUniqueTriggerOrder = sorted[0].triggerOrder !== sorted[1]?.triggerOrder;

            if (hasUniqueTriggerOrder) {
                return {
                    finalWriter: sorted[0].writer,
                    confidence: this.CONFIDENCE.LIKELY,
                    rationale: this.generateRationale(sorted[0], sorted[1], 'trigger-order'),
                    orderPosition: sorted[0].orderPos
                };
            }
        }

        // Cannot deterministically resolve - mark as ORDER-DEPENDENT
        return {
            finalWriter: lastWriter.writer,
            confidence: this.CONFIDENCE.ORDER_DEPENDENT,
            rationale: this.generateRationale(lastWriter, secondLastWriter, 'non-deterministic'),
            orderPosition: lastWriter.orderPos,
            allCandidates: sameOrderWriters.map(w => w.writer.automationName)
        };
    }

    /**
     * Get execution order position for a writer
     * @param {Object} writer - Writer object with automationType and timing
     * @returns {number} Order position (1-13)
     */
    getOrderPosition(writer) {
        const type = writer.automationType || writer.type;
        const timing = writer.timing || '';

        // Map automation type to order position
        if (type === 'ApexTrigger') {
            return timing.includes('before') ? 2 : 5;
        }

        if (type === 'ValidationRule') {
            return 3;
        }

        if (type === 'DuplicateRule') {
            return 4;
        }

        if (type === 'AssignmentRule') {
            return 6;
        }

        if (type === 'AutoResponseRule') {
            return 7;
        }

        if (type === 'WorkflowRule') {
            return timing.includes('field update') || timing.includes('Field Update') ? 12 : 8;
        }

        if (type === 'EscalationRule') {
            return 9;
        }

        if (type === 'ProcessBuilder' || type === 'Process') {
            return 10;
        }

        if (type === 'Flow' || type === 'RecordTriggeredFlow') {
            // Flows run at position 11 (after Process Builder, before WF Field Updates)
            return 11;
        }

        if (type === 'Async' || type === 'Future' || type === 'Queueable' || type === 'Batch') {
            return 13;
        }

        // Default: treat as after-save (position 5)
        console.warn(`Unknown automation type: ${type}. Defaulting to position 5.`);
        return 5;
    }

    /**
     * Get TriggerOrder for Flow automations
     * @param {Object} writer - Writer object
     * @returns {number|null} TriggerOrder value or null
     */
    getTriggerOrder(writer) {
        const type = writer.automationType || writer.type;

        // TriggerOrder only applies to Flows
        if (type === 'Flow' || type === 'RecordTriggeredFlow') {
            return writer.triggerOrder || writer.TriggerOrder || null;
        }

        return null;
    }

    /**
     * Check if TriggerOrder can resolve the collision
     * @param {Array} writers - Writers at same order position
     * @returns {boolean} True if TriggerOrder can help
     */
    canResolveTriggerOrder(writers) {
        // TriggerOrder only resolves Flows
        const allFlows = writers.every(w => {
            const type = w.writer.automationType || w.writer.type;
            return type === 'Flow' || type === 'RecordTriggeredFlow';
        });

        if (!allFlows) {
            return false;
        }

        // Check if any writer has TriggerOrder defined
        return writers.some(w => w.triggerOrder != null);
    }

    /**
     * Generate human-readable rationale
     * @param {Object} winner - Winning writer with order info
     * @param {Object} runnerUp - Second-place writer
     * @param {string} resolutionType - How it was resolved
     * @returns {string} Rationale text
     */
    generateRationale(winner, runnerUp, resolutionType) {
        const winnerType = this.ORDER_OF_EXECUTION.find(o => o.position === winner.orderPos);
        const runnerUpType = runnerUp ? this.ORDER_OF_EXECUTION.find(o => o.position === runnerUp.orderPos) : null;

        if (resolutionType === 'position') {
            if (runnerUpType && runnerUpType.position !== winnerType.position) {
                return `${winnerType.label} execute after ${runnerUpType.label} in Salesforce standard order-of-execution. ${winnerType.label} run at position ${winnerType.position}, ${runnerUpType.label} run at position ${runnerUpType.position}.`;
            }
            return `${winnerType.label} execute at position ${winnerType.position} in the order-of-execution, after all other writers.`;
        }

        if (resolutionType === 'trigger-order') {
            const winnerOrder = winner.triggerOrder || 0;
            const runnerUpOrder = runnerUp?.triggerOrder || 0;
            return `Both writers are Flows at position ${winnerType.position}. ${winner.writer.automationName} has TriggerOrder ${winnerOrder}, which executes after ${runnerUp.writer.automationName} (TriggerOrder ${runnerUpOrder}).`;
        }

        if (resolutionType === 'non-deterministic') {
            return `Multiple writers execute at position ${winnerType.position} with same/unknown TriggerOrder. Execution order depends on database processing sequence and is non-deterministic. Test in target org to confirm final writer.`;
        }

        return 'Unable to determine final writer conclusively.';
    }

    /**
     * Get all execution order positions (for documentation)
     * @returns {Array} Order of execution steps
     */
    getOrderOfExecution() {
        return this.ORDER_OF_EXECUTION;
    }

    /**
     * Format final writer determination for display
     * @param {Object} determination - Result from determineFinalWriter()
     * @returns {string} Formatted text
     */
    formatDetermination(determination) {
        if (!determination || !determination.finalWriter) {
            return 'No final writer determined';
        }

        const { finalWriter, confidence, rationale, allCandidates } = determination;

        let output = `**Final Writer (${confidence})**: ${finalWriter.automationName}\n`;
        output += `**Rationale**: ${rationale}\n`;

        if (confidence === this.CONFIDENCE.ORDER_DEPENDENT && allCandidates) {
            output += `\n⚠️  **Non-deterministic**: All of these could potentially win:\n`;
            allCandidates.forEach(candidate => {
                output += `  - ${candidate}\n`;
            });
            output += `\n**Recommendation**: Test in target org to confirm actual winner.\n`;
        }

        return output;
    }
}

module.exports = ExecutionOrderResolver;
