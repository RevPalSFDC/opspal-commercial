#!/usr/bin/env node

/**
 * Filmhub HubSpot Instance Configuration
 * Sets up the Filmhub portal (39560118) for MCP server access
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class FilmhubConfigurator {
    constructor() {
        this.rootPath = path.join(__dirname, '..');
        this.hubspotPath = path.join(this.rootPath, 'ClaudeHubSpot');
        this.portalsConfigPath = path.join(this.hubspotPath, 'portals', 'config.json');
        this.envPath = path.join(this.rootPath, '.env');
        this.envTemplatePath = path.join(this.rootPath, '.env.template');
        this.mcpConfigPath = path.join(this.rootPath, '.mcp.json');
        
        this.filmhubConfig = {
            portalId: '39560118',
            name: 'Filmhub Production',
            environment: 'filmhub'
        };
    }

    /**
     * Step 1: Add Filmhub to portals configuration
     */
    updatePortalsConfig() {
        console.log('📝 Updating portals configuration...');
        
        let portalsConfig;
        if (fs.existsSync(this.portalsConfigPath)) {
            portalsConfig = JSON.parse(fs.readFileSync(this.portalsConfigPath, 'utf8'));
        } else {
            throw new Error('Portals configuration not found. Please ensure ClaudeHubSpot is set up.');
        }

        // Add Filmhub configuration
        portalsConfig.portals.filmhub = {
            name: this.filmhubConfig.name,
            portalId: this.filmhubConfig.portalId,
            apiKey: '', // To be filled via environment variable
            accessToken: '', // To be filled if available
            authType: 'api_key', // Will update to private_app when PAT is available
            environment: 'production',
            description: 'Filmhub production HubSpot portal',
            features: {
                marketing: true,
                sales: true,
                service: true,
                cms: false,
                operations: true
            },
            settings: {
                rateLimitRetry: true,
                maxRetries: 3,
                logLevel: 'info'
            }
        };

        // Save updated configuration
        fs.writeFileSync(this.portalsConfigPath, JSON.stringify(portalsConfig, null, 2));
        console.log('✅ Portals configuration updated');
        
        return portalsConfig;
    }

    /**
     * Step 2: Update MCP configuration for Filmhub
     */
    updateMCPConfig() {
        console.log('🔧 Updating MCP configuration...');
        
        const mcpConfig = JSON.parse(fs.readFileSync(this.mcpConfigPath, 'utf8'));
        
        // Update main HubSpot MCP server to support environment switching
        mcpConfig.mcpServers.hubspot = {
            command: "npx",
            args: ["-y", "@hubspot/mcp-server"],
            env: {
                // Use environment-specific variables
                HUBSPOT_API_KEY: "${HUBSPOT_API_KEY_FILMHUB:-${HUBSPOT_API_KEY}}",
                HUBSPOT_ACCESS_TOKEN: "${HUBSPOT_ACCESS_TOKEN_FILMHUB:-${HUBSPOT_ACCESS_TOKEN}}",
                HUBSPOT_PORTAL_ID: "${HUBSPOT_PORTAL_ID_FILMHUB:-${HUBSPOT_PORTAL_ID}}"
            },
            disabled: false
        };

        // Add dedicated Filmhub MCP server
        mcpConfig.mcpServers['hubspot-filmhub'] = {
            command: "npx",
            args: ["-y", "@hubspot/mcp-server"],
            env: {
                HUBSPOT_API_KEY: "${HUBSPOT_API_KEY_FILMHUB}",
                HUBSPOT_ACCESS_TOKEN: "${HUBSPOT_ACCESS_TOKEN_FILMHUB}",
                HUBSPOT_PORTAL_ID: "39560118"
            },
            disabled: false
        };

        fs.writeFileSync(this.mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
        console.log('✅ MCP configuration updated');
        
        return mcpConfig;
    }

    /**
     * Step 3: Create or update .env.template with Filmhub variables
     */
    updateEnvTemplate() {
        console.log('📄 Updating environment template...');
        
        let templateContent = fs.existsSync(this.envTemplatePath) 
            ? fs.readFileSync(this.envTemplatePath, 'utf8')
            : '';

        // Add Filmhub section if not exists
        if (!templateContent.includes('# Filmhub HubSpot Configuration')) {
            templateContent += `
# Filmhub HubSpot Configuration
HUBSPOT_API_KEY_FILMHUB=your-filmhub-api-key-here
HUBSPOT_ACCESS_TOKEN_FILMHUB=your-filmhub-pat-here-if-available
HUBSPOT_PORTAL_ID_FILMHUB=39560118

`;
        }

        fs.writeFileSync(this.envTemplatePath, templateContent);
        console.log('✅ Environment template updated');
    }

    /**
     * Step 4: Create helper script for switching to Filmhub
     */
    createSwitchScript() {
        console.log('📜 Creating switch script...');
        
        const scriptPath = path.join(this.rootPath, 'scripts', 'switch-to-filmhub.sh');
        const scriptContent = `#!/bin/bash

# Switch to Filmhub HubSpot Instance
echo "🎬 Switching to Filmhub HubSpot instance..."

# Export Filmhub-specific variables as primary
export HUBSPOT_API_KEY="\${HUBSPOT_API_KEY_FILMHUB}"
export HUBSPOT_ACCESS_TOKEN="\${HUBSPOT_ACCESS_TOKEN_FILMHUB}"
export HUBSPOT_PORTAL_ID="39560118"
export HUBSPOT_ACTIVE_ENVIRONMENT="filmhub"

# Update active portal in config
node -e "
const fs = require('fs');
const configPath = './ClaudeHubSpot/portals/config.json';
const config = JSON.parse(fs.readFileSync(configPath));
config.activePortal = 'filmhub';
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('✅ Switched to Filmhub portal');
"

# Restart MCP server if Claude CLI is available
if command -v claude &> /dev/null; then
    echo "🔄 Restarting HubSpot MCP servers..."
    claude mcp restart hubspot 2>/dev/null || true
    claude mcp restart hubspot-filmhub 2>/dev/null || true
fi

echo "✅ Filmhub HubSpot instance activated!"
echo ""
echo "Portal ID: 39560118"
echo "Environment: filmhub"
echo ""
echo "⚠️  Make sure you have set HUBSPOT_API_KEY_FILMHUB in your .env file"
`;

        fs.writeFileSync(scriptPath, scriptContent);
        fs.chmodSync(scriptPath, '755');
        console.log('✅ Switch script created');
    }

    /**
     * Step 5: Create test script for Filmhub connection
     */
    createTestScript() {
        console.log('🧪 Creating test script...');
        
        const testScriptPath = path.join(this.rootPath, 'scripts', 'test-filmhub-connection.js');
        const testScript = `#!/usr/bin/env node

/**
 * Test Filmhub HubSpot Connection
 */

const https = require('https');

// Check for API key
const apiKey = process.env.HUBSPOT_API_KEY_FILMHUB || process.env.HUBSPOT_API_KEY;
const accessToken = process.env.HUBSPOT_ACCESS_TOKEN_FILMHUB || process.env.HUBSPOT_ACCESS_TOKEN;
const portalId = '39560118';

if (!apiKey && !accessToken) {
    console.error('❌ No API credentials found!');
    console.error('Please set HUBSPOT_API_KEY_FILMHUB or HUBSPOT_ACCESS_TOKEN_FILMHUB in your .env file');
    process.exit(1);
}

console.log('🧪 Testing Filmhub HubSpot connection...');
console.log('Portal ID:', portalId);
console.log('Auth method:', accessToken ? 'Access Token' : 'API Key');

// Test API connection
const options = {
    hostname: 'api.hubapi.com',
    path: '/crm/v3/objects/contacts?limit=1',
    method: 'GET',
    headers: {}
};

// Set authentication header
if (accessToken) {
    options.headers['Authorization'] = \`Bearer \${accessToken}\`;
} else {
    options.path += \`&hapikey=\${apiKey}\`;
}

const req = https.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        if (res.statusCode === 200) {
            console.log('✅ Connection successful!');
            const response = JSON.parse(data);
            console.log('Total contacts:', response.total || 0);
        } else if (res.statusCode === 401) {
            console.error('❌ Authentication failed!');
            console.error('Please check your API credentials');
        } else {
            console.error('❌ Connection failed!');
            console.error('Status:', res.statusCode);
            console.error('Response:', data);
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Connection error:', error.message);
});

req.end();
`;

        fs.writeFileSync(testScriptPath, testScript);
        fs.chmodSync(testScriptPath, '755');
        console.log('✅ Test script created');
    }

    /**
     * Step 6: Display setup instructions
     */
    displayInstructions() {
        console.log('\n' + '='.repeat(60));
        console.log('🎬 Filmhub HubSpot Instance Configuration Complete!');
        console.log('='.repeat(60));
        
        console.log('\n📋 Next Steps:\n');
        
        console.log('1. Add your Filmhub API credentials to .env file:');
        console.log('   HUBSPOT_API_KEY_FILMHUB=your-api-key-here');
        console.log('   HUBSPOT_PORTAL_ID_FILMHUB=39560118\n');
        
        console.log('2. Source your environment variables:');
        console.log('   source .env\n');
        
        console.log('3. Switch to Filmhub instance:');
        console.log('   ./scripts/switch-to-filmhub.sh\n');
        
        console.log('4. Test the connection:');
        console.log('   node scripts/test-filmhub-connection.js\n');
        
        console.log('5. Restart Claude Code to apply MCP changes\n');
        
        console.log('📚 Available Commands:');
        console.log('   Switch to Filmhub:  ./scripts/switch-to-filmhub.sh');
        console.log('   Test connection:    node scripts/test-filmhub-connection.js');
        console.log('   View status:        node scripts/hubspot-environment-manager.js status');
        
        console.log('\n⚠️  Important: The MCP server requires API credentials to function.');
        console.log('Without valid credentials, the MCP tools will not be able to connect.\n');
    }

    /**
     * Run full configuration
     */
    async run() {
        try {
            console.log('🚀 Configuring Filmhub HubSpot Instance\n');
            
            this.updatePortalsConfig();
            this.updateMCPConfig();
            this.updateEnvTemplate();
            this.createSwitchScript();
            this.createTestScript();
            this.displayInstructions();
            
        } catch (error) {
            console.error('❌ Configuration failed:', error.message);
            process.exit(1);
        }
    }
}

// Run configurator
if (require.main === module) {
    const configurator = new FilmhubConfigurator();
    configurator.run();
}

module.exports = FilmhubConfigurator;