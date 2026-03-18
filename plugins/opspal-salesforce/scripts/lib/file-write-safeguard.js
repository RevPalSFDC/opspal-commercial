#!/usr/bin/env node

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const WINDOWS_MOUNT_PATH_PATTERN = /^\/mnt\/[a-z]\//i;
const EXCEL_ARTIFACT_PATTERN = /\.(csv|xlsx?)$/i;
const LOCK_ERROR_PATTERN = /(permission denied|resource busy|being used by another process|file is locked|operation not permitted)/i;

function normalizeForPlatform(filePath) {
  return path.resolve(String(filePath || '')).replace(/\\/g, '/');
}

function isMountedWindowsPath(filePath) {
  return WINDOWS_MOUNT_PATH_PATTERN.test(normalizeForPlatform(filePath));
}

function isExcelArtifact(filePath) {
  return EXCEL_ARTIFACT_PATTERN.test(String(filePath || ''));
}

function isLikelyLockedWrite(error, filePath) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error || '');

  return (
    isExcelArtifact(filePath) &&
    (
      code === 'EBUSY' ||
      code === 'EACCES' ||
      code === 'EPERM' ||
      LOCK_ERROR_PATTERN.test(message)
    )
  );
}

function assessWritePath(filePath) {
  const normalizedPath = normalizeForPlatform(filePath);
  const mountedWindowsPath = isMountedWindowsPath(filePath);

  return {
    normalizedPath,
    mountedWindowsPath,
    excelLockRisk: mountedWindowsPath && isExcelArtifact(filePath)
  };
}

function buildFallbackPath(filePath, options = {}) {
  const ext = path.extname(filePath) || '.tmp';
  const baseName = path.basename(filePath, ext);
  const label = String(options.label || 'artifact').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  return path.join(
    os.tmpdir(),
    'revpal-write-fallbacks',
    label,
    `${baseName}-${timestamp}${ext}`
  );
}

function writeFile(filePath, content, options = {}) {
  const dirPath = path.dirname(filePath);
  fs.mkdirSync(dirPath, { recursive: true });

  if (options.encoding) {
    fs.writeFileSync(filePath, content, options.encoding);
  } else {
    fs.writeFileSync(filePath, content);
  }

  const stats = fs.statSync(filePath);
  if (stats.size === 0 && String(content || '').length > 0) {
    throw new Error(`Write verification failed for ${filePath}: file is empty after write`);
  }
}

function writeFileWithFallback(filePath, content, options = {}) {
  const assessment = assessWritePath(filePath);

  try {
    writeFile(filePath, content, options);
    return {
      originalPath: filePath,
      finalPath: filePath,
      usedFallback: false,
      assessment,
      warning: null
    };
  } catch (error) {
    if (options.allowFallback === false || (!assessment.excelLockRisk && !isLikelyLockedWrite(error, filePath))) {
      throw error;
    }

    const fallbackPath = buildFallbackPath(filePath, options);
    writeFile(fallbackPath, content, options);

    return {
      originalPath: filePath,
      finalPath: fallbackPath,
      usedFallback: true,
      assessment,
      warning: `Direct write to ${filePath} failed (${error.code || error.message}). Wrote fallback artifact to ${fallbackPath}. Close Excel or move the file off /mnt/c before retrying.`,
      error: {
        code: error.code || null,
        message: error.message || String(error)
      }
    };
  }
}

module.exports = {
  assessWritePath,
  buildFallbackPath,
  isExcelArtifact,
  isLikelyLockedWrite,
  isMountedWindowsPath,
  writeFileWithFallback
};
