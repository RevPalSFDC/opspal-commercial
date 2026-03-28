'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = process.env.HOME || os.homedir();
const AMBIENT_DIR = path.join(HOME, '.claude', 'ambient-reflections');
const SESSION_CONTEXT_DIR = path.join(HOME, '.claude', 'session-context');
const CURRENT_SESSION_FILE = path.join(SESSION_CONTEXT_DIR, '.current_session');
const SESSION_ENV_FILE = path.join(HOME, '.claude', 'session.env');
const DEFAULT_MAX_FIELD_LENGTH = 200;

const PRIORITY_RANK = {
  normal: 1,
  high: 2,
  immediate: 3
};

function ensureDir(dirPath) {
  if (!dirPath) {
    return dirPath;
  }
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function readJson(filePath, fallback = null) {
  if (!filePath || !fs.existsSync(filePath)) {
    return fallback;
  }
  return safeJsonParse(fs.readFileSync(filePath, 'utf8'), fallback);
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return filePath;
}

function readJsonl(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }

  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => safeJsonParse(line, null))
    .filter(Boolean);
}

function appendJsonl(filePath, entry) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
  return filePath;
}

function clip(value, maxLength = DEFAULT_MAX_FIELD_LENGTH) {
  const text = value === undefined || value === null ? '' : String(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 12))}...[truncated]`;
}

function sanitizeString(value, maxLength = DEFAULT_MAX_FIELD_LENGTH) {
  let text = value === undefined || value === null ? '' : String(value);
  text = text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]')
    .replace(/Bearer\s+[A-Za-z0-9\-_.~+/=]+/gi, 'Bearer [TOKEN]')
    .replace(/\b(api[_-]?key|token|secret|password|passwd|pwd)\b\s*[:=]\s*["']?[A-Za-z0-9\-_.~+/=]{8,}["']?/gi, '$1=[REDACTED]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]')
    .replace(/\/(?:home|Users)\/[^\s/]+/g, '/[USER]')
    .replace(/\s+/g, ' ')
    .trim();

  return clip(text, maxLength);
}

function sanitizeValue(value, maxLength = DEFAULT_MAX_FIELD_LENGTH) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeString(value, maxLength);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map(item => sanitizeValue(item, maxLength));
  }

  if (typeof value === 'object') {
    const sanitized = {};
    Object.entries(value).slice(0, 20).forEach(([key, entryValue]) => {
      if (/(password|token|secret|key|credential|auth)/i.test(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeValue(entryValue, maxLength);
      }
    });
    return sanitized;
  }

  return clip(value, maxLength);
}

function sanitizeObject(value, maxLength = DEFAULT_MAX_FIELD_LENGTH) {
  const sanitized = sanitizeValue(value, maxLength);
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    return {};
  }
  return sanitized;
}

function createDedupKey(parts) {
  const normalized = []
    .concat(parts || [])
    .flatMap(part => {
      if (part === undefined || part === null) {
        return [];
      }
      if (typeof part === 'string') {
        return [part];
      }
      return [JSON.stringify(part)];
    })
    .join('|');

  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function normalizePriority(priority) {
  const normalized = String(priority || 'normal').trim().toLowerCase();
  return PRIORITY_RANK[normalized] ? normalized : 'normal';
}

function comparePriority(left, right) {
  return (PRIORITY_RANK[normalizePriority(left)] || 0) - (PRIORITY_RANK[normalizePriority(right)] || 0);
}

function resolveSessionId(explicitSessionId) {
  if (explicitSessionId) {
    return explicitSessionId;
  }

  if (process.env.CLAUDE_SESSION_ID && process.env.CLAUDE_SESSION_ID.trim()) {
    return process.env.CLAUDE_SESSION_ID.trim();
  }

  for (const filePath of [CURRENT_SESSION_FILE, SESSION_ENV_FILE]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/CLAUDE_SESSION_ID=['"]?([^'"\n]+)['"]?/);
    if (match && match[1]) {
      return match[1];
    }
  }

  return 'ambient-unknown';
}

function loadSessionContext(sessionId = resolveSessionId()) {
  return readJson(path.join(SESSION_CONTEXT_DIR, `${sessionId}.json`), null);
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (error) {
    return '';
  }
}

function ageMinutes(isoTimestamp, now = Date.now()) {
  const value = Date.parse(isoTimestamp);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, (now - value) / 60000);
}

function normalizedPatternKey(value) {
  return sanitizeString(value || '', 160)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

module.exports = {
  AMBIENT_DIR,
  CURRENT_SESSION_FILE,
  DEFAULT_MAX_FIELD_LENGTH,
  PRIORITY_RANK,
  SESSION_CONTEXT_DIR,
  SESSION_ENV_FILE,
  ageMinutes,
  appendJsonl,
  clip,
  comparePriority,
  createDedupKey,
  ensureDir,
  loadSessionContext,
  normalizePriority,
  normalizedPatternKey,
  nowIso,
  readJson,
  readJsonl,
  readStdin,
  resolveSessionId,
  safeJsonParse,
  sanitizeObject,
  sanitizeString,
  sanitizeValue,
  writeJson
};
