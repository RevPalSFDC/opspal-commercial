#!/usr/bin/env node

/**
 * Inactive Flow Validator
 *
 * Flags Flows that have never been activated after creation.
 * Inactive Flows can indicate abandoned work, incomplete development,
 * or forgotten test Flows that should be cleaned up.
 *
 * @module inactive-flow-validator
 */

class InactiveFlowValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
    }

    /**
     * Validate Flow activation status
     * @param {Object} flow - Parsed flow object
     * @returns {Array} Array of inactive flow violations
     */
    validate(flow) {
        const violations = [];

        const status = this._getFlowStatus(flow);
        const label = this._getFlowLabel(flow);
        const processType = this._getProcessType(flow);

        // Check if Flow is inactive
        if (status === 'Draft' || status === 'Obsolete') {
            const severity = status === 'Obsolete' ? 'warning' : 'note';

            violations.push({
                rule: 'InactiveFlow',
                severity: severity,
                element: 'Flow',
                message: `Flow '${label}' has status '${status}' and has not been activated`,
                recommendation: status === 'Obsolete'
                    ? 'Consider deleting this obsolete Flow if it is no longer needed'
                    : 'Activate the Flow if ready for production, or delete if abandoned',
                autoFixable: false,  // User decision required
                details: {
                    status: status,
                    processType: processType,
                    label: label
                }
            });

            if (this.verbose) {
                console.log(`  ${severity === 'warning' ? '⚠️' : 'ℹ️'}  Inactive Flow: ${label} (${status})`);
            }
        }

        return violations;
    }

    /**
     * Get Flow status
     * @private
     */
    _getFlowStatus(flow) {
        if (flow.status) {
            const status = Array.isArray(flow.status) ? flow.status[0] : flow.status;
            return status;
        }

        // If no status field, assume Draft
        return 'Draft';
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

    /**
     * Get Flow process type
     * @private
     */
    _getProcessType(flow) {
        if (flow.processType) {
            return Array.isArray(flow.processType) ? flow.processType[0] : flow.processType;
        }
        return 'Unknown';
    }
}

module.exports = InactiveFlowValidator;
