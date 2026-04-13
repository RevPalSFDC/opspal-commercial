'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { URL } = require('url');

const { DOMAIN_KEY_FILES } = require('./asset-encryption-engine');

const DEFAULT_SERVER_URL = 'https://license.gorevpal.com';
const DEFAULT_OFFLINE_GRACE_DAYS = parseInt(process.env.OPSPAL_OFFLINE_GRACE_DAYS, 10) || 7;
const GRACE_WARNING_THRESHOLD_HOURS = parseInt(process.env.OPSPAL_GRACE_WARNING_HOURS, 10) || 48;
const AUDIT_LOG_MAX_LINES = 500;
const HOME_DIR = process.env.HOME || os.homedir();

// OPSPAL_LICENSE_DIR escape hatch — Windows users running both Claude Desktop (Git Bash)
// and Claude CLI (WSL) can point both shells at a single shared path so one activation
// works in both environments. Unset (default) uses ~/.opspal/ per-shell.
const OPSPAL_DIR = (process.env.OPSPAL_LICENSE_DIR && process.env.OPSPAL_LICENSE_DIR.trim())
  ? path.resolve(process.env.OPSPAL_LICENSE_DIR.trim())
  : path.join(HOME_DIR, '.opspal');

const CACHE_FILE = path.join(OPSPAL_DIR, 'license-cache.json');
const CACHE_BACKUP_FILE = path.join(OPSPAL_DIR, 'license-cache.json.bak');
const CACHE_TERMINATED_MARKER_FILE = path.join(OPSPAL_DIR, 'license-cache.terminated');
const LEGACY_LICENSE_KEY_FILE = path.join(OPSPAL_DIR, 'license.key');
const AUDIT_LOG_FILE = path.join(OPSPAL_DIR, 'license-events.jsonl');
const SESSION_RUNTIME_DIR = path.join(HOME_DIR, '.claude', 'opspal-enc', 'runtime');
const CURRENT_SESSION_POINTER = path.join(SESSION_RUNTIME_DIR, '.current-session');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeUserEmail(value) {
  return normalizeText(value).toLowerCase();
}

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

function ensureOpspalDir() {
  fs.mkdirSync(OPSPAL_DIR, { recursive: true, mode: 0o700 });
}

function getLicenseCacheFile() {
  return CACHE_FILE;
}

function readLicenseCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeLicenseCache(payload, options = {}) {
  ensureOpspalDir();

  const tempFile = `${CACHE_FILE}.tmp.${process.pid}`;
  fs.writeFileSync(tempFile, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempFile, CACHE_FILE);
  backupLicenseCache(payload);
  clearTerminatedStateMarker({ caller: options.caller || 'write-cache' });

  appendAuditLog({
    action: 'write-cache',
    caller: options.caller || 'unknown',
    reason: options.reason || 'cache-written',
    tier: (payload && payload.tier) || null,
    grace_until: (payload && payload.grace_until) || null
  });
}

function backupLicenseCache(payload = readLicenseCache()) {
  if (!payload) {
    return false;
  }

  ensureOpspalDir();

  const tempFile = `${CACHE_BACKUP_FILE}.tmp.${process.pid}`;
  fs.writeFileSync(tempFile, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempFile, CACHE_BACKUP_FILE);

  return true;
}

function restoreLicenseCacheFromBackup(options = {}) {
  if (fs.existsSync(CACHE_FILE) || !fs.existsSync(CACHE_BACKUP_FILE) || fs.existsSync(CACHE_TERMINATED_MARKER_FILE)) {
    return false;
  }

  const tempFile = `${CACHE_FILE}.tmp.${process.pid}`;
  const stuckStateDetected = isLikelyShellHookStuckState();

  try {
    ensureOpspalDir();
    fs.copyFileSync(CACHE_BACKUP_FILE, tempFile);
    fs.chmodSync(tempFile, 0o600);
    fs.renameSync(tempFile, CACHE_FILE);

    appendAuditLog({
      action: stuckStateDetected ? 'auto-heal' : 'restore-from-backup',
      caller: options.caller || 'unknown',
      reason: stuckStateDetected
        ? 'shell-hook-restore-loop-detected'
        : (options.reason || 'cache-missing-backup-present'),
      stuck_state_detected: stuckStateDetected
    });

    return true;
  } catch (err) {
    removeFile(tempFile);
    appendAuditLog({
      action: 'restore-from-backup-failed',
      caller: options.caller || 'unknown',
      reason: err && err.message ? err.message : 'unknown-error'
    });
    return false;
  }
}

// ─── Grace-expiry warning helper ────────────────────────────────────────────
// Returns { hours_remaining, expires_at, threshold_hours } when grace_until is
// within GRACE_WARNING_THRESHOLD_HOURS, otherwise null. Called from both the
// cache-fallback path in sessionToken() and from cacheToSessionPayload() so
// the shell hook and /license-status can surface an actionable message before
// the 7-day silent-expiry cliff hits.
function graceWarningFor(graceUntil) {
  if (!graceUntil) return null;
  const expiryMs = Date.parse(graceUntil);
  if (Number.isNaN(expiryMs)) return null;
  const hoursRemaining = (expiryMs - Date.now()) / 3_600_000;
  if (hoursRemaining > GRACE_WARNING_THRESHOLD_HOURS) return null;
  return {
    hours_remaining: Math.max(0, Math.round(hoursRemaining * 10) / 10),
    expires_at: new Date(expiryMs).toISOString(),
    threshold_hours: GRACE_WARNING_THRESHOLD_HOURS
  };
}

// ─── Stuck-state detection (auto-heal) ──────────────────────────────────────
// Returns true when the most recent cache clear in the audit log was done by
// the shell hook termination path. That is the signature of the restore-loop
// bug fixed by the confirm-terminated CLI subcommand — on install, pre-patch
// wipes are detected by the audit log being absent (the trail never existed),
// and the same recovery action applies. A 'clear-local-state' from the
// deactivate-cli or server-confirmed 403+terminated:true path is NOT stuck.
function isLikelyShellHookStuckState() {
  const entries = readRecentAuditEntries(50);
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i];
    if (e.action === 'clear-local-state') {
      return e.caller === 'shell-hook-terminated';
    }
  }
  // No prior clear recorded — either first run after patch install, or the
  // audit log never existed (pre-patch shell hook did the wipe). In both
  // cases, restoring from the backup is the correct action.
  return true;
}

function removeFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  } catch {
    // Best-effort cleanup only.
  }
}

// ─── Audit log ──────────────────────────────────────────────────────────────
// Append-only JSONL trail of license state mutations at ~/.opspal/license-events.jsonl.
// Every state-changing function instruments through appendAuditLog so support has a
// triage trail when a cache disappears. Never read by runtime — corruption cannot cascade.
function appendAuditLog(entry) {
  try {
    ensureOpspalDir();
    const line = `${JSON.stringify({
      ts: new Date().toISOString(),
      pid: process.pid,
      ...entry
    })}\n`;
    fs.appendFileSync(AUDIT_LOG_FILE, line, { mode: 0o600 });
    trimAuditLog();
  } catch {
    // Audit log writes must never throw — the audit log is observability, not correctness.
  }
}

function trimAuditLog() {
  try {
    if (!fs.existsSync(AUDIT_LOG_FILE)) return;
    const raw = fs.readFileSync(AUDIT_LOG_FILE, 'utf8');
    const lines = raw.split('\n').filter((l) => l.length > 0);
    if (lines.length <= AUDIT_LOG_MAX_LINES) return;
    const kept = lines.slice(-AUDIT_LOG_MAX_LINES).join('\n') + '\n';
    const tempFile = `${AUDIT_LOG_FILE}.tmp.${process.pid}`;
    fs.writeFileSync(tempFile, kept, { mode: 0o600 });
    fs.renameSync(tempFile, AUDIT_LOG_FILE);
  } catch {
    // Trimming is best-effort.
  }
}

function readRecentAuditEntries(limit = 20) {
  try {
    if (!fs.existsSync(AUDIT_LOG_FILE)) return [];
    const raw = fs.readFileSync(AUDIT_LOG_FILE, 'utf8');
    const lines = raw.split('\n').filter((l) => l.length > 0);
    return lines.slice(-limit).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function markTerminatedState(options = {}) {
  ensureOpspalDir();

  const tempFile = `${CACHE_TERMINATED_MARKER_FILE}.tmp.${process.pid}`;
  fs.writeFileSync(tempFile, `${JSON.stringify({ terminated_at: new Date().toISOString() })}\n`, { mode: 0o600 });
  fs.renameSync(tempFile, CACHE_TERMINATED_MARKER_FILE);

  appendAuditLog({
    action: 'mark-terminated',
    caller: options.caller || 'unknown',
    reason: options.reason || 'server-confirmed-termination'
  });
}

function clearTerminatedStateMarker(options = {}) {
  const wasPresent = fs.existsSync(CACHE_TERMINATED_MARKER_FILE);
  removeFile(CACHE_TERMINATED_MARKER_FILE);
  if (wasPresent) {
    appendAuditLog({
      action: 'clear-terminated-marker',
      caller: options.caller || 'unknown',
      reason: options.reason || 'marker-cleared'
    });
  }
}

function clearRuntimeArtifacts() {
  removeFile(CURRENT_SESSION_POINTER);
}

// clearLocalLicenseState deletes the primary cache and optionally the per-domain
// decryption key files. Key-file destruction is irreversible without a fresh license
// server round-trip, so callers that want it MUST pass { clearKeyFiles: true,
// confirmedByServer: true }. Missing confirmedByServer silently downgrades to a
// cache-only clear and is logged — a defensive barrier against false-positive wipes.
function clearLocalLicenseState(options = {}) {
  const caller = options.caller || 'unknown';
  const keyFilesRequested = options.clearKeyFiles === true;
  const confirmedByServer = options.confirmedByServer === true;
  const shouldClearKeyFiles = keyFilesRequested && confirmedByServer;

  const cacheWasPresent = fs.existsSync(CACHE_FILE);
  removeFile(CACHE_FILE);
  removeFile(LEGACY_LICENSE_KEY_FILE);
  clearRuntimeArtifacts();

  if (shouldClearKeyFiles) {
    for (const filePath of Object.values(DOMAIN_KEY_FILES)) {
      removeFile(filePath);
    }
  }

  appendAuditLog({
    action: 'clear-local-state',
    caller,
    reason: options.reason || 'unspecified',
    cache_was_present: cacheWasPresent,
    cleared_key_files: shouldClearKeyFiles,
    key_files_requested: keyFilesRequested,
    confirmed_by_server: confirmedByServer
  });
}

function getServerUrl(overrideValue) {
  if (normalizeText(overrideValue)) {
    return normalizeServerUrl(overrideValue);
  }

  if (normalizeText(process.env.OPSPAL_LICENSE_SERVER)) {
    return normalizeServerUrl(process.env.OPSPAL_LICENSE_SERVER);
  }

  const cache = readLicenseCache();
  if (cache && normalizeText(cache.server_url)) {
    return normalizeServerUrl(cache.server_url);
  }

  return normalizeServerUrl(DEFAULT_SERVER_URL);
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
        Accept: 'application/json',
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

function resolveActivationContext(options = {}) {
  const cache = readLicenseCache();

  return {
    cache,
    serverUrl: getServerUrl(options.serverUrl || (cache && cache.server_url)),
    licenseKey: normalizeText(
      options.licenseKey
      || process.env.OPSPAL_LICENSE_KEY
      || (cache && cache.license_key)
    ),
    userEmail: normalizeUserEmail(
      options.userEmail
      || options.email
      || process.env.OPSPAL_LICENSE_EMAIL
      || (cache && cache.user_email)
    ),
    machineId: normalizeText(
      options.machineId
      || process.env.OPSPAL_MACHINE_ID
      || (cache && cache.machine_id)
    ),
    sessionToken: normalizeText(options.sessionToken || (cache && cache.session_token))
  };
}

function buildGraceUntil(value, updatedAt) {
  const parsedValue = value ? new Date(value) : null;
  if (parsedValue && !Number.isNaN(parsedValue.getTime())) {
    return parsedValue.toISOString();
  }

  const baseDate = updatedAt ? new Date(updatedAt) : new Date();
  baseDate.setUTCDate(baseDate.getUTCDate() + DEFAULT_OFFLINE_GRACE_DAYS);
  return baseDate.toISOString();
}

function hasScopedKeyBundle(cache) {
  return Boolean(
    cache
    && cache.key_bundle
    && cache.key_bundle.version === 2
    && cache.key_bundle.keys
    && Object.keys(cache.key_bundle.keys).length > 0
  );
}

function isWithinGrace(cache) {
  if (!cache) {
    return false;
  }

  const graceUntil = buildGraceUntil(cache.grace_until, cache.updated_at);
  return Date.now() <= Date.parse(graceUntil);
}

function hasUsableCachedBundle(cache) {
  return Boolean(
    cache
    && cache.valid !== false
    && cache.terminated !== true
    && hasScopedKeyBundle(cache)
    && isWithinGrace(cache)
  );
}

function cacheToSessionPayload(cache, extra = {}) {
  const graceUntil = buildGraceUntil(cache.grace_until, cache.updated_at);
  const payload = {
    valid: cache.valid !== false,
    terminated: cache.terminated === true,
    session_token: cache.session_token || '',
    tier: cache.tier || '',
    status: cache.license_status || 'active',
    organization: cache.organization || '',
    expires_at: cache.expires_at || null,
    allowed_asset_tiers: Array.isArray(cache.allowed_asset_tiers) ? cache.allowed_asset_tiers : [],
    tier_metadata: cache.tier_metadata || {},
    blocked_domains: Array.isArray(cache.blocked_domains) ? cache.blocked_domains : [],
    key_bundle_version: cache.key_bundle_version || (cache.key_bundle && cache.key_bundle.version) || null,
    key_bundle: cache.key_bundle || null,
    grace_until: graceUntil,
    user_email: cache.user_email || '',
    machine_id: cache.machine_id || '',
    source: extra.source || 'cache',
    within_grace: extra.withinGrace === true
  };

  const warning = graceWarningFor(graceUntil);
  if (warning) {
    payload.grace_warning = warning;
  }

  return payload;
}

function buildCachePayload(response, context, previousCache = null) {
  const updatedAt = new Date().toISOString();
  const cachePayload = {
    updated_at: updatedAt,
    server_url: context.serverUrl,
    license_key: context.licenseKey,
    user_email: context.userEmail,
    machine_id: context.machineId,
    session_token: response.session_token || '',
    tier: response.tier || '',
    organization: response.organization || '',
    license_status: response.status || (previousCache && previousCache.license_status) || 'active',
    valid: response.valid !== false,
    terminated: response.terminated === true,
    expires_at: response.expires_at || null,
    allowed_asset_tiers: Array.isArray(response.allowed_asset_tiers) ? response.allowed_asset_tiers : [],
    tier_metadata: response.tier_metadata || {},
    blocked_domains: Array.isArray(response.blocked_domains) ? response.blocked_domains : [],
    key_bundle_version: response.key_bundle_version || (response.key_bundle && response.key_bundle.version) || null,
    key_bundle: response.key_bundle || (previousCache && previousCache.key_bundle) || null,
    grace_until: buildGraceUntil(response.grace_until, updatedAt)
  };

  return cachePayload;
}

function validateSessionPayload(response) {
  if (!response || response.valid !== true) {
    throw new Error('License server did not return a valid activation payload');
  }

  if (!response.session_token) {
    throw new Error('License server response is missing session_token');
  }

  if (!response.key_bundle || response.key_bundle.version !== 2 || !response.key_bundle.keys) {
    throw new Error('License server response is missing key_bundle.keys');
  }
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

async function activate(options = {}) {
  const context = resolveActivationContext(options);

  if (!context.licenseKey || !context.userEmail || !context.machineId) {
    throw new Error('Activation requires a license key, email address, and machine ID');
  }

  const response = await activateLicenseRequest(context);
  validateSessionPayload(response);

  const cachePayload = buildCachePayload(response, context, context.cache);
  writeLicenseCache(cachePayload, { caller: 'activate', reason: 'activation-success' });
  removeFile(LEGACY_LICENSE_KEY_FILE);

  return cacheToSessionPayload(cachePayload, { source: 'live' });
}

function buildInvalidSessionResponse(options = {}) {
  return {
    valid: false,
    error: options.error || 'missing_activation',
    message: options.message || 'Activate your OpsPal license with /activate-license <email> <license-key>.',
    terminated: options.terminated === true,
    within_grace: false
  };
}

// shouldFullyInvalidate — tightened confirmation barrier for destructive wipes.
// Returns true ONLY when the server has confirmed termination with a well-formed
// response: statusCode 403 (not 401/404/429/5xx — those are transient),
// non-empty parsed body, terminated === true, AND an explicit error code string.
// A transient proxy 404, rate-limit 429, or malformed error must not be able
// to destroy cached state. Rollback path: if we fail to invalidate a genuinely
// terminated license here, the next successful poll or session-start will
// re-detect and handle it — whereas a false-positive wipe is unrecoverable.
function shouldFullyInvalidate(err, body) {
  if (!err || err.statusCode !== 403) return false;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  if (Object.keys(body).length === 0) return false;
  if (body.terminated !== true) return false;
  if (typeof body.error !== 'string' || body.error.length === 0) return false;
  return true;
}

function buildLiveFailureResponse(err, cache) {
  const responseBody = err && err.response ? err.response : {};
  const terminated = responseBody.terminated === true;
  const shouldInvalidateCache = shouldFullyInvalidate(err, responseBody);

  if (shouldInvalidateCache) {
    clearLocalLicenseState({
      clearKeyFiles: true,
      confirmedByServer: true,
      caller: 'buildLiveFailureResponse',
      reason: responseBody.error || 'terminated-confirmed-403'
    });
    markTerminatedState({
      caller: 'buildLiveFailureResponse',
      reason: responseBody.error || 'terminated-confirmed-403'
    });
    removeFile(CACHE_BACKUP_FILE);
    appendAuditLog({
      action: 'remove-backup',
      caller: 'buildLiveFailureResponse',
      reason: 'terminated-confirmed-403'
    });
  } else if (terminated) {
    // Server hinted termination but the response failed the full confirmation barrier.
    // Log so support can triage if the server is emitting malformed termination payloads.
    appendAuditLog({
      action: 'terminated-hint-ignored',
      caller: 'buildLiveFailureResponse',
      reason: 'confirmation-barrier-not-met',
      server_status: err && err.statusCode ? err.statusCode : null,
      has_error_field: typeof responseBody.error === 'string'
    });
  }

  return {
    valid: false,
    terminated,
    error: responseBody.error || err.code || 'session_refresh_failed',
    message: responseBody.message || err.message || 'Unable to refresh license session',
    allowed_asset_tiers: Array.isArray(responseBody.allowed_asset_tiers) ? responseBody.allowed_asset_tiers : [],
    blocked_domains: Array.isArray(responseBody.blocked_domains) ? responseBody.blocked_domains : [],
    within_grace: false,
    cache_present: Boolean(cache)
  };
}

async function sessionToken(options = {}) {
  if (!fs.existsSync(CACHE_FILE)) {
    restoreLicenseCacheFromBackup({ caller: options.caller || 'session-token' });
  }

  const context = resolveActivationContext(options);
  const cache = context.cache;

  if (!context.licenseKey || !context.userEmail || !context.machineId) {
    if (hasUsableCachedBundle(cache)) {
      return cacheToSessionPayload(cache, { source: 'cache', withinGrace: true });
    }

    return buildInvalidSessionResponse();
  }

  try {
    const response = await activateLicenseRequest(context);
    validateSessionPayload(response);

    const cachePayload = buildCachePayload(response, context, cache);
    writeLicenseCache(cachePayload, { caller: 'session-token', reason: 'session-refresh' });
    removeFile(LEGACY_LICENSE_KEY_FILE);

    return cacheToSessionPayload(cachePayload, { source: 'live' });
  } catch (err) {
    if (err && err.statusCode) {
      return buildLiveFailureResponse(err, cache);
    }

    if (hasUsableCachedBundle(cache)) {
      const payload = cacheToSessionPayload(cache, { source: 'cache', withinGrace: true });
      return {
        ...payload,
        message: payload.grace_warning
          ? `Using cached scoped key bundle. License offline — reconnect within ${payload.grace_warning.hours_remaining}h or premium features will deactivate.`
          : 'Using cached scoped key bundle during the offline grace window.'
      };
    }

    return buildInvalidSessionResponse({
      error: cache ? 'offline_grace_expired' : 'network_error',
      message: cache
        ? 'Offline grace window expired. Reconnect and reactivate your OpsPal license.'
        : 'Unable to reach the license server. Activate your OpsPal license with /activate-license <email> <license-key>.'
    });
  }
}

async function verifyToken(options = {}) {
  let context = resolveActivationContext(options);
  let bearerToken = normalizeText(options.sessionToken || context.sessionToken);

  if (!bearerToken) {
    const session = await sessionToken(options);
    if (!session.valid || !session.session_token) {
      return {
        valid: false,
        error: session.error || 'missing_session_token',
        message: session.message || 'No cached session token is available'
      };
    }

    bearerToken = session.session_token;
    context = resolveActivationContext(options);
  }

  try {
    const response = await requestJson({
      serverUrl: context.serverUrl,
      method: 'GET',
      path: '/api/v1/verify',
      headers: {
        Authorization: `Bearer ${bearerToken}`
      }
    });

    if (response.statusCode >= 400) {
      return {
        valid: false,
        ...response.body
      };
    }

    return response.body;
  } catch (err) {
    return {
      valid: false,
      error: 'verify_failed',
      message: err.message
    };
  }
}

async function pollStatus(options = {}) {
  const context = resolveActivationContext(options);

  if (!context.licenseKey || !context.machineId) {
    throw new Error('Polling requires a cached or provided license key and machine ID');
  }

  const response = await requestJson({
    serverUrl: context.serverUrl,
    method: 'POST',
    path: '/api/v1/poll',
    body: {
      license_key: context.licenseKey,
      machine_id: context.machineId
    }
  });

  if (response.statusCode >= 400) {
    const syntheticErr = {
      statusCode: response.statusCode,
      response: response.body
    };
    if (shouldFullyInvalidate(syntheticErr, response.body)) {
      clearLocalLicenseState({
        clearKeyFiles: true,
        confirmedByServer: true,
        caller: 'pollStatus',
        reason: (response.body && response.body.error) || 'terminated-confirmed-poll'
      });
      markTerminatedState({
        caller: 'pollStatus',
        reason: (response.body && response.body.error) || 'terminated-confirmed-poll'
      });
      removeFile(CACHE_BACKUP_FILE);
      appendAuditLog({
        action: 'remove-backup',
        caller: 'pollStatus',
        reason: 'terminated-confirmed-poll'
      });
    } else if (response.body && response.body.terminated === true) {
      appendAuditLog({
        action: 'terminated-hint-ignored',
        caller: 'pollStatus',
        reason: 'confirmation-barrier-not-met',
        server_status: response.statusCode,
        has_error_field: Boolean(response.body && typeof response.body.error === 'string')
      });
    }

    return response.body;
  }

  if (response.body && response.body.valid === true) {
    const cachePayload = buildCachePayload({
      ...response.body,
      session_token: context.sessionToken || (context.cache && context.cache.session_token) || '',
      key_bundle: context.cache && context.cache.key_bundle ? context.cache.key_bundle : null,
      key_bundle_version: context.cache && context.cache.key_bundle_version
        ? context.cache.key_bundle_version
        : (context.cache && context.cache.key_bundle && context.cache.key_bundle.version) || null,
      grace_until: context.cache && context.cache.grace_until
    }, context, context.cache);

    writeLicenseCache(cachePayload, { caller: 'pollStatus', reason: 'poll-success' });

    // Grace warning at ≤ 48h — surfaces to poll-daemon stderr via the returned body.
    const warning = graceWarningFor(cachePayload.grace_until);
    if (warning) {
      response.body.grace_warning = warning;
    }
  }

  return response.body;
}

async function deactivate(options = {}) {
  const context = resolveActivationContext(options);

  if (!context.licenseKey || !context.machineId) {
    throw new Error('No active OpsPal license is cached on this machine');
  }

  let bearerToken = normalizeText(options.sessionToken || context.sessionToken);
  if (!bearerToken) {
    const session = await sessionToken(options);
    if (!session.valid || !session.session_token) {
      throw new Error(session.message || 'Unable to refresh license session for deactivation');
    }
    bearerToken = session.session_token;
  }

  const response = await requestJson({
    serverUrl: context.serverUrl,
    method: 'POST',
    path: '/api/v1/deactivate',
    headers: {
      Authorization: `Bearer ${bearerToken}`
    },
    body: {
      license_key: context.licenseKey,
      machine_id: context.machineId
    }
  });

  if (response.statusCode >= 400) {
    const error = new Error(response.body.message || `Deactivation failed (${response.statusCode})`);
    error.code = response.body.error || 'deactivation_failed';
    error.statusCode = response.statusCode;
    error.response = response.body;
    throw error;
  }

  clearLocalLicenseState({
    clearKeyFiles: true,
    confirmedByServer: true,
    caller: 'deactivate-cli',
    reason: 'user-initiated-deactivate'
  });
  clearTerminatedStateMarker({ caller: 'deactivate-cli', reason: 'user-initiated-deactivate' });
  removeFile(CACHE_BACKUP_FILE);
  appendAuditLog({
    action: 'remove-backup',
    caller: 'deactivate-cli',
    reason: 'user-initiated-deactivate'
  });

  return {
    success: true,
    license_key: context.licenseKey,
    machine_id: context.machineId,
    server_url: context.serverUrl
  };
}

// confirmTerminated — canonical termination wipe path.
// Invoked by the SessionStart shell hook (session-start-asset-decryptor.sh) when
// the session-token output reports terminated:true, replacing the pre-patch raw
// `rm -f license-cache.json` which did NOT write the marker — that omission is
// the root cause of the restore-loop bug (backup restored on next session →
// restored cache still has terminated:true → shell hook wipes again).
//
// Atomically:
//   1. Write ~/.opspal/license-cache.terminated marker
//   2. Clear primary cache + legacy key file + domain key files (confirmedByServer)
//   3. Delete ~/.opspal/license-cache.json.bak so restoreLicenseCacheFromBackup
//      cannot reinstate a terminated license on the next session start
//
// Returns a status JSON suitable for printing from the CLI.
function confirmTerminated(options = {}) {
  const caller = options.caller || 'confirm-terminated-cli';
  const reason = options.reason || 'server-confirmed-termination';

  markTerminatedState({ caller, reason });
  clearLocalLicenseState({
    clearKeyFiles: true,
    confirmedByServer: true,
    caller,
    reason
  });
  const backupWasPresent = fs.existsSync(CACHE_BACKUP_FILE);
  removeFile(CACHE_BACKUP_FILE);
  if (backupWasPresent) {
    appendAuditLog({
      action: 'remove-backup',
      caller,
      reason
    });
  }

  return {
    success: true,
    terminated: true,
    cache_file_removed: !fs.existsSync(CACHE_FILE),
    backup_removed: !fs.existsSync(CACHE_BACKUP_FILE),
    marker_present: fs.existsSync(CACHE_TERMINATED_MARKER_FILE)
  };
}

function status(options = {}) {
  const cache = readLicenseCache();
  const serverUrl = getServerUrl(options.serverUrl);
  const valid = hasUsableCachedBundle(cache);
  const statusValue = !cache
    ? 'not_activated'
    : cache.terminated === true
      ? 'terminated'
      : cache.valid === false
        ? 'invalid'
        : valid
          ? 'valid'
          : 'offline_grace_expired';

  return {
    status: statusValue,
    valid,
    server_url: serverUrl,
    cache_file: CACHE_FILE,
    license_key: cache && cache.license_key ? cache.license_key : '',
    user_email: cache && cache.user_email ? cache.user_email : '',
    machine_id: cache && cache.machine_id ? cache.machine_id : '',
    tier: cache && cache.tier ? cache.tier : '',
    license_status: cache && cache.license_status ? cache.license_status : '',
    organization: cache && cache.organization ? cache.organization : '',
    expires_at: cache && cache.expires_at ? cache.expires_at : null,
    updated_at: cache && cache.updated_at ? cache.updated_at : null,
    grace_until: cache ? buildGraceUntil(cache.grace_until, cache.updated_at) : null,
    within_grace: cache ? isWithinGrace(cache) : false,
    allowed_asset_tiers: cache && Array.isArray(cache.allowed_asset_tiers) ? cache.allowed_asset_tiers : [],
    blocked_domains: cache && Array.isArray(cache.blocked_domains) ? cache.blocked_domains : [],
    key_bundle_version: cache && cache.key_bundle_version ? cache.key_bundle_version : null,
    has_scoped_key_bundle: hasScopedKeyBundle(cache)
  };
}

function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? [...argv] : [];
  let action = 'status';

  if (args[0] && !args[0].startsWith('-')) {
    action = args.shift();
  }

  const options = { action };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const next = args[index + 1];

    if (token === '--server' && next && !next.startsWith('-')) {
      options.serverUrl = next;
      index += 1;
      continue;
    }

    if (token === '--license-key' && next && !next.startsWith('-')) {
      options.licenseKey = next;
      index += 1;
      continue;
    }

    if (token === '--machine-id' && next && !next.startsWith('-')) {
      options.machineId = next;
      index += 1;
      continue;
    }

    if (token === '--email' && next && !next.startsWith('-')) {
      options.userEmail = next;
      index += 1;
      continue;
    }
  }

  return options;
}

async function runCli(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);

  switch (options.action) {
    case 'activate':
      process.stdout.write(`${JSON.stringify(await activate(options))}\n`);
      return;
    case 'session-token':
      process.stdout.write(`${JSON.stringify(await sessionToken(options))}\n`);
      return;
    case 'verify':
      process.stdout.write(`${JSON.stringify(await verifyToken(options))}\n`);
      return;
    case 'poll':
      process.stdout.write(`${JSON.stringify(await pollStatus(options))}\n`);
      return;
    case 'deactivate':
      process.stdout.write(`${JSON.stringify(await deactivate(options))}\n`);
      return;
    case 'confirm-terminated':
      process.stdout.write(`${JSON.stringify(confirmTerminated(options))}\n`);
      return;
    case 'status':
      process.stdout.write(`${JSON.stringify(status(options))}\n`);
      return;
    default:
      throw new Error(`Unsupported action: ${options.action}`);
  }
}

module.exports = {
  AUDIT_LOG_FILE,
  CACHE_BACKUP_FILE,
  CACHE_FILE,
  CACHE_TERMINATED_MARKER_FILE,
  CURRENT_SESSION_POINTER,
  DEFAULT_SERVER_URL,
  GRACE_WARNING_THRESHOLD_HOURS,
  LEGACY_LICENSE_KEY_FILE,
  OPSPAL_DIR,
  activate,
  activateLicenseRequest,
  appendAuditLog,
  backupLicenseCache,
  clearLocalLicenseState,
  clearTerminatedStateMarker,
  confirmTerminated,
  deactivate,
  getLicenseCacheFile,
  getServerUrl,
  graceWarningFor,
  hasScopedKeyBundle,
  isLikelyShellHookStuckState,
  markTerminatedState,
  normalizeServerUrl,
  pollStatus,
  readLicenseCache,
  readRecentAuditEntries,
  requestJson,
  resolveActivationContext,
  restoreLicenseCacheFromBackup,
  runCli,
  sessionToken,
  shouldFullyInvalidate,
  status,
  validateSessionPayload,
  verifyToken,
  writeLicenseCache
};

if (require.main === module) {
  runCli().catch((err) => {
    process.stdout.write(`${JSON.stringify({
      valid: false,
      error: err.code || 'license_client_error',
      message: err.message
    })}\n`);
    process.exit(1);
  });
}
