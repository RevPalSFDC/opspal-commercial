'use strict';

const path = require('path');

const {
  AMBIENT_DIR,
  ensureDir,
  readJson
} = require('./utils');

const CONFIG_PATH = path.resolve(__dirname, '../../../config/ambient-reflection-config.json');
const VALID_MODES = new Set(['manual_only', 'shadow_mode', 'auto_submit']);

function deepMerge(target, source) {
  const output = { ...(target || {}) };

  Object.entries(source || {}).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = deepMerge(output[key], value);
    } else {
      output[key] = value;
    }
  });

  return output;
}

function parseBooleanEnv(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function loadConfig() {
  const baseConfig = readJson(CONFIG_PATH, {});
  const config = deepMerge({}, baseConfig);

  if (process.env.AMBIENT_REFLECT_MODE && VALID_MODES.has(process.env.AMBIENT_REFLECT_MODE)) {
    config.mode = process.env.AMBIENT_REFLECT_MODE;
  }

  config.mode = VALID_MODES.has(config.mode) ? config.mode : 'shadow_mode';
  config.debug = parseBooleanEnv(process.env.AMBIENT_REFLECT_DEBUG, false);
  config.forceFlush = parseBooleanEnv(process.env.AMBIENT_REFLECT_FORCE_FLUSH, false);
  config.paths = {
    ambientDir: ensureDir(AMBIENT_DIR),
    hookErrorWatermark: path.join(AMBIENT_DIR, '.hook-error-watermark'),
    retryQueueFile: path.join(AMBIENT_DIR, 'ambient-retry-queue.jsonl'),
    skillSignalsFile: path.join(AMBIENT_DIR, 'skill-signals.jsonl')
  };

  return config;
}

module.exports = {
  CONFIG_PATH,
  loadConfig,
  parseBooleanEnv
};
