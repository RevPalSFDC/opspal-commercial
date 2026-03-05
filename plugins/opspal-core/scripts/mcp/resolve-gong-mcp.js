#!/usr/bin/env node

/**
 * Gong MCP Server Resolver
 *
 * Resolves and launches the Gong MCP server.
 * Checks: env var override -> known paths -> error.
 *
 * Follows the same pattern as resolve-n8n-mcp.js.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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
  // Priority 1: Explicit path override
  const explicitPath = resolveScriptPath(process.env.GONG_MCP_PATH);
  if (explicitPath) {
    spawnServer(process.execPath, [explicitPath], process.env);
    return;
  }

  // Priority 2: Known location relative to this file
  const knownPaths = [
    path.join(__dirname, 'gong', 'index.js'),
    path.join(__dirname, '..', '..', '..', '..', 'scripts', 'mcp', 'gong', 'index.js')
  ];

  for (const candidate of knownPaths) {
    if (fs.existsSync(candidate)) {
      // Check if node_modules exists, install if not
      const nodeModules = path.join(path.dirname(candidate), 'node_modules');
      if (!fs.existsSync(nodeModules)) {
        console.error('[gong-mcp] Installing dependencies...');
        const { execSync } = require('child_process');
        try {
          execSync('npm install --production', {
            cwd: path.dirname(candidate),
            stdio: 'inherit'
          });
        } catch (err) {
          console.error(`[gong-mcp] npm install failed: ${err.message}`);
          process.exit(1);
        }
      }

      spawnServer(process.execPath, [candidate], process.env);
      return;
    }
  }

  console.error('[gong-mcp] Could not find Gong MCP server.');
  console.error('Set GONG_MCP_PATH environment variable to the index.js path.');
  console.error('Searched paths:');
  knownPaths.forEach(p => console.error(`  - ${p}`));
  process.exit(1);
}

main();
