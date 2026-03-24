#!/usr/bin/env node

/**
 * Agent Gate Wrapper
 * ==================
 * Provides a simple interface for agents to use the gate system
 * Drop-in replacement for execAsync in agent code
 */

const DeploymentInterceptor = require('./deployment-interceptor');
const { exec } = require('child_process');
const { promisify } = require('util');

const originalExecAsync = promisify(exec);

/**
 * Create a gate-aware exec function for agents
 */
function createGateAwareExec(agentName, config = {}) {
    // Create interceptor for this agent
    const interceptor = new DeploymentInterceptor({
        agentName,
        autoFallback: config.autoFallback || process.env.AGENT_AUTO_FALLBACK === 'true',
        enforceGates: config.enforceGates !== false && process.env.DISABLE_GATES !== 'true',
        logCommands: config.logCommands || process.env.LOG_AGENT_COMMANDS === 'true',
        ...config
    });
    
    // Initialize on first use
    let initialized = false;
    
    /**
     * Gate-aware exec function
     */
    async function gateAwareExec(command, options = {}) {
        // Initialize interceptor if needed
        if (!initialized) {
            await interceptor.initialize();
            initialized = true;
        }
        
        // Check if this is a Salesforce command
        const sfPatterns = [
            'sf ',
            'sfdx ',
            'SELECT ',
            'INSERT ',
            'UPDATE ',
            'DELETE ',
            'UPSERT '
        ];

        const trimmed = command.trim();

        const isSalesforceCommand = sfPatterns.some(pattern =>
            trimmed.startsWith(pattern) || command.includes(pattern)
        );
        
        if (isSalesforceCommand) {
            // Route through interceptor
            try {
                return await interceptor.execute(command, {
                    sessionId: options.sessionId || `${agentName}-${Date.now()}`
                });
            } catch (error) {
                // If gates block, provide helpful error
                if (error.gateResults) {
                    const gateError = new Error(
                        `Deployment blocked by security gates:\n` +
                        error.gateResults.blockers.map(b => `  - ${b}`).join('\n')
                    );
                    gateError.gateResults = error.gateResults;
                    gateError.originalCommand = command;
                    throw gateError;
                }
                throw error;
            }
        }
        
        // Non-Salesforce commands execute normally
        return originalExecAsync(command, options);
    }
    
    // Add utility methods
    gateAwareExec.interceptor = interceptor;
    gateAwareExec.isGateEnabled = () => interceptor.config.enforceGates;
    gateAwareExec.setAutoFallback = (enabled) => {
        interceptor.config.autoFallback = enabled;
    };
    
    return gateAwareExec;
}

/**
 * Monkey-patch global exec for complete interception
 * USE WITH CAUTION - This affects ALL exec calls
 */
function enableGlobalInterception(config = {}) {
    const interceptor = new DeploymentInterceptor({
        agentName: 'global',
        autoFallback: config.autoFallback || false,
        enforceGates: config.enforceGates !== false,
        logCommands: config.logCommands || false,
        ...config
    });
    
    // Store original
    const originalExec = require('child_process').exec;
    const originalExecSync = require('child_process').execSync;
    
    // Replace exec
    require('child_process').exec = function(command, ...args) {
        // Check if this needs interception
        if (interceptor.isDeploymentCommand(command)) {
            console.log('🔒 Global interception active for:', command);
            
            // Convert to promise-based for interceptor
            const callback = args[args.length - 1];
            if (typeof callback === 'function') {
                interceptor.execute(command)
                    .then(result => callback(null, result.stdout, result.stderr))
                    .catch(error => callback(error));
                return;
            }
        }
        
        return originalExec(command, ...args);
    };
    
    // Replace execSync (synchronous version)
    require('child_process').execSync = function(command, options) {
        if (interceptor.isDeploymentCommand(command)) {
            console.warn('⚠️ Synchronous deployment detected - gates may not work properly');
        }
        return originalExecSync(command, options);
    };
    
    console.log('✅ Global gate interception enabled');
    
    return {
        disable: () => {
            require('child_process').exec = originalExec;
            require('child_process').execSync = originalExecSync;
            console.log('🔓 Global gate interception disabled');
        }
    };
}

/**
 * Agent integration helper
 * Use this in your agent code
 */
class AgentGateHelper {
    constructor(agentName, config = {}) {
        this.agentName = agentName;
        this.execAsync = createGateAwareExec(agentName, config);
        this.config = config;
    }
    
    /**
     * Execute a Salesforce command with gates
     */
    async execute(command) {
        return await this.execAsync(command);
    }
    
    /**
     * Deploy to Salesforce with gates
     */
    async deploy(targetOrg, sourcePath, options = {}) {
        const command = this.buildDeployCommand(targetOrg, sourcePath, options);
        return await this.execute(command);
    }
    
    /**
     * Query Salesforce data with gates
     */
    async query(soql, targetOrg) {
        const command = `sf data query --query "${soql}"${targetOrg ? ` --target-org ${targetOrg}` : ''} --json`;
        const result = await this.execute(command);
        return JSON.parse(result.stdout);
    }
    
    /**
     * Build deployment command
     */
    buildDeployCommand(targetOrg, sourcePath, options = {}) {
        let command = 'sf project deploy start';
        
        if (sourcePath) {
            command += ` --source-dir "${sourcePath}"`;
        }
        
        if (targetOrg) {
            command += ` --target-org ${targetOrg}`;
        }
        
        if (options.dryRun) {
            command += ' --dry-run';
        }
        
        if (options.wait) {
            command += ` --wait ${options.wait}`;
        }
        
        return command;
    }
    
    /**
     * Check if gates are enabled
     */
    isGateEnabled() {
        return this.execAsync.isGateEnabled();
    }
    
    /**
     * Enable/disable auto-fallback
     */
    setAutoFallback(enabled) {
        this.execAsync.setAutoFallback(enabled);
    }
}

// Export everything
module.exports = {
    createGateAwareExec,
    enableGlobalInterception,
    AgentGateHelper,
    DeploymentInterceptor
};

// Example usage for agents
if (require.main === module) {
    console.log(`
Agent Gate Wrapper - Integration Examples
==========================================

1. Simple Integration (Recommended):
------------------------------------
const { createGateAwareExec } = require('./agent-gate-wrapper');

// In your agent code, replace execAsync with:
const execAsync = createGateAwareExec('my-agent-name', {
    autoFallback: true  // Optional: auto-handle MCP failures
});

// Use normally - gates apply automatically
await execAsync('sf project deploy --target-org sandbox');


2. Using Helper Class:
----------------------
const { AgentGateHelper } = require('./agent-gate-wrapper');

const gateHelper = new AgentGateHelper('my-agent');

// Deploy with gates
await gateHelper.deploy('sandbox', './force-app');

// Query with gates
const results = await gateHelper.query('SELECT Id FROM Account', 'sandbox');


3. Global Interception (Use Carefully):
----------------------------------------
const { enableGlobalInterception } = require('./agent-gate-wrapper');

// Enable for entire process
const interception = enableGlobalInterception({
    enforceGates: true,
    logCommands: true
});

// All exec calls now go through gates
// ...

// Disable when done
interception.disable();


Environment Variables:
----------------------
DISABLE_GATES=true         # Disable gate enforcement globally
AGENT_AUTO_FALLBACK=true   # Enable auto-fallback for MCP failures
LOG_AGENT_COMMANDS=true    # Log all commands for debugging
`);
}
