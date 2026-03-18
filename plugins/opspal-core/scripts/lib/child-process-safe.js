#!/usr/bin/env node

/**
 * Child Process Safe - Platform-Aware Execution Wrapper
 *
 * Safe wrapper around child_process.execSync/spawnSync with:
 *   - Platform-aware shell selection
 *   - Default timeout (30s, configurable)
 *   - UTF-8 encoding default
 *   - Proper error handling with stderr capture
 *
 * Problem Solved:
 *   - 4+ files require('./child_process_safe') but module didn't exist
 *   - Raw execSync calls with no timeout crash on hangs
 *   - No consistent encoding/error handling across plugins
 *
 * Usage:
 *   const { execSafe, execShellSafe, spawnSafe } = require('./child-process-safe');
 *
 *   // Execute a shell command string (like execSync)
 *   const output = execShellSafe('sf org list --json');
 *
 *   // Execute with spawn (like spawnSync, safer for args with spaces)
 *   const result = spawnSafe('node', ['script.js', '--org', 'my org']);
 *
 * @module child-process-safe
 * @version 1.0.0
 */

const { execSync, spawnSync } = require('child_process');
const os = require('os');
const platformUtils = require('./platform-utils');

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_ENCODING = 'utf-8';

/**
 * Safe wrapper around spawnSync.
 *
 * @param {string} cmd - Command to execute
 * @param {string[]} [args=[]] - Arguments array
 * @param {Object} [opts={}] - Options
 * @param {number} [opts.timeout] - Timeout in ms (default: 30000)
 * @param {string} [opts.encoding] - Output encoding (default: 'utf-8')
 * @param {string} [opts.cwd] - Working directory
 * @param {Object} [opts.env] - Environment variables (merged with process.env)
 * @param {string|boolean} [opts.shell] - Shell to use (auto-detected if true/undefined)
 * @param {string} [opts.input] - Stdin input
 * @param {boolean} [opts.throwOnError] - Throw on non-zero exit (default: true)
 * @returns {{stdout: string, stderr: string, status: number, success: boolean}}
 */
function execSafe(cmd, args = [], opts = {}) {
  const {
    timeout = DEFAULT_TIMEOUT,
    encoding = DEFAULT_ENCODING,
    cwd,
    env,
    shell,
    input,
    throwOnError = true,
    ...rest
  } = opts;

  const spawnOpts = {
    timeout,
    encoding,
    shell: shell === undefined ? true : shell,
    stdio: input ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    ...rest
  };

  if (cwd) spawnOpts.cwd = cwd;
  if (env) spawnOpts.env = { ...process.env, ...env };
  if (input) spawnOpts.input = input;

  const result = spawnSync(cmd, args, spawnOpts);

  const stdout = (result.stdout || '').toString().trim();
  const stderr = (result.stderr || '').toString().trim();
  const status = result.status || 0;
  const success = status === 0 && !result.error;

  if (!success && throwOnError) {
    const error = new Error(
      `Command failed: ${cmd} ${args.join(' ')}\n` +
      `Exit code: ${status}\n` +
      (stderr ? `stderr: ${stderr}\n` : '') +
      (result.error ? `error: ${result.error.message}\n` : '')
    );
    error.stdout = stdout;
    error.stderr = stderr;
    error.status = status;
    error.command = `${cmd} ${args.join(' ')}`;
    throw error;
  }

  return { stdout, stderr, status, success };
}

/**
 * Safe wrapper around execSync for shell command strings.
 *
 * @param {string} cmdString - Full command string to execute in shell
 * @param {Object} [opts={}] - Options
 * @param {number} [opts.timeout] - Timeout in ms (default: 30000)
 * @param {string} [opts.encoding] - Output encoding (default: 'utf-8')
 * @param {string} [opts.cwd] - Working directory
 * @param {Object} [opts.env] - Environment variables (merged with process.env)
 * @param {boolean} [opts.throwOnError] - Throw on error (default: true)
 * @returns {string} stdout output (trimmed)
 */
function execShellSafe(cmdString, opts = {}) {
  const {
    timeout = DEFAULT_TIMEOUT,
    encoding = DEFAULT_ENCODING,
    cwd,
    env,
    throwOnError = true,
    ...rest
  } = opts;

  const execOpts = {
    timeout,
    encoding,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...rest
  };

  if (cwd) execOpts.cwd = cwd;
  if (env) execOpts.env = { ...process.env, ...env };

  try {
    const stdout = execSync(cmdString, execOpts);
    return (stdout || '').toString().trim();
  } catch (error) {
    if (!throwOnError) {
      return (error.stdout || '').toString().trim();
    }

    const enhancedError = new Error(
      `Command failed: ${cmdString}\n` +
      `Exit code: ${error.status}\n` +
      (error.stderr ? `stderr: ${error.stderr.toString().trim()}\n` : '') +
      `error: ${error.message}`
    );
    enhancedError.stdout = (error.stdout || '').toString().trim();
    enhancedError.stderr = (error.stderr || '').toString().trim();
    enhancedError.status = error.status;
    enhancedError.command = cmdString;
    throw enhancedError;
  }
}

/**
 * Safe SOQL query executor using spawnSync with shell: false.
 *
 * Prevents shell injection when SOQL queries contain single quotes
 * (e.g., WHERE Name = 'O\'Reilly') by passing args as an array rather
 * than interpolating them into a shell string.
 *
 * @param {string} query - SOQL query string
 * @param {string} orgAlias - Salesforce org alias (--target-org)
 * @param {Object} [opts={}] - Options
 * @param {number} [opts.timeout] - Timeout in ms (default: 30000)
 * @param {boolean} [opts.useToolingApi] - Add --use-tooling-api flag
 * @param {string} [opts.resultFormat] - Result format (e.g., 'csv', 'human')
 * @param {string} [opts.cwd] - Working directory
 * @param {Object} [opts.env] - Environment variables (merged with process.env)
 * @returns {{ status: number, result: Object }} Parsed JSON response from sf CLI
 * @throws {Error} On non-zero exit code or JSON parse failure
 */
function execSafeSoql(query, orgAlias, opts = {}) {
  const {
    timeout = DEFAULT_TIMEOUT,
    useToolingApi = false,
    resultFormat,
    cwd,
    env
  } = opts;

  const args = [
    'data', 'query',
    '--query', query,
    '--target-org', orgAlias,
    '--json'
  ];

  if (useToolingApi) {
    args.push('--use-tooling-api');
  }

  if (resultFormat) {
    args.push('--result-format', resultFormat);
  }

  const spawnOpts = {
    timeout,
    encoding: DEFAULT_ENCODING,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe']
  };

  if (cwd) spawnOpts.cwd = cwd;
  if (env) spawnOpts.env = { ...process.env, ...env };

  const result = spawnSync('sf', args, spawnOpts);

  const stdout = (result.stdout || '').toString().trim();
  const stderr = (result.stderr || '').toString().trim();
  const status = result.status !== null ? result.status : 1;

  if (result.error) {
    const spawnError = new Error(
      `execSafeSoql spawn error: ${result.error.message}\n` +
      `Query: ${query}\n` +
      `Org: ${orgAlias}`
    );
    spawnError.status = 1;
    spawnError.stderr = stderr;
    throw spawnError;
  }

  if (status !== 0) {
    const exitError = new Error(
      `sf data query failed (exit ${status})\n` +
      (stderr ? `stderr: ${stderr}\n` : '') +
      `Query: ${query}\n` +
      `Org: ${orgAlias}`
    );
    exitError.status = status;
    exitError.stderr = stderr;
    exitError.stdout = stdout;
    throw exitError;
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (parseErr) {
    const jsonError = new Error(
      `execSafeSoql: failed to parse JSON output\n` +
      `Parse error: ${parseErr.message}\n` +
      `Raw output: ${stdout.slice(0, 500)}`
    );
    jsonError.status = status;
    jsonError.stdout = stdout;
    throw jsonError;
  }

  return { status, result: parsed };
}

/**
 * Alias for execSafe (backward compatibility with existing require patterns).
 * Some scripts use `const { spawnSafe } = require('./child_process_safe')`.
 */
const spawnSafe = execSafe;

// =============================================================================
// CLI Interface
// =============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
child-process-safe - Platform-aware command execution

Usage:
  node child-process-safe.js <command> [args...]
  node child-process-safe.js --shell "<shell command string>"

Options:
  --timeout <ms>    Timeout in milliseconds (default: 30000)
  --cwd <dir>       Working directory
  --no-throw        Don't throw on errors

Examples:
  node child-process-safe.js sf org list --json
  node child-process-safe.js --shell "echo hello && echo world"
  node child-process-safe.js --timeout 60000 sf data query -q "SELECT Id FROM Account"
    `);
    process.exit(0);
  }

  // Parse options
  let timeout = DEFAULT_TIMEOUT;
  let shellMode = false;
  let cwd;
  let throwOnError = true;
  const cmdArgs = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--timeout' && args[i + 1]) {
      timeout = parseInt(args[++i], 10);
    } else if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[++i];
    } else if (args[i] === '--shell') {
      shellMode = true;
    } else if (args[i] === '--no-throw') {
      throwOnError = false;
    } else {
      cmdArgs.push(args[i]);
    }
  }

  try {
    if (shellMode) {
      const output = execShellSafe(cmdArgs.join(' '), { timeout, cwd, throwOnError });
      if (output) console.log(output);
    } else {
      const [cmd, ...rest] = cmdArgs;
      const result = execSafe(cmd, rest, { timeout, cwd, throwOnError });
      if (result.stdout) console.log(result.stdout);
      if (result.stderr) console.error(result.stderr);
      process.exit(result.status);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(error.status || 1);
  }
}

module.exports = {
  execSafe,
  execShellSafe,
  execSafeSoql,
  spawnSafe,
  DEFAULT_TIMEOUT,
  DEFAULT_ENCODING
};
