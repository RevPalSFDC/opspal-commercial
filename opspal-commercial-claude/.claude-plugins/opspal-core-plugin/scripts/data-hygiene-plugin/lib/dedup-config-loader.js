#!/usr/bin/env node
/**
 * Deduplication Configuration Loader
 *
 * Purpose: Load and validate dedup-config.json with environment variable substitution
 * and schema validation.
 *
 * Features:
 * - Environment variable substitution (${VAR_NAME})
 * - Configuration validation
 * - Default value merging
 * - Timestamp replacement in idempotency prefix
 *
 * Usage:
 *   const ConfigLoader = require('./dedup-config-loader');
 *   const config = ConfigLoader.load('./dedup-config.json');
 *   console.log(config.hubspot.accessToken); // Resolved from env var
 */

const fs = require('fs');
const path = require('path');

class DedupConfigLoader {
    /**
     * Load configuration from file with env var substitution
     * @param {string} configPath - Path to dedup-config.json
     * @returns {object} Resolved configuration
     */
    static load(configPath) {
        if (!fs.existsSync(configPath)) {
            throw new Error(`Configuration file not found: ${configPath}`);
        }

        const rawConfig = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(rawConfig);

        // Substitute environment variables
        const resolved = this._resolveEnvVars(config);

        // Replace timestamp in idempotency prefix
        if (resolved.execution && resolved.execution.idempotencyPrefix) {
            resolved.execution.idempotencyPrefix = resolved.execution.idempotencyPrefix.replace(
                '{{TIMESTAMP}}',
                this._generateTimestamp()
            );
        }

        // Validate configuration
        this._validate(resolved);

        // Merge with defaults
        return this._mergeDefaults(resolved);
    }

    /**
     * Load configuration or use defaults
     * @param {string} configPath - Optional path to config
     * @returns {object}
     */
    static loadOrDefault(configPath = null) {
        if (configPath && fs.existsSync(configPath)) {
            return this.load(configPath);
        }

        console.log('⚠️  No configuration file provided, using defaults with environment variables');
        return this._mergeDefaults({});
    }

    /**
     * Resolve environment variables in configuration
     */
    static _resolveEnvVars(obj) {
        if (typeof obj === 'string') {
            // Match ${VAR_NAME} pattern
            const match = obj.match(/^\${([A-Z_][A-Z0-9_]*)}$/);
            if (match) {
                const varName = match[1];
                const value = process.env[varName];

                if (!value) {
                    console.warn(`⚠️  Environment variable not set: ${varName}`);
                    return obj; // Keep template if not found
                }

                return value;
            }
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this._resolveEnvVars(item));
        }

        if (typeof obj === 'object' && obj !== null) {
            const resolved = {};
            for (const [key, value] of Object.entries(obj)) {
                // Skip note fields
                if (!key.startsWith('note')) {
                    resolved[key] = this._resolveEnvVars(value);
                }
            }
            return resolved;
        }

        return obj;
    }

    /**
     * Validate configuration schema
     */
    static _validate(config) {
        const errors = [];

        // Required fields
        const required = [
            ['hubspot', 'portalId'],
            ['hubspot', 'accessToken'],
            ['salesforce', 'instanceUrl'],
            ['salesforce', 'accessToken'],
            ['salesforce', 'orgAlias']
        ];

        required.forEach(([section, field]) => {
            if (!config[section] || !config[section][field]) {
                errors.push(`Missing required field: ${section}.${field}`);
            }
        });

        // Validate weights are numbers
        if (config.canonicalWeights) {
            Object.entries(config.canonicalWeights).forEach(([key, value]) => {
                if (typeof value !== 'number') {
                    errors.push(`canonicalWeights.${key} must be a number, got ${typeof value}`);
                }
            });
        }

        // Validate batch size
        if (config.execution?.batchSize) {
            if (config.execution.batchSize < 1 || config.execution.batchSize > 200) {
                errors.push('execution.batchSize must be between 1 and 200');
            }
        }

        if (errors.length > 0) {
            throw new Error(`Configuration validation failed:\n  - ${errors.join('\n  - ')}`);
        }
    }

    /**
     * Merge configuration with defaults
     */
    static _mergeDefaults(config) {
        const defaults = {
            hubspot: {
                portalId: process.env.HUBSPOT_PORTAL_ID || '',
                accessToken: process.env.HUBSPOT_PRIVATE_APP_TOKEN || ''
            },
            salesforce: {
                instanceUrl: process.env.SALESFORCE_INSTANCE_URL || '',
                accessToken: process.env.SALESFORCE_ACCESS_TOKEN || '',
                orgAlias: process.env.SALESFORCE_ORG_ALIAS || 'default'
            },
            execution: {
                dryRun: true, // ALWAYS default to true for safety
                autoAssociateOffDuringCleanup: true,
                batchSize: 100,
                maxWritePerMin: 60,
                idempotencyPrefix: `dedupe-${this._generateTimestamp()}`
            },
            canonicalWeights: {
                hasSalesforceAccountId: 100,
                numContacts: 40,
                numDeals: 25,
                ownerPresent: 10,
                createdateOldest: 5
            },
            output: {
                outputDir: './dedup-reports',
                alertSlackWebhook: process.env.SLACK_WEBHOOK_URL || '',
                generateCSV: true,
                generateJSON: true,
                generateMarkdown: true
            },
            guardrails: {
                createExternalSFDCAccountIdProperty: true,
                enforceUniqueConstraint: true,
                keepAutoAssociateOff: true
            },
            validation: {
                spotCheckPercentage: 5,
                requireZeroDuplicatesAfter7Days: true,
                validateAssociationPreservation: true,
                failOnDataLoss: true
            }
        };

        return this._deepMerge(defaults, config);
    }

    /**
     * Deep merge objects
     */
    static _deepMerge(target, source) {
        const result = { ...target };

        for (const [key, value] of Object.entries(source)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                result[key] = this._deepMerge(target[key] || {}, value);
            } else {
                result[key] = value;
            }
        }

        return result;
    }

    /**
     * Generate timestamp for idempotency prefix
     */
    static _generateTimestamp() {
        const now = new Date();
        return now.toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
    }

    /**
     * Print configuration summary (redacting sensitive values)
     */
    static printSummary(config) {
        const redact = (value) => {
            if (!value || typeof value !== 'string') return value;
            if (value.length > 10) {
                return value.slice(0, 6) + '***' + value.slice(-4);
            }
            return '***';
        };

        console.log('\n📋 Configuration Summary');
        console.log('═'.repeat(60));
        console.log(`HubSpot Portal: ${config.hubspot.portalId}`);
        console.log(`HubSpot Token: ${redact(config.hubspot.accessToken)}`);
        console.log(`Salesforce Org: ${config.salesforce.orgAlias}`);
        console.log(`Salesforce URL: ${config.salesforce.instanceUrl}`);
        console.log(`Salesforce Token: ${redact(config.salesforce.accessToken)}`);
        console.log('');
        console.log(`Execution Mode: ${config.execution.dryRun ? '🔍 DRY RUN' : '⚠️  LIVE EXECUTION'}`);
        console.log(`Batch Size: ${config.execution.batchSize}`);
        console.log(`Idempotency Prefix: ${config.execution.idempotencyPrefix}`);
        console.log('');
        console.log(`Output Directory: ${config.output.outputDir}`);
        console.log(`Slack Alerts: ${config.output.alertSlackWebhook ? 'Enabled' : 'Disabled'}`);
        console.log('═'.repeat(60));
    }
}

// CLI Usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Deduplication Configuration Loader

Usage:
  node dedup-config-loader.js <config-path>
  node dedup-config-loader.js validate <config-path>
  node dedup-config-loader.js template

Commands:
  <config-path>  - Load and display configuration
  validate       - Validate configuration only
  template       - Generate template configuration file

Examples:
  node dedup-config-loader.js ./dedup-config.json
  node dedup-config-loader.js validate ./dedup-config.json
  node dedup-config-loader.js template > my-config.json
        `);
        process.exit(0);
    }

    const command = args[0];

    if (command === 'template') {
        const templatePath = path.join(__dirname, '../../templates/dedup-config.template.json');
        const template = fs.readFileSync(templatePath, 'utf8');
        console.log(template);
        process.exit(0);
    }

    const configPath = command === 'validate' ? args[1] : args[0];

    if (!configPath) {
        console.error('Error: Configuration path required');
        process.exit(1);
    }

    try {
        if (command === 'validate') {
            const config = DedupConfigLoader.load(configPath);
            console.log('✅ Configuration is valid');
            process.exit(0);
        } else {
            const config = DedupConfigLoader.load(configPath);
            DedupConfigLoader.printSummary(config);
            console.log('\n✅ Configuration loaded successfully');
        }
    } catch (error) {
        console.error('❌ Error loading configuration:');
        console.error(error.message);
        process.exit(1);
    }
}

module.exports = DedupConfigLoader;
