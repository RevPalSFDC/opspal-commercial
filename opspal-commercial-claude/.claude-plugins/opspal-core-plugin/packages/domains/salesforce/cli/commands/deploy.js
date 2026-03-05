/**
 * Deploy Command - Deploy Flow to Salesforce
 *
 * Usage:
 *   flow deploy MyFlow.flow-meta.xml --activate
 *   flow deploy MyFlow.flow-meta.xml --test --dry-run
 *
 * Part of Phase 4.1: CLI Wrapper Tool
 */

const chalk = require('chalk');
const ora = require('ora');
const FlowAuthor = require('../../scripts/lib/flow-author');

async function deployCommand(flowPath, options) {
    if (!flowPath) {
        console.error(chalk.red('Error:'), 'Flow path is required');
        console.log('Usage: flow deploy <path-to-flow.xml> [options]');
        process.exit(1);
    }

    const spinner = ora('Preparing deployment...').start();

    try {
        const author = new FlowAuthor(options.org, { verbose: options.verbose });

        await author.loadFlow(flowPath);

        // Validate before deploying
        spinner.text = 'Validating Flow...';
        const validation = await author.validate();

        if (!validation.valid) {
            spinner.fail(chalk.red('Validation failed - deployment aborted'));
            console.log('');
            console.log(chalk.yellow('Errors:'));
            validation.errors.forEach(err => console.log('  -', err));
            console.log('');
            console.log(chalk.blue('Fix validation errors and try again.'));
            await author.close();
            process.exit(1);
        }

        spinner.text = 'Validation passed';

        if (options.dryRun) {
            spinner.succeed(chalk.green('Dry-run completed successfully!'));
            console.log('');
            console.log(chalk.blue('Deployment would proceed with these settings:'));
            console.log(chalk.gray('  Org:'), options.org);
            console.log(chalk.gray('  Flow:'), flowPath);
            console.log(chalk.gray('  Activate:'), options.activate ? 'Yes' : 'No');
            console.log(chalk.gray('  Run Tests:'), options.test ? 'Yes' : 'No');
            console.log(chalk.gray('  Escalate Permissions:'), !options.noEscalate);
            console.log('');
            console.log(chalk.green('✓'), 'No changes made (dry-run mode)');
            console.log('');
            await author.close();
            return;
        }

        // Deploy
        spinner.text = 'Deploying Flow to Salesforce...';

        const deploymentOptions = {
            activateOnDeploy: options.activate || false,
            runTests: options.test || false,
            escalatePermissions: !options.noEscalate,
            verify: true
        };

        const result = await author.deploy(deploymentOptions);

        spinner.succeed(chalk.green('✓ Deployment successful!'));

        console.log('');
        console.log(chalk.bold('Deployment Summary:'));
        console.log(chalk.gray('  Deployment ID:'), result.deploymentId);
        console.log(chalk.gray('  Flow:'), result.flowPath);
        console.log(chalk.gray('  Duration:'), `${result.duration}ms`);
        if (result.backupPath) {
            console.log(chalk.gray('  Backup:'), result.backupPath);
        }
        console.log('');

        if (options.activate) {
            console.log(chalk.green('✓'), 'Flow activated');
        } else {
            console.log(chalk.blue('ℹ'), 'Flow deployed as Draft (use --activate to activate)');
        }

        console.log('');

        await author.close();

    } catch (error) {
        spinner.fail(chalk.red('Deployment failed'));
        console.error(chalk.red('Error:'), error.message);
        if (options.verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

module.exports = deployCommand;
