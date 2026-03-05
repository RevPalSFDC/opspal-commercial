#!/usr/bin/env node

/**
 * Dependency Checker for Project Connect
 *
 * Validates all required and optional dependencies before workflow execution.
 * Provides clear installation instructions for missing dependencies.
 */

const { execSync } = require('child_process');
const fs = require('fs');

class DependencyChecker {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.strict = options.strict || false; // If true, fail on optional deps too
    this.results = {
      required: [],
      optional: [],
      passed: true,
      warnings: []
    };
  }

  /**
   * Check all dependencies
   *
   * @returns {Object} { passed: boolean, required: [], optional: [], warnings: [] }
   */
  checkAll() {
    console.log('🔍 Checking dependencies...\n');

    // Required dependencies
    this.checkCommand('gh', 'GitHub CLI', {
      required: true,
      installUrl: 'https://cli.github.com/',
      installCommand: {
        mac: 'brew install gh',
        linux: 'sudo apt install gh',
        windows: 'winget install --id GitHub.cli'
      }
    });

    this.checkCommand('git', 'Git', {
      required: true,
      installUrl: 'https://git-scm.com/downloads',
      installCommand: {
        mac: 'brew install git',
        linux: 'sudo apt install git',
        windows: 'winget install --id Git.Git'
      }
    });

    this.checkCommand('curl', 'cURL', {
      required: true,
      installUrl: 'https://curl.se/download.html',
      installCommand: {
        mac: 'brew install curl',
        linux: 'sudo apt install curl',
        windows: 'Pre-installed on Windows 10+'
      }
    });

    this.checkCommand('node', 'Node.js', {
      required: true,
      installUrl: 'https://nodejs.org/',
      minVersion: '14.0.0',
      installCommand: {
        mac: 'brew install node',
        linux: 'sudo apt install nodejs npm',
        windows: 'winget install --id OpenJS.NodeJS'
      }
    });

    // Required environment variables
    this.checkEnvVar('SUPABASE_URL', 'Supabase Project URL', {
      required: true,
      example: 'https://your-project.supabase.co'
    });

    this.checkEnvVar('SUPABASE_SERVICE_ROLE_KEY', 'Supabase Service Role Key', {
      required: true,
      example: 'eyJhbG...',
      sensitive: true
    });

    // Optional dependencies
    this.checkCommand('jq', 'JSON processor', {
      required: false,
      installUrl: 'https://stedolan.github.io/jq/',
      installCommand: {
        mac: 'brew install jq',
        linux: 'sudo apt install jq',
        windows: 'winget install --id stedolan.jq'
      }
    });

    this.checkEnvVar('ASANA_ACCESS_TOKEN', 'Asana Personal Access Token', {
      required: false,
      setupUrl: '.claude-plugins/cross-platform-plugin/docs/ASANA_PER_USER_AUTHENTICATION.md'
    });

    this.checkEnvVar('GOOGLE_APPLICATION_CREDENTIALS', 'Google Drive OAuth Credentials Path', {
      required: false,
      setupUrl: '.claude-plugins/cross-platform-plugin/docs/GOOGLE_DRIVE_PER_USER_AUTHENTICATION.md'
    });

    // Check npm packages for Drive API (optional)
    this.checkNpmPackage('googleapis', 'Google APIs Client', {
      required: false,
      installCommand: 'npm install googleapis @google-cloud/local-auth'
    });

    // Display results
    this.displayResults();

    return this.results;
  }

  /**
   * Check if a command exists
   */
  checkCommand(command, name, options = {}) {
    const isRequired = options.required !== false;

    try {
      // Check if command exists
      const checkCmd = process.platform === 'win32'
        ? `where ${command}`
        : `which ${command}`;

      execSync(checkCmd, { stdio: 'ignore' });

      // Get version if possible
      let version = null;
      if (options.versionFlag !== false) {
        try {
          const versionCmd = `${command} --version`;
          version = execSync(versionCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
            .split('\n')[0]
            .trim();
        } catch (e) {
          // Version command not supported - that's ok
        }
      }

      const result = {
        name,
        type: 'command',
        command,
        status: 'found',
        version,
        required: isRequired
      };

      if (isRequired) {
        this.results.required.push(result);
      } else {
        this.results.optional.push(result);
      }

      this.log(`✓ ${name} (${command})${version ? ` - ${version}` : ''}`);
      return true;

    } catch (error) {
      const result = {
        name,
        type: 'command',
        command,
        status: 'missing',
        required: isRequired,
        installUrl: options.installUrl,
        installCommand: options.installCommand
      };

      if (isRequired) {
        this.results.required.push(result);
        this.results.passed = false;
        console.error(`✗ ${name} (${command}) - NOT FOUND`);
        this.displayInstallInstructions(command, name, options);
      } else {
        this.results.optional.push(result);
        this.results.warnings.push(`Optional: ${name} not found`);
        console.warn(`⚠ ${name} (${command}) - NOT FOUND (optional)`);
      }

      return false;
    }
  }

  /**
   * Check if environment variable is set
   */
  checkEnvVar(varName, description, options = {}) {
    const isRequired = options.required !== false;
    const value = process.env[varName];
    const isSet = value && value.length > 0;

    if (isSet) {
      const displayValue = options.sensitive
        ? `${value.substring(0, 10)}...`
        : value.length > 50
        ? `${value.substring(0, 50)}...`
        : value;

      const result = {
        name: description,
        type: 'env_var',
        varName,
        status: 'set',
        value: displayValue,
        required: isRequired
      };

      if (isRequired) {
        this.results.required.push(result);
      } else {
        this.results.optional.push(result);
      }

      this.log(`✓ ${description} (${varName})`);
      return true;

    } else {
      const result = {
        name: description,
        type: 'env_var',
        varName,
        status: 'missing',
        required: isRequired,
        example: options.example,
        setupUrl: options.setupUrl
      };

      if (isRequired) {
        this.results.required.push(result);
        this.results.passed = false;
        console.error(`✗ ${description} (${varName}) - NOT SET`);
        if (options.example) {
          console.log(`   Example: export ${varName}="${options.example}"`);
        }
        if (options.setupUrl) {
          console.log(`   Setup guide: ${options.setupUrl}`);
        }
      } else {
        this.results.optional.push(result);
        this.results.warnings.push(`Optional: ${varName} not set`);
        console.warn(`⚠ ${description} (${varName}) - NOT SET (optional)`);
        if (options.setupUrl) {
          console.log(`   Setup guide: ${options.setupUrl}`);
        }
      }

      return false;
    }
  }

  /**
   * Check if npm package is installed
   */
  checkNpmPackage(packageName, description, options = {}) {
    const isRequired = options.required !== false;

    try {
      require.resolve(packageName);

      const result = {
        name: description,
        type: 'npm_package',
        packageName,
        status: 'installed',
        required: isRequired
      };

      if (isRequired) {
        this.results.required.push(result);
      } else {
        this.results.optional.push(result);
      }

      this.log(`✓ ${description} (${packageName})`);
      return true;

    } catch (error) {
      const result = {
        name: description,
        type: 'npm_package',
        packageName,
        status: 'missing',
        required: isRequired,
        installCommand: options.installCommand
      };

      if (isRequired) {
        this.results.required.push(result);
        this.results.passed = false;
        console.error(`✗ ${description} (${packageName}) - NOT INSTALLED`);
        if (options.installCommand) {
          console.log(`   Install: ${options.installCommand}`);
        }
      } else {
        this.results.optional.push(result);
        this.results.warnings.push(`Optional: ${packageName} not installed`);
        console.warn(`⚠ ${description} (${packageName}) - NOT INSTALLED (optional)`);
        if (options.installCommand) {
          console.log(`   Install: ${options.installCommand}`);
        }
      }

      return false;
    }
  }

  /**
   * Display installation instructions
   */
  displayInstallInstructions(command, name, options) {
    if (options.installCommand) {
      console.log(`\n   📦 Installation:`);
      const platform = this.detectPlatform();
      if (options.installCommand[platform]) {
        console.log(`      ${options.installCommand[platform]}`);
      } else {
        console.log(`      macOS:   ${options.installCommand.mac || 'See ' + options.installUrl}`);
        console.log(`      Linux:   ${options.installCommand.linux || 'See ' + options.installUrl}`);
        console.log(`      Windows: ${options.installCommand.windows || 'See ' + options.installUrl}`);
      }
    }
    if (options.installUrl) {
      console.log(`   🔗 ${options.installUrl}`);
    }
    console.log('');
  }

  /**
   * Display final results
   */
  displayResults() {
    console.log('\n' + '═'.repeat(70));
    console.log('Dependency Check Results');
    console.log('═'.repeat(70) + '\n');

    const requiredCount = this.results.required.length;
    const requiredPassed = this.results.required.filter(r => r.status !== 'missing').length;
    const optionalCount = this.results.optional.length;
    const optionalPassed = this.results.optional.filter(r => r.status !== 'missing').length;

    console.log(`Required Dependencies: ${requiredPassed}/${requiredCount} ✓`);
    console.log(`Optional Dependencies: ${optionalPassed}/${optionalCount} ✓`);

    if (this.results.warnings.length > 0) {
      console.log(`\n⚠️  Warnings: ${this.results.warnings.length}`);
      this.results.warnings.forEach(warning => {
        console.log(`   - ${warning}`);
      });
    }

    if (this.results.passed) {
      console.log('\n✅ All required dependencies satisfied!');
      if (optionalPassed < optionalCount) {
        console.log('ℹ️  Some optional features may not be available.');
      }
    } else {
      console.log('\n❌ Missing required dependencies. Please install them before continuing.');
      console.log('   Run this command again after installation to verify.\n');
    }

    console.log('═'.repeat(70) + '\n');
  }

  /**
   * Detect platform
   */
  detectPlatform() {
    switch (process.platform) {
      case 'darwin':
        return 'mac';
      case 'win32':
        return 'windows';
      default:
        return 'linux';
    }
  }

  /**
   * Log message
   */
  log(message) {
    if (this.verbose) {
      console.log(message);
    }
  }
}

// CLI usage
if (require.main === module) {
  const checker = new DependencyChecker({ verbose: true });
  const results = checker.checkAll();

  // Exit with error code if required dependencies missing
  if (!results.passed) {
    process.exit(1);
  }
}

module.exports = DependencyChecker;
