#!/usr/bin/env node
/**
 * sync-claudemd.js - Update local CLAUDE.md after plugin updates
 *
 * This script syncs a project's CLAUDE.md file with the latest plugin information:
 * - Updates plugin versions and agent counts
 * - Adds new agent routing entries
 * - Updates command references
 * - Preserves user-customized sections
 *
 * Usage:
 *   node sync-claudemd.js [options]
 *
 * Options:
 *   --project-dir=<path>  Target project directory (default: current directory)
 *   --dry-run             Show what would be updated without making changes
 *   --verbose             Show detailed output
 *   --force               Overwrite even if no changes detected
 *
 * @version 1.0.0
 * @date 2025-11-26
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  projectDir: process.cwd(),
  dryRun: args.includes('--dry-run'),
  verbose: args.includes('--verbose'),
  force: args.includes('--force')
};

// Parse --project-dir=<path>
const projectDirArg = args.find(a => a.startsWith('--project-dir='));
if (projectDirArg) {
  options.projectDir = projectDirArg.split('=')[1];
}

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

function log(msg, color = '') {
  console.log(`${color}${msg}${colors.reset}`);
}

function logVerbose(msg) {
  if (options.verbose) {
    console.log(`${colors.dim}  ${msg}${colors.reset}`);
  }
}

/**
 * Find installed plugins by scanning .claude-plugins/ directory
 */
function findInstalledPlugins() {
  const plugins = [];
  const pluginsDir = path.join(options.projectDir, '.claude-plugins');

  // Also check marketplace installation paths
  const marketplaceDirs = [
    pluginsDir,
    path.join(process.env.HOME || '', '.claude', 'plugins', 'marketplaces', 'revpal-internal-plugins', '.claude-plugins')
  ];

  for (const baseDir of marketplaceDirs) {
    if (!fs.existsSync(baseDir)) continue;

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;

      const pluginDir = path.join(baseDir, entry.name);
      const manifestPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');

      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

          // Count agents
          const agentsDir = path.join(pluginDir, 'agents');
          let agentCount = 0;
          if (fs.existsSync(agentsDir)) {
            agentCount = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md')).length;
          }

          // Count commands
          const commandsDir = path.join(pluginDir, 'commands');
          let commandCount = 0;
          if (fs.existsSync(commandsDir)) {
            commandCount = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md')).length;
          }

          // Count scripts
          const scriptsDir = path.join(pluginDir, 'scripts', 'lib');
          let scriptCount = 0;
          if (fs.existsSync(scriptsDir)) {
            scriptCount = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js') || f.endsWith('.sh')).length;
          }

          // Count hooks
          const hooksDir = path.join(pluginDir, 'hooks');
          let hookCount = 0;
          if (fs.existsSync(hooksDir)) {
            hookCount = fs.readdirSync(hooksDir).filter(f => f.endsWith('.sh')).length;
          }

          plugins.push({
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            agentCount,
            commandCount,
            scriptCount,
            hookCount,
            path: pluginDir
          });

          logVerbose(`Found ${manifest.name} v${manifest.version} (${agentCount} agents, ${commandCount} commands)`);
        } catch (err) {
          logVerbose(`Warning: Could not parse ${manifestPath}: ${err.message}`);
        }
      }
    }
  }

  // Deduplicate by name (prefer local over marketplace)
  const seen = new Set();
  return plugins.filter(p => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });
}

/**
 * Get top agents for quick lookup section
 */
function getTopAgents(plugin) {
  const agentsDir = path.join(plugin.path, 'agents');
  if (!fs.existsSync(agentsDir)) return [];

  const agents = [];
  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));

  for (const file of files.slice(0, 20)) { // Top 20 agents
    const agentPath = path.join(agentsDir, file);
    const content = fs.readFileSync(agentPath, 'utf8');

    // Extract name from frontmatter
    const nameMatch = content.match(/^---[\s\S]*?name:\s*([^\n]+)/m);
    if (nameMatch) {
      agents.push(nameMatch[1].trim().replace(/['"]/g, ''));
    }
  }

  return agents;
}

/**
 * Generate plugin info section for CLAUDE.md
 */
function generatePluginSection(plugins) {
  let section = '## 🔌 Installed Plugins\n\n';

  for (const plugin of plugins) {
    const stats = [];
    if (plugin.agentCount > 0) stats.push(`${plugin.agentCount} agents`);
    if (plugin.scriptCount > 0) stats.push(`${plugin.scriptCount} scripts`);
    if (plugin.commandCount > 0) stats.push(`${plugin.commandCount} commands`);
    if (plugin.hookCount > 0) stats.push(`${plugin.hookCount} hooks`);

    section += `- ✅ **${plugin.name}** (v${plugin.version}) - ${stats.join(', ')}\n`;
  }

  section += `\n**Last synced**: ${new Date().toISOString().split('T')[0]}\n`;

  return section;
}

/**
 * Generate agent quick lookup section
 */
function generateAgentLookupSection(plugins) {
  let section = '### ⚡ Quick Agent Lookup\n\n```\n';

  // Common patterns for each plugin type
  const patterns = {
    'salesforce-plugin': [
      ['deploy/release/production', 'release-coordinator'],
      ['conflict/error/failed', 'sfdc-conflict-resolver'],
      ['field/object/metadata', 'sfdc-metadata-manager'],
      ['permission/security/profile', 'sfdc-security-admin'],
      ['data/import/bulk/export', 'sfdc-data-operations'],
      ['CPQ/quote/pricing', 'sfdc-cpq-assessor'],
      ['apex/trigger/class', 'sfdc-apex-developer'],
      ['flow/automation/workflow', 'sfdc-automation-builder'],
      ['report/dashboard', 'sfdc-reports-dashboards'],
      ['audit/assessment/revops', 'sfdc-revops-auditor']
    ],
    'hubspot-plugin': [
      ['workflow/automation', 'hubspot-workflow'],
      ['contact/lead/person', 'hubspot-contact-manager'],
      ['deal/pipeline/opportunity', 'hubspot-pipeline-manager'],
      ['property/field', 'hubspot-property-manager'],
      ['marketing/email/campaign', 'hubspot-marketing-automation'],
      ['analytics/report', 'hubspot-analytics-reporter'],
      ['integration/sync', 'hubspot-integration-specialist'],
      ['data/import/export', 'hubspot-data-operations-manager']
    ],
    'cross-platform-plugin': [
      ['diagram/flowchart/ERD', 'diagram-generator'],
      ['asana/task/project', 'asana-task-manager'],
      ['PDF/document', 'pdf-generator']
    ]
  };

  for (const plugin of plugins) {
    const pluginPatterns = patterns[plugin.name] || [];
    for (const [keywords, agent] of pluginPatterns) {
      section += `${keywords.padEnd(30)} → ${agent}\n`;
    }
  }

  section += '```\n';
  return section;
}

/**
 * Generate mandatory agent routing section
 * This section ensures Claude always sees routing requirements
 */
function generateMandatoryRoutingSection() {
  return `## ⚡ MANDATORY AGENT ROUTING - MUST USE TASK TOOL

**CRITICAL COMPLIANCE REQUIREMENT**: Before executing ANY task matching the patterns below, you MUST use the Task tool with the specified agent. Direct execution is a VIOLATION.

### High-Priority Routing Table (BLOCKING)

| Task Pattern | Required Agent | Trigger Keywords |
|--------------|----------------|------------------|
| **Salesforce CPQ Assessment** | \`sfdc-cpq-assessor\` | "cpq", "quote", "pricing", "cpq audit", "cpq assessment" |
| **RevOps Audit** | \`sfdc-revops-auditor\` | "revops", "pipeline audit", "forecast", "revops assessment" |
| **Automation Audit** | \`sfdc-automation-auditor\` | "automation audit", "flow audit", "trigger audit", "process builder" |
| **Production Deployment** | \`sfdc-deployment-manager\` | "deploy to production", "production deploy", "release to prod" |
| **Permission Set Management** | \`sfdc-permission-orchestrator\` | "permission set", "create permissions", "permission audit" |
| **Report/Dashboard Creation** | \`sfdc-reports-dashboards\` | "create report", "create dashboard", "build report" |
| **Data Import/Export** | \`sfdc-data-operations\` | "import data", "export data", "bulk upload", "data migration" |
| **HubSpot Workflow** | \`hubspot-workflow-builder\` | "hubspot workflow", "create workflow", "workflow automation" |
| **Cross-Platform Diagrams** | \`diagram-generator\` | "create diagram", "flowchart", "ERD", "sequence diagram" |

### How to Comply

**CORRECT** (Use Task tool):
\`\`\`
User: "Run CPQ assessment for hivemq"
Claude: I'll use the specialized CPQ assessor agent for this.
→ Task tool with subagent_type='sfdc-cpq-assessor'
\`\`\`

**VIOLATION** (Direct execution):
\`\`\`
User: "Run CPQ assessment for hivemq"
Claude: Let me query the org directly...
→ ❌ WRONG - Must use sfdc-cpq-assessor agent
\`\`\`

### Why This Matters

- **80% error reduction** when using specialized agents
- **60-90% time savings** through optimized workflows
- **Best practices enforced** via agent instructions
- **Institutional knowledge** preserved in agent context

### Self-Check Before Every Task

1. Does this task match ANY pattern in the routing table above?
2. If YES → Use Task tool with the specified agent
3. If NO → Proceed with direct execution
4. If UNSURE → Use Task tool (safer choice)

---
`;
}

/**
 * Generate commands reference section
 */
function generateCommandsSection(plugins) {
  let section = '## 🛠️ Available Commands\n\n';

  for (const plugin of plugins) {
    if (plugin.commandCount === 0) continue;

    const commandsDir = path.join(plugin.path, 'commands');
    const commands = fs.readdirSync(commandsDir)
      .filter(f => f.endsWith('.md'))
      .slice(0, 10); // Top 10 commands

    section += `### ${plugin.name}\n\n`;
    section += '```bash\n';

    for (const cmd of commands) {
      const cmdName = cmd.replace('.md', '');
      section += `/${cmdName}\n`;
    }

    section += '```\n\n';
  }

  return section;
}

/**
 * Update CLAUDE.md with latest plugin information
 */
function updateClaudeMd(plugins) {
  const claudeMdPath = path.join(options.projectDir, 'CLAUDE.md');

  if (!fs.existsSync(claudeMdPath)) {
    log(`\n${colors.yellow}⚠️  No CLAUDE.md found at ${claudeMdPath}`, colors.yellow);
    log(`   Run /initialize to create one, or create manually.`, colors.dim);
    return { updated: false, reason: 'no-file' };
  }

  let content = fs.readFileSync(claudeMdPath, 'utf8');
  const originalContent = content;
  const changes = [];

  // Update "Mandatory Agent Routing" section (CRITICAL - near top of file)
  const routingSectionRegex = /## ⚡ MANDATORY AGENT ROUTING[\s\S]*?(?=\n## |\n---\n\n## |$)/;
  const newRoutingSection = generateMandatoryRoutingSection();

  if (routingSectionRegex.test(content)) {
    content = content.replace(routingSectionRegex, newRoutingSection);
    changes.push('Updated mandatory agent routing rules');
  } else {
    // Insert after Project Overview, before other sections
    const projectOverviewMatch = content.match(/## Project Overview[\s\S]*?\n\n(?=## |$)/);
    if (projectOverviewMatch) {
      const insertPos = content.indexOf(projectOverviewMatch[0]) + projectOverviewMatch[0].length;
      content = content.slice(0, insertPos) + newRoutingSection + '\n' + content.slice(insertPos);
    } else {
      // Insert near top if no Project Overview
      const firstH2 = content.indexOf('\n## ');
      if (firstH2 > 0) {
        content = content.slice(0, firstH2 + 1) + newRoutingSection + '\n' + content.slice(firstH2 + 1);
      } else {
        content = newRoutingSection + '\n' + content;
      }
    }
    changes.push('Added mandatory agent routing section');
  }

  // Update "Installed Plugins" section
  const pluginSectionRegex = /## 🔌 Installed Plugins[\s\S]*?(?=\n## |\n---|\n\*\*Last synced|$)/;
  const newPluginSection = generatePluginSection(plugins);

  if (pluginSectionRegex.test(content)) {
    content = content.replace(pluginSectionRegex, newPluginSection);
    changes.push('Updated plugin versions and counts');
  } else {
    // Insert after routing section if exists, otherwise after Project Overview
    const routingEnd = content.indexOf('### Self-Check Before Every Task');
    if (routingEnd > 0) {
      const insertPos = content.indexOf('---', routingEnd) + 3;
      content = content.slice(0, insertPos) + '\n\n' + newPluginSection + content.slice(insertPos);
    } else {
      const overviewEnd = content.indexOf('\n---');
      if (overviewEnd > 0) {
        content = content.slice(0, overviewEnd + 4) + '\n\n' + newPluginSection + content.slice(overviewEnd + 4);
      } else {
        content = newPluginSection + '\n\n' + content;
      }
    }
    changes.push('Added plugin information section');
  }

  // Update "Quick Agent Lookup" section if exists
  const agentLookupRegex = /### ⚡ Quick Agent Lookup[\s\S]*?```[\s\S]*?```/;
  if (agentLookupRegex.test(content)) {
    content = content.replace(agentLookupRegex, generateAgentLookupSection(plugins).trim());
    changes.push('Updated agent quick lookup');
  }

  // Check if content actually changed
  if (content === originalContent && !options.force) {
    return { updated: false, reason: 'no-changes', changes: [] };
  }

  // Write updated content
  if (!options.dryRun) {
    fs.writeFileSync(claudeMdPath, content, 'utf8');
  }

  return { updated: true, changes, path: claudeMdPath };
}

/**
 * Main execution
 */
async function main() {
  log('\n╔════════════════════════════════════════════════════════╗');
  log('║        CLAUDE.md Sync - Plugin Update Utility          ║');
  log('╚════════════════════════════════════════════════════════╝\n');

  if (options.dryRun) {
    log('🔍 DRY RUN MODE - No changes will be made\n', colors.yellow);
  }

  // Find installed plugins
  log('📦 Scanning for installed plugins...', colors.blue);
  const plugins = findInstalledPlugins();

  if (plugins.length === 0) {
    log('\n⚠️  No plugins found!', colors.yellow);
    log('   Install plugins first:', colors.dim);
    log('   /plugin install salesforce-plugin@revpal-internal-plugins', colors.dim);
    process.exit(1);
  }

  log(`   Found ${plugins.length} plugin(s):\n`, colors.green);
  for (const plugin of plugins) {
    log(`   ✓ ${plugin.name} v${plugin.version}`, colors.green);
    logVerbose(`     ${plugin.agentCount} agents, ${plugin.commandCount} commands, ${plugin.scriptCount} scripts`);
  }

  // Update CLAUDE.md
  log('\n📝 Updating CLAUDE.md...', colors.blue);
  const result = updateClaudeMd(plugins);

  if (!result.updated) {
    if (result.reason === 'no-file') {
      process.exit(1);
    } else if (result.reason === 'no-changes') {
      log('\n✅ CLAUDE.md is already up to date!', colors.green);
      process.exit(0);
    }
  }

  // Show changes
  log('\n╔════════════════════════════════════════════════════════╗');
  if (options.dryRun) {
    log('║  DRY RUN COMPLETE - Changes that would be made:        ║');
  } else {
    log('║  ✅ CLAUDE.md Updated Successfully!                    ║');
  }
  log('╚════════════════════════════════════════════════════════╝\n');

  for (const change of result.changes) {
    log(`   • ${change}`, colors.cyan);
  }

  if (!options.dryRun) {
    log(`\n   Updated: ${result.path}`, colors.dim);
  }

  log('\n📋 Next Steps:', colors.blue);
  log('   1. Review the updated CLAUDE.md', colors.dim);
  log('   2. Edit Project Overview section if needed', colors.dim);
  log('   3. Commit changes to version control', colors.dim);

  process.exit(0);
}

main().catch(err => {
  log(`\n❌ Error: ${err.message}`, colors.red);
  if (options.verbose) {
    console.error(err.stack);
  }
  process.exit(1);
});
