#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const pluginsRoot = path.join(repoRoot, 'plugins');
const budgetConfigPath = path.join(repoRoot, 'scripts', 'config', 'hook-fanout-budget.json');
const reportPath = path.join(
  repoRoot,
  'plugins',
  'opspal-core',
  'test',
  'hooks',
  'coverage',
  'hook-fanout-budget-report.json'
);

function readJson(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) {
    return fallbackValue;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function toRepoRelative(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function listPluginRoots() {
  if (!fs.existsSync(pluginsRoot)) {
    return [];
  }

  return fs.readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(pluginsRoot, entry.name));
}

function extractCommandPaths(command) {
  if (typeof command !== 'string' || command.trim() === '') {
    return [];
  }

  const paths = new Set();

  if (command.startsWith('bash -c')) {
    const inlineMatches = command.match(/\$\{CLAUDE_PLUGIN_ROOT\}[^\s'"]+\.(?:sh|js)/g) || [];
    inlineMatches.forEach((match) => paths.add(match));
    return Array.from(paths);
  }

  const envMatch = command.match(
    /(?:^|\s)env(?:\s+[A-Z_][A-Z0-9_]*=[^\s]+)+\s+(?:"([^"]+\.(?:sh|js))"|'([^']+\.(?:sh|js))'|([^"'`\s;]+\.(?:sh|js)))/
  );
  if (envMatch) {
    paths.add(envMatch[1] || envMatch[2] || envMatch[3]);
    return Array.from(paths);
  }

  const bashMatch = command.match(/bash\s+(?:-c\s+)?["']?([^"'\s;]+\.sh)/);
  if (bashMatch) {
    paths.add(bashMatch[1]);
    return Array.from(paths);
  }

  const nodeMatch = command.match(/node\s+["']?([^"'\s;]+\.js)/);
  if (nodeMatch) {
    paths.add(nodeMatch[1]);
    return Array.from(paths);
  }

  if (command.endsWith('.sh') || command.endsWith('.js')) {
    paths.add(command.split(/\s+/)[0]);
    return Array.from(paths);
  }

  const quotedMatch = command.match(/["']([^"']+\.(?:sh|js))["']/);
  if (quotedMatch) {
    paths.add(quotedMatch[1]);
  }

  return Array.from(paths);
}

function collectHookFanout() {
  const aggregate = new Map();

  for (const pluginRoot of listPluginRoots()) {
    const pluginName = path.basename(pluginRoot);
    const hooksPath = path.join(pluginRoot, '.claude-plugin', 'hooks.json');
    if (!fs.existsSync(hooksPath)) {
      continue;
    }

    const hooksJson = readJson(hooksPath, {});
    for (const [eventType, entries] of Object.entries(hooksJson.hooks || {})) {
      if (!Array.isArray(entries)) {
        continue;
      }

      for (const entry of entries) {
        const matcher = entry.matcher || '*';
        const hooks = Array.isArray(entry.hooks) ? entry.hooks : [];
        const key = `${eventType} :: ${matcher}`;

        if (!aggregate.has(key)) {
          aggregate.set(key, {
            key,
            eventType,
            matcher,
            count: 0,
            plugins: new Set(),
            hookPaths: [],
            duplicateCounts: new Map()
          });
        }

        const bucket = aggregate.get(key);
        bucket.plugins.add(pluginName);

        for (const hook of hooks) {
          if (!hook || hook.type !== 'command' || !hook.command) {
            continue;
          }

          const commandPaths = extractCommandPaths(hook.command);
          const resolvedPaths = commandPaths.length > 0
            ? commandPaths.map((commandPath) => (
              commandPath.replace('${CLAUDE_PLUGIN_ROOT}', pluginRoot)
            ))
            : [hook.command];

          resolvedPaths.forEach((resolvedPath) => {
            const relativePath = fs.existsSync(resolvedPath)
              ? toRepoRelative(resolvedPath)
              : String(resolvedPath);
            bucket.count += 1;
            bucket.hookPaths.push(relativePath);
            bucket.duplicateCounts.set(relativePath, (bucket.duplicateCounts.get(relativePath) || 0) + 1);
          });
        }
      }
    }
  }

  return Array.from(aggregate.values())
    .map((entry) => ({
      key: entry.key,
      eventType: entry.eventType,
      matcher: entry.matcher,
      count: entry.count,
      plugins: Array.from(entry.plugins).sort((a, b) => a.localeCompare(b)),
      hookPaths: entry.hookPaths.sort((a, b) => a.localeCompare(b)),
      duplicates: Array.from(entry.duplicateCounts.entries())
        .filter(([, duplicateCount]) => duplicateCount > 1)
        .map(([hookPath, duplicateCount]) => ({ hookPath, duplicateCount }))
        .sort((a, b) => a.hookPath.localeCompare(b.hookPath))
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function resolveBudgetReport() {
  const config = readJson(budgetConfigPath, {
    defaultMax: 3,
    budgets: {}
  });
  const entries = collectHookFanout();
  const liveKeys = new Set(entries.map((entry) => entry.key));

  const staleBudgets = Object.keys(config.budgets || {})
    .filter((key) => !liveKeys.has(key))
    .map((key) => ({
      key,
      reason: 'budget entry does not match any active hook matcher'
    }));

  const overBudget = [];
  const duplicateRegistrations = [];

  const evaluatedEntries = entries.map((entry) => {
    const configuredBudget = config.budgets?.[entry.key] || null;
    const max = Number.isInteger(configuredBudget?.max)
      ? configuredBudget.max
      : config.defaultMax;

    if (entry.count > max) {
      overBudget.push({
        key: entry.key,
        count: entry.count,
        max,
        plugins: entry.plugins
      });
    }

    if (entry.duplicates.length > 0) {
      duplicateRegistrations.push({
        key: entry.key,
        duplicates: entry.duplicates
      });
    }

    return {
      ...entry,
      max,
      budgetReason: configuredBudget?.reason || null
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    defaultMax: config.defaultMax,
    totals: {
      matcherGroups: evaluatedEntries.length,
      overBudget: overBudget.length,
      duplicateRegistrations: duplicateRegistrations.length
    },
    overBudget,
    duplicateRegistrations,
    staleBudgets,
    entries: evaluatedEntries
  };

  ensureDir(path.dirname(reportPath));
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  return report;
}

function main() {
  const report = resolveBudgetReport();
  const hasErrors =
    report.overBudget.length > 0 ||
    report.duplicateRegistrations.length > 0 ||
    report.staleBudgets.length > 0;

  if (hasErrors) {
    console.error('Hook fan-out budget violations detected:');

    report.overBudget.forEach((entry) => {
      console.error(`- ${entry.key} has ${entry.count} command hook(s), exceeds max ${entry.max}`);
    });

    report.duplicateRegistrations.forEach((entry) => {
      entry.duplicates.forEach((duplicate) => {
        console.error(
          `- ${entry.key} registers ${duplicate.hookPath} ${duplicate.duplicateCount} times`
        );
      });
    });

    report.staleBudgets.forEach((entry) => {
      console.error(`- ${entry.key}: ${entry.reason}`);
    });

    console.error(`Fan-out report written to ${toRepoRelative(reportPath)}`);
    process.exit(1);
  }

  console.log(`✅ Hook fan-out budgets passed (${report.totals.matcherGroups} matcher groups checked)`);
}

if (require.main === module) {
  main();
}

module.exports = {
  collectHookFanout,
  resolveBudgetReport
};
