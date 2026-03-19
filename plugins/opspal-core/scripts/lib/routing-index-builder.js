#!/usr/bin/env node

/**
 * Routing Index Builder - Build comprehensive agent routing index
 *
 * Scans all agent files and creates routing-index.json for fast agent lookup.
 * QA-002: Now includes commands, hooks, and routingRules for complete coverage.
 *
 * @version 2.0.0
 * @date 2026-02-02
 * @changelog 2.0.0 - Added commands, hooks, routingRules support (QA-002)
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class RoutingIndexBuilder {
    constructor() {
        this.index = {
            version: '2.0.0',
            buildDate: new Date().toISOString(),
            totalAgents: 0,
            totalAgentsFull: 0,
            totalCommands: 0,
            totalHooks: 0,
            byKeyword: {},      // keyword -> [agents]
            byKeywordFull: {},  // keyword -> [plugin:agent]
            byPlugin: {},       // plugin -> [agents]
            byPluginFull: {},   // plugin -> [plugin:agent]
            byTier: {},         // tier -> [agents]
            byTierFull: {},     // tier -> [plugin:agent]
            agents: {},         // agentName -> full metadata
            agentsByFull: {},   // plugin:agentName -> full metadata
            agentsByShort: {},  // agentName -> [plugin:agentName]
            duplicateShortNames: {}, // shortName -> [plugin:agentName]
            commands: {},       // commandName -> { plugin, description, triggerKeywords }
            hooks: {},          // eventType -> [{ plugin, name, description }]
            routingRules: []    // consolidated routing rules from all plugins
        };
    }

    /**
     * Build routing index from all agent files
     * @param {string} pluginsRoot - Root directory containing plugins
     */
    build(pluginsRoot) {
        const entries = fs.readdirSync(pluginsRoot, { withFileTypes: true });
        const plugins = entries
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name)
            .filter(name => this.isPluginDir(path.join(pluginsRoot, name)))
            .sort();

        console.log(`Building routing index from ${plugins.length} plugins...`);

        for (const plugin of plugins) {
            const pluginPath = path.join(pluginsRoot, plugin);
            const agentsDir = path.join(pluginPath, 'agents');

            console.log(`\nProcessing ${plugin}...`);

            // Process agents
            if (fs.existsSync(agentsDir)) {
                this.processPlugin(plugin, agentsDir, pluginsRoot);
            }

            // QA-002: Process commands
            this.processCommands(plugin, pluginPath, pluginsRoot);

            // QA-002: Process hooks
            this.processHooks(plugin, pluginPath, pluginsRoot);

            // QA-002: Process routing rules from plugin.json
            this.processRoutingRules(plugin, pluginPath);
        }

        this.index.totalAgents = Object.keys(this.index.agents).length;
        this.index.totalAgentsFull = Object.keys(this.index.agentsByFull).length;
        this.index.totalCommands = Object.keys(this.index.commands).length;
        this.index.totalHooks = Object.values(this.index.hooks).flat().length;

        console.log(`\n✓ Total agents indexed: ${this.index.totalAgents} short names (${this.index.totalAgentsFull} fully-qualified)`);
        console.log(`✓ Total commands indexed: ${this.index.totalCommands}`);
        console.log(`✓ Total hooks indexed: ${this.index.totalHooks}`);
    }

    /**
     * Process all agents in a plugin
     * @param {string} pluginName - Plugin name
     * @param {string} agentsDir - Agents directory path
     * @param {string} pluginsRoot - Root directory for relative path calculation
     */
    processPlugin(pluginName, agentsDir, pluginsRoot) {
        const files = fs.readdirSync(agentsDir)
            .filter(f => f.endsWith('.md'))
            .sort();

        let count = 0;
        for (const file of files) {
            const filePath = path.join(agentsDir, file);
            const agent = this.parseAgent(filePath, pluginName, pluginsRoot);

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
     * @param {string} pluginsRoot - Root directory for relative path calculation
     * @returns {Object|null} Agent metadata
     */
    parseFrontmatter(content) {
        const match = content.match(/^---\n([\s\S]*?)\n---\s*\n?/);
        if (!match) {
            return { data: {}, body: content };
        }

        try {
            const data = yaml.load(match[1]) || {};
            return {
                data: typeof data === 'object' ? data : {},
                body: content.slice(match[0].length)
            };
        } catch (error) {
            return { data: {}, body: content };
        }
    }

    normalizeStringArray(value) {
        if (!value) return [];

        if (Array.isArray(value)) {
            return value
                .flatMap(v => this.normalizeStringArray(v))
                .filter(Boolean);
        }

        if (typeof value === 'string') {
            return value
                .split(/[,\n|]/)
                .map(v => v.trim().replace(/^["'`]|["'`]$/g, ''))
                .filter(Boolean);
        }

        return [];
    }

    dedupeKeywords(keywords) {
        const seen = new Set();
        const result = [];

        for (const keyword of keywords) {
            const normalized = String(keyword || '').trim().toLowerCase();
            if (!normalized) continue;
            if (seen.has(normalized)) continue;
            seen.add(normalized);
            result.push(normalized);
        }

        return result;
    }

    extractKeywordsFromDescription(description) {
        if (!description) return [];

        const descStr = typeof description === 'string'
            ? description
            : Array.isArray(description)
                ? description.join(' ')
                : String(description);

        const patterns = [
            /TRIGGER KEYWORDS?:\s*([^\n]+)/gi,
            /\*\*Trigger keywords?\*\*[:\s]*([^\n]+)/gi,
            /Routing Keywords?:\s*([^\n]+)/gi,
            /Keywords?:\s*([^\n]+)/gi
        ];

        const extracted = [];
        for (const pattern of patterns) {
            let match = null;
            while ((match = pattern.exec(descStr)) !== null) {
                extracted.push(...this.normalizeStringArray(match[1]));
            }
        }

        return this.dedupeKeywords(extracted);
    }

    extractKeywordsFromBody(body) {
        if (!body) return [];

        const lines = body.split('\n');
        const keywords = [];
        let collecting = false;

        for (const line of lines) {
            const trimmed = line.trim();

            if (
                /^#{1,6}\s*(trigger keywords?|routing keywords?)\b/i.test(trimmed) ||
                /^\*\*Routing Keywords\*\*/i.test(trimmed) ||
                /^Automatically routes when user mentions[:\s]*$/i.test(trimmed)
            ) {
                collecting = true;
                continue;
            }

            if (!collecting) continue;

            if (/^#{1,6}\s+/.test(trimmed) && !/keywords?/i.test(trimmed)) {
                break;
            }

            const bulletMatch = trimmed.match(/^-+\s+(.+)$/);
            if (bulletMatch) {
                keywords.push(
                    bulletMatch[1]
                        .replace(/^["'`]|["'`]$/g, '')
                        .trim()
                );
                continue;
            }

            if (trimmed === '') {
                continue;
            }
        }

        return this.normalizeStringArray(keywords);
    }

    buildDerivedKeywords(agentName, pluginName = '', description = '') {
        const tokens = String(agentName || '')
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter(Boolean);

        if (tokens.length === 0) return [];

        const roleWords = new Set([
            'agent', 'orchestrator', 'manager', 'specialist', 'assistant',
            'coordinator', 'generator', 'builder', 'analyzer', 'architect',
            'developer', 'controller', 'monitor', 'validator', 'executor',
            'planner', 'operator'
        ]);

        const coreTokens = tokens.filter(t => !roleWords.has(t));
        const selected = coreTokens.length > 0 ? coreTokens : tokens;

        const pluginTokens = String(pluginName || '')
            .toLowerCase()
            .replace(/^opspal[-_]?/, '')
            .split(/[^a-z0-9]+/)
            .filter(Boolean)
            .filter(token => token.length >= 3 && token !== 'plugin' && token !== 'internal');

        const keywords = [];

        if (selected.length >= 2) {
            keywords.push(`${selected[0]} ${selected[1]}`);
        }
        if (selected.length >= 3) {
            keywords.push(`${selected[0]} ${selected[1]} ${selected[2]}`);
        }

        for (let i = 0; i < selected.length - 1; i++) {
            keywords.push(`${selected[i]} ${selected[i + 1]}`);
        }

        for (const token of selected) {
            if (token.length >= 3) {
                keywords.push(token);
                if (token.endsWith('er') && token.length >= 5) {
                    keywords.push(token.slice(0, -1));
                }
                // Common action alias for migration-related routing prompts.
                if (token === 'migration') {
                    keywords.push('migrate');
                    keywords.push('migrate data');
                }
            }
        }

        // Add plugin-context phrases (e.g., "hubspot data", "salesforce permission").
        if (pluginTokens.length > 0 && selected.length > 0) {
            for (const pluginToken of pluginTokens.slice(0, 3)) {
                keywords.push(pluginToken);
                for (const selectedToken of selected.slice(0, 3)) {
                    keywords.push(`${pluginToken} ${selectedToken}`);
                    keywords.push(`${selectedToken} ${pluginToken}`);
                }
            }
        }

        if (pluginTokens.length > 0 && selected.length > 1) {
            keywords.push(`${pluginTokens[0]} ${selected[0]} ${selected[1]}`);
        }

        const descriptionText = String(description || '').toLowerCase();
        if (descriptionText.includes('complex') && descriptionText.includes('multi-step')) {
            keywords.push('complex multi-step');
        }
        if (pluginTokens.length > 0 && descriptionText.includes('operations')) {
            keywords.push(`${pluginTokens[0]} operations`);
        }
        if (pluginTokens.length > 0 && descriptionText.includes('workflow')) {
            keywords.push(`${pluginTokens[0]} workflow`);
        }

        return this.dedupeKeywords(keywords).slice(0, 12);
    }

    collectTriggerKeywords(frontmatter, body, agentName, pluginName = '') {
        let keywords = [];

        keywords.push(...this.normalizeStringArray(frontmatter.triggerKeywords));
        keywords.push(...this.normalizeStringArray(frontmatter.trigger_keywords));
        keywords.push(...this.normalizeStringArray(frontmatter.keywords));
        keywords.push(...this.normalizeStringArray(frontmatter.triggers));

        if (frontmatter.routing && typeof frontmatter.routing === 'object') {
            keywords.push(...this.normalizeStringArray(frontmatter.routing.keywords));
        }

        if (keywords.length === 0) {
            keywords.push(...this.extractKeywordsFromDescription(frontmatter.description));
        }

        if (keywords.length === 0) {
            keywords.push(...this.extractKeywordsFromBody(body));
        }

        // Always append derived keywords as a fallback boost, even when explicit keywords exist.
        // This prevents low-signal frontmatter keywords from making agents effectively unroutable.
        const derivedKeywords = this.buildDerivedKeywords(agentName, pluginName, frontmatter.description);
        if (derivedKeywords.length > 0) {
            keywords.push(...derivedKeywords);
        }

        return this.dedupeKeywords(keywords).slice(0, 32);
    }

    parseAgent(filePath, pluginName, pluginsRoot) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const { data: frontmatter, body } = this.parseFrontmatter(content);

            // Store relative path for portability in publish bundles
            const relativePath = pluginsRoot
                ? path.relative(pluginsRoot, filePath)
                : filePath;

            const agent = {
                plugin: pluginName,
                file: path.basename(filePath),
                path: relativePath
            };

            const parsedName = typeof frontmatter.name === 'string'
                ? frontmatter.name.trim()
                : '';
            agent.name = parsedName || path.basename(filePath, '.md');

            if (frontmatter.description != null) {
                if (typeof frontmatter.description === 'string') {
                    agent.description = frontmatter.description.trim();
                } else {
                    agent.description = String(frontmatter.description);
                }
            }

            if (frontmatter.model != null) {
                agent.model = String(frontmatter.model).trim();
            }
            if (frontmatter.color != null) {
                agent.color = String(frontmatter.color).trim();
            }
            if (frontmatter.stage != null) {
                agent.stage = String(frontmatter.stage).trim();
            }
            if (frontmatter.version != null) {
                agent.version = String(frontmatter.version).trim();
            }
            if (frontmatter.complexity != null) {
                agent.complexity = String(frontmatter.complexity).trim();
            }
            if (frontmatter.tier != null) {
                agent.tier = String(frontmatter.tier).trim();
            }

            const tools = this.normalizeStringArray(frontmatter.tools)
                .map(tool => tool === 'Task' ? 'Agent' : tool);
            if (tools.length > 0) {
                agent.tools = tools;
            }

            const keywords = this.collectTriggerKeywords(frontmatter, body, agent.name, pluginName);
            if (keywords.length > 0) {
                agent.triggerKeywords = keywords;
            }

            return agent;

        } catch (error) {
            console.error(`  Error parsing ${path.basename(filePath)}: ${error.message}`);
            return null;
        }
    }

    /**
     * Identify plugin directories by presence of an agents folder.
     * @param {string} pluginDir - Candidate directory path
     * @returns {boolean} True if directory looks like a plugin
     */
    isPluginDir(pluginDir) {
        const agentsDir = path.join(pluginDir, 'agents');
        if (!fs.existsSync(agentsDir) || !fs.statSync(agentsDir).isDirectory()) {
            return false;
        }
        const hasAgentFiles = fs.readdirSync(agentsDir).some(file => file.endsWith('.md'));
        return hasAgentFiles;
    }

    /**
     * QA-002: Process commands from plugin
     * @param {string} pluginName - Plugin name
     * @param {string} pluginPath - Plugin directory path
     * @param {string} pluginsRoot - Root directory for relative path calculation
     */
    processCommands(pluginName, pluginPath, pluginsRoot) {
        const commandsDir = path.join(pluginPath, 'commands');
        const pluginJsonPath = path.join(pluginPath, '.claude-plugin', 'plugin.json');

        // Try loading from plugin.json first
        if (fs.existsSync(pluginJsonPath)) {
            try {
                const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
                const rawCommands = pluginJson.commands || [];
                const commands = Array.isArray(rawCommands)
                    ? rawCommands
                    : Object.values(rawCommands)
                        .flatMap(value => Array.isArray(value) ? value : [value])
                        .filter(Boolean);

                for (const cmd of commands) {
                    if (!cmd.name) continue;

                    const commandKey = `${pluginName}:${cmd.name}`;
                    this.index.commands[commandKey] = {
                        plugin: pluginName,
                        name: cmd.name,
                        description: cmd.description || '',
                        triggerKeywords: cmd.triggerKeywords || [],
                        filePath: cmd.file || null
                    };

                    // Index command keywords
                    if (cmd.triggerKeywords && Array.isArray(cmd.triggerKeywords)) {
                        for (const keyword of cmd.triggerKeywords) {
                            const normalizedKeyword = keyword.toLowerCase();
                            if (!this.index.byKeyword[normalizedKeyword]) {
                                this.index.byKeyword[normalizedKeyword] = [];
                            }
                            this.index.byKeyword[normalizedKeyword].push(`command:${commandKey}`);

                            if (!this.index.byKeywordFull[normalizedKeyword]) {
                                this.index.byKeywordFull[normalizedKeyword] = [];
                            }
                            this.index.byKeywordFull[normalizedKeyword].push(`command:${commandKey}`);
                        }
                    }
                }

                if (commands.length > 0) {
                    console.log(`  Indexed ${commands.length} commands`);
                }
            } catch (error) {
                console.error(`  Error parsing plugin.json for ${pluginName}: ${error.message}`);
            }
        }

        // Also scan commands directory for markdown files
        if (fs.existsSync(commandsDir)) {
            const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));
            for (const file of files) {
                const commandName = path.basename(file, '.md');
                const commandKey = `${pluginName}:${commandName}`;

                if (!this.index.commands[commandKey]) {
                    this.index.commands[commandKey] = {
                        plugin: pluginName,
                        name: commandName,
                        description: '',
                        triggerKeywords: [],
                        filePath: path.relative(pluginsRoot, path.join(commandsDir, file))
                    };
                }
            }
        }
    }

    /**
     * QA-002: Process hooks from plugin
     * @param {string} pluginName - Plugin name
     * @param {string} pluginPath - Plugin directory path
     * @param {string} pluginsRoot - Root directory for relative path calculation
     */
    processHooks(pluginName, pluginPath, pluginsRoot) {
        const hooksDir = path.join(pluginPath, 'hooks');
        const hooksJsonPath = path.join(pluginPath, '.claude-plugin', 'hooks.json');

        // Try loading from hooks.json first
        if (fs.existsSync(hooksJsonPath)) {
            try {
                const hooksJson = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf-8'));
                const rawHooks = hooksJson.hooks || [];
                const hooks = Array.isArray(rawHooks)
                    ? rawHooks
                    : Object.entries(rawHooks).flatMap(([event, value]) => {
                        if (Array.isArray(value)) {
                            return value.map(hook => ({ event, ...hook }));
                        }
                        if (value && typeof value === 'object') {
                            return [{ event, ...value }];
                        }
                        return [];
                    });

                for (const hook of hooks) {
                    const eventType = hook.event || hook.type || 'unknown';
                    if (!this.index.hooks[eventType]) {
                        this.index.hooks[eventType] = [];
                    }

                    this.index.hooks[eventType].push({
                        plugin: pluginName,
                        name: hook.name || path.basename(hook.file || 'unknown', '.sh'),
                        description: hook.description || '',
                        file: hook.file || null,
                        matcher: hook.matcher === 'Task(*)' || hook.matcher === 'Task' || hook.matcher === 'Agent(*)'
                            ? 'Agent'
                            : (hook.matcher || null)
                    });
                }

                if (hooks.length > 0) {
                    console.log(`  Indexed ${hooks.length} hooks`);
                }
            } catch (error) {
                console.error(`  Error parsing hooks.json for ${pluginName}: ${error.message}`);
            }
        }

        // Also scan hooks directory
        if (fs.existsSync(hooksDir)) {
            const files = fs.readdirSync(hooksDir).filter(f => f.endsWith('.sh') || f.endsWith('.js'));
            for (const file of files) {
                // Infer event type from filename (e.g., pre-tool-use-validate.sh -> PreToolUse)
                const eventType = this.inferEventType(file);
                if (!this.index.hooks[eventType]) {
                    this.index.hooks[eventType] = [];
                }

                // Check if already indexed
                const exists = this.index.hooks[eventType].some(
                    h => h.plugin === pluginName && h.name === path.basename(file, path.extname(file))
                );

                if (!exists) {
                    this.index.hooks[eventType].push({
                        plugin: pluginName,
                        name: path.basename(file, path.extname(file)),
                        description: '',
                        file: path.relative(pluginsRoot, path.join(hooksDir, file)),
                        matcher: null
                    });
                }
            }
        }
    }

    /**
     * QA-002: Infer hook event type from filename
     * @param {string} filename - Hook filename
     * @returns {string} Event type
     */
    inferEventType(filename) {
        const lower = filename.toLowerCase();
        if (lower.includes('pre-tool') || lower.startsWith('pre_tool')) return 'PreToolUse';
        if (lower.includes('post-tool') || lower.startsWith('post_tool')) return 'PostToolUse';
        if (lower.includes('pre-task') || lower.startsWith('pre_task')) return 'PreTask';
        if (lower.includes('post-task') || lower.startsWith('post_task')) return 'PostTask';
        if (lower.includes('stop')) return 'Stop';
        if (lower.includes('notification')) return 'Notification';
        if (lower.includes('pre-commit')) return 'PreCommit';
        if (lower.includes('post-commit')) return 'PostCommit';
        return 'Unknown';
    }

    /**
     * QA-002: Process routing rules from plugin.json
     * @param {string} pluginName - Plugin name
     * @param {string} pluginPath - Plugin directory path
     */
    processRoutingRules(pluginName, pluginPath) {
        const pluginJsonPath = path.join(pluginPath, '.claude-plugin', 'plugin.json');

        if (fs.existsSync(pluginJsonPath)) {
            try {
                const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
                const routingRules = pluginJson.routingRules || [];

                for (const rule of routingRules) {
                    this.index.routingRules.push({
                        plugin: pluginName,
                        ...rule
                    });
                }
            } catch (error) {
                // Silently skip if no routing rules
            }
        }
    }

    /**
     * Index agent in all lookup structures
     * @param {Object} agent - Agent metadata
     */
    indexAgent(agent) {
        const agentName = agent.name;
        const fullAgentName = `${agent.plugin}:${agentName}`;
        const enrichedAgent = {
            ...agent,
            shortName: agentName,
            fullName: fullAgentName
        };

        // Store all agents by fully-qualified name (collision-safe)
        this.index.agentsByFull[fullAgentName] = enrichedAgent;

        // Track short-name -> full-name mapping
        if (!this.index.agentsByShort[agentName]) {
            this.index.agentsByShort[agentName] = [];
        }
        if (!this.index.agentsByShort[agentName].includes(fullAgentName)) {
            this.index.agentsByShort[agentName].push(fullAgentName);
        }

        // Backward-compatible short-name map (first-seen wins for deterministic behavior)
        if (!this.index.agents[agentName]) {
            this.index.agents[agentName] = enrichedAgent;
        } else {
            if (!this.index.duplicateShortNames[agentName]) {
                const existing = this.index.agents[agentName];
                this.index.duplicateShortNames[agentName] = [existing.fullName || `${existing.plugin}:${agentName}`];
            }
            if (!this.index.duplicateShortNames[agentName].includes(fullAgentName)) {
                this.index.duplicateShortNames[agentName].push(fullAgentName);
            }
        }

        // Index by plugin
        if (!this.index.byPlugin[agent.plugin]) {
            this.index.byPlugin[agent.plugin] = [];
        }
        this.index.byPlugin[agent.plugin].push(agentName);

        // Collision-safe plugin index
        if (!this.index.byPluginFull[agent.plugin]) {
            this.index.byPluginFull[agent.plugin] = [];
        }
        this.index.byPluginFull[agent.plugin].push(fullAgentName);

        // Index by tier (if present)
        if (agent.tier) {
            const tier = `tier-${agent.tier}`;
            if (!this.index.byTier[tier]) {
                this.index.byTier[tier] = [];
            }
            this.index.byTier[tier].push(agentName);

            if (!this.index.byTierFull[tier]) {
                this.index.byTierFull[tier] = [];
            }
            this.index.byTierFull[tier].push(fullAgentName);
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

                if (!this.index.byKeywordFull[normalizedKeyword]) {
                    this.index.byKeywordFull[normalizedKeyword] = [];
                }
                if (!this.index.byKeywordFull[normalizedKeyword].includes(fullAgentName)) {
                    this.index.byKeywordFull[normalizedKeyword].push(fullAgentName);
                }
            }
        }
    }

    /**
     * Save routing index to file
     * @param {string} outputPath - Output file path
     */
    save(outputPath) {
        // Add statistics (QA-002: include commands, hooks, routingRules)
        this.index.stats = {
            totalAgents: this.index.totalAgents,
            totalAgentsFull: this.index.totalAgentsFull,
            totalCommands: this.index.totalCommands,
            totalHooks: this.index.totalHooks,
            totalRoutingRules: this.index.routingRules.length,
            totalKeywords: Object.keys(this.index.byKeyword).length,
            totalKeywordsFull: Object.keys(this.index.byKeywordFull).length,
            totalPlugins: Object.keys(this.index.byPlugin).length,
            duplicateShortNames: Object.keys(this.index.duplicateShortNames).length,
            agentsWithKeywords: Object.values(this.index.agents)
                .filter(a => a.triggerKeywords && a.triggerKeywords.length > 0).length,
            agentsWithKeywordsFull: Object.values(this.index.agentsByFull)
                .filter(a => a.triggerKeywords && a.triggerKeywords.length > 0).length,
            agentsWithTools: Object.values(this.index.agents)
                .filter(a => a.tools && a.tools.length > 0).length,
            agentsWithToolsFull: Object.values(this.index.agentsByFull)
                .filter(a => a.tools && a.tools.length > 0).length,
            avgKeywordsPerAgent: this.index.totalAgents > 0
                ? (Object.values(this.index.agents)
                    .reduce((sum, a) => sum + (a.triggerKeywords?.length || 0), 0) /
                    this.index.totalAgents).toFixed(2)
                : '0.00',
            hooksByEvent: Object.fromEntries(
                Object.entries(this.index.hooks).map(([k, v]) => [k, v.length])
            )
        };

        fs.writeFileSync(outputPath, JSON.stringify(this.index, null, 2));
        console.log(`\n✓ Routing index saved: ${outputPath}`);
        console.log('\nIndex Statistics:');
        console.log(`  Total agents:           ${this.index.stats.totalAgents}`);
        console.log(`  Total agents (full):    ${this.index.stats.totalAgentsFull}`);
        console.log(`  Total commands:         ${this.index.stats.totalCommands}`);
        console.log(`  Total hooks:            ${this.index.stats.totalHooks}`);
        console.log(`  Total routing rules:    ${this.index.stats.totalRoutingRules}`);
        console.log(`  Unique keywords:        ${this.index.stats.totalKeywords}`);
        console.log(`  Unique keywords (full): ${this.index.stats.totalKeywordsFull}`);
        console.log(`  Plugins:                ${this.index.stats.totalPlugins}`);
        console.log(`  Duplicate short names:  ${this.index.stats.duplicateShortNames}`);
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
    // Support environment variable overrides for portability
    const defaultPluginsRoot = path.join(__dirname, '../../..');
    const defaultOutputPath = path.join(__dirname, '../../routing-index.json');

    const pluginsRoot = process.env.PLUGINS_ROOT || process.argv[2] || defaultPluginsRoot;
    const outputPath = process.env.ROUTING_INDEX_OUTPUT || process.argv[3] || defaultOutputPath;

    console.log(`Plugins root: ${pluginsRoot}`);
    console.log(`Output path: ${outputPath}`);

    const builder = new RoutingIndexBuilder();
    builder.build(pluginsRoot);
    builder.save(outputPath);

    console.log('\n✓ Routing index build complete!');
}

module.exports = { RoutingIndexBuilder };
