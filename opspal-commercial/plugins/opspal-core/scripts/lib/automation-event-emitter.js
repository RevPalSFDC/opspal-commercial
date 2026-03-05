#!/usr/bin/env node
'use strict';

/**
 * Automation Event Emitter
 *
 * Writes cross-platform automation events using a normalized schema.
 * Stores JSONL events under logs/automation-events by default.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function createEventId() {
  return `evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

function sanitize(value) {
  if (value == null) return null;

  if (Array.isArray(value)) {
    return value.map(sanitize).slice(0, 100);
  }

  if (typeof value === 'object') {
    const output = {};
    for (const [key, raw] of Object.entries(value)) {
      const lower = String(key).toLowerCase();

      // Redact common secret keys.
      if (
        lower.includes('token') ||
        lower.includes('secret') ||
        lower.includes('authorization') ||
        lower.includes('cookie') ||
        lower.includes('password')
      ) {
        output[key] = '[REDACTED]';
      } else {
        output[key] = sanitize(raw);
      }
    }
    return output;
  }

  if (typeof value === 'string' && value.length > 2000) {
    return `${value.slice(0, 2000)}...[TRUNCATED]`;
  }

  return value;
}

class AutomationEventEmitter {
  constructor(options = {}) {
    const pluginRoot = options.pluginRoot || process.env.CLAUDE_PLUGIN_ROOT || process.cwd();

    this.logDir = options.logDir || path.join(pluginRoot, 'logs', 'automation-events');
    this.source = options.source || 'opspal';
    this.enabled = options.enabled !== false;

    ensureDirectory(this.logDir);
  }

  buildEvent(event = {}) {
    const timestamp = event.timestamp || new Date().toISOString();

    return {
      schema_version: '1.0.0',
      event_id: event.event_id || createEventId(),
      timestamp,
      source: event.source || this.source,
      platform: event.platform || 'unknown',
      category: event.category || 'policy',
      event_type: event.event_type || 'unknown',
      severity: event.severity || 'info',
      correlation_id: event.correlation_id || null,
      operation: event.operation || null,
      instance: event.instance || null,
      auth_method: event.auth_method || null,
      status: event.status || 'observed',
      details: sanitize(event.details || {}),
      metrics: sanitize(event.metrics || {}),
      tags: Array.isArray(event.tags) ? event.tags.slice(0, 25) : []
    };
  }

  emit(event = {}) {
    if (!this.enabled) return null;

    const normalized = this.buildEvent(event);
    const filePath = path.join(this.logDir, `automation-events-${todayDate()}.jsonl`);

    fs.appendFileSync(filePath, `${JSON.stringify(normalized)}\n`, 'utf8');
    return normalized;
  }

  emitPolicyEvent(payload = {}) {
    return this.emit({
      category: 'policy',
      event_type: payload.eventType || 'policy_event',
      severity: payload.severity || 'info',
      platform: payload.platform || 'unknown',
      correlation_id: payload.correlationId || null,
      operation: payload.operation || null,
      instance: payload.instance || null,
      status: payload.status || 'observed',
      details: payload.details || {},
      metrics: payload.metrics || {},
      tags: payload.tags || []
    });
  }
}

module.exports = {
  AutomationEventEmitter
};
