#!/usr/bin/env node

/**
 * Bootstrap Commercial Encryption
 *
 * One-time bulk re-encryption of all plaintext assets declared in
 * internal plugin encryption.json manifests. Writes .enc files
 * to the commercial tree using domain-scoped AES-256-GCM keys.
 *
 * Prerequisites:
 *   - OPSPAL_KEY_DOMAIN_CORE, _SALESFORCE, _HUBSPOT, _MARKETO, _GTM, _DATA_HYGIENE
 *     env vars set (base64-encoded 32-byte keys, same as license server)
 *
 * Usage:
 *   node scripts/bootstrap-commercial-encryption.js [--dry-run] [--plugin <name>]
 *     --internal-root <path>   Path to opspal-internal-plugins
 *     --commercial-root <path> Path to opspal-commercial (default: parent of this script)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const COMMERCIAL_ROOT = path.resolve(__dirname, '..');
const ENGINE_PATH = path.join(COMMERCIAL_ROOT, 'plugins', 'opspal-core', 'scripts', 'lib', 'asset-encryption-engine.js');

const PLUGIN_DOMAIN_MAP = {
  'opspal-core': 'core',
  'opspal-salesforce': 'salesforce',
  'opspal-hubspot': 'hubspot',
  'opspal-marketo': 'marketo',
  'opspal-gtm-planning': 'gtm',
  'opspal-data-hygiene': 'data-hygiene'
};

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].replace(/^--/, '');
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

function main() {
  const flags = parseArgs(process.argv);
  const dryRun = !!flags['dry-run'];
  const internalRoot = flags['internal-root'];
  const commercialRoot = flags['commercial-root'] || COMMERCIAL_ROOT;
  const filterPlugin = flags.plugin || null;

  if (!internalRoot) {
    console.error('Error: --internal-root <path> is required');
    process.exit(1);
  }

  if (!fs.existsSync(internalRoot)) {
    console.error(`Error: internal root not found: ${internalRoot}`);
    process.exit(1);
  }

  if (!fs.existsSync(ENGINE_PATH)) {
    console.error(`Error: encryption engine not found: ${ENGINE_PATH}`);
    console.error('Run Phase 1 first to restore the encryption engine.');
    process.exit(1);
  }

  const engine = require(ENGINE_PATH);

  // Verify key material is available
  const keyMaterial = engine.resolveKeyMaterial('bootstrap');
  if (!keyMaterial) {
    console.error('Error: No encryption key material available.');
    console.error('Set OPSPAL_KEY_DOMAIN_* env vars (base64-encoded 32-byte AES-256 keys).');
    console.error('Required: OPSPAL_KEY_DOMAIN_CORE, _SALESFORCE, _HUBSPOT, _MARKETO, _GTM, _DATA_HYGIENE');
    process.exit(1);
  }

  console.log(`Bootstrap Commercial Encryption${dryRun ? ' [DRY RUN]' : ''}`);
  console.log(`  Internal:   ${internalRoot}`);
  console.log(`  Commercial: ${commercialRoot}`);
  console.log('');

  const plugins = filterPlugin
    ? [filterPlugin]
    : Object.keys(PLUGIN_DOMAIN_MAP);

  let totalEncrypted = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const pluginName of plugins) {
    const domain = PLUGIN_DOMAIN_MAP[pluginName];
    if (!domain) {
      console.log(`SKIP: ${pluginName} — not in domain map`);
      continue;
    }

    const manifestPath = path.join(internalRoot, 'plugins', pluginName, '.claude-plugin', 'encryption.json');
    if (!fs.existsSync(manifestPath)) {
      console.log(`SKIP: ${pluginName} — no encryption.json`);
      continue;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!Array.isArray(manifest.encrypted_assets) || manifest.encrypted_assets.length === 0) {
      console.log(`SKIP: ${pluginName} — no encrypted assets`);
      continue;
    }

    console.log(`${pluginName} (${manifest.encrypted_assets.length} assets, domain: ${domain})`);

    for (const asset of manifest.encrypted_assets) {
      const plaintextPath = path.join(internalRoot, 'plugins', pluginName, asset.path);
      const encDestPath = path.join(commercialRoot, 'plugins', pluginName, asset.encrypted_path);

      if (!fs.existsSync(plaintextPath)) {
        console.log(`  SKIP:  ${asset.path} — plaintext not found`);
        totalSkipped++;
        continue;
      }

      // Verify checksum if available
      const plaintext = fs.readFileSync(plaintextPath);
      if (asset.checksum_plaintext) {
        const actualChecksum = engine.computeChecksum(plaintext);
        if (actualChecksum !== asset.checksum_plaintext) {
          console.log(`  WARN:  ${asset.path} — checksum mismatch (plaintext changed since manifest was written)`);
          console.log(`           manifest: ${asset.checksum_plaintext}`);
          console.log(`           actual:   ${actualChecksum}`);
        }
      }

      const requiredDomain = asset.required_domain || domain;

      if (dryRun) {
        console.log(`  DRY:   ${asset.path} → ${asset.encrypted_path} (domain: ${requiredDomain})`);
        totalEncrypted++;
        continue;
      }

      try {
        const encBlob = engine.encryptAsset(plaintext, pluginName, asset.path, keyMaterial, {
          requiredDomain
        });

        fs.mkdirSync(path.dirname(encDestPath), { recursive: true });
        fs.writeFileSync(encDestPath, encBlob);

        console.log(`  OK:    ${asset.path} → ${asset.encrypted_path} (${plaintext.length} → ${encBlob.length} bytes)`);
        totalEncrypted++;
      } catch (err) {
        console.error(`  FAIL:  ${asset.path} — ${err.message}`);
        totalFailed++;
      }
    }

    console.log('');
  }

  console.log('Summary:');
  console.log(`  Encrypted: ${totalEncrypted}`);
  console.log(`  Skipped:   ${totalSkipped}`);
  console.log(`  Failed:    ${totalFailed}`);

  if (dryRun) {
    console.log('');
    console.log('Run without --dry-run to write .enc files.');
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { PLUGIN_DOMAIN_MAP };
