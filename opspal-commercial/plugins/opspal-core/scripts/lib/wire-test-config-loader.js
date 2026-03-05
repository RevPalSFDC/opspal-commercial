#!/usr/bin/env node
/**
 * Live Wire Sync Test Configuration Loader
 *
 * Purpose: Load and validate wire-test-config.json with environment variable substitution
 * and schema validation.
 *
 * Features:
 * - Environment variable substitution (${VAR_NAME})
 * - Configuration validation
 * - Default value merging
 * - Timestamp and UUID replacement
 *
 * Usage:
 *   const ConfigLoader = require('./wire-test-config-loader');
 *   const config = ConfigLoader.load('./wire-test-config.json');
 *   console.log(config.sla_seconds); // Resolved configuration
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class WireTestConfigLoader {
    /**
     * Load configuration from file with env var substitution
     * @param {string} configPath - Path to wire-test-config.json
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

        // Replace run_id with fresh UUID
        if (resolved.run_id === '{{UUID}}') {
            resolved.run_id = crypto.randomUUID();
        }

        // Replace timestamp
        if (resolved.timestamp === '{{TIMESTAMP}}') {
            resolved.timestamp = new Date().toISOString();
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
            ['salesforce', 'orgAlias']
        ];

        required.forEach(([section, field]) => {
            if (!config[section] || !config[section][field]) {
                errors.push(`Missing required field: ${section}.${field}`);
            }
        });

        // Validate SLA seconds
        if (config.sla_seconds !== undefined) {
            if (config.sla_seconds < 10 || config.sla_seconds > 600) {
                errors.push('sla_seconds must be between 10 and 600');
            }
        }

        // Validate polling interval
        if (config.polling_interval_seconds !== undefined) {
            if (config.polling_interval_seconds < 1 || config.polling_interval_seconds > 60) {
                errors.push('polling_interval_seconds must be between 1 and 60');
            }
        }

        // Validate sample size
        if (config.sample_size_per_account !== undefined) {
            if (config.sample_size_per_account < 1 || config.sample_size_per_account > 200) {
                errors.push('sample_size_per_account must be between 1 and 200');
            }
        }

        // Validate object types
        if (config.object_types) {
            const validTypes = ['account', 'contact', 'opportunity', 'lead'];
            config.object_types.forEach(type => {
                if (!validTypes.includes(type)) {
                    errors.push(`Invalid object_type: ${type}. Must be one of: ${validTypes.join(', ')}`);
                }
            });
        }

        // Validate account selectors
        if (config.account_selectors) {
            if (!Array.isArray(config.account_selectors) || config.account_selectors.length === 0) {
                errors.push('account_selectors must be a non-empty array');
            }

            config.account_selectors.forEach((selector, index) => {
                if (typeof selector === 'object' && selector.type && selector.value) {
                    const validSelectorTypes = ['sfdc_account_id', 'hubspot_company_id', 'domain', 'sync_anchor'];
                    if (!validSelectorTypes.includes(selector.type)) {
                        errors.push(`Invalid selector type at index ${index}: ${selector.type}`);
                    }
                } else if (typeof selector !== 'string') {
                    errors.push(`Invalid selector format at index ${index}. Must be string or {type, value} object`);
                }
            });
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
            run_id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            sla_seconds: 240,
            polling_interval_seconds: 10,
            sample_size_per_account: 20,
            revert_changes: true,
            dry_run: false,
            include_related_contacts: true,
            object_types: ['account', 'contact'],
            account_selectors: [],
            salesforce: {
                orgAlias: process.env.SALESFORCE_ORG_ALIAS || 'default',
                instanceUrl: process.env.SALESFORCE_INSTANCE_URL || '',
                accessToken: process.env.SALESFORCE_ACCESS_TOKEN || ''
            },
            hubspot: {
                portalId: process.env.HUBSPOT_PORTAL_ID || '',
                accessToken: process.env.HUBSPOT_PRIVATE_APP_TOKEN || ''
            },
            output: {
                outputDir: './wire-test-reports',
                generateJSON: true,
                generateMarkdown: true,
                generatePDF: true,
                alertSlackWebhook: process.env.SLACK_WEBHOOK_URL || ''
            },
            fields: {
                sync_anchor_field: 'Sync_Anchor__c',
                wire_test_1_field: 'Wire_Test_1__c',
                wire_test_2_field: 'Wire_Test_2__c',
                hubspot_id_field: 'Hubspot_ID__c',
                last_sync_time_field: 'Last_Sync_Time__c',
                manual_sync_field: 'Manual_Sync__c',
                former_sfdc_ids_field: 'Former_SFDC_IDs__c',
                former_hubspot_ids_field: 'Former_Hubspot_IDs__c',
                wire_test_run_id_field: 'Wire_Test_Run_ID__c',
                wire_test_timestamp_field: 'Wire_Test_Timestamp__c',
                last_sync_direction_field: 'Last_Sync_Direction__c',
                last_sync_error_field: 'Last_Sync_Error__c'
            },
            properties: {
                sync_anchor_property: 'sync_anchor',
                wire_test_1_property: 'wire_test_1',
                wire_test_2_property: 'wire_test_2',
                salesforce_id_property: 'salesforce_id',
                last_sync_time_property: 'last_sync_time',
                manual_sync_property: 'manual_sync',
                former_sfdc_ids_property: 'former_sfdc_ids',
                former_hubspot_ids_property: 'former_hubspot_ids',
                wire_test_run_id_property: 'wire_test_run_id',
                wire_test_timestamp_property: 'wire_test_timestamp',
                last_sync_direction_property: 'last_sync_direction',
                last_sync_error_property: 'last_sync_error'
            },
            rate_limiting: {
                hubspot_max_requests_per_10s: 100,
                salesforce_max_requests_per_24h: 15000,
                exponential_backoff_base_ms: 1000,
                max_retries: 3
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
     * Generate timestamp for reports
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

        console.log('\n📋 Live Wire Sync Test Configuration');
        console.log('═'.repeat(60));
        console.log(`Run ID: ${config.run_id}`);
        console.log(`Timestamp: ${config.timestamp}`);
        console.log('');
        console.log(`HubSpot Portal: ${config.hubspot.portalId}`);
        console.log(`HubSpot Token: ${redact(config.hubspot.accessToken)}`);
        console.log(`Salesforce Org: ${config.salesforce.orgAlias}`);
        console.log(`Salesforce URL: ${config.salesforce.instanceUrl}`);
        console.log(`Salesforce Token: ${redact(config.salesforce.accessToken)}`);
        console.log('');
        console.log(`Execution Mode: ${config.dry_run ? '🔍 DRY RUN' : '⚠️  LIVE EXECUTION'}`);
        console.log(`SLA: ${config.sla_seconds} seconds`);
        console.log(`Polling Interval: ${config.polling_interval_seconds} seconds`);
        console.log(`Sample Size per Account: ${config.sample_size_per_account}`);
        console.log(`Object Types: ${config.object_types.join(', ')}`);
        console.log(`Include Contacts: ${config.include_related_contacts ? 'Yes' : 'No'}`);
        console.log(`Revert Changes: ${config.revert_changes ? 'Yes' : 'No'}`);
        console.log('');
        console.log(`Account Selectors: ${config.account_selectors.length} defined`);
        config.account_selectors.slice(0, 3).forEach((selector, i) => {
            if (typeof selector === 'object') {
                console.log(`  ${i + 1}. ${selector.type}: ${selector.value}`);
            } else {
                console.log(`  ${i + 1}. ${selector}`);
            }
        });
        if (config.account_selectors.length > 3) {
            console.log(`  ... and ${config.account_selectors.length - 3} more`);
        }
        console.log('');
        console.log(`Output Directory: ${config.output.outputDir}`);
        console.log(`Generate PDF: ${config.output.generatePDF ? 'Yes' : 'No'}`);
        console.log(`Slack Alerts: ${config.output.alertSlackWebhook ? 'Enabled' : 'Disabled'}`);
        console.log('═'.repeat(60));
    }

    /**
     * Normalize account selectors to consistent format
     * @param {Array} selectors - Array of selector strings or objects
     * @returns {Array} Normalized array of {type, value} objects
     */
    static normalizeSelectors(selectors) {
        return selectors.map(selector => {
            if (typeof selector === 'object' && selector.type && selector.value) {
                return selector;
            }

            if (typeof selector === 'string') {
                // Try to infer type from value
                if (selector.startsWith('001') && selector.length === 18) {
                    return { type: 'sfdc_account_id', value: selector };
                }
                if (selector.startsWith('domain:')) {
                    return { type: 'domain', value: selector.replace('domain:', '') };
                }
                if (/^\d+$/.test(selector)) {
                    return { type: 'hubspot_company_id', value: selector };
                }
                // UUID format = sync_anchor
                if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selector)) {
                    return { type: 'sync_anchor', value: selector };
                }
            }

            throw new Error(`Unable to parse selector: ${JSON.stringify(selector)}`);
        });
    }
}

// CLI Usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Live Wire Sync Test Configuration Loader

Usage:
  node wire-test-config-loader.js <config-path>
  node wire-test-config-loader.js validate <config-path>
  node wire-test-config-loader.js template
  node wire-test-config-loader.js normalize-selectors <selector1> <selector2> ...

Commands:
  <config-path>      - Load and display configuration
  validate           - Validate configuration only
  template           - Generate template configuration file
  normalize-selectors- Parse and normalize account selectors

Examples:
  node wire-test-config-loader.js ./wire-test-config.json
  node wire-test-config-loader.js validate ./wire-test-config.json
  node wire-test-config-loader.js template > my-config.json
  node wire-test-config-loader.js normalize-selectors 001XXXXX domain:acme.com 12345
        `);
        process.exit(0);
    }

    const command = args[0];

    if (command === 'template') {
        const templatePath = path.join(__dirname, '../../templates/wire-test-config.template.json');
        if (fs.existsSync(templatePath)) {
            const template = fs.readFileSync(templatePath, 'utf8');
            console.log(template);
        } else {
            console.error(`Template not found: ${templatePath}`);
            console.log('// Generate template manually or create one from defaults');
            console.log(JSON.stringify(WireTestConfigLoader._mergeDefaults({}), null, 2));
        }
        process.exit(0);
    }

    if (command === 'normalize-selectors') {
        const selectors = args.slice(1);
        try {
            const normalized = WireTestConfigLoader.normalizeSelectors(selectors);
            console.log(JSON.stringify(normalized, null, 2));
            process.exit(0);
        } catch (error) {
            console.error('❌ Error normalizing selectors:');
            console.error(error.message);
            process.exit(1);
        }
    }

    const configPath = command === 'validate' ? args[1] : args[0];

    if (!configPath) {
        console.error('Error: Configuration path required');
        process.exit(1);
    }

    try {
        if (command === 'validate') {
            const config = WireTestConfigLoader.load(configPath);
            console.log('✅ Configuration is valid');
            process.exit(0);
        } else {
            const config = WireTestConfigLoader.load(configPath);
            WireTestConfigLoader.printSummary(config);
            console.log('\n✅ Configuration loaded successfully');
        }
    } catch (error) {
        console.error('❌ Error loading configuration:');
        console.error(error.message);
        process.exit(1);
    }
}

module.exports = WireTestConfigLoader;
