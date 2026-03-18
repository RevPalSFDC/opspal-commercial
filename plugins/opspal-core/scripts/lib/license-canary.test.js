#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  parseArgs,
  expectedAllowedTiersForTier,
  validateCanaryResults
} = require('./license-canary');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

test('parseArgs reads expect-tier and server flags', () => {
  const flags = parseArgs(['node', 'license-canary.js', '--expect-tier', 'professional', '--server', 'https://license.example.com']);
  assert.strictEqual(flags['expect-tier'], 'professional');
  assert.strictEqual(flags.server, 'https://license.example.com');
});

test('expectedAllowedTiersForTier maps enterprise correctly', () => {
  assert.deepStrictEqual(
    expectedAllowedTiersForTier('enterprise'),
    ['core', 'salesforce', 'hubspot', 'marketo', 'gtm', 'data-hygiene']
  );
});

test('validateCanaryResults accepts a correct professional bundle', () => {
  const result = validateCanaryResults({
    session: {
      valid: true,
      tier: 'professional',
      organization: 'Acme',
      allowed_asset_tiers: ['core', 'salesforce', 'hubspot'],
      key_bundle_version: 2,
      key_bundle: {
        version: 2,
        keys: {
          core: 'a',
          salesforce: 'b',
          hubspot: 'c'
        }
      }
    },
    status: {
      status: 'valid',
      allowed_asset_tiers: ['core', 'salesforce', 'hubspot'],
      key_bundle_version: 2,
      has_scoped_key_bundle: true
    },
    verify: {
      valid: true,
      tier: 'professional',
      allowed_asset_tiers: ['core', 'salesforce', 'hubspot'],
      key_bundle_version: 2,
      expires_at: '2026-03-07T00:00:00.000Z'
    },
    assetValidation: {
      ok: true,
      failures: [],
      summary: {
        pluginCount: 4,
        eligibleAssets: 53,
        verifiedAssets: 53,
        blockedAssets: 5,
        skipped: false
      }
    }
  }, 'professional');

  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.failures, []);
  assert.strictEqual(result.summary.assetValidation.verifiedAssets, 53);
});

test('validateCanaryResults rejects bundle domain mismatches', () => {
  const result = validateCanaryResults({
    session: {
      valid: true,
      tier: 'starter',
      allowed_asset_tiers: ['core'],
      key_bundle_version: 2,
      key_bundle: {
        version: 2,
        keys: {
          core: 'a',
          salesforce: 'b'
        }
      }
    },
    status: {
      status: 'valid',
      allowed_asset_tiers: ['core'],
      key_bundle_version: 2,
      has_scoped_key_bundle: true
    },
    verify: {
      valid: true,
      tier: 'starter',
      allowed_asset_tiers: ['core'],
      key_bundle_version: 2
    }
  }, 'starter');

  assert.strictEqual(result.ok, false);
  assert(result.failures.some((failure) => failure.includes('Scoped key bundle mismatch')));
});

test('validateCanaryResults surfaces asset decryption failures', () => {
  const result = validateCanaryResults({
    session: {
      valid: true,
      tier: 'enterprise',
      allowed_asset_tiers: ['core', 'salesforce', 'hubspot', 'marketo', 'gtm', 'data-hygiene'],
      key_bundle_version: 2,
      key_bundle: {
        version: 2,
        keys: {
          core: 'a',
          salesforce: 'b',
          hubspot: 'c',
          marketo: 'd',
          gtm: 'e',
          'data-hygiene': 'f'
        }
      }
    },
    status: {
      status: 'valid',
      allowed_asset_tiers: ['core', 'salesforce', 'hubspot', 'marketo', 'gtm', 'data-hygiene'],
      key_bundle_version: 2,
      has_scoped_key_bundle: true
    },
    verify: {
      valid: true,
      tier: 'enterprise',
      allowed_asset_tiers: ['core', 'salesforce', 'hubspot', 'marketo', 'gtm', 'data-hygiene'],
      key_bundle_version: 2
    },
    assetValidation: {
      ok: false,
      failures: ['Cannot decrypt opspal-core:config/anomaly-patterns.json (core) - Unsupported state or unable to authenticate data'],
      summary: {
        pluginCount: 5,
        eligibleAssets: 58,
        verifiedAssets: 57,
        blockedAssets: 0,
        skipped: false
      }
    }
  }, 'enterprise');

  assert.strictEqual(result.ok, false);
  assert(result.failures.some((failure) => failure.includes('Cannot decrypt opspal-core:config/anomaly-patterns.json')));
});
