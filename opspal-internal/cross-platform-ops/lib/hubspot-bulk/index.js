/**
 * HubSpot Bulk Operations Toolkit
 * Main entry point and facade
 */

const HubSpotAuth = require('./auth');
const HubSpotImports = require('./imports');
const HubSpotExports = require('./exports');
const RateLimiter = require('./rateLimit');
const config = require('./config');

class HubSpotBulk {
    constructor(options = {}) {
        this.config = { ...config, ...options };
        this.auth = new HubSpotAuth(options);
        this.imports = new HubSpotImports(this.auth, this.config.imports);
        this.exports = new HubSpotExports(this.auth, this.config.exports);
        this.rateLimiter = new RateLimiter(this.config.rateLimit);
    }

    /**
     * Initialize and validate authentication
     */
    async initialize(requiredScopes = []) {
        return await this.auth.validateScopes(requiredScopes);
    }

    /**
     * Import contacts from CSV
     */
    async importContacts(filePath, options = {}) {
        const importJob = await this.imports.startImport({
            files: filePath,
            objectType: 'contacts',
            name: options.name || `Contact import ${new Date().toISOString()}`,
            mapping: options.mapping
        });

        if (options.wait === false) {
            return importJob;
        }

        // Poll for completion
        let finalStatus;
        for await (const status of this.imports.pollImport(importJob.importId)) {
            if (options.onProgress) {
                options.onProgress(status);
            }
            finalStatus = status;
        }

        // Get errors if any
        if (finalStatus.state === 'DONE') {
            const errors = await this.imports.getImportErrors(importJob.importId);
            finalStatus.errors = errors;
        }

        return finalStatus;
    }

    /**
     * Import companies from CSV
     */
    async importCompanies(filePath, options = {}) {
        return await this.importContacts(filePath, {
            ...options,
            objectType: 'companies'
        });
    }

    /**
     * Export contacts to CSV
     */
    async exportContacts(outputPath, options = {}) {
        const exportJob = await this.exports.startExport({
            objectType: 'contacts',
            properties: options.properties,
            filters: options.filters,
            associations: options.associations,
            exportName: options.name
        });

        if (options.wait === false) {
            return exportJob;
        }

        // Poll for completion
        let downloadInfo;
        for await (const status of this.exports.pollExport(exportJob.taskId)) {
            if (options.onProgress) {
                options.onProgress(status);
            }
            if (status.downloadUrl) {
                downloadInfo = status;
            }
        }

        // Download the file
        if (downloadInfo && downloadInfo.downloadUrl) {
            const downloadResult = await this.exports.downloadExport(
                downloadInfo.downloadUrl,
                outputPath
            );
            return { ...downloadInfo, ...downloadResult };
        }

        return downloadInfo;
    }

    /**
     * Export companies to CSV
     */
    async exportCompanies(outputPath, options = {}) {
        return await this.exportContacts(outputPath, {
            ...options,
            objectType: 'companies'
        });
    }

    /**
     * Get rate limit status
     */
    getRateLimitStatus() {
        return this.rateLimiter.getStatus();
    }
}

// Export all components
module.exports = HubSpotBulk;
module.exports.HubSpotAuth = HubSpotAuth;
module.exports.HubSpotImports = HubSpotImports;
module.exports.HubSpotExports = HubSpotExports;
module.exports.RateLimiter = RateLimiter;
module.exports.config = config;