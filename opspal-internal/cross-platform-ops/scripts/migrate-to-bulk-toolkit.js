#!/usr/bin/env node

/**
 * Migration script to update existing code to use HubSpot Bulk Toolkit
 * Identifies and refactors non-bulk HubSpot operations
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

class BulkToolkitMigrator {
    constructor() {
        this.findings = [];
        this.refactored = [];
        this.skipped = [];
    }

    /**
     * Scan directory for files using old HubSpot patterns
     */
    async scanDirectory(dir = '.') {
        console.log(chalk.blue('🔍 Scanning for non-bulk HubSpot operations...\n'));

        const patterns = [
            {
                regex: /hubspot-connector/g,
                message: 'Uses old hubspot-connector',
                severity: 'high'
            },
            {
                regex: /\/batch\/(create|update|archive)/g,
                message: 'Uses batch API instead of bulk',
                severity: 'critical'
            },
            {
                regex: /\.forEach.*hubspot|\.forEach.*makeRequest/g,
                message: 'HubSpot API call in forEach loop',
                severity: 'critical'
            },
            {
                regex: /for\s*\(.*\).*\{[\s\S]*?hubspot[\s\S]*?\}/g,
                message: 'HubSpot API call in for loop',
                severity: 'critical'
            },
            {
                regex: /createRecords|updateRecords|deleteRecords/g,
                message: 'Uses batch methods (100 record limit)',
                severity: 'high'
            }
        ];

        await this.walkDirectory(dir, patterns);

        return this.findings;
    }

    /**
     * Walk directory recursively
     */
    async walkDirectory(dir, patterns) {
        const files = await fs.promises.readdir(dir);

        for (const file of files) {
            const filepath = path.join(dir, file);
            const stat = await fs.promises.stat(filepath);

            // Skip certain directories
            if (stat.isDirectory()) {
                if (['node_modules', '.git', 'lib/hubspot-bulk'].includes(file)) {
                    continue;
                }
                await this.walkDirectory(filepath, patterns);
            } else if (file.endsWith('.js') && !file.endsWith('.test.js')) {
                await this.scanFile(filepath, patterns);
            }
        }
    }

    /**
     * Scan individual file for patterns
     */
    async scanFile(filepath, patterns) {
        const content = await fs.promises.readFile(filepath, 'utf8');
        const lines = content.split('\n');

        for (const pattern of patterns) {
            const matches = content.match(pattern.regex);
            if (matches) {
                // Find line numbers
                const lineNumbers = [];
                lines.forEach((line, index) => {
                    if (pattern.regex.test(line)) {
                        lineNumbers.push(index + 1);
                    }
                });

                this.findings.push({
                    file: filepath,
                    pattern: pattern.message,
                    severity: pattern.severity,
                    occurrences: matches.length,
                    lines: lineNumbers
                });
            }
        }
    }

    /**
     * Generate migration plan
     */
    generateMigrationPlan() {
        const plan = {
            critical: [],
            high: [],
            medium: [],
            summary: {
                totalFiles: new Set(this.findings.map(f => f.file)).size,
                criticalIssues: 0,
                highIssues: 0,
                estimatedEffort: ''
            }
        };

        for (const finding of this.findings) {
            const task = {
                file: finding.file,
                issue: finding.pattern,
                lines: finding.lines,
                refactor: this.getRefactorSuggestion(finding.pattern)
            };

            if (finding.severity === 'critical') {
                plan.critical.push(task);
                plan.summary.criticalIssues++;
            } else if (finding.severity === 'high') {
                plan.high.push(task);
                plan.summary.highIssues++;
            } else {
                plan.medium.push(task);
            }
        }

        // Estimate effort
        const totalIssues = plan.summary.criticalIssues + plan.summary.highIssues;
        if (totalIssues < 10) {
            plan.summary.estimatedEffort = '1-2 hours';
        } else if (totalIssues < 50) {
            plan.summary.estimatedEffort = '4-8 hours';
        } else {
            plan.summary.estimatedEffort = '1-2 days';
        }

        return plan;
    }

    /**
     * Get refactor suggestion based on pattern
     */
    getRefactorSuggestion(pattern) {
        const suggestions = {
            'Uses old hubspot-connector': `
1. Replace: const HubSpotConnector = require('./hubspot-connector');
   With: const HubSpotBulk = require('../lib/hubspot-bulk');

2. Update initialization:
   const hubspot = new HubSpotBulk();
   await hubspot.initialize();`,

            'Uses batch API instead of bulk': `
1. Replace batch operations with bulk imports:
   // Old
   await hubspot.makeRequest('/batch/create', { inputs: records });

   // New
   await hubspot.importContacts('data.csv', { wait: true });`,

            'HubSpot API call in forEach loop': `
1. Collect all records first:
   const records = [];
   data.forEach(item => records.push(transform(item)));

2. Use bulk operation:
   await hubspot.importContacts(records);`,

            'Uses batch methods (100 record limit)': `
1. Replace with bulk imports:
   // Old
   await hubspot.createRecords('contacts', records);

   // New
   const csvPath = await createCSV(records);
   await hubspot.importContacts(csvPath);`
        };

        for (const [key, suggestion] of Object.entries(suggestions)) {
            if (pattern.includes(key)) {
                return suggestion;
            }
        }

        return 'Review and update to use bulk toolkit';
    }

    /**
     * Apply automated fixes where safe
     */
    async applyAutomatedFixes(dryRun = true) {
        console.log(chalk.yellow('\n🔧 Applying automated fixes...\n'));

        const safeReplacements = [
            {
                from: /const\s+HubSpotConnector\s*=\s*require\(['"]\S*hubspot-connector['"]\)/g,
                to: "const HubSpotBulk = require('../lib/hubspot-bulk')"
            },
            {
                from: /new\s+HubSpotConnector\(/g,
                to: 'new HubSpotBulk('
            }
        ];

        for (const finding of this.findings) {
            if (finding.severity !== 'critical') continue;

            const content = await fs.promises.readFile(finding.file, 'utf8');
            let modified = content;

            for (const replacement of safeReplacements) {
                if (replacement.from.test(content)) {
                    modified = modified.replace(replacement.from, replacement.to);
                }
            }

            if (modified !== content) {
                if (dryRun) {
                    console.log(chalk.gray(`  [DRY RUN] Would update: ${finding.file}`));
                } else {
                    await fs.promises.writeFile(finding.file, modified);
                    console.log(chalk.green(`  ✓ Updated: ${finding.file}`));
                }
                this.refactored.push(finding.file);
            } else {
                this.skipped.push(finding.file);
            }
        }
    }

    /**
     * Generate report
     */
    async generateReport(outputPath = './migration-report.md') {
        const plan = this.generateMigrationPlan();

        const report = `# HubSpot Bulk Toolkit Migration Report

Generated: ${new Date().toISOString()}

## Summary

- **Total Files to Update**: ${plan.summary.totalFiles}
- **Critical Issues**: ${plan.summary.criticalIssues}
- **High Priority Issues**: ${plan.summary.highIssues}
- **Estimated Effort**: ${plan.summary.estimatedEffort}

## Critical Issues (Must Fix)

${plan.critical.map(issue => `
### ${issue.file}

**Issue**: ${issue.issue}
**Lines**: ${issue.lines.join(', ')}

**Suggested Fix**:
\`\`\`javascript
${issue.refactor}
\`\`\`
`).join('\n')}

## High Priority Issues

${plan.high.map(issue => `
- **${issue.file}**: ${issue.issue} (lines: ${issue.lines.join(', ')})
`).join('\n')}

## Automated Fixes

- **Files Automatically Updated**: ${this.refactored.length}
- **Files Requiring Manual Review**: ${this.skipped.length}

## Next Steps

1. Review and test automatically updated files
2. Manually update critical issues that couldn't be automated
3. Run tests: \`npm test\`
4. Verify with ESLint: \`npm run lint:bulk\`
5. Test bulk operations: \`import-contacts --dry-run test-data.csv\`

## Migration Checklist

- [ ] All forEach loops with HubSpot calls removed
- [ ] All batch endpoints replaced with bulk imports/exports
- [ ] hubspot-connector replaced with hubspot-bulk toolkit
- [ ] Rate limiting properly configured
- [ ] Error handling updated for async operations
- [ ] Tests updated and passing
- [ ] Documentation updated

## Resources

- [Bulk Toolkit Documentation](./README_bulk.md)
- [PR Checklist](.github/PULL_REQUEST_TEMPLATE.md)
- [API Migration Guide](https://developers.hubspot.com/docs/api/crm/imports)
`;

        await fs.promises.writeFile(outputPath, report);
        return report;
    }
}

// CLI
async function main() {
    const migrator = new BulkToolkitMigrator();

    console.log(chalk.bold('HubSpot Bulk Toolkit Migration Tool\n'));

    // Scan for issues
    await migrator.scanDirectory('./scripts');
    await migrator.scanDirectory('./lib');
    await migrator.scanDirectory('./core');

    if (migrator.findings.length === 0) {
        console.log(chalk.green('✅ No non-bulk operations found!'));
        return;
    }

    // Display findings
    console.log(chalk.red(`\n⚠️  Found ${migrator.findings.length} issues:\n`));

    const bySeverity = {};
    for (const finding of migrator.findings) {
        bySeverity[finding.severity] = bySeverity[finding.severity] || [];
        bySeverity[finding.severity].push(finding);
    }

    if (bySeverity.critical) {
        console.log(chalk.red('CRITICAL:'));
        bySeverity.critical.forEach(f => {
            console.log(`  - ${f.file}: ${f.pattern}`);
        });
    }

    if (bySeverity.high) {
        console.log(chalk.yellow('\nHIGH:'));
        bySeverity.high.forEach(f => {
            console.log(`  - ${f.file}: ${f.pattern}`);
        });
    }

    // Apply fixes
    const args = process.argv.slice(2);
    const dryRun = !args.includes('--apply');

    await migrator.applyAutomatedFixes(dryRun);

    // Generate report
    const report = await migrator.generateReport();
    console.log(chalk.green('\n📄 Migration report generated: migration-report.md'));

    if (dryRun) {
        console.log(chalk.yellow('\n💡 Run with --apply to apply automated fixes'));
    }
}

// Run if executed directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = BulkToolkitMigrator;