#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_SERVER_URL,
  activateLicenseRequest,
  normalizeServerUrl
} = require('./license-auth-client');
const { KEY_DIR, writeDomainKeyFiles } = require('./asset-encryption-engine');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseArgs(argv) {
  const tokens = Array.isArray(argv) ? [...argv] : [];
  let action = 'activate';

  if (tokens[0] && !tokens[0].startsWith('-')) {
    action = tokens.shift();
  }

  const options = {
    action,
    email: '',
    licenseKey: '',
    serverUrl: '',
    machineId: '',
    help: false
  };
  const positional = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--help' || token === '-h') {
      options.help = true;
      continue;
    }

    if (token === '--email') {
      options.email = tokens[index + 1] || '';
      index += 1;
      continue;
    }

    if (token === '--license-key') {
      options.licenseKey = tokens[index + 1] || '';
      index += 1;
      continue;
    }

    if (token === '--server') {
      options.serverUrl = tokens[index + 1] || '';
      index += 1;
      continue;
    }

    if (token === '--machine-id') {
      options.machineId = tokens[index + 1] || '';
      index += 1;
      continue;
    }

    positional.push(token);
  }

  if (!options.email && positional[0]) {
    options.email = positional[0];
  }

  if (!options.licenseKey && positional[1]) {
    options.licenseKey = positional[1];
  }

  if (!options.serverUrl && process.env.OPSPAL_LICENSE_SERVER) {
    options.serverUrl = process.env.OPSPAL_LICENSE_SERVER;
  }

  if (!options.machineId && process.env.OPSPAL_MACHINE_ID) {
    options.machineId = process.env.OPSPAL_MACHINE_ID;
  }

  return options;
}

function normalizeUserEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(value) {
  return EMAIL_REGEX.test(normalizeUserEmail(value));
}

function getDefaultServerUrl() {
  return normalizeServerUrl(process.env.OPSPAL_LICENSE_SERVER || DEFAULT_SERVER_URL);
}

function resolveMachineId(overrideValue) {
  if (typeof overrideValue === 'string' && overrideValue.trim()) {
    return overrideValue.trim();
  }

  let username = 'unknown-user';
  try {
    username = os.userInfo().username || username;
  } catch {
    // Fall back to a generic username when userInfo is unavailable.
  }

  const fingerprint = [
    os.hostname(),
    username,
    process.platform,
    process.arch
  ].join('|');

  return `opspal-${crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 24)}`;
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
}

function getCacheDir() {
  return path.join(process.env.HOME || os.homedir(), '.opspal');
}

function getLicenseCacheFile() {
  return path.join(getCacheDir(), 'license-cache.json');
}

function cacheLicenseSession(session, options) {
  const cacheDir = getCacheDir();
  const cacheFile = getLicenseCacheFile();
  ensureDirectory(cacheDir);

  const cachePayload = {
    updated_at: new Date().toISOString(),
    server_url: options.serverUrl,
    license_key: options.licenseKey,
    user_email: options.userEmail,
    machine_id: options.machineId,
    session_token: session.session_token,
    tier: session.tier,
    organization: session.organization || '',
    allowed_asset_tiers: session.allowed_asset_tiers || [],
    tier_metadata: session.tier_metadata || {},
    blocked_domains: session.blocked_domains || [],
    key_bundle_version: session.key_bundle_version,
    grace_until: session.grace_until
  };

  fs.writeFileSync(
    cacheFile,
    `${JSON.stringify(cachePayload, null, 2)}\n`,
    { mode: 0o600 }
  );
}

function validateActivationResponse(response) {
  if (!response || response.valid !== true) {
    throw new Error('License server did not return a valid activation payload');
  }

  if (!response.session_token) {
    throw new Error('License server response is missing session_token');
  }

  if (!response.key_bundle || !response.key_bundle.keys) {
    throw new Error('License server response is missing key_bundle.keys');
  }
}

async function activateLicense(options) {
  const userEmail = normalizeUserEmail(options.email);
  const licenseKey = typeof options.licenseKey === 'string' ? options.licenseKey.trim() : '';

  if (!userEmail) {
    throw new Error('Email address is required. Usage: activate --email <email> --license-key <license-key>');
  }

  if (!isValidEmail(userEmail)) {
    throw new Error(`Invalid email address: ${options.email}`);
  }

  if (!licenseKey) {
    throw new Error('License key is required. Usage: activate --email <email> --license-key <license-key>');
  }

  const machineId = resolveMachineId(options.machineId);
  const serverUrl = normalizeServerUrl(options.serverUrl || getDefaultServerUrl());
  const response = await activateLicenseRequest({
    serverUrl,
    licenseKey,
    machineId,
    userEmail
  });

  validateActivationResponse(response);
  writeDomainKeyFiles(response.key_bundle.keys);
  cacheLicenseSession(response, {
    serverUrl,
    licenseKey,
    userEmail,
    machineId
  });

  return {
    serverUrl,
    machineId,
    userEmail,
    licenseKey,
    session: response
  };
}

function printUsage() {
  console.log('Usage:');
  console.log('  node license-activation-manager.js activate --email <email> --license-key <license-key> [--server <url>] [--machine-id <id>]');
  console.log('');
  console.log('Positional form:');
  console.log('  node license-activation-manager.js activate <email> <license-key>');
}

async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    printUsage();
    return;
  }

  if (options.action !== 'activate') {
    throw new Error(`Unsupported action: ${options.action}`);
  }

  const result = await activateLicense(options);

  console.log(`Activated ${result.licenseKey} for ${result.userEmail}`);
  console.log(`Server: ${result.serverUrl}`);
  console.log(`Machine ID: ${result.machineId}`);
  console.log(`Tier: ${result.session.tier}`);
  console.log(`Allowed domains: ${(result.session.allowed_asset_tiers || []).join(', ')}`);
  console.log(`Key dir: ${KEY_DIR}`);
  console.log(`Cache file: ${getLicenseCacheFile()}`);
}

if (require.main === module) {
  runCli().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  EMAIL_REGEX,
  activateLicense,
  cacheLicenseSession,
  getCacheDir,
  getDefaultServerUrl,
  getLicenseCacheFile,
  isValidEmail,
  normalizeUserEmail,
  parseArgs,
  printUsage,
  resolveMachineId,
  runCli,
  validateActivationResponse
};
