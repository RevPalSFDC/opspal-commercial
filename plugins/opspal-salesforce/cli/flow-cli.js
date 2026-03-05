#!/usr/bin/env node

/**
 * Flow CLI - Command-line interface for Salesforce Flow authoring
 *
 * Usage:
 *   flow create <name> --type=<type> --object=<object>
 *   flow add "<instruction>"
 *   flow validate
 *   flow deploy --activate
 *   flow template list
 *   flow template apply <name>
 *   flow batch deploy ./flows/*.xml
 *   flow runbook [topic]  # Quick access to development runbooks (NEW v3.42.0)
 *
 * Part of Phase 4.1: CLI Wrapper Tool
 *
 * @see Flow XML Development Runbooks (v3.42.0):
 * Use `flow runbook` or `--help-runbook` flag for context-specific guidance
 * Location: docs/runbooks/flow-xml-development/
 */

const { program } = require('commander');
const chalk = require('chalk');
const path = require('path');

// Import command handlers
const createCommand = require('./commands/create');
const modifyCommand = require('./commands/modify');
const validateCommand = require('./commands/validate');
const deployCommand = require('./commands/deploy');
const templateCommand = require('./commands/template');
const batchCommand = require('./commands/batch');

// CLI version from package.json
const pkg = require('../package.json');

program
  .name('flow')
  .description('Salesforce Flow authoring CLI - Create, modify, validate, and deploy Flows')
  .version(pkg.version);

// ======================
// CREATE COMMAND
// ======================
program
  .command('create <name>')
  .description('Create a new Flow')
  .option('-t, --type <type>', 'Flow type (Record-Triggered, Screen, Auto-Launched)', 'AutoLaunchedFlow')
  .option('-o, --object <object>', 'Salesforce object (for Record-Triggered Flows)')
  .option('-r, --trigger <trigger>', 'Trigger type (Before Save, After Save, etc.)')
  .option('-d, --description <desc>', 'Flow description')
  .option('--org <alias>', 'Salesforce org alias', process.env.SF_ORG_ALIAS || 'default')
  .option('--output <dir>', 'Output directory', './flows')
  .option('--verbose', 'Verbose output')
  .option('--help-runbook', 'Show relevant runbook guidance (Runbook 1: Authoring Flows)')
  .action(createCommand);

// ======================
// ADD/MODIFY COMMANDS
// ======================
program
  .command('add <instruction>')
  .description('Add element to Flow using natural language')
  .option('-f, --flow <path>', 'Path to Flow file', './flow.flow-meta.xml')
  .option('--org <alias>', 'Salesforce org alias', process.env.SF_ORG_ALIAS || 'default')
  .option('--verbose', 'Verbose output')
  .action(modifyCommand.add);

program
  .command('remove <elementName>')
  .description('Remove element from Flow')
  .option('-f, --flow <path>', 'Path to Flow file', './flow.flow-meta.xml')
  .option('--org <alias>', 'Salesforce org alias', process.env.SF_ORG_ALIAS || 'default')
  .option('--verbose', 'Verbose output')
  .action(modifyCommand.remove);

program
  .command('modify <elementName>')
  .description('Modify element in Flow')
  .option('-f, --flow <path>', 'Path to Flow file', './flow.flow-meta.xml')
  .option('-c, --change <changes>', 'Changes to apply (JSON or key=value format)')
  .option('--org <alias>', 'Salesforce org alias', process.env.SF_ORG_ALIAS || 'default')
  .option('--verbose', 'Verbose output')
  .action(modifyCommand.modify);

// ======================
// VALIDATE COMMAND
// ======================
program
  .command('validate [flowPath]')
  .description('Validate Flow(s)')
  .option('--org <alias>', 'Salesforce org alias', process.env.SF_ORG_ALIAS || 'default')
  .option('--best-practices', 'Include best practices check')
  .option('--governor-limits', 'Include governor limits check')
  .option('--output <format>', 'Output format (json, table, verbose)', 'table')
  .option('--verbose', 'Verbose output')
  .option('--help-runbook', 'Show relevant runbook guidance (Runbook 4: Validation & Best Practices)')
  .action(validateCommand);

// ======================
// DEPLOY COMMAND
// ======================
program
  .command('deploy [flowPath]')
  .description('Deploy Flow to Salesforce org')
  .option('--org <alias>', 'Salesforce org alias', process.env.SF_ORG_ALIAS || 'default')
  .option('--activate', 'Activate Flow after deployment')
  .option('--test', 'Run tests before deployment')
  .option('--no-escalate', 'Skip permission escalation')
  .option('--dry-run', 'Simulate deployment without making changes')
  .option('--verbose', 'Verbose output')
  .option('--help-runbook', 'Show relevant runbook guidance (Runbook 5: Testing & Deployment)')
  .action(deployCommand);

// ======================
// TEMPLATE COMMANDS
// ======================
const templateCmd = program
  .command('template')
  .description('Work with Flow templates');

templateCmd
  .command('list')
  .description('List available templates')
  .option('-c, --category <category>', 'Filter by category (core, industry, custom)')
  .option('--output <format>', 'Output format (json, table)', 'table')
  .action(templateCommand.list);

templateCmd
  .command('apply <templateName>')
  .description('Apply template to create new Flow')
  .option('-n, --name <name>', 'Flow name (required)')
  .option('-p, --params <params>', 'Template parameters (JSON or key=value format)')
  .option('--org <alias>', 'Salesforce org alias', process.env.SF_ORG_ALIAS || 'default')
  .option('--output <dir>', 'Output directory', './flows')
  .option('--verbose', 'Verbose output')
  .action(templateCommand.apply);

templateCmd
  .command('show <templateName>')
  .description('Show template details')
  .option('--output <format>', 'Output format (json, yaml)', 'yaml')
  .action(templateCommand.show);

templateCmd
  .command('create <templateName>')
  .description('Create new custom template from existing Flow')
  .option('-f, --flow <path>', 'Path to Flow file')
  .option('-d, --description <desc>', 'Template description')
  .option('-c, --category <category>', 'Template category', 'custom')
  .action(templateCommand.create);

// ======================
// BATCH COMMANDS
// ======================
const batchCmd = program
  .command('batch')
  .description('Perform operations on multiple Flows');

batchCmd
  .command('validate <pattern>')
  .description('Validate multiple Flows')
  .option('--org <alias>', 'Salesforce org alias', process.env.SF_ORG_ALIAS || 'default')
  .option('--parallel <n>', 'Number of parallel operations', '5')
  .option('--output <format>', 'Output format (json, table, summary)', 'summary')
  .option('--verbose', 'Verbose output')
  .action(batchCommand.validate);

batchCmd
  .command('deploy <pattern>')
  .description('Deploy multiple Flows')
  .option('--org <alias>', 'Salesforce org alias', process.env.SF_ORG_ALIAS || 'default')
  .option('--activate', 'Activate Flows after deployment')
  .option('--parallel <n>', 'Number of parallel deployments', '5')
  .option('--dry-run', 'Simulate deployment without making changes')
  .option('--continue-on-error', 'Continue deploying even if some fail')
  .option('--verbose', 'Verbose output')
  .action(batchCommand.deploy);

batchCmd
  .command('modify <pattern>')
  .description('Apply same modification to multiple Flows')
  .option('-i, --instruction <instruction>', 'Modification instruction')
  .option('--org <alias>', 'Salesforce org alias', process.env.SF_ORG_ALIAS || 'default')
  .option('--dry-run', 'Simulate without making changes')
  .option('--verbose', 'Verbose output')
  .action(batchCommand.modify);

// ======================
// DOCUMENTATION COMMANDS
// ======================
program
  .command('docs <flowPath>')
  .description('Generate Flow documentation')
  .option('--output <format>', 'Output format (markdown, html, pdf)', 'markdown')
  .option('--file <path>', 'Output file path')
  .option('--verbose', 'Verbose output')
  .action(async (flowPath, options) => {
    const FlowAuthor = require('../scripts/lib/flow-author');
    const fs = require('fs').promises;

    try {
      console.log(chalk.blue('Generating documentation for:'), flowPath);

      const author = new FlowAuthor(options.org || 'default', { verbose: options.verbose });
      await author.loadFlow(flowPath);

      const docs = await author.generateDocumentation();

      if (options.file) {
        await fs.writeFile(options.file, docs);
        console.log(chalk.green('✓'), 'Documentation saved to:', options.file);
      } else {
        console.log('\n' + docs);
      }

      await author.close();
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// ======================
// DIFF COMMAND
// ======================
program
  .command('diff <flow1> <flow2>')
  .description('Compare two Flows')
  .option('--output <format>', 'Output format (json, table, verbose)', 'verbose')
  .option('--verbose', 'Verbose output')
  .action(async (flow1, flow2, options) => {
    const FlowDiffChecker = require('../scripts/lib/flow-diff-checker');
    const chalk = require('chalk');

    try {
      console.log(chalk.blue('Comparing Flows:'));
      console.log('  Original:', flow1);
      console.log('  Modified:', flow2);
      console.log('');

      const differ = new FlowDiffChecker();
      const diff = await differ.compare(flow1, flow2);

      // Display summary
      console.log(chalk.bold('Summary:'));
      console.log(chalk.gray('  Risk Level:'), diff.riskLevel);
      console.log(chalk.gray('  Elements Added:'), diff.elementsAdded.length);
      console.log(chalk.gray('  Elements Removed:'), diff.elementsRemoved.length);
      console.log(chalk.gray('  Elements Modified:'), diff.elementsModified.length);
      console.log(chalk.gray('  Connectors Changed:'), diff.connectorsChanged.length);
      console.log('');

      if (options.output === 'json') {
        console.log(JSON.stringify(diff, null, 2));
      } else if (options.output === 'verbose') {
        if (diff.elementsAdded.length > 0) {
          console.log(chalk.green('Added Elements:'));
          diff.elementsAdded.forEach(el => console.log('  +', el.name, `(${el.elementType})`));
          console.log('');
        }

        if (diff.elementsRemoved.length > 0) {
          console.log(chalk.red('Removed Elements:'));
          diff.elementsRemoved.forEach(el => console.log('  -', el.name, `(${el.elementType})`));
          console.log('');
        }

        if (diff.elementsModified.length > 0) {
          console.log(chalk.yellow('Modified Elements:'));
          diff.elementsModified.forEach(el => console.log('  ~', el.name, `(${el.elementType})`));
          console.log('');
        }
      }

    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// ======================
// INTERACTIVE MODE
// ======================
program
  .command('interactive')
  .description('Launch interactive Flow authoring session')
  .option('--org <alias>', 'Salesforce org alias', process.env.SF_ORG_ALIAS || 'default')
  .action(async (options) => {
    const inquirer = require('inquirer');
    const chalk = require('chalk');

    console.log(chalk.bold.blue('\nSalesforce Flow Interactive Authoring\n'));

    // TODO: Implement interactive mode with prompts
    console.log('Interactive mode coming soon!');
    console.log('This will provide a guided, step-by-step Flow creation experience.\n');
  });

// ======================
// RUNBOOK COMMAND (NEW v3.42.0)
// ======================
program
  .command('runbook [topic]')
  .description('Quick access to Flow XML Development Runbooks')
  .option('-l, --list', 'List all available runbooks')
  .option('-s, --search <keyword>', 'Search runbooks by keyword')
  .option('-n, --number <n>', 'Show specific runbook by number (1-6)')
  .option('--toc', 'Show table of contents only')
  .action(async (topic, options) => {
    const fs = require('fs').promises;
    const chalk = require('chalk');

    const runbookDir = path.join(__dirname, '../docs/runbooks/flow-xml-development');

    const runbooks = {
      1: { file: '01-authoring-flows-via-xml.md', title: 'Authoring Flows via XML', keywords: ['create', 'author', 'scaffold', 'new', 'xml', 'structure'] },
      2: { file: '02-designing-flows-for-project-scenarios.md', title: 'Designing Flows for Project Scenarios', keywords: ['design', 'pattern', 'scenario', 'business', 'use-case', 'template-selection'] },
      3: { file: '03-tools-and-techniques.md', title: 'Tools and Techniques', keywords: ['tools', 'technique', 'method', 'nlp', 'template', 'api', 'cli'] },
      4: { file: '04-validation-and-best-practices.md', title: 'Validation and Best Practices', keywords: ['validate', 'validation', 'best-practice', 'quality', 'check', 'lint'] },
      5: { file: '05-testing-and-deployment.md', title: 'Testing and Deployment', keywords: ['test', 'deploy', 'deployment', 'rollback', 'strategy', 'production'] },
      6: { file: '06-monitoring-maintenance-rollback.md', title: 'Monitoring, Maintenance, and Rollback', keywords: ['monitor', 'monitoring', 'maintenance', 'rollback', 'performance', 'optimize'] }
    };

    try {
      // List all runbooks
      if (options.list || (!topic && !options.number && !options.search)) {
        console.log(chalk.bold.blue('\n📚 Flow XML Development Runbooks (v3.42.0)\n'));
        console.log(chalk.gray('Location:'), runbookDir + '/\n');

        for (const [num, rb] of Object.entries(runbooks)) {
          console.log(chalk.bold(`  ${num}. ${rb.title}`));
          console.log(chalk.gray(`     Keywords: ${rb.keywords.join(', ')}`));
          console.log(chalk.gray(`     File: ${rb.file}\n`));
        }

        console.log(chalk.cyan('\nUsage:'));
        console.log('  flow runbook <number>         # Show specific runbook (e.g., flow runbook 1)');
        console.log('  flow runbook <topic>          # Show runbook by keyword (e.g., flow runbook validation)');
        console.log('  flow runbook --search <term>  # Search across all runbooks');
        console.log('  flow runbook --toc            # Show table of contents\n');
        return;
      }

      // Search runbooks
      if (options.search) {
        const keyword = options.search.toLowerCase();
        console.log(chalk.bold.blue(`\n🔍 Searching runbooks for: "${keyword}"\n`));

        let found = false;
        for (const [num, rb] of Object.entries(runbooks)) {
          if (rb.keywords.some(k => k.includes(keyword)) || rb.title.toLowerCase().includes(keyword)) {
            console.log(chalk.bold(`  ${num}. ${rb.title}`));
            console.log(chalk.gray(`     Matches: ${rb.keywords.filter(k => k.includes(keyword)).join(', ')}\n`));
            found = true;
          }
        }

        if (!found) {
          console.log(chalk.yellow('  No matching runbooks found.'));
          console.log(chalk.gray('  Try: flow runbook --list\n'));
        }
        return;
      }

      // Get runbook by number
      let runbookNum = options.number || null;

      // Or by topic keyword
      if (topic && !runbookNum) {
        const topicLower = topic.toLowerCase();
        for (const [num, rb] of Object.entries(runbooks)) {
          if (rb.keywords.includes(topicLower) || rb.title.toLowerCase().includes(topicLower)) {
            runbookNum = num;
            break;
          }
        }

        if (!runbookNum) {
          console.log(chalk.yellow(`\nNo runbook found for topic: "${topic}"`));
          console.log(chalk.gray('Try: flow runbook --list\n'));
          return;
        }
      }

      if (!runbookNum) {
        console.log(chalk.red('\nError: Please specify a runbook number or topic'));
        console.log(chalk.gray('Try: flow runbook --list\n'));
        return;
      }

      const runbook = runbooks[runbookNum];
      if (!runbook) {
        console.log(chalk.red(`\nError: Runbook ${runbookNum} not found (valid: 1-6)`));
        return;
      }

      const runbookPath = path.join(runbookDir, runbook.file);
      const content = await fs.readFile(runbookPath, 'utf8');

      // Show table of contents only
      if (options.toc) {
        console.log(chalk.bold.blue(`\n📖 Runbook ${runbookNum}: ${runbook.title}\n`));
        console.log(chalk.gray('Table of Contents:\n'));

        const lines = content.split('\n');
        lines.forEach(line => {
          if (line.startsWith('## ')) {
            console.log(chalk.bold('  ' + line.substring(3)));
          } else if (line.startsWith('### ')) {
            console.log(chalk.gray('    ' + line.substring(4)));
          }
        });
        console.log('');
        return;
      }

      // Show full runbook
      console.log(chalk.bold.blue(`\n📖 Runbook ${runbookNum}: ${runbook.title}\n`));
      console.log(chalk.gray(`File: ${runbook.file}`));
      console.log(chalk.gray(`Location: ${runbookPath}\n`));
      console.log(chalk.dim('─'.repeat(80)) + '\n');

      // Display content with syntax highlighting
      const lines = content.split('\n');
      lines.forEach(line => {
        if (line.startsWith('# ')) {
          console.log(chalk.bold.blue(line));
        } else if (line.startsWith('## ')) {
          console.log(chalk.bold.cyan(line));
        } else if (line.startsWith('### ')) {
          console.log(chalk.bold(line));
        } else if (line.startsWith('```')) {
          console.log(chalk.gray(line));
        } else if (line.includes('**') || line.includes('*')) {
          console.log(line.replace(/\*\*(.*?)\*\*/g, chalk.bold('$1')));
        } else {
          console.log(line);
        }
      });

      console.log('\n' + chalk.dim('─'.repeat(80)));
      console.log(chalk.cyan('\n💡 Tip: Use --toc flag to see table of contents'));
      console.log(chalk.gray('     flow runbook ' + runbookNum + ' --toc\n'));

    } catch (error) {
      if (error.code === 'ENOENT') {
        console.error(chalk.red('\nError: Runbook file not found'));
        console.error(chalk.gray('Expected location:'), runbookDir);
        console.error(chalk.gray('Run from plugin root directory or install runbooks.\n'));
      } else {
        console.error(chalk.red('Error:'), error.message);
      }
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse(process.argv);

// If no command specified, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
