#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const os = require('os');

const client = require('./license-auth-client');

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
    json: false,
    help: false
  };
  const positional = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--help' || token === '-h') {
      options.help = true;
      continue;
    }

    if (token === '--json') {
      options.json = true;
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

  return options;
}

function normalizeUserEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeLicenseKey(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidEmail(value) {
  return EMAIL_REGEX.test(normalizeUserEmail(value));
}

function maskLicenseKey(value) {
  const normalized = normalizeLicenseKey(value);
  if (!normalized) {
    return '';
  }

  if (normalized.length <= 12) {
    return normalized;
  }

  return `${normalized.slice(0, 10)}...${normalized.slice(-6)}`;
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

function getCacheDir() {
  return client.getLicenseCacheFile().replace(/\/license-cache\.json$/, '');
}

function getLicenseCacheFile() {
  return client.getLicenseCacheFile();
}

function validateActivationResponse(response) {
  client.validateSessionPayload(response);
}

async function activateLicense(options) {
  const userEmail = normalizeUserEmail(options.email);
  const licenseKey = normalizeLicenseKey(options.licenseKey);

  if (!userEmail) {
    throw new Error('Email address is required. Usage: activate --email <email> --license-key <license-key>');
  }

  if (!isValidEmail(userEmail)) {
    throw new Error(`Invalid email address: ${options.email}`);
  }

  if (!licenseKey) {
    throw new Error('License key is required. Usage: activate --email <email> --license-key <license-key>');
  }

  const currentStatus = getStatus(options) || {};
  const currentLicenseKey = normalizeLicenseKey(currentStatus.license_key);
  const hasConflictingActiveLicense = currentLicenseKey
    && currentLicenseKey !== licenseKey
    && ['valid', 'offline_grace_expired'].includes(currentStatus.status);

  if (hasConflictingActiveLicense) {
    throw new Error(
      `This machine is already activated with ${maskLicenseKey(currentLicenseKey)} (${currentStatus.status}). ` +
      'Run /deactivate-license before activating a different license key.'
    );
  }

  const machineId = resolveMachineId(options.machineId);
  const response = await client.activate({
    userEmail,
    licenseKey,
    machineId,
    serverUrl: options.serverUrl
  });

  validateActivationResponse(response);

  return {
    serverUrl: client.getServerUrl(options.serverUrl),
    machineId,
    userEmail,
    licenseKey,
    session: response
  };
}

function getStatus(options = {}) {
  return client.status({ serverUrl: options.serverUrl, machineId: options.machineId });
}

async function deactivateLicense(options = {}) {
  return client.deactivate({ serverUrl: options.serverUrl, machineId: options.machineId });
}

function checkGuidance() {
  const currentStatus = getStatus();
  const showGuidance = currentStatus.status !== 'valid';

  return {
    show_guidance: showGuidance,
    status: currentStatus.status,
    message: showGuidance
      ? 'OpsPal premium assets remain locked until you activate with /activate-license <email> <license-key>.'
      : ''
  };
}

function printUsage() {
  console.log('Usage:');
  console.log('  node license-activation-manager.js activate --email <email> --license-key <license-key> [--server <url>] [--machine-id <id>]');
  console.log('  node license-activation-manager.js status [--json] [--server <url>]');
  console.log('  node license-activation-manager.js deactivate [--server <url>] [--machine-id <id>]');
  console.log('  node license-activation-manager.js check-guidance');
  console.log('');
  console.log('Positional form:');
  console.log('  node license-activation-manager.js activate <email> <license-key>');
}

function printStatus(result) {
  console.log(`Status: ${result.status}`);
  console.log(`Server: ${result.server_url}`);

  if (result.user_email) {
    console.log(`Email: ${result.user_email}`);
  }

  if (result.machine_id) {
    console.log(`Machine ID: ${result.machine_id}`);
  }

  if (result.tier) {
    console.log(`Tier: ${result.tier}`);
  }

  if (Array.isArray(result.allowed_asset_tiers) && result.allowed_asset_tiers.length > 0) {
    console.log(`Allowed domains: ${result.allowed_asset_tiers.join(', ')}`);
  }

  if (result.grace_until) {
    console.log(`Grace until: ${result.grace_until}`);
  }

  console.log(`Cache file: ${getLicenseCacheFile()}`);
}

async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    printUsage();
    return;
  }

  switch (options.action) {
    case 'activate': {
      const result = await activateLicense(options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`Activated ${result.licenseKey} for ${result.userEmail}`);
      console.log(`Server: ${result.serverUrl}`);
      console.log(`Machine ID: ${result.machineId}`);
      console.log(`Tier: ${result.session.tier}`);
      console.log(`Allowed domains: ${(result.session.allowed_asset_tiers || []).join(', ')}`);
      console.log(`Cache file: ${getLicenseCacheFile()}`);
      return;
    }

    case 'status': {
      const result = getStatus(options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      printStatus(result);
      return;
    }

    case 'deactivate': {
      const result = await deactivateLicense(options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`Deactivated ${result.license_key} on ${result.machine_id}`);
      console.log(`Server: ${result.server_url}`);
      return;
    }

    case 'check-guidance': {
      console.log(JSON.stringify(checkGuidance()));
      return;
    }

    default:
      throw new Error(`Unsupported action: ${options.action}`);
  }
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
  checkGuidance,
  deactivateLicense,
  getCacheDir,
  getLicenseCacheFile,
  getStatus,
  isValidEmail,
  normalizeUserEmail,
  normalizeLicenseKey,
  maskLicenseKey,
  parseArgs,
  printUsage,
  resolveMachineId,
  runCli,
  validateActivationResponse
};
