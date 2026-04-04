#!/usr/bin/env node

/**
 * Platform Utilities - Cross-Platform Detection & Helpers
 *
 * Central module for platform detection (Linux, macOS, WSL2, Windows).
 * All plugins should import from here instead of doing inline detection.
 *
 * Problem Solved (Reflection Cohort: config/env):
 *   - Hardcoded /tmp/ paths fail on non-Linux systems
 *   - xdg-open doesn't work on WSL2 (needs wslview)
 *   - Duplicate WSL detection logic scattered across codebase
 *   - Path separator issues between platforms
 *
 * Usage:
 *   const platform = require('./platform-utils');
 *   const tmpDir = platform.getTempDir();
 *   platform.openBrowser('http://localhost:3000');
 *
 * @module platform-utils
 * @version 1.0.0
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// =============================================================================
// Cached Detection Results (platform doesn't change mid-session)
// =============================================================================

let _cachedPlatform = null;
let _cachedWSL = null;
let _cachedGitBash = null;
let _cachedUbuntuVersion = null;

// =============================================================================
// Platform Detection
// =============================================================================

/**
 * Detect if running under WSL (Windows Subsystem for Linux)
 * Uses /proc/version check - proven reliable in existing codebase.
 * @returns {boolean}
 */
function isWSL() {
  if (_cachedWSL !== null) return _cachedWSL;

  _cachedWSL = false;
  if (os.platform() === 'linux') {
    try {
      const procVersion = fs.readFileSync('/proc/version', 'utf-8');
      _cachedWSL = procVersion.toLowerCase().includes('microsoft') ||
                   procVersion.toLowerCase().includes('wsl');
    } catch (e) {
      // Not WSL or can't read /proc/version
    }
  }
  return _cachedWSL;
}

/**
 * @returns {boolean}
 */
function isMacOS() {
  return os.platform() === 'darwin';
}

/**
 * @returns {boolean}
 */
function isLinux() {
  return os.platform() === 'linux' && !isWSL();
}

/**
 * Detect if running in Git Bash / MINGW / MSYS2 / Cygwin on Windows.
 * This is the typical shell for Claude Code Desktop on Windows.
 * Node.js in Git Bash reports process.platform as 'linux' (via MSYS2),
 * so we check OSTYPE and MSYSTEM env vars instead.
 * @returns {boolean}
 */
function isGitBash() {
  if (_cachedGitBash !== null) return _cachedGitBash;

  const ostype = (process.env.OSTYPE || '').toLowerCase();
  const msystem = (process.env.MSYSTEM || '').toUpperCase();

  _cachedGitBash = ostype.startsWith('msys') ||
                   ostype.startsWith('cygwin') ||
                   msystem.startsWith('MINGW') ||
                   msystem.startsWith('MSYS');
  return _cachedGitBash;
}

/**
 * Check if running in a Desktop GUI context (Git Bash on Windows).
 * Alias for isGitBash.
 * @returns {boolean}
 */
function isDesktopMode() {
  return isGitBash();
}

/**
 * @returns {boolean}
 */
function isWindows() {
  return os.platform() === 'win32';
}

/**
 * Get a descriptive platform string.
 * @returns {'wsl'|'macos'|'linux'|'windows'}
 */
function getPlatform() {
  if (_cachedPlatform) return _cachedPlatform;

  if (isGitBash()) _cachedPlatform = 'git-bash';
  else if (isWSL()) _cachedPlatform = 'wsl';
  else if (isMacOS()) _cachedPlatform = 'macos';
  else if (isWindows()) _cachedPlatform = 'windows';
  else _cachedPlatform = 'linux';

  return _cachedPlatform;
}

/**
 * Get Ubuntu version if running on Ubuntu/WSL.
 * @returns {string|null}
 */
function getUbuntuVersion() {
  if (_cachedUbuntuVersion !== undefined && _cachedUbuntuVersion !== null) {
    return _cachedUbuntuVersion;
  }

  _cachedUbuntuVersion = null;
  if (os.platform() === 'linux') {
    try {
      _cachedUbuntuVersion = execSync('lsb_release -rs 2>/dev/null', { encoding: 'utf-8' }).trim();
    } catch (e) {
      // Not Ubuntu or lsb_release not available
    }
  }
  return _cachedUbuntuVersion;
}

// =============================================================================
// Path Utilities
// =============================================================================

/**
 * Get the platform-appropriate temp directory.
 * Uses os.tmpdir() which respects TMPDIR, TMP, TEMP env vars.
 * @returns {string}
 */
function getTempDir() {
  return os.tmpdir();
}

/**
 * Get the user's home directory. Never relies on ~ expansion or $HOME.
 * @returns {string}
 */
function getHomeDir() {
  return os.homedir();
}

/**
 * Get the Claude config directory path.
 * @returns {string}
 */
function getClaudeDir() {
  return path.join(os.homedir(), '.claude');
}

/**
 * Normalize a file path for the current platform.
 * - Converts Windows backslashes to forward slashes
 * - Resolves ~ to actual home directory
 * - Does NOT translate WSL /mnt/c/ paths (those are valid on WSL)
 * @param {string} p - Path to normalize
 * @returns {string}
 */
function normalizePath(p) {
  if (!p) return p;

  // Resolve ~ to home directory
  if (p.startsWith('~/') || p === '~') {
    p = path.join(os.homedir(), p.slice(1));
  }

  // Convert Windows backslashes
  if (p.includes('\\')) {
    p = p.replace(/\\/g, '/');
  }

  return path.normalize(p);
}

/**
 * Create a temp file path with the given prefix and extension.
 * @param {string} prefix - Filename prefix
 * @param {string} [ext=''] - File extension (e.g. '.json')
 * @returns {string}
 */
function tempFilePath(prefix, ext = '') {
  return path.join(os.tmpdir(), `${prefix}-${Date.now()}${ext}`);
}

/**
 * Create a temp directory path with the given prefix.
 * Does NOT create the directory - use fs.mkdirSync to create.
 * @param {string} prefix - Directory name prefix
 * @returns {string}
 */
function tempDirPath(prefix) {
  return path.join(os.tmpdir(), `${prefix}-${Date.now()}`);
}

// =============================================================================
// Shell & Browser Utilities
// =============================================================================

/**
 * Get the platform-appropriate default shell.
 * @returns {string}
 */
function getShell() {
  if (isWindows()) {
    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

/**
 * Open a URL or file path in the user's default browser.
 * WSL-aware: uses wslview when available, falls back to sensible-browser.
 * @param {string} url - URL or file path to open
 * @returns {boolean} true if opened successfully
 */
function openBrowser(url) {
  const escapedUrl = url.replace(/"/g, '\\"');

  try {
    if (isMacOS()) {
      execSync(`open "${escapedUrl}"`, { stdio: 'ignore' });
    } else if (isWindows()) {
      execSync(`start "" "${escapedUrl}"`, { stdio: 'ignore' });
    } else if (isWSL()) {
      // WSL: prefer wslview (from wslu package), fall back to sensible-browser
      execSync(
        `wslview "${escapedUrl}" 2>/dev/null || sensible-browser "${escapedUrl}" 2>/dev/null || xdg-open "${escapedUrl}" 2>/dev/null`,
        { stdio: 'ignore' }
      );
    } else {
      // Linux: try xdg-open first, then alternatives
      execSync(
        `xdg-open "${escapedUrl}" 2>/dev/null || sensible-browser "${escapedUrl}" 2>/dev/null || x-www-browser "${escapedUrl}" 2>/dev/null`,
        { stdio: 'ignore' }
      );
    }
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get the browser-open command string for use in shell scripts.
 * Returns the raw command (without the URL argument).
 * @returns {string}
 */
function getBrowserCommand() {
  if (isMacOS()) return 'open';
  if (isWindows()) return 'start ""';
  if (isWSL()) return 'wslview';
  return 'xdg-open';
}

// =============================================================================
// Full Platform Info (for diagnostics / reports)
// =============================================================================

/**
 * Get comprehensive platform information.
 * Compatible with system-dependency-validator.js detectOS() output.
 * @returns {{platform: string, release: string, isWSL: boolean, ubuntuVersion: string|null, descriptive: string}}
 */
function getPlatformInfo() {
  return {
    platform: os.platform(),
    release: os.release(),
    isWSL: isWSL(),
    isGitBash: isGitBash(),
    ubuntuVersion: getUbuntuVersion(),
    descriptive: getPlatform(),
    arch: os.arch(),
    homedir: os.homedir(),
    tmpdir: os.tmpdir(),
    shell: getShell()
  };
}

// =============================================================================
// CLI Interface
// =============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0];

  switch (cmd) {
    case 'info':
    case undefined:
      console.log(JSON.stringify(getPlatformInfo(), null, 2));
      break;
    case 'platform':
      console.log(getPlatform());
      break;
    case 'tmpdir':
      console.log(getTempDir());
      break;
    case 'homedir':
      console.log(getHomeDir());
      break;
    case 'shell':
      console.log(getShell());
      break;
    case 'browser-cmd':
      console.log(getBrowserCommand());
      break;
    case 'is-wsl':
      console.log(isWSL() ? 'true' : 'false');
      process.exit(isWSL() ? 0 : 1);
      break;
    case 'is-git-bash':
      console.log(isGitBash() ? 'true' : 'false');
      process.exit(isGitBash() ? 0 : 1);
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      console.error('Usage: platform-utils.js [info|platform|tmpdir|homedir|shell|browser-cmd|is-wsl|is-git-bash]');
      process.exit(1);
  }
}

module.exports = {
  // Detection
  isWSL,
  isMacOS,
  isLinux,
  isWindows,
  isGitBash,
  isDesktopMode,
  getPlatform,
  getPlatformInfo,
  getUbuntuVersion,

  // Paths
  getTempDir,
  getHomeDir,
  getClaudeDir,
  normalizePath,
  tempFilePath,
  tempDirPath,

  // Shell & Browser
  getShell,
  openBrowser,
  getBrowserCommand
};
