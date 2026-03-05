#!/usr/bin/env node

/**
 * Initialization Check Script
 * 
 * Checks if the project has been initialized and launches the wizard if needed.
 * Can be used as a wrapper for any script or as a postinstall hook.
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const chalk = require('chalk');

const INITIALIZED_FILE = path.join(__dirname, '..', '.initialized');
const ENV_FILE = path.join(__dirname, '..', '.env');
const SKIP_FILE = path.join(__dirname, '..', '.skip-wizard');

// Check if we should skip the wizard
async function shouldSkipWizard() {
  // Check for CI environment
  if (process.env.CI || process.env.CONTINUOUS_INTEGRATION) {
    return true;
  }
  
  // Check for skip file
  try {
    await fs.access(SKIP_FILE);
    return true;
  } catch {
    // Skip file doesn't exist
  }
  
  // Check for --skip-wizard flag
  if (process.argv.includes('--skip-wizard')) {
    return true;
  }
  
  return false;
}

// Check if project is initialized
async function isInitialized() {
  try {
    await fs.access(INITIALIZED_FILE);
    return true;
  } catch {
    return false;
  }
}

// Check if there's an existing .env file
async function hasExistingConfig() {
  try {
    await fs.access(ENV_FILE);
    const content = await fs.readFile(ENV_FILE, 'utf8');
    // Check if it has actual configuration
    return content.includes('ASANA_ACCESS_TOKEN') || 
           content.includes('SF_TARGET_ORG') ||
           content.includes('SALESFORCE_');
  } catch {
    return false;
  }
}

// Run the setup wizard
async function runWizard(force = false) {
  return new Promise((resolve, reject) => {
    const args = ['scripts/first-run-wizard.js'];
    if (force) args.push('--force');
    
    const wizard = spawn('node', args, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    wizard.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Wizard exited with code ${code}`));
      }
    });
    
    wizard.on('error', (err) => {
      reject(err);
    });
  });
}

// Main check function
async function checkAndInitialize() {
  try {
    // Check if we should skip
    if (await shouldSkipWizard()) {
      return true;
    }
    
    // Check if already initialized
    if (await isInitialized()) {
      return true;
    }
    
    // Check for existing configuration
    if (await hasExistingConfig()) {
      console.log(chalk.yellow('\n⚠️  Existing configuration detected but project not marked as initialized.'));
      console.log(chalk.cyan('This might be from a previous installation.\n'));
      
      // In non-interactive mode, just mark as initialized
      if (!process.stdout.isTTY) {
        await fs.writeFile(INITIALIZED_FILE, new Date().toISOString());
        console.log(chalk.green('✓ Marked project as initialized.'));
        return true;
      }
      
      // In interactive mode, offer to run wizard
      console.log(chalk.blue('Would you like to:'));
      console.log('  1. Run setup wizard to validate/update configuration');
      console.log('  2. Keep existing configuration');
      console.log('  3. Skip for now\n');
      
      // For now, just mark as initialized if config exists
      // In a full implementation, we'd use inquirer here
      await fs.writeFile(INITIALIZED_FILE, new Date().toISOString());
      console.log(chalk.green('✓ Kept existing configuration.'));
      return true;
    }
    
    // No initialization, no config - run wizard
    console.log(chalk.blue.bold('\n🚀 Welcome to ClaudeSFDC!'));
    console.log(chalk.yellow('This appears to be your first time using this project.'));
    console.log(chalk.cyan('Let\'s set up your configuration...\n'));
    
    // Check if in interactive mode
    if (!process.stdout.isTTY) {
      console.log(chalk.yellow('⚠️  Non-interactive mode detected.'));
      console.log(chalk.gray('Run "npm run setup-wizard" to configure the project.'));
      console.log(chalk.gray('Or set CI=true to skip this message.\n'));
      return false;
    }
    
    // Run the wizard
    await runWizard();
    return true;
    
  } catch (error) {
    console.error(chalk.red('❌ Initialization check failed:'), error.message);
    console.log(chalk.yellow('\nYou can run the setup wizard manually with:'));
    console.log(chalk.blue('  npm run setup-wizard\n'));
    return false;
  }
}

// Export for use as a module
module.exports = {
  checkAndInitialize,
  isInitialized,
  hasExistingConfig,
  runWizard
};

// Run if called directly
if (require.main === module) {
  checkAndInitialize().then(success => {
    process.exit(success ? 0 : 1);
  });
}