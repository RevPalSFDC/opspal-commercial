#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Plugin Scaffolding Script
 *
 * Automates the creation of new plugins with proper structure, manifests,
 * and boilerplate code following marketplace standards.
 *
 * Usage:
 *   node scaffold-plugin.js --name my-plugin --description "My plugin" --domain salesforce
 *   node scaffold-plugin.js --interactive
 */

class PluginScaffolder {
  constructor(options = {}) {
    this.options = options;
    this.marketplaceRoot = path.join(__dirname, '../../..');
    this.pluginsDir = path.join(this.marketplaceRoot, '.claude-plugins');
    this.marketplaceJsonPath = path.join(this.marketplaceRoot, '.claude-plugin/marketplace.json');

    // Validation patterns
    this.VALID_NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*-plugin$/;

    // Domain templates
    this.domainTemplates = {
      salesforce: this.getSalesforceTemplate(),
      hubspot: this.getHubSpotTemplate(),
      gtm: this.getGTMTemplate(),
      'cross-platform': this.getCrossPlatformTemplate(),
      'dev-tools': this.getDevToolsTemplate(),
      custom: this.getCustomTemplate()
    };
  }

  /**
   * Main scaffolding workflow
   */
  async scaffold() {
    try {
      console.log('\n🏗️  Plugin Scaffolding Wizard\n');

      // Gather requirements
      const config = this.options.interactive
        ? await this.interactiveWizard()
        : this.validateOptions(this.options);

      // Validate plugin name
      this.validatePluginName(config.name);

      // Check for conflicts
      this.checkNameConflict(config.name);

      // Get domain template
      const template = this.domainTemplates[config.domain] || this.domainTemplates.custom;

      // Create plugin structure
      console.log(`\n📁 Creating plugin structure...`);
      const pluginDir = await this.createPluginStructure(config, template);

      // Generate plugin.json
      console.log(`📝 Generating plugin.json...`);
      await this.generatePluginManifest(pluginDir, config, template);

      // Generate README.md
      console.log(`📄 Generating README.md...`);
      await this.generateReadme(pluginDir, config, template);

      // Create placeholder agents
      if (config.agents > 0) {
        console.log(`🤖 Creating ${config.agents} placeholder agents...`);
        await this.createPlaceholderAgents(pluginDir, config);
      }

      // Create .gitignore
      console.log(`🚫 Creating .gitignore...`);
      await this.createGitignore(pluginDir);

      // Create post-install hook
      console.log(`🪝 Creating post-install hook...`);
      await this.createPostInstallHook(pluginDir, config);

      // Initialize git (if not already initialized)
      if (!fs.existsSync(path.join(pluginDir, '.git'))) {
        console.log(`🔧 Initializing git repository...`);
        this.initializeGit(pluginDir, config);
      }

      // Add to marketplace.json
      console.log(`📦 Adding to marketplace.json...`);
      await this.addToMarketplace(config);

      console.log(`\n✅ Plugin scaffolded successfully!\n`);
      console.log(`📍 Location: ${pluginDir}`);
      console.log(`\n📋 Next steps:`);
      console.log(`   1. Review README.md for plugin overview`);
      console.log(`   2. Customize placeholder agents in agents/`);
      console.log(`   3. Add scripts to scripts/lib/`);
      console.log(`   4. Test installation: /plugin install ${config.name}@revpal-internal-plugins`);
      console.log(`   5. Run validation: node scripts/validate-plugin.js ${pluginDir}\n`);

      return { success: true, pluginDir };
    } catch (error) {
      console.error(`\n❌ Scaffolding failed: ${error.message}\n`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Interactive wizard for gathering requirements
   */
  async interactiveWizard() {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (query) => new Promise((resolve) => readline.question(query, resolve));

    try {
      const name = await question('Plugin name (e.g., my-awesome-plugin): ');
      const description = await question('Description (1-2 sentences): ');
      const domain = await question('Domain (salesforce/hubspot/gtm/cross-platform/dev-tools/custom): ');
      const agents = parseInt(await question('Number of initial agents (0-10): ') || '0');
      const includeCommands = (await question('Include slash commands? (y/n): ')).toLowerCase() === 'y';
      const includeHooks = (await question('Include hooks? (y/n): ')).toLowerCase() === 'y';
      const version = await question('Initial version (default: 1.0.0): ') || '1.0.0';

      readline.close();

      return {
        name,
        description,
        domain: domain || 'custom',
        agents,
        includeCommands,
        includeHooks,
        version
      };
    } catch (error) {
      readline.close();
      throw error;
    }
  }

  /**
   * Validate command-line options
   */
  validateOptions(options) {
    if (!options.name) {
      throw new Error('Plugin name is required (--name)');
    }
    if (!options.description) {
      throw new Error('Plugin description is required (--description)');
    }

    return {
      name: options.name,
      description: options.description,
      domain: options.domain || 'custom',
      agents: parseInt(options.agents || '0'),
      includeCommands: options.commands || false,
      includeHooks: options.hooks || false,
      version: options.version || '1.0.0'
    };
  }

  /**
   * Validate plugin name format
   */
  validatePluginName(name) {
    if (!this.VALID_NAME_PATTERN.test(name)) {
      throw new Error(`Invalid plugin name: ${name}

Requirements:
  - Must end with '-plugin'
  - Lowercase letters and numbers only
  - Hyphens to separate words
  - No consecutive hyphens

Examples:
  ✅ salesforce-plugin
  ✅ hubspot-core-plugin
  ✅ gtm-planning-plugin
  ❌ SalesforcePlugin (use lowercase)
  ❌ salesforce_plugin (use hyphens)
  ❌ salesforce (must end with -plugin)`);
    }
  }

  /**
   * Check for naming conflicts
   */
  checkNameConflict(pluginName) {
    if (!fs.existsSync(this.marketplaceJsonPath)) {
      return;
    }

    const marketplace = JSON.parse(fs.readFileSync(this.marketplaceJsonPath, 'utf8'));
    const existingPlugins = marketplace.plugins.map(p => p.name);

    if (existingPlugins.includes(pluginName)) {
      throw new Error(`Plugin '${pluginName}' already exists in marketplace!

Existing plugins:
${existingPlugins.map(name => `  - ${name}`).join('\n')}

Choose a different name.`);
    }

    // Check directory exists
    const pluginDir = path.join(this.pluginsDir, pluginName);
    if (fs.existsSync(pluginDir)) {
      throw new Error(`Directory already exists: ${pluginDir}\n\nChoose a different name or remove the existing directory.`);
    }
  }

  /**
   * Create plugin directory structure
   */
  async createPluginStructure(config, template) {
    const pluginDir = path.join(this.pluginsDir, config.name);

    // Create main directories
    const directories = [
      pluginDir,
      path.join(pluginDir, '.claude-plugin'),
      path.join(pluginDir, '.claude-plugin/hooks'),
      path.join(pluginDir, 'agents'),
      path.join(pluginDir, 'scripts/lib'),
      path.join(pluginDir, 'tests/agents'),
      path.join(pluginDir, 'tests/scripts'),
      path.join(pluginDir, 'tests/integration')
    ];

    if (config.includeCommands) {
      directories.push(path.join(pluginDir, 'commands'));
    }

    if (config.includeHooks) {
      directories.push(path.join(pluginDir, 'hooks'));
    }

    // Create all directories
    directories.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // Create .gitkeep files in empty directories
    const emptyDirs = [
      'scripts/lib',
      'tests/agents',
      'tests/scripts',
      'tests/integration'
    ];

    if (config.includeCommands && config.agents === 0) {
      emptyDirs.push('commands');
    }
    if (config.includeHooks) {
      emptyDirs.push('hooks');
    }

    emptyDirs.forEach(dir => {
      const gitkeepPath = path.join(pluginDir, dir, '.gitkeep');
      if (!fs.existsSync(gitkeepPath)) {
        fs.writeFileSync(gitkeepPath, '# Placeholder for git\n');
      }
    });

    return pluginDir;
  }

  /**
   * Generate plugin.json manifest
   */
  async generatePluginManifest(pluginDir, config, template) {
    const manifest = {
      name: config.name,
      description: config.description,
      version: config.version,
      author: {
        name: "RevPal Engineering",
        email: "engineering@gorevpal.com"
      },
      keywords: template.keywords || [config.domain, ...config.name.split('-').filter(w => w !== 'plugin')],
      repository: "https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace",

      dependencies: template.dependencies || {
        plugins: [],
        cli: {
          node: {
            version: ">=18.0.0",
            check: "node --version",
            install: "https://nodejs.org/",
            required: true,
            description: "Node.js runtime"
          }
        },
        system: {},
        mcp: {},
        npm: {}
      },

      hooks: {
        "post-install": "./.claude-plugin/hooks/post-install.sh"
      }
    };

    const manifestPath = path.join(pluginDir, '.claude-plugin/plugin.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }

  /**
   * Generate README.md
   */
  async generateReadme(pluginDir, config, template) {
    const readme = `# ${this.toTitleCase(config.name.replace(/-/g, ' '))}

${config.description}

**Version**: ${config.version}
**Status**: Development
**Domain**: ${config.domain}

## Overview

${config.description}

${template.overview || 'This plugin provides specialized capabilities for ' + config.domain + ' operations.'}

## Installation

\`\`\`bash
/plugin install ${config.name}@revpal-internal-plugins
\`\`\`

## Dependencies

### Required

${this.formatDependencies(template.dependencies, 'required')}

### Optional

${this.formatDependencies(template.dependencies, 'optional')}

## Agents

${config.agents > 0 ? `This plugin includes ${config.agents} specialized agents. See agents/ directory for details.` : 'No agents have been created yet. Add agents to the agents/ directory.'}

${template.agentExamples || ''}

## Usage

\`\`\`
User: "<task description>"
Expected: <agent-name> auto-invoked
\`\`\`

${template.usageExamples || ''}

## Configuration

${template.configuration || 'No special configuration required. All agents are auto-discovered after installation.'}

## Development

### Adding New Agents

1. Create agent file in \`agents/<agent-name>.md\`
2. Follow YAML frontmatter format
3. Test with \`/agents\` command
4. Update this README

### Testing

\`\`\`bash
# Run plugin validation
node ../../scripts/validate-plugin.js .

# Run tests (if any)
npm test
\`\`\`

## Troubleshooting

### Common Issues

1. **Agents not discovered**
   - Verify plugin is installed: \`/plugin list\`
   - Check agent file format (YAML frontmatter)
   - Ensure agent names follow conventions

2. **Dependency errors**
   - Run: \`/check-deps\`
   - Install missing dependencies
   - Verify versions match requirements

## Version History

### v${config.version} (Initial Release)
- Initial plugin scaffolding
- ${config.agents} placeholder agents created
${config.includeCommands ? '- Command structure initialized' : ''}
${config.includeHooks ? '- Hook structure initialized' : ''}

## Contributing

Internal use only - RevPal Engineering

## License

Internal Use Only
`;

    const readmePath = path.join(pluginDir, 'README.md');
    fs.writeFileSync(readmePath, readme);
  }

  /**
   * Create placeholder agents
   */
  async createPlaceholderAgents(pluginDir, config) {
    const agentsDir = path.join(pluginDir, 'agents');

    // Extract plugin prefix (e.g., "my-awesome-plugin" -> "my-awesome")
    const pluginPrefix = config.name.replace(/-plugin$/, '');

    for (let i = 1; i <= config.agents; i++) {
      const agentName = `${pluginPrefix}-agent-${i}`;
      const agentContent = `---
name: ${agentName}
model: sonnet
description: Placeholder agent ${i} for ${config.name} - replace with actual description
tools: Read, Write, TodoWrite
---

# ${this.toTitleCase(agentName.replace(/-/g, ' '))}

You are responsible for [describe responsibility]. Replace this placeholder with actual agent instructions.

## Core Responsibilities

### Responsibility Category 1
- Task 1
- Task 2
- Task 3

### Responsibility Category 2
- Task 1
- Task 2

## Best Practices

1. **Practice Area 1**
   - Guideline 1
   - Guideline 2

2. **Practice Area 2**
   - Guideline 1
   - Guideline 2

## Common Tasks

### Task Name 1
1. Step 1
2. Step 2
3. Step 3

## Troubleshooting

### Common Issues

1. **Issue 1**
   - Symptoms: [Description]
   - Solution: [Steps]

Remember: [Key directive for this agent]
`;

      const agentPath = path.join(agentsDir, `${agentName}.md`);
      fs.writeFileSync(agentPath, agentContent);
    }
  }

  /**
   * Create .gitignore
   */
  async createGitignore(pluginDir) {
    const gitignore = `# Node modules
node_modules/
package-lock.json

# Environment variables
.env
.env.local
.env.*.local

# Test outputs
coverage/
*.test.log
test-results/

# Temporary files
*.tmp
*.swp
*.swo
.DS_Store

# Build artifacts
dist/
build/
*.log

# IDE files
.vscode/
.idea/
*.iml

# OS files
Thumbs.db
`;

    const gitignorePath = path.join(pluginDir, '.gitignore');
    fs.writeFileSync(gitignorePath, gitignore);
  }

  /**
   * Create post-install hook
   */
  async createPostInstallHook(pluginDir, config) {
    const hookContent = `#!/bin/bash

echo "📦 Installing ${config.name}..."
echo ""

PLUGIN_DIR="$(dirname "$0")/.."
ROOT_DIR="$PLUGIN_DIR/../../.."

# Run dependency check if available
if [ -f "$ROOT_DIR/scripts/check-dependencies.js" ]; then
    echo "🔍 Checking dependencies..."
    node "$ROOT_DIR/scripts/check-dependencies.js" "$PLUGIN_DIR/.claude-plugin/plugin.json"
    RESULT=$?

    if [ $RESULT -eq 0 ]; then
        echo ""
        echo "✅ ${this.toTitleCase(config.name.replace(/-/g, ' '))} installed successfully!"
    else
        echo ""
        echo "⚠️  Plugin installed with warnings. Run /check-deps for details."
    fi
else
    echo "✅ ${this.toTitleCase(config.name.replace(/-/g, ' '))} installed successfully!"
fi

echo ""
echo "📋 Next steps:"
echo "   1. Review README.md for usage instructions"
echo "   2. Explore available agents with /agents"
echo "   3. Start using with natural language descriptions"
echo ""
`;

    const hookPath = path.join(pluginDir, '.claude-plugin/hooks/post-install.sh');
    fs.writeFileSync(hookPath, hookContent);
    fs.chmodSync(hookPath, '755'); // Make executable
  }

  /**
   * Initialize git repository
   */
  initializeGit(pluginDir, config) {
    try {
      execSync('git init', { cwd: pluginDir, stdio: 'pipe' });
      execSync('git add .', { cwd: pluginDir, stdio: 'pipe' });
      execSync(`git commit -m "chore: Initial plugin scaffolding for ${config.name}"`, {
        cwd: pluginDir,
        stdio: 'pipe'
      });
    } catch (error) {
      console.warn(`⚠️  Git initialization failed: ${error.message}`);
    }
  }

  /**
   * Add plugin to marketplace.json
   */
  async addToMarketplace(config) {
    if (!fs.existsSync(this.marketplaceJsonPath)) {
      console.warn(`⚠️  Marketplace file not found: ${this.marketplaceJsonPath}`);
      return;
    }

    const marketplace = JSON.parse(fs.readFileSync(this.marketplaceJsonPath, 'utf8'));

    marketplace.plugins.push({
      name: config.name,
      source: `./.claude-plugins/${config.name}`,
      description: config.description,
      version: config.version
    });

    fs.writeFileSync(this.marketplaceJsonPath, JSON.stringify(marketplace, null, 2) + '\n');
  }

  /**
   * Helper: Format dependencies for README
   */
  formatDependencies(dependencies, type) {
    if (!dependencies) return 'None';

    const sections = [];

    if (dependencies.cli) {
      Object.entries(dependencies.cli).forEach(([name, config]) => {
        if ((type === 'required' && config.required) || (type === 'optional' && !config.required)) {
          sections.push(`- **${name}**: ${config.description || 'Required CLI tool'}`);
          if (config.install) {
            sections.push(`  - Install: \`${config.install}\``);
          }
        }
      });
    }

    if (dependencies.system) {
      Object.entries(dependencies.system).forEach(([name, config]) => {
        if ((type === 'required' && config.required) || (type === 'optional' && !config.required)) {
          sections.push(`- **${name}**: ${config.description || 'Required system utility'}`);
        }
      });
    }

    return sections.length > 0 ? sections.join('\n') : 'None';
  }

  /**
   * Helper: Convert to title case
   */
  toTitleCase(str) {
    return str.replace(/\w\S*/g, (txt) => {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
  }

  // Domain-specific templates below...

  getSalesforceTemplate() {
    return {
      keywords: ['salesforce', 'sfdc', 'metadata', 'crm'],
      overview: 'This plugin provides comprehensive Salesforce operations including metadata management, data operations, and automation.',
      dependencies: {
        plugins: [],
        cli: {
          sf: {
            version: ">=2.0.0",
            check: "sf --version",
            install: "npm install -g @salesforce/cli",
            required: true,
            description: "Salesforce CLI for metadata operations"
          },
          node: {
            version: ">=18.0.0",
            check: "node --version",
            required: true,
            description: "Node.js runtime"
          }
        },
        system: {
          jq: {
            check: "which jq",
            install: {
              linux: "sudo apt-get install jq",
              darwin: "brew install jq"
            },
            required: true,
            description: "JSON processor for parsing CLI output"
          }
        }
      },
      agentExamples: `### Example Agents
- **orchestrator**: Coordinates multi-step operations
- **metadata-manager**: Deploys and manages metadata
- **data-operations**: Handles data imports/exports`,
      usageExamples: `### Example Usage
\`\`\`
User: "Deploy custom fields to production"
Expected: metadata-manager auto-invoked
\`\`\``
    };
  }

  getHubSpotTemplate() {
    return {
      keywords: ['hubspot', 'crm', 'marketing', 'sales'],
      overview: 'This plugin provides HubSpot CRM operations including contact management, workflows, and analytics.',
      dependencies: {
        plugins: [],
        cli: {
          node: {
            version: ">=18.0.0",
            check: "node --version",
            required: true,
            description: "Node.js runtime"
          }
        },
        system: {
          curl: {
            check: "which curl",
            required: true,
            description: "HTTP client for API calls"
          }
        },
        npm: {
          axios: "^1.6.0"
        }
      }
    };
  }

  getGTMTemplate() {
    return {
      keywords: ['gtm', 'planning', 'territory', 'quota'],
      overview: 'This plugin provides Go-to-Market planning capabilities including territory design and quota modeling.'
    };
  }

  getCrossPlatformTemplate() {
    return {
      keywords: ['cross-platform', 'orchestration', 'integration'],
      overview: 'This plugin provides cross-platform orchestration and integration capabilities.'
    };
  }

  getDevToolsTemplate() {
    return {
      keywords: ['developer', 'tools', 'testing', 'maintenance'],
      overview: 'This plugin provides developer utilities for plugin development and maintenance.'
    };
  }

  getCustomTemplate() {
    return {
      keywords: ['custom', 'plugin'],
      overview: 'Custom plugin for specialized operations.'
    };
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command-line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      options[key] = value;
      if (value !== true) i++;
    }
  }

  const scaffolder = new PluginScaffolder(options);
  scaffolder.scaffold().then(result => {
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = PluginScaffolder;
