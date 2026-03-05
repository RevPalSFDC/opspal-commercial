#!/usr/bin/env node

/**
 * Asset Encryption Engine
 *
 * Core encrypt/decrypt/verify library for selective encryption of plugin assets.
 * Uses AES-256-GCM with HKDF key derivation.  Zero external dependencies.
 *
 * Wire format (.enc files):
 *   Offset  Size  Content
 *   0-3     4B    Magic  "OENC" (0x4F454E43)
 *   4       1B    Version (0x01)
 *   5-7     3B    Reserved flags
 *   8-23    16B   HKDF salt
 *   24-35   12B   GCM nonce
 *   36-51   16B   GCM auth tag
 *   52+     var   Ciphertext
 *
 * @module asset-encryption-engine
 */

'use strict';

// Node.js version check — crypto.hkdfSync requires Node >= 15
const [_nodeMajor] = process.versions.node.split('.').map(Number);
if (_nodeMajor < 15) {
  throw new Error(
    `asset-encryption-engine requires Node.js >= 15 (found ${process.versions.node}). ` +
    `crypto.hkdfSync is not available in earlier versions.`
  );
}

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Constants ──────────────────────────────────────────────────────────────

const MAGIC = Buffer.from('OENC');          // 0x4F454E43
const FORMAT_VERSION = 0x01;
const HEADER_SIZE = 52;                     // 4+1+3+16+12+16
const SALT_SIZE = 16;
const NONCE_SIZE = 12;
const TAG_SIZE = 16;
const KEY_SIZE = 32;                        // AES-256
const ALGORITHM = 'aes-256-gcm';

// HKDF info prefix
const HKDF_INFO_PREFIX = 'opspal-enc:v1';

// Key source locations (checked in order)
const KEY_ENV_VAR = 'OPSPAL_PLUGIN_MASTER_KEY';
const KEY_DIR = path.join(os.homedir(), '.claude', 'opspal-enc');
const MASTER_KEY_FILE = path.join(KEY_DIR, 'master.key');

// ─── Key Management ─────────────────────────────────────────────────────────

/**
 * Generate a new 32-byte master key, returned as base64.
 * @returns {string} Base64-encoded 32-byte key
 */
function generateKey() {
  return crypto.randomBytes(KEY_SIZE).toString('base64');
}

/**
 * Write a master key to the default key file with restricted permissions.
 * @param {string} base64Key - Base64-encoded key
 */
function writeKeyFile(base64Key) {
  fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(MASTER_KEY_FILE, base64Key + '\n', { mode: 0o600 });
}

/**
 * Resolve the master key for a given plugin.
 *
 * Check order:
 *   1. OPSPAL_PLUGIN_MASTER_KEY env var
 *   2. ~/.claude/opspal-enc/master.key
 *   3. ~/.claude/opspal-enc/{pluginName}.key  (per-plugin override)
 *
 * @param {string} [pluginName] - Plugin name for per-plugin key lookup
 * @returns {Buffer|null} 32-byte key buffer or null if not found
 */
function resolveMasterKey(pluginName) {
  // 1. Environment variable
  const envKey = process.env[KEY_ENV_VAR];
  if (envKey) {
    const buf = Buffer.from(envKey, 'base64');
    if (buf.length === KEY_SIZE) return buf;
  }

  // 2. Master key file
  if (fs.existsSync(MASTER_KEY_FILE)) {
    try {
      const content = fs.readFileSync(MASTER_KEY_FILE, 'utf8').trim();
      const buf = Buffer.from(content, 'base64');
      if (buf.length === KEY_SIZE) return buf;
    } catch { /* fall through */ }
  }

  // 3. Per-plugin key file
  if (pluginName) {
    const pluginKeyFile = path.join(KEY_DIR, `${pluginName}.key`);
    if (fs.existsSync(pluginKeyFile)) {
      try {
        const content = fs.readFileSync(pluginKeyFile, 'utf8').trim();
        const buf = Buffer.from(content, 'base64');
        if (buf.length === KEY_SIZE) return buf;
      } catch { /* fall through */ }
    }
  }

  return null;
}

// ─── HKDF Key Derivation ───────────────────────────────────────────────────

/**
 * Derive a per-asset key using HKDF-SHA256.
 *
 * @param {Buffer} masterKey  - 32-byte master key
 * @param {string} pluginName - Plugin name
 * @param {Buffer} salt       - 16-byte random salt (stored in .enc header)
 * @returns {Buffer} 32-byte derived key
 */
function deriveKey(masterKey, pluginName, salt) {
  const info = Buffer.from(`${HKDF_INFO_PREFIX}:${pluginName}`);
  return crypto.hkdfSync('sha256', masterKey, salt, info, KEY_SIZE);
}

// ─── AAD Construction ───────────────────────────────────────────────────────

/**
 * Build AAD that binds ciphertext to a specific plugin + path.
 * Prevents cross-plugin or cross-path replay attacks.
 *
 * @param {string} pluginName - Plugin name
 * @param {string} assetPath  - Relative path inside the plugin
 * @returns {Buffer}
 */
function buildAAD(pluginName, assetPath) {
  return Buffer.from(`opspal-enc:v1:${pluginName}:${assetPath}`);
}

// ─── Wire Format Helpers ────────────────────────────────────────────────────

/**
 * Assemble the .enc binary wire format.
 *
 * @param {Object} parts
 * @param {Buffer} parts.salt       - 16B HKDF salt
 * @param {Buffer} parts.nonce      - 12B GCM nonce
 * @param {Buffer} parts.tag        - 16B GCM auth tag
 * @param {Buffer} parts.ciphertext - Variable-length ciphertext
 * @returns {Buffer} Complete .enc blob
 */
function assembleWireFormat({ salt, nonce, tag, ciphertext }) {
  const header = Buffer.alloc(HEADER_SIZE);
  let offset = 0;

  // Magic
  MAGIC.copy(header, offset);
  offset += 4;

  // Version
  header.writeUInt8(FORMAT_VERSION, offset);
  offset += 1;

  // Reserved flags (3 bytes, zeroed)
  offset += 3;

  // Salt
  salt.copy(header, offset);
  offset += SALT_SIZE;

  // Nonce
  nonce.copy(header, offset);
  offset += NONCE_SIZE;

  // Auth tag
  tag.copy(header, offset);

  return Buffer.concat([header, ciphertext]);
}

/**
 * Parse a .enc blob into its component parts.
 *
 * @param {Buffer} encBuffer - Complete .enc blob
 * @returns {Object} { salt, nonce, tag, ciphertext }
 * @throws {Error} If magic bytes or version mismatch
 */
function parseWireFormat(encBuffer) {
  if (!Buffer.isBuffer(encBuffer) || encBuffer.length < HEADER_SIZE) {
    throw new Error(`Invalid .enc file: too short (${encBuffer ? encBuffer.length : 0} bytes, need ${HEADER_SIZE})`);
  }

  // Validate magic
  const magic = encBuffer.subarray(0, 4);
  if (!magic.equals(MAGIC)) {
    throw new Error(`Invalid .enc file: bad magic bytes (got ${magic.toString('hex')}, expected ${MAGIC.toString('hex')})`);
  }

  // Validate version
  const version = encBuffer.readUInt8(4);
  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported .enc version: ${version} (expected ${FORMAT_VERSION})`);
  }

  // Extract parts
  let offset = 8; // skip magic(4) + version(1) + reserved(3)

  const salt = encBuffer.subarray(offset, offset + SALT_SIZE);
  offset += SALT_SIZE;

  const nonce = encBuffer.subarray(offset, offset + NONCE_SIZE);
  offset += NONCE_SIZE;

  const tag = encBuffer.subarray(offset, offset + TAG_SIZE);
  offset += TAG_SIZE;

  const ciphertext = encBuffer.subarray(offset);

  return { salt, nonce, tag, ciphertext };
}

// ─── Encrypt / Decrypt / Verify ─────────────────────────────────────────────

/**
 * Encrypt plaintext into the .enc wire format.
 *
 * @param {Buffer|string} plaintext  - Content to encrypt
 * @param {string}        pluginName - Plugin name (used in AAD + HKDF info)
 * @param {string}        assetPath  - Relative asset path (used in AAD)
 * @param {Buffer}        masterKey  - 32-byte master key
 * @returns {Buffer} .enc wire-format blob
 */
function encryptAsset(plaintext, pluginName, assetPath, masterKey) {
  const plaintextBuf = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext);

  const salt = crypto.randomBytes(SALT_SIZE);
  const nonce = crypto.randomBytes(NONCE_SIZE);
  const derivedKey = deriveKey(masterKey, pluginName, salt);
  const aad = buildAAD(pluginName, assetPath);

  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, nonce, { authTagLength: TAG_SIZE });
  cipher.setAAD(aad);

  const ciphertext = Buffer.concat([cipher.update(plaintextBuf), cipher.final()]);
  const tag = cipher.getAuthTag();

  return assembleWireFormat({ salt, nonce, tag, ciphertext });
}

/**
 * Decrypt a .enc blob back to plaintext.
 *
 * @param {Buffer} encBuffer  - .enc wire-format blob
 * @param {string} pluginName - Plugin name (must match what was used during encryption)
 * @param {string} assetPath  - Relative asset path (must match encryption AAD)
 * @param {Buffer} masterKey  - 32-byte master key
 * @returns {Buffer} Decrypted plaintext
 * @throws {Error} On authentication failure (tampered data or wrong key/AAD)
 */
function decryptAsset(encBuffer, pluginName, assetPath, masterKey) {
  const { salt, nonce, tag, ciphertext } = parseWireFormat(encBuffer);

  const derivedKey = deriveKey(masterKey, pluginName, salt);
  const aad = buildAAD(pluginName, assetPath);

  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, nonce, { authTagLength: TAG_SIZE });
  decipher.setAuthTag(tag);
  decipher.setAAD(aad);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext;
}

/**
 * Verify a .enc blob: decrypt + optional checksum comparison.
 *
 * @param {Buffer}  encBuffer        - .enc wire-format blob
 * @param {string}  pluginName       - Plugin name
 * @param {string}  assetPath        - Relative asset path
 * @param {Buffer}  masterKey        - 32-byte master key
 * @param {string}  [expectedChecksum] - "sha256:<hex>" to verify against
 * @returns {{ valid: boolean, error?: string }}
 */
function verifyAsset(encBuffer, pluginName, assetPath, masterKey, expectedChecksum) {
  try {
    const plaintext = decryptAsset(encBuffer, pluginName, assetPath, masterKey);

    if (expectedChecksum) {
      const [algo, expectedHash] = expectedChecksum.split(':');
      if (algo !== 'sha256') {
        return { valid: false, error: `Unsupported checksum algorithm: ${algo}` };
      }
      const actualHash = crypto.createHash('sha256').update(plaintext).digest('hex');
      if (actualHash !== expectedHash) {
        return {
          valid: false,
          error: `Checksum mismatch: expected ${expectedHash.slice(0, 12)}..., got ${actualHash.slice(0, 12)}...`
        };
      }
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Compute the SHA-256 checksum of content in manifest format.
 *
 * @param {Buffer|string} content
 * @returns {string} "sha256:<hex>"
 */
function computeChecksum(content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  return `sha256:${hash}`;
}

// ─── File-Level Operations ──────────────────────────────────────────────────

/**
 * Encrypt a file and write the .enc output.
 *
 * @param {string} inputPath   - Path to plaintext file
 * @param {string} outputPath  - Path for .enc output
 * @param {string} pluginName  - Plugin name
 * @param {string} assetPath   - Relative path within plugin (for AAD)
 * @param {Buffer} masterKey   - 32-byte master key
 * @returns {{ checksum: string, size: number, encryptedSize: number }}
 */
function encryptFile(inputPath, outputPath, pluginName, assetPath, masterKey) {
  const plaintext = fs.readFileSync(inputPath);
  const checksum = computeChecksum(plaintext);
  const encBlob = encryptAsset(plaintext, pluginName, assetPath, masterKey);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, encBlob);

  return {
    checksum,
    size: plaintext.length,
    encryptedSize: encBlob.length
  };
}

/**
 * Decrypt a .enc file and write plaintext output.
 *
 * @param {string} encPath     - Path to .enc file
 * @param {string} outputPath  - Path for plaintext output
 * @param {string} pluginName  - Plugin name
 * @param {string} assetPath   - Relative asset path (for AAD)
 * @param {Buffer} masterKey   - 32-byte master key
 * @param {Object} [options]
 * @param {string} [options.expectedChecksum] - Checksum to verify
 * @param {number} [options.fileMode=0o600]   - File permissions
 * @returns {{ size: number, checksumValid: boolean|null }}
 */
function decryptFile(encPath, outputPath, pluginName, assetPath, masterKey, options = {}) {
  const { expectedChecksum, fileMode = 0o600 } = options;
  const encBlob = fs.readFileSync(encPath);
  const plaintext = decryptAsset(encBlob, pluginName, assetPath, masterKey);

  let checksumValid = null;
  if (expectedChecksum) {
    const actual = computeChecksum(plaintext);
    checksumValid = (actual === expectedChecksum);
    if (!checksumValid) {
      throw new Error(`Post-decryption checksum mismatch for ${assetPath}`);
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(outputPath, plaintext, { mode: fileMode });

  return { size: plaintext.length, checksumValid };
}

/**
 * Verify a .enc file on disk.
 *
 * @param {string} encPath     - Path to .enc file
 * @param {string} pluginName  - Plugin name
 * @param {string} assetPath   - Relative asset path
 * @param {Buffer} masterKey   - Master key
 * @param {string} [expectedChecksum] - Checksum to verify
 * @returns {{ valid: boolean, error?: string }}
 */
function verifyFile(encPath, pluginName, assetPath, masterKey, expectedChecksum) {
  try {
    const encBlob = fs.readFileSync(encPath);
    return verifyAsset(encBlob, pluginName, assetPath, masterKey, expectedChecksum);
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// ─── Manifest Helpers ───────────────────────────────────────────────────────

/**
 * Load a plugin's encryption.json manifest.
 *
 * @param {string} pluginDir - Root directory of the plugin
 * @returns {Object|null} Parsed manifest or null if not found
 */
function loadManifest(pluginDir) {
  const manifestPath = path.join(pluginDir, '.claude-plugin', 'encryption.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Write a plugin's encryption.json manifest.
 *
 * @param {string} pluginDir - Root directory of the plugin
 * @param {Object} manifest  - Manifest object
 */
function writeManifest(pluginDir, manifest) {
  const manifestDir = path.join(pluginDir, '.claude-plugin');
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(
    path.join(manifestDir, 'encryption.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  // Constants
  MAGIC,
  FORMAT_VERSION,
  HEADER_SIZE,
  KEY_SIZE,
  KEY_DIR,
  MASTER_KEY_FILE,
  KEY_ENV_VAR,

  // Key management
  generateKey,
  writeKeyFile,
  resolveMasterKey,
  deriveKey,

  // Low-level crypto
  encryptAsset,
  decryptAsset,
  verifyAsset,
  computeChecksum,

  // Wire format
  assembleWireFormat,
  parseWireFormat,

  // File operations
  encryptFile,
  decryptFile,
  verifyFile,

  // Manifest
  loadManifest,
  writeManifest
};

// ─── CLI self-test (node asset-encryption-engine.js --self-test) ────────────

if (require.main === module && process.argv.includes('--self-test')) {
  console.log('Running self-test...');

  const key = Buffer.from(generateKey(), 'base64');
  const plugin = 'test-plugin';
  const assetPath = 'scripts/lib/secret.js';
  const plaintext = Buffer.from('console.log("proprietary logic");');

  // Round-trip
  const enc = encryptAsset(plaintext, plugin, assetPath, key);
  const dec = decryptAsset(enc, plugin, assetPath, key);
  console.assert(dec.equals(plaintext), 'Round-trip failed');

  // Verify with checksum
  const checksum = computeChecksum(plaintext);
  const result = verifyAsset(enc, plugin, assetPath, key, checksum);
  console.assert(result.valid, `Verify failed: ${result.error}`);

  // Tamper detection
  const tampered = Buffer.from(enc);
  tampered[HEADER_SIZE + 5] ^= 0xFF; // flip a ciphertext byte
  const tamperResult = verifyAsset(tampered, plugin, assetPath, key);
  console.assert(!tamperResult.valid, 'Tamper detection failed');

  // AAD binding
  const wrongPluginResult = verifyAsset(enc, 'wrong-plugin', assetPath, key);
  console.assert(!wrongPluginResult.valid, 'AAD binding failed');

  console.log('All self-tests passed.');
  process.exit(0);
}
