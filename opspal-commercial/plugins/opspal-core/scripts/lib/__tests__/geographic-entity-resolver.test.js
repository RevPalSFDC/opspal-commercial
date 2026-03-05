/**
 * Tests for Geographic Entity Resolver
 *
 * Tests the core functionality of resolving same-name businesses
 * across different states and locations using market-specific rules.
 */

'use strict';

const path = require('path');

// Import modules under test
const { GeographicEntityResolver } = require('../geographic-entity-resolver');
const { EntityHierarchyDetector } = require('../entity-hierarchy-detector');
const { LocationNormalizer } = require('../location-normalization');

describe('GeographicEntityResolver', () => {
  let resolver;

  beforeEach(() => {
    resolver = new GeographicEntityResolver();
  });

  describe('Government Market (Strict)', () => {
    it('should BLOCK same-name municipalities in different states', () => {
      const recordA = { Name: 'City of Portland', State: 'OR' };
      const recordB = { Name: 'City of Portland', State: 'ME' };

      const result = resolver.resolve(recordA, recordB, { market: 'government' });

      expect(result.decision).toBe('NO_MATCH');
      expect(result.sameEntity).toBe(false);
      expect(result.signals.some(s => s.type === 'STATE_MISMATCH')).toBe(true);
    });

    it('should AUTO_MERGE same-name departments in same state', () => {
      const recordA = { Name: 'San Diego PD', State: 'CA' };
      const recordB = { Name: 'San Diego Police Department', State: 'CA' };

      const result = resolver.resolve(recordA, recordB, { market: 'government' });

      expect(result.decision).toBe('AUTO_MERGE');
      expect(result.sameEntity).toBe(true);
      expect(result.signals.some(s => s.type === 'SAME_STATE')).toBe(true);
    });

    it('should detect generic entity patterns', () => {
      const recordA = { Name: 'Housing Authority', State: 'TX' };
      const recordB = { Name: 'Housing Authority', State: 'CA' };

      const result = resolver.resolve(recordA, recordB, { market: 'government' });

      expect(result.decision).not.toBe('AUTO_MERGE');
      expect(result.signals.some(s => s.type === 'GENERIC_NAME_DIFFERENT_STATE')).toBe(true);
    });
  });

  describe('Healthcare Market (Strict)', () => {
    it('should BLOCK same-name hospitals in different states without shared domain', () => {
      const recordA = { Name: 'Memorial Hospital', State: 'TX', Website: 'memorial-tx.org' };
      const recordB = { Name: 'Memorial Hospital', State: 'FL', Website: 'memorial-fl.org' };

      const result = resolver.resolve(recordA, recordB, { market: 'healthcare' });

      expect(result.decision).toBe('NO_MATCH');
      expect(result.sameEntity).toBe(false);
    });

    it('should consider AUTO_MERGE for hospitals with same domain', () => {
      const recordA = { Name: 'Memorial Hospital', State: 'TX', Website: 'memorial-health.com' };
      const recordB = { Name: 'Memorial Hospital - West', State: 'TX', Website: 'memorial-health.com' };

      const result = resolver.resolve(recordA, recordB, { market: 'healthcare' });

      expect(result.confidence).toBeGreaterThanOrEqual(80);
      expect(result.signals.some(s => s.type === 'SHARED_DOMAIN')).toBe(true);
    });
  });

  describe('Franchise Market (Loose)', () => {
    it('should AUTO_MERGE known franchises in different states', () => {
      const recordA = { Name: "McDonald's #1234", State: 'TX' };
      const recordB = { Name: "McDonald's #5678", State: 'CA' };

      const result = resolver.resolve(recordA, recordB, { market: 'franchise' });

      expect(['AUTO_MERGE', 'REVIEW']).toContain(result.decision);
      expect(result.signals.some(s =>
        s.type === 'KNOWN_FRANCHISE' ||
        s.type === 'STORE_NUMBER_PATTERN' ||
        s.type === 'BASE_NAME_MATCH'
      )).toBe(true);
    });

    it('should detect location pattern in franchise names', () => {
      const recordA = { Name: 'Marriott - Dallas', State: 'TX' };
      const recordB = { Name: 'Marriott - Houston', State: 'TX' };

      const result = resolver.resolve(recordA, recordB, { market: 'franchise' });

      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.signals.some(s => s.type === 'PARENT_PATTERN')).toBe(true);
    });

    it('should handle store number patterns', () => {
      const recordA = { Name: 'Target #1234' };
      const recordB = { Name: 'Target #5678' };

      const result = resolver.resolve(recordA, recordB, { market: 'retail' });

      expect(result.signals.some(s => s.type === 'STORE_NUMBER_PATTERN')).toBe(true);
    });
  });

  describe('Property Management Market (Medium)', () => {
    it('should REVIEW same-name HOAs in different states', () => {
      const recordA = { Name: 'Sunshine HOA', State: 'AZ' };
      const recordB = { Name: 'Sunshine HOA', State: 'FL' };

      const result = resolver.resolve(recordA, recordB, { market: 'property-management' });

      expect(['REVIEW', 'TAG']).toContain(result.decision);
    });

    it('should consider AUTO_MERGE for management companies with same domain', () => {
      const recordA = { Name: 'ABC Property Management', State: 'TX', Website: 'abcpm.com' };
      const recordB = { Name: 'ABC Property Management - Westside', State: 'TX', Website: 'abcpm.com' };

      const result = resolver.resolve(recordA, recordB, { market: 'property-management' });

      expect(result.confidence).toBeGreaterThanOrEqual(80);
    });
  });

  describe('Signal Detection', () => {
    it('should detect shared domain signal', () => {
      const recordA = { Name: 'Acme Corp', Website: 'acme.com' };
      const recordB = { Name: 'Acme Corp', Website: 'https://www.acme.com/about' };

      const result = resolver.resolve(recordA, recordB);

      expect(result.signals.some(s => s.type === 'SHARED_DOMAIN')).toBe(true);
    });

    it('should detect different domain signal', () => {
      const recordA = { Name: 'Acme Corp', Website: 'acme.com' };
      const recordB = { Name: 'Acme Corp', Website: 'acme-other.com' };

      const result = resolver.resolve(recordA, recordB);

      expect(result.signals.some(s => s.type === 'DIFFERENT_DOMAIN')).toBe(true);
    });

    it('should detect phone area code match', () => {
      const recordA = { Name: 'Acme Corp', Phone: '(512) 555-1234' };
      const recordB = { Name: 'Acme Corp', Phone: '512-555-5678' };

      const result = resolver.resolve(recordA, recordB);

      expect(result.signals.some(s => s.type === 'PHONE_AREA_MATCH')).toBe(true);
    });
  });

  describe('Market Auto-Detection', () => {
    it('should auto-detect government market', () => {
      const recordA = { Name: 'San Diego Police Department' };
      const recordB = { Name: 'San Diego PD' };

      const result = resolver.resolve(recordA, recordB);

      expect(result.market).toBe('government');
    });

    it('should auto-detect healthcare market', () => {
      const recordA = { Name: 'Memorial Hospital' };
      const recordB = { Name: 'Memorial Medical Center' };

      const result = resolver.resolve(recordA, recordB);

      expect(result.market).toBe('healthcare');
    });

    it('should auto-detect property-management market', () => {
      const recordA = { Name: 'Sunset HOA' };
      const recordB = { Name: 'Sunset Homeowners Association' };

      const result = resolver.resolve(recordA, recordB);

      expect(result.market).toBe('property-management');
    });
  });

  describe('Batch Resolution', () => {
    it('should resolve multiple pairs', () => {
      const pairs = [
        {
          recordA: { Name: 'Marriott - Dallas', State: 'TX' },
          recordB: { Name: 'Marriott - Houston', State: 'TX' }
        },
        {
          recordA: { Name: 'City of Austin', State: 'TX' },
          recordB: { Name: 'City of Austin', State: 'MN' }
        }
      ];

      const results = resolver.batchResolve(pairs, { market: null });

      expect(results).toHaveLength(2);
      expect(results[0].confidence).toBeGreaterThan(0);
      expect(results[1].confidence).toBeLessThan(results[0].confidence);
    });
  });

  describe('Find Matches', () => {
    it('should find and rank matches from target list', () => {
      const source = { Name: 'Starbucks', State: 'TX' };
      const targets = [
        { Name: 'Starbucks - Downtown', State: 'TX' },
        { Name: 'Starbucks - Airport', State: 'TX' },
        { Name: 'Coffee House', State: 'TX' },
        { Name: 'Starbucks', State: 'CA' }
      ];

      const matches = resolver.findMatches(source, targets, { market: 'franchise', minConfidence: 40 });

      expect(matches.length).toBeGreaterThan(0);
      // Matches should be sorted by confidence
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i - 1].confidence).toBeGreaterThanOrEqual(matches[i].confidence);
      }
    });
  });
});

describe('EntityHierarchyDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new EntityHierarchyDetector();
  });

  describe('Base Name Extraction', () => {
    it('should extract base name from dash-separated location', () => {
      const result = detector.extractBaseName('Marriott - Dallas');

      expect(result.baseName).toBe('Marriott');
      expect(result.suffix).toBe('Dallas');
      expect(result.pattern).toBe('DASH_SEPARATOR');
    });

    it('should extract base name from store number', () => {
      const result = detector.extractBaseName("McDonald's #1234");

      expect(result.baseName).toBe("McDonald's");
      expect(result.storeNumber).toBe('1234');
      expect(result.pattern).toBe('STORE_NUMBER_HASH');
    });

    it('should extract base name from parenthetical state', () => {
      const result = detector.extractBaseName('Hilton (TX)');

      expect(result.baseName).toBe('Hilton');
      expect(result.suffix).toBe('TX');
      expect(result.pattern).toBe('STATE_CODE_PAREN');
    });

    it('should extract base name from regional suffix', () => {
      const result = detector.extractBaseName('Starbucks Downtown');

      expect(result.baseName).toBe('Starbucks');
      expect(result.suffix).toBe('Downtown');
      expect(result.pattern).toBe('REGIONAL_SUFFIX');
    });

    it('should handle municipal patterns specially', () => {
      const result = detector.extractBaseName('City of Portland');

      expect(result.baseName).toBe('City of Portland');
      expect(result.municipalType).toBe('City of');
      expect(result.municipalLocation).toBe('Portland');
    });

    it('should return original when no pattern matches', () => {
      const result = detector.extractBaseName('Acme Corporation');

      expect(result.baseName).toBe('Acme Corporation');
      expect(result.suffix).toBeNull();
      expect(result.pattern).toBeNull();
    });
  });

  describe('Parent/Child Pattern Detection', () => {
    it('should detect same entity with location suffixes', () => {
      const result = detector.detectParentChildPattern(
        'Marriott - Dallas',
        'Marriott - Houston'
      );

      expect(result.sameEntity).toBe(true);
      expect(result.baseNameMatch).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(70);
    });

    it('should detect same entity with store numbers', () => {
      const result = detector.detectParentChildPattern(
        "McDonald's #1234",
        "McDonald's #5678"
      );

      expect(result.sameEntity).toBe(true);
      expect(result.signals.some(s => s.type === 'BOTH_HAVE_STORE_NUMBER')).toBe(true);
    });

    it('should not match different municipalities', () => {
      const result = detector.detectParentChildPattern(
        'City of Portland',
        'City of Seattle',
        { market: 'government' }
      );

      expect(result.sameEntity).toBe(false);
    });
  });

  describe('Known Entity Detection', () => {
    it('should recognize known franchises', () => {
      expect(detector.isKnownEntity("McDonald's", 'franchise')).toBe(true);
      expect(detector.isKnownEntity('Starbucks', 'franchise')).toBe(true);
      expect(detector.isKnownEntity('Unknown Coffee Shop', 'franchise')).toBe(false);
    });

    it('should recognize known retailers', () => {
      expect(detector.isKnownEntity('Walmart', 'retail')).toBe(true);
      expect(detector.isKnownEntity('Target', 'retail')).toBe(true);
    });
  });

  describe('Generic Entity Pattern Detection', () => {
    it('should detect generic government patterns', () => {
      const result = detector.detectGenericEntityPattern('City of Springfield', 'government');

      expect(result.isGeneric).toBe(true);
      expect(result.matchedPattern).toBe('City of *');
    });

    it('should detect generic healthcare patterns', () => {
      const result = detector.detectGenericEntityPattern('Memorial Hospital', 'healthcare');

      expect(result.isGeneric).toBe(true);
    });

    it('should not flag non-generic names', () => {
      const result = detector.detectGenericEntityPattern('Acme Corporation', 'government');

      expect(result.isGeneric).toBe(false);
    });
  });
});

describe('LocationNormalizer', () => {
  let normalizer;

  beforeEach(() => {
    normalizer = new LocationNormalizer();
  });

  describe('City Normalization', () => {
    it('should normalize common city abbreviations', () => {
      expect(normalizer.normalizeCity('NYC')).toBe('New York');
      expect(normalizer.normalizeCity('LA')).toBe('Los Angeles');
      expect(normalizer.normalizeCity('SF')).toBe('San Francisco');
      expect(normalizer.normalizeCity('Chi')).toBe('Chicago');
    });

    it('should handle full city names', () => {
      expect(normalizer.normalizeCity('new york city')).toBe('New York');
      expect(normalizer.normalizeCity('Washington DC')).toBe('Washington');
    });

    it('should title case unknown cities', () => {
      expect(normalizer.normalizeCity('austin')).toBe('Austin');
    });
  });

  describe('Phone Area Code Extraction', () => {
    it('should extract area code from various formats', () => {
      expect(normalizer.extractAreaCode('(555) 123-4567')).toBe('555');
      expect(normalizer.extractAreaCode('555-123-4567')).toBe('555');
      expect(normalizer.extractAreaCode('+1 555 123 4567')).toBe('555');
      expect(normalizer.extractAreaCode('1-555-123-4567')).toBe('555');
    });

    it('should return null for invalid numbers', () => {
      expect(normalizer.extractAreaCode('123')).toBeNull();
      expect(normalizer.extractAreaCode('')).toBeNull();
    });
  });

  describe('Phone Pattern Comparison', () => {
    it('should detect same area code', () => {
      expect(normalizer.sharePhonePattern('(555) 123-4567', '555-987-6543')).toBe(true);
    });

    it('should detect different area codes', () => {
      expect(normalizer.sharePhonePattern('(555) 123-4567', '(212) 987-6543')).toBe(false);
    });
  });

  describe('Domain Normalization', () => {
    it('should normalize various URL formats', () => {
      expect(normalizer.normalizeDomain('https://www.example.com')).toBe('example.com');
      expect(normalizer.normalizeDomain('http://example.com/page')).toBe('example.com');
      expect(normalizer.normalizeDomain('www.example.com')).toBe('example.com');
      expect(normalizer.normalizeDomain('EXAMPLE.COM')).toBe('example.com');
    });
  });

  describe('State Normalization', () => {
    it('should normalize state names to codes', () => {
      expect(normalizer.normalizeState('California')).toBe('CA');
      expect(normalizer.normalizeState('texas')).toBe('TX');
      expect(normalizer.normalizeState('CA')).toBe('CA');
    });

    it('should handle provinces', () => {
      expect(normalizer.normalizeState('ON')).toBe('ON');
    });
  });

  describe('Location Comparison', () => {
    it('should compare full location objects', () => {
      const locA = { state: 'CA', city: 'San Francisco', phone: '(415) 555-1234', domain: 'acme.com' };
      const locB = { state: 'CA', city: 'Los Angeles', phone: '(213) 555-5678', domain: 'acme.com' };

      const result = normalizer.compareLocations(locA, locB);

      expect(result.sameState).toBe(true);
      expect(result.sameDomain).toBe(true);
      expect(result.sameAreaCode).toBe(false);
      expect(result.score).toBeGreaterThan(0);
    });
  });
});
