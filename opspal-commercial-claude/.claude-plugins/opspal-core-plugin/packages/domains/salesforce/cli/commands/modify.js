/**
 * Modify Commands - Add, Remove, Modify elements
 *
 * Usage:
 *   flow add "Add a decision called Amount_Check..."
 *   flow remove MyElement
 *   flow modify MyElement --change="label=New Label"
 *
 * Part of Phase 4.1: CLI Wrapper Tool
 */

const chalk = require('chalk');
const ora = require('ora');
const FlowAuthor = require('../../scripts/lib/flow-author');

async function add(instruction, options) {
    const spinner = ora('Adding element...').start();

    try {
        const author = new FlowAuthor(options.org, { verbose: options.verbose });

        await author.loadFlow(options.flow);

        spinner.text = 'Parsing instruction...';
        await author.addElement(instruction);

        spinner.succeed(chalk.green('Element added successfully!'));

        console.log('');
        console.log(chalk.gray('  Instruction:'), instruction);
        console.log(chalk.gray('  Flow:'), options.flow);
        console.log('');

        await author.close();

    } catch (error) {
        spinner.fail(chalk.red('Failed to add element'));
        console.error(chalk.red('Error:'), error.message);
        if (options.verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

async function remove(elementName, options) {
    const spinner = ora(`Removing element: ${elementName}...`).start();

    try {
        const author = new FlowAuthor(options.org, { verbose: options.verbose });

        await author.loadFlow(options.flow);

        await author.removeElement(elementName);

        spinner.succeed(chalk.green('Element removed successfully!'));

        console.log('');
        console.log(chalk.gray('  Element:'), elementName);
        console.log(chalk.gray('  Flow:'), options.flow);
        console.log('');

        await author.close();

    } catch (error) {
        spinner.fail(chalk.red('Failed to remove element'));
        console.error(chalk.red('Error:'), error.message);
        if (options.verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

async function modify(elementName, options) {
    const spinner = ora(`Modifying element: ${elementName}...`).start();

    try {
        const author = new FlowAuthor(options.org, { verbose: options.verbose });

        await author.loadFlow(options.flow);

        // Parse changes
        let changes = {};
        if (options.change) {
            try {
                // Try JSON first
                changes = JSON.parse(options.change);
            } catch {
                // Parse key=value format
                const pairs = options.change.split(',');
                pairs.forEach(pair => {
                    const [key, value] = pair.split('=').map(s => s.trim());
                    changes[key] = value;
                });
            }
        }

        await author.modifyElement(elementName, changes);

        spinner.succeed(chalk.green('Element modified successfully!'));

        console.log('');
        console.log(chalk.gray('  Element:'), elementName);
        console.log(chalk.gray('  Changes:'), JSON.stringify(changes, null, 2));
        console.log(chalk.gray('  Flow:'), options.flow);
        console.log('');

        await author.close();

    } catch (error) {
        spinner.fail(chalk.red('Failed to modify element'));
        console.error(chalk.red('Error:'), error.message);
        if (options.verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

module.exports = {
    add,
    remove,
    modify
};
