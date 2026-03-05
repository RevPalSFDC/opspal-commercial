#!/usr/bin/env node

/**
 * Plugin Suite Documentation Generator
 *
 * Canonical generator for repository-level suite documentation:
 * - AGENTS.md (maintainer/developer control plane)
 * - README.md repository stats sections
 * - CLAUDE.md stats table
 * - docs/PLUGIN_SUITE_CATALOG.md
 * - docs/PLUGIN_SUITE_CATALOG.json
 * - docs/PLUGIN_OWNERSHIP_AND_LIFECYCLE.md
 */

'use strict';

const fs = require('fs');
const path = require('path');

const {
  REPO_ROOT,
  collectInventory,
  collectDevtoolsInventory,
  commandDisplayName,
  truncate
} = require('./lib/plugin-doc-inventory');

const AGENTS_MD_PATH = path.join(REPO_ROOT, 'AGENTS.md');
const README_PATH = path.join(REPO_ROOT, 'README.md');
const CLAUDE_MD_PATH = path.join(REPO_ROOT, 'CLAUDE.md');
const SUITE_MD_PATH = path.join(REPO_ROOT, 'docs', 'PLUGIN_SUITE_CATALOG.md');
const SUITE_JSON_PATH = path.join(REPO_ROOT, 'docs', 'PLUGIN_SUITE_CATALOG.json');
const OWNERSHIP_MD_PATH = path.join(REPO_ROOT, 'docs', 'PLUGIN_OWNERSHIP_AND_LIFECYCLE.md');

function mandatoryAgentCount(plugin) {
  return plugin.agents.filter((agent) => /MUST BE USED/i.test(agent.description || '')).length;
}

function buildMetricsTable(inventory) {
  return [
    '| Metric | Count |',
    '|--------|-------|',
    `| Plugins | ${inventory.totals.plugins} |`,
    `| Agents | ${inventory.totals.agents} |`,
    `| Commands | ${inventory.totals.commands} |`,
    `| Skills | ${inventory.totals.skills} |`,
    `| Hooks | ${inventory.totals.hooks} |`,
    `| Scripts | ${inventory.totals.scripts} |`
  ].join('\n');
}

function generatePluginMatrix(inventory) {
  const lines = [
    '| Plugin | Version | Status | Agents | Mandatory Agents | Commands | Skills | Hooks | Scripts |',
    '|--------|---------|--------|--------|------------------|----------|--------|-------|---------|'
  ];

  for (const plugin of inventory.plugins) {
    lines.push(
      `| \`${plugin.name}\` | ${plugin.version} | ${plugin.status} | ${plugin.agents.length} | ${mandatoryAgentCount(plugin)} | ${plugin.commands.length} | ${plugin.skills.length} | ${plugin.hooks.length} | ${plugin.scripts.length} |`
    );
  }

  return lines.join('\n');
}

function renderAgentTable(plugin) {
  const lines = [
    '| Agent | Description | File |',
    '|-------|-------------|------|'
  ];

  for (const agent of plugin.agents) {
    lines.push(
      `| \`${agent.name}\` | ${truncate(agent.description, 120)} | \`${agent.file}\` |`
    );
  }

  return lines.join('\n');
}

function renderCommandTable(plugin) {
  const lines = [
    '| Command | Args | Description | File |',
    '|---------|------|-------------|------|'
  ];

  for (const command of plugin.commands) {
    const hint = command.frontmatter?.['argument-hint'] || '';
    lines.push(
      `| \`${commandDisplayName(command.name)}\` | ${hint ? `\`${truncate(hint, 80)}\`` : ''} | ${truncate(command.description, 120)} | \`${command.file}\` |`
    );
  }

  return lines.join('\n');
}

function renderSkillList(plugin) {
  if (plugin.skills.length === 0) return '_None_';

  const lines = [
    '| Skill | Description | File |',
    '|-------|-------------|------|'
  ];

  for (const skill of plugin.skills) {
    lines.push(
      `| \`${skill.name}\` | ${truncate(skill.description, 120)} | \`${skill.file}\` |`
    );
  }

  return lines.join('\n');
}

function generateRuntimeRegistry(inventory) {
  const lines = [];

  for (const plugin of inventory.plugins) {
    lines.push(`### ${plugin.name}`);
    lines.push('');
    lines.push(`- Version: \`${plugin.version}\``);
    lines.push(`- Status: \`${plugin.status}\``);
    lines.push(`- Path: \`${plugin.path}\``);
    lines.push(`- Manifest: \`${plugin.manifestPath}\``);
    if (plugin.description) {
      lines.push(`- Description: ${plugin.description}`);
    }
    lines.push('');

    lines.push('#### Agents');
    lines.push('');
    if (plugin.agents.length === 0) {
      lines.push('_None_');
    } else {
      lines.push(renderAgentTable(plugin));
    }
    lines.push('');

    lines.push('#### Commands');
    lines.push('');
    if (plugin.commands.length === 0) {
      lines.push('_None_');
    } else {
      lines.push(renderCommandTable(plugin));
    }
    lines.push('');

    lines.push('#### Skills');
    lines.push('');
    lines.push(renderSkillList(plugin));
    lines.push('');

    lines.push('#### Hooks');
    lines.push('');
    if (plugin.hooks.length === 0) {
      lines.push('_None_');
    } else {
      for (const hook of plugin.hooks) {
        lines.push(`- \`${hook.name}\` (\`${hook.file}\`)${hook.description ? `: ${truncate(hook.description, 120)}` : ''}`);
      }
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function displayValue(value, fallback = '_unset_') {
  const normalized = (value || '').trim();
  return normalized ? `\`${normalized}\`` : fallback;
}

function generateOwnershipLifecycleMarkdown(inventory) {
  const missingStatus = inventory.plugins.filter((plugin) => !plugin.status).length;
  const missingOwner = inventory.plugins.filter((plugin) => !plugin.owner).length;
  const missingStability = inventory.plugins.filter((plugin) => !plugin.stability).length;
  const missingLastReview = inventory.plugins.filter((plugin) => !plugin.lastReviewedAt).length;
  const deprecatedWithoutReplacement = inventory.plugins.filter(
    (plugin) => plugin.status === 'deprecated' && !plugin.replacedBy
  ).length;

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
    '- Freshness SLA for `last_reviewed_at`: warning after 90 days, gate failure after 120 days (see `docs:verify-lifecycle-metadata`).',
    '- Deprecation and sunset policy: `docs/PLUGIN_DEPRECATION_POLICY.md`.',
    '',
    '## Coverage Summary',
    '',
    `- Plugins scanned: ${inventory.totals.plugins}`,
    `- Missing status: ${missingStatus}`,
    `- Missing owner: ${missingOwner}`,
    `- Missing stability: ${missingStability}`,
    `- Missing last_reviewed_at: ${missingLastReview}`,
    `- Deprecated plugins missing replacement: ${deprecatedWithoutReplacement}`,
    '',
    '## Ownership and Lifecycle Matrix',
    '',
    '| Plugin | Version | Status | Owner | Stability | Last Reviewed | Deprecation Date | Replaced By |',
    '|--------|---------|--------|-------|-----------|---------------|------------------|-------------|'
  ];

  for (const plugin of inventory.plugins) {
    lines.push(
      `| \`${plugin.name}\` | ${plugin.version} | ${plugin.status} | ${displayValue(plugin.owner)} | ${displayValue(plugin.stability)} | ${displayValue(plugin.lastReviewedAt)} | ${displayValue(plugin.deprecationDate)} | ${displayValue(plugin.replacedBy)} |`
    );
  }

  lines.push('');
  lines.push('_End of auto-generated ownership and lifecycle report._');
  lines.push('');
  return lines.join('\n');
}

function renderDevtoolsSection(devtools) {
  const lines = [
    '## Maintainer Devtools (Local Only)',
    '',
    'The local maintainer plugin is optional and not part of the runtime plugin suite.',
    ''
  ];

  if (!devtools) {
    lines.push('- Plugin not detected at `dev-tools/developer-tools-plugin`.');
    lines.push('- Reference: `docs/DEVELOPER_TOOLS_GUIDE.md`.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`- Plugin: \`${devtools.name}\``);
  lines.push(`- Version: \`${devtools.version}\``);
  lines.push(`- Path: \`${devtools.path}\``);
  lines.push(`- Manifest: \`${devtools.manifestPath}\``);
  lines.push(`- Commands: ${devtools.commands.length}`);
  lines.push(`- Skills: ${devtools.skills.length}`);
  lines.push('');

  lines.push('### Maintainer Commands');
  lines.push('');

  if (devtools.commands.length === 0) {
    lines.push('_None_');
  } else {
    lines.push('| Command | Args | Description | File |');
    lines.push('|---------|------|-------------|------|');
    for (const command of devtools.commands) {
      const hint = command.frontmatter?.['argument-hint'] || '';
      lines.push(
        `| \`${commandDisplayName(command.name)}\` | ${hint ? `\`${truncate(hint, 80)}\`` : ''} | ${truncate(command.description, 120)} | \`${command.file}\` |`
      );
    }
  }

  lines.push('');
  lines.push('### Maintainer Skills');
  lines.push('');

  if (devtools.skills.length === 0) {
    lines.push('_None_');
  } else {
    lines.push('| Skill | Description | File |');
    lines.push('|-------|-------------|------|');
    for (const skill of devtools.skills) {
      lines.push(`| \`${skill.name}\` | ${truncate(skill.description, 120)} | \`${skill.file}\` |`);
    }
  }

  lines.push('');
  lines.push('Reference guide: `docs/DEVELOPER_TOOLS_GUIDE.md`.');
  lines.push('');
  return lines.join('\n');
}

function generateAgentsMd(inventory, devtools) {
  const matrix = generatePluginMatrix(inventory);
  const devtoolsSection = renderDevtoolsSection(devtools);

  return [
    '# AGENTS.md - OpsPal Maintainer + Developer Guide',
    '',
    '> Authoritative maintainer and developer guide for the runtime OpsPal plugin suite.',
    '> Generated sections are explicitly marked. Regenerate with `npm run docs:generate`.',
    '',
    '## Purpose',
    '',
    'This guide defines maintainer workflows, architecture invariants, and validation gates for the runtime OpsPal plugin suite.',
    '',
    '## Scope',
    '',
    '- Runtime plugin inventory in this file is sourced from tracked `opspal-*` plugins under `plugins/`.',
    '- Local-only maintainer tooling may exist under `dev-tools/developer-tools-plugin` and is documented in `docs/DEVELOPER_TOOLS_GUIDE.md`.',
    '- `CLAUDE.md` is the runtime behavior/routing guide. `AGENTS.md` is the maintainer + developer reference.',
    '',
    '## Maintainer Workflow',
    '',
    '1. Update plugin manifests, agents, commands, skills, hooks, or scripts.',
    '2. Regenerate suite docs: `npm run docs:generate`.',
    '3. Run validation gates: `npm run docs:ci`.',
    '4. Commit regenerated docs with source changes.',
    '',
    '## Architecture Invariants (Mechanically Enforced)',
    '',
    '- Route targets in `CLAUDE.md` must map to existing runtime agents.',
    '- Legacy plugin alias route targets (for example `*-plugin:*`) are disallowed.',
    '- Agents with `MUST BE USED` descriptions must be explicitly routed in `CLAUDE.md` Mandatory Routing section.',
    '- Hook commands cannot reference cross-plugin paths via `${CLAUDE_PLUGIN_ROOT}/../...`.',
    '- Runtime assets under `assets/`, `templates/`, and `examples/` must remain referenced or be intentionally baselined.',
    '- New risky shell patterns are blocked by baseline-guarded shell safety checks.',
    '- Plugin changes must ship with a manifest version increment.',
    '- Plugin lifecycle metadata and architecture boundary violations are tracked by baseline-guarded gates.',
    '',
    '## Release Notes + Slack Alerts',
    '',
    '- Every push to `main` triggers `.github/workflows/main-push-release-notes.yml`.',
    '- Canonical notifier script: `scripts/lib/send-main-push-release-notification.js`.',
    '- Required repository secret: `SLACK_WEBHOOK_URL` (workflow fails if missing).',
    '- Local fallback hook: `.claude/hooks/post-git-push-slack-notifier.sh`.',
    '- To avoid duplicate notifications from local Claude pushes, set `SKIP_LOCAL_PUSH_SLACK_NOTIFIER=true` in local `.env`.',
    '',
    '## Validation Gates',
    '',
    '| Gate | Command | Fails On |',
    '|------|---------|----------|',
    '| Docs drift | `npm run docs:check` | Generated files differ from source |',
    '| Metadata lint | `npm run docs:lint` | Missing/invalid canonical metadata or warning-baseline regression |',
    '| Hook path isolation | `npm run docs:verify-hook-path-isolation` | Cross-plugin hook paths (for example `${CLAUDE_PLUGIN_ROOT}/../...`) are declared in plugin hooks |',
    '| Routing integrity | `npm run docs:verify-routing` | Route target agent missing or legacy plugin alias used |',
    '| Route coverage | `npm run docs:verify-route-coverage` | Net-new mandatory agents (`MUST BE USED`) missing explicit routing coverage |',
    '| Command integrity | `npm run docs:verify-commands` | Ambiguous duplicate command ownership |',
    '| Unused assets | `npm run docs:verify-unused-assets` | Net-new orphaned assets in runtime plugin `assets/`, `templates/`, or `examples/` paths |',
    '| Version bump integrity | `npm run docs:verify-version-bumps` | Plugin files changed without a manifest version increment |',
    '| Lifecycle metadata | `npm run docs:verify-lifecycle-metadata` | Net-new missing lifecycle metadata (`status`, `owner`, `stability`, `last_reviewed_at`) or stale review breaches |',
    '| Architecture boundaries | `npm run docs:verify-architecture-boundaries` | Net-new cross-plugin internal path coupling in runtime plugin files |',
    '| Shell safety | `npm run docs:verify-shell-safety` | Net-new risky shell patterns in checked scripts/hooks |',
    '',
    '## Canonical Artifacts',
    '',
    '- Full runtime registry: `docs/PLUGIN_SUITE_CATALOG.md`',
    '- Machine-readable runtime registry: `docs/PLUGIN_SUITE_CATALOG.json`',
    '- Ownership and lifecycle registry: `docs/PLUGIN_OWNERSHIP_AND_LIFECYCLE.md`',
    '- Deprecation policy: `docs/PLUGIN_DEPRECATION_POLICY.md`',
    '',
    devtoolsSection,
    '## Runtime Plugin Matrix',
    '',
    '<!-- AUTO_GENERATED_START:plugin-matrix -->',
    matrix,
    '<!-- AUTO_GENERATED_END:plugin-matrix -->',
    '',
    '## Runtime Registry',
    '',
    'The complete runtime registry has moved to `docs/PLUGIN_SUITE_CATALOG.md`.',
    'Use `docs/PLUGIN_SUITE_CATALOG.json` for machine-readable inventory data.',
    '',
    '## Regeneration',
    '',
    '- Generate all docs: `npm run docs:generate`',
    '- Check for drift only: `npm run docs:check`',
    '- Run full docs CI checks locally: `npm run docs:ci`',
    ''
  ].join('\n');
}

function replaceSection(content, heading, replacementBody) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`## ${escapedHeading}[\\s\\S]*?(?=\\n## |\\n---|$)`);
  const replacement = `## ${heading}\n\n${replacementBody}\n\n`;

  if (pattern.test(content)) {
    return content.replace(pattern, replacement);
  }

  return `${content.trimEnd()}\n\n${replacement}`;
}

function updateReadmeStats(inventory) {
  if (!fs.existsSync(README_PATH)) {
    console.warn('README.md not found');
    return null;
  }

  let content = fs.readFileSync(README_PATH, 'utf8');
  const table = buildMetricsTable(inventory);

  content = replaceSection(content, 'Repository Stats', table);
  content = replaceSection(content, 'Quick Stats', table);

  const summaryLine = `The official plugin marketplace for Claude Code, providing **${inventory.totals.agents} specialized agents** across **${inventory.totals.plugins} plugins**.`;
  if (/^The official plugin marketplace.*$/m.test(content)) {
    content = content.replace(/^The official plugin marketplace.*$/m, summaryLine);
  }

  return content;
}

function replaceLastMetricsTable(content, newTable) {
  const tablePattern = /\| Metric \| Count \|\n\|[-| ]+\|\n(?:\|.*\|\n)+/g;
  let match = null;
  let lastMatch = null;

  while ((match = tablePattern.exec(content)) !== null) {
    if (match[0].includes('| Plugins |') || match[0].includes('| Agents |')) {
      lastMatch = match;
    }
  }

  if (!lastMatch) {
    return null;
  }

  return (
    content.slice(0, lastMatch.index) +
    `${newTable}\n` +
    content.slice(lastMatch.index + lastMatch[0].length)
  );
}

function updateClaudeMdStats(inventory) {
  if (!fs.existsSync(CLAUDE_MD_PATH)) {
    console.warn('CLAUDE.md not found');
    return null;
  }

  const content = fs.readFileSync(CLAUDE_MD_PATH, 'utf8');
  const table = buildMetricsTable(inventory);

  const sectionPattern = /## Repository Stats[\s\S]*?(?=\n## |\n---|$)/;
  if (sectionPattern.test(content)) {
    return content.replace(sectionPattern, `## Repository Stats\n\n${table}\n`);
  }

  const replacedTable = replaceLastMetricsTable(content, table);
  if (replacedTable) {
    return replacedTable;
  }

  return `${content.trimEnd()}\n\n## Repository Stats\n\n${table}\n`;
}

function generateSuiteCatalogMarkdown(inventory) {
  const lines = [
    '# Plugin Suite Catalog',
    '',
    '> Auto-generated. Do not edit manually.',
    '> Generated from the tracked runtime plugin source tree.',
    '',
    '## Summary',
    '',
    buildMetricsTable(inventory),
    '',
    '## Regeneration',
    '',
    '- Refresh docs: `npm run docs:generate`',
    '- Check docs drift: `npm run docs:check`',
    '- Run full docs gates: `npm run docs:ci`',
    '',
    '## Related Artifacts',
    '',
    '- Ownership and lifecycle matrix: `docs/PLUGIN_OWNERSHIP_AND_LIFECYCLE.md`',
    '- Deprecation policy: `docs/PLUGIN_DEPRECATION_POLICY.md`',
    '',
    '## Plugin Matrix',
    '',
    generatePluginMatrix(inventory),
    '',
    '## Registry',
    '',
    generateRuntimeRegistry(inventory),
    '',
    '_End of auto-generated catalog._',
    ''
  ];

  return lines.join('\n');
}

function generateSuiteCatalogJson(inventory) {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

function compareWithExisting(newContent, existingPath) {
  if (!fs.existsSync(existingPath)) {
    return {
      isNew: true,
      hasChanges: true,
      changes: ['File will be created']
    };
  }

  const existingContent = fs.readFileSync(existingPath, 'utf8');
  if (existingContent === newContent) {
    return {
      isNew: false,
      hasChanges: false,
      changes: []
    };
  }

  const existingLines = existingContent.split('\n');
  const newLines = newContent.split('\n');
  const added = newLines.filter((line) => !existingLines.includes(line)).length;
  const removed = existingLines.filter((line) => !newLines.includes(line)).length;

  const changes = [];
  if (added > 0) changes.push(`+${added} lines added`);
  if (removed > 0) changes.push(`-${removed} lines removed`);

  return {
    isNew: false,
    hasChanges: true,
    changes
  };
}

function parseOptions(args) {
  const options = {
    target: null,
    dryRun: args.includes('--dry-run'),
    check: args.includes('--check'),
    json: args.includes('--json'),
    verbose: args.includes('--verbose'),
    help: args.includes('--help')
  };

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--target' && args[i + 1]) {
      options.target = args[i + 1];
      i += 1;
    }
  }

  return options;
}

function resolveTargets(target) {
  if (!target || target === 'all') {
    return ['agents', 'readme', 'claude', 'suite'];
  }

  const allowed = new Set(['agents', 'readme', 'claude', 'suite']);
  if (!allowed.has(target)) {
    throw new Error(`Unknown target: ${target}`);
  }

  return [target];
}

function buildJobs(targets, inventory, devtools) {
  const jobs = [];

  if (targets.includes('agents')) {
    jobs.push({
      target: 'agents',
      path: AGENTS_MD_PATH,
      content: generateAgentsMd(inventory, devtools)
    });
  }

  if (targets.includes('readme')) {
    const content = updateReadmeStats(inventory);
    if (content) {
      jobs.push({
        target: 'readme',
        path: README_PATH,
        content
      });
    }
  }

  if (targets.includes('claude')) {
    const content = updateClaudeMdStats(inventory);
    if (content) {
      jobs.push({
        target: 'claude',
        path: CLAUDE_MD_PATH,
        content
      });
    }
  }

  if (targets.includes('suite')) {
    jobs.push({
      target: 'suite-markdown',
      path: SUITE_MD_PATH,
      content: generateSuiteCatalogMarkdown(inventory)
    });
    jobs.push({
      target: 'suite-json',
      path: SUITE_JSON_PATH,
      content: generateSuiteCatalogJson(inventory)
    });
    jobs.push({
      target: 'ownership-lifecycle',
      path: OWNERSHIP_MD_PATH,
      content: generateOwnershipLifecycleMarkdown(inventory)
    });
  }

  return jobs;
}

function displayHelp() {
  console.log(`
Plugin Suite Doc Generator - canonical suite docs generation from runtime plugin source

Usage:
  node scripts/generate-plugin-suite-docs.js [options]

Options:
  --target <type>   Generate specific target only (agents, readme, claude, suite, all)
  --dry-run         Preview changes without writing files
  --check           Fail if generated output differs from repository files
  --json            Output result summary as JSON
  --verbose         Show detailed output
  --help            Show this help text

Examples:
  node scripts/generate-plugin-suite-docs.js
  node scripts/generate-plugin-suite-docs.js --target suite
  node scripts/generate-plugin-suite-docs.js --dry-run --target agents
  node scripts/generate-plugin-suite-docs.js --check
`);
}

async function main() {
  const options = parseOptions(process.argv.slice(2));

  if (options.help) {
    displayHelp();
    process.exit(0);
  }

  console.log('Collecting plugin inventory...');
  const inventory = collectInventory();
  const devtools = collectDevtoolsInventory();
  const targets = resolveTargets(options.target);
  const jobs = buildJobs(targets, inventory, devtools);

  const results = {
    inventory: { ...inventory.totals },
    files: []
  };

  let hasAnyChanges = false;

  for (const job of jobs) {
    const comparison = compareWithExisting(job.content, job.path);
    hasAnyChanges = hasAnyChanges || comparison.hasChanges;

    results.files.push({
      target: job.target,
      path: job.path,
      isNew: comparison.isNew,
      hasChanges: comparison.hasChanges,
      changes: comparison.changes
    });

    if (options.dryRun || options.check) {
      const mode = options.check ? '[CHECK]' : '[DRY RUN]';
      console.log(`\n${mode} ${job.target}:`);
      console.log(`  Path: ${job.path}`);
      console.log(`  Changes: ${comparison.changes.join(', ') || 'none'}`);
      continue;
    }

    if (comparison.hasChanges) {
      fs.mkdirSync(path.dirname(job.path), { recursive: true });
      fs.writeFileSync(job.path, job.content, 'utf8');
      console.log(`Updated: ${job.path}`);
    } else if (options.verbose) {
      console.log(`No changes: ${job.path}`);
    }
  }

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  }

  console.log('\n=== Manifest Generation Complete ===');
  console.log(`Plugins: ${inventory.totals.plugins}`);
  console.log(`Agents: ${inventory.totals.agents}`);
  console.log(`Commands: ${inventory.totals.commands}`);
  console.log(`Skills: ${inventory.totals.skills}`);
  console.log(`Hooks: ${inventory.totals.hooks}`);
  console.log(`Scripts: ${inventory.totals.scripts}`);

  if (options.check) {
    if (hasAnyChanges) {
      console.error('\nDocumentation drift detected. Run: npm run docs:generate');
      process.exit(1);
    }
    console.log('\nDocumentation is up-to-date.');
  }
}

main().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
