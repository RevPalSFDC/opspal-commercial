#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const pluginsRoot = path.join(repoRoot, 'plugins');

const violations = [];
const violationKeys = new Set();

const lineChecks = [
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
  },
  {
    id: 'raw-hook-input-passthrough',
    description: 'writes raw HOOK_INPUT back to stdout instead of emitting a documented hook response',
    regexes: [
      /^\s*echo\s+["']?\$HOOK_INPUT["']?\s*$/,
      /^\s*printf\s+['"][^'"]*%s[^'"]*['"]\s+["']?\$HOOK_INPUT["']?\s*$/
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

function collectActiveHookEntries(pluginRoot) {
  const hooksPath = path.join(pluginRoot, '.claude-plugin', 'hooks.json');
  if (!fs.existsSync(hooksPath)) {
    return [];
  }

  const hooksJson = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  const entries = [];

  for (const [eventType, hookEntries] of Object.entries(hooksJson.hooks || {})) {
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
          entries.push({
            eventType,
            matcher: entry.matcher || '*',
            command: hook.command,
            pluginRoot,
            filePath: commandPath.replace('${CLAUDE_PLUGIN_ROOT}', pluginRoot)
          });
        });
      }
    }
  }

  return entries;
}

function addViolation(entry, id, description, line, snippet) {
  const filePath = entry.filePath;
  const key = [filePath, entry.eventType, id, line || 0, snippet || ''].join(':');
  if (violationKeys.has(key)) {
    return;
  }
  violationKeys.add(key);
  violations.push({
    filePath,
    eventType: entry.eventType,
    line: line || 0,
    id,
    description,
    snippet: snippet || ''
  });
}

function lineNumberForIndex(content, index) {
  if (index < 0) {
    return 0;
  }
  return content.slice(0, index).split('\n').length;
}

function findFirstLine(content, regex) {
  const match = content.match(regex);
  if (!match || match.index === undefined) {
    return 0;
  }
  return lineNumberForIndex(content, match.index);
}

function getLineSnippet(lines, lineNumber) {
  if (!lineNumber || lineNumber < 1 || lineNumber > lines.length) {
    return '';
  }
  return lines[lineNumber - 1].trim();
}

const nestedHookSpecificOutputFieldChecks = [
  {
    id: 'hook-specific-output-nested-system-message',
    field: 'systemMessage',
    description: 'nests systemMessage inside hookSpecificOutput instead of using additionalContext or top-level systemMessage'
  },
  {
    id: 'hook-specific-output-nested-decision',
    field: 'decision',
    description: 'nests decision inside hookSpecificOutput instead of using top-level decision'
  },
  {
    id: 'hook-specific-output-nested-reason',
    field: 'reason',
    description: 'nests reason inside hookSpecificOutput instead of using top-level reason'
  },
  {
    id: 'hook-specific-output-nested-continue',
    field: 'continue',
    description: 'nests continue inside hookSpecificOutput instead of using supported top-level fields'
  },
  {
    id: 'hook-specific-output-nested-message',
    field: 'message',
    description: 'nests ad hoc message inside hookSpecificOutput instead of using additionalContext or top-level systemMessage'
  },
  {
    id: 'hook-specific-output-nested-status',
    field: 'status',
    description: 'nests ad hoc status inside hookSpecificOutput instead of using documented fields'
  },
  {
    id: 'hook-specific-output-nested-recommendation',
    field: 'recommendation',
    description: 'nests ad hoc recommendation inside hookSpecificOutput instead of using additionalContext'
  }
];

function findHookSpecificOutputFieldLine(content, fieldName) {
  return findFirstLine(
    content,
    new RegExp(`hookSpecificOutput[\\s\\S]{0,400}["']${fieldName}["']\\s*:`)
  );
}

function scanHookEntry(entry) {
  if (!fs.existsSync(entry.filePath) || !fs.statSync(entry.filePath).isFile()) {
    addViolation(
      entry,
      'missing-hook-file',
      'active hook command references a missing file',
      0,
      ''
    );
    return;
  }

  const content = fs.readFileSync(entry.filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    lineChecks.forEach((check) => {
      if (check.regexes.some((regex) => regex.test(line))) {
        addViolation(entry, check.id, check.description, index + 1, line.trim());
      }
    });
  });

  if (/hookSpecificOutput/.test(content) && !/hookEventName/.test(content)) {
    const line = findFirstLine(content, /hookSpecificOutput/);
    addViolation(
      entry,
      'hook-specific-output-missing-event-name',
      'emits hookSpecificOutput without hookEventName',
      line,
      getLineSnippet(lines, line)
    );
  }

  nestedHookSpecificOutputFieldChecks.forEach((check) => {
    const line = findHookSpecificOutputFieldLine(content, check.field);
    if (!line) {
      return;
    }

    addViolation(
      entry,
      check.id,
      check.description,
      line,
      getLineSnippet(lines, line)
    );
  });

  if (
    entry.eventType === 'PostToolUse' &&
    /(?:^|-)error-handler(?:-[a-z0-9-]+)?\.sh$/i.test(path.basename(entry.filePath))
  ) {
    addViolation(
      entry,
      'post-tool-use-failure-hook-misregistered',
      'failure-recovery hook is registered on PostToolUse instead of PostToolUseFailure',
      0,
      entry.command
    );
  }

  if (
    entry.eventType === 'PostToolUse' &&
    /["']continue["']\s*:\s*(?:true|false)[\s\S]{0,240}["']message["']\s*:/.test(content)
  ) {
    const line = findFirstLine(content, /["']continue["']\s*:\s*(?:true|false)[\s\S]{0,240}["']message["']\s*:/);
    addViolation(
      entry,
      'post-tool-use-ad-hoc-message-envelope',
      'uses ad hoc continue/message JSON instead of PostToolUse decision or additionalContext fields',
      line,
      getLineSnippet(lines, line)
    );
  }
}

const scannedEntries = new Set();

for (const pluginRoot of listPluginRoots()) {
  for (const entry of collectActiveHookEntries(pluginRoot)) {
    const key = `${entry.eventType}:${entry.filePath}`;
    if (scannedEntries.has(key)) {
      continue;
    }
    scannedEntries.add(key);
    scanHookEntry(entry);
  }
}

if (violations.length > 0) {
  console.error('Active hook contract violations detected:');
  violations
    .sort((a, b) => {
      if (a.filePath === b.filePath) {
        if (a.eventType === b.eventType) {
          return a.line - b.line;
        }
        return a.eventType.localeCompare(b.eventType);
      }
      return a.filePath.localeCompare(b.filePath);
    })
    .forEach((violation) => {
      const location = `${path.relative(repoRoot, violation.filePath)}:${violation.line}`;
      console.error(`- ${location} ${violation.description} [${violation.id}] (${violation.eventType})`);
      if (violation.snippet) {
        console.error(`  ${violation.snippet}`);
      }
    });
  process.exit(1);
}

console.log('✅ Active hook contract checks passed');
