#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Patterns to detect hard-coded paths
const PATH_PATTERNS = {
    unix: {
        absolute: /(?<![a-zA-Z])\/(?:home|Users|opt|var|tmp|etc|usr|mnt)\/[^\s'"`;)}\]]+/g,
        home: /(?<![a-zA-Z])~\/[^\s'"`;)}\]]+/g,
        root: /^\/[a-zA-Z][^\s'"`;)}\]]+/gm
    },
    windows: {
        absolute: /[A-Z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*/g,
        unc: /\\\\[^\\/:*?"<>|\r\n]+\\[^\\/:*?"<>|\r\n]+/g
    },
    special: {
        shebang: /^#!\/[^\s]+/gm,
        envPath: /(?:export\s+)?PATH=["']?([^"'\n]+)/g
    }
};

// File extensions to scan
const SCAN_EXTENSIONS = [
    '.js', '.ts', '.jsx', '.tsx', '.py', '.sh', '.bash',
    '.yaml', '.yml', '.json', '.md', '.txt', '.env',
    '.config', '.conf', '.ini', '.toml', '.xml'
];

// Directories to skip
const SKIP_DIRS = [
    'node_modules', '.git', '.next', 'dist', 'build',
    '.cache', 'coverage', '.vscode', '.idea', '__pycache__',
    'opspal-release', 'instances.old.20250915', '.turbo',
    'public', 'static', 'assets', 'vendor', 'bower_components',
    'out', '.code', 'tmp', 'temp', '.temp', 'logs',
    'iq_sdr_recordings', 'recordings'
];

// Known safe patterns to exclude
const SAFE_PATTERNS = [
    /^\/dev\/null$/,
    /^\/bin\/(sh|bash|env|node|python[0-9]*)$/,
    /^\/usr\/bin\/(env|node|python[0-9]*)$/,
    /^#!\/usr\/bin\/env\s+(node|python[0-9]?|bash|sh)$/
];

class PathScanner {
    constructor() {
        this.findings = [];
        this.stats = {
            filesScanned: 0,
            pathsFound: 0,
            uniquePaths: new Set(),
            byType: {}
        };
    }

    isSafePath(pathStr) {
        return SAFE_PATTERNS.some(pattern => pattern.test(pathStr.trim()));
    }

    async scanFile(filePath) {
        try {
            const stats = await fs.stat(filePath);
            // Skip very large files (> 10MB)
            if (stats.size > 10 * 1024 * 1024) {
                console.warn(`Skipping large file: ${filePath} (${Math.round(stats.size / 1024 / 1024)}MB)`);
                return;
            }

            const content = await fs.readFile(filePath, 'utf8');
            const relPath = path.relative(process.cwd(), filePath);

            // Process content in chunks to avoid memory issues
            const lines = content.split('\n');

            // Skip files with too many lines (> 10000)
            if (lines.length > 10000) {
                console.warn(`Skipping file with too many lines: ${filePath} (${lines.length} lines)`);
                return;
            }

            this.stats.filesScanned++;

            // Scan for each pattern type
            for (const [category, patterns] of Object.entries(PATH_PATTERNS)) {
                for (const [type, pattern] of Object.entries(patterns)) {
                    const matches = content.matchAll(pattern);

                    for (const match of matches) {
                        const foundPath = match[0];

                        // Skip safe patterns
                        if (this.isSafePath(foundPath)) continue;

                        // Find line number
                        let lineNum = 1;
                        let charCount = 0;
                        for (let i = 0; i < lines.length; i++) {
                            if (charCount + lines[i].length >= match.index) {
                                lineNum = i + 1;
                                break;
                            }
                            charCount += lines[i].length + 1; // +1 for newline
                        }

                        // Get context (surrounding lines)
                        const startLine = Math.max(0, lineNum - 2);
                        const endLine = Math.min(lines.length, lineNum + 1);
                        const context = lines.slice(startLine, endLine).join('\n');

                        const finding = {
                            file: relPath,
                            line: lineNum,
                            path: foundPath,
                            category,
                            type,
                            context: context.substring(0, 200) // Limit context length
                        };

                        this.findings.push(finding);
                        this.stats.pathsFound++;
                        this.stats.uniquePaths.add(foundPath);

                        const typeKey = `${category}.${type}`;
                        this.stats.byType[typeKey] = (this.stats.byType[typeKey] || 0) + 1;
                    }
                }
            }
        } catch (error) {
            // Skip binary files or inaccessible files
            if (error.code !== 'EISDIR' && !error.message.includes('Invalid')) {
                console.warn(`Warning: Could not read ${filePath}: ${error.message}`);
            }
        }
    }

    async scanDirectory(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                if (!SKIP_DIRS.includes(entry.name)) {
                    await this.scanDirectory(fullPath);
                }
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (SCAN_EXTENSIONS.includes(ext) || entry.name.startsWith('.')) {
                    await this.scanFile(fullPath);
                }
            }
        }
    }

    generatePathMapping() {
        const mapping = {};
        const pathGroups = {};

        // Group similar paths
        for (const pathStr of this.stats.uniquePaths) {
            // Determine the type of path and suggest replacement
            let envVar = '';
            let configKey = '';

            if (pathStr.includes('/home/')) {
                envVar = 'USER_HOME';
                configKey = 'paths.userHome';
            } else if (pathStr.includes('/tmp/')) {
                envVar = 'TEMP_DIR';
                configKey = 'paths.tempDir';
            } else if (pathStr.includes('/var/')) {
                envVar = 'VAR_DIR';
                configKey = 'paths.varDir';
            } else if (pathStr.includes('/opt/')) {
                envVar = 'OPT_DIR';
                configKey = 'paths.optDir';
            } else if (pathStr.includes('Desktop/RevPal')) {
                envVar = 'PROJECT_ROOT';
                configKey = 'paths.projectRoot';
            } else if (pathStr.includes('/Users/')) {
                envVar = 'USER_HOME';
                configKey = 'paths.userHome';
            } else if (pathStr.match(/[A-Z]:\\/)) {
                envVar = 'WINDOWS_ROOT';
                configKey = 'paths.windowsRoot';
            } else {
                envVar = 'APP_ROOT';
                configKey = 'paths.appRoot';
            }

            mapping[pathStr] = {
                original: pathStr,
                envVar: `process.env.${envVar}`,
                configKey,
                replacement: `\${${envVar}}`
            };
        }

        return mapping;
    }

    generateReport() {
        const timestamp = new Date().toISOString();
        const report = {
            metadata: {
                timestamp,
                projectRoot: process.cwd(),
                statistics: {
                    filesScanned: this.stats.filesScanned,
                    totalPathsFound: this.stats.pathsFound,
                    uniquePathsFound: this.stats.uniquePaths.size,
                    byType: this.stats.byType
                }
            },
            findings: this.findings,
            pathMapping: this.generatePathMapping(),
            recommendations: this.generateRecommendations()
        };

        return report;
    }

    generateRecommendations() {
        const recommendations = [];

        if (this.stats.uniquePaths.size > 0) {
            recommendations.push({
                priority: 'HIGH',
                title: 'Replace hard-coded paths with environment variables',
                description: 'All absolute file system paths should be replaced with configurable environment variables or configuration settings.',
                affectedFiles: [...new Set(this.findings.map(f => f.file))].length
            });
        }

        // Check for specific path types
        const homePathCount = this.findings.filter(f => f.path.includes('/home/')).length;
        if (homePathCount > 0) {
            recommendations.push({
                priority: 'MEDIUM',
                title: 'User-specific paths detected',
                description: `Found ${homePathCount} references to user-specific paths. These will break on different systems.`,
                solution: 'Use process.env.HOME or os.homedir() instead'
            });
        }

        const tmpPathCount = this.findings.filter(f => f.path.includes('/tmp/')).length;
        if (tmpPathCount > 0) {
            recommendations.push({
                priority: 'LOW',
                title: 'Temporary directory paths',
                description: `Found ${tmpPathCount} references to /tmp/. Consider using os.tmpdir() for cross-platform compatibility.`,
                solution: 'Use os.tmpdir() or process.env.TMPDIR'
            });
        }

        return recommendations;
    }

    generateMarkdownReport(report) {
        let md = `# Hard-coded Path Scan Report\n\n`;
        md += `**Generated:** ${report.metadata.timestamp}\n`;
        md += `**Project Root:** ${report.metadata.projectRoot}\n\n`;

        md += `## Summary Statistics\n\n`;
        md += `- **Files Scanned:** ${report.metadata.statistics.filesScanned}\n`;
        md += `- **Total Paths Found:** ${report.metadata.statistics.totalPathsFound}\n`;
        md += `- **Unique Paths:** ${report.metadata.statistics.uniquePathsFound}\n\n`;

        md += `### Findings by Type\n\n`;
        for (const [type, count] of Object.entries(report.metadata.statistics.byType)) {
            md += `- **${type}:** ${count}\n`;
        }

        md += `\n## Recommendations\n\n`;
        for (const rec of report.recommendations) {
            md += `### ${rec.priority}: ${rec.title}\n`;
            md += `${rec.description}\n`;
            if (rec.solution) {
                md += `**Solution:** ${rec.solution}\n`;
            }
            md += `\n`;
        }

        md += `## Detailed Findings\n\n`;

        // Group findings by file
        const byFile = {};
        for (const finding of report.findings) {
            if (!byFile[finding.file]) {
                byFile[finding.file] = [];
            }
            byFile[finding.file].push(finding);
        }

        for (const [file, findings] of Object.entries(byFile)) {
            md += `### ${file}\n\n`;
            for (const finding of findings) {
                md += `- **Line ${finding.line}:** \`${finding.path}\`\n`;
                md += `  - Type: ${finding.category}.${finding.type}\n`;
                md += `  - Context:\n\`\`\`\n${finding.context}\n\`\`\`\n\n`;
            }
        }

        md += `## Path Mapping\n\n`;
        md += `| Original Path | Environment Variable | Config Key |\n`;
        md += `|---------------|---------------------|------------|\n`;

        for (const [path, mapping] of Object.entries(report.pathMapping)) {
            md += `| \`${path}\` | \`${mapping.envVar}\` | \`${mapping.configKey}\` |\n`;
        }

        return md;
    }
}

async function main() {
    console.log('🔍 Scanning for hard-coded paths...\n');

    const scanner = new PathScanner();
    const projectRoot = process.cwd();

    try {
        await scanner.scanDirectory(projectRoot);

        const report = scanner.generateReport();

        // Save JSON report
        const jsonPath = path.join(projectRoot, 'reports', 'path-scan-report.json');
        await fs.mkdir(path.dirname(jsonPath), { recursive: true });
        await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
        console.log(`✅ JSON report saved to: ${jsonPath}`);

        // Save Markdown report
        const mdPath = path.join(projectRoot, 'reports', 'PATH_SCAN_REPORT.md');
        const mdReport = scanner.generateMarkdownReport(report);
        await fs.writeFile(mdPath, mdReport);
        console.log(`✅ Markdown report saved to: ${mdPath}`);

        // Print summary
        console.log(`\n📊 Summary:`);
        console.log(`  - Files scanned: ${report.metadata.statistics.filesScanned}`);
        console.log(`  - Paths found: ${report.metadata.statistics.totalPathsFound}`);
        console.log(`  - Unique paths: ${report.metadata.statistics.uniquePathsFound}`);

        if (report.recommendations.length > 0) {
            console.log(`\n⚠️  ${report.recommendations.length} recommendations generated`);
        }

    } catch (error) {
        console.error('❌ Error during scan:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { PathScanner };