/**
 * Batch Commands - Perform operations on multiple Flows
 *
 * Usage:
 *   flow batch validate "./flows/*.xml"
 *   flow batch deploy "./flows/*.xml" --activate
 *   flow batch modify "./flows/*.xml" --instruction "Add a decision..."
 *
 * Part of Phase 4.1: CLI Wrapper Tool
 */

const chalk = require('chalk');
const ora = require('ora');
const Table = require('cli-table3');
const glob = require('glob');
const path = require('path');

// Batch manager will be loaded dynamically
let FlowBatchManager;

async function loadBatchManager() {
    if (!FlowBatchManager) {
        const batchModule = require('../../scripts/lib/flow-batch-manager');
        FlowBatchManager = batchModule;
    }
    return FlowBatchManager;
}

/**
 * Validate multiple Flows
 */
async function validate(pattern, options) {
    const spinner = ora('Finding Flows...').start();

    try {
        // Find matching files
        const files = glob.sync(pattern);

        if (files.length === 0) {
            spinner.fail();
            console.error(chalk.red('Error:'), `No files found matching pattern: ${pattern}`);
            process.exit(1);
        }

        spinner.text = `Validating ${files.length} Flows...`;

        // Load batch manager
        const BatchManager = await loadBatchManager();
        const manager = new BatchManager(options.org, {
            verbose: options.verbose,
            parallel: parseInt(options.parallel) || 5
        });

        // Run batch validation
        const results = await manager.validateBatch(files);

        spinner.stop();

        // Display results
        if (options.output === 'json') {
            console.log(JSON.stringify(results, null, 2));
            return;
        }

        if (options.output === 'summary') {
            // Summary output
            const passed = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;

            console.log('');
            console.log(chalk.bold('Batch Validation Summary:'));
            console.log(chalk.gray('  Total:'), files.length);
            console.log(chalk.green('  Passed:'), passed);
            console.log(chalk.red('  Failed:'), failed);
            console.log('');

            if (failed > 0) {
                console.log(chalk.red.bold('Failed Flows:'));
                results.filter(r => !r.success).forEach(result => {
                    console.log(chalk.red(`  - ${path.basename(result.flowPath)}`));
                    console.log(chalk.gray(`    ${result.error || 'Validation failed'}`));
                });
                console.log('');
            }

            process.exit(failed > 0 ? 1 : 0);
        }

        // Table output
        const table = new Table({
            head: [chalk.cyan('Flow'), chalk.cyan('Status'), chalk.cyan('Errors'), chalk.cyan('Warnings')],
            colWidths: [30, 10, 10, 10]
        });

        results.forEach(result => {
            const status = result.success ? chalk.green('PASS') : chalk.red('FAIL');
            const errors = result.validation?.errors?.length || 0;
            const warnings = result.validation?.warnings?.length || 0;

            table.push([
                path.basename(result.flowPath),
                status,
                errors,
                warnings
            ]);
        });

        console.log('');
        console.log(table.toString());
        console.log('');

        await manager.close();

        process.exit(results.some(r => !r.success) ? 1 : 0);

    } catch (error) {
        spinner.fail(chalk.red('Batch validation failed'));
        console.error(chalk.red('Error:'), error.message);
        if (options.verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

/**
 * Deploy multiple Flows
 */
async function deploy(pattern, options) {
    const spinner = ora('Finding Flows...').start();

    try {
        // Find matching files
        const files = glob.sync(pattern);

        if (files.length === 0) {
            spinner.fail();
            console.error(chalk.red('Error:'), `No files found matching pattern: ${pattern}`);
            process.exit(1);
        }

        spinner.text = `Deploying ${files.length} Flows...`;

        // Load batch manager
        const BatchManager = await loadBatchManager();
        const manager = new BatchManager(options.org, {
            verbose: options.verbose,
            parallel: parseInt(options.parallel) || 5
        });

        // Dry run check
        if (options.dryRun) {
            spinner.succeed(chalk.green('Dry-run completed successfully!'));
            console.log('');
            console.log(chalk.blue('Would deploy these Flows:'));
            files.forEach(file => {
                console.log(chalk.gray('  -'), path.basename(file));
            });
            console.log('');
            console.log(chalk.gray('  Activate:'), options.activate ? 'Yes' : 'No');
            console.log(chalk.gray('  Continue on error:'), options.continueOnError ? 'Yes' : 'No');
            console.log('');
            await manager.close();
            return;
        }

        // Run batch deployment
        const deploymentOptions = {
            activateOnDeploy: options.activate || false,
            continueOnError: options.continueOnError || false
        };

        const results = await manager.deployBatch(files, deploymentOptions);

        spinner.stop();

        // Display results
        const succeeded = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        console.log('');
        console.log(chalk.bold('Batch Deployment Summary:'));
        console.log(chalk.gray('  Total:'), files.length);
        console.log(chalk.green('  Succeeded:'), succeeded);
        console.log(chalk.red('  Failed:'), failed);
        console.log('');

        if (succeeded > 0) {
            console.log(chalk.green.bold('Successfully Deployed:'));
            results.filter(r => r.success).forEach(result => {
                console.log(chalk.green(`  ✓ ${path.basename(result.flowPath)}`));
            });
            console.log('');
        }

        if (failed > 0) {
            console.log(chalk.red.bold('Failed Deployments:'));
            results.filter(r => !r.success).forEach(result => {
                console.log(chalk.red(`  ✗ ${path.basename(result.flowPath)}`));
                console.log(chalk.gray(`    ${result.error || 'Deployment failed'}`));
            });
            console.log('');
        }

        await manager.close();

        process.exit(failed > 0 ? 1 : 0);

    } catch (error) {
        spinner.fail(chalk.red('Batch deployment failed'));
        console.error(chalk.red('Error:'), error.message);
        if (options.verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

/**
 * Modify multiple Flows with same instruction
 */
async function modify(pattern, options) {
    if (!options.instruction) {
        console.error(chalk.red('Error:'), 'Instruction is required (--instruction parameter)');
        console.log('Usage: flow batch modify <pattern> --instruction "<instruction>"');
        process.exit(1);
    }

    const spinner = ora('Finding Flows...').start();

    try {
        // Find matching files
        const files = glob.sync(pattern);

        if (files.length === 0) {
            spinner.fail();
            console.error(chalk.red('Error:'), `No files found matching pattern: ${pattern}`);
            process.exit(1);
        }

        spinner.text = `Modifying ${files.length} Flows...`;

        // Load batch manager
        const BatchManager = await loadBatchManager();
        const manager = new BatchManager(options.org, {
            verbose: options.verbose
        });

        // Dry run check
        if (options.dryRun) {
            spinner.succeed(chalk.green('Dry-run completed successfully!'));
            console.log('');
            console.log(chalk.blue('Would modify these Flows:'));
            files.forEach(file => {
                console.log(chalk.gray('  -'), path.basename(file));
            });
            console.log('');
            console.log(chalk.gray('  Instruction:'), options.instruction);
            console.log('');
            await manager.close();
            return;
        }

        // Run batch modification
        const results = await manager.modifyBatch(files, options.instruction);

        spinner.stop();

        // Display results
        const succeeded = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        console.log('');
        console.log(chalk.bold('Batch Modification Summary:'));
        console.log(chalk.gray('  Total:'), files.length);
        console.log(chalk.green('  Succeeded:'), succeeded);
        console.log(chalk.red('  Failed:'), failed);
        console.log('');

        if (succeeded > 0) {
            console.log(chalk.green.bold('Successfully Modified:'));
            results.filter(r => r.success).forEach(result => {
                console.log(chalk.green(`  ✓ ${path.basename(result.flowPath)}`));
            });
            console.log('');
        }

        if (failed > 0) {
            console.log(chalk.red.bold('Failed Modifications:'));
            results.filter(r => !r.success).forEach(result => {
                console.log(chalk.red(`  ✗ ${path.basename(result.flowPath)}`));
                console.log(chalk.gray(`    ${result.error || 'Modification failed'}`));
            });
            console.log('');
        }

        await manager.close();

        process.exit(failed > 0 ? 1 : 0);

    } catch (error) {
        spinner.fail(chalk.red('Batch modification failed'));
        console.error(chalk.red('Error:'), error.message);
        if (options.verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

module.exports = {
    validate,
    deploy,
    modify
};
