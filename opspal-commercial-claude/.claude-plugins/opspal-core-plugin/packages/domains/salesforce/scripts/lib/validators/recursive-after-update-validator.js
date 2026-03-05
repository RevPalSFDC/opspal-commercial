#!/usr/bin/env node

/**
 * Recursive After Update Validator
 *
 * Detects after-update Flows that update the same object that triggered them,
 * which can cause infinite recursion loops and hit governor limits.
 *
 * This is a common mistake that can bring down production systems.
 *
 * Best Practice: Use before-update Flows to modify the triggering record,
 * or implement recursion prevention logic in after-update Flows.
 *
 * @module recursive-after-update-validator
 */

class RecursiveAfterUpdateValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
    }

    /**
     * Validate for recursive after-update patterns
     * @param {Object} flow - Parsed flow object
     * @returns {Array} Array of recursive update violations
     */
    validate(flow) {
        const violations = [];

        // Check if this is an after-update Flow
        const triggerType = this._getTriggerType(flow);
        const triggerObject = this._getTriggerObject(flow);
        const label = this._getFlowLabel(flow);

        if (triggerType !== 'AfterUpdate' && triggerType !== 'RecordAfterSave') {
            return violations;
        }

        if (!triggerObject) {
            return violations;
        }

        // Find all Update Records elements
        const updateElements = this._getUpdateElements(flow);

        for (const updateElement of updateElements) {
            const elementName = this._getElementName(updateElement);
            const updateObject = this._getUpdateObject(updateElement);

            // Check if updating the same object
            if (updateObject === triggerObject) {
                // Check if recursion prevention is present
                const hasRecursionPrevention = this._hasRecursionPrevention(flow, updateElement);

                violations.push({
                    rule: 'RecursiveAfterUpdate',
                    severity: hasRecursionPrevention ? 'note' : 'error',
                    element: elementName,
                    message: hasRecursionPrevention
                        ? `After-update Flow '${label}' updates the same object (${updateObject}), but appears to have recursion prevention`
                        : `After-update Flow '${label}' updates the same object (${updateObject}), which can cause infinite recursion`,
                    recommendation: hasRecursionPrevention
                        ? 'Verify that recursion prevention logic is robust and handles all cases'
                        : 'Use before-update Flow to modify triggering record, or implement recursion prevention logic',
                    autoFixable: false,  // Requires architectural change
                    details: {
                        triggerObject: triggerObject,
                        updateObject: updateObject,
                        triggerType: triggerType,
                        elementName: elementName,
                        hasRecursionPrevention: hasRecursionPrevention,
                        label: label
                    }
                });

                if (this.verbose) {
                    const icon = hasRecursionPrevention ? 'ℹ️' : '❌';
                    console.log(`  ${icon} Recursive after-update: ${elementName} updates ${updateObject}`);
                }
            }
        }

        return violations;
    }

    /**
     * Get trigger type
     * @private
     */
    _getTriggerType(flow) {
        if (flow.triggerType) {
            return Array.isArray(flow.triggerType) ? flow.triggerType[0] : flow.triggerType;
        }

        // Check in start element
        if (flow.start && flow.start[0] && flow.start[0].recordTriggerType) {
            return Array.isArray(flow.start[0].recordTriggerType)
                ? flow.start[0].recordTriggerType[0]
                : flow.start[0].recordTriggerType;
        }

        return null;
    }

    /**
     * Get trigger object
     * @private
     */
    _getTriggerObject(flow) {
        if (flow.object) {
            return Array.isArray(flow.object) ? flow.object[0] : flow.object;
        }

        // Check in start element
        if (flow.start && flow.start[0] && flow.start[0].object) {
            return Array.isArray(flow.start[0].object)
                ? flow.start[0].object[0]
                : flow.start[0].object;
        }

        return null;
    }

    /**
     * Get all Update Records elements
     * @private
     */
    _getUpdateElements(flow) {
        if (!flow.recordUpdates) {
            return [];
        }

        return Array.isArray(flow.recordUpdates) ? flow.recordUpdates : [flow.recordUpdates];
    }

    /**
     * Get element name
     * @private
     */
    _getElementName(element) {
        if (element.name) {
            return Array.isArray(element.name) ? element.name[0] : element.name;
        }
        return 'Unknown';
    }

    /**
     * Get object being updated
     * @private
     */
    _getUpdateObject(updateElement) {
        if (updateElement.object) {
            return Array.isArray(updateElement.object) ? updateElement.object[0] : updateElement.object;
        }

        // Check if using inputReference (updating trigger record)
        if (updateElement.inputReference) {
            const ref = Array.isArray(updateElement.inputReference)
                ? updateElement.inputReference[0]
                : updateElement.inputReference;

            // If referencing $Record, it's the trigger record
            if (ref === '$Record' || ref === 'triggeredRecord') {
                return 'TriggerRecord';  // Will match trigger object
            }
        }

        return null;
    }

    /**
     * Check if Flow has recursion prevention logic
     * @private
     */
    _hasRecursionPrevention(flow, updateElement) {
        // Look for common recursion prevention patterns:
        // 1. Check for static variable or flag
        // 2. Check for decision before update
        // 3. Check for Set to track processed IDs

        // Check for variables that might be recursion flags
        const hasRecursionFlag = this._hasRecursionFlagVariable(flow);

        // Check for decision element before update
        const hasPreUpdateDecision = this._hasPreUpdateDecision(flow, updateElement);

        // Check for Set variable to track processed records
        const hasProcessedRecordsSet = this._hasProcessedRecordsSet(flow);

        return hasRecursionFlag || hasPreUpdateDecision || hasProcessedRecordsSet;
    }

    /**
     * Check for recursion flag variable
     * @private
     */
    _hasRecursionFlagVariable(flow) {
        if (!flow.variables) {
            return false;
        }

        const variables = Array.isArray(flow.variables) ? flow.variables : [flow.variables];

        for (const variable of variables) {
            const varName = this._getElementName(variable);

            // Look for variable names that suggest recursion prevention
            const recursionPatterns = [
                /recursive/i,
                /prevent/i,
                /guard/i,
                /flag/i,
                /already_?processed/i,
                /in_?progress/i
            ];

            for (const pattern of recursionPatterns) {
                if (pattern.test(varName)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Check for decision before update
     * @private
     */
    _hasPreUpdateDecision(flow, updateElement) {
        // This is a simplified check - would need full graph analysis for accuracy
        // Look for any decision elements
        if (!flow.decisions) {
            return false;
        }

        const decisions = Array.isArray(flow.decisions) ? flow.decisions : [flow.decisions];
        return decisions.length > 0;
    }

    /**
     * Check for Set to track processed records
     * @private
     */
    _hasProcessedRecordsSet(flow) {
        if (!flow.variables) {
            return false;
        }

        const variables = Array.isArray(flow.variables) ? flow.variables : [flow.variables];

        for (const variable of variables) {
            const dataType = variable.dataType
                ? (Array.isArray(variable.dataType) ? variable.dataType[0] : variable.dataType)
                : null;

            const varName = this._getElementName(variable);

            // Look for Set or Collection variables for tracking
            if (dataType === 'Set' || dataType === 'SObject' && variable.isCollection) {
                const trackingPatterns = [
                    /processed/i,
                    /tracked/i,
                    /handled/i,
                    /ids/i
                ];

                for (const pattern of trackingPatterns) {
                    if (pattern.test(varName)) {
                        return true;
                    }
                }
            }
        }

        return false;
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

module.exports = RecursiveAfterUpdateValidator;
