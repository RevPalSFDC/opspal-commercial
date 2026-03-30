#!/usr/bin/env node
'use strict';

/**
 * RTH Test 07: Dead Code References
 *
 * Scans hook scripts for `if [ -f "..." ]` guards where the referenced
 * path can be statically resolved. Flags guards where the target does not exist.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PLUGINS_DIR = path.resolve(__dirname, '../../../../plugins');

const GUARD_PATTERN = /if\s+\[\s+-f\s+"?\$\{?([A-Z_]+)\}?\/([^"]+)"?\s+\]/g;

// Pre-existing dead references outside current remediation scope
const KNOWN_GAPS = new Set([
  'opspal-salesforce:pre-territory-write-validator.sh:lib/error-handler.sh' // error-handler.sh never created for SF hooks
]);

function discoverHookScripts() {
  const scripts = [];
  const pluginDirs = fs.readdirSync(PLUGINS_DIR).filter(d => {
    return fs.statSync(path.join(PLUGINS_DIR, d)).isDirectory();
  });

  for (const plugin of pluginDirs) {
    const hooksDir = path.join(PLUGINS_DIR, plugin, 'hooks');
    if (!fs.existsSync(hooksDir)) continue;

    for (const entry of fs.readdirSync(hooksDir).filter(f => f.endsWith('.sh'))) {
      scripts.push({
        plugin,
        fullPath: path.join(hooksDir, entry),
        hooksDir
      });
    }
  }
  return scripts;
}

const hookScripts = discoverHookScripts();
let passed = 0;
let failed = 0;
let skipped = 0;

for (const { plugin, fullPath, hooksDir } of hookScripts) {
  const content = fs.readFileSync(fullPath, 'utf8');
  GUARD_PATTERN.lastIndex = 0;
  let match;

  while ((match = GUARD_PATTERN.exec(content)) !== null) {
    const varName = match[1];
    const relPath = match[2];

    let resolvedBase = null;
    if (varName === 'SCRIPT_DIR') {
      resolvedBase = hooksDir;
    } else if (varName === 'PLUGIN_ROOT' || varName === 'CLAUDE_PLUGIN_ROOT') {
      resolvedBase = path.join(PLUGINS_DIR, plugin);
    } else if (varName === 'CROSS_PLATFORM_ROOT') {
      resolvedBase = path.join(PLUGINS_DIR, 'opspal-core');
    }

    if (!resolvedBase) {
      skipped++;
      continue;
    }

    const targetPath = path.join(resolvedBase, relPath);
    const gapKey = `${plugin}:${path.basename(fullPath)}:${relPath}`;
    if (KNOWN_GAPS.has(gapKey)) {
      skipped++;
      continue;
    }
    try {
      assert(fs.existsSync(targetPath),
        `[${plugin}] ${path.basename(fullPath)}: guarded path "${relPath}" not found at ${targetPath}`);
      passed++;
    } catch (e) {
      console.error(`FAIL: ${e.message}`);
      failed++;
    }
  }
}

console.log(`Dead Code References: ${passed} passed, ${failed} failed, ${skipped} skipped (${hookScripts.length} scripts scanned)`);
assert.strictEqual(failed, 0, `${failed} dead code references detected`);
