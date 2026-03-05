/**
 * Region Detector
 *
 * Intelligent detection of country/region from multiple data signals.
 * Uses weighted confidence scoring to determine the most likely country.
 *
 * @module region-detector
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Lazy load phone detector to avoid circular dependency
let phoneDetector = null;
function getPhoneDetector() {
  if (!phoneDetector) {
    const { PhoneCountryDetector } = require('./phone-country-detector');
    phoneDetector = new PhoneCountryDetector();
  }
  return phoneDetector;
}

/**
 * Signal weights for country detection
 */
const SIGNAL_WEIGHTS = {
  explicit_country: 1.0,      // User-provided country field
  phone_country_code: 0.90,   // Phone with +XX prefix
  postal_code_format: 0.85,   // Unique postal code format
  state_province: 0.80,       // Recognized state/province name
  phone_detection: 0.75,      // Detected via libphonenumber
  street_keywords: 0.60,      // Language-specific street types
  city_name: 0.50,            // Known city name
  language_detection: 0.40,   // Character set / diacritics
  region_hint: 0.30           // User-provided region hint
};

/**
 * Postal code patterns by country
 */
const POSTAL_CODE_PATTERNS = {
  // North America
  US: /^\d{5}(-\d{4})?$/,
  CA: /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i,
  MX: /^\d{5}$/,

  // Latin America
  BR: /^\d{5}-?\d{3}$/,
  AR: /^[A-Z]\d{4}[A-Z]{3}$|^\d{4}$/i,
  CL: /^\d{7}$/,
  CO: /^\d{6}$/,
  PE: /^\d{5}$/,

  // Europe
  DE: /^\d{5}$/,
  FR: /^\d{5}$/,
  ES: /^\d{5}$/,
  IT: /^\d{5}$/,
  NL: /^\d{4}\s?[A-Z]{2}$/i,
  BE: /^\d{4}$/,
  CH: /^\d{4}$/,
  AT: /^\d{4}$/,
  PL: /^\d{2}-\d{3}$/,

  // UK / Ireland
  GB: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i,
  IE: /^[A-Z]\d{2}\s?[A-Z\d]{4}$/i,

  // APAC
  AU: /^\d{4}$/,
  NZ: /^\d{4}$/,
  JP: /^\d{3}-?\d{4}$/,
  KR: /^\d{5}$/,
  SG: /^\d{6}$/,
  IN: /^\d{6}$/,
  CN: /^\d{6}$/,
  TW: /^\d{3}$/,
  MY: /^\d{5}$/,
  TH: /^\d{5}$/,
  PH: /^\d{4}$/,
  ID: /^\d{5}$/,
  VN: /^\d{6}$/
};

/**
 * Street type keywords by language/country
 */
const STREET_KEYWORDS = {
  DE: ['straße', 'strasse', 'str.', 'platz', 'allee', 'weg', 'gasse'],
  FR: ['rue', 'avenue', 'av.', 'boulevard', 'bd.', 'place', 'allée', 'impasse'],
  ES: ['calle', 'c/', 'avenida', 'avda.', 'plaza', 'pza.', 'paseo', 'carretera'],
  IT: ['via', 'v.', 'viale', 'piazza', 'p.za', 'corso', 'largo'],
  PT: ['rua', 'avenida', 'av.', 'praça', 'travessa', 'alameda'],
  BR: ['rua', 'r.', 'avenida', 'av.', 'alameda', 'al.', 'praça', 'pça.', 'travessa'],
  NL: ['straat', 'str.', 'laan', 'weg', 'plein', 'gracht'],
  PL: ['ulica', 'ul.', 'aleja', 'al.', 'plac'],
  JP: ['丁目', '番地', '号', '通り'],
  KR: ['로', '길', '대로'],
  CN: ['路', '街', '巷', '大道'],
  TW: ['路', '街', '巷', '號'],
  MY: ['jalan', 'jln', 'lorong', 'lrg'],
  TH: ['ถนน', 'soi', 'thanon'],
  ID: ['jalan', 'jl.', 'gang', 'gg.']
};

/**
 * Character patterns that suggest specific regions
 */
const CHARACTER_PATTERNS = {
  CJK: /[\u4E00-\u9FFF\u3400-\u4DBF]/,        // Chinese/Japanese/Korean
  HIRAGANA: /[\u3040-\u309F]/,                // Japanese Hiragana
  KATAKANA: /[\u30A0-\u30FF]/,                // Japanese Katakana
  HANGUL: /[\uAC00-\uD7AF\u1100-\u11FF]/,     // Korean
  CYRILLIC: /[\u0400-\u04FF]/,                // Russian/Eastern European
  ARABIC: /[\u0600-\u06FF]/,                  // Arabic
  THAI: /[\u0E00-\u0E7F]/,                    // Thai
  DEVANAGARI: /[\u0900-\u097F]/,              // Hindi
  LATIN_EXTENDED: /[àáâãäåæçèéêëìíîïñòóôõöùúûüýÿ]/i,
  GERMAN_SPECIFIC: /[äöüß]/i,
  PORTUGUESE_SPECIFIC: /[ãõç]/i,
  FRENCH_ACCENTS: /[àâäéèêëïîôùûüÿœæç]/i,
  SPANISH_SPECIFIC: /[ñ¡¿]/,
  POLISH_SPECIFIC: /[ąćęłńóśźż]/i,
  NORDIC: /[æøåäöéðþ]/i
};

/**
 * Load all state/province mappings from config files
 */
function loadStateProvinceMappings() {
  const configDir = path.join(__dirname, '../..', 'config', 'international', 'state-provinces');
  const mappings = {};

  try {
    const files = fs.readdirSync(configDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(configDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        for (const [countryCode, countryData] of Object.entries(data)) {
          if (countryCode === 'description' || countryCode === 'version') continue;
          if (countryData.states) {
            mappings[countryCode] = {
              ...countryData.states,
              ...(countryData.aliases || {})
            };
          }
        }
      }
    }
  } catch (error) {
    console.warn(`Failed to load state/province mappings: ${error.message}`);
  }

  return mappings;
}

class RegionDetector {
  /**
   * Create a new RegionDetector instance
   * @param {Object} [options] - Configuration options
   * @param {string} [options.defaultCountry='US'] - Default country when uncertain
   * @param {number} [options.minConfidence=0.5] - Minimum confidence to report result
   */
  constructor(options = {}) {
    this.defaultCountry = options.defaultCountry || 'US';
    this.minConfidence = options.minConfidence || 0.5;
    this.stateProvinceMappings = loadStateProvinceMappings();
    this.countryCodesCache = null;
  }

  /**
   * Load country codes configuration
   * @private
   */
  _getCountryCodes() {
    if (this.countryCodesCache) return this.countryCodesCache;

    const configPath = path.join(__dirname, '../..', 'config', 'international', 'country-codes.json');
    try {
      this.countryCodesCache = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (error) {
      this.countryCodesCache = { countries: {}, aliases: {} };
    }
    return this.countryCodesCache;
  }

  /**
   * Detect country from multiple data signals
   * @param {Object} data - Input data with various fields
   * @param {string} [data.country] - Explicit country field
   * @param {string} [data.phone] - Phone number
   * @param {string} [data.postalCode] - Postal/ZIP code
   * @param {string} [data.state] - State/province
   * @param {string} [data.city] - City name
   * @param {string} [data.street] - Street address
   * @param {Object} [options] - Detection options
   * @param {string} [options.region] - Region hint (NA, LATAM, EU, UK, APAC)
   * @returns {Object} Detection result with confidence score
   */
  detect(data, options = {}) {
    const signals = [];

    // Check explicit country
    if (data.country) {
      const resolved = this._resolveCountry(data.country);
      if (resolved) {
        signals.push({
          source: 'explicit_country',
          country: resolved,
          weight: SIGNAL_WEIGHTS.explicit_country,
          confidence: 1.0
        });
      }
    }

    // Check phone number
    if (data.phone) {
      const phoneSignal = this._detectFromPhone(data.phone);
      if (phoneSignal) {
        signals.push(phoneSignal);
      }
    }

    // Check postal code
    if (data.postalCode) {
      const postalSignals = this._detectFromPostalCode(data.postalCode);
      signals.push(...postalSignals);
    }

    // Check state/province
    if (data.state) {
      const stateSignal = this._detectFromState(data.state);
      if (stateSignal) {
        signals.push(stateSignal);
      }
    }

    // Check street for language keywords
    if (data.street) {
      const streetSignals = this._detectFromStreet(data.street);
      signals.push(...streetSignals);
    }

    // Check for character patterns
    const text = [data.street, data.city, data.state].filter(Boolean).join(' ');
    if (text) {
      const langSignals = this._detectFromCharacters(text);
      signals.push(...langSignals);
    }

    // Apply region hint
    if (options.region) {
      signals.push({
        source: 'region_hint',
        region: options.region,
        weight: SIGNAL_WEIGHTS.region_hint,
        confidence: 0.3
      });
    }

    // Compute weighted result
    return this._computeResult(signals, options);
  }

  /**
   * Resolve country name/code to ISO code
   * @private
   */
  _resolveCountry(countryInput) {
    if (!countryInput) return null;

    const upper = countryInput.toUpperCase().trim();
    const config = this._getCountryCodes();

    // Direct country code
    if (config.countries[upper]) return upper;

    // Check aliases
    if (config.aliases[upper]) return config.aliases[upper];

    // Check country names
    for (const [code, data] of Object.entries(config.countries)) {
      if (data.name && data.name.toUpperCase() === upper) {
        return code;
      }
    }

    return null;
  }

  /**
   * Detect country from phone number
   * @private
   */
  _detectFromPhone(phone) {
    try {
      const detector = getPhoneDetector();
      const result = detector.detect(phone);

      if (result.success && result.country) {
        const isFromPrefix = phone.trim().startsWith('+');
        return {
          source: isFromPrefix ? 'phone_country_code' : 'phone_detection',
          country: result.country,
          weight: isFromPrefix ? SIGNAL_WEIGHTS.phone_country_code : SIGNAL_WEIGHTS.phone_detection,
          confidence: result.confidence,
          details: {
            e164: result.e164,
            type: result.type
          }
        };
      }
    } catch (error) {
      // Phone detection failed, ignore
    }

    return null;
  }

  /**
   * Detect country from postal code format
   * @private
   */
  _detectFromPostalCode(postalCode) {
    const signals = [];
    const normalized = postalCode.trim().toUpperCase();

    for (const [country, pattern] of Object.entries(POSTAL_CODE_PATTERNS)) {
      if (pattern.test(normalized)) {
        signals.push({
          source: 'postal_code_format',
          country,
          weight: SIGNAL_WEIGHTS.postal_code_format,
          confidence: 0.85,
          details: { format: pattern.toString(), matched: normalized }
        });
      }
    }

    // Reduce confidence if multiple matches
    if (signals.length > 1) {
      signals.forEach(s => {
        s.confidence *= 0.7;
      });
    }

    return signals;
  }

  /**
   * Detect country from state/province name
   * @private
   */
  _detectFromState(state) {
    const normalized = state.trim();

    for (const [country, states] of Object.entries(this.stateProvinceMappings)) {
      // Check exact match (name or code)
      for (const [name, code] of Object.entries(states)) {
        if (
          name.toLowerCase() === normalized.toLowerCase() ||
          code.toLowerCase() === normalized.toLowerCase()
        ) {
          return {
            source: 'state_province',
            country,
            weight: SIGNAL_WEIGHTS.state_province,
            confidence: 0.85,
            details: { stateName: name, stateCode: code }
          };
        }
      }
    }

    return null;
  }

  /**
   * Detect country from street address keywords
   * @private
   */
  _detectFromStreet(street) {
    const signals = [];
    const lower = street.toLowerCase();

    for (const [country, keywords] of Object.entries(STREET_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lower.includes(keyword.toLowerCase())) {
          signals.push({
            source: 'street_keywords',
            country,
            weight: SIGNAL_WEIGHTS.street_keywords,
            confidence: 0.6,
            details: { keyword }
          });
          break; // One match per country is enough
        }
      }
    }

    return signals;
  }

  /**
   * Detect region from character patterns
   * @private
   */
  _detectFromCharacters(text) {
    const signals = [];

    // Japanese (Hiragana/Katakana)
    if (CHARACTER_PATTERNS.HIRAGANA.test(text) || CHARACTER_PATTERNS.KATAKANA.test(text)) {
      signals.push({
        source: 'language_detection',
        country: 'JP',
        weight: SIGNAL_WEIGHTS.language_detection,
        confidence: 0.8,
        details: { detected: 'Japanese script' }
      });
    }
    // Korean
    else if (CHARACTER_PATTERNS.HANGUL.test(text)) {
      signals.push({
        source: 'language_detection',
        country: 'KR',
        weight: SIGNAL_WEIGHTS.language_detection,
        confidence: 0.8,
        details: { detected: 'Korean script' }
      });
    }
    // Thai
    else if (CHARACTER_PATTERNS.THAI.test(text)) {
      signals.push({
        source: 'language_detection',
        country: 'TH',
        weight: SIGNAL_WEIGHTS.language_detection,
        confidence: 0.8,
        details: { detected: 'Thai script' }
      });
    }
    // CJK (Chinese - could be CN, TW, HK, SG)
    else if (CHARACTER_PATTERNS.CJK.test(text) && !CHARACTER_PATTERNS.HIRAGANA.test(text)) {
      signals.push({
        source: 'language_detection',
        region: 'APAC',
        weight: SIGNAL_WEIGHTS.language_detection * 0.5,
        confidence: 0.4,
        details: { detected: 'Chinese characters' }
      });
    }
    // German specific
    else if (CHARACTER_PATTERNS.GERMAN_SPECIFIC.test(text)) {
      signals.push({
        source: 'language_detection',
        region: 'EU',
        weight: SIGNAL_WEIGHTS.language_detection,
        confidence: 0.5,
        details: { detected: 'German characters' }
      });
    }
    // Polish specific
    else if (CHARACTER_PATTERNS.POLISH_SPECIFIC.test(text)) {
      signals.push({
        source: 'language_detection',
        country: 'PL',
        weight: SIGNAL_WEIGHTS.language_detection,
        confidence: 0.6,
        details: { detected: 'Polish characters' }
      });
    }
    // Spanish specific
    else if (CHARACTER_PATTERNS.SPANISH_SPECIFIC.test(text)) {
      signals.push({
        source: 'language_detection',
        region: 'ES_LATAM',
        weight: SIGNAL_WEIGHTS.language_detection,
        confidence: 0.4,
        details: { detected: 'Spanish characters' }
      });
    }

    return signals;
  }

  /**
   * Compute weighted result from all signals
   * @private
   */
  _computeResult(signals, options = {}) {
    if (signals.length === 0) {
      return {
        success: false,
        country: options.defaultCountry || this.defaultCountry,
        confidence: 0.1,
        method: 'default_fallback',
        signals: []
      };
    }

    // Group signals by country
    const countryScores = {};
    const regionScores = {};

    for (const signal of signals) {
      if (signal.country) {
        const score = signal.weight * signal.confidence;
        countryScores[signal.country] = (countryScores[signal.country] || 0) + score;
      }
      if (signal.region) {
        const score = signal.weight * signal.confidence;
        regionScores[signal.region] = (regionScores[signal.region] || 0) + score;
      }
    }

    // Find best country
    let bestCountry = null;
    let bestScore = 0;

    for (const [country, score] of Object.entries(countryScores)) {
      if (score > bestScore) {
        bestScore = score;
        bestCountry = country;
      }
    }

    // Find best region
    let bestRegion = null;
    let bestRegionScore = 0;

    for (const [region, score] of Object.entries(regionScores)) {
      if (score > bestRegionScore) {
        bestRegionScore = score;
        bestRegion = region;
      }
    }

    // Normalize confidence to 0-1 range
    const maxPossibleScore = Math.max(...Object.values(SIGNAL_WEIGHTS)) * signals.length;
    const confidence = Math.min(bestScore / Math.max(maxPossibleScore * 0.5, 1), 1);

    if (confidence < this.minConfidence && !bestCountry) {
      return {
        success: false,
        country: options.defaultCountry || this.defaultCountry,
        confidence,
        region: bestRegion,
        method: 'below_threshold',
        signals: signals.map(s => ({ source: s.source, country: s.country, confidence: s.confidence }))
      };
    }

    // Find alternative candidates
    const sortedCountries = Object.entries(countryScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    return {
      success: true,
      country: bestCountry || options.defaultCountry || this.defaultCountry,
      confidence: Math.round(confidence * 100) / 100,
      region: this._getRegionForCountry(bestCountry) || bestRegion,
      method: signals.length === 1 ? signals[0].source : 'weighted_aggregate',
      signals: signals.map(s => ({
        source: s.source,
        country: s.country,
        region: s.region,
        confidence: Math.round(s.confidence * 100) / 100,
        weight: s.weight
      })),
      alternatives: sortedCountries.slice(1).map(([country, score]) => ({
        country,
        confidence: Math.round((score / Math.max(maxPossibleScore * 0.5, 1)) * 100) / 100
      }))
    };
  }

  /**
   * Get region for a country code
   * @private
   */
  _getRegionForCountry(country) {
    if (!country) return null;

    const config = this._getCountryCodes();
    const countryData = config.countries[country];

    if (countryData && countryData.region) {
      return countryData.region;
    }

    // Fallback to hardcoded regions
    const regionMap = {
      US: 'NA', CA: 'NA',
      MX: 'LATAM', BR: 'LATAM', AR: 'LATAM', CL: 'LATAM', CO: 'LATAM', PE: 'LATAM',
      GB: 'UK', IE: 'UK',
      DE: 'EU', FR: 'EU', ES: 'EU', IT: 'EU', NL: 'EU', BE: 'EU', CH: 'EU', AT: 'EU', PL: 'EU',
      AU: 'APAC', NZ: 'APAC', JP: 'APAC', KR: 'APAC', SG: 'APAC', HK: 'APAC', IN: 'APAC', CN: 'APAC'
    };

    return regionMap[country] || null;
  }

  /**
   * Detect from a complete address object
   * @param {Object} address - Address object with standard fields
   * @returns {Object} Detection result
   */
  detectFromAddress(address) {
    return this.detect({
      country: address.country,
      postalCode: address.postalCode || address.postal_code || address.zip || address.zipCode,
      state: address.state || address.province || address.region,
      city: address.city || address.locality,
      street: address.street || address.street1 || address.address1 || address.addressLine1
    });
  }
}

module.exports = {
  RegionDetector,
  SIGNAL_WEIGHTS,
  POSTAL_CODE_PATTERNS,
  STREET_KEYWORDS,
  CHARACTER_PATTERNS
};
