#!/usr/bin/env node

/**
 * Configuration Manager for ClaudeSFDC
 * 
 * Provides commands to manage project configuration:
 * - show: Display current configuration (without secrets)
 * - test: Test all connections
 * - reset: Clear configuration
 * - export: Export configuration for sharing
 * - import: Import configuration from file
 * - migrate: Migrate from old configuration format
 */

const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Configuration file paths
const ENV_FILE = path.join(__dirname, '..', '.env');
const INITIALIZED_FILE = path.join(__dirname, '..', '.initialized');
const CONFIG_FILE = path.join(__dirname, '..', '.first-run-config.json');
const BACKUP_DIR = path.join(__dirname, '..', '.config-backups');

// Command handlers
const commands = {
  show: showConfig,
  test: testConfig,
  reset: resetConfig,
  export: exportConfig,
  import: importConfig,
  migrate: migrateConfig,
  backup: backupConfig,
  restore: restoreConfig,
  validate: validateConfig
};

// Show current configuration
async function showConfig() {
  console.log(chalk.blue.bold('\n📋 Current Configuration\n'));
  
  try {
    // Check if initialized
    try {
      await fs.access(INITIALIZED_FILE);
      console.log(chalk.green('✓ Project initialized'));
    } catch {
      console.log(chalk.yellow('⚠ Project not initialized'));
    }
    
    // Read .env file
    const envContent = await fs.readFile(ENV_FILE, 'utf8');
    const lines = envContent.split('\n');
    
    // Parse and display configuration
    const config = {};
    let currentSection = 'General';
    
    lines.forEach(line => {
      if (line.startsWith('#')) {
        currentSection = line.replace('#', '').trim();
      } else if (line.includes('=')) {
        const [key, value] = line.split('=');
        if (!config[currentSection]) config[currentSection] = {};
        
        // Mask sensitive values
        const maskedValue = maskSensitiveValue(key, value);
        config[currentSection][key] = maskedValue;
      }
    });
    
    // Display configuration by section
    Object.entries(config).forEach(([section, values]) => {
      if (Object.keys(values).length > 0) {
        console.log(chalk.yellow(`\n${section}:`));
        Object.entries(values).forEach(([key, value]) => {
          console.log(`  ${chalk.gray(key)}: ${value}`);
        });
      }
    });
    
    // Check for config.json
    try {
      await fs.access(CONFIG_FILE);
      console.log(chalk.gray('\n✓ Full configuration backup available'));
    } catch {
      // No config file
    }
    
  } catch (error) {
    console.error(chalk.red('❌ No configuration found'));
    console.log(chalk.yellow('Run "npm run setup-wizard" to configure the project'));
  }
}

// Mask sensitive values
function maskSensitiveValue(key, value) {
  const sensitiveKeys = ['TOKEN', 'KEY', 'SECRET', 'PASSWORD', 'WEBHOOK'];
  
  if (sensitiveKeys.some(sensitive => key.includes(sensitive))) {
    if (value && value.length > 0) {
      const visibleChars = Math.min(4, Math.floor(value.length / 4));
      return value.substring(0, visibleChars) + '*'.repeat(Math.max(8, value.length - visibleChars));
    }
  }
  
  return value;
}

// Test all connections
async function testConfig() {
  console.log(chalk.blue.bold('\n🧪 Testing Configuration\n'));
  
  try {
    // Read configuration
    const envContent = await fs.readFile(ENV_FILE, 'utf8');
    const config = parseEnvContent(envContent);
    
    const results = [];
    
    // Test Salesforce connection
    if (config.SF_TARGET_ORG) {
      const spinner = ora('Testing Salesforce connection...').start();
      try {
        const { stdout } = await execAsync(`sf org display --target-org ${config.SF_TARGET_ORG} --json`);
        const result = JSON.parse(stdout);
        spinner.succeed(chalk.green(`Salesforce: Connected to ${result.result.username}`));
        results.push({ name: 'Salesforce', status: 'passed' });
      } catch (error) {
        spinner.fail(chalk.red('Salesforce: Connection failed'));
        results.push({ name: 'Salesforce', status: 'failed', error: error.message });
      }
    }
    
    // Test Asana connection
    if (config.ASANA_ACCESS_TOKEN) {
      const spinner = ora('Testing Asana connection...').start();
      try {
        const response = await axios.get('https://app.asana.com/api/1.0/users/me', {
          headers: { 'Authorization': `Bearer ${config.ASANA_ACCESS_TOKEN}` }
        });
        spinner.succeed(chalk.green(`Asana: Connected as ${response.data.data.name}`));
        results.push({ name: 'Asana', status: 'passed' });
      } catch (error) {
        spinner.fail(chalk.red('Asana: Connection failed'));
        results.push({ name: 'Asana', status: 'failed', error: error.response?.data?.errors?.[0]?.message || error.message });
      }
    }
    
    // Test Slack webhook
    if (config.SLACK_WEBHOOK_URL) {
      const spinner = ora('Testing Slack webhook...').start();
      try {
        await axios.post(config.SLACK_WEBHOOK_URL, {
          text: 'ClaudeSFDC configuration test'
        });
        spinner.succeed(chalk.green('Slack: Webhook active'));
        results.push({ name: 'Slack', status: 'passed' });
      } catch (error) {
        spinner.fail(chalk.red('Slack: Webhook failed'));
        results.push({ name: 'Slack', status: 'failed', error: error.message });
      }
    }
    
    // Display summary
    console.log(chalk.blue('\n📊 Test Results Summary'));
    console.log(chalk.blue('═'.repeat(40)));
    
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    
    console.log(chalk.green(`✓ Passed: ${passed}`));
    if (failed > 0) {
      console.log(chalk.red(`✗ Failed: ${failed}`));
      results.filter(r => r.status === 'failed').forEach(r => {
        console.log(chalk.gray(`  - ${r.name}: ${r.error}`));
      });
    }
    
    return results;
    
  } catch (error) {
    console.error(chalk.red('❌ Configuration test failed:'), error.message);
    return [];
  }
}

// Parse env content
function parseEnvContent(content) {
  const config = {};
  const lines = content.split('\n');
  
  lines.forEach(line => {
    if (!line.startsWith('#') && line.includes('=')) {
      const [key, ...valueParts] = line.split('=');
      config[key] = valueParts.join('=').replace(/^["']|["']$/g, '');
    }
  });
  
  return config;
}

// Reset configuration
async function resetConfig() {
  console.log(chalk.yellow.bold('\n⚠️  Reset Configuration\n'));
  console.log(chalk.red('This will delete all configuration files!'));
  
  // In a real implementation, we'd use inquirer to confirm
  console.log(chalk.gray('\nWould delete:'));
  console.log(chalk.gray('  - .env'));
  console.log(chalk.gray('  - .initialized'));
  console.log(chalk.gray('  - .first-run-config.json'));
  
  // For safety, just show what would be deleted
  console.log(chalk.yellow('\nTo actually reset, manually delete these files and run:'));
  console.log(chalk.blue('  npm run setup-wizard'));
}

// Export configuration
async function exportConfig() {
  console.log(chalk.blue.bold('\n📤 Export Configuration\n'));
  
  try {
    const config = {};
    
    // Read env file
    const envContent = await fs.readFile(ENV_FILE, 'utf8');
    config.env = parseEnvContent(envContent);
    
    // Remove sensitive values
    const safeConfig = {};
    Object.entries(config.env).forEach(([key, value]) => {
      if (!key.includes('TOKEN') && !key.includes('KEY') && !key.includes('SECRET') && !key.includes('WEBHOOK')) {
        safeConfig[key] = value;
      } else {
        safeConfig[key] = '<REDACTED>';
      }
    });
    
    // Create export
    const exportData = {
      version: '1.0.0',
      project: 'ClaudeSFDC',
      exported: new Date().toISOString(),
      configuration: safeConfig,
      notes: 'Sensitive values have been redacted. You will need to provide them during import.'
    };
    
    // Save to file
    const exportFile = path.join(__dirname, '..', `config-export-${Date.now()}.json`);
    await fs.writeFile(exportFile, JSON.stringify(exportData, null, 2));
    
    console.log(chalk.green(`✓ Configuration exported to: ${path.basename(exportFile)}`));
    console.log(chalk.gray('Note: Sensitive values have been redacted'));
    
  } catch (error) {
    console.error(chalk.red('❌ Export failed:'), error.message);
  }
}

// Import configuration
async function importConfig() {
  console.log(chalk.blue.bold('\n📥 Import Configuration\n'));
  
  const importFile = process.argv[3];
  if (!importFile) {
    console.error(chalk.red('❌ Please specify import file:'));
    console.log(chalk.blue('  npm run config:import <file>'));
    return;
  }
  
  try {
    const content = await fs.readFile(importFile, 'utf8');
    const importData = JSON.parse(content);
    
    console.log(chalk.gray(`Importing from: ${importFile}`));
    console.log(chalk.gray(`Exported: ${importData.exported}`));
    console.log(chalk.gray(`Version: ${importData.version}`));
    
    // Show what will be imported
    console.log(chalk.yellow('\nConfiguration to import:'));
    Object.entries(importData.configuration).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
    
    console.log(chalk.yellow('\n⚠️  This will overwrite existing configuration!'));
    console.log(chalk.gray('Implementation would prompt for confirmation here'));
    
  } catch (error) {
    console.error(chalk.red('❌ Import failed:'), error.message);
  }
}

// Migrate old configuration
async function migrateConfig() {
  console.log(chalk.blue.bold('\n🔄 Migrate Configuration\n'));
  
  try {
    // Check for old .env file
    const envContent = await fs.readFile(ENV_FILE, 'utf8');
    const config = parseEnvContent(envContent);
    
    let migrated = false;
    const updates = {};
    
    // Check for old format keys
    if (config.SALESFORCE_USERNAME && !config.SF_TARGET_ORG) {
      updates.SF_TARGET_ORG = config.SALESFORCE_USERNAME;
      migrated = true;
    }
    
    if (config.SALESFORCE_ORG && !config.SF_TARGET_ORG) {
      updates.SF_TARGET_ORG = config.SALESFORCE_ORG;
      migrated = true;
    }
    
    if (migrated) {
      console.log(chalk.yellow('Found old configuration format'));
      console.log(chalk.gray('Would migrate:'));
      Object.entries(updates).forEach(([key, value]) => {
        console.log(`  ${key} = ${value}`);
      });
      console.log(chalk.green('\n✓ Migration plan created'));
      console.log(chalk.gray('Run "npm run setup-wizard" to apply migration'));
    } else {
      console.log(chalk.green('✓ Configuration is up to date'));
    }
    
  } catch (error) {
    console.log(chalk.yellow('No existing configuration to migrate'));
  }
}

// Backup configuration
async function backupConfig() {
  console.log(chalk.blue.bold('\n💾 Backup Configuration\n'));
  
  try {
    // Create backup directory
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}`);
    await fs.mkdir(backupPath);
    
    // Backup files
    const files = [ENV_FILE, CONFIG_FILE, INITIALIZED_FILE];
    let backedUp = 0;
    
    for (const file of files) {
      try {
        const content = await fs.readFile(file);
        const filename = path.basename(file);
        await fs.writeFile(path.join(backupPath, filename), content);
        backedUp++;
      } catch {
        // File doesn't exist
      }
    }
    
    console.log(chalk.green(`✓ Backed up ${backedUp} files to: ${path.relative(process.cwd(), backupPath)}`));
    
  } catch (error) {
    console.error(chalk.red('❌ Backup failed:'), error.message);
  }
}

// Restore configuration
async function restoreConfig() {
  console.log(chalk.blue.bold('\n♻️  Restore Configuration\n'));
  
  try {
    // List available backups
    const backups = await fs.readdir(BACKUP_DIR);
    const validBackups = backups.filter(b => b.startsWith('backup-')).sort().reverse();
    
    if (validBackups.length === 0) {
      console.log(chalk.yellow('No backups found'));
      return;
    }
    
    console.log(chalk.gray('Available backups:'));
    validBackups.forEach((backup, index) => {
      const timestamp = backup.replace('backup-', '').replace(/-/g, ':').replace('T', ' ');
      console.log(`  ${index + 1}. ${timestamp}`);
    });
    
    console.log(chalk.yellow('\nTo restore, use:'));
    console.log(chalk.blue(`  npm run config:restore ${validBackups[0]}`));
    
  } catch (error) {
    console.log(chalk.yellow('No backups found'));
  }
}

// Validate configuration
async function validateConfig() {
  console.log(chalk.blue.bold('\n✓ Validate Configuration\n'));
  
  try {
    const envContent = await fs.readFile(ENV_FILE, 'utf8');
    const config = parseEnvContent(envContent);
    
    const issues = [];
    const warnings = [];
    
    // Required fields
    const required = {
      'Salesforce': ['SF_TARGET_ORG', 'SF_TARGET_ORG'],
      'Asana': ['ASANA_ACCESS_TOKEN', 'ASANA_WORKSPACE_ID', 'ASANA_PROJECT_GID']
    };
    
    Object.entries(required).forEach(([section, fields]) => {
      fields.forEach(field => {
        if (!config[field]) {
          issues.push(`Missing required field: ${field}`);
        }
      });
    });
    
    // Check for common issues
    if (config.ASANA_ASSIGNEE && !config.ASANA_ASSIGNEE.includes('@')) {
      warnings.push('ASANA_ASSIGNEE should be an email address');
    }
    
    if (config.SALESFORCE_ENVIRONMENT === 'production' && !config.SLACK_WEBHOOK_URL) {
      warnings.push('Production environment without Slack notifications');
    }
    
    // Display results
    if (issues.length === 0 && warnings.length === 0) {
      console.log(chalk.green('✓ Configuration is valid'));
    } else {
      if (issues.length > 0) {
        console.log(chalk.red(`❌ Issues found: ${issues.length}`));
        issues.forEach(issue => console.log(chalk.red(`  - ${issue}`)));
      }
      
      if (warnings.length > 0) {
        console.log(chalk.yellow(`⚠️  Warnings: ${warnings.length}`));
        warnings.forEach(warning => console.log(chalk.yellow(`  - ${warning}`)));
      }
    }
    
    return { issues, warnings };
    
  } catch (error) {
    console.error(chalk.red('❌ No configuration found'));
    return { issues: ['No configuration file'], warnings: [] };
  }
}

// Main command handler
async function main() {
  const command = process.argv[2];
  
  if (!command || !commands[command]) {
    console.log(chalk.blue.bold('Configuration Manager for ClaudeSFDC\n'));
    console.log('Usage: npm run config:<command>\n');
    console.log('Commands:');
    console.log('  show     - Display current configuration');
    console.log('  test     - Test all connections');
    console.log('  reset    - Clear all configuration');
    console.log('  export   - Export configuration for sharing');
    console.log('  import   - Import configuration from file');
    console.log('  migrate  - Migrate from old configuration');
    console.log('  backup   - Backup current configuration');
    console.log('  restore  - Restore from backup');
    console.log('  validate - Validate configuration');
    return;
  }
  
  await commands[command]();
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  });
}

module.exports = {
  showConfig,
  testConfig,
  resetConfig,
  exportConfig,
  importConfig,
  migrateConfig,
  backupConfig,
  restoreConfig,
  validateConfig
};