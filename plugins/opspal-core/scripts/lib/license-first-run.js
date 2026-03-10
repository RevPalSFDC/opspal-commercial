#!/usr/bin/env node
'use strict';

/**
 * License First-Run Helper — outputs structured JSON for the /opspalfirst
 * command to interpret. Detects whether the user already has an active
 * license or needs guided activation.
 *
 * Usage:
 *   node license-first-run.js
 *
 * Outputs JSON to stdout. Always exits 0.
 */

const fs = require('fs');
const path = require('path');

const OPSPAL_DIR = path.join(process.env.HOME, '.opspal');
const LICENSE_KEY_FILE = path.join(OPSPAL_DIR, 'license.key');
const CACHE_FILE = path.join(OPSPAL_DIR, 'license-cache.json');

const DEFAULT_SERVER = 'https://license.gorevpal.com';

// ─── Tier info (mirrors license-activation-manager.js) ─────────────────────

const TIER_INFO = {
  starter: {
    label: 'Starter',
    description: 'Quality gate rules, funnel definitions, persona configs, assessment prefills, benchmark retriever, persona KPI contracts, SEO content gap analyzer'
  },
  professional: {
    label: 'Professional',
    description: 'All Starter assets plus scoring engines, risk analyzers, health scorers, CPQ generators, data quality frameworks, SEO scorers, Marketo lead quality, and more'
  },
  enterprise: {
    label: 'Enterprise',
    description: 'Full access: scoring weights, benchmarks, intake rubrics, permission matrices, CPQ field mappings, dedup clustering, canonical selectors, GTM baselines, and all Professional assets'
  },
  trial: {
    label: 'Trial',
    description: 'Same access as Starter for the trial period'
  }
};

const ASSET_COUNTS = { tier1: 13, tier2: 17, tier3: 7 };
const TOTAL_ASSETS = ASSET_COUNTS.tier1 + ASSET_COUNTS.tier2 + ASSET_COUNTS.tier3;

function tierAssetCount(tier) {
  switch (tier) {
    case 'starter': case 'trial': return ASSET_COUNTS.tier3;
    case 'professional': return ASSET_COUNTS.tier2 + ASSET_COUNTS.tier3;
    case 'enterprise': return ASSET_COUNTS.tier1 + ASSET_COUNTS.tier2 + ASSET_COUNTS.tier3;
    default: return 0;
  }
}

// ─── Detection ──────────────────────────────────────────────────────────────

function getStoredKey() {
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

function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function getServerUrl() {
  return (process.env.OPSPAL_LICENSE_SERVER || DEFAULT_SERVER).replace(/\/$/, '');
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  const storedKey = getStoredKey();
  const cache = loadCache();

  // Already activated
  if (storedKey && cache && cache.valid !== false) {
    const tier = cache.tier || 'unknown';
    const count = tierAssetCount(tier);
    console.log(JSON.stringify({
      mode: 'already_activated',
      tier,
      organization: cache.organization || '',
      assets_unlocked: count,
      assets_total: TOTAL_ASSETS,
      allowed_asset_tiers: cache.allowed_asset_tiers || [],
      server_url: getServerUrl()
    }));
    return;
  }

  // First run — needs activation
  const tierTable = {};
  for (const [key, info] of Object.entries(TIER_INFO)) {
    if (key === 'trial') continue; // Don't show trial in the comparison
    tierTable[key] = {
      label: info.label,
      assets: `${tierAssetCount(key)}/${TOTAL_ASSETS}`,
      description: info.description
    };
  }

  const welcomeText = [
    '',
    '╔══════════════════════════════════════════════════════════════╗',
    '║              Welcome to OpsPal by RevPal                    ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
    'OpsPal plugins include encrypted premium assets (scoring engines,',
    'benchmark data, assessment frameworks) that unlock with a license.',
    '',
    'Tier Comparison:',
    '┌──────────────┬──────────┬──────────────────────────────────────┐',
    '│ Tier         │ Assets   │ What You Get                         │',
    '├──────────────┼──────────┼──────────────────────────────────────┤',
    `│ Starter      │  ${tierAssetCount('starter').toString().padStart(2)}/${TOTAL_ASSETS}   │ Methodology configs                  │`,
    `│ Professional │  ${tierAssetCount('professional').toString().padStart(2)}/${TOTAL_ASSETS}   │ Algorithms + methodology             │`,
    `│ Enterprise   │  ${tierAssetCount('enterprise').toString().padStart(2)}/${TOTAL_ASSETS}   │ Full access — all IP                 │`,
    '└──────────────┴──────────┴──────────────────────────────────────┘',
    '',
    'To activate, provide your license key below.',
    `Purchase at: ${getServerUrl().replace('license.', 'www.').replace(/license.*/, 'gorevpal.com/pricing')}`,
    ''
  ].join('\n');

  console.log(JSON.stringify({
    mode: 'first_run',
    prompt_user: true,
    expected_format: 'OPSPAL-{TIER}-{HASH}-{TIMESTAMP}-{CHECKSUM}',
    welcome_text: welcomeText,
    tier_table: tierTable,
    purchase_url: 'https://gorevpal.com/pricing',
    server_url: getServerUrl()
  }));
}

main();
