#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const STATE_DIR = path.join(ROOT, 'state');
const DEFAULT_TELEMETRY_FILE = path.join(STATE_DIR, 'command-telemetry.ndjson');

const VALID_OUTCOMES = new Set(['success', 'partial', 'failed', 'blocked']);
const VALID_RISK_CLASSES = new Set(['low', 'medium', 'high', 'critical']);
const DISABLE_VALUES = new Set(['0', 'false', 'off', 'no']);

function isTelemetryDisabled() {
  const raw = process.env.OPSPAL_COMMAND_TELEMETRY_ENABLED;
  if (raw == null) {
    return false;
  }
  return DISABLE_VALUES.has(String(raw).trim().toLowerCase());
}

function normalizeOutcome(value) {
  const candidate = String(value || '').trim().toLowerCase();
  if (VALID_OUTCOMES.has(candidate)) {
    return candidate;
  }
  return 'success';
}

function normalizeRiskClass(value) {
  if (value == null || value === '') {
    return null;
  }
  const candidate = String(value).trim().toLowerCase();
  if (VALID_RISK_CLASSES.has(candidate)) {
    return candidate;
  }
  return null;
}

function normalizeNumber(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return fallback;
  }
  return Number(num.toFixed(2));
}

function buildTelemetryEvent(input) {
  const event = {
    timestamp: new Date().toISOString(),
    command: String(input.command || 'unknown-command'),
    agent: String(input.agent || 'unknown-agent'),
    outcome: normalizeOutcome(input.outcome),
    time_saved_estimate_minutes: normalizeNumber(input.time_saved_estimate_minutes, 0),
    human_override: Boolean(input.human_override),
    rework_required: Boolean(input.rework_required),
  };

  const riskClass = normalizeRiskClass(input.risk_class);
  if (riskClass) {
    event.risk_class = riskClass;
  }
  if (input.source_plugin) {
    event.source_plugin = String(input.source_plugin);
  }

  return event;
}

function emitCommandTelemetry(input, options = {}) {
  if (isTelemetryDisabled()) {
    return { written: false, disabled: true, file: path.relative(ROOT, DEFAULT_TELEMETRY_FILE) };
  }

  const event = buildTelemetryEvent(input || {});
  const filePath = options.filePath
    ? path.isAbsolute(options.filePath)
      ? options.filePath
      : path.join(ROOT, options.filePath)
    : DEFAULT_TELEMETRY_FILE;

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, 'utf8');
    return { written: true, disabled: false, file: path.relative(ROOT, filePath) };
  } catch (error) {
    if (options.strict) {
      throw error;
    }
    if (!options.silent) {
      console.warn(`WARN: command telemetry write failed (${error.message})`);
    }
    return {
      written: false,
      disabled: false,
      file: path.relative(ROOT, filePath),
      error: error.message,
    };
  }
}

module.exports = {
  DEFAULT_TELEMETRY_FILE,
  buildTelemetryEvent,
  emitCommandTelemetry,
};

