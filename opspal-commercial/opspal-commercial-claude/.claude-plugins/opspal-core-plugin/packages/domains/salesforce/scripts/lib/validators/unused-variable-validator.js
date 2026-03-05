#!/usr/bin/env node

/**
 * Unused Variable Validator
 *
 * Detects Flow variables that are declared but never referenced.
 * This is a performance and maintainability issue - unused variables
 * clutter the Flow and can cause confusion.
 *
 * @module unused-variable-validator
 */

class UnusedVariableValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
    }

    /**
     * Validate for unused variables
     * @param {Object} flow - Parsed flow object
     * @returns {Array} Array of unused variable violations
     */
    validate(flow) {
        const violations = [];

        // Get all declared variables
        const declaredVariables = this._getDeclaredVariables(flow);

        // Get all referenced variables
        const referencedVariables = this._getReferencedVariables(flow);

        // Find unused variables
        for (const varName of declaredVariables) {
            if (!referencedVariables.has(varName)) {
                violations.push({
                    rule: 'UnusedVariable',
                    severity: 'warning',
                    element: varName,
                    message: `Variable '${varName}' is declared but never used`,
                    recommendation: 'Remove unused variable to improve Flow clarity and performance',
                    autoFixable: true
                });

                if (this.verbose) {
                    console.log(`  ⚠️  Unused variable: ${varName}`);
                }
            }
        }

        return violations;
    }

    /**
     * Get all declared variables
     * @private
     */
    _getDeclaredVariables(flow) {
        const variables = new Set();

        const varTypes = ['variables', 'constants', 'formulas', 'textTemplates'];

        for (const varType of varTypes) {
            if (flow[varType]) {
                const items = Array.isArray(flow[varType]) ? flow[varType] : [flow[varType]];

                for (const item of items) {
                    if (item.name) {
                        const name = Array.isArray(item.name) ? item.name[0] : item.name;
                        variables.add(name);
                    }
                }
            }
        }

        return variables;
    }

    /**
     * Find all variable references in the Flow
     * @private
     */
    _getReferencedVariables(flow) {
        const references = new Set();

        // Search in element types that can reference variables
        const elementTypes = [
            'assignments',
            'decisions',
            'loops',
            'recordLookups',
            'recordCreates',
            'recordUpdates',
            'recordDeletes',
            'actionCalls',
            'screens',
            'subflows',
            'waits',
            'collectionProcessors'
        ];

        for (const elementType of elementTypes) {
            if (flow[elementType]) {
                const elements = Array.isArray(flow[elementType]) ? flow[elementType] : [flow[elementType]];

                for (const element of elements) {
                    this._findReferencesInElement(element, references);
                }
            }
        }

        // Search in formulas (formulas can reference variables)
        if (flow.formulas) {
            const formulas = Array.isArray(flow.formulas) ? flow.formulas : [flow.formulas];

            for (const formula of formulas) {
                if (formula.expression) {
                    const expression = Array.isArray(formula.expression) ? formula.expression[0] : formula.expression;
                    this._findReferencesInExpression(expression, references);
                }
            }
        }

        return references;
    }

    /**
     * Find references in a single element
     * @private
     */
    _findReferencesInElement(element, references) {
        // Recursively search all properties
        for (const [key, value] of Object.entries(element)) {
            if (key === 'elementReference') {
                // Direct element reference
                const ref = Array.isArray(value) ? value[0] : value;
                if (ref) {
                    references.add(ref);
                }
            } else if (key === 'leftValueReference' || key === 'rightValueReference') {
                // Assignment references
                const ref = Array.isArray(value) ? value[0] : value;
                if (ref) {
                    references.add(ref);
                }
            } else if (key === 'assignToReference') {
                // Assignment target
                const ref = Array.isArray(value) ? value[0] : value;
                if (ref) {
                    references.add(ref);
                }
            } else if (key === 'value' && typeof value === 'object' && value !== null) {
                // Value objects may contain elementReference
                if (value.elementReference) {
                    const ref = Array.isArray(value.elementReference) ? value.elementReference[0] : value.elementReference;
                    if (ref) {
                        references.add(ref);
                    }
                }
            } else if (key === 'expression' && typeof value === 'string') {
                // Formulas can reference variables
                this._findReferencesInExpression(value, references);
            } else if (Array.isArray(value)) {
                // Recurse into arrays
                for (const item of value) {
                    if (typeof item === 'object' && item !== null) {
                        this._findReferencesInElement(item, references);
                    }
                }
            } else if (typeof value === 'object' && value !== null) {
                // Recurse into nested objects
                this._findReferencesInElement(value, references);
            }
        }
    }

    /**
     * Find variable references in formula expressions
     * @private
     */
    _findReferencesInExpression(expression, references) {
        if (!expression) return;

        const expr = Array.isArray(expression) ? expression[0] : expression;

        // Pattern to match {!VariableName} or $Record.VariableName
        const patterns = [
            /\{\!([a-zA-Z_][a-zA-Z0-9_]*)\}/g,  // {!Variable}
            /\$Record\.([a-zA-Z_][a-zA-Z0-9_]*)/g  // $Record.Variable
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(expr)) !== null) {
                references.add(match[1]);
            }
        }
    }
}

module.exports = UnusedVariableValidator;
