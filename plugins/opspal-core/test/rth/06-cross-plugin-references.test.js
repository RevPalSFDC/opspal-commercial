#!/usr/bin/env node
'use strict';

/**
 * RTH Test 06: Cross-Plugin References
 *
 * Scans hook scripts for references to scripts in sibling plugins
 * and verifies those targets exist.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PLUGINS_DIR = path.resolve(__dirname, '../../../../plugins');

function discoverHookScripts() {
  const scripts = [];
  const pluginDirs = fs.readdirSync(PLUGINS_DIR).filter(d => {
    return fs.statSync(path.join(PLUGINS_DIR, d)).isDirectory();
  });

  for (const plugin of pluginDirs) {
    const hooksDir = path.join(PLUGINS_DIR, plugin, 'hooks');
    if (!fs.existsSync(hooksDir)) continue;

    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.name.endsWith('.sh')) {
          scripts.push({ plugin, fullPath });
        }
      }
    };
    walk(hooksDir);
  }

  return scripts;
}

const hookScripts = discoverHookScripts();
let passed = 0;
let failed = 0;
let checked = 0;

for (const { plugin, fullPath } of hookScripts) {
  const content = fs.readFileSync(fullPath, 'utf8');

  // Check for CROSS_PLATFORM_ROOT references (typically to opspal-core)
  const coreLibDir = path.join(PLUGINS_DIR, 'opspal-core', 'scripts', 'lib');
  const crossRefPattern = /\$\{?CROSS_PLATFORM_ROOT\}?\/scripts\/lib\/([a-zA-Z0-9_-]+\.js)/g;
  let match;
  while ((match = crossRefPattern.exec(content)) !== null) {
    checked++;
    const targetFile = match[1];
    const targetPath = path.join(coreLibDir, targetFile);
    try {
      assert(fs.existsSync(targetPath),
        `[${plugin}] ${path.basename(fullPath)} references CROSS_PLATFORM_ROOT/scripts/lib/${targetFile} but file not found`);
      passed++;
    } catch (e) {
      console.error(`FAIL: ${e.message}`);
      failed++;
    }
  }
}

console.log(`Cross-Plugin References: ${passed} passed, ${failed} failed (${checked} references in ${hookScripts.length} scripts)`);
assert.strictEqual(failed, 0, `${failed} cross-plugin reference failures detected`);
