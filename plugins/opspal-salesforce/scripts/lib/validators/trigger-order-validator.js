#!/usr/bin/env node

/**
 * Trigger Order Validator
 *
 * Validates that Record-Triggered Flows have appropriate trigger order settings.
 * Trigger order determines execution sequence when multiple Flows are triggered
 * by the same event on the same object.
 *
 * Best Practice: Set explicit trigger order (typically 1000 as default) rather
 * than leaving it null, which can cause unpredictable execution order.
 *
 * @module trigger-order-validator
 */

class TriggerOrderValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
    }

    /**
     * Validate trigger order setting
     * @param {Object} flow - Parsed flow object
     * @returns {Array} Array of trigger order violations
     */
    validate(flow) {
        const violations = [];

        const processType = this._getProcessType(flow);
        const label = this._getFlowLabel(flow);

        // Only applicable to Record-Triggered Flows
        if (processType !== 'AutoLaunchedFlow' && processType !== 'InvocableProcess') {
            return violations;
        }

        // Check if this is actually a record-triggered flow
        const triggerType = this._getTriggerType(flow);
        if (!triggerType || triggerType === 'None') {
            return violations;
        }

        const triggerOrder = this._getTriggerOrder(flow);

        // Check if trigger order is not set
        if (triggerOrder === null || triggerOrder === undefined) {
            violations.push({
                rule: 'TriggerOrder',
                severity: 'warning',
                element: 'Flow',
                message: `Record-Triggered Flow '${label}' does not have a trigger order set`,
                recommendation: 'Set explicit trigger order (1000 is recommended default) to ensure predictable execution sequence',
                autoFixable: true,
                details: {
                    currentValue: triggerOrder,
                    recommendedValue: 1000,
                    processType: processType,
                    triggerType: triggerType,
                    label: label
                }
            });

            if (this.verbose) {
                console.log(`  ⚠️  Missing trigger order: ${label}`);
            }
        } else if (triggerOrder < 1 || triggerOrder > 2000) {
            // Check if trigger order is outside recommended range
            violations.push({
                rule: 'TriggerOrder',
                severity: 'note',
                element: 'Flow',
                message: `Record-Triggered Flow '${label}' has trigger order ${triggerOrder} outside recommended range (1-2000)`,
                recommendation: 'Use trigger order between 1-2000, with 1000 as typical default',
                autoFixable: false,
                details: {
                    currentValue: triggerOrder,
                    recommendedRange: '1-2000',
                    label: label
                }
            });

            if (this.verbose) {
                console.log(`  ℹ️  Unusual trigger order: ${label} (${triggerOrder})`);
            }
        }

        return violations;
    }

    /**
     * Get Flow process type
     * @private
     */
    _getProcessType(flow) {
        if (flow.processType) {
            return Array.isArray(flow.processType) ? flow.processType[0] : flow.processType;
        }
        return null;
    }

    /**
     * Get trigger type
     * @private
     */
    _getTriggerType(flow) {
        if (flow.triggerType) {
            return Array.isArray(flow.triggerType) ? flow.triggerType[0] : flow.triggerType;
        }

        // Check for start element with recordTriggerType
        if (flow.start && flow.start[0] && flow.start[0].recordTriggerType) {
            return Array.isArray(flow.start[0].recordTriggerType)
                ? flow.start[0].recordTriggerType[0]
                : flow.start[0].recordTriggerType;
        }

        return null;
    }

    /**
     * Get trigger order
     * @private
     */
    _getTriggerOrder(flow) {
        // Check for triggerOrder field
        if (flow.triggerOrder !== undefined) {
            const order = Array.isArray(flow.triggerOrder) ? flow.triggerOrder[0] : flow.triggerOrder;
            return order ? parseInt(order, 10) : null;
        }

        // Check in start element
        if (flow.start && flow.start[0] && flow.start[0].triggerOrder !== undefined) {
            const order = Array.isArray(flow.start[0].triggerOrder)
                ? flow.start[0].triggerOrder[0]
                : flow.start[0].triggerOrder;
            return order ? parseInt(order, 10) : null;
        }

        return null;
    }

    /**
     * Get Flow label
     * @private
     */
    _getFlowLabel(flow) {
        if (flow.label) {
            return Array.isArray(flow.label) ? flow.label[0] : flow.label;
        }
        if (flow.fullName) {
            return Array.isArray(flow.fullName) ? flow.fullName[0] : flow.fullName;
        }
        return 'Unknown';
    }
}

module.exports = TriggerOrderValidator;
