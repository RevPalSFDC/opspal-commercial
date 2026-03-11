#!/usr/bin/env node

/**
 * Agent Alias Resolver
 *
 * Resolves short agent names (e.g., 'sfdc-object-auditor') to fully-qualified
 * names (e.g., 'opspal-salesforce:sfdc-object-auditor').
 *
 * This prevents routing errors when agents are called without the plugin prefix.
 *
 * Usage:
 *   const { resolveAgentName } = require('./agent-alias-resolver');
 *   const fullName = resolveAgentName('sfdc-object-auditor');
 *   // Returns: 'opspal-salesforce:sfdc-object-auditor'
 */

const fs = require('fs');
const path = require('path');
const {
    SEMVER_DIR_PATTERN,
    isVersionLikeName,
    pickLatestVersion
} = require('./semver-directory-utils');

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_PLUGINS_DIR = path.resolve(__dirname, '../../../');
const CACHE_FILE = path.resolve(__dirname, '../../config/agent-alias-cache.json');
const COMMAND_CACHE_FILE = path.resolve(__dirname, '../../config/command-registry.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
function isDirectory(dirPath) {
    try {
        return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
    } catch (error) {
        return false;
    }
}

function hasMarkdownChildren(dirPath) {
    if (!isDirectory(dirPath)) {
        return false;
    }

    try {
        return fs.readdirSync(dirPath).some(file => file.endsWith('.md'));
    } catch (error) {
        return false;
    }
}

function looksLikePluginName(name) {
    return /^opspal-[a-z0-9-]+$/.test(name) ||
        /-plugin$/.test(name) ||
        name === 'developer-tools-plugin';
}

function discoverPluginRootsFrom(baseDir) {
    if (!isDirectory(baseDir)) {
        return [];
    }

    let entries = [];
    try {
        entries = fs.readdirSync(baseDir, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name);
    } catch (error) {
        return [];
    }

    const discovered = [];

    // Case: baseDir itself is a plugin cache folder with version subdirectories
    // e.g. ~/.claude/plugins/opspal-core/{2.5.2,2.18.1,...}
    const baseName = path.basename(baseDir);
    const versionSubdirs = entries.filter(name => {
        if (!isVersionLikeName(name)) return false;
        const versionPath = path.join(baseDir, name);
        return hasMarkdownChildren(path.join(versionPath, 'agents')) ||
            hasMarkdownChildren(path.join(versionPath, 'commands'));
    });

    if (looksLikePluginName(baseName) && versionSubdirs.length > 0) {
        const latest = pickLatestVersion(versionSubdirs);
        if (latest) {
            return [{
                pluginName: baseName,
                rootPath: path.join(baseDir, latest),
                selectedVersion: latest
            }];
        }
    }

    // General case: baseDir contains plugin directories.
    for (const entryName of entries) {
        if (isVersionLikeName(entryName)) {
            // Ignore bare version folders at this level to prevent stale cache pollution.
            continue;
        }

        const pluginPath = path.join(baseDir, entryName);
        const directAgents = hasMarkdownChildren(path.join(pluginPath, 'agents'));
        const directCommands = hasMarkdownChildren(path.join(pluginPath, 'commands'));

        if (directAgents || directCommands) {
            discovered.push({
                pluginName: entryName,
                rootPath: pluginPath,
                selectedVersion: null
            });
            continue;
        }

        // Handle nested version directories under each plugin
        // e.g. ~/.claude/plugins/opspal-core/2.18.1
        let nestedEntries = [];
        try {
            nestedEntries = fs.readdirSync(pluginPath, { withFileTypes: true })
                .filter(entry => entry.isDirectory())
                .map(entry => entry.name);
        } catch (error) {
            continue;
        }

        const nestedVersions = nestedEntries.filter(name => {
            if (!isVersionLikeName(name)) return false;
            const versionPath = path.join(pluginPath, name);
            return hasMarkdownChildren(path.join(versionPath, 'agents')) ||
                hasMarkdownChildren(path.join(versionPath, 'commands'));
        });

        if (nestedVersions.length > 0) {
            const latest = pickLatestVersion(nestedVersions);
            if (latest) {
                discovered.push({
                    pluginName: entryName,
                    rootPath: path.join(pluginPath, latest),
                    selectedVersion: latest
                });
            }
        }
    }

    return discovered;
}

function discoverPluginRoots() {
    const envRoot = process.env.CLAUDE_PLUGIN_ROOT
        ? path.resolve(process.env.CLAUDE_PLUGIN_ROOT)
        : null;

    const candidates = [
        process.env.PLUGINS_DIR ? path.resolve(process.env.PLUGINS_DIR) : null,
        envRoot,
        envRoot ? path.dirname(envRoot) : null,
        DEFAULT_PLUGINS_DIR,
        path.resolve(__dirname, '../../../../')
    ].filter(Boolean);

    const uniqueCandidates = [...new Set(candidates)];

    let best = [];
    for (const candidate of uniqueCandidates) {
        const discovered = discoverPluginRootsFrom(candidate);
        if (discovered.length > best.length) {
            best = discovered;
        }
    }

    return best;
}

function registryHasVersionPollution(registry) {
    if (!registry || typeof registry !== 'object') {
        return true;
    }

    const pluginNames = Object.keys(registry.plugins || {});
    if (pluginNames.some(isVersionLikeName)) {
        return true;
    }

    const fullNames = Object.keys(registry.fullToShort || {});
    return fullNames.some(fullName => {
        const plugin = String(fullName).split(':')[0];
        return isVersionLikeName(plugin);
    });
}

// =============================================================================
// Registry Builder
// =============================================================================

/**
 * Scans all plugins and builds a registry of agent names
 * @returns {Object} Map of short names to full qualified names
 */
function buildAgentRegistry() {
    const registry = {
        shortToFull: {},      // 'sfdc-object-auditor' -> 'opspal-salesforce:sfdc-object-auditor'
        fullToShort: {},      // 'opspal-salesforce:sfdc-object-auditor' -> 'sfdc-object-auditor'
        conflicts: {},        // short names that exist in multiple plugins
        plugins: {},          // plugin -> [agents]
        buildTime: new Date().toISOString()
    };

    const pluginEntries = discoverPluginRoots();

    for (const pluginEntry of pluginEntries) {
        const pluginName = pluginEntry.pluginName;
        const agentsPath = path.join(pluginEntry.rootPath, 'agents');

        registry.plugins[pluginName] = [];

        try {
            const agentFiles = fs.readdirSync(agentsPath)
                .filter(f => f.endsWith('.md'));

            for (const file of agentFiles) {
                const shortName = file.replace('.md', ''); // e.g., 'sfdc-object-auditor'
                const fullName = `${pluginName}:${shortName}`; // e.g., 'opspal-salesforce:sfdc-object-auditor'

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

// =============================================================================
// Command Registry Builder
// =============================================================================

/**
 * Scans all plugins and builds a registry of command names
 * Commands are different from agents - they're invoked via Skill tool, not Task tool
 * @returns {Object} Map of command names to their plugin and invocation info
 */
function buildCommandRegistry() {
    const registry = {
        commands: {},           // 'reflect' -> { plugin, type, invocation }
        shortToFull: {},        // 'reflect' -> 'opspal-salesforce:reflect'
        fullToShort: {},        // 'opspal-salesforce:reflect' -> 'reflect'
        conflicts: {},          // commands that exist in multiple plugins
        plugins: {},            // plugin -> [commands]
        buildTime: new Date().toISOString()
    };

    const pluginEntries = discoverPluginRoots();

    for (const pluginEntry of pluginEntries) {
        const pluginName = pluginEntry.pluginName;
        const commandsPath = path.join(pluginEntry.rootPath, 'commands');

        registry.plugins[pluginName] = [];

        try {
            const commandFiles = fs.readdirSync(commandsPath)
                .filter(f => f.endsWith('.md'));

            for (const file of commandFiles) {
                const shortName = file.replace('.md', '');
                const fullName = `${pluginName}:${shortName}`;

                registry.plugins[pluginName].push(shortName);
                registry.fullToShort[fullName] = shortName;

                // Build command info
                const commandInfo = {
                    plugin: pluginName,
                    type: 'skill',
                    invocation: `Skill(skill: '${fullName}')`,
                    slashCommand: `/${shortName}`
                };

                // Track conflicts (same short name in multiple plugins)
                if (registry.shortToFull[shortName]) {
                    if (!registry.conflicts[shortName]) {
                        registry.conflicts[shortName] = [registry.shortToFull[shortName]];
                    }
                    registry.conflicts[shortName].push(fullName);
                } else {
                    registry.shortToFull[shortName] = fullName;
                    registry.commands[shortName] = commandInfo;
                }
            }
        } catch (error) {
            // Skip plugins with no commands directory
        }
    }

    return registry;
}

/**
 * Gets or builds the command registry with caching
 * @param {boolean} forceRebuild - Force rebuild even if cache exists
 * @returns {Object} Command registry
 */
function getCommandRegistry(forceRebuild = false) {
    // Try to use cached registry
    if (!forceRebuild && fs.existsSync(COMMAND_CACHE_FILE)) {
        try {
            const cached = JSON.parse(fs.readFileSync(COMMAND_CACHE_FILE, 'utf8'));
            const cacheAge = Date.now() - new Date(cached.buildTime).getTime();

            if (cacheAge < CACHE_TTL_MS && !registryHasVersionPollution(cached)) {
                return cached;
            }
        } catch (e) {
            // Cache invalid, rebuild
        }
    }

    // Build fresh registry
    const registry = buildCommandRegistry();

    // Save to cache
    try {
        const cacheDir = path.dirname(COMMAND_CACHE_FILE);
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        fs.writeFileSync(COMMAND_CACHE_FILE, JSON.stringify(registry, null, 2));
    } catch (e) {
        // Cache write failed, continue without caching
    }

    return registry;
}

/**
 * Checks if a name refers to a command (not an agent)
 * @param {string} name - Short or full name to check
 * @returns {boolean} True if name is a command
 */
function isCommand(name) {
    const registry = getCommandRegistry();
    const shortName = name.includes(':') ? name.split(':').pop() : name;
    return !!registry.commands[shortName] || !!registry.shortToFull[shortName];
}

/**
 * Gets information about how to correctly invoke a command
 * @param {string} name - Command name (short or full)
 * @returns {Object|null} Command info with invocation instructions
 */
function getCommandInfo(name) {
    const registry = getCommandRegistry();
    const shortName = name.includes(':') ? name.split(':').pop() : name;

    const info = registry.commands[shortName];
    if (!info) {
        // Check if it's in conflicts
        if (registry.conflicts[shortName]) {
            return {
                isConflict: true,
                options: registry.conflicts[shortName],
                message: `'${shortName}' exists in multiple plugins. Use the full name: ${registry.conflicts[shortName].join(' or ')}`
            };
        }
        return null;
    }

    return {
        ...info,
        isConflict: false,
        message: `'${name}' is a COMMAND, not an agent. Use: ${info.slashCommand} or ${info.invocation}`
    };
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

            if (cacheAge < CACHE_TTL_MS && !registryHasVersionPollution(cached)) {
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
        preferredPlugin = 'opspal-salesforce', // Default preference for SFDC agents
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

        case 'is-command':
            const cmdName = args[1];
            if (!cmdName) {
                console.error('Usage: agent-alias-resolver is-command <name>');
                process.exit(1);
            }
            console.log(isCommand(cmdName) ? 'true' : 'false');
            break;

        case 'command-info':
            const cmdInfoName = args[1];
            if (!cmdInfoName) {
                console.error('Usage: agent-alias-resolver command-info <name>');
                process.exit(1);
            }
            const cmdInfo = getCommandInfo(cmdInfoName);
            if (cmdInfo) {
                console.log(cmdInfo.message);
            } else {
                console.error(`'${cmdInfoName}' is not a recognized command`);
                process.exit(1);
            }
            break;

        case 'list-commands':
            const cmdPlugin = args[1];
            const cmdRegistry = getCommandRegistry();
            if (cmdPlugin) {
                const cmds = cmdRegistry.plugins[cmdPlugin] || [];
                console.log(`${cmds.length} commands in ${cmdPlugin}:`);
                cmds.forEach(c => console.log(`  /${c}`));
            } else {
                console.log(`${Object.keys(cmdRegistry.commands).length} total commands:`);
                Object.entries(cmdRegistry.plugins)
                    .sort((a, b) => b[1].length - a[1].length)
                    .forEach(([plugin, cmds]) => {
                        console.log(`\n  ${plugin} (${cmds.length}):`);
                        cmds.forEach(c => console.log(`    /${c}`));
                    });
            }
            break;

        case 'rebuild-commands':
            const freshCmdRegistry = getCommandRegistry(true);
            console.log('Command registry rebuilt:');
            console.log(`  Plugins: ${Object.keys(freshCmdRegistry.plugins).length}`);
            console.log(`  Commands: ${Object.keys(freshCmdRegistry.commands).length}`);
            console.log(`  Conflicts: ${Object.keys(freshCmdRegistry.conflicts).length}`);
            if (Object.keys(freshCmdRegistry.conflicts).length > 0) {
                console.log('\nConflicting command names:');
                Object.entries(freshCmdRegistry.conflicts).forEach(([short, fulls]) => {
                    console.log(`  ${short}:`);
                    fulls.forEach(f => console.log(`    - ${f}`));
                });
            }
            break;

        // Cross-Type Conflict Commands (P1-3)
        case 'is-ambiguous':
            const ambigName = args[1];
            if (!ambigName) {
                console.error('Usage: agent-alias-resolver is-ambiguous <name>');
                process.exit(1);
            }
            console.log(isCrossTypeConflict(ambigName) ? 'true' : 'false');
            break;

        case 'ambiguous-info':
            const ambigInfoName = args[1];
            if (!ambigInfoName) {
                console.error('Usage: agent-alias-resolver ambiguous-info <name>');
                process.exit(1);
            }
            const ambigInfo = getCrossTypeConflictInfo(ambigInfoName);
            if (ambigInfo) {
                console.log(ambigInfo.message);
            } else {
                console.log(`'${ambigInfoName}' is NOT ambiguous (not both command and agent)`);
            }
            break;

        case 'cross-type-conflicts':
            const crossConflicts = getAllCrossTypeConflicts();
            if (crossConflicts.length === 0) {
                console.log('No cross-type conflicts found (no names are both command AND agent).');
            } else {
                console.log(`Found ${crossConflicts.length} cross-type conflict(s):\n`);
                crossConflicts.forEach(conflict => {
                    console.log(`  ${conflict.shortName}:`);
                    console.log(`    COMMAND: ${conflict.asCommand.fullName} → ${conflict.asCommand.invocation}`);
                    console.log(`    AGENT:   ${conflict.asAgent.fullName} → Task tool`);
                    console.log('');
                });
                console.log('⚠️  These names are ambiguous - users may confuse command vs agent invocation.');
                console.log('   Consider renaming one or adding clear disambiguation in documentation.');
            }
            break;

        default:
            console.log(`
Agent Alias Resolver - Resolve short agent names to fully-qualified names

Usage:
  node agent-alias-resolver.js resolve <name>      Resolve a short agent name
  node agent-alias-resolver.js search <term>       Search for agents
  node agent-alias-resolver.js list [plugin]       List all agents
  node agent-alias-resolver.js rebuild             Force rebuild agent cache
  node agent-alias-resolver.js conflicts           Show naming conflicts
  node agent-alias-resolver.js stats               Show registry statistics

  Command Detection:
  node agent-alias-resolver.js is-command <name>      Check if name is a command
  node agent-alias-resolver.js command-info <name>    Get command invocation info
  node agent-alias-resolver.js list-commands [plugin] List all commands
  node agent-alias-resolver.js rebuild-commands       Force rebuild command cache

  Cross-Type Conflict Detection (P1-3):
  node agent-alias-resolver.js is-ambiguous <name>    Check if name is BOTH command AND agent
  node agent-alias-resolver.js ambiguous-info <name>  Get details about ambiguous name
  node agent-alias-resolver.js cross-type-conflicts   List all command/agent name conflicts

Examples:
  node agent-alias-resolver.js resolve sfdc-object-auditor
  node agent-alias-resolver.js search cpq
  node agent-alias-resolver.js list salesforce-plugin
  node agent-alias-resolver.js is-command reflect
  node agent-alias-resolver.js command-info reflect
  node agent-alias-resolver.js is-ambiguous gemini-consult
  node agent-alias-resolver.js cross-type-conflicts
            `);
    }
}

// =============================================================================
// Cross-Type Conflict Detection (P1-3: Command vs Agent Confusion Prevention)
// =============================================================================

/**
 * Checks if a name exists as BOTH a command AND an agent (cross-type conflict)
 * @param {string} name - Short name to check
 * @returns {boolean} True if name is ambiguous (both command and agent)
 */
function isCrossTypeConflict(name) {
    const shortName = name.includes(':') ? name.split(':').pop() : name;

    const cmdRegistry = getCommandRegistry();
    const agentRegistry = getRegistry();

    const isCmd = !!cmdRegistry.commands[shortName] || !!cmdRegistry.shortToFull[shortName];
    const isAgent = !!agentRegistry.shortToFull[shortName];

    return isCmd && isAgent;
}

/**
 * Gets detailed information about a cross-type conflict
 * @param {string} name - Name to check
 * @returns {Object|null} Conflict info or null if no conflict
 */
function getCrossTypeConflictInfo(name) {
    const shortName = name.includes(':') ? name.split(':').pop() : name;

    if (!isCrossTypeConflict(shortName)) {
        return null;
    }

    const cmdRegistry = getCommandRegistry();
    const agentRegistry = getRegistry();

    const commandFullName = cmdRegistry.shortToFull[shortName];
    const agentFullName = agentRegistry.shortToFull[shortName];
    const commandInfo = cmdRegistry.commands[shortName];

    return {
        isConflict: true,
        shortName,
        asCommand: {
            fullName: commandFullName,
            invocation: commandInfo ? commandInfo.slashCommand : `/${shortName}`,
            tool: 'Skill'
        },
        asAgent: {
            fullName: agentFullName,
            invocation: `Task(subagent_type='${agentFullName}')`,
            tool: 'Task'
        },
        message: `AMBIGUOUS: '${shortName}' exists as both a COMMAND and an AGENT.\n` +
                 `  - As COMMAND: Use Skill(skill='${shortName}') or /${shortName}\n` +
                 `  - As AGENT: Use Task(subagent_type='${agentFullName}')\n` +
                 `Please use the fully-qualified name to avoid confusion.`
    };
}

/**
 * Gets all cross-type conflicts in the system
 * @returns {Object[]} Array of conflict info objects
 */
function getAllCrossTypeConflicts() {
    const cmdRegistry = getCommandRegistry();
    const agentRegistry = getRegistry();

    const commandShortNames = new Set(Object.keys(cmdRegistry.commands));
    const agentShortNames = new Set(Object.keys(agentRegistry.shortToFull));

    const conflicts = [];

    for (const name of commandShortNames) {
        if (agentShortNames.has(name)) {
            conflicts.push(getCrossTypeConflictInfo(name));
        }
    }

    return conflicts;
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
    // Agent resolution
    resolveAgentName,
    getAllAgents,
    searchAgents,
    getShortName,
    getPluginName,
    getRegistry,
    buildAgentRegistry,
    // Command detection
    isCommand,
    getCommandInfo,
    getCommandRegistry,
    buildCommandRegistry,
    // Cross-type conflict detection (P1-3)
    isCrossTypeConflict,
    getCrossTypeConflictInfo,
    getAllCrossTypeConflicts
};
