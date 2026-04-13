'use strict';

// Tests for the 2026-04-13 license restore-loop remediation.
// Covers all five fixes from /home/chris/.claude/plans/fuzzy-riding-wind.md:
//   Fix 1 — confirm-terminated CLI + shell-hook restore loop prevention
//   Fix 2 — shouldFullyInvalidate confirmation barrier
//   Fix 3 — grace-expiry warning attached to session payloads
//   Fix 4 — license-state audit log at ~/.opspal/license-events.jsonl
//   Fix 5 — OPSPAL_LICENSE_DIR env-var override

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_SERVER = process.env.OPSPAL_LICENSE_SERVER;
const ORIGINAL_LICENSE_DIR = process.env.OPSPAL_LICENSE_DIR;
const ORIGINAL_GRACE_HOURS = process.env.OPSPAL_GRACE_WARNING_HOURS;

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-restore-loop-'));
}

function loadClient({ home, serverUrl, licenseDir, graceHours } = {}) {
  jest.resetModules();
  if (home) process.env.HOME = home;
  if (serverUrl) {
    process.env.OPSPAL_LICENSE_SERVER = serverUrl;
  } else {
    delete process.env.OPSPAL_LICENSE_SERVER;
  }
  if (licenseDir) {
    process.env.OPSPAL_LICENSE_DIR = licenseDir;
  } else {
    delete process.env.OPSPAL_LICENSE_DIR;
  }
  if (graceHours) {
    process.env.OPSPAL_GRACE_WARNING_HOURS = String(graceHours);
  } else {
    delete process.env.OPSPAL_GRACE_WARNING_HOURS;
  }
  return require('../scripts/lib/license-auth-client');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readAuditLines(auditFile) {
  if (!fs.existsSync(auditFile)) return [];
  return fs.readFileSync(auditFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
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
    req.on('data', (chunk) => { rawBody += chunk.toString('utf8'); });
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

afterEach(() => {
  jest.resetModules();
  if (typeof ORIGINAL_HOME === 'undefined') delete process.env.HOME;
  else process.env.HOME = ORIGINAL_HOME;

  if (typeof ORIGINAL_SERVER === 'undefined') delete process.env.OPSPAL_LICENSE_SERVER;
  else process.env.OPSPAL_LICENSE_SERVER = ORIGINAL_SERVER;

  if (typeof ORIGINAL_LICENSE_DIR === 'undefined') delete process.env.OPSPAL_LICENSE_DIR;
  else process.env.OPSPAL_LICENSE_DIR = ORIGINAL_LICENSE_DIR;

  if (typeof ORIGINAL_GRACE_HOURS === 'undefined') delete process.env.OPSPAL_GRACE_WARNING_HOURS;
  else process.env.OPSPAL_GRACE_WARNING_HOURS = ORIGINAL_GRACE_HOURS;
});

// ─── Fix 1: confirm-terminated CLI + restore-loop prevention ───────────────

describe('Fix 1 — confirmTerminated atomic wipe', () => {
  test('confirmTerminated writes marker, clears cache + backup, and removes runtime pointer', () => {
    const home = createTempHome();
    const client = loadClient({ home });
    const payload = buildCachePayload();
    client.writeLicenseCache(payload);

    expect(fs.existsSync(client.CACHE_FILE)).toBe(true);
    expect(fs.existsSync(client.CACHE_BACKUP_FILE)).toBe(true);

    const result = client.confirmTerminated({ caller: 'test' });

    expect(result.success).toBe(true);
    expect(result.terminated).toBe(true);
    expect(result.cache_file_removed).toBe(true);
    expect(result.backup_removed).toBe(true);
    expect(result.marker_present).toBe(true);
    expect(fs.existsSync(client.CACHE_FILE)).toBe(false);
    expect(fs.existsSync(client.CACHE_BACKUP_FILE)).toBe(false);
    expect(fs.existsSync(client.CACHE_TERMINATED_MARKER_FILE)).toBe(true);
  });

  test('confirmTerminated is idempotent when no cache or backup exists', () => {
    const home = createTempHome();
    const client = loadClient({ home });

    const result = client.confirmTerminated({ caller: 'test-idempotent' });

    expect(result.success).toBe(true);
    expect(result.cache_file_removed).toBe(true);
    expect(result.backup_removed).toBe(true);
    expect(result.marker_present).toBe(true);
  });

  test('restore-loop reproduction: post-confirmTerminated session cannot restore from backup', async () => {
    // Simulates the exact bug. Pre-patch sequence was:
    // 1. Cache had terminated:true baked in from a prior bad server response
    // 2. Shell hook raw-unlinked primary but kept backup, no marker
    // 3. Next session's restoreLicenseCacheFromBackup happily restored
    // 4. Restored cache still had terminated:true → hook wiped again (loop)
    // Post-patch, step 2 is replaced by confirmTerminated which also deletes the
    // backup AND writes the marker. Step 3 now sees marker present → refuses.
    const home = createTempHome();
    let client = loadClient({ home });
    client.writeLicenseCache(buildCachePayload());

    client.confirmTerminated({ caller: 'shell-hook-terminated' });

    // Simulate a subsequent offline session start: load the client fresh, ensure
    // restoreLicenseCacheFromBackup does not restore.
    client = loadClient({ home });
    const restored = client.restoreLicenseCacheFromBackup({ caller: 'session-token' });
    expect(restored).toBe(false);
    expect(fs.existsSync(client.CACHE_FILE)).toBe(false);
  });
});

// ─── Fix 2: shouldFullyInvalidate confirmation barrier ─────────────────────

describe('Fix 2 — shouldFullyInvalidate barrier', () => {
  test.each([
    [{ statusCode: 401 }, { terminated: true, error: 'x' }, false, 'rejects 401'],
    [{ statusCode: 404 }, { terminated: true, error: 'x' }, false, 'rejects 404'],
    [{ statusCode: 429 }, { terminated: true, error: 'x' }, false, 'rejects 429'],
    [{ statusCode: 500 }, { terminated: true, error: 'x' }, false, 'rejects 500'],
    [{ statusCode: 403 }, {}, false, 'rejects empty body'],
    [{ statusCode: 403 }, null, false, 'rejects null body'],
    [{ statusCode: 403 }, [], false, 'rejects array body'],
    [{ statusCode: 403 }, { terminated: true }, false, 'rejects missing error'],
    [{ statusCode: 403 }, { terminated: true, error: '' }, false, 'rejects empty error'],
    [{ statusCode: 403 }, { error: 'x' }, false, 'rejects missing terminated'],
    [{ statusCode: 403 }, { terminated: false, error: 'x' }, false, 'rejects terminated:false'],
    [{ statusCode: 403 }, { terminated: true, error: 'license_terminated' }, true, 'accepts full signature']
  ])('shouldFullyInvalidate(%o, %o) => %s  # %s', (err, body, expected) => {
    const home = createTempHome();
    const client = loadClient({ home });
    expect(client.shouldFullyInvalidate(err, body)).toBe(expected);
  });

  test('buildLiveFailureResponse does NOT wipe cache on 429 with terminated:true', async () => {
    await withJsonServer((req, res) => {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        terminated: true,
        error: 'rate_limited',
        message: 'Too many requests'
      }));
    }, async (serverUrl) => {
      const home = createTempHome();
      const client = loadClient({ home });
      client.writeLicenseCache(buildCachePayload({ server_url: serverUrl }));

      const session = await client.sessionToken();

      expect(session.valid).toBe(false);
      expect(session.terminated).toBe(true); // body echoes terminated
      expect(fs.existsSync(client.CACHE_FILE)).toBe(true); // but cache survives
      expect(fs.existsSync(client.CACHE_BACKUP_FILE)).toBe(true);
      expect(fs.existsSync(client.CACHE_TERMINATED_MARKER_FILE)).toBe(false);

      // Audit log should record the ignored hint
      const entries = readAuditLines(client.AUDIT_LOG_FILE);
      const ignored = entries.find((e) => e.action === 'terminated-hint-ignored');
      expect(ignored).toBeDefined();
      expect(ignored.caller).toBe('buildLiveFailureResponse');
    });
  });

  test('buildLiveFailureResponse DOES wipe cache on 403 with full termination signature', async () => {
    await withJsonServer((req, res) => {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        terminated: true,
        error: 'license_terminated',
        message: 'License terminated'
      }));
    }, async (serverUrl) => {
      const home = createTempHome();
      const client = loadClient({ home });
      client.writeLicenseCache(buildCachePayload({ server_url: serverUrl }));

      await client.sessionToken();

      expect(fs.existsSync(client.CACHE_FILE)).toBe(false);
      expect(fs.existsSync(client.CACHE_BACKUP_FILE)).toBe(false);
      expect(fs.existsSync(client.CACHE_TERMINATED_MARKER_FILE)).toBe(true);
    });
  });
});

// ─── Fix 3: grace warning threshold ────────────────────────────────────────

describe('Fix 3 — graceWarningFor', () => {
  test('returns null for grace_until well beyond threshold', () => {
    const home = createTempHome();
    const client = loadClient({ home });
    const farFuture = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    expect(client.graceWarningFor(farFuture)).toBeNull();
  });

  test('returns warning payload for grace_until within threshold', () => {
    const home = createTempHome();
    const client = loadClient({ home, graceHours: 48 });
    const in24h = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const warning = client.graceWarningFor(in24h);
    expect(warning).not.toBeNull();
    expect(warning.hours_remaining).toBeGreaterThan(23);
    expect(warning.hours_remaining).toBeLessThanOrEqual(24);
    expect(warning.threshold_hours).toBe(48);
    expect(new Date(warning.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  test('warning hours_remaining clamps to zero when already expired', () => {
    const home = createTempHome();
    const client = loadClient({ home });
    const past = new Date(Date.now() - 3600 * 1000).toISOString();
    const warning = client.graceWarningFor(past);
    expect(warning).not.toBeNull();
    expect(warning.hours_remaining).toBe(0);
  });

  test('cacheToSessionPayload (via sessionToken cache fallback) includes grace_warning when close to expiry', async () => {
    const home = createTempHome();
    const client = loadClient({ home });
    const soon = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
    // Plant cache with close grace — avoid live call by making serverUrl closed.
    client.writeLicenseCache(buildCachePayload({
      server_url: 'http://127.0.0.1:1',
      grace_until: soon
    }));

    const session = await client.sessionToken();

    expect(session.source).toBe('cache');
    expect(session.grace_warning).toBeDefined();
    expect(session.grace_warning.hours_remaining).toBeLessThanOrEqual(12);
    expect(session.message).toMatch(/reconnect within/i);
  });

  test('returns null for malformed grace_until', () => {
    const home = createTempHome();
    const client = loadClient({ home });
    expect(client.graceWarningFor(null)).toBeNull();
    expect(client.graceWarningFor('')).toBeNull();
    expect(client.graceWarningFor('not-a-date')).toBeNull();
  });
});

// ─── Fix 4: license-state audit log ────────────────────────────────────────

describe('Fix 4 — audit log', () => {
  test('appendAuditLog appends a parseable JSONL line per call', () => {
    const home = createTempHome();
    const client = loadClient({ home });

    client.appendAuditLog({ action: 'test-action', caller: 'test', reason: 'first' });
    client.appendAuditLog({ action: 'test-action', caller: 'test', reason: 'second' });

    const entries = readAuditLines(client.AUDIT_LOG_FILE);
    expect(entries).toHaveLength(2);
    expect(entries[0].action).toBe('test-action');
    expect(entries[0].reason).toBe('first');
    expect(entries[0].pid).toBe(process.pid);
    expect(entries[0].ts).toBeDefined();
    expect(entries[1].reason).toBe('second');
  });

  test('writeLicenseCache, clearLocalLicenseState, markTerminatedState all log', () => {
    const home = createTempHome();
    const client = loadClient({ home });
    client.writeLicenseCache(buildCachePayload(), { caller: 'test-a' });
    client.markTerminatedState({ caller: 'test-b' });
    client.clearLocalLicenseState({ caller: 'test-c', confirmedByServer: true, clearKeyFiles: true });

    const entries = readAuditLines(client.AUDIT_LOG_FILE);
    const actions = entries.map((e) => `${e.action}:${e.caller}`);
    expect(actions).toEqual(expect.arrayContaining([
      'write-cache:test-a',
      'mark-terminated:test-b',
      'clear-local-state:test-c'
    ]));
  });

  test('clear-local-state records whether key files were actually cleared', () => {
    const home = createTempHome();
    const client = loadClient({ home });

    // Unconfirmed — should NOT clear key files even though clearKeyFiles was requested
    client.clearLocalLicenseState({
      caller: 'unconfirmed-test',
      clearKeyFiles: true,
      confirmedByServer: false
    });

    const entries = readAuditLines(client.AUDIT_LOG_FILE);
    const entry = entries.find((e) => e.caller === 'unconfirmed-test');
    expect(entry.action).toBe('clear-local-state');
    expect(entry.key_files_requested).toBe(true);
    expect(entry.confirmed_by_server).toBe(false);
    expect(entry.cleared_key_files).toBe(false);
  });

  test('trim keeps at most AUDIT_LOG_MAX_LINES (500)', () => {
    const home = createTempHome();
    const client = loadClient({ home });

    // Append 600 entries — file should be trimmed to the last 500
    for (let i = 0; i < 600; i += 1) {
      client.appendAuditLog({ action: 'bulk', caller: 'test', reason: `entry-${i}` });
    }

    const entries = readAuditLines(client.AUDIT_LOG_FILE);
    expect(entries.length).toBe(500);
    // Oldest surviving entry should be #100 since 0-99 were trimmed
    expect(entries[0].reason).toBe('entry-100');
    expect(entries[entries.length - 1].reason).toBe('entry-599');
  });

  test('readRecentAuditEntries returns parseable recent entries', () => {
    const home = createTempHome();
    const client = loadClient({ home });
    for (let i = 0; i < 25; i += 1) {
      client.appendAuditLog({ action: 'x', caller: 'test', reason: `e${i}` });
    }
    const recent = client.readRecentAuditEntries(10);
    expect(recent).toHaveLength(10);
    expect(recent[9].reason).toBe('e24');
    expect(recent[0].reason).toBe('e15');
  });

  test('isLikelyShellHookStuckState flags when last clear came from shell-hook-terminated', () => {
    const home = createTempHome();
    const client = loadClient({ home });
    // Empty log → treat as stuck (first run after patch install)
    expect(client.isLikelyShellHookStuckState()).toBe(true);

    // Last clear was deactivate-cli → NOT stuck
    client.clearLocalLicenseState({
      caller: 'deactivate-cli',
      confirmedByServer: true,
      clearKeyFiles: true
    });
    expect(client.isLikelyShellHookStuckState()).toBe(false);

    // Last clear was shell-hook-terminated → stuck
    client.clearLocalLicenseState({
      caller: 'shell-hook-terminated',
      confirmedByServer: false,
      clearKeyFiles: false
    });
    expect(client.isLikelyShellHookStuckState()).toBe(true);
  });

  test('restoreLicenseCacheFromBackup tags auto-heal when stuck-state signature detected', () => {
    const home = createTempHome();
    const client = loadClient({ home });
    // Plant cache + backup
    client.writeLicenseCache(buildCachePayload());
    // Simulate the shell hook bug: wipe primary, leave backup, no marker
    fs.rmSync(client.CACHE_FILE);
    // Log the shell-hook clear (prior to our patch, this log wouldn't exist — we
    // simulate the post-patch state where the shell hook went through the JS client)
    client.clearLocalLicenseState({
      caller: 'shell-hook-terminated',
      confirmedByServer: false,
      clearKeyFiles: false
    });
    // Primary was just cleared by above call — restore backup to the state we want
    // Actually clearLocalLicenseState already cleared primary, which is what we want.

    const restored = client.restoreLicenseCacheFromBackup({ caller: 'session-token' });
    expect(restored).toBe(true);

    const entries = readAuditLines(client.AUDIT_LOG_FILE);
    const autoHeal = entries.find((e) => e.action === 'auto-heal');
    expect(autoHeal).toBeDefined();
    expect(autoHeal.stuck_state_detected).toBe(true);
  });
});

// ─── Fix 5: OPSPAL_LICENSE_DIR override ────────────────────────────────────

describe('Fix 5 — OPSPAL_LICENSE_DIR', () => {
  test('respects OPSPAL_LICENSE_DIR for cache location', () => {
    const home = createTempHome();
    const customDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-custom-dir-'));
    const client = loadClient({ home, licenseDir: customDir });

    expect(client.OPSPAL_DIR).toBe(path.resolve(customDir));
    expect(client.CACHE_FILE.startsWith(customDir)).toBe(true);
    expect(client.CACHE_BACKUP_FILE.startsWith(customDir)).toBe(true);
    expect(client.AUDIT_LOG_FILE.startsWith(customDir)).toBe(true);

    client.writeLicenseCache(buildCachePayload());
    expect(fs.existsSync(path.join(customDir, 'license-cache.json'))).toBe(true);
    // And NOT in the default ~/.opspal/
    expect(fs.existsSync(path.join(home, '.opspal', 'license-cache.json'))).toBe(false);
  });

  test('falls back to ~/.opspal/ when OPSPAL_LICENSE_DIR is unset', () => {
    const home = createTempHome();
    const client = loadClient({ home });
    expect(client.OPSPAL_DIR).toBe(path.join(home, '.opspal'));
  });

  test('ignores empty OPSPAL_LICENSE_DIR', () => {
    const home = createTempHome();
    const client = loadClient({ home, licenseDir: '   ' });
    expect(client.OPSPAL_DIR).toBe(path.join(home, '.opspal'));
  });
});
