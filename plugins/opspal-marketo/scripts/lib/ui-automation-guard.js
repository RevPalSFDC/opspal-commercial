#!/usr/bin/env node

'use strict';

const DESTRUCTIVE_KEYWORDS = [
  'delete',
  'remove',
  'disconnect',
  'revoke',
  'archive',
  'deactivate',
  'publish'
];

const DEFAULT_MANUAL_INTERVENTION_SIGNALS = [
  'captcha',
  'verify your identity',
  'two-factor',
  'mfa',
  'log in'
];

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isDestructiveAction(action = {}) {
  const text = normalizeText(action.label || action.type || action.selector || '');
  return DESTRUCTIVE_KEYWORDS.some(keyword => text.includes(keyword));
}

function getManualInterventionSignals(context = {}, extraSignals = []) {
  const content = normalizeText(context.snapshotText || context.url || context.title || '');
  if (!content) return [];

  const signals = Array.from(new Set([
    ...DEFAULT_MANUAL_INTERVENTION_SIGNALS,
    ...(Array.isArray(extraSignals) ? extraSignals.map(signal => normalizeText(signal)).filter(Boolean) : [])
  ]));

  return signals.filter(signal => content.includes(signal));
}

function requiresManualIntervention(context = {}, extraSignals = []) {
  return getManualInterventionSignals(context, extraSignals).length > 0;
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

function normalizeCondition(condition) {
  if (typeof condition === 'string') {
    const description = condition.trim();
    return description ? { description, text: description } : null;
  }

  if (!condition || typeof condition !== 'object') {
    return null;
  }

  const normalized = {
    description: String(condition.description || condition.text || condition.selector || condition.urlIncludes || condition.titleIncludes || '').trim(),
    text: typeof condition.text === 'string' ? condition.text.trim() : '',
    selector: typeof condition.selector === 'string' ? condition.selector.trim() : '',
    urlIncludes: typeof condition.urlIncludes === 'string' ? condition.urlIncludes.trim() : '',
    titleIncludes: typeof condition.titleIncludes === 'string' ? condition.titleIncludes.trim() : ''
  };

  const hasMatcher = Boolean(normalized.text || normalized.selector || normalized.urlIncludes || normalized.titleIncludes);
  if (!normalized.description || !hasMatcher) {
    return null;
  }

  return normalized;
}

function validateExecutionContract(contract = {}) {
  const requestedAction = String(contract.requestedAction || contract.requested_action || '').trim();
  const successCondition = normalizeCondition(contract.successCondition || contract.success_condition);
  const failureCondition = normalizeCondition(contract.failureCondition || contract.failure_condition);
  const manualInterventionSignals = Array.isArray(contract.manualInterventionSignals)
    ? contract.manualInterventionSignals.map(signal => String(signal || '').trim()).filter(Boolean)
    : [];

  const errors = [];

  if (!requestedAction) {
    errors.push('Execution contract must include requestedAction.');
  }

  if (!successCondition) {
    errors.push('Execution contract must include a successCondition with description and matcher.');
  }

  if (!failureCondition) {
    errors.push('Execution contract must include a failureCondition with description and matcher.');
  }

  return {
    valid: errors.length === 0,
    errors,
    contract: {
      requestedAction,
      successCondition,
      failureCondition,
      manualInterventionSignals
    }
  };
}

function assertExecutionContract(contract = {}) {
  const result = validateExecutionContract(contract);
  if (!result.valid) {
    throw new Error(result.errors.join(' '));
  }
  return result.contract;
}

module.exports = {
  assertExecutionContract,
  createCheckpointPlan,
  isDestructiveAction,
  requiresManualIntervention,
  sleep,
  verifyIdentity
};
