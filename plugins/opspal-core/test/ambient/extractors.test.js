'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('ambient extractors', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  test('post-tool extractor captures recovery, re-edit, retry, and edge-case signals', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ambient-extractor-home-'));
    process.env.HOME = tempHome;

    const retryStateFile = path.join(tempHome, '.claude', 'consultation-error-state.json');
    fs.mkdirSync(path.dirname(retryStateFile), { recursive: true });
    fs.writeFileSync(retryStateFile, JSON.stringify({
      errorCount: 5,
      retryCount: 4,
      lastTool: 'Bash'
    }));

    jest.isolateModules(() => {
      const { extractCandidates } = require('../../scripts/lib/ambient/extractors/post-tool-extractor');

      const firstEdit = extractCandidates({
        tool_name: 'Write',
        tool_input: { file_path: '/tmp/example.js' },
        tool_result: 'ok'
      });
      expect(firstEdit).toHaveLength(0);

      const secondEdit = extractCandidates({
        tool_name: 'Edit',
        tool_input: { file_path: '/tmp/example.js' },
        tool_result: 'failed: syntax error due to unexpected edge case'
      });
      const recoveredEdit = extractCandidates({
        tool_name: 'Edit',
        tool_input: { file_path: '/tmp/example.js' },
        tool_result: 'success'
      });
      const bashRetry = extractCandidates({
        tool_name: 'Bash',
        tool_result: 'Error: command failed after retry'
      });

      expect(secondEdit.some(candidate => candidate.category === 'issue')).toBe(true);
      expect(secondEdit.some(candidate => candidate.category === 'lesson')).toBe(true);
      expect(secondEdit.some(candidate => candidate.novelty_score === 0.7)).toBe(true);
      expect(recoveredEdit.some(candidate => candidate.raw.note.includes('recovered after a prior error'))).toBe(true);
      expect(bashRetry.some(candidate => candidate.category === 'workflow_gap' && candidate.priority === 'immediate')).toBe(true);
    });
  });

  test('user prompt extractor emits correction, capability, and reusable-pattern signals without storing full prompt text', () => {
    jest.isolateModules(() => {
      const { extractCandidates } = require('../../scripts/lib/ambient/extractors/user-prompt-extractor');
      const candidates = extractCandidates({
        user_message: 'No, actually, that is wrong. I wish you could handle this automatically. This worked well, remember this pattern.'
      });

      expect(candidates.map(candidate => candidate.category)).toEqual(expect.arrayContaining(['user_preference', 'skill_candidate', 'lesson']));
      expect(candidates.find(candidate => candidate.raw.signal === 'successful_reusable_pattern')?.confidence).toBe(0.85);
      candidates.forEach(candidate => {
        expect(candidate.raw.matched_phrase.length).toBeLessThanOrEqual(80);
        expect(candidate.raw.note).toBeTruthy();
      });
    });
  });

  test('subagent extractor escalates repeated recent failures', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ambient-subagent-home-'));
    process.env.HOME = tempHome;

    const logFile = path.join(tempHome, '.claude', 'logs', 'subagent-stops.jsonl');
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const now = new Date().toISOString();
    const logLines = [1, 2, 3].map(() => JSON.stringify({
      timestamp: now,
      agent: 'opspal-core:planner',
      success: false,
      error: 'failed'
    }));
    fs.writeFileSync(logFile, `${logLines.join('\n')}\n`);

    jest.isolateModules(() => {
      const { extractCandidates } = require('../../scripts/lib/ambient/extractors/subagent-extractor');
      const candidates = extractCandidates({
        agent_type: 'opspal-core:planner',
        success: false,
        error: 'wrong agent selected for this task'
      });

      expect(candidates).toHaveLength(1);
      expect(candidates[0].priority).toBe('immediate');
      expect(candidates[0].raw.wrong_agent_suspected).toBe(true);
    });
  });

  test('task completed extractor flags failures and abnormal durations', () => {
    jest.isolateModules(() => {
      const { extractCandidates } = require('../../scripts/lib/ambient/extractors/task-completed-extractor');
      const candidates = extractCandidates({
        agent_type: 'opspal-core:planner',
        success: false,
        duration_ms: 1200000,
        token_count: 1000,
        tool_uses: 0
      });

      expect(candidates.some(candidate => candidate.category === 'issue')).toBe(true);
      expect(candidates.some(candidate => candidate.category === 'workflow_gap')).toBe(true);
    });
  });
});
