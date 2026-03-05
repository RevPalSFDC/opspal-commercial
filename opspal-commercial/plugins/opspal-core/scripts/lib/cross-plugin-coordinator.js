#!/usr/bin/env node

/**
 * Cross-Plugin Routing Coordinator (P1-4)
 *
 * Validates and coordinates agent invocations across plugin boundaries.
 * Ensures that when an agent from one plugin invokes an agent from another,
 * the invocation is valid and the target agent exists.
 *
 * Features:
 * - Cross-plugin invocation validation
 * - Dependency graph of plugin interactions
 * - Runtime validation for Task tool calls
 * - Workflow compatibility checking
 *
 * Usage:
 *   node cross-plugin-coordinator.js validate <source-agent> <target-agent>
 *   node cross-plugin-coordinator.js graph                    # Show dependency graph
 *   node cross-plugin-coordinator.js workflows                # List cross-plugin workflows
 *   node cross-plugin-coordinator.js check-all                # Validate all cross-plugin refs
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// Configuration
// =============================================================================

const PLUGINS_ROOT = path.resolve(__dirname, '../../../');
const REGISTRY_PATH = path.resolve(__dirname, '../../config/cross-plugin-registry.json');
const ROUTING_PATTERNS_PATH = path.resolve(__dirname, '../../config/routing-patterns.json');
const AGENT_RESOLVER_PATH = path.resolve(__dirname, './agent-alias-resolver.js');

// Load agent alias resolver
let agentResolver = null;
try {
  agentResolver = require(AGENT_RESOLVER_PATH);
} catch (e) {
  console.warn('Warning: Could not load agent-alias-resolver:', e.message);
}

// =============================================================================
// Plugin Discovery
// =============================================================================

/**
 * Discovers all installed plugins and their agents
 * @returns {Object} Map of plugin -> { agents: [], path: string }
 */
function discoverPlugins() {
  const plugins = {};

  if (!fs.existsSync(PLUGINS_ROOT)) {
    return plugins;
  }

  const entries = fs.readdirSync(PLUGINS_ROOT);

  for (const entry of entries) {
    const pluginPath = path.join(PLUGINS_ROOT, entry);
    const agentsPath = path.join(pluginPath, 'agents');
    const pluginJsonPath = path.join(pluginPath, '.claude-plugin', 'plugin.json');

    if (!fs.statSync(pluginPath).isDirectory()) continue;
    if (!fs.existsSync(agentsPath)) continue;

    let pluginMeta = { name: entry, version: 'unknown' };
    try {
      if (fs.existsSync(pluginJsonPath)) {
        pluginMeta = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
      }
    } catch (e) {
      // Use defaults
    }

    const agents = fs.readdirSync(agentsPath)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));

    plugins[entry] = {
      name: pluginMeta.name || entry,
      version: pluginMeta.version || 'unknown',
      path: pluginPath,
      agents,
      agentCount: agents.length
    };
  }

  return plugins;
}

// =============================================================================
// Cross-Plugin Reference Detection
// =============================================================================

/**
 * Extracts cross-plugin references from an agent file
 * @param {string} agentPath - Path to agent markdown file
 * @param {string} sourcePlugin - Plugin the agent belongs to
 * @returns {Object[]} Array of cross-plugin references
 */
function extractCrossPluginRefs(agentPath, sourcePlugin) {
  const refs = [];

  try {
    const content = fs.readFileSync(agentPath, 'utf8');

    // Pattern 1: Task tool invocations with subagent_type
    const taskMatches = content.matchAll(/Task\s*\(\s*subagent_type\s*[=:]\s*['"]([^'"]+)['"]/gi);
    for (const match of taskMatches) {
      const targetAgent = match[1];
      const targetPlugin = targetAgent.includes(':') ? targetAgent.split(':')[0] : null;

      if (targetPlugin && targetPlugin !== sourcePlugin) {
        refs.push({
          type: 'task_invocation',
          target: targetAgent,
          targetPlugin,
          raw: match[0]
        });
      }
    }

    // Pattern 2: Direct agent name references in documentation
    const docRefs = content.matchAll(/`(opspal-[a-z-]+):([a-z-]+)`/gi);
    for (const match of docRefs) {
      const targetPlugin = match[1];
      const targetAgent = `${match[1]}:${match[2]}`;

      if (targetPlugin !== sourcePlugin) {
        refs.push({
          type: 'documentation_reference',
          target: targetAgent,
          targetPlugin,
          raw: match[0]
        });
      }
    }

    // Pattern 3: MCP tools from other platforms
    const mcpMatches = content.matchAll(/mcp_([a-z]+)_|mcp__([a-z-]+)__/gi);
    for (const match of mcpMatches) {
      const platform = match[1] || match[2];
      // Map MCP prefixes to plugins
      const platformToPlugin = {
        'salesforce': 'opspal-salesforce',
        'hubspot': 'opspal-hubspot',
        'marketo': 'opspal-marketo',
        'supabase': 'opspal-core',
        'asana': 'opspal-core',
        'playwright': 'opspal-core'
      };

      const targetPlugin = platformToPlugin[platform];
      if (targetPlugin && targetPlugin !== sourcePlugin) {
        refs.push({
          type: 'mcp_tool_usage',
          target: platform,
          targetPlugin,
          raw: match[0]
        });
      }
    }

  } catch (e) {
    // Skip unreadable files
  }

  return refs;
}

/**
 * Scans all plugins for cross-plugin references
 * @returns {Object} Map of agent -> cross-plugin refs
 */
function scanAllCrossPluginRefs() {
  const plugins = discoverPlugins();
  const allRefs = {};

  for (const [pluginName, plugin] of Object.entries(plugins)) {
    const agentsPath = path.join(plugin.path, 'agents');

    for (const agent of plugin.agents) {
      const agentPath = path.join(agentsPath, `${agent}.md`);
      const fullName = `${pluginName}:${agent}`;
      const refs = extractCrossPluginRefs(agentPath, pluginName);

      if (refs.length > 0) {
        allRefs[fullName] = {
          sourcePlugin: pluginName,
          agent,
          refs
        };
      }
    }
  }

  return allRefs;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validates that a cross-plugin agent invocation is valid
 * @param {string} sourceAgent - Fully-qualified source agent name
 * @param {string} targetAgent - Fully-qualified target agent name
 * @returns {Object} Validation result
 */
function validateCrossPluginCall(sourceAgent, targetAgent) {
  const result = {
    valid: true,
    sourceAgent,
    targetAgent,
    errors: [],
    warnings: []
  };

  // Parse agent names
  const sourceParts = sourceAgent.includes(':') ? sourceAgent.split(':') : [null, sourceAgent];
  const targetParts = targetAgent.includes(':') ? targetAgent.split(':') : [null, targetAgent];

  const sourcePlugin = sourceParts[0];
  const targetPlugin = targetParts[0];

  // Check 1: Target agent exists
  if (agentResolver) {
    const resolved = agentResolver.resolveAgentName(targetAgent, { warnOnConflict: false });
    if (!resolved) {
      result.valid = false;
      result.errors.push({
        code: 'TARGET_NOT_FOUND',
        message: `Target agent "${targetAgent}" does not exist in any plugin`
      });
    }
  }

  // Check 2: Not the same plugin (not really an error, but worth noting)
  if (sourcePlugin === targetPlugin) {
    result.warnings.push({
      code: 'SAME_PLUGIN',
      message: `Both agents are in the same plugin (${sourcePlugin}). Consider using direct invocation.`
    });
  }

  // Check 3: Check for ambiguous names
  if (agentResolver && agentResolver.isCrossTypeConflict) {
    const targetShort = targetParts[1];
    if (agentResolver.isCrossTypeConflict(targetShort)) {
      result.warnings.push({
        code: 'AMBIGUOUS_NAME',
        message: `"${targetShort}" exists as both command and agent. Use fully-qualified name.`
      });
    }
  }

  // Check 4: Verify compatible platform capabilities
  const platformDeps = {
    'opspal-salesforce': ['mcp_salesforce'],
    'opspal-hubspot': ['mcp__hubspot-v4__'],
    'opspal-marketo': ['mcp_marketo'],
    'opspal-core': ['mcp_supabase', 'mcp_asana']
  };

  // This is informational - what platform capabilities will be needed
  if (targetPlugin && platformDeps[targetPlugin]) {
    result.platformDependencies = platformDeps[targetPlugin];
  }

  return result;
}

/**
 * Validates all cross-plugin references in the system
 * @returns {Object} Validation results
 */
function validateAllCrossPluginRefs() {
  const allRefs = scanAllCrossPluginRefs();
  const results = {
    total: 0,
    valid: 0,
    invalid: 0,
    errors: [],
    warnings: [],
    byPlugin: {}
  };

  for (const [sourceAgent, data] of Object.entries(allRefs)) {
    for (const ref of data.refs) {
      if (ref.type === 'task_invocation') {
        results.total++;
        const validation = validateCrossPluginCall(sourceAgent, ref.target);

        if (!results.byPlugin[data.sourcePlugin]) {
          results.byPlugin[data.sourcePlugin] = { valid: 0, invalid: 0 };
        }

        if (validation.valid) {
          results.valid++;
          results.byPlugin[data.sourcePlugin].valid++;
        } else {
          results.invalid++;
          results.byPlugin[data.sourcePlugin].invalid++;
          results.errors.push({
            source: sourceAgent,
            target: ref.target,
            errors: validation.errors
          });
        }

        if (validation.warnings.length > 0) {
          results.warnings.push({
            source: sourceAgent,
            target: ref.target,
            warnings: validation.warnings
          });
        }
      }
    }
  }

  return results;
}

// =============================================================================
// Dependency Graph
// =============================================================================

/**
 * Builds a dependency graph of cross-plugin interactions
 * @returns {Object} Graph with nodes (plugins) and edges (dependencies)
 */
function buildDependencyGraph() {
  const plugins = discoverPlugins();
  const allRefs = scanAllCrossPluginRefs();

  const graph = {
    nodes: Object.keys(plugins).map(p => ({
      id: p,
      label: plugins[p].name,
      agentCount: plugins[p].agentCount
    })),
    edges: []
  };

  // Count edges between plugins
  const edgeCounts = {};

  for (const [sourceAgent, data] of Object.entries(allRefs)) {
    for (const ref of data.refs) {
      if (ref.targetPlugin) {
        const edgeKey = `${data.sourcePlugin}->${ref.targetPlugin}`;
        edgeCounts[edgeKey] = (edgeCounts[edgeKey] || 0) + 1;
      }
    }
  }

  // Create edges
  for (const [edgeKey, count] of Object.entries(edgeCounts)) {
    const [source, target] = edgeKey.split('->');
    graph.edges.push({
      source,
      target,
      weight: count,
      label: `${count} ref${count > 1 ? 's' : ''}`
    });
  }

  return graph;
}

/**
 * Generates a Mermaid diagram of plugin dependencies
 * @returns {string} Mermaid diagram code
 */
function generateMermaidDiagram() {
  const graph = buildDependencyGraph();

  let mermaid = 'graph LR\n';

  // Add nodes
  for (const node of graph.nodes) {
    const shortName = node.id.replace('opspal-', '');
    mermaid += `  ${shortName}["${shortName}\\n(${node.agentCount} agents)"]\n`;
  }

  // Add edges
  for (const edge of graph.edges) {
    const source = edge.source.replace('opspal-', '');
    const target = edge.target.replace('opspal-', '');
    mermaid += `  ${source} -->|${edge.weight}| ${target}\n`;
  }

  return mermaid;
}

// =============================================================================
// Cross-Plugin Workflow Registry
// =============================================================================

/**
 * Pre-defined cross-plugin workflows that are known to be valid
 */
const KNOWN_WORKFLOWS = [
  {
    id: 'sf-to-hs-migration',
    name: 'Salesforce to HubSpot Data Migration',
    steps: [
      { plugin: 'opspal-core', agent: 'data-migration-orchestrator', role: 'orchestrator' },
      { plugin: 'opspal-salesforce', agent: 'sfdc-data-export-manager', role: 'source' },
      { plugin: 'opspal-hubspot', agent: 'hubspot-data-operations-manager', role: 'target' }
    ]
  },
  {
    id: 'cross-platform-reporting',
    name: 'Unified Cross-Platform Dashboard',
    steps: [
      { plugin: 'opspal-core', agent: 'unified-exec-dashboard-agent', role: 'orchestrator' },
      { plugin: 'opspal-salesforce', agent: 'sfdc-reports-dashboards', role: 'sf-data' },
      { plugin: 'opspal-hubspot', agent: 'hubspot-analytics-manager', role: 'hs-data' }
    ]
  },
  {
    id: 'multi-platform-campaign',
    name: 'Multi-Platform Campaign Orchestration',
    steps: [
      { plugin: 'opspal-core', agent: 'multi-platform-campaign-orchestrator', role: 'orchestrator' },
      { plugin: 'opspal-salesforce', agent: 'sfdc-sales-operations', role: 'sf-ops' },
      { plugin: 'opspal-hubspot', agent: 'hubspot-workflow-builder', role: 'hs-workflows' },
      { plugin: 'opspal-marketo', agent: 'marketo-campaign-manager', role: 'mkt-campaigns' }
    ]
  },
  {
    id: 'customer-success-360',
    name: 'Customer Success 360 View',
    steps: [
      { plugin: 'opspal-core', agent: 'cs-operations-orchestrator', role: 'orchestrator' },
      { plugin: 'opspal-salesforce', agent: 'sfdc-revops-auditor', role: 'sf-health' },
      { plugin: 'opspal-hubspot', agent: 'hubspot-contact-operations', role: 'hs-engagement' }
    ]
  }
];

/**
 * Gets workflow definitions that match given criteria
 * @param {Object} criteria - Search criteria
 * @returns {Object[]} Matching workflows
 */
function findWorkflows(criteria = {}) {
  let workflows = [...KNOWN_WORKFLOWS];

  if (criteria.plugin) {
    workflows = workflows.filter(w =>
      w.steps.some(s => s.plugin === criteria.plugin)
    );
  }

  if (criteria.agent) {
    workflows = workflows.filter(w =>
      w.steps.some(s => `${s.plugin}:${s.agent}` === criteria.agent)
    );
  }

  return workflows;
}

// =============================================================================
// Registry Management
// =============================================================================

/**
 * Builds and saves the cross-plugin registry
 */
function buildRegistry() {
  const plugins = discoverPlugins();
  const allRefs = scanAllCrossPluginRefs();
  const graph = buildDependencyGraph();
  const validation = validateAllCrossPluginRefs();

  const registry = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    plugins: Object.fromEntries(
      Object.entries(plugins).map(([name, data]) => [
        name,
        { name: data.name, version: data.version, agentCount: data.agentCount }
      ])
    ),
    crossPluginRefs: allRefs,
    dependencyGraph: graph,
    validation: {
      total: validation.total,
      valid: validation.valid,
      invalid: validation.invalid,
      errorCount: validation.errors.length,
      warningCount: validation.warnings.length
    },
    workflows: KNOWN_WORKFLOWS
  };

  // Save registry
  try {
    const registryDir = path.dirname(REGISTRY_PATH);
    if (!fs.existsSync(registryDir)) {
      fs.mkdirSync(registryDir, { recursive: true });
    }
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
    console.log(`Registry saved to: ${REGISTRY_PATH}`);
  } catch (e) {
    console.error(`Failed to save registry: ${e.message}`);
  }

  return registry;
}

/**
 * Loads the cross-plugin registry
 * @returns {Object|null} Registry or null if not found
 */
function loadRegistry() {
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    }
  } catch (e) {
    // Registry not available
  }
  return null;
}

// =============================================================================
// CLI Interface
// =============================================================================

function printHelp() {
  console.log(`
Cross-Plugin Routing Coordinator - Validate cross-plugin agent invocations

Usage:
  node cross-plugin-coordinator.js <command> [options]

Commands:
  validate <source> <target>   Validate a cross-plugin invocation
  check-all                    Validate all cross-plugin references
  graph                        Show plugin dependency graph (Mermaid)
  workflows                    List known cross-plugin workflows
  refs                         Show all cross-plugin references
  build-registry               Build and save cross-plugin registry
  stats                        Show cross-plugin statistics

Options:
  --json                       Output as JSON
  --verbose                    Show detailed output

Examples:
  node cross-plugin-coordinator.js validate opspal-core:data-migration-orchestrator opspal-salesforce:sfdc-data-export-manager
  node cross-plugin-coordinator.js check-all
  node cross-plugin-coordinator.js graph
  node cross-plugin-coordinator.js workflows --plugin opspal-salesforce
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const isJson = args.includes('--json');
  const isVerbose = args.includes('--verbose');

  switch (command) {
    case 'validate': {
      const source = args[1];
      const target = args[2];

      if (!source || !target) {
        console.error('Usage: validate <source-agent> <target-agent>');
        process.exit(1);
      }

      const result = validateCrossPluginCall(source, target);

      if (isJson) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`\nCross-Plugin Validation: ${source} -> ${target}`);
        console.log('='.repeat(60));
        console.log(`Status: ${result.valid ? '✅ VALID' : '❌ INVALID'}`);

        if (result.errors.length > 0) {
          console.log('\nErrors:');
          for (const err of result.errors) {
            console.log(`  ❌ [${err.code}] ${err.message}`);
          }
        }

        if (result.warnings.length > 0) {
          console.log('\nWarnings:');
          for (const warn of result.warnings) {
            console.log(`  ⚠️  [${warn.code}] ${warn.message}`);
          }
        }

        if (result.platformDependencies) {
          console.log(`\nPlatform Dependencies: ${result.platformDependencies.join(', ')}`);
        }
      }

      process.exit(result.valid ? 0 : 1);
    }

    case 'check-all': {
      if (!isJson) console.log('Validating all cross-plugin references...\n');
      const results = validateAllCrossPluginRefs();

      if (isJson) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log('Cross-Plugin Validation Report');
        console.log('='.repeat(50));
        console.log(`Total references: ${results.total}`);
        console.log(`Valid: ${results.valid}`);
        console.log(`Invalid: ${results.invalid}`);
        console.log(`Warnings: ${results.warnings.length}`);

        if (isVerbose && results.errors.length > 0) {
          console.log('\n## Errors\n');
          for (const err of results.errors) {
            console.log(`- ${err.source} -> ${err.target}`);
            for (const e of err.errors) {
              console.log(`  ❌ ${e.message}`);
            }
          }
        }

        if (isVerbose && results.warnings.length > 0) {
          console.log('\n## Warnings\n');
          for (const warn of results.warnings) {
            console.log(`- ${warn.source} -> ${warn.target}`);
            for (const w of warn.warnings) {
              console.log(`  ⚠️  ${w.message}`);
            }
          }
        }

        console.log('\n## By Plugin\n');
        for (const [plugin, counts] of Object.entries(results.byPlugin)) {
          console.log(`- ${plugin}: ${counts.valid} valid, ${counts.invalid} invalid`);
        }
      }

      process.exit(results.invalid > 0 ? 1 : 0);
    }

    case 'graph': {
      const mermaid = generateMermaidDiagram();

      if (isJson) {
        console.log(JSON.stringify({ mermaid, graph: buildDependencyGraph() }, null, 2));
      } else {
        console.log('Plugin Dependency Graph (Mermaid)\n');
        console.log('```mermaid');
        console.log(mermaid);
        console.log('```');
      }
      break;
    }

    case 'workflows': {
      const pluginFilter = args.find(a => a.startsWith('--plugin='))?.split('=')[1];
      let workflows = KNOWN_WORKFLOWS;

      if (pluginFilter) {
        workflows = findWorkflows({ plugin: pluginFilter });
      }

      if (isJson) {
        console.log(JSON.stringify(workflows, null, 2));
      } else {
        console.log('Known Cross-Plugin Workflows\n');
        console.log('='.repeat(50));

        for (const wf of workflows) {
          console.log(`\n## ${wf.name} (${wf.id})\n`);
          for (const step of wf.steps) {
            console.log(`  ${step.role}: ${step.plugin}:${step.agent}`);
          }
        }
      }
      break;
    }

    case 'refs': {
      const allRefs = scanAllCrossPluginRefs();

      if (isJson) {
        console.log(JSON.stringify(allRefs, null, 2));
      } else {
        console.log('Cross-Plugin References\n');
        console.log('='.repeat(50));

        for (const [agent, data] of Object.entries(allRefs)) {
          console.log(`\n${agent}:`);
          for (const ref of data.refs) {
            console.log(`  -> ${ref.target} (${ref.type})`);
          }
        }
      }
      break;
    }

    case 'build-registry': {
      console.log('Building cross-plugin registry...\n');
      const registry = buildRegistry();

      if (isJson) {
        console.log(JSON.stringify(registry, null, 2));
      } else {
        console.log('Registry built successfully!');
        console.log(`  Plugins: ${Object.keys(registry.plugins).length}`);
        console.log(`  Cross-plugin refs: ${Object.keys(registry.crossPluginRefs).length}`);
        console.log(`  Validation: ${registry.validation.valid}/${registry.validation.total} valid`);
        console.log(`  Workflows: ${registry.workflows.length}`);
      }
      break;
    }

    case 'stats': {
      const plugins = discoverPlugins();
      const allRefs = scanAllCrossPluginRefs();
      const graph = buildDependencyGraph();

      if (isJson) {
        console.log(JSON.stringify({ plugins, refCount: Object.keys(allRefs).length, graph }, null, 2));
      } else {
        console.log('Cross-Plugin Statistics\n');
        console.log('='.repeat(50));
        console.log(`\nPlugins: ${Object.keys(plugins).length}`);
        console.log(`Agents with cross-plugin refs: ${Object.keys(allRefs).length}`);
        console.log(`Plugin-to-plugin edges: ${graph.edges.length}`);

        console.log('\n## Agents per Plugin\n');
        for (const [name, plugin] of Object.entries(plugins)) {
          console.log(`  ${name}: ${plugin.agentCount} agents`);
        }

        console.log('\n## Cross-Plugin Dependencies\n');
        for (const edge of graph.edges) {
          console.log(`  ${edge.source} -> ${edge.target}: ${edge.weight} refs`);
        }
      }
      break;
    }

    case '--help':
    case 'help':
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
  discoverPlugins,
  extractCrossPluginRefs,
  scanAllCrossPluginRefs,
  validateCrossPluginCall,
  validateAllCrossPluginRefs,
  buildDependencyGraph,
  generateMermaidDiagram,
  findWorkflows,
  buildRegistry,
  loadRegistry,
  KNOWN_WORKFLOWS
};

// Run if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(2);
  });
}
