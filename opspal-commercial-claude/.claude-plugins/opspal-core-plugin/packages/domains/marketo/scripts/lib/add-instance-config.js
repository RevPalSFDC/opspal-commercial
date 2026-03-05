#!/usr/bin/env node

/**
 * Add Marketo Instance Configuration
 *
 * Interactive CLI to add new Marketo instance configurations.
 * Stores credentials securely in portals/config.json.
 *
 * @module add-instance-config
 * @version 1.0.0
 *
 * Usage:
 *   node add-instance-config.js                    # Interactive mode
 *   node add-instance-config.js --name production \
 *     --client-id xxx --client-secret xxx \
 *     --base-url https://123-ABC-456.mktorest.com
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLUGIN_ROOT = path.resolve(__dirname, '../..');
const CONFIG_FILE = path.join(PLUGIN_ROOT, 'portals', 'config.json');
const PORTALS_DIR = path.join(PLUGIN_ROOT, 'portals');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-/g, '_');
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      parsed[key] = value;
    }
  }

  return parsed;
}

/**
 * Create readline interface for interactive mode
 */
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Prompt user for input
 */
async function prompt(rl, question, defaultValue = '') {
  return new Promise((resolve) => {
    const displayQuestion = defaultValue
      ? `${question} [${defaultValue}]: `
      : `${question}: `;

    rl.question(displayQuestion, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

/**
 * Load existing config
 */
function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (error) {
      console.error(`Warning: Could not parse existing config: ${error.message}`);
    }
  }

  return { instances: {} };
}

/**
 * Save config
 */
function saveConfig(config) {
  // Ensure directory exists
  if (!fs.existsSync(PORTALS_DIR)) {
    fs.mkdirSync(PORTALS_DIR, { recursive: true });
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log(`Configuration saved to ${CONFIG_FILE}`);
}

/**
 * Create instance directory structure
 */
function createInstanceDirectories(instanceName) {
  const instanceDir = path.join(PORTALS_DIR, instanceName);

  const dirs = [
    instanceDir,
    path.join(instanceDir, 'projects'),
    path.join(instanceDir, 'reports'),
    path.join(instanceDir, 'docs')
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Create README
  const readmePath = path.join(instanceDir, 'README.md');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, `# Marketo Instance: ${instanceName}

## Overview
This directory contains instance-specific files for the ${instanceName} Marketo instance.

## Structure
- \`projects/\` - Assessment and project files
- \`reports/\` - Generated reports
- \`docs/\` - Instance documentation

## Files
- \`INSTANCE_CONTEXT.json\` - Assessment history and context
- \`INSTANCE_QUIRKS.json\` - Auto-detected customizations
- \`QUICK_REFERENCE.md\` - Quick lookup guide

## Created
${new Date().toISOString()}
`);
  }

  console.log(`Created directory structure for ${instanceName}`);
}

/**
 * Validate base URL format
 */
function validateBaseUrl(url) {
  const pattern = /^https:\/\/\d{3}-[A-Z]{3}-\d{3}\.mktorest\.com$/i;
  return pattern.test(url);
}

/**
 * Extract Munchkin ID from URL
 */
function extractMunchkinId(url) {
  const match = url.match(/(\d{3}-[A-Z]{3}-\d{3})/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Test connection to Marketo
 */
async function testConnection(config) {
  console.log('Testing connection...');

  const tokenUrl = `${config.baseUrl}/identity/oauth/token?` +
    `grant_type=client_credentials&` +
    `client_id=${config.clientId}&` +
    `client_secret=${config.clientSecret}`;

  try {
    const response = await fetch(tokenUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    const data = await response.json();

    if (data.access_token) {
      console.log('Connection successful!');
      return true;
    } else {
      console.error(`Connection failed: ${data.error} - ${data.error_description}`);
      return false;
    }
  } catch (error) {
    console.error(`Connection failed: ${error.message}`);
    return false;
  }
}

/**
 * Interactive mode
 */
async function interactiveMode() {
  const rl = createInterface();

  console.log('\n=== Add Marketo Instance Configuration ===\n');

  try {
    // Instance name
    const name = await prompt(rl, 'Instance name (e.g., production, sandbox)', 'default');

    // Check if exists
    const config = loadConfig();
    if (config.instances[name]) {
      const overwrite = await prompt(rl, `Instance "${name}" exists. Overwrite? (y/n)`, 'n');
      if (overwrite.toLowerCase() !== 'y') {
        console.log('Cancelled');
        rl.close();
        return;
      }
    }

    // Base URL
    let baseUrl;
    while (!baseUrl) {
      const url = await prompt(rl, 'Base URL (e.g., https://123-ABC-456.mktorest.com)');
      if (validateBaseUrl(url)) {
        baseUrl = url;
      } else {
        console.log('Invalid URL format. Expected: https://XXX-XXX-XXX.mktorest.com');
      }
    }

    // Extract Munchkin ID
    const munchkinId = extractMunchkinId(baseUrl);
    console.log(`Detected Munchkin ID: ${munchkinId}`);

    // Client ID
    const clientId = await prompt(rl, 'Client ID');
    if (!clientId) {
      console.error('Client ID is required');
      rl.close();
      return;
    }

    // Client Secret
    const clientSecret = await prompt(rl, 'Client Secret');
    if (!clientSecret) {
      console.error('Client Secret is required');
      rl.close();
      return;
    }

    // Environment type
    const environment = await prompt(rl, 'Environment (production/sandbox/staging)', 'production');

    // Description
    const description = await prompt(rl, 'Description (optional)');

    // Build instance config
    const instanceConfig = {
      clientId,
      clientSecret,
      baseUrl,
      munchkinId,
      environment,
      description: description || undefined,
      createdAt: new Date().toISOString()
    };

    // Test connection
    const testConn = await prompt(rl, 'Test connection? (y/n)', 'y');
    if (testConn.toLowerCase() === 'y') {
      const success = await testConnection(instanceConfig);
      if (!success) {
        const proceed = await prompt(rl, 'Connection failed. Save anyway? (y/n)', 'n');
        if (proceed.toLowerCase() !== 'y') {
          rl.close();
          return;
        }
      }
    }

    // Save
    config.instances[name] = instanceConfig;
    saveConfig(config);

    // Create directories
    createInstanceDirectories(name);

    console.log(`\nInstance "${name}" configured successfully!`);
    console.log('\nTo use this instance:');
    console.log(`  export MARKETO_INSTANCE_NAME="${name}"`);
    console.log('  # Or use CLI flag: --instance ' + name);

    rl.close();

  } catch (error) {
    console.error(`Error: ${error.message}`);
    rl.close();
    process.exit(1);
  }
}

/**
 * CLI mode
 */
async function cliMode(args) {
  const { name, client_id, client_secret, base_url, environment, description } = args;

  // Validate required args
  if (!name || !client_id || !client_secret || !base_url) {
    console.error('Missing required arguments');
    console.error('Required: --name, --client-id, --client-secret, --base-url');
    process.exit(1);
  }

  // Validate URL
  if (!validateBaseUrl(base_url)) {
    console.error('Invalid base URL format');
    process.exit(1);
  }

  const instanceConfig = {
    clientId: client_id,
    clientSecret: client_secret,
    baseUrl: base_url,
    munchkinId: extractMunchkinId(base_url),
    environment: environment || 'production',
    description: description || undefined,
    createdAt: new Date().toISOString()
  };

  // Test if requested
  if (args.test) {
    const success = await testConnection(instanceConfig);
    if (!success) {
      process.exit(1);
    }
  }

  // Save
  const config = loadConfig();
  config.instances[name] = instanceConfig;
  saveConfig(config);

  // Create directories
  createInstanceDirectories(name);

  console.log(`Instance "${name}" configured successfully`);
}

// Main
const args = parseArgs();

if (Object.keys(args).length === 0) {
  interactiveMode();
} else {
  cliMode(args);
}
