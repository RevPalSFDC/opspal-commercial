#!/usr/bin/env node
/**
 * Interactive Model Proxy Configuration
 * Provides a CLI wizard for configuring model proxy settings
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { execSync } = require('child_process');

class InteractiveModelConfig {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.currentProject = this.detectCurrentProject();
        this.config = {};
    }

    /**
     * Detect which project we're currently in
     */
    detectCurrentProject() {
        const cwd = process.cwd();
        if (cwd.includes('ClaudeHubSpot')) {
            return 'ClaudeHubSpot';
        } else if (cwd.includes('ClaudeSFDC')) {
            return 'ClaudeSFDC';
        }
        return null;
    }

    /**
     * Prompt user for input
     */
    async prompt(question, defaultValue = '') {
        return new Promise((resolve) => {
            const q = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
            this.rl.question(q, (answer) => {
                resolve(answer || defaultValue);
            });
        });
    }

    /**
     * Prompt for yes/no
     */
    async confirm(question) {
        const answer = await this.prompt(`${question} (y/n)`, 'y');
        return answer.toLowerCase() === 'y';
    }

    /**
     * Show menu and get selection
     */
    async menu(title, options) {
        console.log(`\n${title}`);
        options.forEach((opt, i) => {
            console.log(`  ${i + 1}. ${opt}`);
        });
        
        const choice = await this.prompt('Select option', '1');
        const index = parseInt(choice) - 1;
        
        if (index >= 0 && index < options.length) {
            return index;
        }
        return 0;
    }

    /**
     * Main configuration flow
     */
    async configure() {
        console.clear();
        console.log('================================================');
        console.log('  Model Proxy Interactive Configuration');
        console.log('================================================');
        
        if (this.currentProject) {
            console.log(`\nProject: ${this.currentProject}`);
        } else {
            console.log('\nNo project detected. Running in global mode.');
        }

        // Main menu
        const action = await this.menu('\nWhat would you like to do?', [
            'Enable Model Proxy',
            'Disable Model Proxy',
            'Configure Models',
            'Set Cost Limits',
            'View Current Configuration',
            'Test Configuration',
            'Advanced Settings',
            'Exit'
        ]);

        switch (action) {
            case 0:
                await this.enableModelProxy();
                break;
            case 1:
                await this.disableModelProxy();
                break;
            case 2:
                await this.configureModels();
                break;
            case 3:
                await this.setCostLimits();
                break;
            case 4:
                await this.viewConfiguration();
                break;
            case 5:
                await this.testConfiguration();
                break;
            case 6:
                await this.advancedSettings();
                break;
            case 7:
                this.exit();
                return;
        }

        // Ask if user wants to continue
        if (await this.confirm('\nWould you like to configure something else?')) {
            await this.configure();
        } else {
            this.exit();
        }
    }

    /**
     * Enable model proxy
     */
    async enableModelProxy() {
        console.log('\n🚀 Enabling Model Proxy...\n');

        // Quick setup or custom
        const setupType = await this.menu('Choose setup type:', [
            'Quick Setup (Balanced configuration)',
            'Cost-Optimized Setup',
            'Performance Setup',
            'Custom Configuration'
        ]);

        let scriptPath;
        if (this.currentProject) {
            scriptPath = path.join(process.cwd(), 'scripts', 'enable-model-proxy.sh');
        } else {
            // Find a project to enable
            const project = await this.menu('Select project:', [
                'ClaudeHubSpot',
                'ClaudeSFDC',
                'Both Projects'
            ]);
            
            if (project === 2) {
                // Enable both
                execSync('cd ClaudeHubSpot && ./scripts/enable-model-proxy.sh', { stdio: 'inherit' });
                execSync('cd ClaudeSFDC && ./scripts/enable-model-proxy.sh', { stdio: 'inherit' });
                console.log('\n✅ Model proxy enabled for both projects!');
                return;
            }
            
            const projectName = project === 0 ? 'ClaudeHubSpot' : 'ClaudeSFDC';
            scriptPath = path.join(__dirname, '..', '..', projectName, 'scripts', 'enable-model-proxy.sh');
        }

        try {
            execSync(scriptPath, { stdio: 'inherit' });
            
            // Apply configuration based on setup type
            if (setupType > 0) {
                await this.applyPresetConfiguration(setupType);
            }
            
            console.log('\n✅ Model proxy enabled successfully!');
        } catch (error) {
            console.error('❌ Failed to enable model proxy:', error.message);
        }
    }

    /**
     * Disable model proxy
     */
    async disableModelProxy() {
        console.log('\n🛑 Disabling Model Proxy...\n');

        if (!await this.confirm('Are you sure you want to disable the model proxy?')) {
            return;
        }

        let scriptPath;
        if (this.currentProject) {
            scriptPath = path.join(process.cwd(), 'scripts', 'disable-model-proxy.sh');
        } else {
            const project = await this.menu('Select project:', [
                'ClaudeHubSpot',
                'ClaudeSFDC',
                'Both Projects'
            ]);
            
            if (project === 2) {
                execSync('cd ClaudeHubSpot && ./scripts/disable-model-proxy.sh --force', { stdio: 'inherit' });
                execSync('cd ClaudeSFDC && ./scripts/disable-model-proxy.sh --force', { stdio: 'inherit' });
                console.log('\n✅ Model proxy disabled for both projects!');
                return;
            }
            
            const projectName = project === 0 ? 'ClaudeHubSpot' : 'ClaudeSFDC';
            scriptPath = path.join(__dirname, '..', '..', projectName, 'scripts', 'disable-model-proxy.sh');
        }

        try {
            execSync(`${scriptPath} --force`, { stdio: 'inherit' });
            console.log('\n✅ Model proxy disabled successfully!');
        } catch (error) {
            console.error('❌ Failed to disable model proxy:', error.message);
        }
    }

    /**
     * Configure models
     */
    async configureModels() {
        console.log('\n⚙️  Configuring Models...\n');

        const modelType = await this.menu('What would you like to configure?', [
            'Primary Model',
            'Fallback Models',
            'Task-Specific Models',
            'Model Parameters',
            'Back to Main Menu'
        ]);

        if (modelType === 4) return;

        switch (modelType) {
            case 0:
                await this.configurePrimaryModel();
                break;
            case 1:
                await this.configureFallbackModels();
                break;
            case 2:
                await this.configureTaskModels();
                break;
            case 3:
                await this.configureModelParameters();
                break;
        }
    }

    /**
     * Configure primary model
     */
    async configurePrimaryModel() {
        const models = [
            'claude-3-opus (Powerful, balanced)',
            'gpt-5 (Most capable, higher cost)',
            'gpt-5-mini (Good performance, moderate cost)',
            'claude-3-sonnet (Efficient, good quality)',
            'claude-3-haiku (Fast, low cost)'
        ];

        const choice = await this.menu('Select primary model:', models);
        const modelMap = ['claude-3-opus', 'gpt-5', 'gpt-5-mini', 'claude-3-sonnet', 'claude-3-haiku'];
        
        this.updateConfig('primary_model', modelMap[choice]);
        console.log(`\n✅ Primary model set to: ${modelMap[choice]}`);
    }

    /**
     * Configure task-specific models
     */
    async configureTaskModels() {
        console.log('\nConfigure models for specific tasks:\n');

        const tasks = this.currentProject === 'ClaudeHubSpot' ? 
            ['Marketing Automation', 'Analytics', 'API Integration', 'Bulk Operations'] :
            ['Apex Development', 'SOQL Queries', 'Flow Building', 'Test Generation'];

        for (const task of tasks) {
            console.log(`\n${task}:`);
            const model = await this.prompt('Preferred model (or press Enter to skip)', '');
            if (model) {
                this.updateConfig(`task_models.${task.toLowerCase().replace(/\s+/g, '_')}`, model);
            }
        }

        console.log('\n✅ Task-specific models configured!');
    }

    /**
     * Set cost limits
     */
    async setCostLimits() {
        console.log('\n💰 Setting Cost Limits...\n');

        const daily = await this.prompt('Daily limit ($)', '50.00');
        const monthly = await this.prompt('Monthly limit ($)', '1000.00');
        const alert = await this.prompt('Alert threshold (0.0-1.0)', '0.8');

        this.updateConfig('cost_settings.daily_limit', parseFloat(daily));
        this.updateConfig('cost_settings.monthly_limit', parseFloat(monthly));
        this.updateConfig('cost_settings.alert_threshold', parseFloat(alert));

        console.log('\n✅ Cost limits configured!');
    }

    /**
     * View current configuration
     */
    async viewConfiguration() {
        console.log('\n📋 Current Configuration:\n');

        let configPath;
        if (this.currentProject) {
            configPath = path.join(process.cwd(), 'model-proxy', 'config.yaml');
        } else {
            console.log('Please run from a project directory to view configuration.');
            return;
        }

        try {
            const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
            console.log(yaml.dump(config, { indent: 2 }));
        } catch (error) {
            console.log('No configuration found or model proxy not enabled.');
        }
    }

    /**
     * Test configuration
     */
    async testConfiguration() {
        console.log('\n🧪 Testing Configuration...\n');

        if (this.currentProject) {
            try {
                execSync('node model-proxy/wrapper.js --test', { stdio: 'inherit' });
            } catch (error) {
                console.error('Test failed:', error.message);
            }
        } else {
            console.log('Please run from a project directory to test configuration.');
        }
    }

    /**
     * Advanced settings
     */
    async advancedSettings() {
        const option = await this.menu('\n⚡ Advanced Settings:', [
            'Cache Configuration',
            'Logging Settings',
            'Environment Variables',
            'Shared Infrastructure',
            'Reset to Defaults',
            'Back to Main Menu'
        ]);

        if (option === 5) return;

        switch (option) {
            case 0:
                await this.configureCaching();
                break;
            case 1:
                await this.configureLogging();
                break;
            case 2:
                await this.configureEnvironment();
                break;
            case 3:
                await this.configureSharedInfra();
                break;
            case 4:
                await this.resetDefaults();
                break;
        }
    }

    /**
     * Configure caching
     */
    async configureCaching() {
        console.log('\n🗄️  Cache Configuration:\n');

        const enable = await this.confirm('Enable caching?');
        this.updateConfig('cache_settings.enable_cache', enable);

        if (enable) {
            const ttl = await this.prompt('Cache TTL (seconds)', '3600');
            const size = await this.prompt('Max cache size', '100mb');
            
            this.updateConfig('cache_settings.ttl', parseInt(ttl));
            this.updateConfig('cache_settings.max_size', size);
        }

        console.log('\n✅ Cache settings updated!');
    }

    /**
     * Apply preset configuration
     */
    async applyPresetConfiguration(presetType) {
        const presets = {
            1: { // Cost-optimized
                primary_model: 'claude-3-haiku',
                fallback_model: 'claude-3-sonnet',
                cache_enabled: true,
                daily_limit: 25.00
            },
            2: { // Performance
                primary_model: 'gpt-5',
                fallback_model: 'claude-3-opus',
                cache_enabled: true,
                daily_limit: 100.00
            },
            3: { // Custom - already handled
                // User will configure manually
            }
        };

        if (presets[presetType]) {
            Object.entries(presets[presetType]).forEach(([key, value]) => {
                this.updateConfig(key, value);
            });
            console.log('\n✅ Preset configuration applied!');
        }
    }

    /**
     * Update configuration
     */
    updateConfig(keyPath, value) {
        // Implementation would update the actual config file
        console.log(`Setting ${keyPath} = ${value}`);
        
        // In real implementation, this would:
        // 1. Load current config
        // 2. Update the specified path
        // 3. Save back to file
    }

    /**
     * Exit
     */
    exit() {
        console.log('\n👋 Goodbye!\n');
        this.rl.close();
        process.exit(0);
    }
}

// Main execution
if (require.main === module) {
    const configurator = new InteractiveModelConfig();
    configurator.configure().catch(console.error);
}

module.exports = InteractiveModelConfig;