#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const pluginsRoot = path.join(repoRoot, 'plugins');
const hooksTestRoot = path.join(repoRoot, 'plugins', 'opspal-core', 'test', 'hooks');
const coverageConfigPath = path.join(repoRoot, 'scripts', 'config', 'active-hook-test-coverage.json');
const coverageReportPath = path.join(hooksTestRoot, 'coverage', 'active-hook-test-coverage.json');

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

function normalizeToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\.test\.js$/i, '')
    .replace(/\.(sh|js)$/i, '')
    .replace(/[^a-z0-9]+/g, '');
}

function basenameWithoutExtension(filePath) {
  return path.basename(filePath).replace(/\.(sh|js)$/i, '');
}

function derivePluginAliases(pluginName) {
  const stripped = pluginName.replace(/^opspal-/, '');
  const aliases = new Set([
    pluginName,
    stripped,
    stripped.replace(/^salesforce$/, 'salesforce'),
    stripped.replace(/^hubspot$/, 'hubspot'),
    stripped.replace(/^marketo$/, 'marketo'),
    stripped.replace(/^core$/, 'core')
  ]);

  if (stripped.includes('-')) {
    aliases.add(stripped.split('-')[0]);
    aliases.add(stripped.split('-').slice(-1)[0]);
  }

  return Array.from(aliases).filter(Boolean);
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

function collectActiveHookEntries() {
  const entries = [];

  for (const pluginRoot of listPluginRoots()) {
    const pluginName = path.basename(pluginRoot);
    const hooksPath = path.join(pluginRoot, '.claude-plugin', 'hooks.json');
    if (!fs.existsSync(hooksPath)) {
      continue;
    }

    const hooksJson = readJson(hooksPath, {});
    for (const [eventType, hookEntries] of Object.entries(hooksJson.hooks || {})) {
      if (!Array.isArray(hookEntries)) {
        continue;
      }

      for (const entry of hookEntries) {
        const matcher = entry.matcher || '*';
        const hookList = Array.isArray(entry.hooks) ? entry.hooks : [];
        for (const hook of hookList) {
          if (!hook || hook.type !== 'command' || !hook.command) {
            continue;
          }

          for (const commandPath of extractCommandPaths(hook.command)) {
            const resolvedPath = commandPath.replace('${CLAUDE_PLUGIN_ROOT}', pluginRoot);
            entries.push({
              pluginName,
              eventType,
              matcher,
              command: hook.command,
              commandPath: resolvedPath,
              relativeHookPath: toRepoRelative(resolvedPath)
            });
          }
        }
      }
    }
  }

  return entries
    .filter((entry) => fs.existsSync(entry.commandPath))
    .sort((a, b) => a.relativeHookPath.localeCompare(b.relativeHookPath));
}

function walkTestFiles(rootDir, results = []) {
  if (!fs.existsSync(rootDir)) {
    return results;
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      walkTestFiles(fullPath, results);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.test.js')) {
      results.push(fullPath);
    }
  }

  return results;
}

function discoverHookTests() {
  return walkTestFiles(hooksTestRoot, [])
    .sort((a, b) => a.localeCompare(b))
    .map((filePath) => ({
      filePath,
      relativePath: toRepoRelative(filePath),
      baseName: path.basename(filePath, '.test.js'),
      normalizedBaseName: normalizeToken(path.basename(filePath, '.test.js'))
    }));
}

function autoMatchedTests(entry, tests) {
  const hookBaseName = basenameWithoutExtension(entry.relativeHookPath);
  const aliases = derivePluginAliases(entry.pluginName);
  const hookCandidates = new Set([
    hookBaseName,
    ...aliases.map((alias) => `${alias}-${hookBaseName}`),
    ...aliases.map((alias) => `${hookBaseName}-${alias}`)
  ]);

  const normalizedCandidates = Array.from(hookCandidates)
    .map((candidate) => normalizeToken(candidate))
    .filter(Boolean);

  return tests
    .filter((test) => normalizedCandidates.some((candidate) => (
      test.normalizedBaseName === candidate ||
      test.normalizedBaseName.includes(candidate) ||
      candidate.includes(test.normalizedBaseName)
    )))
    .map((test) => test.relativePath);
}

function resolveCoverage() {
  const config = readJson(coverageConfigPath, {
    manualCoverage: {},
    allowedUntested: {}
  });

  const tests = discoverHookTests();
  const activeHooks = collectActiveHookEntries();
  const activeHookPathSet = new Set(activeHooks.map((entry) => entry.relativeHookPath));
  const knownTestPaths = new Set(tests.map((test) => test.relativePath));

  const staleManualCoverage = [];
  for (const [hookPath, testPaths] of Object.entries(config.manualCoverage || {})) {
    if (!activeHookPathSet.has(hookPath)) {
      staleManualCoverage.push({
        hookPath,
        reason: 'manualCoverage entry does not point to an active hook'
      });
    }
    for (const testPath of testPaths || []) {
      if (!knownTestPaths.has(testPath)) {
        staleManualCoverage.push({
          hookPath,
          reason: `manualCoverage references missing test ${testPath}`
        });
      }
    }
  }

  const staleAllowUntested = [];
  for (const hookPath of Object.keys(config.allowedUntested || {})) {
    if (!activeHookPathSet.has(hookPath)) {
      staleAllowUntested.push({
        hookPath,
        reason: 'allowedUntested entry does not point to an active hook'
      });
    }
  }

  const entries = activeHooks.map((entry) => {
    const manualCoverage = Array.isArray(config.manualCoverage?.[entry.relativeHookPath])
      ? config.manualCoverage[entry.relativeHookPath]
      : [];
    const matchedTests = Array.from(new Set([
      ...autoMatchedTests(entry, tests),
      ...manualCoverage
    ])).sort((a, b) => a.localeCompare(b));

    const allowReason = config.allowedUntested?.[entry.relativeHookPath] || '';

    return {
      ...entry,
      matchedTests,
      allowReason,
      covered: matchedTests.length > 0
    };
  });

  const missingCoverage = entries.filter((entry) => !entry.covered && !entry.allowReason);
  const allowlistedUntested = entries.filter((entry) => !entry.covered && entry.allowReason);
  const staleAllowlist = entries.filter((entry) => entry.covered && entry.allowReason)
    .map((entry) => ({
      hookPath: entry.relativeHookPath,
      reason: 'hook is now covered; remove it from allowedUntested'
    }));

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      activeHooks: entries.length,
      coveredHooks: entries.filter((entry) => entry.covered).length,
      allowlistedUntested: allowlistedUntested.length,
      missingCoverage: missingCoverage.length
    },
    missingCoverage: missingCoverage.map((entry) => ({
      hookPath: entry.relativeHookPath,
      plugin: entry.pluginName,
      eventType: entry.eventType,
      matcher: entry.matcher
    })),
    allowlistedUntested: allowlistedUntested.map((entry) => ({
      hookPath: entry.relativeHookPath,
      plugin: entry.pluginName,
      eventType: entry.eventType,
      matcher: entry.matcher,
      reason: entry.allowReason
    })),
    staleConfiguration: [
      ...staleManualCoverage,
      ...staleAllowUntested,
      ...staleAllowlist
    ],
    entries: entries.map((entry) => ({
      hookPath: entry.relativeHookPath,
      plugin: entry.pluginName,
      eventType: entry.eventType,
      matcher: entry.matcher,
      matchedTests: entry.matchedTests,
      covered: entry.covered,
      allowReason: entry.allowReason || null
    }))
  };

  ensureDir(path.dirname(coverageReportPath));
  fs.writeFileSync(coverageReportPath, JSON.stringify(report, null, 2));

  return report;
}

function main() {
  const report = resolveCoverage();
  const hasErrors = report.missingCoverage.length > 0 || report.staleConfiguration.length > 0;

  if (report.allowlistedUntested.length > 0) {
    console.log(`Tracked active hook coverage debt: ${report.allowlistedUntested.length} allowlisted hook(s).`);
  }

  if (hasErrors) {
    console.error('Active hook test coverage violations detected:');

    for (const entry of report.missingCoverage) {
      console.error(`- ${entry.hookPath} (${entry.eventType}/${entry.matcher}) has no matching hook test`);
    }

    for (const entry of report.staleConfiguration) {
      console.error(`- ${entry.hookPath}: ${entry.reason}`);
    }

    console.error(`Coverage report written to ${toRepoRelative(coverageReportPath)}`);
    process.exit(1);
  }

  console.log(`✅ Active hook test coverage checks passed (${report.totals.coveredHooks}/${report.totals.activeHooks} covered, ${report.totals.allowlistedUntested} debt allowlisted)`);
}

if (require.main === module) {
  main();
}

module.exports = {
  collectActiveHookEntries,
  discoverHookTests,
  resolveCoverage
};
