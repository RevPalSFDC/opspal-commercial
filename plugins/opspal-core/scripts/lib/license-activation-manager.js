#!/usr/bin/env node
'use strict';

/**
 * License Activation Manager — handles the customer-facing license lifecycle:
 *   activate, status, deactivate, and first-run guidance.
 *
 * Usage:
 *   node license-activation-manager.js activate <license-key>
 *   node license-activation-manager.js status
 *   node license-activation-manager.js deactivate
 *   node license-activation-manager.js check-guidance
 *
 * Exits 0 on success, 1 on failure.
 */

const fs = require('fs');
const path = require('path');
const { sessionToken, verifyToken, status: clientStatus } = require('./license-auth-client');

const OPSPAL_DIR = path.join(process.env.HOME, '.opspal');
const LICENSE_KEY_FILE = path.join(OPSPAL_DIR, 'license.key');
const CACHE_FILE = path.join(OPSPAL_DIR, 'license-cache.json');
const MACHINE_ID_FILE = path.join(OPSPAL_DIR, 'machine.id');

// ─── Tier display info ──────────────────────────────────────────────────────

const TIER_INFO = {
  starter: {
    label: 'Starter',
    assets: 'tier3 (methodology)',
    color: '\x1b[33m', // yellow
    description: 'Quality gate rules, funnel definitions, persona configs, assessment prefills, benchmark retriever, persona KPI contracts, SEO content gap analyzer'
  },
  professional: {
    label: 'Professional',
    assets: 'tier2 + tier3 (algorithms + methodology)',
    color: '\x1b[36m', // cyan
    description: 'All Starter assets plus scoring engines, risk analyzers, health scorers, CPQ generators, data quality frameworks, SEO scorers, Marketo lead quality, and more'
  },
  enterprise: {
    label: 'Enterprise',
    assets: 'tier1 + tier2 + tier3 (all assets)',
    color: '\x1b[35m', // magenta
    description: 'Full access: scoring weights, benchmarks, intake rubrics, permission matrices, CPQ field mappings, dedup clustering, canonical selectors, GTM baselines, and all Professional assets'
  },
  trial: {
    label: 'Trial',
    assets: 'tier3 (methodology)',
    color: '\x1b[33m',
    description: 'Same access as Starter for the trial period'
  }
};

const ASSET_COUNTS = { tier1: 13, tier2: 17, tier3: 7 };

function tierAssetCount(tier) {
  switch (tier) {
    case 'starter': case 'trial': return ASSET_COUNTS.tier3;
    case 'professional': return ASSET_COUNTS.tier2 + ASSET_COUNTS.tier3;
    case 'enterprise': return ASSET_COUNTS.tier1 + ASSET_COUNTS.tier2 + ASSET_COUNTS.tier3;
    default: return 0;
  }
}

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';

// ─── Commands ───────────────────────────────────────────────────────────────

async function activate(licenseKey) {
  if (!licenseKey) {
    console.error(`${RED}Error: License key is required${RESET}`);
    console.error(`\nUsage: /activate-license OPSPAL-PRO-...`);
    return false;
  }

  // Validate format
  if (!licenseKey.startsWith('OPSPAL-')) {
    console.error(`${RED}Error: Invalid license key format${RESET}`);
    console.error(`Expected format: OPSPAL-{TIER}-{HASH}-{TIMESTAMP}-{CHECKSUM}`);
    return false;
  }

  // Ensure directory
  if (!fs.existsSync(OPSPAL_DIR)) {
    fs.mkdirSync(OPSPAL_DIR, { recursive: true, mode: 0o700 });
  }

  // Write license key
  fs.writeFileSync(LICENSE_KEY_FILE, licenseKey, { mode: 0o600 });

  console.log(`${DIM}Validating license with server...${RESET}\n`);

  // Set env for the auth client to pick up
  process.env.OPSPAL_LICENSE_KEY = licenseKey;

  // Validate via server
  const result = await sessionToken();

  if (result.terminated) {
    // Clean up — key is terminated
    try { fs.unlinkSync(LICENSE_KEY_FILE); } catch {}
    try { fs.unlinkSync(CACHE_FILE); } catch {}
    console.error(`${RED}${BOLD}License Terminated${RESET}`);
    console.error(`${RED}${result.message || 'This license has been revoked or suspended.'}${RESET}`);
    return false;
  }

  if (!result.valid) {
    // Don't keep an invalid key on disk
    try { fs.unlinkSync(LICENSE_KEY_FILE); } catch {}
    console.error(`${RED}${BOLD}License Invalid${RESET}`);
    console.error(`${RED}${result.message || result.error}${RESET}`);

    if (result.error === 'server_unreachable') {
      console.error(`\n${YELLOW}The license server could not be reached.${RESET}`);
      console.error(`Check your network connection and try again.`);
    }
    return false;
  }

  // Success
  const tier = result.tier || 'unknown';
  const info = TIER_INFO[tier] || { label: tier, color: '', assets: 'unknown' };
  const count = tierAssetCount(tier);
  const total = ASSET_COUNTS.tier1 + ASSET_COUNTS.tier2 + ASSET_COUNTS.tier3;

  console.log(`${GREEN}${BOLD}License Activated Successfully${RESET}\n`);
  console.log(`  ${BOLD}Tier:${RESET}         ${info.color}${info.label}${RESET}`);
  console.log(`  ${BOLD}Organization:${RESET} ${result.organization || 'N/A'}`);
  console.log(`  ${BOLD}Assets:${RESET}       ${count}/${total} encrypted assets unlocked (${info.assets})`);

  if (result.grace_until) {
    const grace = new Date(result.grace_until);
    console.log(`  ${BOLD}Offline until:${RESET} ${grace.toLocaleDateString()} (7-day grace period)`);
  }

  if (result.offline) {
    console.log(`\n  ${YELLOW}Note: Using cached license (server unreachable)${RESET}`);
  }

  console.log(`\n${DIM}License key saved to ${LICENSE_KEY_FILE}${RESET}`);
  console.log(`${DIM}Session cached to ${CACHE_FILE}${RESET}`);
  console.log(`\n${BOLD}Next steps:${RESET}`);
  console.log(`  - Start a new Claude Code session to decrypt assets`);
  console.log(`  - Run ${BOLD}/license-status${RESET} to check license anytime`);
  console.log(`  - Run ${BOLD}/deactivate-license${RESET} to remove from this machine`);

  return true;
}

async function showStatus() {
  const hasKey = !!getStoredKey();
  const cache = loadCache();

  console.log(`${BOLD}OpsPal License Status${RESET}\n`);

  // License key
  if (hasKey) {
    const key = getStoredKey();
    const masked = key.substring(0, 11) + '...' + key.substring(key.length - 8);
    console.log(`  ${BOLD}License Key:${RESET}  ${GREEN}Present${RESET} (${masked})`);
  } else {
    console.log(`  ${BOLD}License Key:${RESET}  ${RED}Not found${RESET}`);
    console.log(`\n  Run ${BOLD}/activate-license <key>${RESET} to activate.`);
    return false;
  }

  // Machine ID
  if (fs.existsSync(MACHINE_ID_FILE)) {
    const mid = fs.readFileSync(MACHINE_ID_FILE, 'utf8').trim();
    console.log(`  ${BOLD}Machine ID:${RESET}   ${mid.substring(0, 8)}...`);
  }

  // Cache status
  if (!cache) {
    console.log(`  ${BOLD}Cache:${RESET}        ${YELLOW}No cached session${RESET}`);
    console.log(`\n  License will be validated on next session start.`);
    return true;
  }

  const tier = cache.tier || 'unknown';
  const info = TIER_INFO[tier] || { label: tier, color: '', assets: 'unknown' };
  const count = tierAssetCount(tier);
  const total = ASSET_COUNTS.tier1 + ASSET_COUNTS.tier2 + ASSET_COUNTS.tier3;

  console.log(`  ${BOLD}Tier:${RESET}         ${info.color}${info.label}${RESET}`);
  console.log(`  ${BOLD}Organization:${RESET} ${cache.organization || 'N/A'}`);
  console.log(`  ${BOLD}Assets:${RESET}       ${count}/${total} encrypted assets unlocked`);

  // Cache freshness
  if (cache.cached_at) {
    const cachedDate = new Date(cache.cached_at);
    const ageHours = (Date.now() - cache.cached_at) / (1000 * 60 * 60);
    const fresh = ageHours < 24;
    console.log(`  ${BOLD}Cached at:${RESET}    ${cachedDate.toLocaleString()} (${fresh ? GREEN + 'fresh' : YELLOW + 'stale'}${RESET})`);
  }

  // Grace period
  if (cache.grace_until) {
    const grace = new Date(cache.grace_until);
    const inGrace = grace > new Date();
    console.log(`  ${BOLD}Grace until:${RESET}  ${grace.toLocaleDateString()} (${inGrace ? GREEN + 'active' : RED + 'expired'}${RESET})`);
  }

  // Valid/invalid
  if (cache.valid === false) {
    console.log(`\n  ${RED}${BOLD}License is invalid or expired.${RESET}`);
    if (cache.terminated) {
      console.log(`  ${RED}This license has been terminated. Contact support.${RESET}`);
    }
    return false;
  }

  console.log(`\n  ${GREEN}License is active.${RESET}`);

  // Show what's unlocked vs locked
  const allowed = cache.allowed_asset_tiers || [];
  console.log(`\n  ${BOLD}Access Breakdown:${RESET}`);
  console.log(`    Tier 1 (Critical IP):    ${allowed.includes('tier1') ? GREEN + 'Unlocked' : DIM + 'Locked'}${RESET} (${ASSET_COUNTS.tier1} assets)`);
  console.log(`    Tier 2 (Algorithms):     ${allowed.includes('tier2') ? GREEN + 'Unlocked' : DIM + 'Locked'}${RESET} (${ASSET_COUNTS.tier2} assets)`);
  console.log(`    Tier 3 (Methodology):    ${allowed.includes('tier3') ? GREEN + 'Unlocked' : DIM + 'Locked'}${RESET} (${ASSET_COUNTS.tier3} assets)`);

  return true;
}

async function deactivate() {
  const hasKey = !!getStoredKey();

  if (!hasKey) {
    console.log(`${YELLOW}No license key found on this machine.${RESET}`);
    return true;
  }

  const key = getStoredKey();
  const masked = key.substring(0, 11) + '...' + key.substring(key.length - 8);

  console.log(`${BOLD}Deactivating license ${masked}${RESET}\n`);

  // Try to notify the server
  if (fs.existsSync(MACHINE_ID_FILE)) {
    const machineId = fs.readFileSync(MACHINE_ID_FILE, 'utf8').trim();
    const serverUrl = (process.env.OPSPAL_LICENSE_SERVER || 'https://license.gorevpal.com').replace(/\/$/, '');

    try {
      const https = require('https');
      const http = require('http');
      const url = new URL(`${serverUrl}/api/v1/deactivate`);
      const transport = url.protocol === 'https:' ? https : http;
      const postData = JSON.stringify({ license_key: key, machine_id: machineId });

      await new Promise((resolve, reject) => {
        const req = transport.request({
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
        }, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
        req.write(postData);
        req.end();
      });

      console.log(`  ${GREEN}Server notified — machine deactivated.${RESET}`);
    } catch {
      console.log(`  ${YELLOW}Could not reach server (machine will auto-deactivate).${RESET}`);
    }
  }

  // Remove local files
  try { fs.unlinkSync(LICENSE_KEY_FILE); } catch {}
  try { fs.unlinkSync(CACHE_FILE); } catch {}

  console.log(`  ${GREEN}License key removed from ${LICENSE_KEY_FILE}${RESET}`);
  console.log(`  ${GREEN}Session cache cleared${RESET}`);
  console.log(`\n${BOLD}License deactivated.${RESET} Encrypted assets will no longer decrypt on this machine.`);

  return true;
}

function checkGuidance() {
  // Called by SessionStart hook to determine if first-run guidance should be shown
  const hasLicenseKey = !!getStoredKey();
  const hasLocalMasterKey = fs.existsSync(path.join(process.env.HOME, '.claude', 'opspal-enc', 'master.key'));
  const hasCache = fs.existsSync(CACHE_FILE);

  if (hasLicenseKey || hasLocalMasterKey) {
    // User has a way to decrypt — no guidance needed
    console.log(JSON.stringify({ show_guidance: false }));
    return;
  }

  // No license key and no local master key — show guidance
  console.log(JSON.stringify({
    show_guidance: true,
    message: [
      '',
      '\x1b[33m\x1b[1m╔══════════════════════════════════════════════════════════════╗\x1b[0m',
      '\x1b[33m\x1b[1m║            OpsPal - Encrypted Assets Detected               ║\x1b[0m',
      '\x1b[33m\x1b[1m╚══════════════════════════════════════════════════════════════╝\x1b[0m',
      '',
      '  Some plugin assets are encrypted and require a license to unlock.',
      '  Plugins will work but premium features will be unavailable.',
      '',
      '  \x1b[1mTo activate your license:\x1b[0m',
      '    /activate-license OPSPAL-PRO-XXXX-XXXXXXXXXX-XXXXXXXX',
      '',
      '  \x1b[1mTo check current status:\x1b[0m',
      '    /license-status',
      '',
      '  \x1b[2mPurchase a license at https://gorevpal.com/pricing\x1b[0m',
      ''
    ].join('\n')
  }));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getStoredKey() {
  if (process.env.OPSPAL_LICENSE_KEY) {
    return process.env.OPSPAL_LICENSE_KEY.trim();
  }
  try {
    if (fs.existsSync(LICENSE_KEY_FILE)) {
      return fs.readFileSync(LICENSE_KEY_FILE, 'utf8').trim();
    }
  } catch {}
  return null;
}

function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  let success;
  switch (command) {
    case 'activate':
      success = await activate(arg);
      break;
    case 'status':
      success = await showStatus();
      break;
    case 'deactivate':
      success = await deactivate();
      break;
    case 'check-guidance':
      checkGuidance();
      return;
    default:
      console.error('Usage: license-activation-manager.js <activate|status|deactivate|check-guidance> [key]');
      process.exit(1);
  }

  process.exit(success ? 0 : 1);
}

module.exports = { activate, showStatus, deactivate, checkGuidance };

if (require.main === module) {
  main().catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}
