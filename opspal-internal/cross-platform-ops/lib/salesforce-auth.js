/**
 * Salesforce Authentication Helper
 * Handles OAuth and session management for Bulk API 2.0
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const fs = require('fs').promises;
const path = require('path');

class SalesforceAuth {
    constructor(options = {}) {
        this.orgAlias = options.orgAlias || process.env.SALESFORCE_ORG_ALIAS || 'rentable-production';
        this.cacheDir = options.cacheDir || path.join(process.cwd(), '.sf-auth-cache');
        this.cacheTTL = options.cacheTTL || 3600000; // 1 hour default
    }

    /**
     * Get Salesforce authentication details
     * Uses sf CLI to get current org details
     */
    async getAuthDetails() {
        try {
            // Try to get from cache first
            const cached = await this.getCachedAuth();
            if (cached) {
                return cached;
            }

            // Get from sf CLI
            const command = `sf org display --json --target-org ${this.orgAlias}`;
            const { stdout } = await execPromise(command);
            const result = JSON.parse(stdout);

            if (!result.result) {
                throw new Error('Failed to get org details');
            }

            const authDetails = {
                instanceUrl: result.result.instanceUrl,
                accessToken: result.result.accessToken,
                username: result.result.username,
                orgId: result.result.id,
                apiVersion: result.result.apiVersion || 'v64.0',
                timestamp: Date.now()
            };

            // Cache the auth details
            await this.cacheAuth(authDetails);

            return authDetails;

        } catch (error) {
            // Fallback to environment variables
            if (process.env.SALESFORCE_INSTANCE_URL && process.env.SALESFORCE_ACCESS_TOKEN) {
                return {
                    instanceUrl: process.env.SALESFORCE_INSTANCE_URL,
                    accessToken: process.env.SALESFORCE_ACCESS_TOKEN,
                    apiVersion: process.env.SALESFORCE_API_VERSION || 'v64.0'
                };
            }

            throw new Error(`Failed to get Salesforce auth: ${error.message}`);
        }
    }

    /**
     * Refresh access token if needed
     */
    async refreshToken() {
        try {
            // Force refresh by logging in again
            const command = `sf org login refresh --target-org ${this.orgAlias} --json`;
            const { stdout } = await execPromise(command);
            const result = JSON.parse(stdout);

            if (result.status === 0) {
                // Clear cache to force re-fetch
                await this.clearCache();
                return await this.getAuthDetails();
            }

            throw new Error('Token refresh failed');
        } catch (error) {
            console.error('Failed to refresh token:', error.message);
            // Try to get new auth details anyway
            return await this.getAuthDetails();
        }
    }

    /**
     * Get org limits
     */
    async getOrgLimits() {
        try {
            const command = `sf limits api display --target-org ${this.orgAlias} --json`;
            const { stdout } = await execPromise(command);
            const result = JSON.parse(stdout);

            if (!result.result) {
                return null;
            }

            const limits = {};
            result.result.forEach(limit => {
                limits[limit.name] = {
                    max: limit.max,
                    remaining: limit.remaining,
                    percentUsed: ((limit.max - limit.remaining) / limit.max * 100).toFixed(2)
                };
            });

            return limits;

        } catch (error) {
            console.error('Failed to get org limits:', error.message);
            return null;
        }
    }

    /**
     * Check if we can make Bulk API calls
     */
    async checkBulkApiLimit() {
        const limits = await this.getOrgLimits();

        if (!limits) {
            // Can't get limits, assume we're good
            return { canProceed: true, warning: 'Unable to check API limits' };
        }

        const bulkLimit = limits['DailyBulkV2QueryJobs'] || limits['DailyBulkApiRequests'];

        if (!bulkLimit) {
            return { canProceed: true };
        }

        const percentUsed = parseFloat(bulkLimit.percentUsed);

        if (percentUsed >= 90) {
            return {
                canProceed: false,
                error: `Bulk API limit at ${percentUsed}% (${bulkLimit.remaining}/${bulkLimit.max} remaining)`
            };
        }

        if (percentUsed >= 75) {
            return {
                canProceed: true,
                warning: `Bulk API limit at ${percentUsed}% (${bulkLimit.remaining}/${bulkLimit.max} remaining)`
            };
        }

        return {
            canProceed: true,
            remaining: bulkLimit.remaining,
            max: bulkLimit.max
        };
    }

    /**
     * Get cached auth details
     */
    async getCachedAuth() {
        try {
            const cachePath = path.join(this.cacheDir, `${this.orgAlias}.json`);
            const exists = await fs.access(cachePath).then(() => true).catch(() => false);

            if (!exists) {
                return null;
            }

            const cached = JSON.parse(await fs.readFile(cachePath, 'utf8'));

            // Check if cache is still valid
            if (Date.now() - cached.timestamp > this.cacheTTL) {
                return null;
            }

            return cached;

        } catch (error) {
            return null;
        }
    }

    /**
     * Cache auth details
     */
    async cacheAuth(authDetails) {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
            const cachePath = path.join(this.cacheDir, `${this.orgAlias}.json`);
            await fs.writeFile(cachePath, JSON.stringify(authDetails, null, 2));
        } catch (error) {
            // Caching failed, but not critical
            console.warn('Failed to cache auth:', error.message);
        }
    }

    /**
     * Clear auth cache
     */
    async clearCache() {
        try {
            const cachePath = path.join(this.cacheDir, `${this.orgAlias}.json`);
            await fs.unlink(cachePath);
        } catch (error) {
            // File might not exist
        }
    }

    /**
     * Validate org connection
     */
    async validateConnection() {
        try {
            const auth = await this.getAuthDetails();

            if (!auth.instanceUrl || !auth.accessToken) {
                return { valid: false, error: 'Missing auth details' };
            }

            // Make a simple API call to validate
            const https = require('https');
            const url = new URL(`${auth.instanceUrl}/services/data/${auth.apiVersion}`);

            return new Promise((resolve) => {
                const req = https.get({
                    hostname: url.hostname,
                    path: url.pathname,
                    headers: {
                        'Authorization': `Bearer ${auth.accessToken}`,
                        'Accept': 'application/json'
                    }
                }, (res) => {
                    if (res.statusCode === 200) {
                        resolve({ valid: true, auth });
                    } else if (res.statusCode === 401) {
                        resolve({ valid: false, error: 'Invalid or expired token', needsRefresh: true });
                    } else {
                        resolve({ valid: false, error: `API returned ${res.statusCode}` });
                    }
                });

                req.on('error', (error) => {
                    resolve({ valid: false, error: error.message });
                });

                req.end();
            });

        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    /**
     * Get authenticated Bulk API client
     */
    async getBulkClient() {
        // Validate connection
        const validation = await this.validateConnection();

        let auth;
        if (!validation.valid) {
            if (validation.needsRefresh) {
                auth = await this.refreshToken();
            } else {
                throw new Error(`Connection validation failed: ${validation.error}`);
            }
        } else {
            auth = validation.auth;
        }

        // Check API limits
        const limitCheck = await this.checkBulkApiLimit();
        if (!limitCheck.canProceed) {
            throw new Error(limitCheck.error);
        }
        if (limitCheck.warning) {
            console.warn(`⚠️  ${limitCheck.warning}`);
        }

        // Create and return configured client
        const SalesforceBulkClient = require('./salesforce-bulk-client');
        return new SalesforceBulkClient({
            instanceUrl: auth.instanceUrl,
            accessToken: auth.accessToken,
            apiVersion: auth.apiVersion
        });
    }
}

module.exports = SalesforceAuth;