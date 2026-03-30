#!/usr/bin/env node
'use strict';

/**
 * RTH (Runtime Health) Test Suite Runner
 *
 * Discovers and runs all *.test.js files in the rth/ directory.
 * Each test is a standalone Node.js script that exits 0 on pass, non-zero on fail.
 *
 * Usage: node test/rth/rth-runner.js
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RTH_DIR = __dirname;
const testFiles = fs.readdirSync(RTH_DIR)
  .filter(f => f.endsWith('.test.js'))
  .sort();

if (testFiles.length === 0) {
  console.error('No RTH test files found in', RTH_DIR);
  process.exit(1);
}

console.log(`\nRTH Suite: Running ${testFiles.length} tests...\n`);

let totalPass = 0;
let totalFail = 0;
const failures = [];

for (const file of testFiles) {
  const filePath = path.join(RTH_DIR, file);
  const startTime = Date.now();
  const result = spawnSync(process.execPath, [filePath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000
  });
  const elapsed = Date.now() - startTime;

  const stdout = (result.stdout || '').toString().trim();
  const stderr = (result.stderr || '').toString().trim();

  if (result.status === 0) {
    totalPass++;
    console.log(`  PASS  ${file} (${elapsed}ms)`);
  } else {
    totalFail++;
    console.log(`  FAIL  ${file} (${elapsed}ms)`);
    failures.push({ file, stdout, stderr, status: result.status });
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`RTH Suite: ${totalPass} passed, ${totalFail} failed out of ${testFiles.length}`);

if (failures.length > 0) {
  console.log(`\nFailure details:\n`);
  for (const f of failures) {
    console.log(`--- ${f.file} (exit ${f.status}) ---`);
    if (f.stdout) console.log(f.stdout);
    if (f.stderr) console.log(f.stderr);
    console.log('');
  }
}

process.exit(totalFail > 0 ? 1 : 0);
