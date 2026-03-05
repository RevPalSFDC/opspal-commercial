#!/usr/bin/env node

/**
 * GitHub Auth Checker
 *
 * Validates GitHub CLI authentication via `gh auth status`.
 * This catches a common failure mode where gh is installed but not logged in.
 *
 * @module github-auth-checker
 * @version 1.0.0
 */

const { execSync } = require('child_process');

module.exports = {
  name: 'GitHub Auth',

  async run() {
    const startMs = Date.now();

    // If gh is not installed, treat as skip (System Dependencies checker owns installation checks).
    try {
      execSync('gh --version', { stdio: 'pipe', timeout: 5000 });
    } catch {
      return {
        status: 'skip',
        message: 'gh CLI not installed - skipping GitHub auth check',
        remediation: 'Install gh from https://cli.github.com/',
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    }

    try {
      const output = execSync('gh auth status --hostname github.com', {
        stdio: 'pipe',
        timeout: 10000,
      }).toString();

      // `gh auth status` can still output account details; keep message concise.
      const accountMatch = output.match(/Logged in to github\.com account ([^\s]+)/i);
      const account = accountMatch ? accountMatch[1] : null;

      return {
        status: 'pass',
        message: account
          ? `gh authenticated as ${account}`
          : 'gh authenticated for github.com',
        remediation: null,
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString().trim() : '';
      const msg = stderr || err.message;

      return {
        status: 'fail',
        message: `gh not authenticated (${msg.slice(0, 180)})`,
        remediation: 'Run: gh auth login --hostname github.com',
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    }
  },
};
