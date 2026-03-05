#!/usr/bin/env node

// Load environment from .env file
require('fs').readFileSync('.env', 'utf8').split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      process.env[key] = valueParts.join('=');
    }
  }
});

// Run the query script
const { spawn } = require('child_process');
const args = process.argv.slice(2);
const child = spawn('node', ['.claude-plugins/opspal-salesforce/scripts/lib/query-reflections.js', ...args], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => {
  process.exit(code);
});
