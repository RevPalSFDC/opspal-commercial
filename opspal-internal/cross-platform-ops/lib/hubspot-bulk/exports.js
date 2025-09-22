/**
 * HubSpot CRM Exports API
 * Handles bulk export operations with async task polling and streaming downloads
 */

const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);
const zlib = require('zlib');
const config = require('./config');
const RateLimiter = require('./rateLimit');

class HubSpotExports {
    constructor(auth, options = {}) {
        this.auth = auth;
        this.rateLimiter = new RateLimiter();
        this.config = { ...config.exports, ...options };
    }

    /**
     * Start a bulk export job
     * @param {Object} params Export parameters
     * @returns {Object} Export task details
     */
    async startExport({
        objectType = 'contacts',
        properties,
        exportType = 'VIEW',
        filters,
        associations,
        format = 'CSV',
        exportName
    }) {
        await this.rateLimiter.checkLimit();

        // Use default properties if none specified
        const objectProperties = properties || this.config.defaultProperties[objectType] || ['id'];

        const exportRequest = {
            exportType,
            format,
            exportName: exportName || `Export ${objectType} ${new Date().toISOString()}`,
            objectType: objectType.toUpperCase(),
            objectProperties: objectProperties.slice(0, this.config.maxPropertiesPerExport),
            associatedObjectType: associations ? associations.type : null,
            language: 'EN'
        };

        // Add filters if provided
        if (filters) {
            exportRequest.filters = this.buildFilters(filters);
        }

        // Add associations if requested
        if (associations) {
            exportRequest.associatedObjectType = associations.type.toUpperCase();
            exportRequest.associatedObjectProperties = associations.properties || ['id'];
        }

        const response = await this.auth.makeRequest('/crm/v3/exports/export/async', {
            method: 'POST',
            body: exportRequest
        });

        return {
            taskId: response.id || response.taskId,
            status: response.status || 'PROCESSING',
            createdAt: response.createdAt || new Date().toISOString(),
            exportName: exportRequest.exportName,
            properties: objectProperties
        };
    }

    /**
     * Poll export task status with async iterator
     * @param {string} taskId Export task ID
     * @yields {Object} Export status updates
     */
    async *pollExport(taskId) {
        const startTime = Date.now();
        let lastStatus = null;
        let consecutiveErrors = 0;

        while (true) {
            // Check timeout
            if (Date.now() - startTime > this.config.maxPollDurationMs) {
                throw new Error(`Export ${taskId} timed out after ${this.config.maxPollDurationMs}ms`);
            }

            try {
                await this.rateLimiter.checkLimit();
                const status = await this.auth.makeRequest(`/crm/v3/exports/export/async/tasks/${taskId}/status`);

                // Yield status if changed
                if (status.status !== lastStatus) {
                    lastStatus = status.status;
                    yield {
                        taskId,
                        status: status.status,
                        message: status.message,
                        createdAt: status.createdAt,
                        completedAt: status.completedAt
                    };
                }

                // Check if export is complete
                if (status.status === 'COMPLETE') {
                    // Get download URL
                    const downloadInfo = await this.getDownloadUrl(taskId);
                    return {
                        taskId,
                        status: 'COMPLETE',
                        downloadUrl: downloadInfo.url,
                        expiresAt: downloadInfo.expiresAt,
                        format: downloadInfo.format
                    };
                }

                // Check for terminal failure
                if (status.status === 'FAILED' || status.status === 'CANCELED') {
                    throw new Error(`Export ${taskId} failed: ${status.message || status.status}`);
                }

                consecutiveErrors = 0;
            } catch (error) {
                consecutiveErrors++;
                if (consecutiveErrors > 3) {
                    throw error;
                }
                yield { taskId, status: 'POLLING_ERROR', error: error.message };
            }

            // Wait with jitter
            const jitter = Math.random() * this.config.pollIntervalMs * 0.1;
            await this.wait(this.config.pollIntervalMs + jitter);
        }
    }

    /**
     * Get download URL for completed export
     */
    async getDownloadUrl(taskId) {
        await this.rateLimiter.checkLimit();

        const response = await this.auth.makeRequest(
            `/crm/v3/exports/export/async/tasks/${taskId}/download`
        );

        return {
            url: response.url || response.downloadUrl,
            expiresAt: response.expiresAt,
            format: response.format || 'CSV'
        };
    }

    /**
     * Download and save export file
     * @param {string} url Download URL
     * @param {string} destination Output path
     * @returns {Object} Download result
     */
    async downloadExport(url, destination) {
        const startTime = Date.now();

        // Ensure output directory exists
        await fs.promises.mkdir(path.dirname(destination), { recursive: true });

        // Download with streaming
        const response = await this.auth.makeRequest(url, { raw: true });

        if (!response.ok) {
            throw new Error(`Download failed: ${response.status} ${response.statusText}`);
        }

        // Check if response is compressed
        const contentEncoding = response.headers.get('content-encoding');
        const isGzipped = contentEncoding && contentEncoding.includes('gzip');

        // Setup streaming pipeline
        const outputStream = fs.createWriteStream(destination);
        const streams = [response.body];

        // Add decompression if needed
        if (isGzipped || destination.endsWith('.gz')) {
            streams.push(zlib.createGunzip());
        }

        streams.push(outputStream);

        // Stream download to file
        await pipelineAsync(...streams);

        const stats = await fs.promises.stat(destination);
        const duration = Date.now() - startTime;

        return {
            path: destination,
            size: stats.size,
            duration,
            bytesPerSecond: Math.round(stats.size / (duration / 1000))
        };
    }

    /**
     * Cancel an export task
     */
    async cancelExport(taskId) {
        await this.rateLimiter.checkLimit();

        return await this.auth.makeRequest(
            `/crm/v3/exports/export/async/tasks/${taskId}/cancel`,
            { method: 'POST' }
        );
    }

    /**
     * Build filter groups for export
     */
    buildFilters(filters) {
        if (Array.isArray(filters)) {
            return filters;
        }

        // Convert simple object filters to HubSpot format
        const filterGroups = [];
        const filterGroup = { filters: [] };

        Object.entries(filters).forEach(([property, value]) => {
            if (typeof value === 'object' && value.operator) {
                filterGroup.filters.push({
                    propertyName: property,
                    operator: value.operator,
                    value: value.value
                });
            } else {
                filterGroup.filters.push({
                    propertyName: property,
                    operator: 'EQ',
                    value: value
                });
            }
        });

        if (filterGroup.filters.length > 0) {
            filterGroups.push(filterGroup);
        }

        return filterGroups;
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = HubSpotExports;