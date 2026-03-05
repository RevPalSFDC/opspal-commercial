#!/usr/bin/env node

/**
 * Add Portal Configuration
 *
 * Adds a new HubSpot portal to the portals/config.json file
 *
 * Usage:
 *   node scripts/lib/add-portal-config.js --name <name> --portal-id <id> --api-key <key>
 *   node scripts/lib/add-portal-config.js --interactive
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

class PortalConfigManager {
    constructor() {
        this.portalsDir = path.join(__dirname, '../../portals');
        this.configPath = path.join(this.portalsDir, 'config.json');
        this.config = this.loadConfig();
    }

    loadConfig() {
        if (fs.existsSync(this.configPath)) {
            return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        }

        // Create default config
        return {
            portals: {},
            syncConfigurations: {}
        };
    }

    saveConfig() {
        if (!fs.existsSync(this.portalsDir)) {
            fs.mkdirSync(this.portalsDir, { recursive: true });
        }

        fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
        console.log(`\n✅ Configuration saved to: ${this.configPath}`);
    }

    addPortal(name, portalId, apiKey, options = {}) {
        if (this.config.portals[name]) {
            throw new Error(`Portal '${name}' already exists. Use --force to overwrite.`);
        }

        this.config.portals[name] = {
            portalId,
            apiKey,
            region: options.region || 'na1',
            environment: options.environment || 'production',
            description: options.description || '',
            createdAt: new Date().toISOString()
        };

        console.log(`\n✅ Added portal: ${name}`);
        console.log(`   Portal ID: ${portalId}`);
        console.log(`   Region: ${this.config.portals[name].region}`);
        console.log(`   Environment: ${this.config.portals[name].environment}`);

        return this.config.portals[name];
    }

    createPortalDirectory(name) {
        const portalDir = path.join(this.portalsDir, name);

        if (!fs.existsSync(portalDir)) {
            fs.mkdirSync(portalDir, { recursive: true });
            fs.mkdirSync(path.join(portalDir, 'projects'), { recursive: true });
            fs.mkdirSync(path.join(portalDir, 'reports'), { recursive: true });
            fs.mkdirSync(path.join(portalDir, 'docs'), { recursive: true });

            // Create README
            const readme = `# ${name} Portal\n\n` +
                `Portal ID: ${this.config.portals[name].portalId}\n` +
                `Environment: ${this.config.portals[name].environment}\n` +
                `Created: ${new Date().toISOString()}\n\n` +
                `## Directory Structure\n\n` +
                `- \`projects/\` - Assessment and project folders\n` +
                `- \`reports/\` - Portal-level reports and analysis\n` +
                `- \`docs/\` - Portal-specific documentation\n\n` +
                `## Quick Commands\n\n` +
                `\`\`\`bash\n` +
                `# Switch to this portal\n` +
                `/hs ${name}\n\n` +
                `# Run portal discovery\n` +
                `node scripts/lib/portal-quirks-detector.js generate-docs ${name}\n\n` +
                `# Create new project\n` +
                `node scripts/lib/create-project.js --portal ${name} --name <project-name> --type assessment\n` +
                `\`\`\`\n`;

            fs.writeFileSync(path.join(portalDir, 'README.md'), readme);

            console.log(`\n✅ Created portal directory: ${portalDir}`);
        } else {
            console.log(`\n⚠️  Portal directory already exists: ${portalDir}`);
        }
    }

    async promptInteractive() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const question = (prompt) => new Promise((resolve) => {
            rl.question(prompt, resolve);
        });

        console.log('\n🚀 Interactive Portal Setup\n');
        console.log('Please provide the following information:\n');

        const name = await question('Portal name (e.g., production, sandbox): ');
        const portalId = await question('Portal ID (Hub ID from HubSpot settings): ');
        const apiKey = await question('API Key (Private App access token): ');
        const region = await question('Region (default: na1): ') || 'na1';
        const environment = await question('Environment (production/sandbox/staging): ') || 'production';
        const description = await question('Description (optional): ');

        rl.close();

        return {
            name: name.trim(),
            portalId: portalId.trim(),
            apiKey: apiKey.trim(),
            options: {
                region: region.trim(),
                environment: environment.trim(),
                description: description.trim()
            }
        };
    }

    listPortals() {
        console.log('\n📋 Configured Portals:\n');

        if (Object.keys(this.config.portals).length === 0) {
            console.log('No portals configured yet.');
            return;
        }

        Object.entries(this.config.portals).forEach(([name, portal]) => {
            console.log(`  ${name}`);
            console.log(`    Portal ID: ${portal.portalId}`);
            console.log(`    Environment: ${portal.environment}`);
            console.log(`    Region: ${portal.region}`);
            if (portal.description) {
                console.log(`    Description: ${portal.description}`);
            }
            console.log('');
        });
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const manager = new PortalConfigManager();

    // Parse arguments
    const flags = {};
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i].replace(/^--/, '');
        flags[key] = args[i + 1];
    }

    try {
        if (args.includes('--interactive') || args.length === 0) {
            const data = await manager.promptInteractive();
            manager.addPortal(data.name, data.portalId, data.apiKey, data.options);
            manager.createPortalDirectory(data.name);
            manager.saveConfig();

            console.log('\n🎉 Portal setup complete!');
            console.log('\nNext steps:');
            console.log(`  1. Switch to portal: /hs ${data.name}`);
            console.log(`  2. Run discovery: node scripts/lib/portal-quirks-detector.js generate-docs ${data.name}`);
            console.log(`  3. Create project: node scripts/lib/create-project.js --portal ${data.name} --name <name> --type assessment`);

        } else if (args.includes('--list')) {
            manager.listPortals();

        } else if (flags.name && flags['portal-id'] && flags['api-key']) {
            const options = {
                region: flags.region,
                environment: flags.environment,
                description: flags.description
            };

            manager.addPortal(flags.name, flags['portal-id'], flags['api-key'], options);
            manager.createPortalDirectory(flags.name);
            manager.saveConfig();

            console.log('\n🎉 Portal added successfully!');

        } else {
            console.log('Usage:');
            console.log('  node add-portal-config.js --interactive');
            console.log('  node add-portal-config.js --name <name> --portal-id <id> --api-key <key> [options]');
            console.log('  node add-portal-config.js --list');
            console.log('\nOptions:');
            console.log('  --region <region>           Region (default: na1)');
            console.log('  --environment <env>         Environment (production/sandbox/staging)');
            console.log('  --description <desc>        Optional description');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { PortalConfigManager };
