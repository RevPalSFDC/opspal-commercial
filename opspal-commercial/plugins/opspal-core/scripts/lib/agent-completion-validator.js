#!/usr/bin/env node

/**
 * Agent Completion Validator
 *
 * Wrapper that validates deliverables before agent marks task complete.
 * Integrates Agent Deliverable Validator into agent workflows automatically.
 *
 * Usage in agent code:
 *   const { validateBeforeCompletion } = require('./agent-completion-validator');
 *   await validateBeforeCompletion(taskDescription, deliverables, successCriteria);
 *
 * @module agent-completion-validator
 * @version 1.0.0
 * @created 2025-10-26
 */

const AgentDeliverableValidator = require('./agent-deliverable-validator');
const UserExpectationTracker = require('./user-expectation-tracker');

class AgentCompletionValidator {
    constructor(options = {}) {
        this.deliverableValidator = new AgentDeliverableValidator({
            verbose: options.verbose || false,
            strictMode: options.strictMode || false
        });

        this.expectationTracker = new UserExpectationTracker({
            dbPath: options.expectationDbPath || './.claude/user-expectations.db',
            verbose: options.verbose || false
        });

        this.options = options;
    }

    /**
     * Validate before agent marks task complete
     *
     * @param {Object} params - Validation parameters
     * @param {string} params.taskDescription - Original task from user
     * @param {Array} params.deliverables - Expected deliverables
     * @param {Array} params.successCriteria - Success criteria
     * @param {string} params.context - Context (e.g., 'cpq-assessment')
     * @param {Object} params.output - Actual output to validate (optional)
     * @returns {Promise<Object>} Validation result
     */
    async validateBeforeCompletion(params) {
        const {
            taskDescription,
            deliverables = [],
            successCriteria = [],
            context = 'general',
            output = null
        } = params;

        const result = {
            valid: true,
            errors: [],
            warnings: [],
            suggestions: [],
            deliverableValidation: null,
            expectationValidation: null
        };

        try {
            // Step 1: Validate deliverables
            if (deliverables.length > 0) {
                const deliverableResult = await this.deliverableValidator.validate({
                    taskDescription,
                    workingDirectory: process.cwd(),
                    deliverables,
                    successCriteria
                });

                result.deliverableValidation = deliverableResult;

                if (!deliverableResult.valid) {
                    result.valid = false;
                    result.errors.push(...deliverableResult.errors);
                }

                result.warnings.push(...deliverableResult.warnings);
                result.suggestions.push(...deliverableResult.suggestions);
            }

            // Step 2: Validate against user expectations
            if (output && context) {
                await this.expectationTracker.initialize();

                const expectationResult = await this.expectationTracker.validate(output, context);

                result.expectationValidation = expectationResult;

                if (!expectationResult.valid) {
                    result.valid = false;
                    result.errors.push(...expectationResult.violations);
                }

                result.warnings.push(...expectationResult.warnings);

                await this.expectationTracker.close();
            }

            return result;

        } catch (error) {
            result.valid = false;
            result.errors.push({
                type: 'VALIDATION_ERROR',
                message: `Validation failed: ${error.message}`,
                severity: 'CRITICAL'
            });

            return result;
        }
    }

    /**
     * Format validation errors for display
     */
    formatErrors(validationResult) {
        const lines = [];

        if (!validationResult.valid) {
            lines.push('❌ Task completion validation failed:\n');

            for (const error of validationResult.errors) {
                lines.push(`  ❌ ${error.message}`);
                if (error.suggestion) {
                    lines.push(`     💡 ${error.suggestion}`);
                }
            }
        }

        if (validationResult.warnings.length > 0) {
            lines.push('\n⚠️  Warnings:\n');

            for (const warning of validationResult.warnings) {
                lines.push(`  ⚠️  ${warning.message}`);
                if (warning.suggestion) {
                    lines.push(`     💡 ${warning.suggestion}`);
                }
            }
        }

        return lines.join('\n');
    }
}

/**
 * Convenience function for quick validation
 */
async function validateBeforeCompletion(taskDescription, deliverables, successCriteria, options = {}) {
    const validator = new AgentCompletionValidator(options);

    const result = await validator.validateBeforeCompletion({
        taskDescription,
        deliverables,
        successCriteria,
        context: options.context || 'general',
        output: options.output || null
    });

    if (!result.valid) {
        const errorMessage = validator.formatErrors(result);
        throw new Error(`Task validation failed:\n${errorMessage}`);
    }

    return result;
}

module.exports = {
    AgentCompletionValidator,
    validateBeforeCompletion
};

// CLI usage
if (require.main === module) {
    const fs = require('fs');

    const configPath = process.argv[2];

    if (!configPath) {
        console.log('Usage: agent-completion-validator.js <config-file.json>');
        console.log('');
        console.log('Config format:');
        console.log(JSON.stringify({
            taskDescription: 'Generate CPQ assessment',
            deliverables: [
                { path: 'assessment.json', format: 'json', required: true }
            ],
            successCriteria: ['assessment.json created'],
            context: 'cpq-assessment'
        }, null, 2));
        process.exit(1);
    }

    if (!fs.existsSync(configPath)) {
        console.error(`❌ Config file not found: ${configPath}`);
        process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    (async () => {
        try {
            const result = await validateBeforeCompletion(
                config.taskDescription,
                config.deliverables || [],
                config.successCriteria || [],
                {
                    context: config.context || 'general',
                    output: config.output || null
                }
            );

            console.log('✅ Task validation passed');
            process.exit(0);

        } catch (error) {
            console.error(error.message);
            process.exit(1);
        }
    })();
}
