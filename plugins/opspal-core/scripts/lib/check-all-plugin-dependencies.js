#!/usr/bin/env node

/**
 * Centralized Plugin Dependency Checker
 *
 * Scans all plugins in .claude-plugins/ and validates npm dependencies.
 * Can auto-install missing packages with --fix flag.
 *
 * Usage:
 *   node check-all-plugin-dependencies.js [--fix] [--plugin <name>] [--verbose]
 *
 * @version 1.0.0
 * @date 2026-01-23
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

// ============================================================================
// ANSI Colors
// ============================================================================

const noColor = 'NO_COLOR' in process.env || !process.stdout.isTTY;

const colors = noColor
  ? { reset: '', green: '', red: '', yellow: '', blue: '', cyan: '', gray: '', bold: '' }
  : {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    bold: '\x1b[1m'
  };

const icons = {
  pass: `${colors.green}✓${colors.reset}`,
  fail: `${colors.red}✗${colors.reset}`,
  warn: `${colors.yellow}⚠${colors.reset}`,
  info: `${colors.blue}ℹ${colors.reset}`,
  skip: `${colors.gray}○${colors.reset}`
};

// ============================================================================
// Configuration
// ============================================================================

// Resolve plugins directory relative to this script
const PLUGINS_DIR = path.resolve(__dirname, '../../../');

// Packages that require special handling (e.g., native dependencies)
const SPECIAL_PACKAGES = {
  'md-to-pdf': {
    note: 'Requires Puppeteer/Chromium. May need: sudo apt-get install -y libgbm-dev libnss3 libatk-bridge2.0-0',
    skipChromium: 'PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1'
  },
  'better-sqlite3': {
    note: 'Native module. Prebuilt binaries are used when available; otherwise build tools may be required.'
  },
  'sharp': {
    note: 'Native module for image processing. May need: brew install vips (macOS) or apt-get install libvips-dev (Linux)'
  }
};

// ============================================================================
// Helpers
// ============================================================================

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?$/;

function isSemver(version) {
  return SEMVER_PATTERN.test(version || '');
}

function compareSemver(a, b) {
  if (a === b) return 0;

  const parse = (v) => {
    const [core, prerelease = ''] = String(v).split('-', 2);
    const [major = '0', minor = '0', patch = '0'] = core.split('.');
    return {
      major: Number(major),
      minor: Number(minor),
      patch: Number(patch),
      prerelease
    };
  };

  const va = parse(a);
  const vb = parse(b);

  if (va.major !== vb.major) return va.major > vb.major ? 1 : -1;
  if (va.minor !== vb.minor) return va.minor > vb.minor ? 1 : -1;
  if (va.patch !== vb.patch) return va.patch > vb.patch ? 1 : -1;

  // Stable releases outrank prerelease variants.
  if (!va.prerelease && vb.prerelease) return 1;
  if (va.prerelease && !vb.prerelease) return -1;

  return va.prerelease.localeCompare(vb.prerelease, undefined, { numeric: true });
}

function winPathToWsl(inputPath) {
  if (!inputPath || !/^[A-Za-z]:\\/.test(inputPath)) return inputPath;
  const drive = inputPath[0].toLowerCase();
  const rest = inputPath.slice(2).replace(/\\/g, '/');
  return `/mnt/${drive}${rest}`;
}

function getClaudeRoots() {
  const candidates = new Set();
  const add = (candidate) => {
    if (!candidate) return;
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      candidates.add(resolved);
    }
  };

  add(path.join(os.homedir(), '.claude'));
  add(process.env.CLAUDE_HOME);
  add(process.env.CLAUDE_CONFIG_DIR);

  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
    add(path.join(winPathToWsl(process.env.USERPROFILE || ''), '.claude'));
    add(`/mnt/c/Users/${process.env.USERNAME || ''}/.claude`);
    add(`/mnt/c/Users/${process.env.USER || ''}/.claude`);
  }

  return Array.from(candidates);
}

function readPluginName(pluginDir) {
  const manifestPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(manifestPath)) return path.basename(pluginDir);

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return manifest.name || path.basename(pluginDir);
  } catch {
    return path.basename(pluginDir);
  }
}

function log(message, type = 'info') {
  const icon = icons[type] || '';
  console.log(`  ${icon} ${message}`);
}

function header(title) {
  console.log(`\n${colors.bold}${colors.cyan}${title}${colors.reset}`);
}

function divider() {
  console.log('=' .repeat(60));
}

/**
 * Check if a package is installed in node_modules
 */
function isPackageInstalled(pluginDir, packageName) {
  const packagePath = path.join(pluginDir, 'node_modules', packageName);
  return fs.existsSync(packagePath);
}

/**
 * Get all plugins with package.json
 */
function discoverPlugins(specificPlugin = null) {
  const plugins = [];
  const seenDirs = new Set();
  const seenNames = new Set();

  const addPlugin = (pluginDir, source) => {
    if (!pluginDir || !fs.existsSync(pluginDir)) return;
    let stat;
    try {
      stat = fs.statSync(pluginDir);
    } catch {
      return;
    }
    if (!stat.isDirectory()) return;

    const packageJsonPath = path.join(pluginDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) return;

    const name = readPluginName(pluginDir);
    if (specificPlugin && name !== specificPlugin && path.basename(pluginDir) !== specificPlugin) {
      return;
    }

    let realPath = pluginDir;
    try {
      realPath = fs.realpathSync(pluginDir);
    } catch {
      // Keep unresolved path fallback.
    }

    if (seenDirs.has(realPath)) return;
    seenDirs.add(realPath);

    // Deduplicate by plugin name — first discovery wins (local > marketplace > cache)
    if (seenNames.has(name)) return;
    seenNames.add(name);

    plugins.push({
      name,
      dir: pluginDir,
      source,
      hasPackageJson: true,
      packageJsonPath
    });
  };

  if (!fs.existsSync(PLUGINS_DIR)) {
    console.error(`${colors.red}Plugins directory not found: ${PLUGINS_DIR}${colors.reset}`);
  } else {
    // Strategy 1: Script is running from a plugin root (e.g., cache install path).
    addPlugin(PLUGINS_DIR, 'current');

    // Strategy 2: Script is running from a parent plugins directory.
    const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules') continue;
      if (entry.name.startsWith('.')) continue;
      if (isSemver(entry.name)) continue;
      addPlugin(path.join(PLUGINS_DIR, entry.name), 'local');
    }
  }

  // Strategy 3: Marketplace installs in Claude directories (Linux/WSL aware).
  for (const claudeRoot of getClaudeRoots()) {
    const marketplacesRoot = path.join(claudeRoot, 'plugins', 'marketplaces');
    if (fs.existsSync(marketplacesRoot)) {
      for (const marketplace of fs.readdirSync(marketplacesRoot)) {
        const pluginsDir = path.join(marketplacesRoot, marketplace, 'plugins');
        if (!fs.existsSync(pluginsDir)) continue;
        for (const pluginEntry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
          if (!pluginEntry.isDirectory()) continue;
          addPlugin(path.join(pluginsDir, pluginEntry.name), `marketplace:${marketplace}`);
        }
      }
    }

    // Strategy 4: Cache installs - scan only latest semver per plugin.
    const cacheRoot = path.join(claudeRoot, 'plugins', 'cache');
    if (!fs.existsSync(cacheRoot)) continue;

    for (const marketplace of fs.readdirSync(cacheRoot)) {
      const marketplaceRoot = path.join(cacheRoot, marketplace);
      if (!fs.existsSync(marketplaceRoot) || !fs.statSync(marketplaceRoot).isDirectory()) continue;

      for (const pluginName of fs.readdirSync(marketplaceRoot)) {
        const pluginCacheRoot = path.join(marketplaceRoot, pluginName);
        if (!fs.existsSync(pluginCacheRoot) || !fs.statSync(pluginCacheRoot).isDirectory()) continue;

        // Skip cache copy if this plugin was already found via marketplace or local
        if (seenNames.has(pluginName)) continue;

        let latestVersion = '';
        let latestPath = '';

        for (const versionEntry of fs.readdirSync(pluginCacheRoot, { withFileTypes: true })) {
          if (!versionEntry.isDirectory()) continue;
          const version = versionEntry.name;
          if (!isSemver(version)) continue;
          if (!latestVersion || compareSemver(version, latestVersion) > 0) {
            latestVersion = version;
            latestPath = path.join(pluginCacheRoot, version);
          }
        }

        if (latestPath) {
          addPlugin(latestPath, `cache:${marketplace}:${latestVersion}`);
        }
      }
    }
  }

  return plugins;
}

/**
 * Check dependencies for a single plugin
 */
function checkPluginDependencies(plugin, verbose = false) {
  const results = {
    plugin: plugin.name,
    source: plugin.source || 'local',
    pluginDir: plugin.dir,
    hasPackageJson: plugin.hasPackageJson,
    dependencies: [],
    devDependencies: [],
    missing: [],
    present: []
  };

  if (!plugin.hasPackageJson) {
    return results;
  }

  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(plugin.packageJsonPath, 'utf8'));
  } catch (e) {
    results.error = `Failed to parse package.json: ${e.message}`;
    return results;
  }

  // Check dependencies
  const deps = packageJson.dependencies || {};
  for (const [name, version] of Object.entries(deps)) {
    const installed = isPackageInstalled(plugin.dir, name);
    const depInfo = { name, version, installed, type: 'dependency' };

    if (SPECIAL_PACKAGES[name]) {
      depInfo.special = SPECIAL_PACKAGES[name];
    }

    results.dependencies.push(depInfo);

    if (installed) {
      results.present.push(depInfo);
    } else {
      results.missing.push(depInfo);
    }
  }

  // Check devDependencies (if verbose)
  if (verbose) {
    const devDeps = packageJson.devDependencies || {};
    for (const [name, version] of Object.entries(devDeps)) {
      const installed = isPackageInstalled(plugin.dir, name);
      const depInfo = { name, version, installed, type: 'devDependency' };

      results.devDependencies.push(depInfo);

      if (installed) {
        results.present.push(depInfo);
      } else {
        results.missing.push(depInfo);
      }
    }
  }

  return results;
}

/**
 * Run npm install in a plugin directory
 */
function installDependencies(pluginDir, pluginName) {
  console.log(`\n${colors.cyan}Installing dependencies for ${pluginName}...${colors.reset}`);

  try {
    // Check for special packages that might need environment variables
    const packageJsonPath = path.join(pluginDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const deps = packageJson.dependencies || {};

    let env = { ...process.env };

    // Handle special packages
    if (deps['md-to-pdf'] && process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD !== '0') {
      // Don't skip by default, but provide info
      console.log(`  ${icons.info} md-to-pdf detected - Puppeteer will download Chromium`);
    }

    // Runtime validation only needs production dependencies.
    const result = spawnSync('npm', ['install', '--omit=dev'], {
      cwd: pluginDir,
      stdio: 'pipe',
      env,
      shell: true,
      timeout: 120000
    });

    if (result.error) {
      console.log(`  ${icons.fail} npm install spawn error: ${result.error.message}`);
      return false;
    }

    if (result.status === 0) {
      console.log(`  ${icons.pass} Dependencies installed successfully`);
      return true;
    } else {
      const stderr = (result.stderr || '').toString().trim();
      const stdout = (result.stdout || '').toString().trim();
      console.log(`  ${icons.fail} npm install failed with exit code ${result.status}`);
      if (stderr) console.log(`  ${colors.gray}stderr: ${stderr.split('\n').slice(-5).join('\n  ')}${colors.reset}`);
      if (!stderr && stdout) console.log(`  ${colors.gray}stdout: ${stdout.split('\n').slice(-5).join('\n  ')}${colors.reset}`);
      return false;
    }
  } catch (e) {
    console.log(`  ${icons.fail} Failed to install: ${e.message}`);
    return false;
  }
}

/**
 * Print results for a plugin
 */
function printPluginResults(results, verbose = false) {
  header(`${results.plugin} ${colors.gray}(${results.source})${colors.reset}`);

  if (!results.hasPackageJson) {
    log('No package.json found', 'skip');
    return;
  }

  if (verbose) {
    log(`Path: ${results.pluginDir}`, 'info');
  }

  if (results.error) {
    log(results.error, 'fail');
    return;
  }

  // Print dependencies
  const allDeps = verbose
    ? [...results.dependencies, ...results.devDependencies]
    : results.dependencies;

  if (allDeps.length === 0) {
    log('No dependencies defined', 'skip');
    return;
  }

  for (const dep of allDeps) {
    const status = dep.installed ? 'pass' : 'fail';
    const typeLabel = dep.type === 'devDependency' ? `${colors.gray}(dev)${colors.reset} ` : '';
    const statusText = dep.installed ? '' : ` ${colors.red}- NOT INSTALLED${colors.reset}`;

    log(`${typeLabel}${dep.name} (${dep.version})${statusText}`, status);

    // Show special package notes
    if (!dep.installed && dep.special) {
      console.log(`    ${colors.yellow}Note: ${dep.special.note}${colors.reset}`);
    }
  }
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  const fix = args.includes('--fix');
  const verbose = args.includes('--verbose') || args.includes('-v');

  // Get specific plugin if provided
  let specificPlugin = null;
  const pluginIndex = args.indexOf('--plugin');
  if (pluginIndex !== -1 && args[pluginIndex + 1]) {
    specificPlugin = args[pluginIndex + 1];
  }

  console.log();
  divider();
  console.log(`${colors.bold}Plugin Dependency Checker${colors.reset}`);
  console.log(`Plugins directory: ${colors.gray}${PLUGINS_DIR}${colors.reset}`);
  divider();

  // Discover plugins
  const plugins = discoverPlugins(specificPlugin);

  if (plugins.length === 0) {
    console.log(`\n${colors.yellow}No plugins found.${colors.reset}`);
    process.exit(0);
  }

  // Check each plugin
  const allResults = [];
  let totalMissing = 0;
  let totalPresent = 0;
  let pluginsWithMissing = [];

  for (const plugin of plugins) {
    const results = checkPluginDependencies(plugin, verbose);
    allResults.push(results);

    printPluginResults(results, verbose);

    totalMissing += results.missing.length;
    totalPresent += results.present.length;

    if (results.missing.length > 0) {
      pluginsWithMissing.push(results);
    }
  }

  // Summary
  console.log();
  divider();
  console.log(`${colors.bold}Summary${colors.reset}`);
  divider();

  console.log(`Plugins scanned: ${plugins.length}`);
  console.log(`Packages present: ${colors.green}${totalPresent}${colors.reset}`);
  console.log(`Packages missing: ${totalMissing > 0 ? colors.red : colors.green}${totalMissing}${colors.reset}`);

  // Fix missing dependencies
  if (fix && pluginsWithMissing.length > 0) {
    console.log(`\n${colors.cyan}Fixing missing dependencies...${colors.reset}`);

    let fixedCount = 0;
    for (const results of pluginsWithMissing) {
      if (installDependencies(results.pluginDir, results.plugin)) {
        fixedCount++;
      }
    }

    console.log(`\n${colors.green}Fixed ${fixedCount}/${pluginsWithMissing.length} plugins${colors.reset}`);
  } else if (totalMissing > 0) {
    console.log(`\n${colors.yellow}Run with --fix to install missing packages${colors.reset}`);
    console.log(`Example: node check-all-plugin-dependencies.js --fix`);
  }

  divider();

  // Exit code based on missing dependencies
  process.exit(totalMissing > 0 && !fix ? 1 : 0);
}

// Run if executed directly
if (require.main === module) {
  main();
}

// Export for use in other scripts
module.exports = {
  discoverPlugins,
  checkPluginDependencies,
  isPackageInstalled,
  installDependencies,
  PLUGINS_DIR,
  SPECIAL_PACKAGES
};
