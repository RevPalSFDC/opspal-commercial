'use strict';

const fs = require('fs');
const path = require('path');

const LEGACY_LONG = /mcp__notebooklm__source_add_(text|url|drive)/;
const LEGACY_SHORT = /\bsource_add_(text|url|drive)\b/;

const FILES_MUST_BE_UPDATED = [
  'agents/notebooklm-knowledge-manager.md',
  'commands/notebook-init.md',
  'commands/notebook-sync.md',
  'commands/generate-runbook.md',
  'commands/setup-notebooklm.md',
  'routing-index.json'
];

describe('NotebookLM MCP tool name migration (source_add_* → notebook_add_*)', () => {
  const pluginRoot = path.join(__dirname, '..');

  test.each(FILES_MUST_BE_UPDATED)('%s uses notebook_add_* not source_add_*', (relPath) => {
    const full = path.join(pluginRoot, relPath);
    const content = fs.readFileSync(full, 'utf8');
    expect(content).not.toMatch(LEGACY_LONG);
    expect(content).not.toMatch(LEGACY_SHORT);
  });
});
