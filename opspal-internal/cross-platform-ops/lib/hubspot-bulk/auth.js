/**
 * HubSpot Authentication & Request Wrapper
 * Handles OAuth, scope validation, and request decoration
 */

const fetch = require('node-fetch');
const config = require('./config');

class HubSpotAuth {
    constructor(options = {}) {
        this.accessToken = options.accessToken || process.env.HUBSPOT_ACCESS_TOKEN;
        this.privateAppKey = options.privateAppKey || process.env.HUBSPOT_PRIVATE_APP_KEY;
        this.apiKey = options.apiKey || process.env.HUBSPOT_API_KEY; // Legacy

        if (!this.accessToken && !this.privateAppKey && !this.apiKey) {
            throw new Error('HubSpot authentication required: Set HUBSPOT_ACCESS_TOKEN or HUBSPOT_PRIVATE_APP_KEY');
        }

        this.baseUrl = config.api.baseUrl;
        this.userAgent = `HubSpot-Bulk-Toolkit/1.0.0 (Node.js/${process.version})`;
        this.requestIdPrefix = options.requestIdPrefix || 'bulk';
        this.requestCount = 0;
    }

    /**
     * Validate required scopes for bulk operations
     */
    async validateScopes(requiredScopes = []) {
        if (!requiredScopes.length) {
            requiredScopes = ['crm.objects.contacts.read', 'crm.objects.contacts.write'];
        }

        try {
            const response = await this.makeRequest('/oauth/v1/access-tokens/' + this.accessToken);
            const grantedScopes = response.scopes || [];

            const missingScopes = requiredScopes.filter(scope => !grantedScopes.includes(scope));

            if (missingScopes.length) {
                throw new Error(`Missing required scopes: ${missingScopes.join(', ')}`);
            }

            return { valid: true, scopes: grantedScopes };
        } catch (error) {
            // For private apps or API keys, assume scopes are granted
            if (this.privateAppKey || this.apiKey) {
                return { valid: true, scopes: requiredScopes, type: 'private_app' };
            }
            throw error;
        }
    }

    /**
     * Make authenticated request with standard headers
     */
    async makeRequest(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

        const headers = {
            'User-Agent': this.userAgent,
            'X-Request-Id': `${this.requestIdPrefix}-${Date.now()}-${++this.requestCount}`,
            'Accept': 'application/json',
            ...this.getAuthHeaders(),
            ...options.headers
        };

        if (options.body && typeof options.body === 'object' && !options.isFormData) {
            headers['Content-Type'] = 'application/json';
        }

        const requestOptions = {
            method: options.method || 'GET',
            headers,
            timeout: options.timeout || 30000
        };

        if (options.body) {
            requestOptions.body = options.isFormData ? options.body : JSON.stringify(options.body);
        }

        const response = await fetch(url, requestOptions);

        // Return raw response for multipart/download operations
        if (options.raw) {
            return response;
        }

        if (!response.ok) {
            const error = await this.parseError(response);
            error.statusCode = response.status;
            error.headers = response.headers;
            throw error;
        }

        // Handle empty responses
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            return response;
        }

        return await response.json();
    }

    /**
     * Get authentication headers based on auth type
     */
    getAuthHeaders() {
        if (this.accessToken) {
            return { 'Authorization': `Bearer ${this.accessToken}` };
        } else if (this.privateAppKey) {
            return { 'Authorization': `Bearer ${this.privateAppKey}` };
        } else if (this.apiKey) {
            return { 'hapikey': this.apiKey }; // Legacy
        }
        return {};
    }

    /**
     * Parse error response
     */
    async parseError(response) {
        try {
            const body = await response.json();
            const error = new Error(body.message || `HubSpot API error: ${response.status}`);
            error.category = body.category;
            error.correlationId = body.correlationId;
            error.details = body;
            return error;
        } catch {
            return new Error(`HubSpot API error: ${response.status} ${response.statusText}`);
        }
    }
}

module.exports = HubSpotAuth;