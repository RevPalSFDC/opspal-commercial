#!/usr/bin/env node

/**
 * Agent Deliverable Validator
 *
 * Self-check framework that validates agent deliverables before task completion.
 * Prevents common issues:
 * - Missing deliverables (file doesn't exist)
 * - Format mismatches (JSON corrupted, CSV malformed)
 * - Placeholder content (TODO, EXAMPLE, generic data)
 * - Incomplete work (success criteria not met)
 * - Empty or trivial outputs
 *
 * Usage:
 *   const validator = new AgentDeliverableValidator({ verbose: true });
 *   const result = await validator.validate(validationRequest);
 *
 * Example:
 *   Source: User requested "Generate CPQ assessment with JSON + PDF"
 *   Deliverables: [report.json, summary.pdf]
 *   Validator checks: Both exist, JSON parseable, PDF not empty, no TODOs
 *
 * @module agent-deliverable-validator
 * @version 1.0.0
 * @created 2025-10-26
 * @addresses Reflection Cohort - Prompt Mismatch / Incomplete Deliverables ($48k annual ROI)
 */

const fs = require('fs');
const path = require('path');

class AgentDeliverableValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.strictMode = options.strictMode || false; // Treat warnings as errors
        this.allowMissingOptional = options.allowMissingOptional !== false;

        // Placeholder patterns (case-insensitive)
        this.placeholderPatterns = [
            /TODO/gi,
            /FIXME/gi,
            /XXX/gi,
            /PLACEHOLDER/gi,
            /EXAMPLE/gi,
            /INSERT.*HERE/gi,
            /REPLACE.*WITH/gi,
            /\[YOUR.*\]/gi,
            /\{.*placeholder.*\}/gi,
            /Coming soon/gi,
            /To be implemented/gi
        ];

        // Generic data patterns
        this.genericPatterns = [
            /test@example\.com/gi,
            /john\.?doe/gi,
            /example\.com/gi,
            /12345/g,
            /foo.*bar/gi,
            /sample.*data/gi,
            /Lorem ipsum/gi
        ];

        this.stats = {
            totalValidations: 0,
            passed: 0,
            failed: 0,
            errors: {
                missingFile: 0,
                formatError: 0,
                placeholderContent: 0,
                genericContent: 0,
                emptyContent: 0,
                criteriaMissing: 0
            }
        };
    }

    /**
     * Validate agent deliverables
     *
     * @param {Object} validationRequest - Validation request
     * @param {Array} validationRequest.deliverables - List of expected deliverables
     * @param {Array} validationRequest.successCriteria - List of success criteria
     * @param {string} validationRequest.taskDescription - Original task description
     * @param {string} validationRequest.workingDirectory - Base directory for relative paths
     * @returns {Object} Validation result with errors, warnings, and suggestions
     */
    async validate(validationRequest) {
        this.stats.totalValidations++;

        const result = {
            valid: false,
            taskDescription: validationRequest.taskDescription || 'Unknown task',
            workingDirectory: validationRequest.workingDirectory || process.cwd(),
            errors: [],
            warnings: [],
            suggestions: [],
            metadata: {
                deliverablesChecked: 0,
                deliverablesValid: 0,
                criteriaChecked: 0,
                criteriaMet: 0
            }
        };

        try {
            // Step 1: Validate deliverables exist and are correctly formatted
            if (validationRequest.deliverables && validationRequest.deliverables.length > 0) {
                for (const deliverable of validationRequest.deliverables) {
                    result.metadata.deliverablesChecked++;

                    const deliverableResult = await this.validateDeliverable(
                        deliverable,
                        result.workingDirectory
                    );

                    if (!deliverableResult.valid) {
                        if (deliverable.required !== false) {
                            result.errors.push(...deliverableResult.errors);
                        } else {
                            // Optional deliverable - warnings only
                            result.warnings.push(...deliverableResult.errors.map(err => ({
                                ...err,
                                severity: 'WARNING',
                                message: `[OPTIONAL] ${err.message}`
                            })));
                        }
                    } else {
                        result.metadata.deliverablesValid++;
                    }

                    result.warnings.push(...deliverableResult.warnings);
                }
            }

            // Step 2: Validate success criteria
            if (validationRequest.successCriteria && validationRequest.successCriteria.length > 0) {
                for (const criterion of validationRequest.successCriteria) {
                    result.metadata.criteriaChecked++;

                    const criterionResult = await this.validateCriterion(
                        criterion,
                        validationRequest,
                        result.workingDirectory
                    );

                    if (!criterionResult.valid) {
                        result.errors.push({
                            type: 'CRITERION_NOT_MET',
                            message: `Success criterion not met: ${criterion}`,
                            severity: 'ERROR',
                            criterion: criterion,
                            details: criterionResult.details,
                            suggestion: criterionResult.suggestion
                        });
                        this.stats.errors.criteriaMissing++;
                    } else {
                        result.metadata.criteriaMet++;
                    }
                }
            }

            // Step 3: Cross-check deliverables against task description
            const crossCheckResult = this.crossCheckWithTask(
                validationRequest.taskDescription,
                validationRequest.deliverables
            );
            result.warnings.push(...crossCheckResult.warnings);
            result.suggestions.push(...crossCheckResult.suggestions);

            // Determine overall validity
            const hasErrors = result.errors.length > 0;
            const hasWarnings = result.warnings.length > 0;

            result.valid = !hasErrors && (!this.strictMode || !hasWarnings);

            // Update stats
            if (result.valid) {
                this.stats.passed++;
            } else {
                this.stats.failed++;
            }

        } catch (error) {
            result.errors.push({
                type: 'VALIDATION_ERROR',
                message: `Validation failed: ${error.message}`,
                severity: 'CRITICAL',
                error: error.stack
            });
            this.stats.failed++;
        }

        return result;
    }

    /**
     * Validate a single deliverable
     *
     * @param {Object} deliverable - Deliverable specification
     * @param {string} workingDirectory - Base directory
     * @returns {Object} Validation result
     */
    async validateDeliverable(deliverable, workingDirectory) {
        const result = {
            valid: true,
            errors: [],
            warnings: []
        };

        const filePath = path.isAbsolute(deliverable.path)
            ? deliverable.path
            : path.join(workingDirectory, deliverable.path);

        // Check 1: File exists
        if (!fs.existsSync(filePath)) {
            result.valid = false;
            result.errors.push({
                type: 'MISSING_FILE',
                message: `Deliverable file not found: ${deliverable.path}`,
                severity: 'ERROR',
                filePath: filePath,
                suggestion: 'Create the missing file or update the deliverable path'
            });
            this.stats.errors.missingFile++;
            return result;
        }

        // Check 2: File not empty
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
            result.valid = false;
            result.errors.push({
                type: 'EMPTY_FILE',
                message: `Deliverable file is empty: ${deliverable.path}`,
                severity: 'ERROR',
                filePath: filePath,
                suggestion: 'Populate the file with actual content'
            });
            this.stats.errors.emptyContent++;
            return result;
        }

        // Check 3: Reasonable size (not too small)
        if (stats.size < 50 && deliverable.format !== 'binary') {
            result.warnings.push({
                type: 'TRIVIAL_CONTENT',
                message: `Deliverable file suspiciously small (${stats.size} bytes): ${deliverable.path}`,
                severity: 'WARNING',
                filePath: filePath,
                fileSize: stats.size,
                suggestion: 'Verify file contains meaningful content'
            });
        }

        // Check 4: Format-specific validation
        const content = fs.readFileSync(filePath, 'utf8');
        const formatResult = this.validateFormat(deliverable.format, content, deliverable.path);

        if (!formatResult.valid) {
            result.valid = false;
            result.errors.push(...formatResult.errors);
        }
        result.warnings.push(...formatResult.warnings);

        // Check 5: Placeholder content detection
        const placeholderResult = this.detectPlaceholders(content, deliverable.path);
        if (!placeholderResult.valid) {
            result.valid = false;
            result.errors.push(...placeholderResult.errors);
        }
        result.warnings.push(...placeholderResult.warnings);

        // Check 6: Generic content detection
        const genericResult = this.detectGenericContent(content, deliverable.path);
        result.warnings.push(...genericResult.warnings);

        return result;
    }

    /**
     * Validate format-specific rules
     */
    validateFormat(format, content, filePath) {
        const result = {
            valid: true,
            errors: [],
            warnings: []
        };

        if (!format) {
            return result; // No format specified
        }

        switch (format.toLowerCase()) {
            case 'json':
                try {
                    const parsed = JSON.parse(content);

                    // Check for empty objects/arrays
                    if (typeof parsed === 'object' && Object.keys(parsed).length === 0) {
                        result.warnings.push({
                            type: 'EMPTY_JSON',
                            message: `JSON file is empty object/array: ${filePath}`,
                            severity: 'WARNING',
                            suggestion: 'Ensure JSON contains actual data'
                        });
                    }
                } catch (error) {
                    result.valid = false;
                    result.errors.push({
                        type: 'FORMAT_ERROR',
                        message: `Invalid JSON format: ${filePath}`,
                        severity: 'ERROR',
                        details: error.message,
                        suggestion: 'Fix JSON syntax errors'
                    });
                    this.stats.errors.formatError++;
                }
                break;

            case 'csv':
                const lines = content.split('\n').filter(l => l.trim());
                if (lines.length === 0) {
                    result.valid = false;
                    result.errors.push({
                        type: 'FORMAT_ERROR',
                        message: `CSV file is empty: ${filePath}`,
                        severity: 'ERROR',
                        suggestion: 'Add CSV data with headers'
                    });
                    this.stats.errors.formatError++;
                } else if (lines.length === 1) {
                    result.warnings.push({
                        type: 'CSV_HEADER_ONLY',
                        message: `CSV file has only headers, no data: ${filePath}`,
                        severity: 'WARNING',
                        suggestion: 'Add data rows to CSV'
                    });
                }
                break;

            case 'markdown':
            case 'md':
                // Check for minimal structure
                if (!content.includes('#') && content.length < 200) {
                    result.warnings.push({
                        type: 'MINIMAL_MARKDOWN',
                        message: `Markdown file lacks structure or is too short: ${filePath}`,
                        severity: 'WARNING',
                        suggestion: 'Add headers and meaningful content'
                    });
                }
                break;

            case 'pdf':
                // PDF validation would require external library
                // Just check magic bytes for now
                if (!content.startsWith('%PDF-')) {
                    result.valid = false;
                    result.errors.push({
                        type: 'FORMAT_ERROR',
                        message: `File is not a valid PDF: ${filePath}`,
                        severity: 'ERROR',
                        suggestion: 'Regenerate PDF file'
                    });
                    this.stats.errors.formatError++;
                }
                break;
        }

        return result;
    }

    /**
     * Detect placeholder content
     */
    detectPlaceholders(content, filePath) {
        const result = {
            valid: true,
            errors: [],
            warnings: []
        };

        const placeholders = [];

        for (const pattern of this.placeholderPatterns) {
            const matches = content.match(pattern);
            if (matches) {
                placeholders.push(...matches);
            }
        }

        if (placeholders.length > 0) {
            result.valid = false;
            result.errors.push({
                type: 'PLACEHOLDER_CONTENT',
                message: `File contains placeholder content: ${filePath}`,
                severity: 'ERROR',
                placeholders: [...new Set(placeholders)],
                count: placeholders.length,
                suggestion: 'Replace all placeholder text with actual content'
            });
            this.stats.errors.placeholderContent++;
        }

        return result;
    }

    /**
     * Detect generic/example content
     */
    detectGenericContent(content, filePath) {
        const result = {
            warnings: []
        };

        const genericMatches = [];

        for (const pattern of this.genericPatterns) {
            const matches = content.match(pattern);
            if (matches) {
                genericMatches.push(...matches);
            }
        }

        if (genericMatches.length > 3) {
            result.warnings.push({
                type: 'GENERIC_CONTENT',
                message: `File may contain generic/example data: ${filePath}`,
                severity: 'WARNING',
                examples: [...new Set(genericMatches)].slice(0, 5),
                count: genericMatches.length,
                suggestion: 'Verify content uses real data, not examples'
            });
            this.stats.errors.genericContent++;
        }

        return result;
    }

    /**
     * Validate success criterion
     */
    async validateCriterion(criterion, validationRequest, workingDirectory) {
        const result = {
            valid: true,
            details: {},
            suggestion: 'Review success criteria and verify completion'
        };

        // Parse criterion for common patterns
        const criterionLower = criterion.toLowerCase();

        // Pattern: "test coverage > X%"
        const coverageMatch = criterionLower.match(/test coverage[>\s]+(\d+)%?/);
        if (coverageMatch) {
            const targetCoverage = parseInt(coverageMatch[1]);
            // Would need to parse coverage report - for now mark as manual check
            result.valid = false;
            result.details.type = 'coverage_check';
            result.details.target = targetCoverage;
            result.suggestion = `Verify test coverage meets ${targetCoverage}% target`;
            return result;
        }

        // Pattern: "all X passing" or "X tests passing"
        if (criterionLower.includes('passing') || criterionLower.includes('pass')) {
            result.valid = false;
            result.details.type = 'test_check';
            result.suggestion = 'Run tests and verify all passing';
            return result;
        }

        // Pattern: "documentation updated"
        if (criterionLower.includes('documentation') || criterionLower.includes('readme')) {
            result.valid = false;
            result.details.type = 'documentation_check';
            result.suggestion = 'Verify documentation files are updated';
            return result;
        }

        // Pattern: File existence check ("report.json created")
        const fileMatch = criterion.match(/([a-z0-9_\-\.]+\.(json|csv|md|pdf))/i);
        if (fileMatch) {
            const fileName = fileMatch[1];
            const filePath = path.join(workingDirectory, fileName);

            if (!fs.existsSync(filePath)) {
                result.valid = false;
                result.details.type = 'file_existence';
                result.details.file = fileName;
                result.suggestion = `Create missing file: ${fileName}`;
            }
            return result;
        }

        // Default: Assume manual verification needed
        result.valid = false;
        result.details.type = 'manual_check';
        result.suggestion = 'Manually verify this success criterion is met';

        return result;
    }

    /**
     * Cross-check deliverables with task description
     */
    crossCheckWithTask(taskDescription, deliverables) {
        const result = {
            warnings: [],
            suggestions: []
        };

        if (!taskDescription || !deliverables || deliverables.length === 0) {
            return result;
        }

        const taskLower = taskDescription.toLowerCase();

        // Check for format mentions in task
        const mentionedFormats = {
            json: taskLower.includes('json'),
            csv: taskLower.includes('csv'),
            pdf: taskLower.includes('pdf'),
            markdown: taskLower.includes('markdown') || taskLower.includes('md'),
            report: taskLower.includes('report'),
            summary: taskLower.includes('summary')
        };

        // Check if deliverables match mentioned formats
        for (const [format, mentioned] of Object.entries(mentionedFormats)) {
            if (mentioned) {
                const hasMatchingDeliverable = deliverables.some(d =>
                    d.format === format ||
                    d.path.toLowerCase().includes(format) ||
                    (format === 'report' && d.path.toLowerCase().includes('report')) ||
                    (format === 'summary' && d.path.toLowerCase().includes('summary'))
                );

                if (!hasMatchingDeliverable) {
                    result.warnings.push({
                        type: 'MISSING_EXPECTED_FORMAT',
                        message: `Task mentions "${format}" but no matching deliverable found`,
                        severity: 'WARNING',
                        format: format,
                        suggestion: `Add ${format} deliverable or clarify task requirements`
                    });
                }
            }
        }

        return result;
    }

    /**
     * Get validation statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalValidations: 0,
            passed: 0,
            failed: 0,
            errors: {
                missingFile: 0,
                formatError: 0,
                placeholderContent: 0,
                genericContent: 0,
                emptyContent: 0,
                criteriaMissing: 0
            }
        };
    }
}

module.exports = AgentDeliverableValidator;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log('Usage: agent-deliverable-validator.js <config-file.json>');
        console.log('');
        console.log('Config file format:');
        console.log(JSON.stringify({
            taskDescription: 'Generate CPQ assessment for HiveMQ',
            workingDirectory: './reports/hivemq-cpq/',
            deliverables: [
                { path: 'assessment.json', format: 'json', required: true },
                { path: 'summary.md', format: 'markdown', required: true },
                { path: 'data.csv', format: 'csv', required: false }
            ],
            successCriteria: [
                'All validations passing',
                'Test coverage > 80%',
                'Documentation updated'
            ]
        }, null, 2));
        process.exit(1);
    }

    const configPath = args[0];

    if (!fs.existsSync(configPath)) {
        console.error(`❌ Config file not found: ${configPath}`);
        process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const validator = new AgentDeliverableValidator({ verbose: true });

    (async () => {
        try {
            console.log('\n📋 Validating agent deliverables...\n');
            console.log(`Task: ${config.taskDescription}\n`);

            const result = await validator.validate(config);

            console.log(`\n${result.valid ? '✅' : '❌'} Validation Result: ${result.valid ? 'VALID' : 'INVALID'}\n`);

            if (result.errors.length > 0) {
                console.log('Errors:');
                for (const error of result.errors) {
                    console.log(`  ❌ ${error.message}`);
                    if (error.suggestion) {
                        console.log(`     💡 ${error.suggestion}`);
                    }
                }
                console.log('');
            }

            if (result.warnings.length > 0) {
                console.log('Warnings:');
                for (const warning of result.warnings) {
                    console.log(`  ⚠️  ${warning.message}`);
                    if (warning.suggestion) {
                        console.log(`     💡 ${warning.suggestion}`);
                    }
                }
                console.log('');
            }

            console.log('Metadata:');
            console.log(`  Deliverables: ${result.metadata.deliverablesValid}/${result.metadata.deliverablesChecked} valid`);
            console.log(`  Success Criteria: ${result.metadata.criteriaMet}/${result.metadata.criteriaChecked} met`);
            console.log('');

            console.log('Statistics:');
            console.log(JSON.stringify(validator.getStats(), null, 2));

            process.exit(result.valid ? 0 : 1);

        } catch (error) {
            console.error('❌ Error:', error.message);
            console.error(error.stack);
            process.exit(1);
        }
    })();
}
