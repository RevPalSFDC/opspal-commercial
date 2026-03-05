#!/usr/bin/env node

/**
 * System Dependency Validator
 *
 * Pre-flight validation for system dependencies to prevent config/env errors.
 * Run BEFORE script execution to catch missing dependencies early.
 *
 * Problem Solved (Reflection Cohort: config/env - 11 reflections):
 *   - Scripts fail due to missing system dependencies (Chrome libraries, jq, etc.)
 *   - Cryptic error messages when dependencies are missing
 *   - OS/version-specific package name confusion (libasound2 vs libasound2t64)
 *   - No clear installation instructions in error messages
 *
 * Capabilities Checked:
 *   - CLI tools (sf, jq, git, curl, pandoc, etc.)
 *   - NPM packages (puppeteer, sharp, etc.)
 *   - System libraries (Chrome dependencies for WSL/Ubuntu)
 *   - Environment variables (SALESFORCE_ORG_ALIAS, etc.)
 *   - Node.js version
 *
 * Usage:
 *   const { validateDependencies, validateFor } = require('./system-dependency-validator');
 *
 *   // Full validation
 *   const result = await validateDependencies();
 *
 *   // Validate for specific feature
 *   const pdfResult = await validateFor('pdf-generation');
 *
 * ROI: Part of $33,000/year config/env error prevention
 *
 * @module system-dependency-validator
 * @version 1.0.0
 * @created 2026-01-08
 * @source Reflection Cohort - config/env (11 reflections)
 */

const { exec, execSync } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

// =============================================================================
// Dependency Definitions
// =============================================================================

const DEPENDENCY_PROFILES = {
  // Core CLI tools
  core: {
    name: 'Core CLI Tools',
    dependencies: {
      'node': {
        type: 'cli',
        check: 'node --version',
        minVersion: '18.0.0',
        description: 'Node.js runtime',
        installCmd: {
          darwin: 'brew install node',
          linux: 'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs',
          win32: 'Download from https://nodejs.org'
        }
      },
      'npm': {
        type: 'cli',
        check: 'npm --version',
        description: 'Node package manager',
        installCmd: {
          default: 'Included with Node.js'
        }
      },
      'git': {
        type: 'cli',
        check: 'git --version',
        description: 'Version control',
        installCmd: {
          darwin: 'brew install git',
          linux: 'sudo apt-get install git',
          win32: 'Download from https://git-scm.com'
        }
      },
      'jq': {
        type: 'cli',
        check: 'jq --version',
        description: 'JSON processor (required for routing)',
        installCmd: {
          darwin: 'brew install jq',
          linux: 'sudo apt-get install jq',
          win32: 'Download from https://stedolan.github.io/jq/download/'
        }
      },
      'curl': {
        type: 'cli',
        check: 'curl --version',
        description: 'HTTP client',
        installCmd: {
          darwin: 'brew install curl',
          linux: 'sudo apt-get install curl',
          win32: 'Download from https://curl.se/windows/'
        }
      }
    }
  },

  // Salesforce CLI
  salesforce: {
    name: 'Salesforce Development',
    dependencies: {
      'sf': {
        type: 'cli',
        check: 'sf version',
        description: 'Salesforce CLI',
        installCmd: {
          darwin: 'npm install -g @salesforce/cli',
          linux: 'npm install -g @salesforce/cli',
          win32: 'npm install -g @salesforce/cli'
        }
      },
      'sfdx': {
        type: 'cli',
        check: 'sfdx --version',
        description: 'Salesforce DX CLI (legacy)',
        optional: true,
        installCmd: {
          default: 'sf CLI includes sfdx commands'
        }
      }
    },
    envVars: {
      'SALESFORCE_ORG_ALIAS': {
        description: 'Default Salesforce org alias',
        optional: true
      }
    }
  },

  // PDF Generation
  'pdf-generation': {
    name: 'PDF Generation',
    dependencies: {
      'md-to-pdf': {
        type: 'npm',
        check: 'md-to-pdf',
        description: 'Markdown to PDF converter (recommended)',
        installCmd: {
          default: 'npm install md-to-pdf'
        }
      },
      'puppeteer': {
        type: 'npm',
        check: 'puppeteer',
        description: 'Headless Chrome for PDF generation',
        installCmd: {
          default: 'npm install puppeteer'
        }
      },
      'pandoc': {
        type: 'cli',
        check: 'pandoc --version',
        optional: true,
        description: 'Universal document converter',
        installCmd: {
          darwin: 'brew install pandoc',
          linux: 'sudo apt-get install pandoc',
          win32: 'Download from https://pandoc.org/installing.html'
        }
      }
    },
    systemLibs: {
      // Required for Puppeteer/Chrome on Linux
      linux: [
        { name: 'libnss3', description: 'Network Security Services' },
        { name: 'libnspr4', description: 'Netscape Portable Runtime' },
        { name: 'libatk1.0-0', description: 'ATK accessibility toolkit' },
        { name: 'libatk-bridge2.0-0', description: 'ATK bridge' },
        { name: 'libcups2', description: 'CUPS libraries' },
        { name: 'libdrm2', description: 'Direct Rendering Manager' },
        { name: 'libxkbcommon0', description: 'XKB keyboard library' },
        { name: 'libxcomposite1', description: 'X11 Composite extension' },
        { name: 'libxdamage1', description: 'X11 Damage extension' },
        { name: 'libxfixes3', description: 'X11 Fixes extension' },
        { name: 'libxrandr2', description: 'X11 RandR extension' },
        { name: 'libgbm1', description: 'Generic Buffer Management' },
        { name: 'libasound2', altName: 'libasound2t64', description: 'ALSA sound library' }
      ]
    }
  },

  // Mermaid Diagrams
  mermaid: {
    name: 'Mermaid Diagrams',
    dependencies: {
      'mmdc': {
        type: 'cli',
        check: 'mmdc --version',
        description: 'Mermaid CLI (best quality)',
        installCmd: {
          default: 'npm install -g @mermaid-js/mermaid-cli'
        }
      }
    }
  },

  // Data Operations
  'data-ops': {
    name: 'Data Operations',
    dependencies: {
      'csvtool': {
        type: 'cli',
        check: 'csvtool --help',
        optional: true,
        description: 'CSV processing utility',
        installCmd: {
          darwin: 'brew install csvtool',
          linux: 'sudo apt-get install csvtool'
        }
      }
    }
  },

  // Web Visualization
  'web-viz': {
    name: 'Web Visualization',
    dependencies: {
      'express': {
        type: 'npm',
        check: 'express',
        optional: true,
        description: 'Web server for dev mode',
        installCmd: {
          default: 'npm install express'
        }
      },
      'ws': {
        type: 'npm',
        check: 'ws',
        optional: true,
        description: 'WebSocket for hot reload',
        installCmd: {
          default: 'npm install ws'
        }
      }
    }
  }
};

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Detect OS and version
 * Delegates to platform-utils.js for core detection (single source of truth),
 * and adds ubuntuVersion for backward compatibility.
 */
function detectOS() {
  let platformInfo;
  try {
    const platformUtils = require('./platform-utils');
    platformInfo = platformUtils.getPlatformInfo();
  } catch (e) {
    // Fallback if platform-utils not available
    platformInfo = null;
  }

  if (platformInfo) {
    const osInfo = {
      platform: platformInfo.platform,
      release: platformInfo.release,
      isWSL: platformInfo.isWSL,
      ubuntuVersion: null
    };

    // Add Ubuntu version (not provided by platform-utils)
    if (platformInfo.platform === 'linux') {
      try {
        const lsbRelease = execSync('lsb_release -rs 2>/dev/null', { encoding: 'utf-8' }).trim();
        osInfo.ubuntuVersion = lsbRelease;
      } catch (e) {
        // Not Ubuntu or lsb_release not available
      }
    }

    return osInfo;
  }

  // Full fallback if platform-utils is unavailable
  const platform = os.platform();
  const release = os.release();

  let osInfo = {
    platform,
    release,
    isWSL: false,
    ubuntuVersion: null
  };

  if (platform === 'linux') {
    try {
      const wslCheck = fs.readFileSync('/proc/version', 'utf-8');
      osInfo.isWSL = wslCheck.toLowerCase().includes('microsoft') ||
                     wslCheck.toLowerCase().includes('wsl');
    } catch (e) {
      // Not WSL or can't read
    }

    try {
      const lsbRelease = execSync('lsb_release -rs 2>/dev/null', { encoding: 'utf-8' }).trim();
      osInfo.ubuntuVersion = lsbRelease;
    } catch (e) {
      // Not Ubuntu or lsb_release not available
    }
  }

  return osInfo;
}

/**
 * Check if CLI command is available
 */
async function checkCliCommand(command) {
  try {
    const { stdout } = await execAsync(command, { timeout: 10000 });
    return { available: true, output: stdout.trim() };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

/**
 * Check if npm package is available
 */
function checkNpmPackage(packageName) {
  try {
    require.resolve(packageName);
    return { available: true };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

/**
 * Check system library availability (Linux only)
 */
async function checkSystemLib(libName, altName = null) {
  if (os.platform() !== 'linux') {
    return { available: true, notApplicable: true };
  }

  try {
    // Try dpkg first
    await execAsync(`dpkg -l | grep -q "^ii.*${libName}"`, { timeout: 5000 });
    return { available: true, name: libName };
  } catch {
    // Try alternative name (e.g., libasound2 vs libasound2t64)
    if (altName) {
      try {
        await execAsync(`dpkg -l | grep -q "^ii.*${altName}"`, { timeout: 5000 });
        return { available: true, name: altName, wasAlternate: true };
      } catch {
        return { available: false };
      }
    }
    return { available: false };
  }
}

/**
 * Check environment variable
 */
function checkEnvVar(varName) {
  const value = process.env[varName];
  return {
    available: !!value,
    value: value ? (value.length > 20 ? value.substring(0, 20) + '...' : value) : null
  };
}

/**
 * Parse version string and compare
 */
function compareVersions(actual, required) {
  if (!actual || !required) return true;

  const actualParts = actual.replace(/^v/, '').split('.').map(Number);
  const requiredParts = required.split('.').map(Number);

  for (let i = 0; i < requiredParts.length; i++) {
    if ((actualParts[i] || 0) < requiredParts[i]) return false;
    if ((actualParts[i] || 0) > requiredParts[i]) return true;
  }
  return true;
}

/**
 * Get installation command for current OS
 */
function getInstallCmd(installCmds) {
  if (!installCmds) return null;

  const platform = os.platform();
  return installCmds[platform] || installCmds.default || null;
}

// =============================================================================
// Main Validation Functions
// =============================================================================

/**
 * Validate all dependencies in a profile
 */
async function validateProfile(profileName, verbose = false) {
  const profile = DEPENDENCY_PROFILES[profileName];
  if (!profile) {
    throw new Error(`Unknown profile: ${profileName}`);
  }

  const results = {
    profile: profileName,
    name: profile.name,
    timestamp: new Date().toISOString(),
    osInfo: detectOS(),
    dependencies: {},
    envVars: {},
    systemLibs: [],
    summary: {
      total: 0,
      available: 0,
      missing: 0,
      optional: 0
    },
    recommendations: []
  };

  // Check dependencies
  if (profile.dependencies) {
    for (const [name, dep] of Object.entries(profile.dependencies)) {
      results.summary.total++;

      let checkResult;
      if (dep.type === 'cli') {
        checkResult = await checkCliCommand(dep.check);
      } else if (dep.type === 'npm') {
        checkResult = checkNpmPackage(dep.check);
      }

      // Check version if required
      let versionOk = true;
      let actualVersion = null;
      if (checkResult.available && dep.minVersion && checkResult.output) {
        const versionMatch = checkResult.output.match(/[\d.]+/);
        actualVersion = versionMatch ? versionMatch[0] : null;
        versionOk = compareVersions(actualVersion, dep.minVersion);
      }

      results.dependencies[name] = {
        available: checkResult.available && versionOk,
        optional: dep.optional || false,
        description: dep.description,
        version: actualVersion,
        minVersion: dep.minVersion,
        installCmd: getInstallCmd(dep.installCmd),
        error: checkResult.error
      };

      if (checkResult.available && versionOk) {
        results.summary.available++;
      } else if (dep.optional) {
        results.summary.optional++;
      } else {
        results.summary.missing++;
        results.recommendations.push({
          priority: 'high',
          dependency: name,
          message: `Missing required dependency: ${name}`,
          action: getInstallCmd(dep.installCmd) || 'Manual installation required'
        });
      }
    }
  }

  // Check environment variables
  if (profile.envVars) {
    for (const [name, config] of Object.entries(profile.envVars)) {
      const checkResult = checkEnvVar(name);
      results.envVars[name] = {
        available: checkResult.available,
        optional: config.optional || false,
        description: config.description,
        value: checkResult.value
      };

      if (!checkResult.available && !config.optional) {
        results.recommendations.push({
          priority: 'medium',
          dependency: name,
          message: `Missing environment variable: ${name}`,
          action: `export ${name}="your-value"`
        });
      }
    }
  }

  // Check system libraries (Linux only)
  if (profile.systemLibs && profile.systemLibs.linux && os.platform() === 'linux') {
    for (const lib of profile.systemLibs.linux) {
      const checkResult = await checkSystemLib(lib.name, lib.altName);
      results.systemLibs.push({
        name: lib.name,
        altName: lib.altName,
        available: checkResult.available,
        usedName: checkResult.name,
        wasAlternate: checkResult.wasAlternate,
        description: lib.description
      });

      if (!checkResult.available) {
        // Get OS-specific package name
        const osInfo = results.osInfo;
        let packageName = lib.name;
        if (osInfo.ubuntuVersion && parseFloat(osInfo.ubuntuVersion) >= 24 && lib.altName) {
          packageName = lib.altName;
        }

        results.recommendations.push({
          priority: 'high',
          dependency: lib.name,
          message: `Missing system library: ${lib.name} (${lib.description})`,
          action: `sudo apt-get install ${packageName}`
        });
      }
    }
  }

  // Calculate score
  results.summary.score = results.summary.total > 0
    ? Math.round((results.summary.available / (results.summary.total - results.summary.optional)) * 100)
    : 100;

  results.summary.ready = results.summary.missing === 0;

  return results;
}

/**
 * Validate dependencies for a specific feature
 */
async function validateFor(feature, verbose = false) {
  return validateProfile(feature, verbose);
}

/**
 * Validate all dependencies across all profiles
 */
async function validateDependencies(options = {}) {
  const { profiles = Object.keys(DEPENDENCY_PROFILES), verbose = false } = options;

  const results = {
    timestamp: new Date().toISOString(),
    osInfo: detectOS(),
    profiles: {},
    summary: {
      totalProfiles: profiles.length,
      readyProfiles: 0,
      totalDependencies: 0,
      availableDependencies: 0,
      missingDependencies: 0
    },
    allRecommendations: []
  };

  for (const profileName of profiles) {
    const profileResult = await validateProfile(profileName, verbose);
    results.profiles[profileName] = profileResult;

    if (profileResult.summary.ready) {
      results.summary.readyProfiles++;
    }

    results.summary.totalDependencies += profileResult.summary.total;
    results.summary.availableDependencies += profileResult.summary.available;
    results.summary.missingDependencies += profileResult.summary.missing;

    results.allRecommendations.push(...profileResult.recommendations);
  }

  // Deduplicate recommendations
  const seen = new Set();
  results.allRecommendations = results.allRecommendations.filter(rec => {
    const key = `${rec.dependency}:${rec.action}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  results.summary.score = results.summary.totalDependencies > 0
    ? Math.round((results.summary.availableDependencies / results.summary.totalDependencies) * 100)
    : 100;

  return results;
}

/**
 * Quick check: Are minimum dependencies available?
 */
async function isReady(feature = 'core') {
  const result = await validateProfile(feature);
  return result.summary.ready;
}

/**
 * Get installation script for missing dependencies
 */
async function getInstallScript(feature = null) {
  const results = feature
    ? await validateProfile(feature)
    : await validateDependencies();

  const recommendations = feature
    ? results.recommendations
    : results.allRecommendations;

  if (recommendations.length === 0) {
    return '# All dependencies are installed!';
  }

  const osInfo = detectOS();
  const lines = [
    '#!/bin/bash',
    '# Auto-generated dependency installation script',
    `# Generated: ${new Date().toISOString()}`,
    `# OS: ${osInfo.platform}${osInfo.isWSL ? ' (WSL)' : ''}`,
    ''
  ];

  // Group by type
  const npmPackages = [];
  const aptPackages = [];
  const brewPackages = [];
  const other = [];

  for (const rec of recommendations) {
    const action = rec.action;
    if (action.includes('npm install')) {
      const pkg = action.match(/npm install (?:-g )?(.+)/)?.[1];
      if (pkg) npmPackages.push(pkg);
    } else if (action.includes('apt-get install')) {
      const pkg = action.match(/apt-get install (.+)/)?.[1];
      if (pkg) aptPackages.push(pkg);
    } else if (action.includes('brew install')) {
      const pkg = action.match(/brew install (.+)/)?.[1];
      if (pkg) brewPackages.push(pkg);
    } else {
      other.push(`# ${rec.message}\n${action}`);
    }
  }

  if (aptPackages.length > 0) {
    lines.push('# System packages (Linux)');
    lines.push(`sudo apt-get update && sudo apt-get install -y ${aptPackages.join(' ')}`);
    lines.push('');
  }

  if (brewPackages.length > 0) {
    lines.push('# System packages (macOS)');
    lines.push(`brew install ${brewPackages.join(' ')}`);
    lines.push('');
  }

  if (npmPackages.length > 0) {
    const globalPkgs = npmPackages.filter(p => p.includes('-g'));
    const localPkgs = npmPackages.filter(p => !p.includes('-g'));

    if (globalPkgs.length > 0) {
      lines.push('# Global npm packages');
      lines.push(`npm install -g ${globalPkgs.join(' ')}`);
      lines.push('');
    }

    if (localPkgs.length > 0) {
      lines.push('# Local npm packages');
      lines.push(`npm install ${localPkgs.join(' ')}`);
      lines.push('');
    }
  }

  if (other.length > 0) {
    lines.push('# Other dependencies');
    lines.push(...other);
    lines.push('');
  }

  return lines.join('\n');
}

// =============================================================================
// Report Formatting
// =============================================================================

/**
 * Format validation results as human-readable report
 */
function formatReport(results, options = {}) {
  const { verbose = false } = options;

  let report = '';
  report += '╔══════════════════════════════════════════════════════════════╗\n';
  report += '║           System Dependency Validation Report                 ║\n';
  report += '╚══════════════════════════════════════════════════════════════╝\n\n';

  // OS Info
  const osInfo = results.osInfo || detectOS();
  report += `📋 System: ${osInfo.platform}`;
  if (osInfo.isWSL) report += ' (WSL)';
  if (osInfo.ubuntuVersion) report += ` Ubuntu ${osInfo.ubuntuVersion}`;
  report += '\n\n';

  // Summary
  if (results.summary) {
    const { score, ready, totalDependencies, availableDependencies, missingDependencies } = results.summary;
    report += `📊 Overall Score: ${score}%\n`;
    report += `   Status: ${ready !== false ? '✅ Ready' : '❌ Not Ready'}\n`;
    report += `   Dependencies: ${availableDependencies || 0}/${totalDependencies || 0} available\n`;
    if (missingDependencies > 0) {
      report += `   Missing: ${missingDependencies}\n`;
    }
    report += '\n';
  }

  // Profile details (if full validation)
  if (results.profiles) {
    for (const [profileName, profile] of Object.entries(results.profiles)) {
      const icon = profile.summary.ready ? '✅' : '❌';
      report += `${icon} ${profile.name} (${profile.summary.available}/${profile.summary.total})\n`;

      if (verbose) {
        for (const [depName, dep] of Object.entries(profile.dependencies || {})) {
          const depIcon = dep.available ? '✓' : (dep.optional ? '○' : '✗');
          report += `   ${depIcon} ${depName}: ${dep.available ? 'Available' : 'Missing'}`;
          if (dep.version) report += ` (v${dep.version})`;
          if (dep.optional) report += ' [optional]';
          report += '\n';
        }
      }
    }
    report += '\n';
  }

  // Single profile dependencies
  if (results.dependencies && !results.profiles) {
    report += '📦 Dependencies:\n';
    for (const [depName, dep] of Object.entries(results.dependencies)) {
      const depIcon = dep.available ? '✅' : (dep.optional ? '⚪' : '❌');
      report += `   ${depIcon} ${depName}: ${dep.description}`;
      if (dep.version) report += ` (v${dep.version})`;
      if (dep.optional) report += ' [optional]';
      report += '\n';
    }
    report += '\n';
  }

  // System libraries
  if (results.systemLibs && results.systemLibs.length > 0) {
    const missing = results.systemLibs.filter(lib => !lib.available);
    if (missing.length > 0) {
      report += '🔧 Missing System Libraries:\n';
      for (const lib of missing) {
        report += `   ❌ ${lib.name}: ${lib.description}\n`;
      }
      report += '\n';
    }
  }

  // Recommendations
  const recommendations = results.allRecommendations || results.recommendations || [];
  if (recommendations.length > 0) {
    report += '💡 Recommendations:\n';
    for (const rec of recommendations) {
      const icon = rec.priority === 'high' ? '🔴' : '🟡';
      report += `   ${icon} ${rec.message}\n`;
      report += `      → ${rec.action}\n`;
    }
    report += '\n';
  }

  // Footer
  report += '─'.repeat(60) + '\n';
  report += `Validated at: ${results.timestamp || new Date().toISOString()}\n`;

  return report;
}

// =============================================================================
// CLI Interface
// =============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);

  const options = {
    verbose: args.includes('-v') || args.includes('--verbose'),
    json: args.includes('--json'),
    help: args.includes('-h') || args.includes('--help'),
    installScript: args.includes('--install-script'),
    profile: args.find(a => a.startsWith('--profile='))?.split('=')[1],
    feature: args.find(a => !a.startsWith('-'))
  };

  if (options.help) {
    console.log(`
System Dependency Validator

Pre-flight validation for system dependencies.

Usage:
  node system-dependency-validator.js [feature] [options]

Features:
  core              Core CLI tools (node, npm, git, jq, curl)
  salesforce        Salesforce development tools (sf CLI)
  pdf-generation    PDF generation capabilities
  mermaid           Mermaid diagram generation
  data-ops          Data operation tools
  web-viz           Web visualization dependencies

Options:
  -v, --verbose      Show detailed breakdown
  --json             Output as JSON
  --install-script   Generate installation script
  -h, --help         Show this help message

Examples:
  # Check all dependencies
  node system-dependency-validator.js

  # Check specific feature
  node system-dependency-validator.js pdf-generation

  # Generate install script
  node system-dependency-validator.js --install-script

  # JSON output for scripting
  node system-dependency-validator.js --json
    `);
    process.exit(0);
  }

  (async () => {
    try {
      let results;

      if (options.feature && DEPENDENCY_PROFILES[options.feature]) {
        results = await validateProfile(options.feature, options.verbose);
      } else {
        results = await validateDependencies({ verbose: options.verbose });
      }

      if (options.installScript) {
        const script = await getInstallScript(options.feature);
        console.log(script);
        process.exit(0);
      }

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log(formatReport(results, { verbose: options.verbose }));
      }

      // Exit with error code if not ready
      const ready = results.summary?.ready !== false &&
                    (results.summary?.missingDependencies || 0) === 0;
      process.exit(ready ? 0 : 1);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = {
  validateDependencies,
  validateFor,
  validateProfile,
  isReady,
  getInstallScript,
  formatReport,
  detectOS,
  DEPENDENCY_PROFILES
};
