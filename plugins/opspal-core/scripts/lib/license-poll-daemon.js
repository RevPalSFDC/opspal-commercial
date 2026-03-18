#!/usr/bin/env node
'use strict';

/**
 * License Poll Daemon — lightweight background license status checker.
 *
 * Called by the PostToolUse hook (post-tool-use-license-poll.sh).
 * On most invocations (~95%), this reads a state file and exits immediately
 * when the poll interval hasn't elapsed. When it's time to poll, it calls
 * the /api/v1/poll endpoint and detects tier changes, expirations, and
 * revocations.
 *
 * State file: ~/.opspal/last-poll.json
 * Exit: always 0. Warnings to stderr only.
 */

const fs = require('fs');
const path = require('path');

const OPSPAL_DIR = path.join(process.env.HOME, '.opspal');
const STATE_FILE = path.join(OPSPAL_DIR, 'last-poll.json');
const CACHE_FILE = path.join(OPSPAL_DIR, 'license-cache.json');
const LICENSE_KEY_FILE = path.join(OPSPAL_DIR, 'license.key');

const DEFAULT_INTERVAL_HOURS = 4;
const MIN_INTERVAL_HOURS = 0.5;
const MAX_INTERVAL_HOURS = 72;
const MAX_CONSECUTIVE_FAILURES = 3;

// ─── Quick exit checks ──────────────────────────────────────────────────────

function getLicenseKey() {
  if (process.env.OPSPAL_LICENSE_KEY) {
    return process.env.OPSPAL_LICENSE_KEY.trim();
  }
  try {
    if (fs.existsSync(LICENSE_KEY_FILE)) {
      return fs.readFileSync(LICENSE_KEY_FILE, 'utf8').trim();
    }
  } catch { /* fall through */ }
  return null;
}

// No license key → nothing to poll
if (!getLicenseKey()) {
  process.stdout.write('{}');
  process.exit(0);
}

// ─── Interval configuration ─────────────────────────────────────────────────

function getIntervalMs() {
  let hours = parseFloat(process.env.OPSPAL_POLL_INTERVAL_HOURS);
  if (isNaN(hours)) hours = DEFAULT_INTERVAL_HOURS;
  hours = Math.max(MIN_INTERVAL_HOURS, Math.min(MAX_INTERVAL_HOURS, hours));
  return hours * 60 * 60 * 1000;
}

// ─── State management ───────────────────────────────────────────────────────

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    if (!fs.existsSync(OPSPAL_DIR)) {
      fs.mkdirSync(OPSPAL_DIR, { recursive: true, mode: 0o700 });
    }
    const tmpFile = STATE_FILE + '.tmp.' + process.pid;
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(tmpFile, STATE_FILE);
  } catch {
    // Non-fatal — next invocation will retry
  }
}

function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

// ─── Should we poll? ────────────────────────────────────────────────────────

const state = loadState() || {
  last_poll_at: 0,
  consecutive_failures: 0,
  last_result: null
};

const intervalMs = getIntervalMs();
const backoffMultiplier = state.consecutive_failures >= MAX_CONSECUTIVE_FAILURES ? 2 : 1;
const effectiveInterval = intervalMs * backoffMultiplier;
const age = Date.now() - (state.last_poll_at || 0);

if (age < effectiveInterval) {
  // Not due yet — fast exit
  process.stdout.write('{}');
  process.exit(0);
}

// ─── Perform poll ───────────────────────────────────────────────────────────

async function doPoll() {
  const { pollStatus } = require('./license-auth-client');

  let result;
  try {
    result = await pollStatus();
  } catch (err) {
    // Network failure — don't update last_poll_at so we retry sooner
    state.consecutive_failures = (state.consecutive_failures || 0) + 1;
    saveState(state);
    process.stdout.write('{}');
    return;
  }

  // Poll succeeded — reset failure counter
  state.last_poll_at = Date.now();
  state.consecutive_failures = 0;
  state.last_result = result;
  saveState(state);

  // ─── Change detection ─────────────────────────────────────────────────
  const cache = loadCache();
  const previousTier = cache && cache.tier;
  const wasValid = cache && cache.valid !== false;

  // Termination detected
  if (result.terminated) {
    process.stderr.write('\n');
    process.stderr.write('╔══════════════════════════════════════════════════════════════╗\n');
    process.stderr.write('║  ⚠  LICENSE TERMINATED                                      ║\n');
    process.stderr.write('╠══════════════════════════════════════════════════════════════╣\n');
    process.stderr.write(`║  ${(result.message || 'This license has been suspended.').padEnd(57)}║\n`);
    process.stderr.write('║  Local license key and cache have been removed.             ║\n');
    process.stderr.write('║  Contact support@gorevpal.com for assistance.               ║\n');
    process.stderr.write('╚══════════════════════════════════════════════════════════════╝\n');
    process.stderr.write('\n');

    // Wipe local credentials
    try { fs.unlinkSync(LICENSE_KEY_FILE); } catch { /* ok */ }
    try { fs.unlinkSync(CACHE_FILE); } catch { /* ok */ }
    process.stdout.write('{}');
    return;
  }

  // Tier changed
  if (result.valid && previousTier && result.tier !== previousTier) {
    process.stderr.write(`\n[OpsPal] License tier changed: ${previousTier} → ${result.tier}\n`);
    process.stderr.write(`[OpsPal] Start a new session to apply the updated tier.\n\n`);
  }

  // License became invalid (previously was valid)
  if (!result.valid && wasValid) {
    const reason = result.message || result.error || 'unknown';
    process.stderr.write(`\n[OpsPal] License is no longer valid: ${reason}\n`);
    process.stderr.write(`[OpsPal] Run /license-status for details.\n\n`);
  }

  process.stdout.write('{}');
}

doPoll().catch(() => {
  process.stdout.write('{}');
  process.exit(0);
});
