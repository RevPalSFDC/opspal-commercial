#!/usr/bin/env node

/**
 * Agent Alias Resolver
 *
 * Resolves short agent names (e.g., 'sfdc-object-auditor') to fully-qualified
 * names (e.g., 'salesforce-plugin:sfdc-object-auditor').
 *
 * This prevents routing errors when agents are called without the plugin prefix.
 *
 * Usage:
 *   const { resolveAgentName } = require('./agent-alias-resolver');
 *   const fullName = resolveAgentName('sfdc-object-auditor');
 *   // Returns: 'salesforce-plugin:sfdc-object-auditor'
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// Configuration
// =============================================================================

const PLUGINS_DIR = path.resolve(__dirname, '../../../');
const CACHE_FILE = path.resolve(__dirname, '../../config/agent-alias-cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// =============================================================================
// Registry Builder
// =============================================================================

/**
 * Scans all plugins and builds a registry of agent names
 * @returns {Object} Map of short names to full qualified names
 */
function buildAgentRegistry() {
    const registry = {
        shortToFull: {},      // 'sfdc-object-auditor' -> 'salesforce-plugin:sfdc-object-auditor'
        fullToShort: {},      // 'salesforce-plugin:sfdc-object-auditor' -> 'sfdc-object-auditor'
        conflicts: {},        // short names that exist in multiple plugins
        plugins: {},          // plugin -> [agents]
        buildTime: new Date().toISOString()
    };

    // Find all plugin directories
    const pluginDirs = fs.readdirSync(PLUGINS_DIR)
        .filter(dir => {
            const agentsPath = path.join(PLUGINS_DIR, dir, 'agents');
            return fs.existsSync(agentsPath) && fs.statSync(agentsPath).isDirectory();
        });

    for (const pluginDir of pluginDirs) {
        const agentsPath = path.join(PLUGINS_DIR, pluginDir, 'agents');
        const pluginName = pluginDir; // e.g., 'salesforce-plugin'

        registry.plugins[pluginName] = [];

        try {
            const agentFiles = fs.readdirSync(agentsPath)
                .filter(f => f.endsWith('.md'));

            for (const file of agentFiles) {
                const shortName = file.replace('.md', ''); // e.g., 'sfdc-object-auditor'
                const fullName = `${pluginName}:${shortName}`; // e.g., 'salesforce-plugin:sfdc-object-auditor'

                registry.plugins[pluginName].push(shortName);
                registry.fullToShort[fullName] = shortName;

                // Track conflicts (same short name in multiple plugins)
                if (registry.shortToFull[shortName]) {
                    if (!registry.conflicts[shortName]) {
                        registry.conflicts[shortName] = [registry.shortToFull[shortName]];
                    }
                    registry.conflicts[shortName].push(fullName);
                } else {
                    registry.shortToFull[shortName] = fullName;
                }
            }
        } catch (error) {
            // Skip plugins with no agents directory
        }
    }

    return registry;
}

/**
 * Gets or builds the agent registry with caching
 * @param {boolean} forceRebuild - Force rebuild even if cache exists
 * @returns {Object} Agent registry
 */
function getRegistry(forceRebuild = false) {
    // Try to use cached registry
    if (!forceRebuild && fs.existsSync(CACHE_FILE)) {
        try {
            const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            const cacheAge = Date.now() - new Date(cached.buildTime).getTime();

            if (cacheAge < CACHE_TTL_MS) {
                return cached;
            }
        } catch (e) {
            // Cache invalid, rebuild
        }
    }

    // Build fresh registry
    const registry = buildAgentRegistry();

    // Save to cache
    try {
        const cacheDir = path.dirname(CACHE_FILE);
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        fs.writeFileSync(CACHE_FILE, JSON.stringify(registry, null, 2));
    } catch (e) {
        // Cache write failed, continue without caching
    }

    return registry;
}

// =============================================================================
// Resolver Functions
// =============================================================================

/**
 * Resolves a short agent name to its fully-qualified name
 * @param {string} agentName - Short or full agent name
 * @param {Object} options - Resolution options
 * @returns {string|null} Fully-qualified name or null if not found
 */
function resolveAgentName(agentName, options = {}) {
    const {
        preferredPlugin = 'salesforce-plugin', // Default preference for SFDC agents
        warnOnConflict = true,
        forceRebuild = false
    } = options;

    // Already fully qualified?
    if (agentName.includes(':')) {
        return agentName;
    }

    const registry = getRegistry(forceRebuild);

    // Check for exact match
    if (registry.shortToFull[agentName]) {
        // Check for conflicts
        if (registry.conflicts[agentName] && warnOnConflict) {
            const alternatives = registry.conflicts[agentName];
            console.warn(`[agent-alias-resolver] Warning: '${agentName}' exists in multiple plugins:`);
            alternatives.forEach(alt => console.warn(`  - ${alt}`));

            // Try to find preferred plugin match
            const preferred = alternatives.find(a => a.startsWith(preferredPlugin + ':'));
            if (preferred) {
                console.warn(`  Using preferred: ${preferred}`);
                return preferred;
            }
        }
        return registry.shortToFull[agentName];
    }

    // Try fuzzy matching (prefix matching)
    const possibleMatches = Object.keys(registry.shortToFull)
        .filter(name => name.includes(agentName) || agentName.includes(name));

    if (possibleMatches.length === 1) {
        const match = registry.shortToFull[possibleMatches[0]];
        console.warn(`[agent-alias-resolver] Fuzzy match: '${agentName}' -> '${match}'`);
        return match;
    }

    if (possibleMatches.length > 1) {
        console.warn(`[agent-alias-resolver] Multiple fuzzy matches for '${agentName}':`);
        possibleMatches.forEach(m => console.warn(`  - ${registry.shortToFull[m]}`));
    }

    return null;
}

/**
 * Gets all available agent names
 * @param {string} plugin - Optional plugin filter
 * @returns {string[]} List of fully-qualified agent names
 */
function getAllAgents(plugin = null) {
    const registry = getRegistry();

    if (plugin) {
        return (registry.plugins[plugin] || [])
            .map(short => `${plugin}:${short}`);
    }

    return Object.keys(registry.fullToShort);
}

/**
 * Finds agents matching a search term
 * @param {string} search - Search term
 * @returns {string[]} Matching fully-qualified agent names
 */
function searchAgents(search) {
    const registry = getRegistry();
    const searchLower = search.toLowerCase();

    return Object.keys(registry.fullToShort)
        .filter(full => full.toLowerCase().includes(searchLower));
}

/**
 * Gets the short name from a fully-qualified name
 * @param {string} fullName - Fully-qualified agent name
 * @returns {string} Short name
 */
function getShortName(fullName) {
    if (!fullName.includes(':')) {
        return fullName;
    }
    return fullName.split(':').pop();
}

/**
 * Gets the plugin name from a fully-qualified name
 * @param {string} fullName - Fully-qualified agent name
 * @returns {string|null} Plugin name or null
 */
function getPluginName(fullName) {
    if (!fullName.includes(':')) {
        const registry = getRegistry();
        const resolved = registry.shortToFull[fullName];
        if (resolved) {
            return resolved.split(':')[0];
        }
        return null;
    }
    return fullName.split(':')[0];
}

// =============================================================================
// CLI Interface
// =============================================================================

if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
        case 'resolve':
            const name = args[1];
            if (!name) {
                console.error('Usage: agent-alias-resolver resolve <agent-name>');
                process.exit(1);
            }
            const resolved = resolveAgentName(name);
            if (resolved) {
                console.log(resolved);
            } else {
                console.error(`Agent not found: ${name}`);
                const suggestions = searchAgents(name.split('-').pop());
                if (suggestions.length > 0) {
                    console.error('\nDid you mean:');
                    suggestions.slice(0, 5).forEach(s => console.error(`  ${s}`));
                }
                process.exit(1);
            }
            break;

        case 'search':
            const term = args[1] || '';
            const results = searchAgents(term);
            console.log(`Found ${results.length} agents:`);
            results.forEach(r => console.log(`  ${r}`));
            break;

        case 'list':
            const plugin = args[1];
            const agents = getAllAgents(plugin);
            console.log(`${agents.length} agents${plugin ? ` in ${plugin}` : ''}:`);
            agents.forEach(a => console.log(`  ${a}`));
            break;

        case 'rebuild':
            const registry = getRegistry(true);
            console.log('Registry rebuilt:');
            console.log(`  Plugins: ${Object.keys(registry.plugins).length}`);
            console.log(`  Agents: ${Object.keys(registry.fullToShort).length}`);
            console.log(`  Conflicts: ${Object.keys(registry.conflicts).length}`);
            if (Object.keys(registry.conflicts).length > 0) {
                console.log('\nConflicting short names:');
                Object.entries(registry.conflicts).forEach(([short, fulls]) => {
                    console.log(`  ${short}:`);
                    fulls.forEach(f => console.log(`    - ${f}`));
                });
            }
            break;

        case 'conflicts':
            const reg = getRegistry();
            if (Object.keys(reg.conflicts).length === 0) {
                console.log('No conflicts found.');
            } else {
                console.log('Conflicting short names:');
                Object.entries(reg.conflicts).forEach(([short, fulls]) => {
                    console.log(`\n  ${short}:`);
                    fulls.forEach(f => console.log(`    - ${f}`));
                });
            }
            break;

        case 'stats':
            const stats = getRegistry();
            console.log('Agent Registry Statistics:');
            console.log(`  Total Plugins: ${Object.keys(stats.plugins).length}`);
            console.log(`  Total Agents: ${Object.keys(stats.fullToShort).length}`);
            console.log(`  Conflicts: ${Object.keys(stats.conflicts).length}`);
            console.log(`  Cache Age: ${stats.buildTime}`);
            console.log('\nAgents per plugin:');
            Object.entries(stats.plugins)
                .sort((a, b) => b[1].length - a[1].length)
                .forEach(([plugin, agents]) => {
                    console.log(`  ${plugin}: ${agents.length}`);
                });
            break;

        default:
            console.log(`
Agent Alias Resolver - Resolve short agent names to fully-qualified names

Usage:
  node agent-alias-resolver.js resolve <name>    Resolve a short name
  node agent-alias-resolver.js search <term>     Search for agents
  node agent-alias-resolver.js list [plugin]     List all agents
  node agent-alias-resolver.js rebuild           Force rebuild cache
  node agent-alias-resolver.js conflicts         Show naming conflicts
  node agent-alias-resolver.js stats             Show registry statistics

Examples:
  node agent-alias-resolver.js resolve sfdc-object-auditor
  node agent-alias-resolver.js search cpq
  node agent-alias-resolver.js list salesforce-plugin
            `);
    }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
    resolveAgentName,
    getAllAgents,
    searchAgents,
    getShortName,
    getPluginName,
    getRegistry,
    buildAgentRegistry
};
