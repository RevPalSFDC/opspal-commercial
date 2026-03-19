#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

function withClientEnv(env, fn) {
  const previousHome = process.env.HOME;
  const previousServer = process.env.OPSPAL_LICENSE_SERVER;
  const modulePath = require.resolve('./license-auth-client');

  try {
    process.env.HOME = env.home;
    if (typeof env.server === 'string') {
      process.env.OPSPAL_LICENSE_SERVER = env.server;
    } else {
      delete process.env.OPSPAL_LICENSE_SERVER;
    }

    delete require.cache[modulePath];
    const client = require('./license-auth-client');
    fn(client);
  } finally {
    delete require.cache[modulePath];
    process.env.HOME = previousHome;
    if (typeof previousServer === 'string') {
      process.env.OPSPAL_LICENSE_SERVER = previousServer;
    } else {
      delete process.env.OPSPAL_LICENSE_SERVER;
    }
  }
}

test('getServerUrl defaults to production host', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-license-client-'));
  withClientEnv({ home }, (client) => {
    assert.strictEqual(client.getServerUrl(), 'https://license.gorevpal.com');
    assert.strictEqual(client.status().server_url, 'https://license.gorevpal.com');
  });
});

test('getServerUrl strips trailing slash from override', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-license-client-'));
  withClientEnv({ home, server: 'https://license.example.com/' }, (client) => {
    assert.strictEqual(client.getServerUrl(), 'https://license.example.com');
    assert.strictEqual(client.status().server_url, 'https://license.example.com');
  });
});

test('status reports a valid cached scoped bundle within the offline grace window', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-license-client-'));
  const cacheDir = path.join(home, '.opspal');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, 'license-cache.json'), JSON.stringify({
    updated_at: '2026-03-18T12:00:00.000Z',
    server_url: 'https://license.example.com',
    license_key: 'OPSPAL-PRO-demo',
    user_email: 'user@example.com',
    machine_id: 'machine-01',
    session_token: 'token',
    tier: 'professional',
    license_status: 'active',
    allowed_asset_tiers: ['core', 'salesforce', 'hubspot'],
    blocked_domains: [],
    key_bundle_version: 2,
    key_bundle: {
      version: 2,
      keys: {
        core: Buffer.alloc(32, 1).toString('base64')
      }
    },
    grace_until: '2999-01-01T00:00:00.000Z'
  }, null, 2));

  withClientEnv({ home }, (client) => {
    const status = client.status();
    assert.strictEqual(status.status, 'valid');
    assert.strictEqual(status.valid, true);
    assert.strictEqual(status.has_scoped_key_bundle, true);
    assert.deepStrictEqual(status.allowed_asset_tiers, ['core', 'salesforce', 'hubspot']);
  });
});
