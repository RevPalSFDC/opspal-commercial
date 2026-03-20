#!/usr/bin/env node

/**
 * Hook Test Runner (P2-2)
 *
 * Framework for testing Claude Code hooks with unit and integration tests.
 * Provides HookTester for individual hooks and HookChainTester for chains.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const { spawn, execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// =============================================================================
// Configuration
// =============================================================================

const PROJECT_ROOT = path.resolve(__dirname, '../../../..');
const PLUGINS_DIR = path.join(PROJECT_ROOT, 'plugins');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const COVERAGE_DIR = path.join(__dirname, 'coverage');

const DEFAULT_TIMEOUT = 10000; // 10 seconds
const DEFAULT_ENV = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  NODE_PATH: process.env.NODE_PATH,
  HOOK_TEST_MODE: '1'
};

function allowsPlainTextStdout(input = {}) {
  return input.hook_event_name === 'UserPromptSubmit' || input.hook_event_name === 'SessionStart';
}

function parseHookStdout(stdout, exitCode, input = {}) {
  const parsedResult = {
    output: null,
    hookSpecificOutput: null,
    parseError: null
  };

  if (exitCode !== 0) {
    return parsedResult;
  }

  const trimmed = stdout.trim();
  if (!trimmed) {
    return parsedResult;
  }

  if (!trimmed.startsWith('{')) {
    parsedResult.output = trimmed;
    if (!allowsPlainTextStdout(input)) {
      parsedResult.parseError = 'Hook stdout must be valid JSON or empty for this event';
    }
    return parsedResult;
  }

  try {
    parsedResult.output = JSON.parse(trimmed);
    parsedResult.hookSpecificOutput = parsedResult.output.hookSpecificOutput || null;
  } catch (e) {
    parsedResult.output = trimmed;
    parsedResult.parseError = e.message;
  }

  return parsedResult;
}

// =============================================================================
// HookTester - Unit Test Individual Hooks
// =============================================================================

class HookTester {
  /**
   * Creates a hook tester
   * @param {string} hookPath - Relative path to hook from project root
   * @param {Object} options - Test options
   */
  constructor(hookPath, options = {}) {
    this.hookPath = path.isAbsolute(hookPath)
      ? hookPath
      : path.join(PROJECT_ROOT, hookPath);
    this.options = {
      timeout: options.timeout || DEFAULT_TIMEOUT,
      verbose: options.verbose || false,
      ...options
    };

    if (!fs.existsSync(this.hookPath)) {
      throw new Error(`Hook not found: ${this.hookPath}`);
    }
  }

  /**
   * Runs the hook with given input
   * @param {Object} params - Test parameters
   * @returns {Promise<Object>} Test result
   */
  async run(params = {}) {
    const {
      input = {},
      env = {},
      stdin = null,
      timeout = this.options.timeout
    } = params;

    const startTime = Date.now();
    const inputJson = stdin || JSON.stringify(input);

    return new Promise((resolve, reject) => {
      const proc = spawn('bash', [this.hookPath], {
        cwd: path.dirname(this.hookPath),
        env: { ...DEFAULT_ENV, ...env },
        timeout
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Send input to stdin (ignore EPIPE if hook exits early)
      proc.stdin.on('error', (err) => {
        if (err.code !== 'EPIPE') {
          reject(new Error(`Hook stdin error: ${err.message}`));
        }
      });
      try {
        proc.stdin.write(inputJson);
        proc.stdin.end();
      } catch (err) {
        if (err.code !== 'EPIPE') {
          reject(new Error(`Hook stdin error: ${err.message}`));
        }
      }

      proc.on('close', (code) => {
        const duration = Date.now() - startTime;
        const parsed = parseHookStdout(stdout, code, input);

        resolve({
          exitCode: code,
          stdout,
          stderr,
          output: parsed.output,
          hookSpecificOutput: parsed.hookSpecificOutput,
          parseError: parsed.parseError,
          duration,
          input,
          hookPath: this.hookPath
        });
      });

      proc.on('error', (err) => {
        reject(new Error(`Hook execution failed: ${err.message}`));
      });
    });
  }

  /**
   * Validates hook exists and is executable
   * @returns {Object} Validation result
   */
  validate() {
    const result = {
      exists: false,
      executable: false,
      syntaxValid: false,
      errors: []
    };

    if (!fs.existsSync(this.hookPath)) {
      result.errors.push('Hook file not found');
      return result;
    }
    result.exists = true;

    // Check executable
    try {
      fs.accessSync(this.hookPath, fs.constants.X_OK);
      result.executable = true;
    } catch (e) {
      result.errors.push('Hook is not executable');
    }

    // Check bash syntax
    // Use stdio=ignore to avoid EPERM on some environments when piping is restricted.
    try {
      execSync(`bash -n "${this.hookPath}"`, { stdio: 'ignore' });
      result.syntaxValid = true;
    } catch (e) {
      result.errors.push(`Syntax error: ${e.stderr?.toString() || e.message}`);
    }

    return result;
  }
}

// =============================================================================
// HookChainTester - Integration Test Hook Chains
// =============================================================================

class HookChainTester {
  /**
   * Creates a hook chain tester
   * @param {Array<string>} hookPaths - Array of hook paths in execution order
   * @param {Object} options - Test options
   */
  constructor(hookPaths, options = {}) {
    this.hooks = hookPaths.map(p => new HookTester(p, options));
    this.options = options;
  }

  /**
   * Runs the hook chain
   * @param {Object} params - Test parameters
   * @returns {Promise<Object>} Chain result
   */
  async run(params = {}) {
    const {
      input = {},
      env = {},
      validateBetween = true
    } = params;

    const results = [];
    let currentInput = input;
    let allPassed = true;

    for (const hook of this.hooks) {
      const result = await hook.run({
        input: currentInput,
        env
      });

      results.push({
        hook: hook.hookPath,
        ...result
      });

      if (result.exitCode !== 0) {
        allPassed = false;
        if (this.options.stopOnFailure) {
          break;
        }
      }

      // Use output as input for next hook (if valid JSON)
      if (result.output && typeof result.output === 'object') {
        currentInput = result.output;
      }
    }

    return {
      allPassed,
      hookCount: this.hooks.length,
      executedCount: results.length,
      results,
      finalOutput: results[results.length - 1]?.output,
      totalDuration: results.reduce((sum, r) => sum + r.duration, 0)
    };
  }
}

// =============================================================================
// Test Discovery
// =============================================================================

/**
 * Discovers all hooks in the plugins directory
 * @returns {Array<Object>} Array of hook info objects
 */
function discoverHooks() {
  const hooks = [];
  const SKIP_DIRS = new Set([
    'node_modules',
    '.git',
    '.github',
    'dist',
    'build',
    'coverage',
    'test-output',
    'tmp',
    'temp',
    '.cache'
  ]);

  function scanDir(dir, plugin = null, inHooksDir = false) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        // Check if this is a plugin directory
        const isPluginDir = entry.name !== '.claude-plugin' && (
          entry.name.startsWith('opspal-') || entry.name.endsWith('-plugin')
        );
        if (isPluginDir) {
          scanDir(fullPath, entry.name, inHooksDir);
        } else if (entry.name === 'hooks') {
          scanDir(fullPath, plugin, true);
        } else {
          scanDir(fullPath, plugin, inHooksDir);
        }
      } else if (entry.isFile() && entry.name.endsWith('.sh')) {
        if (!inHooksDir) continue;
        const relativePath = path.relative(PROJECT_ROOT, fullPath);

        hooks.push({
          name: entry.name.replace('.sh', ''),
          path: fullPath,
          relativePath,
          plugin: plugin || 'root',
          type: getHookType(entry.name)
        });
      }
    }
  }

  scanDir(PLUGINS_DIR);
  return hooks;
}

/**
 * Determines hook type from filename
 * @param {string} filename - Hook filename
 * @returns {string} Hook type
 */
function getHookType(filename) {
  if (filename.startsWith('pre-')) return 'pre';
  if (filename.startsWith('post-')) return 'post';
  if (filename.startsWith('session-')) return 'session';
  return 'other';
}

/**
 * Discovers test files
 * @returns {Array<string>} Test file paths
 */
function discoverTests() {
  const testDirs = [
    path.join(__dirname, 'unit'),
    path.join(__dirname, 'integration')
  ];

  const tests = [];

  for (const dir of testDirs) {
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js'));
    for (const file of files) {
      tests.push(path.join(dir, file));
    }
  }

  return tests;
}

// =============================================================================
// Test Runner
// =============================================================================

/**
 * Runs all tests
 * @param {Object} options - Run options
 * @returns {Promise<Object>} Test results
 */
async function runTests(options = {}) {
  const {
    filter = null,
    verbose = false,
    coverage = false,
    integration = false
  } = options;

  const allHooks = discoverHooks();
  const testFiles = discoverTests();

  console.log(`\n🧪 Hook Test Runner\n`);
  console.log(`Discovered: ${allHooks.length} hooks, ${testFiles.length} test files\n`);

  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    coverage: null
  };

  // Filter test files
  let filesToRun = testFiles;
  if (filter) {
    filesToRun = testFiles.filter(f => f.includes(filter));
  }
  if (integration) {
    filesToRun = filesToRun.filter(f => f.includes('integration'));
  }

  // Run each test file
  for (const testFile of filesToRun) {
    const testName = path.basename(testFile, '.test.js');
    console.log(`Running: ${testName}`);

    try {
      // Execute test file with Node
      execFileSync('node', [testFile], {
        cwd: __dirname,
        stdio: 'inherit',
        env: { ...process.env, HOOK_TEST_MODE: '1' }
      });
      results.passed++;
      console.log(`  ✅ Passed`);
    } catch (e) {
      results.failed++;
      results.errors.push({
        test: testName,
        error: e.stderr?.toString() || e.message
      });
      console.log(`  ❌ Failed`);
      if (verbose) {
        console.log(`     ${e.message}`);
      }
    }
  }

  // Generate coverage if requested
  if (coverage) {
    results.coverage = generateCoverage(allHooks, testFiles);
  }

  // Summary
  console.log(`\n📊 Results\n`);
  console.log(`  Passed:  ${results.passed}`);
  console.log(`  Failed:  ${results.failed}`);
  console.log(`  Skipped: ${results.skipped}`);

  if (coverage && results.coverage) {
    console.log(`\n📈 Coverage: ${results.coverage.percentage}%`);
    console.log(`  Tested:   ${results.coverage.tested}/${results.coverage.total} hooks`);
  }

  return results;
}

/**
 * Generates coverage report
 * @param {Array} hooks - All discovered hooks
 * @param {Array} tests - All test files
 * @returns {Object} Coverage data
 */
function generateCoverage(hooks, tests) {
  // Map hooks to test files
  const testedHooks = new Set();

  for (const test of tests) {
    const testName = path.basename(test, '.test.js');
    const normalizedTestName = testName.replace(/^(hubspot|marketo|salesforce|core)-/, '');
    // Find hooks that match the test name
    for (const hook of hooks) {
      if (
        hook.name === testName ||
        hook.name.includes(testName) ||
        hook.name === normalizedTestName ||
        hook.name.includes(normalizedTestName)
      ) {
        testedHooks.add(hook.path);
      }
    }
  }

  const coverage = {
    total: hooks.length,
    tested: testedHooks.size,
    untested: hooks.length - testedHooks.size,
    percentage: Math.round((testedHooks.size / hooks.length) * 100),
    byPlugin: {},
    untestedHooks: hooks.filter(h => !testedHooks.has(h.path)).map(h => h.relativePath)
  };

  // Group by plugin
  for (const hook of hooks) {
    if (!coverage.byPlugin[hook.plugin]) {
      coverage.byPlugin[hook.plugin] = { total: 0, tested: 0 };
    }
    coverage.byPlugin[hook.plugin].total++;
    if (testedHooks.has(hook.path)) {
      coverage.byPlugin[hook.plugin].tested++;
    }
  }

  // Save coverage report
  if (!fs.existsSync(COVERAGE_DIR)) {
    fs.mkdirSync(COVERAGE_DIR, { recursive: true });
  }
  fs.writeFileSync(
    path.join(COVERAGE_DIR, 'hook-coverage.json'),
    JSON.stringify(coverage, null, 2)
  );

  return coverage;
}

// =============================================================================
// CLI Interface
// =============================================================================

function printHelp() {
  console.log(`
Hook Test Runner - Test Claude Code hooks

Usage:
  node runner.js [options]

Options:
  --file <name>     Run specific test file
  --coverage        Generate coverage report
  --integration     Run integration tests only
  --verbose         Show detailed output
  --list            List all hooks
  --validate        Validate all hooks (syntax, permissions)
  --help            Show this help

Examples:
  node runner.js                           # Run all tests
  node runner.js --coverage                # Run with coverage
  node runner.js --file agent-validator    # Run specific test
  node runner.js --list                    # List all hooks
  node runner.js --validate                # Validate hooks
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    printHelp();
    return;
  }

  if (args.includes('--list')) {
    const hooks = discoverHooks();
    console.log(`\n📋 Discovered Hooks (${hooks.length})\n`);

    const byPlugin = {};
    for (const hook of hooks) {
      if (!byPlugin[hook.plugin]) byPlugin[hook.plugin] = [];
      byPlugin[hook.plugin].push(hook);
    }

    for (const [plugin, pluginHooks] of Object.entries(byPlugin)) {
      console.log(`\n${plugin} (${pluginHooks.length}):`);
      for (const hook of pluginHooks) {
        console.log(`  - ${hook.name} [${hook.type}]`);
      }
    }
    return;
  }

  if (args.includes('--validate')) {
    const hooks = discoverHooks();
    console.log(`\n🔍 Validating ${hooks.length} hooks...\n`);

    let valid = 0;
    let invalid = 0;

    for (const hook of hooks) {
      const tester = new HookTester(hook.path);
      const result = tester.validate();

      if (result.errors.length === 0) {
        valid++;
      } else {
        invalid++;
        console.log(`❌ ${hook.relativePath}`);
        for (const err of result.errors) {
          console.log(`   - ${err}`);
        }
      }
    }

    console.log(`\n✅ Valid: ${valid}`);
    console.log(`❌ Invalid: ${invalid}`);
    return;
  }

  // Run tests
  const fileIdx = args.indexOf('--file');
  const filter = fileIdx !== -1 ? args[fileIdx + 1] : null;

  const results = await runTests({
    filter,
    verbose: args.includes('--verbose'),
    coverage: args.includes('--coverage'),
    integration: args.includes('--integration')
  });

  process.exit(results.failed > 0 ? 1 : 0);
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  HookTester,
  HookChainTester,
  discoverHooks,
  discoverTests,
  runTests,
  generateCoverage
};

// Run if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
