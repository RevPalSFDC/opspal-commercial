#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const { REPO_ROOT, collectInventory } = require('./plugin-doc-inventory');

const BASELINE_PATH = path.join(REPO_ROOT, 'docs', 'docs-lint-baseline.json');
const WARNING_CODES = {
  COMMAND_MISSING_ARGUMENT_HINT: 'COMMAND_MISSING_ARGUMENT_HINT'
};

function hasUsableDescription(description) {
  const value = (description || '').trim();
  return Boolean(value) && value !== '|' && value !== '>';
}

function parseOptions(argv) {
  return {
    updateBaseline: argv.includes('--update-baseline'),
    ignoreBaseline: argv.includes('--ignore-baseline')
  };
}

function addWarning(warnings, code, message) {
  warnings.push({ code, message });
}

function summarizeWarnings(warnings) {
  const counts = {};
  for (const warning of warnings) {
    counts[warning.code] = (counts[warning.code] || 0) + 1;
  }
  return counts;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;

  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to parse baseline file ${BASELINE_PATH}: ${error.message}`);
  }
}

function writeBaseline(warningCounts) {
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    warningLimits: warningCounts
  };

  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
}

function evaluateBaseline(warningCounts, baseline) {
  if (!baseline || !baseline.warningLimits) return [];

  const errors = [];
  for (const [code, count] of Object.entries(warningCounts)) {
    const limit = Number.isInteger(baseline.warningLimits[code])
      ? baseline.warningLimits[code]
      : 0;
    if (count > limit) {
      errors.push(`${code} warnings exceed baseline (${count} > ${limit})`);
    }
  }

  return errors;
}

function lintInventory(inventory) {
  const errors = [];
  const warnings = [];

  for (const plugin of inventory.plugins) {
    for (const agent of plugin.agents) {
      if (!agent.frontmatter) {
        errors.push(`[${plugin.name}] agent missing frontmatter: ${agent.sourcePath}`);
      }
      if (!agent.name) {
        errors.push(`[${plugin.name}] agent missing name: ${agent.sourcePath}`);
      }
      if (!hasUsableDescription(agent.description)) {
        errors.push(`[${plugin.name}] agent missing description: ${agent.sourcePath}`);
      }
    }

    for (const command of plugin.commands) {
      if (!command.frontmatter) {
        errors.push(`[${plugin.name}] command missing frontmatter: ${command.sourcePath}`);
      }
      if (!command.name) {
        errors.push(`[${plugin.name}] command missing name: ${command.sourcePath}`);
      }
      if (!hasUsableDescription(command.description)) {
        errors.push(`[${plugin.name}] command missing description: ${command.sourcePath}`);
      }
      if (!command.frontmatter?.['argument-hint']) {
        addWarning(
          warnings,
          WARNING_CODES.COMMAND_MISSING_ARGUMENT_HINT,
          `[${plugin.name}] command missing argument-hint (recommended): ${command.sourcePath}`
        );
      }
    }

    for (const skill of plugin.skills) {
      if (!skill.frontmatter) {
        errors.push(`[${plugin.name}] skill missing frontmatter: ${skill.sourcePath}`);
      }
      if (!skill.name) {
        errors.push(`[${plugin.name}] skill missing name: ${skill.sourcePath}`);
      }
      if (!hasUsableDescription(skill.description)) {
        errors.push(`[${plugin.name}] skill missing description: ${skill.sourcePath}`);
      }
    }
  }

  return { errors, warnings };
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const inventory = collectInventory();
  const { errors, warnings } = lintInventory(inventory);
  const warningCounts = summarizeWarnings(warnings);
  const baseline = options.ignoreBaseline ? null : loadBaseline();
  const baselineErrors = evaluateBaseline(warningCounts, baseline);

  if (options.updateBaseline) {
    writeBaseline(warningCounts);
  }

  console.log('Documentation Metadata Lint');
  console.log('===========================');
  console.log(`Plugins scanned: ${inventory.totals.plugins}`);
  console.log(`Agents: ${inventory.totals.agents}  Commands: ${inventory.totals.commands}  Skills: ${inventory.totals.skills}`);

  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length})`);
    const maxWarningsToPrint = 25;
    for (const warning of warnings.slice(0, maxWarningsToPrint)) {
      console.log(`- [${warning.code}] ${warning.message}`);
    }
    if (warnings.length > maxWarningsToPrint) {
      console.log(`- ... ${warnings.length - maxWarningsToPrint} more warnings`);
    }

    console.log('\nWarning counts:');
    for (const [code, count] of Object.entries(warningCounts)) {
      console.log(`- ${code}: ${count}`);
    }
  }

  if (baseline) {
    console.log(`\nBaseline: ${path.relative(REPO_ROOT, BASELINE_PATH)}`);
  }

  if (options.updateBaseline) {
    console.log(`Baseline updated: ${path.relative(REPO_ROOT, BASELINE_PATH)}`);
  }

  if (errors.length > 0) {
    console.error(`\nErrors (${errors.length})`);
    for (const error of errors.slice(0, 200)) {
      console.error(`- ${error}`);
    }
    if (errors.length > 200) {
      console.error(`- ... ${errors.length - 200} more errors`);
    }
    process.exit(1);
  }

  if (baselineErrors.length > 0) {
    console.error(`\nBaseline violations (${baselineErrors.length})`);
    for (const baselineError of baselineErrors) {
      console.error(`- ${baselineError}`);
    }
    console.error('Update baseline intentionally: npm run docs:lint:baseline');
    process.exit(1);
  }

  console.log('\nLint passed.');
}

main();
