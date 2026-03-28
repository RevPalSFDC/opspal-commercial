'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { classifyEntry, observeHookErrors } = require('../../scripts/lib/ambient/hook-error-observer');

function createConfig(ambientDir) {
  return {
    buffer: {
      maxCandidates: 200
    },
    hookObserver: {
      captureTimeouts: true,
      captureNonZeroExits: true
    },
    sanitization: {
      maxFieldLength: 200
    },
    paths: {
      ambientDir,
      hookErrorWatermark: path.join(ambientDir, '.hook-error-watermark')
    }
  };
}

describe('hook error observer', () => {
  test('classifies enriched hook errors with severity, confidence, and phase-aware dedupe', () => {
    const config = createConfig(fs.mkdtempSync(path.join(os.tmpdir(), 'ambient-hook-classify-')));

    const recoveryFailure = classifyEntry({
      hook: 'router',
      hook_phase: 'PostToolUse',
      message: 'Recovery failed after contract validation',
      context: 'contract guard',
      details: 'exit_code=7',
      exit_code: 7,
      retry_count: 3,
      recovery_succeeded: 'false',
      stack_trace: 'handle_error@error-handler.sh:120'
    }, 0, config);

    expect(recoveryFailure.priority).toBe('immediate');
    expect(recoveryFailure.raw.classification).toBe('recovery_failure');
    expect(recoveryFailure.raw.hook_phase).toBe('PostToolUse');
    expect(recoveryFailure.raw.retry_count).toBe(3);
    expect(recoveryFailure.raw.recovery_succeeded).toBe(false);
    expect(recoveryFailure.confidence).toBe(0.9);
    expect(recoveryFailure.severity_score).toBe(0.95);

    const contractViolation = classifyEntry({
      hook: 'validator',
      hook_phase: 'Stop',
      message: 'Contract validation rejected malformed output',
      context: 'contract violation',
      details: 'exit_code=5',
      exit_code: 5
    }, 0, config);

    expect(contractViolation.priority).toBe('high');
    expect(contractViolation.raw.classification).toBe('contract_violation');
    expect(contractViolation.dedup_key).not.toBe(recoveryFailure.dedup_key);
  });

  test('classifies new hook errors and advances the watermark', () => {
    const ambientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ambient-hook-errors-'));
    const logFile = path.join(ambientDir, 'hook-errors.jsonl');

    const entries = [
      { timestamp: new Date().toISOString(), hook: 'pre-tool-use', hook_phase: 'PostToolUse', level: 'error', message: 'Command failed', context: 'line_10', details: 'exit_code=1', exit_code: 1 },
      { timestamp: new Date().toISOString(), hook: 'pre-tool-use', hook_phase: 'PostToolUse', level: 'error', message: 'Command failed', context: 'line_10', details: 'exit_code=1', exit_code: 1 },
      { timestamp: new Date().toISOString(), hook: 'pre-tool-use', hook_phase: 'PostToolUse', level: 'error', message: 'Command failed', context: 'line_10', details: 'exit_code=1', exit_code: 1 },
      { timestamp: new Date().toISOString(), hook: 'router', hook_phase: 'Stop', level: 'error', message: 'Circuit breaker OPEN', context: '', details: 'circuit breaker open', exit_code: 2 },
      { timestamp: new Date().toISOString(), hook: 'validator', hook_phase: 'PostToolUse', level: 'error', message: 'validation failed', context: '', details: 'validation failure', exit_code: 7, retry_count: 2 }
    ];
    fs.writeFileSync(logFile, `${entries.map(entry => JSON.stringify(entry)).join('\n')}\n`);

    const candidates = observeHookErrors({
      config: createConfig(ambientDir),
      sessionId: 'hook-error-session',
      logFile,
      watermarkFile: path.join(ambientDir, '.hook-error-watermark')
    });

    expect(candidates).toHaveLength(5);
    expect(candidates[2].priority).toBe('high');
    expect(candidates[3].priority).toBe('immediate');
    expect(candidates[4].category).toBe('lesson');
    expect(candidates[4].priority).toBe('high');
    expect(candidates[3].raw.hook_phase).toBe('Stop');
    expect(candidates[3].confidence).toBe(0.9);
    expect(candidates[3].severity_score).toBe(0.95);

    const secondPass = observeHookErrors({
      config: createConfig(ambientDir),
      sessionId: 'hook-error-session',
      logFile,
      watermarkFile: path.join(ambientDir, '.hook-error-watermark')
    });
    expect(secondPass).toHaveLength(0);
  });
});
