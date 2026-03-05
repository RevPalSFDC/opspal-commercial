/**
 * Tests for normalization-engine.js
 *
 * Tests the NormalizationEngine class which handles canonicalization
 * of company names, domains, emails, phones, addresses, titles, and person names.
 */

'use strict';

const { NormalizationEngine, DEFAULT_RULES } = require('../normalization-engine');

describe('NormalizationEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new NormalizationEngine();
  });

  // ============================================
  // Constructor Tests
  // ============================================
  describe('constructor', () => {
    it('should create instance with default rules', () => {
      const eng = new NormalizationEngine();
      expect(eng).toBeInstanceOf(NormalizationEngine);
      expect(eng.rules).toBeDefined();
      expect(eng.rules.company_name).toBeDefined();
    });

    it('should accept custom rules via options.rules', () => {
      const customRules = {
        company_name: {
          strip_suffixes: ['CustomSuffix', 'Inc']
        }
      };
      const eng = new NormalizationEngine({ rules: customRules });
      expect(eng.rules.company_name.strip_suffixes).toContain('CustomSuffix');
      // Custom rules override defaults for arrays
      expect(eng.rules.company_name.strip_suffixes).toContain('Inc');
    });

    it('should handle invalid rulesPath gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const eng = new NormalizationEngine({ rulesPath: '/nonexistent/path.json' });
      expect(eng.rules).toEqual(DEFAULT_RULES);
      consoleSpy.mockRestore();
    });

    it('should initialize with a SemanticDisambiguator', () => {
      expect(engine.disambiguator).toBeDefined();
      expect(typeof engine.disambiguator.normalizeTitle).toBe('function');
    });

    it('should accept custom disambiguator', () => {
      const mockDisambiguator = {
        normalizeTitle: jest.fn(() => ({ normalized: 'Test', changes: [] }))
      };
      const eng = new NormalizationEngine({ disambiguator: mockDisambiguator });
      eng.normalizeTitle('VP');
      expect(mockDisambiguator.normalizeTitle).toHaveBeenCalled();
    });
  });

  // ============================================
  // Company Name Normalization Tests
  // ============================================
  describe('normalizeCompanyName', () => {
    describe('basic normalization', () => {
      it('should handle null/empty input', () => {
        expect(engine.normalizeCompanyName(null).normalized).toBe('');
        expect(engine.normalizeCompanyName('').normalized).toBe('');
        expect(engine.normalizeCompanyName(undefined).normalized).toBe('');
      });

      it('should trim whitespace and collapse multiple spaces', () => {
        const result = engine.normalizeCompanyName('  Acme   Corp  ');
        expect(result.normalized).toBe('Acme');
        expect(result.changes.some(c => c.type === 'whitespace')).toBe(true);
      });

      it('should preserve original value', () => {
        const result = engine.normalizeCompanyName('Test Company Inc.');
        expect(result.original).toBe('Test Company Inc.');
      });
    });

    describe('suffix stripping', () => {
      it.each([
        ['Acme Inc', 'Acme', 'Inc'],
        ['Acme Inc.', 'Acme', 'Inc.'],
        ['Acme Incorporated', 'Acme', 'Incorporated'],
        ['Acme LLC', 'Acme', 'LLC'],
        ['Acme L.L.C.', 'Acme', 'L.L.C.'],
        ['Acme Corp', 'Acme', 'Corp'],
        ['Acme Corp.', 'Acme', 'Corp.'],
        ['Acme Corporation', 'Acme', 'Corporation'],
        ['Acme Ltd', 'Acme', 'Ltd'],
        ['Acme Ltd.', 'Acme', 'Ltd.'],
        ['Acme Limited', 'Acme', 'Limited'],
        ['Acme Co', 'Acme', 'Co'],
        ['Acme Co.', 'Acme', 'Co.'],
        ['Acme Company', 'Acme', 'Company'],
        ['Acme LLP', 'Acme', 'LLP'],
        ['Acme GmbH', 'Acme', 'GmbH'],
        ['Acme Pty Ltd', 'Acme Pty', 'Ltd'],
        ['Acme, Inc.', 'Acme', 'Inc.'],
      ])('should strip suffix from "%s"', (input, expectedName, expectedSuffix) => {
        const result = engine.normalizeCompanyName(input);
        expect(result.normalized).toBe(expectedName);
        expect(result.suffix).toBe(expectedSuffix);
      });

      it('should preserve suffix when preserveSuffix option is true', () => {
        const result = engine.normalizeCompanyName('Acme Inc.', { preserveSuffix: true });
        expect(result.normalized).toBe('Acme Inc');
        expect(result.suffix).toBeNull();
      });
    });

    describe('abbreviation expansion', () => {
      it.each([
        ['Acme Intl', 'Acme International'],
        ["Acme Int'l", 'Acme International'],
        ['Acme Natl', 'Acme National'],
        ['Acme Univ', 'Acme University'],
        ['Acme Assoc', 'Acme Associates'],
        ['Acme Mfg', 'Acme Manufacturing'],
        ['Acme Svcs', 'Acme Services'],
        ['Acme Tech', 'Acme Technology'],
        ['Acme Sys', 'Acme Systems'],
        ['Acme Mgmt', 'Acme Management'],
        ['Acme Grp', 'Acme Group'],
        ['Acme Dept', 'Acme Department'],
        ['Acme Govt', 'Acme Government'],
      ])('should expand abbreviation in "%s"', (input, expected) => {
        const result = engine.normalizeCompanyName(input);
        expect(result.normalized).toBe(expected);
      });
    });

    describe('title case and acronyms', () => {
      it('should convert to title case', () => {
        const result = engine.normalizeCompanyName('ACME WIDGETS');
        expect(result.normalized).toBe('Acme Widgets');
      });

      it('should preserve known acronyms', () => {
        const result = engine.normalizeCompanyName('IBM Software');
        expect(result.normalized).toBe('IBM Software');
      });

      it.each(['IBM', 'HP', 'AT&T', 'UPS', 'FedEx', 'GE', '3M', 'SAP', 'BMW'])(
        'should preserve acronym %s',
        (acronym) => {
          const result = engine.normalizeCompanyName(`${acronym} Solutions`);
          expect(result.normalized).toContain(acronym);
        }
      );
    });

    describe('punctuation removal', () => {
      it('should remove unnecessary commas and periods', () => {
        const result = engine.normalizeCompanyName('Acme, Corp.');
        expect(result.normalized).not.toContain(',');
      });

      it('should preserve periods in numbers', () => {
        const result = engine.normalizeCompanyName('Version 2.0 Software');
        expect(result.normalized).toContain('2.0');
      });
    });

    describe('matching form', () => {
      it('should generate matching form when forMatching is true', () => {
        const result = engine.normalizeCompanyName('The Acme Corporation, Inc.', { forMatching: true });
        expect(result.matchingForm).toBeDefined();
        // Suffix is stripped first, then matchingForm is generated from normalized "Acme Corporation"
        expect(result.matchingForm).toBe('acme corporation');
      });

      it('should strip "The" prefix in matching form', () => {
        const result = engine.normalizeCompanyName('The Home Depot', { forMatching: true });
        expect(result.matchingForm).toBe('home depot');
      });

      it('should remove special characters in matching form', () => {
        const result = engine.normalizeCompanyName('AT&T Inc.', { forMatching: true });
        expect(result.matchingForm).toBe('att');
      });
    });
  });

  // ============================================
  // Domain Normalization Tests
  // ============================================
  describe('normalizeDomain', () => {
    describe('basic normalization', () => {
      it('should handle null/empty input', () => {
        expect(engine.normalizeDomain(null).normalized).toBe('');
        expect(engine.normalizeDomain('').normalized).toBe('');
        expect(engine.normalizeDomain(null).valid).toBe(false);
      });

      it('should lowercase domain', () => {
        const result = engine.normalizeDomain('ACME.COM');
        expect(result.normalized).toBe('acme.com');
      });

      it('should trim whitespace', () => {
        const result = engine.normalizeDomain('  acme.com  ');
        expect(result.normalized).toBe('acme.com');
      });
    });

    describe('protocol stripping', () => {
      it.each([
        ['https://acme.com', 'acme.com'],
        ['http://acme.com', 'acme.com'],
        ['HTTP://ACME.COM', 'acme.com'],
        ['HTTPS://ACME.COM', 'acme.com'],
      ])('should strip protocol from "%s"', (input, expected) => {
        const result = engine.normalizeDomain(input);
        expect(result.normalized).toBe(expected);
        expect(result.changes.some(c => c.type === 'strip_protocol')).toBe(true);
      });
    });

    describe('www stripping', () => {
      it.each([
        ['www.acme.com', 'acme.com'],
        ['WWW.ACME.COM', 'acme.com'],
        ['https://www.acme.com', 'acme.com'],
      ])('should strip www from "%s"', (input, expected) => {
        const result = engine.normalizeDomain(input);
        expect(result.normalized).toBe(expected);
      });
    });

    describe('path and query stripping', () => {
      it('should strip path from URL', () => {
        const result = engine.normalizeDomain('acme.com/products/widget');
        expect(result.normalized).toBe('acme.com');
      });

      it('should strip query params from URL', () => {
        const result = engine.normalizeDomain('acme.com?ref=google');
        expect(result.normalized).toBe('acme.com');
      });

      it('should strip hash from URL', () => {
        const result = engine.normalizeDomain('acme.com#section');
        expect(result.normalized).toBe('acme.com');
      });

      it('should handle complex URLs', () => {
        const result = engine.normalizeDomain('https://www.acme.com/path/to/page?query=value#anchor');
        expect(result.normalized).toBe('acme.com');
      });
    });

    describe('validation', () => {
      it.each([
        ['acme.com', true],
        ['sub.acme.com', true],
        ['deep.sub.acme.com', true],
        ['acme.co.uk', true],
        ['a.io', true],
        ['acme', false],
        ['acme.', false],
        ['.acme.com', false],
        ['acme..com', false],
        ['-acme.com', false],
        ['acme-.com', false],
      ])('should validate "%s" as %s', (input, expectedValid) => {
        const result = engine.normalizeDomain(input);
        expect(result.valid).toBe(expectedValid);
      });
    });
  });

  // ============================================
  // Email Normalization Tests
  // ============================================
  describe('normalizeEmail', () => {
    describe('basic normalization', () => {
      it('should handle null/empty input', () => {
        expect(engine.normalizeEmail(null).normalized).toBe('');
        expect(engine.normalizeEmail('').normalized).toBe('');
        expect(engine.normalizeEmail(null).valid).toBe(false);
      });

      it('should lowercase email', () => {
        const result = engine.normalizeEmail('John.Doe@ACME.COM');
        expect(result.normalized).toBe('john.doe@acme.com');
      });

      it('should trim whitespace', () => {
        const result = engine.normalizeEmail('  john@acme.com  ');
        expect(result.normalized).toBe('john@acme.com');
      });
    });

    describe('plus addressing', () => {
      it('should preserve plus addressing by default', () => {
        const result = engine.normalizeEmail('john+newsletter@acme.com');
        expect(result.normalized).toBe('john+newsletter@acme.com');
      });

      it('should strip plus addressing when option is set', () => {
        const result = engine.normalizeEmail('john+newsletter@acme.com', { stripPlusAddressing: true });
        expect(result.normalized).toBe('john@acme.com');
        expect(result.changes.some(c => c.type === 'strip_plus_addressing')).toBe(true);
      });
    });

    describe('domain normalization', () => {
      it('should convert googlemail.com to gmail.com', () => {
        const result = engine.normalizeEmail('john@googlemail.com');
        expect(result.normalized).toBe('john@gmail.com');
      });
    });

    describe('validation', () => {
      it.each([
        ['john@acme.com', true],
        ['john.doe@acme.com', true],
        ['john+tag@acme.com', true],
        ['john_doe@acme.com', true],
        ['john123@acme.com', true],
        ['john@sub.acme.com', true],
        ['john@acme.co.uk', true],
        ['john', false],
        ['john@', false],
        ['@acme.com', false],
        ['john@acme', false],
        ['john@@acme.com', false],
      ])('should validate "%s" as %s', (input, expectedValid) => {
        const result = engine.normalizeEmail(input);
        expect(result.valid).toBe(expectedValid);
      });
    });

    describe('classification', () => {
      it.each([
        ['john@gmail.com', 'personal'],
        ['john@yahoo.com', 'personal'],
        ['john@hotmail.com', 'personal'],
        ['john@outlook.com', 'personal'],
        ['john@aol.com', 'personal'],
        ['john@icloud.com', 'personal'],
        ['john@protonmail.com', 'personal'],
        ['john@acme.com', 'business'],
        ['john@company.io', 'business'],
      ])('should classify "%s" as %s', (input, expected) => {
        const result = engine.normalizeEmail(input);
        expect(result.classification).toBe(expected);
      });

      it.each([
        ['info@acme.com', 'shared'],
        ['admin@acme.com', 'shared'],
        ['support@acme.com', 'shared'],
        ['sales@acme.com', 'shared'],
        ['contact@acme.com', 'shared'],
        ['hello@acme.com', 'shared'],
        ['team@acme.com', 'shared'],
        ['office@acme.com', 'shared'],
      ])('should classify "%s" as shared', (input, expected) => {
        const result = engine.normalizeEmail(input);
        expect(result.classification).toBe(expected);
      });
    });

    describe('domain extraction', () => {
      it('should extract domain', () => {
        const result = engine.normalizeEmail('john@acme.com');
        expect(result.domain).toBe('acme.com');
      });
    });
  });

  // ============================================
  // Phone Normalization Tests
  // ============================================
  describe('normalizePhone', () => {
    describe('basic normalization', () => {
      it('should handle null/empty input', () => {
        expect(engine.normalizePhone(null).normalized).toBe('');
        expect(engine.normalizePhone('').normalized).toBe('');
        expect(engine.normalizePhone(null).valid).toBe(false);
      });

      it('should trim whitespace', () => {
        const result = engine.normalizePhone('  (555) 123-4567  ');
        expect(result.normalized).toBe('+15551234567');
      });
    });

    describe('E.164 formatting', () => {
      it.each([
        ['5551234567', '+15551234567'],
        ['555-123-4567', '+15551234567'],
        ['(555) 123-4567', '+15551234567'],
        ['555.123.4567', '+15551234567'],
        ['555 123 4567', '+15551234567'],
        ['1-555-123-4567', '+15551234567'],
        ['+1-555-123-4567', '+15551234567'],
        ['+1 (555) 123-4567', '+15551234567'],
      ])('should format "%s" as E.164', (input, expected) => {
        const result = engine.normalizePhone(input);
        expect(result.normalized).toBe(expected);
        expect(result.valid).toBe(true);
      });
    });

    describe('extension handling', () => {
      it.each([
        ['555-123-4567 x123', '123'],
        ['555-123-4567 ext 456', '456'],
        ['555-123-4567 ext. 789', '789'],
        ['555-123-4567 extension 012', '012'],
        ['555-123-4567 #345', '345'],
      ])('should extract extension from "%s"', (input, expectedExt) => {
        const result = engine.normalizePhone(input);
        expect(result.extension).toBe(expectedExt);
        expect(result.normalized).toBe('+15551234567');
      });
    });

    describe('country code handling', () => {
      it('should add US country code by default', () => {
        const result = engine.normalizePhone('5551234567');
        expect(result.normalized).toBe('+15551234567');
        expect(result.changes.some(c => c.type === 'add_country_code')).toBe(true);
      });

      it('should preserve existing country code', () => {
        const result = engine.normalizePhone('+15551234567');
        expect(result.normalized).toBe('+15551234567');
      });

      it('should accept alternative default country', () => {
        const result = engine.normalizePhone('5551234567', { defaultCountry: 'CA' });
        expect(result.normalized).toBe('+15551234567'); // CA also uses +1
      });
    });

    describe('validation', () => {
      it('should validate proper E.164 format', () => {
        const result = engine.normalizePhone('5551234567');
        expect(result.valid).toBe(true);
      });

      it('should reject too short numbers', () => {
        const result = engine.normalizePhone('12345');
        expect(result.valid).toBe(false);
        expect(result.normalized).toBeNull();
      });

      it('should reject too long numbers', () => {
        const result = engine.normalizePhone('123456789012345678');
        expect(result.valid).toBe(false);
      });
    });
  });

  // ============================================
  // Address Normalization Tests
  // ============================================
  describe('normalizeAddress', () => {
    describe('basic normalization', () => {
      it('should handle null/empty input', () => {
        const result = engine.normalizeAddress(null);
        expect(result.normalized).toBeNull();
        expect(result.components).toBeNull();
      });
    });

    describe('object input', () => {
      it('should normalize address components', () => {
        const result = engine.normalizeAddress({
          street: '123 Main Street',
          city: 'San Francisco',
          state: 'California',
          postal_code: '94105'
        });
        expect(result.components.street).toBe('123 MAIN ST');
        expect(result.components.city).toBe('SAN FRANCISCO');
        expect(result.components.state).toBe('CA');
        expect(result.components.postal_code).toBe('94105');
      });

      it('should format ZIP+4', () => {
        const result = engine.normalizeAddress({
          street: '123 Main St',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '941051234'
        });
        expect(result.components.postal_code).toBe('94105-1234');
      });
    });

    describe('street type abbreviation', () => {
      it.each([
        ['Street', 'ST'],
        ['Avenue', 'AVE'],
        ['Boulevard', 'BLVD'],
        ['Drive', 'DR'],
        ['Road', 'RD'],
        ['Lane', 'LN'],
        ['Court', 'CT'],
        ['Circle', 'CIR'],
        ['Place', 'PL'],
        ['Parkway', 'PKWY'],
        ['Highway', 'HWY'],
        ['Way', 'WAY'],
        ['Terrace', 'TER'],
        ['Trail', 'TRL'],
        ['Square', 'SQ'],
      ])('should abbreviate %s to %s', (full, abbr) => {
        const result = engine.normalizeAddress({ street: `123 Main ${full}` });
        expect(result.components.street).toBe(`123 MAIN ${abbr}`);
      });
    });

    describe('direction abbreviation', () => {
      it.each([
        ['North', 'N'],
        ['South', 'S'],
        ['East', 'E'],
        ['West', 'W'],
        ['Northeast', 'NE'],
        ['Northwest', 'NW'],
        ['Southeast', 'SE'],
        ['Southwest', 'SW'],
      ])('should abbreviate %s to %s', (full, abbr) => {
        const result = engine.normalizeAddress({ street: `123 ${full} Main Street` });
        expect(result.components.street).toContain(abbr);
      });
    });

    describe('unit abbreviation', () => {
      it.each([
        ['Suite 100', 'STE 100'],
        ['Apartment 5B', 'APT 5B'],
        ['Unit 12', 'UNIT 12'],
        ['Floor 3', 'FL 3'],
        ['Building A', 'BLDG A'],
        ['Room 201', 'RM 201'],
      ])('should abbreviate "%s" to "%s"', (full, abbr) => {
        const result = engine.normalizeAddress({ street2: full });
        expect(result.components.street2).toBe(abbr);
      });
    });

    describe('state normalization', () => {
      it.each([
        ['California', 'CA'],
        ['New York', 'NY'],
        ['Texas', 'TX'],
        ['Florida', 'FL'],
        ['Illinois', 'IL'],
        ['Pennsylvania', 'PA'],
        ['District of Columbia', 'DC'],
      ])('should normalize %s to %s', (full, abbr) => {
        const result = engine.normalizeAddress({ state: full });
        expect(result.components.state).toBe(abbr);
      });

      it('should preserve already abbreviated states', () => {
        const result = engine.normalizeAddress({ state: 'CA' });
        expect(result.components.state).toBe('CA');
      });
    });

    describe('string parsing', () => {
      it('should parse simple address string with newline-separated city/state', () => {
        // The parser splits on both newlines AND commas, so "City, State ZIP" needs proper format
        const result = engine.normalizeAddress('123 Main Street\nAustin\nTX 78701');
        expect(result.components.street).toBe('123 MAIN ST');
        expect(result.components.state).toBe('TX');
        expect(result.components.postal_code).toBe('78701');
      });

      it('should extract state and ZIP from combined line', () => {
        // The basic parser extracts state+ZIP from "TX 78701" format
        const result = engine.normalizeAddress('123 Main Street\nTX 78701');
        expect(result.components.state).toBe('TX');
        expect(result.components.postal_code).toBe('78701');
      });

      it('should extract just ZIP from single line', () => {
        const result = engine.normalizeAddress('123 Main Street\n78701');
        expect(result.components.postal_code).toBe('78701');
      });
    });

    describe('normalized string output', () => {
      it('should build proper USPS format string', () => {
        const result = engine.normalizeAddress({
          street: '123 Main Street',
          street2: 'Suite 100',
          city: 'San Francisco',
          state: 'California',
          postal_code: '94105'
        });
        expect(result.normalized).toBe('123 MAIN ST\nSTE 100\nSAN FRANCISCO, CA 94105');
      });

      it('should exclude US/USA country', () => {
        const result = engine.normalizeAddress({
          street: '123 Main St',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94105',
          country: 'USA'
        });
        expect(result.normalized).not.toContain('USA');
      });

      it('should include non-US country', () => {
        const result = engine.normalizeAddress({
          street: '123 Main St',
          city: 'Toronto',
          state: 'ON',
          postal_code: 'M5V 1J2',
          country: 'Canada'
        });
        expect(result.normalized).toContain('CANADA');
      });
    });
  });

  // ============================================
  // Title Normalization Tests
  // ============================================
  describe('normalizeTitle', () => {
    describe('basic normalization', () => {
      it('should handle null/empty input', () => {
        expect(engine.normalizeTitle(null).normalized).toBe('');
        expect(engine.normalizeTitle('').normalized).toBe('');
      });

      it('should preserve original value', () => {
        const result = engine.normalizeTitle('VP Sales');
        expect(result.original).toBe('VP Sales');
      });
    });

    describe('abbreviation expansion', () => {
      it('should expand VP to Vice President', () => {
        const result = engine.normalizeTitle('VP Sales');
        expect(result.normalized).toContain('Vice President');
      });

      it('should expand Sr. to Senior', () => {
        const result = engine.normalizeTitle('Sr. Engineer');
        expect(result.normalized).toContain('Senior');
      });

      it('should expand Mgr to Manager', () => {
        const result = engine.normalizeTitle('Sales Mgr');
        expect(result.normalized).toContain('Manager');
      });
    });

    describe('separator standardization', () => {
      it('should standardize slashes to dashes', () => {
        const result = engine.normalizeTitle('Sales/Marketing Director');
        expect(result.normalized).toContain(' - ');
      });

      it('should standardize pipes to dashes', () => {
        const result = engine.normalizeTitle('Sales | Marketing');
        expect(result.normalized).toContain(' - ');
      });
    });

    describe('case normalization', () => {
      it('should apply title case', () => {
        const result = engine.normalizeTitle('senior software engineer');
        expect(result.normalized).toBe('Senior Software Engineer');
      });
    });
  });

  // ============================================
  // Person Name Normalization Tests
  // ============================================
  describe('normalizePersonName', () => {
    describe('basic normalization', () => {
      it('should handle null/empty input', () => {
        expect(engine.normalizePersonName(null).normalized).toBe('');
        expect(engine.normalizePersonName('').normalized).toBe('');
      });

      it('should trim whitespace', () => {
        const result = engine.normalizePersonName('  John Doe  ');
        expect(result.normalized).toBe('John Doe');
      });
    });

    describe('honorific handling', () => {
      it.each([
        ['Mr. John Doe', 'Mr.'],
        ['Mrs. Jane Doe', 'Mrs.'],
        ['Ms. Jane Doe', 'Ms.'],
        ['Miss Jane Doe', 'Miss'],
        ['Dr. John Doe', 'Dr.'],
        ['Prof. John Doe', 'Prof.'],
        ['Rev. John Doe', 'Rev.'],
        ['Hon. John Doe', 'Hon.'],
        ['Sir John Doe', 'Sir'],
      ])('should extract honorific from "%s"', (input, expectedHonorific) => {
        const result = engine.normalizePersonName(input);
        expect(result.honorific).toBe(expectedHonorific);
        expect(result.normalized).not.toContain(expectedHonorific);
      });
    });

    describe('suffix handling', () => {
      it.each([
        ['John Doe Jr.', 'Jr.'],
        ['John Doe Jr', 'Jr'],
        ['John Doe Sr.', 'Sr.'],
        ['John Doe Sr', 'Sr'],
        ['John Doe II', 'II'],
        ['John Doe III', 'III'],
        ['John Doe IV', 'IV'],
        ['John Doe PhD', 'PhD'],
        ['John Doe Ph.D.', 'Ph.D.'],
        ['John Doe MD', 'MD'],
        ['John Doe M.D.', 'M.D.'],
        ['John Doe Esq.', 'Esq.'],
        ['John Doe CPA', 'CPA'],
        ['John Doe, Jr.', 'Jr.'],
      ])('should extract suffix from "%s"', (input, expectedSuffix) => {
        const result = engine.normalizePersonName(input);
        expect(result.suffix).toBe(expectedSuffix);
        expect(result.normalized).not.toContain(expectedSuffix);
      });
    });

    describe('proper case handling', () => {
      it('should convert to proper case', () => {
        const result = engine.normalizePersonName('JOHN DOE');
        expect(result.normalized).toBe('John Doe');
      });

      it('should handle McDonald', () => {
        const result = engine.normalizePersonName('john mcdonald');
        expect(result.normalized).toBe('John McDonald');
      });

      it('should handle MacDonald', () => {
        const result = engine.normalizePersonName('john macdonald');
        expect(result.normalized).toBe('John MacDonald');
      });

      it("should handle O'Brien", () => {
        const result = engine.normalizePersonName("john o'brien");
        expect(result.normalized).toBe("John O'Brien");
      });

      it("should handle O'Connor", () => {
        const result = engine.normalizePersonName("mary o'connor");
        expect(result.normalized).toBe("Mary O'Connor");
      });

      it('should handle van prefix', () => {
        const result = engine.normalizePersonName('LUDWIG VAN BEETHOVEN');
        expect(result.normalized).toBe('Ludwig van Beethoven');
      });

      it('should handle von prefix', () => {
        const result = engine.normalizePersonName('OTTO VON BISMARCK');
        expect(result.normalized).toBe('Otto von Bismarck');
      });

      it('should handle de prefix', () => {
        const result = engine.normalizePersonName('CHARLES DE GAULLE');
        expect(result.normalized).toBe('Charles de Gaulle');
      });
    });
  });

  // ============================================
  // Government Entity Normalization Tests
  // ============================================
  describe('normalizeGovernmentEntity', () => {
    describe('basic normalization', () => {
      it('should handle null/empty input', () => {
        expect(engine.normalizeGovernmentEntity(null).normalized).toBe('');
        expect(engine.normalizeGovernmentEntity('').normalized).toBe('');
      });

      it('should trim whitespace', () => {
        const result = engine.normalizeGovernmentEntity('  City of Austin  ');
        expect(result.normalized).toBe('City of Austin');
      });
    });

    describe('jurisdiction detection', () => {
      it.each([
        ['City of Austin', 'City of'],
        ['Town of Greenwich', 'Town of'],
        ['Village of Scarsdale', 'Village of'],
        ['Borough of Manhattan', 'Borough of'],
        ['County of Los Angeles', 'County of'],
        ['State of California', 'State of'],
        ['Commonwealth of Virginia', 'Commonwealth of'],
      ])('should detect jurisdiction in "%s"', (input, expectedJurisdiction) => {
        const result = engine.normalizeGovernmentEntity(input);
        expect(result.jurisdiction).toBe(expectedJurisdiction);
      });
    });

    describe('department expansion', () => {
      it.each([
        ['Austin Police Dept', 'Austin Police Department'],
        ['Austin Police Dept.', 'Austin Police Department.'],  // Trailing period preserved
        ['Austin PD', 'Austin Police Department'],
        ['Austin Fire Dept', 'Austin Fire Department'],
        ['Austin Fire Dept.', 'Austin Fire Department.'],  // Trailing period preserved
        ['Austin FD', 'Austin Fire Department'],
        ['Dept of Transportation', 'Department of Transportation'],
        ['Dept. of Transportation', 'Department of Transportation'],
      ])('should expand "%s" to "%s"', (input, expected) => {
        const result = engine.normalizeGovernmentEntity(input);
        expect(result.normalized).toBe(expected);
      });
    });

    describe('department type detection', () => {
      it.each([
        ['Austin Police Department', 'police'],
        ['Austin Fire Department', 'fire'],
        ['Department of Public Works', 'public_works'],
        ['Parks and Recreation', 'parks'],
        ['Department of Finance', 'finance'],
        ['Human Resources Department', 'hr'],
        ['Information Technology Department', 'it'],
      ])('should detect department type in "%s"', (input, expectedType) => {
        const result = engine.normalizeGovernmentEntity(input);
        expect(result.department).toBe(expectedType);
      });
    });
  });

  // ============================================
  // Record Normalization Tests
  // ============================================
  describe('normalizeRecord', () => {
    it('should normalize multiple fields', () => {
      const record = {
        account_name: 'Acme Corp.',
        website: 'https://www.acme.com',
        email: 'John.Doe@ACME.COM',
        phone: '(555) 123-4567'
      };

      const result = engine.normalizeRecord(record);

      expect(result.normalized.account_name).toBe('Acme');
      expect(result.normalized.website).toBe('acme.com');
      expect(result.normalized.email).toBe('john.doe@acme.com');
      expect(result.normalized.phone).toBe('+15551234567');
    });

    it('should preserve unrecognized fields', () => {
      const record = {
        account_name: 'Acme Corp.',
        custom_field: 'custom value'
      };

      const result = engine.normalizeRecord(record);
      expect(result.normalized.custom_field).toBe('custom value');
    });

    it('should handle null/undefined field values', () => {
      const record = {
        account_name: null,
        website: undefined,
        email: 'test@acme.com'
      };

      const result = engine.normalizeRecord(record);
      expect(result.normalized.account_name).toBeNull();
      expect(result.normalized.website).toBeUndefined();
      expect(result.normalized.email).toBe('test@acme.com');
    });

    it('should use custom field mapping', () => {
      const record = {
        company: 'Test Corp.',
        web_address: 'www.test.com'
      };

      const fieldMap = {
        company: 'company_name',
        web_address: 'domain'
      };

      const result = engine.normalizeRecord(record, fieldMap);
      expect(result.normalized.company).toBe('Test');
      expect(result.normalized.web_address).toBe('test.com');
    });

    it('should track changes for each field', () => {
      const record = {
        account_name: 'Acme Inc.'
      };

      const result = engine.normalizeRecord(record);
      expect(result.changes.account_name).toBeDefined();
      expect(result.changes.account_name.suffix).toBe('Inc.');
    });

    it('should use default field mapping', () => {
      const record = {
        name: 'Test LLC',
        domain: 'https://test.com/page',
        title: 'VP Sales',
        first_name: 'john mcdonald'
      };

      const result = engine.normalizeRecord(record);
      expect(result.normalized.name).toBe('Test');
      expect(result.normalized.domain).toBe('test.com');
      expect(result.normalized.first_name).toBe('John McDonald');
    });
  });

  // ============================================
  // Cache Tests
  // ============================================
  describe('cache management', () => {
    it('should clear cache', () => {
      engine.normalizeCompanyName('Test Company');
      expect(engine.cache.size).toBeGreaterThanOrEqual(0);
      engine.clearCache();
      expect(engine.cache.size).toBe(0);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================
  describe('edge cases', () => {
    describe('unicode handling', () => {
      it('should handle unicode in company names', () => {
        const result = engine.normalizeCompanyName('Société Générale');
        expect(result.normalized).toBeDefined();
      });

      it('should handle unicode in person names', () => {
        const result = engine.normalizePersonName('José García');
        expect(result.normalized).toBeDefined();
      });
    });

    describe('special characters', () => {
      it('should handle ampersand in company names', () => {
        const result = engine.normalizeCompanyName('Johnson & Johnson');
        expect(result.normalized).toContain('&');
      });

      it('should handle hyphens in domains', () => {
        const result = engine.normalizeDomain('my-company.com');
        expect(result.normalized).toBe('my-company.com');
        expect(result.valid).toBe(true);
      });
    });

    describe('extreme inputs', () => {
      it('should handle very long company names', () => {
        const longName = 'A'.repeat(500) + ' Inc.';
        const result = engine.normalizeCompanyName(longName);
        expect(result.normalized.length).toBeLessThan(longName.length);
      });

      it('should handle very long emails', () => {
        const longEmail = 'a'.repeat(100) + '@' + 'b'.repeat(100) + '.com';
        const result = engine.normalizeEmail(longEmail);
        expect(result.valid).toBe(true);
      });
    });

    describe('mixed case handling', () => {
      it('should handle all caps', () => {
        const result = engine.normalizeCompanyName('ACME INTERNATIONAL INC');
        expect(result.normalized).toBe('Acme International');
      });

      it('should handle all lowercase', () => {
        const result = engine.normalizeCompanyName('acme international inc');
        expect(result.normalized).toBe('Acme International');
      });
    });
  });

  // ============================================
  // DEFAULT_RULES Export Tests
  // ============================================
  describe('DEFAULT_RULES export', () => {
    it('should export DEFAULT_RULES', () => {
      expect(DEFAULT_RULES).toBeDefined();
      expect(DEFAULT_RULES.company_name).toBeDefined();
      expect(DEFAULT_RULES.us_states).toBeDefined();
      expect(DEFAULT_RULES.street_abbreviations).toBeDefined();
    });

    it('should have all US states', () => {
      expect(Object.keys(DEFAULT_RULES.us_states).length).toBe(51); // 50 states + DC
    });
  });
});
