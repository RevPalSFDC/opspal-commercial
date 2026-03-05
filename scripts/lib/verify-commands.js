#!/usr/bin/env node

'use strict';

const { collectInventory, commandDisplayName, isRedirectOrDeprecatedDescription } = require('./plugin-doc-inventory');

function main() {
  const inventory = collectInventory();
  const groups = new Map();

  for (const plugin of inventory.plugins) {
    for (const command of plugin.commands) {
      const commandName = commandDisplayName(command.name);
      if (!groups.has(commandName)) {
        groups.set(commandName, []);
      }

      groups.get(commandName).push({
        plugin: plugin.name,
        pluginStatus: plugin.status,
        sourcePath: command.sourcePath,
        description: command.description || ''
      });
    }
  }

  const duplicates = [];
  const errors = [];
  const warnings = [];

  for (const [commandName, entries] of groups.entries()) {
    if (entries.length < 2) continue;

    duplicates.push({ commandName, entries });

    const primaries = entries.filter((entry) => {
      if (entry.pluginStatus === 'deprecated') return false;
      if (isRedirectOrDeprecatedDescription(entry.description)) return false;
      return true;
    });

    if (primaries.length > 1) {
      errors.push(
        `${commandName} has multiple primary owners: ${primaries
          .map((entry) => `${entry.plugin} (${entry.sourcePath})`)
          .join(', ')}`
      );
    } else if (primaries.length === 0) {
      warnings.push(
        `${commandName} has no clear primary owner; all entries are redirects/deprecated`
      );
    }
  }

  console.log('Command Ownership Check');
  console.log('=======================');
  console.log(`Commands scanned: ${groups.size}`);
  console.log(`Duplicate command names: ${duplicates.length}`);

  if (duplicates.length > 0) {
    console.log('');
    for (const duplicate of duplicates) {
      console.log(`- ${duplicate.commandName}`);
      for (const entry of duplicate.entries) {
        const marker = entry.pluginStatus === 'deprecated' || isRedirectOrDeprecatedDescription(entry.description)
          ? 'alias'
          : 'primary';
        console.log(`  - [${marker}] ${entry.plugin}: ${entry.sourcePath}`);
      }
    }
  }

  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length})`);
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  if (errors.length > 0) {
    console.error(`\nErrors (${errors.length})`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('\nCommand ownership passed.');
}

main();
