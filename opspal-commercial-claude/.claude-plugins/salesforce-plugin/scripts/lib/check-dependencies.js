#!/usr/bin/env node

/**
 * Dependency Checker and Installer
 *
 * Validates plugin dependencies and optionally installs missing ones.
 * Supports: npm packages, CLI tools, system utilities
 *
 * Usage:
 *   node check-dependencies.js [--install] [--plugin-path <path>]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

class DependencyChecker {
  constructor(pluginPath, autoInstall = false) {
    this.pluginPath = pluginPath;
    this.autoInstall = autoInstall;
    this.results = {
      npm: { present: [], missing: [] },
      cli: { present: [], missing: [] },
      system: { present: [], missing: [] }
    };
  }

  /**
   * Load plugin manifest
   */
  loadManifest() {
    const manifestPath = path.join(this.pluginPath, '.claude-plugin', 'plugin.json');

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Plugin manifest not found: ${manifestPath}`);
    }

    try {
      const content = fs.readFileSync(manifestPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse manifest: ${error.message}`);
    }
  }

  /**
   * Execute command and check if it succeeds
   */
  execCheck(command) {
    try {
      execSync(command, { stdio: 'pipe', encoding: 'utf8' });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current platform
   */
  getPlatform() {
    const platform = process.platform;
    return platform === 'win32' ? 'win32' : platform === 'darwin' ? 'darwin' : 'linux';
  }

  /**
   * Check npm dependencies
   */
  checkNpmDependencies(dependencies) {
    console.log(`${colors.blue}Checking npm packages...${colors.reset}`);

    for (const [name, config] of Object.entries(dependencies)) {
      const isPresent = this.execCheck(config.check);

      if (isPresent) {
        console.log(`  ${colors.green}✓${colors.reset} ${name} ${colors.gray}(${config.version || 'any'})${colors.reset}`);
        this.results.npm.present.push({ name, config });
      } else {
        console.log(`  ${colors.red}✗${colors.reset} ${name} ${colors.gray}(missing)${colors.reset}`);
        this.results.npm.missing.push({ name, config });

        if (this.autoInstall && config.install) {
          this.installNpmPackage(name, config);
        }
      }
    }
  }

  /**
   * Check CLI tool dependencies
   */
  checkCliDependencies(dependencies) {
    console.log(`\n${colors.blue}Checking CLI tools...${colors.reset}`);

    for (const [name, config] of Object.entries(dependencies)) {
      const isPresent = this.execCheck(config.check);

      if (isPresent) {
        console.log(`  ${colors.green}✓${colors.reset} ${name} ${colors.gray}(${config.version || 'installed'})${colors.reset}`);
        this.results.cli.present.push({ name, config });
      } else {
        console.log(`  ${colors.red}✗${colors.reset} ${name} ${colors.gray}(missing)${colors.reset}`);
        this.results.cli.missing.push({ name, config });

        if (this.autoInstall && config.required) {
          console.log(`    ${colors.yellow}⚠${colors.reset} ${config.description}`);
          console.log(`    ${colors.gray}Install: ${config.install}${colors.reset}`);
        }
      }
    }
  }

  /**
   * Check system dependencies
   */
  checkSystemDependencies(dependencies) {
    console.log(`\n${colors.blue}Checking system utilities...${colors.reset}`);

    for (const [name, config] of Object.entries(dependencies)) {
      const isPresent = this.execCheck(config.check);

      if (isPresent) {
        console.log(`  ${colors.green}✓${colors.reset} ${name} ${colors.gray}(installed)${colors.reset}`);
        this.results.system.present.push({ name, config });
      } else {
        const status = config.required ? colors.red + '✗' : colors.yellow + '⚠';
        const label = config.required ? 'missing' : 'optional';
        console.log(`  ${status}${colors.reset} ${name} ${colors.gray}(${label})${colors.reset}`);
        this.results.system.missing.push({ name, config });

        if (this.autoInstall && config.install) {
          this.installSystemPackage(name, config);
        }
      }
    }
  }

  /**
   * Install npm package
   */
  installNpmPackage(name, config) {
    console.log(`\n  ${colors.blue}Installing ${name}...${colors.reset}`);

    try {
      execSync(config.install, { stdio: 'inherit' });
      console.log(`  ${colors.green}✓${colors.reset} ${name} installed successfully`);
    } catch (error) {
      console.log(`  ${colors.red}✗${colors.reset} Failed to install ${name}`);
      console.log(`    ${colors.gray}Error: ${error.message}${colors.reset}`);
    }
  }

  /**
   * Install system package
   */
  installSystemPackage(name, config) {
    const platform = this.getPlatform();
    const installCmd = typeof config.install === 'string'
      ? config.install
      : config.install[platform];

    if (!installCmd) {
      console.log(`  ${colors.yellow}⚠${colors.reset} No install command for ${platform}`);
      return;
    }

    console.log(`\n  ${colors.blue}Installing ${name}...${colors.reset}`);
    console.log(`  ${colors.gray}Command: ${installCmd}${colors.reset}`);

    if (installCmd.includes('sudo')) {
      console.log(`  ${colors.yellow}⚠${colors.reset} This requires sudo/admin privileges`);
      console.log(`  ${colors.gray}Run manually: ${installCmd}${colors.reset}`);
      return;
    }

    try {
      execSync(installCmd, { stdio: 'inherit' });
      console.log(`  ${colors.green}✓${colors.reset} ${name} installed successfully`);
    } catch (error) {
      console.log(`  ${colors.red}✗${colors.reset} Failed to install ${name}`);
      console.log(`    ${colors.gray}Run manually: ${installCmd}${colors.reset}`);
    }
  }

  /**
   * Print summary
   */
  printSummary(manifest) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${colors.blue}Dependency Check Summary${colors.reset}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Plugin: ${colors.green}${manifest.name}${colors.reset} v${manifest.version}`);
    console.log('');

    const totalPresent = this.results.npm.present.length +
                         this.results.cli.present.length +
                         this.results.system.present.length;

    const totalMissing = this.results.npm.missing.length +
                         this.results.cli.missing.length +
                         this.results.system.missing.length;

    console.log(`${colors.green}✓${colors.reset} Present: ${totalPresent}`);
    console.log(`${colors.red}✗${colors.reset} Missing: ${totalMissing}`);

    // Show missing required dependencies
    const missingRequired = [
      ...this.results.npm.missing.filter(d => d.config.required),
      ...this.results.cli.missing.filter(d => d.config.required),
      ...this.results.system.missing.filter(d => d.config.required)
    ];

    if (missingRequired.length > 0) {
      console.log(`\n${colors.red}⚠ Missing Required Dependencies:${colors.reset}`);
      missingRequired.forEach(({ name, config }) => {
        console.log(`  • ${name}: ${config.description}`);
        const installCmd = typeof config.install === 'string'
          ? config.install
          : config.install[this.getPlatform()];
        if (installCmd) {
          console.log(`    ${colors.gray}Install: ${installCmd}${colors.reset}`);
        }
      });
    }

    // Show missing optional dependencies
    const missingOptional = [
      ...this.results.system.missing.filter(d => !d.config.required)
    ];

    if (missingOptional.length > 0) {
      console.log(`\n${colors.yellow}Optional Dependencies (not required):${colors.reset}`);
      missingOptional.forEach(({ name, config }) => {
        console.log(`  • ${name}: ${config.description}`);
      });
    }

    console.log(`\n${'='.repeat(60)}`);

    if (totalMissing > 0 && !this.autoInstall) {
      console.log(`\n${colors.blue}Tip:${colors.reset} Run with --install flag to auto-install npm packages`);
      console.log(`${colors.gray}Example: node check-dependencies.js --install${colors.reset}`);
    }

    return totalMissing === 0;
  }

  /**
   * Run dependency check
   */
  async run() {
    console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.blue}Plugin Dependency Checker${colors.reset}`);
    console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}\n`);

    const manifest = this.loadManifest();
    const dependencies = manifest.dependencies || {};

    if (dependencies.npm && Object.keys(dependencies.npm).length > 0) {
      this.checkNpmDependencies(dependencies.npm);
    }

    if (dependencies.cli && Object.keys(dependencies.cli).length > 0) {
      this.checkCliDependencies(dependencies.cli);
    }

    if (dependencies.system && Object.keys(dependencies.system).length > 0) {
      this.checkSystemDependencies(dependencies.system);
    }

    const allOk = this.printSummary(manifest);

    return allOk ? 0 : 1;
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const autoInstall = args.includes('--install');

  // Find plugin path
  let pluginPath = args.find(arg => arg.startsWith('--plugin-path='));
  pluginPath = pluginPath
    ? pluginPath.split('=')[1]
    : path.resolve(__dirname, '../..');

  try {
    const checker = new DependencyChecker(pluginPath, autoInstall);
    checker.run().then(exitCode => {
      process.exit(exitCode);
    });
  } catch (error) {
    console.error(`${colors.red}Error:${colors.reset} ${error.message}`);
    process.exit(1);
  }
}

module.exports = DependencyChecker;
