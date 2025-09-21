#!/usr/bin/env node
/**
 * Selective path refactoring - only refactor critical files
 */

const fs = require('fs').promises;
const path = require('path');

// Critical directories to refactor
const REFACTOR_TARGETS = [
    'scripts/*.js',
    'config/*.js',
    'platforms/*/scripts/*.js',
    '.claude/hooks/*.sh'
];

// Files to skip
const SKIP_FILES = [
    'path-scanner.js',
    'refactor-paths.js',
    'refactor-selective.js',
    'paths.config.js'
];

async function selectiveRefactor() {
    console.log('🎯 Selective Path Refactoring\n');

    // Load the report
    const reportPath = path.join(__dirname, '..', 'reports', 'path-scan-report.json');
    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));

    // Filter findings to only critical files
    const criticalFindings = report.findings.filter(finding => {
        // Check if file matches our targets
        const fileName = path.basename(finding.file);

        // Skip our own refactoring tools
        if (SKIP_FILES.includes(fileName)) return false;

        // Check if it's in a critical directory
        if (finding.file.startsWith('scripts/') && finding.file.endsWith('.js')) return true;
        if (finding.file.startsWith('config/') && finding.file.endsWith('.js')) return true;
        if (finding.file.includes('platforms/') && finding.file.includes('/scripts/')) return true;
        if (finding.file.startsWith('.claude/hooks/')) return true;

        return false;
    });

    // Group by file
    const byFile = {};
    for (const finding of criticalFindings) {
        if (!byFile[finding.file]) {
            byFile[finding.file] = [];
        }
        byFile[finding.file].push(finding);
    }

    console.log(`Found ${Object.keys(byFile).length} critical files to refactor\n`);

    // Show what will be refactored
    console.log('Files to be refactored:');
    for (const file of Object.keys(byFile)) {
        console.log(`  📄 ${file} (${byFile[file].length} paths)`);
    }

    console.log('\n⚠️  This will create .bak backup files');
    console.log('Continue? (y/n): ');

    // Wait for user input
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const answer = await new Promise(resolve => {
        readline.question('', resolve);
    });
    readline.close();

    if (answer.toLowerCase() !== 'y') {
        console.log('Refactoring cancelled.');
        return;
    }

    // Load the main refactorer
    const { PathRefactorer } = require('./refactor-paths.js');
    const refactorer = new PathRefactorer();

    // Create a modified report with only critical findings
    const modifiedReport = {
        ...report,
        findings: criticalFindings
    };

    // Run refactoring
    const results = await refactorer.refactorAll(modifiedReport);

    console.log('\n✅ Selective refactoring complete!');
    console.log(`  Files refactored: ${results.refactored}`);
    console.log(`  Backups created: ${results.backups}`);

    if (results.errors > 0) {
        console.log(`  ⚠️ Errors: ${results.errors}`);
    }
}

if (require.main === module) {
    selectiveRefactor().catch(console.error);
}