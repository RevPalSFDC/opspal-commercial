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
    }

    /**
     * Build routing index from all agent files
     * @param {string} pluginsRoot - Root directory containing plugins
     */
    build(pluginsRoot) {
        const plugins = fs.readdirSync(pluginsRoot)
            .filter(p => p.endsWith('-plugin'))
            .sort();

        console.log(`Building routing index from ${plugins.length} plugins...`);

        for (const plugin of plugins) {
            const agentsDir = path.join(pluginsRoot, plugin, 'agents');
            if (fs.existsSync(agentsDir)) {
                console.log(`\nProcessing ${plugin}...`);
                this.processPlugin(plugin, agentsDir);
            }
        }

        this.index.totalAgents = Object.keys(this.index.agents).length;
        console.log(`\n✓ Total agents indexed: ${this.index.totalAgents}`);
    }

    /**
     * Process all agents in a plugin
     * @param {string} pluginName - Plugin name
     * @param {string} agentsDir - Agents directory path
     */
    processPlugin(pluginName, agentsDir) {
        const files = fs.readdirSync(agentsDir)
            .filter(f => f.endsWith('.md'))
            .sort();

        let count = 0;
        for (const file of files) {
            const filePath = path.join(agentsDir, file);
            const agent = this.parseAgent(filePath, pluginName);

            if (agent && agent.name) {
                this.indexAgent(agent);
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
     */
    indexAgent(agent) {
        const agentName = agent.name;

        // Store full metadata
        this.index.agents[agentName] = agent;

        // Index by plugin
        if (!this.index.byPlugin[agent.plugin]) {
            this.index.byPlugin[agent.plugin] = [];
        }
        this.index.byPlugin[agent.plugin].push(agentName);

        // Index by tier (if present)
        if (agent.tier) {
            const tier = `tier-${agent.tier}`;
            if (!this.index.byTier[tier]) {
                this.index.byTier[tier] = [];
            }
            this.index.byTier[tier].push(agentName);
        }

        // Index by trigger keywords
        if (agent.triggerKeywords && Array.isArray(agent.triggerKeywords)) {
            for (const keyword of agent.triggerKeywords) {
                const normalizedKeyword = keyword.toLowerCase();
                if (!this.index.byKeyword[normalizedKeyword]) {
                    this.index.byKeyword[normalizedKeyword] = [];
                }
                this.index.byKeyword[normalizedKeyword].push(agentName);
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
    const pluginsRoot = path.join(__dirname, '../../..');
    const outputPath = path.join(__dirname, '../../../cross-platform-plugin/routing-index.json');

    const builder = new RoutingIndexBuilder();
    builder.build(pluginsRoot);
    builder.save(outputPath);

    console.log('\n✓ Routing index build complete!');
}

module.exports = { RoutingIndexBuilder };
