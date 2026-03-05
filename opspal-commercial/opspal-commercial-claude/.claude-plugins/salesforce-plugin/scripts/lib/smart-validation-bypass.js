#!/usr/bin/env node

/**
 * Smart Validation Bypass Manager
 *
 * Intelligent validation rule management that:
 * - Learns from failed operations (auto-registers blocking rules)
 * - Uses instance config registry to bypass known blockers
 * - Provides automatic restore with rollback on failure
 * - Integrates with bulk operations for seamless execution
 *
 * Usage:
 *   const { SmartValidationBypass } = require('./lib/smart-validation-bypass');
 *   const bypass = new SmartValidationBypass(orgAlias);
 *
 *   // Execute operation with automatic bypass
 *   const result = await bypass.executeWithBypass('Contact', async () => {
 *       return await bulkUpdate(contacts);
 *   });
 */

const { execSync } = require('child_process');
const { getOrgContext } = require('./org-context-injector');
const { InstanceConfig } = require('./instance-config-registry');

class SmartValidationBypass {
    constructor(orgAlias = null, options = {}) {
        this.orgAlias = orgAlias;
        this.options = {
            verbose: options.verbose || false,
            dryRun: options.dryRun || false,
            autoRegister: options.autoRegister !== false, // Auto-register blocking rules by default
            ...options
        };

        this.config = null;
        this.bypassedRules = new Map(); // Track what was bypassed for restore
    }

    /**
     * Initialize with org context and config
     */
    async init() {
        if (!this.orgAlias) {
            const orgContext = await getOrgContext({ verbose: this.options.verbose });
            this.orgAlias = orgContext.alias;
        }

        // Load instance configuration
        this.config = new InstanceConfig(this.orgAlias, { verbose: this.options.verbose });
        await this.config.init();
    }

    /**
     * Execute operation with automatic validation bypass
     *
     * @param {string} objectName - Object being modified
     * @param {Function} operation - Async function to execute
     * @param {Object} options - Execution options
     * @returns {Object} Operation result with bypass metadata
     */
    async executeWithBypass(objectName, operation, options = {}) {
        await this.init();

        const strategy = this.config.getValidationBypassStrategy(objectName);
        const knownRules = this.getKnownBlockingRules(objectName);

        if (this.options.verbose) {
            console.log(`\n🛡️  Smart Validation Bypass:`);
            console.log(`   Object: ${objectName}`);
            console.log(`   Strategy: ${strategy}`);
            console.log(`   Known blocking rules: ${knownRules.length}`);
        }

        let result = null;
        let bypassedRules = [];

        try {
            // Step 1: Bypass known blocking rules
            if (knownRules.length > 0 && !this.options.dryRun) {
                bypassedRules = await this.bypassRules(knownRules);
            }

            // Step 2: Execute operation
            if (this.options.verbose) {
                console.log(`\n▶️  Executing operation...`);
            }

            result = await operation();

            // Step 3: Restore validation rules
            if (bypassedRules.length > 0 && !this.options.dryRun) {
                await this.restoreRules(bypassedRules);
            }

            if (this.options.verbose) {
                console.log(`\n✅ Operation completed successfully`);
            }

            return {
                success: true,
                result,
                bypassedRules: bypassedRules.map(r => r.validationName),
                metadata: {
                    objectName,
                    strategy,
                    rulesDisabled: bypassedRules.length
                }
            };

        } catch (error) {
            // Rollback: Restore rules even on failure
            if (bypassedRules.length > 0 && !this.options.dryRun) {
                try {
                    await this.restoreRules(bypassedRules);
                } catch (restoreError) {
                    console.error(`❌ Error restoring rules: ${restoreError.message}`);
                }
            }

            // Check if error is due to validation rule
            const blockingRule = this.parseValidationError(error.message);
            if (blockingRule && this.options.autoRegister) {
                await this.registerNewBlockingRule(blockingRule, objectName, error.message);
            }

            throw error;
        }
    }

    /**
     * Get known blocking rules for an object
     */
    getKnownBlockingRules(objectName) {
        const allRules = this.config.get('knownBlockingRules', []);
        return allRules.filter(rule => rule.objectName === objectName);
    }

    /**
     * Bypass validation rules
     */
    async bypassRules(rules) {
        const bypassedRules = [];

        for (const rule of rules) {
            try {
                if (this.options.verbose) {
                    console.log(`   ⏸️  Disabling: ${rule.ruleName}`);
                }

                // Get current rule metadata
                const ruleMetadata = await this.getValidationRuleMetadata(rule.ruleName, rule.objectName);

                if (!ruleMetadata) {
                    console.warn(`⚠️  Rule not found: ${rule.ruleName} on ${rule.objectName}`);
                    continue;
                }

                // Disable the rule
                await this.updateValidationRule(ruleMetadata.Id, false);

                bypassedRules.push({
                    validationName: rule.ruleName,
                    objectName: rule.objectName,
                    id: ruleMetadata.Id,
                    wasActive: ruleMetadata.Active
                });

            } catch (error) {
                console.error(`❌ Error disabling ${rule.ruleName}: ${error.message}`);
            }
        }

        return bypassedRules;
    }

    /**
     * Restore validation rules (parallel for performance)
     */
    async restoreRules(rules) {
        if (this.options.verbose) {
            console.log(`   📊 Restoring ${rules.length} validation rules in parallel...`);
        }

        // Parallelize restoration - each rule update is independent
        const results = await Promise.all(
            rules.map(async (rule) => {
                try {
                    if (this.options.verbose) {
                        console.log(`   ▶️  Restoring: ${rule.validationName}`);
                    }

                    // Only restore if it was originally active
                    if (rule.wasActive) {
                        await this.updateValidationRule(rule.id, true);
                    }

                    return { success: true, ruleName: rule.validationName };

                } catch (error) {
                    console.error(`❌ Error restoring ${rule.validationName}: ${error.message}`);
                    // Critical error - validation rule stuck in disabled state
                    return { success: false, ruleName: rule.validationName, error: error.message };
                }
            })
        );

        // Check if any failures occurred
        const failures = results.filter(r => !r.success);
        if (failures.length > 0) {
            throw new Error(`Failed to restore ${failures.length} validation rules: ${failures.map(f => f.ruleName).join(', ')}`);
        }
    }

    /**
     * Get validation rule metadata
     */
    async getValidationRuleMetadata(validationName, objectName) {
        try {
            const query = `SELECT Id, ValidationName, Active, ErrorMessage
                          FROM ValidationRule
                          WHERE ValidationName = '${validationName}'
                          AND EntityDefinitionId = '${objectName}'`;

            const result = execSync(
                `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`,
                { encoding: 'utf8' }
            );

            const data = JSON.parse(result);
            const records = data.result?.records || [];

            return records.length > 0 ? records[0] : null;

        } catch (error) {
            if (this.options.verbose) {
                console.error(`Error querying validation rule: ${error.message}`);
            }
            return null;
        }
    }

    /**
     * Update validation rule active status
     */
    async updateValidationRule(ruleId, active) {
        const metadata = {
            Id: ruleId,
            Metadata: {
                active: active
            }
        };

        // Write metadata update file
        const fs = require('fs');
        const path = require('path');
        const tempFile = path.join(__dirname, `../../temp-validation-${Date.now()}.json`);

        fs.writeFileSync(tempFile, JSON.stringify(metadata));

        try {
            // Use Metadata API to update
            execSync(
                `sf data update record --sobject ValidationRule --record-id ${ruleId} --values "Active=${active}" --use-tooling-api --target-org ${this.orgAlias}`,
                { encoding: 'utf8' }
            );
        } finally {
            // Cleanup temp file
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        }
    }

    /**
     * Parse validation error to extract rule name
     */
    parseValidationError(errorMessage) {
        // Pattern: "FIELD_CUSTOM_VALIDATION_EXCEPTION: [RuleName]: Error message"
        const match = errorMessage.match(/FIELD_CUSTOM_VALIDATION_EXCEPTION.*?\[([^\]]+)\]/i);
        if (match) {
            return match[1];
        }

        // Alternative pattern: Extract from error message
        const altMatch = errorMessage.match(/Validation rule '([^']+)' failed/i);
        if (altMatch) {
            return altMatch[1];
        }

        return null;
    }

    /**
     * Register new blocking rule discovered from error
     */
    async registerNewBlockingRule(ruleName, objectName, errorMessage) {
        if (this.options.verbose) {
            console.log(`\n📝 Registering new blocking rule: ${ruleName} on ${objectName}`);
        }

        this.config.registerBlockingRule(
            ruleName,
            objectName,
            `Auto-discovered from error: ${errorMessage.substring(0, 200)}`
        );
    }

    /**
     * Get all active validation rules for an object
     */
    async getActiveValidationRules(objectName) {
        try {
            const query = `SELECT Id, ValidationName, Active, ErrorMessage, ErrorDisplayField
                          FROM ValidationRule
                          WHERE EntityDefinitionId = '${objectName}'
                          AND Active = true
                          ORDER BY ValidationName`;

            const result = execSync(
                `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`,
                { encoding: 'utf8' }
            );

            const data = JSON.parse(result);
            return data.result?.records || [];

        } catch (error) {
            if (this.options.verbose) {
                console.error(`Error querying validation rules: ${error.message}`);
            }
            return [];
        }
    }

    /**
     * Test which validation rules would block an operation
     */
    async testValidationRules(objectName, sampleRecord) {
        await this.init();

        const activeRules = await this.getActiveValidationRules(objectName);

        if (this.options.verbose) {
            console.log(`\n🧪 Testing ${activeRules.length} active validation rules on ${objectName}`);
        }

        // This would require actually attempting the operation
        // For now, return the active rules that might block
        return {
            objectName,
            activeRules: activeRules.map(r => ({
                name: r.ValidationName,
                errorMessage: r.ErrorMessage,
                errorField: r.ErrorDisplayField
            })),
            recommendedBypass: activeRules.map(r => r.ValidationName)
        };
    }

    /**
     * Generate bypass configuration for object
     */
    async generateBypassConfig(objectName) {
        await this.init();

        const activeRules = await this.getActiveValidationRules(objectName);
        const knownRules = this.getKnownBlockingRules(objectName);

        return {
            objectName,
            totalActiveRules: activeRules.length,
            knownBlockingRules: knownRules.length,
            strategy: this.config.getValidationBypassStrategy(objectName),
            rules: activeRules.map(rule => ({
                name: rule.ValidationName,
                isKnownBlocker: knownRules.some(kr => kr.ruleName === rule.ValidationName),
                errorMessage: rule.ErrorMessage
            }))
        };
    }

    /**
     * Bulk bypass all rules for object (use with caution)
     */
    async bypassAllRules(objectName) {
        await this.init();

        const activeRules = await this.getActiveValidationRules(objectName);

        if (this.options.verbose) {
            console.log(`\n⚠️  WARNING: Bypassing ALL ${activeRules.length} validation rules on ${objectName}`);
            console.log(`   📊 Disabling ${activeRules.length} rules in parallel...`);
        }

        // Parallelize rule disabling for performance
        const results = await Promise.all(
            activeRules.map(async (rule) => {
                try {
                    await this.updateValidationRule(rule.Id, false);
                    return {
                        success: true,
                        validationName: rule.ValidationName,
                        objectName: objectName,
                        id: rule.Id,
                        wasActive: true
                    };
                } catch (error) {
                    console.error(`Error disabling ${rule.ValidationName}: ${error.message}`);
                    return { success: false, validationName: rule.ValidationName, error: error.message };
                }
            })
        );

        // Filter to only successful bypasses
        const bypassedRules = results.filter(r => r.success);

        if (this.options.verbose) {
            console.log(`   ✅ Disabled ${bypassedRules.length}/${activeRules.length} rules`);
        }

        this.bypassedRules.set(objectName, bypassedRules);
        return bypassedRules;
    }

    /**
     * Restore all bypassed rules for object
     */
    async restoreAllRules(objectName) {
        const rules = this.bypassedRules.get(objectName);

        if (!rules || rules.length === 0) {
            if (this.options.verbose) {
                console.log(`No bypassed rules to restore for ${objectName}`);
            }
            return;
        }

        await this.restoreRules(rules);
        this.bypassedRules.delete(objectName);
    }

    /**
     * Get summary of current bypass state
     */
    getSummary() {
        const summary = {
            orgAlias: this.orgAlias,
            currentlyBypassed: {},
            knownBlockingRules: {}
        };

        // Currently bypassed rules
        for (const [objectName, rules] of this.bypassedRules.entries()) {
            summary.currentlyBypassed[objectName] = rules.map(r => r.validationName);
        }

        // Known blocking rules from config
        const allKnownRules = this.config.get('knownBlockingRules', []);
        for (const rule of allKnownRules) {
            if (!summary.knownBlockingRules[rule.objectName]) {
                summary.knownBlockingRules[rule.objectName] = [];
            }
            summary.knownBlockingRules[rule.objectName].push(rule.ruleName);
        }

        return summary;
    }
}

module.exports = {
    SmartValidationBypass
};

// CLI usage
if (require.main === module) {
    (async () => {
        const args = process.argv.slice(2);

        if (args.length < 2) {
            console.log('Usage: smart-validation-bypass.js <org-alias> <command> [args...]');
            console.log('');
            console.log('Commands:');
            console.log('  list <object>           List active validation rules');
            console.log('  test <object>           Test which rules might block operations');
            console.log('  config <object>         Generate bypass configuration');
            console.log('  bypass-all <object>     Bypass all rules (dangerous!)');
            console.log('  restore-all <object>    Restore all bypassed rules');
            console.log('  summary                 Show current bypass state');
            console.log('');
            console.log('Examples:');
            console.log('  smart-validation-bypass.js wedgewood-production list Contact');
            console.log('  smart-validation-bypass.js wedgewood-production config Contact');
            process.exit(1);
        }

        const orgAlias = args[0];
        const command = args[1];

        const bypass = new SmartValidationBypass(orgAlias, { verbose: true });

        switch (command) {
            case 'list':
                if (!args[2]) {
                    console.error('Error: Object name required');
                    process.exit(1);
                }
                const rules = await bypass.getActiveValidationRules(args[2]);
                console.log(`\n📋 Active Validation Rules on ${args[2]}:\n`);
                rules.forEach(rule => {
                    console.log(`  • ${rule.ValidationName}`);
                    console.log(`    ${rule.ErrorMessage}\n`);
                });
                break;

            case 'test':
                if (!args[2]) {
                    console.error('Error: Object name required');
                    process.exit(1);
                }
                const testResult = await bypass.testValidationRules(args[2], {});
                console.log('\n🧪 Validation Rule Test Results:\n');
                console.log(JSON.stringify(testResult, null, 2));
                break;

            case 'config':
                if (!args[2]) {
                    console.error('Error: Object name required');
                    process.exit(1);
                }
                const config = await bypass.generateBypassConfig(args[2]);
                console.log('\n⚙️  Bypass Configuration:\n');
                console.log(JSON.stringify(config, null, 2));
                break;

            case 'bypass-all':
                if (!args[2]) {
                    console.error('Error: Object name required');
                    process.exit(1);
                }
                await bypass.bypassAllRules(args[2]);
                console.log(`\n✓ All rules bypassed for ${args[2]}`);
                break;

            case 'restore-all':
                if (!args[2]) {
                    console.error('Error: Object name required');
                    process.exit(1);
                }
                await bypass.restoreAllRules(args[2]);
                console.log(`\n✓ All rules restored for ${args[2]}`);
                break;

            case 'summary':
                await bypass.init();
                const summary = bypass.getSummary();
                console.log('\n📊 Bypass Summary:\n');
                console.log(JSON.stringify(summary, null, 2));
                break;

            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }
    })();
}
