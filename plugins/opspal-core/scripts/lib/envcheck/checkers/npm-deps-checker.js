#!/usr/bin/env node

/**
 * NPM Dependencies Checker
 *
 * Wraps the existing check-all-plugin-dependencies.js to validate npm packages
 * across all plugins.
 *
 * @module npm-deps-checker
 * @version 1.0.0
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

module.exports = {
  name: 'NPM Dependencies',

  async run(options = {}) {
    const startMs = Date.now();

    // Find the dependency checker script
    const pluginRoot = path.resolve(__dirname, '../../../../');
    const checkerPath = path.join(pluginRoot, 'scripts', 'lib', 'check-all-plugin-dependencies.js');

    if (!fs.existsSync(checkerPath)) {
      return {
        status: 'skip',
        message: 'Dependency checker script not found',
        remediation: null,
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    }

    try {
      // Run the checker in JSON-like mode (capture exit code)
      const rawResult = execSync(`node "${checkerPath}"`, {
        stdio: 'pipe',
        timeout: 30000,
        cwd: path.resolve(pluginRoot, '../../'), // plugins parent dir
      }).toString();

      // Strip ANSI color codes before parsing
      const result = stripAnsi(rawResult);

      // Parse output for missing count
      const missingMatch = result.match(/Packages missing:\s*(\d+)/);
      const presentMatch = result.match(/Packages present:\s*(\d+)/);
      const missing = missingMatch ? parseInt(missingMatch[1], 10) : 0;
      const present = presentMatch ? parseInt(presentMatch[1], 10) : 0;

      if (missing === 0) {
        return {
          status: 'pass',
          message: `All ${present} npm packages installed`,
          remediation: null,
          autoFixable: false,
          durationMs: Date.now() - startMs,
        };
      }

      return {
        status: 'fail',
        message: `${missing} npm package(s) missing (${present} present)`,
        remediation: `node "${checkerPath}" --fix`,
        autoFixable: true,
        fixTier: 'safe',
        durationMs: Date.now() - startMs,
      };
    } catch (err) {
      // Exit code 1 means missing deps — strip ANSI before parsing
      const output = stripAnsi((err.stdout || '').toString());
      const missingMatch = output.match(/Packages missing:\s*(\d+)/);
      const missing = missingMatch ? parseInt(missingMatch[1], 10) : 'unknown';

      return {
        status: 'fail',
        message: `${missing} npm package(s) missing`,
        remediation: `node "${checkerPath}" --fix`,
        autoFixable: true,
        fixTier: 'safe',
        durationMs: Date.now() - startMs,
      };
    }
  },
};
