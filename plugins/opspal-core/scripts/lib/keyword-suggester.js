#!/usr/bin/env node

/**
 * Keyword Suggester - Automatically suggest trigger keywords for agents
 *
 * Analyzes agent names and descriptions to suggest appropriate routing keywords.
 *
 * @version 1.0.0
 * @date 2025-01-08
 */

const fs = require('fs');
const path = require('path');

class KeywordSuggester {
    constructor() {
        // Keyword patterns based on common agent operations
        this.patterns = {
            // Operations
            'deploy': ['deploy', 'deployment', 'release', 'ship', 'publish'],
            'assess': ['assess', 'assessment', 'audit', 'analyze', 'analysis', 'evaluate', 'review'],
            'merge': ['merge', 'consolidate', 'dedupe', 'duplicate', 'combine'],
            'conflict': ['conflict', 'error', 'failed', 'issue', 'problem'],
            'orchestrate': ['orchestrate', 'coordinate', 'manage', 'oversee'],
            'plan': ['plan', 'design', 'architect', 'strategy'],
            'report': ['report', 'dashboard', 'analytics', 'metrics'],
            'workflow': ['workflow', 'automation', 'process', 'flow'],
            'data': ['data', 'import', 'export', 'migration', 'backfill'],
            'permission': ['permission', 'security', 'access', 'profile', 'role'],
            'metadata': ['metadata', 'field', 'object', 'layout', 'validation'],
            'integration': ['integration', 'api', 'webhook', 'sync', 'connect'],
            'quality': ['quality', 'validation', 'check', 'verify'],

            // Platforms
            'salesforce': ['salesforce', 'sf', 'sfdc', 'apex', 'lightning'],
            'hubspot': ['hubspot', 'hs', 'portal'],
            'cpq': ['cpq', 'pricing', 'quote', 'steelbrick', 'sbqq'],
            'revops': ['revops', 'revenue', 'operations', 'funnel'],

            // Environments
            'production': ['production', 'prod', 'live'],
            'sandbox': ['sandbox', 'test', 'dev'],

            // Scopes
            'bulk': ['bulk', 'batch', 'multiple', 'mass'],
            'single': ['single', 'one', 'individual'],

            // Types
            'cross-platform': ['cross-platform', 'multi-platform', 'unified', 'both'],
            'diagram': ['diagram', 'flowchart', 'erd', 'visualize', 'chart'],
            'document': ['document', 'doc', 'documentation', 'guide']
        };

        // Weight multipliers for different parts
        this.weights = {
            agentName: 2.0,
            description: 1.0
        };
    }

    /**
     * Suggest keywords for an agent
     * @param {Object} agent - Agent metadata (name, description)
     * @returns {Array} Suggested keywords
     */
    suggest(agent) {
        const keywords = new Map();

        // Extract keywords from agent name
        this.extractFromText(agent.name, keywords, this.weights.agentName);

        // Extract keywords from description
        if (agent.description) {
            this.extractFromText(agent.description, keywords, this.weights.description);
        }

        // Sort by score and return top keywords
        const sorted = Array.from(keywords.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([keyword, score]) => ({ keyword, score }));

        // Take top 5-10 keywords with score > 0.5
        const selected = sorted
            .filter(k => k.score > 0.5)
            .slice(0, 10)
            .map(k => k.keyword);

        return selected;
    }

    /**
     * Extract keywords from text
     * @param {string} text - Text to analyze
     * @param {Map} keywords - Keyword score map
     * @param {number} weight - Weight multiplier
     */
    extractFromText(text, keywords, weight) {
        const lowerText = text.toLowerCase();

        for (const [category, patternKeywords] of Object.entries(this.patterns)) {
            for (const keyword of patternKeywords) {
                if (lowerText.includes(keyword)) {
                    const currentScore = keywords.get(keyword) || 0;
                    keywords.set(keyword, currentScore + weight);
                }
            }
        }

        // Extract compound words from agent name (e.g., "sfdc-cpq-assessor" -> ["cpq", "assessor"])
        const parts = text.toLowerCase().split(/[-_\s]+/);
        for (const part of parts) {
            if (part.length > 3 && !['sfdc', 'hubspot', 'agent', 'manager'].includes(part)) {
                const currentScore = keywords.get(part) || 0;
                keywords.set(part, currentScore + (weight * 0.5));
            }
        }
    }

    /**
     * Parse agent frontmatter
     * @param {string} content - Agent file content
     * @returns {Object} Parsed agent metadata
     */
    parseAgent(content) {
        const lines = content.split('\n');
        const agent = {};

        let inFrontmatter = false;
        for (const line of lines) {
            if (line.trim() === '---') {
                if (!inFrontmatter) {
                    inFrontmatter = true;
                } else {
                    break;
                }
                continue;
            }

            if (inFrontmatter) {
                const match = line.match(/^(\w+):\s*(.+)$/);
                if (match) {
                    const [, key, value] = match;
                    agent[key] = value.trim().replace(/^["']|["']$/g, '');
                }
            }
        }

        return agent;
    }

    /**
     * Process all agent files in a directory
     * @param {string} agentsDir - Directory containing agent files
     * @returns {Array} Agent keyword suggestions
     */
    processDirectory(agentsDir) {
        const results = [];

        const files = fs.readdirSync(agentsDir)
            .filter(f => f.endsWith('.md'))
            .sort();

        for (const file of files) {
            const filePath = path.join(agentsDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const agent = this.parseAgent(content);

            if (!agent.name) {
                agent.name = path.basename(file, '.md');
            }

            const keywords = this.suggest(agent);

            results.push({
                file,
                name: agent.name,
                description: agent.description || '',
                suggestedKeywords: keywords,
                path: filePath
            });
        }

        return results;
    }

    /**
     * Generate keyword mapping file
     * @param {Array} results - Agent keyword suggestions
     * @param {string} outputPath - Output file path
     */
    generateMapping(results, outputPath) {
        const mapping = {};

        for (const result of results) {
            mapping[result.name] = {
                keywords: result.suggestedKeywords,
                description: result.description,
                file: result.file
            };
        }

        fs.writeFileSync(outputPath, JSON.stringify(mapping, null, 2));
        console.log(`✓ Generated keyword mapping: ${outputPath}`);
    }
}

// CLI interface
if (require.main === module) {
    const suggester = new KeywordSuggester();

    // Find all agent directories
    const pluginsRoot = path.join(__dirname, '../../..');
    const plugins = fs.readdirSync(pluginsRoot)
        .filter(p => p.endsWith('-plugin'));

    const allResults = [];

    for (const plugin of plugins) {
        const agentsDir = path.join(pluginsRoot, plugin, 'agents');
        if (fs.existsSync(agentsDir)) {
            console.log(`\nProcessing ${plugin}...`);
            const results = suggester.processDirectory(agentsDir);
            console.log(`  Found ${results.length} agents`);
            allResults.push(...results);
        }
    }

    // Generate mapping file
    const outputPath = path.join(__dirname, '../../../opspal-core/keyword-mapping.json');
    suggester.generateMapping(allResults, outputPath);

    console.log(`\n✓ Total agents processed: ${allResults.length}`);
    console.log(`✓ Keyword mapping saved to: keyword-mapping.json`);
}

module.exports = { KeywordSuggester };
