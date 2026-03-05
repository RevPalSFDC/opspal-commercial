#!/usr/bin/env node

/**
 * Routing Index Builder - Build comprehensive agent routing index
 *
 * Scans all agent files and creates routing-index.json for fast agent lookup.
 *
 * @version 1.0.0
 * @date 2025-01-08
 */

const fs = require('fs');
const path = require('path');

function resolveRepoRoot() {
    const candidate = path.resolve(__dirname, '../../../../../../..');
    if (fs.existsSync(path.join(candidate, '.claude-plugins'))) {
        return candidate;
    }
    const cwd = process.cwd();
    if (fs.existsSync(path.join(cwd, '.claude-plugins'))) {
        return cwd;
    }
    return candidate;
}

function loadPackagesConfig(repoRoot) {
    const configPath = path.join(
        repoRoot,
        '.claude-plugins',
        'opspal-core-plugin',
        'packages',
        'OPSPAL_PACKAGES.json'
    );

    if (!fs.existsSync(configPath)) {
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
        return null;
    }
}

function collectPluginEntries() {
    const repoRoot = resolveRepoRoot();
    const packagesConfig = loadPackagesConfig(repoRoot);
    const entries = [];
    const seen = new Set();

    const addEntry = (name, agentsDir, priority) => {
        if (!agentsDir || !fs.existsSync(agentsDir)) {
            return;
        }
        const key = `${name}:${agentsDir}`;
        if (seen.has(key)) {
            return;
        }
        entries.push({ name, agentsDir, priority });
        seen.add(key);
    };

    if (packagesConfig?.core?.path) {
        const coreRoot = path.join(repoRoot, packagesConfig.core.path);
        const compatRoots = Array.isArray(packagesConfig.core.compat_roots)
            ? packagesConfig.core.compat_roots
            : [];

        for (const compat of compatRoots) {
            addEntry(compat, path.join(coreRoot, compat, 'agents'), 2);
        }
    }

    const domains = Array.isArray(packagesConfig?.domains) ? packagesConfig.domains : [];
    for (const domain of domains) {
        if (!domain?.path) continue;
        const pluginName = domain.source_plugin || `${domain.name}-plugin`;
        const domainRoot = path.join(repoRoot, domain.path);
        const domainAgents = path.join(domainRoot, 'agents');
        const legacyAgents = path.join(repoRoot, '.claude-plugins', pluginName, 'agents');

        addEntry(pluginName, domainAgents, 3);
        addEntry(pluginName, legacyAgents, 1);
    }

    const legacyRoot = path.join(repoRoot, '.claude-plugins');
    if (fs.existsSync(legacyRoot)) {
        const legacyPlugins = fs.readdirSync(legacyRoot)
            .filter(dir => dir.endsWith('-plugin') && dir !== 'opspal-core-plugin');
        for (const plugin of legacyPlugins) {
            addEntry(plugin, path.join(legacyRoot, plugin, 'agents'), 1);
        }
    }

    return { repoRoot, entries };
}

class RoutingIndexBuilder {
    constructor() {
        this.index = {
            version: '1.0.0',
            buildDate: new Date().toISOString(),
            totalAgents: 0,
            byKeyword: {},      // keyword -> [agents]
            byPlugin: {},       // plugin -> [agents]
            byTier: {},         // tier -> [agents]
            agents: {}          // agentName -> full metadata
        };
        this.agentPriority = {};
    }

    /**
     * Build routing index from all agent files
     * @param {string|Array} pluginsRoot - Root directory containing plugins or entry list
     */
    build(pluginsRoot) {
        const entries = Array.isArray(pluginsRoot)
            ? pluginsRoot
            : fs.readdirSync(pluginsRoot)
                .filter(p => p.endsWith('-plugin'))
                .sort()
                .map(plugin => ({
                    name: plugin,
                    agentsDir: path.join(pluginsRoot, plugin, 'agents'),
                    priority: 1
                }));

        console.log(`Building routing index from ${entries.length} plugin sources...`);

        for (const entry of entries) {
            if (fs.existsSync(entry.agentsDir)) {
                console.log(`\nProcessing ${entry.name}...`);
                this.processPlugin(entry.name, entry.agentsDir, entry.priority || 1);
            }
        }

        this.index.totalAgents = Object.keys(this.index.agents).length;
        console.log(`\n✓ Total agents indexed: ${this.index.totalAgents}`);
    }

    /**
     * Process all agents in a plugin
     * @param {string} pluginName - Plugin name
     * @param {string} agentsDir - Agents directory path
     * @param {number} priority - Source priority
     */
    processPlugin(pluginName, agentsDir, priority = 1) {
        const files = fs.readdirSync(agentsDir)
            .filter(f => f.endsWith('.md'))
            .sort();

        let count = 0;
        for (const file of files) {
            const filePath = path.join(agentsDir, file);
            const agent = this.parseAgent(filePath, pluginName);

            if (agent && agent.name) {
                this.indexAgent(agent, priority);
                count++;
            }
        }

        console.log(`  Indexed ${count} agents`);
    }

    /**
     * Parse agent metadata from file
     * @param {string} filePath - Agent file path
     * @param {string} pluginName - Plugin name
     * @returns {Object|null} Agent metadata
     */
    parseAgent(filePath, pluginName) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');

            const agent = {
                plugin: pluginName,
                file: path.basename(filePath),
                path: filePath
            };

            let inFrontmatter = false;
            let inToolsArray = false;
            let inKeywordsArray = false;
            const toolsArray = [];
            const keywordsArray = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                if (line.trim() === '---') {
                    if (!inFrontmatter) {
                        inFrontmatter = true;
                    } else {
                        break; // End of frontmatter
                    }
                    continue;
                }

                if (!inFrontmatter) continue;

                // Handle array continuations
                if (inToolsArray) {
                    if (line.startsWith('  - ')) {
                        toolsArray.push(line.substring(4).trim());
                        continue;
                    } else {
                        inToolsArray = false;
                    }
                }

                if (inKeywordsArray) {
                    if (line.startsWith('  - ')) {
                        keywordsArray.push(line.substring(4).trim());
                        continue;
                    } else {
                        inKeywordsArray = false;
                    }
                }

                // Parse key-value pairs
                const match = line.match(/^(\w+):\s*(.*)$/);
                if (match) {
                    const [, key, value] = match;
                    const trimmedValue = value.trim();

                    // Handle different value formats
                    if (trimmedValue === '' || trimmedValue === '[]') {
                        // Start of array
                        if (key === 'tools') {
                            inToolsArray = true;
                        } else if (key === 'triggerKeywords') {
                            inKeywordsArray = true;
                        }
                    } else if (trimmedValue.startsWith('[') && trimmedValue.endsWith(']')) {
                        // Inline array
                        const arrayValue = trimmedValue.slice(1, -1)
                            .split(',')
                            .map(v => v.trim().replace(/^["']|["']$/g, ''))
                            .filter(v => v);

                        if (key === 'tools') {
                            agent.tools = arrayValue;
                        } else if (key === 'triggerKeywords') {
                            agent.triggerKeywords = arrayValue;
                        }
                    } else {
                        // Simple value
                        agent[key] = trimmedValue.replace(/^["']|["']$/g, '');
                    }
                }
            }

            // Handle collected arrays
            if (toolsArray.length > 0) {
                agent.tools = toolsArray;
            }
            if (keywordsArray.length > 0) {
                agent.triggerKeywords = keywordsArray;
            }

            // Ensure required fields
            if (!agent.name) {
                agent.name = path.basename(filePath, '.md');
            }

            return agent;

        } catch (error) {
            console.error(`  Error parsing ${path.basename(filePath)}: ${error.message}`);
            return null;
        }
    }

    /**
     * Index agent in all lookup structures
     * @param {Object} agent - Agent metadata
     * @param {number} priority - Source priority
     */
    indexAgent(agent, priority = 1) {
        const agentName = agent.name;
        const existingPriority = this.agentPriority[agentName];

        if (existingPriority !== undefined) {
            if (priority <= existingPriority) {
                return;
            }
            this.removeAgent(this.index.agents[agentName]);
        }

        this.agentPriority[agentName] = priority;

        // Store full metadata
        this.index.agents[agentName] = agent;

        // Index by plugin
        if (!this.index.byPlugin[agent.plugin]) {
            this.index.byPlugin[agent.plugin] = [];
        }
        if (!this.index.byPlugin[agent.plugin].includes(agentName)) {
            this.index.byPlugin[agent.plugin].push(agentName);
        }

        // Index by tier (if present)
        if (agent.tier) {
            const tier = `tier-${agent.tier}`;
            if (!this.index.byTier[tier]) {
                this.index.byTier[tier] = [];
            }
            if (!this.index.byTier[tier].includes(agentName)) {
                this.index.byTier[tier].push(agentName);
            }
        }

        // Index by trigger keywords
        if (agent.triggerKeywords && Array.isArray(agent.triggerKeywords)) {
            for (const keyword of agent.triggerKeywords) {
                const normalizedKeyword = keyword.toLowerCase();
                if (!this.index.byKeyword[normalizedKeyword]) {
                    this.index.byKeyword[normalizedKeyword] = [];
                }
                if (!this.index.byKeyword[normalizedKeyword].includes(agentName)) {
                    this.index.byKeyword[normalizedKeyword].push(agentName);
                }
            }
        }
    }

    removeAgent(agent) {
        if (!agent) {
            return;
        }

        const agentName = agent.name;
        delete this.agentPriority[agentName];

        if (this.index.byPlugin[agent.plugin]) {
            this.index.byPlugin[agent.plugin] = this.index.byPlugin[agent.plugin]
                .filter(name => name !== agentName);
        }

        if (agent.tier) {
            const tier = `tier-${agent.tier}`;
            if (this.index.byTier[tier]) {
                this.index.byTier[tier] = this.index.byTier[tier]
                    .filter(name => name !== agentName);
            }
        }

        if (agent.triggerKeywords && Array.isArray(agent.triggerKeywords)) {
            for (const keyword of agent.triggerKeywords) {
                const normalizedKeyword = keyword.toLowerCase();
                if (this.index.byKeyword[normalizedKeyword]) {
                    this.index.byKeyword[normalizedKeyword] = this.index.byKeyword[normalizedKeyword]
                        .filter(name => name !== agentName);
                }
            }
        }
    }

    /**
     * Save routing index to file
     * @param {string} outputPath - Output file path
     */
    save(outputPath) {
        // Add statistics
        this.index.stats = {
            totalAgents: this.index.totalAgents,
            totalKeywords: Object.keys(this.index.byKeyword).length,
            totalPlugins: Object.keys(this.index.byPlugin).length,
            agentsWithKeywords: Object.values(this.index.agents)
                .filter(a => a.triggerKeywords && a.triggerKeywords.length > 0).length,
            agentsWithTools: Object.values(this.index.agents)
                .filter(a => a.tools && a.tools.length > 0).length,
            avgKeywordsPerAgent: (Object.values(this.index.agents)
                .reduce((sum, a) => sum + (a.triggerKeywords?.length || 0), 0) /
                this.index.totalAgents).toFixed(2)
        };

        fs.writeFileSync(outputPath, JSON.stringify(this.index, null, 2));
        console.log(`\n✓ Routing index saved: ${outputPath}`);
        console.log('\nIndex Statistics:');
        console.log(`  Total agents:           ${this.index.stats.totalAgents}`);
        console.log(`  Unique keywords:        ${this.index.stats.totalKeywords}`);
        console.log(`  Plugins:                ${this.index.stats.totalPlugins}`);
        console.log(`  Agents with keywords:   ${this.index.stats.agentsWithKeywords}`);
        console.log(`  Agents with tools:      ${this.index.stats.agentsWithTools}`);
        console.log(`  Avg keywords/agent:     ${this.index.stats.avgKeywordsPerAgent}`);
    }

    /**
     * Get routing index (for programmatic use)
     * @returns {Object} Routing index
     */
    getIndex() {
        return this.index;
    }
}

// CLI interface
if (require.main === module) {
    const { entries } = collectPluginEntries();
    const outputPath = path.join(__dirname, '../../../cross-platform-plugin/routing-index.json');

    const builder = new RoutingIndexBuilder();
    builder.build(entries);
    builder.save(outputPath);

    console.log('\n✓ Routing index build complete!');
}

module.exports = { RoutingIndexBuilder };
