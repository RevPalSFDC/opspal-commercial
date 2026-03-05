#!/usr/bin/env node

const EnhancedMCPTool = require('../../mcp-extensions/tools/base/enhanced-mcp-tool');
const { API_VERSION } = require('../../config/apiVersion');
const { firstLine } = require('./utils/mcp-helpers');

/**
 * GlobalValueSetManager
 * =====================
 * Manages Salesforce Global Value Sets (Global Picklists) via Tooling API.
 *
 * Global Value Sets are reusable picklist value collections that can be shared
 * across multiple objects and fields, providing centralized management of
 * standardized values.
 *
 * Key Operations:
 * - Create new Global Value Sets
 * - Add/update values in existing sets
 * - Delete values from sets (marks as inactive)
 * - Validate set existence before field creation
 * - Create fields that reference Global Value Sets
 *
 * API Methods:
 * - Uses Tooling API for Global Value Set operations (JSON-based)
 * - Uses Metadata API for field creation referencing global sets
 *
 * Based on Salesforce Picklist Field Dependencies Playbook
 * (Global Value Set section)
 *
 * @extends EnhancedMCPTool
 */
class GlobalValueSetManager extends EnhancedMCPTool {
    constructor(options = {}) {
        super({
            name: 'GlobalValueSetManager',
            version: '1.0.0',
            stage: options.stage || 'development',
            description: 'Manages Salesforce Global Value Sets via Tooling API',
            ...options
        });

        this.org = options.org || process.env.SF_TARGET_ORG;
        this.apiVersion = options.apiVersion || API_VERSION;
    }

    /**
     * Create a new Global Value Set.
     *
     * This implements Step 2 of the playbook:
     * "Prepare Global Value Sets (if needed)"
     *
     * @param {Object} params - Configuration object
     * @param {string} params.fullName - Global Value Set API name (e.g., 'AccountIndustries')
     * @param {string} params.masterLabel - Display label
     * @param {Array<Object>} params.values - Picklist values
     *   Format: [{ fullName: 'Value1', label: 'Value 1', isActive: true, default: false }, ...]
     * @param {string} [params.description] - Set description
     * @param {boolean} [params.sorted=false] - Whether values are sorted alphabetically
     * @param {string} [params.targetOrg] - Target Salesforce org alias
     *
     * @returns {Promise<Object>} Result with Global Value Set ID
     *
     * @example
     * const manager = new GlobalValueSetManager({ org: 'myorg' });
     *
     * await manager.createGlobalValueSet({
     *     fullName: 'AccountIndustries',
     *     masterLabel: 'Account Industries',
     *     description: 'Standardized industry values for accounts',
     *     values: [
     *         { fullName: 'Technology', label: 'Technology', isActive: true, default: false },
     *         { fullName: 'Finance', label: 'Finance', isActive: true, default: false },
     *         { fullName: 'Healthcare', label: 'Healthcare', isActive: true, default: false }
     *     ]
     * });
     */
    async createGlobalValueSet(params) {
        this.validateParams(params, ['fullName', 'masterLabel', 'values']);

        const {
            fullName,
            masterLabel,
            values,
            description = '',
            sorted = false,
            targetOrg
        } = params;

        const alias = targetOrg || this.org;

        this.logOperation('create_global_value_set_start', { fullName, masterLabel });

        try {
            // Check if Global Value Set already exists
            const exists = await this.globalValueSetExists(fullName, alias);
            if (exists) {
                throw this.enhanceError(
                    new Error(`Global Value Set '${fullName}' already exists`),
                    { operation: 'createGlobalValueSet', fullName }
                );
            }

            // Build Tooling API payload
            const payload = {
                FullName: fullName,
                Metadata: {
                    masterLabel: masterLabel,
                    description: description,
                    sorted: sorted,
                    customValue: values.map(v => ({
                        fullName: v.fullName,
                        label: v.label || v.fullName,
                        default: v.default || false,
                        isActive: v.isActive !== false, // Default to true
                        color: v.color || null
                    }))
                }
            };

            // Execute Tooling API POST
            const result = await this.toolingApiPost(
                `/services/data/v${this.apiVersion}/tooling/sobjects/GlobalValueSet`,
                payload,
                alias
            );

            if (!result.success) {
                throw this.enhanceError(
                    new Error(`Failed to create Global Value Set: ${JSON.stringify(result.errors)}`),
                    { operation: 'createGlobalValueSet', result }
                );
            }

            this.logOperation('create_global_value_set_success', {
                fullName,
                id: result.id,
                valuesCount: values.length
            });

            return {
                success: true,
                id: result.id,
                fullName,
                masterLabel,
                valuesCreated: values.length,
                auditTrail: this.getAuditTrail()
            };

        } catch (error) {
            this.logOperation('create_global_value_set_error', {
                fullName,
                error: error.message
            });
            throw this.enhanceError(error, {
                operation: 'createGlobalValueSet',
                fullName
            });
        }
    }

    /**
     * Add values to an existing Global Value Set.
     *
     * Note: Tooling API requires full metadata replacement - we must include
     * all existing values plus new values in the update.
     *
     * @param {Object} params - Configuration object
     * @param {string} params.fullName - Global Value Set API name
     * @param {Array<Object>} params.valuesToAdd - New values to add
     * @param {string} [params.targetOrg] - Target org alias
     *
     * @returns {Promise<Object>} Result with updated values
     */
    async addValuesToGlobalSet(params) {
        this.validateParams(params, ['fullName', 'valuesToAdd']);

        const { fullName, valuesToAdd, targetOrg } = params;
        const alias = targetOrg || this.org;

        this.logOperation('add_values_to_global_set_start', {
            fullName,
            valuesToAddCount: valuesToAdd.length
        });

        try {
            // Get existing Global Value Set
            const existing = await this.getGlobalValueSet(fullName, alias);
            if (!existing) {
                throw this.enhanceError(
                    new Error(`Global Value Set '${fullName}' not found`),
                    { operation: 'addValuesToGlobalSet', fullName }
                );
            }

            // Merge existing values with new values
            const existingValueNames = new Set(
                existing.Metadata.customValue.map(v => v.fullName)
            );

            const newValues = valuesToAdd.filter(v => !existingValueNames.has(v.fullName));

            if (newValues.length === 0) {
                return {
                    success: true,
                    message: 'All values already exist in Global Value Set',
                    fullName,
                    valuesAdded: 0
                };
            }

            // Build complete value list (existing + new)
            const allValues = [
                ...existing.Metadata.customValue,
                ...newValues.map(v => ({
                    fullName: v.fullName,
                    label: v.label || v.fullName,
                    default: v.default || false,
                    isActive: v.isActive !== false,
                    color: v.color || null
                }))
            ];

            // Update via Tooling API PATCH (full replacement)
            const result = await this.updateGlobalValueSet({
                fullName,
                values: allValues,
                masterLabel: existing.Metadata.masterLabel,
                description: existing.Metadata.description,
                sorted: existing.Metadata.sorted,
                targetOrg: alias
            });

            this.logOperation('add_values_to_global_set_success', {
                fullName,
                valuesAdded: newValues.length,
                totalValues: allValues.length
            });

            return {
                success: true,
                fullName,
                valuesAdded: newValues.length,
                totalValues: allValues.length,
                newValues: newValues.map(v => v.fullName),
                auditTrail: this.getAuditTrail()
            };

        } catch (error) {
            this.logOperation('add_values_to_global_set_error', {
                fullName,
                error: error.message
            });
            throw this.enhanceError(error, {
                operation: 'addValuesToGlobalSet',
                fullName
            });
        }
    }

    /**
     * Update a Global Value Set (full replacement).
     *
     * CRITICAL: Tooling API does not support partial updates. You must provide
     * the complete list of values including existing ones.
     *
     * @param {Object} params - Configuration object
     * @param {string} params.fullName - Global Value Set API name
     * @param {Array<Object>} params.values - Complete list of values
     * @param {string} params.masterLabel - Master label
     * @param {string} [params.description] - Description
     * @param {boolean} [params.sorted] - Sorted flag
     * @param {string} [params.targetOrg] - Target org alias
     *
     * @returns {Promise<Object>} Result
     */
    async updateGlobalValueSet(params) {
        this.validateParams(params, ['fullName', 'values', 'masterLabel']);

        const {
            fullName,
            values,
            masterLabel,
            description = '',
            sorted = false,
            targetOrg
        } = params;

        const alias = targetOrg || this.org;

        this.logOperation('update_global_value_set_start', { fullName });

        try {
            // Get Global Value Set ID
            const existing = await this.getGlobalValueSet(fullName, alias);
            if (!existing) {
                throw this.enhanceError(
                    new Error(`Global Value Set '${fullName}' not found`),
                    { operation: 'updateGlobalValueSet', fullName }
                );
            }

            // Build update payload
            const payload = {
                Metadata: {
                    masterLabel: masterLabel,
                    description: description,
                    sorted: sorted,
                    customValue: values.map(v => ({
                        fullName: v.fullName,
                        label: v.label || v.fullName,
                        default: v.default || false,
                        isActive: v.isActive !== false,
                        color: v.color || null
                    }))
                }
            };

            // Execute Tooling API PATCH
            const result = await this.toolingApiPatch(
                `/services/data/v${this.apiVersion}/tooling/sobjects/GlobalValueSet/${existing.Id}`,
                payload,
                alias
            );

            if (!result.success) {
                throw this.enhanceError(
                    new Error(`Failed to update Global Value Set: ${JSON.stringify(result.errors)}`),
                    { operation: 'updateGlobalValueSet', result }
                );
            }

            this.logOperation('update_global_value_set_success', {
                fullName,
                valuesCount: values.length
            });

            return {
                success: true,
                id: existing.Id,
                fullName,
                valuesUpdated: values.length,
                auditTrail: this.getAuditTrail()
            };

        } catch (error) {
            this.logOperation('update_global_value_set_error', {
                fullName,
                error: error.message
            });
            throw this.enhanceError(error, {
                operation: 'updateGlobalValueSet',
                fullName
            });
        }
    }

    /**
     * Deactivate values in a Global Value Set (mark as inactive).
     *
     * Does not delete values (to preserve historical data) but marks them inactive.
     *
     * @param {Object} params - Configuration object
     * @param {string} params.fullName - Global Value Set API name
     * @param {string[]} params.valuesToDeactivate - Values to deactivate
     * @param {string} [params.targetOrg] - Target org alias
     *
     * @returns {Promise<Object>} Result
     */
    async deactivateGlobalSetValues(params) {
        this.validateParams(params, ['fullName', 'valuesToDeactivate']);

        const { fullName, valuesToDeactivate, targetOrg } = params;
        const alias = targetOrg || this.org;

        this.logOperation('deactivate_global_set_values_start', {
            fullName,
            valuesToDeactivateCount: valuesToDeactivate.length
        });

        try {
            // Get existing Global Value Set
            const existing = await this.getGlobalValueSet(fullName, alias);
            if (!existing) {
                throw this.enhanceError(
                    new Error(`Global Value Set '${fullName}' not found`),
                    { operation: 'deactivateGlobalSetValues', fullName }
                );
            }

            // Update isActive flag for specified values
            const deactivateSet = new Set(valuesToDeactivate);
            const updatedValues = existing.Metadata.customValue.map(v => {
                if (deactivateSet.has(v.fullName)) {
                    return { ...v, isActive: false };
                }
                return v;
            });

            // Update the Global Value Set
            await this.updateGlobalValueSet({
                fullName,
                values: updatedValues,
                masterLabel: existing.Metadata.masterLabel,
                description: existing.Metadata.description,
                sorted: existing.Metadata.sorted,
                targetOrg: alias
            });

            this.logOperation('deactivate_global_set_values_success', {
                fullName,
                valuesDeactivated: valuesToDeactivate.length
            });

            return {
                success: true,
                fullName,
                valuesDeactivated: valuesToDeactivate.length,
                deactivatedValues: valuesToDeactivate,
                auditTrail: this.getAuditTrail()
            };

        } catch (error) {
            this.logOperation('deactivate_global_set_values_error', {
                fullName,
                error: error.message
            });
            throw this.enhanceError(error, {
                operation: 'deactivateGlobalSetValues',
                fullName
            });
        }
    }

    /**
     * Check if a Global Value Set exists.
     *
     * @param {string} fullName - Global Value Set API name
     * @param {string} alias - Org alias
     * @returns {Promise<boolean>} True if exists
     */
    async globalValueSetExists(fullName, alias) {
        try {
            const query = `SELECT Id FROM GlobalValueSet WHERE DeveloperName = '${fullName}' LIMIT 1`;
            const command = `sf data query --query "${query}" --target-org ${alias} --use-tooling-api --json`;

            const result = await this.executeCommand(command);
            const parsed = this.parseJSON(result.stdout, { operation: 'globalValueSetExists' });

            return parsed.result?.records?.length > 0;
        } catch (error) {
            // If query fails, assume doesn't exist
            return false;
        }
    }

    /**
     * Get Global Value Set metadata.
     *
     * @param {string} fullName - Global Value Set API name
     * @param {string} alias - Org alias
     * @returns {Promise<Object>} Global Value Set metadata
     */
    async getGlobalValueSet(fullName, alias) {
        try {
            const query = `SELECT Id, DeveloperName, MasterLabel, Metadata FROM GlobalValueSet WHERE DeveloperName = '${fullName}' LIMIT 1`;
            const command = `sf data query --query "${query}" --target-org ${alias} --use-tooling-api --json`;

            const result = await this.executeCommand(command);
            const parsed = this.parseJSON(result.stdout, { operation: 'getGlobalValueSet' });

            if (parsed.result?.records?.length > 0) {
                return parsed.result.records[0];
            }

            return null;
        } catch (error) {
            throw this.enhanceError(error, {
                operation: 'getGlobalValueSet',
                fullName
            });
        }
    }

    /**
     * Validate that a Global Value Set exists before creating a field that references it.
     *
     * This is Step 2 validation in the playbook:
     * "Ensure that value set exists or is created before creating fields that reference it"
     *
     * @param {string} fullName - Global Value Set API name
     * @param {string} [targetOrg] - Target org alias
     * @returns {Promise<Object>} Validation result
     */
    async validateGlobalSetExists(fullName, targetOrg) {
        const alias = targetOrg || this.org;

        const exists = await this.globalValueSetExists(fullName, alias);

        if (!exists) {
            return {
                valid: false,
                error: `Global Value Set '${fullName}' does not exist. Create it before creating fields that reference it.`,
                recommendation: `Use createGlobalValueSet() to create '${fullName}' first`
            };
        }

        return {
            valid: true,
            message: `Global Value Set '${fullName}' exists and can be referenced`
        };
    }

    /**
     * Execute Tooling API POST request.
     *
     * @private
     */
    async toolingApiPost(endpoint, payload, alias) {
        const command = `sf data create --sobject ${this.getToolingObjectName(endpoint)} --values '${JSON.stringify(payload)}' --target-org ${alias} --use-tooling-api --json`;

        try {
            const result = await this.executeCommand(command);
            return this.parseJSON(result.stdout, { operation: 'toolingApiPost' });
        } catch (error) {
            throw this.enhanceError(error, {
                operation: 'toolingApiPost',
                endpoint
            });
        }
    }

    /**
     * Execute Tooling API PATCH request.
     *
     * @private
     */
    async toolingApiPatch(endpoint, payload, alias) {
        const objectId = this.extractIdFromEndpoint(endpoint);
        const command = `sf data update --sobject GlobalValueSet --record-id ${objectId} --values '${JSON.stringify(payload)}' --target-org ${alias} --use-tooling-api --json`;

        try {
            const result = await this.executeCommand(command);
            return this.parseJSON(result.stdout, { operation: 'toolingApiPatch' });
        } catch (error) {
            throw this.enhanceError(error, {
                operation: 'toolingApiPatch',
                endpoint
            });
        }
    }

    /**
     * Extract object name from Tooling API endpoint.
     *
     * @private
     */
    getToolingObjectName(endpoint) {
        const match = endpoint.match(/\/sobjects\/(\w+)/);
        return match ? match[1] : 'GlobalValueSet';
    }

    /**
     * Extract ID from Tooling API endpoint.
     *
     * @private
     */
    extractIdFromEndpoint(endpoint) {
        const parts = endpoint.split('/');
        return parts[parts.length - 1];
    }
}

module.exports = GlobalValueSetManager;
