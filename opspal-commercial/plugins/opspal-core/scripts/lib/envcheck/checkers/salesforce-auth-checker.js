#!/usr/bin/env node

/**
 * Salesforce Auth Checker
 *
 * Validates Salesforce org authentication via `sf org display --json`.
 * Detects expired sessions, missing orgs, and connection issues.
 *
 * @module salesforce-auth-checker
 * @version 1.0.0
 */

const { execSync } = require('child_process');

module.exports = {
  name: 'Salesforce Auth',

  async run(options = {}) {
    const startMs = Date.now();
    const targetOrg = process.env.SF_TARGET_ORG;

    if (!targetOrg) {
      return {
        status: 'skip',
        message: 'SF_TARGET_ORG not set - skipping Salesforce auth check',
        remediation: 'export SF_TARGET_ORG=<your-org-alias>',
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    }

    try {
      const result = execSync(`sf org display --target-org "${targetOrg}" --json`, {
        stdio: 'pipe',
        timeout: 15000,
      }).toString();

      const parsed = JSON.parse(result);

      if (parsed.status !== 0) {
        const msg = parsed.message || 'Unknown org display error';
        return {
          status: 'fail',
          message: `Org "${targetOrg}": ${msg}`,
          remediation: `sf org login web --alias "${targetOrg}"`,
          autoFixable: false,
          durationMs: Date.now() - startMs,
        };
      }

      const orgInfo = parsed.result || {};
      const connStatus = orgInfo.connectedStatus;

      if (connStatus && connStatus !== 'Connected') {
        return {
          status: 'fail',
          message: `Org "${targetOrg}" session expired (status: ${connStatus})`,
          remediation: `sf org login web --alias "${targetOrg}"`,
          autoFixable: false,
          durationMs: Date.now() - startMs,
        };
      }

      const username = orgInfo.username || 'unknown';
      const instanceUrl = orgInfo.instanceUrl || '';
      return {
        status: 'pass',
        message: `Org "${targetOrg}" connected as ${username} (${instanceUrl})`,
        remediation: null,
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    } catch (err) {
      const errMsg = err.stderr ? err.stderr.toString().trim() : err.message;
      // Check for common patterns
      if (errMsg.includes('expired') || errMsg.includes('INVALID_SESSION')) {
        return {
          status: 'fail',
          message: `Org "${targetOrg}" session expired`,
          remediation: `sf org login web --alias "${targetOrg}"`,
          autoFixable: false,
          durationMs: Date.now() - startMs,
        };
      }
      if (errMsg.includes('No authorization information') || errMsg.includes('not recognized')) {
        return {
          status: 'fail',
          message: `Org "${targetOrg}" not authorized`,
          remediation: `sf org login web --alias "${targetOrg}"`,
          autoFixable: false,
          durationMs: Date.now() - startMs,
        };
      }
      return {
        status: 'fail',
        message: `Org "${targetOrg}" check failed: ${errMsg.slice(0, 200)}`,
        remediation: `sf org login web --alias "${targetOrg}"`,
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    }
  },
};
