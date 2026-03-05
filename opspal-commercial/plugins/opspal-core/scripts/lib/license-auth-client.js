#!/usr/bin/env node
'use strict';

/**
 * License Auth Client — calls the OpsPal License Server to validate
 * a license and retrieve the tier-gated encryption key bundle.
 *
 * Usage:
 *   node license-auth-client.js session-token   # Get session token + key bundle
 *   node license-auth-client.js verify           # Verify cached session token
 *   node license-auth-client.js status           # Show cached license status
 *
 * Outputs JSON to stdout. Exits 0 on success, 1 on failure.
 *
 * Key sources (checked in order):
 *   1. OPSPAL_LICENSE_KEY env var
 *   2. ~/.opspal/license.key file
 *
 * Machine ID source:
 *   ~/.opspal/machine.id (created by LicenseValidator if absent)
 *
 * Cache:
 *   ~/.opspal/license-cache.json (24h validity, 7-day grace)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

const OPSPAL_DIR = path.join(process.env.HOME, '.opspal');
const LICENSE_KEY_FILE = path.join(OPSPAL_DIR, 'license.key');
const MACHINE_ID_FILE = path.join(OPSPAL_DIR, 'machine.id');
const CACHE_FILE = path.join(OPSPAL_DIR, 'license-cache.json');

const CACHE_VALIDITY_HOURS = 24;
const GRACE_DAYS = 7;

const DEFAULT_SERVER = 'https://license.gorevpal.com';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureDir() {
  if (!fs.existsSync(OPSPAL_DIR)) {
    fs.mkdirSync(OPSPAL_DIR, { recursive: true, mode: 0o700 });
  }
}

function getLicenseKey() {
  if (process.env.OPSPAL_LICENSE_KEY) {
    return process.env.OPSPAL_LICENSE_KEY.trim();
  }
  try {
    if (fs.existsSync(LICENSE_KEY_FILE)) {
      return fs.readFileSync(LICENSE_KEY_FILE, 'utf8').trim();
    }
  } catch { /* fall through */ }
  return null;
}

function getMachineId() {
  try {
    if (fs.existsSync(MACHINE_ID_FILE)) {
      return fs.readFileSync(MACHINE_ID_FILE, 'utf8').trim();
    }
  } catch { /* fall through */ }

  // Generate one
  ensureDir();
  const os = require('os');
  const info = `${os.hostname()}-${os.platform()}-${os.arch()}-${Date.now()}`;
  const id = crypto.createHash('sha256').update(info).digest('hex').substring(0, 32);
  fs.writeFileSync(MACHINE_ID_FILE, id, { mode: 0o600 });
  return id;
}

function getServerUrl() {
  return (process.env.OPSPAL_LICENSE_SERVER || DEFAULT_SERVER).replace(/\/$/, '');
}

function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    return data;
  } catch {
    return null;
  }
}

function saveCache(data) {
  ensureDir();
  const cacheData = { ...data, cached_at: Date.now() };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2), { mode: 0o600 });
}

function wipeCache() {
  try { fs.unlinkSync(CACHE_FILE); } catch { /* ok */ }
}

function wipeAll() {
  wipeCache();
  try { fs.unlinkSync(LICENSE_KEY_FILE); } catch { /* ok */ }
}

function isCacheFresh(cache) {
  if (!cache || !cache.cached_at) return false;
  const ageHours = (Date.now() - cache.cached_at) / (1000 * 60 * 60);
  return ageHours < CACHE_VALIDITY_HOURS;
}

function isCacheInGrace(cache) {
  if (!cache || !cache.cached_at) return false;
  if (cache.terminated) return false; // terminated = no grace
  const ageDays = (Date.now() - cache.cached_at) / (1000 * 60 * 60 * 24);
  return ageDays < GRACE_DAYS;
}

// ─── HTTP Client ─────────────────────────────────────────────────────────────

function postJson(urlStr, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const transport = url.protocol === 'https:' ? https : http;
    const postData = JSON.stringify(body);

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          reject(new Error('Invalid server response'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

function getJson(urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const transport = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'GET',
      headers
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          reject(new Error('Invalid server response'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function sessionToken() {
  const licenseKey = getLicenseKey();
  if (!licenseKey) {
    return { valid: false, error: 'no_license_key', message: 'No license key found' };
  }

  // Check fresh cache first
  const cache = loadCache();
  if (cache && cache.valid && isCacheFresh(cache)) {
    return cache;
  }

  const machineId = getMachineId();
  const serverUrl = getServerUrl();

  try {
    const { body } = await postJson(`${serverUrl}/api/v1/session-token`, {
      license_key: licenseKey,
      machine_id: machineId
    });

    // Handle termination signal
    if (body.terminated) {
      wipeAll();
      return { valid: false, terminated: true, error: body.error, message: body.message };
    }

    if (body.valid) {
      saveCache(body);
      return body;
    }

    return { valid: false, error: body.error, message: body.message };
  } catch (err) {
    // Server unreachable — use grace period
    if (cache && isCacheInGrace(cache)) {
      return { ...cache, offline: true, offline_reason: err.message };
    }

    return {
      valid: false,
      error: 'server_unreachable',
      message: `License server unreachable: ${err.message}`
    };
  }
}

async function verifyToken() {
  const cache = loadCache();
  if (!cache || !cache.session_token) {
    return { valid: false, error: 'no_session_token' };
  }

  const serverUrl = getServerUrl();

  try {
    const { body } = await getJson(`${serverUrl}/api/v1/verify`, {
      Authorization: `Bearer ${cache.session_token}`
    });
    return body;
  } catch (err) {
    // Can't verify — check grace
    if (isCacheInGrace(cache)) {
      return { valid: true, offline: true, tier: cache.tier };
    }
    return { valid: false, error: 'verification_failed', message: err.message };
  }
}

function status() {
  const cache = loadCache();
  if (!cache) {
    return { status: 'no_cache', license_key_present: !!getLicenseKey() };
  }

  return {
    status: cache.valid ? 'valid' : 'invalid',
    tier: cache.tier,
    organization: cache.organization,
    cached_at: cache.cached_at ? new Date(cache.cached_at).toISOString() : null,
    cache_fresh: isCacheFresh(cache),
    in_grace_period: isCacheInGrace(cache),
    allowed_asset_tiers: cache.allowed_asset_tiers,
    has_key_bundle: !!(cache.key_bundle && cache.key_bundle.master_key)
  };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const command = process.argv[2];

  let result;
  switch (command) {
    case 'session-token':
      result = await sessionToken();
      break;
    case 'verify':
      result = await verifyToken();
      break;
    case 'status':
      result = status();
      break;
    default:
      console.error('Usage: license-auth-client.js <session-token|verify|status>');
      process.exit(1);
  }

  console.log(JSON.stringify(result));
  process.exit(result.valid !== false ? 0 : 1);
}

module.exports = { sessionToken, verifyToken, status };

if (require.main === module) {
  main().catch(err => {
    console.log(JSON.stringify({ valid: false, error: err.message }));
    process.exit(1);
  });
}
