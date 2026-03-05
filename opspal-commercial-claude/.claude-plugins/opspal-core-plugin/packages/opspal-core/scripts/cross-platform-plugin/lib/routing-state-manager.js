#!/usr/bin/env node
/**
 * Routing State Manager
 *
 * Manages routing state persistence for compliance tracking between
 * UserPromptSubmit and PostToolUse hooks.
 *
 * Usage:
 *   node routing-state-manager.js save <agent> <blocked> <action>
 *   node routing-state-manager.js get
 *   node routing-state-manager.js clear
 *   node routing-state-manager.js check
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_FILE = path.join(os.homedir(), '.claude', 'routing-state.json');
const STATE_TTL_SECONDS = 60;

/**
 * Save routing state
 * @param {Object} state - Routing state to save
 */
function saveState(state) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const stateWithTimestamp = {
    ...state,
    timestamp: Math.floor(Date.now() / 1000)
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(stateWithTimestamp, null, 2));
  return stateWithTimestamp;
}

/**
 * Get current routing state
 * @returns {Object|null} Routing state or null if expired/missing
 */
function getState() {
  if (!fs.existsSync(STATE_FILE)) {
    return null;
  }

  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

    // Check if state has expired
    const now = Math.floor(Date.now() / 1000);
    const age = now - (state.timestamp || 0);

    if (age > STATE_TTL_SECONDS) {
      clearState();
      return null;
    }

    return state;
  } catch (e) {
    return null;
  }
}

/**
 * Clear routing state
 */
function clearState() {
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }
}

/**
 * Check if state indicates blocking was required
 * @returns {Object} Check result with blocked status and agent
 */
function checkState() {
  const state = getState();

  if (!state) {
    return { hasState: false, blocked: false, agent: null };
  }

  return {
    hasState: true,
    blocked: state.blocked === true || state.blocked === 'true',
    hardBlocked: state.hard_blocked === true || state.hard_blocked === 'true',
    agent: state.agent || null,
    action: state.action || null,
    age: Math.floor(Date.now() / 1000) - (state.timestamp || 0)
  };
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'save':
      const agent = args[1];
      const blocked = args[2] === 'true';
      const action = args[3] || 'BLOCKED';
      const result = saveState({ agent, blocked, action });
      console.log(JSON.stringify(result));
      break;

    case 'get':
      const state = getState();
      console.log(JSON.stringify(state || { state: null }));
      break;

    case 'clear':
      clearState();
      console.log(JSON.stringify({ cleared: true }));
      break;

    case 'check':
      const checkResult = checkState();
      console.log(JSON.stringify(checkResult));
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Usage: routing-state-manager.js <save|get|clear|check> [args]');
      process.exit(1);
  }
}

module.exports = {
  saveState,
  getState,
  clearState,
  checkState,
  STATE_FILE,
  STATE_TTL_SECONDS
};
