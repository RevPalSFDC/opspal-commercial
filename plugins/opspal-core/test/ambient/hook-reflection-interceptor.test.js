'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { ReflectionCandidateBuffer } = require('../../scripts/lib/ambient/reflection-candidate-buffer');
const { interceptHookErrors } = require('../../scripts/lib/ambient/hook-reflection-interceptor');
const { readJsonl } = require('../../scripts/lib/ambient/utils');

function createConfig(ambientDir, mode = 'shadow_mode') {
  return {
    mode,
    buffer: {
      maxCandidates: 200,
      maxAgeMinutes: 120,
      flushIntervalSeconds: 60
    },
    compiler: {
      minScoreToKeep: 0.3,
      dedupeWindowMinutes: 10,
      maxIssuesPerReflection: 25
    },
    hookObserver: {
      captureTimeouts: true,
      captureNonZeroExits: true
    },
    hookReflection: {
      enabled: true,
      immediateFlushOnError: true,
      severityDefault: 'high',
      captureStackTrace: false,
      crashSafeFile: 'hook-reflection-crash-safe.jsonl',
      maxCrashSafeEntries: 100,
      dedupeWindowSeconds: 300,
      crossSessionWindowSeconds: 86400
    },
    sanitization: {
      maxFieldLength: 200
    },
    paths: {
      ambientDir,
      retryQueueFile: path.join(ambientDir, 'ambient-retry-queue.jsonl'),
      skillSignalsFile: path.join(ambientDir, 'skill-signals.jsonl'),
      hookErrorWatermark: path.join(ambientDir, '.hook-error-watermark')
    }
  };
}

describe('hook reflection interceptor', () => {
  test('dedupes repeated hook errors in-session and escalates them to immediate in manual-only mode', () => {
    const ambientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ambient-hook-interceptor-manual-'));
    const config = createConfig(ambientDir, 'manual_only');
    const logFile = path.join(ambientDir, 'hook-errors.jsonl');

    const entries = Array.from({ length: 5 }, () => ({
      timestamp: new Date().toISOString(),
      hook: 'validator',
      hook_phase: 'PostToolUse',
      level: 'error',
      message: 'Validation failed',
      context: 'contract validation',
      details: 'exit_code=7',
      exit_code: 7,
      retry_count: 2
    }));
    fs.writeFileSync(logFile, `${entries.map(entry => JSON.stringify(entry)).join('\n')}\n`);

    const result = interceptHookErrors({
      config,
      sessionId: 'manual-interceptor-session',
      logFile,
      watermarkFile: path.join(ambientDir, '.hook-error-watermark')
    });

    const buffer = new ReflectionCandidateBuffer({ config, sessionId: 'manual-interceptor-session' });
    const candidates = buffer.list();

    expect(result.flushed).toBe(false);
    expect(result.reason).toBe('buffered');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].repeat_count).toBe(5);
    expect(candidates[0].priority).toBe('immediate');
  });

  test('flushes immediate hook errors through the shadow path', () => {
    const ambientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ambient-hook-interceptor-shadow-'));
    const config = createConfig(ambientDir, 'shadow_mode');
    const logFile = path.join(ambientDir, 'hook-errors.jsonl');

    fs.writeFileSync(logFile, `${JSON.stringify({
      timestamp: new Date().toISOString(),
      hook: 'router',
      hook_phase: 'Stop',
      level: 'error',
      message: 'Circuit breaker OPEN',
      context: 'service unavailable',
      details: 'exit_code=2',
      exit_code: 2
    })}\n`);

    const result = interceptHookErrors({
      config,
      sessionId: 'shadow-interceptor-session',
      logFile,
      watermarkFile: path.join(ambientDir, '.hook-error-watermark')
    });

    const shadowFile = path.join(ambientDir, 'shadow-shadow-interceptor-session.jsonl');
    const signals = readJsonl(path.join(ambientDir, 'skill-signals.jsonl'));

    expect(result.flushed).toBe(true);
    expect(result.reason).toBe('hook_error_immediate');
    expect(fs.existsSync(shadowFile)).toBe(true);
    expect(signals.some(entry => entry.entry_type === 'hook_error')).toBe(true);
  });

  test('writes crash-safe entries when buffer persistence fails', () => {
    const ambientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ambient-hook-interceptor-crashsafe-'));
    const config = createConfig(ambientDir, 'manual_only');
    const logFile = path.join(ambientDir, 'hook-errors.jsonl');

    fs.writeFileSync(logFile, `${JSON.stringify({
      timestamp: new Date().toISOString(),
      hook: 'validator',
      hook_phase: 'PostToolUse',
      level: 'error',
      message: 'Malformed output',
      context: 'contract failure',
      details: 'exit_code=4',
      exit_code: 4
    })}\n`);

    const originalFlush = ReflectionCandidateBuffer.prototype.flush;
    ReflectionCandidateBuffer.prototype.flush = function flushFailure() {
      throw new Error('flush failed');
    };

    try {
      const result = interceptHookErrors({
        config,
        sessionId: 'crashsafe-session',
        logFile,
        watermarkFile: path.join(ambientDir, '.hook-error-watermark')
      });

      const crashSafeEntries = readJsonl(path.join(ambientDir, 'hook-reflection-crash-safe.jsonl'));

      expect(result.flushed).toBe(false);
      expect(result.reason).toBe('buffer_write_failed');
      expect(crashSafeEntries).toHaveLength(1);
      expect(crashSafeEntries[0].candidate.source).toBe('hook_error');
    } finally {
      ReflectionCandidateBuffer.prototype.flush = originalFlush;
    }
  });
});
