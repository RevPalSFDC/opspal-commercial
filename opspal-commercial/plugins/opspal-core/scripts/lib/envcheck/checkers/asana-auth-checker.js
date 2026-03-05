#!/usr/bin/env node

/**
 * Asana Auth Checker
 *
 * Validates Asana PAT by calling GET /api/1.0/users/me.
 *
 * @module asana-auth-checker
 * @version 1.0.0
 */

const https = require('https');

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

module.exports = {
  name: 'Asana Auth',

  async run(options = {}) {
    const startMs = Date.now();
    const token = process.env.ASANA_ACCESS_TOKEN;

    if (!token) {
      return {
        status: 'skip',
        message: 'ASANA_ACCESS_TOKEN not set - skipping Asana auth check',
        remediation: 'export ASANA_ACCESS_TOKEN=<your-personal-access-token>',
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    }

    try {
      const resp = await httpGet('https://app.asana.com/api/1.0/users/me', {
        Authorization: `Bearer ${token}`,
      });

      if (resp.statusCode === 200) {
        const body = JSON.parse(resp.body);
        const name = body.data?.name || 'Unknown';
        const email = body.data?.email || '';
        return {
          status: 'pass',
          message: `Asana authenticated as ${name}${email ? ` (${email})` : ''}`,
          remediation: null,
          autoFixable: false,
          durationMs: Date.now() - startMs,
        };
      }

      if (resp.statusCode === 401) {
        return {
          status: 'fail',
          message: 'Asana token invalid or expired (401)',
          remediation: 'Regenerate PAT at https://app.asana.com/0/my-apps and export ASANA_ACCESS_TOKEN=<new-token>',
          autoFixable: false,
          durationMs: Date.now() - startMs,
        };
      }

      return {
        status: 'warn',
        message: `Asana API returned status ${resp.statusCode}`,
        remediation: null,
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    } catch (err) {
      return {
        status: 'fail',
        message: `Asana connection failed: ${err.message}`,
        remediation: 'Check network connectivity and ASANA_ACCESS_TOKEN',
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    }
  },
};
