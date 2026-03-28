'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { ReflectionCandidateBuffer } = require('../../scripts/lib/ambient/reflection-candidate-buffer');
const { classifyEntry, observeHookErrors } = require('../../scripts/lib/ambient/hook-error-observer');
const { interceptHookErrors, dedupeWithinSession, writeCrashSafe, replayFromCrashSafe } = require('../../scripts/lib/ambient/hook-reflection-interceptor');
const { evaluateFlushTrigger, shouldFlush } = require('../../scripts/lib/ambient/flush-trigger-engine');
const { compileCandidates } = require('../../scripts/lib/ambient/reflection-compiler');
const { submitPayloads, reviewShadowSession } = require('../../scripts/lib/ambient/ambient-reflection-submitter');
const { detectSkillCandidates, buildSkillOpportunity, OPPORTUNITY_PATTERNS } = require('../../scripts/lib/ambient/skill-candidate-detector');
const { createDedupKey, nowIso, readJsonl, sanitizeString } = require('../../scripts/lib/ambient/utils');
const { loadTelemetry, recordCandidatesCaptured, recordDedupe, recordSubmission, recordFlush, recordHookError, recordSkillCandidates, getSummary } = require('../../scripts/lib/ambient/ambient-telemetry');

function createConfig(ambientDir, mode = 'shadow_mode') {
  return {
    mode,
    buffer: {
      maxCandidates: 200,
      maxAgeMinutes: 120,
      flushIntervalSeconds: 60,
      taskCompletionFlushThreshold: 5,
      repeatedFrictionThreshold: 2,
      topicTransitionMinCandidates: 4,
      priorityImmediateThresholds: { hookFailures: 3, toolErrors: 5, retries: 4 }
    },
    compiler: {
      minScoreToKeep: 0.1,
      dedupeWindowMinutes: 10,
      maxIssuesPerReflection: 25
    },
    skillCandidate: {
      patternRepeatThreshold: 3,
      crossSessionWindowDays: 7,
      crossSessionSessionThreshold: 2
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

function tmpDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ambient-${label}-`));
}

function writeLogEntries(logFile, entries) {
  fs.writeFileSync(logFile, `${entries.map(e => JSON.stringify(e)).join('\n')}\n`);
}

// =============================================================================
// 1. User correction capture
// =============================================================================

describe('user correction capture', () => {
  const originalEnv = { ...process.env };
  afterEach(() => { process.env = { ...originalEnv }; jest.resetModules(); });

  test('captures user correction signals from prompt text', () => {
    jest.isolateModules(() => {
      const { extractCandidates } = require('../../scripts/lib/ambient/extractors/user-prompt-extractor');
      const result = extractCandidates({
        user_message: 'No, actually, I meant the other field.'
      });

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('user_preference');
      expect(result[0].priority).toBe('high');
      expect(result[0].raw.signal).toBe('user_correction');
      expect(result[0].raw.matched_phrase).toBeTruthy();
    });
  });
});

// =============================================================================
// 2. Retry/error capture
// =============================================================================

describe('retry and error capture', () => {
  const originalEnv = { ...process.env };
  afterEach(() => { process.env = { ...originalEnv }; jest.resetModules(); });

  test('captures tool errors and bash retry signals from post-tool events', () => {
    const tempHome = tmpDir('retry-capture');
    process.env.HOME = tempHome;

    const retryFile = path.join(tempHome, '.claude', 'consultation-error-state.json');
    fs.mkdirSync(path.dirname(retryFile), { recursive: true });
    fs.writeFileSync(retryFile, JSON.stringify({ errorCount: 3, retryCount: 2, lastTool: 'Bash' }));

    jest.isolateModules(() => {
      const { extractCandidates } = require('../../scripts/lib/ambient/extractors/post-tool-extractor');
      const candidates = extractCandidates({
        tool_name: 'Bash',
        tool_result: 'Error: permission denied while accessing resource'
      });

      expect(candidates.some(c => c.category === 'issue')).toBe(true);
      expect(candidates.some(c => c.category === 'workflow_gap')).toBe(true);
    });
  });
});

// =============================================================================
// 3. Dedupe behavior
// =============================================================================

describe('dedupe behavior', () => {
  test('in-session dedup merges candidates by dedup_key and accumulates repeat_count', () => {
    const ambientDir = tmpDir('dedup');
    const config = createConfig(ambientDir);
    const now = nowIso();
    const key = createDedupKey(['test', 'dedup']);

    const existing = [
      { id: '1', dedup_key: key, source: 'hook_error', category: 'issue', priority: 'normal', captured_at: now, raw: { hook: 'a' }, repeat_count: 1 }
    ];
    const incoming = [
      { id: '2', dedup_key: key, source: 'hook_error', category: 'issue', priority: 'high', captured_at: now, raw: { hook: 'a' }, repeat_count: 1 },
      { id: '3', dedup_key: createDedupKey(['test', 'other']), source: 'hook_error', category: 'issue', priority: 'normal', captured_at: now, raw: { hook: 'b' }, repeat_count: 1 }
    ];

    const result = dedupeWithinSession(existing, incoming, config);

    expect(result.mergedCount).toBe(1);
    expect(result.addedCount).toBe(1);
    expect(result.mergedCandidates).toHaveLength(2);
    expect(result.mergedCandidates[0].repeat_count).toBe(2);
    expect(result.mergedCandidates[0].priority).toBe('high');
  });
});

// =============================================================================
// 4. Threshold-based submission
// =============================================================================

describe('threshold-based submission', () => {
  test('flushes when repeated friction count exceeds threshold', () => {
    const ambientDir = tmpDir('threshold');
    const config = createConfig(ambientDir);
    const buffer = new ReflectionCandidateBuffer({ config, sessionId: 'threshold-session' });

    buffer.add({ source: 'user_prompt', category: 'issue', priority: 'high', raw: { signal: 'frustration', note: 'a' } });
    buffer.add({ source: 'post_tool_use', category: 'issue', priority: 'high', raw: { tool: 'Bash', note: 'b' } });

    const result = evaluateFlushTrigger({ config, sessionId: 'threshold-session', trigger: 'post_tool_use' });

    expect(result.flushed).toBe(true);
    expect(result.reason).toBe('repeated_friction');
  });
});

// =============================================================================
// 5. Topic transition flush
// =============================================================================

describe('topic transition flush', () => {
  test('flushes on detected topic transition with sufficient candidates', () => {
    const ambientDir = tmpDir('topic');
    const config = createConfig(ambientDir);
    const buffer = new ReflectionCandidateBuffer({ config, sessionId: 'topic-session' });
    const now = nowIso();

    // Add 6 candidates: first 3 salesforce taxonomy, next 3 hubspot taxonomy
    for (let i = 0; i < 3; i++) {
      buffer.add({ source: 'post_tool_use', category: 'issue', priority: 'normal', captured_at: now, taxonomy: 'salesforce/deployment', raw: { tool: 'sf', note: `sf issue ${i}` } });
    }
    for (let i = 0; i < 3; i++) {
      buffer.add({ source: 'post_tool_use', category: 'issue', priority: 'normal', captured_at: now, taxonomy: 'hubspot/workflow', raw: { tool: 'hs', note: `hs issue ${i}` } });
    }

    const result = evaluateFlushTrigger({ config, sessionId: 'topic-session', trigger: 'post_tool_use' });

    expect(result.flushed).toBe(true);
    expect(result.reason).toBe('topic_transition');
  });
});

// =============================================================================
// 6. Manual /reflect force flush
// =============================================================================

describe('manual /reflect force flush', () => {
  test('force-flushes in manual_only mode via manual_reflect trigger', () => {
    const ambientDir = tmpDir('manual-force');
    const config = createConfig(ambientDir, 'manual_only');
    const buffer = new ReflectionCandidateBuffer({ config, sessionId: 'manual-force-session' });

    buffer.add({ source: 'user_prompt', category: 'issue', priority: 'normal', raw: { signal: 'test', note: 'feedback' } });

    const auto = evaluateFlushTrigger({ config, sessionId: 'manual-force-session', trigger: 'post_tool_use' });
    expect(auto.flushed).toBe(false);
    expect(auto.reason).toBe('mode_disabled');

    const manual = evaluateFlushTrigger({ config, sessionId: 'manual-force-session', trigger: 'manual_reflect', force: true });
    expect(manual.flushed).toBe(true);
    expect(manual.reason).toBe('manual_reflect');
  });
});

// =============================================================================
// 7. Hook error immediate candidate creation
// =============================================================================

describe('hook error immediate candidate', () => {
  test('circuit breaker open creates immediate-priority candidate', () => {
    const config = createConfig(tmpDir('hook-imm'));

    const result = classifyEntry({
      hook: 'unified-router',
      hook_phase: 'UserPromptSubmit',
      message: 'Circuit breaker OPEN for router',
      context: 'too many failures',
      details: 'circuit breaker open',
      exit_code: 2
    }, 0, config);

    expect(result.priority).toBe('immediate');
    expect(result.raw.classification).toBe('circuit_breaker_open');
    expect(result.severity_score).toBe(0.95);
    expect(result.confidence).toBe(0.9);
    expect(result.raw.hook_phase).toBe('UserPromptSubmit');
  });
});

// =============================================================================
// 8. Hook timeout candidate creation
// =============================================================================

describe('hook timeout candidate', () => {
  test('timeout entries create high-priority candidate when captureTimeouts is true', () => {
    const config = createConfig(tmpDir('hook-timeout'));

    const result = classifyEntry({
      hook: 'validator',
      hook_phase: 'PreToolUse',
      message: 'Command timed out after 10s',
      context: 'timeout waiting for response',
      details: 'exit_code=5',
      exit_code: 5
    }, 0, config);

    expect(result.priority).toBe('high');
    expect(result.raw.classification).toBe('timeout');
    expect(result.severity_score).toBe(0.75);
  });

  test('timeout entries are suppressed when captureTimeouts is false', () => {
    const config = createConfig(tmpDir('hook-timeout-off'));
    config.hookObserver.captureTimeouts = false;

    const result = classifyEntry({
      hook: 'validator',
      hook_phase: 'PreToolUse',
      message: 'Command timed out',
      context: 'timeout',
      details: '',
      exit_code: 5
    }, 0, config);

    expect(result).toBeNull();
  });
});

// =============================================================================
// 9. Malformed hook response candidate creation
// =============================================================================

describe('malformed hook response candidate', () => {
  test('malformed output creates normal-priority candidate', () => {
    const config = createConfig(tmpDir('hook-malformed'));

    const result = classifyEntry({
      hook: 'post-tool-use',
      hook_phase: 'PostToolUse',
      message: 'Hook returned malformed JSON output',
      context: 'json parse failed',
      details: 'malformed response body',
      exit_code: 1
    }, 0, config);

    expect(result.priority).toBe('normal');
    expect(result.raw.classification).toBe('malformed_output');
    expect(result.raw.exit_code).toBe(1);
  });
});

// =============================================================================
// 10. Shadow payload generation
// =============================================================================

describe('shadow payload generation', () => {
  test('shadow_mode writes payload to JSONL file without network calls', () => {
    const ambientDir = tmpDir('shadow-gen');
    const config = createConfig(ambientDir, 'shadow_mode');

    const result = submitPayloads([{
      source: 'auto',
      collector_source: 'ambient_collector',
      summary: 'test shadow payload',
      issues_identified: [{ title: 'test issue', priority: 'P2' }]
    }], {
      config,
      sessionId: 'shadow-gen-session',
      mode: 'shadow_mode',
      trigger: 'session_end',
      source: 'auto',
      correlationId: 'corr-shadow-gen'
    });

    expect(result.mode).toBe('shadow_mode');
    expect(result.submitted).toBe(1);
    expect(result.results[0].ok).toBe(true);

    const shadow = reviewShadowSession('shadow-gen-session', { config });
    expect(shadow).toHaveLength(1);
    expect(shadow[0].payload.summary).toBe('test shadow payload');
    expect(shadow[0].source).toBe('auto');
  });
});

// =============================================================================
// 11. Immediate submit attempt in auto_submit
// =============================================================================

describe('immediate submit in auto_submit', () => {
  test('immediate hook error triggers flush through shadow path in shadow_mode', () => {
    const ambientDir = tmpDir('auto-submit');
    const config = createConfig(ambientDir, 'shadow_mode');
    const logFile = path.join(ambientDir, 'hook-errors.jsonl');

    writeLogEntries(logFile, [{
      timestamp: nowIso(),
      hook: 'critical-hook',
      hook_phase: 'Stop',
      level: 'error',
      message: 'Circuit breaker OPEN',
      context: 'circuit breaker open',
      details: 'exit_code=2',
      exit_code: 2
    }]);

    const result = interceptHookErrors({
      config,
      sessionId: 'auto-submit-session',
      logFile,
      watermarkFile: path.join(ambientDir, '.hook-error-watermark')
    });

    expect(result.flushed).toBe(true);
    expect(result.reason).toBe('hook_error_immediate');
    expect(result.candidates).toHaveLength(1);
    expect(fs.existsSync(path.join(ambientDir, 'shadow-auto-submit-session.jsonl'))).toBe(true);
  });
});

// =============================================================================
// 12. Queued retry if submission fails
// =============================================================================

describe('queued retry on submission failure', () => {
  test('failed auto_submit writes to retry queue', () => {
    const ambientDir = tmpDir('retry-queue');
    const config = createConfig(ambientDir, 'auto_submit');
    const missingScript = path.join(ambientDir, 'nonexistent-submit.js');

    const result = submitPayloads([{
      source: 'auto',
      collector_source: 'ambient_collector',
      summary: 'payload to retry'
    }], {
      config,
      sessionId: 'retry-session',
      mode: 'auto_submit',
      trigger: 'session_end',
      submitScript: missingScript,
      correlationId: 'corr-retry'
    });

    expect(result.results[0].ok).toBe(false);
    expect(result.results[0].queued).toBe(true);

    const retryEntries = readJsonl(config.paths.retryQueueFile);
    expect(retryEntries).toHaveLength(1);
    expect(retryEntries[0].payload.summary).toBe('payload to retry');
  });
});

// =============================================================================
// 13. Redaction
// =============================================================================

describe('redaction and sanitization', () => {
  test('sanitizeString redacts emails, tokens, IPs, and home paths', () => {
    const raw = 'Error at user@example.com with Bearer abc123def456 from 192.168.1.1 in /home/chris/project';
    const sanitized = sanitizeString(raw, 200);

    expect(sanitized).toContain('[EMAIL]');
    expect(sanitized).toContain('Bearer [TOKEN]');
    expect(sanitized).toContain('[IP]');
    expect(sanitized).toContain('[USER]');
    expect(sanitized).not.toContain('user@example.com');
    expect(sanitized).not.toContain('abc123def456');
    expect(sanitized).not.toContain('192.168.1.1');
    expect(sanitized).not.toContain('/home/chris');
  });

  test('hook error candidates sanitize all raw fields', () => {
    const config = createConfig(tmpDir('redact'));

    const result = classifyEntry({
      hook: 'test-hook',
      hook_phase: 'PostToolUse',
      message: 'Failed for user@secret.com with token=abcdef12345678',
      context: 'Bearer xyztoken123456789',
      details: 'accessed /home/admin/data at 10.0.0.5',
      exit_code: 1
    }, 0, config);

    expect(result.raw.message).toContain('[EMAIL]');
    expect(result.raw.context).toContain('[TOKEN]');
    expect(result.raw.details).toContain('[USER]');
    expect(result.raw.details).toContain('[IP]');
  });
});

// =============================================================================
// 14. Skill candidate generation
// =============================================================================

describe('skill candidate generation', () => {
  test('detects skill opportunity from repeated workflow gap signals', () => {
    const ambientDir = tmpDir('skill-gen');
    const config = createConfig(ambientDir);
    const now = nowIso();

    const candidates = [];
    for (let i = 0; i < 4; i++) {
      candidates.push({
        id: `wg-${i}`,
        source: 'post_tool_use',
        category: 'workflow_gap',
        priority: 'normal',
        captured_at: now,
        raw: { agent: 'sfdc-deployer', tool: 'Bash', note: 'Manual retry pattern' },
        dedup_key: createDedupKey(['workflow_gap', `instance-${i}`]),
        repeat_count: 1
      });
    }

    const result = detectSkillCandidates(candidates, {
      config,
      sessionId: 'skill-gen-session',
      signalFile: path.join(ambientDir, 'skill-signals.jsonl')
    });

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].category).toBe('skill_candidate');
    expect(result[0].raw.skill_opportunity).toBeDefined();

    const opp = result[0].raw.skill_opportunity;
    expect(opp.suggested_name).toBeTruthy();
    expect(opp.problem).toBeTruthy();
    expect(opp.trigger_pattern).toBeTruthy();
    expect(opp.expected_inputs).toEqual(expect.arrayContaining([expect.any(String)]));
    expect(opp.expected_outputs).toEqual(expect.arrayContaining([expect.any(String)]));
    expect(opp.execution_outline).toHaveLength(3);
    expect(opp.confidence).toBeGreaterThan(0);
    expect(opp.confidence).toBeLessThanOrEqual(1);
    expect(opp.estimated_impact).toBeTruthy();
    expect(opp.matched_patterns.length).toBeGreaterThanOrEqual(1);
  });

  test('buildSkillOpportunity returns null when no patterns match', () => {
    const result = buildSkillOpportunity('empty-signal', [], 0, 0);
    expect(result).toBeNull();
  });

  test('detects corrective guidance pattern from user_preference candidates', () => {
    const ambientDir = tmpDir('skill-correction');
    const config = createConfig(ambientDir);
    const now = nowIso();

    const candidates = [];
    for (let i = 0; i < 3; i++) {
      candidates.push({
        id: `up-${i}`,
        source: 'user_prompt',
        category: 'user_preference',
        priority: 'high',
        captured_at: now,
        raw: { signal: 'user_correction', matched_phrase: 'no actually', note: 'User corrected direction' },
        dedup_key: createDedupKey(['user_preference', `corr-${i}`]),
        repeat_count: 1
      });
    }

    const result = detectSkillCandidates(candidates, {
      config,
      sessionId: 'skill-correction-session',
      signalFile: path.join(ambientDir, 'skill-signals.jsonl')
    });

    expect(result.length).toBeGreaterThanOrEqual(1);
    const opp = result[0].raw.skill_opportunity;
    expect(opp).toBeDefined();
    expect(opp.matched_patterns).toContain('corrective_guidance');
  });
});

// =============================================================================
// 15. Backward compatibility with existing reflect consumers
// =============================================================================

describe('backward compatibility', () => {
  test('compiled payloads maintain expected schema for Supabase consumers', () => {
    const ambientDir = tmpDir('compat');
    const config = createConfig(ambientDir);
    const now = nowIso();

    const payloads = compileCandidates([
      {
        id: 'bc-1',
        source: 'hook_error',
        category: 'issue',
        priority: 'high',
        captured_at: now,
        raw: {
          hook: 'validator',
          hook_phase: 'PostToolUse',
          classification: 'contract_violation',
          exit_code: 7,
          note: 'Contract validation failed'
        },
        confidence: 0.9,
        severity_score: 0.75,
        dedup_key: 'compat-key-1'
      },
      {
        id: 'bc-2',
        source: 'post_tool_use',
        category: 'workflow_gap',
        priority: 'normal',
        captured_at: now,
        raw: { tool: 'Bash', note: 'Repeated manual step' },
        dedup_key: 'compat-key-2'
      }
    ], { config, sessionId: 'compat-session', flushReason: 'session_end', source: 'auto' });

    expect(payloads).toHaveLength(1);
    const payload = payloads[0];

    // Required top-level fields
    expect(payload.summary).toBeTruthy();
    expect(payload.collector_source).toBe('ambient_collector');
    expect(payload.correlation_id).toBeTruthy();
    expect(payload.issues_identified).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: expect.any(String),
        description: expect.any(String),
        root_cause: expect.any(String),
        agnostic_fix: expect.any(String),
        blast_radius: expect.any(String),
        priority: expect.stringMatching(/^P[0-3]$/),
        taxonomy: expect.any(String),
        ambient_source: expect.any(String),
        confidence: expect.any(Number),
        novelty_score: expect.any(Number),
        severity_score: expect.any(Number)
      })
    ]));
    expect(payload.session_metadata).toEqual(expect.objectContaining({
      session_id: 'compat-session',
      flush_reason: 'session_end'
    }));
    expect(payload.ambient_context).toEqual(expect.objectContaining({
      collector_source: 'ambient_collector'
    }));
    expect(payload._data_quality).toBeDefined();
  });
});

// =============================================================================
// 16. Crash-safe write and replay
// =============================================================================

describe('crash-safe persistence', () => {
  test('crash-safe entries survive and replay correctly', () => {
    const ambientDir = tmpDir('crash-safe-round');
    const config = createConfig(ambientDir);
    const now = nowIso();

    // Use the buffer directly to write candidates, then verify crash-safe roundtrip
    const writeResult = writeCrashSafe([
      { id: 'cs-1', dedup_key: 'alpha', source: 'hook_error', category: 'issue', priority: 'high', captured_at: now, raw: { hook: 'alpha-hook', note: 'error alpha' }, repeat_count: 1 },
      { id: 'cs-2', dedup_key: 'beta', source: 'hook_error', category: 'issue', priority: 'normal', captured_at: now, raw: { hook: 'beta-hook', note: 'error beta' }, repeat_count: 1 }
    ], config, { sessionId: 'cs-session', step: 'test', error: 'simulated' });
    expect(writeResult.written).toBe(2);
    expect(writeResult.failed).toBeUndefined();

    // Verify crash-safe file contains entries
    const crashFile = path.join(ambientDir, 'hook-reflection-crash-safe.jsonl');
    const rawEntries = readJsonl(crashFile);
    expect(rawEntries).toHaveLength(2);

    const replayResult = replayFromCrashSafe(config, 'cs-session');
    expect(replayResult.replayed).toBe(2);
    expect(replayResult.failed).toBeUndefined();

    const buffer = new ReflectionCandidateBuffer({ config, sessionId: 'cs-session' });
    const items = buffer.list();
    // Two candidates may merge if their sanitized dedup_keys collide,
    // but total repeat_count must equal 2 and entries must exist
    expect(items.length).toBeGreaterThanOrEqual(1);
    const totalRepeatCount = items.reduce((sum, c) => sum + (c.repeat_count || 1), 0);
    expect(totalRepeatCount).toBe(2);

    // Crash-safe file should be cleared after replay
    expect(fs.readFileSync(crashFile, 'utf8').trim()).toBe('');
  });
});

// =============================================================================
// 17. Recovery failure candidate creation
// =============================================================================

describe('recovery failure candidate', () => {
  test('recovery_succeeded=false with non-zero exit creates immediate-priority candidate', () => {
    const config = createConfig(tmpDir('recovery-fail'));

    const result = classifyEntry({
      hook: 'deploy-validator',
      hook_phase: 'PreToolUse',
      message: 'Deployment validation failed after recovery attempt',
      context: 'contract guard',
      details: 'exit_code=7',
      exit_code: 7,
      retry_count: 3,
      recovery_succeeded: 'false',
      stack_trace: 'handle_error>validate_input>main at line 120'
    }, 0, config);

    expect(result.priority).toBe('immediate');
    expect(result.raw.classification).toBe('recovery_failure');
    expect(result.raw.recovery_succeeded).toBe(false);
    expect(result.raw.retry_count).toBe(3);
    expect(result.raw.stack_trace).toContain('handle_error');
  });
});

// =============================================================================
// 18. Contract violation candidate creation
// =============================================================================

describe('contract violation candidate', () => {
  test('contract keyword with non-zero exit creates high-priority candidate', () => {
    const config = createConfig(tmpDir('contract'));

    const result = classifyEntry({
      hook: 'pre-tool-use-contract-validation',
      hook_phase: 'PreToolUse',
      message: 'Tool contract rejected input schema',
      context: 'contract violation on input',
      details: 'exit_code=5',
      exit_code: 5
    }, 0, config);

    expect(result.priority).toBe('high');
    expect(result.raw.classification).toBe('contract_violation');
    expect(result.severity_score).toBe(0.75);
  });
});

// =============================================================================
// 19. Telemetry module
// =============================================================================

describe('ambient telemetry', () => {
  test('records and retrieves telemetry metrics across multiple operations', () => {
    const ambientDir = tmpDir('telemetry');
    const config = createConfig(ambientDir);
    const sessionId = 'telemetry-session';

    recordCandidatesCaptured(5, 'hook_error', config, sessionId);
    recordCandidatesCaptured(3, 'post_tool_use', config, sessionId);
    recordDedupe(2, 1, config, sessionId);
    recordSubmission({ ok: true }, config, sessionId);
    recordSubmission({ ok: false, queued: true }, config, sessionId);
    recordFlush('session_end', config, sessionId);
    recordHookError(true, config, sessionId);
    recordSkillCandidates(2, config, sessionId);

    const summary = getSummary(config, sessionId);

    expect(summary.candidates_captured).toBe(8);
    expect(summary.candidates_by_source.hook_error).toBe(5);
    expect(summary.candidates_by_source.post_tool_use).toBe(3);
    expect(summary.dedupe_merges).toBe(2);
    expect(summary.dedupe_suppressions).toBe(1);
    expect(summary.submissions_accepted).toBe(1);
    expect(summary.submissions_queued_for_retry).toBe(1);
    expect(summary.flush_count).toBe(1);
    expect(summary.flush_reasons.session_end).toBe(1);
    expect(summary.hook_errors_captured).toBe(1);
    expect(summary.hook_errors_immediate).toBe(1);
    expect(summary.skill_candidates_surfaced).toBe(2);
    expect(summary.dedupe_rate_percent).toBeGreaterThan(0);
  });
});

// =============================================================================
// 20. Cross-session suppression
// =============================================================================

describe('cross-session duplicate suppression', () => {
  test('suppresses identical cross-session entries without new evidence', () => {
    const ambientDir = tmpDir('cross-session');
    const config = createConfig(ambientDir);
    const logFile = path.join(ambientDir, 'hook-errors.jsonl');

    // Simulate a prior session signal
    const signalFile = config.paths.skillSignalsFile;
    fs.writeFileSync(signalFile, `${JSON.stringify({
      entry_type: 'hook_error',
      captured_at: nowIso(),
      session_id: 'prior-session',
      dedup_key: createDedupKey(['hook_error', 'router', 'PostToolUse', 'non_zero_exit', 'Command failed']),
      classification: 'non_zero_exit',
      exit_code: 1,
      has_stack_trace: false,
      suppressed: false
    })}\n`);

    // Write matching entry to log
    writeLogEntries(logFile, [{
      timestamp: nowIso(),
      hook: 'router',
      hook_phase: 'PostToolUse',
      level: 'error',
      message: 'Command failed',
      context: 'line_10',
      details: 'exit_code=1',
      exit_code: 1
    }]);

    const result = interceptHookErrors({
      config,
      sessionId: 'current-session',
      logFile,
      watermarkFile: path.join(ambientDir, '.hook-error-watermark')
    });

    // Should be suppressed since same dedup_key, same exit_code, no stack_trace
    expect(result.reason).toBe('suppressed_duplicate');
    expect(result.suppressed).toBe(1);
  });
});

// =============================================================================
// 21. Validation failure escalation on retry
// =============================================================================

describe('validation failure escalation', () => {
  test('validation failures escalate to high priority after 2+ retries', () => {
    const config = createConfig(tmpDir('val-escalate'));

    const normalResult = classifyEntry({
      hook: 'pre-tool',
      hook_phase: 'PreToolUse',
      message: 'validation check failed',
      context: 'schema validation',
      details: '',
      exit_code: 7,
      retry_count: 0
    }, 0, config);

    expect(normalResult.priority).toBe('normal');
    expect(normalResult.raw.classification).toBe('validation_failure');

    const escalatedResult = classifyEntry({
      hook: 'pre-tool',
      hook_phase: 'PreToolUse',
      message: 'validation check failed',
      context: 'schema validation',
      details: '',
      exit_code: 7,
      retry_count: 2
    }, 0, config);

    expect(escalatedResult.priority).toBe('high');
    expect(escalatedResult.raw.classification).toBe('validation_failure');
  });
});
