'use strict';

const fs = require('fs');
const path = require('path');
const {
  collectPluginInventory
} = require('./lib/plugin-doc-inventory');

const CHECK_MODE = process.argv.includes('--check');
const REPO_ROOT = path.resolve(__dirname, '..');
const inventory = collectPluginInventory(REPO_ROOT);

function ensureTrailingNewline(content) {
  return content.endsWith('\n') ? content : `${content}\n`;
}

function shortDescription(description) {
  if (!description) {
    return '';
  }

  const firstSentence = description.split('. ')[0].trim();
  const shortened = firstSentence.length > 140
    ? `${firstSentence.slice(0, 137).trimEnd()}...`
    : firstSentence;
  return shortened.replace(/\|/g, '\\|');
}

function displayValue(value) {
  return value && String(value).trim() ? `\`${String(value).trim()}\`` : '_unset_';
}

function buildMarketplaceManifest() {
  return {
    name: inventory.marketplace.name,
    repository: inventory.marketplace.repository,
    repository_slug: inventory.marketplace.repositorySlug,
    owner: inventory.marketplace.owner,
    plugins: inventory.plugins.map((plugin) => ({
      name: plugin.name,
      source: plugin.source,
      description: plugin.description,
      version: plugin.version
    })),
    _stats: {
      total_plugins: inventory.totals.plugins,
      last_updated: inventory.generatedDate,
      generated_at: inventory.generatedDate
    }
  };
}

function buildCatalogJson() {
  return {
    generated_at: inventory.generatedDate,
    marketplace: {
      name: inventory.marketplace.name,
      repository: inventory.marketplace.repository,
      repository_slug: inventory.marketplace.repositorySlug,
      owner: inventory.marketplace.owner
    },
    totals: inventory.totals,
    plugins: inventory.plugins.map((plugin) => ({
      name: plugin.name,
      version: plugin.version,
      source: plugin.source,
      description: plugin.description,
      counts: plugin.counts,
      lifecycle: plugin.lifecycle
    }))
  };
}

function buildCatalogMarkdown() {
  const lines = [
    '# Plugin Suite Catalog',
    '',
    '> Auto-generated. Do not edit manually.',
    '> Source of truth: `plugins/opspal-*/.claude-plugin/plugin.json` and `plugins/opspal-*/.claude-plugin/lifecycle.json`.',
    '',
    '## Summary',
    '',
    `- Marketplace: \`${inventory.marketplace.name}\``,
    `- Generated: \`${inventory.generatedDate}\``,
    `- Plugins: ${inventory.totals.plugins}`,
    `- Agents: ${inventory.totals.agents}`,
    `- Commands: ${inventory.totals.commands}`,
    `- Hooks: ${inventory.totals.hooks}`,
    '',
    '## Plugins',
    '',
    '| Plugin | Version | Status | Agents | Commands | Hooks | Notes |',
    '|--------|---------|--------|--------|----------|-------|-------|'
  ];

  for (const plugin of inventory.plugins) {
    lines.push(
      `| \`${plugin.name}\` | ${plugin.version} | ${plugin.lifecycle.status || 'active'} | ${plugin.counts.agents} | ${plugin.counts.commands} | ${plugin.counts.hooks} | ${shortDescription(plugin.description)} |`
    );
  }

  lines.push('', '_End of auto-generated suite catalog._');
  return lines.join('\n');
}

function buildOwnershipMarkdown() {
  const missing = inventory.plugins.reduce((accumulator, plugin) => {
    if (!plugin.lifecycle.status) accumulator.status += 1;
    if (!plugin.lifecycle.owner) accumulator.owner += 1;
    if (!plugin.lifecycle.stability) accumulator.stability += 1;
    if (!plugin.lifecycle.last_reviewed_at) accumulator.lastReviewed += 1;
    if (plugin.lifecycle.status === 'deprecated' && !plugin.lifecycle.replaced_by) {
      accumulator.deprecatedReplacement += 1;
    }
    return accumulator;
  }, {
    status: 0,
    owner: 0,
    stability: 0,
    lastReviewed: 0,
    deprecatedReplacement: 0
  });

  const lines = [
    '# Plugin Ownership and Lifecycle',
    '',
    '> Auto-generated. Do not edit manually.',
    '> Source of truth: runtime plugin manifests and lifecycle metadata under `plugins/opspal-*/.claude-plugin/`.',
    '',
    '## Policy',
    '',
    '- Required plugin lifecycle fields: `status`, `owner`, `stability`, `last_reviewed_at`.',
    '- Deprecated plugins should define `replaced_by` and `deprecation_date`.',
    '- Freshness SLA for `last_reviewed_at`: warning after 90 days, gate failure after 120 days.',
    '',
    '## Coverage Summary',
    '',
    `- Plugins scanned: ${inventory.totals.plugins}`,
    `- Missing status: ${missing.status}`,
    `- Missing owner: ${missing.owner}`,
    `- Missing stability: ${missing.stability}`,
    `- Missing last_reviewed_at: ${missing.lastReviewed}`,
    `- Deprecated plugins missing replacement: ${missing.deprecatedReplacement}`,
    '',
    '## Ownership and Lifecycle Matrix',
    '',
    '| Plugin | Version | Status | Owner | Stability | Last Reviewed | Deprecation Date | Replaced By |',
    '|--------|---------|--------|-------|-----------|---------------|------------------|-------------|'
  ];

  for (const plugin of inventory.plugins) {
    lines.push(
      `| \`${plugin.name}\` | ${plugin.version} | ${displayValue(plugin.lifecycle.status)} | ${displayValue(plugin.lifecycle.owner)} | ${displayValue(plugin.lifecycle.stability)} | ${displayValue(plugin.lifecycle.last_reviewed_at)} | ${displayValue(plugin.lifecycle.deprecation_date)} | ${displayValue(plugin.lifecycle.replaced_by)} |`
    );
  }

  lines.push('', '_End of auto-generated ownership and lifecycle report._');
  return lines.join('\n');
}

function buildReadme() {
  const lines = [
    '# OpsPal Commercial',
    '',
    `Commercial Claude Code marketplace for RevOps delivery across Salesforce, HubSpot, Marketo, GTM planning, and executive reporting. This repo currently ships ${inventory.totals.plugins} plugins with ${inventory.totals.agents} agents, ${inventory.totals.commands} commands, and ${inventory.totals.hooks} hooks.`,
    '',
    '## Install',
    '',
    '```bash',
    `/plugin marketplace add ${inventory.marketplace.repositorySlug}`,
    `/plugin install opspal-core@${inventory.marketplace.name}`,
    `/plugin install opspal-salesforce@${inventory.marketplace.name}`,
    `/plugin install opspal-hubspot@${inventory.marketplace.name}`,
    `/plugin install opspal-marketo@${inventory.marketplace.name}`,
    `/plugin install opspal-gtm-planning@${inventory.marketplace.name}`,
    `/plugin install opspal-okrs@${inventory.marketplace.name}`,
    '```',
    '',
    '## Update',
    '',
    '```bash',
    `cd ~/.claude/plugins/marketplaces/${inventory.marketplace.name}`,
    'git pull origin main',
    '/pluginupdate --fix',
    '```',
    '',
    '## License Activation',
    '',
    '```bash',
    '/activate-license <license-key> <email>',
    '/license-status',
    '```',
    '',
    '## Plugin Catalog',
    '',
    '| Plugin | Version | Status | Agents | Commands | Hooks |',
    '|--------|---------|--------|--------|----------|-------|'
  ];

  for (const plugin of inventory.plugins) {
    lines.push(
      `| \`${plugin.name}\` | ${plugin.version} | ${plugin.lifecycle.status || 'active'} | ${plugin.counts.agents} | ${plugin.counts.commands} | ${plugin.counts.hooks} |`
    );
  }

  lines.push(
    '',
    'Deprecated compatibility note: `opspal-data-hygiene` remains published for compatibility, but new installs should prefer the deduplication commands in `opspal-core`.',
    '',
    '## Support',
    '',
    `- Marketplace repository: ${inventory.marketplace.repository}`,
    `- Issues: ${inventory.marketplace.repository}/issues`
  );

  return lines.join('\n');
}

function buildClaude() {
  const lines = [
    '# OpsPal Commercial Marketplace',
    '',
    `This repository is the commercial OpsPal marketplace. It publishes ${inventory.totals.plugins} plugins and uses the plugin manifests under \`plugins/*/.claude-plugin/plugin.json\` as the source of truth for marketplace metadata.`,
    '',
    '## Installation',
    '',
    '```bash',
    `/plugin marketplace add ${inventory.marketplace.repositorySlug}`,
    `/plugin install opspal-core@${inventory.marketplace.name}`,
    `/plugin install opspal-salesforce@${inventory.marketplace.name}`,
    `/plugin install opspal-hubspot@${inventory.marketplace.name}`,
    `/plugin install opspal-marketo@${inventory.marketplace.name}`,
    '```',
    '',
    '## Published Versions',
    '',
    '| Plugin | Version | Status |',
    '|--------|---------|--------|'
  ];

  for (const plugin of inventory.plugins) {
    lines.push(`| \`${plugin.name}\` | ${plugin.version} | ${plugin.lifecycle.status || 'active'} |`);
  }

  lines.push(
    '',
    '## Updating',
    '',
    '```bash',
    `cd ~/.claude/plugins/marketplaces/${inventory.marketplace.name}`,
    'git pull origin main',
    '/pluginupdate --fix',
    '```',
    '',
    '## License Activation',
    '',
    '```bash',
    '/activate-license <license-key> <email>',
    '/license-status',
    '```',
    '',
    '## Support',
    '',
    `- Repository: ${inventory.marketplace.repository}`,
    `- Issues: ${inventory.marketplace.repository}/issues`
  );

  return lines.join('\n');
}

function buildOutputs() {
  return [
    {
      filePath: path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json'),
      content: `${JSON.stringify(buildMarketplaceManifest(), null, 2)}\n`
    },
    {
      filePath: path.join(REPO_ROOT, 'docs', 'PLUGIN_SUITE_CATALOG.json'),
      content: `${JSON.stringify(buildCatalogJson(), null, 2)}\n`
    },
    {
      filePath: path.join(REPO_ROOT, 'docs', 'PLUGIN_SUITE_CATALOG.md'),
      content: ensureTrailingNewline(buildCatalogMarkdown())
    },
    {
      filePath: path.join(REPO_ROOT, 'docs', 'PLUGIN_OWNERSHIP_AND_LIFECYCLE.md'),
      content: ensureTrailingNewline(buildOwnershipMarkdown())
    },
    {
      filePath: path.join(REPO_ROOT, 'README.md'),
      content: ensureTrailingNewline(buildReadme())
    },
    {
      filePath: path.join(REPO_ROOT, 'CLAUDE.md'),
      content: ensureTrailingNewline(buildClaude())
    }
  ];
}

function writeOutputs() {
  const outputs = buildOutputs();
  const changedFiles = [];

  for (const output of outputs) {
    const current = fs.existsSync(output.filePath)
      ? fs.readFileSync(output.filePath, 'utf8')
      : null;

    if (current === output.content) {
      continue;
    }

    changedFiles.push(path.relative(REPO_ROOT, output.filePath));

    if (!CHECK_MODE) {
      fs.mkdirSync(path.dirname(output.filePath), { recursive: true });
      fs.writeFileSync(output.filePath, output.content);
    }
  }

  if (CHECK_MODE) {
    if (changedFiles.length > 0) {
      console.error('Generated catalog files are out of date:');
      for (const filePath of changedFiles) {
        console.error(`  - ${filePath}`);
      }
      process.exit(1);
    }
    console.log('Generated catalog files are up to date.');
    return;
  }

  if (changedFiles.length === 0) {
    console.log('No catalog files changed.');
    return;
  }

  console.log('Updated catalog files:');
  for (const filePath of changedFiles) {
    console.log(`  - ${filePath}`);
  }
}

writeOutputs();
