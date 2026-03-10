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
  assert.deepStrictEqual(expectedAllowedTiersForTier('enterprise'), ['tier1', 'tier2', 'tier3']);
});

test('validateCanaryResults accepts a correct professional bundle', () => {
  const result = validateCanaryResults({
    session: {
      valid: true,
      tier: 'professional',
      organization: 'Acme',
      allowed_asset_tiers: ['tier2', 'tier3'],
      key_bundle_version: 2,
      key_bundle: {
        version: 2,
        keys: {
          tier2: 'a',
          tier3: 'b'
        }
      }
    },
    status: {
      status: 'valid',
      allowed_asset_tiers: ['tier2', 'tier3'],
      key_bundle_version: 2,
      has_scoped_key_bundle: true
    },
    verify: {
      valid: true,
      tier: 'professional',
      allowed_asset_tiers: ['tier2', 'tier3'],
      key_bundle_version: 2,
      expires_at: '2026-03-07T00:00:00.000Z'
    }
  }, 'professional');

  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.failures, []);
});

test('validateCanaryResults rejects bundle tier mismatches', () => {
  const result = validateCanaryResults({
    session: {
      valid: true,
      tier: 'starter',
      allowed_asset_tiers: ['tier3'],
      key_bundle_version: 2,
      key_bundle: {
        version: 2,
        keys: {
          tier2: 'a',
          tier3: 'b'
        }
      }
    },
    status: {
      status: 'valid',
      allowed_asset_tiers: ['tier3'],
      key_bundle_version: 2,
      has_scoped_key_bundle: true
    },
    verify: {
      valid: true,
      tier: 'starter',
      allowed_asset_tiers: ['tier3'],
      key_bundle_version: 2
    }
  }, 'starter');

  assert.strictEqual(result.ok, false);
  assert(result.failures.some((failure) => failure.includes('Scoped key bundle mismatch')));
});

test('validateCanaryResults rejects missing scoped cached status', () => {
  const result = validateCanaryResults({
    session: {
      valid: true,
      tier: 'enterprise',
      allowed_asset_tiers: ['tier1', 'tier2', 'tier3'],
      key_bundle_version: 2,
      key_bundle: {
        version: 2,
        keys: {
          tier1: 'a',
          tier2: 'b',
          tier3: 'c'
        }
      }
    },
    status: {
      status: 'valid',
      allowed_asset_tiers: ['tier1', 'tier2', 'tier3'],
      key_bundle_version: 2,
      has_scoped_key_bundle: false
    },
    verify: {
      valid: true,
      tier: 'enterprise',
      allowed_asset_tiers: ['tier1', 'tier2', 'tier3'],
      key_bundle_version: 2
    }
  }, 'enterprise');

  assert.strictEqual(result.ok, false);
  assert(result.failures.some((failure) => failure.includes('scoped key bundle')));
});
