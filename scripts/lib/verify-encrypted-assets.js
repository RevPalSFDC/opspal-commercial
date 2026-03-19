'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PLUGINS_DIR = path.join(REPO_ROOT, 'plugins');

function main() {
  const pluginDirs = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(PLUGINS_DIR, entry.name));

  const issues = [];
  let manifestCount = 0;
  let assetCount = 0;

  for (const pluginDir of pluginDirs) {
    const manifestPath = path.join(pluginDir, '.claude-plugin', 'encryption.json');
    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    manifestCount += 1;

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      issues.push(`Invalid JSON: ${relativeToRepo(manifestPath)} (${error.message})`);
      continue;
    }

    const pluginName = path.basename(pluginDir);
    const encryptedAssets = Array.isArray(manifest.encrypted_assets) ? manifest.encrypted_assets : null;

    if (Object.prototype.hasOwnProperty.call(manifest, 'encrypted_files')) {
      issues.push(`Legacy encryption manifest schema detected: ${relativeToRepo(manifestPath)}`);
      continue;
    }

    if (manifest.version !== 2) {
      issues.push(`Expected version: 2 in ${relativeToRepo(manifestPath)}`);
    }

    if (manifest.plugin !== pluginName) {
      issues.push(`Manifest plugin mismatch in ${relativeToRepo(manifestPath)} (expected "${pluginName}")`);
    }

    if (!Array.isArray(encryptedAssets)) {
      issues.push(`encrypted_assets must be an array in ${relativeToRepo(manifestPath)}`);
      continue;
    }

    if (typeof manifest.cleanup_on_stop !== 'boolean') {
      issues.push(`cleanup_on_stop must be boolean in ${relativeToRepo(manifestPath)}`);
    }

    if (manifest.allow_plaintext_fallback !== false) {
      issues.push(`allow_plaintext_fallback must be false in ${relativeToRepo(manifestPath)}`);
    }

    for (const asset of encryptedAssets) {
      assetCount += 1;

      if (!asset || typeof asset !== 'object') {
        issues.push(`Invalid encrypted asset entry in ${relativeToRepo(manifestPath)}`);
        continue;
      }

      if (!asset.path || !asset.encrypted_path) {
        issues.push(`Encrypted asset is missing path/encrypted_path in ${relativeToRepo(manifestPath)}`);
        continue;
      }

      const plaintextPath = path.join(pluginDir, asset.path);
      const encryptedPath = path.join(pluginDir, asset.encrypted_path);
      if (fs.existsSync(plaintextPath) && fs.existsSync(encryptedPath)) {
        issues.push(
          `Protected asset has tracked plaintext counterpart: ${relativeToRepo(plaintextPath)} and ${relativeToRepo(encryptedPath)}`
        );
      }
    }
  }

  if (issues.length > 0) {
    console.error('Encrypted asset validation failed:');
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Validated ${manifestCount} encryption manifest(s) and ${assetCount} protected asset declaration(s).`);
}

function relativeToRepo(absolutePath) {
  return path.relative(REPO_ROOT, absolutePath) || '.';
}

main();
