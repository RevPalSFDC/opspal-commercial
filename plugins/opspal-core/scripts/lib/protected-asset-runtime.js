'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME_DIR = process.env.HOME || os.homedir();
const RUNTIME_BASE_DIR = path.join(HOME_DIR, '.claude', 'opspal-enc', 'runtime');
const CURRENT_SESSION_POINTER = path.join(RUNTIME_BASE_DIR, '.current-session');

const manifestCache = new Map();

function normalizeRelativePath(relativePath) {
  return String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function getCurrentSessionDir() {
  if (typeof process.env.OPSPAL_ENC_SESSION_DIR === 'string' && process.env.OPSPAL_ENC_SESSION_DIR.trim()) {
    return process.env.OPSPAL_ENC_SESSION_DIR.trim();
  }

  try {
    if (fs.existsSync(CURRENT_SESSION_POINTER)) {
      return fs.readFileSync(CURRENT_SESSION_POINTER, 'utf8').trim();
    }
  } catch {
    return '';
  }

  return '';
}

function getPluginRuntimePath(pluginName, relativePath, sessionDir = getCurrentSessionDir()) {
  if (!sessionDir) {
    return '';
  }

  return path.join(sessionDir, pluginName, normalizeRelativePath(relativePath));
}

function loadEncryptionManifest(pluginRoot) {
  const resolvedPluginRoot = path.resolve(pluginRoot);
  if (manifestCache.has(resolvedPluginRoot)) {
    return manifestCache.get(resolvedPluginRoot);
  }

  const manifestPath = path.join(resolvedPluginRoot, '.claude-plugin', 'encryption.json');
  let manifest = null;

  try {
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    }
  } catch {
    manifest = null;
  }

  manifestCache.set(resolvedPluginRoot, manifest);
  return manifest;
}

function isProtectedAsset(pluginRoot, relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  const manifest = loadEncryptionManifest(pluginRoot);

  if (manifest && Array.isArray(manifest.encrypted_assets)) {
    return manifest.encrypted_assets.some((asset) => normalizeRelativePath(asset.path) === normalizedPath);
  }

  return fs.existsSync(path.join(pluginRoot, `${normalizedPath}.enc`));
}

function resolveProtectedAssetPath(options) {
  const pluginRoot = path.resolve(options.pluginRoot);
  const pluginName = options.pluginName;
  const relativePath = normalizeRelativePath(options.relativePath);
  const plaintextPath = path.join(pluginRoot, relativePath);
  const runtimePath = getPluginRuntimePath(pluginName, relativePath, options.sessionDir);
  const protectedAsset = isProtectedAsset(pluginRoot, relativePath);
  const allowPlaintextFallback = options.allowPlaintextFallback === true
    || process.env.OPSPAL_ENC_DEV_MODE === '1'
    || process.env.OPSPAL_ALLOW_PROTECTED_PLAINTEXT_FALLBACK === '1';

  if (runtimePath && fs.existsSync(runtimePath)) {
    return runtimePath;
  }

  if (!protectedAsset && fs.existsSync(plaintextPath)) {
    return plaintextPath;
  }

  if (protectedAsset && allowPlaintextFallback && fs.existsSync(plaintextPath)) {
    return plaintextPath;
  }

  return '';
}

function requireProtectedModule(options) {
  const resolvedPath = resolveProtectedAssetPath(options);
  if (!resolvedPath) {
    const relativePath = normalizeRelativePath(options.relativePath);
    throw new Error(`Protected asset is unavailable for this session: ${options.pluginName}/${relativePath}`);
  }

  return require(resolvedPath);
}

function prepareRuntimeOverlay(options) {
  const pluginDir = path.resolve(options.pluginDir);
  const pluginName = options.pluginName;
  const sessionDir = options.sessionDir;
  const manifest = options.manifest || loadEncryptionManifest(pluginDir) || {};

  if (!pluginName || !sessionDir) {
    throw new Error('prepareRuntimeOverlay requires pluginName and sessionDir');
  }

  const pluginOverlayDir = path.join(sessionDir, pluginName);
  const protectedPaths = new Set(
    (manifest.encrypted_assets || []).map((asset) => normalizeRelativePath(asset.path))
  );

  mirrorPlaintextFiles(pluginDir, pluginOverlayDir, protectedPaths);
  return pluginOverlayDir;
}

function mirrorPlaintextFiles(sourceDir, targetDir, protectedPaths, currentRelativeDir = '') {
  fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const relativePath = normalizeRelativePath(path.join(currentRelativeDir, entry.name));
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      mirrorPlaintextFiles(sourcePath, targetPath, protectedPaths, relativePath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (entry.name.endsWith('.enc')) {
      continue;
    }

    if (protectedPaths.has(relativePath)) {
      continue;
    }

    if (fs.existsSync(targetPath)) {
      continue;
    }

    fs.symlinkSync(sourcePath, targetPath);
  }
}

module.exports = {
  CURRENT_SESSION_POINTER,
  RUNTIME_BASE_DIR,
  getCurrentSessionDir,
  getPluginRuntimePath,
  isProtectedAsset,
  loadEncryptionManifest,
  normalizeRelativePath,
  prepareRuntimeOverlay,
  requireProtectedModule,
  resolveProtectedAssetPath
};
