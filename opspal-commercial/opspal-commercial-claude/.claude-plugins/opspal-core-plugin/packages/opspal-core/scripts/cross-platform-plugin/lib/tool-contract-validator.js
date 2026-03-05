#!/usr/bin/env node

/**
 * Tool Contract Validator - Validate tool inputs/outputs against schemas
 *
 * Validates tool interface contracts to prevent cascading failures
 * when tools return unexpected formats or missing required fields.
 *
 * @version 1.0.0
 * @date 2025-12-10
 */

const fs = require('fs');
const path = require('path');

class ToolContractValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.strictMode = options.strictMode !== false; // Default strict
        this.contracts = new Map();
        this.validationHistory = [];
        this.maxHistorySize = options.maxHistorySize || 1000;

        // Load contracts from config if path provided
        if (options.contractsPath) {
            this.loadContracts(options.contractsPath);
        }
    }

    /**
     * Register a tool contract
     * @param {string} toolName - Name of the tool
     * @param {Object} contract - Contract definition
     */
    registerContract(toolName, contract) {
        const validated = this._validateContractDefinition(contract);
        if (!validated.valid) {
            throw new Error(`Invalid contract for ${toolName}: ${validated.errors.join(', ')}`);
        }

        this.contracts.set(toolName, {
            ...contract,
            registeredAt: new Date().toISOString()
        });

        if (this.verbose) {
            console.log(`[CONTRACT] Registered contract for: ${toolName}`);
        }

        return this;
    }

    /**
     * Load contracts from a JSON file
     * @param {string} filePath - Path to contracts JSON file
     */
    loadContracts(filePath) {
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            for (const [toolName, contract] of Object.entries(data.contracts || data)) {
                this.registerContract(toolName, contract);
            }
            if (this.verbose) {
                console.log(`[CONTRACT] Loaded ${this.contracts.size} contracts from ${filePath}`);
            }
        } catch (error) {
            if (this.verbose) {
                console.error(`[CONTRACT] Failed to load contracts: ${error.message}`);
            }
        }
        return this;
    }

    /**
     * Validate contract definition itself
     */
    _validateContractDefinition(contract) {
        const errors = [];

        if (!contract) {
            errors.push('Contract is null or undefined');
            return { valid: false, errors };
        }

        // Input schema is optional but if present must be valid
        if (contract.input && typeof contract.input !== 'object') {
            errors.push('Input schema must be an object');
        }

        // Output schema is optional but if present must be valid
        if (contract.output && typeof contract.output !== 'object') {
            errors.push('Output schema must be an object');
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Validate input against a tool's contract
     * @param {string} toolName - Tool name
     * @param {*} input - Input to validate
     * @returns {Object} Validation result
     */
    validateInput(toolName, input) {
        const contract = this.contracts.get(toolName);

        if (!contract) {
            if (this.strictMode) {
                return this._createResult(false, [`No contract registered for tool: ${toolName}`], toolName, 'input');
            }
            return this._createResult(true, [], toolName, 'input', 'No contract - validation skipped');
        }

        if (!contract.input) {
            return this._createResult(true, [], toolName, 'input', 'No input schema defined');
        }

        const errors = this._validateAgainstSchema(input, contract.input, 'input');
        return this._createResult(errors.length === 0, errors, toolName, 'input');
    }

    /**
     * Validate output against a tool's contract
     * @param {string} toolName - Tool name
     * @param {*} output - Output to validate
     * @returns {Object} Validation result
     */
    validateOutput(toolName, output) {
        const contract = this.contracts.get(toolName);

        if (!contract) {
            if (this.strictMode) {
                return this._createResult(false, [`No contract registered for tool: ${toolName}`], toolName, 'output');
            }
            return this._createResult(true, [], toolName, 'output', 'No contract - validation skipped');
        }

        if (!contract.output) {
            return this._createResult(true, [], toolName, 'output', 'No output schema defined');
        }

        const errors = this._validateAgainstSchema(output, contract.output, 'output');
        return this._createResult(errors.length === 0, errors, toolName, 'output');
    }

    /**
     * Validate both input and output
     * @param {string} toolName - Tool name
     * @param {*} input - Input value
     * @param {*} output - Output value
     * @returns {Object} Combined validation result
     */
    validate(toolName, input, output) {
        const inputResult = this.validateInput(toolName, input);
        const outputResult = this.validateOutput(toolName, output);

        return {
            valid: inputResult.valid && outputResult.valid,
            input: inputResult,
            output: outputResult,
            toolName,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Validate value against schema
     */
    _validateAgainstSchema(value, schema, path = '') {
        const errors = [];

        // Handle null/undefined
        if (value === null || value === undefined) {
            if (schema.required) {
                errors.push(`${path}: Value is required but got ${value}`);
            }
            return errors;
        }

        // Type validation
        if (schema.type) {
            const actualType = Array.isArray(value) ? 'array' : typeof value;
            const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];

            if (!expectedTypes.includes(actualType) && !expectedTypes.includes('any')) {
                errors.push(`${path}: Expected type ${expectedTypes.join('|')} but got ${actualType}`);
            }
        }

        // Array validation
        if (Array.isArray(value) && schema.items) {
            value.forEach((item, index) => {
                const itemErrors = this._validateAgainstSchema(item, schema.items, `${path}[${index}]`);
                errors.push(...itemErrors);
            });

            if (schema.minItems !== undefined && value.length < schema.minItems) {
                errors.push(`${path}: Array must have at least ${schema.minItems} items`);
            }

            if (schema.maxItems !== undefined && value.length > schema.maxItems) {
                errors.push(`${path}: Array must have at most ${schema.maxItems} items`);
            }
        }

        // Object validation
        if (typeof value === 'object' && !Array.isArray(value) && schema.properties) {
            // Check required properties
            const requiredProps = schema.required || [];
            for (const prop of requiredProps) {
                if (!(prop in value)) {
                    errors.push(`${path}.${prop}: Required property is missing`);
                }
            }

            // Validate each property
            for (const [propName, propSchema] of Object.entries(schema.properties)) {
                if (propName in value) {
                    const propErrors = this._validateAgainstSchema(
                        value[propName],
                        propSchema,
                        path ? `${path}.${propName}` : propName
                    );
                    errors.push(...propErrors);
                }
            }

            // Check for extra properties if additionalProperties is false
            if (schema.additionalProperties === false) {
                const allowedProps = Object.keys(schema.properties);
                for (const prop of Object.keys(value)) {
                    if (!allowedProps.includes(prop)) {
                        errors.push(`${path}.${prop}: Additional property not allowed`);
                    }
                }
            }
        }

        // String validation
        if (typeof value === 'string') {
            if (schema.minLength !== undefined && value.length < schema.minLength) {
                errors.push(`${path}: String must be at least ${schema.minLength} characters`);
            }

            if (schema.maxLength !== undefined && value.length > schema.maxLength) {
                errors.push(`${path}: String must be at most ${schema.maxLength} characters`);
            }

            if (schema.pattern) {
                const regex = new RegExp(schema.pattern);
                if (!regex.test(value)) {
                    errors.push(`${path}: String does not match pattern ${schema.pattern}`);
                }
            }

            if (schema.enum && !schema.enum.includes(value)) {
                errors.push(`${path}: Value must be one of: ${schema.enum.join(', ')}`);
            }
        }

        // Number validation
        if (typeof value === 'number') {
            if (schema.minimum !== undefined && value < schema.minimum) {
                errors.push(`${path}: Value must be >= ${schema.minimum}`);
            }

            if (schema.maximum !== undefined && value > schema.maximum) {
                errors.push(`${path}: Value must be <= ${schema.maximum}`);
            }

            if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
                errors.push(`${path}: Value must be > ${schema.exclusiveMinimum}`);
            }

            if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
                errors.push(`${path}: Value must be < ${schema.exclusiveMaximum}`);
            }
        }

        return errors;
    }

    /**
     * Create validation result and record history
     */
    _createResult(valid, errors, toolName, phase, note = null) {
        const result = {
            valid,
            errors,
            toolName,
            phase,
            timestamp: new Date().toISOString(),
            note
        };

        // Record in history
        this.validationHistory.push(result);
        if (this.validationHistory.length > this.maxHistorySize) {
            this.validationHistory.shift();
        }

        if (this.verbose && !valid) {
            console.error(`[CONTRACT] Validation failed for ${toolName} (${phase}): ${errors.join(', ')}`);
        }

        return result;
    }

    /**
     * Get contract for a tool
     * @param {string} toolName - Tool name
     * @returns {Object|null} Contract or null
     */
    getContract(toolName) {
        return this.contracts.get(toolName) || null;
    }

    /**
     * List all registered contracts
     * @returns {Array} List of tool names with contracts
     */
    listContracts() {
        return Array.from(this.contracts.keys());
    }

    /**
     * Get validation statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const total = this.validationHistory.length;
        const passed = this.validationHistory.filter(r => r.valid).length;
        const failed = total - passed;

        const byTool = {};
        for (const result of this.validationHistory) {
            if (!byTool[result.toolName]) {
                byTool[result.toolName] = { total: 0, passed: 0, failed: 0 };
            }
            byTool[result.toolName].total++;
            if (result.valid) {
                byTool[result.toolName].passed++;
            } else {
                byTool[result.toolName].failed++;
            }
        }

        return {
            totalValidations: total,
            passed,
            failed,
            passRate: total > 0 ? passed / total : 0,
            registeredContracts: this.contracts.size,
            byTool
        };
    }

    /**
     * Get recent failures
     * @param {number} limit - Max failures to return
     * @returns {Array} Recent failures
     */
    getRecentFailures(limit = 10) {
        return this.validationHistory
            .filter(r => !r.valid)
            .slice(-limit);
    }

    /**
     * Generate contract documentation
     * @param {string} toolName - Tool name (optional - all if not provided)
     * @returns {string} Markdown documentation
     */
    generateDocumentation(toolName = null) {
        const tools = toolName ? [toolName] : this.listContracts();
        const lines = ['# Tool Contract Documentation\n'];

        for (const name of tools) {
            const contract = this.getContract(name);
            if (!contract) continue;

            lines.push(`## ${name}\n`);

            if (contract.description) {
                lines.push(`${contract.description}\n`);
            }

            if (contract.input) {
                lines.push('### Input Schema\n');
                lines.push('```json');
                lines.push(JSON.stringify(contract.input, null, 2));
                lines.push('```\n');
            }

            if (contract.output) {
                lines.push('### Output Schema\n');
                lines.push('```json');
                lines.push(JSON.stringify(contract.output, null, 2));
                lines.push('```\n');
            }

            lines.push('---\n');
        }

        return lines.join('\n');
    }

    /**
     * Create a wrapper function that validates input/output
     * @param {string} toolName - Tool name
     * @param {Function} fn - Function to wrap
     * @returns {Function} Wrapped function with validation
     */
    wrap(toolName, fn) {
        const validator = this;

        return async function validatedTool(...args) {
            // Validate input
            const input = args.length === 1 ? args[0] : args;
            const inputResult = validator.validateInput(toolName, input);

            if (!inputResult.valid) {
                const error = new Error(`Contract violation (input): ${inputResult.errors.join(', ')}`);
                error.contractViolation = true;
                error.phase = 'input';
                error.errors = inputResult.errors;
                throw error;
            }

            // Execute function
            const output = await fn.apply(this, args);

            // Validate output
            const outputResult = validator.validateOutput(toolName, output);

            if (!outputResult.valid) {
                const error = new Error(`Contract violation (output): ${outputResult.errors.join(', ')}`);
                error.contractViolation = true;
                error.phase = 'output';
                error.errors = outputResult.errors;
                throw error;
            }

            return output;
        };
    }

    /**
     * Clear validation history
     */
    clearHistory() {
        this.validationHistory = [];
        return this;
    }

    /**
     * Export contracts to JSON
     * @returns {string} JSON string
     */
    exportContracts() {
        const contracts = {};
        for (const [name, contract] of this.contracts.entries()) {
            contracts[name] = contract;
        }
        return JSON.stringify({ contracts, exportedAt: new Date().toISOString() }, null, 2);
    }
}

// Common contract templates
const ContractTemplates = {
    // Standard API response
    apiResponse: {
        type: 'object',
        required: ['success'],
        properties: {
            success: { type: 'boolean' },
            data: { type: 'any' },
            error: { type: 'string' },
            timestamp: { type: 'string' }
        }
    },

    // Salesforce query result
    salesforceQuery: {
        type: 'object',
        required: ['totalSize', 'done', 'records'],
        properties: {
            totalSize: { type: 'number', minimum: 0 },
            done: { type: 'boolean' },
            records: { type: 'array' }
        }
    },

    // File operation result
    fileOperation: {
        type: 'object',
        required: ['success', 'path'],
        properties: {
            success: { type: 'boolean' },
            path: { type: 'string' },
            bytes: { type: 'number' },
            error: { type: 'string' }
        }
    },

    // Validation result
    validationResult: {
        type: 'object',
        required: ['valid'],
        properties: {
            valid: { type: 'boolean' },
            errors: { type: 'array', items: { type: 'string' } },
            warnings: { type: 'array', items: { type: 'string' } }
        }
    }
};

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const validator = new ToolContractValidator({ verbose: true });

    switch (command) {
        case 'validate':
            const toolName = args[1];
            const dataFile = args[2];

            if (!toolName || !dataFile) {
                console.error('Usage: tool-contract-validator validate <toolName> <dataFile>');
                process.exit(1);
            }

            try {
                const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
                const result = validator.validateOutput(toolName, data);
                console.log(JSON.stringify(result, null, 2));
                process.exit(result.valid ? 0 : 1);
            } catch (error) {
                console.error(`Error: ${error.message}`);
                process.exit(1);
            }
            break;

        case 'docs':
            const contractsFile = args[1];
            if (contractsFile) {
                validator.loadContracts(contractsFile);
            }
            console.log(validator.generateDocumentation());
            break;

        case 'stats':
            console.log(JSON.stringify(validator.getStatistics(), null, 2));
            break;

        default:
            console.log(`
Tool Contract Validator - Validate tool inputs/outputs against schemas

Usage:
  tool-contract-validator validate <tool> <file>  Validate data against contract
  tool-contract-validator docs [contractsFile]    Generate documentation
  tool-contract-validator stats                   Show validation statistics

Examples:
  tool-contract-validator validate sf-query ./result.json
  tool-contract-validator docs ./contracts.json
            `);
    }
}

module.exports = { ToolContractValidator, ContractTemplates };
