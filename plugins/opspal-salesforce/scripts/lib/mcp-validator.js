#!/usr/bin/env node

/**
 * MCP Validator Module
 * ====================
 * Validates MCP availability and enforces MCP-first policy
 */

const { exec, execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

class McpValidator {
    constructor(config = {}) {
        this.config = {
            mcpServers: config.mcpServers || ['salesforce-dx'],
            healthCheckInterval: config.healthCheckInterval || 60000, // 1 minute
            timeout: config.timeout || 30000, // 30 seconds
            logFile: config.logFile || '.mcp-health.log',
            mcpListCacheTtl: config.mcpListCacheTtl || 15000
        };
        
        this.healthStatus = {};
        this.lastCheck = {};
        this.fallbackLog = [];
        this.mcpConfigPath = null;
        this.mcpListCache = { timestamp: 0, data: null };
    }
    
    /**
     * Initialize MCP validator
     */
    async initialize() {
        console.log('🔌 Initializing MCP validator...');
        
        // Check MCP configuration
        await this.checkMcpConfiguration();
        
        // Run initial health check
        await this.checkAllServers();
        
        // Start health monitoring
        this.startHealthMonitoring();
        
        console.log('✅ MCP validator initialized');
    }
    
    /**
     * Check MCP configuration file
     */
    async checkMcpConfiguration() {
        try {
            const mcpConfigPath = this.resolveMcpConfigPath();
            if (!mcpConfigPath) {
                console.warn('⚠️ MCP configuration file not found (.mcp.json)');
                return false;
            }

            const content = await fs.readFile(mcpConfigPath, 'utf8');
            const config = JSON.parse(content);
            
            this.mcpConfig = config.mcpServers || {};
            this.mcpConfigPath = mcpConfigPath;
            
            // Verify required servers are configured
            for (const server of this.config.mcpServers) {
                if (!this.mcpConfig[server]) {
                    console.warn(`⚠️ MCP server '${server}' not configured in .mcp.json`);
                } else if (this.mcpConfig[server].disabled) {
                    console.warn(`⚠️ MCP server '${server}' is disabled`);
                }
            }
            
            return true;
        } catch (error) {
            console.error('❌ Failed to read MCP configuration:', error.message);
            return false;
        }
    }

    /**
     * Resolve MCP configuration path from repo or home directory
     */
    resolveMcpConfigPath() {
        const candidates = [
            path.join(process.cwd(), '.mcp.json'),
            path.join(os.homedir(), '.mcp.json')
        ];

        for (const candidate of candidates) {
            if (fsSync.existsSync(candidate)) {
                return candidate;
            }
        }

        return null;
    }

    /**
     * Run a Claude MCP command
     */
    async runClaudeMcpCommand(args) {
        try {
            const timeout = Math.min(this.config.timeout, 5000);
            const { stdout, stderr } = await execFileAsync('claude', ['mcp', ...args], {
                timeout
            });
            return { ok: true, stdout, stderr };
        } catch (error) {
            return { ok: false, error };
        }
    }

    /**
     * Fetch and cache Claude MCP list output
     */
    async getClaudeMcpList() {
        const now = Date.now();
        if (this.mcpListCache.timestamp && (now - this.mcpListCache.timestamp) < this.config.mcpListCacheTtl) {
            return this.mcpListCache.data;
        }

        const textResult = await this.runClaudeMcpCommand(['list']);
        if (textResult.ok) {
            const data = { parsed: null, raw: textResult.stdout };
            this.mcpListCache = { timestamp: now, data };
            return data;
        }

        this.mcpListCache = { timestamp: now, data: null };
        return null;
    }

    /**
     * Find server status in MCP list output
     */
    findServerInMcpList(listData, serverName) {
        if (!listData) {
            return { found: false };
        }

        const target = serverName.toLowerCase();
        const found = (name, status) => {
            const normalizedStatus = status || 'running';
            const lowerStatus = normalizedStatus.toLowerCase();
            return {
                found: true,
                status: normalizedStatus,
                running: !['disabled', 'stopped', 'inactive'].some(token => lowerStatus.includes(token))
            };
        };

        if (listData.parsed) {
            const parsed = listData.parsed;
            if (Array.isArray(parsed)) {
                for (const entry of parsed) {
                    if (typeof entry === 'string') {
                        if (entry.toLowerCase() === target) {
                            return found(entry, 'running');
                        }
                    } else if (entry && typeof entry === 'object') {
                        const name = (entry.name || entry.server || entry.id || '').toString();
                        if (name.toLowerCase() === target) {
                            const status = entry.status || entry.state || (entry.disabled ? 'disabled' : 'running');
                            return found(name, status);
                        }
                    }
                }
            } else if (parsed && typeof parsed === 'object') {
                const servers = parsed.mcpServers || parsed.servers || parsed.data;
                if (servers && typeof servers === 'object') {
                    if (Array.isArray(servers)) {
                        for (const entry of servers) {
                            const name = (entry?.name || entry?.server || entry?.id || '').toString();
                            if (name.toLowerCase() === target) {
                                const status = entry.status || entry.state || (entry.disabled ? 'disabled' : 'running');
                                return found(name, status);
                            }
                        }
                    } else {
                        for (const [name, config] of Object.entries(servers)) {
                            if (name.toLowerCase() === target) {
                                const disabled = config && typeof config === 'object' && config.disabled;
                                return found(name, disabled ? 'disabled' : 'running');
                            }
                        }
                    }
                }
            }
        }

        if (listData.raw) {
            const lines = listData.raw.split('\n');
            for (const line of lines) {
                const lower = line.toLowerCase();
                if (lower.includes(target)) {
                    const status = lower.includes('disabled') ? 'disabled'
                        : lower.includes('stopped') ? 'stopped'
                        : lower.includes('inactive') ? 'inactive'
                        : 'running';
                    return found(serverName, status);
                }
            }
        }

        return { found: false };
    }
    
    /**
     * Check health of all MCP servers
     */
    async checkAllServers() {
        const results = {};
        
        for (const server of this.config.mcpServers) {
            results[server] = await this.checkServerHealth(server);
        }
        
        return results;
    }
    
    /**
     * Check health of a specific MCP server
     */
    async checkServerHealth(serverName) {
        try {
            // Check if process is running
            const processCheck = await this.checkMcpProcess(serverName);
            
            // Try to get server status (would use actual MCP API in production)
            const apiCheck = await this.checkMcpApi(serverName);
            
            const isHealthy = processCheck.running && apiCheck.responsive;
            
            this.healthStatus[serverName] = {
                healthy: isHealthy,
                process: processCheck,
                api: apiCheck,
                lastCheck: new Date().toISOString()
            };
            
            this.lastCheck[serverName] = Date.now();
            
            return this.healthStatus[serverName];
            
        } catch (error) {
            this.healthStatus[serverName] = {
                healthy: false,
                error: error.message,
                lastCheck: new Date().toISOString()
            };
            
            return this.healthStatus[serverName];
        }
    }
    
    /**
     * Check if MCP process is running
     */
    async checkMcpProcess(serverName) {
        try {
            const listData = await this.getClaudeMcpList();
            const status = this.findServerInMcpList(listData, serverName);
            if (status.found) {
                return {
                    running: status.running,
                    status: status.status,
                    source: 'claude mcp list'
                };
            }
        } catch (error) {
            // Fall through to process scan
        }

        try {
            // Fallback: Check for running MCP processes
            const { stdout } = await execAsync(`ps aux | grep -E "mcp.*${serverName}|${serverName}.*mcp" | grep -v grep || true`);
            const processes = stdout.trim().split('\n').filter(line => line.length > 0);

            return {
                running: processes.length > 0,
                count: processes.length,
                pids: processes.map(line => {
                    const parts = line.split(/\s+/);
                    return parts[1]; // PID is usually the second column
                }),
                source: 'ps'
            };
        } catch (error) {
            return {
                running: false,
                error: error.message,
                source: 'ps'
            };
        }
    }
    
    /**
     * Check MCP API responsiveness
     */
    async checkMcpApi(serverName) {
        try {
            const start = Date.now();
            const listData = await this.getClaudeMcpList();
            const elapsed = Date.now() - start;

            const status = this.findServerInMcpList(listData, serverName);
            if (status.found) {
                return {
                    responsive: status.running,
                    responseTime: elapsed,
                    reason: status.running ? null : `Server ${status.status}`,
                    source: 'claude mcp list'
                };
            }

            if (!this.mcpConfig || !this.mcpConfig[serverName]) {
                return {
                    responsive: false,
                    reason: 'Not configured',
                    responseTime: elapsed
                };
            }

            if (this.mcpConfig[serverName].disabled) {
                return {
                    responsive: false,
                    reason: 'Server disabled',
                    responseTime: elapsed
                };
            }

            return {
                responsive: false,
                reason: 'Claude MCP list unavailable',
                responseTime: elapsed
            };

        } catch (error) {
            return {
                responsive: false,
                error: error.message
            };
        }
    }
    
    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        this.healthCheckInterval = setInterval(async () => {
            await this.checkAllServers();
        }, this.config.healthCheckInterval);
        
        console.log(`🔄 Health monitoring started (interval: ${this.config.healthCheckInterval}ms)`);
    }
    
    /**
     * Stop health monitoring
     */
    stopHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            console.log('⏹️ Health monitoring stopped');
        }
    }
    
    /**
     * Validate if MCP should be used for operation
     */
    async validateMcpUsage(operation, context = {}) {
        const validation = {
            useMcp: true,
            reason: null,
            fallbackAllowed: false,
            justificationRequired: false,
            healthStatus: {}
        };
        
        // Check server health
        const serverName = this.determineServer(operation);
        const health = await this.checkServerHealth(serverName);
        
        validation.healthStatus = health;
        
        if (!health.healthy) {
            validation.useMcp = false;
            validation.reason = `MCP server '${serverName}' is not healthy`;
            validation.fallbackAllowed = true;
            validation.justificationRequired = true;
            
            // Log fallback attempt
            this.logFallback(operation, context, health);
        }
        
        // Check if operation is supported by MCP
        if (!this.isOperationSupported(operation)) {
            validation.useMcp = false;
            validation.reason = `Operation '${operation}' not supported by MCP`;
            validation.fallbackAllowed = true;
            validation.justificationRequired = false;
        }
        
        return validation;
    }
    
    /**
     * Determine which MCP server to use for operation
     */
    determineServer(operation) {
        // Map operations to servers
        const operationMap = {
            'query': 'salesforce-dx',
            'metadata_retrieve': 'salesforce-dx',
            'metadata_deploy': 'salesforce-dx',
            'data_query': 'salesforce-dx',
            'data_create': 'salesforce-dx',
            'data_insert': 'salesforce-dx',
            'data_update': 'salesforce-dx',
            'data_delete': 'salesforce-dx',
            'apex_execute': 'salesforce-dx',
            'test_run': 'salesforce-dx',
            'field_create': 'salesforce-dx',
            'object_create': 'salesforce-dx',
            'report_create': 'salesforce-dx',
            'user_create': 'salesforce-dx',
            'permission_assign': 'salesforce-dx'
        };
        
        return operationMap[operation] || 'salesforce-dx';
    }
    
    /**
     * Check if operation is supported by MCP
     */
    isOperationSupported(operation) {
        const supportedOperations = [
            'query',
            'metadata_retrieve',
            'metadata_deploy',
            'data_query',
            'data_create',
            'data_insert',
            'data_update',
            'data_delete',
            'apex_execute',
            'test_run',
            'field_create',
            'object_create',
            'report_create',
            'user_create',
            'permission_assign'
        ];
        
        return supportedOperations.includes(operation);
    }
    
    /**
     * Log fallback usage
     */
    logFallback(operation, context, health) {
        const entry = {
            timestamp: new Date().toISOString(),
            operation,
            context,
            health,
            reason: 'MCP unavailable'
        };
        
        this.fallbackLog.push(entry);
        
        // Keep only last 100 entries
        if (this.fallbackLog.length > 100) {
            this.fallbackLog = this.fallbackLog.slice(-100);
        }
        
        // Write to log file
        this.writeLogEntry(entry);
    }
    
    /**
     * Write log entry to file
     */
    async writeLogEntry(entry) {
        try {
            const logLine = JSON.stringify(entry) + '\n';
            await fs.appendFile(this.config.logFile, logLine);
        } catch (error) {
            console.error('Failed to write log entry:', error.message);
        }
    }
    
    /**
     * Create fallback justification
     */
    createFallbackJustification(operation, context, health) {
        return {
            reason: health.healthy ? 'MCP_OPERATION_UNSUPPORTED' : 'MCP_SERVER_DOWN',
            mcp_status: {
                state: health.healthy ? 'operational' : 'down',
                last_check: health.lastCheck || new Date().toISOString(),
                error_message: health.error || null,
                response_time_ms: health.api?.responseTime || null
            },
            attempted_recovery: {
                attempts: 1,
                actions: [
                    {
                        action: 'check_connectivity',
                        result: health.healthy ? 'success' : 'failed',
                        timestamp: new Date().toISOString(),
                        details: health.error || 'Health check performed'
                    }
                ]
            },
            operator: {
                agent_name: context.agent || 'unknown',
                user_context: context.user || 'system',
                session_id: context.sessionId || Date.now().toString()
            },
            timestamp: new Date().toISOString(),
            operation_details: {
                type: operation,
                target: {
                    org: context.targetOrg || 'unknown',
                    environment: context.environment || 'unknown'
                },
                scope: {
                    objects: context.objects || [],
                    record_count: context.recordCount || 0,
                    components: context.components || []
                },
                fallback_command: context.fallbackCommand || 'sf cli',
                risk_assessment: this.assessRisk(operation, context)
            },
            incident_reference: context.incidentId || 'N/A'
        };
    }
    
    /**
     * Assess risk level of fallback
     */
    assessRisk(operation, context) {
        if (context.environment === 'production') {
            if (operation.includes('delete') || operation.includes('deploy')) {
                return 'critical';
            }
            if (operation.includes('update') || operation.includes('insert') || operation.includes('create')) {
                return 'high';
            }
        }
        
        if (context.environment === 'uat') {
            if (operation.includes('delete')) {
                return 'high';
            }
            return 'medium';
        }
        
        return 'low';
    }
    
    /**
     * Get MCP metrics
     */
    getMetrics() {
        const metrics = {
            servers: {},
            fallbackCount: this.fallbackLog.length,
            lastFallback: this.fallbackLog.length > 0 ? 
                this.fallbackLog[this.fallbackLog.length - 1].timestamp : null
        };
        
        for (const [server, status] of Object.entries(this.healthStatus)) {
            metrics.servers[server] = {
                healthy: status.healthy,
                lastCheck: status.lastCheck,
                uptime: this.calculateUptime(server)
            };
        }
        
        return metrics;
    }
    
    /**
     * Calculate server uptime percentage
     */
    calculateUptime(serverName) {
        // In production, this would track actual uptime
        // For now, return based on current health
        const status = this.healthStatus[serverName];
        return status && status.healthy ? 100 : 0;
    }
    
    /**
     * Restart MCP server
     */
    async restartServer(serverName) {
        console.log(`🔄 Attempting to restart MCP server: ${serverName}`);
        
        try {
            const restartResult = await this.runClaudeMcpCommand(['restart', serverName]);
            if (!restartResult.ok) {
                console.warn(`⚠️ Claude MCP restart failed: ${restartResult.error?.message || 'unknown error'}`);

                // Stop the server
                await this.stopServer(serverName);
                
                // Wait a moment
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Start the server
                await this.startServer(serverName);
            }
            
            // Check health
            const health = await this.checkServerHealth(serverName);
            
            if (health.healthy) {
                console.log(`✅ Successfully restarted ${serverName}`);
                return true;
            } else {
                console.log(`⚠️ ${serverName} restarted but not healthy`);
                return false;
            }
            
        } catch (error) {
            console.error(`❌ Failed to restart ${serverName}:`, error.message);
            return false;
        }
    }
    
    /**
     * Stop MCP server
     */
    async stopServer(serverName) {
        console.log(`⏹️ Stopping ${serverName}...`);

        const stopResult = await this.runClaudeMcpCommand(['stop', serverName]);
        if (stopResult.ok) {
            return true;
        }

        console.warn(`⚠️ Claude MCP stop failed: ${stopResult.error?.message || 'unknown error'}`);

        const health = await this.checkMcpProcess(serverName);
        if (health.running && health.pids) {
            let stoppedAny = false;
            for (const pid of health.pids) {
                try {
                    await execAsync(`kill ${pid}`);
                    stoppedAny = true;
                } catch (error) {
                    console.warn(`Could not stop process ${pid}: ${error.message}`);
                }
            }
            return stoppedAny;
        }

        return false;
    }
    
    /**
     * Start MCP server
     */
    async startServer(serverName) {
        console.log(`▶️ Starting ${serverName}...`);

        const startResult = await this.runClaudeMcpCommand(['start', serverName]);
        if (startResult.ok) {
            return true;
        }

        console.warn(`⚠️ Claude MCP start failed: ${startResult.error?.message || 'unknown error'}`);
        return false;
    }
}

// Export the class
module.exports = McpValidator;

// CLI interface for testing
if (require.main === module) {
    const validator = new McpValidator();
    
    (async () => {
        try {
            await validator.initialize();
            
            const command = process.argv[2];
            
            switch (command) {
                case 'status':
                    const status = await validator.checkAllServers();
                    console.log(JSON.stringify(status, null, 2));
                    break;
                    
                case 'validate':
                    const operation = process.argv[3] || 'query';
                    const result = await validator.validateMcpUsage(operation);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                    
                case 'metrics':
                    console.log(JSON.stringify(validator.getMetrics(), null, 2));
                    break;
                    
                case 'restart':
                    const server = process.argv[3] || 'salesforce-dx';
                    await validator.restartServer(server);
                    break;
                    
                default:
                    console.log('Usage: mcp-validator.js [status|validate <operation>|metrics|restart <server>]');
            }
            
            validator.stopHealthMonitoring();
            
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}
