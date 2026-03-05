#!/usr/bin/env node

/**
 * MCP-API Bridge Library (Node.js)
 * Provides unified interface with intelligent routing and automatic fallback
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const McpValidator = require('./mcp-validator');

const execAsync = promisify(exec);

// Operation metrics tracking
class OperationMetrics {
    constructor() {
        this.logFile = path.join(require('os').tmpdir(), 'mcp-api-metrics.json');
        this.metrics = [];
        this.loadMetrics();
    }

    async loadMetrics() {
        try {
            const data = await fs.readFile(this.logFile, 'utf8');
            this.metrics = JSON.parse(data);
        } catch (err) {
            this.metrics = [];
        }
    }

    async saveMetrics() {
        try {
            await fs.writeFile(this.logFile, JSON.stringify(this.metrics, null, 2));
        } catch (err) {
            console.error('Failed to save metrics:', err);
        }
    }

    async logOperation(operation, method, status, duration, details = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            operation,
            method,
            status,
            duration,
            details
        };
        
        this.metrics.push(entry);
        
        // Keep only last 1000 entries
        if (this.metrics.length > 1000) {
            this.metrics = this.metrics.slice(-1000);
        }
        
        await this.saveMetrics();
        return entry;
    }

    getStatistics() {
        const stats = {
            total: this.metrics.length,
            mcp: { success: 0, failure: 0 },
            api: { success: 0, failure: 0 },
            operations: {}
        };

        this.metrics.forEach(entry => {
            const methodKey = entry.method.toLowerCase();
            const statusKey = entry.status.toLowerCase() === 'success' ? 'success' : 'failure';
            
            if (stats[methodKey]) {
                stats[methodKey][statusKey]++;
            }

            if (!stats.operations[entry.operation]) {
                stats.operations[entry.operation] = {
                    count: 0,
                    mcp: 0,
                    api: 0,
                    avgDuration: 0
                };
            }
            
            const op = stats.operations[entry.operation];
            op.count++;
            op[methodKey] = (op[methodKey] || 0) + 1;
            op.avgDuration = ((op.avgDuration * (op.count - 1)) + entry.duration) / op.count;
        });

        // Calculate success rates
        ['mcp', 'api'].forEach(method => {
            const total = stats[method].success + stats[method].failure;
            stats[method].successRate = total > 0 
                ? (stats[method].success / total * 100).toFixed(1) + '%'
                : 'N/A';
        });

        return stats;
    }
}

// MCP-API Bridge main class
class MCPAPIBridge {
    constructor() {
        this.metrics = new OperationMetrics();
        this.mcpAvailable = null;
        this.checkMCPAvailability();
        this.validator = null;
        this.validatorInit = null;
        this.validatorReady = false;
        this.validatorFailed = false;
    }

    async checkMCPAvailability() {
        try {
            // Check if MCP tools are available
            const { stdout } = await execAsync('which mcp_salesforce 2>/dev/null');
            this.mcpAvailable = !!stdout.trim();
        } catch {
            this.mcpAvailable = false;
        }
    }

    /**
     * Determine best method for operation
     */
    determineMethod(operation) {
        const apiOnlyOps = [
            'scratch_org_create', 'scratch_org_delete',
            'sandbox_refresh', 'package_install',
            'validation_deploy', 'quick_deploy',
            'ui_generate_layout', 'ui_generate_page'
        ];

        const mcpPreferredOps = [
            'data_query', 'data_create', 'data_update', 'data_delete',
            'field_create', 'object_create',
            'report_create', 'report_run',
            'user_create', 'permission_assign'
        ];

        if (apiOnlyOps.includes(operation)) {
            return 'API';
        }
        
        if (mcpPreferredOps.includes(operation) && this.mcpAvailable) {
            return 'MCP';
        }
        
        return 'MCP_WITH_FALLBACK';
    }

    /**
     * Initialize MCP validator lazily
     */
    async ensureValidator() {
        if (this.validatorReady || this.validatorFailed) {
            return;
        }

        if (!this.validatorInit) {
            this.validatorInit = (async () => {
                try {
                    this.validator = new McpValidator();
                    await this.validator.initialize();
                    this.validatorReady = true;
                } catch (error) {
                    this.validatorFailed = true;
                    console.warn(`[WARNING] MCP validator unavailable: ${error.message}`);
                }
            })();
        }

        await this.validatorInit;
    }

    /**
     * Build validation context for MCP usage checks
     */
    buildValidationContext(operation, params) {
        const objects = [];
        if (Array.isArray(params.objects)) {
            objects.push(...params.objects);
        }
        if (params.object) {
            objects.push(params.object);
        }

        return {
            agent: params.agent || 'mcp-api-bridge',
            user: params.user || 'system',
            sessionId: params.sessionId,
            targetOrg: params.org || process.env.SF_TARGET_ORG || process.env.SF_TARGET_ORG,
            environment: params.environment || process.env.SF_ENV || 'unknown',
            objects,
            recordCount: params.recordCount || (Array.isArray(params.data) ? params.data.length : 0),
            components: params.components || [],
            fallbackCommand: 'sf cli'
        };
    }

    /**
     * Resolve execution method with MCP validation
     */
    async resolveMethod(operation, params) {
        let method = this.determineMethod(operation);
        let validation = null;

        if (method !== 'API') {
            await this.ensureValidator();
            if (this.validatorReady) {
                validation = await this.validator.validateMcpUsage(
                    operation,
                    this.buildValidationContext(operation, params)
                );

                if (!validation.useMcp) {
                    if (validation.fallbackAllowed || method === 'MCP_WITH_FALLBACK') {
                        console.log(`[WARNING] MCP unavailable (${validation.reason}); using API fallback`);
                        method = 'API';
                    } else {
                        throw new Error(`MCP validation failed: ${validation.reason}`);
                    }
                }
            }
        }

        return { method, validation };
    }

    /**
     * Execute operation with intelligent routing
     */
    async executeOperation(operation, params = {}) {
        const { method, validation } = await this.resolveMethod(operation, params);
        const startTime = Date.now();
        
        console.log(`[INFO] Executing ${operation} via ${method}`);
        
        let result;
        let status = 'SUCCESS';
        
        try {
            switch (method) {
                case 'API':
                    result = await this.executeViaAPI(operation, params);
                    break;
                
                case 'MCP':
                    result = await this.executeViaMCP(operation, params);
                    break;
                
                case 'MCP_WITH_FALLBACK':
                    try {
                        result = await this.executeViaMCP(operation, params);
                    } catch (mcpError) {
                        console.log('[WARNING] MCP failed, falling back to API');
                        result = await this.executeViaAPI(operation, params);
                    }
                    break;
            }
        } catch (error) {
            status = 'FAILURE';
            console.error(`[ERROR] Operation failed: ${error.message}`);
            throw error;
        } finally {
            const duration = Date.now() - startTime;
            await this.metrics.logOperation(operation, method, status, duration, {
                ...params,
                mcpValidation: validation ? {
                    useMcp: validation.useMcp,
                    reason: validation.reason
                } : undefined
            });
        }
        
        return result;
    }

    /**
     * Execute via MCP tools
     */
    async executeViaMCP(operation, params) {
        const mcpCommands = {
            data_query: (p) => `mcp_salesforce_data_query --query "${p.query}"`,
            data_create: (p) => `mcp_salesforce_data_create --object "${p.object}" --data '${JSON.stringify(p.data)}'`,
            field_create: (p) => `mcp_salesforce_field_create --object "${p.object}" --field '${JSON.stringify(p.field)}'`,
            report_create: (p) => `mcp_salesforce_report_create --config '${JSON.stringify(p.config)}'`,
            user_create: (p) => `mcp_salesforce_user_create --data '${JSON.stringify(p.userData)}'`
        };

        const command = mcpCommands[operation];
        if (!command) {
            throw new Error(`MCP operation not implemented: ${operation}`);
        }

        const { stdout } = await execAsync(command(params));
        return JSON.parse(stdout);
    }

    /**
     * Execute via Salesforce CLI
     */
    async executeViaAPI(operation, params) {
        const apiCommands = {
            // Data operations
            data_query: async (p) => {
                const cmd = `sf data query --query "${p.query}" --target-org ${p.org || process.env.SF_TARGET_ORG} --json`;
                const { stdout } = await execAsync(cmd);
                return JSON.parse(stdout).result.records;
            },
            
            // Scratch org operations
            scratch_org_create: async (p) => {
                const cmd = `sf org create scratch --definition-file ${p.config} --alias ${p.alias} --duration-days ${p.duration || 7} --json`;
                const { stdout } = await execAsync(cmd);
                return JSON.parse(stdout).result;
            },
            
            // UI generation
            ui_generate_layout: async (p) => {
                const layoutXml = this.generateLayoutXML(p);
                const filePath = path.join(p.outputDir || 'force-app/main/default/layouts', 
                    `${p.object}-${p.layoutName}.layout-meta.xml`);
                await fs.writeFile(filePath, layoutXml);
                return { success: true, path: filePath };
            },
            
            // Deployment operations
            validation_deploy: async (p) => {
                const cmd = `sf project deploy start --source-dir ${p.source} --target-org ${p.org} --dry-run --json`;
                const { stdout } = await execAsync(cmd);
                return JSON.parse(stdout).result;
            },
            
            quick_deploy: async (p) => {
                const cmd = `sf project deploy quick --job-id ${p.validationId} --target-org ${p.org} --json`;
                const { stdout } = await execAsync(cmd);
                return JSON.parse(stdout).result;
            },
            
            // Package operations
            package_install: async (p) => {
                const cmd = `sf package install --package ${p.packageId} --target-org ${p.org} --wait ${p.wait || 10} --json`;
                const { stdout } = await execAsync(cmd);
                return JSON.parse(stdout).result;
            }
        };

        const command = apiCommands[operation];
        if (!command) {
            throw new Error(`API operation not implemented: ${operation}`);
        }

        return await command(params);
    }

    /**
     * Generate Layout XML
     */
    generateLayoutXML(params) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Layout xmlns="http://soap.sforce.com/2006/04/metadata">
    <layoutSections>
        <customLabel>false</customLabel>
        <detailHeading>false</detailHeading>
        <editHeading>true</editHeading>
        <label>Information</label>
        <layoutColumns/>
        <layoutColumns/>
        <style>TwoColumnsTopToBottom</style>
    </layoutSections>
    <layoutSections>
        <customLabel>false</customLabel>
        <detailHeading>false</detailHeading>
        <editHeading>true</editHeading>
        <label>System Information</label>
        <layoutColumns/>
        <layoutColumns/>
        <style>TwoColumnsTopToBottom</style>
    </layoutSections>
    <showEmailCheckbox>false</showEmailCheckbox>
    <showHighlightsPanel>false</showHighlightsPanel>
    <showInteractionLogPanel>false</showInteractionLogPanel>
    <showRunAssignmentRulesCheckbox>false</showRunAssignmentRulesCheckbox>
    <showSubmitAndAttachButton>false</showSubmitAndAttachButton>
</Layout>`;
    }

    /**
     * Batch operations with intelligent routing
     */
    async executeBatch(operations) {
        const results = [];
        const batchStart = Date.now();
        
        console.log(`[INFO] Executing batch of ${operations.length} operations`);
        
        for (const op of operations) {
            try {
                const result = await this.executeOperation(op.operation, op.params);
                results.push({ success: true, operation: op.operation, result });
            } catch (error) {
                results.push({ success: false, operation: op.operation, error: error.message });
            }
        }
        
        const batchDuration = Date.now() - batchStart;
        console.log(`[INFO] Batch completed in ${batchDuration}ms`);
        
        return {
            results,
            summary: {
                total: operations.length,
                successful: results.filter(r => r.success).length,
                failed: results.filter(r => !r.success).length,
                duration: batchDuration
            }
        };
    }

    /**
     * Get operation statistics
     */
    getStatistics() {
        return this.metrics.getStatistics();
    }

    /**
     * Health check for MCP and API availability
     */
    async healthCheck() {
        const health = {
            mcp: { available: false, latency: null, details: null },
            api: { available: false, latency: null },
            recommendations: []
        };

        // Check MCP
        await this.ensureValidator();

        if (this.validatorReady) {
            const start = Date.now();
            const cached = this.validator.healthStatus?.['salesforce-dx'];
            const lastCheck = cached?.lastCheck ? Date.parse(cached.lastCheck) : 0;
            const recent = cached && !Number.isNaN(lastCheck) && (Date.now() - lastCheck) < 5000;
            const status = recent ? cached : await this.validator.checkServerHealth('salesforce-dx');
            health.mcp.available = status.healthy;
            health.mcp.latency = Date.now() - start;
            health.mcp.details = status;

            if (!status.healthy) {
                const reason = status.error || status.api?.reason || status.process?.error || 'MCP server not healthy';
                health.recommendations.push(`MCP check failed: ${reason}`);
            }
        } else {
            try {
                const start = Date.now();
                await execAsync('mcp_salesforce --version 2>/dev/null');
                health.mcp.available = true;
                health.mcp.latency = Date.now() - start;
            } catch {
                health.mcp.available = false;
                health.recommendations.push('MCP tools not available - install MCP server');
            }
        }

        // Check API (Salesforce CLI)
        try {
            const start = Date.now();
            await execAsync('sf --version');
            health.api.available = true;
            health.api.latency = Date.now() - start;
        } catch {
            health.api.available = false;
            health.recommendations.push('Salesforce CLI not available - install SF CLI');
        }

        // Check authentication
        try {
            const { stdout } = await execAsync('sf org list --json');
            const orgs = JSON.parse(stdout).result;
            if (!orgs || orgs.length === 0) {
                health.recommendations.push('No authenticated orgs - run sf org login');
            }
        } catch {
            health.recommendations.push('Unable to check org authentication');
        }

        return health;
    }
}

// Export for use in other modules
module.exports = MCPAPIBridge;

// CLI interface
if (require.main === module) {
    const bridge = new MCPAPIBridge();
    
    const command = process.argv[2];
    const params = process.argv[3] ? JSON.parse(process.argv[3]) : {};
    
    async function main() {
        try {
            switch (command) {
                case 'execute':
                    const operation = params.operation;
                    delete params.operation;
                    const result = await bridge.executeOperation(operation, params);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                
                case 'batch':
                    const operations = JSON.parse(await fs.readFile(params.file, 'utf8'));
                    const batchResult = await bridge.executeBatch(operations);
                    console.log(JSON.stringify(batchResult, null, 2));
                    break;
                
                case 'stats':
                    const stats = bridge.getStatistics();
                    console.log(JSON.stringify(stats, null, 2));
                    break;
                
                case 'health':
                    const health = await bridge.healthCheck();
                    console.log(JSON.stringify(health, null, 2));
                    break;
                
                default:
                    console.log('Usage: mcp-api-bridge.js [execute|batch|stats|health] [params]');
                    process.exit(1);
            }

            if (bridge.validator && typeof bridge.validator.stopHealthMonitoring === 'function') {
                bridge.validator.stopHealthMonitoring();
            }
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    }
    
    main();
}
