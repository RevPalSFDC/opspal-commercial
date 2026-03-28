'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { compileCandidates } = require('../../scripts/lib/ambient/reflection-compiler');

function createConfig(ambientDir) {
  return {
    buffer: {
      maxCandidates: 200,
      maxAgeMinutes: 120
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
      skillSignalsFile: path.join(ambientDir, 'skill-signals.jsonl')
    }
  };
}

describe('reflection compiler', () => {
  test('dedupes, scores, and shapes ambient payloads for submission', () => {
    const ambientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ambient-compiler-'));
    const config = createConfig(ambientDir);
    const now = new Date().toISOString();

    const payloads = compileCandidates([
      {
        id: '1',
        source: 'post_tool_use',
        category: 'issue',
        priority: 'high',
        captured_at: now,
        raw: { tool: 'Bash', note: 'Command failed' },
        impact_path: 'bash-flow',
        dedup_key: 'same-problem'
      },
      {
        id: '2',
        source: 'post_tool_use',
        category: 'issue',
        priority: 'normal',
        captured_at: now,
        raw: { tool: 'Bash', note: 'Command failed' },
        dedup_key: 'same-problem'
      },
      {
        id: '3',
        source: 'task_completed',
        category: 'workflow_gap',
        priority: 'normal',
        captured_at: now,
        raw: { agent: 'planner', note: 'Abnormally long task execution detected.' },
        dedup_key: 'workflow-gap-1'
      },
      {
        id: '4',
        source: 'task_completed',
        category: 'workflow_gap',
        priority: 'normal',
        captured_at: now,
        raw: { agent: 'planner', note: 'Abnormally long task execution detected.' },
        dedup_key: 'workflow-gap-2'
      },
      {
        id: '5',
        source: 'task_completed',
        category: 'workflow_gap',
        priority: 'normal',
        captured_at: now,
        raw: { agent: 'planner', note: 'Abnormally long task execution detected.' },
        dedup_key: 'workflow-gap-3'
      }
    ], {
      config,
      sessionId: 'compile-session',
      flushReason: 'session_end',
      source: 'manual',
      correlationId: 'corr-123'
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0].source).toBe('manual');
    expect(payloads[0].collector_source).toBe('ambient_collector');
    expect(payloads[0].correlation_id).toBe('corr-123');
    expect(payloads[0].issues_identified.length).toBeGreaterThanOrEqual(2);
    expect(payloads[0].skill_candidates.length).toBeGreaterThanOrEqual(1);
    expect(payloads[0]._data_quality).toBeDefined();
    expect(payloads[0].summary).toContain('Ambient reflection captured');
    expect(payloads[0].issues_identified[0].description).not.toEqual(payloads[0].issues_identified[0].root_cause);
    expect(payloads[0].ambient_candidates[0]).toEqual(expect.objectContaining({
      confidence: expect.any(Number),
      novelty_score: expect.any(Number),
      severity_score: expect.any(Number),
      impact_path: expect.any(String)
    }));
  });
});
