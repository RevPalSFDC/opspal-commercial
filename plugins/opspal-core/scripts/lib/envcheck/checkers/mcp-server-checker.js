#!/usr/bin/env node

/**
 * MCP Server Checker
 *
 * Parses .mcp.json, verifies command binaries exist and required env vars are set.
 *
 * @module mcp-server-checker
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function findMcpConfig() {
  // Check project-level .mcp.json first, then home directory
  const projectMcp = path.join(process.cwd(), '.mcp.json');
  const homeMcp = path.join(process.env.HOME || '/tmp', '.claude', '.mcp.json');

  if (fs.existsSync(projectMcp)) return projectMcp;
  if (fs.existsSync(homeMcp)) return homeMcp;
  return null;
}

function commandExists(cmd) {
  try {
    execSync(`which "${cmd}" 2>/dev/null || command -v "${cmd}" 2>/dev/null`, {
      stdio: 'pipe',
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  name: 'MCP Servers',

  async run(options = {}) {
    const startMs = Date.now();
    const configPath = findMcpConfig();

    if (!configPath) {
      return {
        status: 'skip',
        message: 'No .mcp.json found',
        remediation: null,
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const servers = config.mcpServers || {};
      const serverNames = Object.keys(servers);

      if (serverNames.length === 0) {
        return {
          status: 'skip',
          message: 'No MCP servers configured',
          remediation: null,
          autoFixable: false,
          durationMs: Date.now() - startMs,
        };
      }

      const issues = [];
      let checked = 0;

      for (const [name, serverConfig] of Object.entries(servers)) {
        checked++;

        // Check command exists (for stdio-type servers)
        if (serverConfig.command) {
          const cmd = serverConfig.command;
          if (!commandExists(cmd) && !fs.existsSync(cmd)) {
            issues.push(`${name}: command "${cmd}" not found`);
          }
        }

        // Check required env vars
        if (serverConfig.env) {
          for (const [envVar, value] of Object.entries(serverConfig.env)) {
            // If value is a reference like ${VAR}, check it's set
            const match = String(value).match(/^\$\{(\w+)\}$/);
            if (match) {
              const varName = match[1];
              if (!process.env[varName]) {
                issues.push(`${name}: env var ${varName} not set`);
              }
            }
          }
        }
      }

      if (issues.length === 0) {
        return {
          status: 'pass',
          message: `${checked} MCP server(s) configured, dependencies available`,
          remediation: null,
          autoFixable: false,
          durationMs: Date.now() - startMs,
        };
      }

      return {
        status: 'warn',
        message: `MCP issues: ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? ` (+${issues.length - 3} more)` : ''}`,
        remediation: 'Review .mcp.json and ensure all server commands and env vars are available',
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    } catch (err) {
      return {
        status: 'warn',
        message: `MCP config parse error: ${err.message}`,
        remediation: `Check ${configPath} for JSON syntax errors`,
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    }
  },
};
