#!/usr/bin/env node
/**
 * sync-claudemd.js - Fully procedural CLAUDE.md generation
 *
 * This script COMPLETELY REGENERATES the CLAUDE.md file every time it runs.
 * It preserves user-editable sections via HTML comment markers.
 *
 * Usage:
 *   node sync-claudemd.js [options]
 *
 * Options:
 *   --project-dir=<path>  Target project directory (default: current directory)
 *   --dry-run             Show what would be generated without making changes
 *   --verbose             Show detailed output
 *
 * @version 3.0.0
 * @date 2026-02-03
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveMarketplaceContext } = require('./marketplace-config');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  projectDir: process.cwd(),
  dryRun: args.includes('--dry-run'),
  verbose: args.includes('--verbose')
};

// Parse --project-dir=<path>
const projectDirArg = args.find(a => a.startsWith('--project-dir='));
if (projectDirArg) {
  options.projectDir = projectDirArg.split('=')[1];
}

const marketplaceContext = resolveMarketplaceContext({
  projectDir: options.projectDir,
  scriptDir: __dirname,
  pluginName: 'opspal-core'
});

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  magenta: '\x1b[35m'
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
 * Parse YAML frontmatter from markdown content
 */
function parseYamlFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result = {};
  const lines = yaml.split('\n');
  let currentKey = null;
  let currentArray = null;

  for (const line of lines) {
    if (line.match(/^\s+-\s+/)) {
      const value = line.replace(/^\s+-\s+/, '').trim().replace(/^['"]|['"]$/g, '');
      if (currentArray && currentKey) {
        result[currentKey].push(value);
      }
      continue;
    }

    const kvMatch = line.match(/^(\w[\w-]*?):\s*(.*)/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      currentKey = key;

      if (value.trim() === '' || value.trim() === '|') {
        result[key] = [];
        currentArray = true;
      } else {
        result[key] = value.trim().replace(/^['"]|['"]$/g, '');
        currentArray = false;
      }
    }
  }

  return result;
}

/**
 * Extract keywords from description text patterns
 * Looks for patterns like "Trigger keywords: x, y, z" or "**Trigger keywords**: x, y, z"
 */
function extractKeywordsFromDescription(description) {
  if (!description) return [];
  const descStr = typeof description === 'string' ? description :
    (Array.isArray(description) ? description.join(' ') : String(description));

  const patterns = [
    /TRIGGER KEYWORDS?:\s*["']?([^"\n]+)["']?/i,
    /\*\*Trigger keywords?\*\*[:\s]*["']?([^"\n]+)["']?/i,
    /Keywords?:\s*["']?([^"\n]+)["']?/i
  ];

  for (const pattern of patterns) {
    const match = descStr.match(pattern);
    if (match) {
      return match[1].split(/[,"]/).map(k => k.trim()).filter(k => k.length > 2);
    }
  }
  return [];
}

/**
 * Detect if agent is mandatory (MUST BE USED pattern)
 */
function detectMandatoryAgent(description) {
  if (!description) return false;
  const descStr = typeof description === 'string' ? description :
    (Array.isArray(description) ? description.join(' ') : String(description));
  return /MUST BE USED|BLOCKED OPERATIONS|MANDATORY/i.test(descStr);
}

/**
 * Calculate priority score based on keyword specificity
 */
function calculatePriority(agent) {
  let score = 0;
  const highPriorityTerms = ['cpq', 'revops', 'audit', 'assessment', 'orchestrator', 'territory', 'permission'];
  const mediumPriorityTerms = ['report', 'dashboard', 'workflow', 'data', 'migration', 'deploy'];

  const allText = [...(agent.triggerKeywords || []), agent.name].join(' ').toLowerCase();

  for (const term of highPriorityTerms) {
    if (allText.includes(term)) score += 10;
  }
  for (const term of mediumPriorityTerms) {
    if (allText.includes(term)) score += 5;
  }
  if (agent.isMandatory) score += 50;

  return score;
}

/**
 * Generate routing table from discovered agents
 */
function generateRoutingTable(plugins) {
  const routes = [];
  const seenAgents = new Map(); // Track agent names to prefer opspal-* prefixed plugins

  for (const plugin of plugins) {
    for (const agent of plugin.agents || []) {
      if (!agent.triggerKeywords || agent.triggerKeywords.length === 0) continue;

      // Calculate priority score
      const priority = calculatePriority(agent);

      // Deduplicate: prefer opspal-* prefixed plugins over legacy *-plugin names
      const isOpspalPlugin = plugin.name.startsWith('opspal-');
      const existingRoute = seenAgents.get(agent.name);

      if (existingRoute) {
        // If existing is not opspal-* but this one is, replace it
        if (!existingRoute.isOpspalPlugin && isOpspalPlugin) {
          existingRoute.route.agent = `${plugin.name}:${agent.name}`;
          existingRoute.isOpspalPlugin = true;
        }
        // Skip if we already have this agent (prefer first opspal-* version)
        continue;
      }

      const route = {
        keywords: agent.triggerKeywords.slice(0, 5).join('/'),
        agent: `${plugin.name}:${agent.name}`,
        isMandatory: agent.isMandatory,
        priority: priority
      };

      routes.push(route);
      seenAgents.set(agent.name, { route, isOpspalPlugin });
    }
  }

  // Sort by priority (mandatory first, then by priority score)
  return routes.sort((a, b) => {
    if (a.isMandatory && !b.isMandatory) return -1;
    if (!a.isMandatory && b.isMandatory) return 1;
    return b.priority - a.priority;
  });
}

/**
 * Generate critical routing preamble - placed FIRST in CLAUDE.md for maximum visibility
 * Compact (~300 tokens) block with top mandatory routes and Agent() invocation examples
 */
function generateCriticalRoutingPreamble(plugins) {
  const routes = generateRoutingTable(plugins);
  const topMandatory = routes.filter(r => r.isMandatory).slice(0, 10);

  // If no mandatory routes discovered, use static fallback
  if (topMandatory.length === 0) {
    return `## 🚨 CRITICAL: Agent Routing Rules

**STOP** before responding to any request. Check this table first.

| If user mentions... | Use this agent | Invoke with |
|---------------------|---------------|-------------|
| revops, audit, pipeline | \`opspal-salesforce:sfdc-revops-auditor\` | \`Agent(subagent_type='opspal-salesforce:sfdc-revops-auditor', prompt=<request>)\` |
| cpq, quote, pricing | \`opspal-salesforce:sfdc-cpq-assessor\` | \`Agent(subagent_type='opspal-salesforce:sfdc-cpq-assessor', prompt=<request>)\` |
| automation audit, flow audit | \`opspal-salesforce:sfdc-automation-auditor\` | \`Agent(subagent_type='opspal-salesforce:sfdc-automation-auditor', prompt=<request>)\` |
| hubspot assessment | \`opspal-hubspot:hubspot-assessment-analyzer\` | \`Agent(subagent_type='opspal-hubspot:hubspot-assessment-analyzer', prompt=<request>)\` |
| permission set | \`opspal-salesforce:sfdc-permission-orchestrator\` | \`Agent(subagent_type='opspal-salesforce:sfdc-permission-orchestrator', prompt=<request>)\` |

**Self-check**: (1) Does this match a keyword above? (2) Is this multi-step? (3) Is this an assessment/audit?
If YES to any → use Agent(). If unsure → use Agent(). Override: \`[DIRECT]\` to skip.`;
  }

  let content = `## 🚨 CRITICAL: Agent Routing Rules

**STOP** before responding to any request. Check this table first.

| If user mentions... | Use this agent | Invoke with |
|---------------------|---------------|-------------|
`;

  for (const route of topMandatory) {
    content += `| ${route.keywords} | \`${route.agent}\` | \`Agent(subagent_type='${route.agent}', prompt=<request>)\` |\n`;
  }

  content += `
**Self-check**: (1) Does this match a keyword above? (2) Is this multi-step? (3) Is this an assessment/audit?
If YES to any → use Agent(). If unsure → use Agent(). Override: \`[DIRECT]\` to skip.`;

  return content;
}

/**
 * Discover commands from a plugin directory
 */
function discoverCommands(pluginPath) {
  const commandsDir = path.join(pluginPath, 'commands');
  if (!fs.existsSync(commandsDir)) return [];

  const commands = [];
  const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(commandsDir, file), 'utf8');
      const frontmatter = parseYamlFrontmatter(content);

      if (frontmatter) {
        commands.push({
          name: frontmatter.name || file.replace('.md', ''),
          description: frontmatter.description || '',
          tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
          aliases: Array.isArray(frontmatter.aliases) ? frontmatter.aliases : [],
          visibility: frontmatter.visibility || 'user-invocable',
          file: file
        });
      }
    } catch (err) {
      logVerbose(`Warning: Could not parse command ${file}: ${err.message}`);
    }
  }

  return commands;
}

/**
 * Discover agents from a plugin directory
 */
function discoverAgents(pluginPath) {
  const agentsDir = path.join(pluginPath, 'agents');
  if (!fs.existsSync(agentsDir)) return [];

  const agents = [];
  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(agentsDir, file), 'utf8');
      const frontmatter = parseYamlFrontmatter(content);

      if (frontmatter) {
        // Extract trigger keywords from multiple sources
        let triggerKeywords = [];

        // Source 1: triggerKeywords field (primary)
        if (Array.isArray(frontmatter.triggerKeywords)) {
          triggerKeywords = frontmatter.triggerKeywords;
        } else if (typeof frontmatter.triggerKeywords === 'string') {
          triggerKeywords = frontmatter.triggerKeywords.split(/[,\n]/).map(k => k.trim()).filter(Boolean);
        }

        // Source 2: Fallback to triggers field (legacy)
        if (triggerKeywords.length === 0 && Array.isArray(frontmatter.triggers)) {
          triggerKeywords = frontmatter.triggers;
        }

        // Source 3: Extract from description text
        if (triggerKeywords.length === 0) {
          triggerKeywords = extractKeywordsFromDescription(frontmatter.description);
        }

        const agentName = frontmatter.name || file.replace('.md', '');
        const isMandatory = detectMandatoryAgent(frontmatter.description);

        agents.push({
          name: agentName,
          description: frontmatter.description || '',
          tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
          triggerKeywords: triggerKeywords,
          isMandatory: isMandatory,
          file: file
        });

        // Verbose logging for keyword extraction
        if (triggerKeywords.length > 0) {
          logVerbose(`  Agent "${agentName}": keywords=[${triggerKeywords.slice(0, 5).join(', ')}]${isMandatory ? ' [MANDATORY]' : ''}`);
        }
      }
    } catch (err) {
      logVerbose(`Warning: Could not parse agent ${file}: ${err.message}`);
    }
  }

  return agents;
}

/**
 * Get candidate Claude roots for marketplace/cache discovery.
 */
function getClaudeRoots() {
  const roots = [path.join(os.homedir(), '.claude')];

  for (const envVar of ['CLAUDE_HOME', 'CLAUDE_CONFIG_DIR']) {
    const value = process.env[envVar];
    if (value && value.trim()) {
      roots.push(path.resolve(value.trim()));
    }
  }

  return [...new Set(roots.map(root => path.resolve(root)))];
}

function compareVersionsDesc(a, b) {
  return b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' });
}

function listCandidatePluginDirs() {
  const pluginDirs = [];
  const seenDirs = new Set();
  const baseDirs = [
    path.join(options.projectDir, '.claude-plugins'),
    path.join(options.projectDir, 'plugins')
  ];

  for (const claudeRoot of getClaudeRoots()) {
    const marketplacesRoot = path.join(claudeRoot, 'plugins', 'marketplaces');
    if (fs.existsSync(marketplacesRoot)) {
      for (const entry of fs.readdirSync(marketplacesRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        baseDirs.push(path.join(marketplacesRoot, entry.name, 'plugins'));
        baseDirs.push(path.join(marketplacesRoot, entry.name, '.claude-plugins'));
      }
    }

    const cacheRoot = path.join(claudeRoot, 'plugins', 'cache');
    if (!fs.existsSync(cacheRoot)) {
      continue;
    }

    for (const marketplaceEntry of fs.readdirSync(cacheRoot, { withFileTypes: true })) {
      if (!marketplaceEntry.isDirectory()) continue;

      const marketplaceDir = path.join(cacheRoot, marketplaceEntry.name);
      for (const pluginEntry of fs.readdirSync(marketplaceDir, { withFileTypes: true })) {
        if (!pluginEntry.isDirectory()) continue;

        const pluginCacheDir = path.join(marketplaceDir, pluginEntry.name);
        const versions = fs.readdirSync(pluginCacheDir, { withFileTypes: true })
          .filter(entry => entry.isDirectory())
          .map(entry => entry.name)
          .sort(compareVersionsDesc);

        for (const version of versions) {
          const candidate = path.join(pluginCacheDir, version);
          const manifestPath = path.join(candidate, '.claude-plugin', 'plugin.json');
          if (fs.existsSync(manifestPath)) {
            baseDirs.push(candidate);
            break;
          }
        }
      }
    }
  }

  for (const baseDir of baseDirs) {
    const resolvedBaseDir = path.resolve(baseDir);
    if (!fs.existsSync(resolvedBaseDir) || seenDirs.has(resolvedBaseDir)) continue;
    seenDirs.add(resolvedBaseDir);
    pluginDirs.push(resolvedBaseDir);
  }

  return pluginDirs;
}

/**
 * Find installed plugins by scanning workspace, marketplace, and cache roots.
 */
function findInstalledPlugins() {
  const plugins = [];
  const pluginBaseDirs = listCandidatePluginDirs();

  for (const baseDir of pluginBaseDirs) {
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
          if (!manifest.name || !manifest.name.startsWith('opspal-')) {
            continue;
          }

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

          // Check for USAGE.md
          const usageMdPaths = [
            path.join(pluginDir, 'USAGE.md'),
            path.join(pluginDir, '.claude-plugin', 'USAGE.md')
          ];
          let usageMdPath = null;
          for (const p of usageMdPaths) {
            if (fs.existsSync(p)) {
              usageMdPath = p;
              break;
            }
          }

          // Discover commands and agents
          const commands = discoverCommands(pluginDir);
          const agents = discoverAgents(pluginDir);

          plugins.push({
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            agentCount,
            commandCount,
            scriptCount,
            hookCount,
            path: pluginDir,
            commands,
            agents,
            usageMdPath
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
 * Detect which platforms are represented in the installed plugins
 */
function detectPlatforms(plugins) {
  const platforms = new Set();
  for (const plugin of plugins) {
    const name = plugin.name.toLowerCase();
    if (name.includes('salesforce') || name.includes('sfdc')) {
      platforms.add('salesforce');
    }
    if (name.includes('hubspot')) {
      platforms.add('hubspot');
    }
    if (name.includes('marketo')) {
      platforms.add('marketo');
    }
    if (name.includes('monday')) {
      platforms.add('monday');
    }
  }
  return Array.from(platforms);
}

/**
 * Extract user-editable sections from existing content
 */
function extractUserEditableSections(content) {
  const sections = {};
  const regex = /<!-- USER_EDITABLE_START name="([^"]+)" -->([\s\S]*?)<!-- USER_EDITABLE_END -->/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    sections[match[1]] = match[2].trim();
  }
  return sections;
}

/**
 * Helper to capitalize first letter
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================================
// SECTION GENERATORS
// ============================================================================

/**
 * Generate project overview (preservable section)
 */
function generateProjectOverview(userSections) {
  const defaultContent = `This file provides guidance for using OpsPal plugins with Claude Code.
Full routing tables and examples: \`docs/routing-help.md\``;

  return `## 📋 Project Overview

<!-- USER_EDITABLE_START name="project-overview" -->
${userSections['project-overview'] || defaultContent}
<!-- USER_EDITABLE_END -->`;
}

/**
 * Generate installed plugins section
 */
function generatePluginSection(plugins) {
  let section = '## 🔌 Installed Plugins\n\n';

  // Sort plugins: opspal-* first, then others
  const sortedPlugins = [...plugins].sort((a, b) => {
    const aIsOpspal = a.name.startsWith('opspal-');
    const bIsOpspal = b.name.startsWith('opspal-');
    if (aIsOpspal && !bIsOpspal) return -1;
    if (!aIsOpspal && bIsOpspal) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const plugin of sortedPlugins) {
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
 * Generate work-index auto-capture section
 */
function generateWorkIndexSection() {
  return `## 📋 Work-Index Auto-Capture

**Project memory system** - Automatically tracks work requests per client when using Agent() with specialist agents.

### Required Setup

\`\`\`bash
export ORG_SLUG=<client-org-name>  # Required for auto-capture
\`\`\`

### Quick Commands

\`\`\`bash
/work-index list <org>       # List work for client
/work-index search <query>   # Search across clients
/work-index context <org>    # Get recent context for session start
/work-index summary <org>    # Generate client summary
\`\`\``;
}

/**
 * Generate project structure based on installed plugins
 */
function generateProjectStructure(plugins) {
  const platforms = detectPlatforms(plugins);

  let structure = `## 📁 Project Structure

\`\`\`
.
├── CLAUDE.md                    # This file - Claude Code instructions
├── .gitignore                   # Auto-generated (protects customer data)
├── orgs/                        # Customer organizations (org-centric)
│   └── [customer-name]/
│       └── platforms/
`;

  if (platforms.includes('salesforce')) {
    structure += `│           ├── salesforce/      # Salesforce orgs\n`;
  }
  if (platforms.includes('hubspot')) {
    structure += `│           ├── hubspot/         # HubSpot portals\n`;
  }
  if (platforms.includes('marketo')) {
    structure += `│           ├── marketo/         # Marketo instances\n`;
  }
  if (platforms.includes('monday')) {
    structure += `│           └── monday/          # Monday workspaces\n`;
  }

  structure += `├── reports/                     # Cross-platform reports
└── scripts/                     # Custom automation
\`\`\``;

  return structure;
}

/**
 * Generate quick start section
 */
function generateQuickStart(plugins) {
  const platforms = detectPlatforms(plugins);

  let section = `## 🚀 Quick Start

### Installation

\`\`\`bash
/plugin marketplace add ${marketplaceContext.repositorySlug}
/plugin install opspal-core@${marketplaceContext.name}      # Foundation
`;

  if (platforms.includes('salesforce')) {
    section += `/plugin install opspal-salesforce@${marketplaceContext.name} # Salesforce\n`;
  }
  if (platforms.includes('hubspot')) {
    section += `/plugin install opspal-hubspot@${marketplaceContext.name}    # HubSpot\n`;
  }
  if (platforms.includes('marketo')) {
    section += `/plugin install opspal-marketo@${marketplaceContext.name}    # Marketo\n`;
  }

  section += `\`\`\`

### Verify Installation

\`\`\`bash
/agents              # List available agents
/sync-claudemd       # Update this file with latest plugin info
/checkdependencies   # Verify npm packages
\`\`\`

### Set Client Context

\`\`\`bash
export ORG_SLUG=<client-name>  # Required for work tracking
\`\`\``;

  return section;
}

/**
 * Generate agent protocol section with @import directives
 */
function generateAgentProtocol(plugins) {
  const routes = generateRoutingTable(plugins);

  // Split into mandatory vs optional
  const mandatoryRoutes = routes.filter(r => r.isMandatory).slice(0, 20);
  const optionalRoutes = routes.filter(r => !r.isMandatory).slice(0, 15);

  let content = `## 🎯 AGENT-FIRST PROTOCOL

**MANDATORY**: Always check for appropriate agent before performing tasks!

`;

  // Generate Mandatory Routing section if there are mandatory agents
  if (mandatoryRoutes.length > 0) {
    content += `### Mandatory Routing (MUST Use Agent Tool)

| Keywords | Agent | Invoke With |
|----------|-------|-------------|
`;

    for (const route of mandatoryRoutes) {
      content += `| ${route.keywords} | \`${route.agent}\` | \`Agent(subagent_type='${route.agent}', prompt=...)\` |\n`;
    }

    content += '\n';
  }

  // Generate Recommended Routing section
  if (optionalRoutes.length > 0) {
    content += `### Recommended Routing

| Keywords | Agent |
|----------|-------|
`;

    for (const route of optionalRoutes) {
      content += `| ${route.keywords} | \`${route.agent}\` |\n`;
    }

    content += '\n';
  }

  // If no routes were generated, show the static fallback table
  if (mandatoryRoutes.length === 0 && optionalRoutes.length === 0) {
    content += `### Routing Quick Reference

| Keywords | Agent |
|----------|-------|
| cpq/q2c/quote/pricing | \`opspal-salesforce:sfdc-cpq-assessor\` |
| revops/pipeline/forecast | \`opspal-salesforce:sfdc-revops-auditor\` |
| automation audit/flow audit | \`opspal-salesforce:sfdc-automation-auditor\` |
| permission set | \`opspal-salesforce:sfdc-permission-orchestrator\` |
| report/dashboard | \`opspal-salesforce:sfdc-reports-dashboards\` |
| import/export data | \`opspal-salesforce:sfdc-data-operations\` |
| diagram/flowchart/ERD | \`opspal-core:diagram-generator\` |
| territory | \`opspal-salesforce:sfdc-territory-orchestrator\` |
| hubspot workflow | \`opspal-hubspot:hubspot-workflow-builder\` |
| intake/kickoff/new project/scope | \`opspal-core:intelligent-intake-orchestrator\` |

`;
  }

  content += `**Full routing tables**: See \`docs/routing-help.md\`

### Self-Check Before Every Task

1. Does this task match ANY pattern in the routing tables above?
2. If in **Mandatory Routing** → MUST use Agent tool
3. If in **Recommended Routing** → Use Agent tool for best results
4. If NO match → Proceed with direct execution

### Plugin Documentation

`;

  // Filter to opspal-* plugins only (avoid duplicates from legacy plugin names)
  // and only include plugins with USAGE.md in the local project
  const pluginsWithUsage = plugins.filter(p => {
    if (!p.usageMdPath) return false;
    // Prefer opspal-* prefixed plugins over legacy names
    if (!p.name.startsWith('opspal-')) return false;
    // Only include plugins within the project directory
    const relativePath = path.relative(options.projectDir, p.usageMdPath);
    if (relativePath.startsWith('..')) return false;
    return true;
  });

  if (pluginsWithUsage.length > 0) {
    for (const plugin of pluginsWithUsage) {
      // Create relative path from project root
      const relativePath = path.relative(options.projectDir, plugin.usageMdPath);
      const platformName = plugin.name.replace('opspal-', '').replace('-plugin', '');
      content += `- **${capitalize(platformName)}**: @import ${relativePath}\n`;
    }
  } else {
    content += `*No USAGE.md files found in installed plugins.*\n`;
  }

  return content;
}

/**
 * Generate common workflows section
 */
function generateCommonWorkflows(plugins) {
  const platforms = detectPlatforms(plugins);

  let section = `## 🔄 Common Workflows

### Single Platform Operations

`;

 if (platforms.includes('salesforce')) {
    section += `**Salesforce Assessment**:
\`\`\`
1. /reflect context <org>     # Load previous work
2. Agent: sfdc-revops-auditor # Run assessment
3. /work-index add <org>      # Log completion
\`\`\`

`;
  }

  if (platforms.includes('hubspot')) {
    section += `**HubSpot Assessment**:
\`\`\`
1. /reflect context <org>     # Load previous work
2. Agent: hubspot-assessor    # Run assessment
3. /work-index add <org>      # Log completion
\`\`\`

`;
  }

  if (platforms.length > 1) {
    section += `### Cross-Platform Operations

**Multi-Platform Analysis**:
\`\`\`
1. Set ORG_SLUG environment variable
2. Use unified-orchestrator for coordination
3. Individual platform agents for execution
4. unified-reporting-aggregator for combined view
\`\`\``;
  }

  return section;
}

/**
 * Generate customer instance section
 */
function generateInstanceSection() {
  return `## 📂 Working with Customer Instances

### Directory Convention

\`\`\`bash
orgs/
└── acme-corp/                    # Customer org folder
    ├── org.yaml                  # Org metadata (name, industry, contacts)
    ├── platforms/
    │   ├── salesforce/
    │   │   └── production/       # Environment-specific
    │   │       ├── instance.yaml # Platform credentials reference
    │   │       └── assessments/  # Assessment outputs
    │   └── hubspot/
    │       └── portal/
    └── WORK_INDEX.yaml           # All work for this client
\`\`\`

### Environment Variables

| Variable | Purpose |
|----------|---------|
| \`ORG_SLUG\` | Client org identifier (e.g., "acme-corp") |
| \`SF_TARGET_ORG\` | Salesforce org alias |
| \`HUBSPOT_PORTAL_ID\` | HubSpot portal ID |`;
}

/**
 * Generate security section
 */
function generateSecuritySection() {
  return `## 🔒 Security

### Never Commit

- API keys, tokens, or credentials
- \`.env\` files with sensitive data
- Customer data or PII
- Org-specific configuration

### Auto-Generated .gitignore

The \`/initialize\` command creates a \`.gitignore\` that protects:
- \`orgs/*/\` - Customer data
- \`.env*\` - Environment files
- \`*.credentials\` - Auth files
- \`reports/**/data/\` - Raw data exports`;
}

/**
 * Generate troubleshooting section
 */
function generateTroubleshootingSection(plugins) {
  return `## 🔧 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Plugin not loading | \`claude plugin validate <path>\` |
| Agent not routing | Check keywords in \`docs/routing-help.md\` |
| MCP connection failed | \`./scripts/test-mcp-connections.sh\` |
| Hook not triggering | \`/hooks-health\` |
| Missing npm packages | \`/checkdependencies --fix\` |

### Logs & Diagnostics

\`\`\`bash
# Check routing decisions
cat ~/.claude/logs/routing.jsonl | tail -20

# Validate plugin structure
claude plugin validate ./plugins/<plugin-name>

# Test MCP connections
./scripts/test-mcp-connections.sh
\`\`\`

### Getting Help

- Full troubleshooting: \`docs/TROUBLESHOOTING_PLUGIN_LOADING.md\`
- Routing rules: \`docs/routing-help.md\`
- Submit feedback: \`/reflect\``;
}

/**
 * Generate brand gallery and templates section
 */
function generateBrandingSection() {
  return `---

## 🎨 Brand Gallery & Templates

**MANDATORY**: Use RevPal branding for all client-facing outputs.

### Interactive Gallery

Open in browser: \`plugins/opspal-core/templates/branding-gallery/index.html\`

### PDF Cover Templates

| Label | Use For |
|-------|---------|
| \`PDF_COVER_SALESFORCE\` | Automation/metadata/RevOps/CPQ audits |
| \`PDF_COVER_HUBSPOT\` | Portal assessments, workflow audits |
| \`PDF_COVER_MARKETO\` | Marketing automation assessments |
| \`PDF_COVER_EXECUTIVE\` | Executive summaries, benchmarks |
| \`PDF_COVER_SECURITY\` | Permission/compliance reviews |
| \`PDF_COVER_DATA\` | Data quality, dedup reports |
| \`PDF_COVER_GTM\` | GTM planning, revenue modeling |
| \`PDF_COVER_CROSSPLATFORM\` | Multi-platform integration |

### Color Palette (Quick Reference)

| Label | Hex | Usage |
|-------|-----|-------|
| \`REVPAL_GRAPE\` | #5F3B8C | Headings, buttons, links |
| \`REVPAL_APRICOT\` | #E99560 | CTAs, hover states, highlights |
| \`REVPAL_INDIGO\` | #3E4A61 | Subheadings, body emphasis |
| \`REVPAL_SAND\` | #EAE4DC | Page backgrounds, cards |
| \`REVPAL_GREEN\` | #6FBF73 | Success states, checkmarks |
| \`REVPAL_SURFACE\` | #F7F4EF | Content areas, tables |

### Typography

| Label | Font | Usage |
|-------|------|-------|
| \`REVPAL_HEADING_FONT\` | Montserrat (600-800) | H1, H2, H3 |
| \`REVPAL_BODY_FONT\` | Figtree (400-700) | Body text, lists |

### PDF Generation (REQUIRED)

**Always use the branded generator:**

\`\`\`bash
/generate-pdf report.md report.pdf \\
  --theme revpal-brand \\
  --cover salesforce-audit
\`\`\`

**Never use:** \`npx md-to-pdf\` or generic converters for client deliverables.

### Assets

| Label | Path |
|-------|------|
| \`LOGO_PRIMARY\` | \`plugins/opspal-core/templates/branding-gallery/assets/revpal-logo-primary.png\` |
| \`LOGO_ICON\` | \`plugins/opspal-core/templates/branding-gallery/assets/revpal-brand-mark.png\` |
| \`LOGO_EXPORT\` | \`plugins/opspal-core/templates/branding-gallery/assets/revpal-logo-export.png\` |
`;
}

/**
 * Generate footer with stats
 */
function generateFooter(plugins) {
  const today = new Date().toISOString().split('T')[0];

  // Calculate totals
  let totalAgents = 0;
  let totalCommands = 0;
  let totalScripts = 0;
  let totalHooks = 0;

  for (const plugin of plugins) {
    totalAgents += plugin.agentCount || 0;
    totalCommands += plugin.commandCount || 0;
    totalScripts += plugin.scriptCount || 0;
    totalHooks += plugin.hookCount || 0;
  }

  return `---

**Generated by /sync-claudemd** | ${today}

| Metric | Count |
|--------|-------|
| Plugins | ${plugins.length} |
| Agents | ${totalAgents} |
| Commands | ${totalCommands} |
| Scripts | ${totalScripts} |
| Hooks | ${totalHooks} |`;
}

/**
 * Generate the complete CLAUDE.md content
 */
function generateFullClaudeMd(plugins, existingContent = null) {
  const userSections = existingContent ? extractUserEditableSections(existingContent) : {};

  const content = `# CLAUDE.md - OpsPal Plugin Ecosystem

**Auto-generated by /sync-claudemd** | Run \`/sync-claudemd\` to refresh after plugin updates.

---

${generateCriticalRoutingPreamble(plugins)}

---

${generateProjectOverview(userSections)}

---

${generatePluginSection(plugins)}

${generateWorkIndexSection()}

---

${generateProjectStructure(plugins)}

---

${generateQuickStart(plugins)}

---

${generateAgentProtocol(plugins)}

---

${generateCommonWorkflows(plugins)}

---

${generateInstanceSection()}

---

${generateSecuritySection()}

---

${generateTroubleshootingSection(plugins)}

${generateBrandingSection()}

${generateFooter(plugins)}
`;

  return content;
}

/**
 * Main execution
 */
async function main() {
  log('\n╔════════════════════════════════════════════════════════╗');
  log('║   CLAUDE.md Generator v3.0 - Full Procedural Mode      ║');
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
    log(`   /plugin install opspal-core@${marketplaceContext.name}`, colors.dim);
    process.exit(1);
  }

  log(`   Found ${plugins.length} plugin(s):\n`, colors.green);
  for (const plugin of plugins) {
    log(`   ✓ ${plugin.name} v${plugin.version}`, colors.green);
    logVerbose(`     ${plugin.agentCount} agents, ${plugin.commandCount} commands`);
  }

  // Read existing CLAUDE.md to preserve user-editable sections
  const claudeMdPath = path.join(options.projectDir, 'CLAUDE.md');
  let existingContent = null;
  if (fs.existsSync(claudeMdPath)) {
    existingContent = fs.readFileSync(claudeMdPath, 'utf8');
    log('\n📄 Found existing CLAUDE.md - will preserve user-editable sections', colors.blue);
  }

  // Generate complete CLAUDE.md
  log('\n📝 Generating complete CLAUDE.md...', colors.blue);
  const content = generateFullClaudeMd(plugins, existingContent);

  if (!options.dryRun) {
    fs.writeFileSync(claudeMdPath, content, 'utf8');
    log(`\n✅ Generated: ${claudeMdPath}`, colors.green);
  } else {
    log('\n[DRY RUN] Would generate:\n', colors.yellow);
    // Show first 1500 chars as preview
    const preview = content.slice(0, 1500);
    log(preview + '\n\n... [truncated for preview]', colors.dim);
  }

  // Calculate and show stats
  let totalAgents = 0;
  let totalCommands = 0;
  for (const plugin of plugins) {
    totalAgents += plugin.agentCount || 0;
    totalCommands += plugin.commandCount || 0;
  }

  log('\n╔════════════════════════════════════════════════════════╗');
  log('║  ✅ CLAUDE.md Generated Successfully!                  ║');
  log('╚════════════════════════════════════════════════════════╝\n');

  // Calculate routing statistics
  const routes = generateRoutingTable(plugins);
  const mandatoryCount = routes.filter(r => r.isMandatory).length;
  const recommendedCount = routes.filter(r => !r.isMandatory).length;
  const agentsWithKeywords = plugins.reduce((sum, p) =>
    sum + (p.agents || []).filter(a => a.triggerKeywords && a.triggerKeywords.length > 0).length, 0);

  log('📊 Generation Statistics:', colors.magenta);
  log(`   • Plugins: ${plugins.length}`, colors.dim);
  log(`   • Total agents: ${totalAgents}`, colors.dim);
  log(`   • Total commands: ${totalCommands}`, colors.dim);
  log(`   • USAGE.md files found: ${plugins.filter(p => p.usageMdPath).length}`, colors.dim);
  log(`   • Agents with trigger keywords: ${agentsWithKeywords}`, colors.dim);
  log(`   • Mandatory routes: ${mandatoryCount}`, colors.dim);
  log(`   • Recommended routes: ${recommendedCount}`, colors.dim);

  if (existingContent) {
    const userSections = extractUserEditableSections(existingContent);
    const preservedCount = Object.keys(userSections).length;
    if (preservedCount > 0) {
      log(`   • User sections preserved: ${preservedCount}`, colors.cyan);
    }
  }

  log('\n📋 User-Editable Sections:', colors.blue);
  log('   Sections marked with USER_EDITABLE_START/END comments', colors.dim);
  log('   are preserved across regenerations. Currently supported:', colors.dim);
  log('   • project-overview', colors.dim);

  log('\n📋 Next Steps:', colors.blue);
  log('   1. Review the generated CLAUDE.md', colors.dim);
  log('   2. Edit user-editable sections as needed', colors.dim);
  log('   3. Run /sync-claudemd again after plugin updates', colors.dim);

  process.exit(0);
}

main().catch(err => {
  log(`\n❌ Error: ${err.message}`, colors.red);
  if (options.verbose) {
    console.error(err.stack);
  }
  process.exit(1);
});
