#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function parseArgs(argv) {
  const args = { server: 'hubspot-v4' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--server' && argv[i + 1]) {
      args.server = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function findExistingPath(paths) {
  for (const candidate of paths) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }
  return null;
}

function findAncestorDir(startDir, name, maxDepth = 8) {
  let current = path.resolve(startDir);
  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (path.basename(current) === name) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function buildCandidates(fileName) {
  const candidates = [];
  const explicit = process.env.HUBSPOT_MCP_PATH;
  if (explicit) {
    candidates.push(explicit);
  }

  const serverKey = fileName.includes('v3') ? 'V3' : 'V4';
  const explicitVersion = process.env[`HUBSPOT_MCP_${serverKey}_PATH`];
  if (explicitVersion) {
    candidates.push(explicitVersion);
  }

  const roots = [
    process.env.OPSPAL_INTERNAL_ROOT,
    process.env.REVOPS_INTERNAL_ROOT,
    process.env.REVPAL_INTERNAL_ROOT
  ];

  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (homeDir) {
    roots.push(path.join(homeDir, 'Desktop', 'RevPal', 'Agents', 'opspal-internal'));
    roots.push(path.join(homeDir, 'RevPal', 'Agents', 'opspal-internal'));
  }

  const cwdAncestor = findAncestorDir(process.cwd(), 'opspal-internal');
  if (cwdAncestor) {
    roots.push(cwdAncestor);
  }

  const scriptAncestor = findAncestorDir(__dirname, 'opspal-internal');
  if (scriptAncestor) {
    roots.push(scriptAncestor);
  }

  for (const root of roots) {
    if (!root) continue;
    candidates.push(path.join(root, 'HS', 'scripts', fileName));
    candidates.push(path.join(root, 'opspal-internal', 'HS', 'scripts', fileName));
  }

  return candidates;
}

function spawnServer(command, args, env) {
  const child = spawn(command, args, { stdio: 'inherit', env });
  child.on('exit', (code) => {
    process.exit(code === null ? 1 : code);
  });
}

function main() {
  const { server } = parseArgs(process.argv.slice(2));
  const fileName = server === 'hubspot-enhanced-v3'
    ? 'enhanced-hubspot-mcp-v3.js'
    : 'enhanced-hubspot-mcp-v4.js';

  const candidatePath = findExistingPath(buildCandidates(fileName));
  if (candidatePath) {
    spawnServer(process.execPath, [candidatePath], process.env);
    return;
  }

  const fallbackCommand = process.env.HUBSPOT_MCP_FALLBACK_COMMAND || 'npx';
  const fallbackArgs = process.env.HUBSPOT_MCP_FALLBACK_ARGS
    ? process.env.HUBSPOT_MCP_FALLBACK_ARGS.split(' ').filter(Boolean)
    : ['-y', '@hubspot/mcp-server'];

  console.error(`[hubspot-mcp] Enhanced server not found for ${server}.`);
  console.error('[hubspot-mcp] Set HUBSPOT_MCP_V4_PATH/HUBSPOT_MCP_V3_PATH or OPSPAL_INTERNAL_ROOT.');
  console.error(`[hubspot-mcp] Falling back to: ${fallbackCommand} ${fallbackArgs.join(' ')}`);

  spawnServer(fallbackCommand, fallbackArgs, process.env);
}

main();
