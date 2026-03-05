/**
 * FlowConditionParser
 *
 * Parses natural language conditions into Salesforce Flow condition objects.
 * Supports common operators and auto-detects value types.
 *
 * Phase 2.3 Implementation - Advanced Decision Rules
 *
 * Usage:
 *   const parser = new FlowConditionParser();
 *   const condition = parser.parseCondition('Amount > 10000');
 *   // Returns: { leftValueReference: 'Amount', operator: 'GreaterThan', rightValue: { numberValue: 10000 } }
 *
 * @version 1.0.0
 * @date 2025-10-31
 */

class FlowConditionParser {
    constructor() {
        // Operator mappings: natural language ’ Flow operator
        this.operatorMap = {
            // Equality
            '=': 'EqualTo',
            'equals': 'EqualTo',
            'is': 'EqualTo',

            // Inequality
            '!=': 'NotEqualTo',
            '<>': 'NotEqualTo',
            'not equals': 'NotEqualTo',
            'is not': 'NotEqualTo',

            // Comparison
            '>': 'GreaterThan',
            'greater than': 'GreaterThan',
            '<': 'LessThan',
            'less than': 'LessThan',
            '>=': 'GreaterThanOrEqualTo',
            'at least': 'GreaterThanOrEqualTo',
            '<=': 'LessThanOrEqualTo',
            'at most': 'LessThanOrEqualTo',

            // String operations
            'contains': 'Contains',
            'starts with': 'StartsWith',
            'ends with': 'EndsWith',

            // Null checks
            'is null': 'IsNull',
            'is blank': 'IsNull',
            'is empty': 'IsNull'
        };

        // Operator regex patterns (ordered by specificity)
        this.operatorPatterns = [
            // Multi-word operators first
            { pattern: /\s+not equals\s+/i, operator: 'not equals' },
            { pattern: /\s+is not\s+/i, operator: 'is not' },
            { pattern: /\s+greater than\s+/i, operator: 'greater than' },
            { pattern: /\s+less than\s+/i, operator: 'less than' },
            { pattern: /\s+at least\s+/i, operator: 'at least' },
            { pattern: /\s+at most\s+/i, operator: 'at most' },
            { pattern: /\s+starts with\s+/i, operator: 'starts with' },
            { pattern: /\s+ends with\s+/i, operator: 'ends with' },
            { pattern: /\s+contains\s+/i, operator: 'contains' },
            { pattern: /\s+equals\s+/i, operator: 'equals' },
            { pattern: /\s+is null\s*/i, operator: 'is null' },
            { pattern: /\s+is blank\s*/i, operator: 'is blank' },
            { pattern: /\s+is empty\s*/i, operator: 'is empty' },
            { pattern: /\s+is\s+/i, operator: 'is' },

            // Symbol operators
            { pattern: /\s*!=\s*/,operator: '!=' },
            { pattern: /\s*<>\s*/, operator: '<>' },
            { pattern: /\s*>=\s*/, operator: '>=' },
            { pattern: /\s*<=\s*/, operator: '<=' },
            { pattern: /\s*>\s*/, operator: '>' },
            { pattern: /\s*<\s*/, operator: '<' },
            { pattern: /\s*=\s*/, operator: '=' }
        ];
    }

    /**
     * Parse natural language condition into Flow condition object
     * @param {string} conditionString - "Amount > 10000"
     * @returns {Object} Flow condition structure
     */
    parseCondition(conditionString) {
        const trimmed = conditionString.trim();

        // Find operator
        let operatorInfo = null;
        let leftPart = null;
        let rightPart = null;

        for (const { pattern, operator } of this.operatorPatterns) {
            const match = trimmed.match(pattern);
            if (match) {
                operatorInfo = {
                    operator: operator,
                    flowOperator: this.operatorMap[operator.toLowerCase()],
                    index: match.index,
                    length: match[0].length
                };

                leftPart = trimmed.substring(0, match.index).trim();
                rightPart = trimmed.substring(match.index + match[0].length).trim();

                // For null checks, right part is empty
                if (['is null', 'is blank', 'is empty'].includes(operator.toLowerCase())) {
                    rightPart = null;
                }

                break;
            }
        }

        if (!operatorInfo) {
            throw new Error(`Could not parse operator in condition: "${conditionString}"`);
        }

        if (!leftPart) {
            throw new Error(`Missing left operand in condition: "${conditionString}"`);
        }

        // Parse left side (should be field reference)
        const leftValue = this.parseValue(leftPart);

        // Build condition object
        const condition = {
            leftValueReference: leftValue.isReference ? leftValue.value : leftValue.value,
            operator: operatorInfo.flowOperator
        };

        // Parse right side (if not null check)
        if (rightPart !== null && rightPart !== '') {
            const rightValue = this.parseValue(rightPart);
            condition.rightValue = this.createValueObject(rightValue);
        }

        return condition;
    }

    /**
     * Parse value and detect type
     * @param {string} value - "10000", "'Pending'", "true", "AccountName", etc.
     * @returns {Object} { type, value, isReference }
     */
    parseValue(value) {
        const trimmed = value.trim();

        // Null values
        if (/^(null|blank|empty)$/i.test(trimmed)) {
            return { type: 'null', value: null, isReference: false };
        }

        // Boolean values
        if (trimmed.toLowerCase() === 'true') {
            return { type: 'boolean', value: true, isReference: false };
        }
        if (trimmed.toLowerCase() === 'false') {
            return { type: 'boolean', value: false, isReference: false };
        }

        // Quoted string (single or double quotes)
        const quotedMatch = trimmed.match(/^(['"])(.*)\1$/);
        if (quotedMatch) {
            return { type: 'string', value: quotedMatch[2], isReference: false };
        }

        // Number (integer or decimal, positive or negative)
        const numberMatch = trimmed.match(/^-?\d+(\.\d+)?$/);
        if (numberMatch) {
            return { type: 'number', value: parseFloat(trimmed), isReference: false };
        }

        // Otherwise, treat as field/variable reference
        return { type: 'reference', value: trimmed, isReference: true };
    }

    /**
     * Create Flow value object from parsed value
     * @param {Object} parsedValue - Result from parseValue()
     * @returns {Object} Flow value structure
     */
    createValueObject(parsedValue) {
        switch (parsedValue.type) {
            case 'string':
                return { stringValue: parsedValue.value };
            case 'number':
                return { numberValue: parsedValue.value };
            case 'boolean':
                return { booleanValue: parsedValue.value };
            case 'null':
                return { stringValue: null };
            case 'reference':
                return { elementReference: parsedValue.value };
            default:
                return { stringValue: String(parsedValue.value) };
        }
    }

    /**
     * Parse operator from natural language
     * @param {string} operator - ">", "equals", "contains", etc.
     * @returns {string} Flow operator
     */
    parseOperator(operator) {
        const normalized = operator.toLowerCase().trim();
        const flowOperator = this.operatorMap[normalized];

        if (!flowOperator) {
            throw new Error(`Unknown operator: "${operator}". Supported: ${Object.keys(this.operatorMap).join(', ')}`);
        }

        return flowOperator;
    }

    /**
     * Validate operator is compatible with value types
     * @param {string} flowOperator - Flow operator (EqualTo, GreaterThan, etc.)
     * @param {string} leftType - Left operand type (number, string, etc.)
     * @param {string} rightType - Right operand type
     * @returns {Object} { valid, error }
     */
    validateOperatorTypes(flowOperator, leftType, rightType) {
        // String-only operators
        const stringOnlyOperators = ['Contains', 'StartsWith', 'EndsWith'];
        if (stringOnlyOperators.includes(flowOperator)) {
            if (rightType !== 'string' && rightType !== 'reference') {
                return {
                    valid: false,
                    error: `Operator "${flowOperator}" requires string value, got ${rightType}`
                };
            }
        }

        // Comparison operators (prefer numbers/dates)
        const comparisonOperators = ['GreaterThan', 'LessThan', 'GreaterThanOrEqualTo', 'LessThanOrEqualTo'];
        if (comparisonOperators.includes(flowOperator)) {
            if (rightType !== 'number' && rightType !== 'reference') {
                return {
                    valid: false,
                    error: `Operator "${flowOperator}" typically requires number value, got ${rightType}. For dates, use field references.`
                };
            }
        }

        return { valid: true };
    }

    /**
     * Parse multiple conditions connected by AND/OR
     * @param {string} conditionsString - "Status = 'Pending' and Amount > 5000"
     * @returns {Object} { conditions, logic }
     */
    parseMultipleConditions(conditionsString) {
        const trimmed = conditionsString.trim();

        // Detect logic type
        let logic = 'and';
        let separator = null;

        // Check for OR first (more specific)
        if (/\s+or\s+/i.test(trimmed)) {
            logic = 'or';
            separator = /\s+or\s+/i;
        } else if (/\s+and\s+/i.test(trimmed)) {
            logic = 'and';
            separator = /\s+and\s+/i;
        }

        // Split by separator if found
        if (separator) {
            const parts = trimmed.split(separator);
            const conditions = parts.map(part => this.parseCondition(part.trim()));
            return { conditions, logic };
        }

        // Single condition
        return {
            conditions: [this.parseCondition(trimmed)],
            logic: 'and'
        };
    }
}

module.exports = FlowConditionParser;
