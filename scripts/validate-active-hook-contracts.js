#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const pluginsRoot = path.join(repoRoot, 'plugins');

const violations = [];

const checks = [
  {
    id: 'legacy-task-guidance',
    description: 'contains stale Task-tool guidance',
    regexes: [
      /\bUse Task tool\b/i,
      /\bTask tool with subagent_type\b/i,
      /\bvia the Task tool\b/i,
      /\bTask\(/,
      /\bTask tool\b/i
    ]
  },
  {
    id: 'legacy-tool-field',
    description: 'parses legacy .tool field',
    regexes: [
      /jq[^\n]*['"][^'"\n]*\.tool\b(?!_name)[^'"\n]*['"]/
    ]
  },
  {
    id: 'legacy-toolname-field',
    description: 'parses legacy .toolName field',
    regexes: [
      /jq[^\n]*['"][^'"\n]*\.toolName\b[^'"\n]*['"]/
    ]
  },
  {
    id: 'legacy-input-field',
    description: 'parses legacy .input field',
    regexes: [
      /jq[^\n]*['"][^'"\n]*\.input\.[^'"\n]*['"]/
    ]
  },
  {
    id: 'legacy-parameters-field',
    description: 'parses legacy .parameters field',
    regexes: [
      /jq[^\n]*['"][^'"\n]*\.parameters\.[^'"\n]*['"]/
    ]
  },
  {
    id: 'legacy-task-tool-branch',
    description: 'branches on the legacy Task tool identity',
    regexes: [
      /\[\[[^\n]*["']Task["'][^\n]*\]\]/,
      /\[[^\n]*["']Task["'][^\n]*\]/,
      /\|Task\)/
    ]
  }
];

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

function collectActiveHookFiles(pluginRoot) {
  const hooksPath = path.join(pluginRoot, '.claude-plugin', 'hooks.json');
  if (!fs.existsSync(hooksPath)) {
    return [];
  }

  const hooksJson = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  const resolved = new Set();

  for (const hookEntries of Object.values(hooksJson.hooks || {})) {
    if (!Array.isArray(hookEntries)) {
      continue;
    }

    for (const entry of hookEntries) {
      const hookList = Array.isArray(entry.hooks) ? entry.hooks : [];
      for (const hook of hookList) {
        if (!hook || hook.type !== 'command' || !hook.command) {
          continue;
        }

        const commandPaths = extractCommandPaths(hook.command);
        commandPaths.forEach((commandPath) => {
          const absolutePath = commandPath.replace('${CLAUDE_PLUGIN_ROOT}', pluginRoot);
          resolved.add(absolutePath);
        });
      }
    }
  }

  return Array.from(resolved);
}

function scanFile(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    violations.push({
      filePath,
      line: 0,
      id: 'missing-hook-file',
      description: 'active hook command references a missing file',
      snippet: ''
    });
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    checks.forEach((check) => {
      if (check.regexes.some((regex) => regex.test(line))) {
        violations.push({
          filePath,
          line: index + 1,
          id: check.id,
          description: check.description,
          snippet: line.trim()
        });
      }
    });
  });
}

for (const pluginRoot of listPluginRoots()) {
  for (const hookFile of collectActiveHookFiles(pluginRoot)) {
    scanFile(hookFile);
  }
}

if (violations.length > 0) {
  console.error('Active hook contract violations detected:');
  violations
    .sort((a, b) => {
      if (a.filePath === b.filePath) {
        return a.line - b.line;
      }
      return a.filePath.localeCompare(b.filePath);
    })
    .forEach((violation) => {
      console.error(`- ${path.relative(repoRoot, violation.filePath)}:${violation.line} ${violation.description} [${violation.id}]`);
      if (violation.snippet) {
        console.error(`  ${violation.snippet}`);
      }
    });
  process.exit(1);
}

console.log('✅ Active hook contract checks passed');
