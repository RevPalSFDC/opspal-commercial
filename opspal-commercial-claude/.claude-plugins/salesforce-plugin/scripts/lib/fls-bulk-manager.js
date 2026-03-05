#!/usr/bin/env node

const EnhancedMCPTool = require('../../mcp-extensions/tools/base/enhanced-mcp-tool');
const { ProfileManagerTools } = require('../../mcp-extensions/tools/profile-manager-tools');

class FLSBulkManager extends EnhancedMCPTool {
    constructor(options = {}) {
        super({
            name: 'FLSBulkManager',
            version: '1.0.0',
            stage: options.stage || 'production',
            description: 'Applies field-level security updates across multiple profiles',
            ...options
        });

        this.org = options.org || process.env.SF_TARGET_ORG;
        this.profileManager = new ProfileManagerTools({ ...options, org: this.org });
    }

    async applyFieldSecurity(params) {
        this.validateParams(params, ['profileNames', 'objectName', 'fieldPermissions']);

        const { profileNames, objectName, fieldPermissions } = params;
        const results = [];

        this.logOperation('fls_bulk_start', { profileCount: profileNames.length, objectName });

        for (const profileName of profileNames) {
            try {
                const result = await this.profileManager.updateFieldPermissions({
                    profileName,
                    objectName,
                    fieldPermissions
                });
                results.push({
                    profileName,
                    success: true,
                    output: result
                });
            } catch (error) {
                results.push({
                    profileName,
                    success: false,
                    error: error.message
                });
                this.logOperation('fls_bulk_profile_error', { profileName, error: error.message });
            }
        }

        const success = results.every(r => r.success);
        this.logOperation(success ? 'fls_bulk_success' : 'fls_bulk_partial', {
            objectName,
            successCount: results.filter(r => r.success).length,
            failureCount: results.filter(r => !r.success).length
        });

        return {
            success,
            results,
            auditTrail: this.getAuditTrail()
        };
    }
}

module.exports = FLSBulkManager;
