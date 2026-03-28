'use strict';

const crypto = require('crypto');
const path = require('path');

const { loadConfig } = require('./config-loader');
const {
  ageMinutes,
  ensureDir,
  normalizePriority,
  createDedupKey,
  nowIso,
  readJson,
  resolveSessionId,
  sanitizeObject,
  sanitizeString,
  writeJson
} = require('./utils');

function normalizeUnitInterval(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.min(1, Number(parsed.toFixed(2))));
}

class ReflectionCandidateBuffer {
  constructor(options = {}) {
    this.config = options.config || loadConfig();
    this.sessionId = resolveSessionId(options.sessionId);
    this.maxCandidates = options.maxCandidates || this.config.buffer?.maxCandidates || 200;
    this.bufferDir = options.bufferDir || this.config.paths?.ambientDir;
    ensureDir(this.bufferDir);
    this.bufferFile = path.join(this.bufferDir, `${this.sessionId}-candidates.json`);
    this._data = null;
  }

  initialize() {
    if (this._data) {
      return this;
    }

    this._data = readJson(this.bufferFile, null) || this._createEmptyState();
    if (!Array.isArray(this._data.candidates)) {
      this._data.candidates = [];
    }
    return this;
  }

  _createEmptyState() {
    return {
      session_id: this.sessionId,
      created_at: nowIso(),
      updated_at: nowIso(),
      candidates: []
    };
  }

  _normalizeCandidate(candidate) {
    const normalized = {
      id: candidate?.id || crypto.randomUUID(),
      source: candidate?.source || 'unknown',
      category: candidate?.category || 'issue',
      raw: sanitizeObject(candidate?.raw || {}, this.config.sanitization?.maxFieldLength || 200),
      score: Number.isFinite(candidate?.score) ? candidate.score : 0,
      priority: normalizePriority(candidate?.priority),
      captured_at: candidate?.captured_at || nowIso(),
      taxonomy: candidate?.taxonomy || null,
      repeat_count: Math.max(1, Number(candidate?.repeat_count) || 1),
      confidence: normalizeUnitInterval(candidate?.confidence),
      impact_path: candidate?.impact_path ? sanitizeString(candidate.impact_path, 160) : null,
      novelty_score: normalizeUnitInterval(candidate?.novelty_score),
      severity_score: normalizeUnitInterval(candidate?.severity_score)
    };

    normalized.dedup_key = candidate?.dedup_key || createDedupKey([
      normalized.source,
      normalized.category,
      normalized.taxonomy,
      normalized.raw
    ]);

    return normalized;
  }

  flush() {
    this.initialize();
    this._data.updated_at = nowIso();
    writeJson(this.bufferFile, this._data);
    return this.bufferFile;
  }

  add(candidate) {
    this.initialize();
    this._data.candidates.push(this._normalizeCandidate(candidate));
    if (this._data.candidates.length > this.maxCandidates) {
      this._data.candidates = this._data.candidates.slice(this._data.candidates.length - this.maxCandidates);
    }
    this.flush();
    return this;
  }

  addMany(candidates) {
    this.initialize();
    (Array.isArray(candidates) ? candidates : [candidates])
      .filter(Boolean)
      .forEach(candidate => {
        this._data.candidates.push(this._normalizeCandidate(candidate));
      });

    if (this._data.candidates.length > this.maxCandidates) {
      this._data.candidates = this._data.candidates.slice(this._data.candidates.length - this.maxCandidates);
    }

    this.flush();
    return this;
  }

  list() {
    this.initialize();
    return [...this._data.candidates];
  }

  drain() {
    this.initialize();
    const drained = [...this._data.candidates];
    this._data.candidates = [];
    this.flush();
    return drained;
  }

  clear() {
    this.initialize();
    this._data = this._createEmptyState();
    this.flush();
    return this;
  }

  getPriorityCount(priority) {
    return this.list().filter(candidate => candidate.priority === normalizePriority(priority)).length;
  }

  getStats() {
    const candidates = this.list();
    const oldest = candidates[0]?.captured_at || null;

    return {
      session_id: this.sessionId,
      count: candidates.length,
      priorities: {
        normal: this.getPriorityCount('normal'),
        high: this.getPriorityCount('high'),
        immediate: this.getPriorityCount('immediate')
      },
      oldest_captured_at: oldest,
      oldest_age_minutes: oldest ? ageMinutes(oldest) : 0
    };
  }
}

function printUsage() {
  console.error('Usage: node reflection-candidate-buffer.js <add|drain|stats|clear> [json]');
}

if (require.main === module) {
  const command = process.argv[2];
  const payload = process.argv[3];
  const buffer = new ReflectionCandidateBuffer();

  if (!command) {
    printUsage();
    process.exit(1);
  }

  try {
    switch (command) {
      case 'add': {
        const parsed = payload ? JSON.parse(payload) : [];
        buffer.addMany(parsed);
        process.stdout.write(`${JSON.stringify(buffer.getStats())}\n`);
        break;
      }
      case 'drain':
        process.stdout.write(`${JSON.stringify(buffer.drain())}\n`);
        break;
      case 'stats':
        process.stdout.write(`${JSON.stringify(buffer.getStats())}\n`);
        break;
      case 'clear':
        buffer.clear();
        process.stdout.write(`${JSON.stringify(buffer.getStats())}\n`);
        break;
      default:
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  ReflectionCandidateBuffer
};
