#!/usr/bin/env node

/**
 * System Checker
 *
 * Validates system-level dependencies: Node version, jq, sf CLI, disk space.
 *
 * @module system-checker
 * @version 1.0.0
 */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

module.exports = {
  name: 'System Dependencies',

  async run(options = {}) {
    const issues = [];
    const startMs = Date.now();

    // Node version check (>= 18 required)
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    if (major < 18) {
      issues.push(`Node ${nodeVersion} is below minimum v18`);
    }

    // jq availability
    try {
      execSync('jq --version', { stdio: 'pipe', timeout: 5000 });
    } catch {
      issues.push('jq not found (required by hooks)');
    }

    // sf CLI availability
    try {
      execSync('sf --version', { stdio: 'pipe', timeout: 5000 });
    } catch {
      try {
        execSync('sfdx --version', { stdio: 'pipe', timeout: 5000 });
      } catch {
        issues.push('sf CLI not found');
      }
    }

    // Disk space check (warn if < 1GB free in home dir)
    try {
      const homeDir = os.homedir();
      const result = execSync(`df -BG "${homeDir}" | tail -1 | awk '{print $4}'`, {
        stdio: 'pipe',
        timeout: 5000,
      }).toString().trim();
      const freeGB = parseInt(result.replace('G', ''), 10);
      if (!isNaN(freeGB) && freeGB < 1) {
        issues.push(`Low disk space: ${freeGB}GB free`);
      }
    } catch {
      // Non-critical, skip
    }

    if (issues.length === 0) {
      return {
        status: 'pass',
        message: `Node ${nodeVersion}, jq, sf CLI all available`,
        remediation: null,
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    }

    const hasJqMissing = issues.some(i => i.includes('jq'));
    return {
      status: issues.some(i => i.includes('Node') || i.includes('sf CLI')) ? 'fail' : 'warn',
      message: issues.join('; '),
      remediation: hasJqMissing ? 'sudo apt-get install -y jq || brew install jq' : null,
      autoFixable: false,
      durationMs: Date.now() - startMs,
    };
  },
};
