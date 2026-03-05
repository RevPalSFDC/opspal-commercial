#!/usr/bin/env node

/**
 * Plugin Asset Encryptor - CLI
 *
 * CLI wrapper over asset-encryption-engine.js for managing encrypted plugin assets.
 *
 * Subcommands:
 *   key-setup                       Generate master key
 *   init      --plugin <name>       Create skeleton encryption.json
 *   encrypt   --plugin <name> --file <path> [--dir <path>]
 *   decrypt   --plugin <name> --file <path> --output-dir <dir>
 *   verify    --plugin <name>       Verify all .enc files
 *   re-encrypt --plugin <name> [--rotate-key]
 *   status    --plugin <name>       Show encryption status
 *
 * @module plugin-asset-encryptor
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawnSync } = require('child_process');
const engine = require('./asset-encryption-engine');

// Try to load plugin-path-resolver for plugin root discovery
let resolvePluginRoot;
try {
  const resolver = require('./plugin-path-resolver');
  resolvePluginRoot = resolver.resolvePluginRoot;
} catch {
  resolvePluginRoot = null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function die(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function info(msg) {
  console.log(msg);
}

/**
 * Locate the root directory of a plugin by name.
 */
function findPluginRoot(pluginName) {
  // 1. Use plugin-path-resolver if available
  if (resolvePluginRoot) {
    const resolved = resolvePluginRoot(pluginName);
    if (resolved) return resolved;
  }

  // 2. Check relative to cwd
  const candidates = [
    path.join(process.cwd(), 'plugins', pluginName),
    path.join(process.cwd(), '.claude-plugins', pluginName),
    path.join(process.cwd(), pluginName)
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, '.claude-plugin'))) return c;
  }

  die(`Cannot locate plugin "${pluginName}". Provide full path or run from project root.`);
}

/**
 * Parse CLI args into { command, flags }.
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const flags = {};

  for (let i = 1; i < args.length; i++) {
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

  return { command, flags };
}

// ─── Subcommands ────────────────────────────────────────────────────────────

function cmdKeySetup() {
  if (fs.existsSync(engine.MASTER_KEY_FILE)) {
    die(`Key file already exists at ${engine.MASTER_KEY_FILE}\nTo rotate, back up the old key first, then delete it.`);
  }

  const key = engine.generateKey();
  engine.writeKeyFile(key);

  info(`Master key generated and saved to ${engine.MASTER_KEY_FILE}`);
  info(`Permissions set to 600 (owner read/write only).`);
  info('');
  info('Alternatively, set the OPSPAL_PLUGIN_MASTER_KEY environment variable:');
  info(`  export OPSPAL_PLUGIN_MASTER_KEY="${key}"`);
}

function cmdInit(flags) {
  const pluginName = flags.plugin;
  if (!pluginName) die('--plugin <name> is required');

  const pluginRoot = findPluginRoot(pluginName);
  const manifestPath = path.join(pluginRoot, '.claude-plugin', 'encryption.json');

  if (fs.existsSync(manifestPath)) {
    die(`encryption.json already exists at ${manifestPath}`);
  }

  const manifest = {
    version: 1,
    plugin: pluginName,
    encrypted_assets: [],
    cleanup_on_stop: true,
    allow_plaintext_fallback: false
  };

  engine.writeManifest(pluginRoot, manifest);
  info(`Created ${manifestPath}`);
  info('Add assets with: node plugin-asset-encryptor.js encrypt --plugin ' + pluginName + ' --file <path>');
}

function cmdEncrypt(flags) {
  const pluginName = flags.plugin;
  if (!pluginName) die('--plugin <name> is required');

  const filePath = flags.file || flags.dir;
  if (!filePath) die('--file <path> or --dir <path> is required');

  const pluginRoot = findPluginRoot(pluginName);
  const masterKey = engine.resolveMasterKey(pluginName);
  if (!masterKey) die('No master key found. Run: node plugin-asset-encryptor.js key-setup');

  // Fix M1: Guard statSync against missing paths
  let isDir = false;
  if (flags.dir) {
    const dirPath = path.resolve(pluginRoot, flags.dir);
    if (!fs.existsSync(dirPath)) die(`Directory not found: ${dirPath}`);
    isDir = fs.statSync(dirPath).isDirectory();
    if (!isDir) die(`Not a directory: ${dirPath}`);
  }
  let inputPath, assetPath, encryptedPath;

  if (isDir) {
    // Tar the directory, then encrypt the tarball
    const dirFullPath = path.resolve(pluginRoot, flags.dir);
    const relDir = path.relative(pluginRoot, dirFullPath);
    assetPath = relDir;
    encryptedPath = relDir + '.tar.enc';

    const tmpTar = path.join(require('os').tmpdir(), `opspal-enc-${Date.now()}.tar`);
    // Fix M2: Use spawnSync instead of execSync to avoid shell injection via paths
    const tarCreate = spawnSync('tar', ['cf', tmpTar, '-C', path.dirname(dirFullPath), path.basename(dirFullPath)], { stdio: 'pipe' });
    if (tarCreate.status !== 0) {
      die(`Failed to create tar archive: ${(tarCreate.stderr || '').toString()}`);
    }
    inputPath = tmpTar;
  } else {
    const fileFullPath = path.resolve(pluginRoot, filePath);
    if (!fs.existsSync(fileFullPath)) die(`File not found: ${fileFullPath}`);
    assetPath = path.relative(pluginRoot, fileFullPath);
    encryptedPath = assetPath + '.enc';
    inputPath = fileFullPath;
  }

  const outputFullPath = path.resolve(pluginRoot, encryptedPath);
  const result = engine.encryptFile(inputPath, outputFullPath, pluginName, assetPath, masterKey);

  // Clean up temp tar
  if (isDir) {
    try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
  }

  // Update manifest
  let manifest = engine.loadManifest(pluginRoot);
  if (!manifest) {
    manifest = {
      version: 1,
      plugin: pluginName,
      encrypted_assets: [],
      cleanup_on_stop: true,
      allow_plaintext_fallback: false
    };
  }

  // Remove existing entry for this path if present
  manifest.encrypted_assets = manifest.encrypted_assets.filter(a => a.path !== assetPath);

  manifest.encrypted_assets.push({
    path: assetPath,
    encrypted_path: encryptedPath,
    asset_type: isDir ? 'directory' : 'script',
    sensitivity: 'high',
    decrypt_on: ['SessionStart'],
    checksum_plaintext: result.checksum
  });

  engine.writeManifest(pluginRoot, manifest);

  // Add original to .gitignore if not already there
  const gitignorePath = path.join(pluginRoot, '.gitignore');
  const gitignoreLine = `/${assetPath}`;
  let gitignoreContent = '';
  if (fs.existsSync(gitignorePath)) {
    gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  }
  if (!gitignoreContent.includes(gitignoreLine)) {
    fs.appendFileSync(gitignorePath, `\n# Encrypted asset (plaintext excluded)\n${gitignoreLine}\n`);
  }

  info(`Encrypted: ${assetPath}`);
  info(`  Output:    ${encryptedPath}`);
  info(`  Size:      ${result.size} -> ${result.encryptedSize} bytes`);
  info(`  Checksum:  ${result.checksum}`);
  info(`  Manifest:  updated`);
  info(`  .gitignore: ${gitignoreLine} added`);
}

function cmdDecrypt(flags) {
  const pluginName = flags.plugin;
  if (!pluginName) die('--plugin <name> is required');

  const filePath = flags.file;
  if (!filePath) die('--file <path> is required (the .enc file path, relative to plugin root)');

  const outputDir = flags['output-dir'] || flags.outputDir || require('os').tmpdir();

  const pluginRoot = findPluginRoot(pluginName);
  const masterKey = engine.resolveMasterKey(pluginName);
  if (!masterKey) die('No master key found. Run: node plugin-asset-encryptor.js key-setup');

  // Find the asset entry in manifest
  const manifest = engine.loadManifest(pluginRoot);
  const entry = manifest && manifest.encrypted_assets.find(
    a => a.encrypted_path === filePath || a.path === filePath
  );

  const encPath = entry
    ? path.resolve(pluginRoot, entry.encrypted_path)
    : path.resolve(pluginRoot, filePath);

  const assetPath = entry ? entry.path : filePath.replace(/\.enc$/, '');
  const expectedChecksum = entry ? entry.checksum_plaintext : undefined;

  const outputPath = path.join(outputDir, path.basename(assetPath));

  const result = engine.decryptFile(encPath, outputPath, pluginName, assetPath, masterKey, {
    expectedChecksum
  });

  // If it was a .tar.enc, also extract
  // Fix M2: Use spawnSync instead of execSync to avoid shell injection
  if (assetPath.endsWith('.tar') || filePath.endsWith('.tar.enc')) {
    const extractResult = spawnSync('tar', ['xf', outputPath, '-C', outputDir], { stdio: 'pipe' });
    if (extractResult.status === 0) {
      fs.unlinkSync(outputPath);
      info(`Extracted directory to ${outputDir}`);
    } else {
      info(`Tar extraction failed: ${(extractResult.stderr || '').toString()}. Raw file at ${outputPath}`);
    }
  } else {
    info(`Decrypted to: ${outputPath} (${result.size} bytes)`);
  }

  if (result.checksumValid !== null) {
    info(`Checksum: ${result.checksumValid ? 'PASSED' : 'FAILED'}`);
  }
}

function cmdVerify(flags) {
  const pluginName = flags.plugin;
  if (!pluginName) die('--plugin <name> is required');

  const pluginRoot = findPluginRoot(pluginName);
  const masterKey = engine.resolveMasterKey(pluginName);
  if (!masterKey) die('No master key found.');

  const manifest = engine.loadManifest(pluginRoot);
  if (!manifest || !manifest.encrypted_assets.length) {
    info('No encrypted assets found in manifest.');
    return;
  }

  let passed = 0;
  let failed = 0;

  for (const asset of manifest.encrypted_assets) {
    const encPath = path.resolve(pluginRoot, asset.encrypted_path);

    if (!fs.existsSync(encPath)) {
      console.error(`  MISSING: ${asset.encrypted_path}`);
      failed++;
      continue;
    }

    const result = engine.verifyFile(encPath, pluginName, asset.path, masterKey, asset.checksum_plaintext);

    if (result.valid) {
      info(`  OK: ${asset.encrypted_path}`);
      passed++;
    } else {
      console.error(`  FAIL: ${asset.encrypted_path} - ${result.error}`);
      failed++;
    }
  }

  info('');
  info(`Verified ${passed + failed} assets: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

function cmdReEncrypt(flags) {
  const pluginName = flags.plugin;
  if (!pluginName) die('--plugin <name> is required');

  const pluginRoot = findPluginRoot(pluginName);
  const oldKey = engine.resolveMasterKey(pluginName);
  if (!oldKey) die('No master key found for decryption.');

  let newKey = oldKey;
  if (flags['rotate-key'] || flags.rotateKey) {
    const newKeyB64 = engine.generateKey();
    newKey = Buffer.from(newKeyB64, 'base64');
    info(`New key generated. Save this to ${engine.MASTER_KEY_FILE}:`);
    info(`  ${newKeyB64}`);
    info('');
  }

  const manifest = engine.loadManifest(pluginRoot);
  if (!manifest || !manifest.encrypted_assets.length) {
    info('No encrypted assets to re-encrypt.');
    return;
  }

  // Fix M3: Two-phase re-encryption to prevent partial-failure inconsistency
  // Phase 1: Decrypt all assets with old key
  const decryptedAssets = [];
  for (const asset of manifest.encrypted_assets) {
    const encPath = path.resolve(pluginRoot, asset.encrypted_path);
    if (!fs.existsSync(encPath)) {
      console.error(`  SKIP (missing): ${asset.encrypted_path}`);
      continue;
    }

    const encBlob = fs.readFileSync(encPath);
    const plaintext = engine.decryptAsset(encBlob, pluginName, asset.path, oldKey);
    decryptedAssets.push({ asset, plaintext });
  }

  // Phase 2: Re-encrypt all with new key
  for (const { asset, plaintext } of decryptedAssets) {
    const encPath = path.resolve(pluginRoot, asset.encrypted_path);
    const newEnc = engine.encryptAsset(plaintext, pluginName, asset.path, newKey);
    fs.writeFileSync(encPath, newEnc);
    asset.checksum_plaintext = engine.computeChecksum(plaintext);
    info(`  Re-encrypted: ${asset.encrypted_path}`);
  }

  // Phase 3: Atomically write manifest + key
  engine.writeManifest(pluginRoot, manifest);

  if (flags['rotate-key'] || flags.rotateKey) {
    engine.writeKeyFile(newKey.toString('base64'));
    info('');
    info(`Key rotated and saved to ${engine.MASTER_KEY_FILE}`);
  }

  info('Re-encryption complete.');
}

function cmdStatus(flags) {
  const pluginName = flags.plugin;
  if (!pluginName) die('--plugin <name> is required');

  const pluginRoot = findPluginRoot(pluginName);
  const masterKey = engine.resolveMasterKey(pluginName);
  const manifest = engine.loadManifest(pluginRoot);

  info(`Plugin: ${pluginName}`);
  info(`Root:   ${pluginRoot}`);
  info('');

  // Key source
  if (process.env[engine.KEY_ENV_VAR]) {
    info(`Key source: ${engine.KEY_ENV_VAR} env var`);
  } else if (fs.existsSync(engine.MASTER_KEY_FILE)) {
    info(`Key source: ${engine.MASTER_KEY_FILE}`);
  } else {
    const perPluginKey = path.join(engine.KEY_DIR, `${pluginName}.key`);
    if (fs.existsSync(perPluginKey)) {
      info(`Key source: ${perPluginKey} (per-plugin)`);
    } else {
      info('Key source: NOT CONFIGURED');
    }
  }
  info(`Key available: ${masterKey ? 'yes' : 'NO'}`);
  info('');

  if (!manifest) {
    info('Encryption manifest: not found');
    return;
  }

  info(`Encrypted assets: ${manifest.encrypted_assets.length}`);
  info(`Cleanup on stop: ${manifest.cleanup_on_stop}`);
  info(`Plaintext fallback: ${manifest.allow_plaintext_fallback}`);
  info('');

  if (manifest.encrypted_assets.length > 0) {
    info('Assets:');
    for (const asset of manifest.encrypted_assets) {
      const encPath = path.resolve(pluginRoot, asset.encrypted_path);
      const exists = fs.existsSync(encPath);
      const status = exists ? 'present' : 'MISSING';
      info(`  ${asset.path} -> ${asset.encrypted_path} [${status}] (${asset.sensitivity}, ${asset.decrypt_on.join('+')})`);
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  const { command, flags } = parseArgs(process.argv);

  const commands = {
    'key-setup': () => cmdKeySetup(),
    'init': () => cmdInit(flags),
    'encrypt': () => cmdEncrypt(flags),
    'decrypt': () => cmdDecrypt(flags),
    'verify': () => cmdVerify(flags),
    're-encrypt': () => cmdReEncrypt(flags),
    'status': () => cmdStatus(flags)
  };

  if (!command || command === '--help' || command === '-h') {
    info('Usage: node plugin-asset-encryptor.js <command> [options]');
    info('');
    info('Commands:');
    info('  key-setup                          Generate master encryption key');
    info('  init      --plugin <name>          Create encryption.json manifest');
    info('  encrypt   --plugin <name> --file <path>    Encrypt a file');
    info('  encrypt   --plugin <name> --dir <path>     Tar+encrypt a directory');
    info('  decrypt   --plugin <name> --file <path> [--output-dir <dir>]');
    info('  verify    --plugin <name>          Verify all encrypted assets');
    info('  re-encrypt --plugin <name> [--rotate-key]  Re-encrypt all assets');
    info('  status    --plugin <name>          Show encryption status');
    process.exit(0);
  }

  if (!commands[command]) {
    die(`Unknown command: ${command}. Run with --help for usage.`);
  }

  commands[command]();
}

if (require.main === module) {
  main();
}

module.exports = { findPluginRoot, cmdKeySetup, cmdInit, cmdEncrypt, cmdDecrypt, cmdVerify, cmdReEncrypt, cmdStatus };
