#!/usr/bin/env node

/**
 * Project Initialization Script
 *
 * Detects installed plugins and sets up project structure with:
 * - Folder hierarchy for instances and reports
 * - CLAUDE.md with plugin-specific instructions
 * - .gitignore with appropriate rules
 * - README files for guidance
 *
 * Usage:
 *   node initialize-project.js [--project-dir <path>] [--force]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

class ProjectInitializer {
  constructor(projectDir, force = false) {
    this.projectDir = path.resolve(projectDir);
    this.force = force;
    this.installedPlugins = {
      salesforce: false,
      hubspot: false
    };
  }

  /**
   * Detect installed plugins
   */
  detectPlugins() {
    console.log(`${colors.blue}Detecting installed plugins...${colors.reset}`);

    const pluginDirs = [
      path.join(process.env.HOME, '.claude/plugins/marketplaces/revpal-internal-plugins/.claude-plugins'),
      path.join(process.cwd(), '.claude-plugins')
    ];

    for (const dir of pluginDirs) {
      // Check for salesforce-plugin
      if (fs.existsSync(path.join(dir, 'salesforce-plugin/.claude-plugin/plugin.json'))) {
        this.installedPlugins.salesforce = true;
        console.log(`  ${colors.green}✓${colors.reset} salesforce-plugin detected`);
      }

      // Check for hubspot-plugin
      if (fs.existsSync(path.join(dir, 'hubspot-plugin/.claude-plugin/plugin.json'))) {
        this.installedPlugins.hubspot = true;
        console.log(`  ${colors.green}✓${colors.reset} hubspot-plugin detected`);
      }
    }

    if (!this.installedPlugins.salesforce && !this.installedPlugins.hubspot) {
      throw new Error('No plugins detected. Please install salesforce-plugin or hubspot-plugin first.');
    }

    return this.installedPlugins;
  }

  /**
   * Create directory if it doesn't exist
   */
  ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      return true;
    }
    return false;
  }

  /**
   * Create folder structure
   */
  createFolderStructure() {
    console.log(`\n${colors.blue}Creating project structure...${colors.reset}`);

    const created = [];

    // Create base directories
    if (this.ensureDir(path.join(this.projectDir, 'instances'))) {
      created.push('instances/');
    }

    if (this.ensureDir(path.join(this.projectDir, 'reports'))) {
      created.push('reports/');
    }

    if (this.ensureDir(path.join(this.projectDir, 'scripts'))) {
      created.push('scripts/');
    }

    // Create platform-specific directories
    if (this.installedPlugins.salesforce) {
      if (this.ensureDir(path.join(this.projectDir, 'instances/salesforce'))) {
        created.push('instances/salesforce/');
      }
      if (this.ensureDir(path.join(this.projectDir, 'reports/salesforce'))) {
        created.push('reports/salesforce/');
      }
      if (this.ensureDir(path.join(this.projectDir, 'scripts/salesforce'))) {
        created.push('scripts/salesforce/');
      }
    }

    if (this.installedPlugins.hubspot) {
      if (this.ensureDir(path.join(this.projectDir, 'instances/hubspot'))) {
        created.push('instances/hubspot/');
      }
      if (this.ensureDir(path.join(this.projectDir, 'reports/hubspot'))) {
        created.push('reports/hubspot/');
      }
      if (this.ensureDir(path.join(this.projectDir, 'scripts/hubspot'))) {
        created.push('scripts/hubspot/');
      }
    }

    if (created.length > 0) {
      created.forEach(dir => {
        console.log(`  ${colors.green}✓${colors.reset} Created ${dir}`);
      });
    } else {
      console.log(`  ${colors.yellow}⚠${colors.reset} All directories already exist`);
    }

    return created;
  }

  /**
   * Get template path for plugin
   */
  getTemplatePath(plugin, templateName) {
    const possiblePaths = [
      path.join(process.env.HOME, `.claude/plugins/marketplaces/revpal-internal-plugins/.claude-plugins/${plugin}-plugin/templates/${templateName}`),
      path.join(process.cwd(), `.claude-plugins/${plugin}-plugin/templates/${templateName}`),
      path.join(__dirname, `../../templates/${templateName}`)
    ];

    for (const templatePath of possiblePaths) {
      if (fs.existsSync(templatePath)) {
        return templatePath;
      }
    }

    return null;
  }

  /**
   * Generate CLAUDE.md from templates
   */
  generateClaudeMd() {
    console.log(`\n${colors.blue}Generating CLAUDE.md...${colors.reset}`);

    const claudeMdPath = path.join(this.projectDir, 'CLAUDE.md');

    // Check if CLAUDE.md already exists
    if (fs.existsSync(claudeMdPath) && !this.force) {
      console.log(`  ${colors.yellow}⚠${colors.reset} CLAUDE.md already exists (use --force to overwrite)`);
      console.log(`  ${colors.gray}  Skipping...${colors.reset}`);
      return false;
    }

    let content = '';
    const pluginList = [];
    const platformList = [];

    // Combine templates based on installed plugins
    if (this.installedPlugins.salesforce) {
      const templatePath = this.getTemplatePath('salesforce', 'CLAUDE.md.template');
      if (templatePath) {
        const template = fs.readFileSync(templatePath, 'utf8');
        content += template;
        pluginList.push('- ✅ **salesforce-plugin** (v3.5.0) - 49 agents, 97 scripts, 14 commands');
        platformList.push('Salesforce');
      }
    }

    if (this.installedPlugins.hubspot) {
      const templatePath = this.getTemplatePath('hubspot', 'CLAUDE.md.template');
      if (templatePath) {
        const template = fs.readFileSync(templatePath, 'utf8');
        if (content) {
          // Both plugins installed - merge content
          content = this.mergeClaudeMdTemplates(content, template);
          pluginList.push('- ✅ **hubspot-plugin** (v1.1.0) - 35 agents, 31 scripts, 9 commands');
          platformList.push('HubSpot');
        } else {
          content = template;
          pluginList.push('- ✅ **hubspot-plugin** (v1.1.0) - 35 agents, 31 scripts, 9 commands');
          platformList.push('HubSpot');
        }
      }
    }

    // Replace placeholders
    const date = new Date().toISOString().split('T')[0];
    content = content.replace(/{DATE}/g, date);
    content = content.replace(/\*\*Primary Platform\*\*: \[.*?\]/g,
      `**Primary Platform**: ${platformList.join(' + ')}`);

    // Update installed plugins section if both are present
    if (this.installedPlugins.salesforce && this.installedPlugins.hubspot) {
      const pluginSection = `## 🔌 Installed Plugins\n\n${pluginList.join('\n')}`;
      content = content.replace(/## 🔌 Installed Plugins[\s\S]*?(?=\n##)/m, pluginSection + '\n');
    }

    // Write CLAUDE.md
    fs.writeFileSync(claudeMdPath, content);
    console.log(`  ${colors.green}✓${colors.reset} Generated CLAUDE.md`);
    console.log(`  ${colors.gray}  ${claudeMdPath}${colors.reset}`);

    return true;
  }

  /**
   * Merge CLAUDE.md templates for both plugins
   */
  mergeClaudeMdTemplates(sfdcTemplate, hsTemplate) {
    // Start with the multi-platform header
    let merged = `# Salesforce + HubSpot Operations - Claude Code Project\n\n`;
    merged += `**Auto-generated by salesforce-plugin v3.5.0 + hubspot-plugin v1.1.0**\n\n`;

    // Extract sections from each template
    const sfdcSections = this.extractSections(sfdcTemplate);
    const hsSections = this.extractSections(hsTemplate);

    // Project Overview (combined)
    merged += `## 📋 Project Overview\n\n`;
    merged += `<!-- EDIT THIS SECTION with your project details -->\n\n`;
    merged += `**Project Name**: [Your Project Name]\n`;
    merged += `**Primary Platform**: Salesforce + HubSpot\n`;
    merged += `**Description**: [Brief description of your multi-platform project]\n\n`;
    merged += `---\n\n`;

    // Installed Plugins
    merged += `## 🔌 Installed Plugins\n\n`;
    merged += `- ✅ **salesforce-plugin** (v3.5.0) - 49 agents, 97 scripts, 14 commands\n`;
    merged += `- ✅ **hubspot-plugin** (v1.1.0) - 35 agents, 31 scripts, 9 commands\n\n`;

    // Combined folder structure
    merged += `## 📁 Project Structure\n\n`;
    merged += `\`\`\`\n`;
    merged += `.\n`;
    merged += `├── CLAUDE.md                    # This file - Claude Code instructions\n`;
    merged += `├── .gitignore                   # Auto-generated (protects customer data)\n`;
    merged += `├── instances/                   # Customer instances\n`;
    merged += `│   ├── salesforce/              # Salesforce orgs\n`;
    merged += `│   │   └── [customer-name]/\n`;
    merged += `│   └── hubspot/                 # HubSpot portals\n`;
    merged += `│       └── [customer-name]/\n`;
    merged += `├── reports/                     # Cross-platform reports\n`;
    merged += `│   ├── salesforce/\n`;
    merged += `│   └── hubspot/\n`;
    merged += `└── scripts/                     # Custom automation\n`;
    merged += `    ├── salesforce/\n`;
    merged += `    └── hubspot/\n`;
    merged += `\`\`\`\n\n`;

    // Agent protocol (reference both)
    merged += `## 🚨 AGENT-FIRST PROTOCOL\n\n`;
    merged += `**MANDATORY**: Always check for appropriate agent before performing tasks!\n\n`;
    merged += `### Salesforce Agents\n\n`;
    merged += sfdcSections['Quick Agent Lookup'] || '';
    merged += `\n\n### 📖 Salesforce Complete Usage Guide\n\n`;
    merged += `For comprehensive Salesforce agent documentation, workflows, use cases, and best practices:\n\n`;
    merged += `@import .claude-plugins/opspal-salesforce/.claude-plugin/USAGE.md\n\n`;
    merged += `### HubSpot Agents\n\n`;
    merged += hsSections['Quick Agent Lookup'] || '';
    merged += `\n\n### 📖 HubSpot Complete Usage Guide\n\n`;
    merged += `For comprehensive HubSpot agent documentation, workflows, use cases, and best practices:\n\n`;
    merged += `@import .claude-plugins/opspal-hubspot/USAGE.md\n\n`;

    // Include platform-specific sections
    merged += `\n\n---\n\n# Salesforce Operations\n\n`;
    merged += sfdcSections['Essential Commands'] || '';
    merged += sfdcSections['Salesforce Conventions'] || '';

    merged += `\n\n---\n\n# HubSpot Operations\n\n`;
    merged += hsSections['Essential Commands'] || '';
    merged += hsSections['HubSpot Conventions'] || '';

    // Common sections
    merged += `\n\n---\n\n## 🔐 Security\n\n`;
    merged += `### Never Commit\n\n`;
    merged += `- API keys, tokens, or credentials\n`;
    merged += `- Customer data or PII\n`;
    merged += `- Platform authentication files\n`;
    merged += `- Internal URLs or endpoints\n\n`;

    merged += `---\n\n**Last Updated**: {DATE}\n`;
    merged += `**Generated by**: OpsPal by RevPal\n`;

    return merged;
  }

  /**
   * Extract sections from markdown template
   */
  extractSections(template) {
    const sections = {};
    const regex = /^##\s+(.+)$/gm;
    let match;
    let lastSection = null;
    let lastIndex = 0;

    while ((match = regex.exec(template)) !== null) {
      if (lastSection) {
        sections[lastSection] = template.slice(lastIndex, match.index).trim();
      }
      lastSection = match[1];
      lastIndex = match.index;
    }

    if (lastSection) {
      sections[lastSection] = template.slice(lastIndex).trim();
    }

    return sections;
  }

  /**
   * Generate or merge .gitignore
   */
  generateGitignore() {
    console.log(`\n${colors.blue}Generating .gitignore...${colors.reset}`);

    const gitignorePath = path.join(this.projectDir, '.gitignore');
    let existingContent = '';

    if (fs.existsSync(gitignorePath)) {
      existingContent = fs.readFileSync(gitignorePath, 'utf8');
      console.log(`  ${colors.yellow}⚠${colors.reset} .gitignore exists, merging rules...`);
    }

    const rules = new Set(existingContent.split('\n').filter(line => line.trim()));

    // Add common rules
    const commonRules = [
      '# Plugin-generated rules',
      'instances/*/data/',
      'instances/*/backups/',
      'instances/*/*.csv',
      'instances/*/*.json',
      '!instances/*/STATUS.json',
      '!instances/*/README.md',
      '.env',
      '.env.local',
      'node_modules/',
      '*.log',
      '.DS_Store'
    ];

    commonRules.forEach(rule => rules.add(rule));

    // Add platform-specific rules
    if (this.installedPlugins.salesforce) {
      ['.sfdx/', '.sf/'].forEach(rule => rules.add(rule));
    }

    if (this.installedPlugins.hubspot) {
      ['.hubspot/', 'api-logs/'].forEach(rule => rules.add(rule));
    }

    // Write merged .gitignore
    fs.writeFileSync(gitignorePath, Array.from(rules).join('\n') + '\n');
    console.log(`  ${colors.green}✓${colors.reset} Generated .gitignore`);
    console.log(`  ${colors.gray}  ${gitignorePath}${colors.reset}`);

    return true;
  }

  /**
   * Create README files
   */
  createReadmes() {
    console.log(`\n${colors.blue}Creating README files...${colors.reset}`);

    const readmes = [];

    if (this.installedPlugins.salesforce) {
      const sfdcReadme = path.join(this.projectDir, 'instances/salesforce/README.md');
      if (!fs.existsSync(sfdcReadme) || this.force) {
        fs.writeFileSync(sfdcReadme, this.getSalesforceInstanceReadme());
        readmes.push('instances/salesforce/README.md');
      }
    }

    if (this.installedPlugins.hubspot) {
      const hsReadme = path.join(this.projectDir, 'instances/hubspot/README.md');
      if (!fs.existsSync(hsReadme) || this.force) {
        fs.writeFileSync(hsReadme, this.getHubSpotInstanceReadme());
        readmes.push('instances/hubspot/README.md');
      }
    }

    if (readmes.length > 0) {
      readmes.forEach(readme => {
        console.log(`  ${colors.green}✓${colors.reset} Created ${readme}`);
      });
    } else {
      console.log(`  ${colors.yellow}⚠${colors.reset} README files already exist`);
    }

    return readmes;
  }

  /**
   * Get Salesforce instance README content
   */
  getSalesforceInstanceReadme() {
    return `# Salesforce Instances

This directory contains customer Salesforce org directories.

## Structure

\`\`\`
salesforce/
└── [customer-name]/
    ├── STATUS.json      # Org alias, type, last accessed
    ├── README.md        # Customer-specific notes
    ├── reports/         # Assessment reports
    └── data/            # Data exports (gitignored)
\`\`\`

## Creating a New Instance

\`\`\`bash
# 1. Create directory
mkdir -p [customer-name]/{reports,data}

# 2. Authenticate to org
sf org login web --alias [customer-name]

# 3. Create STATUS.json
echo '{"alias":"[customer-name]","type":"sandbox","lastAccessed":"'$(date +%Y-%m-%d)'"}' > [customer-name]/STATUS.json

# 4. Document in README
echo "# [Customer Name]" > [customer-name]/README.md
\`\`\`

## Commands

- **List orgs**: \`sf org list\`
- **Set default**: \`sf config set target-org [customer-name]\`
- **Query**: \`sf data query --query "SELECT Id FROM Account LIMIT 10"\`
`;
  }

  /**
   * Get HubSpot instance README content
   */
  getHubSpotInstanceReadme() {
    return `# HubSpot Instances

This directory contains customer HubSpot portal directories.

## Structure

\`\`\`
hubspot/
└── [customer-name]/
    ├── STATUS.json      # Portal ID, environment, last accessed
    ├── README.md        # Customer-specific notes
    ├── reports/         # Assessment reports
    └── data/            # Data exports (gitignored)
\`\`\`

## Creating a New Instance

\`\`\`bash
# 1. Create directory
mkdir -p [customer-name]/{reports,data}

# 2. Get API key from HubSpot portal settings
export HUBSPOT_API_KEY="your-api-key"

# 3. Create STATUS.json
echo '{"portalId":"12345678","environment":"production","lastAccessed":"'$(date +%Y-%m-%d)'"}' > [customer-name]/STATUS.json

# 4. Document in README
echo "# [Customer Name]" > [customer-name]/README.md
\`\`\`

## Commands

- **Test connection**: \`curl -X GET "https://api.hubapi.com/crm/v3/objects/contacts?limit=1" -H "Authorization: Bearer $HUBSPOT_API_KEY"\`
- **Get contacts**: \`curl -X GET "https://api.hubapi.com/crm/v3/objects/contacts?limit=10" -H "Authorization: Bearer $HUBSPOT_API_KEY"\`
`;
  }

  /**
   * Run initialization
   */
  async run() {
    console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.cyan}Project Initialization${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
    console.log(`Project directory: ${colors.green}${this.projectDir}${colors.reset}\n`);

    try {
      // Detect plugins
      this.detectPlugins();

      // Create folder structure
      this.createFolderStructure();

      // Generate CLAUDE.md
      this.generateClaudeMd();

      // Generate .gitignore
      this.generateGitignore();

      // Create READMEs
      this.createReadmes();

      // Success summary
      console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
      console.log(`${colors.green}✓ Initialization Complete!${colors.reset}`);
      console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

      console.log(`${colors.blue}Next Steps:${colors.reset}`);
      console.log(`1. Edit CLAUDE.md to add project-specific details`);
      console.log(`2. Review .gitignore rules`);
      if (this.installedPlugins.salesforce) {
        console.log(`3. Authenticate Salesforce: ${colors.gray}sf org login web${colors.reset}`);
      }
      if (this.installedPlugins.hubspot) {
        console.log(`4. Set HubSpot API key: ${colors.gray}export HUBSPOT_API_KEY="..."${colors.reset}`);
      }
      console.log(`5. Create your first instance directory`);
      console.log(`6. Run ${colors.gray}/checkdependencies${colors.reset} to verify setup\n`);

      return 0;

    } catch (error) {
      console.error(`\n${colors.red}Error:${colors.reset} ${error.message}`);
      return 1;
    }
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');

  let projectDir = args.find(arg => arg.startsWith('--project-dir='));
  projectDir = projectDir ? projectDir.split('=')[1] : process.cwd();

  const initializer = new ProjectInitializer(projectDir, force);
  initializer.run().then(exitCode => {
    process.exit(exitCode);
  });
}

module.exports = ProjectInitializer;
