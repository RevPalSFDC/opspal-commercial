#!/usr/bin/env node

/**
 * Marketo Auth Checker
 *
 * Tests Marketo OAuth client_credentials flow.
 * Checks for cached token freshness first (file-based, no API call in quick mode).
 *
 * @module marketo-auth-checker
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const CACHE_DIR = path.join(process.env.HOME || '/tmp', '.claude', 'auth-cache');
const CACHE_FILE = path.join(CACHE_DIR, 'marketo-token.json');

function httpPost(url, body = '') {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(body);
    req.end();
  });
}

module.exports = {
  name: 'Marketo Auth',

  async run(options = {}) {
    const startMs = Date.now();
    const munchkinId = process.env.MARKETO_MUNCHKIN_ID;
    const clientId = process.env.MARKETO_CLIENT_ID;
    const clientSecret = process.env.MARKETO_CLIENT_SECRET;

    if (!munchkinId || !clientId || !clientSecret) {
      if (!munchkinId && !clientId) {
        return {
          status: 'skip',
          message: 'Marketo credentials not configured - skipping',
          remediation: 'export MARKETO_MUNCHKIN_ID=<id> MARKETO_CLIENT_ID=<id> MARKETO_CLIENT_SECRET=<secret>',
          autoFixable: false,
          durationMs: Date.now() - startMs,
        };
      }
      const missing = [];
      if (!munchkinId) missing.push('MARKETO_MUNCHKIN_ID');
      if (!clientId) missing.push('MARKETO_CLIENT_ID');
      if (!clientSecret) missing.push('MARKETO_CLIENT_SECRET');
      return {
        status: 'fail',
        message: `Missing Marketo credentials: ${missing.join(', ')}`,
        remediation: `export ${missing.join('=<value> ')}=<value>`,
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    }

    // Quick mode: check cached token freshness only (no API call)
    if (options.quick) {
      try {
        if (fs.existsSync(CACHE_FILE)) {
          const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
          const age = Date.now() - (cached.timestamp || 0);
          if (age < 50 * 60 * 1000) { // < 50 minutes (tokens valid ~60 min)
            return {
              status: 'pass',
              message: `Marketo token cached (${Math.round(age / 60000)}min old)`,
              remediation: null,
              autoFixable: false,
              durationMs: Date.now() - startMs,
            };
          }
          return {
            status: 'warn',
            message: `Marketo cached token expired (${Math.round(age / 60000)}min old)`,
            remediation: 'Token will be refreshed on next API call',
            autoFixable: true,
            fixTier: 'prompted',
            durationMs: Date.now() - startMs,
          };
        }
      } catch {
        // Fall through to API check
      }
    }

    // Full check: attempt OAuth token fetch
    try {
      const baseUrl = `https://${munchkinId}.mktorest.com`;
      const tokenUrl = `${baseUrl}/identity/oauth/token?grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`;
      const resp = await httpPost(tokenUrl);

      if (resp.statusCode === 200) {
        const body = JSON.parse(resp.body);
        if (body.access_token) {
          // Cache the token
          try {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
            fs.writeFileSync(CACHE_FILE, JSON.stringify({
              access_token: body.access_token,
              expires_in: body.expires_in,
              timestamp: Date.now(),
            }));
          } catch {
            // Cache write is best-effort
          }
          return {
            status: 'pass',
            message: `Marketo authenticated (${munchkinId})`,
            remediation: null,
            autoFixable: false,
            durationMs: Date.now() - startMs,
          };
        }
        return {
          status: 'fail',
          message: `Marketo token response missing access_token: ${body.error || 'unknown'}`,
          remediation: 'Verify MARKETO_CLIENT_ID and MARKETO_CLIENT_SECRET',
          autoFixable: false,
          durationMs: Date.now() - startMs,
        };
      }

      return {
        status: 'fail',
        message: `Marketo OAuth failed (HTTP ${resp.statusCode})`,
        remediation: 'Verify MARKETO_MUNCHKIN_ID, CLIENT_ID, and CLIENT_SECRET',
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    } catch (err) {
      return {
        status: 'fail',
        message: `Marketo connection failed: ${err.message}`,
        remediation: 'Check network and MARKETO_MUNCHKIN_ID format (e.g., 123-ABC-456)',
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    }
  },
};
