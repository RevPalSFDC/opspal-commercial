#!/usr/bin/env node

/**
 * Auto Layout Validator
 *
 * Checks if auto-layout is enabled for the Flow.
 * Auto-layout improves Flow diagram readability and maintainability
 * by automatically organizing elements in a logical flow.
 *
 * Salesforce Best Practice: Enable auto-layout for all Flows.
 *
 * @module auto-layout-validator
 */

class AutoLayoutValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
    }

    /**
     * Validate auto-layout setting
     * @param {Object} flow - Parsed flow object
     * @returns {Array} Array of auto-layout violations
     */
    validate(flow) {
        const violations = [];

        const autoLayout = this._getAutoLayout(flow);
        const label = this._getFlowLabel(flow);

        // Check if auto-layout is disabled
        if (autoLayout === false || autoLayout === 'false') {
            violations.push({
                rule: 'AutoLayout',
                severity: 'note',
                element: 'Flow',
                message: `Flow '${label}' has auto-layout disabled`,
                recommendation: 'Enable auto-layout to improve Flow diagram readability and maintainability',
                autoFixable: true,
                details: {
                    currentValue: autoLayout,
                    label: label
                }
            });

            if (this.verbose) {
                console.log(`  ℹ️  Auto-layout disabled: ${label}`);
            }
        }

        return violations;
    }

    /**
     * Get auto-layout setting
     * @private
     */
    _getAutoLayout(flow) {
        // Check for runInMode setting (newer API versions)
        if (flow.runInMode) {
            const runInMode = Array.isArray(flow.runInMode) ? flow.runInMode[0] : flow.runInMode;
            // If runInMode exists, auto-layout is typically enabled
            return true;
        }

        // Check for explicit autoLayout field
        if (flow.autoLayout !== undefined) {
            const autoLayout = Array.isArray(flow.autoLayout) ? flow.autoLayout[0] : flow.autoLayout;
            return autoLayout === 'true' || autoLayout === true;
        }

        // Check for locationX/locationY coordinates (indicates manual layout)
        const elementTypes = [
            'decisions',
            'loops',
            'recordLookups',
            'recordCreates',
            'recordUpdates',
            'recordDeletes',
            'assignments',
            'actionCalls',
            'screens',
            'subflows'
        ];

        for (const elementType of elementTypes) {
            if (flow[elementType]) {
                const elements = Array.isArray(flow[elementType]) ? flow[elementType] : [flow[elementType]];

                for (const element of elements) {
                    // If we find manual coordinates, auto-layout is disabled
                    if (element.locationX || element.locationY) {
                        return false;
                    }
                }
            }
        }

        // Default to true (auto-layout is the default in newer API versions)
        return true;
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

module.exports = AutoLayoutValidator;
