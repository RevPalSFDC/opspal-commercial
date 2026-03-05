#!/usr/bin/env node

/**
 * Agent Version Manager (P2-4)
 *
 * Provides semantic versioning for agents with breaking change detection
 * and migration path documentation.
 *
 * Usage:
 *   node agent-version-manager.js list                     # List all agents with versions
 *   node agent-version-manager.js info <agent>             # Show agent version info
 *   node agent-version-manager.js bump <agent> <type>      # Bump version (patch/minor/major)
 *   node agent-version-manager.js changelog <agent>        # Show agent changelog
 *   node agent-version-manager.js breaking [--since v1.0]  # List breaking changes
 *   node agent-version-manager.js migrate <agent> <v1> <v2># Show migration path
 *   node agent-version-manager.js audit                    # Audit all agent versions
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// Configuration
// =============================================================================

const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const PLUGINS_DIR = path.join(PROJECT_ROOT, 'plugins');
const VERSION_REGISTRY_FILE = path.join(__dirname, '../../config/agent-version-registry.json');

// Default version for agents without explicit versioning
const DEFAULT_VERSION = '1.0.0';

// =============================================================================
// Version Parsing & Comparison
// =============================================================================

/**
 * Parses a semantic version string
 * @param {string} version - Version string (e.g., "1.2.3")
 * @returns {Object|null} Parsed version {major, minor, patch}
 */
function parseVersion(version) {
  if (!version) return null;

  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null,
    raw: version
  };
}

/**
 * Formats a version object as a string
 * @param {Object} version - Version object
 * @returns {string} Version string
 */
function formatVersion(version) {
  let str = `${version.major}.${version.minor}.${version.patch}`;
  if (version.prerelease) {
    str += `-${version.prerelease}`;
  }
  return str;
}

/**
 * Compares two versions
 * @param {string} v1 - First version
 * @param {string} v2 - Second version
 * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1, v2) {
  const p1 = parseVersion(v1);
  const p2 = parseVersion(v2);

  if (!p1 || !p2) return 0;

  if (p1.major !== p2.major) return p1.major - p2.major;
  if (p1.minor !== p2.minor) return p1.minor - p2.minor;
  return p1.patch - p2.patch;
}

/**
 * Bumps a version by type
 * @param {string} version - Current version
 * @param {string} type - Bump type (major, minor, patch)
 * @returns {string} New version
 */
function bumpVersion(version, type) {
  const parsed = parseVersion(version) || parseVersion(DEFAULT_VERSION);

  switch (type) {
    case 'major':
      return formatVersion({ major: parsed.major + 1, minor: 0, patch: 0 });
    case 'minor':
      return formatVersion({ major: parsed.major, minor: parsed.minor + 1, patch: 0 });
    case 'patch':
      return formatVersion({ major: parsed.major, minor: parsed.minor, patch: parsed.patch + 1 });
    default:
      throw new Error(`Invalid bump type: ${type}. Use major, minor, or patch.`);
  }
}

// =============================================================================
// Registry Management
// =============================================================================

/**
 * Loads the version registry
 * @returns {Object} Registry object
 */
function loadRegistry() {
  if (fs.existsSync(VERSION_REGISTRY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(VERSION_REGISTRY_FILE, 'utf8'));
    } catch (e) {
      console.error(`Failed to load registry: ${e.message}`);
    }
  }

  // Create default registry
  return {
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    agents: {}
  };
}

/**
 * Saves the version registry
 * @param {Object} registry - Registry to save
 */
function saveRegistry(registry) {
  registry.lastUpdated = new Date().toISOString();
  const dir = path.dirname(VERSION_REGISTRY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(VERSION_REGISTRY_FILE, JSON.stringify(registry, null, 2));
}

// =============================================================================
// Agent Discovery
// =============================================================================

/**
 * Discovers all agents across plugins
 * @returns {Array} Array of agent info objects
 */
function discoverAgents() {
  const agents = [];

  if (!fs.existsSync(PLUGINS_DIR)) {
    return agents;
  }

  const plugins = fs.readdirSync(PLUGINS_DIR).filter(d => {
    const pluginPath = path.join(PLUGINS_DIR, d);
    return fs.statSync(pluginPath).isDirectory();
  });

  for (const plugin of plugins) {
    const agentsDir = path.join(PLUGINS_DIR, plugin, 'agents');
    if (!fs.existsSync(agentsDir)) continue;

    const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));

    for (const file of agentFiles) {
      const agentPath = path.join(agentsDir, file);
      const content = fs.readFileSync(agentPath, 'utf8');

      // Parse frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) continue;

      const frontmatter = frontmatterMatch[1];
      const nameMatch = frontmatter.match(/name:\s*["']?([^"'\n]+)["']?/);
      const versionMatch = frontmatter.match(/version:\s*["']?([^"'\n]+)["']?/);
      const descMatch = frontmatter.match(/description:\s*["']?([^"'\n]+)["']?/);

      const agentName = nameMatch ? nameMatch[1].trim() : file.replace('.md', '');
      const fullName = `${plugin}:${agentName}`;

      agents.push({
        fullName,
        plugin,
        shortName: agentName,
        version: versionMatch ? versionMatch[1].trim() : null,
        description: descMatch ? descMatch[1].trim() : null,
        path: agentPath
      });
    }
  }

  return agents;
}

/**
 * Extracts version from agent frontmatter
 * @param {string} agentPath - Path to agent file
 * @returns {string|null} Version or null
 */
function extractAgentVersion(agentPath) {
  if (!fs.existsSync(agentPath)) return null;

  const content = fs.readFileSync(agentPath, 'utf8');
  const match = content.match(/version:\s*["']?([^"'\n]+)["']?/);
  return match ? match[1].trim() : null;
}

// =============================================================================
// Breaking Change Detection
// =============================================================================

/**
 * Detects breaking changes between versions
 * @param {Object} oldVersion - Old agent config
 * @param {Object} newVersion - New agent config
 * @returns {Array} List of breaking changes
 */
function detectBreakingChanges(oldVersion, newVersion) {
  const changes = [];

  // Check required tools changes
  const oldTools = oldVersion.requiredTools || [];
  const newTools = newVersion.requiredTools || [];
  const removedTools = oldTools.filter(t => !newTools.includes(t));
  if (removedTools.length > 0) {
    changes.push({
      type: 'removed_tools',
      severity: 'major',
      message: `Removed required tools: ${removedTools.join(', ')}`,
      migration: 'Update tool dependencies or find alternatives'
    });
  }

  // Check input schema changes
  if (oldVersion.inputSchema && newVersion.inputSchema) {
    const oldRequired = oldVersion.inputSchema.required || [];
    const newRequired = newVersion.inputSchema.required || [];
    const addedRequired = newRequired.filter(r => !oldRequired.includes(r));
    if (addedRequired.length > 0) {
      changes.push({
        type: 'added_required_input',
        severity: 'major',
        message: `New required inputs: ${addedRequired.join(', ')}`,
        migration: 'Ensure callers provide the new required parameters'
      });
    }
  }

  // Check output format changes
  if (oldVersion.outputFormat !== newVersion.outputFormat) {
    changes.push({
      type: 'output_format_changed',
      severity: 'major',
      message: `Output format changed from ${oldVersion.outputFormat} to ${newVersion.outputFormat}`,
      migration: 'Update consumers to handle new output format'
    });
  }

  // Check behavior changes (from changelog)
  if (newVersion.changelog) {
    for (const entry of newVersion.changelog) {
      if (entry.breaking) {
        changes.push({
          type: 'behavior_change',
          severity: 'major',
          message: entry.description,
          migration: entry.migration || 'Review agent documentation for migration steps'
        });
      }
    }
  }

  return changes;
}

/**
 * Gets all breaking changes since a version
 * @param {string} agentName - Agent name
 * @param {string} sinceVersion - Version to check from
 * @returns {Array} Breaking changes
 */
function getBreakingChangesSince(agentName, sinceVersion) {
  const registry = loadRegistry();
  const agentData = registry.agents[agentName];

  if (!agentData || !agentData.history) {
    return [];
  }

  const changes = [];
  const parsedSince = parseVersion(sinceVersion);

  for (const entry of agentData.history) {
    const parsedEntry = parseVersion(entry.version);
    if (parsedEntry && parsedSince && compareVersions(entry.version, sinceVersion) > 0) {
      if (entry.breaking) {
        changes.push({
          version: entry.version,
          date: entry.date,
          changes: entry.breaking
        });
      }
    }
  }

  return changes;
}

// =============================================================================
// Migration Paths
// =============================================================================

/**
 * Generates migration path between versions
 * @param {string} agentName - Agent name
 * @param {string} fromVersion - Starting version
 * @param {string} toVersion - Target version
 * @returns {Object} Migration guide
 */
function generateMigrationPath(agentName, fromVersion, toVersion) {
  const registry = loadRegistry();
  const agentData = registry.agents[agentName];

  if (!agentData) {
    return {
      agent: agentName,
      from: fromVersion,
      to: toVersion,
      steps: [],
      error: 'Agent not found in registry'
    };
  }

  const breakingChanges = [];
  const migrationSteps = [];

  // Collect all breaking changes between versions
  if (agentData.history) {
    for (const entry of agentData.history) {
      if (compareVersions(entry.version, fromVersion) > 0 &&
          compareVersions(entry.version, toVersion) <= 0) {
        if (entry.breaking) {
          breakingChanges.push({
            version: entry.version,
            changes: entry.breaking
          });
        }
        if (entry.migrationSteps) {
          migrationSteps.push({
            version: entry.version,
            steps: entry.migrationSteps
          });
        }
      }
    }
  }

  return {
    agent: agentName,
    from: fromVersion,
    to: toVersion,
    hasBreakingChanges: breakingChanges.length > 0,
    breakingChanges,
    migrationSteps,
    summary: breakingChanges.length > 0
      ? `${breakingChanges.length} breaking change(s) require migration`
      : 'No breaking changes, direct upgrade recommended'
  };
}

// =============================================================================
// Audit Functions
// =============================================================================

/**
 * Audits all agent versions
 * @returns {Object} Audit results
 */
function auditVersions() {
  const agents = discoverAgents();
  const registry = loadRegistry();

  const results = {
    total: agents.length,
    versioned: 0,
    unversioned: 0,
    outdatedRegistry: 0,
    missingFromRegistry: 0,
    details: []
  };

  for (const agent of agents) {
    const registryData = registry.agents[agent.fullName];
    const fileVersion = agent.version;
    const registryVersion = registryData?.currentVersion;

    const detail = {
      name: agent.fullName,
      fileVersion,
      registryVersion,
      status: 'ok'
    };

    if (!fileVersion) {
      results.unversioned++;
      detail.status = 'unversioned';
      detail.recommendation = 'Add version to agent frontmatter';
    } else {
      results.versioned++;
    }

    if (!registryData) {
      results.missingFromRegistry++;
      detail.status = detail.status === 'ok' ? 'missing_from_registry' : detail.status;
      detail.recommendation = detail.recommendation || 'Add agent to version registry';
    } else if (fileVersion && registryVersion && fileVersion !== registryVersion) {
      results.outdatedRegistry++;
      detail.status = 'version_mismatch';
      detail.recommendation = `Sync registry (file: ${fileVersion}, registry: ${registryVersion})`;
    }

    results.details.push(detail);
  }

  results.healthy = results.unversioned === 0 &&
                    results.outdatedRegistry === 0 &&
                    results.missingFromRegistry === 0;

  return results;
}

/**
 * Syncs registry with discovered agents
 * @returns {Object} Sync results
 */
function syncRegistry() {
  const agents = discoverAgents();
  const registry = loadRegistry();
  const changes = [];

  for (const agent of agents) {
    if (!registry.agents[agent.fullName]) {
      registry.agents[agent.fullName] = {
        currentVersion: agent.version || DEFAULT_VERSION,
        plugin: agent.plugin,
        shortName: agent.shortName,
        firstTracked: new Date().toISOString(),
        history: [{
          version: agent.version || DEFAULT_VERSION,
          date: new Date().toISOString(),
          description: 'Initial tracking'
        }]
      };
      changes.push({ type: 'added', agent: agent.fullName });
    } else if (agent.version && registry.agents[agent.fullName].currentVersion !== agent.version) {
      const oldVersion = registry.agents[agent.fullName].currentVersion;
      registry.agents[agent.fullName].currentVersion = agent.version;
      registry.agents[agent.fullName].history = registry.agents[agent.fullName].history || [];
      registry.agents[agent.fullName].history.push({
        version: agent.version,
        date: new Date().toISOString(),
        description: `Updated from ${oldVersion}`,
        previousVersion: oldVersion
      });
      changes.push({ type: 'updated', agent: agent.fullName, from: oldVersion, to: agent.version });
    }
  }

  if (changes.length > 0) {
    saveRegistry(registry);
  }

  return {
    totalAgents: agents.length,
    changes,
    changeCount: changes.length
  };
}

// =============================================================================
// CLI Interface
// =============================================================================

function printHelp() {
  console.log(`
Agent Version Manager - Semantic versioning for agents

Usage:
  node agent-version-manager.js <command> [options]

Commands:
  list                          List all agents with versions
  info <agent>                  Show detailed agent version info
  bump <agent> <type>           Bump version (patch, minor, major)
  changelog <agent>             Show agent changelog
  breaking [--since <version>]  List breaking changes
  migrate <agent> <v1> <v2>     Show migration path between versions
  audit                         Audit all agent versions
  sync                          Sync registry with discovered agents

Options:
  --json                        Output as JSON
  --plugin <name>               Filter by plugin

Examples:
  node agent-version-manager.js list
  node agent-version-manager.js info opspal-salesforce:sfdc-cpq-assessor
  node agent-version-manager.js bump opspal-salesforce:sfdc-cpq-assessor minor
  node agent-version-manager.js audit
  node agent-version-manager.js sync
`);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const isJson = args.includes('--json');

  // Get plugin filter if specified
  const pluginIdx = args.indexOf('--plugin');
  const pluginFilter = pluginIdx !== -1 ? args[pluginIdx + 1] : null;

  switch (command) {
    case 'list': {
      const agents = discoverAgents();
      const registry = loadRegistry();

      const filtered = pluginFilter
        ? agents.filter(a => a.plugin === pluginFilter)
        : agents;

      if (isJson) {
        console.log(JSON.stringify(filtered, null, 2));
      } else {
        console.log(`\n📦 Agent Versions (${filtered.length} agents)\n`);
        console.log('| Agent | Version | Plugin |');
        console.log('|-------|---------|--------|');

        for (const agent of filtered) {
          const version = agent.version || registry.agents[agent.fullName]?.currentVersion || 'N/A';
          console.log(`| ${agent.shortName} | ${version} | ${agent.plugin} |`);
        }
      }
      break;
    }

    case 'info': {
      const agentName = args[1];
      if (!agentName) {
        console.error('Usage: info <agent-name>');
        process.exit(1);
      }

      const agents = discoverAgents();
      const registry = loadRegistry();

      // Find agent by full name or short name
      const agent = agents.find(a =>
        a.fullName === agentName || a.shortName === agentName
      );

      if (!agent) {
        console.error(`Agent not found: ${agentName}`);
        process.exit(1);
      }

      const registryData = registry.agents[agent.fullName];

      const info = {
        ...agent,
        registryData
      };

      if (isJson) {
        console.log(JSON.stringify(info, null, 2));
      } else {
        console.log(`\n🤖 Agent: ${agent.fullName}\n`);
        console.log(`  Plugin:      ${agent.plugin}`);
        console.log(`  Version:     ${agent.version || 'Not versioned'}`);
        console.log(`  Description: ${agent.description || 'N/A'}`);
        console.log(`  Path:        ${agent.path}`);

        if (registryData?.history?.length > 0) {
          console.log('\n  Version History:');
          for (const entry of registryData.history.slice(-5)) {
            console.log(`    ${entry.version} (${entry.date.split('T')[0]}): ${entry.description || 'No description'}`);
          }
        }
      }
      break;
    }

    case 'bump': {
      const agentName = args[1];
      const bumpType = args[2];

      if (!agentName || !bumpType) {
        console.error('Usage: bump <agent-name> <patch|minor|major>');
        process.exit(1);
      }

      if (!['patch', 'minor', 'major'].includes(bumpType)) {
        console.error('Bump type must be: patch, minor, or major');
        process.exit(1);
      }

      const agents = discoverAgents();
      const agent = agents.find(a =>
        a.fullName === agentName || a.shortName === agentName
      );

      if (!agent) {
        console.error(`Agent not found: ${agentName}`);
        process.exit(1);
      }

      const currentVersion = agent.version || DEFAULT_VERSION;
      const newVersion = bumpVersion(currentVersion, bumpType);

      if (isJson) {
        console.log(JSON.stringify({
          agent: agent.fullName,
          oldVersion: currentVersion,
          newVersion,
          bumpType
        }, null, 2));
      } else {
        console.log(`\n📦 Version Bump: ${agent.fullName}`);
        console.log(`  ${currentVersion} → ${newVersion} (${bumpType})`);
        console.log(`\nTo apply, update the agent frontmatter:`);
        console.log(`  version: "${newVersion}"`);
        console.log(`\nThen run: node agent-version-manager.js sync`);
      }
      break;
    }

    case 'changelog': {
      const agentName = args[1];
      if (!agentName) {
        console.error('Usage: changelog <agent-name>');
        process.exit(1);
      }

      const registry = loadRegistry();
      const agents = discoverAgents();
      const agent = agents.find(a =>
        a.fullName === agentName || a.shortName === agentName
      );

      const fullName = agent?.fullName || agentName;
      const agentData = registry.agents[fullName];

      if (!agentData?.history) {
        console.log(`No changelog found for: ${agentName}`);
        break;
      }

      if (isJson) {
        console.log(JSON.stringify(agentData.history, null, 2));
      } else {
        console.log(`\n📜 Changelog: ${fullName}\n`);
        for (const entry of agentData.history.reverse()) {
          const breaking = entry.breaking ? ' ⚠️ BREAKING' : '';
          console.log(`v${entry.version} (${entry.date.split('T')[0]})${breaking}`);
          console.log(`  ${entry.description || 'No description'}`);
          if (entry.breaking) {
            for (const change of entry.breaking) {
              console.log(`  - BREAKING: ${change}`);
            }
          }
          console.log('');
        }
      }
      break;
    }

    case 'breaking': {
      const sinceIdx = args.indexOf('--since');
      const sinceVersion = sinceIdx !== -1 ? args[sinceIdx + 1] : '0.0.0';

      const registry = loadRegistry();
      const allBreaking = [];

      for (const [agentName, data] of Object.entries(registry.agents)) {
        if (data.history) {
          for (const entry of data.history) {
            if (entry.breaking && compareVersions(entry.version, sinceVersion) > 0) {
              allBreaking.push({
                agent: agentName,
                version: entry.version,
                date: entry.date,
                changes: entry.breaking
              });
            }
          }
        }
      }

      if (isJson) {
        console.log(JSON.stringify(allBreaking, null, 2));
      } else {
        console.log(`\n⚠️ Breaking Changes (since v${sinceVersion})\n`);
        if (allBreaking.length === 0) {
          console.log('No breaking changes found.');
        } else {
          for (const item of allBreaking) {
            console.log(`${item.agent} v${item.version} (${item.date.split('T')[0]})`);
            for (const change of item.changes) {
              console.log(`  - ${change}`);
            }
            console.log('');
          }
        }
      }
      break;
    }

    case 'migrate': {
      const agentName = args[1];
      const fromVersion = args[2];
      const toVersion = args[3];

      if (!agentName || !fromVersion || !toVersion) {
        console.error('Usage: migrate <agent-name> <from-version> <to-version>');
        process.exit(1);
      }

      const migrationPath = generateMigrationPath(agentName, fromVersion, toVersion);

      if (isJson) {
        console.log(JSON.stringify(migrationPath, null, 2));
      } else {
        console.log(`\n🔄 Migration: ${agentName}`);
        console.log(`   ${fromVersion} → ${toVersion}\n`);
        console.log(`Summary: ${migrationPath.summary}\n`);

        if (migrationPath.breakingChanges.length > 0) {
          console.log('Breaking Changes:');
          for (const bc of migrationPath.breakingChanges) {
            console.log(`  v${bc.version}:`);
            for (const change of bc.changes) {
              console.log(`    - ${change}`);
            }
          }
          console.log('');
        }

        if (migrationPath.migrationSteps.length > 0) {
          console.log('Migration Steps:');
          for (const ms of migrationPath.migrationSteps) {
            console.log(`  v${ms.version}:`);
            for (const step of ms.steps) {
              console.log(`    ${step}`);
            }
          }
        }
      }
      break;
    }

    case 'audit': {
      const results = auditVersions();

      if (isJson) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log(`\n🔍 Agent Version Audit\n`);
        console.log(`Total Agents:        ${results.total}`);
        console.log(`Versioned:           ${results.versioned}`);
        console.log(`Unversioned:         ${results.unversioned}`);
        console.log(`Missing from Registry: ${results.missingFromRegistry}`);
        console.log(`Version Mismatches:  ${results.outdatedRegistry}`);
        console.log('');

        const issues = results.details.filter(d => d.status !== 'ok');
        if (issues.length > 0) {
          console.log('Issues Found:');
          for (const issue of issues.slice(0, 20)) {
            console.log(`  ⚠️  ${issue.name}: ${issue.status}`);
            if (issue.recommendation) {
              console.log(`      → ${issue.recommendation}`);
            }
          }
          if (issues.length > 20) {
            console.log(`  ... and ${issues.length - 20} more`);
          }
        } else {
          console.log('✅ All agents properly versioned and in sync.');
        }
      }
      break;
    }

    case 'sync': {
      const results = syncRegistry();

      if (isJson) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log(`\n🔄 Registry Sync\n`);
        console.log(`Total Agents: ${results.totalAgents}`);
        console.log(`Changes:      ${results.changeCount}\n`);

        if (results.changes.length > 0) {
          for (const change of results.changes) {
            if (change.type === 'added') {
              console.log(`  + Added: ${change.agent}`);
            } else if (change.type === 'updated') {
              console.log(`  ~ Updated: ${change.agent} (${change.from} → ${change.to})`);
            }
          }
        } else {
          console.log('No changes needed - registry is up to date.');
        }
      }
      break;
    }

    case 'help':
    case '--help':
      printHelp();
      break;

    default:
      printHelp();
      process.exit(1);
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  parseVersion,
  formatVersion,
  compareVersions,
  bumpVersion,
  loadRegistry,
  saveRegistry,
  discoverAgents,
  detectBreakingChanges,
  getBreakingChangesSince,
  generateMigrationPath,
  auditVersions,
  syncRegistry
};

// Run if executed directly
if (require.main === module) {
  main();
}
