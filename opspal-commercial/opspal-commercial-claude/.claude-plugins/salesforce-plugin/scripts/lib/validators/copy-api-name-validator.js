#!/usr/bin/env node

/**
 * Copy API Name Validator
 *
 * Detects Flow API names that indicate they were created via "Save As" or copy operation.
 * Names like "Copy_of_Original", "X_Copy", or similar patterns indicate the Flow was
 * duplicated but not properly renamed, which is poor practice.
 *
 * @module copy-api-name-validator
 */

class CopyAPINameValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
    }

    /**
     * Validate for copy-style API names
     * @param {Object} flow - Parsed flow object
     * @returns {Array} Array of copy name violations
     */
    validate(flow) {
        const violations = [];

        // Get Flow API name
        const apiName = this._getFlowApiName(flow);
        const label = this._getFlowLabel(flow);

        if (!apiName) {
            return violations;
        }

        // Check for copy patterns
        const copyPatterns = [
            /^Copy_of_/i,           // Copy_of_OriginalFlow
            /^X\d*_Copy/i,          // X_Copy, X2_Copy
            /_Copy$/i,              // OriginalFlow_Copy
            /_copy_\d+$/i,          // OriginalFlow_copy_1
            /\(Copy\)/i,            // OriginalFlow(Copy)
            /\(Copy \d+\)/i,        // OriginalFlow(Copy 2)
            /_duplicate/i,          // OriginalFlow_duplicate
            /_v\d+_copy/i           // OriginalFlow_v2_copy
        ];

        let matchedPattern = null;
        for (const pattern of copyPatterns) {
            if (pattern.test(apiName)) {
                matchedPattern = pattern.toString();
                break;
            }
        }

        if (matchedPattern) {
            violations.push({
                rule: 'CopyAPIName',
                severity: 'warning',
                element: 'Flow',
                message: `Flow API name '${apiName}' indicates it was copied but not renamed`,
                recommendation: 'Rename Flow to a descriptive name that reflects its purpose',
                autoFixable: false,  // Requires user input for new name
                details: {
                    currentName: apiName,
                    label: label,
                    pattern: matchedPattern
                }
            });

            if (this.verbose) {
                console.log(`  ⚠️  Copy-style API name detected: ${apiName}`);
            }
        }

        // Also check label for copy patterns
        if (label && label !== apiName) {
            for (const pattern of copyPatterns) {
                if (pattern.test(label)) {
                    violations.push({
                        rule: 'CopyAPIName',
                        severity: 'note',
                        element: 'Flow',
                        message: `Flow label '${label}' indicates it was copied but not renamed`,
                        recommendation: 'Update Flow label to reflect its purpose',
                        autoFixable: false
                    });

                    if (this.verbose) {
                        console.log(`  ℹ️  Copy-style label detected: ${label}`);
                    }
                    break;
                }
            }
        }

        return violations;
    }

    /**
     * Get Flow API name
     * @private
     */
    _getFlowApiName(flow) {
        if (flow.apiName) {
            return Array.isArray(flow.apiName) ? flow.apiName[0] : flow.apiName;
        }
        if (flow.fullName) {
            return Array.isArray(flow.fullName) ? flow.fullName[0] : flow.fullName;
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
        return null;
    }
}

module.exports = CopyAPINameValidator;
