'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { loadConfig } = require('./config-loader');
const {
  appendJsonl,
  ensureDir,
  nowIso,
  readJsonl,
  resolveSessionId,
  writeJson
} = require('./utils');

function resolveSubmitScript(submitScript) {
  return submitScript || path.resolve(__dirname, '../submit-reflection.js');
}

function shadowFilePath(sessionId, config) {
  return path.join(config.paths?.ambientDir, `shadow-${sessionId}.jsonl`);
}

function withSubmissionMetadata(payload, options = {}) {
  return {
    ...payload,
    source: options.source || payload.source || 'auto',
    correlation_id: options.correlationId || payload.correlation_id || crypto.randomUUID()
  };
}

function submitPayloads(payloads, options = {}) {
  const config = options.config || loadConfig();
  const sessionId = resolveSessionId(options.sessionId);
  const mode = options.mode || config.mode;
  const trigger = options.trigger || 'ambient_flush';
  const submissionSource = options.source || (trigger === 'manual_reflect' ? 'manual' : 'auto');
  const correlationId = options.correlationId || crypto.randomUUID();
  const retryQueueFile = options.retryQueueFile || config.paths?.retryQueueFile;
  const submitScript = resolveSubmitScript(options.submitScript);

  if (!Array.isArray(payloads) || payloads.length === 0) {
    return {
      mode,
      submitted: 0,
      results: []
    };
  }

  ensureDir(config.paths?.ambientDir);
  const preparedPayloads = payloads.map(payload => withSubmissionMetadata(payload, {
    source: submissionSource,
    correlationId
  }));

  if (mode === 'shadow_mode') {
    const targetFile = shadowFilePath(sessionId, config);
    preparedPayloads.forEach(payload => {
      appendJsonl(targetFile, {
        recorded_at: nowIso(),
        trigger,
        source: submissionSource,
        correlation_id: correlationId,
        payload
      });
    });

    return {
      mode,
      submitted: preparedPayloads.length,
      source: submissionSource,
      correlation_id: correlationId,
      results: preparedPayloads.map(() => ({ ok: true, mode, file: targetFile, source: submissionSource, correlation_id: correlationId }))
    };
  }

  if (mode !== 'auto_submit') {
    return {
      mode,
      submitted: 0,
      source: submissionSource,
      correlation_id: correlationId,
      results: preparedPayloads.map(() => ({ ok: true, skipped: true, mode, source: submissionSource, correlation_id: correlationId }))
    };
  }

  const results = preparedPayloads.map((payload, index) => {
    const tempFile = path.join(config.paths?.ambientDir, `${sessionId}-ambient-submit-${Date.now()}-${index}.json`);
    writeJson(tempFile, payload);

    const result = spawnSync('node', [submitScript, tempFile], {
      encoding: 'utf8',
      env: process.env
    });

    fs.rmSync(tempFile, { force: true });

    if (result.status === 0) {
      return { ok: true, mode };
    }

    appendJsonl(retryQueueFile, {
      queued_at: nowIso(),
      session_id: sessionId,
      trigger,
      source: submissionSource,
      correlation_id: correlationId,
      error: (result.stderr || result.stdout || '').trim().slice(0, 400),
      payload
    });

    return {
      ok: false,
      mode,
      queued: true,
      status: result.status,
      source: submissionSource,
      correlation_id: correlationId
    };
  });

  return {
    mode,
    source: submissionSource,
    correlation_id: correlationId,
    submitted: results.filter(entry => entry.ok).length,
    results
  };
}

function reviewShadowSession(sessionId, options = {}) {
  const config = options.config || loadConfig();
  const targetFile = shadowFilePath(resolveSessionId(sessionId), config);
  return readJsonl(targetFile);
}

if (require.main === module) {
  const command = process.argv[2];
  if (command !== 'review') {
    console.error('Usage: node ambient-reflection-submitter.js review --session <id>');
    process.exit(1);
  }

  const sessionIndex = process.argv.indexOf('--session');
  const sessionId = sessionIndex >= 0 ? process.argv[sessionIndex + 1] : undefined;
  process.stdout.write(`${JSON.stringify(reviewShadowSession(sessionId), null, 2)}\n`);
}

module.exports = {
  reviewShadowSession,
  submitPayloads
};
