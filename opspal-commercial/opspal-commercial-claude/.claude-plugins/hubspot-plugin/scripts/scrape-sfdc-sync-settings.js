#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function resolveScriptPath() {
  const explicit = process.env.HUBSPOT_SFDC_SCRAPER_PATH || process.env.HUBSPOT_SFDC_SYNC_SCRAPER;
  if (explicit && fs.existsSync(explicit)) {
    return explicit;
  }

  const repoRoot = path.resolve(__dirname, '../../..');
  const siblingRoot = path.resolve(repoRoot, '..', 'opspal-internal');
  const envRoots = [
    process.env.OPSPAL_INTERNAL_ROOT,
    process.env.REVOPS_INTERNAL_ROOT,
    process.env.REVPAL_INTERNAL_ROOT,
    siblingRoot
  ].filter(Boolean);

  const candidates = [];
  envRoots.forEach(root => {
    candidates.push(path.join(root, 'HS', 'scripts', 'scrape-sfdc-sync-settings.js'));
  });

  const home = process.env.HOME || process.env.USERPROFILE;
  if (home) {
    candidates.push(path.join(home, 'Desktop', 'RevPal', 'Agents', 'opspal-internal', 'HS', 'scripts', 'scrape-sfdc-sync-settings.js'));
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function main() {
  const scriptPath = resolveScriptPath();
  if (!scriptPath) {
    console.error('❌ Could not locate scrape-sfdc-sync-settings.js.');
    console.error('Set HUBSPOT_SFDC_SCRAPER_PATH or OPSPAL_INTERNAL_ROOT to point to opspal-internal/HS.');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const child = spawn('node', [scriptPath, ...args], {
    stdio: 'inherit',
    env: process.env
  });

  child.on('exit', code => process.exit(code || 0));
}

main();
