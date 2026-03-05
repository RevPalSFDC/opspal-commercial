/**
 * Phone Country Detector
 *
 * Intelligent phone number parsing, validation, and country detection using libphonenumber-js.
 * Provides confidence scoring and supports all international phone formats.
 *
 * @module phone-country-detector
 */

'use strict';

const {
  parsePhoneNumber,
  parsePhoneNumberFromString,
  isValidPhoneNumber,
  getCountryCallingCode,
  getCountries,
  getExampleNumber,
  AsYouType,
  isSupportedCountry
} = require('libphonenumber-js');

const fs = require('fs');
const path = require('path');

/**
 * Region definitions for grouping countries
 */
const REGIONS = {
  NA: ['US', 'CA'],
  LATAM: ['MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'VE', 'EC', 'UY', 'PY', 'BO'],
  EU: ['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'CH', 'AT', 'PL', 'PT', 'SE', 'NO', 'DK', 'FI', 'CZ', 'HU', 'RO', 'GR'],
  UK: ['GB', 'IE'],
  APAC: ['AU', 'NZ', 'JP', 'KR', 'SG', 'HK', 'IN', 'CN', 'TW', 'MY', 'TH', 'PH', 'ID', 'VN']
};

/**
 * Country aliases for normalization
 */
const COUNTRY_ALIASES = {
  'UK': 'GB',
  'USA': 'US',
  'ENGLAND': 'GB',
  'BRITAIN': 'GB',
  'GREAT BRITAIN': 'GB',
  'DEUTSCHLAND': 'DE',
  'BRASIL': 'BR'
};

class PhoneCountryDetector {
  /**
   * Create a new PhoneCountryDetector instance
   * @param {Object} [options] - Configuration options
   * @param {string} [options.defaultCountry='US'] - Default country for ambiguous numbers
   * @param {string} [options.defaultRegion=null] - Default region hint
   */
  constructor(options = {}) {
    this.defaultCountry = this._normalizeCountryCode(options.defaultCountry || 'US');
    this.defaultRegion = options.defaultRegion || null;
    this.countryConfigs = this._loadCountryConfigs();
  }

  /**
   * Load country configurations from config files
   * @private
   */
  _loadCountryConfigs() {
    const configDir = path.join(__dirname, '../..', 'config', 'international');
    const countryCodesPath = path.join(configDir, 'country-codes.json');

    try {
      if (fs.existsSync(countryCodesPath)) {
        return JSON.parse(fs.readFileSync(countryCodesPath, 'utf-8'));
      }
    } catch (error) {
      console.warn(`Failed to load country configs: ${error.message}`);
    }

    return { countries: {}, regions: {}, aliases: {} };
  }

  /**
   * Normalize country code (handle aliases)
   * @private
   */
  _normalizeCountryCode(code) {
    if (!code) return null;
    const upper = code.toUpperCase();
    return COUNTRY_ALIASES[upper] || this.countryConfigs?.aliases?.[upper] || upper;
  }

  /**
   * Parse and detect country from a phone number
   * @param {string} phoneNumber - The phone number to analyze
   * @param {Object} [options] - Options
   * @param {string} [options.defaultCountry] - Country hint for parsing
   * @param {string} [options.region] - Region hint (NA, LATAM, EU, UK, APAC)
   * @returns {Object} Detection result with confidence score
   */
  detect(phoneNumber, options = {}) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return {
        success: false,
        error: 'Invalid input: phone number must be a non-empty string',
        confidence: 0
      };
    }

    const cleanNumber = phoneNumber.trim();
    const defaultCountry = this._normalizeCountryCode(options.defaultCountry) || this.defaultCountry;
    const regionHint = options.region || this.defaultRegion;

    // Try parsing with explicit country code first (if number starts with +)
    if (cleanNumber.startsWith('+')) {
      return this._parseWithCountryCode(cleanNumber);
    }

    // Try parsing with country hint
    if (defaultCountry) {
      const result = this._parseWithHint(cleanNumber, defaultCountry);
      if (result.success) {
        return result;
      }
    }

    // Try region-based detection
    if (regionHint && REGIONS[regionHint]) {
      const regionResult = this._tryRegionCountries(cleanNumber, REGIONS[regionHint]);
      if (regionResult.success) {
        return regionResult;
      }
    }

    // Fallback: try common patterns
    return this._tryCommonPatterns(cleanNumber, defaultCountry);
  }

  /**
   * Parse a phone number with explicit country code prefix
   * @private
   */
  _parseWithCountryCode(phoneNumber) {
    try {
      const parsed = parsePhoneNumberFromString(phoneNumber);

      if (parsed && parsed.isValid()) {
        return {
          success: true,
          country: parsed.country,
          countryCallingCode: parsed.countryCallingCode,
          nationalNumber: parsed.nationalNumber,
          e164: parsed.format('E.164'),
          international: parsed.format('INTERNATIONAL'),
          national: parsed.format('NATIONAL'),
          type: parsed.getType(),
          isValid: true,
          isPossible: parsed.isPossible(),
          confidence: 0.95,
          method: 'explicit_country_code'
        };
      }

      // Number has + but couldn't be validated
      return {
        success: false,
        error: 'Invalid phone number format',
        rawInput: phoneNumber,
        confidence: 0.1,
        method: 'explicit_country_code'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        rawInput: phoneNumber,
        confidence: 0,
        method: 'explicit_country_code'
      };
    }
  }

  /**
   * Parse a phone number with a country hint
   * @private
   */
  _parseWithHint(phoneNumber, countryHint) {
    try {
      if (!isSupportedCountry(countryHint)) {
        return { success: false, error: `Unsupported country: ${countryHint}`, confidence: 0 };
      }

      const parsed = parsePhoneNumberFromString(phoneNumber, countryHint);

      if (parsed && parsed.isValid()) {
        return {
          success: true,
          country: parsed.country,
          countryCallingCode: parsed.countryCallingCode,
          nationalNumber: parsed.nationalNumber,
          e164: parsed.format('E.164'),
          international: parsed.format('INTERNATIONAL'),
          national: parsed.format('NATIONAL'),
          type: parsed.getType(),
          isValid: true,
          isPossible: parsed.isPossible(),
          confidence: 0.85,
          method: 'country_hint',
          hintUsed: countryHint
        };
      }

      return {
        success: false,
        error: 'Could not parse with country hint',
        hintUsed: countryHint,
        confidence: 0.2,
        method: 'country_hint'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        hintUsed: countryHint,
        confidence: 0,
        method: 'country_hint'
      };
    }
  }

  /**
   * Try parsing against all countries in a region
   * @private
   */
  _tryRegionCountries(phoneNumber, countries) {
    const candidates = [];

    for (const country of countries) {
      try {
        if (!isSupportedCountry(country)) continue;

        const parsed = parsePhoneNumberFromString(phoneNumber, country);
        if (parsed && parsed.isPossible()) {
          candidates.push({
            country,
            parsed,
            isValid: parsed.isValid(),
            score: parsed.isValid() ? 0.7 : 0.4
          });
        }
      } catch (error) {
        // Skip this country
      }
    }

    if (candidates.length === 0) {
      return { success: false, error: 'No matches in region', confidence: 0, method: 'region_scan' };
    }

    // Sort by validity and score
    candidates.sort((a, b) => {
      if (a.isValid !== b.isValid) return b.isValid ? 1 : -1;
      return b.score - a.score;
    });

    const best = candidates[0];
    const confidence = candidates.length === 1 ? best.score : best.score * 0.9; // Reduce confidence if multiple matches

    return {
      success: true,
      country: best.country,
      countryCallingCode: best.parsed.countryCallingCode,
      nationalNumber: best.parsed.nationalNumber,
      e164: best.parsed.format('E.164'),
      international: best.parsed.format('INTERNATIONAL'),
      national: best.parsed.format('NATIONAL'),
      type: best.parsed.getType(),
      isValid: best.isValid,
      isPossible: best.parsed.isPossible(),
      confidence,
      method: 'region_scan',
      alternativeCandidates: candidates.slice(1, 4).map(c => c.country)
    };
  }

  /**
   * Try common phone number patterns
   * @private
   */
  _tryCommonPatterns(phoneNumber, defaultCountry) {
    const digits = phoneNumber.replace(/\D/g, '');

    // Pattern: 10 digits (US/CA format)
    if (digits.length === 10) {
      const result = this._parseWithHint(phoneNumber, defaultCountry || 'US');
      if (result.success) {
        result.confidence = Math.min(result.confidence, 0.75);
        result.method = 'pattern_match_10_digit';
        return result;
      }
    }

    // Pattern: 11 digits starting with 1 (NANP)
    if (digits.length === 11 && digits.startsWith('1')) {
      const result = this._parseWithHint('+' + digits, 'US');
      if (result.success) {
        result.confidence = Math.min(result.confidence, 0.8);
        result.method = 'pattern_match_nanp';
        return result;
      }
    }

    // Pattern: Try all regions
    for (const [regionName, countries] of Object.entries(REGIONS)) {
      const regionResult = this._tryRegionCountries(phoneNumber, countries);
      if (regionResult.success && regionResult.isValid) {
        regionResult.confidence = Math.min(regionResult.confidence, 0.6);
        regionResult.method = 'global_scan';
        return regionResult;
      }
    }

    // Last resort: return parsed but unvalidated
    return {
      success: false,
      error: 'Could not determine country',
      rawInput: phoneNumber,
      digitsOnly: digits,
      digitCount: digits.length,
      confidence: 0.1,
      method: 'exhausted',
      suggestion: `Try providing a country hint (e.g., detect('${phoneNumber}', { defaultCountry: 'US' }))`
    };
  }

  /**
   * Normalize a phone number to E.164 format
   * @param {string} phoneNumber - The phone number to normalize
   * @param {Object} [options] - Options
   * @param {string} [options.defaultCountry] - Default country for parsing
   * @param {string} [options.format='E164'] - Output format: E164, INTERNATIONAL, NATIONAL
   * @returns {Object} Normalization result
   */
  normalize(phoneNumber, options = {}) {
    const detection = this.detect(phoneNumber, options);

    if (!detection.success) {
      return {
        original: phoneNumber,
        normalized: null,
        valid: false,
        error: detection.error,
        confidence: detection.confidence
      };
    }

    const format = (options.format || 'E164').toUpperCase();
    let normalized;

    switch (format) {
      case 'E164':
        normalized = detection.e164;
        break;
      case 'INTERNATIONAL':
        normalized = detection.international;
        break;
      case 'NATIONAL':
        normalized = detection.national;
        break;
      default:
        normalized = detection.e164;
    }

    return {
      original: phoneNumber,
      normalized,
      valid: detection.isValid,
      country: detection.country,
      countryCallingCode: detection.countryCallingCode,
      nationalNumber: detection.nationalNumber,
      type: detection.type,
      confidence: detection.confidence,
      formats: {
        e164: detection.e164,
        international: detection.international,
        national: detection.national
      }
    };
  }

  /**
   * Validate a phone number
   * @param {string} phoneNumber - The phone number to validate
   * @param {string} [country] - Expected country
   * @returns {Object} Validation result
   */
  validate(phoneNumber, country = null) {
    const detection = this.detect(phoneNumber, { defaultCountry: country });

    return {
      valid: detection.success && detection.isValid,
      possible: detection.success && detection.isPossible,
      country: detection.country || null,
      type: detection.type || null,
      confidence: detection.confidence,
      error: detection.error || null
    };
  }

  /**
   * Format a phone number as the user types (for input fields)
   * @param {string} phoneNumber - The partial phone number
   * @param {string} [country] - Country for formatting
   * @returns {string} Formatted number
   */
  formatAsYouType(phoneNumber, country = null) {
    const asYouType = new AsYouType(country || this.defaultCountry);
    return asYouType.input(phoneNumber);
  }

  /**
   * Get example phone number for a country
   * @param {string} country - ISO 3166-1 alpha-2 country code
   * @param {string} [type='MOBILE'] - Number type (MOBILE, FIXED_LINE, etc.)
   * @returns {Object|null} Example number info
   */
  getExample(country, type = 'MOBILE') {
    const normalizedCountry = this._normalizeCountryCode(country);

    try {
      if (!isSupportedCountry(normalizedCountry)) {
        return null;
      }

      const example = getExampleNumber(normalizedCountry, type);
      if (!example) return null;

      return {
        country: normalizedCountry,
        type,
        e164: example.format('E.164'),
        international: example.format('INTERNATIONAL'),
        national: example.format('NATIONAL')
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get the calling code for a country
   * @param {string} country - ISO 3166-1 alpha-2 country code
   * @returns {string|null} Country calling code
   */
  getCallingCode(country) {
    const normalizedCountry = this._normalizeCountryCode(country);

    try {
      return getCountryCallingCode(normalizedCountry);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get region for a country
   * @param {string} country - ISO 3166-1 alpha-2 country code
   * @returns {string|null} Region code (NA, LATAM, EU, UK, APAC) or null
   */
  getRegion(country) {
    const normalizedCountry = this._normalizeCountryCode(country);

    for (const [region, countries] of Object.entries(REGIONS)) {
      if (countries.includes(normalizedCountry)) {
        return region;
      }
    }

    return null;
  }

  /**
   * Check if a country is supported
   * @param {string} country - ISO 3166-1 alpha-2 country code
   * @returns {boolean} Whether the country is supported
   */
  isSupported(country) {
    const normalizedCountry = this._normalizeCountryCode(country);
    return isSupportedCountry(normalizedCountry);
  }

  /**
   * Get all supported countries
   * @returns {string[]} Array of country codes
   */
  getSupportedCountries() {
    return getCountries();
  }

  /**
   * Get countries in a region
   * @param {string} region - Region code (NA, LATAM, EU, UK, APAC)
   * @returns {string[]} Array of country codes
   */
  getCountriesInRegion(region) {
    return REGIONS[region] || [];
  }
}

// Export singleton factory
let instance = null;

function getInstance(options = {}) {
  if (!instance) {
    instance = new PhoneCountryDetector(options);
  }
  return instance;
}

module.exports = {
  PhoneCountryDetector,
  getInstance,
  REGIONS,
  COUNTRY_ALIASES
};
