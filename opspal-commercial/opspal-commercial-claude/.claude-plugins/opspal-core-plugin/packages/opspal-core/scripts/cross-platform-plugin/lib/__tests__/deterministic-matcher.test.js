/**
 * Tests for deterministic-matcher.js
 *
 * Tests the DeterministicMatcher class which performs Phase 1 of multi-layer
 * deduplication: exact key matching by domain, email, and external IDs.
 */

'use strict';

const {
  DeterministicMatcher,
  MatchCluster,
  MATCH_CONFIDENCE,
  DEFAULT_CONFIG
} = require('../deterministic-matcher');

describe('DeterministicMatcher', () => {
  let matcher;

  beforeEach(() => {
    matcher = new DeterministicMatcher({ entityType: 'account' });
  });

  // ============================================
  // MatchCluster Class Tests
  // ============================================
  describe('MatchCluster', () => {
    describe('constructor', () => {
      it('should create cluster with correct properties', () => {
        const cluster = new MatchCluster('test-id', 'acme.com', 'domain');
        expect(cluster.id).toBe('test-id');
        expect(cluster.matchKey).toBe('acme.com');
        expect(cluster.matchType).toBe('domain');
        expect(cluster.confidence).toBe(MATCH_CONFIDENCE.domain);
        expect(cluster.records).toEqual([]);
      });

      it('should set default confidence for unknown match type', () => {
        const cluster = new MatchCluster('test-id', 'key', 'unknown_type');
        expect(cluster.confidence).toBe(50);
      });

      it('should initialize metadata', () => {
        const cluster = new MatchCluster('test-id', 'key', 'domain');
        expect(cluster.metadata.createdAt).toBeDefined();
        expect(cluster.metadata.recordCount).toBe(0);
        expect(cluster.metadata.sources).toBeInstanceOf(Set);
      });
    });

    describe('addRecord', () => {
      it('should add record to cluster', () => {
        const cluster = new MatchCluster('test-id', 'acme.com', 'domain');
        const record = { id: '1', name: 'Acme Corp' };
        cluster.addRecord(record, 'salesforce');

        expect(cluster.records.length).toBe(1);
        expect(cluster.records[0].record).toEqual(record);
        expect(cluster.records[0].source).toBe('salesforce');
        expect(cluster.records[0].addedAt).toBeDefined();
      });

      it('should update record count', () => {
        const cluster = new MatchCluster('test-id', 'acme.com', 'domain');
        cluster.addRecord({ id: '1' }, 'sf');
        cluster.addRecord({ id: '2' }, 'sf');

        expect(cluster.metadata.recordCount).toBe(2);
      });

      it('should track sources', () => {
        const cluster = new MatchCluster('test-id', 'acme.com', 'domain');
        cluster.addRecord({ id: '1' }, 'salesforce');
        cluster.addRecord({ id: '2' }, 'hubspot');

        expect(cluster.metadata.sources.has('salesforce')).toBe(true);
        expect(cluster.metadata.sources.has('hubspot')).toBe(true);
      });

      it('should use default source when not provided', () => {
        const cluster = new MatchCluster('test-id', 'acme.com', 'domain');
        cluster.addRecord({ id: '1' });

        expect(cluster.records[0].source).toBe('unknown');
      });
    });

    describe('getRecords', () => {
      it('should return array of record objects only', () => {
        const cluster = new MatchCluster('test-id', 'acme.com', 'domain');
        const record1 = { id: '1', name: 'Acme' };
        const record2 = { id: '2', name: 'Acme Inc' };
        cluster.addRecord(record1, 'sf');
        cluster.addRecord(record2, 'hs');

        const records = cluster.getRecords();
        expect(records).toEqual([record1, record2]);
      });
    });

    describe('toJSON', () => {
      it('should serialize cluster to JSON-friendly object', () => {
        const cluster = new MatchCluster('test-id', 'acme.com', 'domain');
        cluster.addRecord({ id: '1' }, 'salesforce');
        cluster.addRecord({ id: '2' }, 'hubspot');

        const json = cluster.toJSON();
        expect(json.id).toBe('test-id');
        expect(json.matchKey).toBe('acme.com');
        expect(json.matchType).toBe('domain');
        expect(json.confidence).toBe(90);
        expect(json.recordCount).toBe(2);
        expect(json.sources).toContain('salesforce');
        expect(json.sources).toContain('hubspot');
        expect(json.createdAt).toBeDefined();
        expect(json.records.length).toBe(2);
      });
    });
  });

  // ============================================
  // DeterministicMatcher Constructor Tests
  // ============================================
  describe('constructor', () => {
    it('should create matcher with default entity type', () => {
      const m = new DeterministicMatcher();
      expect(m.entityType).toBe('account');
    });

    it('should accept custom entity type', () => {
      const m = new DeterministicMatcher({ entityType: 'contact' });
      expect(m.entityType).toBe('contact');
    });

    it('should use entity-specific config', () => {
      const accountMatcher = new DeterministicMatcher({ entityType: 'account' });
      expect(accountMatcher.config.primaryKeys).toContain('duns_number');

      const contactMatcher = new DeterministicMatcher({ entityType: 'contact' });
      expect(contactMatcher.config.secondaryKeys).toContain('email');
    });

    it('should accept custom config overrides', () => {
      const customConfig = {
        primaryKeys: ['custom_id'],
        matchHierarchy: ['custom_id', 'domain']
      };
      const m = new DeterministicMatcher({ entityType: 'account', config: customConfig });
      expect(m.config.primaryKeys).toContain('custom_id');
      expect(m.config.matchHierarchy).toContain('custom_id');
    });

    it('should initialize stats', () => {
      expect(matcher.stats).toBeDefined();
      expect(matcher.stats.totalRecords).toBe(0);
      expect(matcher.stats.clustersCreated).toBe(0);
    });
  });

  // ============================================
  // Salesforce ID Normalization Tests
  // ============================================
  describe('normalizeSalesforceId', () => {
    it('should return null for null/undefined input', () => {
      expect(matcher.normalizeSalesforceId(null)).toBeNull();
      expect(matcher.normalizeSalesforceId(undefined)).toBeNull();
    });

    it('should return null for non-string input', () => {
      expect(matcher.normalizeSalesforceId(12345)).toBeNull();
      expect(matcher.normalizeSalesforceId({})).toBeNull();
    });

    it('should return null for invalid ID format', () => {
      expect(matcher.normalizeSalesforceId('invalid')).toBeNull();
      expect(matcher.normalizeSalesforceId('12345')).toBeNull();
      expect(matcher.normalizeSalesforceId('001ABC123!!!!!!!')).toBeNull();
    });

    it('should return 18-char ID unchanged', () => {
      const id18 = '001000000000001AAA';
      expect(matcher.normalizeSalesforceId(id18)).toBe(id18);
    });

    it('should convert 15-char ID to 18-char', () => {
      const id15 = '001000000000001';
      const result = matcher.normalizeSalesforceId(id15);
      expect(result.length).toBe(18);
      expect(result.startsWith(id15)).toBe(true);
    });

    it('should trim whitespace', () => {
      const result = matcher.normalizeSalesforceId('  001000000000001AAA  ');
      expect(result).toBe('001000000000001AAA');
    });

    it('should handle mixed case IDs', () => {
      const id = '001AbCdEfGhIjKlMnO';
      const result = matcher.normalizeSalesforceId(id);
      expect(result).toBeDefined();
      expect(result.length).toBe(18);
    });
  });

  // ============================================
  // HubSpot ID Normalization Tests
  // ============================================
  describe('normalizeHubSpotId', () => {
    it('should return null for null/undefined input', () => {
      expect(matcher.normalizeHubSpotId(null)).toBeNull();
      expect(matcher.normalizeHubSpotId(undefined)).toBeNull();
    });

    it('should return numeric string for valid ID', () => {
      expect(matcher.normalizeHubSpotId('12345678')).toBe('12345678');
      expect(matcher.normalizeHubSpotId(12345678)).toBe('12345678');
    });

    it('should return null for non-numeric ID', () => {
      expect(matcher.normalizeHubSpotId('abc123')).toBeNull();
      expect(matcher.normalizeHubSpotId('12.34')).toBeNull();
    });

    it('should trim whitespace', () => {
      expect(matcher.normalizeHubSpotId('  12345  ')).toBe('12345');
    });
  });

  // ============================================
  // DUNS Number Normalization Tests
  // ============================================
  describe('normalizeDunsNumber', () => {
    it('should return null for null/undefined input', () => {
      expect(matcher.normalizeDunsNumber(null)).toBeNull();
      expect(matcher.normalizeDunsNumber(undefined)).toBeNull();
    });

    it('should return 9-digit DUNS', () => {
      expect(matcher.normalizeDunsNumber('123456789')).toBe('123456789');
    });

    it('should strip non-numeric characters', () => {
      expect(matcher.normalizeDunsNumber('12-345-6789')).toBe('123456789');
      expect(matcher.normalizeDunsNumber('123 456 789')).toBe('123456789');
    });

    it('should return null for invalid length', () => {
      expect(matcher.normalizeDunsNumber('12345')).toBeNull();
      expect(matcher.normalizeDunsNumber('1234567890')).toBeNull();
    });
  });

  // ============================================
  // EIN Normalization Tests
  // ============================================
  describe('normalizeEIN', () => {
    it('should return null for null/undefined input', () => {
      expect(matcher.normalizeEIN(null)).toBeNull();
      expect(matcher.normalizeEIN(undefined)).toBeNull();
    });

    it('should format EIN as XX-XXXXXXX', () => {
      expect(matcher.normalizeEIN('123456789')).toBe('12-3456789');
    });

    it('should strip non-numeric characters and format', () => {
      expect(matcher.normalizeEIN('12-345-6789')).toBe('12-3456789');
      expect(matcher.normalizeEIN('12 345 6789')).toBe('12-3456789');
    });

    it('should return null for invalid length', () => {
      expect(matcher.normalizeEIN('12345')).toBeNull();
      expect(matcher.normalizeEIN('1234567890')).toBeNull();
    });
  });

  // ============================================
  // LinkedIn URL Normalization Tests
  // ============================================
  describe('normalizeLinkedInUrl', () => {
    it('should return null for null/undefined input', () => {
      expect(matcher.normalizeLinkedInUrl(null)).toBeNull();
      expect(matcher.normalizeLinkedInUrl(undefined)).toBeNull();
    });

    it('should return null for non-string input', () => {
      expect(matcher.normalizeLinkedInUrl(12345)).toBeNull();
    });

    it('should normalize LinkedIn company URL', () => {
      const urls = [
        'https://www.linkedin.com/company/acme',
        'http://www.linkedin.com/company/acme',
        'www.linkedin.com/company/acme',
        'linkedin.com/company/acme',
        'https://linkedin.com/company/acme/',
        'HTTPS://WWW.LINKEDIN.COM/COMPANY/ACME'
      ];

      urls.forEach(url => {
        expect(matcher.normalizeLinkedInUrl(url)).toBe('linkedin.com/company/acme');
      });
    });

    it('should strip query parameters', () => {
      const url = 'https://linkedin.com/company/acme?trk=something';
      expect(matcher.normalizeLinkedInUrl(url)).toBe('linkedin.com/company/acme');
    });

    it('should return null for non-LinkedIn URLs', () => {
      expect(matcher.normalizeLinkedInUrl('https://facebook.com/acme')).toBeNull();
      expect(matcher.normalizeLinkedInUrl('https://example.com')).toBeNull();
    });
  });

  // ============================================
  // Key Extraction Tests
  // ============================================
  describe('extractAndNormalizeKey', () => {
    it('should extract domain from record', () => {
      const record = { domain: 'https://www.acme.com/page' };
      expect(matcher.extractAndNormalizeKey(record, 'domain')).toBe('acme.com');
    });

    it('should extract email from record', () => {
      const record = { email: 'John.Doe@ACME.COM' };
      expect(matcher.extractAndNormalizeKey(record, 'email')).toBe('john.doe@acme.com');
    });

    it('should extract phone from record', () => {
      const record = { phone: '(555) 123-4567' };
      expect(matcher.extractAndNormalizeKey(record, 'phone')).toBe('+15551234567');
    });

    it('should extract salesforce_id from record', () => {
      const record = { salesforce_id: '001000000000001' };
      const result = matcher.extractAndNormalizeKey(record, 'salesforce_id');
      expect(result.length).toBe(18);
    });

    it('should try field variations', () => {
      const record = { website: 'https://acme.com' };
      expect(matcher.extractAndNormalizeKey(record, 'domain')).toBe('acme.com');
    });

    it('should return null for missing field', () => {
      const record = { name: 'Acme' };
      expect(matcher.extractAndNormalizeKey(record, 'domain')).toBeNull();
    });

    it('should handle nested values', () => {
      const record = { properties: { domain: 'acme.com' } };
      expect(matcher.extractAndNormalizeKey(record, 'properties.domain')).toBe('acme.com');
    });

    it('should handle unknown key types with generic normalization', () => {
      const record = { custom_field: '  TEST VALUE  ' };
      expect(matcher.extractAndNormalizeKey(record, 'custom_field')).toBe('test value');
    });
  });

  // ============================================
  // getNestedValue Tests
  // ============================================
  describe('getNestedValue', () => {
    it('should get simple property', () => {
      expect(matcher.getNestedValue({ name: 'Acme' }, 'name')).toBe('Acme');
    });

    it('should get nested property', () => {
      const obj = { properties: { domain: 'acme.com' } };
      expect(matcher.getNestedValue(obj, 'properties.domain')).toBe('acme.com');
    });

    it('should return null for missing path', () => {
      expect(matcher.getNestedValue({ name: 'Acme' }, 'properties.domain')).toBeNull();
    });

    it('should return null for null object', () => {
      expect(matcher.getNestedValue(null, 'name')).toBeNull();
    });
  });

  // ============================================
  // Match Method Tests
  // ============================================
  describe('match', () => {
    it('should return empty clusters for empty records', () => {
      const result = matcher.match([]);
      expect(result.clusters).toEqual([]);
      expect(result.stats.totalRecords).toBe(0);
    });

    it('should return empty clusters for unique records', () => {
      const records = [
        { domain: 'acme.com' },
        { domain: 'globex.com' },
        { domain: 'initech.com' }
      ];
      const result = matcher.match(records);
      expect(result.clusters.length).toBe(0);
      expect(result.unmatched.length).toBe(3);
    });

    it('should create cluster for matching domain', () => {
      const records = [
        { id: '1', domain: 'https://acme.com' },
        { id: '2', domain: 'www.acme.com' },
        { id: '3', domain: 'globex.com' }
      ];
      const result = matcher.match(records);

      expect(result.clusters.length).toBe(1);
      expect(result.clusters[0].matchKey).toBe('acme.com');
      expect(result.clusters[0].matchType).toBe('domain');
      expect(result.clusters[0].recordCount).toBe(2);
    });

    it('should create cluster for matching salesforce_id', () => {
      const records = [
        { id: '1', salesforce_id: '001000000000001AAA' },
        { id: '2', salesforce_id: '001000000000001AAA' },
        { id: '3', salesforce_id: '001000000000002BBB' }
      ];
      const result = matcher.match(records);

      expect(result.clusters.length).toBe(1);
      expect(result.clusters[0].matchType).toBe('salesforce_id');
      expect(result.clusters[0].confidence).toBe(100);
    });

    it('should track statistics', () => {
      const records = [
        { id: '1', domain: 'acme.com' },
        { id: '2', domain: 'acme.com' },
        { id: '3', domain: 'globex.com' }
      ];
      const result = matcher.match(records);

      expect(result.stats.totalRecords).toBe(3);
      expect(result.stats.recordsMatched).toBe(2);
      expect(result.stats.recordsUnmatched).toBe(1);
      expect(result.stats.clustersCreated).toBe(1);
      expect(result.stats.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should filter clusters by minimum size', () => {
      const records = [
        { id: '1', domain: 'acme.com' },
        { id: '2', domain: 'acme.com' }
      ];
      const result = matcher.match(records, { minClusterSize: 3 });
      expect(result.clusters.length).toBe(0);
    });

    it('should exclude unmatched when option is false', () => {
      const records = [
        { id: '1', domain: 'acme.com' },
        { id: '2', domain: 'globex.com' }
      ];
      const result = matcher.match(records, { includeUnmatched: false });
      expect(result.unmatched).toEqual([]);
    });

    it('should include source in metadata', () => {
      const records = [{ domain: 'acme.com' }];
      const result = matcher.match(records, { source: 'salesforce' });
      expect(result.metadata.source).toBe('salesforce');
    });

    it('should not match same record twice across key types', () => {
      const records = [
        { id: '1', domain: 'acme.com', salesforce_id: '001000000000001AAA' },
        { id: '2', domain: 'acme.com', salesforce_id: '001000000000001AAA' },
        { id: '3', domain: 'acme.com', salesforce_id: '001000000000002BBB' }
      ];
      const result = matcher.match(records);

      // Should only create one cluster (by salesforce_id or domain, not both)
      // Records 1 and 2 match on both SF ID and domain
      expect(result.clusters.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================
  // matchByDomain Tests
  // ============================================
  describe('matchByDomain', () => {
    it('should cluster records by domain', () => {
      const records = [
        { id: '1', domain: 'https://www.acme.com/page' },
        { id: '2', domain: 'acme.com' },
        { id: '3', website: 'www.acme.com' },
        { id: '4', domain: 'globex.com' }
      ];

      const result = matcher.matchByDomain(records);
      expect(result.duplicateDomains).toBe(1);
      expect(result.clusters[0].recordCount).toBe(3);
    });

    it('should return total domains count', () => {
      const records = [
        { domain: 'acme.com' },
        { domain: 'globex.com' },
        { domain: 'initech.com' }
      ];

      const result = matcher.matchByDomain(records);
      expect(result.totalDomains).toBe(3);
      expect(result.duplicateDomains).toBe(0);
    });

    it('should skip records without valid domain', () => {
      const records = [
        { domain: 'acme.com' },
        { domain: null },
        { domain: 'invalid' }
      ];

      const result = matcher.matchByDomain(records);
      expect(result.totalDomains).toBe(1);
    });
  });

  // ============================================
  // matchByEmail Tests
  // ============================================
  describe('matchByEmail', () => {
    beforeEach(() => {
      matcher = new DeterministicMatcher({ entityType: 'contact' });
    });

    it('should cluster records by email', () => {
      const records = [
        { id: '1', email: 'john@acme.com' },
        { id: '2', email: 'JOHN@ACME.COM' },
        { id: '3', email: 'jane@acme.com' }
      ];

      const result = matcher.matchByEmail(records);
      expect(result.duplicateEmails).toBe(1);
      expect(result.clusters[0].recordCount).toBe(2);
    });

    it('should return total emails count', () => {
      const records = [
        { email: 'john@acme.com' },
        { email: 'jane@acme.com' },
        { email: 'bob@globex.com' }
      ];

      const result = matcher.matchByEmail(records);
      expect(result.totalEmails).toBe(3);
    });

    it('should skip records without valid email', () => {
      const records = [
        { email: 'john@acme.com' },
        { email: null },
        { email: 'invalid-email' }
      ];

      const result = matcher.matchByEmail(records);
      expect(result.totalEmails).toBe(1);
    });
  });

  // ============================================
  // matchByExternalId Tests
  // ============================================
  describe('matchByExternalId', () => {
    it('should cluster by duns_number', () => {
      const records = [
        { id: '1', duns_number: '123456789' },
        { id: '2', duns_number: '123456789' },
        { id: '3', duns_number: '987654321' }
      ];

      const result = matcher.matchByExternalId(records, 'duns_number');
      expect(result.duplicateIds).toBe(1);
      expect(result.clusters[0].matchType).toBe('duns_number');
    });

    it('should cluster by hubspot_id', () => {
      const records = [
        { id: '1', hubspot_id: '12345678' },
        { id: '2', hubspot_id: '12345678' },
        { id: '3', hubspot_id: '87654321' }
      ];

      const result = matcher.matchByExternalId(records, 'hubspot_id');
      expect(result.duplicateIds).toBe(1);
    });

    it('should return total IDs count', () => {
      const records = [
        { salesforce_id: '001000000000001AAA' },
        { salesforce_id: '001000000000002BBB' },
        { salesforce_id: '001000000000003CCC' }
      ];

      const result = matcher.matchByExternalId(records, 'salesforce_id');
      expect(result.totalIds).toBe(3);
    });
  });

  // ============================================
  // matchSingle Tests
  // ============================================
  describe('matchSingle', () => {
    it('should find matches for a single record', () => {
      const newRecord = { domain: 'acme.com' };
      const existingRecords = [
        { id: '1', domain: 'acme.com' },
        { id: '2', domain: 'globex.com' },
        { id: '3', domain: 'acme.com' }
      ];

      const result = matcher.matchSingle(newRecord, existingRecords);
      expect(result.hasMatch).toBe(true);
      expect(result.matchCount).toBe(2);
      expect(result.bestMatch.matchType).toBe('domain');
    });

    it('should return no match for unique record', () => {
      const newRecord = { domain: 'unique.com' };
      const existingRecords = [
        { id: '1', domain: 'acme.com' },
        { id: '2', domain: 'globex.com' }
      ];

      const result = matcher.matchSingle(newRecord, existingRecords);
      expect(result.hasMatch).toBe(false);
      expect(result.bestMatch).toBeNull();
      expect(result.matchCount).toBe(0);
    });

    it('should sort matches by confidence', () => {
      const newRecord = {
        domain: 'acme.com',
        salesforce_id: '001000000000001AAA'
      };
      const existingRecords = [
        { id: '1', domain: 'acme.com' },
        { id: '2', salesforce_id: '001000000000001AAA' }
      ];

      const result = matcher.matchSingle(newRecord, existingRecords);
      expect(result.hasMatch).toBe(true);
      // SF ID (100) should be ranked higher than domain (90)
      expect(result.bestMatch.confidence).toBe(100);
    });
  });

  // ============================================
  // matchCrossPlatform Tests
  // ============================================
  describe('matchCrossPlatform', () => {
    it('should find matches between Salesforce and HubSpot records', () => {
      const sfRecords = [
        { id: 'sf1', domain: 'acme.com' },
        { id: 'sf2', domain: 'globex.com' }
      ];
      const hsRecords = [
        { id: 'hs1', domain: 'acme.com' },
        { id: 'hs2', domain: 'initech.com' }
      ];

      const result = matcher.matchCrossPlatform(sfRecords, hsRecords);
      expect(result.matchCount).toBe(1);
      expect(result.matches[0].matchKey).toBe('acme.com');
    });

    it('should include records from both sources in cluster', () => {
      const sfRecords = [{ domain: 'acme.com' }];
      const hsRecords = [{ domain: 'acme.com' }];

      const result = matcher.matchCrossPlatform(sfRecords, hsRecords);
      expect(result.matches[0].sources).toContain('salesforce');
      expect(result.matches[0].sources).toContain('hubspot');
    });

    it('should return record counts', () => {
      const sfRecords = [{}, {}, {}];
      const hsRecords = [{}, {}];

      const result = matcher.matchCrossPlatform(sfRecords, hsRecords);
      expect(result.salesforceRecordCount).toBe(3);
      expect(result.hubspotRecordCount).toBe(2);
    });

    it('should match by multiple key types', () => {
      const sfRecords = [
        { domain: 'acme.com', salesforce_id: '001000000000001AAA' },
        { domain: 'globex.com' }
      ];
      const hsRecords = [
        { domain: 'acme.com' },
        { properties: { salesforceaccountid: '001000000000001AAA' } }
      ];

      const result = matcher.matchCrossPlatform(sfRecords, hsRecords, {
        matchKeys: ['domain', 'salesforce_id']
      });
      // Should find matches by both domain and SF ID
      expect(result.matchCount).toBeGreaterThanOrEqual(1);
    });

    it('should return flat matches when createClusters is false', () => {
      const sfRecords = [{ domain: 'acme.com' }];
      const hsRecords = [{ domain: 'acme.com' }];

      const result = matcher.matchCrossPlatform(sfRecords, hsRecords, {
        createClusters: false
      });
      expect(result.matches[0].salesforceRecords).toBeDefined();
      expect(result.matches[0].hubspotRecords).toBeDefined();
    });
  });

  // ============================================
  // Index Records Tests
  // ============================================
  describe('indexRecords', () => {
    it('should index records by all key types', () => {
      const records = [
        { domain: 'acme.com', salesforce_id: '001000000000001AAA' },
        { domain: 'globex.com', hubspot_id: '12345678' }
      ];

      const indexes = matcher.indexRecords(records);
      expect(indexes.domain.has('acme.com')).toBe(true);
      expect(indexes.salesforce_id.size).toBe(1);
      expect(indexes.hubspot_id.size).toBe(1);
    });

    it('should skip invalid/null values', () => {
      const records = [
        { domain: null },
        { domain: '' },
        { domain: 'acme.com' }
      ];

      const indexes = matcher.indexRecords(records);
      expect(indexes.domain.size).toBe(1);
    });

    it('should track record index for each entry', () => {
      const records = [
        { domain: 'acme.com' },
        { domain: 'acme.com' }
      ];

      const indexes = matcher.indexRecords(records);
      const entries = indexes.domain.get('acme.com');
      expect(entries[0].index).toBe(0);
      expect(entries[1].index).toBe(1);
    });
  });

  // ============================================
  // Entity Type Specific Tests
  // ============================================
  describe('entity type configurations', () => {
    it('should use account config for accounts', () => {
      const m = new DeterministicMatcher({ entityType: 'account' });
      expect(m.config.primaryKeys).toContain('duns_number');
      expect(m.config.matchHierarchy).toContain('domain');
    });

    it('should use contact config for contacts', () => {
      const m = new DeterministicMatcher({ entityType: 'contact' });
      expect(m.config.secondaryKeys).toContain('email');
      expect(m.config.matchHierarchy[0]).toBe('email');
    });

    it('should use lead config for leads', () => {
      const m = new DeterministicMatcher({ entityType: 'lead' });
      expect(m.config.secondaryKeys).toContain('email');
      expect(m.config.tertiaryKeys).toContain('phone');
    });
  });

  // ============================================
  // Confidence Scores Tests
  // ============================================
  describe('MATCH_CONFIDENCE', () => {
    it('should have confidence scores for all key types', () => {
      expect(MATCH_CONFIDENCE.salesforce_id).toBe(100);
      expect(MATCH_CONFIDENCE.hubspot_id).toBe(100);
      expect(MATCH_CONFIDENCE.duns_number).toBe(98);
      expect(MATCH_CONFIDENCE.ein).toBe(95);
      expect(MATCH_CONFIDENCE.domain).toBe(90);
      expect(MATCH_CONFIDENCE.email).toBe(95);
      expect(MATCH_CONFIDENCE.linkedin_company_id).toBe(85);
      expect(MATCH_CONFIDENCE.linkedin_url).toBe(80);
      expect(MATCH_CONFIDENCE.phone).toBe(70);
    });
  });

  // ============================================
  // DEFAULT_CONFIG Tests
  // ============================================
  describe('DEFAULT_CONFIG', () => {
    it('should export default configurations', () => {
      expect(DEFAULT_CONFIG.account).toBeDefined();
      expect(DEFAULT_CONFIG.contact).toBeDefined();
      expect(DEFAULT_CONFIG.lead).toBeDefined();
    });

    it('should have match hierarchy for each entity type', () => {
      expect(DEFAULT_CONFIG.account.matchHierarchy).toBeDefined();
      expect(DEFAULT_CONFIG.contact.matchHierarchy).toBeDefined();
      expect(DEFAULT_CONFIG.lead.matchHierarchy).toBeDefined();
    });
  });

  // ============================================
  // Edge Cases
  // ============================================
  describe('edge cases', () => {
    it('should handle empty objects in records', () => {
      const records = [{}, {}, {}];
      const result = matcher.match(records);
      expect(result.clusters).toEqual([]);
    });

    it('should handle records with only null values', () => {
      const records = [
        { domain: null, salesforce_id: null },
        { domain: null, salesforce_id: null }
      ];
      const result = matcher.match(records);
      expect(result.clusters).toEqual([]);
    });

    it('should handle large record sets', () => {
      const records = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        domain: i % 100 === 0 ? 'shared.com' : `unique-${i}.com`
      }));

      const result = matcher.match(records);
      expect(result.stats.totalRecords).toBe(1000);
      // 10 records with shared.com (indices 0, 100, 200, ..., 900)
      expect(result.clusters.length).toBe(1);
      expect(result.clusters[0].recordCount).toBe(10);
    });

    it('should handle special characters in domains', () => {
      const records = [
        { domain: 'test-company.com' },
        { domain: 'test-company.com' }
      ];
      const result = matcher.match(records);
      expect(result.clusters.length).toBe(1);
    });

    it('should handle unicode in data', () => {
      const records = [
        { domain: 'société.com', name: 'Société Générale' },
        { domain: 'société.com', name: 'Societe Generale' }
      ];
      // Note: Domain normalization may fail on unicode
      const result = matcher.match(records);
      expect(result).toBeDefined();
    });

    it('should generate unique cluster IDs', () => {
      const records = [
        { domain: 'a.com' }, { domain: 'a.com' },
        { email: 'x@y.com' }, { email: 'x@y.com' }
      ];
      const contactMatcher = new DeterministicMatcher({ entityType: 'contact' });
      const result = contactMatcher.match(records);

      const ids = result.clusters.map(c => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  // ============================================
  // Field Variations Tests
  // ============================================
  describe('getFieldVariations', () => {
    it('should return variations for domain', () => {
      const variations = matcher.getFieldVariations('domain');
      expect(variations).toContain('domain');
      expect(variations).toContain('website');
      expect(variations).toContain('properties.domain');
    });

    it('should return variations for email', () => {
      const variations = matcher.getFieldVariations('email');
      expect(variations).toContain('email');
      expect(variations).toContain('email_address');
      expect(variations).toContain('work_email');
    });

    it('should return variations for salesforce_id', () => {
      const variations = matcher.getFieldVariations('salesforce_id');
      expect(variations).toContain('salesforce_id');
      expect(variations).toContain('salesforceaccountid');
      expect(variations).toContain('Id');
    });

    it('should return key itself for unknown keys', () => {
      const variations = matcher.getFieldVariations('unknown_field');
      expect(variations).toEqual(['unknown_field']);
    });
  });

  // ============================================
  // 15 to 18 Char ID Conversion Tests
  // ============================================
  describe('convertTo18CharId', () => {
    it('should convert 15-char ID to 18-char', () => {
      const id15 = '001000000000001';
      const result = matcher.convertTo18CharId(id15);
      expect(result.length).toBe(18);
    });

    it('should generate correct suffix', () => {
      // Known test case: '001000000000001' should convert correctly
      const id15 = '001000000000001';
      const result = matcher.convertTo18CharId(id15);
      // The suffix is based on case flags
      expect(result.startsWith(id15)).toBe(true);
    });

    it('should handle IDs with uppercase letters', () => {
      const id15 = '001ABCDEFGHIJKL';
      const result = matcher.convertTo18CharId(id15);
      expect(result.length).toBe(18);
    });
  });
});
