/**
 * Validate Command - Validate Flow(s)
 *
 * Usage:
 *   flow validate MyFlow.flow-meta.xml
 *   flow validate --best-practices --governor-limits
 *
 * Part of Phase 4.1: CLI Wrapper Tool
 */

const chalk = require('chalk');
const ora = require('ora');
const Table = require('cli-table3');
const FlowAuthor = require('../../scripts/lib/flow-author');

async function validateCommand(flowPath, options) {
    const spinner = ora('Validating Flow...').start();

    try {
        const author = new FlowAuthor(options.org, { verbose: options.verbose });

        await author.loadFlow(flowPath || './flow.flow-meta.xml');

        spinner.text = 'Running validation checks...';
        const validation = await author.validate();

        if (validation.valid) {
            spinner.succeed(chalk.green('✓ Flow validation passed!'));
        } else {
            spinner.fail(chalk.red('✗ Flow validation failed'));
        }

        console.log('');

        // Display results based on output format
        if (options.output === 'json') {
            console.log(JSON.stringify(validation, null, 2));
        } else if (options.output === 'table') {
            // Summary table
            const summaryTable = new Table({
                head: [chalk.cyan('Check'), chalk.cyan('Status'), chalk.cyan('Details')],
                colWidths: [25, 10, 60]
            });

            summaryTable.push(
                ['Validation', validation.valid ? chalk.green('PASS') : chalk.red('FAIL'), `${validation.errors.length} errors, ${validation.warnings.length} warnings`],
                ['Element Count', chalk.blue('INFO'), `${validation.elementCount} elements`],
                ['Variable Count', chalk.blue('INFO'), `${validation.variableCount} variables`]
            );

            if (options.bestPractices && validation.bestPractices) {
                summaryTable.push(['Best Practices Score', validation.bestPractices.score >= 80 ? chalk.green(validation.bestPractices.score + '/100') : chalk.yellow(validation.bestPractices.score + '/100'), `${validation.bestPractices.issues.length} issues`]);
            }

            if (options.governorLimits && validation.governorLimits) {
                const elementsUsage = `${validation.governorLimits.limits.elements.current}/${validation.governorLimits.limits.elements.limit} (${validation.governorLimits.limits.elements.percentage.toFixed(1)}%)`;
                summaryTable.push(['Governor Limits', validation.governorLimits.warnings.length === 0 ? chalk.green('OK') : chalk.yellow('WARN'), elementsUsage]);
            }

            console.log(summaryTable.toString());
            console.log('');

            // Errors
            if (validation.errors.length > 0) {
                console.log(chalk.red.bold('Errors:'));
                validation.errors.forEach((err, i) => {
                    console.log(chalk.red(`  ${i + 1}.`), err);
                });
                console.log('');
            }

            // Warnings
            if (validation.warnings.length > 0) {
                console.log(chalk.yellow.bold('Warnings:'));
                validation.warnings.forEach((warn, i) => {
                    console.log(chalk.yellow(`  ${i + 1}.`), warn);
                });
                console.log('');
            }

            // Best practices issues
            if (options.bestPractices && validation.bestPractices.issues.length > 0) {
                console.log(chalk.yellow.bold('Best Practice Issues:'));
                validation.bestPractices.issues.forEach((issue, i) => {
                    console.log(chalk.yellow(`  ${i + 1}.`), issue);
                });
                console.log('');
            }

            // Recommendations
            if (options.bestPractices && validation.bestPractices.recommendations.length > 0) {
                console.log(chalk.blue.bold('Recommendations:'));
                validation.bestPractices.recommendations.forEach((rec, i) => {
                    console.log(chalk.blue(`  ${i + 1}.`), rec);
                });
                console.log('');
            }

            // Governor limit warnings
            if (options.governorLimits && validation.governorLimits.warnings.length > 0) {
                console.log(chalk.yellow.bold('Governor Limit Warnings:'));
                validation.governorLimits.warnings.forEach((warn, i) => {
                    console.log(chalk.yellow(`  ${i + 1}.`), warn);
                });
                console.log('');
            }

        } else {
            // Verbose output
            console.log(chalk.bold('Validation Results:'));
            console.log('  Valid:', validation.valid ? chalk.green('YES') : chalk.red('NO'));
            console.log('  Errors:', validation.errors.length);
            console.log('  Warnings:', validation.warnings.length);
            console.log('  Elements:', validation.elementCount);
            console.log('  Variables:', validation.variableCount);
            console.log('');

            if (validation.errors.length > 0) {
                console.log(chalk.red('Errors:'));
                validation.errors.forEach(err => console.log('  -', err));
                console.log('');
            }

            if (validation.warnings.length > 0) {
                console.log(chalk.yellow('Warnings:'));
                validation.warnings.forEach(warn => console.log('  -', warn));
                console.log('');
            }
        }

        await author.close();

        // Exit with error code if validation failed
        if (!validation.valid) {
            process.exit(1);
        }

    } catch (error) {
        spinner.fail(chalk.red('Validation error'));
        console.error(chalk.red('Error:'), error.message);
        if (options.verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

module.exports = validateCommand;
