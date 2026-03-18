#!/usr/bin/env node

/**
 * OpsPal MCP Server Resolver.
 *
 * Resolves and launches the OpsPal MCP server for stdio transport.
 * For HTTP transport, the .mcp.json entry should use streamable-http directly.
 *
 * Resolution priority:
 *   1. OPSPAL_MCP_PATH env var (absolute path to index.js)
 *   2. Known relative paths (sibling repo, parent directories)
 *   3. Fail closed with clear instructions
 *
 * Fails closed if dependencies are missing (no runtime installs).
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function ensureDependencies(serverDir) {
  const nodeModules = path.join(serverDir, 'node_modules');
  if (fs.existsSync(nodeModules)) return;

  console.error('[opspal-mcp] Missing dependencies: node_modules not found.');
  console.error(`[opspal-mcp] Run install in ${serverDir}:`);
  console.error('  npm ci');
  process.exit(1);
}

function main() {
  // Priority 1: Explicit path override
  const explicitPath = resolveScriptPath(process.env.OPSPAL_MCP_PATH);
  if (explicitPath) {
    ensureDependencies(path.dirname(explicitPath));
    spawnServer(process.execPath, [explicitPath], process.env);
    return;
  }

  // Priority 2: Known locations relative to this resolver
  // This file lives at: plugins/opspal-mcp-client/scripts/mcp/resolve-opspal-mcp.js
  // OpsPalMCP repo could be:
  //   - Sibling to the opspal-internal-plugins repo
  //   - Under the same Agents directory
  const knownPaths = [
    // Relative to opspal-internal-plugins repo root
    path.resolve(__dirname, '../../../../OpsPalMCP/index.js'),
    // Relative to Agents directory
    path.resolve(__dirname, '../../../../../OpsPalMCP/index.js'),
    // Home directory
    path.resolve(process.env.HOME || '', 'Desktop/RevPal/Agents/OpsPalMCP/index.js'),
  ];

  for (const candidate of knownPaths) {
    if (fs.existsSync(candidate)) {
      ensureDependencies(path.dirname(candidate));
      spawnServer(process.execPath, [candidate], process.env);
      return;
    }
  }

  console.error('[opspal-mcp] Could not find OpsPal MCP server.');
  console.error('');
  console.error('Options:');
  console.error('  1. Set OPSPAL_MCP_PATH to the absolute path of OpsPalMCP/index.js');
  console.error('  2. Clone OpsPalMCP as a sibling repo and run npm ci');
  console.error('');
  console.error('Searched paths:');
  knownPaths.forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}

main();
