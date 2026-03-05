/**
 * Template Commands - Manage Flow templates
 *
 * Usage:
 *   flow template list
 *   flow template apply lead-assignment --name MyLeadFlow
 *   flow template show opportunity-validation
 *   flow template create MyTemplate --flow MyFlow.xml
 *
 * Part of Phase 4.1: CLI Wrapper Tool
 */

const chalk = require('chalk');
const ora = require('ora');
const Table = require('cli-table3');
const path = require('path');
const fs = require('fs').promises;
const FlowAuthor = require('../../scripts/lib/flow-author');

// Template registry will be loaded dynamically
let TemplateRegistry;

async function loadTemplateRegistry() {
    if (!TemplateRegistry) {
        const registryModule = require('../../templates');
        TemplateRegistry = registryModule.TemplateRegistry;
    }
    return TemplateRegistry;
}

/**
 * List available templates
 */
async function list(options) {
    const spinner = ora('Loading templates...').start();

    try {
        const Registry = await loadTemplateRegistry();
        const registry = new Registry();
        const templates = registry.getAllTemplates();

        spinner.stop();

        if (options.output === 'json') {
            console.log(JSON.stringify(templates, null, 2));
            return;
        }

        // Filter by category if specified
        const filtered = options.category
            ? templates.filter(t => t.category === options.category)
            : templates;

        if (filtered.length === 0) {
            console.log(chalk.yellow('No templates found matching criteria'));
            return;
        }

        // Display as table
        const table = new Table({
            head: [chalk.cyan('Name'), chalk.cyan('Category'), chalk.cyan('Description'), chalk.cyan('Params')],
            colWidths: [25, 15, 40, 15]
        });

        filtered.forEach(template => {
            const paramCount = Object.keys(template.parameters || {}).length;
            table.push([
                template.name,
                template.category,
                template.description,
                `${paramCount} params`
            ]);
        });

        console.log('');
        console.log(chalk.bold('Available Flow Templates:'));
        console.log(table.toString());
        console.log('');
        console.log(chalk.blue('Usage:'), `flow template apply <name> --name <FlowName>`);
        console.log(chalk.blue('Details:'), `flow template show <name>`);
        console.log('');

    } catch (error) {
        spinner.fail(chalk.red('Failed to load templates'));
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
    }
}

/**
 * Apply template to create new Flow
 */
async function apply(templateName, options) {
    if (!options.name) {
        console.error(chalk.red('Error:'), 'Flow name is required (--name parameter)');
        console.log('Usage: flow template apply <template> --name <FlowName>');
        process.exit(1);
    }

    const spinner = ora(`Applying template: ${templateName}...`).start();

    try {
        // Load template registry
        const Registry = await loadTemplateRegistry();
        const registry = new Registry();

        // Get template
        const template = registry.getTemplate(templateName);
        if (!template) {
            spinner.fail();
            console.error(chalk.red('Error:'), `Template "${templateName}" not found`);
            console.log('');
            console.log(chalk.blue('Available templates:'));
            const templates = registry.getAllTemplates();
            templates.forEach(t => console.log(`  - ${t.name}`));
            process.exit(1);
        }

        // Parse parameters
        let params = {};
        if (options.params) {
            try {
                params = JSON.parse(options.params);
            } catch {
                // Parse key=value format
                const pairs = options.params.split(',');
                pairs.forEach(pair => {
                    const [key, value] = pair.split('=').map(s => s.trim());
                    params[key] = value;
                });
            }
        }

        // Validate required parameters
        const missingParams = [];
        Object.entries(template.parameters || {}).forEach(([key, config]) => {
            if (config.required && !params[key]) {
                missingParams.push(key);
            }
        });

        if (missingParams.length > 0) {
            spinner.fail();
            console.error(chalk.red('Error:'), 'Missing required parameters:');
            missingParams.forEach(param => {
                const config = template.parameters[param];
                console.log(`  - ${param}: ${config.description}`);
            });
            process.exit(1);
        }

        spinner.text = `Creating Flow from template: ${templateName}...`;

        // Create Flow from template
        const author = new FlowAuthor(options.org, {
            verbose: options.verbose,
            workingDir: options.output
        });

        const flowPath = await registry.applyTemplate(templateName, options.name, params, {
            author,
            outputDir: options.output
        });

        spinner.succeed(chalk.green('✓ Flow created from template!'));

        // Display summary
        console.log('');
        console.log(chalk.bold('Flow Details:'));
        console.log(chalk.gray('  Template:'), templateName);
        console.log(chalk.gray('  Flow Name:'), options.name);
        console.log(chalk.gray('  Path:'), flowPath);
        console.log(chalk.gray('  Parameters:'), JSON.stringify(params, null, 2));
        console.log('');

        console.log(chalk.blue('Next steps:'));
        console.log(`  1. Review Flow: cat ${flowPath}`);
        console.log(`  2. Validate: flow validate ${flowPath}`);
        console.log(`  3. Deploy: flow deploy ${flowPath} --activate`);
        console.log('');

        await author.close();

    } catch (error) {
        spinner.fail(chalk.red('Template application failed'));
        console.error(chalk.red('Error:'), error.message);
        if (options.verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

/**
 * Show template details
 */
async function show(templateName, options) {
    const spinner = ora(`Loading template: ${templateName}...`).start();

    try {
        const Registry = await loadTemplateRegistry();
        const registry = new Registry();

        const template = registry.getTemplate(templateName);
        if (!template) {
            spinner.fail();
            console.error(chalk.red('Error:'), `Template "${templateName}" not found`);
            process.exit(1);
        }

        spinner.stop();

        if (options.output === 'json') {
            console.log(JSON.stringify(template, null, 2));
            return;
        }

        // Display template details
        console.log('');
        console.log(chalk.bold.cyan(`Template: ${template.name}`));
        console.log('');
        console.log(chalk.bold('Description:'));
        console.log(`  ${template.description}`);
        console.log('');
        console.log(chalk.bold('Category:'), template.category);
        console.log(chalk.bold('Flow Type:'), template.type);
        console.log('');

        if (template.parameters && Object.keys(template.parameters).length > 0) {
            console.log(chalk.bold('Parameters:'));
            Object.entries(template.parameters).forEach(([key, config]) => {
                const required = config.required ? chalk.red('*required') : chalk.gray('optional');
                console.log(`  ${chalk.cyan(key)} (${config.type}) ${required}`);
                console.log(`    ${config.description}`);
                if (config.default) {
                    console.log(chalk.gray(`    Default: ${config.default}`));
                }
            });
            console.log('');
        }

        console.log(chalk.bold('Usage Example:'));
        const exampleParams = Object.entries(template.parameters || {})
            .filter(([_, config]) => config.required)
            .map(([key, config]) => `${key}=${config.example || 'value'}`)
            .join(',');
        const paramsFlag = exampleParams ? ` --params "${exampleParams}"` : '';
        console.log(chalk.gray(`  flow template apply ${template.name} --name MyFlow${paramsFlag}`));
        console.log('');

    } catch (error) {
        spinner.fail(chalk.red('Failed to load template'));
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
    }
}

/**
 * Create custom template from existing Flow
 */
async function create(templateName, options) {
    if (!options.flow) {
        console.error(chalk.red('Error:'), 'Flow path is required (--flow parameter)');
        console.log('Usage: flow template create <name> --flow <path>');
        process.exit(1);
    }

    const spinner = ora(`Creating template: ${templateName}...`).start();

    try {
        const Registry = await loadTemplateRegistry();
        const registry = new Registry();

        // Read the Flow file
        const flowContent = await fs.readFile(options.flow, 'utf-8');

        // Create template object
        const template = {
            name: templateName,
            description: options.description || `Custom template: ${templateName}`,
            category: options.category || 'custom',
            type: 'custom',
            source: flowContent,
            parameters: {},
            createdAt: new Date().toISOString()
        };

        // Save template
        const templatesDir = path.join(__dirname, '../../templates/custom');
        await fs.mkdir(templatesDir, { recursive: true });

        const templatePath = path.join(templatesDir, `${templateName}.json`);
        await fs.writeFile(templatePath, JSON.stringify(template, null, 2));

        spinner.succeed(chalk.green('✓ Template created successfully!'));

        console.log('');
        console.log(chalk.bold('Template Details:'));
        console.log(chalk.gray('  Name:'), templateName);
        console.log(chalk.gray('  Category:'), template.category);
        console.log(chalk.gray('  Path:'), templatePath);
        console.log('');

        console.log(chalk.blue('Next steps:'));
        console.log(`  1. Edit template to add parameters: ${templatePath}`);
        console.log(`  2. Test template: flow template apply ${templateName} --name TestFlow`);
        console.log('');

    } catch (error) {
        spinner.fail(chalk.red('Template creation failed'));
        console.error(chalk.red('Error:'), error.message);
        if (options.verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

module.exports = {
    list,
    apply,
    show,
    create
};
