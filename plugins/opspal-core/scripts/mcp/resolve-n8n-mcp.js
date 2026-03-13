#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function parseArgs(argv) {
  const args = { command: null, args: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--command' && argv[i + 1]) {
      args.command = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--args' && argv[i + 1]) {
      args.args = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function parseArgsValue(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map(String);
    }
  } catch (error) {
    // fallthrough
  }
  return value.split(' ').filter(Boolean);
}

function resolveScriptPath(candidate) {
  if (!candidate) return null;
  const resolved = path.resolve(candidate);
  return fs.existsSync(resolved) ? resolved : null;
}

function spawnServer(command, args, env) {
  const child = spawn(command, args, { stdio: 'inherit', env });
  child.on('exit', (code) => {
    process.exit(code === null ? 1 : code);
  });
}

function main() {
  const cli = parseArgs(process.argv.slice(2));
  const explicitPath = resolveScriptPath(process.env.N8N_MCP_PATH);
  if (explicitPath) {
    spawnServer(process.execPath, [explicitPath], process.env);
    return;
  }

  const command = cli.command
    || process.env.N8N_MCP_COMMAND
    || 'npx';
  const argsValue = cli.args
    || process.env.N8N_MCP_ARGS
    || '-y n8n-mcp-server';
  const args = parseArgsValue(argsValue) || [];

  if (args.length === 0) {
    console.error('[n8n-mcp] No args provided; set N8N_MCP_ARGS or pass --args.');
    process.exit(1);
  }

  spawnServer(command, args, process.env);
}

main();
