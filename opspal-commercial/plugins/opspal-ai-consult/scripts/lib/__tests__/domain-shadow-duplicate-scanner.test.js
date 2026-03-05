'use strict';

const {
  parseArgs,
  normalizeDomain,
  inferFieldMap,
  parseGeminiDomainResponse,
  clusterShadowDuplicates
} = require('../domain-shadow-duplicate-scanner');

describe('domain-shadow-duplicate-scanner', () => {
  describe('parseArgs', () => {
    it('defaults to deterministic-first resolution mode', () => {
      const parsed = parseArgs([]);
      expect(parsed.resolutionMode).toBe('deterministic-first');
    });

    it('accepts explicit resolution mode', () => {
      const parsed = parseArgs(['--resolution-mode', 'hybrid']);
      expect(parsed.resolutionMode).toBe('hybrid');
    });

    it('rejects invalid resolution mode', () => {
      expect(() => parseArgs(['--resolution-mode', 'invalid-mode']))
        .toThrow('--resolution-mode must be one of');
    });
  });

  describe('normalizeDomain', () => {
    it('normalizes URL hosts', () => {
      expect(normalizeDomain('https://www.Example.com/path')).toBe('example.com');
    });

    it('extracts domain from email-like values', () => {
      expect(normalizeDomain('owner@acme.io')).toBe('acme.io');
    });

    it('returns null for invalid domain strings', () => {
      expect(normalizeDomain('not-a-domain')).toBeNull();
    });
  });

  describe('inferFieldMap', () => {
    it('auto-detects id/name/website fields from headers', () => {
      const records = [
        {
          AccountId: '001xx000003DHP0',
          AccountName: 'Acme',
          Website_URL: 'https://acme.com'
        }
      ];

      const fields = inferFieldMap(records, {});

      expect(fields.idField).toBe('AccountId');
      expect(fields.nameField).toBe('AccountName');
      expect(fields.websiteField).toBe('Website_URL');
    });
  });

  describe('parseGeminiDomainResponse', () => {
    it('parses fenced JSON and backfills missing domains as unresolved', () => {
      const geminiResponse = {
        content: '```json\n{"results":[{"inputDomain":"oldco.com","resolvedDomain":"newco.com","status":"redirected","confidence":0.91,"acquisitionSignal":true,"notes":"Acquired"}]}\n```'
      };

      const parsed = parseGeminiDomainResponse(geminiResponse, ['oldco.com', 'solo.com']);
      const byDomain = new Map(parsed.map((entry) => [entry.inputDomain, entry]));

      expect(byDomain.get('oldco.com').resolvedDomain).toBe('newco.com');
      expect(byDomain.get('oldco.com').status).toBe('redirected');
      expect(byDomain.get('oldco.com').acquisitionSignal).toBe(true);
      expect(byDomain.get('oldco.com').resolutionMethod).toBe('gemini');

      expect(byDomain.get('solo.com').resolvedDomain).toBeNull();
      expect(byDomain.get('solo.com').status).toBe('unresolved');
      expect(byDomain.get('solo.com').resolutionMethod).toBe('none');
    });
  });

  describe('clusterShadowDuplicates', () => {
    it('groups records when distinct input domains resolve to same canonical domain', () => {
      const records = [
        {
          sourceSystem: 'salesforce',
          sourceRecordId: '001A',
          companyName: 'Old Co',
          website: 'oldco.com',
          inputDomain: 'oldco.com',
          resolvedDomain: 'newco.com',
          status: 'redirected',
          confidence: 0.8,
          acquisitionSignal: true,
          notes: 'redirected'
        },
        {
          sourceSystem: 'hubspot',
          sourceRecordId: 'hs-2',
          companyName: 'New Co',
          website: 'newco.com',
          inputDomain: 'newco.com',
          resolvedDomain: 'newco.com',
          status: 'active',
          confidence: 0.9,
          acquisitionSignal: false,
          notes: null
        },
        {
          sourceSystem: 'hubspot',
          sourceRecordId: 'hs-3',
          companyName: 'Solo Co',
          website: 'solo.com',
          inputDomain: 'solo.com',
          resolvedDomain: 'solo.com',
          status: 'active',
          confidence: 0.95,
          acquisitionSignal: false,
          notes: null
        }
      ];

      const groups = clusterShadowDuplicates(records);

      expect(groups).toHaveLength(1);
      expect(groups[0].resolvedDomain).toBe('newco.com');
      expect(groups[0].memberCount).toBe(2);
      expect(groups[0].likelyAcquisition).toBe(true);
      expect(groups[0].uniqueInputDomains).toEqual(['newco.com', 'oldco.com']);
    });
  });
});
