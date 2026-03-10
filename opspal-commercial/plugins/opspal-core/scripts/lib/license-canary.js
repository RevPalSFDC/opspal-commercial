#!/usr/bin/env node
'use strict';

/**
 * License Canary
 *
 * Refreshes the current machine license session, validates that the server
 * returned a scoped v2 key bundle, and confirms the verify endpoint echoes the
 * same tier-scoped access contract.
 *
 * Usage:
 *   node license-canary.js [--expect-tier starter|professional|enterprise|trial]
 *                          [--license-key <key>]
 *                          [--server <url>]
 */

const { sessionToken, verifyToken, status: clientStatus } = require('./license-auth-client');

const EXPECTED_ALLOWED_TIERS = {
  starter: ['tier3'],
  trial: ['tier3'],
  professional: ['tier2', 'tier3'],
  enterprise: ['tier1', 'tier2', 'tier3']
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';

function parseArgs(argv) {
  const flags = {};
  const args = argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    if (!current.startsWith('--')) continue;

    const key = current.replace(/^--/, '');
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }

  return flags;
}

function expectedAllowedTiersForTier(tier) {
  return EXPECTED_ALLOWED_TIERS[tier] ? [...EXPECTED_ALLOWED_TIERS[tier]] : null;
}

function normalizeTierList(values) {
  return [...new Set((values || []).slice().sort())];
}

function sameTierList(left, right) {
  const a = normalizeTierList(left);
  const b = normalizeTierList(right);
  return JSON.stringify(a) === JSON.stringify(b);
}

function validateCanaryResults({ session, verify, status }, expectedTier) {
  const failures = [];

  if (!session || session.valid !== true) {
    failures.push(`Session token refresh failed: ${session && (session.message || session.error) ? session.message || session.error : 'unknown error'}`);
    return { ok: false, failures };
  }

  const effectiveTier = expectedTier || session.tier;
  const expectedAllowed = expectedAllowedTiersForTier(effectiveTier);

  if (!expectedAllowed) {
    failures.push(`Unsupported or unknown tier for validation: ${effectiveTier || 'missing'}`);
  }

  if (expectedTier && session.tier !== expectedTier) {
    failures.push(`Expected tier ${expectedTier}, received ${session.tier}`);
  }

  if (session.key_bundle_version !== 2) {
    failures.push(`Expected session key_bundle_version 2, received ${session.key_bundle_version}`);
  }

  if (!session.key_bundle || session.key_bundle.version !== 2 || !session.key_bundle.keys) {
    failures.push('Session response did not include a scoped v2 key bundle');
  }

  const bundleKeyTiers = session.key_bundle && session.key_bundle.keys
    ? Object.keys(session.key_bundle.keys)
    : [];

  if (expectedAllowed && !sameTierList(session.allowed_asset_tiers, expectedAllowed)) {
    failures.push(`Allowed tiers mismatch: expected ${expectedAllowed.join(',')}, received ${normalizeTierList(session.allowed_asset_tiers).join(',') || 'none'}`);
  }

  if (expectedAllowed && !sameTierList(bundleKeyTiers, expectedAllowed)) {
    failures.push(`Scoped key bundle mismatch: expected ${expectedAllowed.join(',')}, received ${normalizeTierList(bundleKeyTiers).join(',') || 'none'}`);
  }

  if (!status || status.status !== 'valid') {
    failures.push(`Cached status is not valid: ${status && status.status ? status.status : 'missing'}`);
  }

  if (!status || status.key_bundle_version !== 2) {
    failures.push(`Cached status key_bundle_version mismatch: expected 2, received ${status ? status.key_bundle_version : 'missing'}`);
  }

  if (!status || status.has_scoped_key_bundle !== true) {
    failures.push('Cached status does not report a scoped key bundle');
  }

  if (expectedAllowed && status && !sameTierList(status.allowed_asset_tiers, expectedAllowed)) {
    failures.push(`Cached allowed tiers mismatch: expected ${expectedAllowed.join(',')}, received ${normalizeTierList(status.allowed_asset_tiers).join(',') || 'none'}`);
  }

  if (!verify || verify.valid !== true) {
    failures.push(`Verify endpoint failed: ${verify && verify.error ? verify.error : 'unknown error'}`);
  } else {
    if (verify.key_bundle_version !== 2) {
      failures.push(`Verify endpoint key_bundle_version mismatch: expected 2, received ${verify.key_bundle_version}`);
    }
    if (verify.tier !== session.tier) {
      failures.push(`Verify endpoint tier mismatch: expected ${session.tier}, received ${verify.tier}`);
    }
    if (!sameTierList(verify.allowed_asset_tiers, session.allowed_asset_tiers)) {
      failures.push('Verify endpoint allowed tiers do not match the session token response');
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    summary: {
      tier: session.tier,
      organization: session.organization || 'N/A',
      allowedAssetTiers: normalizeTierList(session.allowed_asset_tiers),
      bundleKeyTiers: normalizeTierList(bundleKeyTiers),
      keyBundleVersion: session.key_bundle_version,
      verifyExpiresAt: verify && verify.expires_at ? verify.expires_at : null
    }
  };
}

function printSuccess(summary) {
  console.log(`${GREEN}${BOLD}License canary passed${RESET}\n`);
  console.log(`  ${BOLD}Tier:${RESET}         ${summary.tier}`);
  console.log(`  ${BOLD}Organization:${RESET} ${summary.organization}`);
  console.log(`  ${BOLD}Bundle:${RESET}       v${summary.keyBundleVersion} (${summary.bundleKeyTiers.join(', ')})`);
  console.log(`  ${BOLD}Allowed tiers:${RESET} ${summary.allowedAssetTiers.join(', ')}`);
  if (summary.verifyExpiresAt) {
    console.log(`  ${BOLD}Token expires:${RESET} ${summary.verifyExpiresAt}`);
  }
}

function printFailure(validation) {
  console.error(`${RED}${BOLD}License canary failed${RESET}\n`);
  for (const failure of validation.failures) {
    console.error(`  ${RED}- ${failure}${RESET}`);
  }
  console.error(`\n${DIM}Run /license-status for cached state and verify the expected license tier on the server.${RESET}`);
}

async function runCanary(options = {}) {
  if (options.licenseKey) {
    process.env.OPSPAL_LICENSE_KEY = options.licenseKey;
  }
  if (options.server) {
    process.env.OPSPAL_LICENSE_SERVER = options.server;
  }

  const session = await sessionToken();
  const status = clientStatus();
  const verify = session && session.valid ? await verifyToken() : null;

  const validation = validateCanaryResults({
    session,
    status,
    verify
  }, options.expectTier);

  if (validation.ok) {
    printSuccess(validation.summary);
  } else {
    printFailure(validation);
  }

  return validation.ok;
}

async function main() {
  const flags = parseArgs(process.argv);

  if (flags.help || flags.h) {
    console.log('Usage: node license-canary.js [--expect-tier starter|professional|enterprise|trial] [--license-key <key>] [--server <url>]');
    process.exit(0);
  }

  const success = await runCanary({
    expectTier: flags['expect-tier'],
    licenseKey: flags['license-key'],
    server: flags.server
  });

  process.exit(success ? 0 : 1);
}

module.exports = {
  parseArgs,
  expectedAllowedTiersForTier,
  validateCanaryResults,
  runCanary
};

if (require.main === module) {
  main().catch((err) => {
    console.error(`${RED}Error: ${err.message}${RESET}`);
    process.exit(1);
  });
}
