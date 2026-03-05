#!/usr/bin/env node

/**
 * Playbook Registry System
 * ========================
 * Indexes, manages, and provides access to all playbooks
 * Tracks versions, triggers, and agent associations
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const crypto = require('crypto');
const { execSync } = require('child_process');

class PlaybookRegistry {
    constructor(options = {}) {
        this.playbooksDir = options.playbooksDir || path.join(__dirname, '../../docs/playbooks');
        this.agentsDir = options.agentsDir || path.join(__dirname, '../../agents');
        this.registryPath = options.registryPath || path.join(this.agentsDir, 'shared/playbook-registry.yaml');
        this.registry = null;
        this.playbookCache = new Map();
    }

    /**
     * Initialize and load the registry
     */
    async initialize() {
        console.log('🔄 Initializing Playbook Registry...');

        // Create registry directory if it doesn't exist
        const registryDir = path.dirname(this.registryPath);
        if (!fs.existsSync(registryDir)) {
            fs.mkdirSync(registryDir, { recursive: true });
        }

        // Load or build registry
        if (fs.existsSync(this.registryPath)) {
            await this.loadRegistry();
        } else {
            await this.buildRegistry();
        }

        console.log(`✅ Registry initialized with ${this.registry.playbooks.length} playbooks`);
        return this.registry;
    }

    /**
     * Build the registry from scratch by scanning playbooks
     */
    async buildRegistry() {
        console.log('📚 Building playbook registry from scratch...');

        const registry = {
            version: '1.0.0',
            last_updated: new Date().toISOString(),
            playbooks: [],
            triggers: {},
            agent_mappings: {},
            keywords: {}
        };

        // Scan playbook directory
        const files = fs.readdirSync(this.playbooksDir)
            .filter(f => f.endsWith('.md') && !f.includes('README') && !f.includes('INVENTORY'));

        for (const file of files) {
            const filePath = path.join(this.playbooksDir, file);
            const playbook = await this.parsePlaybook(filePath);
            if (playbook) {
                registry.playbooks.push(playbook);

                // Index triggers
                if (playbook.triggers) {
                    playbook.triggers.forEach(trigger => {
                        if (!registry.triggers[trigger]) {
                            registry.triggers[trigger] = [];
                        }
                        registry.triggers[trigger].push(playbook.name);
                    });
                }

                // Index keywords
                if (playbook.keywords) {
                    playbook.keywords.forEach(keyword => {
                        if (!registry.keywords[keyword]) {
                            registry.keywords[keyword] = [];
                        }
                        registry.keywords[keyword].push(playbook.name);
                    });
                }
            }
        }

        // Map agents to playbooks
        await this.mapAgentsToPlaybooks(registry);

        this.registry = registry;
        await this.saveRegistry();
        return registry;
    }

    /**
     * Parse a playbook markdown file
     */
    async parsePlaybook(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');

            const playbook = {
                name: path.basename(filePath, '.md'),
                path: path.relative(process.cwd(), filePath),
                version: this.getFileVersion(filePath),
                hash: this.getFileHash(content),
                last_modified: fs.statSync(filePath).mtime.toISOString(),
                triggers: [],
                keywords: [],
                scripts: [],
                agents: [],
                preconditions: [],
                description: ''
            };

            let currentSection = '';
            let inCodeBlock = false;

            for (const line of lines) {
                // Track code blocks
                if (line.startsWith('```')) {
                    inCodeBlock = !inCodeBlock;
                    continue;
                }

                // Skip code block content
                if (inCodeBlock) {
                    // Extract script references from code blocks
                    const scriptMatch = line.match(/(?:bash|node|python)\s+(scripts\/[\w\-\/\.]+)/);
                    if (scriptMatch) {
                        playbook.scripts.push(scriptMatch[1]);
                    }
                    continue;
                }

                // Parse sections
                if (line.startsWith('# ')) {
                    playbook.title = line.replace('# ', '').trim();
                } else if (line.startsWith('**Purpose:**')) {
                    playbook.description = line.replace('**Purpose:**', '').trim();
                } else if (line.startsWith('## ')) {
                    currentSection = line.replace('## ', '').trim().toLowerCase();
                } else if (currentSection === 'triggers' && line.startsWith('- ')) {
                    const trigger = line.replace('- ', '').trim();
                    playbook.triggers.push(this.extractTriggerKeywords(trigger));
                } else if (currentSection === 'preconditions' && line.startsWith('- ')) {
                    playbook.preconditions.push(line.replace('- ', '').trim());
                }

                // Extract script references from markdown
                const scriptRefMatch = line.match(/`(scripts\/[\w\-\/\.]+)`/);
                if (scriptRefMatch && !playbook.scripts.includes(scriptRefMatch[1])) {
                    playbook.scripts.push(scriptRefMatch[1]);
                }
            }

            // Generate keywords from content
            playbook.keywords = this.generateKeywords(playbook);

            return playbook;
        } catch (error) {
            console.error(`❌ Failed to parse playbook ${filePath}:`, error.message);
            return null;
        }
    }

    /**
     * Extract trigger keywords for matching
     */
    extractTriggerKeywords(trigger) {
        const keywords = [];

        // Common patterns
        const patterns = {
            deployment: /deploy|promote|release/i,
            validation: /validat|check|verif/i,
            rollback: /rollback|revert|undo/i,
            'data-operation': /bulk|import|export|upsert/i,
            metadata: /metadata|field|object|layout/i,
            flow: /flow|automation|workflow/i,
            report: /report|dashboard|analytics/i,
            permission: /permission|profile|security/i,
            error: /error|fail|issue/i
        };

        for (const [key, pattern] of Object.entries(patterns)) {
            if (pattern.test(trigger)) {
                keywords.push(key);
            }
        }

        return { text: trigger, keywords };
    }

    /**
     * Generate keywords from playbook content
     */
    generateKeywords(playbook) {
        const keywords = new Set();

        // Add name-based keywords
        const nameParts = playbook.name.split('-');
        nameParts.forEach(part => keywords.add(part.toLowerCase()));

        // Add trigger keywords
        if (playbook.triggers) {
            playbook.triggers.forEach(trigger => {
                if (trigger.keywords) {
                    trigger.keywords.forEach(kw => keywords.add(kw));
                }
            });
        }

        // Add script-based keywords
        if (playbook.scripts) {
            playbook.scripts.forEach(script => {
                const scriptName = path.basename(script, path.extname(script));
                scriptName.split(/[-_]/).forEach(part => {
                    if (part.length > 2) keywords.add(part.toLowerCase());
                });
            });
        }

        return Array.from(keywords);
    }

    /**
     * Map agents to their relevant playbooks
     */
    async mapAgentsToPlaybooks(registry) {
        const agentFiles = fs.readdirSync(this.agentsDir)
            .filter(f => f.endsWith('.yaml'));

        for (const file of agentFiles) {
            const filePath = path.join(this.agentsDir, file);
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const agent = yaml.load(content);
                const agentName = path.basename(file, '.yaml');

                // Check if agent has explicit playbook mappings
                if (agent.playbooks) {
                    registry.agent_mappings[agentName] = {
                        explicit: Object.keys(agent.playbooks),
                        implicit: []
                    };

                    // Update playbook agent lists
                    Object.keys(agent.playbooks).forEach(playbookName => {
                        const playbook = registry.playbooks.find(p =>
                            p.name === playbookName || p.path.includes(agent.playbooks[playbookName])
                        );
                        if (playbook && !playbook.agents.includes(agentName)) {
                            playbook.agents.push(agentName);
                        }
                    });
                } else {
                    // Infer playbook associations based on agent capabilities
                    const implicitPlaybooks = this.inferPlaybooksForAgent(agent, registry);
                    registry.agent_mappings[agentName] = {
                        explicit: [],
                        implicit: implicitPlaybooks
                    };

                    // Update playbook agent lists
                    implicitPlaybooks.forEach(playbookName => {
                        const playbook = registry.playbooks.find(p => p.name === playbookName);
                        if (playbook && !playbook.agents.includes(agentName)) {
                            playbook.agents.push(agentName);
                        }
                    });
                }
            } catch (error) {
                console.warn(`⚠️  Could not parse agent ${file}:`, error.message);
            }
        }
    }

    /**
     * Infer relevant playbooks for an agent based on capabilities
     */
    inferPlaybooksForAgent(agent, registry) {
        const playbooks = [];
        const agentKeywords = this.extractAgentKeywords(agent);

        for (const playbook of registry.playbooks) {
            let score = 0;

            // Check keyword overlap
            const keywordOverlap = playbook.keywords.filter(kw =>
                agentKeywords.includes(kw)
            ).length;
            score += keywordOverlap * 2;

            // Check capability match
            if (agent.capabilities) {
                const capabilityText = JSON.stringify(agent.capabilities).toLowerCase();
                playbook.keywords.forEach(kw => {
                    if (capabilityText.includes(kw)) score++;
                });
            }

            // Check tool overlap
            if (agent.tools && playbook.scripts) {
                const hasRelevantTools = playbook.scripts.some(script => {
                    const scriptType = path.extname(script).slice(1);
                    return (scriptType === 'js' && agent.tools.includes('node')) ||
                           (scriptType === 'sh' && agent.tools.includes('Bash'));
                });
                if (hasRelevantTools) score += 3;
            }

            // Include if score is significant
            if (score >= 3) {
                playbooks.push(playbook.name);
            }
        }

        return playbooks;
    }

    /**
     * Extract keywords from agent configuration
     */
    extractAgentKeywords(agent) {
        const keywords = new Set();

        // From name
        if (agent.name) {
            agent.name.split(/[-_]/).forEach(part =>
                keywords.add(part.toLowerCase())
            );
        }

        // From description
        if (agent.description) {
            const words = agent.description.toLowerCase().split(/\s+/);
            const importantWords = ['deployment', 'metadata', 'data', 'report',
                                   'dashboard', 'flow', 'permission', 'security',
                                   'validation', 'rollback', 'bulk', 'sync'];
            words.forEach(word => {
                if (importantWords.includes(word)) {
                    keywords.add(word);
                }
            });
        }

        return Array.from(keywords);
    }

    /**
     * Get git version/hash for a file
     */
    getFileVersion(filePath) {
        try {
            const hash = execSync(
                `git log -1 --pretty=format:%h -- "${filePath}"`,
                { encoding: 'utf8', cwd: process.cwd() }
            ).trim();
            return hash || 'unknown';
        } catch {
            return 'unknown';
        }
    }

    /**
     * Get content hash for a file
     */
    getFileHash(content) {
        return crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
    }

    /**
     * Load existing registry from file
     */
    async loadRegistry() {
        console.log('📖 Loading existing registry...');
        const content = fs.readFileSync(this.registryPath, 'utf8');
        this.registry = yaml.load(content);

        // Check if registry needs updating
        const hoursSinceUpdate = (Date.now() - new Date(this.registry.last_updated)) / (1000 * 60 * 60);
        if (hoursSinceUpdate > 24) {
            console.log('🔄 Registry is older than 24 hours, rebuilding...');
            await this.buildRegistry();
        }
    }

    /**
     * Save registry to file
     */
    async saveRegistry() {
        const yamlContent = yaml.dump(this.registry, {
            lineWidth: 120,
            noRefs: true
        });

        // Add header comment
        const header = `# Playbook Registry
# Auto-generated by playbook-registry.js
# Last updated: ${this.registry.last_updated}
# DO NOT EDIT MANUALLY - Changes will be overwritten
# Run 'node scripts/lib/playbook-registry.js update' to refresh

`;

        fs.writeFileSync(this.registryPath, header + yamlContent);
        console.log(`💾 Registry saved to ${this.registryPath}`);
    }

    /**
     * Find playbooks matching given criteria
     */
    findPlaybooks(criteria) {
        const results = [];

        if (criteria.trigger) {
            const triggerPlaybooks = this.registry.triggers[criteria.trigger] || [];
            results.push(...triggerPlaybooks.map(name =>
                this.registry.playbooks.find(p => p.name === name)
            ));
        }

        if (criteria.keyword) {
            const keywordPlaybooks = this.registry.keywords[criteria.keyword] || [];
            results.push(...keywordPlaybooks.map(name =>
                this.registry.playbooks.find(p => p.name === name)
            ));
        }

        if (criteria.agent) {
            const agentMapping = this.registry.agent_mappings[criteria.agent];
            if (agentMapping) {
                const allPlaybooks = [...agentMapping.explicit, ...agentMapping.implicit];
                results.push(...allPlaybooks.map(name =>
                    this.registry.playbooks.find(p => p.name === name)
                ));
            }
        }

        if (criteria.script) {
            const scriptPlaybooks = this.registry.playbooks.filter(p =>
                p.scripts && p.scripts.includes(criteria.script)
            );
            results.push(...scriptPlaybooks);
        }

        // Remove duplicates
        const unique = Array.from(new Set(results.filter(Boolean).map(p => p.name)))
            .map(name => results.find(p => p.name === name));

        return unique;
    }

    /**
     * Get playbook content
     */
    async getPlaybookContent(name) {
        // Check cache first
        if (this.playbookCache.has(name)) {
            return this.playbookCache.get(name);
        }

        const playbook = this.registry.playbooks.find(p => p.name === name);
        if (!playbook) {
            throw new Error(`Playbook '${name}' not found in registry`);
        }

        const content = fs.readFileSync(playbook.path, 'utf8');
        this.playbookCache.set(name, content);
        return content;
    }

    /**
     * Get playbook metadata
     */
    getPlaybookMetadata(name) {
        return this.registry.playbooks.find(p => p.name === name);
    }

    /**
     * Get agent playbook mappings
     */
    getAgentPlaybooks(agentName) {
        const mapping = this.registry.agent_mappings[agentName];
        if (!mapping) {
            return { explicit: [], implicit: [], all: [] };
        }

        return {
            explicit: mapping.explicit,
            implicit: mapping.implicit,
            all: [...mapping.explicit, ...mapping.implicit]
        };
    }

    /**
     * Validate playbook exists and is current
     */
    validatePlaybook(name) {
        const playbook = this.registry.playbooks.find(p => p.name === name);
        if (!playbook) {
            return { valid: false, error: 'Playbook not found' };
        }

        // Check if file still exists
        if (!fs.existsSync(playbook.path)) {
            return { valid: false, error: 'Playbook file missing' };
        }

        // Check if content has changed
        const currentContent = fs.readFileSync(playbook.path, 'utf8');
        const currentHash = this.getFileHash(currentContent);
        if (currentHash !== playbook.hash) {
            return { valid: false, error: 'Playbook has been modified', needsUpdate: true };
        }

        return { valid: true, playbook };
    }

    /**
     * Generate usage report
     */
    generateReport() {
        const report = {
            summary: {
                total_playbooks: this.registry.playbooks.length,
                total_agents: Object.keys(this.registry.agent_mappings).length,
                agents_with_explicit_mappings: 0,
                agents_with_implicit_mappings: 0,
                unmapped_agents: 0,
                unused_playbooks: 0
            },
            details: {
                playbook_coverage: {},
                agent_coverage: {},
                script_usage: {}
            }
        };

        // Calculate agent mapping stats
        for (const [agent, mapping] of Object.entries(this.registry.agent_mappings)) {
            if (mapping.explicit.length > 0) {
                report.summary.agents_with_explicit_mappings++;
            } else if (mapping.implicit.length > 0) {
                report.summary.agents_with_implicit_mappings++;
            } else {
                report.summary.unmapped_agents++;
            }

            report.details.agent_coverage[agent] = {
                explicit: mapping.explicit.length,
                implicit: mapping.implicit.length,
                total: mapping.explicit.length + mapping.implicit.length
            };
        }

        // Calculate playbook usage stats
        for (const playbook of this.registry.playbooks) {
            if (playbook.agents.length === 0) {
                report.summary.unused_playbooks++;
            }

            report.details.playbook_coverage[playbook.name] = {
                agents: playbook.agents.length,
                scripts: playbook.scripts.length,
                triggers: playbook.triggers.length
            };

            // Track script usage
            playbook.scripts.forEach(script => {
                if (!report.details.script_usage[script]) {
                    report.details.script_usage[script] = [];
                }
                report.details.script_usage[script].push(playbook.name);
            });
        }

        return report;
    }
}

// CLI interface
if (require.main === module) {
    const registry = new PlaybookRegistry();
    const command = process.argv[2] || 'help';

    const commands = {
        async build() {
            await registry.initialize();
            await registry.buildRegistry();
            console.log('✅ Registry built successfully');
        },

        async update() {
            await registry.buildRegistry();
            console.log('✅ Registry updated successfully');
        },

        async list() {
            await registry.initialize();
            console.log('\n📚 Available Playbooks:\n');
            registry.registry.playbooks.forEach(p => {
                console.log(`  • ${p.name}`);
                console.log(`    Path: ${p.path}`);
                console.log(`    Agents: ${p.agents.join(', ') || 'none'}`);
                console.log(`    Keywords: ${p.keywords.join(', ')}`);
                console.log('');
            });
        },

        async find() {
            const criteria = process.argv[3];
            if (!criteria) {
                console.error('Usage: node playbook-registry.js find <keyword|agent|trigger>');
                process.exit(1);
            }

            await registry.initialize();
            const results = registry.findPlaybooks({
                keyword: criteria,
                agent: criteria,
                trigger: criteria
            });

            console.log(`\n🔍 Playbooks matching "${criteria}":\n`);
            results.forEach(p => {
                console.log(`  • ${p.name} (${p.path})`);
            });
        },

        async report() {
            await registry.initialize();
            const report = registry.generateReport();

            console.log('\n📊 Playbook Registry Report\n');
            console.log('Summary:');
            console.log(`  • Total Playbooks: ${report.summary.total_playbooks}`);
            console.log(`  • Total Agents: ${report.summary.total_agents}`);
            console.log(`  • Agents with explicit mappings: ${report.summary.agents_with_explicit_mappings}`);
            console.log(`  • Agents with implicit mappings: ${report.summary.agents_with_implicit_mappings}`);
            console.log(`  • Unmapped agents: ${report.summary.unmapped_agents}`);
            console.log(`  • Unused playbooks: ${report.summary.unused_playbooks}`);

            if (report.summary.unmapped_agents > 0) {
                console.log('\n⚠️  Agents without playbook mappings:');
                Object.entries(report.details.agent_coverage)
                    .filter(([_, coverage]) => coverage.total === 0)
                    .forEach(([agent]) => console.log(`    - ${agent}`));
            }

            if (report.summary.unused_playbooks > 0) {
                console.log('\n⚠️  Unused playbooks:');
                Object.entries(report.details.playbook_coverage)
                    .filter(([_, coverage]) => coverage.agents === 0)
                    .forEach(([playbook]) => console.log(`    - ${playbook}`));
            }
        },

        help() {
            console.log(`
Playbook Registry Manager

Usage: node scripts/lib/playbook-registry.js <command>

Commands:
  build    - Build registry from scratch
  update   - Update existing registry
  list     - List all playbooks
  find     - Find playbooks by keyword/agent/trigger
  report   - Generate coverage report
  help     - Show this help message

Examples:
  node scripts/lib/playbook-registry.js build
  node scripts/lib/playbook-registry.js find deployment
  node scripts/lib/playbook-registry.js report
            `);
        }
    };

    const cmd = commands[command] || commands.help;
    cmd().catch(console.error);
}

module.exports = PlaybookRegistry;