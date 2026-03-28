'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { ReflectionCandidateBuffer } = require('../../scripts/lib/ambient/reflection-candidate-buffer');
const { evaluateFlushTrigger } = require('../../scripts/lib/ambient/flush-trigger-engine');

function createConfig(ambientDir, mode = 'shadow_mode') {
  return {
    mode,
    buffer: {
      maxCandidates: 200,
      maxAgeMinutes: 120,
      flushIntervalSeconds: 60,
      taskCompletionFlushThreshold: 2,
      repeatedFrictionThreshold: 2,
      topicTransitionMinCandidates: 8
    },
    compiler: {
      minScoreToKeep: 0.3,
      dedupeWindowMinutes: 10,
      maxIssuesPerReflection: 25
    },
    skillCandidate: {
      patternRepeatThreshold: 3,
      crossSessionWindowDays: 7,
      crossSessionSessionThreshold: 2
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

describe('flush trigger engine', () => {
  test('flushes immediately for immediate-priority hook errors before generic critical-failure logic', () => {
    const ambientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ambient-flush-'));
    const config = createConfig(ambientDir);
    const buffer = new ReflectionCandidateBuffer({ config, sessionId: 'flush-session' });

    buffer.add({
      source: 'hook_error',
      category: 'issue',
      priority: 'immediate',
      raw: {
        hook: 'router',
        note: 'Circuit breaker OPEN'
      }
    });

    const result = evaluateFlushTrigger({
      config,
      sessionId: 'flush-session',
      trigger: 'post_tool_use'
    });

    expect(result.flushed).toBe(true);
    expect(result.reason).toBe('hook_error_immediate');
    expect(result.source).toBe('auto');
    expect(result.correlation_id).toBeTruthy();
    expect(fs.existsSync(path.join(ambientDir, 'shadow-flush-session.jsonl'))).toBe(true);
  });

  test('flushes immediately for hook recovery failures', () => {
    const ambientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ambient-recovery-flush-'));
    const config = createConfig(ambientDir);
    const buffer = new ReflectionCandidateBuffer({ config, sessionId: 'recovery-session' });

    buffer.add({
      source: 'hook_error',
      category: 'issue',
      priority: 'high',
      raw: {
        hook: 'validator',
        recovery_succeeded: false,
        note: 'Recovery failed'
      }
    });

    const result = evaluateFlushTrigger({
      config,
      sessionId: 'recovery-session',
      trigger: 'post_tool_use'
    });

    expect(result.flushed).toBe(true);
    expect(result.reason).toBe('hook_error_recovery_failure');
  });

  test('uses task-completion trigger thresholds when invoked from TaskCompleted', () => {
    const ambientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ambient-task-completion-'));
    const config = createConfig(ambientDir);
    const buffer = new ReflectionCandidateBuffer({ config, sessionId: 'task-session' });

    buffer.add({
      source: 'task_completed',
      category: 'workflow_gap',
      priority: 'high',
      raw: {
        agent: 'planner',
        note: 'Long task'
      }
    });
    buffer.add({
      source: 'task_completed',
      category: 'workflow_gap',
      priority: 'normal',
      raw: {
        agent: 'planner',
        note: 'Another long task'
      }
    });

    const result = evaluateFlushTrigger({
      config,
      sessionId: 'task-session',
      trigger: 'task_completion'
    });

    expect(result.flushed).toBe(true);
    expect(result.reason).toBe('task_completion');
  });

  test('manual-only mode skips automatic flush but honors manual force flush', () => {
    const ambientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ambient-manual-flush-'));
    const config = createConfig(ambientDir, 'manual_only');
    const buffer = new ReflectionCandidateBuffer({ config, sessionId: 'manual-session' });

    buffer.add({
      source: 'user_prompt',
      category: 'skill_candidate',
      priority: 'normal',
      raw: {
        signal: 'capability_request',
        note: 'User requested missing capability.'
      }
    });

    const skipped = evaluateFlushTrigger({
      config,
      sessionId: 'manual-session',
      trigger: 'post_tool_use'
    });
    expect(skipped.flushed).toBe(false);

    const forced = evaluateFlushTrigger({
      config,
      sessionId: 'manual-session',
      trigger: 'manual_reflect',
      force: true
    });
    expect(forced.flushed).toBe(true);
    expect(forced.reason).toBe('manual_reflect');
  });
});
