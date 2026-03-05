#!/usr/bin/env node

/**
 * Environment Detector
 *
 * Detects whether Claude is running in Desktop or CLI mode
 * Based on config file presence and environment variables
 *
 * Usage:
 *   node environment-detector.js
 *
 * Output (JSON):
 *   {
 *     "environment": "DESKTOP" | "CLI" | "UNKNOWN",
 *     "mcpConfigPath": "/path/to/config.json",
 *     "detectionMethod": "config_file" | "env_var" | "fallback",
 *     "confidence": "high" | "medium" | "low",
 *     "timestamp": "2025-10-17T..."
 *   }
 *
 * Environment Variable Export:
 *   export CLAUDE_ENV=$(node environment-detector.js | jq -r '.environment')
 *
 * @version 1.0.0
 * @created 2025-10-17
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Detect environment type
 * @returns {{environment: string, mcpConfigPath: string|null, detectionMethod: string, confidence: string}}
 */
function detectEnvironment() {
  const homeDir = os.homedir();

  // Priority 1: Explicit environment variable (highest confidence)
  if (process.env.CLAUDE_ENV) {
    const env = process.env.CLAUDE_ENV.toUpperCase();
    if (env === 'DESKTOP' || env === 'CLI') {
      return {
        environment: env,
        mcpConfigPath: getMCPConfigPath(env),
        detectionMethod: 'env_var',
        confidence: 'high'
      };
    }
  }

  // Legacy environment variables
  const isCLI = process.env.CLAUDE_CLI === 'true';
  const isDesktop = process.env.CLAUDE_DESKTOP === 'true';

  if (isCLI) {
    return {
      environment: 'CLI',
      mcpConfigPath: getMCPConfigPath('CLI'),
      detectionMethod: 'env_var',
      confidence: 'high'
    };
  }

  if (isDesktop) {
    return {
      environment: 'DESKTOP',
      mcpConfigPath: getMCPConfigPath('DESKTOP'),
      detectionMethod: 'env_var',
      confidence: 'high'
    };
  }

  // Priority 2: Config file presence (medium confidence)
  const desktopConfigPath = path.join(homeDir, '.claude', 'claude_desktop_config.json');
  const cliConfigPath = path.join(homeDir, '.claude', 'config.json');

  const hasDesktopConfig = fs.existsSync(desktopConfigPath);
  const hasCLIConfig = fs.existsSync(cliConfigPath);

  // Both configs exist - ambiguous situation
  if (hasDesktopConfig && hasCLIConfig) {
    // Check which was modified more recently as tiebreaker
    try {
      const desktopStat = fs.statSync(desktopConfigPath);
      const cliStat = fs.statSync(cliConfigPath);

      const env = desktopStat.mtime > cliStat.mtime ? 'DESKTOP' : 'CLI';

      // Write warning to stderr (won't pollute JSON output)
      console.error('⚠️  Both Desktop and CLI configs found.');
      console.error(`⚠️  Using most recent: ${env} (${env === 'DESKTOP' ? desktopConfigPath : cliConfigPath})`);
      console.error('⚠️  Set CLAUDE_ENV explicitly to avoid ambiguity: export CLAUDE_ENV=CLI');

      return {
        environment: env,
        mcpConfigPath: getMCPConfigPath(env),
        detectionMethod: 'config_file',
        confidence: 'low'
      };
    } catch (e) {
      // If stat fails, default to CLI (safer)
      console.error('⚠️  Both configs found but could not determine most recent. Defaulting to CLI.');
      return {
        environment: 'CLI',
        mcpConfigPath: cliConfigPath,
        detectionMethod: 'fallback',
        confidence: 'low'
      };
    }
  }

  // Only Desktop config exists
  if (hasDesktopConfig && !hasCLIConfig) {
    return {
      environment: 'DESKTOP',
      mcpConfigPath: desktopConfigPath,
      detectionMethod: 'config_file',
      confidence: 'medium'
    };
  }

  // Only CLI config exists
  if (hasCLIConfig && !hasDesktopConfig) {
    return {
      environment: 'CLI',
      mcpConfigPath: cliConfigPath,
      detectionMethod: 'config_file',
      confidence: 'medium'
    };
  }

  // Priority 3: No config found (unknown environment)
  console.error('⚠️  No Claude config files found.');
  console.error('⚠️  Expected: ~/.claude/config.json (CLI) or ~/.claude/claude_desktop_config.json (Desktop)');

  return {
    environment: 'UNKNOWN',
    mcpConfigPath: null,
    detectionMethod: 'fallback',
    confidence: 'low'
  };
}

/**
 * Get MCP config file path for given environment
 * @param {string} env - Environment type (DESKTOP, CLI, UNKNOWN)
 * @returns {string|null} Config file path or null if unknown
 */
function getMCPConfigPath(env) {
  const homeDir = os.homedir();

  switch (env) {
    case 'DESKTOP':
      return path.join(homeDir, '.claude', 'claude_desktop_config.json');
    case 'CLI':
      return path.join(homeDir, '.claude', 'config.json');
    default:
      return null;
  }
}

/**
 * Get project-specific MCP config path if it exists
 * @param {string} projectRoot - Project root directory
 * @returns {string|null} Project .mcp.json path or null
 */
function getProjectMCPConfigPath(projectRoot = process.cwd()) {
  const mcpConfigPath = path.join(projectRoot, '.mcp.json');
  return fs.existsSync(mcpConfigPath) ? mcpConfigPath : null;
}

/**
 * Validate MCP config file exists and is valid JSON
 * @param {string|null} configPath - Path to config file
 * @returns {{valid: boolean, error: string|null}}
 */
function validateMCPConfig(configPath) {
  if (!configPath) {
    return { valid: false, error: 'No config path provided' };
  }

  if (!fs.existsSync(configPath)) {
    return { valid: false, error: 'Config file does not exist' };
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    JSON.parse(content);
    return { valid: true, error: null };
  } catch (e) {
    return { valid: false, error: `Invalid JSON: ${e.message}` };
  }
}

/**
 * Get full environment report
 * @returns {object} Complete environment information
 */
function getEnvironmentReport() {
  const detection = detectEnvironment();
  const projectMCPConfig = getProjectMCPConfigPath();
  const validation = validateMCPConfig(detection.mcpConfigPath);

  return {
    ...detection,
    projectMCPConfig,
    configValidation: validation,
    timestamp: new Date().toISOString(),
    homeDir: os.homedir(),
    cwd: process.cwd()
  };
}

// CLI mode
if (require.main === module) {
  const args = process.argv.slice(2);

  // Check for --help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Environment Detector - Detect Claude Desktop vs CLI

Usage:
  node environment-detector.js [options]

Options:
  --help, -h        Show this help message
  --verbose, -v     Include full environment report
  --export          Output as shell export statement
  --validate        Validate MCP config file

Examples:
  # Detect environment (JSON output)
  node environment-detector.js

  # Export as environment variable
  export CLAUDE_ENV=$(node environment-detector.js | jq -r '.environment')

  # Bash integration
  eval "$(node environment-detector.js --export)"

  # Full report
  node environment-detector.js --verbose

  # Validate config
  node environment-detector.js --validate
`);
    process.exit(0);
  }

  // Verbose mode - full report
  if (args.includes('--verbose') || args.includes('-v')) {
    const report = getEnvironmentReport();
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  // Export mode - shell export statement
  if (args.includes('--export')) {
    const detection = detectEnvironment();
    console.log(`export CLAUDE_ENV="${detection.environment}"`);
    console.log(`export CLAUDE_MCP_CONFIG="${detection.mcpConfigPath || ''}"`);
    process.exit(0);
  }

  // Validate mode - check config validity
  if (args.includes('--validate')) {
    const detection = detectEnvironment();
    const validation = validateMCPConfig(detection.mcpConfigPath);

    if (validation.valid) {
      console.log(`✅ MCP config is valid: ${detection.mcpConfigPath}`);
      process.exit(0);
    } else {
      console.error(`❌ MCP config is invalid: ${validation.error}`);
      process.exit(1);
    }
  }

  // Default mode - JSON output
  const detection = detectEnvironment();
  console.log(JSON.stringify({
    environment: detection.environment,
    mcpConfigPath: detection.mcpConfigPath,
    detectionMethod: detection.detectionMethod,
    confidence: detection.confidence,
    timestamp: new Date().toISOString()
  }, null, 2));
}

module.exports = {
  detectEnvironment,
  getMCPConfigPath,
  getProjectMCPConfigPath,
  validateMCPConfig,
  getEnvironmentReport
};
