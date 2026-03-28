'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  reviewShadowSession,
  submitPayloads
} = require('../../scripts/lib/ambient/ambient-reflection-submitter');

function createConfig(ambientDir, mode = 'shadow_mode') {
  return {
    mode,
    paths: {
      ambientDir,
      retryQueueFile: path.join(ambientDir, 'ambient-retry-queue.jsonl')
    }
  };
}

describe('ambient reflection submitter', () => {
  test('writes shadow-mode payloads to session JSONL', () => {
    const ambientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ambient-submitter-shadow-'));
    const config = createConfig(ambientDir, 'shadow_mode');

    const result = submitPayloads([{
      source: 'auto',
      collector_source: 'ambient_collector',
      correlation_id: 'corr-shadow',
      summary: 'shadow payload'
    }], {
      config,
      sessionId: 'shadow-session',
      mode: 'shadow_mode',
      trigger: 'session_end',
      source: 'manual',
      correlationId: 'corr-shadow'
    });

    expect(result.submitted).toBe(1);
    expect(result.source).toBe('manual');
    expect(result.correlation_id).toBe('corr-shadow');
    const reviewed = reviewShadowSession('shadow-session', { config });
    expect(reviewed).toHaveLength(1);
    expect(reviewed[0].payload.summary).toBe('shadow payload');
    expect(reviewed[0].payload.source).toBe('manual');
    expect(reviewed[0].payload.correlation_id).toBe('corr-shadow');
  });

  test('queues failed auto-submit payloads for retry', () => {
    const ambientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ambient-submitter-auto-'));
    const config = createConfig(ambientDir, 'auto_submit');
    const missingScript = path.join(ambientDir, 'missing-submit-script.js');

    const result = submitPayloads([{
      source: 'auto',
      collector_source: 'ambient_collector',
      summary: 'auto payload'
    }], {
      config,
      sessionId: 'auto-session',
      mode: 'auto_submit',
      trigger: 'session_end',
      submitScript: missingScript,
      source: 'auto',
      correlationId: 'corr-auto'
    });

    expect(result.results[0].queued).toBe(true);
    expect(result.results[0].correlation_id).toBe('corr-auto');
    expect(fs.existsSync(config.paths.retryQueueFile)).toBe(true);
  });
});
