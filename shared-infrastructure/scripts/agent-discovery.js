#!/usr/bin/env node

/**
 * Agent Discovery Script
 * Discovers and catalogs all agents across HubSpot and Salesforce projects
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Configuration
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const REGISTRY_FILE = path.join(PROJECT_ROOT, 'shared-infrastructure', 'configs', 'agent-registry.json');

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m',
    red: '\x1b[31m'
};

// Helper functions
function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
    console.log(`${colors.green}[✓]${colors.reset} ${message}`);
}

function logWarning(message) {
    console.log(`${colors.yellow}[!]${colors.reset} ${message}`);
}

function logError(message) {
    console.log(`${colors.red}[✗]${colors.reset} ${message}`);
}

// Find all YAML files in a directory
function findYamlFiles(dir) {
    const yamlFiles = [];
    
    try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const item of items) {
            const fullPath = path.join(dir, item.name);
            
            if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
                yamlFiles.push(...findYamlFiles(fullPath));
            } else if (item.isFile() && (item.name.endsWith('.yaml') || item.name.endsWith('.yml'))) {
                yamlFiles.push(fullPath);
            }
        }
    } catch (error) {
        // Directory might not exist
    }
    
    return yamlFiles;
}

// Parse agent YAML file
function parseAgent(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const agent = yaml.load(content);
        
        return {
            name: agent.name || path.basename(filePath, path.extname(filePath)),
            description: agent.description || 'No description provided',
            version: agent.version || '0.0.0',
            stage: agent.stage || 'unknown',
            location: path.relative(PROJECT_ROOT, filePath),
            tools: agent.tools || [],
            capabilities: Object.keys(agent.capabilities || {}),
            platform: detectPlatform(filePath)
        };
    } catch (error) {
        logError(`Failed to parse ${filePath}: ${error.message}`);
        return null;
    }
}

// Detect which platform an agent belongs to
function detectPlatform(filePath) {
    if (filePath.includes('ClaudeHubSpot')) return 'hubspot';
    if (filePath.includes('ClaudeSFDC')) return 'salesforce';
    if (filePath.includes('management')) return 'management';
    return 'general';
}

// Main discovery function
async function discoverAgents() {
    log('\n========================================', 'bright');
    log('Agent Discovery System', 'bright');
    log('========================================\n', 'bright');
    
    // Load existing registry if it exists
    let registry = {
        registry_version: '1.0.0',
        last_updated: new Date().toISOString(),
        discovered_agents: {
            hubspot: {},
            salesforce: {},
            management: {},
            general: {}
        },
        statistics: {
            total_agents: 0,
            by_platform: {},
            by_stage: {},
            by_version: {}
        }
    };
    
    if (fs.existsSync(REGISTRY_FILE)) {
        try {
            const existing = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
            registry = { ...existing, ...registry };
            logSuccess('Loaded existing agent registry');
        } catch (error) {
            logWarning('Could not load existing registry, creating new one');
        }
    }
    
    // Discover agents in each project
    const projects = [
        { name: 'HubSpot', path: path.join(PROJECT_ROOT, 'ClaudeHubSpot', 'agents') },
        { name: 'Salesforce', path: path.join(PROJECT_ROOT, 'ClaudeSFDC', 'agents') },
        { name: 'Management', path: path.join(PROJECT_ROOT, 'agents', 'management') },
        { name: 'Principal', path: path.join(PROJECT_ROOT, 'agents') }
    ];
    
    let totalAgents = 0;
    const agentsByPlatform = {};
    const agentsByStage = {};
    
    for (const project of projects) {
        log(`\nScanning ${project.name} agents...`, 'blue');
        
        const yamlFiles = findYamlFiles(project.path);
        let projectAgents = 0;
        
        for (const file of yamlFiles) {
            const agent = parseAgent(file);
            
            if (agent) {
                const platform = agent.platform;
                
                // Add to registry
                if (!registry.discovered_agents[platform]) {
                    registry.discovered_agents[platform] = {};
                }
                
                registry.discovered_agents[platform][agent.name] = {
                    location: agent.location,
                    version: agent.version,
                    stage: agent.stage,
                    description: agent.description,
                    tools_count: agent.tools.length,
                    capabilities_count: agent.capabilities.length
                };
                
                // Update statistics
                agentsByPlatform[platform] = (agentsByPlatform[platform] || 0) + 1;
                agentsByStage[agent.stage] = (agentsByStage[agent.stage] || 0) + 1;
                
                projectAgents++;
                totalAgents++;
                
                // Log agent info
                const stageColor = agent.stage === 'production' ? 'green' : 
                                   agent.stage === 'staging' ? 'yellow' : 'reset';
                console.log(`  - ${agent.name} (${colors[stageColor]}${agent.stage}${colors.reset}) v${agent.version}`);
            }
        }
        
        if (projectAgents > 0) {
            logSuccess(`Found ${projectAgents} agents in ${project.name}`);
        } else {
            logWarning(`No agents found in ${project.name}`);
        }
    }
    
    // Update statistics
    registry.statistics = {
        total_agents: totalAgents,
        by_platform: agentsByPlatform,
        by_stage: agentsByStage,
        last_scan: new Date().toISOString()
    };
    
    // Save registry
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
    logSuccess(`\nAgent registry saved to ${path.relative(PROJECT_ROOT, REGISTRY_FILE)}`);
    
    // Print summary
    log('\n========================================', 'bright');
    log('Discovery Summary', 'bright');
    log('========================================', 'bright');
    
    console.log(`\nTotal agents discovered: ${colors.green}${totalAgents}${colors.reset}`);
    
    console.log('\nAgents by platform:');
    for (const [platform, count] of Object.entries(agentsByPlatform)) {
        console.log(`  ${platform}: ${count}`);
    }
    
    console.log('\nAgents by stage:');
    for (const [stage, count] of Object.entries(agentsByStage)) {
        const color = stage === 'production' ? 'green' : 
                      stage === 'staging' ? 'yellow' : 'reset';
        console.log(`  ${colors[color]}${stage}${colors.reset}: ${count}`);
    }
    
    // Recommendations
    log('\n========================================', 'bright');
    log('Recommendations', 'bright');
    log('========================================', 'bright');
    
    const devAgents = agentsByStage.development || 0;
    const stagingAgents = agentsByStage.staging || 0;
    
    if (devAgents > 0) {
        logWarning(`\n${devAgents} agents are in development stage - consider promoting when ready`);
    }
    
    if (stagingAgents > 0) {
        logWarning(`${stagingAgents} agents are in staging - test thoroughly before production`);
    }
    
    // Check for duplicates
    const allAgents = [];
    for (const platform of Object.values(registry.discovered_agents)) {
        allAgents.push(...Object.keys(platform));
    }
    
    const duplicates = allAgents.filter((item, index) => allAgents.indexOf(item) !== index);
    if (duplicates.length > 0) {
        logWarning(`\nDuplicate agent names found: ${duplicates.join(', ')}`);
        logWarning('Consider renaming to avoid conflicts');
    }
    
    logSuccess('\nAgent discovery complete!');
    
    return registry;
}

// Check if required dependencies are installed
function checkDependencies() {
    try {
        require.resolve('js-yaml');
        return true;
    } catch (e) {
        log('Installing required dependencies...', 'yellow');
        try {
            require('child_process').execSync('npm install js-yaml', { 
                stdio: 'inherit',
                cwd: path.join(__dirname, '..')
            });
            return true;
        } catch (installError) {
            logError('Failed to install dependencies. Please run: npm install js-yaml');
            return false;
        }
    }
}

// Main execution
if (require.main === module) {
    if (checkDependencies()) {
        discoverAgents().catch(error => {
            logError(`Discovery failed: ${error.message}`);
            process.exit(1);
        });
    } else {
        process.exit(1);
    }
}

module.exports = { discoverAgents, parseAgent, findYamlFiles };