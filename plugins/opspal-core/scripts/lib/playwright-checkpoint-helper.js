#!/usr/bin/env node
'use strict';

/**
 * Playwright Checkpoint Helper
 *
 * Enforces a deterministic checkpoint sequence for UI automation:
 * snapshot -> action -> verify -> evidence.
 */

const DESTRUCTIVE_KEYWORDS = [
  'delete',
  'remove',
  'disconnect',
  'revoke',
  'archive',
  'deactivate',
  'publish'
];

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function isDestructiveAction(action = {}) {
  const text = normalizeText(action.label || action.type || action.selector || '');
  return DESTRUCTIVE_KEYWORDS.some(keyword => text.includes(keyword));
}

function requiresManualIntervention(context = {}) {
  const content = normalizeText(context.snapshotText || context.url || context.title || '');

  if (!content) return false;

  return (
    content.includes('captcha') ||
    content.includes('verify your identity') ||
    content.includes('two-factor') ||
    content.includes('mfa') ||
    content.includes('log in')
  );
}

function verifyIdentity(expected = {}, observed = {}) {
  const accountExpected = normalizeText(expected.account || expected.org || expected.portal);
  const accountObserved = normalizeText(observed.account || observed.org || observed.portal || observed.snapshotText);

  if (!accountExpected) {
    return {
      passed: true,
      reason: 'No expected account identity provided.'
    };
  }

  const passed = accountObserved.includes(accountExpected);
  return {
    passed,
    reason: passed
      ? 'Observed identity matches expected target account.'
      : `Identity mismatch. Expected "${accountExpected}" in observed context.`
  };
}

function createCheckpointPlan(actions = []) {
  return actions.map((action, index) => ({
    step: index + 1,
    action,
    requiresSnapshotBefore: true,
    requiresVerificationAfter: true,
    requiresEvidenceCapture: true,
    requiresExplicitConfirmation: isDestructiveAction(action)
  }));
}

module.exports = {
  DESTRUCTIVE_KEYWORDS,
  createCheckpointPlan,
  isDestructiveAction,
  requiresManualIntervention,
  verifyIdentity
};
