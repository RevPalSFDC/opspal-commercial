#!/usr/bin/env node

/**
 * Fireflies MCP Server Resolver
 *
 * Resolves and launches the Fireflies MCP server.
 * Checks: env var override -> known paths -> error.
 *
 * Follows the same pattern as resolve-gong-mcp.js.
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
  // Check disabled flag
  if (process.env.FIREFLIES_MCP_DISABLED === 'true' || process.env.FIREFLIES_MCP_DISABLED === '1') {
    console.error('[fireflies-mcp] Disabled via FIREFLIES_MCP_DISABLED env var.');
    process.exit(0);
  }

  // Priority 1: Explicit path override
  const explicitPath = resolveScriptPath(process.env.FIREFLIES_MCP_PATH);
  if (explicitPath) {
    console.error(`[fireflies-mcp] Using explicit path: ${explicitPath}`);
    spawnServer(process.execPath, [explicitPath], process.env);
    return;
  }

  // Priority 2: Known location relative to this file
  const knownPaths = [
    path.join(__dirname, 'fireflies', 'index.js'),
    path.join(__dirname, '..', '..', '..', '..', 'scripts', 'mcp', 'fireflies', 'index.js')
  ];

  for (const candidate of knownPaths) {
    if (fs.existsSync(candidate)) {
      console.error(`[fireflies-mcp] Resolved server at: ${candidate}`);

      // Check if node_modules exists, install if not
      const nodeModules = path.join(path.dirname(candidate), 'node_modules');
      if (!fs.existsSync(nodeModules)) {
        console.error('[fireflies-mcp] Installing dependencies...');
        const { execSync } = require('child_process');
        try {
          execSync('npm install --production', {
            cwd: path.dirname(candidate),
            stdio: 'inherit'
          });
        } catch (err) {
          console.error(`[fireflies-mcp] npm install failed: ${err.message}`);
          process.exit(1);
        }
      }

      spawnServer(process.execPath, [candidate], process.env);
      return;
    }
  }

  console.error('[fireflies-mcp] Could not find Fireflies MCP server.');
  console.error('Set FIREFLIES_MCP_PATH environment variable to the index.js path.');
  console.error('Searched paths:');
  knownPaths.forEach(p => console.error(`  - ${p}`));
  process.exit(1);
}

main();
