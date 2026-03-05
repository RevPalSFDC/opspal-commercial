#!/usr/bin/env node

/**
 * Salesforce Order of Operations - Validation Rule Analyzer
 *
 * Extracts active validation rules with formulas and analyzes which rules
 * would block specific data writes.
 *
 * Purpose:
 * - Surface rule name + formula when validation fails (vs. generic error)
 * - Predict blocking rules BEFORE attempting write
 * - Enable "fail with explanation" pattern (OOO Section A3)
 *
 * Features:
 * - Queries active ValidationRule via Tooling API
 * - Retrieves formulas via Metadata API (when available)
 * - Evaluates rules against planned payloads (simple pattern matching)
 * - Generates remediation suggestions
 *
 * @see docs/SALESFORCE_ORDER_OF_OPERATIONS.md Section A1
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = promisify(exec);

class OOOValidationRuleAnalyzer {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.cache = new Map();
    }

    /**
     * Get Active Validation Rules with Formulas
     *
     * Queries Tooling API for active validation rules and attempts to
     * retrieve formulas via Metadata API.
     *
     * @param {string} objectName - Salesforce object API name
     * @returns {Promise<array>} Validation rules with formulas
     */
    async getActiveValidationRulesWithFormulas(objectName) {
        const cacheKey = `validation_rules_${objectName}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        this.log(`🔍 Fetching active validation rules for ${objectName}...`);

        try {
            // Query Tooling API for active rules
            const query = `
                SELECT Id, ValidationName, Active, ErrorDisplayField, ErrorMessage, Metadata
                FROM ValidationRule
                WHERE EntityDefinition.QualifiedApiName = '${objectName}'
                AND Active = true
            `;

            const { stdout } = await execAsync(
                `sf data query --query "${query.replace(/\n/g, ' ')}" --use-tooling-api --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );

            const result = JSON.parse(stdout);
            const rules = result.result?.records || [];

            this.log(`  Found ${rules.length} active validation rules`);

            // Attempt to retrieve formulas via Metadata API
            const enrichedRules = await Promise.all(
                rules.map(async (rule) => {
                    const formula = await this.retrieveRuleFormula(objectName, rule.ValidationName);
                    return {
                        id: rule.Id,
                        name: rule.ValidationName,
                        active: rule.Active,
                        errorField: rule.ErrorDisplayField,
                        errorMessage: rule.ErrorMessage,
                        formula: formula || rule.Metadata?.errorConditionFormula || 'N/A'
                    };
                })
            );

            this.cache.set(cacheKey, enrichedRules);
            return enrichedRules;

        } catch (error) {
            this.log(`Warning: Failed to fetch validation rules: ${error.message}`);
            return [];
        }
    }

    /**
     * Retrieve Validation Rule Formula
     *
     * Uses Metadata API to retrieve the full formula for a validation rule.
     *
     * @param {string} objectName - Salesforce object API name
     * @param {string} ruleName - Validation rule API name
     * @returns {Promise<string>} Formula or null
     */
    async retrieveRuleFormula(objectName, ruleName) {
        try {
            // Use sf CLI to retrieve metadata
            const tempDir = `/tmp/validation-rule-${Date.now()}`;
            await execAsync(`mkdir -p ${tempDir}`);

            // Create package.xml for this rule
            const packageXML = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>${objectName}.${ruleName}</members>
        <name>ValidationRule</name>
    </types>
    <version>62.0</version>
</Package>`;

            await fs.writeFile(path.join(tempDir, 'package.xml'), packageXML, 'utf8');

            // Retrieve metadata
            const { stdout } = await execAsync(
                `sf project retrieve start --manifest ${tempDir}/package.xml --target-org ${this.orgAlias} --target-metadata-dir ${tempDir}/metadata --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );

            const result = JSON.parse(stdout);

            if (result.status === 0) {
                // Read the validation rule XML
                const rulePath = path.join(tempDir, 'metadata', 'objects', objectName, 'validationRules', `${ruleName}.validationRule-meta.xml`);

                try {
                    const ruleXML = await fs.readFile(rulePath, 'utf8');

                    // Extract formula from XML
                    const formulaMatch = ruleXML.match(/<errorConditionFormula>([\s\S]*?)<\/errorConditionFormula>/);
                    const formula = formulaMatch ? formulaMatch[1].trim() : null;

                    // Cleanup
                    await execAsync(`rm -rf ${tempDir}`);

                    return formula;

                } catch (error) {
                    // Rule file not found, cleanup and return null
                    await execAsync(`rm -rf ${tempDir}`);
                    return null;
                }
            }

            return null;

        } catch (error) {
            this.log(`  Warning: Could not retrieve formula for ${ruleName}: ${error.message}`);
            return null;
        }
    }

    /**
     * Predict Blocking Rules
     *
     * Analyzes which validation rules would block a given payload.
     * Uses simple pattern matching against formulas.
     *
     * @param {string} objectName - Salesforce object API name
     * @param {object} payload - Planned record data
     * @returns {Promise<array>} Potentially blocking rules
     */
    async predictBlockingRules(objectName, payload) {
        this.log(`🔍 Analyzing validation rules for ${objectName}...`);

        const rules = await this.getActiveValidationRulesWithFormulas(objectName);
        const blockingRules = [];

        for (const rule of rules) {
            const wouldBlock = this.evaluateRuleAgainstPayload(rule, payload);

            if (wouldBlock.likely) {
                blockingRules.push({
                    ...rule,
                    likelihood: wouldBlock.likelihood,
                    reason: wouldBlock.reason,
                    remediation: this.generateRemediation(rule, payload)
                });
            }
        }

        this.log(`  Found ${blockingRules.length} potentially blocking rules`);
        return blockingRules;
    }

    /**
     * Evaluate Rule Against Payload
     *
     * Simple pattern matching to detect if rule might block.
     * This is NOT a full formula evaluator (would require complex parsing).
     *
     * Detects common patterns:
     * - ISBLANK(Field) - Field is required
     * - Field = 'value' - Specific value required
     * - Field != 'value' - Specific value disallowed
     *
     * @param {object} rule - Validation rule
     * @param {object} payload - Planned data
     * @returns {object} Evaluation result
     */
    evaluateRuleAgainstPayload(rule, payload) {
        if (!rule.formula || rule.formula === 'N/A') {
            return { likely: false, likelihood: 'UNKNOWN', reason: 'Formula not available' };
        }

        const formula = rule.formula;

        // Pattern 1: ISBLANK(Field)
        const isBlankMatches = formula.matchAll(/ISBLANK\((\w+)\)/gi);
        for (const match of isBlankMatches) {
            const fieldName = match[1];
            if (!payload[fieldName] || payload[fieldName] === '') {
                return {
                    likely: true,
                    likelihood: 'HIGH',
                    reason: `Field ${fieldName} is blank, rule checks ISBLANK(${fieldName})`
                };
            }
        }

        // Pattern 2: Field = 'value' (equality check)
        const equalityMatches = formula.matchAll(/(\w+)\s*=\s*['"]([^'"]+)['"]/gi);
        for (const match of equalityMatches) {
            const fieldName = match[1];
            const requiredValue = match[2];
            if (payload[fieldName] && payload[fieldName] !== requiredValue) {
                return {
                    likely: true,
                    likelihood: 'MEDIUM',
                    reason: `Field ${fieldName} = "${payload[fieldName]}", rule expects "${requiredValue}"`
                };
            }
        }

        // Pattern 3: Field != 'value' (inequality check)
        const inequalityMatches = formula.matchAll(/(\w+)\s*!=\s*['"]([^'"]+)['"]/gi);
        for (const match of inequalityMatches) {
            const fieldName = match[1];
            const disallowedValue = match[2];
            if (payload[fieldName] === disallowedValue) {
                return {
                    likely: true,
                    likelihood: 'HIGH',
                    reason: `Field ${fieldName} = "${disallowedValue}", rule disallows this value`
                };
            }
        }

        // No obvious violations detected
        return { likely: false, likelihood: 'LOW', reason: 'No obvious violations in formula' };
    }

    /**
     * Generate Remediation Suggestion
     *
     * Provides actionable fix based on rule formula.
     *
     * @param {object} rule - Validation rule
     * @param {object} payload - Planned data
     * @returns {string} Remediation suggestion
     */
    generateRemediation(rule, payload) {
        const formula = rule.formula;

        // Check for ISBLANK pattern
        const isBlankMatch = formula.match(/ISBLANK\((\w+)\)/i);
        if (isBlankMatch) {
            const fieldName = isBlankMatch[1];
            return `Set ${fieldName} to a non-blank value`;
        }

        // Check for equality pattern
        const equalityMatch = formula.match(/(\w+)\s*=\s*['"]([^'"]+)['"]/i);
        if (equalityMatch) {
            const fieldName = equalityMatch[1];
            const requiredValue = equalityMatch[2];
            return `Set ${fieldName} = "${requiredValue}"`;
        }

        // Check for inequality pattern
        const inequalityMatch = formula.match(/(\w+)\s*!=\s*['"]([^'"]+)['"]/i);
        if (inequalityMatch) {
            const fieldName = inequalityMatch[1];
            const disallowedValue = inequalityMatch[2];
            return `Do not set ${fieldName} = "${disallowedValue}"`;
        }

        // Generic remediation
        return `Modify payload to satisfy: ${rule.errorMessage}`;
    }

    /**
     * Generate Validation Report
     *
     * Creates a detailed report of all validation rules and their impact.
     *
     * @param {string} objectName - Salesforce object API name
     * @param {object} payload - Optional payload to test against
     * @returns {Promise<object>} Validation report
     */
    async generateValidationReport(objectName, payload = null) {
        const rules = await this.getActiveValidationRulesWithFormulas(objectName);

        const report = {
            objectName,
            timestamp: new Date().toISOString(),
            totalRules: rules.length,
            rulesWithFormulas: rules.filter(r => r.formula && r.formula !== 'N/A').length,
            rules: rules.map(r => ({
                name: r.name,
                errorMessage: r.errorMessage,
                formula: r.formula,
                errorField: r.errorField
            }))
        };

        if (payload) {
            report.blockingAnalysis = await this.predictBlockingRules(objectName, payload);
            report.wouldBlock = report.blockingAnalysis.length > 0;
        }

        return report;
    }

    log(message) {
        if (this.verbose) {
            console.log(message);
        }
    }
}

// CLI Support
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
        console.log(`
Salesforce Order of Operations - Validation Rule Analyzer

Usage:
  node ooo-validation-rule-analyzer.js getRules <object> <org> [options]
  node ooo-validation-rule-analyzer.js predict <object> <org> --payload <json>
  node ooo-validation-rule-analyzer.js report <object> <org> [--payload <json>]

Commands:
  getRules    Get all active validation rules with formulas
  predict     Predict which rules would block a payload
  report      Generate comprehensive validation report

Options:
  --payload <json>    Test payload against rules
  --verbose           Show detailed logging
  --output <path>     Write report to file

Example:
  node ooo-validation-rule-analyzer.js getRules Account myorg --verbose

  node ooo-validation-rule-analyzer.js predict Account myorg \
    --payload '{"Name":"Test","Industry":"Technology"}' \
    --verbose

  node ooo-validation-rule-analyzer.js report Account myorg \
    --payload '{"Name":""}' \
    --output validation-report.json
        `);
        process.exit(0);
    }

    async function runCLI() {
        const object = args[1];
        const org = args[2];

        if (!object || !org) {
            console.error('Error: Object and org are required');
            process.exit(1);
        }

        const options = {
            verbose: args.includes('--verbose')
        };

        const analyzer = new OOOValidationRuleAnalyzer(org, options);

        try {
            if (command === 'getRules') {
                const rules = await analyzer.getActiveValidationRulesWithFormulas(object);
                console.log(JSON.stringify(rules, null, 2));
                process.exit(0);

            } else if (command === 'predict') {
                const payloadIndex = args.indexOf('--payload');
                if (payloadIndex === -1 || !args[payloadIndex + 1]) {
                    console.error('Error: --payload is required for predict');
                    process.exit(1);
                }

                const payload = JSON.parse(args[payloadIndex + 1]);
                const blocking = await analyzer.predictBlockingRules(object, payload);

                console.log(JSON.stringify({
                    object,
                    payload,
                    blockingRules: blocking,
                    wouldBlock: blocking.length > 0
                }, null, 2));

                process.exit(blocking.length > 0 ? 1 : 0);

            } else if (command === 'report') {
                const payloadIndex = args.indexOf('--payload');
                const payload = payloadIndex !== -1 && args[payloadIndex + 1]
                    ? JSON.parse(args[payloadIndex + 1])
                    : null;

                const report = await analyzer.generateValidationReport(object, payload);

                const outputIndex = args.indexOf('--output');
                if (outputIndex !== -1 && args[outputIndex + 1]) {
                    await fs.writeFile(args[outputIndex + 1], JSON.stringify(report, null, 2), 'utf8');
                    console.log(`Report written to ${args[outputIndex + 1]}`);
                } else {
                    console.log(JSON.stringify(report, null, 2));
                }

                process.exit(0);

            } else {
                console.error(`Unknown command: ${command}`);
                process.exit(1);
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    }

    runCLI();
}

module.exports = { OOOValidationRuleAnalyzer };
