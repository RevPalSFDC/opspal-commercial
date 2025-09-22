#!/usr/bin/env node

/**
 * Error Recovery Script for Failed HubSpot Imports
 * Extracts failed rows and creates retry CSV
 */

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const chalk = require('chalk');
const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');
const HubSpotBulk = require('../lib/hubspot-bulk');

class ImportRecovery {
    constructor() {
        this.hubspot = new HubSpotBulk();
    }

    /**
     * Recover failed import
     */
    async recoverImport(importId, options = {}) {
        console.log(chalk.bold('🔧 HubSpot Import Recovery Tool\n'));

        // Initialize HubSpot
        await this.hubspot.initialize();

        // Get import errors
        console.log(chalk.blue('📥 Fetching import errors...'));
        const errors = await this.hubspot.imports.getImportErrors(importId);

        if (errors.totalErrors === 0) {
            console.log(chalk.green('✅ No errors found for this import!'));
            return;
        }

        console.log(chalk.yellow(`⚠️  Found ${errors.totalErrors} errors\n`));

        // Analyze errors
        const errorAnalysis = this.analyzeErrors(errors.errors);
        this.displayErrorAnalysis(errorAnalysis);

        // Generate recovery files
        const recoveryFiles = await this.generateRecoveryFiles(errors, options);

        // Display recovery plan
        this.displayRecoveryPlan(recoveryFiles, errorAnalysis);

        // Optionally retry automatically
        if (options.autoRetry && recoveryFiles.retryable.path) {
            console.log(chalk.blue('\n🔄 Auto-retrying fixable records...'));
            await this.retryImport(recoveryFiles.retryable.path, options);
        }

        return recoveryFiles;
    }

    /**
     * Analyze error patterns
     */
    analyzeErrors(errors) {
        const analysis = {
            byType: {},
            byColumn: {},
            fixable: 0,
            unfixable: 0,
            patterns: []
        };

        for (const error of errors) {
            // Count by type
            analysis.byType[error.errorType] = (analysis.byType[error.errorType] || 0) + 1;

            // Count by column
            if (error.knownColumnNumber) {
                analysis.byColumn[error.knownColumnNumber] = (analysis.byColumn[error.knownColumnNumber] || 0) + 1;
            }

            // Determine if fixable
            if (this.isFixableError(error)) {
                analysis.fixable++;
            } else {
                analysis.unfixable++;
            }
        }

        // Identify patterns
        analysis.patterns = this.identifyErrorPatterns(errors);

        return analysis;
    }

    /**
     * Check if error is automatically fixable
     */
    isFixableError(error) {
        const fixableTypes = [
            'INVALID_EMAIL',      // Can clean email format
            'DUPLICATE_VALUE',    // Can dedupe
            'INVALID_DATE',       // Can reformat date
            'INVALID_NUMBER',     // Can clean number format
            'INVALID_PHONE',      // Can reformat phone
            'INVALID_URL'         // Can fix URL format
        ];

        return fixableTypes.includes(error.errorType);
    }

    /**
     * Identify common error patterns
     */
    identifyErrorPatterns(errors) {
        const patterns = [];

        // Check for systematic date issues
        const dateErrors = errors.filter(e => e.errorType === 'INVALID_DATE');
        if (dateErrors.length > 10) {
            patterns.push({
                type: 'date_format',
                count: dateErrors.length,
                suggestion: 'Check date format (should be YYYY-MM-DD)'
            });
        }

        // Check for email domain issues
        const emailErrors = errors.filter(e => e.errorType === 'INVALID_EMAIL');
        const domains = {};
        emailErrors.forEach(e => {
            const domain = e.invalidValue?.split('@')[1];
            if (domain) domains[domain] = (domains[domain] || 0) + 1;
        });

        Object.entries(domains).forEach(([domain, count]) => {
            if (count > 5) {
                patterns.push({
                    type: 'email_domain',
                    domain,
                    count,
                    suggestion: `Many errors from domain: ${domain}`
                });
            }
        });

        return patterns;
    }

    /**
     * Generate recovery files
     */
    async generateRecoveryFiles(errorData, options) {
        const timestamp = Date.now();
        const outputDir = options.outputDir || './recovery';
        await fs.promises.mkdir(outputDir, { recursive: true });

        const files = {
            errors: {
                path: path.join(outputDir, `errors-${timestamp}.csv`),
                count: 0
            },
            retryable: {
                path: path.join(outputDir, `retry-${timestamp}.csv`),
                count: 0
            },
            unfixable: {
                path: path.join(outputDir, `unfixable-${timestamp}.csv`),
                count: 0
            }
        };

        // Create error details CSV
        const errorStream = fs.createWriteStream(files.errors.path);
        const errorStringifier = stringify({
            header: true,
            columns: ['row_number', 'error_type', 'message', 'column', 'invalid_value', 'source_data']
        });
        errorStringifier.pipe(errorStream);

        // Create retry CSV for fixable errors
        const retryStream = fs.createWriteStream(files.retryable.path);
        const retryStringifier = stringify({ header: true });
        retryStringifier.pipe(retryStream);

        // Create unfixable CSV
        const unfixableStream = fs.createWriteStream(files.unfixable.path);
        const unfixableStringifier = stringify({ header: true });
        unfixableStringifier.pipe(unfixableStream);

        // Process each error
        for (const error of errorData.errors) {
            // Write to error details
            errorStringifier.write({
                row_number: error.rowNumber,
                error_type: error.errorType,
                message: error.message,
                column: error.knownColumnNumber || '',
                invalid_value: error.invalidValue || '',
                source_data: JSON.stringify(error.sourceData || {})
            });
            files.errors.count++;

            // Determine if fixable
            if (this.isFixableError(error)) {
                const fixed = this.attemptAutoFix(error);
                if (fixed) {
                    retryStringifier.write(fixed);
                    files.retryable.count++;
                }
            } else {
                if (error.sourceData) {
                    unfixableStringifier.write(error.sourceData);
                    files.unfixable.count++;
                }
            }
        }

        // Close streams
        errorStringifier.end();
        retryStringifier.end();
        unfixableStringifier.end();

        await Promise.all([
            new Promise(resolve => errorStream.on('finish', resolve)),
            new Promise(resolve => retryStream.on('finish', resolve)),
            new Promise(resolve => unfixableStream.on('finish', resolve))
        ]);

        return files;
    }

    /**
     * Attempt to auto-fix common errors
     */
    attemptAutoFix(error) {
        if (!error.sourceData) return null;

        const fixed = { ...error.sourceData };

        switch (error.errorType) {
            case 'INVALID_EMAIL':
                // Clean email format
                if (error.invalidValue) {
                    fixed.email = error.invalidValue
                        .toLowerCase()
                        .trim()
                        .replace(/\s+/g, '');
                }
                break;

            case 'INVALID_DATE':
                // Convert to YYYY-MM-DD
                if (error.invalidValue) {
                    const date = new Date(error.invalidValue);
                    if (!isNaN(date)) {
                        fixed[error.knownColumnNumber] = date.toISOString().split('T')[0];
                    }
                }
                break;

            case 'INVALID_PHONE':
                // Clean phone number
                if (error.invalidValue) {
                    fixed.phone = error.invalidValue
                        .replace(/[^\d+]/g, '')
                        .replace(/^(\d{10})$/, '+1$1');
                }
                break;

            case 'INVALID_NUMBER':
                // Clean number format
                if (error.invalidValue) {
                    const cleaned = parseFloat(error.invalidValue.replace(/[^\d.-]/g, ''));
                    if (!isNaN(cleaned)) {
                        fixed[error.knownColumnNumber] = cleaned;
                    }
                }
                break;

            case 'DUPLICATE_VALUE':
                // Add timestamp to make unique
                if (error.knownColumnNumber === 'email') {
                    fixed.email = error.invalidValue.replace('@', `.${Date.now()}@`);
                }
                break;
        }

        return fixed;
    }

    /**
     * Display error analysis
     */
    displayErrorAnalysis(analysis) {
        console.log(chalk.bold('📊 Error Analysis:\n'));

        // Error types
        console.log('Error Types:');
        Object.entries(analysis.byType)
            .sort((a, b) => b[1] - a[1])
            .forEach(([type, count]) => {
                const bar = '█'.repeat(Math.min(30, Math.round(count / 10)));
                console.log(`  ${type.padEnd(20)} ${bar} ${count}`);
            });

        console.log(`\n  Fixable: ${chalk.green(analysis.fixable)}`);
        console.log(`  Unfixable: ${chalk.red(analysis.unfixable)}`);

        // Patterns
        if (analysis.patterns.length > 0) {
            console.log(chalk.yellow('\n⚠️  Patterns Detected:'));
            analysis.patterns.forEach(pattern => {
                console.log(`  - ${pattern.suggestion} (${pattern.count} occurrences)`);
            });
        }
    }

    /**
     * Display recovery plan
     */
    displayRecoveryPlan(files, analysis) {
        console.log(chalk.bold('\n📋 Recovery Plan:\n'));

        console.log('Generated Files:');
        console.log(`  1. Error Details: ${files.errors.path} (${files.errors.count} rows)`);
        console.log(`  2. Retry File: ${files.retryable.path} (${files.retryable.count} rows)`);
        console.log(`  3. Manual Review: ${files.unfixable.path} (${files.unfixable.count} rows)`);

        console.log('\nNext Steps:');
        console.log('  1. Review error details for patterns');
        console.log('  2. Import retry file for auto-fixed records:');
        console.log(chalk.cyan(`     import-contacts ${files.retryable.path} --name "retry-${Date.now()}"`));
        console.log('  3. Manually fix unfixable records');
        console.log('  4. Consider updating data validation rules');
    }

    /**
     * Retry import with fixed data
     */
    async retryImport(filePath, options) {
        const retryResult = await this.hubspot.importContacts(filePath, {
            name: options.retryName || `Retry import ${Date.now()}`,
            wait: true,
            onProgress: (status) => {
                console.log(chalk.gray(`  Status: ${status.state}`));
            }
        });

        if (retryResult.errors && retryResult.errors.totalErrors > 0) {
            console.log(chalk.yellow(`  ⚠️  Retry still has ${retryResult.errors.totalErrors} errors`));
        } else {
            console.log(chalk.green('  ✅ Retry successful!'));
        }

        return retryResult;
    }
}

async function main() {
    program
        .name('recover-failed-import')
        .description('Recover and retry failed HubSpot imports')
        .argument('<import-id>', 'Import ID to recover')
        .option('-o, --output-dir <dir>', 'Output directory for recovery files', './recovery')
        .option('-a, --auto-retry', 'Automatically retry fixable records')
        .option('-n, --retry-name <name>', 'Name for retry import')
        .parse(process.argv);

    const [importId] = program.args;
    const options = program.opts();

    if (!importId) {
        console.error(chalk.red('❌ Import ID is required'));
        program.help();
    }

    const recovery = new ImportRecovery();

    try {
        await recovery.recoverImport(importId, options);
    } catch (error) {
        console.error(chalk.red(`\n❌ Recovery failed: ${error.message}`));
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = ImportRecovery;