/**
 * International Phone and Address Normalization Tests
 *
 * Tests for international phone number detection, address formatting,
 * and region detection across NA, LATAM, EU, UK, and APAC regions.
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Skip tests if libphonenumber-js is not installed
let libphonenumberAvailable = false;
try {
  require('libphonenumber-js');
  libphonenumberAvailable = true;
} catch (e) {
  console.warn('libphonenumber-js not installed, skipping phone detection tests');
}

const { NormalizationEngine } = require('../normalization-engine');
const { PhoneCountryDetector } = libphonenumberAvailable ? require('../phone-country-detector') : { PhoneCountryDetector: null };
const { RegionDetector } = require('../region-detector');

describe('International Configuration Loading', () => {
  test('loads country codes configuration', () => {
    const configPath = path.join(__dirname, '../../../config/international/country-codes.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.countries).toBeDefined();
    expect(config.countries.US).toBeDefined();
    expect(config.countries.GB).toBeDefined();
    expect(config.countries.DE).toBeDefined();
    expect(config.regions).toBeDefined();
  });

  test('loads state/province mappings', () => {
    const stateDir = path.join(__dirname, '../../../config/international/state-provinces');
    expect(fs.existsSync(stateDir)).toBe(true);

    const files = fs.readdirSync(stateDir).filter(f => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);

    // Check specific regions
    expect(files).toContain('north-america.json');
    expect(files).toContain('europe.json');
    expect(files).toContain('uk-ireland.json');
    expect(files).toContain('latin-america.json');
    expect(files).toContain('apac.json');
  });

  test('loads address format configurations', () => {
    const addressDir = path.join(__dirname, '../../../config/international/address-formats');
    expect(fs.existsSync(addressDir)).toBe(true);

    const files = fs.readdirSync(addressDir).filter(f => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
  });
});

describe('NormalizationEngine International Support', () => {
  let engine;

  beforeEach(() => {
    engine = new NormalizationEngine();
  });

  test('loads international configuration on initialization', () => {
    expect(engine.internationalConfig).toBeDefined();
    expect(engine.internationalConfig.loaded).toBe(true);
    expect(Object.keys(engine.internationalConfig.stateProvinces).length).toBeGreaterThan(0);
  });

  test('supports default country configuration', () => {
    const usEngine = new NormalizationEngine({ defaultCountry: 'US' });
    expect(usEngine.defaultCountry).toBe('US');

    const deEngine = new NormalizationEngine({ defaultCountry: 'DE' });
    expect(deEngine.defaultCountry).toBe('DE');
  });
});

describe('Phone Number Normalization', () => {
  let engine;

  beforeEach(() => {
    engine = new NormalizationEngine();
  });

  describe('US Phone Numbers', () => {
    test('normalizes 10-digit US number', () => {
      // Use valid US area code (212 = New York)
      const result = engine.normalizePhone('(212) 456-7890');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('+12124567890');
    });

    test('normalizes US number with country code', () => {
      const result = engine.normalizePhone('+1 212-456-7890');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('+12124567890');
    });

    test('extracts extension from US number', () => {
      const result = engine.normalizePhone('+1 212-456-7890 x123');
      expect(result.valid).toBe(true);
      expect(result.extension).toBe('123');
    });
  });

  if (libphonenumberAvailable) {
    describe('International Phone Numbers', () => {
      test('normalizes UK phone number', () => {
        const result = engine.normalizePhone('+44 20 7946 0958');
        expect(result.valid).toBe(true);
        expect(result.country).toBe('GB');
      });

      test('normalizes German phone number', () => {
        const result = engine.normalizePhone('+49 30 12345678');
        expect(result.valid).toBe(true);
        expect(result.country).toBe('DE');
      });

      test('normalizes Brazilian phone number', () => {
        const result = engine.normalizePhone('+55 11 99999-8888');
        expect(result.valid).toBe(true);
        expect(result.country).toBe('BR');
      });

      test('normalizes Japanese phone number', () => {
        const result = engine.normalizePhone('+81 3-1234-5678');
        expect(result.valid).toBe(true);
        expect(result.country).toBe('JP');
      });

      test('normalizes Australian phone number', () => {
        const result = engine.normalizePhone('+61 2 9876 5432');
        expect(result.valid).toBe(true);
        expect(result.country).toBe('AU');
      });

      test('uses region hint for ambiguous numbers', () => {
        const result = engine.normalizePhone('20 7946 0958', {
          defaultCountry: 'GB',
          region: 'UK'
        });
        expect(result.valid).toBe(true);
        expect(result.country).toBe('GB');
      });
    });
  }
});

describe('Address Normalization', () => {
  let engine;

  beforeEach(() => {
    engine = new NormalizationEngine();
  });

  describe('US Addresses', () => {
    test('normalizes US address with state abbreviation', () => {
      const result = engine.normalizeAddress({
        street: '123 Main Street',
        city: 'Boston',
        state: 'Massachusetts',
        postal_code: '02101'
      });

      expect(result.components.street).toBe('123 MAIN ST');
      expect(result.components.state).toBe('MA');
      expect(result.components.postal_code).toBe('02101');
    });

    test('formats ZIP+4 postal code', () => {
      const result = engine.normalizeAddress({
        street: '123 Main St',
        city: 'Boston',
        state: 'MA',
        postal_code: '021011234'
      }, { country: 'US' });

      expect(result.components.postal_code).toBe('02101-1234');
    });

    test('abbreviates street types', () => {
      const result = engine.normalizeAddress({
        street: '456 Oak Avenue',
        city: 'Chicago',
        state: 'IL',
        postal_code: '60601'
      });

      expect(result.components.street).toContain('AVE');
    });
  });

  describe('International Addresses', () => {
    test('normalizes Canadian address', () => {
      const result = engine.normalizeAddress({
        street: '123 Maple Street',
        city: 'Toronto',
        state: 'Ontario',
        postal_code: 'M5V3A8'
      }, { country: 'CA' });

      expect(result.components.state).toBe('ON');
      expect(result.components.postal_code).toBe('M5V 3A8');
    });

    test('normalizes UK address', () => {
      const result = engine.normalizeAddress({
        street: '10 Downing Street',
        city: 'London',
        postal_code: 'SW1A2AA'
      }, { country: 'GB' });

      expect(result.components.postal_code).toBe('SW1A 2AA');
    });

    test('normalizes German address', () => {
      const result = engine.normalizeAddress({
        street: 'Hauptstraße 1',
        city: 'Berlin',
        state: 'Berlin',
        postal_code: '10115'
      }, { country: 'DE' });

      expect(result.components.state).toBe('BE');
    });

    test('normalizes Brazilian address', () => {
      const result = engine.normalizeAddress({
        street: 'Avenida Paulista 1000',
        city: 'São Paulo',
        state: 'São Paulo',
        postal_code: '01310100'
      }, { country: 'BR' });

      expect(result.components.state).toBe('SP');
      expect(result.components.postal_code).toBe('01310-100');
    });

    test('normalizes Japanese postal code', () => {
      const result = engine.normalizeAddress({
        street: '1-2-3 Shibuya',
        city: 'Tokyo',
        state: 'Tokyo',
        postal_code: '1500041'
      }, { country: 'JP' });

      expect(result.components.postal_code).toBe('150-0041');
    });
  });

  describe('State/Province Normalization', () => {
    test('normalizes US states', () => {
      const engine = new NormalizationEngine();
      const states = [
        ['California', 'CA'],
        ['New York', 'NY'],
        ['Texas', 'TX'],
        ['Florida', 'FL']
      ];

      states.forEach(([fullName, code]) => {
        const result = engine.normalizeAddress({
          street: '123 Test St',
          city: 'City',
          state: fullName,
          postal_code: '12345'
        });
        expect(result.components.state).toBe(code);
      });
    });

    test('normalizes Canadian provinces', () => {
      const result = engine.normalizeAddress({
        street: '123 Test St',
        city: 'Vancouver',
        state: 'British Columbia',
        postal_code: 'V6B3K9'
      }, { country: 'CA' });

      expect(result.components.state).toBe('BC');
    });

    test('normalizes German states', () => {
      const result = engine.normalizeAddress({
        street: 'Test Str 1',
        city: 'Munich',
        state: 'Bayern',
        postal_code: '80331'
      }, { country: 'DE' });

      expect(result.components.state).toBe('BY');
    });

    test('normalizes Australian states', () => {
      const result = engine.normalizeAddress({
        street: '123 Test St',
        city: 'Sydney',
        state: 'New South Wales',
        postal_code: '2000'
      }, { country: 'AU' });

      expect(result.components.state).toBe('NSW');
    });
  });
});

describe('Region Detector', () => {
  let detector;

  beforeEach(() => {
    detector = new RegionDetector();
  });

  describe('Postal Code Detection', () => {
    test('detects US from ZIP code', () => {
      const result = detector.detect({ postalCode: '02101' });
      expect(result.country).toBe('US');
    });

    test('detects UK from postcode', () => {
      const result = detector.detect({ postalCode: 'SW1A 2AA' });
      expect(result.country).toBe('GB');
    });

    test('detects Canada from postal code', () => {
      const result = detector.detect({ postalCode: 'K1A 0B1' });
      expect(result.country).toBe('CA');
    });

    test('detects Brazil from CEP', () => {
      const result = detector.detect({ postalCode: '01310-100' });
      expect(result.country).toBe('BR');
    });

    test('detects Japan from postal code', () => {
      const result = detector.detect({ postalCode: '150-0041' });
      expect(result.country).toBe('JP');
    });
  });

  describe('State/Province Detection', () => {
    test('detects US from state name', () => {
      const result = detector.detect({ state: 'California' });
      expect(result.country).toBe('US');
    });

    test('detects Australia from state name', () => {
      const result = detector.detect({ state: 'New South Wales' });
      expect(result.country).toBe('AU');
    });

    test('detects Germany from state name', () => {
      const result = detector.detect({ state: 'Bayern' });
      expect(result.country).toBe('DE');
    });
  });

  describe('Street Keyword Detection', () => {
    test('detects German from Straße', () => {
      const result = detector.detect({ street: 'Hauptstraße 1' });
      expect(result.country).toBe('DE');
    });

    test('detects French from Rue', () => {
      const result = detector.detect({ street: '1 Rue de la Paix' });
      expect(result.country).toBe('FR');
    });

    test('detects Spanish from Calle', () => {
      const result = detector.detect({ street: 'Calle Mayor 10' });
      expect(result.country).toBe('ES');
    });

    test('detects Brazilian from Avenida', () => {
      const result = detector.detect({ street: 'Avenida Paulista 1000' });
      // Could match ES or BR, check it's one of them
      expect(['BR', 'ES', 'PT']).toContain(result.country);
    });
  });

  describe('Character Pattern Detection', () => {
    test('detects Japanese from Hiragana/Katakana', () => {
      // Use Hiragana (の) or Katakana (マンション) for Japanese detection
      // Pure Kanji could be Chinese, so include Japanese-specific scripts
      const result = detector.detect({ street: '渋谷区神南のマンション1-2-3' });
      expect(result.country).toBe('JP');
    });

    test('detects Korean from Hangul', () => {
      const result = detector.detect({ street: '서울특별시 강남구' });
      expect(result.country).toBe('KR');
    });

    test('detects Thai from Thai script', () => {
      const result = detector.detect({ street: 'ถนนสุขุมวิท' });
      expect(result.country).toBe('TH');
    });
  });

  describe('Multi-Signal Detection', () => {
    test('combines multiple signals for higher confidence', () => {
      const result = detector.detect({
        street: '10 Downing Street',
        city: 'London',
        postalCode: 'SW1A 2AA'
      });

      expect(result.success).toBe(true);
      expect(result.country).toBe('GB');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('explicit country overrides detection', () => {
      const result = detector.detect({
        country: 'Germany',
        street: '123 Main Street', // US-looking street
        postalCode: '02101' // US ZIP
      });

      // Explicit country should win even when other signals point elsewhere
      expect(result.country).toBe('DE');
      expect(result.success).toBe(true);
      // Has explicit_country signal
      expect(result.signals.some(s => s.source === 'explicit_country' && s.country === 'DE')).toBe(true);
    });
  });
});

if (libphonenumberAvailable) {
  describe('PhoneCountryDetector', () => {
    let detector;

    beforeEach(() => {
      detector = new PhoneCountryDetector();
    });

    describe('Phone Detection', () => {
      test('detects US from +1 prefix', () => {
        // Use valid US number (212 = New York)
        const result = detector.detect('+1 212 456 7890');
        expect(result.success).toBe(true);
        expect(result.country).toBe('US');
        expect(result.confidence).toBeGreaterThan(0.9);
      });

      test('detects UK from +44 prefix', () => {
        const result = detector.detect('+44 20 7946 0958');
        expect(result.success).toBe(true);
        expect(result.country).toBe('GB');
      });

      test('detects Germany from +49 prefix', () => {
        const result = detector.detect('+49 30 12345678');
        expect(result.success).toBe(true);
        expect(result.country).toBe('DE');
      });

      test('uses country hint for numbers without prefix', () => {
        const result = detector.detect('030 12345678', { defaultCountry: 'DE' });
        expect(result.success).toBe(true);
        expect(result.country).toBe('DE');
      });
    });

    describe('Phone Normalization', () => {
      test('normalizes to E.164 format', () => {
        // Use valid US number
        const result = detector.normalize('+1 (212) 456-7890');
        expect(result.normalized).toBe('+12124567890');
      });

      test('normalizes to international format', () => {
        const result = detector.normalize('+1 212 456 7890', { format: 'INTERNATIONAL' });
        expect(result.normalized).toContain('+1');
      });

      test('normalizes to national format', () => {
        const result = detector.normalize('+1 212 456 7890', { format: 'NATIONAL' });
        expect(result.normalized).not.toContain('+1');
      });
    });

    describe('Phone Validation', () => {
      test('validates correct US number', () => {
        // Use valid US number
        const result = detector.validate('+1 212 456 7890');
        expect(result.valid).toBe(true);
      });

      test('rejects invalid number', () => {
        const result = detector.validate('+1 123'); // Too short
        expect(result.valid).toBe(false);
      });
    });

    describe('Region Support', () => {
      test('returns region for country', () => {
        expect(detector.getRegion('US')).toBe('NA');
        expect(detector.getRegion('GB')).toBe('UK');
        expect(detector.getRegion('DE')).toBe('EU');
        expect(detector.getRegion('BR')).toBe('LATAM');
        expect(detector.getRegion('JP')).toBe('APAC');
      });

      test('gets countries in region', () => {
        const naCountries = detector.getCountriesInRegion('NA');
        expect(naCountries).toContain('US');
        expect(naCountries).toContain('CA');
      });
    });
  });
}

describe('Backward Compatibility', () => {
  test('existing US phone normalization still works', () => {
    const engine = new NormalizationEngine();
    // Use valid US phone number (617 = Boston)
    const result = engine.normalizePhone('+1 617-555-1234');

    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('+16175551234');
  });

  test('existing US address normalization still works', () => {
    const engine = new NormalizationEngine();
    const result = engine.normalizeAddress({
      street: '123 Main Street',
      city: 'Boston',
      state: 'Massachusetts',
      postal_code: '02101',
      country: 'US' // Explicit country for uppercase
    });

    // US addresses should uppercase
    expect(result.components.state).toBe('MA');
    expect(result.components.street).toContain('MAIN');
    expect(result.normalized).toContain('BOSTON');
  });

  test('string address parsing still works', () => {
    const engine = new NormalizationEngine();
    const result = engine.normalizeAddress('123 Main Street, Boston, MA 02101');

    expect(result.components.street).toBeDefined();
    expect(result.components.state).toBe('MA');
  });
});
