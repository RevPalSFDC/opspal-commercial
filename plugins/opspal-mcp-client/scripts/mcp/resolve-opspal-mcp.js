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

function buildKnownPaths(env = process.env, baseDir = __dirname) {
  return [
    path.resolve(baseDir, '../../../../OpsPalMCP/index.js'),
    path.resolve(baseDir, '../../../../../OpsPalMCP/index.js'),
    path.resolve(env.HOME || '', 'Desktop/RevPal/Agents/OpsPalMCP/index.js')
  ];
}

function resolveServerPath(env = process.env, baseDir = __dirname) {
  // Priority 1: Explicit path override
  const explicitPath = resolveScriptPath(env.OPSPAL_MCP_PATH);
  if (explicitPath) {
    return {
      scriptPath: explicitPath,
      source: 'env'
    };
  }

  // Priority 2: Known locations relative to this resolver
  // This file lives at: plugins/opspal-mcp-client/scripts/mcp/resolve-opspal-mcp.js
  // OpsPalMCP repo could be:
  //   - Sibling to the opspal-internal-plugins repo
  //   - Under the same Agents directory
  const knownPaths = buildKnownPaths(env, baseDir);

  for (const candidate of knownPaths) {
    if (fs.existsSync(candidate)) {
      return {
        scriptPath: candidate,
        source: 'known-path',
        searchedPaths: knownPaths
      };
    }
  }

  return {
    scriptPath: null,
    source: 'not-found',
    searchedPaths: knownPaths
  };
}

function main(env = process.env) {
  const resolved = resolveServerPath(env);

  if (resolved.scriptPath) {
    ensureDependencies(path.dirname(resolved.scriptPath));
    spawnServer(process.execPath, [resolved.scriptPath], env);
    return resolved;
  }

  console.error('[opspal-mcp] Could not find OpsPal MCP server.');
  console.error('');
  console.error('Options:');
  console.error('  1. Set OPSPAL_MCP_PATH to the absolute path of OpsPalMCP/index.js');
  console.error('  2. Clone OpsPalMCP as a sibling repo and run npm ci');
  console.error('');
  console.error('Searched paths:');
  resolved.searchedPaths.forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  main();
}

export {
  buildKnownPaths,
  ensureDependencies,
  main,
  resolveScriptPath,
  resolveServerPath,
  spawnServer
};
