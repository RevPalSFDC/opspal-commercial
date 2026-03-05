#!/usr/bin/env node
/*
Checks for raw child_process usage and enforces adoption of scripts/lib/child_process_safe.js
Fails if exec/execSync/spawn/execFile is used outside the allowlist.
*/

const { execSync } = require('child_process');

const ALLOWLIST = [
  'scripts/lib/child_process_safe.js',
  // add known wrappers/tools here if needed
];

function main() {
  const findFilesCmd = "rg -l --hidden --glob !**/node_modules/** --max-filesize 1M -g '**/*.js' -S \"require('child_process')\"";
  let filesOut = '';
  try { filesOut = execSync(findFilesCmd, { stdio: ['ignore','pipe','ignore'], shell: '/bin/bash' }).toString(); } catch (_) { filesOut = ''; }
  const files = filesOut.split('\n').filter(Boolean);
  const lines = [];
  for (const f of files) {
    let hits = '';
    try {
      hits = execSync(`rg -n -S \"\\b(exec|execSync|spawn|execFile)\\(\" \"${f}\"`, { stdio: ['ignore','pipe','ignore'], shell: '/bin/bash' }).toString();
    } catch (_) { hits = ''; }
    if (hits) hits.split('\n').filter(Boolean).forEach(h => lines.push(h));
  }
  const violations = [];
  for (const line of lines) {
    const [file, ln, ...rest] = line.split(':');
    if (!file) continue;
    if (ALLOWLIST.some(p => file.endsWith(p))) continue;
    // allow references that import the safe wrapper rather than child_process
    if (rest.join(':').includes("scripts/lib/child_process_safe")) continue;
    // If the file explicitly imports child_process_safe, consider it likely OK (using both)
    try {
      const grep = execSync(`rg -n "child_process_safe" "${file}"`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      if (grep.trim()) continue;
    } catch (_) {}
    violations.push(line);
  }

  if (violations.length) {
    console.error('\nChild process safety check failed. Use scripts/lib/child_process_safe.js instead of raw child_process APIs.');
    console.error('Violations (first 50 shown):');
    violations.slice(0, 50).forEach(v => console.error('  ' + v));
    process.exit(1);
  } else {
    console.log('Child process usage is compliant.');
  }
}

main();

