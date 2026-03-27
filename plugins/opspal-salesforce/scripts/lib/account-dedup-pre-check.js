#!/usr/bin/env node
'use strict';

const { DomainAwareMatcher } = require('../../../opspal-core/scripts/lib/domain-aware-matcher');

const CORPORATE_SUFFIXES = new Set([
  'inc',
  'inc.',
  'llc',
  'l.l.c.',
  'corp',
  'corp.',
  'corporation',
  'company',
  'co',
  'co.',
  'ltd',
  'ltd.',
  'limited'
]);

function getSearchToken(name) {
  return String(name || '')
    .split(/[^A-Za-z0-9]+/)
    .map(token => token.trim())
    .filter(token => token.length > 2)
    .find(token => !CORPORATE_SUFFIXES.has(token.toLowerCase())) || '';
}

function normalizeAccountRecord(record = {}) {
  return {
    id: record.id || record.Id || null,
    name: record.name || record.Name || '',
    website: record.website || record.Website || '',
    emailDomains: record.emailDomains || record.contactEmailDomains || [],
    contacts: record.contacts || []
  };
}

function findPotentialDuplicateAccounts(inputAccounts, existingAccounts, options = {}) {
  const matcher = new DomainAwareMatcher({
    autoDetect: false
  });
  const threshold = Number.parseInt(options.threshold || '85', 10);

  return inputAccounts.map((rawInput) => {
    const input = normalizeAccountRecord(rawInput);
    const sourceDomains = matcher.extractRecordDomains(input);
    const targets = existingAccounts.map(normalizeAccountRecord);
    const matches = matcher.match(input.name, targets, {
      minConfidence: threshold,
      sourceRecord: input,
      sourceDomains
    });

    return {
      input,
      searchToken: getSearchToken(input.name),
      matches
    };
  });
}

if (require.main === module) {
  const [inputJson = '[]', existingJson = '[]', threshold = '85'] = process.argv.slice(2);
  const inputAccounts = JSON.parse(inputJson);
  const existingAccounts = JSON.parse(existingJson);
  console.log(JSON.stringify(findPotentialDuplicateAccounts(inputAccounts, existingAccounts, { threshold })));
}

module.exports = {
  getSearchToken,
  normalizeAccountRecord,
  findPotentialDuplicateAccounts
};
