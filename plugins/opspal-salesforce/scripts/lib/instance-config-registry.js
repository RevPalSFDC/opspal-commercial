#!/usr/bin/env node

/**
 * Instance Configuration Registry
 *
 * Stores org-specific metadata, quirks, and configurations to avoid
 * rediscovering the same information across projects.
 *
 * Storage: instances/{org-alias}/config.json
 *
 * Usage:
 *   const { InstanceConfig } = require('./lib/instance-config-registry');
 *   const config = new InstanceConfig('beta-production');
 *
 *   // Get known blocking validation rules
 *   const rules = config.get('knownBlockingRules');
 *
 *   // Register a field mapping
 *   config.set('fieldMappings.firstTouchCampaign', 'First_Touch_Campaign__c');
 */

const fs = require('fs');
const path = require('path');
const { getOrgContext } = require('./org-context-injector');

class InstanceConfig {
    constructor(orgAlias = null, options = {}) {
        this.orgAlias = orgAlias;
        this.options = {
            autoSave: options.autoSave !== false,
            verbose: options.verbose || false,
            ...options
        };

        this.config = null;
        this.configFile = null;
    }

    /**
     * Initialize with automatic org detection if needed
     */
    async init() {
        if (!this.orgAlias) {
            const orgContext = await getOrgContext({ verbose: this.options.verbose });
            this.orgAlias = orgContext.alias;
        }

        // Determine config file location
        const instanceDir = path.join(__dirname, '../../instances', this.orgAlias);
        this.configFile = path.join(instanceDir, 'config.json');

        // Ensure instance directory exists
        if (!fs.existsSync(instanceDir)) {
            fs.mkdirSync(instanceDir, { recursive: true });
        }

        // Load existing config or create default
        this.loadConfig();
    }

    /**
     * Load configuration from file
     */
    loadConfig() {
        if (fs.existsSync(this.configFile)) {
            try {
                const content = fs.readFileSync(this.configFile, 'utf8');
                this.config = JSON.parse(content);

                if (this.options.verbose) {
                    console.log(`✓ Loaded configuration for ${this.orgAlias}`);
                }
            } catch (error) {
                if (this.options.verbose) {
                    console.warn(`⚠️  Could not load config: ${error.message}`);
                }
                this.config = this.getDefaultConfig();
            }
        } else {
            this.config = this.getDefaultConfig();
            this.saveConfig();
        }
    }

    /**
     * Get default configuration structure
     */
    getDefaultConfig() {
        return {
            orgAlias: this.orgAlias,
            version: '1.0.0',
            lastUpdated: new Date().toISOString(),

            // Instance alias configuration
            knownAliases: [],
            environmentType: 'unknown', // production, sandbox, uat, dev, legacy
            businessName: '',
            lastAccessed: new Date().toISOString(),
            accessCount: 0,
            primaryUse: '',

            // Known validation rules that block operations
            knownBlockingRules: [],

            // Standard field mappings for common operations
            fieldMappings: {
                // Attribution fields
                firstTouchCampaign: null,
                firstTouchDate: null,
                lastTouchCampaign: null,
                lastTouchDate: null,

                // Funnel fields
                funnelStage: null,
                leadScore: null,

                // Common custom fields
                originalLeadCreatedDate: null
            },

            // Hand raiser campaign patterns (for MQL identification)
            handRaiserCampaigns: {
                landingPages: ['*Landing Page*', '*Form*'],
                interestLists: ['*Interest List*'],
                employeeReferrals: ['*Employee Referral*'],
                webinarAttendance: ['*Webinar*', '*CE *', '*Continuing Education*']
            },

            // Validation bypass strategies by object
            validationBypassStrategies: {
                Contact: 'temporary_deactivation',
                Lead: 'field_population',
                Account: 'custom_setting'
            },

            // Known data quality issues
            dataQualityIssues: [],

            // Org-specific quirks and workarounds
            quirks: [],

            // Performance settings
            performance: {
                maxBatchSize: 200,
                bulkApiTimeout: 300000,
                queryTimeout: 120000
            },

            // Operational notes
            notes: []
        };
    }

    /**
     * Save configuration to file
     */
    saveConfig() {
        try {
            this.config.lastUpdated = new Date().toISOString();
            fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf8');

            if (this.options.verbose) {
                console.log(`✓ Saved configuration for ${this.orgAlias}`);
            }
        } catch (error) {
            console.error(`❌ Error saving config: ${error.message}`);
        }
    }

    /**
     * Get configuration value by path
     * Supports dot notation: 'fieldMappings.firstTouchCampaign'
     */
    get(keyPath, defaultValue = null) {
        if (!this.config) {
            return defaultValue;
        }

        const keys = keyPath.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }

        return value !== undefined ? value : defaultValue;
    }

    /**
     * Set configuration value by path
     * Supports dot notation: 'fieldMappings.firstTouchCampaign'
     */
    set(keyPath, value) {
        if (!this.config) {
            this.config = this.getDefaultConfig();
        }

        const keys = keyPath.split('.');
        let current = this.config;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current)) {
                current[key] = {};
            }
            current = current[key];
        }

        current[keys[keys.length - 1]] = value;

        if (this.options.autoSave) {
            this.saveConfig();
        }
    }

    /**
     * Add item to array configuration
     */
    addToArray(keyPath, item) {
        const array = this.get(keyPath, []);

        if (!Array.isArray(array)) {
            throw new Error(`Configuration at ${keyPath} is not an array`);
        }

        // Avoid duplicates
        if (!array.includes(item)) {
            array.push(item);
            this.set(keyPath, array);
        }
    }

    /**
     * Remove item from array configuration
     */
    removeFromArray(keyPath, item) {
        const array = this.get(keyPath, []);

        if (!Array.isArray(array)) {
            throw new Error(`Configuration at ${keyPath} is not an array`);
        }

        const filtered = array.filter(i => i !== item);
        this.set(keyPath, filtered);
    }

    /**
     * Register a known blocking validation rule
     */
    registerBlockingRule(ruleName, objectName, reason = '') {
        const rule = {
            ruleName,
            objectName,
            reason,
            discoveredDate: new Date().toISOString()
        };

        const rules = this.get('knownBlockingRules', []);

        // Check if already registered
        const exists = rules.find(r => r.ruleName === ruleName && r.objectName === objectName);
        if (!exists) {
            rules.push(rule);
            this.set('knownBlockingRules', rules);
        }
    }

    /**
     * Register a data quality issue
     */
    registerDataQualityIssue(issue, severity = 'medium') {
        const issueRecord = {
            description: issue,
            severity,
            discoveredDate: new Date().toISOString(),
            resolved: false
        };

        const issues = this.get('dataQualityIssues', []);
        issues.push(issueRecord);
        this.set('dataQualityIssues', issues);
    }

    /**
     * Register an org quirk/workaround
     */
    registerQuirk(description, workaround = '') {
        const quirk = {
            description,
            workaround,
            discoveredDate: new Date().toISOString()
        };

        const quirks = this.get('quirks', []);
        quirks.push(quirk);
        this.set('quirks', quirks);
    }

    /**
     * Add operational note
     */
    addNote(note, category = 'general') {
        const noteRecord = {
            note,
            category,
            date: new Date().toISOString()
        };

        const notes = this.get('notes', []);
        notes.push(noteRecord);
        this.set('notes', notes);
    }

    /**
     * Get field mapping
     */
    getFieldMapping(fieldKey) {
        return this.get(`fieldMappings.${fieldKey}`);
    }

    /**
     * Set field mapping
     */
    setFieldMapping(fieldKey, apiName) {
        this.set(`fieldMappings.${fieldKey}`, apiName);
    }

    /**
     * Get all field mappings
     */
    getAllFieldMappings() {
        return this.get('fieldMappings', {});
    }

    /**
     * Get validation bypass strategy for object
     */
    getValidationBypassStrategy(objectName) {
        return this.get(`validationBypassStrategies.${objectName}`, 'temporary_deactivation');
    }

    /**
     * Set validation bypass strategy for object
     */
    setValidationBypassStrategy(objectName, strategy) {
        this.set(`validationBypassStrategies.${objectName}`, strategy);
    }

    /**
     * Export configuration as JSON
     */
    export() {
        return JSON.stringify(this.config, null, 2);
    }

    /**
     * Import configuration from JSON
     */
    import(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            this.config = { ...this.getDefaultConfig(), ...imported };
            this.config.lastUpdated = new Date().toISOString();

            if (this.options.autoSave) {
                this.saveConfig();
            }

            return true;
        } catch (error) {
            console.error(`Error importing config: ${error.message}`);
            return false;
        }
    }

    /**
     * Add alias to known aliases
     */
    addAlias(alias) {
        const aliases = this.get('knownAliases', []);

        // Normalize alias (lowercase, trim)
        const normalizedAlias = alias.toLowerCase().trim();

        // Avoid duplicates
        if (!aliases.includes(normalizedAlias)) {
            aliases.push(normalizedAlias);
            this.set('knownAliases', aliases);
        }
    }

    /**
     * Remove alias from known aliases
     */
    removeAlias(alias) {
        const normalizedAlias = alias.toLowerCase().trim();
        this.removeFromArray('knownAliases', normalizedAlias);
    }

    /**
     * Get all known aliases
     */
    getAliases() {
        return this.get('knownAliases', []);
    }

    /**
     * Set environment type
     */
    setEnvironmentType(type) {
        const validTypes = ['production', 'sandbox', 'uat', 'dev', 'legacy'];
        if (!validTypes.includes(type)) {
            throw new Error(`Invalid environment type. Must be one of: ${validTypes.join(', ')}`);
        }
        this.set('environmentType', type);
    }

    /**
     * Get environment type
     */
    getEnvironmentType() {
        return this.get('environmentType', 'unknown');
    }

    /**
     * Record access to this instance
     */
    recordAccess() {
        const count = this.get('accessCount', 0);
        this.set('accessCount', count + 1);
        this.set('lastAccessed', new Date().toISOString());
    }

    /**
     * Get configuration summary
     */
    getSummary() {
        return {
            orgAlias: this.config.orgAlias,
            lastUpdated: this.config.lastUpdated,
            knownAliases: this.config.knownAliases,
            environmentType: this.config.environmentType,
            businessName: this.config.businessName,
            lastAccessed: this.config.lastAccessed,
            accessCount: this.config.accessCount,
            blockingRules: this.config.knownBlockingRules.length,
            dataQualityIssues: this.config.dataQualityIssues.filter(i => !i.resolved).length,
            quirks: this.config.quirks.length,
            notes: this.config.notes.length,
            fieldMappingsConfigured: Object.values(this.config.fieldMappings).filter(v => v !== null).length
        };
    }

    /**
     * Merge configuration from another source
     */
    merge(otherConfig) {
        if (typeof otherConfig === 'string') {
            otherConfig = JSON.parse(otherConfig);
        }

        // Merge arrays (avoid duplicates)
        if (otherConfig.knownBlockingRules) {
            for (const rule of otherConfig.knownBlockingRules) {
                this.registerBlockingRule(rule.ruleName, rule.objectName, rule.reason);
            }
        }

        // Merge field mappings (only if not already set)
        if (otherConfig.fieldMappings) {
            const currentMappings = this.get('fieldMappings', {});
            for (const [key, value] of Object.entries(otherConfig.fieldMappings)) {
                if (value && !currentMappings[key]) {
                    this.setFieldMapping(key, value);
                }
            }
        }

        // Merge other arrays
        ['dataQualityIssues', 'quirks', 'notes'].forEach(arrayKey => {
            if (otherConfig[arrayKey] && Array.isArray(otherConfig[arrayKey])) {
                const current = this.get(arrayKey, []);
                this.set(arrayKey, [...current, ...otherConfig[arrayKey]]);
            }
        });

        if (this.options.autoSave) {
            this.saveConfig();
        }
    }
}

/**
 * Quick access functions
 */
async function getInstanceConfig(orgAlias, options = {}) {
    const config = new InstanceConfig(orgAlias, options);
    await config.init();
    return config;
}

module.exports = {
    InstanceConfig,
    getInstanceConfig
};

// CLI usage
if (require.main === module) {
    (async () => {
        const args = process.argv.slice(2);

        if (args.length < 2) {
            console.log('Usage: instance-config-registry.js <org-alias> <command> [args...]');
            console.log('');
            console.log('Commands:');
            console.log('  get <key-path>              Get configuration value');
            console.log('  set <key-path> <value>      Set configuration value');
            console.log('  add-alias <alias>           Add known alias for this instance');
            console.log('  remove-alias <alias>        Remove alias from this instance');
            console.log('  list-aliases                List all known aliases');
            console.log('  set-env-type <type>         Set environment type (production, sandbox, uat, dev, legacy)');
            console.log('  add-blocking-rule <name> <object> [reason]');
            console.log('  add-note <note> [category]');
            console.log('  summary                     Show configuration summary');
            console.log('  export                      Export configuration as JSON');
            console.log('');
            console.log('Examples:');
            console.log('  instance-config-registry.js beta-production get fieldMappings.funnelStage');
            console.log('  instance-config-registry.js beta-production set fieldMappings.funnelStage Demand_Funnel_Stage__c');
            console.log('  instance-config-registry.js acme-production add-alias "acme-corp production"');
            console.log('  instance-config-registry.js acme-production set-env-type production');
            console.log('  instance-config-registry.js beta-production add-blocking-rule Vet_License_Required Contact "Requires vet license state"');
            console.log('  instance-config-registry.js beta-production summary');
            process.exit(1);
        }

        const orgAlias = args[0];
        const command = args[1];

        const config = new InstanceConfig(orgAlias, { verbose: true });
        await config.init();

        switch (command) {
            case 'get':
                if (!args[2]) {
                    console.error('Error: Key path required');
                    process.exit(1);
                }
                const value = config.get(args[2]);
                console.log(JSON.stringify(value, null, 2));
                break;

            case 'set':
                if (!args[2] || !args[3]) {
                    console.error('Error: Key path and value required');
                    process.exit(1);
                }
                config.set(args[2], args[3]);
                console.log(`✓ Set ${args[2]} = ${args[3]}`);
                break;

            case 'add-alias':
                if (!args[2]) {
                    console.error('Error: Alias required');
                    process.exit(1);
                }
                config.addAlias(args[2]);
                console.log(`✓ Added alias "${args[2]}" to ${orgAlias}`);
                break;

            case 'remove-alias':
                if (!args[2]) {
                    console.error('Error: Alias required');
                    process.exit(1);
                }
                config.removeAlias(args[2]);
                console.log(`✓ Removed alias "${args[2]}" from ${orgAlias}`);
                break;

            case 'list-aliases':
                const aliases = config.getAliases();
                console.log(`\n🏷️  Known aliases for ${orgAlias}:`);
                if (aliases.length === 0) {
                    console.log('  (none configured)');
                } else {
                    aliases.forEach(alias => console.log(`  - ${alias}`));
                }
                console.log('');
                break;

            case 'set-env-type':
                if (!args[2]) {
                    console.error('Error: Environment type required (production, sandbox, uat, dev, legacy)');
                    process.exit(1);
                }
                try {
                    config.setEnvironmentType(args[2]);
                    console.log(`✓ Set environment type to "${args[2]}" for ${orgAlias}`);
                } catch (error) {
                    console.error(`Error: ${error.message}`);
                    process.exit(1);
                }
                break;

            case 'add-blocking-rule':
                if (!args[2] || !args[3]) {
                    console.error('Error: Rule name and object required');
                    process.exit(1);
                }
                config.registerBlockingRule(args[2], args[3], args[4] || '');
                console.log(`✓ Registered blocking rule: ${args[2]} on ${args[3]}`);
                break;

            case 'add-note':
                if (!args[2]) {
                    console.error('Error: Note required');
                    process.exit(1);
                }
                config.addNote(args[2], args[3] || 'general');
                console.log(`✓ Added note`);
                break;

            case 'summary':
                const summary = config.getSummary();
                console.log('\n📋 Configuration Summary:');
                console.log(JSON.stringify(summary, null, 2));
                break;

            case 'export':
                console.log(config.export());
                break;

            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }
    })();
}
