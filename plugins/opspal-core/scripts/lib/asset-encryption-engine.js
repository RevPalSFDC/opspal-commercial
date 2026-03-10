#!/usr/bin/env node

/**
 * Asset Encryption Engine
 *
 * Core encrypt/decrypt/verify library for selective encryption of plugin assets.
 * Uses AES-256-GCM with HKDF key derivation. Zero external dependencies.
 *
 * Wire format (.enc files):
 *   Offset  Size  Content
 *   0-3     4B    Magic  "OENC" (0x4F454E43)
 *   4       1B    Version (0x02 tier-scoped)
 *   5       1B    Key slot (1=tier1, 2=tier2, 3=tier3)
 *   6-7     2B    Reserved flags
 *   8-23    16B   HKDF salt
 *   24-35   12B   GCM nonce
 *   36-51   16B   GCM auth tag
 *   52+     var   Ciphertext
 *
 * @module asset-encryption-engine
 */

'use strict';

const [nodeMajor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 15) {
  throw new Error(
    `asset-encryption-engine requires Node.js >= 15 (found ${process.versions.node}). ` +
    'crypto.hkdfSync is not available in earlier versions.'
  );
}

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MAGIC = Buffer.from('OENC');
const FORMAT_VERSION = 0x02;
const HEADER_SIZE = 52;
const SALT_SIZE = 16;
const NONCE_SIZE = 12;
const TAG_SIZE = 16;
const KEY_SIZE = 32;
const ALGORITHM = 'aes-256-gcm';
const DEFAULT_REQUIRED_TIER = 'tier3';
const HKDF_INFO_PREFIX = 'opspal-enc:v2';
const AAD_PREFIX = 'opspal-enc:v2';

const KEYRING_ENV_VAR = 'OPSPAL_PLUGIN_KEYRING_JSON';
const KEY_DIR = path.join(os.homedir(), '.claude', 'opspal-enc');
const TIER_KEY_FILES = {
  tier1: path.join(KEY_DIR, 'tier1.key'),
  tier2: path.join(KEY_DIR, 'tier2.key'),
  tier3: path.join(KEY_DIR, 'tier3.key')
};

const KEY_SLOT_BY_TIER = {
  tier1: 1,
  tier2: 2,
  tier3: 3
};

const TIER_BY_KEY_SLOT = {
  1: 'tier1',
  2: 'tier2',
  3: 'tier3'
};

function generateKey() {
  return crypto.randomBytes(KEY_SIZE).toString('base64');
}

function generateTierKeyring() {
  return {
    tier1: generateKey(),
    tier2: generateKey(),
    tier3: generateKey()
  };
}

function writeTierKeyFiles(keyring) {
  fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });

  for (const [tier, filePath] of Object.entries(TIER_KEY_FILES)) {
    if (!keyring[tier]) continue;
    fs.writeFileSync(filePath, keyring[tier] + '\n', { mode: 0o600 });
  }
}

function resolveKeyring() {
  const envKeyring = parseKeyringJson(process.env[KEYRING_ENV_VAR]);
  if (envKeyring) {
    return envKeyring;
  }

  const keyring = {};
  for (const [tier, filePath] of Object.entries(TIER_KEY_FILES)) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const decoded = decodeBase64Key(fs.readFileSync(filePath, 'utf8').trim());
      if (decoded) {
        keyring[tier] = decoded;
      }
    } catch {
      // Ignore malformed key files and continue scanning others.
    }
  }

  return Object.keys(keyring).length > 0 ? keyring : null;
}

function resolveKeyMaterial(_pluginName) {
  const keyring = resolveKeyring();
  if (!keyring) {
    return null;
  }
  return { keyring };
}

function normalizeKeyMaterial(keyMaterial) {
  if (!keyMaterial) return null;

  if (keyMaterial.keyring) {
    return { keyring: normalizeKeyringBuffers(keyMaterial.keyring) };
  }

  if (keyMaterial.tier1 || keyMaterial.tier2 || keyMaterial.tier3) {
    return { keyring: normalizeKeyringBuffers(keyMaterial) };
  }

  return null;
}

function normalizeKeyringBuffers(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;

  const keyring = {};
  for (const tier of Object.keys(KEY_SLOT_BY_TIER)) {
    const value = candidate[tier];
    if (!value) continue;

    const decoded = Buffer.isBuffer(value) ? value : decodeBase64Key(value);
    if (decoded) {
      keyring[tier] = decoded;
    }
  }

  return Object.keys(keyring).length > 0 ? keyring : null;
}

function decodeBase64Key(value) {
  if (!value || typeof value !== 'string') return null;
  const buf = Buffer.from(value, 'base64');
  return buf.length === KEY_SIZE ? buf : null;
}

function parseKeyringJson(value) {
  if (!value || typeof value !== 'string') return null;

  try {
    const parsed = JSON.parse(value);
    if (parsed && parsed.version === FORMAT_VERSION && parsed.keys) {
      return normalizeKeyringBuffers(parsed.keys);
    }
    return normalizeKeyringBuffers(parsed);
  } catch {
    return null;
  }
}

function deriveKey(baseKey, pluginName, salt, formatVersion = FORMAT_VERSION) {
  if (formatVersion !== FORMAT_VERSION) {
    throw new Error(`Unsupported .enc version: ${formatVersion}`);
  }

  const info = Buffer.from(`${HKDF_INFO_PREFIX}:${pluginName}`);
  return crypto.hkdfSync('sha256', baseKey, salt, info, KEY_SIZE);
}

function buildAAD(pluginName, assetPath, formatVersion = FORMAT_VERSION) {
  if (formatVersion !== FORMAT_VERSION) {
    throw new Error(`Unsupported .enc version: ${formatVersion}`);
  }

  return Buffer.from(`${AAD_PREFIX}:${pluginName}:${assetPath}`);
}

function assembleWireFormat({ version = FORMAT_VERSION, keySlot, salt, nonce, tag, ciphertext }) {
  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported .enc version: ${version}`);
  }
  if (!TIER_BY_KEY_SLOT[keySlot]) {
    throw new Error(`Invalid key slot for .enc v2: ${keySlot}`);
  }

  const header = Buffer.alloc(HEADER_SIZE);
  let offset = 0;

  MAGIC.copy(header, offset);
  offset += 4;

  header.writeUInt8(version, offset);
  offset += 1;

  header.writeUInt8(keySlot, offset);
  offset += 3;

  salt.copy(header, offset);
  offset += SALT_SIZE;

  nonce.copy(header, offset);
  offset += NONCE_SIZE;

  tag.copy(header, offset);

  return Buffer.concat([header, ciphertext]);
}

function parseWireFormat(encBuffer) {
  if (!Buffer.isBuffer(encBuffer) || encBuffer.length < HEADER_SIZE) {
    throw new Error(`Invalid .enc file: too short (${encBuffer ? encBuffer.length : 0} bytes, need ${HEADER_SIZE})`);
  }

  const magic = encBuffer.subarray(0, 4);
  if (!magic.equals(MAGIC)) {
    throw new Error(`Invalid .enc file: bad magic bytes (got ${magic.toString('hex')}, expected ${MAGIC.toString('hex')})`);
  }

  const version = encBuffer.readUInt8(4);
  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported .enc version: ${version}`);
  }

  const keySlot = encBuffer.readUInt8(5);
  if (!TIER_BY_KEY_SLOT[keySlot]) {
    throw new Error(`Invalid key slot for .enc v2: ${keySlot}`);
  }

  let offset = 8;
  const salt = encBuffer.subarray(offset, offset + SALT_SIZE);
  offset += SALT_SIZE;

  const nonce = encBuffer.subarray(offset, offset + NONCE_SIZE);
  offset += NONCE_SIZE;

  const tag = encBuffer.subarray(offset, offset + TAG_SIZE);
  offset += TAG_SIZE;

  const ciphertext = encBuffer.subarray(offset);

  return {
    version,
    keySlot,
    requiredTier: TIER_BY_KEY_SLOT[keySlot],
    salt,
    nonce,
    tag,
    ciphertext
  };
}

function encryptAsset(plaintext, pluginName, assetPath, keyMaterial, options = {}) {
  const plaintextBuf = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext);
  const resolvedKey = selectEncryptionKey(keyMaterial, options.requiredTier);

  if (!resolvedKey) {
    throw new Error('No suitable encryption key available');
  }

  const salt = crypto.randomBytes(SALT_SIZE);
  const nonce = crypto.randomBytes(NONCE_SIZE);
  const derivedKey = deriveKey(resolvedKey.key, pluginName, salt, resolvedKey.formatVersion);
  const aad = buildAAD(pluginName, assetPath, resolvedKey.formatVersion);

  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, nonce, { authTagLength: TAG_SIZE });
  cipher.setAAD(aad);

  const ciphertext = Buffer.concat([cipher.update(plaintextBuf), cipher.final()]);
  const tag = cipher.getAuthTag();

  return assembleWireFormat({
    version: resolvedKey.formatVersion,
    keySlot: resolvedKey.keySlot,
    salt,
    nonce,
    tag,
    ciphertext
  });
}

function decryptAsset(encBuffer, pluginName, assetPath, keyMaterial) {
  const parsed = parseWireFormat(encBuffer);
  const decryptionKey = selectDecryptionKey(keyMaterial, parsed);
  const derivedKey = deriveKey(decryptionKey, pluginName, parsed.salt, parsed.version);
  const aad = buildAAD(pluginName, assetPath, parsed.version);

  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, parsed.nonce, { authTagLength: TAG_SIZE });
  decipher.setAuthTag(parsed.tag);
  decipher.setAAD(aad);

  return Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]);
}

function verifyAsset(encBuffer, pluginName, assetPath, keyMaterial, expectedChecksum) {
  try {
    const plaintext = decryptAsset(encBuffer, pluginName, assetPath, keyMaterial);

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

function selectEncryptionKey(keyMaterial, requiredTier = DEFAULT_REQUIRED_TIER) {
  const normalized = normalizeKeyMaterial(keyMaterial);
  if (!normalized || !normalized.keyring) return null;

  const tier = normalizeTier(requiredTier || DEFAULT_REQUIRED_TIER);
  if (!normalized.keyring[tier]) {
    return null;
  }

  return {
    key: normalized.keyring[tier],
    formatVersion: FORMAT_VERSION,
    keySlot: KEY_SLOT_BY_TIER[tier],
    requiredTier: tier
  };
}

function selectDecryptionKey(keyMaterial, parsed) {
  const normalized = normalizeKeyMaterial(keyMaterial);
  if (!normalized || !normalized.keyring) {
    throw new Error('No decryption key material available');
  }

  const tierKey = normalized.keyring[parsed.requiredTier];
  if (!tierKey) {
    throw new Error(`No scoped key available for ${parsed.requiredTier}`);
  }

  return tierKey;
}

function normalizeTier(tier) {
  if (!KEY_SLOT_BY_TIER[tier]) {
    throw new Error(`Unsupported required tier: ${tier}`);
  }
  return tier;
}

function computeChecksum(content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  return `sha256:${hash}`;
}

function encryptFile(inputPath, outputPath, pluginName, assetPath, keyMaterial, options = {}) {
  const plaintext = fs.readFileSync(inputPath);
  const checksum = computeChecksum(plaintext);
  const encBlob = encryptAsset(plaintext, pluginName, assetPath, keyMaterial, options);
  const parsed = parseWireFormat(encBlob);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, encBlob);

  return {
    checksum,
    size: plaintext.length,
    encryptedSize: encBlob.length,
    formatVersion: parsed.version
  };
}

function decryptFile(encPath, outputPath, pluginName, assetPath, keyMaterial, options = {}) {
  const { expectedChecksum, fileMode = 0o600 } = options;
  const encBlob = fs.readFileSync(encPath);
  const plaintext = decryptAsset(encBlob, pluginName, assetPath, keyMaterial);

  let checksumValid = null;
  if (expectedChecksum) {
    const actual = computeChecksum(plaintext);
    checksumValid = actual === expectedChecksum;
    if (!checksumValid) {
      throw new Error(`Post-decryption checksum mismatch for ${assetPath}`);
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(outputPath, plaintext, { mode: fileMode });

  return { size: plaintext.length, checksumValid };
}

function verifyFile(encPath, pluginName, assetPath, keyMaterial, expectedChecksum) {
  try {
    const encBlob = fs.readFileSync(encPath);
    return verifyAsset(encBlob, pluginName, assetPath, keyMaterial, expectedChecksum);
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

function loadManifest(pluginDir) {
  const manifestPath = path.join(pluginDir, '.claude-plugin', 'encryption.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

function writeManifest(pluginDir, manifest) {
  const manifestDir = path.join(pluginDir, '.claude-plugin');
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(
    path.join(manifestDir, 'encryption.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
}

module.exports = {
  MAGIC,
  FORMAT_VERSION,
  HEADER_SIZE,
  KEY_SIZE,
  KEY_DIR,
  KEYRING_ENV_VAR,
  TIER_KEY_FILES,
  KEY_SLOT_BY_TIER,
  TIER_BY_KEY_SLOT,
  DEFAULT_REQUIRED_TIER,
  generateKey,
  generateTierKeyring,
  writeTierKeyFiles,
  resolveKeyring,
  resolveKeyMaterial,
  deriveKey,
  encryptAsset,
  decryptAsset,
  verifyAsset,
  computeChecksum,
  selectEncryptionKey,
  assembleWireFormat,
  parseWireFormat,
  encryptFile,
  decryptFile,
  verifyFile,
  loadManifest,
  writeManifest
};

if (require.main === module && process.argv.includes('--self-test')) {
  console.log('Running self-test...');

  const keyring = normalizeKeyMaterial(generateTierKeyring());
  const plugin = 'test-plugin';
  const assetPath = 'scripts/lib/secret.js';
  const plaintext = Buffer.from('console.log("proprietary logic");');

  const scopedEnc = encryptAsset(plaintext, plugin, assetPath, keyring, { requiredTier: 'tier2' });
  const scopedDec = decryptAsset(scopedEnc, plugin, assetPath, keyring);
  console.assert(scopedDec.equals(plaintext), 'Scoped round-trip failed');

  const checksum = computeChecksum(plaintext);
  const verifyResult = verifyAsset(scopedEnc, plugin, assetPath, keyring, checksum);
  console.assert(verifyResult.valid, `Verify failed: ${verifyResult.error}`);

  const tampered = Buffer.from(scopedEnc);
  tampered[HEADER_SIZE + 5] ^= 0xFF;
  const tamperResult = verifyAsset(tampered, plugin, assetPath, keyring);
  console.assert(!tamperResult.valid, 'Tamper detection failed');

  const wrongPluginResult = verifyAsset(scopedEnc, 'wrong-plugin', assetPath, keyring);
  console.assert(!wrongPluginResult.valid, 'AAD binding failed');

  console.log('All self-tests passed.');
  process.exit(0);
}
