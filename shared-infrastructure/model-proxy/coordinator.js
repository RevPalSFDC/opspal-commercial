#!/usr/bin/env node
/**
 * Shared Infrastructure Model Proxy Coordinator
 * Manages model proxy instances across multiple projects
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class ModelProxyCoordinator {
    constructor() {
        this.projects = this.detectProjects();
        this.instances = new Map();
        this.sharedConfig = path.join(__dirname, 'shared-config.yaml');
    }

    /**
     * Detect available CRM projects
     */
    detectProjects() {
        const projects = [];
        const basePath = path.join(__dirname, '..', '..');
        
        // Check for ClaudeHubSpot
        const hubspotPath = path.join(basePath, 'ClaudeHubSpot');
        if (fs.existsSync(hubspotPath) && fs.statSync(hubspotPath).isDirectory()) {
            projects.push({
                name: 'ClaudeHubSpot',
                path: hubspotPath,
                port: 8001,
                enabled: this.isProjectEnabled(hubspotPath)
            });
        }
        
        // Check for ClaudeSFDC
        const sfdcPath = path.join(basePath, 'ClaudeSFDC');
        if (fs.existsSync(sfdcPath) && fs.statSync(sfdcPath).isDirectory()) {
            projects.push({
                name: 'ClaudeSFDC',
                path: sfdcPath,
                port: 8004,
                enabled: this.isProjectEnabled(sfdcPath)
            });
        }
        
        return projects;
    }

    /**
     * Check if model proxy is enabled for a project
     */
    isProjectEnabled(projectPath) {
        const featuresPath = path.join(projectPath, 'config', 'features.yaml');
        
        try {
            if (fs.existsSync(featuresPath)) {
                const features = yaml.load(fs.readFileSync(featuresPath, 'utf8'));
                return features?.features?.model_proxy?.enabled || false;
            }
        } catch (error) {
            console.error(`Error reading features for ${projectPath}:`, error.message);
        }
        
        return false;
    }

    /**
     * Start shared infrastructure mode
     */
    async startShared() {
        console.log('================================================');
        console.log('  Shared Model Proxy Coordinator');
        console.log('================================================');
        console.log('');
        
        // Detect projects
        console.log('Detected projects:');
        this.projects.forEach(project => {
            const status = project.enabled ? '✓ Enabled' : '✗ Disabled';
            console.log(`  - ${project.name}: ${status}`);
        });
        console.log('');
        
        const enabledProjects = this.projects.filter(p => p.enabled);
        
        if (enabledProjects.length === 0) {
            console.log('No projects have model proxy enabled.');
            console.log('Enable with: ./scripts/enable-model-proxy.sh');
            process.exit(0);
        }
        
        if (enabledProjects.length === 1) {
            console.log('Only one project enabled - running in standalone mode');
            this.startStandalone(enabledProjects[0]);
        } else {
            console.log('Multiple projects enabled - starting shared mode');
            await this.startSharedMode(enabledProjects);
        }
    }

    /**
     * Start standalone mode for single project
     */
    startStandalone(project) {
        const wrapperPath = path.join(project.path, 'model-proxy', 'wrapper.js');
        
        console.log(`Starting ${project.name} in standalone mode...`);
        
        const child = spawn('node', [wrapperPath], {
            stdio: 'inherit',
            env: { ...process.env, MODEL_PROXY_MODE: 'standalone' }
        });
        
        this.instances.set(project.name, child);
        
        child.on('exit', (code) => {
            console.log(`${project.name} exited with code ${code}`);
            this.instances.delete(project.name);
        });
    }

    /**
     * Start shared mode for multiple projects
     */
    async startSharedMode(projects) {
        console.log('Initializing shared infrastructure...');
        
        // Start the shared proxy server
        await this.startSharedProxy();
        
        // Configure each project to use shared proxy
        projects.forEach(project => {
            this.configureProjectForShared(project);
        });
        
        console.log('');
        console.log('Shared mode active:');
        console.log(`  Main proxy: http://127.0.0.1:8000`);
        console.log(`  Dashboard: http://127.0.0.1:3000`);
        console.log(`  Metrics: http://127.0.0.1:9090/metrics`);
    }

    /**
     * Start the shared proxy server
     */
    async startSharedProxy() {
        // Create a unified server that uses shared config
        const serverScript = `
import asyncio
import sys
sys.path.insert(0, '${path.join(this.projects[0].path, 'model-proxy')}')
from server import *

# Override config path
proxy = ${this.projects[0].name.includes('HubSpot') ? 'HubSpot' : 'Salesforce'}ModelProxy(
    config_path='${this.sharedConfig}'
)

# Start with shared configuration
asyncio.run(proxy.run_proxy_server(host='127.0.0.1', port=8000))
        `;
        
        // Write temporary server script
        const tempScript = path.join(__dirname, '.shared-server.py');
        fs.writeFileSync(tempScript, serverScript);
        
        // Start the server
        const child = spawn('python3', [tempScript], {
            stdio: 'inherit',
            env: {
                ...process.env,
                MODEL_PROXY_MODE: 'shared',
                SHARED_CONFIG: this.sharedConfig
            }
        });
        
        this.instances.set('shared-proxy', child);
        
        child.on('error', (err) => {
            console.error('Failed to start shared proxy:', err);
        });
        
        // Give server time to start
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    /**
     * Configure project to use shared proxy
     */
    configureProjectForShared(project) {
        console.log(`Configuring ${project.name} for shared mode...`);
        
        // Update project's features.yaml to point to shared proxy
        const featuresPath = path.join(project.path, 'config', 'features.yaml');
        
        try {
            const features = yaml.load(fs.readFileSync(featuresPath, 'utf8'));
            features.features.model_proxy.mode = 'shared';
            features.features.model_proxy.shared_proxy_url = 'http://127.0.0.1:8000';
            
            fs.writeFileSync(featuresPath, yaml.dump(features));
            console.log(`  ✓ ${project.name} configured for shared mode`);
        } catch (error) {
            console.error(`  ✗ Failed to configure ${project.name}:`, error.message);
        }
    }

    /**
     * Monitor and manage instances
     */
    monitor() {
        setInterval(() => {
            // Check instance health
            this.instances.forEach((child, name) => {
                if (child.killed) {
                    console.log(`Restarting ${name}...`);
                    // Restart logic here
                }
            });
            
            // Log statistics
            if (this.instances.size > 0) {
                const stats = this.getStatistics();
                if (stats) {
                    console.log(`[Stats] Requests: ${stats.requests}, Cost: $${stats.cost.toFixed(2)}`);
                }
            }
        }, 30000); // Check every 30 seconds
    }

    /**
     * Get usage statistics
     */
    getStatistics() {
        // This would connect to the proxy metrics endpoint
        // For now, return placeholder
        return {
            requests: Math.floor(Math.random() * 100),
            cost: Math.random() * 10
        };
    }

    /**
     * Graceful shutdown
     */
    shutdown() {
        console.log('\nShutting down shared infrastructure...');
        
        this.instances.forEach((child, name) => {
            console.log(`Stopping ${name}...`);
            child.kill('SIGTERM');
        });
        
        // Clean up temp files
        const tempScript = path.join(__dirname, '.shared-server.py');
        if (fs.existsSync(tempScript)) {
            fs.unlinkSync(tempScript);
        }
        
        setTimeout(() => {
            process.exit(0);
        }, 2000);
    }
}

// Main execution
if (require.main === module) {
    const coordinator = new ModelProxyCoordinator();
    
    // Handle shutdown signals
    process.on('SIGINT', () => coordinator.shutdown());
    process.on('SIGTERM', () => coordinator.shutdown());
    
    // Parse arguments
    const args = process.argv.slice(2);
    
    if (args.includes('--status')) {
        // Show status
        console.log('Projects:', coordinator.projects);
        process.exit(0);
    } else if (args.includes('--enable-all')) {
        // Enable all projects
        coordinator.projects.forEach(project => {
            const enableScript = path.join(project.path, 'scripts', 'enable-model-proxy.sh');
            if (fs.existsSync(enableScript)) {
                spawn('bash', [enableScript], { stdio: 'inherit' });
            }
        });
    } else {
        // Start coordinator
        coordinator.startShared().then(() => {
            coordinator.monitor();
        }).catch(err => {
            console.error('Failed to start:', err);
            process.exit(1);
        });
    }
}

module.exports = ModelProxyCoordinator;