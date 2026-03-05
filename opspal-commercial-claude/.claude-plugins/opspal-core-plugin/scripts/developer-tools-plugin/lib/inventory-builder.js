#!/usr/bin/env node

/**
 * inventory-builder.js
 *
 * Auto-generates agent INVENTORY from plugin frontmatter + profiler data.
 * Used by Supervisor-Auditor to select best agents for tasks.
 *
 * @module inventory-builder
 */

const fs = require('fs');
const path = require('path');
const { DataAccessError } = require('../../../cross-platform-plugin/scripts/lib/data-access-error');

/**
 * Parse agent frontmatter (YAML-like format)
 * @param {string} content - File content
 * @returns {object|null} Parsed frontmatter
 */
function parseAgentFrontmatter(content) {
  if (!content || typeof content !== 'string') {
    return null;
  }

  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return null;
  }

  const frontmatter = {};
  const lines = match[1].split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim();
    const value = line.substring(colonIndex + 1).trim();

    if (key && value) {
      frontmatter[key] = value;
    }
  }

  return frontmatter;
}

/**
 * Extract strengths from agent description using keyword analysis
 * @param {string} description - Agent description
 * @param {string} agentName - Agent name for pattern matching
 * @returns {array} Array of strengths
 */
function extractStrengths(description, agentName) {
  const strengths = [];

  // Common capability keywords
  const capabilityPatterns = [
    { pattern: /\b(deploy|deployment|package|release)\b/i, strength: 'deployments' },
    { pattern: /\b(metadata|field|object|custom)\b/i, strength: 'metadata management' },
    { pattern: /\b(query|SOQL|SOSL|data)\b/i, strength: 'data queries' },
    { pattern: /\b(bulk|mass|batch|large)\b/i, strength: 'bulk operations' },
    { pattern: /\b(report|dashboard|analytics)\b/i, strength: 'reporting' },
    { pattern: /\b(permission|security|profile|access)\b/i, strength: 'security' },
    { pattern: /\b(apex|trigger|class|test)\b/i, strength: 'apex development' },
    { pattern: /\b(flow|workflow|automation|process)\b/i, strength: 'automation' },
    { pattern: /\b(conflict|error|fix|resolve)\b/i, strength: 'troubleshooting' },
    { pattern: /\b(orchestrat|coordinat|complex)\b/i, strength: 'orchestration' },
    { pattern: /\b(plan|design|strategy|architect)\b/i, strength: 'planning' },
    { pattern: /\b(performance|optim|speed|fast)\b/i, strength: 'performance' },
    { pattern: /\b(dependency|relationship|circular)\b/i, strength: 'dependency analysis' },
    { pattern: /\b(layout|UI|interface|page)\b/i, strength: 'UI customization' },
    { pattern: /\b(validation|rule|formula)\b/i, strength: 'validation rules' }
  ];

  for (const { pattern, strength } of capabilityPatterns) {
    if (pattern.test(description) && !strengths.includes(strength)) {
      strengths.push(strength);
    }
  }

  // Agent name-based strengths (e.g., sfdc-data-operations → data operations)
  const nameParts = agentName.split('-').slice(1); // Remove prefix (sfdc-, hubspot-)
  const nameStrength = nameParts.join(' ');
  if (nameStrength && !strengths.includes(nameStrength)) {
    strengths.push(nameStrength);
  }

  return strengths.length > 0 ? strengths : ['general operations'];
}

/**
 * Extract weaknesses from agent description
 * @param {string} description - Agent description
 * @returns {array} Array of weaknesses
 */
function extractWeaknesses(description) {
  const weaknesses = [];

  // Look for explicit limitation patterns
  const limitationPatterns = [
    { pattern: /\b(not|don't|doesn't|avoid|cannot)\s+.*?\b(apex|code)\b/i, weakness: 'apex development' },
    { pattern: /\b(not|don't|doesn't|avoid|cannot)\s+.*?\b(metadata)\b/i, weakness: 'metadata operations' },
    { pattern: /\b(not|don't|doesn't|avoid|cannot)\s+.*?\b(production|prod)\b/i, weakness: 'production operations' },
    { pattern: /\bread-only\b/i, weakness: 'write operations' },
    { pattern: /\banalysis only\b/i, weakness: 'execution' }
  ];

  for (const { pattern, weakness } of limitationPatterns) {
    if (pattern.test(description) && !weaknesses.includes(weakness)) {
      weaknesses.push(weakness);
    }
  }

  return weaknesses;
}

/**
 * Calculate latency hint from profiler data
 * @param {number} avgDuration - Average duration in ms
 * @returns {string} Latency hint (low/med/high)
 */
function calculateLatencyHint(avgDuration) {
  if (avgDuration === null || avgDuration === undefined) {
    return 'med'; // Default for agents without profile data
  }

  if (avgDuration < 2000) return 'low';   // < 2s
  if (avgDuration < 10000) return 'med';  // 2-10s
  return 'high';                          // > 10s
}

/**
 * Extract failure modes from profiler data
 * @param {object} profileData - Profiler data for agent
 * @returns {array} Array of failure mode strings
 */
function extractFailureModes(profileData) {
  const modes = [];

  // Default failure modes based on common patterns
  modes.push('timeout');

  // If we have actual failure data, extract specific modes
  // (Future enhancement: parse error messages from profiler)

  return modes;
}

/**
 * Load profiler data for an agent
 * @param {string} agentName - Agent name
 * @param {string} profilerDir - Profiler storage directory
 * @param {string} timeRange - Time range (default: 24h)
 * @returns {object|null} Aggregated profile data
 */
function loadProfilerData(agentName, profilerDir, timeRange = '24h') {
  try {
    const AgentProfiler = require('../../salesforce-plugin/scripts/lib/agent-profiler');
    const profiler = new AgentProfiler({ storageDir: profilerDir });

    const profiles = profiler._loadProfiles(agentName, timeRange);

    if (profiles.length === 0) {
      return null;
    }

    const stats = profiler._aggregateStats(profiles);

    return {
      avgDuration: stats.duration.avg,
      p95Duration: stats.duration.p95,
      successRate: stats.performance.avgScore / 100, // Convert 0-100 to 0-1
      executionCount: profiles.length,
      bottlenecks: stats.bottleneckFrequency
    };
  } catch (error) {
    // Profiler data not available
    return null;
  }
}

/**
 * Scan for all plugins in marketplace
 * @param {string} rootDir - Root directory
 * @returns {array} Array of plugin directory paths
 */
function scanPlugins(rootDir = process.cwd()) {
  const pluginsDir = path.join(rootDir, '.claude-plugins');

  if (!fs.existsSync(pluginsDir)) {
    return [];
  }

  return fs.readdirSync(pluginsDir)
    .map(name => path.join(pluginsDir, name))
    .filter(dir => {
      if (!fs.statSync(dir).isDirectory()) return false;
      const manifestPath = path.join(dir, '.claude-plugin', 'plugin.json');
      return fs.existsSync(manifestPath);
    });
}

/**
 * Scan for agents in a plugin
 * @param {string} pluginDir - Plugin directory
 * @returns {array} Array of agent file paths
 */
function scanAgents(pluginDir) {
  const agentsDir = path.join(pluginDir, 'agents');

  if (!fs.existsSync(agentsDir)) {
    return [];
  }

  return fs.readdirSync(agentsDir)
    .filter(name => name.endsWith('.md'))
    .map(name => path.join(agentsDir, name));
}

/**
 * Build agent entry for INVENTORY
 * @param {string} agentPath - Path to agent file
 * @param {string} profilerDir - Profiler storage directory
 * @returns {object} Agent inventory entry
 */
function buildAgentEntry(agentPath, profilerDir) {
  try {
    const content = fs.readFileSync(agentPath, 'utf8');
    const frontmatter = parseAgentFrontmatter(content);

    if (!frontmatter) {
      return null;
    }

    const agentName = frontmatter.name || path.basename(agentPath, '.md');
    const description = frontmatter.description || 'No description available';
    const tools = frontmatter.tools ?
      frontmatter.tools.split(',').map(t => t.trim()) :
      [];

    // Extract capabilities
    const strengths = extractStrengths(description, agentName);
    const weaknesses = extractWeaknesses(description);

    // Load profiler data
    const profileData = loadProfilerData(agentName, profilerDir);

    const avgDuration = profileData ? profileData.avgDuration : null;
    const successRate = profileData ? profileData.successRate : 0.85; // Default 85%

    return {
      name: agentName,
      description: description,
      strengths: strengths,
      weaknesses: weaknesses,
      tools: tools,
      latency_hint: calculateLatencyHint(avgDuration),
      avg_duration_ms: avgDuration,
      p95_duration_ms: profileData ? profileData.p95Duration : null,
      failure_modes: extractFailureModes(profileData),
      success_rate: successRate,
      execution_count: profileData ? profileData.executionCount : 0,
      bottlenecks: profileData ? profileData.bottlenecks : {}
    };
  } catch (error) {
    // Critical failure - cannot build agent entry (malformed file, corrupt frontmatter, etc.)
    throw new DataAccessError(
      'Inventory_Builder',
      `Failed to build agent entry for ${path.basename(agentPath)}: ${error.message}`,
      {
        agentPath,
        originalError: error.message,
        workaround: 'Check agent file format and frontmatter validity'
      }
    );
  }
}

/**
 * Build complete INVENTORY from all plugins
 * @param {object} options - Build options
 * @returns {object} Complete inventory
 */
function buildInventory(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const profilerDir = options.profilerDir ||
    path.join(rootDir, '.claude-plugins/salesforce-plugin/.profiler');

  const plugins = scanPlugins(rootDir);
  const inventory = {
    generated_at: new Date().toISOString(),
    agent_count: 0,
    agents: []
  };

  for (const pluginDir of plugins) {
    const agents = scanAgents(pluginDir);

    for (const agentPath of agents) {
      const entry = buildAgentEntry(agentPath, profilerDir);

      if (entry) {
        inventory.agents.push(entry);
        inventory.agent_count++;
      }
    }
  }

  // Sort by success rate (best first) and then by average duration (fastest first)
  inventory.agents.sort((a, b) => {
    if (Math.abs(a.success_rate - b.success_rate) > 0.05) {
      return b.success_rate - a.success_rate;
    }

    const aDur = a.avg_duration_ms || 5000;
    const bDur = b.avg_duration_ms || 5000;
    return aDur - bDur;
  });

  return inventory;
}

/**
 * Load static overrides from configuration file
 * @param {string} overrideFile - Path to override JSON
 * @returns {object} Override configuration
 */
function loadStaticOverrides(overrideFile) {
  try {
    if (fs.existsSync(overrideFile)) {
      return JSON.parse(fs.readFileSync(overrideFile, 'utf8'));
    }
  } catch (error) {
    console.error(`Error loading overrides: ${error.message}`);
  }
  return { overrides: [] };
}

/**
 * Apply static overrides to inventory
 * @param {object} inventory - Base inventory
 * @param {object} overrides - Override configuration
 * @returns {object} Inventory with overrides applied
 */
function applyOverrides(inventory, overrides) {
  if (!overrides || !overrides.overrides) {
    return inventory;
  }

  for (const override of overrides.overrides) {
    const agent = inventory.agents.find(a => a.name === override.name);

    if (agent) {
      // Merge override properties
      Object.assign(agent, override);
    }
  }

  return inventory;
}

/**
 * Save inventory to file
 * @param {object} inventory - Inventory object
 * @param {string} outputPath - Output file path
 */
function saveInventory(inventory, outputPath) {
  fs.writeFileSync(outputPath, JSON.stringify(inventory, null, 2));
}

/**
 * CLI interface
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'build';

  switch (command) {
    case 'build':
      console.log('Building agent INVENTORY...');
      const inventory = buildInventory();

      // Apply static overrides
      const overrideFile = path.join(process.cwd(), '.claude/agent-inventory-overrides.json');
      const overrides = loadStaticOverrides(overrideFile);
      const finalInventory = applyOverrides(inventory, overrides);

      // Save to file
      const outputPath = args[1] || path.join(process.cwd(), '.claude/agent-inventory.json');
      saveInventory(finalInventory, outputPath);

      console.log(`✓ Built inventory with ${finalInventory.agent_count} agents`);
      console.log(`✓ Saved to: ${outputPath}`);
      break;

    case 'list':
      const inv = buildInventory();
      console.log(`\nAgent INVENTORY (${inv.agent_count} agents):\n`);

      inv.agents.slice(0, 20).forEach(agent => {
        console.log(`${agent.name}`);
        console.log(`  Strengths: ${agent.strengths.slice(0, 3).join(', ')}`);
        console.log(`  Tools: ${agent.tools.slice(0, 3).join(', ')}`);
        console.log(`  Latency: ${agent.latency_hint} | Success: ${(agent.success_rate * 100).toFixed(1)}%`);
        console.log('');
      });

      if (inv.agents.length > 20) {
        console.log(`... and ${inv.agents.length - 20} more agents`);
      }
      break;

    default:
      console.log('Inventory Builder - Auto-generate agent INVENTORY');
      console.log('');
      console.log('Commands:');
      console.log('  build [output-path]  - Build inventory and save to file');
      console.log('  list                 - List top 20 agents with details');
      console.log('');
      console.log('Examples:');
      console.log('  node inventory-builder.js build');
      console.log('  node inventory-builder.js build /tmp/inventory.json');
      console.log('  node inventory-builder.js list');
  }
}

module.exports = {
  buildInventory,
  buildAgentEntry,
  parseAgentFrontmatter,
  extractStrengths,
  extractWeaknesses,
  calculateLatencyHint,
  applyOverrides,
  saveInventory
};
