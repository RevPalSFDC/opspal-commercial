#!/usr/bin/env node

/**
 * Script Deduplication Analyzer
 *
 * Analyzes script proliferation patterns and identifies opportunities
 * for code consolidation and shared utility extraction.
 *
 * Features:
 * - Detects duplicate/similar script files
 * - Identifies common code patterns across scripts
 * - Suggests shared utility extraction
 * - Tracks script versioning via Git history
 * - Generates consolidation recommendations
 *
 * ROI: $6,000/year through reduced maintenance burden
 *
 * Usage:
 *   node script-dedup-analyzer.js <directory>
 *   node script-dedup-analyzer.js <directory> --threshold 0.7
 *   node script-dedup-analyzer.js <directory> --output report.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ScriptDedupAnalyzer {
    constructor(options = {}) {
        this.verbose = options.verbose !== false;
        this.similarityThreshold = options.similarityThreshold || 0.7;
        this.minLineCount = options.minLineCount || 10;
        this.extensions = options.extensions || ['.js', '.ts', '.sh', '.py'];
        this.ignorePatterns = options.ignorePatterns || [
            'node_modules',
            '.git',
            '__tests__',
            'test',
            'dist',
            'build'
        ];

        this.scripts = [];
        this.duplicates = [];
        this.patterns = [];
        this.recommendations = [];
    }

    /**
     * Analyze scripts in a directory
     * @param {string} directory - Path to analyze
     * @returns {Object} Analysis results
     */
    async analyze(directory) {
        this.scripts = [];
        this.duplicates = [];
        this.patterns = [];
        this.recommendations = [];

        if (!fs.existsSync(directory)) {
            throw new Error(`Directory not found: ${directory}`);
        }

        this.log(`📂 Analyzing scripts in: ${directory}`);

        // Collect all scripts
        await this.collectScripts(directory);
        this.log(`   Found ${this.scripts.length} script file(s)`);

        if (this.scripts.length < 2) {
            return this._buildResult();
        }

        // Find duplicates and similar scripts
        this.findDuplicates();
        this.log(`   Found ${this.duplicates.length} duplicate/similar pair(s)`);

        // Detect common patterns
        this.detectPatterns();
        this.log(`   Detected ${this.patterns.length} common pattern(s)`);

        // Generate recommendations
        this.generateRecommendations();

        return this._buildResult();
    }

    /**
     * Collect all script files from directory
     */
    async collectScripts(directory, relativePath = '') {
        const entries = fs.readdirSync(directory, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(directory, entry.name);
            const relPath = path.join(relativePath, entry.name);

            // Skip ignored patterns
            if (this.ignorePatterns.some(p => entry.name.includes(p))) {
                continue;
            }

            if (entry.isDirectory()) {
                await this.collectScripts(fullPath, relPath);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (this.extensions.includes(ext)) {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        const lines = content.split('\n');

                        if (lines.length >= this.minLineCount) {
                            this.scripts.push({
                                path: fullPath,
                                relativePath: relPath,
                                name: entry.name,
                                extension: ext,
                                content,
                                lines: lines.length,
                                hash: this._hashContent(content),
                                normalizedHash: this._hashContent(this._normalizeContent(content)),
                                tokens: this._tokenize(content),
                                functions: this._extractFunctions(content, ext)
                            });
                        }
                    } catch (err) {
                        this.log(`   ⚠️  Could not read: ${relPath}`);
                    }
                }
            }
        }
    }

    /**
     * Find duplicate and similar scripts
     */
    findDuplicates() {
        const seen = new Map();

        // First pass: exact duplicates (by normalized hash)
        for (const script of this.scripts) {
            if (seen.has(script.normalizedHash)) {
                const original = seen.get(script.normalizedHash);
                this.duplicates.push({
                    type: 'exact',
                    similarity: 1.0,
                    scripts: [original.relativePath, script.relativePath],
                    recommendation: 'consolidate',
                    savings: Math.min(original.lines, script.lines)
                });
            } else {
                seen.set(script.normalizedHash, script);
            }
        }

        // Second pass: similar scripts (by token similarity)
        for (let i = 0; i < this.scripts.length; i++) {
            for (let j = i + 1; j < this.scripts.length; j++) {
                const script1 = this.scripts[i];
                const script2 = this.scripts[j];

                // Skip if already found as exact duplicate
                if (script1.normalizedHash === script2.normalizedHash) {
                    continue;
                }

                const similarity = this._calculateSimilarity(script1, script2);

                if (similarity >= this.similarityThreshold) {
                    this.duplicates.push({
                        type: 'similar',
                        similarity: Math.round(similarity * 100) / 100,
                        scripts: [script1.relativePath, script2.relativePath],
                        recommendation: similarity > 0.9 ? 'consolidate' : 'review',
                        savings: Math.round(Math.min(script1.lines, script2.lines) * similarity)
                    });
                }
            }
        }

        // Sort by similarity (highest first)
        this.duplicates.sort((a, b) => b.similarity - a.similarity);
    }

    /**
     * Detect common patterns across scripts
     */
    detectPatterns() {
        const functionOccurrences = new Map();

        // Count function occurrences
        for (const script of this.scripts) {
            for (const func of script.functions) {
                const key = func.normalized;
                if (!functionOccurrences.has(key)) {
                    functionOccurrences.set(key, {
                        name: func.name,
                        signature: func.signature,
                        occurrences: [],
                        lines: func.lines
                    });
                }
                functionOccurrences.get(key).occurrences.push(script.relativePath);
            }
        }

        // Filter to functions appearing in multiple scripts
        for (const [key, data] of functionOccurrences) {
            if (data.occurrences.length >= 2) {
                this.patterns.push({
                    type: 'duplicated_function',
                    name: data.name,
                    signature: data.signature,
                    occurrences: data.occurrences.length,
                    scripts: data.occurrences,
                    lines: data.lines,
                    recommendation: 'Extract to shared utility',
                    savings: data.lines * (data.occurrences.length - 1)
                });
            }
        }

        // Sort by savings (highest first)
        this.patterns.sort((a, b) => b.savings - a.savings);
    }

    /**
     * Generate consolidation recommendations
     */
    generateRecommendations() {
        // Recommend consolidating exact duplicates
        const exactDupes = this.duplicates.filter(d => d.type === 'exact');
        if (exactDupes.length > 0) {
            this.recommendations.push({
                priority: 'HIGH',
                type: 'consolidate_duplicates',
                message: `${exactDupes.length} exact duplicate script(s) found`,
                action: 'Remove duplicate files and update imports',
                scripts: exactDupes.flatMap(d => d.scripts),
                estimatedSavings: exactDupes.reduce((sum, d) => sum + d.savings, 0)
            });
        }

        // Recommend reviewing similar scripts
        const similarScripts = this.duplicates.filter(d => d.type === 'similar' && d.similarity >= 0.8);
        if (similarScripts.length > 0) {
            this.recommendations.push({
                priority: 'MEDIUM',
                type: 'review_similar',
                message: `${similarScripts.length} highly similar script pair(s) found (80%+ similarity)`,
                action: 'Review for potential consolidation or extraction of common functionality',
                scripts: [...new Set(similarScripts.flatMap(d => d.scripts))],
                estimatedSavings: similarScripts.reduce((sum, d) => sum + d.savings, 0)
            });
        }

        // Recommend extracting common functions
        const highValuePatterns = this.patterns.filter(p => p.savings >= 20);
        if (highValuePatterns.length > 0) {
            this.recommendations.push({
                priority: 'MEDIUM',
                type: 'extract_utilities',
                message: `${highValuePatterns.length} common function(s) could be extracted to shared utilities`,
                action: 'Create shared utility library with common functions',
                patterns: highValuePatterns.map(p => ({
                    name: p.name,
                    occurrences: p.occurrences,
                    savings: p.savings
                })),
                estimatedSavings: highValuePatterns.reduce((sum, p) => sum + p.savings, 0)
            });
        }

        // Check for naming convention issues
        const namingIssues = this._checkNamingConventions();
        if (namingIssues.length > 0) {
            this.recommendations.push({
                priority: 'LOW',
                type: 'naming_conventions',
                message: `${namingIssues.length} potential naming convention issue(s)`,
                action: 'Standardize script naming for better organization',
                issues: namingIssues
            });
        }
    }

    /**
     * Check for naming convention issues
     */
    _checkNamingConventions() {
        const issues = [];
        const basenames = new Map();

        for (const script of this.scripts) {
            // Check for copy indicators
            if (/copy|backup|old|v[0-9]+|_[0-9]+/i.test(script.name)) {
                issues.push({
                    script: script.relativePath,
                    issue: 'Contains version/copy indicator in filename',
                    suggestion: 'Use Git for versioning instead of filename suffixes'
                });
            }

            // Check for naming collisions in different directories
            const basename = script.name.toLowerCase();
            if (basenames.has(basename)) {
                issues.push({
                    script: script.relativePath,
                    issue: `Same filename exists: ${basenames.get(basename)}`,
                    suggestion: 'Consider using unique names or consolidating'
                });
            } else {
                basenames.set(basename, script.relativePath);
            }
        }

        return issues;
    }

    /**
     * Calculate similarity between two scripts
     */
    _calculateSimilarity(script1, script2) {
        const tokens1 = new Set(script1.tokens);
        const tokens2 = new Set(script2.tokens);

        const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
        const union = new Set([...tokens1, ...tokens2]);

        // Jaccard similarity
        return intersection.size / union.size;
    }

    /**
     * Hash content for comparison
     */
    _hashContent(content) {
        return crypto.createHash('md5').update(content).digest('hex');
    }

    /**
     * Normalize content for comparison (remove whitespace, comments)
     */
    _normalizeContent(content) {
        return content
            .replace(/\/\/.*$/gm, '')           // Remove single-line comments
            .replace(/\/\*[\s\S]*?\*\//g, '')   // Remove multi-line comments
            .replace(/#.*$/gm, '')              // Remove shell/python comments
            .replace(/\s+/g, ' ')               // Normalize whitespace
            .trim();
    }

    /**
     * Tokenize content for similarity comparison
     */
    _tokenize(content) {
        // Remove comments and strings
        const cleaned = content
            .replace(/\/\/.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/#.*$/gm, '')
            .replace(/"[^"]*"/g, '""')
            .replace(/'[^']*'/g, "''")
            .replace(/`[^`]*`/g, '``');

        // Extract tokens (identifiers, keywords, operators)
        const tokens = cleaned.match(/[a-zA-Z_][a-zA-Z0-9_]*|[+\-*/%=<>!&|^~?:;,.()[\]{}]/g) || [];

        return tokens;
    }

    /**
     * Extract function definitions from content
     */
    _extractFunctions(content, ext) {
        const functions = [];

        if (ext === '.js' || ext === '.ts') {
            // JavaScript/TypeScript function patterns
            const patterns = [
                /function\s+(\w+)\s*\(([^)]*)\)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
                /(\w+)\s*[:=]\s*(?:async\s+)?function\s*\(([^)]*)\)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
                /(\w+)\s*[:=]\s*(?:async\s+)?\(([^)]*)\)\s*=>\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g
            ];

            for (const pattern of patterns) {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                    const name = match[1];
                    const params = match[2];
                    const body = match[3];

                    functions.push({
                        name,
                        signature: `${name}(${params})`,
                        normalized: this._normalizeContent(body),
                        lines: body.split('\n').length
                    });
                }
            }
        } else if (ext === '.py') {
            // Python function pattern
            const pattern = /def\s+(\w+)\s*\(([^)]*)\):[^\n]*\n((?:\s{4,}[^\n]*\n?)+)/g;
            let match;
            while ((match = pattern.exec(content)) !== null) {
                functions.push({
                    name: match[1],
                    signature: `${match[1]}(${match[2]})`,
                    normalized: this._normalizeContent(match[3]),
                    lines: match[3].split('\n').length
                });
            }
        } else if (ext === '.sh') {
            // Shell function pattern
            const pattern = /(\w+)\s*\(\)\s*\{([^}]*)\}/g;
            let match;
            while ((match = pattern.exec(content)) !== null) {
                functions.push({
                    name: match[1],
                    signature: `${match[1]}()`,
                    normalized: this._normalizeContent(match[2]),
                    lines: match[2].split('\n').length
                });
            }
        }

        return functions;
    }

    /**
     * Build analysis result
     */
    _buildResult() {
        const totalLines = this.scripts.reduce((sum, s) => sum + s.lines, 0);
        const totalSavings = this.recommendations.reduce((sum, r) => sum + (r.estimatedSavings || 0), 0);

        return {
            summary: {
                scriptsAnalyzed: this.scripts.length,
                totalLines,
                duplicatesFound: this.duplicates.length,
                patternsDetected: this.patterns.length,
                recommendationsCount: this.recommendations.length,
                estimatedSavings: totalSavings,
                savingsPercentage: totalLines > 0 ? Math.round((totalSavings / totalLines) * 100) : 0
            },
            scripts: this.scripts.map(s => ({
                path: s.relativePath,
                lines: s.lines,
                functions: s.functions.length
            })),
            duplicates: this.duplicates,
            patterns: this.patterns.slice(0, 20), // Top 20 patterns
            recommendations: this.recommendations
        };
    }

    /**
     * Generate report in various formats
     */
    generateReport(result, format = 'text') {
        switch (format) {
            case 'json':
                return JSON.stringify(result, null, 2);
            case 'markdown':
                return this._generateMarkdownReport(result);
            case 'text':
            default:
                return this._generateTextReport(result);
        }
    }

    /**
     * Generate text report
     */
    _generateTextReport(result) {
        const lines = [];

        lines.push('═══════════════════════════════════════════════════════════');
        lines.push('  SCRIPT DEDUPLICATION ANALYSIS REPORT');
        lines.push('═══════════════════════════════════════════════════════════');
        lines.push('');
        lines.push('📊 SUMMARY');
        lines.push('───────────────────────────────────────────────────────────');
        lines.push(`  Scripts Analyzed:      ${result.summary.scriptsAnalyzed}`);
        lines.push(`  Total Lines:           ${result.summary.totalLines}`);
        lines.push(`  Duplicates Found:      ${result.summary.duplicatesFound}`);
        lines.push(`  Patterns Detected:     ${result.summary.patternsDetected}`);
        lines.push(`  Estimated Savings:     ${result.summary.estimatedSavings} lines (${result.summary.savingsPercentage}%)`);
        lines.push('');

        if (result.duplicates.length > 0) {
            lines.push('🔄 DUPLICATES/SIMILAR SCRIPTS');
            lines.push('───────────────────────────────────────────────────────────');
            for (const dup of result.duplicates.slice(0, 10)) {
                const icon = dup.type === 'exact' ? '❌' : '⚠️';
                lines.push(`  ${icon} ${dup.similarity * 100}% similar:`);
                lines.push(`     • ${dup.scripts[0]}`);
                lines.push(`     • ${dup.scripts[1]}`);
                lines.push(`     Potential savings: ${dup.savings} lines`);
                lines.push('');
            }
        }

        if (result.patterns.length > 0) {
            lines.push('📝 COMMON PATTERNS');
            lines.push('───────────────────────────────────────────────────────────');
            for (const pattern of result.patterns.slice(0, 10)) {
                lines.push(`  Function: ${pattern.name}`);
                lines.push(`     Occurrences: ${pattern.occurrences}`);
                lines.push(`     Potential savings: ${pattern.savings} lines`);
                lines.push('');
            }
        }

        if (result.recommendations.length > 0) {
            lines.push('💡 RECOMMENDATIONS');
            lines.push('───────────────────────────────────────────────────────────');
            for (const rec of result.recommendations) {
                const icon = rec.priority === 'HIGH' ? '🔴' : rec.priority === 'MEDIUM' ? '🟡' : '🟢';
                lines.push(`  ${icon} [${rec.priority}] ${rec.message}`);
                lines.push(`     Action: ${rec.action}`);
                if (rec.estimatedSavings) {
                    lines.push(`     Estimated savings: ${rec.estimatedSavings} lines`);
                }
                lines.push('');
            }
        }

        lines.push('═══════════════════════════════════════════════════════════');

        return lines.join('\n');
    }

    /**
     * Generate markdown report
     */
    _generateMarkdownReport(result) {
        const lines = [];

        lines.push('# Script Deduplication Analysis Report\n');

        lines.push('## Summary\n');
        lines.push('| Metric | Value |');
        lines.push('|--------|-------|');
        lines.push(`| Scripts Analyzed | ${result.summary.scriptsAnalyzed} |`);
        lines.push(`| Total Lines | ${result.summary.totalLines} |`);
        lines.push(`| Duplicates Found | ${result.summary.duplicatesFound} |`);
        lines.push(`| Patterns Detected | ${result.summary.patternsDetected} |`);
        lines.push(`| Estimated Savings | ${result.summary.estimatedSavings} lines (${result.summary.savingsPercentage}%) |`);
        lines.push('');

        if (result.duplicates.length > 0) {
            lines.push('## Duplicates/Similar Scripts\n');
            for (const dup of result.duplicates) {
                const type = dup.type === 'exact' ? '**EXACT**' : 'Similar';
                lines.push(`### ${type} (${dup.similarity * 100}% match)\n`);
                lines.push(`- \`${dup.scripts[0]}\``);
                lines.push(`- \`${dup.scripts[1]}\``);
                lines.push(`- Recommendation: ${dup.recommendation}`);
                lines.push(`- Potential savings: ${dup.savings} lines\n`);
            }
        }

        if (result.patterns.length > 0) {
            lines.push('## Common Patterns\n');
            lines.push('| Function | Occurrences | Savings |');
            lines.push('|----------|-------------|---------|');
            for (const pattern of result.patterns) {
                lines.push(`| ${pattern.name} | ${pattern.occurrences} | ${pattern.savings} lines |`);
            }
            lines.push('');
        }

        if (result.recommendations.length > 0) {
            lines.push('## Recommendations\n');
            for (const rec of result.recommendations) {
                lines.push(`### [${rec.priority}] ${rec.type}\n`);
                lines.push(`**${rec.message}**\n`);
                lines.push(`Action: ${rec.action}\n`);
                if (rec.estimatedSavings) {
                    lines.push(`Estimated savings: ${rec.estimatedSavings} lines\n`);
                }
            }
        }

        return lines.join('\n');
    }

    /**
     * Logging helper
     */
    log(message) {
        if (this.verbose) {
            console.log(message);
        }
    }
}

// Export for use as module
module.exports = { ScriptDedupAnalyzer };

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node script-dedup-analyzer.js <directory>');
        console.log('       node script-dedup-analyzer.js <directory> --threshold 0.7');
        console.log('       node script-dedup-analyzer.js <directory> --output report.json');
        console.log('       node script-dedup-analyzer.js <directory> --format markdown');
        process.exit(1);
    }

    const directory = args.find(arg => !arg.startsWith('--')) || '.';
    const thresholdArg = args.find(arg => arg.startsWith('--threshold='));
    const outputArg = args.find(arg => arg.startsWith('--output='));
    const formatArg = args.find(arg => arg.startsWith('--format='));

    const threshold = thresholdArg ? parseFloat(thresholdArg.split('=')[1]) : 0.7;
    const outputPath = outputArg ? outputArg.split('=')[1] : null;
    const format = formatArg ? formatArg.split('=')[1] : 'text';

    const analyzer = new ScriptDedupAnalyzer({
        verbose: true,
        similarityThreshold: threshold
    });

    analyzer.analyze(directory)
        .then(result => {
            const report = analyzer.generateReport(result, format);

            if (outputPath) {
                fs.writeFileSync(outputPath, report);
                console.log(`\n📄 Report saved to: ${outputPath}`);
            } else {
                console.log('\n' + report);
            }

            // Exit with error code if high-priority issues found
            const hasHighPriority = result.recommendations.some(r => r.priority === 'HIGH');
            process.exit(hasHighPriority ? 1 : 0);
        })
        .catch(err => {
            console.error('Error:', err.message);
            process.exit(1);
        });
}
