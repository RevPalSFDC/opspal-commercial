#!/usr/bin/env node

/**
 * Command Frontmatter Validator
 *
 * Validates that all slash command files have proper YAML frontmatter
 * with required fields (description, argument-hint where applicable).
 *
 * Usage:
 *   node command-frontmatter-validator.js [--fix] [--plugin <name>]
 *
 * Options:
 *   --fix         Attempt to auto-fix missing frontmatter (interactive)
 *   --plugin      Validate only specific plugin
 *   --verbose     Show detailed output
 *   --json        Output results as JSON
 *
 * Exit codes:
 *   0 - All commands valid
 *   1 - Validation errors found
 *   2 - Script error
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configuration
const PLUGINS_DIR = path.resolve(__dirname, '../../../');
const REQUIRED_FIELDS = ['description'];
const RECOMMENDED_FIELDS = ['argument-hint'];

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    fix: args.includes('--fix'),
    verbose: args.includes('--verbose'),
    json: args.includes('--json'),
    plugin: args.includes('--plugin') ? args[args.indexOf('--plugin') + 1] : null,
    help: args.includes('--help') || args.includes('-h')
  };
}

/**
 * Find all command files
 */
function findCommandFiles(pluginsDir, specificPlugin = null) {
  const commands = [];

  const plugins = specificPlugin
    ? [specificPlugin]
    : fs.readdirSync(pluginsDir).filter(f => {
        const pluginPath = path.join(pluginsDir, f);
        return fs.statSync(pluginPath).isDirectory() &&
               f.endsWith('-plugin') &&
               fs.existsSync(path.join(pluginPath, 'commands'));
      });

  for (const plugin of plugins) {
    const commandsDir = path.join(pluginsDir, plugin, 'commands');
    if (!fs.existsSync(commandsDir)) continue;

    const files = fs.readdirSync(commandsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => ({
        plugin,
        file: f,
        path: path.join(commandsDir, f)
      }));

    commands.push(...files);
  }

  return commands;
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content) {
  const lines = content.split('\n');

  // Check for opening ---
  if (lines[0].trim() !== '---') {
    return { hasFrontmatter: false, fields: {}, endLine: 0 };
  }

  // Find closing ---
  let endLine = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endLine = i;
      break;
    }
  }

  if (endLine === -1) {
    return { hasFrontmatter: false, fields: {}, endLine: 0 };
  }

  // Parse fields
  const fields = {};
  for (let i = 1; i < endLine; i++) {
    const line = lines[i];
    const match = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      // Handle quoted strings
      fields[key] = value.replace(/^["']|["']$/g, '').trim();
    }
  }

  return { hasFrontmatter: true, fields, endLine };
}

/**
 * Validate a single command file
 */
function validateCommand(commandInfo) {
  const content = fs.readFileSync(commandInfo.path, 'utf8');
  const { hasFrontmatter, fields } = parseFrontmatter(content);

  const issues = [];
  const warnings = [];

  // Check frontmatter exists
  if (!hasFrontmatter) {
    issues.push('Missing YAML frontmatter');
    return { valid: false, issues, warnings, fields: {} };
  }

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!fields[field] || fields[field].trim() === '') {
      issues.push(`Missing required field: ${field}`);
    }
  }

  // Check description length
  if (fields.description && fields.description.length > 120) {
    warnings.push(`Description exceeds 120 characters (${fields.description.length})`);
  }

  // Check for argument-hint if command appears to accept arguments
  const commandName = path.basename(commandInfo.file, '.md');
  const contentLower = content.toLowerCase();
  const hasArguments = contentLower.includes('--') ||
                       contentLower.includes('argument') ||
                       contentLower.includes('parameter') ||
                       contentLower.includes('option');

  if (hasArguments && !fields['argument-hint']) {
    warnings.push('Command appears to accept arguments but has no argument-hint');
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    fields
  };
}

/**
 * Generate suggested frontmatter for a command
 */
function suggestFrontmatter(commandInfo, content) {
  const commandName = path.basename(commandInfo.file, '.md');

  // Try to extract description from content
  let description = '';
  const lines = content.split('\n');

  // Look for first heading or meaningful paragraph
  for (const line of lines) {
    if (line.startsWith('# ')) {
      // Skip file title, look for description below
      continue;
    }
    if (line.match(/^[A-Z]/) && line.length > 20 && line.length < 150) {
      description = line.trim();
      break;
    }
  }

  if (!description) {
    description = `Execute ${commandName.replace(/-/g, ' ')} operation`;
  }

  // Truncate if too long
  if (description.length > 120) {
    description = description.substring(0, 117) + '...';
  }

  return {
    description,
    'argument-hint': ''
  };
}

/**
 * Main validation function
 */
async function main() {
  const args = parseArgs();

  if (args.help) {
    console.log(`
Command Frontmatter Validator

Validates that all slash command files have proper YAML frontmatter.

Usage:
  node command-frontmatter-validator.js [options]

Options:
  --fix         Attempt to auto-fix missing frontmatter
  --plugin <n>  Validate only specific plugin
  --verbose     Show detailed output
  --json        Output results as JSON
  --help        Show this help message

Examples:
  node command-frontmatter-validator.js
  node command-frontmatter-validator.js --plugin salesforce-plugin
  node command-frontmatter-validator.js --fix --verbose
`);
    process.exit(0);
  }

  const commands = findCommandFiles(PLUGINS_DIR, args.plugin);

  if (commands.length === 0) {
    console.log('No command files found');
    process.exit(0);
  }

  const results = {
    total: commands.length,
    valid: 0,
    invalid: 0,
    warnings: 0,
    details: []
  };

  for (const command of commands) {
    const validation = validateCommand(command);

    const detail = {
      plugin: command.plugin,
      file: command.file,
      valid: validation.valid,
      issues: validation.issues,
      warnings: validation.warnings,
      fields: validation.fields
    };

    results.details.push(detail);

    if (validation.valid) {
      results.valid++;
    } else {
      results.invalid++;
    }

    if (validation.warnings.length > 0) {
      results.warnings++;
    }
  }

  // Output results
  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log('\n=== Command Frontmatter Validation ===\n');
    console.log(`Total commands: ${results.total}`);
    console.log(`Valid: ${results.valid}`);
    console.log(`Invalid: ${results.invalid}`);
    console.log(`With warnings: ${results.warnings}`);
    console.log('');

    // Group by plugin
    const byPlugin = {};
    for (const detail of results.details) {
      if (!byPlugin[detail.plugin]) {
        byPlugin[detail.plugin] = { valid: [], invalid: [], warnings: [] };
      }

      if (!detail.valid) {
        byPlugin[detail.plugin].invalid.push(detail);
      } else if (detail.warnings.length > 0) {
        byPlugin[detail.plugin].warnings.push(detail);
      } else {
        byPlugin[detail.plugin].valid.push(detail);
      }
    }

    // Show invalid first
    const hasIssues = results.details.filter(d => !d.valid || d.warnings.length > 0);

    if (hasIssues.length > 0) {
      console.log('--- Issues Found ---\n');

      for (const [plugin, data] of Object.entries(byPlugin)) {
        const issues = [...data.invalid, ...data.warnings];
        if (issues.length === 0) continue;

        console.log(`${plugin}/`);

        for (const detail of issues) {
          const status = detail.valid ? 'WARN' : 'FAIL';
          console.log(`  [${status}] ${detail.file}`);

          for (const issue of detail.issues) {
            console.log(`         - ${issue}`);
          }
          for (const warning of detail.warnings) {
            console.log(`         - (warning) ${warning}`);
          }
        }
        console.log('');
      }
    }

    if (args.verbose) {
      console.log('--- Valid Commands ---\n');

      for (const [plugin, data] of Object.entries(byPlugin)) {
        if (data.valid.length === 0) continue;

        console.log(`${plugin}/`);
        for (const detail of data.valid) {
          console.log(`  [OK] ${detail.file}`);
          if (detail.fields.description) {
            console.log(`       desc: "${detail.fields.description.substring(0, 50)}..."`);
          }
        }
        console.log('');
      }
    }

    // Summary
    console.log('--- Summary ---');
    if (results.invalid === 0 && results.warnings === 0) {
      console.log('\nAll commands have valid frontmatter.');
    } else {
      console.log(`\nFound ${results.invalid} invalid and ${results.warnings} with warnings.`);
      console.log('Run with --fix to attempt automatic fixes.');
    }
  }

  // Exit with appropriate code
  process.exit(results.invalid > 0 ? 1 : 0);
}

// Run
main().catch(err => {
  console.error('Error:', err.message);
  process.exit(2);
});

module.exports = {
  findCommandFiles,
  parseFrontmatter,
  validateCommand,
  suggestFrontmatter
};
