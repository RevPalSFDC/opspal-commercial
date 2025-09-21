#!/usr/bin/env node
/**
 * Automated path refactoring tool
 * Replaces hard-coded paths with environment variables or config references
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// Load the path scan report
const REPORT_PATH = path.join(__dirname, '..', 'reports', 'path-scan-report.json');

// Mapping of hard-coded paths to their replacements
const PATH_REPLACEMENTS = {
    // JavaScript/TypeScript replacements
    js: {
        '/home/chris/Desktop/RevPal/Agents': "require('./config/paths.config').PROJECT_ROOT",
        '~/Desktop/RevPal/Agents': "require('./config/paths.config').PROJECT_ROOT",
        '/tmp': "require('os').tmpdir()",
        '~/.claude': "path.join(require('os').homedir(), '.claude')",
        '/var': "'/var'", // Keep system paths as-is for now
        '/opt': "'/opt'",
        '/mnt': "'/mnt'"
    },
    // Python replacements
    py: {
        '/home/chris/Desktop/RevPal/Agents': "os.environ.get('PROJECT_ROOT', '/home/chris/Desktop/RevPal/Agents')",
        '~/Desktop/RevPal/Agents': "os.environ.get('PROJECT_ROOT', os.path.expanduser('~/Desktop/RevPal/Agents'))",
        '/tmp': "tempfile.gettempdir()",
        '~/.claude': "os.path.join(os.path.expanduser('~'), '.claude')"
    },
    // Shell script replacements
    sh: {
        '/home/chris/Desktop/RevPal/Agents': '${PROJECT_ROOT:-/home/chris/Desktop/RevPal/Agents}',
        '~/Desktop/RevPal/Agents': '${PROJECT_ROOT:-~/Desktop/RevPal/Agents}',
        '/tmp': '${TEMP_DIR:-/tmp}',
        '~/.claude': '${USER_CLAUDE_CONFIG:-~/.claude}'
    },
    // YAML/JSON replacements (use template variables)
    yaml: {
        '/home/chris/Desktop/RevPal/Agents': '${PROJECT_ROOT}',
        '~/Desktop/RevPal/Agents': '${PROJECT_ROOT}',
        '/tmp': '${TEMP_DIR}',
        '~/.claude': '${USER_CLAUDE_CONFIG}'
    }
};

class PathRefactorer {
    constructor() {
        this.backups = [];
        this.refactored = [];
        this.errors = [];
    }

    getFileType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) return 'js';
        if (['.py'].includes(ext)) return 'py';
        if (['.sh', '.bash'].includes(ext)) return 'sh';
        if (['.yaml', '.yml', '.json'].includes(ext)) return 'yaml';
        return 'text';
    }

    async backupFile(filePath) {
        const backupPath = `${filePath}.bak`;
        const content = await fs.readFile(filePath, 'utf8');
        await fs.writeFile(backupPath, content);
        this.backups.push({ original: filePath, backup: backupPath });
        return backupPath;
    }

    needsImports(content, fileType) {
        if (fileType === 'js') {
            // Check if we need to add imports
            if (!content.includes("require('path')") && !content.includes("import path")) {
                return { path: true };
            }
            if (!content.includes("require('os')") && !content.includes("import os") &&
                content.includes("os.tmpdir()")) {
                return { os: true };
            }
        } else if (fileType === 'py') {
            const imports = {};
            if (!content.includes("import os")) {
                imports.os = true;
            }
            if (!content.includes("import tempfile") &&
                content.includes("tempfile.gettempdir()")) {
                imports.tempfile = true;
            }
            return Object.keys(imports).length > 0 ? imports : null;
        }
        return null;
    }

    addImports(content, fileType, imports) {
        if (fileType === 'js') {
            const importStatements = [];
            if (imports.path) importStatements.push("const path = require('path');");
            if (imports.os) importStatements.push("const os = require('os');");

            // Add imports after shebang if present
            if (content.startsWith('#!')) {
                const lines = content.split('\n');
                lines.splice(1, 0, ...importStatements);
                return lines.join('\n');
            } else {
                return importStatements.join('\n') + '\n' + content;
            }
        } else if (fileType === 'py') {
            const importStatements = [];
            if (imports.os) importStatements.push("import os");
            if (imports.tempfile) importStatements.push("import tempfile");

            // Add imports after shebang and docstring
            const lines = content.split('\n');
            let insertIndex = 0;

            if (lines[0].startsWith('#!')) insertIndex = 1;
            if (lines[insertIndex] && lines[insertIndex].startsWith('"""')) {
                // Find end of docstring
                for (let i = insertIndex + 1; i < lines.length; i++) {
                    if (lines[i].includes('"""')) {
                        insertIndex = i + 1;
                        break;
                    }
                }
            }

            lines.splice(insertIndex, 0, ...importStatements);
            return lines.join('\n');
        }
        return content;
    }

    async refactorFile(filePath, findings) {
        try {
            // Skip if no findings for this file
            if (!findings || findings.length === 0) return false;

            // Create backup
            await this.backupFile(filePath);

            // Read file content
            let content = await fs.readFile(filePath, 'utf8');
            const fileType = this.getFileType(filePath);
            const replacements = PATH_REPLACEMENTS[fileType] || PATH_REPLACEMENTS.yaml;

            let modified = false;
            const usedReplacements = new Set();

            // Apply replacements
            for (const finding of findings) {
                const originalPath = finding.path;

                // Find best replacement
                for (const [pattern, replacement] of Object.entries(replacements)) {
                    if (originalPath.startsWith(pattern)) {
                        // Escape special regex characters in the original path
                        const escapedPath = originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(escapedPath, 'g');

                        if (content.includes(originalPath)) {
                            content = content.replace(regex, replacement);
                            usedReplacements.add(replacement);
                            modified = true;
                        }
                        break;
                    }
                }
            }

            if (modified) {
                // Check if we need to add imports
                const neededImports = this.needsImports(content, fileType);
                if (neededImports) {
                    content = this.addImports(content, fileType, neededImports);
                }

                // Write refactored content
                await fs.writeFile(filePath, content);
                this.refactored.push(filePath);
                return true;
            }

            return false;
        } catch (error) {
            this.errors.push({ file: filePath, error: error.message });
            return false;
        }
    }

    async refactorAll(report) {
        // Group findings by file
        const byFile = {};
        for (const finding of report.findings) {
            if (!byFile[finding.file]) {
                byFile[finding.file] = [];
            }
            byFile[finding.file].push(finding);
        }

        console.log(`\n📝 Refactoring ${Object.keys(byFile).length} files...\n`);

        for (const [file, findings] of Object.entries(byFile)) {
            const fullPath = path.join(process.cwd(), file);

            // Skip certain files
            if (file.includes('node_modules') ||
                file.includes('.git') ||
                file.endsWith('.bak')) {
                continue;
            }

            const result = await this.refactorFile(fullPath, findings);
            if (result) {
                console.log(`✅ Refactored: ${file}`);
            }
        }

        return {
            refactored: this.refactored.length,
            backups: this.backups.length,
            errors: this.errors.length
        };
    }

    async generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                filesRefactored: this.refactored.length,
                backupsCreated: this.backups.length,
                errors: this.errors.length
            },
            refactoredFiles: this.refactored,
            backups: this.backups,
            errors: this.errors
        };

        const reportPath = path.join(process.cwd(), 'reports', 'refactoring-report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

        return reportPath;
    }
}

async function main() {
    console.log('🔧 Path Refactoring Tool\n');

    // Check if report exists
    try {
        const reportContent = await fs.readFile(REPORT_PATH, 'utf8');
        const report = JSON.parse(reportContent);

        if (!report.findings || report.findings.length === 0) {
            console.log('No paths to refactor. Run path-scanner.js first.');
            return;
        }

        const refactorer = new PathRefactorer();

        // Ask for confirmation
        console.log(`Found ${report.findings.length} hard-coded paths in ${report.metadata.statistics.filesScanned} files.`);
        console.log('\nThis will:');
        console.log('  1. Create .bak backup files');
        console.log('  2. Replace hard-coded paths with environment variables');
        console.log('  3. Add necessary imports');
        console.log('\nProceed with refactoring? (Use --auto to skip confirmation)');

        if (!process.argv.includes('--auto')) {
            // Simple confirmation for CLI
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const answer = await new Promise(resolve => {
                readline.question('Type "yes" to continue: ', resolve);
            });
            readline.close();

            if (answer.toLowerCase() !== 'yes') {
                console.log('Refactoring cancelled.');
                return;
            }
        }

        // Perform refactoring
        const results = await refactorer.refactorAll(report);

        // Generate report
        const reportPath = await refactorer.generateReport();

        // Print summary
        console.log('\n' + '='.repeat(50));
        console.log('✨ Refactoring Complete!\n');
        console.log(`  Files refactored: ${results.refactored}`);
        console.log(`  Backups created: ${results.backups}`);
        console.log(`  Errors: ${results.errors}`);
        console.log(`\n  Report saved to: ${reportPath}`);

        if (results.errors > 0) {
            console.log('\n⚠️  Some files had errors. Check the report for details.');
        }

        console.log('\n📌 Next steps:');
        console.log('  1. Review the changes');
        console.log('  2. Test the application');
        console.log('  3. Copy .env.template to .env and configure');
        console.log('  4. Commit the changes');
        console.log('  5. Remove .bak files when confident');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Run path-scanner.js first to generate the path scan report.');
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { PathRefactorer };