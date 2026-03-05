#!/usr/bin/env node

/**
 * Quality Gate Validator
 *
 * Validates task deliverables against requirements and examples to ensure:
 * - Completeness: All required elements present
 * - Accuracy: Deliverable matches specifications
 * - Quality: Output meets expected standards
 * - Verification: Success claims are validated
 *
 * Usage:
 *   const validator = new QualityGateValidator();
 *   const result = await validator.validate(taskContext, deliverable);
 *
 * @module quality-gate-validator
 * @version 1.0.0
 * @created 2025-10-24
 * @addresses Cohort #1 - Agent Behavior Issues ($20k ROI)
 */

const fs = require('fs');
const path = require('path');

class QualityGateValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.rulesPath = options.rulesPath || path.join(__dirname, '../../config/quality-gate-rules.json');
        this.rules = this.loadRules();

        this.stats = {
            totalValidations: 0,
            passed: 0,
            failed: 0,
            byTaskType: {}
        };
    }

    /**
     * Load quality gate rules from configuration
     */
    loadRules() {
        try {
            if (fs.existsSync(this.rulesPath)) {
                const content = fs.readFileSync(this.rulesPath, 'utf8');
                return JSON.parse(content);
            }
        } catch (error) {
            if (this.verbose) {
                console.warn(`⚠️  Failed to load rules from ${this.rulesPath}: ${error.message}`);
            }
        }

        // Default rules if file doesn't exist
        return this.getDefaultRules();
    }

    /**
     * Get default quality gate rules
     */
    getDefaultRules() {
        return {
            "report_generation": {
                "description": "Validate report completeness and quality",
                "checks": [
                    {
                        "name": "file_exists",
                        "description": "Report file must exist",
                        "severity": "CRITICAL",
                        "validator": "fileExists"
                    },
                    {
                        "name": "minimum_sections",
                        "description": "Report must have required sections",
                        "severity": "HIGH",
                        "validator": "hasRequiredSections",
                        "params": {
                            "requiredSections": ["Summary", "Findings", "Recommendations"]
                        }
                    },
                    {
                        "name": "data_completeness",
                        "description": "Report must contain actual data, not placeholders",
                        "severity": "HIGH",
                        "validator": "noPlaceholders"
                    }
                ]
            },
            "deployment": {
                "description": "Validate deployment success and verification",
                "checks": [
                    {
                        "name": "deployment_status",
                        "description": "Deployment must have succeeded",
                        "severity": "CRITICAL",
                        "validator": "deploymentSucceeded"
                    },
                    {
                        "name": "post_deployment_verification",
                        "description": "Changes must be verified in target environment",
                        "severity": "HIGH",
                        "validator": "changesVerified"
                    },
                    {
                        "name": "test_execution",
                        "description": "Tests must have run and passed",
                        "severity": "HIGH",
                        "validator": "testsExecuted"
                    }
                ]
            },
            "data_operation": {
                "description": "Validate data operations completed successfully",
                "checks": [
                    {
                        "name": "operation_completion",
                        "description": "Data operation must have completed",
                        "severity": "CRITICAL",
                        "validator": "operationCompleted"
                    },
                    {
                        "name": "record_count_verification",
                        "description": "Actual record count matches expected",
                        "severity": "HIGH",
                        "validator": "recordCountMatches"
                    },
                    {
                        "name": "error_handling",
                        "description": "Errors must be documented and handled",
                        "severity": "MEDIUM",
                        "validator": "errorsHandled"
                    }
                ]
            },
            "configuration": {
                "description": "Validate configuration changes",
                "checks": [
                    {
                        "name": "config_applied",
                        "description": "Configuration changes must be applied",
                        "severity": "CRITICAL",
                        "validator": "configurationApplied"
                    },
                    {
                        "name": "config_verification",
                        "description": "Configuration must be verified in system",
                        "severity": "HIGH",
                        "validator": "configurationVerified"
                    }
                ]
            }
        };
    }

    /**
     * Validate task deliverable
     *
     * @param {Object} taskContext - Task information
     * @param {Object} deliverable - Deliverable to validate
     * @returns {Object} Validation result
     */
    async validate(taskContext, deliverable) {
        this.stats.totalValidations++;

        const result = {
            passed: false,
            taskType: taskContext.type || 'unknown',
            timestamp: new Date().toISOString(),
            checks: [],
            failedChecks: [],
            criticalFailures: [],
            highFailures: [],
            recommendations: []
        };

        // Get rules for this task type
        const rules = this.rules[taskContext.type];
        if (!rules) {
            result.passed = true;
            result.message = `No quality gates defined for task type: ${taskContext.type}`;
            return result;
        }

        // Run all checks
        for (const check of rules.checks) {
            const checkResult = await this.runCheck(check, taskContext, deliverable);
            result.checks.push(checkResult);

            if (!checkResult.passed) {
                result.failedChecks.push(checkResult);

                if (check.severity === 'CRITICAL') {
                    result.criticalFailures.push(checkResult);
                }
                if (check.severity === 'CRITICAL' || check.severity === 'HIGH') {
                    result.highFailures.push(checkResult);
                }
            }
        }

        // Determine overall pass/fail
        result.passed = result.highFailures.length === 0;

        // Generate recommendations
        if (!result.passed) {
            result.recommendations = this.generateRecommendations(result);
        }

        // Update statistics
        const taskType = result.taskType;
        if (!this.stats.byTaskType[taskType]) {
            this.stats.byTaskType[taskType] = { passed: 0, failed: 0 };
        }

        if (result.passed) {
            this.stats.passed++;
            this.stats.byTaskType[taskType].passed++;
        } else {
            this.stats.failed++;
            this.stats.byTaskType[taskType].failed++;
        }

        return result;
    }

    /**
     * Run a single quality check
     *
     * @param {Object} check - Check configuration
     * @param {Object} taskContext - Task context
     * @param {Object} deliverable - Deliverable to check
     * @returns {Object} Check result
     */
    async runCheck(check, taskContext, deliverable) {
        const result = {
            name: check.name,
            description: check.description,
            severity: check.severity,
            passed: false,
            message: ''
        };

        try {
            const validator = this[check.validator];
            if (!validator) {
                result.message = `Validator ${check.validator} not found`;
                return result;
            }

            const validationResult = await validator.call(this, taskContext, deliverable, check.params || {});
            result.passed = validationResult.passed;
            result.message = validationResult.message;
            result.details = validationResult.details;

        } catch (error) {
            result.message = `Validation error: ${error.message}`;
        }

        return result;
    }

    /**
     * Validators - Core validation functions
     */

    async fileExists(taskContext, deliverable, params) {
        const filePath = deliverable.filePath || deliverable.outputPath;

        if (!filePath) {
            return {
                passed: false,
                message: 'No file path specified in deliverable'
            };
        }

        const exists = fs.existsSync(filePath);
        return {
            passed: exists,
            message: exists ? `File exists: ${filePath}` : `File not found: ${filePath}`
        };
    }

    async hasRequiredSections(taskContext, deliverable, params) {
        const content = this.getDeliverableContent(deliverable);
        const requiredSections = params.requiredSections || [];
        const missingSections = [];

        for (const section of requiredSections) {
            // Check for section headers (various markdown formats)
            const patterns = [
                new RegExp(`^##?\\s+${section}`, 'im'),
                new RegExp(`^${section}:`, 'im'),
                new RegExp(`^\\*\\*${section}\\*\\*`, 'im')
            ];

            const found = patterns.some(pattern => pattern.test(content));
            if (!found) {
                missingSections.push(section);
            }
        }

        return {
            passed: missingSections.length === 0,
            message: missingSections.length === 0
                ? 'All required sections present'
                : `Missing sections: ${missingSections.join(', ')}`,
            details: { missingSections }
        };
    }

    async noPlaceholders(taskContext, deliverable, params) {
        const content = this.getDeliverableContent(deliverable);

        const placeholderPatterns = [
            /\[TODO\]/gi,
            /\[TBD\]/gi,
            /\[PLACEHOLDER\]/gi,
            /example\.com/gi,
            /test@test\.com/gi,
            /\{\{.*?\}\}/g, // Template variables
            /Lorem ipsum/gi
        ];

        const foundPlaceholders = [];
        for (const pattern of placeholderPatterns) {
            const matches = content.match(pattern);
            if (matches) {
                foundPlaceholders.push(...matches);
            }
        }

        return {
            passed: foundPlaceholders.length === 0,
            message: foundPlaceholders.length === 0
                ? 'No placeholders found'
                : `Found ${foundPlaceholders.length} placeholder(s)`,
            details: { placeholders: foundPlaceholders.slice(0, 5) } // Limit to first 5
        };
    }

    async minimumLength(taskContext, deliverable, params) {
        const content = this.getDeliverableContent(deliverable);
        const minimumWords = params.minimumWords || 0;
        const words = content.trim().split(/\s+/).filter(Boolean);
        const wordCount = words.length;
        const passed = wordCount >= minimumWords;

        return {
            passed,
            message: passed
                ? `Content length OK (${wordCount} words)`
                : `Content too short (${wordCount}/${minimumWords} words)`,
            details: {
                wordCount,
                minimumWords
            }
        };
    }

    async deploymentSucceeded(taskContext, deliverable, params) {
        const hasSuccessIndicator =
            deliverable.status === 'success' ||
            deliverable.deploymentStatus === 'Succeeded' ||
            (deliverable.output && deliverable.output.includes('Successfully deployed'));

        return {
            passed: hasSuccessIndicator,
            message: hasSuccessIndicator
                ? 'Deployment succeeded'
                : 'No deployment success confirmation found'
        };
    }

    async changesVerified(taskContext, deliverable, params) {
        const hasVerification =
            deliverable.verified === true ||
            deliverable.verificationResult ||
            (deliverable.output && deliverable.output.match(/verified|confirmed|checked/i));

        return {
            passed: hasVerification,
            message: hasVerification
                ? 'Changes verified in environment'
                : 'No post-deployment verification performed',
            details: {
                recommendation: 'Run verification query or check to confirm changes'
            }
        };
    }

    async testsExecuted(taskContext, deliverable, params) {
        const hasTestResults =
            deliverable.testResults ||
            deliverable.testsRun > 0 ||
            (deliverable.output && deliverable.output.match(/tests? (passed|executed|ran)/i));

        return {
            passed: hasTestResults,
            message: hasTestResults
                ? 'Tests executed'
                : 'No test execution found',
            details: {
                recommendation: 'Run tests and include results in deliverable'
            }
        };
    }

    async rollbackPlanExists(taskContext, deliverable, params) {
        const env = (deliverable.environment || taskContext.environment || '').toString().toLowerCase();
        const isProduction = ['prod', 'production'].includes(env);

        if (!isProduction) {
            return {
                passed: true,
                message: 'Rollback plan not required for non-production environment'
            };
        }

        const hasPlan =
            deliverable.rollbackPlan ||
            deliverable.rollbackPlanExists === true ||
            deliverable.rollbackPlanDocumented === true ||
            (deliverable.output && deliverable.output.match(/rollback/i));

        return {
            passed: !!hasPlan,
            message: hasPlan
                ? 'Rollback plan documented'
                : 'Rollback plan missing for production deployment',
            details: {
                recommendation: 'Document rollback steps for production changes'
            }
        };
    }

    async operationCompleted(taskContext, deliverable, params) {
        const hasCompletion =
            deliverable.status === 'completed' ||
            deliverable.operationComplete === true ||
            (deliverable.recordsProcessed >= 0 && deliverable.recordsProcessed === deliverable.recordsExpected);

        return {
            passed: hasCompletion,
            message: hasCompletion
                ? 'Operation completed'
                : 'Operation completion not confirmed'
        };
    }

    async recordCountMatches(taskContext, deliverable, params) {
        const expected = deliverable.recordsExpected || taskContext.expectedRecords;
        const actual = deliverable.recordsProcessed || deliverable.recordCount;

        if (expected === undefined || actual === undefined) {
            return {
                passed: true, // Skip if counts not provided
                message: 'Record count validation skipped (counts not provided)'
            };
        }

        const matches = actual === expected;
        return {
            passed: matches,
            message: matches
                ? `Record count matches (${actual}/${expected})`
                : `Record count mismatch: ${actual} processed, ${expected} expected`
        };
    }

    async sampleRecordsVerified(taskContext, deliverable, params) {
        const verified =
            deliverable.sampleRecordsVerified === true ||
            deliverable.sampleVerified === true ||
            deliverable.sampleVerification === true;

        return {
            passed: verified,
            message: verified
                ? 'Sample records verified'
                : 'Sample verification missing',
            details: {
                recommendation: 'Verify a sample of records in the target system'
            }
        };
    }

    async errorsHandled(taskContext, deliverable, params) {
        const hasErrorInfo =
            deliverable.errors !== undefined ||
            deliverable.errorCount !== undefined ||
            deliverable.failedRecords !== undefined;

        if (!hasErrorInfo) {
            return {
                passed: true,
                message: 'No error information expected for this operation'
            };
        }

        const errorCount = deliverable.errorCount || (deliverable.errors && deliverable.errors.length) || 0;
        const hasErrorHandling = errorCount === 0 || deliverable.errorsDocumented === true;

        return {
            passed: hasErrorHandling,
            message: hasErrorHandling
                ? `Errors handled (${errorCount} errors)`
                : `${errorCount} errors found but not documented`
        };
    }

    async configurationApplied(taskContext, deliverable, params) {
        const hasApplication =
            deliverable.applied === true ||
            deliverable.configurationSet === true ||
            (deliverable.output && deliverable.output.match(/applied|configured|set/i));

        return {
            passed: hasApplication,
            message: hasApplication
                ? 'Configuration applied'
                : 'Configuration application not confirmed'
        };
    }

    async configurationVerified(taskContext, deliverable, params) {
        const hasVerification =
            deliverable.verified === true ||
            (deliverable.output && deliverable.output.match(/verified|confirmed/i));

        return {
            passed: hasVerification,
            message: hasVerification
                ? 'Configuration verified'
                : 'Configuration not verified in system',
            details: {
                recommendation: 'Query configuration to confirm it was applied'
            }
        };
    }

    async backupExists(taskContext, deliverable, params) {
        const env = (deliverable.environment || taskContext.environment || '').toString().toLowerCase();
        const isProduction = ['prod', 'production'].includes(env);

        if (!isProduction && deliverable.backupCreated === undefined && deliverable.backupPath === undefined) {
            return {
                passed: true,
                message: 'Backup not required for non-production environment'
            };
        }

        const hasBackup =
            deliverable.backupCreated === true ||
            deliverable.backupPath ||
            deliverable.backupExists === true ||
            (deliverable.output && deliverable.output.match(/backup/i));

        return {
            passed: !!hasBackup,
            message: hasBackup
                ? 'Backup confirmed'
                : 'Backup not confirmed',
            details: {
                recommendation: 'Create and document a backup before applying configuration changes'
            }
        };
    }

    /**
     * Helper functions
     */

    getDeliverableContent(deliverable) {
        if (deliverable.content) {
            return deliverable.content;
        }

        if (deliverable.filePath && fs.existsSync(deliverable.filePath)) {
            return fs.readFileSync(deliverable.filePath, 'utf8');
        }

        if (deliverable.output) {
            return deliverable.output;
        }

        return '';
    }

    generateRecommendations(result) {
        const recommendations = [];

        for (const failure of result.failedChecks) {
            if (failure.details && failure.details.recommendation) {
                recommendations.push({
                    check: failure.name,
                    recommendation: failure.details.recommendation,
                    severity: failure.severity
                });
            }
        }

        // Add general recommendations
        if (result.criticalFailures.length > 0) {
            recommendations.push({
                check: 'general',
                recommendation: 'Address all critical failures before declaring task complete',
                severity: 'CRITICAL'
            });
        }

        return recommendations;
    }

    /**
     * Get validation statistics
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalValidations > 0
                ? (this.stats.passed / this.stats.totalValidations * 100).toFixed(1) + '%'
                : 'N/A'
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalValidations: 0,
            passed: 0,
            failed: 0,
            byTaskType: {}
        };
    }
}

// CLI usage
if (require.main === module) {
    const validator = new QualityGateValidator({ verbose: true });

    // Example validation
    const taskContext = {
        type: process.argv[2] || 'report_generation',
        description: 'Generate audit report'
    };

    const deliverable = {
        filePath: process.argv[3] || './reports/test-report.md',
        status: 'success',
        verified: false
    };

    validator.validate(taskContext, deliverable).then(result => {
        console.log('\n=== Quality Gate Validation Result ===\n');
        console.log(`Task Type: ${result.taskType}`);
        console.log(`Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
        console.log(`Checks Run: ${result.checks.length}`);
        console.log(`Failed Checks: ${result.failedChecks.length}`);
        console.log(`Critical Failures: ${result.criticalFailures.length}`);

        if (!result.passed) {
            console.log('\n--- Failed Checks ---');
            for (const check of result.failedChecks) {
                console.log(`\n[${check.severity}] ${check.name}`);
                console.log(`  ${check.message}`);
            }

            console.log('\n--- Recommendations ---');
            for (const rec of result.recommendations) {
                console.log(`\n[${rec.severity}] ${rec.check}`);
                console.log(`  ${rec.recommendation}`);
            }
        }

        console.log('\n--- Statistics ---');
        const stats = validator.getStats();
        console.log(`Total Validations: ${stats.totalValidations}`);
        console.log(`Success Rate: ${stats.successRate}`);

        process.exit(result.passed ? 0 : 1);
    }).catch(error => {
        console.error('Validation error:', error);
        process.exit(1);
    });
}

module.exports = QualityGateValidator;
