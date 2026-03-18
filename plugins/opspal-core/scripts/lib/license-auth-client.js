'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_SERVER_URL = 'https://license.gorevpal.com';

function normalizeServerUrl(value) {
  const rawValue = typeof value === 'string' && value.trim()
    ? value.trim()
    : DEFAULT_SERVER_URL;
  const parsed = new URL(rawValue);

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported license server protocol: ${parsed.protocol}`);
  }

  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';

  return parsed.toString().replace(/\/$/, '');
}

function requestJson(options) {
  const serverUrl = normalizeServerUrl(options.serverUrl);
  const endpoint = new URL(options.path, `${serverUrl}/`);
  const payload = typeof options.body === 'undefined'
    ? null
    : Buffer.from(JSON.stringify(options.body));
  const transport = endpoint.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request({
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      port: endpoint.port || undefined,
      path: `${endpoint.pathname}${endpoint.search}`,
      method: options.method || 'POST',
      headers: {
        'Accept': 'application/json',
        ...(payload ? {
          'Content-Type': 'application/json',
          'Content-Length': String(payload.length)
        } : {}),
        ...(options.headers || {})
      }
    }, (res) => {
      const chunks = [];

      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        let body = {};

        if (rawBody) {
          try {
            body = JSON.parse(rawBody);
          } catch (err) {
            err.message = `License server returned invalid JSON: ${err.message}`;
            reject(err);
            return;
          }
        }

        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body
        });
      });
    });

    req.on('error', reject);

    if (payload) {
      req.write(payload);
    }

    req.end();
  });
}

async function activateLicenseRequest(options) {
  const response = await requestJson({
    serverUrl: options.serverUrl,
    method: 'POST',
    path: '/api/v1/session-token',
    body: {
      license_key: options.licenseKey,
      machine_id: options.machineId,
      user_email: options.userEmail,
      key_bundle_version: 2
    }
  });

  if (response.statusCode >= 400) {
    const error = new Error(response.body.message || `Activation failed (${response.statusCode})`);
    error.code = response.body.error || 'activation_failed';
    error.statusCode = response.statusCode;
    error.response = response.body;
    throw error;
  }

  return response.body;
}

module.exports = {
  DEFAULT_SERVER_URL,
  normalizeServerUrl,
  requestJson,
  activateLicenseRequest
};
