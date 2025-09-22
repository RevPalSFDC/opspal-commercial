#!/usr/bin/env node

/**
 * Migration Script: Old Bulk Processing → New Bulk API 2.0 System
 * Helps migrate from old scripts to new production-ready system
 */

const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const { program } = require('commander');

program
    .version('1.0.0')
    .description('Migrate old bulk processing scripts to new Bulk API 2.0 system');

program
    .command('analyze')
    .description('Analyze old scripts and identify migration points')
    .option('-d, --directory <path>', 'Directory to analyze', './scripts')
    .action(analyzeOldScripts);

program
    .command('convert <script>')
    .description('Convert an old script to use new system')
    .option('-o, --output <path>', 'Output path for converted script')
    .action(convertScript);

program
    .command('validate')
    .description('Validate that new system is ready')
    .action(validateNewSystem);

/**
 * Analyze old scripts for migration points
 */
async function analyzeOldScripts(options) {
    const dir = options.directory;
    console.log(chalk.blue(`\n📊 Analyzing scripts in ${dir}...\n`));

    const files = await fs.readdir(dir);
    const jsFiles = files.filter(f => f.endsWith('.js'));

    const issues = {
        dangerous: [],
        deprecated: [],
        replaceable: []
    };

    for (const file of jsFiles) {
        const filePath = path.join(dir, file);
        const content = await fs.readFile(filePath, 'utf8');

        // Check for dangerous patterns
        if (content.includes('fs.readFileSync') && content.includes('split(')) {
            issues.dangerous.push({
                file,
                pattern: 'Loading entire CSV into memory',
                line: findLine(content, 'readFileSync')
            });
        }

        if (content.includes('sf data upsert bulk')) {
            issues.deprecated.push({
                file,
                pattern: 'Using CLI wrapper instead of API',
                line: findLine(content, 'sf data upsert bulk')
            });
        }

        if (!content.includes('retry') && content.includes('bulk')) {
            issues.dangerous.push({
                file,
                pattern: 'No retry logic for bulk operations',
                severity: 'HIGH'
            });
        }

        if (!content.includes('failedResults')) {
            issues.dangerous.push({
                file,
                pattern: 'Not downloading failed results',
                severity: 'CRITICAL'
            });
        }

        // Check for replaceable patterns
        if (content.includes('bulk-process') || content.includes('bulkUpdate')) {
            issues.replaceable.push({
                file,
                recommendation: 'Use new bin/bulk-processor.js',
                effort: 'LOW'
            });
        }
    }

    // Display results
    console.log(chalk.red.bold('🚨 DANGEROUS PATTERNS:'));
    if (issues.dangerous.length === 0) {
        console.log(chalk.green('  None found ✅'));
    } else {
        issues.dangerous.forEach(issue => {
            console.log(chalk.red(`  • ${issue.file}: ${issue.pattern}`));
            if (issue.severity) {
                console.log(chalk.yellow(`    Severity: ${issue.severity}`));
            }
        });
    }

    console.log(chalk.yellow.bold('\n⚠️  DEPRECATED PATTERNS:'));
    if (issues.deprecated.length === 0) {
        console.log(chalk.green('  None found ✅'));
    } else {
        issues.deprecated.forEach(issue => {
            console.log(chalk.yellow(`  • ${issue.file}: ${issue.pattern}`));
        });
    }

    console.log(chalk.blue.bold('\n🔄 REPLACEABLE SCRIPTS:'));
    if (issues.replaceable.length === 0) {
        console.log(chalk.green('  None found ✅'));
    } else {
        issues.replaceable.forEach(issue => {
            console.log(chalk.blue(`  • ${issue.file}`));
            console.log(chalk.cyan(`    → ${issue.recommendation}`));
        });
    }

    // Generate migration plan
    console.log(chalk.green.bold('\n📋 MIGRATION PLAN:'));
    console.log('1. Install new dependencies:');
    console.log(chalk.cyan('   npm install'));
    console.log('\n2. Replace old scripts with new commands:');
    console.log(chalk.cyan('   Old: node scripts/bulk-process-contacts.js'));
    console.log(chalk.green('   New: npm run bulk:process -- --file data.csv --object Contact --action upsert'));
    console.log('\n3. Update automation/cron jobs to use new CLI');
    console.log('\n4. Test with dry-run first:');
    console.log(chalk.cyan('   npm run bulk:test -- --file sample.csv --object Contact --action update'));

    return issues;
}

/**
 * Convert old script to new system
 */
async function convertScript(scriptPath, options) {
    console.log(chalk.blue(`\n🔄 Converting ${scriptPath}...\n`));

    const content = await fs.readFile(scriptPath, 'utf8');

    // Conversion map
    const conversions = [
        {
            old: /const command = `sf data upsert bulk[^`]+`/g,
            new: `// MIGRATED: Use new Bulk API 2.0 client
const SalesforceAuth = require('../lib/salesforce-auth');
const auth = new SalesforceAuth();
const bulkClient = await auth.getBulkClient();
const result = await bulkClient.executeBulkOperation(object, 'upsert', csvStream, options);`
        },
        {
            old: /fs\.readFileSync\([^)]+\)\.split\('\\n'\)/g,
            new: `// MIGRATED: Use streaming CSV reader
const { createReadStream } = require('fs');
const csvStream = createReadStream(filePath);`
        },
        {
            old: /exec\(command/g,
            new: `// MIGRATED: Direct API call
await bulkClient.executeBulkOperation`
        }
    ];

    let converted = content;
    conversions.forEach(conv => {
        converted = converted.replace(conv.old, conv.new);
    });

    // Add migration header
    const header = `/**
 * MIGRATED TO BULK API 2.0
 * Original: ${path.basename(scriptPath)}
 * Migrated: ${new Date().toISOString()}
 *
 * ⚠️ This file has been automatically migrated.
 * Please review and test before using in production.
 */

`;

    converted = header + converted;

    // Save converted file
    const outputPath = options.output || scriptPath.replace('.js', '.migrated.js');
    await fs.writeFile(outputPath, converted);

    console.log(chalk.green(`✅ Converted script saved to: ${outputPath}`));
    console.log(chalk.yellow('\n⚠️  Please review the converted script and test thoroughly'));

    return outputPath;
}

/**
 * Validate new system is ready
 */
async function validateNewSystem() {
    console.log(chalk.blue('\n🔍 Validating new Bulk API 2.0 system...\n'));

    const checks = [
        {
            name: 'Core libraries exist',
            check: async () => {
                const files = [
                    'lib/salesforce-bulk-client.js',
                    'lib/csv-splitter.js',
                    'lib/job-orchestrator.js',
                    'lib/result-reconciler.js',
                    'lib/retry-handler.js',
                    'lib/salesforce-auth.js'
                ];

                for (const file of files) {
                    const exists = await fs.access(file).then(() => true).catch(() => false);
                    if (!exists) {
                        throw new Error(`Missing: ${file}`);
                    }
                }
                return true;
            }
        },
        {
            name: 'CLI tool exists',
            check: async () => {
                const exists = await fs.access('bin/bulk-processor.js').then(() => true).catch(() => false);
                if (!exists) {
                    throw new Error('Missing bulk-processor.js CLI');
                }
                return true;
            }
        },
        {
            name: 'Dependencies installed',
            check: async () => {
                const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
                const required = ['commander', 'chalk', 'ora', 'csv-parse', 'csv-stringify'];

                for (const dep of required) {
                    if (!packageJson.dependencies[dep]) {
                        throw new Error(`Missing dependency: ${dep}`);
                    }
                }
                return true;
            }
        },
        {
            name: 'Salesforce CLI available',
            check: async () => {
                const { exec } = require('child_process');
                const { promisify } = require('util');
                const execPromise = promisify(exec);

                try {
                    await execPromise('sf --version');
                    return true;
                } catch (error) {
                    throw new Error('Salesforce CLI not found');
                }
            }
        }
    ];

    let passed = 0;
    let failed = 0;

    for (const check of checks) {
        try {
            await check.check();
            console.log(chalk.green(`✅ ${check.name}`));
            passed++;
        } catch (error) {
            console.log(chalk.red(`❌ ${check.name}: ${error.message}`));
            failed++;
        }
    }

    console.log(chalk.bold(`\n📊 Results: ${passed} passed, ${failed} failed\n`));

    if (failed === 0) {
        console.log(chalk.green.bold('✨ System is ready for production use!'));
        console.log(chalk.cyan('\nQuick start:'));
        console.log('  npm run bulk:estimate -- --file data.csv');
        console.log('  npm run bulk:process -- --file data.csv --object Contact --action upsert --dry-run');
    } else {
        console.log(chalk.red.bold('⚠️  System not ready. Please fix the issues above.'));
        console.log(chalk.yellow('\nTo fix:'));
        console.log('  1. Ensure all files from the implementation are present');
        console.log('  2. Run: npm install');
        console.log('  3. Install Salesforce CLI if missing');
    }

    process.exit(failed > 0 ? 1 : 0);
}

function findLine(content, pattern) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(pattern)) {
            return i + 1;
        }
    }
    return null;
}

// Parse arguments
program.parse(process.argv);

// Show help if no command
if (!process.argv.slice(2).length) {
    program.outputHelp();
}