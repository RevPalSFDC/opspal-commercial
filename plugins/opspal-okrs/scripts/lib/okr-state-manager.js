#!/usr/bin/env node
/**
 * OKR State Manager
 *
 * Manages per-org OKR persistence: creating, reading, updating, and
 * transitioning OKR cycle states.
 *
 * Usage:
 *   node okr-state-manager.js create <org> <cycle>          # Create new cycle workspace
 *   node okr-state-manager.js status <org> <cycle>          # Get cycle status
 *   node okr-state-manager.js transition <org> <cycle> <to> # Transition state
 *   node okr-state-manager.js list <org>                    # List all cycles for org
 */

'use strict';

const fs = require('fs');
const path = require('path');

const VALID_STATES = ['draft', 'scoring', 'approved', 'active', 'closed'];
const VALID_TRANSITIONS = {
  draft: ['scoring', 'draft'],
  scoring: ['approved', 'draft'],
  approved: ['active'],
  active: ['closed'],
  closed: []
};

function getOrgDir(org) {
  const root = process.env.PLUGIN_ROOT || path.resolve(__dirname, '..', '..');
  const projectRoot = path.resolve(root, '..', '..');
  return path.join(projectRoot, 'orgs', org, 'platforms', 'okr');
}

function getCycleDir(org, cycle) {
  return path.join(getOrgDir(org), cycle);
}

function createCycle(org, cycle) {
  const cycleDir = getCycleDir(org, cycle);
  const dirs = ['snapshots', 'drafts', 'approved', 'reports'];

  for (const dir of dirs) {
    const fullPath = path.join(cycleDir, dir);
    fs.mkdirSync(fullPath, { recursive: true });
  }

  const stateFile = path.join(cycleDir, 'cycle-state.json');
  if (!fs.existsSync(stateFile)) {
    const state = {
      org,
      cycle,
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      transitions: [
        { from: null, to: 'draft', at: new Date().toISOString(), by: 'system' }
      ]
    };
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  }

  return { success: true, path: cycleDir, status: 'draft' };
}

function getStatus(org, cycle) {
  const stateFile = path.join(getCycleDir(org, cycle), 'cycle-state.json');
  if (!fs.existsSync(stateFile)) {
    console.error(JSON.stringify({ error: `Cycle ${cycle} not found for org ${org}` }));
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
}

function transitionState(org, cycle, toState) {
  if (!VALID_STATES.includes(toState)) {
    console.error(JSON.stringify({ error: `Invalid state: ${toState}. Valid: ${VALID_STATES.join(', ')}` }));
    process.exit(1);
  }

  const stateFile = path.join(getCycleDir(org, cycle), 'cycle-state.json');
  if (!fs.existsSync(stateFile)) {
    console.error(JSON.stringify({ error: `Cycle ${cycle} not found for org ${org}` }));
    process.exit(1);
  }

  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const allowed = VALID_TRANSITIONS[state.status] || [];

  if (!allowed.includes(toState)) {
    console.error(JSON.stringify({
      error: `Cannot transition from ${state.status} to ${toState}`,
      allowed_transitions: allowed
    }));
    process.exit(1);
  }

  const previousStatus = state.status;
  state.status = toState;
  state.updated_at = new Date().toISOString();
  state.transitions.push({
    from: previousStatus,
    to: toState,
    at: new Date().toISOString(),
    by: 'user'
  });

  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  return { success: true, from: previousStatus, to: toState };
}

function listCycles(org) {
  const orgDir = getOrgDir(org);
  if (!fs.existsSync(orgDir)) {
    return { org, cycles: [] };
  }

  const entries = fs.readdirSync(orgDir, { withFileTypes: true });
  const cycles = [];

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== 'snapshots') {
      const stateFile = path.join(orgDir, entry.name, 'cycle-state.json');
      if (fs.existsSync(stateFile)) {
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        cycles.push({
          cycle: entry.name,
          status: state.status,
          created_at: state.created_at,
          updated_at: state.updated_at
        });
      }
    }
  }

  return { org, cycles };
}

// CLI
function runCli() {
  const [,, command, org, cycle, extra] = process.argv;

  switch (command) {
    case 'create':
      if (!org || !cycle) { console.error('Usage: okr-state-manager.js create <org> <cycle>'); process.exit(1); }
      console.log(JSON.stringify(createCycle(org, cycle), null, 2));
      break;
    case 'status':
      if (!org || !cycle) { console.error('Usage: okr-state-manager.js status <org> <cycle>'); process.exit(1); }
      console.log(JSON.stringify(getStatus(org, cycle), null, 2));
      break;
    case 'transition':
      if (!org || !cycle || !extra) { console.error('Usage: okr-state-manager.js transition <org> <cycle> <to-state>'); process.exit(1); }
      console.log(JSON.stringify(transitionState(org, cycle, extra), null, 2));
      break;
    case 'list':
      if (!org) { console.error('Usage: okr-state-manager.js list <org>'); process.exit(1); }
      console.log(JSON.stringify(listCycles(org), null, 2));
      break;
    default:
      console.error('Usage: okr-state-manager.js <create|status|transition|list> <org> [cycle] [state]');
      process.exit(1);
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  VALID_STATES,
  VALID_TRANSITIONS,
  createCycle,
  getOrgDir,
  getCycleDir,
  getStatus,
  listCycles,
  runCli,
  transitionState
};
