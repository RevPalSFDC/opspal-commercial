#!/usr/bin/env node

/**
 * Platform Utils Module Tests
 *
 * Tests for cross-platform detection and utility functions.
 * Verifies WSL detection, temp directory handling, path normalization,
 * and browser-open command selection.
 *
 * Usage: node test/platform-utils.test.js
 */

'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');
const platformUtils = require('../scripts/lib/platform-utils');

let passed = 0;
let failed = 0;

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function it(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

// ========== Platform Detection ==========

describe('Platform Detection', () => {
  it('should export all expected functions', () => {
    const expectedFunctions = [
      'isWSL', 'isMacOS', 'isLinux', 'isWindows',
      'getPlatform', 'getTempDir', 'getHomeDir', 'getClaudeDir',
      'normalizePath', 'tempFilePath', 'tempDirPath',
      'getShell', 'openBrowser', 'getBrowserCommand', 'getPlatformInfo'
    ];

    for (const fn of expectedFunctions) {
      assert.strictEqual(typeof platformUtils[fn], 'function', `Missing export: ${fn}`);
    }
  });

  it('getPlatform() should return a valid platform string', () => {
    const platform = platformUtils.getPlatform();
    assert.ok(
      ['linux', 'macos', 'windows', 'wsl'].includes(platform),
      `Unexpected platform: ${platform}`
    );
  });

  it('getPlatformInfo() should return complete info object', () => {
    const info = platformUtils.getPlatformInfo();
    assert.ok(info, 'getPlatformInfo() returned falsy');
    assert.strictEqual(typeof info.platform, 'string');
    assert.strictEqual(typeof info.release, 'string');
    assert.strictEqual(typeof info.isWSL, 'boolean');
    assert.strictEqual(typeof info.tmpdir, 'string');
    assert.strictEqual(typeof info.homedir, 'string');
    assert.strictEqual(typeof info.shell, 'string');
  });

  it('detection functions should return booleans', () => {
    assert.strictEqual(typeof platformUtils.isWSL(), 'boolean');
    assert.strictEqual(typeof platformUtils.isMacOS(), 'boolean');
    assert.strictEqual(typeof platformUtils.isLinux(), 'boolean');
    assert.strictEqual(typeof platformUtils.isWindows(), 'boolean');
  });

  it('exactly one platform should be detected (mutually exclusive)', () => {
    const platforms = [
      platformUtils.isMacOS(),
      platformUtils.isLinux() && !platformUtils.isWSL(),
      platformUtils.isWSL(),
      platformUtils.isWindows()
    ];
    const trueCount = platforms.filter(Boolean).length;
    assert.strictEqual(trueCount, 1, `Expected exactly 1 true platform, got ${trueCount}`);
  });

  it('detection results should be cached (same on repeat calls)', () => {
    const p1 = platformUtils.getPlatform();
    const p2 = platformUtils.getPlatform();
    assert.strictEqual(p1, p2, 'Platform detection not cached');
  });
});

// ========== Temp Directory ==========

describe('Temp Directory', () => {
  it('getTempDir() should return os.tmpdir()', () => {
    assert.strictEqual(platformUtils.getTempDir(), os.tmpdir());
  });

  it('tempFilePath() should create path under temp dir', () => {
    const result = platformUtils.tempFilePath('test-file.json');
    assert.ok(result.startsWith(os.tmpdir()), `Expected path under ${os.tmpdir()}, got ${result}`);
    assert.ok(result.includes('test-file.json'), `Expected 'test-file.json' in path, got ${result}`);
  });

  it('tempFilePath() with subdirectory', () => {
    const result = platformUtils.tempFilePath('output.json', 'my-subdir');
    assert.ok(result.includes('my-subdir') || result.includes('output.json'),
      `Expected subdir or filename in path, got ${result}`);
  });

  it('tempDirPath() should create path under temp dir', () => {
    const result = platformUtils.tempDirPath('my-cache');
    assert.ok(result.startsWith(os.tmpdir()));
    assert.ok(result.includes('my-cache'), `Expected 'my-cache' in path, got ${result}`);
  });
});

// ========== Home Directory ==========

describe('Home Directory', () => {
  it('getHomeDir() should return os.homedir()', () => {
    assert.strictEqual(platformUtils.getHomeDir(), os.homedir());
  });

  it('getClaudeDir() should be under home directory', () => {
    const claudeDir = platformUtils.getClaudeDir();
    assert.ok(claudeDir.startsWith(os.homedir()));
    assert.ok(claudeDir.includes('.claude'));
  });
});

// ========== Path Normalization ==========

describe('Path Normalization', () => {
  it('should normalize backslashes to forward slashes', () => {
    const result = platformUtils.normalizePath('C:\\Users\\test\\file.txt');
    assert.ok(!result.includes('\\'), `Backslashes remain: ${result}`);
  });

  it('should expand tilde to home directory', () => {
    const result = platformUtils.normalizePath('~/Documents/file.txt');
    assert.ok(result.startsWith(os.homedir()), `Expected homedir prefix, got ${result}`);
    assert.ok(result.includes('Documents'));
  });

  it('should pass through normal paths unchanged', () => {
    const normalPath = '/usr/local/bin/node';
    const result = platformUtils.normalizePath(normalPath);
    assert.strictEqual(result, normalPath);
  });

  it('should handle empty string', () => {
    const result = platformUtils.normalizePath('');
    assert.strictEqual(result, '');
  });
});

// ========== Shell Detection ==========

describe('Shell Detection', () => {
  it('getShell() should return a shell path', () => {
    const shell = platformUtils.getShell();
    assert.ok(shell, 'getShell() returned empty');
    assert.ok(
      shell.includes('bash') || shell.includes('zsh') || shell.includes('sh') || shell.includes('cmd'),
      `Unexpected shell: ${shell}`
    );
  });
});

// ========== Browser Command ==========

describe('Browser Command', () => {
  it('getBrowserCommand() should return a command string', () => {
    const cmd = platformUtils.getBrowserCommand();
    assert.ok(cmd, 'getBrowserCommand() returned empty');
    assert.ok(typeof cmd === 'string');
  });

  it('getBrowserCommand() should return appropriate command for platform', () => {
    const cmd = platformUtils.getBrowserCommand();
    if (platformUtils.isWSL()) {
      assert.ok(cmd.includes('wslview') || cmd.includes('sensible-browser') || cmd.includes('xdg-open'));
    } else if (platformUtils.isMacOS()) {
      assert.strictEqual(cmd, 'open');
    } else if (platformUtils.isLinux()) {
      assert.strictEqual(cmd, 'xdg-open');
    }
  });
});

// ========== Integration ==========

describe('Integration: No Hardcoded /tmp/', () => {
  it('tempFilePath uses os.tmpdir(), not /tmp/', () => {
    const tmpdir = os.tmpdir();
    const result = platformUtils.tempFilePath('test.json');
    assert.ok(result.startsWith(tmpdir), `Expected ${tmpdir} prefix, got ${result}`);
  });
});

// ========== Results ==========

console.log(`\n${'='.repeat(40)}`);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
