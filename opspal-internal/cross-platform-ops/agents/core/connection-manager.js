#!/usr/bin/env node

const BaseAgent = require('../BaseAgent');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * ConnectionManager - Unified authentication and connection management
 * Manages all platform connections (HubSpot, Salesforce, etc.) with pooling and caching
 */
class ConnectionManager extends BaseAgent {
    constructor(config = {}) {
        super({
            name: 'connection-manager',
            type: 'core-infrastructure',
            ...config
        });

        this.config = {
            ...this.config,
            credentialsPath: process.env.CREDENTIALS_PATH || './.credentials',
            maxPoolSize: 10,
            connectionTimeout: 30000,
            refreshInterval: 3600000, // 1 hour
            encryptionKey: process.env.ENCRYPTION_KEY || this.generateEncryptionKey()
        };

        // Connection pools by platform
        this.pools = new Map();

        // Active connections
        this.connections = new Map();

        // Credential cache
        this.credentials = new Map();

        // Connection statistics
        this.stats = {
            connectionsCreated: 0,
            connectionsReused: 0,
            authFailures: 0,
            tokenRefreshes: 0
        };
    }

    async initialize() {
        await super.initialize();

        // Ensure credentials directory exists
        await fs.mkdir(this.config.credentialsPath, { recursive: true });

        // Load saved credentials
        await this.loadCredentials();

        // Start refresh timer
        this.startRefreshTimer();

        // Register message handlers
        this.onMessage('connect', this.handleConnectRequest.bind(this));
        this.onMessage('disconnect', this.handleDisconnectRequest.bind(this));
        this.onMessage('refresh', this.handleRefreshRequest.bind(this));
    }

    /**
     * Get or create a connection
     */
    async execute(task) {
        const { platform, operation, credentials } = task;

        switch (operation) {
            case 'connect':
                return await this.connect(platform, credentials);
            case 'disconnect':
                return await this.disconnect(platform);
            case 'refresh':
                return await this.refreshConnection(platform);
            case 'validate':
                return await this.validateConnection(platform);
            default:
                throw new Error(`Unknown operation: ${operation}`);
        }
    }

    /**
     * Connect to a platform
     */
    async connect(platform, credentials = null) {
        this.log('info', `Connecting to ${platform}`);

        // Check if already connected
        if (this.connections.has(platform)) {
            const conn = this.connections.get(platform);
            if (await this.validateConnection(platform)) {
                this.stats.connectionsReused++;
                return conn;
            }
        }

        // Get credentials
        const creds = credentials || await this.getCredentials(platform);
        if (!creds) {
            throw new Error(`No credentials found for ${platform}`);
        }

        // Create connection based on platform
        let connection;
        switch (platform) {
            case 'hubspot':
                connection = await this.connectHubSpot(creds);
                break;
            case 'salesforce':
                connection = await this.connectSalesforce(creds);
                break;
            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }

        // Store connection
        this.connections.set(platform, connection);
        this.stats.connectionsCreated++;

        // Set up auto-refresh if needed
        if (connection.expiresAt) {
            this.scheduleRefresh(platform, connection.expiresAt);
        }

        this.emit('connection:established', { platform, connectionId: connection.id });

        return connection;
    }

    /**
     * Connect to HubSpot
     */
    async connectHubSpot(credentials) {
        const HubSpotAuth = require('../../lib/hubspot-bulk/auth');

        const auth = new HubSpotAuth({
            accessToken: credentials.accessToken || credentials.apiKey,
            clientId: credentials.clientId,
            clientSecret: credentials.clientSecret,
            refreshToken: credentials.refreshToken
        });

        // Validate connection
        const validation = await auth.validateScopes(['crm.objects.contacts.read']);
        if (!validation.valid) {
            throw new Error('Invalid HubSpot credentials');
        }

        return {
            id: crypto.randomUUID(),
            platform: 'hubspot',
            auth,
            client: auth,
            createdAt: Date.now(),
            expiresAt: credentials.expiresAt || null,
            metadata: {
                portalId: validation.portalId,
                scopes: validation.scopes
            }
        };
    }

    /**
     * Connect to Salesforce
     */
    async connectSalesforce(credentials) {
        const jsforce = require('jsforce');

        const conn = new jsforce.Connection({
            instanceUrl: credentials.instanceUrl,
            accessToken: credentials.accessToken,
            refreshToken: credentials.refreshToken,
            oauth2: credentials.clientId ? {
                clientId: credentials.clientId,
                clientSecret: credentials.clientSecret,
                redirectUri: credentials.redirectUri || 'http://localhost:3000/oauth/callback'
            } : undefined
        });

        // Set up refresh handler
        if (credentials.refreshToken) {
            conn.on('refresh', (accessToken, res) => {
                this.log('info', 'Salesforce token refreshed');
                this.stats.tokenRefreshes++;

                // Update stored credentials
                credentials.accessToken = accessToken;
                this.saveCredentials('salesforce', credentials);
            });
        }

        // Validate connection
        const identity = await conn.identity();

        return {
            id: crypto.randomUUID(),
            platform: 'salesforce',
            conn,
            client: conn,
            createdAt: Date.now(),
            expiresAt: null,
            metadata: {
                organizationId: identity.organization_id,
                userId: identity.user_id,
                username: identity.username
            }
        };
    }

    /**
     * Disconnect from a platform
     */
    async disconnect(platform) {
        if (!this.connections.has(platform)) {
            return { success: true, message: 'Not connected' };
        }

        const connection = this.connections.get(platform);

        // Platform-specific cleanup
        if (platform === 'salesforce' && connection.conn) {
            try {
                await connection.conn.logout();
            } catch (error) {
                this.log('warn', `Error during Salesforce logout: ${error.message}`);
            }
        }

        this.connections.delete(platform);
        this.emit('connection:closed', { platform, connectionId: connection.id });

        return { success: true, message: `Disconnected from ${platform}` };
    }

    /**
     * Validate an existing connection
     */
    async validateConnection(platform) {
        if (!this.connections.has(platform)) {
            return false;
        }

        const connection = this.connections.get(platform);

        try {
            switch (platform) {
                case 'hubspot':
                    const validation = await connection.auth.validateScopes([]);
                    return validation.valid;

                case 'salesforce':
                    await connection.conn.identity();
                    return true;

                default:
                    return false;
            }
        } catch (error) {
            this.log('warn', `Connection validation failed for ${platform}: ${error.message}`);
            return false;
        }
    }

    /**
     * Refresh a connection
     */
    async refreshConnection(platform) {
        const connection = this.connections.get(platform);
        if (!connection) {
            throw new Error(`No connection found for ${platform}`);
        }

        this.log('info', `Refreshing connection for ${platform}`);

        switch (platform) {
            case 'hubspot':
                if (connection.auth.refreshToken) {
                    // Implement OAuth refresh
                    const newToken = await this.refreshHubSpotToken(connection.auth);
                    connection.auth.accessToken = newToken.accessToken;
                    connection.expiresAt = Date.now() + (newToken.expiresIn * 1000);
                    this.stats.tokenRefreshes++;
                }
                break;

            case 'salesforce':
                if (connection.conn.refreshToken) {
                    await connection.conn.refreshAccessToken();
                    this.stats.tokenRefreshes++;
                }
                break;
        }

        this.emit('connection:refreshed', { platform, connectionId: connection.id });

        return connection;
    }

    /**
     * Refresh HubSpot OAuth token
     */
    async refreshHubSpotToken(auth) {
        const fetch = require('node-fetch');

        const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: auth.clientId,
                client_secret: auth.clientSecret,
                refresh_token: auth.refreshToken
            })
        });

        if (!response.ok) {
            throw new Error(`Token refresh failed: ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Get connection from pool
     */
    async getConnection(platform, options = {}) {
        // Try to get existing connection
        if (this.connections.has(platform)) {
            const conn = this.connections.get(platform);
            if (await this.validateConnection(platform)) {
                return conn.client;
            }
        }

        // Create new connection
        const connection = await this.connect(platform, options.credentials);
        return connection.client;
    }

    /**
     * Load saved credentials
     */
    async loadCredentials() {
        try {
            const files = await fs.readdir(this.config.credentialsPath);

            for (const file of files) {
                if (file.endsWith('.json')) {
                    const platform = path.basename(file, '.json');
                    const filePath = path.join(this.config.credentialsPath, file);
                    const encrypted = await fs.readFile(filePath, 'utf8');
                    const decrypted = this.decrypt(encrypted);
                    const credentials = JSON.parse(decrypted);

                    this.credentials.set(platform, credentials);
                    this.log('debug', `Loaded credentials for ${platform}`);
                }
            }
        } catch (error) {
            this.log('warn', `Error loading credentials: ${error.message}`);
        }
    }

    /**
     * Save credentials
     */
    async saveCredentials(platform, credentials) {
        const filePath = path.join(this.config.credentialsPath, `${platform}.json`);
        const encrypted = this.encrypt(JSON.stringify(credentials));

        await fs.writeFile(filePath, encrypted);
        this.credentials.set(platform, credentials);

        this.log('debug', `Saved credentials for ${platform}`);
    }

    /**
     * Get credentials for a platform
     */
    async getCredentials(platform) {
        // Check cache
        if (this.credentials.has(platform)) {
            return this.credentials.get(platform);
        }

        // Check environment variables
        const envCreds = this.getCredentialsFromEnv(platform);
        if (envCreds) {
            await this.saveCredentials(platform, envCreds);
            return envCreds;
        }

        return null;
    }

    /**
     * Get credentials from environment variables
     */
    getCredentialsFromEnv(platform) {
        switch (platform) {
            case 'hubspot':
                if (process.env.HUBSPOT_ACCESS_TOKEN || process.env.HUBSPOT_API_KEY) {
                    return {
                        accessToken: process.env.HUBSPOT_ACCESS_TOKEN || process.env.HUBSPOT_API_KEY,
                        clientId: process.env.HUBSPOT_CLIENT_ID,
                        clientSecret: process.env.HUBSPOT_CLIENT_SECRET,
                        refreshToken: process.env.HUBSPOT_REFRESH_TOKEN
                    };
                }
                break;

            case 'salesforce':
                if (process.env.SALESFORCE_ACCESS_TOKEN || process.env.SALESFORCE_USERNAME) {
                    return {
                        instanceUrl: process.env.SALESFORCE_INSTANCE_URL,
                        accessToken: process.env.SALESFORCE_ACCESS_TOKEN,
                        refreshToken: process.env.SALESFORCE_REFRESH_TOKEN,
                        username: process.env.SALESFORCE_USERNAME,
                        password: process.env.SALESFORCE_PASSWORD,
                        securityToken: process.env.SALESFORCE_SECURITY_TOKEN,
                        clientId: process.env.SALESFORCE_CLIENT_ID,
                        clientSecret: process.env.SALESFORCE_CLIENT_SECRET
                    };
                }
                break;
        }

        return null;
    }

    /**
     * Encryption utilities
     */
    encrypt(text) {
        const algorithm = 'aes-256-ctr';
        const cipher = crypto.createCipher(algorithm, this.config.encryptionKey);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }

    decrypt(text) {
        const algorithm = 'aes-256-ctr';
        const decipher = crypto.createDecipher(algorithm, this.config.encryptionKey);
        let decrypted = decipher.update(text, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    generateEncryptionKey() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Schedule connection refresh
     */
    scheduleRefresh(platform, expiresAt) {
        const timeUntilExpiry = expiresAt - Date.now();
        const refreshTime = timeUntilExpiry * 0.9; // Refresh at 90% of expiry

        setTimeout(() => {
            this.refreshConnection(platform).catch(error => {
                this.log('error', `Failed to refresh ${platform} connection: ${error.message}`);
                this.stats.authFailures++;
            });
        }, refreshTime);
    }

    /**
     * Start periodic refresh timer
     */
    startRefreshTimer() {
        setInterval(() => {
            for (const [platform, connection] of this.connections) {
                this.validateConnection(platform).catch(() => {
                    this.log('warn', `Connection validation failed for ${platform}, attempting refresh`);
                    this.refreshConnection(platform).catch(error => {
                        this.log('error', `Refresh failed for ${platform}: ${error.message}`);
                    });
                });
            }
        }, this.config.refreshInterval);
    }

    /**
     * Message handlers
     */
    async handleConnectRequest(message) {
        const { platform, credentials } = message.payload;
        const result = await this.connect(platform, credentials);

        await this.sendMessage(message.from, 'connect:response', {
            success: true,
            connectionId: result.id,
            platform
        });
    }

    async handleDisconnectRequest(message) {
        const { platform } = message.payload;
        const result = await this.disconnect(platform);

        await this.sendMessage(message.from, 'disconnect:response', result);
    }

    async handleRefreshRequest(message) {
        const { platform } = message.payload;
        const result = await this.refreshConnection(platform);

        await this.sendMessage(message.from, 'refresh:response', {
            success: true,
            connectionId: result.id,
            platform
        });
    }

    /**
     * Get connection statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeConnections: this.connections.size,
            cachedCredentials: this.credentials.size
        };
    }

    /**
     * Cleanup on shutdown
     */
    async shutdown() {
        // Disconnect all platforms
        for (const platform of this.connections.keys()) {
            await this.disconnect(platform);
        }

        await super.shutdown();
    }
}

// Export for use as library
module.exports = ConnectionManager;

// CLI interface
if (require.main === module) {
    const { program } = require('commander');

    program
        .name('connection-manager')
        .description('Unified connection management for all platforms')
        .command('connect <platform>')
        .description('Connect to a platform')
        .action(async (platform) => {
            const manager = new ConnectionManager();
            await manager.initialize();

            try {
                const connection = await manager.connect(platform);
                console.log(`✅ Connected to ${platform}`);
                console.log(`Connection ID: ${connection.id}`);
                console.log(`Metadata:`, connection.metadata);
            } catch (error) {
                console.error(`❌ Failed to connect: ${error.message}`);
            } finally {
                await manager.shutdown();
            }
        });

    program
        .command('validate <platform>')
        .description('Validate a platform connection')
        .action(async (platform) => {
            const manager = new ConnectionManager();
            await manager.initialize();

            try {
                const valid = await manager.validateConnection(platform);
                console.log(`${platform} connection: ${valid ? '✅ Valid' : '❌ Invalid'}`);
            } catch (error) {
                console.error(`❌ Error: ${error.message}`);
            } finally {
                await manager.shutdown();
            }
        });

    program
        .command('list')
        .description('List all active connections')
        .action(async () => {
            const manager = new ConnectionManager();
            await manager.initialize();

            console.log('Active Connections:');
            for (const [platform, conn] of manager.connections) {
                console.log(`  - ${platform}: ${conn.id}`);
            }

            const stats = manager.getStats();
            console.log('\nStatistics:');
            console.log(`  Created: ${stats.connectionsCreated}`);
            console.log(`  Reused: ${stats.connectionsReused}`);
            console.log(`  Auth Failures: ${stats.authFailures}`);
            console.log(`  Token Refreshes: ${stats.tokenRefreshes}`);

            await manager.shutdown();
        });

    program.parse(process.argv);
}