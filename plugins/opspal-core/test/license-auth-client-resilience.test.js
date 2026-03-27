'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_SERVER = process.env.OPSPAL_LICENSE_SERVER;

function buildCachePayload(overrides = {}) {
  return {
    updated_at: '2026-03-18T12:00:00.000Z',
    server_url: 'http://127.0.0.1:65535',
    license_key: 'OPSPAL-PRO-demo',
    user_email: 'user@example.com',
    machine_id: 'machine-01',
    session_token: 'session-token',
    tier: 'professional',
    organization: 'Acme Corp',
    license_status: 'active',
    valid: true,
    terminated: false,
    expires_at: null,
    allowed_asset_tiers: ['core', 'salesforce'],
    tier_metadata: {},
    blocked_domains: [],
    key_bundle_version: 2,
    key_bundle: {
      version: 2,
      keys: {
        core: Buffer.alloc(32, 1).toString('base64')
      }
    },
    grace_until: '2999-01-01T00:00:00.000Z',
    ...overrides
  };
}

function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-license-auth-'));
}

function loadClient(home, serverUrl) {
  jest.resetModules();
  process.env.HOME = home;

  if (serverUrl) {
    process.env.OPSPAL_LICENSE_SERVER = serverUrl;
  } else {
    delete process.env.OPSPAL_LICENSE_SERVER;
  }

  return require('../scripts/lib/license-auth-client');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function withJsonServer(handler, callback) {
  const server = http.createServer((req, res) => {
    let rawBody = '';

    req.on('data', (chunk) => {
      rawBody += chunk.toString('utf8');
    });

    req.on('end', () => handler(req, res, rawBody));
  });

  await listen(server);

  try {
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await close(server);
  }
}

async function getClosedServerUrl() {
  const server = http.createServer((req, res) => {
    res.end('unused');
  });

  await listen(server);
  const address = server.address();
  await close(server);

  return `http://127.0.0.1:${address.port}`;
}

afterEach(() => {
  jest.resetModules();

  if (typeof ORIGINAL_HOME === 'undefined') {
    delete process.env.HOME;
  } else {
    process.env.HOME = ORIGINAL_HOME;
  }

  if (typeof ORIGINAL_SERVER === 'undefined') {
    delete process.env.OPSPAL_LICENSE_SERVER;
  } else {
    process.env.OPSPAL_LICENSE_SERVER = ORIGINAL_SERVER;
  }
});

describe('license auth client resilience', () => {
  test('writeLicenseCache also writes a backup cache copy', () => {
    const home = createTempHome();
    const client = loadClient(home);
    const payload = buildCachePayload();

    client.writeLicenseCache(payload);

    expect(fs.existsSync(client.CACHE_FILE)).toBe(true);
    expect(fs.existsSync(client.CACHE_BACKUP_FILE)).toBe(true);
    expect(fs.existsSync(client.CACHE_TERMINATED_MARKER_FILE)).toBe(false);
    expect(readJson(client.CACHE_FILE)).toEqual(payload);
    expect(readJson(client.CACHE_BACKUP_FILE)).toEqual(payload);
  });

  test('sessionToken restores the cache from backup when the primary cache file is missing', async () => {
    const home = createTempHome();
    const client = loadClient(home);
    const closedServerUrl = await getClosedServerUrl();
    const payload = buildCachePayload({ server_url: closedServerUrl });

    client.writeLicenseCache(payload);
    fs.rmSync(client.CACHE_FILE, { force: true });

    const session = await client.sessionToken();

    expect(fs.existsSync(client.CACHE_FILE)).toBe(true);
    expect(readJson(client.CACHE_FILE)).toEqual(payload);
    expect(session.valid).toBe(true);
    expect(session.source).toBe('cache');
    expect(session.within_grace).toBe(true);
  });

  test.each([401, 404])('sessionToken keeps the cache on HTTP %i without termination', async (statusCode) => {
    await withJsonServer((req, res) => {
      expect(req.url).toBe('/api/v1/session-token');

      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'temporary_upstream_error',
        message: `temporary ${statusCode}`
      }));
    }, async (serverUrl) => {
      const home = createTempHome();
      const client = loadClient(home);
      const payload = buildCachePayload({ server_url: serverUrl });

      client.writeLicenseCache(payload);

      const session = await client.sessionToken();

      expect(session.valid).toBe(false);
      expect(session.terminated).toBe(false);
      expect(fs.existsSync(client.CACHE_FILE)).toBe(true);
      expect(fs.existsSync(client.CACHE_BACKUP_FILE)).toBe(true);
      expect(readJson(client.CACHE_FILE)).toEqual(payload);
    });
  });

  test('pollStatus keeps the cache on HTTP 401 without termination', async () => {
    await withJsonServer((req, res) => {
      expect(req.url).toBe('/api/v1/poll');

      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'temporary_upstream_error',
        message: 'temporary 401'
      }));
    }, async (serverUrl) => {
      const home = createTempHome();
      const client = loadClient(home);
      const payload = buildCachePayload({ server_url: serverUrl });

      client.writeLicenseCache(payload);

      const result = await client.pollStatus();

      expect(result).toEqual({
        error: 'temporary_upstream_error',
        message: 'temporary 401'
      });
      expect(fs.existsSync(client.CACHE_FILE)).toBe(true);
      expect(readJson(client.CACHE_FILE)).toEqual(payload);
    });
  });

  test('pollStatus clears the active cache only when the server confirms termination', async () => {
    await withJsonServer((req, res) => {
      expect(req.url).toBe('/api/v1/poll');

      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        valid: false,
        terminated: true,
        error: 'license_terminated',
        message: 'terminated'
      }));
    }, async (serverUrl) => {
      const home = createTempHome();
      const client = loadClient(home);
      const payload = buildCachePayload({ server_url: serverUrl });

      client.writeLicenseCache(payload);

      const result = await client.pollStatus();

      expect(result.terminated).toBe(true);
      expect(fs.existsSync(client.CACHE_FILE)).toBe(false);
      expect(fs.existsSync(client.CACHE_BACKUP_FILE)).toBe(true);
      expect(fs.existsSync(client.CACHE_TERMINATED_MARKER_FILE)).toBe(true);
    });
  });

  test('confirmed termination blocks automatic backup restore during later offline sessions', async () => {
    const home = createTempHome();

    await withJsonServer((req, res) => {
      expect(req.url).toBe('/api/v1/poll');

      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        valid: false,
        terminated: true,
        error: 'license_terminated',
        message: 'terminated'
      }));
    }, async (serverUrl) => {
      const client = loadClient(home);
      const payload = buildCachePayload({ server_url: serverUrl });

      client.writeLicenseCache(payload);
      await client.pollStatus();
    });

    const closedServerUrl = await getClosedServerUrl();
    const client = loadClient(home, closedServerUrl);
    const session = await client.sessionToken();

    expect(session.valid).toBe(false);
    expect(session.error).toBe('missing_activation');
    expect(fs.existsSync(client.CACHE_FILE)).toBe(false);
    expect(fs.existsSync(client.CACHE_BACKUP_FILE)).toBe(true);
    expect(fs.existsSync(client.CACHE_TERMINATED_MARKER_FILE)).toBe(true);
  });

  test('deactivate removes both the active cache and the backup cache', async () => {
    await withJsonServer((req, res) => {
      expect(req.url).toBe('/api/v1/deactivate');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    }, async (serverUrl) => {
      const home = createTempHome();
      const client = loadClient(home);
      const payload = buildCachePayload({ server_url: serverUrl });

      client.writeLicenseCache(payload);

      await client.deactivate({ sessionToken: payload.session_token });

      expect(fs.existsSync(client.CACHE_FILE)).toBe(false);
      expect(fs.existsSync(client.CACHE_BACKUP_FILE)).toBe(false);
    });
  });
});
