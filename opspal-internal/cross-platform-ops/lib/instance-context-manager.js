/**
 * Instance Context Manager
 *
 * Manages customer context and instance pairings for cross-platform operations.
 * Handles automatic credential switching, instance validation, and context persistence.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

class InstanceContextManager {
    constructor() {
        this.pairingsPath = path.join(__dirname, '../../instance-pairings.json');
        this.currentContextPath = path.join(__dirname, '../.current-context.json');
        this.pairings = this.loadPairings();
        this.currentContext = this.loadCurrentContext();
    }

    /**
     * Load instance pairings registry
     */
    loadPairings() {
        try {
            const data = fs.readFileSync(this.pairingsPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Failed to load instance pairings:', error);
            return null;
        }
    }

    /**
     * Load current context from file
     */
    loadCurrentContext() {
        try {
            if (fs.existsSync(this.currentContextPath)) {
                const data = fs.readFileSync(this.currentContextPath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Failed to load current context:', error);
        }
        return null;
    }

    /**
     * Save current context to file
     */
    saveCurrentContext() {
        try {
            fs.writeFileSync(
                this.currentContextPath,
                JSON.stringify(this.currentContext, null, 2)
            );
            return true;
        } catch (error) {
            console.error('Failed to save current context:', error);
            return false;
        }
    }

    /**
     * Switch to a specific customer and environment
     */
    async switchContext(customerName, environment = 'production') {
        // Validate customer exists
        const customer = this.pairings.customers[customerName];
        if (!customer) {
            throw new Error(`Unknown customer: ${customerName}`);
        }

        // Validate environment exists for customer
        const pairing = customer.pairings[environment];
        if (!pairing) {
            throw new Error(`Environment '${environment}' not configured for customer '${customerName}'`);
        }

        // Load environment files
        const envFiles = await this.loadEnvironmentFiles(customerName, environment);

        // Update current context
        this.currentContext = {
            customer: customerName,
            customerDisplayName: customer.name,
            environment: environment,
            pairing: pairing,
            instances: {
                salesforce: pairing.sf || null,
                hubspot: pairing.hs || null
            },
            syncEnabled: pairing.sync_enabled || false,
            configurations: customer.configurations || {},
            envFiles: envFiles,
            activatedAt: new Date().toISOString()
        };

        // Apply environment variables
        this.applyEnvironment(envFiles);

        // Save context
        this.saveCurrentContext();

        return this.currentContext;
    }

    /**
     * Load environment files for a customer/environment
     */
    async loadEnvironmentFiles(customerName, environment) {
        const envFiles = {};

        // Try to load from cross-platform-ops
        const crossPlatformEnvPath = path.join(
            __dirname,
            `../.env.${customerName}-${environment}`
        );
        if (fs.existsSync(crossPlatformEnvPath)) {
            envFiles.crossPlatform = crossPlatformEnvPath;
        }

        // Try to load from customer workspace
        const customerEnvPath = path.join(
            __dirname,
            `../../customers/${customerName}/.env.${environment}`
        );
        if (fs.existsSync(customerEnvPath)) {
            envFiles.customer = customerEnvPath;
        }

        // Try to load from SFDC instance
        const sfdcInstance = this.pairings.customers[customerName].pairings[environment].sf;
        if (sfdcInstance) {
            const sfdcEnvPath = path.join(
                __dirname,
                `../../SFDC/instances/${sfdcInstance}/.env`
            );
            if (fs.existsSync(sfdcEnvPath)) {
                envFiles.salesforce = sfdcEnvPath;
            }
        }

        // Try to load from HubSpot instance
        const hsInstance = this.pairings.customers[customerName].pairings[environment].hs;
        if (hsInstance) {
            const hsEnvPath = path.join(
                __dirname,
                `../../HS/instances/${hsInstance}/.env`
            );
            if (fs.existsSync(hsEnvPath)) {
                envFiles.hubspot = hsEnvPath;
            }
        }

        return envFiles;
    }

    /**
     * Apply environment variables from loaded files
     */
    applyEnvironment(envFiles) {
        // Apply in order of precedence (least to most specific)
        const precedence = ['crossPlatform', 'salesforce', 'hubspot', 'customer'];

        for (const key of precedence) {
            if (envFiles[key]) {
                const result = dotenv.config({ path: envFiles[key] });
                if (result.error) {
                    console.warn(`Warning: Could not load ${key} environment from ${envFiles[key]}`);
                }
            }
        }

        // Set context-specific variables
        if (this.currentContext) {
            process.env.CURRENT_CUSTOMER = this.currentContext.customer;
            process.env.CURRENT_ENVIRONMENT = this.currentContext.environment;
            process.env.SALESFORCE_ORG_ALIAS = this.currentContext.instances.salesforce;
            process.env.HUBSPOT_PORTAL = this.currentContext.instances.hubspot;
            process.env.SYNC_ENABLED = String(this.currentContext.syncEnabled);
        }
    }

    /**
     * Get current active context
     */
    getCurrentContext() {
        return this.currentContext;
    }

    /**
     * Get list of all customers
     */
    getCustomers() {
        if (!this.pairings) return [];
        return Object.entries(this.pairings.customers).map(([key, value]) => ({
            id: key,
            name: value.name,
            status: value.status,
            hasSalesforce: !!value.salesforce,
            hasHubspot: !!value.hubspot,
            environments: Object.keys(value.pairings)
        }));
    }

    /**
     * Get customer details
     */
    getCustomer(customerName) {
        if (!this.pairings) return null;
        return this.pairings.customers[customerName];
    }

    /**
     * Validate instance pairing
     */
    async validatePairing(customerName, environment) {
        const customer = this.getCustomer(customerName);
        if (!customer) {
            return { valid: false, error: 'Customer not found' };
        }

        const pairing = customer.pairings[environment];
        if (!pairing) {
            return { valid: false, error: 'Environment not configured' };
        }

        const validations = {
            valid: true,
            customer: customerName,
            environment: environment,
            checks: {}
        };

        // Check Salesforce instance
        if (pairing.sf) {
            validations.checks.salesforce = await this.validateSalesforceInstance(pairing.sf);
        }

        // Check HubSpot instance
        if (pairing.hs) {
            validations.checks.hubspot = await this.validateHubSpotInstance(pairing.hs);
        }

        // Check sync configuration
        if (pairing.sync_enabled && (!pairing.sf || !pairing.hs)) {
            validations.checks.sync = {
                valid: false,
                error: 'Sync enabled but missing platform instance'
            };
            validations.valid = false;
        }

        // Overall validation
        validations.valid = Object.values(validations.checks)
            .every(check => check.valid !== false);

        return validations;
    }

    /**
     * Validate Salesforce instance
     */
    async validateSalesforceInstance(instanceAlias) {
        try {
            const { execSync } = require('child_process');
            const result = execSync(
                `sf org display --target-org ${instanceAlias} --json`,
                { encoding: 'utf8' }
            );
            const orgInfo = JSON.parse(result);
            return {
                valid: orgInfo.status === 0,
                orgId: orgInfo.result?.id,
                username: orgInfo.result?.username,
                instanceUrl: orgInfo.result?.instanceUrl
            };
        } catch (error) {
            return {
                valid: false,
                error: error.message
            };
        }
    }

    /**
     * Validate HubSpot instance
     */
    async validateHubSpotInstance(portalId) {
        // Check if API key exists for this portal
        const apiKey = process.env[`HUBSPOT_API_KEY_${portalId.toUpperCase()}`] ||
                      process.env.HUBSPOT_API_KEY;

        if (!apiKey) {
            return {
                valid: false,
                error: 'No API key configured for HubSpot instance'
            };
        }

        // Could add actual API validation here
        return {
            valid: true,
            portalId: portalId,
            hasApiKey: true
        };
    }

    /**
     * Get instance statistics
     */
    getStatistics() {
        if (!this.pairings) return null;

        const stats = {
            totalCustomers: 0,
            activeCustomers: 0,
            byPlatform: {
                salesforceOnly: 0,
                hubspotOnly: 0,
                both: 0
            },
            byEnvironment: {},
            syncEnabled: 0
        };

        for (const [key, customer] of Object.entries(this.pairings.customers)) {
            stats.totalCustomers++;

            if (customer.status === 'active') {
                stats.activeCustomers++;
            }

            // Platform usage
            const hasSF = !!customer.salesforce;
            const hasHS = !!customer.hubspot;
            if (hasSF && hasHS) {
                stats.byPlatform.both++;
            } else if (hasSF) {
                stats.byPlatform.salesforceOnly++;
            } else if (hasHS) {
                stats.byPlatform.hubspotOnly++;
            }

            // Environment usage
            for (const env of Object.keys(customer.pairings)) {
                stats.byEnvironment[env] = (stats.byEnvironment[env] || 0) + 1;
            }

            // Sync enabled
            for (const pairing of Object.values(customer.pairings)) {
                if (pairing.sync_enabled) {
                    stats.syncEnabled++;
                    break;
                }
            }
        }

        return stats;
    }

    /**
     * Find instances by criteria
     */
    findInstances(criteria = {}) {
        const results = [];

        for (const [customerId, customer] of Object.entries(this.pairings.customers)) {
            // Filter by status
            if (criteria.status && customer.status !== criteria.status) {
                continue;
            }

            // Filter by platform
            if (criteria.platform) {
                const hasPlatform =
                    (criteria.platform === 'salesforce' && customer.salesforce) ||
                    (criteria.platform === 'hubspot' && customer.hubspot);
                if (!hasPlatform) continue;
            }

            // Filter by sync enabled
            if (criteria.syncEnabled !== undefined) {
                const hasSync = Object.values(customer.pairings)
                    .some(p => p.sync_enabled === criteria.syncEnabled);
                if (!hasSync) continue;
            }

            // Add to results
            for (const [envName, pairing] of Object.entries(customer.pairings)) {
                if (criteria.environment && envName !== criteria.environment) {
                    continue;
                }

                results.push({
                    customer: customerId,
                    customerName: customer.name,
                    environment: envName,
                    salesforce: pairing.sf,
                    hubspot: pairing.hs,
                    syncEnabled: pairing.sync_enabled,
                    primary: pairing.primary
                });
            }
        }

        return results;
    }

    /**
     * Export configuration for a customer
     */
    exportConfiguration(customerName, environment) {
        const customer = this.getCustomer(customerName);
        if (!customer) return null;

        const pairing = customer.pairings[environment];
        if (!pairing) return null;

        return {
            customer: {
                id: customerName,
                name: customer.name,
                status: customer.status
            },
            environment: environment,
            instances: {
                salesforce: pairing.sf,
                hubspot: pairing.hs
            },
            sync: {
                enabled: pairing.sync_enabled,
                primary: pairing.primary
            },
            configurations: customer.configurations,
            environmentRestrictions: this.pairings.environments[environment] || {}
        };
    }
}

// Singleton instance
let instance = null;

/**
 * Get or create the singleton instance
 */
function getInstance() {
    if (!instance) {
        instance = new InstanceContextManager();
    }
    return instance;
}

module.exports = {
    InstanceContextManager,
    getInstance
};