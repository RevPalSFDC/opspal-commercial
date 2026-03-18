/**
 * Re-export of child-process-safe from opspal-core.
 * This file exists for backward compatibility - 4+ scripts in opspal-salesforce
 * already require('./child_process_safe') or require('./lib/child_process_safe').
 *
 * The canonical source is: opspal-core/scripts/lib/child-process-safe.js
 */

const path = require('path');

// Try multiple resolution strategies (existing pattern in this codebase)
let mod;
try {
  // Direct relative to opspal-core
  mod = require(path.join(__dirname, '..', '..', '..', 'opspal-core', 'scripts', 'lib', 'child-process-safe'));
} catch (e1) {
  try {
    // Installed plugin path
    mod = require(path.join(__dirname, '..', '..', '..', '..', '.claude-plugins', 'opspal-core', 'scripts', 'lib', 'child-process-safe'));
  } catch (e2) {
    try {
      // User plugins path
      const os = require('os');
      mod = require(path.join(os.homedir(), '.claude', 'plugins', 'marketplaces', 'opspal-core', 'scripts', 'lib', 'child-process-safe'));
    } catch (e3) {
      // Inline fallback: provide basic safe execution
      const { execSync, spawnSync } = require('child_process');

      mod = {
        execSafe(cmd, args = [], opts = {}) {
          const { timeout = 30000, encoding = 'utf-8', cwd, throwOnError = true, ...rest } = opts;
          const result = spawnSync(cmd, args, { timeout, encoding, shell: true, stdio: ['ignore', 'pipe', 'pipe'], cwd, ...rest });
          const stdout = (result.stdout || '').toString().trim();
          const stderr = (result.stderr || '').toString().trim();
          const status = result.status || 0;
          const success = status === 0 && !result.error;
          if (!success && throwOnError) {
            const error = new Error(`Command failed: ${cmd} ${args.join(' ')}\nExit code: ${status}\n${stderr}`);
            error.stdout = stdout; error.stderr = stderr; error.status = status;
            throw error;
          }
          return { stdout, stderr, status, success };
        },
        execShellSafe(cmdString, opts = {}) {
          const { timeout = 30000, encoding = 'utf-8', cwd, throwOnError = true, ...rest } = opts;
          try {
            return execSync(cmdString, { timeout, encoding, cwd, stdio: ['ignore', 'pipe', 'pipe'], ...rest }).toString().trim();
          } catch (error) {
            if (!throwOnError) return (error.stdout || '').toString().trim();
            throw error;
          }
        },
        spawnSafe(...args) { return mod.execSafe(...args); }
      };
    }
  }
}

module.exports = mod;
