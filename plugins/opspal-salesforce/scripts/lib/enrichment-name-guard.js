#!/usr/bin/env node

'use strict';

const VERDICTS = {
  valid: 'valid',
  challengePage: 'challenge_page',
  placeholderSite: 'placeholder_site',
  blocked: 'blocked'
};

const EXACT_BLOCKED_NAMES = new Map([
  ['jamestown fitness factory', VERDICTS.challengePage],
  ['robot challenge screen', VERDICTS.challengePage],
  ['client challenge', VERDICTS.challengePage],
  ['mysite', VERDICTS.placeholderSite],
  ['squarespace', VERDICTS.placeholderSite]
]);

const PATTERN_RULES = [
  { verdict: VERDICTS.challengePage, pattern: /\bcaptcha\b/i, reason: 'Challenge page content' },
  { verdict: VERDICTS.challengePage, pattern: /\b(robot challenge|client challenge|security check|verify you(?:\'|’)re human|verify your identity)\b/i, reason: 'Challenge page content' },
  { verdict: VERDICTS.challengePage, pattern: /\b(access denied|temporarily blocked|unusual traffic)\b/i, reason: 'Blocked browsing content' },
  { verdict: VERDICTS.placeholderSite, pattern: /\b(squarespace|coming soon|under construction|launching soon)\b/i, reason: 'Site-builder placeholder content' },
  { verdict: VERDICTS.placeholderSite, pattern: /\bmy\s?site\b/i, reason: 'Placeholder site name' }
];

function normalizeName(name) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyEnrichmentName(name) {
  const normalizedName = normalizeName(name);
  const normalizedLower = normalizedName.toLowerCase();

  if (!normalizedName) {
    return {
      verdict: VERDICTS.blocked,
      normalizedName,
      blockReason: 'Empty enrichment name'
    };
  }

  if (EXACT_BLOCKED_NAMES.has(normalizedLower)) {
    return {
      verdict: EXACT_BLOCKED_NAMES.get(normalizedLower),
      normalizedName,
      blockReason: `Blocked enrichment placeholder: ${normalizedName}`
    };
  }

  for (const rule of PATTERN_RULES) {
    if (rule.pattern.test(normalizedName)) {
      return {
        verdict: rule.verdict,
        normalizedName,
        blockReason: rule.reason
      };
    }
  }

  return {
    verdict: VERDICTS.valid,
    normalizedName,
    blockReason: null
  };
}

function isBlockedEnrichmentName(name) {
  return classifyEnrichmentName(name).verdict !== VERDICTS.valid;
}

module.exports = {
  EXACT_BLOCKED_NAMES,
  PATTERN_RULES,
  VERDICTS,
  classifyEnrichmentName,
  isBlockedEnrichmentName,
  normalizeName
};
