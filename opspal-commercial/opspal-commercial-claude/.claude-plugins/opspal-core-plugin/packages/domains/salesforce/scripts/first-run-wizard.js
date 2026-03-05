#!/usr/bin/env node

/**
 * First-Run Setup Wizard for ClaudeSFDC
 * 
 * Interactive configuration wizard that runs on first use to set up:
 * - Salesforce connection
 * - Asana integration
 * - Environment settings
 * - Optional integrations
 */

const inquirer = require('inquirer').default;
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const axios = require('axios');

// Configuration file paths
const ENV_FILE = path.join(__dirname, '..', '.env');
const INITIALIZED_FILE = path.join(__dirname, '..', '.initialized');
const CONFIG_FILE = path.join(__dirname, '..', '.first-run-config.json');

// Check if already initialized
async function isInitialized() {
  try {
    await fs.access(INITIALIZED_FILE);
    return true;
  } catch {
    return false;
  }
}

// Display welcome message
function displayWelcome() {
  console.clear();
  console.log(chalk.blue.bold('╔════════════════════════════════════════════════╗'));
  console.log(chalk.blue.bold('║     Welcome to ClaudeSFDC Setup Wizard!       ║'));
  console.log(chalk.blue.bold('╚════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.cyan('This wizard will help you configure:'));
  console.log(chalk.gray('  ✓ Salesforce connection'));
  console.log(chalk.gray('  ✓ Asana integration'));
  console.log(chalk.gray('  ✓ Environment settings'));
  console.log(chalk.gray('  ✓ Optional integrations'));
  console.log();
}

// Step 1: Salesforce Configuration
async function configureSalesforce() {
  console.log(chalk.yellow.bold('\n📋 Step 1: Salesforce Configuration'));
  console.log(chalk.gray('─'.repeat(40)));

  const sfConfig = await inquirer.prompt([
    {
      type: 'list',
      name: 'environment',
      message: 'Select Salesforce environment:',
      choices: [
        { name: 'Sandbox', value: 'sandbox' },
        { name: 'Production', value: 'production' },
        { name: 'Developer Edition', value: 'developer' },
        { name: 'Scratch Org', value: 'scratch' }
      ]
    },
    {
      type: 'input',
      name: 'alias',
      message: 'Enter an alias for this org:',
      default: 'myorg',
      validate: input => input.length > 0 || 'Alias is required'
    }
  ]);

  // Launch OAuth flow
  const spinner = ora('Launching Salesforce OAuth flow...').start();
  
  try {
    const instanceUrl = sfConfig.environment === 'production' 
      ? 'https://login.salesforce.com' 
      : 'https://test.salesforce.com';
    
    await execAsync(`sf org login web --alias ${sfConfig.alias} --instance-url ${instanceUrl}`);
    
    // Get org details
    const { stdout } = await execAsync(`sf org display --target-org ${sfConfig.alias} --json`);
    const orgInfo = JSON.parse(stdout);
    
    sfConfig.username = orgInfo.result.username;
    sfConfig.orgId = orgInfo.result.id;
    sfConfig.instanceUrl = orgInfo.result.instanceUrl;
    
    spinner.succeed(chalk.green(`Successfully connected to ${sfConfig.username}`));
  } catch (error) {
    spinner.fail(chalk.red('Failed to connect to Salesforce'));
    console.error(chalk.red(error.message));
    
    const retry = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'retry',
        message: 'Would you like to try again?',
        default: true
      }
    ]);
    
    if (retry.retry) {
      return configureSalesforce();
    }
  }

  return sfConfig;
}

// Step 2: Asana Integration
async function configureAsana() {
  console.log(chalk.yellow.bold('\n📋 Step 2: Asana Integration'));
  console.log(chalk.gray('─'.repeat(40)));

  const { setupAsana } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'setupAsana',
      message: 'Do you want to set up Asana task tracking?',
      default: true
    }
  ]);

  if (!setupAsana) {
    return null;
  }

  console.log(chalk.cyan('\nTo generate an Asana token:'));
  console.log(chalk.gray('1. Go to https://app.asana.com/0/developer-console'));
  console.log(chalk.gray('2. Click "Create New Token"'));
  console.log(chalk.gray('3. Name it "ClaudeSFDC Integration"'));
  console.log(chalk.gray('4. Copy the token (shown only once)\n'));

  const { token } = await inquirer.prompt([
    {
      type: 'password',
      name: 'token',
      message: 'Enter your Asana Personal Access Token:',
      validate: input => input.length > 0 || 'Token is required'
    }
  ]);

  // Validate token and get workspaces
  const spinner = ora('Validating Asana token...').start();
  
  try {
    const workspaceResponse = await axios.get('https://app.asana.com/api/1.0/workspaces', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    spinner.succeed(chalk.green('Token validated!'));
    
    const workspaces = workspaceResponse.data.data;
    
    // Select workspace
    const { workspaceGid } = await inquirer.prompt([
      {
        type: 'list',
        name: 'workspaceGid',
        message: 'Select your workspace:',
        choices: workspaces.map(ws => ({
          name: ws.name,
          value: ws.gid
        }))
      }
    ]);

    // Get projects
    spinner.start('Fetching projects...');
    const projectsResponse = await axios.get(
      `https://app.asana.com/api/1.0/projects?workspace=${workspaceGid}&limit=100`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    spinner.stop();
    
    const projects = projectsResponse.data.data;
    
    // Select project
    const { projectGid } = await inquirer.prompt([
      {
        type: 'list',
        name: 'projectGid',
        message: 'Select project for Salesforce tasks:',
        choices: projects.map(p => ({
          name: p.name,
          value: p.gid
        }))
      }
    ]);

    // Configure assignee
    const { assignee } = await inquirer.prompt([
      {
        type: 'input',
        name: 'assignee',
        message: 'Enter assignee email (must be Asana user):',
        validate: async (input) => {
          if (!input) return 'Email is required';
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) return 'Invalid email format';
          
          // Validate user exists in workspace
          try {
            const usersResponse = await axios.get(
              `https://app.asana.com/api/1.0/users?workspace=${workspaceGid}`,
              { headers: { 'Authorization': `Bearer ${token}` } }
            );
            
            const users = usersResponse.data.data;
            const userExists = users.some(u => u.email === input);
            
            if (!userExists) {
              return `User ${input} not found in workspace. Please enter a valid Asana user email.`;
            }
            
            return true;
          } catch (error) {
            return 'Could not validate user. Please ensure the email is correct.';
          }
        }
      }
    ]);

    // Sprint configuration
    const { configureSprints } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'configureSprints',
        message: 'Configure sprint settings?',
        default: true
      }
    ]);

    let sprintConfig = {};
    if (configureSprints) {
      sprintConfig = await inquirer.prompt([
        {
          type: 'number',
          name: 'duration',
          message: 'Sprint duration (days):',
          default: 14,
          validate: input => input > 0 || 'Duration must be positive'
        },
        {
          type: 'input',
          name: 'startDate',
          message: 'Sprint start date (YYYY-MM-DD):',
          default: '2024-01-01',
          validate: input => /^\d{4}-\d{2}-\d{2}$/.test(input) || 'Invalid date format'
        }
      ]);
    }

    return {
      token,
      workspaceGid,
      workspaceId: workspaceGid, // For compatibility
      projectGid,
      assignee,
      sprintEnabled: configureSprints,
      sprintDuration: sprintConfig.duration || 14,
      sprintStartDate: sprintConfig.startDate || '2024-01-01'
    };
  } catch (error) {
    spinner.fail(chalk.red('Failed to validate Asana token'));
    console.error(chalk.red(error.response?.data?.errors?.[0]?.message || error.message));
    
    const retry = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'retry',
        message: 'Would you like to try again?',
        default: true
      }
    ]);
    
    if (retry.retry) {
      return configureAsana();
    }
    
    return null;
  }
}

// Step 3: Optional Integrations
async function configureOptionalIntegrations() {
  console.log(chalk.yellow.bold('\n📋 Step 3: Optional Integrations'));
  console.log(chalk.gray('─'.repeat(40)));

  const integrations = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'slack',
      message: 'Configure Slack notifications?',
      default: false
    },
    {
      type: 'confirm',
      name: 'gdrive',
      message: 'Configure Google Drive integration?',
      default: false
    },
    {
      type: 'confirm',
      name: 'modelProxy',
      message: 'Configure Model Proxy (multi-model support)?',
      default: false
    }
  ]);

  const config = {};

  // Slack configuration
  if (integrations.slack) {
    const slackConfig = await inquirer.prompt([
      {
        type: 'password',
        name: 'webhookUrl',
        message: 'Enter Slack webhook URL:',
        validate: input => input.startsWith('https://hooks.slack.com/') || 'Invalid webhook URL'
      }
    ]);
    config.slack = slackConfig;
  }

  // Google Drive configuration  
  if (integrations.gdrive) {
    console.log(chalk.cyan('\nGoogle Drive integration requires OAuth setup.'));
    console.log(chalk.gray('See documentation for detailed instructions.'));
    config.gdrive = { enabled: true };
  }

  // Model Proxy configuration
  if (integrations.modelProxy) {
    const modelConfig = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enableProxy',
        message: 'Enable model proxy now?',
        default: false
      }
    ]);
    config.modelProxy = modelConfig;
  }

  return config;
}

// Save configuration to .env file
async function saveConfiguration(config) {
  const spinner = ora('Saving configuration...').start();
  
  try {
    let envContent = '';
    
    // Salesforce configuration
    if (config.salesforce) {
      envContent += '# Salesforce Configuration\n';
      envContent += `SF_TARGET_ORG=${config.salesforce.alias}\n`;
      envContent += `SF_TARGET_ORG=${config.salesforce.username}\n`;
      envContent += `SALESFORCE_ENVIRONMENT=${config.salesforce.environment}\n`;
      envContent += `SALESFORCE_ORG_ID=${config.salesforce.orgId}\n`;
      envContent += `SALESFORCE_INSTANCE_URL=${config.salesforce.instanceUrl}\n`;
      envContent += '\n';
    }

    // Asana configuration
    if (config.asana) {
      envContent += '# Asana Configuration\n';
      envContent += `ASANA_ACCESS_TOKEN=${config.asana.token}\n`;
      envContent += `ASANA_WORKSPACE_ID=${config.asana.workspaceId}\n`;
      envContent += `ASANA_WORKSPACE_GID=${config.asana.workspaceGid}\n`;
      envContent += `ASANA_PROJECT_GID=${config.asana.projectGid}\n`;
      envContent += `ASANA_ASSIGNEE=${config.asana.assignee}\n`;
      envContent += `ASANA_READ_ONLY_MODE=false\n`;
      envContent += '\n';
      
      envContent += '# Asana Enhanced Features\n';
      envContent += `ASANA_SPRINT_ENABLED=${config.asana.sprintEnabled}\n`;
      envContent += `ASANA_SPRINT_FORMAT="Sprint {number} ({start} - {end})"\n`;
      envContent += `ASANA_SPRINT_DURATION=${config.asana.sprintDuration}\n`;
      envContent += `ASANA_SPRINT_START_DATE=${config.asana.sprintStartDate}\n`;
      envContent += `ASANA_TASK_MATCHING_ENABLED=true\n`;
      envContent += `ASANA_SIMILARITY_THRESHOLD=0.8\n`;
      envContent += `ASANA_ENV_PREFIX_ENABLED=true\n`;
      envContent += `ASANA_PREFIX_PROD=[PROD]\n`;
      envContent += `ASANA_PREFIX_SANDBOX=[SB]\n`;
      envContent += '\n';
    }

    // Optional integrations
    if (config.integrations) {
      if (config.integrations.slack) {
        envContent += '# Slack Configuration\n';
        envContent += `SLACK_WEBHOOK_URL=${config.integrations.slack.webhookUrl}\n`;
        envContent += '\n';
      }
      
      if (config.integrations.modelProxy) {
        envContent += '# Model Proxy Configuration\n';
        envContent += `MODEL_PROXY_ENABLED=${config.integrations.modelProxy.enableProxy}\n`;
        envContent += '\n';
      }
    }

    // Write .env file
    await fs.writeFile(ENV_FILE, envContent);
    
    // Save full config for reference
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    
    // Create initialized marker
    await fs.writeFile(INITIALIZED_FILE, new Date().toISOString());
    
    spinner.succeed(chalk.green('Configuration saved!'));
  } catch (error) {
    spinner.fail(chalk.red('Failed to save configuration'));
    throw error;
  }
}

// Run tests to validate configuration
async function runTests(config) {
  console.log(chalk.yellow.bold('\n🧪 Running Configuration Tests'));
  console.log(chalk.gray('─'.repeat(40)));
  
  const results = [];
  
  // Test Salesforce connection
  if (config.salesforce) {
    const spinner = ora('Testing Salesforce connection...').start();
    try {
      await execAsync(`sf org display --target-org ${config.salesforce.alias}`);
      spinner.succeed(chalk.green('Salesforce connection test passed'));
      results.push({ name: 'Salesforce', status: 'passed' });
    } catch (error) {
      spinner.fail(chalk.red('Salesforce connection test failed'));
      results.push({ name: 'Salesforce', status: 'failed' });
    }
  }
  
  // Test Asana connection
  if (config.asana) {
    const spinner = ora('Testing Asana connection...').start();
    try {
      await axios.get(
        `https://app.asana.com/api/1.0/projects/${config.asana.projectGid}`,
        { headers: { 'Authorization': `Bearer ${config.asana.token}` } }
      );
      spinner.succeed(chalk.green('Asana connection test passed'));
      results.push({ name: 'Asana', status: 'passed' });
    } catch (error) {
      spinner.fail(chalk.red('Asana connection test failed'));
      results.push({ name: 'Asana', status: 'failed' });
    }
  }
  
  // Test Slack webhook
  if (config.integrations?.slack) {
    const spinner = ora('Testing Slack webhook...').start();
    try {
      await axios.post(config.integrations.slack.webhookUrl, {
        text: 'ClaudeSFDC setup wizard test message'
      });
      spinner.succeed(chalk.green('Slack webhook test passed'));
      results.push({ name: 'Slack', status: 'passed' });
    } catch (error) {
      spinner.fail(chalk.red('Slack webhook test failed'));
      results.push({ name: 'Slack', status: 'failed' });
    }
  }
  
  return results;
}

// Display configuration summary
function displaySummary(config, testResults) {
  console.log(chalk.blue.bold('\n📊 Configuration Summary'));
  console.log(chalk.blue('═'.repeat(50)));
  
  // Salesforce
  if (config.salesforce) {
    const sfTest = testResults.find(r => r.name === 'Salesforce');
    const icon = sfTest?.status === 'passed' ? chalk.green('✓') : chalk.red('✗');
    console.log(`${icon} Salesforce: ${config.salesforce.environment} (${config.salesforce.username})`);
  }
  
  // Asana
  if (config.asana) {
    const asanaTest = testResults.find(r => r.name === 'Asana');
    const icon = asanaTest?.status === 'passed' ? chalk.green('✓') : chalk.red('✗');
    console.log(`${icon} Asana: Project ${config.asana.projectGid}`);
    console.log(`  Assignee: ${config.asana.assignee}`);
    if (config.asana.sprintEnabled) {
      console.log(`  Sprints: ${config.asana.sprintDuration}-day sprints starting ${config.asana.sprintStartDate}`);
    }
  }
  
  // Optional integrations
  if (config.integrations) {
    if (config.integrations.slack) {
      const slackTest = testResults.find(r => r.name === 'Slack');
      const icon = slackTest?.status === 'passed' ? chalk.green('✓') : chalk.red('✗');
      console.log(`${icon} Slack: Configured`);
    } else {
      console.log(chalk.gray('✗ Slack: Not configured'));
    }
    
    if (config.integrations.gdrive) {
      console.log(chalk.yellow('⚠ Google Drive: Pending OAuth setup'));
    } else {
      console.log(chalk.gray('✗ Google Drive: Not configured'));
    }
    
    if (config.integrations.modelProxy?.enableProxy) {
      console.log(chalk.green('✓ Model Proxy: Enabled'));
    } else {
      console.log(chalk.gray('✗ Model Proxy: Not configured'));
    }
  }
  
  console.log(chalk.blue('═'.repeat(50)));
}

// Main wizard function
async function runWizard(force = false) {
  try {
    // Check if already initialized
    if (!force && await isInitialized()) {
      const { rerun } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'rerun',
          message: 'Setup wizard has already been run. Do you want to reconfigure?',
          default: false
        }
      ]);
      
      if (!rerun) {
        console.log(chalk.gray('Setup wizard cancelled.'));
        return;
      }
    }

    // Display welcome
    displayWelcome();

    // Run configuration steps
    const config = {};
    
    config.salesforce = await configureSalesforce();
    config.asana = await configureAsana();
    config.integrations = await configureOptionalIntegrations();

    // Save configuration
    await saveConfiguration(config);

    // Run tests
    const testResults = await runTests(config);

    // Display summary
    displaySummary(config, testResults);

    // Final message
    console.log(chalk.green.bold('\n✨ Setup complete!'));
    console.log(chalk.cyan('You can now use ClaudeSFDC with all configured integrations.'));
    console.log(chalk.gray('\nTry running:'));
    console.log(chalk.blue('  node examples/asana-field-creation.js'));
    console.log(chalk.gray('\nTo reconfigure, run:'));
    console.log(chalk.blue('  npm run setup-wizard'));

  } catch (error) {
    console.error(chalk.red('\n❌ Setup wizard failed:'), error.message);
    process.exit(1);
  }
}

// Check command line arguments
const args = process.argv.slice(2);
const force = args.includes('--force') || args.includes('-f');

// Run the wizard
runWizard(force);