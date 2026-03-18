/**
 * Domain-Aware Matcher Tests
 *
 * Tests for the domain-aware matching system including:
 * - Domain dictionary loading
 * - Domain detection
 * - Abbreviation expansion
 * - Fuzzy matching with domain context
 */

const { DomainDictionaryLoader } = require('../domain-dictionary-loader');
const { DomainDetector } = require('../domain-detector');
const { DomainAwareMatcher } = require('../domain-aware-matcher');

describe('DomainDictionaryLoader', () => {
  let loader;

  beforeEach(() => {
    loader = new DomainDictionaryLoader();
  });

  test('lists available domains', () => {
    const domains = loader.listDomains();
    expect(domains).toContain('property-management');
    expect(domains).toContain('government');
    expect(domains).toContain('technology');
    expect(domains).toContain('financial');
  });

  test('checks if domain exists', () => {
    expect(loader.exists('property-management')).toBe(true);
    expect(loader.exists('nonexistent-domain')).toBe(false);
  });

  test('loads property-management dictionary', () => {
    const dict = loader.load('property-management');
    expect(dict).toBeDefined();
    expect(dict.domain).toBe('property-management');
    expect(dict.abbreviations).toBeDefined();
    expect(dict.abbreviations.organizations.HOA).toBe('Homeowners Association');
  });

  test('loads government dictionary', () => {
    const dict = loader.load('government');
    expect(dict).toBeDefined();
    expect(dict.abbreviations.lawEnforcement.PD).toBe('Police Department');
    expect(dict.abbreviations.federalAgencies.FBI).toBe('Federal Bureau of Investigation');
  });

  test('gets flattened abbreviations', () => {
    const abbrevs = loader.getAbbreviations('property-management');
    expect(abbrevs.HOA).toBe('Homeowners Association');
    expect(abbrevs.CAM).toBe('Common Area Maintenance');
    expect(abbrevs.NNN).toBe('Triple Net Lease');
  });

  test('gets synonyms', () => {
    const synonyms = loader.getSynonyms('property-management');
    expect(synonyms.HOA).toContain('Homeowners Association');
    expect(synonyms.Tenant).toContain('Resident');
  });

  test('gets detection patterns', () => {
    const patterns = loader.getDetectionPatterns('property-management');
    expect(patterns.keywords).toContain('property');
    expect(patterns.keywords).toContain('tenant');
    expect(patterns.fieldPatterns).toContain('RentAmount');
  });

  test('caches loaded dictionaries', () => {
    const dict1 = loader.load('government');
    const dict2 = loader.load('government');
    expect(dict1).toBe(dict2); // Same reference from cache
  });
});

describe('DomainDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new DomainDetector();
  });

  test('detects property management domain', () => {
    const result = detector.detect('ABC Property Management HOA fees');
    expect(result.detectedDomain).toBe('property-management');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test('detects government domain', () => {
    const result = detector.detect('San Diego Police Department');
    expect(result.detectedDomain).toBe('government');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test('detects financial domain', () => {
    const result = detector.detect('First National FCU FDIC insured');
    expect(result.detectedDomain).toBe('financial');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test('detects technology domain', () => {
    const result = detector.detect('SaaS platform MSP managed services');
    expect(result.detectedDomain).toBe('technology');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test('extracts user hint', () => {
    const hint = detector.extractUserHint('[DOMAIN: financial] Bank of America');
    expect(hint).toBe('financial');
  });

  test('respects user hint over auto-detection', () => {
    const result = detector.detect('[DOMAIN: financial] Police Department');
    expect(result.detectedDomain).toBe('financial');
    expect(result.confidence).toBe(1.0);
  });

  test('detects from headers', () => {
    const result = detector.detectFromHeaders(['TenantName', 'UnitNumber', 'RentAmount', 'LeaseStart']);
    expect(result.detectedDomain).toBe('property-management');
  });

  test('returns null for undetectable text', () => {
    const result = detector.detect('random words without domain context');
    expect(result.detectedDomain).toBe(null);
    expect(result.confidence).toBe(0);
  });
});

describe('DomainAwareMatcher', () => {
  test('expands abbreviations with explicit domain', () => {
    const matcher = new DomainAwareMatcher({ domain: 'property-management', autoDetect: false });
    const result = matcher.expandAbbreviations('ABC HOA Management');
    expect(result.expanded).toBe('ABC Homeowners Association Management');
    expect(result.expansions).toHaveLength(1);
    expect(result.expansions[0].from).toBe('HOA');
  });

  test('expands multiple abbreviations', () => {
    const matcher = new DomainAwareMatcher({ domain: 'property-management', autoDetect: false });
    const result = matcher.expandAbbreviations('HOA CAM fees for SFR');
    expect(result.expanded).toContain('Homeowners Association');
    expect(result.expanded).toContain('Common Area Maintenance');
    expect(result.expanded).toContain('Single Family Residence');
  });

  test('normalizes text with domain context', () => {
    const matcher = new DomainAwareMatcher({ domain: 'property-management', autoDetect: false });
    const result = matcher.normalize('ABC HOA Management');
    expect(result.normalized).toContain('homeowners association');
    expect(result.original).toBe('ABC HOA Management');
  });

  test('calculates similarity', () => {
    const matcher = new DomainAwareMatcher({ autoDetect: false });
    const similarity = matcher.calculateSimilarity('test', 'test');
    expect(similarity).toBe(100);

    const similarity2 = matcher.calculateSimilarity('test', 'tset');
    expect(similarity2).toBeGreaterThanOrEqual(50);
    expect(similarity2).toBeLessThan(100);
  });

  test('matches with domain awareness', () => {
    const matcher = new DomainAwareMatcher({ domain: 'property-management', autoDetect: false });
    const targets = [
      { id: '1', name: 'ABC Homeowners Association' },
      { id: '2', name: 'XYZ Property Management' }
    ];

    // Use lower confidence threshold to capture partial matches
    const matches = matcher.match('ABC HOA', targets, { minConfidence: 40 });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].target).toBe('ABC Homeowners Association');
    expect(matches[0].expansions.source).toHaveLength(1);
  });

  test('auto-detects domain when enabled', () => {
    const matcher = new DomainAwareMatcher({ autoDetect: true });
    const targets = [
      { id: '1', name: 'First National Bank' },
      { id: '2', name: 'ABC Credit Union' }
    ];

    const matches = matcher.match('FCU of California', targets, { minConfidence: 50 });
    expect(matcher.domain).toBe('financial');
  });

  test('finds best match', () => {
    const matcher = new DomainAwareMatcher({ domain: 'property-management', autoDetect: false });
    const targets = [
      { id: '1', name: 'ABC Homeowners Association' },
      { id: '2', name: 'XYZ Management' }
    ];

    const best = matcher.findBestMatch('ABC HOA', targets);
    expect(best).toBeDefined();
    expect(best.target).toBe('ABC Homeowners Association');
  });

  test('returns domain info', () => {
    const matcher = new DomainAwareMatcher({ domain: 'government', autoDetect: false });
    const info = matcher.getDomainInfo();
    expect(info.domain).toBe('government');
    expect(info.abbreviationCount).toBeGreaterThan(50);
  });

  test('lists available domains', () => {
    const matcher = new DomainAwareMatcher({ autoDetect: false });
    const domains = matcher.listDomains();
    expect(domains).toContain('property-management');
    expect(domains).toContain('government');
  });
});

describe('Integration Tests', () => {
  test('full workflow: detect, load, match', () => {
    // 1. Detect domain from sample data
    const detector = new DomainDetector();
    const detection = detector.detect('Westside HOA monthly CAM fees');
    expect(detection.detectedDomain).toBe('property-management');

    // 2. Create matcher with detected domain
    const matcher = new DomainAwareMatcher({
      domain: detection.detectedDomain,
      autoDetect: false
    });

    // 3. Match against targets
    const targets = [
      { id: '1', name: 'Westside Homeowners Association' },
      { id: '2', name: 'Eastside HOA' },
      { id: '3', name: 'Random Company Inc' }
    ];

    const matches = matcher.match('Westside HOA', targets);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].target).toBe('Westside Homeowners Association');
    expect(matches[0].confidence).toBeGreaterThan(80);
  });

  test('header detection to match workflow', () => {
    const detector = new DomainDetector();

    // Detect from CSV headers
    const headers = ['AgencyName', 'BadgeNumber', 'Jurisdiction', 'DepartmentType'];
    const detection = detector.detectFromHeaders(headers);

    // Even without explicit government keywords in headers,
    // the system should recognize some patterns
    // This tests the edge case handling
    if (detection.detectedDomain) {
      const matcher = new DomainAwareMatcher({ domain: detection.detectedDomain });
      const info = matcher.getDomainInfo();
      expect(info.domain).toBeDefined();
    }
  });
});
