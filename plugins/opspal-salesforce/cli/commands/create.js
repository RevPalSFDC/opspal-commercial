/**
 * Create Command - Create new Flow
 *
 * Usage:
 *   flow create MyFlow --type=Record-Triggered --object=Account
 *
 * Part of Phase 4.1: CLI Wrapper Tool
 */

const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const fs = require('fs').promises;
const FlowAuthor = require('../../scripts/lib/flow-author');

async function createCommand(name, options) {
    const spinner = ora('Creating Flow...').start();

    try {
        // Validate inputs
        if (options.type === 'Record-Triggered' && !options.object) {
            spinner.fail();
            console.error(chalk.red('Error:'), 'Record-Triggered Flows require --object parameter');
            process.exit(1);
        }

        // Ensure output directory exists
        await fs.mkdir(options.output, { recursive: true });

        // Create FlowAuthor instance
        const author = new FlowAuthor(options.org, {
            verbose: options.verbose,
            workingDir: options.output
        });

        // Build config
        const config = {
            type: options.type,
            description: options.description || `${name} Flow`
        };

        if (options.object) {
            config.object = options.object;
        }

        if (options.trigger) {
            config.trigger = options.trigger;
        }

        spinner.text = `Creating ${options.type} Flow: ${name}...`;

        // Create Flow
        await author.createFlow(name, config);

        const flowPath = path.join(options.output, `${name}.flow-meta.xml`);

        spinner.succeed(chalk.green('Flow created successfully!'));

        // Display summary
        console.log('');
        console.log(chalk.bold('Flow Details:'));
        console.log(chalk.gray('  Name:'), name);
        console.log(chalk.gray('  Type:'), options.type);
        if (options.object) {
            console.log(chalk.gray('  Object:'), options.object);
        }
        if (options.trigger) {
            console.log(chalk.gray('  Trigger:'), options.trigger);
        }
        console.log(chalk.gray('  Path:'), flowPath);
        console.log('');

        console.log(chalk.blue('Next steps:'));
        console.log(`  1. Add elements: flow add "${name}" "Add a decision..."`);
        console.log(`  2. Validate: flow validate ${flowPath}`);
        console.log(`  3. Deploy: flow deploy ${flowPath} --activate`);
        console.log('');

        await author.close();

    } catch (error) {
        spinner.fail(chalk.red('Flow creation failed'));
        console.error(chalk.red('Error:'), error.message);
        if (options.verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

module.exports = createCommand;
