#!/usr/bin/env node
'use strict';

/**
 * License Canary
 *
 * Refreshes the current machine license session, validates that the server
 * returned a scoped v2 key bundle, confirms the verify endpoint echoes the
 * same domain-scoped access contract, and verifies that the delivered bundle
 * can decrypt the commercial plugin assets available in this workspace.
 *
 * Usage:
 *   node license-canary.js [--expect-tier starter|salesforce|hubspot|marketo|professional|enterprise|trial]
 *                          [--license-key <key>]
 *                          [--server <url>]
 */

const fs = require('fs');
const path = require('path');
const { sessionToken, verifyToken, status: clientStatus } = require('./license-auth-client');
const engine = require('./asset-encryption-engine');

let resolvePluginRoot = null;
try {
  ({ resolvePluginRoot } = require('./plugin-path-resolver'));
} catch {
  resolvePluginRoot = null;
}

const EXPECTED_ALLOWED_TIERS = {
  starter: ['core'],
  trial: ['core'],
  salesforce: ['core', 'salesforce'],
  hubspot: ['core', 'hubspot'],
  marketo: ['core', 'marketo'],
  professional: ['core', 'salesforce', 'hubspot'],
  enterprise: ['core', 'salesforce', 'hubspot', 'marketo', 'gtm']
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
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
  return [...new Set(values || [])].sort();
}

function sameTierList(left, right) {
  const a = normalizeTierList(left);
  const b = normalizeTierList(right);
  return JSON.stringify(a) === JSON.stringify(b);
}

function resolveCommercialPluginsDir() {
  const localCoreRoot = path.resolve(__dirname, '../..');
  if (fs.existsSync(path.join(localCoreRoot, '.claude-plugin'))) {
    return path.dirname(localCoreRoot);
  }

  const resolvedCoreRoot = resolvePluginRoot
    ? resolvePluginRoot('opspal-core', { useCache: false, basePath: __dirname })
    : null;
  const pluginsDir = resolvedCoreRoot ? path.dirname(resolvedCoreRoot) : null;
  return fs.existsSync(pluginsDir) ? pluginsDir : null;
}

function listEncryptionManifests(pluginsDir) {
  if (!pluginsDir || !fs.existsSync(pluginsDir)) {
    return [];
  }

  return fs.readdirSync(pluginsDir)
    .map((entry) => path.join(pluginsDir, entry))
    .filter((pluginDir) => fs.existsSync(path.join(pluginDir, '.claude-plugin', 'encryption.json')))
    .map((pluginDir) => ({
      pluginDir,
      manifestPath: path.join(pluginDir, '.claude-plugin', 'encryption.json')
    }));
}

function verifyCommercialAssetAccess(keyBundle) {
  if (!keyBundle || keyBundle.version !== 2 || !keyBundle.keys) {
    return {
      ok: false,
      failures: ['No scoped v2 key bundle available for asset verification'],
      summary: {
        pluginCount: 0,
        eligibleAssets: 0,
        verifiedAssets: 0,
        blockedAssets: 0,
        skipped: false
      }
    };
  }

  const pluginsDir = resolveCommercialPluginsDir();
  const manifests = listEncryptionManifests(pluginsDir);

  if (!pluginsDir || manifests.length === 0) {
    return {
      ok: true,
      failures: [],
      summary: {
        pluginCount: 0,
        eligibleAssets: 0,
        verifiedAssets: 0,
        blockedAssets: 0,
        skipped: true,
        pluginsDir: pluginsDir || ''
      }
    };
  }

  const keyMaterial = { keyring: keyBundle.keys };
  const allowedDomains = new Set(Object.keys(keyBundle.keys));
  const failures = [];
  let eligibleAssets = 0;
  let verifiedAssets = 0;
  let blockedAssets = 0;

  for (const { pluginDir, manifestPath } of manifests) {
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      failures.push(`Cannot read manifest ${manifestPath}: ${error.message}`);
      continue;
    }

    const pluginName = manifest.plugin || path.basename(pluginDir);

    for (const asset of manifest.encrypted_assets || []) {
      const requiredDomain = asset.required_domain || asset.required_tier || engine.DEFAULT_REQUIRED_DOMAIN;
      if (!allowedDomains.has(requiredDomain)) {
        blockedAssets++;
        continue;
      }

      eligibleAssets++;

      const encryptedPath = asset.encrypted_path || `${asset.path}.enc`;
      const encPath = path.join(pluginDir, encryptedPath);
      if (!fs.existsSync(encPath)) {
        failures.push(`Missing encrypted asset for ${pluginName}:${asset.path} (${encryptedPath})`);
        continue;
      }

      const result = engine.verifyFile(
        encPath,
        pluginName,
        asset.path,
        keyMaterial,
        asset.checksum_plaintext
      );

      if (!result.valid) {
        failures.push(
          `Cannot decrypt ${pluginName}:${asset.path} (${requiredDomain}) - ${result.error}`
        );
        continue;
      }

      verifiedAssets++;
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    summary: {
      pluginCount: manifests.length,
      eligibleAssets,
      verifiedAssets,
      blockedAssets,
      skipped: false,
      pluginsDir
    }
  };
}

function validateCanaryResults({ session, verify, status, assetValidation }, expectedTier) {
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
    failures.push(`Allowed domains mismatch: expected ${expectedAllowed.join(',')}, received ${normalizeTierList(session.allowed_asset_tiers).join(',') || 'none'}`);
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
    failures.push(`Cached allowed domains mismatch: expected ${expectedAllowed.join(',')}, received ${normalizeTierList(status.allowed_asset_tiers).join(',') || 'none'}`);
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
      failures.push('Verify endpoint allowed domains do not match the session token response');
    }
  }

  if (assetValidation && !assetValidation.ok) {
    failures.push(...assetValidation.failures);
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
      verifyExpiresAt: verify && verify.expires_at ? verify.expires_at : null,
      assetValidation: assetValidation ? assetValidation.summary : null
    }
  };
}

function printSuccess(summary) {
  console.log(`${GREEN}${BOLD}License canary passed${RESET}\n`);
  console.log(`  ${BOLD}Tier:${RESET}            ${summary.tier}`);
  console.log(`  ${BOLD}Organization:${RESET}    ${summary.organization}`);
  console.log(`  ${BOLD}Bundle:${RESET}          v${summary.keyBundleVersion} (${summary.bundleKeyTiers.join(', ')})`);
  console.log(`  ${BOLD}Allowed domains:${RESET} ${summary.allowedAssetTiers.join(', ')}`);
  if (summary.assetValidation && !summary.assetValidation.skipped) {
    console.log(`  ${BOLD}Asset check:${RESET}     ${summary.assetValidation.verifiedAssets}/${summary.assetValidation.eligibleAssets} decryptable, ${summary.assetValidation.blockedAssets} outside plan`);
  }
  if (summary.verifyExpiresAt) {
    console.log(`  ${BOLD}Token expires:${RESET}   ${summary.verifyExpiresAt}`);
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
  const assetValidation = session && session.valid && session.key_bundle
    ? verifyCommercialAssetAccess(session.key_bundle)
    : null;

  const validation = validateCanaryResults({
    session,
    status,
    verify,
    assetValidation
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
    console.log('Usage: node license-canary.js [--expect-tier starter|salesforce|hubspot|marketo|professional|enterprise|trial] [--license-key <key>] [--server <url>]');
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
  normalizeTierList,
  validateCanaryResults,
  verifyCommercialAssetAccess,
  runCanary
};

if (require.main === module) {
  main().catch((err) => {
    console.error(`${RED}Error: ${err.message}${RESET}`);
    process.exit(1);
  });
}
