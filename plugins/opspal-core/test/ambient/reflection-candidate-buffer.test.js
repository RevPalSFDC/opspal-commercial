'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { ReflectionCandidateBuffer } = require('../../scripts/lib/ambient/reflection-candidate-buffer');

function createConfig(ambientDir) {
  return {
    buffer: {
      maxCandidates: 2
    },
    sanitization: {
      maxFieldLength: 200
    },
    paths: {
      ambientDir
    }
  };
}

describe('reflection candidate buffer', () => {
  test('persists, trims, and drains candidates', () => {
    const ambientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ambient-buffer-'));
    const buffer = new ReflectionCandidateBuffer({
      config: createConfig(ambientDir),
      sessionId: 'session-buffer-test'
    });

    buffer.add({
      source: 'post_tool_use',
      category: 'issue',
      raw: { tool: 'Bash', note: 'first' },
      confidence: 0.8,
      novelty_score: 0.7,
      severity_score: 0.5,
      impact_path: 'test-flow'
    });
    buffer.add({ source: 'post_tool_use', category: 'issue', raw: { tool: 'Bash', note: 'second' } });
    buffer.add({ source: 'task_completed', category: 'workflow_gap', raw: { agent: 'planner', note: 'third' } });

    const stats = buffer.getStats();
    expect(stats.count).toBe(2);
    expect(buffer.list().map(candidate => candidate.raw.note)).toEqual(['second', 'third']);
    expect(buffer.list()[0].confidence).toBeNull();

    const drained = buffer.drain();
    expect(drained).toHaveLength(2);
    expect(drained[0].confidence).toBeNull();
    expect(buffer.getStats().count).toBe(0);
  });
});
