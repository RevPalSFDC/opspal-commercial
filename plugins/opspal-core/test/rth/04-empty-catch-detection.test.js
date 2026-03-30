#!/usr/bin/env node
'use strict';

/**
 * RTH Test 04: Empty Catch Detection
 *
 * Scans production JS modules for empty catch blocks that silently
 * swallow errors.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PLUGINS_DIR = path.resolve(__dirname, '../../../../plugins');

// Pre-existing empty catches that are intentional (file:line format)
const ALLOWLIST = new Set([
  'opspal-salesforce/scripts/lib/folder-manager.js:33',       // mkdir -p equivalent: file-not-found is expected
  'opspal-salesforce/scripts/lib/metadata-verifier.js:146',   // optional metadata parse: missing file is valid state
  'opspal-salesforce/scripts/lib/resilient-deployer.js:83'    // retry-on-failure: error triggers retry logic upstream
]);

// Regex patterns for empty catch blocks
const EMPTY_CATCH_PATTERNS = [
  /catch\s*\([^)]*\)\s*\{\s*\}/g,
  /catch\s*\{\s*\}/g
];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations = [];

  for (const pattern of EMPTY_CATCH_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      violations.push({ line: lineNum, match: match[0].trim() });
    }
  }

  return violations;
}

function discoverJsFiles() {
  const files = [];
  const pluginDirs = fs.readdirSync(PLUGINS_DIR).filter(d => {
    return fs.statSync(path.join(PLUGINS_DIR, d)).isDirectory();
  });

  for (const plugin of pluginDirs) {
    const libDir = path.join(PLUGINS_DIR, plugin, 'scripts', 'lib');
    if (!fs.existsSync(libDir)) continue;

    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
          walk(fullPath);
        } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
          files.push(fullPath);
        }
      }
    };

    walk(libDir);
  }

  return files;
}

const jsFiles = discoverJsFiles();
let totalViolations = 0;
const violationDetails = [];

for (const filePath of jsFiles) {
  const relPath = path.relative(PLUGINS_DIR, filePath);
  const violations = scanFile(filePath);
  if (violations.length > 0) {
    for (const v of violations) {
      const key = `${relPath}:${v.line}`;
      if (ALLOWLIST.has(key)) continue;
      totalViolations++;
      violationDetails.push(key);
      console.error(`FAIL: Empty catch at ${key}`);
    }
  }
}

console.log(`Empty Catch Detection: Scanned ${jsFiles.length} files, found ${totalViolations} violations`);
assert.strictEqual(totalViolations, 0,
  `Found ${totalViolations} empty catch block(s):\n  ${violationDetails.join('\n  ')}`);
