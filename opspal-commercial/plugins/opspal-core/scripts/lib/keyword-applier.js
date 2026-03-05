#!/usr/bin/env node

/**
 * Keyword Applier - Apply trigger keywords to agent frontmatter
 *
 * Reads keyword-mapping.json and updates all agent files with triggerKeywords.
 *
 * @version 1.0.0
 * @date 2025-01-08
 */

const fs = require('fs');
const path = require('path');

class KeywordApplier {
    constructor(mappingPath, options = {}) {
        this.mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
        this.dryRun = options.dryRun || false;
        this.verbose = options.verbose || false;
        this.stats = {
            processed: 0,
            updated: 0,
            skipped: 0,
            errors: 0
        };
    }

    /**
     * Apply keywords to all agents
     * @param {string} pluginsRoot - Root directory containing plugins
     */
    applyAll(pluginsRoot) {
        const plugins = fs.readdirSync(pluginsRoot)
            .filter(p => p.endsWith('-plugin'));

        for (const plugin of plugins) {
            const agentsDir = path.join(pluginsRoot, plugin, 'agents');
            if (fs.existsSync(agentsDir)) {
                console.log(`\nProcessing ${plugin}...`);
                this.processDirectory(agentsDir);
            }
        }
    }

    /**
     * Process all agent files in a directory
     * @param {string} agentsDir - Directory containing agent files
     */
    processDirectory(agentsDir) {
        const files = fs.readdirSync(agentsDir)
            .filter(f => f.endsWith('.md'))
            .sort();

        for (const file of files) {
            const filePath = path.join(agentsDir, file);
            this.processFile(filePath);
        }
    }

    /**
     * Process a single agent file
     * @param {string} filePath - Agent file path
     */
    processFile(filePath) {
        this.stats.processed++;

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const agentName = this.extractAgentName(content);

            if (!agentName) {
                if (this.verbose) {
                    console.log(`  ⚠ No agent name found: ${path.basename(filePath)}`);
                }
                this.stats.skipped++;
                return;
            }

            const keywordData = this.mapping[agentName];
            if (!keywordData || !keywordData.keywords || keywordData.keywords.length === 0) {
                if (this.verbose) {
                    console.log(`  ⚠ No keywords for: ${agentName}`);
                }
                this.stats.skipped++;
                return;
            }

            // Check if already has triggerKeywords
            if (content.includes('triggerKeywords:')) {
                if (this.verbose) {
                    console.log(`  ⊘ Already has keywords: ${agentName}`);
                }
                this.stats.skipped++;
                return;
            }

            const updatedContent = this.addKeywords(content, keywordData.keywords);

            if (this.dryRun) {
                console.log(`  ✓ [DRY RUN] Would update: ${agentName} (${keywordData.keywords.length} keywords)`);
            } else {
                fs.writeFileSync(filePath, updatedContent, 'utf-8');
                console.log(`  ✓ Updated: ${agentName} (${keywordData.keywords.length} keywords)`);
            }

            this.stats.updated++;

        } catch (error) {
            console.error(`  ✗ Error processing ${path.basename(filePath)}: ${error.message}`);
            this.stats.errors++;
        }
    }

    /**
     * Extract agent name from frontmatter
     * @param {string} content - File content
     * @returns {string|null} Agent name
     */
    extractAgentName(content) {
        const lines = content.split('\n');
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
                const match = line.match(/^name:\s*(.+)$/);
                if (match) {
                    return match[1].trim().replace(/^["']|["']$/g, '');
                }
            }
        }

        return null;
    }

    /**
     * Add trigger keywords to frontmatter
     * @param {string} content - Original content
     * @param {Array} keywords - Keywords to add
     * @returns {string} Updated content
     */
    addKeywords(content, keywords) {
        const lines = content.split('\n');
        const updatedLines = [];
        let inFrontmatter = false;
        let frontmatterEndIndex = -1;
        let lastFrontmatterLineIndex = -1;

        // Find the end of frontmatter
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === '---') {
                if (!inFrontmatter) {
                    inFrontmatter = true;
                } else {
                    frontmatterEndIndex = i;
                    break;
                }
            } else if (inFrontmatter && lines[i].trim()) {
                lastFrontmatterLineIndex = i;
            }
        }

        if (frontmatterEndIndex === -1) {
            // No closing frontmatter found, shouldn't happen but handle gracefully
            return content;
        }

        // Build updated content
        for (let i = 0; i < lines.length; i++) {
            updatedLines.push(lines[i]);

            // Insert triggerKeywords before the closing ---
            if (i === frontmatterEndIndex - 1) {
                // Format keywords as YAML array
                if (keywords.length <= 5) {
                    // Inline format for short lists
                    updatedLines.push(`triggerKeywords: [${keywords.join(', ')}]`);
                } else {
                    // Multi-line format for long lists
                    updatedLines.push('triggerKeywords:');
                    for (const keyword of keywords) {
                        updatedLines.push(`  - ${keyword}`);
                    }
                }
            }
        }

        return updatedLines.join('\n');
    }

    /**
     * Print statistics
     */
    printStats() {
        console.log('\n' + '='.repeat(50));
        console.log('Keyword Application Summary');
        console.log('='.repeat(50));
        console.log(`Processed:   ${this.stats.processed}`);
        console.log(`Updated:     ${this.stats.updated}`);
        console.log(`Skipped:     ${this.stats.skipped}`);
        console.log(`Errors:      ${this.stats.errors}`);
        console.log('='.repeat(50));
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const verbose = args.includes('--verbose') || args.includes('-v');

    const mappingPath = path.join(__dirname, '../../../opspal-core/keyword-mapping.json');
    const pluginsRoot = path.join(__dirname, '../../..');

    if (!fs.existsSync(mappingPath)) {
        console.error('Error: keyword-mapping.json not found. Run keyword-suggester.js first.');
        process.exit(1);
    }

    const applier = new KeywordApplier(mappingPath, { dryRun, verbose });

    if (dryRun) {
        console.log('=== DRY RUN MODE - No files will be modified ===\n');
    }

    applier.applyAll(pluginsRoot);
    applier.printStats();

    if (dryRun) {
        console.log('\nRun without --dry-run to apply changes.');
    }
}

module.exports = { KeywordApplier };
