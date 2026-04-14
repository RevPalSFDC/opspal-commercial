#!/usr/bin/env node
/**
 * sync-claudemd.js - Section-ownership CLAUDE.md merge engine
 *
 * Generates plugin-managed CLAUDE.md content and merges it with user-owned
 * sections. User content is never silently destroyed.
 *
 * Usage:
 *   node sync-claudemd.js [options]
 *
 * Options:
 *   --project-dir=<path>        Target project directory (default: current directory)
 *   --dry-run                   Show what would change without writing
 *   --verbose                   Show detailed output
 *   --mode=interactive          Guided merge with review (default)
 *   --mode=non-interactive      Safe merge only, defer conflicts
 *   --force                     Overwrite even on conflicts (backup first)
 *   --rollback                  Restore from most recent backup
 *
 * @version 4.0.0
 * @date 2026-04-09
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveMarketplaceContext } = require('./marketplace-config');
const sectionParser = require('./claudemd-section-parser');

// Parse command line arguments
const args = process.argv.slice(2);

function parseMode() {
  const modeArg = args.find(a => a.startsWith('--mode='));
  if (modeArg) return modeArg.split('=')[1];
  if (args.includes('--non-interactive')) return 'non-interactive';
  return 'interactive';
}

const options = {
  projectDir: process.cwd(),
  dryRun: args.includes('--dry-run'),
  verbose: args.includes('--verbose'),
  mode: parseMode(),
  force: args.includes('--force'),
  rollback: args.includes('--rollback')
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
 * Generate agent routing guidance - placed FIRST in CLAUDE.md for visibility.
 * Uses task-characteristic matching instead of keyword tables.
 * Dynamic per-prompt routing is handled by hooks (unified-router.sh, user-prompt-reminder.sh).
 */
function generateCriticalRoutingPreamble(plugins) {
  const routes = generateRoutingTable(plugins);

  // Build domain table from discovered mandatory agents, grouped by platform
  const domainGroups = {};
  for (const route of routes.filter(r => r.isMandatory).slice(0, 20)) {
    const plugin = route.agent.split(':')[0].replace('opspal-', '');
    if (!domainGroups[plugin]) domainGroups[plugin] = [];
    domainGroups[plugin].push(route);
  }

  let domainTable = '';
  for (const [domain, domainRoutes] of Object.entries(domainGroups)) {
    const agentList = domainRoutes.slice(0, 4).map(r => `\`${r.agent.split(':')[1]}\``).join(', ');
    const useFor = domainRoutes.slice(0, 4).map(r => r.keywords).join('; ');
    domainTable += `| ${capitalize(domain)} | ${agentList} | ${useFor} |\n`;
  }

  // Fallback if no agents discovered
  if (!domainTable) {
    domainTable = `| Salesforce | \`sfdc-orchestrator\`, \`sfdc-cpq-assessor\`, \`sfdc-revops-auditor\` | CPQ, RevOps, deployments, permissions |
| HubSpot | \`hubspot-orchestrator\`, \`hubspot-assessment-analyzer\` | Assessments, workflows, contact management |
| Marketo | \`marketo-orchestrator\`, \`marketo-campaign-builder\` | Campaigns, programs, lead scoring |
| Cross-platform | \`diagram-generator\`, \`release-coordinator\` | Diagrams, production deploys, reporting |
`;
  }

  return `## Agent Routing

Before executing complex work directly, check whether a specialist agent should handle it.
Use \`Agent(subagent_type='plugin:agent-name', prompt=<request>)\` when:

- The task is **multi-step** (discovery, analysis, implementation, verification)
- The task involves **data mutation** (imports, upserts, bulk updates, deploys)
- The task is an **assessment or audit** (CPQ, RevOps, automation, permissions, HubSpot)
- The task spans **multiple systems** (SF + HubSpot, cross-platform reporting)
- The task requires **domain expertise** (territory models, lead scoring, flow authoring)

Skip agent routing for simple SOQL queries, file reads, status checks, narrow single-file edits, and conversational responses.

### Available specialist domains

| Domain | Key agents | Use for |
|--------|-----------|---------|
${domainTable}
Use fully-qualified names only (e.g., \`opspal-salesforce:sfdc-orchestrator\`).
Runtime hooks provide per-prompt routing guidance — follow those when they appear in system reminders.
Override: \`[DIRECT]\` to skip routing.`;
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

  // Only show recommended (non-mandatory) routes here.
  // Mandatory routing is already in the Critical Routing Preamble at the top
  // of CLAUDE.md — duplicating it wastes tokens and creates maintenance drift.
  const optionalRoutes = routes.filter(r => !r.isMandatory).slice(0, 15);

  let content = `## Plugin Documentation & Additional Agents

The Agent Routing section at the top of this file covers when and how to use specialists.
For the complete routing table with all patterns, see \`docs/routing-help.md\`.

### Per-Plugin References

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
  return `## Branding

Use RevPal branding for all client-facing outputs. Use \`/generate-pdf\` with \`--theme revpal-brand\` — never \`npx md-to-pdf\` directly.

- **Gallery**: \`plugins/opspal-core/templates/branding-gallery/index.html\`
- **Colors**: Grape #5F3B8C (primary), Apricot #E99560 (accent), Indigo #3E4A61 (text), Sand #EAE4DC (background)
- **Fonts**: Montserrat (headings), Figtree (body)
- **Covers**: salesforce-audit, hubspot-assessment, executive-report, security-audit, data-quality, gtm-planning, cross-platform-integration`;
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

const SYNC_VERSION = '4.0.0';

/**
 * Generate plugin sections as a Map for the merge engine.
 * Each entry: [sectionName, { content, version }]
 */
function generateSectionMap(plugins) {
  const sections = new Map();
  const v = SYNC_VERSION;

  sections.set('header', { version: v, content: `# CLAUDE.md - OpsPal Plugin Ecosystem

**Auto-generated by /sync-claudemd v${v}** | Run \`/sync-claudemd\` to refresh after plugin updates.

---` });

  sections.set('critical-routing', { version: v, content: generateCriticalRoutingPreamble(plugins) });
  sections.set('installed-plugins', { version: v, content: generatePluginSection(plugins) });
  sections.set('work-index', { version: v, content: generateWorkIndexSection() });
  sections.set('project-structure', { version: v, content: generateProjectStructure(plugins) });
  sections.set('quick-start', { version: v, content: generateQuickStart(plugins) });
  sections.set('agent-protocol', { version: v, content: generateAgentProtocol(plugins) });
  sections.set('common-workflows', { version: v, content: generateCommonWorkflows(plugins) });
  sections.set('instance-guide', { version: v, content: generateInstanceSection() });
  sections.set('security', { version: v, content: generateSecuritySection() });
  sections.set('troubleshooting', { version: v, content: generateTroubleshootingSection(plugins) });
  sections.set('branding', { version: v, content: generateBrandingSection() });
  sections.set('footer', { version: v, content: generateFooter(plugins) });

  return sections;
}

/**
 * Generate the complete CLAUDE.md content (legacy flat-string mode for first-time generation)
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
 * Generate a first-time CLAUDE.md with managed markers wrapping each section
 * and a user-section for project-overview.
 */
function generateFirstTimeClaudeMd(plugins) {
  const sectionMap = generateSectionMap(plugins);
  const parts = [];

  for (const [name, section] of sectionMap) {
    parts.push(sectionParser.generateManagedBlock(name, section.content, section.version));
  }

  // Insert project-overview as user-section after header
  const defaultOverview = `This file provides guidance for using OpsPal plugins with Claude Code.
Full routing tables and examples: \`docs/routing-help.md\``;

  const headerIdx = 0;
  parts.splice(headerIdx + 1, 0, sectionParser.generateUserSectionBlock('project-overview', defaultOverview));

  return parts.join('\n\n---\n\n');
}

/**
 * Main execution
 */
async function main() {
  const claudeMdPath = path.join(options.projectDir, 'CLAUDE.md');

  // Handle --rollback
  if (options.rollback) {
    log('\n📦 Rolling back CLAUDE.md...', colors.blue);
    const backups = sectionParser.listBackups();
    if (backups.length === 0) {
      log('\n⚠️  No backups available to restore.', colors.yellow);
      process.exit(1);
    }
    const latest = backups[backups.length - 1];
    sectionParser.restoreBackup(latest.path, claudeMdPath);
    log(`\n✅ Restored from backup: ${latest.timestamp}${latest.label ? ` (${latest.label})` : ''}`, colors.green);
    process.exit(0);
  }

  log('\n╔════════════════════════════════════════════════════════╗');
  log('║   CLAUDE.md Sync v4.0 - Section Ownership Merge        ║');
  log('╚════════════════════════════════════════════════════════╝\n');

  if (options.dryRun) {
    log('  DRY RUN MODE - No changes will be made\n', colors.yellow);
  }
  if (options.mode === 'non-interactive') {
    logVerbose('Mode: non-interactive (safe merge only, defer conflicts)');
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

  // Read existing CLAUDE.md
  const claudeMdExists = fs.existsSync(claudeMdPath);
  let existingContent = null;
  if (claudeMdExists) {
    existingContent = fs.readFileSync(claudeMdPath, 'utf8');
  }

  // Generate new plugin content as a section map
  log('\n📝 Generating plugin sections...', colors.blue);
  const generatedSections = generateSectionMap(plugins);

  // CASE 1: No existing file — first-time generation
  if (!claudeMdExists) {
    log('\n  No existing CLAUDE.md found — generating fresh file with markers.', colors.blue);
    const content = generateFirstTimeClaudeMd(plugins);

    if (!options.dryRun) {
      fs.writeFileSync(claudeMdPath, content, 'utf8');
      log(`\n✅ Created: ${claudeMdPath}`, colors.green);
    } else {
      log('\n[DRY RUN] Would create CLAUDE.md with managed markers.\n', colors.yellow);
    }

    logStats(plugins);
    log('\n📋 Next Steps:', colors.blue);
    log('   1. Edit the "project-overview" section with your project details', colors.dim);
    log('   2. Add custom sections with <!-- USER_SECTION name="..." --> markers', colors.dim);
    log('   3. Run /sync-claudemd after plugin updates — your content is safe', colors.dim);
    process.exit(0);
  }

  // CASE 2: Existing file — detect format and merge
  const formatInfo = sectionParser.detectLegacyFormat(existingContent);
  const existingSections = sectionParser.parseSections(existingContent);

  if (formatInfo.hasManagedMarkers) {
    // File already has v4 markers — normal merge
    log('\n📄 Found existing CLAUDE.md with section markers — merging...', colors.blue);
  } else {
    // Legacy or user-authored file — all content is user-verbatim
    log('\n📄 Found existing CLAUDE.md without managed markers (pre-v4 or user-authored).', colors.blue);
    if (options.mode === 'non-interactive') {
      log('   Non-interactive mode: deferring sync to protect your content.', colors.yellow);
      sectionParser.createBackup(claudeMdPath, { label: 'pre-migration', trigger: 'auto-sync-deferred' });
      sectionParser.writePendingReview({
        reason: 'legacy-no-markers',
        timestamp: new Date().toISOString(),
        claudeMdPath,
        sectionCount: existingSections.length
      });
      // Output structured JSON for hook callers to parse
      const result = JSON.stringify({
        status: 'deferred',
        reason: 'legacy-no-markers',
        message: 'CLAUDE.md sync paused — found custom content that needs review. Run /sync-claudemd to merge safely.'
      });
      console.log(`\n__SYNC_RESULT__${result}`);
      process.exit(0);
    }
    log('   Your content will be preserved — run the interactive review to add protection markers.', colors.cyan);
  }

  // Run the merge
  const mergeResult = sectionParser.mergeClaudeMd(existingSections, generatedSections, {
    mode: options.mode,
    force: options.force
  });

  // Check if non-interactive mode should defer due to unprotected user content
  if (options.mode === 'non-interactive' && mergeResult.hasUserVerbatim) {
    log('\n⚠️  Unprotected user content detected — deferring sync.', colors.yellow);
    sectionParser.createBackup(claudeMdPath, { label: 'pre-deferred', trigger: 'auto-sync-deferred' });
    sectionParser.writePendingReview({
      reason: 'untagged-content',
      timestamp: new Date().toISOString(),
      claudeMdPath,
      verbatimSections: mergeResult.skipped.filter(s => s.type === 'user-verbatim')
    });
    const result = JSON.stringify({
      status: 'deferred',
      reason: 'untagged-content',
      message: 'CLAUDE.md sync paused — found custom content that needs review. Run /sync-claudemd to merge safely.'
    });
    console.log(`\n__SYNC_RESULT__${result}`);
    process.exit(0);
  }

  // Show diff report
  const report = sectionParser.formatDiffReport(mergeResult);
  log(report, colors.cyan);

  if (options.dryRun) {
    log('[DRY RUN] No changes written.\n', colors.yellow);
    if (mergeResult.hasUserVerbatim) {
      log('  Note: You have content outside protection markers.', colors.yellow);
      log('  Run /sync-claudemd (without --dry-run) to review and protect it.\n', colors.yellow);
    }
    process.exit(0);
  }

  // Backup before write
  const backupPath = sectionParser.createBackup(claudeMdPath, { trigger: 'sync' });
  if (backupPath) {
    log(`  Backup saved: ${backupPath}`, colors.dim);
  }

  // Write merged content
  fs.writeFileSync(claudeMdPath, mergeResult.merged, 'utf8');

  // Clear any pending reviews since we just synced
  sectionParser.clearPendingReview();

  // Success output
  const updatedCount = mergeResult.changes.filter(c => c.action === 'updated' || c.action === 'updated-conflict').length;
  const preservedCount = mergeResult.skipped.filter(s => s.type === 'user-section').length;

  log('\n╔════════════════════════════════════════════════════════╗');
  log('║  ✅ CLAUDE.md Synced Successfully!                     ║');
  log('╚════════════════════════════════════════════════════════╝\n');

  log(`   ${updatedCount} section(s) updated, ${preservedCount} user section(s) preserved`, colors.green);

  // Output structured JSON for hook callers
  const syncResult = JSON.stringify({
    status: 'synced',
    updated: updatedCount,
    preserved: preservedCount,
    conflicts: mergeResult.conflicts.length,
    message: `CLAUDE.md synced (${updatedCount} sections updated, ${preservedCount} user sections preserved).`
  });
  console.log(`\n__SYNC_RESULT__${syncResult}`);

  logStats(plugins);

  log('\n📋 Next Steps:', colors.blue);
  log('   1. Review the updated CLAUDE.md', colors.dim);
  if (mergeResult.hasUserVerbatim) {
    log('   2. Protect your custom content: wrap in <!-- USER_SECTION --> markers', colors.yellow);
  }
  log(`   ${mergeResult.hasUserVerbatim ? '3' : '2'}. Run /sync-claudemd --rollback to undo if needed`, colors.dim);

  process.exit(0);
}

/**
 * Print plugin statistics
 */
function logStats(plugins) {
  let totalAgents = 0;
  let totalCommands = 0;
  for (const plugin of plugins) {
    totalAgents += plugin.agentCount || 0;
    totalCommands += plugin.commandCount || 0;
  }

  const routes = generateRoutingTable(plugins);
  const mandatoryCount = routes.filter(r => r.isMandatory).length;
  const recommendedCount = routes.filter(r => !r.isMandatory).length;

  log('\n📊 Statistics:', colors.magenta);
  log(`   • Plugins: ${plugins.length}`, colors.dim);
  log(`   • Agents: ${totalAgents}`, colors.dim);
  log(`   • Commands: ${totalCommands}`, colors.dim);
  log(`   • Mandatory routes: ${mandatoryCount}`, colors.dim);
  log(`   • Recommended routes: ${recommendedCount}`, colors.dim);
}

main().catch(err => {
  log(`\n❌ Error: ${err.message}`, colors.red);
  if (options.verbose) {
    console.error(err.stack);
  }
  process.exit(1);
});
