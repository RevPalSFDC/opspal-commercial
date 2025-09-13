#!/usr/bin/env node

/**
 * HubSpot Environment Manager for MCP Server
 * Manages multiple HubSpot environments with modern authentication
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class HubSpotEnvironmentManager {
    constructor() {
        this.rootPath = path.join(__dirname, '..');
        this.mcpConfigPath = path.join(this.rootPath, '.mcp.json');
        this.envPath = path.join(this.rootPath, '.env');
        this.portalsConfigPath = path.join(this.rootPath, 'ClaudeHubSpot', 'portals', 'config.json');
        
        this.loadConfigurations();
    }

    loadConfigurations() {
        // Load MCP config
        this.mcpConfig = JSON.parse(fs.readFileSync(this.mcpConfigPath, 'utf8'));
        
        // Load portals config
        if (fs.existsSync(this.portalsConfigPath)) {
            this.portalsConfig = JSON.parse(fs.readFileSync(this.portalsConfigPath, 'utf8'));
        } else {
            console.error('Portals configuration not found');
            this.portalsConfig = null;
        }
        
        // Load current environment variables
        this.loadEnvVars();
    }

    loadEnvVars() {
        this.envVars = {};
        if (fs.existsSync(this.envPath)) {
            const envContent = fs.readFileSync(this.envPath, 'utf8');
            envContent.split('\n').forEach(line => {
                const match = line.match(/^([^=]+)=(.*)$/);
                if (match) {
                    this.envVars[match[1]] = match[2];
                }
            });
        }
    }

    /**
     * Setup HubSpot CLI with MCP server for a specific environment
     */
    async setupHubSpotCLI(environment = 'production') {
        console.log(`\n🔧 Setting up HubSpot CLI with MCP server for ${environment}...`);
        
        try {
            // Install/update HubSpot CLI to latest version
            console.log('📦 Ensuring HubSpot CLI is at version 7.6.0 or higher...');
            execSync('npm install -g @hubspot/cli@latest', { stdio: 'inherit' });
            
            // Run MCP setup
            console.log('🚀 Running HubSpot MCP setup...');
            execSync('hs mcp setup', { stdio: 'inherit' });
            
            console.log('✅ HubSpot CLI MCP setup complete!');
            return true;
        } catch (error) {
            console.error('❌ Error setting up HubSpot CLI:', error.message);
            return false;
        }
    }

    /**
     * Configure MCP server with modern authentication
     */
    configureMCPServer(environment = 'production') {
        const portal = this.portalsConfig?.portals[environment];
        if (!portal) {
            throw new Error(`Environment '${environment}' not found in portals configuration`);
        }

        // Update MCP configuration with modern auth
        const updatedMCPConfig = {
            ...this.mcpConfig,
            mcpServers: {
                ...this.mcpConfig.mcpServers,
                hubspot: {
                    command: "npx",
                    args: ["-y", "@hubspot/mcp-server"],
                    env: {
                        // Use Personal Access Token for modern auth
                        HUBSPOT_ACCESS_TOKEN: `\${HUBSPOT_ACCESS_TOKEN_${environment.toUpperCase()}}`,
                        HUBSPOT_PORTAL_ID: `\${HUBSPOT_PORTAL_ID_${environment.toUpperCase()}}`,
                        HUBSPOT_ENVIRONMENT: environment
                    },
                    disabled: false
                }
            }
        };

        // Add environment-specific MCP servers
        Object.keys(this.portalsConfig.portals).forEach(env => {
            if (env !== 'production') {
                updatedMCPConfig.mcpServers[`hubspot-${env}`] = {
                    command: "npx",
                    args: ["-y", "@hubspot/mcp-server"],
                    env: {
                        HUBSPOT_ACCESS_TOKEN: `\${HUBSPOT_ACCESS_TOKEN_${env.toUpperCase()}}`,
                        HUBSPOT_PORTAL_ID: `\${HUBSPOT_PORTAL_ID_${env.toUpperCase()}}`,
                        HUBSPOT_ENVIRONMENT: env
                    },
                    disabled: env !== environment
                };
            }
        });

        // Save updated MCP configuration
        fs.writeFileSync(this.mcpConfigPath, JSON.stringify(updatedMCPConfig, null, 2));
        console.log(`✅ MCP configuration updated for ${environment}`);
        
        return updatedMCPConfig;
    }

    /**
     * Update environment variables for all configured portals
     */
    updateEnvironmentVariables() {
        let envContent = fs.existsSync(this.envPath) 
            ? fs.readFileSync(this.envPath, 'utf8') 
            : '';
        
        // Add variables for each portal
        Object.entries(this.portalsConfig.portals).forEach(([env, portal]) => {
            const envUpper = env.toUpperCase();
            
            // Update or add access token
            const tokenKey = `HUBSPOT_ACCESS_TOKEN_${envUpper}`;
            const portalIdKey = `HUBSPOT_PORTAL_ID_${envUpper}`;
            
            envContent = this.updateEnvVar(envContent, tokenKey, portal.accessToken || portal.apiKey || '');
            envContent = this.updateEnvVar(envContent, portalIdKey, portal.portalId || '');
        });

        // Add current active environment
        const activePortal = this.portalsConfig.activePortal || 'production';
        const activeConfig = this.portalsConfig.portals[activePortal];
        
        envContent = this.updateEnvVar(envContent, 'HUBSPOT_ACCESS_TOKEN', 
            activeConfig.accessToken || activeConfig.apiKey || '');
        envContent = this.updateEnvVar(envContent, 'HUBSPOT_PORTAL_ID', 
            activeConfig.portalId || '');
        envContent = this.updateEnvVar(envContent, 'HUBSPOT_ACTIVE_ENVIRONMENT', activePortal);

        fs.writeFileSync(this.envPath, envContent);
        console.log('✅ Environment variables updated');
    }

    updateEnvVar(content, key, value) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        const newLine = `${key}=${value}`;
        
        if (regex.test(content)) {
            return content.replace(regex, newLine);
        } else {
            return content + (content.endsWith('\n') ? '' : '\n') + newLine + '\n';
        }
    }

    /**
     * Switch to a different HubSpot environment
     */
    switchEnvironment(environment) {
        if (!this.portalsConfig.portals[environment]) {
            throw new Error(`Environment '${environment}' not found`);
        }

        // Update active portal
        this.portalsConfig.activePortal = environment;
        fs.writeFileSync(this.portalsConfigPath, JSON.stringify(this.portalsConfig, null, 2));

        // Reconfigure MCP server
        this.configureMCPServer(environment);
        
        // Update environment variables
        this.updateEnvironmentVariables();

        // Restart MCP server
        this.restartMCPServer();

        console.log(`✅ Switched to ${environment} environment`);
    }

    /**
     * Restart MCP server to apply changes
     */
    restartMCPServer() {
        try {
            console.log('🔄 Restarting MCP servers...');
            execSync('claude mcp restart hubspot', { stdio: 'inherit' });
            console.log('✅ MCP server restarted');
        } catch (error) {
            console.log('⚠️  Could not restart MCP server automatically. Please restart Claude Code.');
        }
    }

    /**
     * Display current configuration
     */
    showStatus() {
        console.log('\n📊 HubSpot Environment Status');
        console.log('═'.repeat(40));
        
        if (this.portalsConfig) {
            console.log(`Active Environment: ${this.portalsConfig.activePortal}`);
            console.log('\nConfigured Environments:');
            
            Object.entries(this.portalsConfig.portals).forEach(([env, config]) => {
                const isActive = env === this.portalsConfig.activePortal;
                const hasAuth = !!(config.accessToken || config.apiKey);
                console.log(`  ${isActive ? '▶' : ' '} ${env}: ${config.name || 'Unnamed'}`);
                console.log(`     Portal ID: ${config.portalId || 'Not configured'}`);
                console.log(`     Auth: ${hasAuth ? '✅ Configured' : '❌ Missing'}`);
            });
        }

        console.log('\nMCP Server Status:');
        Object.entries(this.mcpConfig.mcpServers).forEach(([name, config]) => {
            if (name.startsWith('hubspot')) {
                console.log(`  ${name}: ${config.disabled ? '⚫ Disabled' : '🟢 Enabled'}`);
            }
        });
    }

    /**
     * Interactive setup wizard
     */
    async interactiveSetup() {
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const question = (prompt) => new Promise(resolve => readline.question(prompt, resolve));

        console.log('\n🚀 HubSpot Multi-Environment Setup Wizard');
        console.log('═'.repeat(40));

        const environment = await question('Enter environment name (production/sandbox/staging): ');
        const portalId = await question('Enter HubSpot Portal ID: ');
        const accessToken = await question('Enter Personal Access Token (PAT): ');
        const name = await question('Enter a friendly name for this environment: ');

        readline.close();

        // Update portal configuration
        if (!this.portalsConfig.portals[environment]) {
            this.portalsConfig.portals[environment] = {};
        }

        this.portalsConfig.portals[environment] = {
            ...this.portalsConfig.portals[environment],
            name,
            portalId,
            accessToken,
            authType: 'private_app',
            environment
        };

        fs.writeFileSync(this.portalsConfigPath, JSON.stringify(this.portalsConfig, null, 2));
        
        // Configure and switch to new environment
        this.switchEnvironment(environment);
        
        console.log(`\n✅ Environment '${environment}' configured and activated!`);
    }
}

// CLI Interface
if (require.main === module) {
    const manager = new HubSpotEnvironmentManager();
    const command = process.argv[2];
    const arg = process.argv[3];

    switch (command) {
        case 'setup':
            manager.setupHubSpotCLI(arg || 'production');
            break;
            
        case 'switch':
            if (!arg) {
                console.error('❌ Please specify an environment');
                process.exit(1);
            }
            manager.switchEnvironment(arg);
            break;
            
        case 'status':
            manager.showStatus();
            break;
            
        case 'configure':
            manager.configureMCPServer(arg || 'production');
            manager.updateEnvironmentVariables();
            break;
            
        case 'wizard':
            manager.interactiveSetup();
            break;
            
        default:
            console.log(`
HubSpot Environment Manager

Usage: node hubspot-environment-manager.js [command] [environment]

Commands:
  setup [env]      - Setup HubSpot CLI with MCP server
  switch <env>     - Switch to a different environment
  status           - Show current configuration status
  configure [env]  - Configure MCP server for environment
  wizard           - Interactive setup wizard

Examples:
  node hubspot-environment-manager.js setup production
  node hubspot-environment-manager.js switch sandbox
  node hubspot-environment-manager.js status
  node hubspot-environment-manager.js wizard
            `);
    }
}

module.exports = HubSpotEnvironmentManager;