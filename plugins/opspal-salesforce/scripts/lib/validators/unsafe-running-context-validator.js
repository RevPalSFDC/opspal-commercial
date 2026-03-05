#!/usr/bin/env node

/**
 * Unsafe Running Context Validator
 *
 * Flags Flows configured to run in "System Mode without Sharing".
 * This bypasses sharing rules and field-level security, which can lead
 * to security vulnerabilities if not carefully managed.
 *
 * Best Practice: Use "System Mode with Sharing" unless there's a specific
 * business requirement to bypass sharing rules, and document the reason.
 *
 * @module unsafe-running-context-validator
 */

class UnsafeRunningContextValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
    }

    /**
     * Validate running context setting
     * @param {Object} flow - Parsed flow object
     * @returns {Array} Array of unsafe context violations
     */
    validate(flow) {
        const violations = [];

        const runInMode = this._getRunInMode(flow);
        const label = this._getFlowLabel(flow);
        const processType = this._getProcessType(flow);

        // Check for "System Mode without Sharing"
        if (runInMode === 'SystemModeWithoutSharing') {
            violations.push({
                rule: 'UnsafeRunningContext',
                severity: 'warning',
                element: 'Flow',
                message: `Flow '${label}' runs in System Mode without Sharing, bypassing all sharing rules`,
                recommendation: 'Change to "System Mode with Sharing" unless there is a documented business requirement to bypass sharing rules',
                autoFixable: false,  // Requires security review
                details: {
                    currentMode: runInMode,
                    recommendedMode: 'SystemModeWithSharing',
                    processType: processType,
                    label: label,
                    securityRisk: 'Users may access records they should not have access to'
                }
            });

            if (this.verbose) {
                console.log(`  ⚠️  Unsafe running context: ${label} (${runInMode})`);
            }
        } else if (runInMode === 'DefaultMode') {
            // DefaultMode can be problematic for auto-launched flows
            if (processType === 'AutoLaunchedFlow') {
                violations.push({
                    rule: 'UnsafeRunningContext',
                    severity: 'note',
                    element: 'Flow',
                    message: `Auto-launched Flow '${label}' uses Default Mode, which may lead to inconsistent security behavior`,
                    recommendation: 'Explicitly set to "System Mode with Sharing" or "User Mode" for predictable security behavior',
                    autoFixable: false,
                    details: {
                        currentMode: runInMode,
                        recommendedMode: 'SystemModeWithSharing or User',
                        processType: processType,
                        label: label
                    }
                });

                if (this.verbose) {
                    console.log(`  ℹ️  Default running context: ${label} (may be inconsistent)`);
                }
            }
        }

        return violations;
    }

    /**
     * Get running mode
     * @private
     */
    _getRunInMode(flow) {
        if (flow.runInMode) {
            return Array.isArray(flow.runInMode) ? flow.runInMode[0] : flow.runInMode;
        }

        // Check in start element (older API versions)
        if (flow.start && flow.start[0]) {
            const start = flow.start[0];
            if (start.runInMode) {
                return Array.isArray(start.runInMode) ? start.runInMode[0] : start.runInMode;
            }
        }

        // Default is DefaultMode
        return 'DefaultMode';
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

module.exports = UnsafeRunningContextValidator;
