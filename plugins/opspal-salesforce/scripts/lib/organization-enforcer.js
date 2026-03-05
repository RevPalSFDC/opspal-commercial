#!/usr/bin/env node

/**
 * Organization Enforcer
 * Monitors file operations and enforces project organization standards
 * Prevents creation of files in wrong locations and suggests proper placement
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class OrganizationEnforcer extends EventEmitter {
    constructor(options = {}) {
        super();
        this.rootDir = options.rootDir || process.cwd();
        this.projectConfigPath = path.join(this.rootDir, 'config', 'project.json');
        this.violations = [];
        this.suggestions = new Map();

        // Define allowed patterns for different directories
        this.directoryRules = {
            scripts: {
                pattern: /^\d{2}-[a-z-]+\.(js|sh)$/,
                description: 'Scripts must follow pattern: {number}-{action}-{target}.{ext}',
                examples: ['01-query-accounts.js', '02-analyze-data.sh']
            },
            data: {
                pattern: /^[a-z-]+-\d{4}-\d{2}-\d{2}-[a-z]+\.(json|csv|xml|txt)$/,
                description: 'Data files must follow: {content}-{date}-{status}.{ext}',
                examples: ['contacts-2025-09-23-raw.csv', 'accounts-2025-09-23-processed.json']
            },
            reports: {
                pattern: /^[A-Z]+_[A-Z_]+_\d{4}-\d{2}-\d{2}\.md$/,
                description: 'Reports must follow: {TYPE}_{SUBJECT}_{DATE}.md',
                examples: ['ANALYSIS_DUPLICATES_2025-09-23.md', 'SUMMARY_CLEANUP_2025-09-23.md']
            },
            backups: {
                pattern: /^[a-z-]+-backup-\d{4}-\d{2}-\d{2}(-\d{6})?\.(json|csv|zip)$/,
                description: 'Backups must follow: {content}-backup-{date}(-{time}).{ext}',
                examples: ['contacts-backup-2025-09-23.json', 'full-backup-2025-09-23-143052.zip']
            }
        };

        // Files allowed in root directory
        this.allowedRootFiles = new Set([
            'README.md',
            'LICENSE',
            'LICENSE.md',
            'CONTRIBUTING.md',
            'CHANGELOG.md',
            'CLAUDE.md',
            '.gitignore',
            '.env.template',
            '.env.example',
            '.env.sample',
            'package.json',
            'package-lock.json',
            'sfdx-project.json'
        ]);
    }

    /**
     * Check if a file path violates organization standards
     */
    validateFilePath(filePath) {
        const relativePath = path.relative(this.rootDir, filePath);
        const parts = relativePath.split(path.sep);
        const fileName = path.basename(filePath);
        const directory = parts[0];

        // Check if it's a project directory
        if (this.isProjectDirectory(this.rootDir)) {
            return this.validateProjectFile(relativePath, fileName, directory);
        }

        // For non-project directories, check if file should be in a project
        if (this.shouldBeInProject(fileName)) {
            return {
                valid: false,
                violation: `File "${fileName}" appears to be project-specific but is not in a project directory`,
                suggestion: `Run: ./scripts/init-project.sh "your-project" "org-alias" first`,
                severity: 'warning'
            };
        }

        // Check root file restrictions
        if (parts.length === 1 && !this.allowedRootFiles.has(fileName)) {
            return {
                valid: false,
                violation: `File "${fileName}" should not be in root directory`,
                suggestion: this.suggestLocation(fileName),
                severity: 'error'
            };
        }

        return { valid: true };
    }

    /**
     * Check if current directory is a project directory
     */
    isProjectDirectory(dir) {
        return fs.existsSync(path.join(dir, 'config', 'project.json'));
    }

    /**
     * Validate file within a project structure
     */
    validateProjectFile(relativePath, fileName, directory) {
        const parts = relativePath.split(path.sep);

        // Skip validation for subdirectories and config files
        if (parts.length > 2 || directory === 'config' || directory === 'logs') {
            return { valid: true };
        }

        // Check naming convention for known directories
        if (this.directoryRules[directory]) {
            const rule = this.directoryRules[directory];
            if (!rule.pattern.test(fileName)) {
                return {
                    valid: false,
                    violation: `File "${fileName}" violates naming convention for ${directory}/`,
                    suggestion: `${rule.description}\nExamples: ${rule.examples.join(', ')}`,
                    severity: 'warning'
                };
            }
        }

        // Check for files in wrong directories
        const suggestedDir = this.detectCorrectDirectory(fileName);
        if (suggestedDir && suggestedDir !== directory) {
            return {
                valid: false,
                violation: `File "${fileName}" appears to be in wrong directory`,
                suggestion: `Move to ${suggestedDir}/ directory`,
                severity: 'warning'
            };
        }

        return { valid: true };
    }

    /**
     * Detect if a file should be in a project
     */
    shouldBeInProject(fileName) {
        const projectPatterns = [
            /query.*\.js$/,
            /analyze.*\.js$/,
            /backup.*\.js$/,
            /merge.*\.js$/,
            /delete.*\.js$/,
            /update.*\.js$/,
            /export.*\.js$/,
            /import.*\.js$/,
            /.*-\d{4}-\d{2}-\d{2}.*\.(csv|json)$/,
            /^(REPORT|ANALYSIS|SUMMARY)_.*\.md$/
        ];

        return projectPatterns.some(pattern => pattern.test(fileName));
    }

    /**
     * Suggest correct location for a file
     */
    suggestLocation(fileName) {
        // Scripts
        if (/\.(js|sh)$/.test(fileName)) {
            return `This appears to be a script. Consider:\n` +
                   `1. Moving to scripts/ directory\n` +
                   `2. Or create a project: ./scripts/init-project.sh "project-name" "org"`;
        }

        // Data files
        if (/\.(csv|json|xml)$/.test(fileName) && !/config|package/.test(fileName)) {
            return `This appears to be a data file. Consider:\n` +
                   `1. Moving to data/ directory\n` +
                   `2. Or create a project for this operation`;
        }

        // Reports
        if (/\.(md|txt)$/.test(fileName) && /report|analysis|summary/i.test(fileName)) {
            return `This appears to be a report. Move to reports/ directory`;
        }

        // Documentation
        if (/\.(md)$/.test(fileName)) {
            return `Documentation should be in docs/ directory`;
        }

        return `Consider organizing this file in an appropriate subdirectory`;
    }

    /**
     * Detect correct directory based on file name
     */
    detectCorrectDirectory(fileName) {
        if (/\.(js|sh)$/.test(fileName) && !/test/.test(fileName)) {
            return 'scripts';
        }
        if (/\.(csv|json|xml)$/.test(fileName) && !/config|package/.test(fileName)) {
            return 'data';
        }
        if (/^(REPORT|ANALYSIS|SUMMARY)_.*\.md$/.test(fileName)) {
            return 'reports';
        }
        if (/backup/i.test(fileName)) {
            return 'backups';
        }
        return null;
    }

    /**
     * Monitor a directory for violations
     */
    monitor(directory = this.rootDir) {
        console.log(`🔍 Monitoring directory: ${directory}`);

        const checkFile = (filePath) => {
            const result = this.validateFilePath(filePath);
            if (!result.valid) {
                this.reportViolation(filePath, result);
            }
        };

        // Check existing files
        this.scanDirectory(directory, checkFile);

        // Watch for new files
        if (fs.existsSync(directory)) {
            fs.watch(directory, { recursive: true }, (eventType, fileName) => {
                if (eventType === 'rename' && fileName) {
                    const filePath = path.join(directory, fileName);
                    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                        checkFile(filePath);
                    }
                }
            });
        }

        console.log('✓ Organization monitoring active');
    }

    /**
     * Scan directory recursively
     */
    scanDirectory(dir, callback) {
        if (!fs.existsSync(dir)) return;

        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);

            if (stat.isFile()) {
                callback(fullPath);
            } else if (stat.isDirectory() && !item.startsWith('.')) {
                // Skip hidden directories
                this.scanDirectory(fullPath, callback);
            }
        }
    }

    /**
     * Report a violation
     */
    reportViolation(filePath, result) {
        const violation = {
            file: filePath,
            ...result,
            timestamp: new Date().toISOString()
        };

        this.violations.push(violation);

        const icon = result.severity === 'error' ? '❌' : '⚠️';
        console.log(`\n${icon} Organization Violation Detected:`);
        console.log(`   File: ${path.relative(this.rootDir, filePath)}`);
        console.log(`   Issue: ${result.violation}`);
        console.log(`   Suggestion: ${result.suggestion}`);

        this.emit('violation', violation);
    }

    /**
     * Get summary of violations
     */
    getSummary() {
        const summary = {
            total: this.violations.length,
            errors: this.violations.filter(v => v.severity === 'error').length,
            warnings: this.violations.filter(v => v.severity === 'warning').length,
            violations: this.violations
        };

        return summary;
    }

    /**
     * Generate fix script for violations
     */
    generateFixScript() {
        const fixes = [];

        for (const violation of this.violations) {
            const relativePath = path.relative(this.rootDir, violation.file);
            const suggestedDir = this.detectCorrectDirectory(path.basename(violation.file));

            if (suggestedDir) {
                fixes.push(`# ${violation.violation}`);
                fixes.push(`mkdir -p ${suggestedDir}`);
                fixes.push(`mv "${relativePath}" "${suggestedDir}/"`);
                fixes.push('');
            }
        }

        if (fixes.length > 0) {
            const script = `#!/bin/bash\n# Auto-generated organization fixes\n\n${fixes.join('\n')}`;
            const fixPath = path.join(this.rootDir, 'fix-organization.sh');
            fs.writeFileSync(fixPath, script);
            fs.chmodSync(fixPath, '755');
            console.log(`\n✓ Fix script generated: ${fixPath}`);
            console.log('  Review and run: ./fix-organization.sh');
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0] || 'check';
    const directory = args[1] || process.cwd();

    const enforcer = new OrganizationEnforcer({ rootDir: directory });

    switch (command) {
        case 'check':
            console.log('Checking organization compliance...\n');
            enforcer.scanDirectory(directory, (filePath) => {
                const result = enforcer.validateFilePath(filePath);
                if (!result.valid) {
                    enforcer.reportViolation(filePath, result);
                }
            });

            const summary = enforcer.getSummary();
            if (summary.total > 0) {
                console.log(`\n📊 Summary: ${summary.total} violations found`);
                console.log(`   Errors: ${summary.errors}`);
                console.log(`   Warnings: ${summary.warnings}`);
                enforcer.generateFixScript();
            } else {
                console.log('\n✅ No organization violations found!');
            }
            break;

        case 'monitor':
            enforcer.monitor(directory);
            console.log('Press Ctrl+C to stop monitoring...');
            break;

        case 'fix':
            console.log('Generating fix script...');
            enforcer.scanDirectory(directory, (filePath) => {
                const result = enforcer.validateFilePath(filePath);
                if (!result.valid) {
                    enforcer.reportViolation(filePath, result);
                }
            });
            enforcer.generateFixScript();
            break;

        default:
            console.log('Usage: organization-enforcer.js [command] [directory]');
            console.log('Commands:');
            console.log('  check    - Check for violations (default)');
            console.log('  monitor  - Monitor directory for violations');
            console.log('  fix      - Generate fix script');
            process.exit(1);
    }
}

module.exports = OrganizationEnforcer;