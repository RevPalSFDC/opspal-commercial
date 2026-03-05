#!/usr/bin/env node

/**
 * Flow Validator Configuration Parser
 *
 * Parses .flow-validator.yml configuration files for org-specific rule customization
 *
 * Configuration Format:
 * ```yaml
 * rules:
 *   DMLInLoop:
 *     severity: error
 *     enabled: true
 *
 *   HardcodedId:
 *     severity: warning
 *     expression: "[0-9]{15,18}"
 *
 *   APIVersion:
 *     severity: error
 *     minVersion: 60
 *
 * exceptions:
 *   flows:
 *     Legacy_Flow_1:
 *       - HardcodedId
 *       - MissingFaultPath
 *
 *   global:
 *     DMLInLoop:
 *       - GetRecordsElement_1  # Known safe usage
 * ```
 *
 * @module flow-validator-config
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

class FlowValidatorConfig {
    constructor() {
        this.config = {
            rules: {},
            exceptions: {
                flows: {},
                global: {}
            }
        };
        this.loaded = false;
    }

    /**
     * Load configuration from file
     * @param {string} configPath - Path to .flow-validator.yml
     * @returns {Promise<Object>} Parsed configuration
     */
    async load(configPath) {
        try {
            // Try provided path first
            let resolvedPath = configPath;

            // If not found, try common locations
            if (!await this._fileExists(resolvedPath)) {
                const commonLocations = [
                    '.flow-validator.yml',
                    '.flow-validator.yaml',
                    'config/.flow-validator.yml',
                    '.config/flow-validator.yml'
                ];

                for (const location of commonLocations) {
                    if (await this._fileExists(location)) {
                        resolvedPath = location;
                        break;
                    }
                }
            }

            // Read and parse YAML
            const fileContent = await fs.readFile(resolvedPath, 'utf8');
            const parsed = yaml.load(fileContent);

            // Validate structure
            this._validateConfig(parsed);

            // Merge with defaults
            this.config = this._mergeWithDefaults(parsed);
            this.loaded = true;

            return this.config;
        } catch (error) {
            if (error.code === 'ENOENT') {
                // No config file found - use defaults
                this.config = this._getDefaultConfig();
                this.loaded = false;
                return this.config;
            }
            throw new Error(`Failed to load config: ${error.message}`);
        }
    }

    /**
     * Get rule configuration
     * @param {string} ruleName - Name of the rule
     * @returns {Object} Rule configuration
     */
    getRuleConfig(ruleName) {
        return this.config.rules[ruleName] || this._getDefaultRuleConfig(ruleName);
    }

    /**
     * Check if rule is enabled
     * @param {string} ruleName - Name of the rule
     * @returns {boolean} True if enabled
     */
    isRuleEnabled(ruleName) {
        const ruleConfig = this.getRuleConfig(ruleName);
        return ruleConfig.enabled !== false;
    }

    /**
     * Get severity for rule
     * @param {string} ruleName - Name of the rule
     * @returns {string} Severity level (error, warning, note)
     */
    getRuleSeverity(ruleName) {
        const ruleConfig = this.getRuleConfig(ruleName);
        return ruleConfig.severity || this._getDefaultSeverity(ruleName);
    }

    /**
     * Check if violation is excepted for a flow
     * @param {string} flowName - Name of the flow
     * @param {string} ruleName - Name of the rule
     * @param {string} elementName - Name of the element (optional)
     * @returns {boolean} True if excepted
     */
    isExcepted(flowName, ruleName, elementName = null) {
        // Check flow-specific exceptions
        const flowExceptions = this.config.exceptions.flows[flowName] || [];
        if (flowExceptions.includes(ruleName)) {
            return true;
        }

        // Check global exceptions
        const globalExceptions = this.config.exceptions.global[ruleName] || [];
        if (elementName && globalExceptions.includes(elementName)) {
            return true;
        }

        return false;
    }

    /**
     * Get all exceptions for a flow
     * @param {string} flowName - Name of the flow
     * @returns {Array<string>} Array of excepted rule names
     */
    getFlowExceptions(flowName) {
        return this.config.exceptions.flows[flowName] || [];
    }

    /**
     * Get configuration summary
     * @returns {Object} Configuration summary
     */
    getSummary() {
        return {
            loaded: this.loaded,
            totalRules: Object.keys(this.config.rules).length,
            enabledRules: Object.values(this.config.rules).filter(r => r.enabled !== false).length,
            flowExceptions: Object.keys(this.config.exceptions.flows).length,
            globalExceptions: Object.keys(this.config.exceptions.global).length
        };
    }

    /**
     * Validate configuration structure
     * @private
     */
    _validateConfig(config) {
        if (!config) {
            throw new Error('Configuration is empty');
        }

        // Validate rules section
        if (config.rules && typeof config.rules !== 'object') {
            throw new Error('rules section must be an object');
        }

        // Validate exceptions section
        if (config.exceptions) {
            if (config.exceptions.flows && typeof config.exceptions.flows !== 'object') {
                throw new Error('exceptions.flows must be an object');
            }
            if (config.exceptions.global && typeof config.exceptions.global !== 'object') {
                throw new Error('exceptions.global must be an object');
            }
        }

        // Validate rule configurations
        if (config.rules) {
            for (const [ruleName, ruleConfig] of Object.entries(config.rules)) {
                if (typeof ruleConfig !== 'object') {
                    throw new Error(`Rule configuration for ${ruleName} must be an object`);
                }

                if (ruleConfig.severity && !['error', 'warning', 'note'].includes(ruleConfig.severity)) {
                    throw new Error(`Invalid severity for rule ${ruleName}: ${ruleConfig.severity}`);
                }
            }
        }
    }

    /**
     * Merge configuration with defaults
     * @private
     */
    _mergeWithDefaults(config) {
        const defaults = this._getDefaultConfig();

        return {
            rules: { ...defaults.rules, ...(config.rules || {}) },
            exceptions: {
                flows: { ...defaults.exceptions.flows, ...(config.exceptions?.flows || {}) },
                global: { ...defaults.exceptions.global, ...(config.exceptions?.global || {}) }
            }
        };
    }

    /**
     * Get default configuration
     * @private
     */
    _getDefaultConfig() {
        return {
            rules: {
                // Critical rules (error by default)
                'mutual-exclusion-check': { severity: 'error', enabled: true },
                'collection-before-count': { severity: 'error', enabled: true },
                'dangling-references': { severity: 'error', enabled: true },
                'variable-declarations': { severity: 'error', enabled: true },
                'required-elements': { severity: 'error', enabled: true },

                // Best practice rules (warning by default)
                'naming-conventions': { severity: 'warning', enabled: true },
                'flow-consolidation': { severity: 'warning', enabled: true },
                'complexity-score': { severity: 'warning', enabled: true },
                'error-handling': { severity: 'warning', enabled: true },

                // Performance rules (warning by default)
                'bulk-operations': { severity: 'warning', enabled: true },
                'query-optimization': { severity: 'warning', enabled: true },
                'loop-efficiency': { severity: 'warning', enabled: true }
            },
            exceptions: {
                flows: {},
                global: {}
            }
        };
    }

    /**
     * Get default rule configuration
     * @private
     */
    _getDefaultRuleConfig(ruleName) {
        const defaults = this._getDefaultConfig();
        return defaults.rules[ruleName] || { severity: 'warning', enabled: true };
    }

    /**
     * Get default severity based on rule category
     * @private
     */
    _getDefaultSeverity(ruleName) {
        // Critical rules are errors by default
        const criticalRules = [
            'mutual-exclusion-check',
            'collection-before-count',
            'dangling-references',
            'variable-declarations',
            'required-elements'
        ];

        if (criticalRules.includes(ruleName)) {
            return 'error';
        }

        // Everything else is warning by default
        return 'warning';
    }

    /**
     * Check if file exists
     * @private
     */
    async _fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Flow Validator Configuration Parser

Usage: flow-validator-config.js [config-file] [options]

Options:
  --validate        Validate configuration file
  --summary         Show configuration summary
  --check-rule      Check configuration for specific rule
  --help            Show this help message

Examples:
  # Load and validate configuration
  node flow-validator-config.js .flow-validator.yml --validate

  # Show configuration summary
  node flow-validator-config.js .flow-validator.yml --summary

  # Check specific rule
  node flow-validator-config.js .flow-validator.yml --check-rule DMLInLoop
        `);
        process.exit(0);
    }

    const configPath = args[0] || '.flow-validator.yml';
    const parser = new FlowValidatorConfig();

    parser.load(configPath).then(config => {
        if (args.includes('--validate')) {
            console.log('✅ Configuration is valid');
        }

        if (args.includes('--summary')) {
            const summary = parser.getSummary();
            console.log('\n📋 Configuration Summary:');
            console.log(`   Loaded: ${summary.loaded ? 'Yes' : 'No (using defaults)'}`);
            console.log(`   Total Rules: ${summary.totalRules}`);
            console.log(`   Enabled Rules: ${summary.enabledRules}`);
            console.log(`   Flow Exceptions: ${summary.flowExceptions}`);
            console.log(`   Global Exceptions: ${summary.globalExceptions}`);
        }

        if (args.includes('--check-rule')) {
            const ruleIndex = args.indexOf('--check-rule');
            const ruleName = args[ruleIndex + 1];

            if (!ruleName) {
                console.error('❌ Please specify a rule name');
                process.exit(1);
            }

            const ruleConfig = parser.getRuleConfig(ruleName);
            console.log(`\n📋 Rule Configuration: ${ruleName}`);
            console.log(`   Enabled: ${parser.isRuleEnabled(ruleName)}`);
            console.log(`   Severity: ${parser.getRuleSeverity(ruleName)}`);
            console.log(`   Config:`, JSON.stringify(ruleConfig, null, 2));
        }

        if (!args.includes('--validate') && !args.includes('--summary') && !args.includes('--check-rule')) {
            console.log(JSON.stringify(config, null, 2));
        }

        process.exit(0);
    }).catch(error => {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = FlowValidatorConfig;
