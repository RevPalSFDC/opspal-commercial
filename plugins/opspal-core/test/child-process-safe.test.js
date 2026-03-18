#!/usr/bin/env node

/**
 * Child Process Safe Module Tests
 *
 * Tests for the safe child_process wrapper that provides
 * platform-aware defaults, timeout handling, and UTF-8 encoding.
 *
 * Usage: node test/child-process-safe.test.js
 */

'use strict';

const assert = require('assert');
const childProcessSafe = require('../scripts/lib/child-process-safe');

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

// ========== Module Exports ==========

describe('Module Exports', () => {
  it('should export execSafe function', () => {
    assert.strictEqual(typeof childProcessSafe.execSafe, 'function');
  });

  it('should export execShellSafe function', () => {
    assert.strictEqual(typeof childProcessSafe.execShellSafe, 'function');
  });

  it('should export spawnSafe as alias for execSafe', () => {
    assert.strictEqual(typeof childProcessSafe.spawnSafe, 'function');
  });
});

// ========== execShellSafe ==========

describe('execShellSafe', () => {
  it('should execute simple echo command', () => {
    const result = childProcessSafe.execShellSafe('echo hello');
    assert.ok(result.includes('hello'), `Expected 'hello' in output, got: ${result}`);
  });

  it('should return string output by default', () => {
    const result = childProcessSafe.execShellSafe('echo test');
    assert.strictEqual(typeof result, 'string');
  });

  it('should handle commands with pipes', () => {
    const result = childProcessSafe.execShellSafe('echo "hello world" | tr a-z A-Z');
    assert.ok(result.trim().includes('HELLO WORLD'), `Expected 'HELLO WORLD', got: ${result}`);
  });

  it('should throw on invalid command by default', () => {
    assert.throws(() => {
      childProcessSafe.execShellSafe('this-command-does-not-exist-12345');
    });
  });

  it('should respect throwOnError: false', () => {
    // Should not throw
    let threw = false;
    try {
      childProcessSafe.execShellSafe('this-command-does-not-exist-12345 2>/dev/null', {
        throwOnError: false
      });
    } catch (e) {
      threw = true;
    }
    assert.ok(!threw, 'Should not have thrown with throwOnError: false');
  });

  it('should handle UTF-8 output', () => {
    const result = childProcessSafe.execShellSafe('echo café');
    assert.ok(result.includes('café'), `Expected UTF-8 content, got: ${result}`);
  });
});

// ========== execSafe ==========

describe('execSafe', () => {
  it('should execute command with args array', () => {
    const result = childProcessSafe.execSafe('echo', ['hello', 'world']);
    assert.ok(result.stdout.includes('hello'), `Expected 'hello' in stdout, got: ${result.stdout}`);
    assert.strictEqual(result.status, 0);
  });

  it('should return structured result with stdout, stderr, status', () => {
    const result = childProcessSafe.execSafe('echo', ['test']);
    assert.ok('stdout' in result, 'Missing stdout');
    assert.ok('stderr' in result, 'Missing stderr');
    assert.ok('status' in result, 'Missing status');
  });

  it('should capture non-zero exit codes', () => {
    // Use shell: false so spawnSync doesn't wrap in another shell layer
    const result = childProcessSafe.execSafe('bash', ['-c', 'exit 42'], {
      throwOnError: false,
      shell: false
    });
    assert.strictEqual(result.status, 42);
  });

  it('should capture stderr', () => {
    // Use shell: false so spawnSync doesn't wrap in another shell layer
    const result = childProcessSafe.execSafe('bash', ['-c', 'echo error-msg >&2'], {
      throwOnError: false,
      shell: false
    });
    assert.ok(result.stderr.includes('error-msg'), `Expected 'error-msg' in stderr, got: ${result.stderr}`);
  });
});

// ========== Timeout Handling ==========

describe('Timeout Handling', () => {
  it('should timeout long-running commands', () => {
    let threw = false;
    try {
      childProcessSafe.execShellSafe('sleep 60', { timeout: 500 });
    } catch (e) {
      threw = true;
    }
    assert.ok(threw, 'Expected timeout error');
  });
});

// ========== Results ==========

console.log(`\n${'='.repeat(40)}`);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
