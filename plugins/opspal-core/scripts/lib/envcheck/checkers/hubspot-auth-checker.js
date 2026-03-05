#!/usr/bin/env node

/**
 * HubSpot Auth Checker
 *
 * Validates HubSpot access token via API call to /account-info/v3/api-usage/daily.
 *
 * @module hubspot-auth-checker
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
  name: 'HubSpot Auth',

  async run(options = {}) {
    const startMs = Date.now();
    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    const portalId = process.env.HUBSPOT_PORTAL_ID;

    if (!token) {
      if (!portalId) {
        return {
          status: 'skip',
          message: 'HUBSPOT_ACCESS_TOKEN not set - skipping HubSpot auth check',
          remediation: 'export HUBSPOT_ACCESS_TOKEN=<your-token>',
          autoFixable: false,
          durationMs: Date.now() - startMs,
        };
      }
      return {
        status: 'fail',
        message: 'HUBSPOT_PORTAL_ID set but HUBSPOT_ACCESS_TOKEN is missing',
        remediation: 'export HUBSPOT_ACCESS_TOKEN=<your-access-token>',
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    }

    try {
      const resp = await httpGet(
        'https://api.hubapi.com/account-info/v3/api-usage/daily',
        { Authorization: `Bearer ${token}` }
      );

      if (resp.statusCode === 200) {
        const msg = portalId ? `Portal ${portalId} authenticated` : 'Token valid';
        return {
          status: 'pass',
          message: msg,
          remediation: null,
          autoFixable: false,
          durationMs: Date.now() - startMs,
        };
      }

      if (resp.statusCode === 401) {
        return {
          status: 'fail',
          message: 'HubSpot token expired or invalid (401)',
          remediation: 'Regenerate token at https://app.hubspot.com/private-apps/ and export HUBSPOT_ACCESS_TOKEN=<new-token>',
          autoFixable: false,
          durationMs: Date.now() - startMs,
        };
      }

      return {
        status: 'warn',
        message: `HubSpot API returned status ${resp.statusCode}`,
        remediation: null,
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    } catch (err) {
      return {
        status: 'fail',
        message: `HubSpot connection failed: ${err.message}`,
        remediation: 'Check network connectivity and HUBSPOT_ACCESS_TOKEN',
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    }
  },
};
