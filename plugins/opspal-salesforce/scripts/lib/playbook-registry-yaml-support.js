#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const crypto = require('crypto');

/**
 * Playbook Registry Manager
 * Maintains a searchable registry of all playbooks and their metadata
 */
class PlaybookRegistry {
    constructor(options = {}) {
        this.playbooksDir = options.playbooksDir || this.resolveDocsDirectory();
        this.agentsDir = options.agentsDir || path.join(__dirname, '../../agents');
        this.registryPath = options.registryPath || path.join(this.agentsDir, 'shared/playbook-registry.yaml');
    }

    resolveDocsDirectory() {
        const candidates = [
            path.join(__dirname, '../../docs/runbooks'),
            path.join(__dirname, '../../docs/playbooks')
        ];

        for (const candidate of candidates) {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
                return candidate;
            }
        }

        return candidates[0];
    }

    collectPlaybookFiles(rootDir) {
        const files = [];

        if (!fs.existsSync(rootDir)) {
            return files;
        }

        const entries = fs.readdirSync(rootDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(rootDir, entry.name);

            if (entry.isDirectory()) {
                files.push(...this.collectPlaybookFiles(fullPath));
                continue;
            }

            if (!entry.isFile()) {
                continue;
            }

            const lowerName = entry.name.toLowerCase();
            if ((!lowerName.endsWith('.md') && !lowerName.endsWith('.yaml')) ||
                lowerName.includes('readme') ||
                lowerName.includes('inventory')) {
                continue;
            }

            files.push(fullPath);
        }

        return files;
    }

    /**
     * Build registry from scratch
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

        const files = this.collectPlaybookFiles(this.playbooksDir);

        for (const file of files) {
            const playbook = file.endsWith('.yaml')
                ? await this.parseYamlPlaybook(file)
                : await this.parseMarkdownPlaybook(file);

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
                    playbook.keywords.forEach(kw => {
                        if (!registry.keywords[kw]) {
                            registry.keywords[kw] = [];
                        }
                        registry.keywords[kw].push(playbook.name);
                    });
                }
            }
        }

        // Map agents to playbooks
        await this.mapAgentsToPlaybooks(registry);

        // Save registry
        this.saveRegistry(registry);

        return registry;
    }

    /**
     * Parse a YAML playbook file
     */
    async parseYamlPlaybook(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const playbookData = yaml.load(content);

            const playbook = {
                name: playbookData.id || path.basename(filePath, '.yaml'),
                path: path.relative(process.cwd(), filePath),
                version: playbookData.version || '1.0',
                hash: this.getFileHash(content),
                last_modified: fs.statSync(filePath).mtime.toISOString(),
                triggers: [],
                keywords: [],
                scripts: [],
                agents: [],
                preconditions: [],
                description: playbookData.description || '',
                title: playbookData.name || ''
            };

            // Extract keywords from tags
            if (playbookData.tags) {
                playbook.keywords = playbookData.tags;
            }

            // Extract scripts from implementation steps and flow metadata
            if (playbookData.implementation_steps) {
                playbookData.implementation_steps.forEach(step => {
                    if (step.details) {
                        const scriptMatch = step.details.match(/scripts\/[\w\-\/\.]+/g);
                        if (scriptMatch) {
                            scriptMatch.forEach(script => {
                                if (!playbook.scripts.includes(script)) {
                                    playbook.scripts.push(script);
                                }
                            });
                        }
                    }
                });
            }

            // Extract agents from components
            if (playbookData.components && playbookData.components.automation) {
                playbookData.components.automation.forEach(automation => {
                    if (automation.type === 'Record-Triggered Flow') {
                        // This would typically be handled by sfdc-automation-builder
                        if (!playbook.agents.includes('sfdc-automation-builder')) {
                            playbook.agents.push('sfdc-automation-builder');
                        }
                    }
                });
            }

            // Add related playbooks as agents
            if (playbookData.related_playbooks) {
                // These might reference other agents
                if (!playbook.agents.includes('sfdc-orchestrator')) {
                    playbook.agents.push('sfdc-orchestrator');
                }
            }

            return playbook;
        } catch (error) {
            console.error(`❌ Failed to parse YAML playbook ${filePath}:`, error.message);
            return null;
        }
    }

    /**
     * Parse a markdown playbook file
     */
    async parseMarkdownPlaybook(filePath) {
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
                description: '',
                title: ''
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
            console.error(`❌ Failed to parse markdown playbook ${filePath}:`, error.message);
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
            error: /error|fail|issue/i,
            campaign: /campaign|marketing|attribution/i,
            lead: /lead|prospect/i,
            contact: /contact|person/i
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

                if (!registry.agent_mappings[agentName]) {
                    registry.agent_mappings[agentName] = {
                        explicit: [],
                        implicit: []
                    };
                }

                // Check for explicit playbook references
                if (agent.playbooks) {
                    registry.agent_mappings[agentName].explicit = agent.playbooks;
                }

                // Check for implicit references
                registry.playbooks.forEach(playbook => {
                    if (playbook.agents && playbook.agents.includes(agentName)) {
                        registry.agent_mappings[agentName].implicit.push(playbook.name);
                    }
                });
            } catch (error) {
                console.warn(`⚠️  Could not parse agent ${file}:`, error.message);
            }
        }
    }

    /**
     * Save registry to file
     */
    saveRegistry(registry) {
        const header = `# Playbook Registry
# Auto-generated by playbook-registry-yaml-support.js
# Last updated: ${new Date().toISOString()}
# DO NOT EDIT MANUALLY - Changes will be overwritten
# Run 'node scripts/lib/playbook-registry-yaml-support.js update' to refresh

`;
        const content = header + yaml.dump(registry, {
            sortKeys: false,
            lineWidth: 120,
            noRefs: true
        });

        fs.writeFileSync(this.registryPath, content);
        console.log(`💾 Registry saved to ${this.registryPath}`);
    }

    /**
     * Get file hash for change detection
     */
    getFileHash(content) {
        return crypto.createHash('md5').update(content).digest('hex').substring(0, 8);
    }

    /**
     * Extract version from file content
     */
    getFileVersion(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        const versionMatch = content.match(/Version:\s*([\d.]+)/i);
        return versionMatch ? versionMatch[1] : 'unknown';
    }
}

// CLI interface
async function main() {
    const command = process.argv[2];
    const registry = new PlaybookRegistry();

    switch (command) {
        case 'build':
        case 'update':
            await registry.buildRegistry();
            console.log('✅ Registry updated successfully');
            break;

        case 'help':
        default:
            console.log(`
Playbook Registry Manager with YAML Support

Usage: node scripts/lib/playbook-registry-yaml-support.js <command>

Commands:
  build    - Build registry from scratch (includes .yaml playbooks)
  update   - Update existing registry (includes .yaml playbooks)
  help     - Show this help message

This enhanced version supports both Markdown (.md) and YAML (.yaml) playbook formats.

Examples:
  node scripts/lib/playbook-registry-yaml-support.js build
  node scripts/lib/playbook-registry-yaml-support.js update
            `);
            break;
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = PlaybookRegistry;
