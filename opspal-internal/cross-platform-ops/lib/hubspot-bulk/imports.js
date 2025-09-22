/**
 * HubSpot CRM Imports API
 * Handles bulk import operations with async job polling
 */

const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);
const config = require('./config');
const RateLimiter = require('./rateLimit');

class HubSpotImports {
    constructor(auth, options = {}) {
        this.auth = auth;
        this.rateLimiter = new RateLimiter();
        this.config = { ...config.imports, ...options };
    }

    /**
     * Start a bulk import job
     * @param {Object} params Import parameters
     * @returns {Object} Import job details
     */
    async startImport({ files, mapping, name, objectType = 'contacts' }) {
        await this.rateLimiter.checkLimit();

        const form = new FormData();

        // Add files
        if (Array.isArray(files)) {
            files.forEach((file, index) => {
                form.append(`files`, fs.createReadStream(file), {
                    filename: path.basename(file),
                    contentType: 'text/csv'
                });
            });
        } else {
            form.append('files', fs.createReadStream(files), {
                filename: path.basename(files),
                contentType: 'text/csv'
            });
        }

        // Import configuration
        const importRequest = {
            name: name || `Bulk import ${new Date().toISOString()}`,
            dateFormat: this.config.defaultDateFormat,
            files: [{
                fileName: path.basename(Array.isArray(files) ? files[0] : files),
                fileFormat: 'CSV',
                fileImportConfig: {
                    objectTypeId: this.normalizeObjectType(objectType),
                    associationTypeId: null
                }
            }]
        };

        // Add column mappings if provided
        if (mapping) {
            importRequest.files[0].fileImportConfig.columnMappings = this.buildColumnMappings(mapping);
        }

        form.append('importRequest', JSON.stringify(importRequest));

        const response = await this.auth.makeRequest('/crm/v3/imports', {
            method: 'POST',
            headers: form.getHeaders(),
            body: form,
            isFormData: true
        });

        return {
            importId: response.id,
            state: response.state,
            createdAt: response.createdAt,
            metadata: response.metadata,
            importName: response.importName,
            optOutImport: response.optOutImport
        };
    }

    /**
     * Poll import job status with async iterator
     * @param {string} importId Import job ID
     * @yields {Object} Import status updates
     */
    async *pollImport(importId) {
        const startTime = Date.now();
        let lastState = null;
        let consecutiveErrors = 0;

        while (true) {
            // Check timeout
            if (Date.now() - startTime > this.config.maxPollDurationMs) {
                throw new Error(`Import ${importId} timed out after ${this.config.maxPollDurationMs}ms`);
            }

            try {
                await this.rateLimiter.checkLimit();
                const status = await this.auth.makeRequest(`/crm/v3/imports/${importId}`);

                // Yield status if state changed
                if (status.state !== lastState) {
                    lastState = status.state;
                    yield {
                        importId,
                        state: status.state,
                        metadata: status.metadata,
                        createdAt: status.createdAt,
                        updatedAt: status.updatedAt,
                        optOutImport: status.optOutImport
                    };
                }

                // Check terminal states
                if (['DONE', 'FAILED', 'CANCELED'].includes(status.state)) {
                    return status;
                }

                consecutiveErrors = 0;
            } catch (error) {
                consecutiveErrors++;
                if (consecutiveErrors > 3) {
                    throw error;
                }
                yield { importId, state: 'POLLING_ERROR', error: error.message };
            }

            // Wait with jitter
            const jitter = Math.random() * this.config.pollIntervalMs * 0.1;
            await this.wait(this.config.pollIntervalMs + jitter);
        }
    }

    /**
     * Get import errors
     * @param {string} importId Import job ID
     * @returns {Object} Structured error information
     */
    async getImportErrors(importId) {
        await this.rateLimiter.checkLimit();

        const response = await this.auth.makeRequest(`/crm/v3/imports/${importId}/errors`);

        const errors = {
            importId,
            totalErrors: response.numErrors || 0,
            errors: []
        };

        if (response.results) {
            // Page through all errors
            let after = null;
            do {
                const params = after ? `?after=${after}` : '';
                const page = await this.auth.makeRequest(
                    `/crm/v3/imports/${importId}/errors${params}`
                );

                errors.errors.push(...page.results.map(err => ({
                    rowNumber: err.rowNumber,
                    errorType: err.errorType,
                    message: err.message,
                    invalidValue: err.invalidValue,
                    knownColumnNumber: err.knownColumnNumber,
                    sourceData: err.sourceData
                })));

                after = page.paging?.next?.after;
            } while (after);
        }

        return errors;
    }

    /**
     * Cancel an import job
     */
    async cancelImport(importId) {
        await this.rateLimiter.checkLimit();

        return await this.auth.makeRequest(`/crm/v3/imports/${importId}/cancel`, {
            method: 'POST'
        });
    }

    /**
     * Build column mappings for import
     */
    buildColumnMappings(mapping) {
        if (Array.isArray(mapping)) {
            return mapping;
        }

        // Convert object mapping to array format
        return Object.entries(mapping).map(([columnName, propertyName]) => ({
            columnObjectTypeId: '0-1', // Default to primary object
            columnName,
            propertyName,
            columnType: this.inferColumnType(propertyName)
        }));
    }

    /**
     * Normalize object type identifier
     */
    normalizeObjectType(objectType) {
        const types = {
            'contacts': '0-1',
            'companies': '0-2',
            'deals': '0-3',
            'tickets': '0-5',
            'products': '0-7',
            'line_items': '0-8'
        };

        return types[objectType.toLowerCase()] || objectType;
    }

    /**
     * Infer column type from property name
     */
    inferColumnType(propertyName) {
        if (propertyName.includes('date') || propertyName.includes('time')) {
            return 'DATE';
        }
        if (propertyName === 'id' || propertyName.endsWith('_id')) {
            return 'HUBSPOT_OBJECT_ID';
        }
        if (propertyName === 'email') {
            return 'HUBSPOT_ALTERNATE_ID';
        }
        return 'STANDARD_PROPERTY';
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = HubSpotImports;