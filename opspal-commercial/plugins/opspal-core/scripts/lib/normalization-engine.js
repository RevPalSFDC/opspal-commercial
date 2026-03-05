/**
 * Normalization Engine
 *
 * Applies canonicalization rules to normalize data fields for the RevOps Data Quality System.
 * Handles company names, domains, emails, phones, addresses, and job titles.
 *
 * NOW WITH INTERNATIONAL SUPPORT:
 * - Phone numbers: All countries via libphonenumber-js
 * - Addresses: Region-specific formatting (NA, LATAM, EU, UK, APAC)
 * - State/Province: 40+ countries supported
 * - Postal codes: Format detection and validation
 *
 * @module normalization-engine
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { SemanticDisambiguator } = require('./semantic-disambiguator');

// Lazy load international modules to avoid circular dependencies
let PhoneCountryDetector = null;
let RegionDetector = null;

// Lazy load domain-aware matching modules
let DomainDictionaryLoader = null;
let DomainDetector = null;

function getDomainLoader() {
  if (!DomainDictionaryLoader) {
    try {
      DomainDictionaryLoader = require('./domain-dictionary-loader').DomainDictionaryLoader;
    } catch (error) {
      // Domain dictionary loader not available
      return null;
    }
  }
  return new DomainDictionaryLoader();
}

function getDomainDetector() {
  if (!DomainDetector) {
    try {
      DomainDetector = require('./domain-detector').DomainDetector;
    } catch (error) {
      // Domain detector not available
      return null;
    }
  }
  return new DomainDetector();
}

function getPhoneDetector(defaultCountry = 'US') {
  if (!PhoneCountryDetector) {
    try {
      PhoneCountryDetector = require('./phone-country-detector').PhoneCountryDetector;
    } catch (error) {
      console.warn('Phone country detector not available, using basic normalization');
      return null;
    }
  }
  return new PhoneCountryDetector({ defaultCountry });
}

function getRegionDetector() {
  if (!RegionDetector) {
    try {
      RegionDetector = require('./region-detector').RegionDetector;
    } catch (error) {
      console.warn('Region detector not available, using basic detection');
      return null;
    }
  }
  return new RegionDetector();
}

/**
 * Default normalization rules (can be overridden via config)
 */
const DEFAULT_RULES = {
  company_name: {
    strip_suffixes: [
      'Inc', 'Inc.', 'Incorporated',
      'LLC', 'L.L.C.', 'Limited Liability Company',
      'Corp', 'Corp.', 'Corporation',
      'Ltd', 'Ltd.', 'Limited',
      'Co', 'Co.', 'Company',
      'LLP', 'L.L.P.', 'LP', 'L.P.',
      'PC', 'P.C.', 'PLC', 'P.L.C.',
      'GmbH', 'AG', 'SA', 'NV', 'BV',
      'Pty Ltd', 'Pty. Ltd.'
    ],
    expand_abbreviations: {
      'Intl': 'International',
      "Int'l": 'International',
      'Natl': 'National',
      "Nat'l": 'National',
      'Univ': 'University',
      'Assoc': 'Associates',
      'Assn': 'Association',
      'Mfg': 'Manufacturing',
      'Svcs': 'Services',
      'Svc': 'Service',
      'Tech': 'Technology',
      'Techs': 'Technologies',
      'Sys': 'Systems',
      'Mgmt': 'Management',
      'Grp': 'Group',
      'Dept': 'Department',
      'Dist': 'District',
      'Govt': 'Government'
    },
    known_acronyms: ['IBM', 'HP', 'AT&T', 'UPS', 'FedEx', 'CVS', 'GE', '3M', 'SAP', 'AMD', 'USA', 'UK', 'BMW', 'NYSE', 'NASDAQ']
  },
  us_states: {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
    'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
    'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
    'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
    'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
    'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
    'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
    'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
    'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
    'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
    'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC'
  },
  street_abbreviations: {
    'Street': 'ST', 'Avenue': 'AVE', 'Boulevard': 'BLVD', 'Drive': 'DR',
    'Road': 'RD', 'Lane': 'LN', 'Court': 'CT', 'Circle': 'CIR',
    'Place': 'PL', 'Parkway': 'PKWY', 'Highway': 'HWY', 'Way': 'WAY',
    'Terrace': 'TER', 'Trail': 'TRL', 'Square': 'SQ', 'Expressway': 'EXPY'
  },
  direction_abbreviations: {
    'North': 'N', 'South': 'S', 'East': 'E', 'West': 'W',
    'Northeast': 'NE', 'Northwest': 'NW', 'Southeast': 'SE', 'Southwest': 'SW'
  },
  unit_abbreviations: {
    'Suite': 'STE', 'Apartment': 'APT', 'Unit': 'UNIT',
    'Floor': 'FL', 'Building': 'BLDG', 'Room': 'RM'
  }
};

class NormalizationEngine {
  /**
   * Create a new NormalizationEngine instance
   * @param {Object} [options] - Configuration options
   * @param {string} [options.rulesPath] - Path to custom rules JSON file
   * @param {Object} [options.rules] - Custom rules object
   * @param {SemanticDisambiguator} [options.disambiguator] - Custom disambiguator instance
   * @param {string} [options.defaultCountry='US'] - Default country for phone/address normalization
   * @param {string} [options.defaultRegion=null] - Default region hint (NA, LATAM, EU, UK, APAC)
   * @param {string} [options.domain=null] - Industry domain for abbreviation expansion (property-management, government, technology, financial)
   * @param {boolean} [options.autoDetectDomain=false] - Auto-detect domain from data
   * @param {string} [options.orgOverride=null] - Org-specific override for domain abbreviations
   */
  constructor(options = {}) {
    this.rules = this._loadRules(options);
    this.disambiguator = options.disambiguator || new SemanticDisambiguator();
    this.cache = new Map();
    this.defaultCountry = options.defaultCountry || 'US';
    this.defaultRegion = options.defaultRegion || null;
    this.internationalConfig = this._loadInternationalConfig();

    // Domain-aware matching configuration
    this.domain = options.domain || null;
    this.autoDetectDomain = options.autoDetectDomain || false;
    this.orgOverride = options.orgOverride || null;
    this._domainLoader = null;
    this._domainDetector = null;
    this._domainAbbreviations = {};

    // Initialize domain support if configured
    if (this.domain || this.autoDetectDomain) {
      this._initializeDomainSupport();
    }
  }

  /**
   * Initialize domain-aware matching support
   * @private
   */
  _initializeDomainSupport() {
    this._domainLoader = getDomainLoader();
    if (this.autoDetectDomain) {
      this._domainDetector = getDomainDetector();
    }
    if (this.domain && this._domainLoader) {
      this._domainAbbreviations = this._domainLoader.getAbbreviations(this.domain, {
        orgOverride: this.orgOverride
      });
    }
  }

  /**
   * Set or change the active domain
   * @param {string} domain - Domain name (property-management, government, technology, financial)
   * @param {string} [orgOverride] - Optional org-specific override
   */
  setDomain(domain, orgOverride = null) {
    this.domain = domain;
    this.orgOverride = orgOverride;
    if (!this._domainLoader) {
      this._domainLoader = getDomainLoader();
    }
    if (this._domainLoader) {
      this._domainAbbreviations = this._domainLoader.getAbbreviations(domain, { orgOverride });
    }
  }

  /**
   * Detect domain from text content
   * @param {string} text - Text to analyze
   * @returns {Object|null} Detection result with domain and confidence, or null if not detected
   */
  detectDomain(text) {
    if (!this._domainDetector) {
      this._domainDetector = getDomainDetector();
    }
    if (this._domainDetector) {
      return this._domainDetector.detect(text);
    }
    return null;
  }

  /**
   * List available domains
   * @returns {string[]} Array of domain names
   */
  listDomains() {
    if (!this._domainLoader) {
      this._domainLoader = getDomainLoader();
    }
    if (this._domainLoader) {
      return this._domainLoader.listDomains();
    }
    return [];
  }

  /**
   * Load international configuration files
   * @private
   */
  _loadInternationalConfig() {
    const configDir = path.join(__dirname, '../..', 'config', 'international');
    const config = {
      countryCodes: {},
      stateProvinces: {},
      addressFormats: {},
      loaded: false
    };

    try {
      // Load country codes
      const countryCodesPath = path.join(configDir, 'country-codes.json');
      if (fs.existsSync(countryCodesPath)) {
        config.countryCodes = JSON.parse(fs.readFileSync(countryCodesPath, 'utf-8'));
      }

      // Load state/province mappings
      const stateDir = path.join(configDir, 'state-provinces');
      if (fs.existsSync(stateDir)) {
        const files = fs.readdirSync(stateDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
          const data = JSON.parse(fs.readFileSync(path.join(stateDir, file), 'utf-8'));
          for (const [code, countryData] of Object.entries(data)) {
            if (code !== 'description' && code !== 'version' && countryData.states) {
              config.stateProvinces[code] = countryData.states;
            }
          }
        }
      }

      // Load address formats
      const addressDir = path.join(configDir, 'address-formats');
      if (fs.existsSync(addressDir)) {
        const files = fs.readdirSync(addressDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
          const data = JSON.parse(fs.readFileSync(path.join(addressDir, file), 'utf-8'));
          for (const [code, countryData] of Object.entries(data)) {
            if (code !== 'description' && code !== 'version') {
              config.addressFormats[code] = countryData;
            }
          }
        }
      }

      config.loaded = Object.keys(config.stateProvinces).length > 0;
    } catch (error) {
      console.warn(`Failed to load international config: ${error.message}`);
    }

    return config;
  }

  /**
   * Load rules from file or use provided/default
   * @private
   */
  _loadRules(options) {
    if (options.rules) {
      return this._mergeRules(DEFAULT_RULES, options.rules);
    }

    if (options.rulesPath) {
      try {
        const customRules = JSON.parse(fs.readFileSync(options.rulesPath, 'utf-8'));
        return this._mergeRules(DEFAULT_RULES, customRules);
      } catch (error) {
        console.warn(`Failed to load rules from ${options.rulesPath}, using defaults: ${error.message}`);
      }
    }

    return DEFAULT_RULES;
  }

  /**
   * Deep merge two rule objects
   * @private
   */
  _mergeRules(base, custom) {
    const result = { ...base };
    for (const [key, value] of Object.entries(custom)) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        result[key] = { ...base[key], ...value };
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Normalize a company name
   * @param {string} name - The company name to normalize
   * @param {Object} [options] - Normalization options
   * @param {boolean} [options.preserveSuffix=false] - Keep legal suffixes (Inc, LLC, etc.)
   * @param {boolean} [options.forMatching=false] - Return extra matchingForm for fuzzy matching
   * @param {string} [options.domain] - Industry domain for abbreviation expansion (overrides instance domain)
   * @param {boolean} [options.autoDetectDomain] - Auto-detect domain from name content
   * @returns {Object} Normalized name result with changes array
   */
  normalizeCompanyName(name, options = {}) {
    if (!name) {
      return { original: name, normalized: '', suffix: null, changes: [], domain: null };
    }

    const { preserveSuffix = false, forMatching = false } = options;
    let normalized = name.trim();
    const changes = [];
    let suffix = null;
    let detectedDomain = null;

    // Determine which domain to use
    let activeDomain = options.domain || this.domain;
    let activeAbbreviations = this._domainAbbreviations;

    // Auto-detect domain if requested and no domain specified
    if (!activeDomain && (options.autoDetectDomain || this.autoDetectDomain)) {
      const detection = this.detectDomain(name);
      if (detection && detection.detectedDomain && detection.confidence >= 0.5) {
        activeDomain = detection.detectedDomain;
        detectedDomain = {
          domain: activeDomain,
          confidence: detection.confidence,
          evidence: detection.evidence
        };
        // Load abbreviations for detected domain
        if (this._domainLoader) {
          activeAbbreviations = this._domainLoader.getAbbreviations(activeDomain, {
            orgOverride: this.orgOverride
          });
        }
      }
    } else if (options.domain && options.domain !== this.domain && this._domainLoader) {
      // Load abbreviations for override domain
      activeAbbreviations = this._domainLoader.getAbbreviations(options.domain, {
        orgOverride: this.orgOverride
      });
    }

    // Step 1: Trim whitespace and collapse multiple spaces
    const beforeTrim = normalized;
    normalized = normalized.replace(/\s+/g, ' ').trim();
    if (beforeTrim !== normalized) {
      changes.push({ type: 'whitespace', from: beforeTrim, to: normalized });
    }

    // Step 2: Strip legal suffixes (unless preserving)
    if (!preserveSuffix) {
      for (const sfx of this.rules.company_name.strip_suffixes) {
        const pattern = new RegExp(`[,\\s]*${this._escapeRegex(sfx)}\\s*$`, 'i');
        if (pattern.test(normalized)) {
          suffix = sfx;
          normalized = normalized.replace(pattern, '').trim();
          changes.push({ type: 'strip_suffix', suffix: sfx });
          break;
        }
      }
    }

    // Step 3: Expand standard abbreviations
    for (const [abbrev, expansion] of Object.entries(this.rules.company_name.expand_abbreviations)) {
      const pattern = new RegExp(`\\b${this._escapeRegex(abbrev)}\\b`, 'gi');
      if (pattern.test(normalized)) {
        const before = normalized;
        normalized = normalized.replace(pattern, expansion);
        if (before !== normalized) {
          changes.push({ type: 'expand', from: abbrev, to: expansion });
        }
      }
    }

    // Step 3.5: Expand domain-specific abbreviations (NEW)
    if (Object.keys(activeAbbreviations).length > 0) {
      // Sort by length (longest first) to avoid partial matches
      const sortedAbbrevs = Object.entries(activeAbbreviations)
        .sort(([a], [b]) => b.length - a.length);

      for (const [abbrev, expansion] of sortedAbbrevs) {
        const pattern = new RegExp(`\\b${this._escapeRegex(abbrev)}\\b`, 'gi');
        if (pattern.test(normalized)) {
          const before = normalized;
          normalized = normalized.replace(pattern, expansion);
          if (before !== normalized) {
            changes.push({ type: 'domain_expand', from: abbrev, to: expansion, domain: activeDomain });
          }
        }
      }
    }

    // Step 4: Normalize case to Title Case (preserving known acronyms)
    normalized = this._toTitleCase(normalized, this.rules.company_name.known_acronyms);

    // Step 5: Remove unnecessary punctuation
    const beforePunct = normalized;
    normalized = normalized.replace(/[,.](?!\d)/g, ''); // Remove commas and periods not in numbers
    if (beforePunct !== normalized) {
      changes.push({ type: 'remove_punctuation' });
    }

    // Extra normalization for matching
    let matchingForm = null;
    if (forMatching) {
      matchingForm = normalized
        .replace(/^The\s+/i, '')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .trim();
    }

    return {
      original: name,
      normalized: normalized.trim(),
      suffix,
      matchingForm,
      changes,
      domain: activeDomain || null,
      detectedDomain
    };
  }

  /**
   * Normalize a website domain
   * @param {string} domain - The domain to normalize
   * @returns {Object} Normalized domain result
   */
  normalizeDomain(domain) {
    if (!domain) {
      return { original: domain, normalized: '', valid: false };
    }

    let normalized = domain.trim().toLowerCase();
    const changes = [];

    // Remove protocol
    if (/^https?:\/\//i.test(normalized)) {
      normalized = normalized.replace(/^https?:\/\//i, '');
      changes.push({ type: 'strip_protocol' });
    }

    // Remove www prefix
    if (/^www\./i.test(normalized)) {
      normalized = normalized.replace(/^www\./i, '');
      changes.push({ type: 'strip_www' });
    }

    // Extract domain only (remove path, query params, hash)
    const domainMatch = normalized.match(/^([^/?#]+)/);
    if (domainMatch) {
      if (normalized !== domainMatch[1]) {
        changes.push({ type: 'extract_domain' });
      }
      normalized = domainMatch[1];
    }

    // Remove trailing dots and slashes
    normalized = normalized.replace(/[./]+$/, '');

    // Validate domain format
    const valid = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(normalized);

    return {
      original: domain,
      normalized,
      valid,
      changes
    };
  }

  /**
   * Normalize an email address
   * @param {string} email - The email to normalize
   * @param {Object} [options] - Options
   * @param {boolean} [options.stripPlusAddressing=false] - Remove plus addressing for matching
   * @returns {Object} Normalized email result
   */
  normalizeEmail(email, options = {}) {
    if (!email) {
      return { original: email, normalized: '', valid: false, classification: null };
    }

    const { stripPlusAddressing = false } = options;
    let normalized = email.trim().toLowerCase();
    const changes = [];

    // Strip plus addressing if requested (for matching)
    if (stripPlusAddressing) {
      const beforePlus = normalized;
      normalized = normalized.replace(/\+[^@]*(?=@)/, '');
      if (beforePlus !== normalized) {
        changes.push({ type: 'strip_plus_addressing' });
      }
    }

    // Normalize common domain variations
    normalized = normalized.replace(/@googlemail\.com$/i, '@gmail.com');

    // Validate email format
    const valid = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(normalized);

    // Classify email
    let classification = 'business';
    const domain = normalized.split('@')[1];

    const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'protonmail.com', 'live.com', 'msn.com'];
    const sharedPatterns = [/^info@/, /^admin@/, /^support@/, /^sales@/, /^contact@/, /^hello@/, /^team@/, /^office@/];

    if (personalDomains.includes(domain)) {
      classification = 'personal';
    } else if (sharedPatterns.some(p => p.test(normalized))) {
      classification = 'shared';
    }

    return {
      original: email,
      normalized,
      valid,
      classification,
      domain,
      changes
    };
  }

  /**
   * Normalize a phone number to E.164 format
   * @param {string} phone - The phone number to normalize
   * @param {Object} [options] - Options
   * @param {string} [options.defaultCountry='US'] - Default country for numbers without country code
   * @param {string} [options.region=null] - Region hint (NA, LATAM, EU, UK, APAC)
   * @param {string} [options.format='E164'] - Output format: E164, INTERNATIONAL, NATIONAL
   * @param {boolean} [options.detectCountry=true] - Auto-detect country from number
   * @returns {Object} Normalized phone result
   */
  normalizePhone(phone, options = {}) {
    if (!phone) {
      return { original: phone, normalized: '', valid: false, extension: null, confidence: 0 };
    }

    const defaultCountry = options.defaultCountry || this.defaultCountry || 'US';
    const region = options.region || this.defaultRegion;
    const format = options.format || 'E164';
    const detectCountry = options.detectCountry !== false;

    let normalized = phone.trim();
    const changes = [];
    let extension = null;

    // Extract extension
    const extMatch = normalized.match(/(?:x|ext\.?|extension)\s*(\d+)/i);
    if (extMatch) {
      extension = extMatch[1];
      normalized = normalized.replace(extMatch[0], '').trim();
      changes.push({ type: 'extract_extension', extension });
    }

    // Also check for #123 format
    const hashExtMatch = normalized.match(/#(\d+)$/);
    if (hashExtMatch) {
      extension = hashExtMatch[1];
      normalized = normalized.replace(hashExtMatch[0], '').trim();
      changes.push({ type: 'extract_extension', extension });
    }

    // Try to use the advanced phone detector
    const phoneDetector = getPhoneDetector(defaultCountry);

    if (phoneDetector && detectCountry) {
      const detection = phoneDetector.normalize(normalized, {
        defaultCountry,
        region,
        format
      });

      if (detection.valid) {
        return {
          original: phone,
          normalized: detection.normalized,
          valid: true,
          extension,
          country: detection.country,
          countryCallingCode: detection.countryCallingCode,
          nationalNumber: detection.nationalNumber,
          type: detection.type,
          confidence: detection.confidence,
          formats: detection.formats,
          changes: changes.concat([{
            type: 'international_normalization',
            country: detection.country,
            confidence: detection.confidence
          }])
        };
      }
    }

    // Fallback to basic normalization (backward compatible)
    const hasPlus = normalized.startsWith('+');
    normalized = normalized.replace(/[^0-9]/g, '');

    // Add country code if missing (basic US/CA logic)
    const countryCodes = {
      'US': '1', 'CA': '1',
      'UK': '44', 'GB': '44',
      'AU': '61', 'DE': '49', 'FR': '33',
      'MX': '52', 'BR': '55', 'JP': '81', 'KR': '82',
      'IN': '91', 'SG': '65', 'HK': '852'
    };

    // If 10 digits and US/CA default, add +1
    if (normalized.length === 10 && countryCodes[defaultCountry] === '1') {
      normalized = '1' + normalized;
      changes.push({ type: 'add_country_code', country: defaultCountry });
    }

    // Format as E.164
    normalized = '+' + normalized;

    // Validate E.164 format (8-15 digits after +)
    const valid = /^\+[1-9]\d{7,14}$/.test(normalized);

    return {
      original: phone,
      normalized: valid ? normalized : null,
      valid,
      extension,
      country: valid ? defaultCountry : null,
      confidence: valid ? 0.5 : 0.1,
      changes
    };
  }

  /**
   * Normalize a postal address with international support
   * @param {Object|string} address - Address object or string
   * @param {Object} [options] - Options
   * @param {string} [options.country] - Country code for format selection
   * @param {string} [options.format='local'] - Output format: local, international, postal
   * @param {boolean} [options.abbreviate=true] - Use abbreviations
   * @param {boolean} [options.uppercase=null] - Force uppercase (null = country default)
   * @param {boolean} [options.detectCountry=true] - Auto-detect country from address
   * @returns {Object} Normalized address result
   */
  normalizeAddress(address, options = {}) {
    if (!address) {
      return { original: address, normalized: null, components: null, confidence: 0 };
    }

    // If string, try to parse into components
    let components;
    if (typeof address === 'string') {
      components = this._parseAddressString(address);
    } else {
      components = { ...address };
    }

    const changes = [];
    let detectedCountry = options.country || components.country || null;
    let confidence = 0.5;

    // Try to detect country if not provided
    if (!detectedCountry && options.detectCountry !== false) {
      const regionDetector = getRegionDetector();
      if (regionDetector) {
        const detection = regionDetector.detectFromAddress(components);
        if (detection.success && detection.confidence > 0.5) {
          detectedCountry = detection.country;
          confidence = detection.confidence;
          changes.push({
            type: 'detect_country',
            country: detectedCountry,
            confidence: detection.confidence
          });
        }
      }
    }

    // Get country-specific format config
    const countryConfig = this._getAddressConfig(detectedCountry || this.defaultCountry);
    // Use != null to check both null and undefined
    const useUppercase = options.uppercase != null ? options.uppercase : (countryConfig?.format?.uppercase ?? true);
    const abbreviate = options.abbreviate !== false;

    // Get street type abbreviations for this country
    const streetTypes = countryConfig?.streetTypes || this.rules.street_abbreviations;
    const directions = countryConfig?.directions || this.rules.direction_abbreviations;
    const units = countryConfig?.units || this.rules.unit_abbreviations;

    // Normalize street
    if (components.street) {
      let street = useUppercase ? components.street.toUpperCase() : components.street;

      if (abbreviate) {
        // Abbreviate street types
        for (const [full, abbr] of Object.entries(streetTypes)) {
          const pattern = new RegExp(`\\b${this._escapeRegex(full)}\\b`, 'gi');
          if (pattern.test(street)) {
            const newAbbr = useUppercase ? abbr.toUpperCase() : abbr;
            street = street.replace(pattern, newAbbr);
            changes.push({ type: 'abbreviate_street', from: full, to: abbr });
          }
        }

        // Abbreviate directions
        for (const [full, abbr] of Object.entries(directions)) {
          const pattern = new RegExp(`\\b${this._escapeRegex(full)}\\b`, 'gi');
          if (pattern.test(street)) {
            street = street.replace(pattern, useUppercase ? abbr.toUpperCase() : abbr);
          }
        }
      }

      components.street = street;
    }

    // Normalize secondary unit
    if (components.street2) {
      let street2 = useUppercase ? components.street2.toUpperCase() : components.street2;
      if (abbreviate) {
        for (const [full, abbr] of Object.entries(units)) {
          const pattern = new RegExp(`\\b${this._escapeRegex(full)}\\b`, 'gi');
          if (pattern.test(street2)) {
            street2 = street2.replace(pattern, useUppercase ? abbr.toUpperCase() : abbr);
          }
        }
      }
      components.street2 = street2;
    }

    // Normalize city
    if (components.city) {
      components.city = useUppercase ? components.city.toUpperCase() : this._toTitleCase(components.city);
    }

    // Normalize state/province to code
    if (components.state) {
      const stateCode = this._normalizeStateProvince(components.state, detectedCountry);
      if (stateCode && stateCode !== components.state) {
        changes.push({ type: 'normalize_state', from: components.state, to: stateCode });
        components.state = useUppercase ? stateCode.toUpperCase() : stateCode;
      } else if (useUppercase) {
        components.state = components.state.toUpperCase();
      }
    }

    // Format postal code
    if (components.postal_code) {
      const formattedPostal = this._formatPostalCode(components.postal_code, detectedCountry);
      if (formattedPostal !== components.postal_code) {
        changes.push({ type: 'format_postal_code', from: components.postal_code, to: formattedPostal });
      }
      components.postal_code = formattedPostal;
    }

    // Store detected country
    if (detectedCountry && !components.country) {
      components.country = detectedCountry;
    }

    // Build normalized string based on country format
    const normalized = this._formatAddressString(components, detectedCountry, countryConfig, useUppercase);

    return {
      original: address,
      normalized,
      components,
      country: detectedCountry,
      confidence,
      changes
    };
  }

  /**
   * Get address configuration for a country
   * @private
   */
  _getAddressConfig(countryCode) {
    if (!countryCode) return null;
    return this.internationalConfig.addressFormats[countryCode] || null;
  }

  /**
   * Normalize state/province name to code
   * @private
   */
  _normalizeStateProvince(state, countryCode) {
    if (!state) return null;
    const stateUpper = state.trim();

    // Check if already a short code (2-4 chars)
    if (stateUpper.length <= 4 && /^[A-Z]+$/i.test(stateUpper)) {
      return stateUpper.toUpperCase();
    }

    // Try country-specific mappings first
    if (countryCode && this.internationalConfig.stateProvinces[countryCode]) {
      const mappings = this.internationalConfig.stateProvinces[countryCode];
      for (const [name, code] of Object.entries(mappings)) {
        if (name.toLowerCase() === stateUpper.toLowerCase()) {
          return code;
        }
      }
    }

    // Fallback to US states (backward compatible)
    const stateCode = this.rules.us_states[stateUpper] ||
                      this.rules.us_states[this._toTitleCase(stateUpper.toLowerCase())];
    if (stateCode) {
      return stateCode;
    }

    // Try all loaded country mappings
    for (const mappings of Object.values(this.internationalConfig.stateProvinces)) {
      for (const [name, code] of Object.entries(mappings)) {
        if (name.toLowerCase() === stateUpper.toLowerCase()) {
          return code;
        }
      }
    }

    return stateUpper;
  }

  /**
   * Format postal code based on country
   * @private
   */
  _formatPostalCode(postalCode, countryCode) {
    if (!postalCode) return null;
    let formatted = postalCode.trim();

    switch (countryCode) {
      case 'US':
        // Format as ZIP or ZIP+4
        formatted = formatted.replace(/[^0-9-]/g, '');
        if (formatted.length === 9 && !formatted.includes('-')) {
          formatted = formatted.slice(0, 5) + '-' + formatted.slice(5);
        }
        break;

      case 'CA':
        // Format as A#A #A# (Canadian postal code)
        formatted = formatted.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (formatted.length === 6) {
          formatted = formatted.slice(0, 3) + ' ' + formatted.slice(3);
        }
        break;

      case 'GB':
        // Format UK postcode with space
        formatted = formatted.toUpperCase().replace(/\s+/g, '');
        if (formatted.length >= 5) {
          // Insert space before last 3 characters
          formatted = formatted.slice(0, -3) + ' ' + formatted.slice(-3);
        }
        break;

      case 'BR':
        // Format as #####-### (Brazilian CEP)
        formatted = formatted.replace(/[^0-9]/g, '');
        if (formatted.length === 8) {
          formatted = formatted.slice(0, 5) + '-' + formatted.slice(5);
        }
        break;

      case 'JP':
        // Format as ###-#### (Japanese postal code)
        formatted = formatted.replace(/[^0-9]/g, '');
        if (formatted.length === 7) {
          formatted = formatted.slice(0, 3) + '-' + formatted.slice(3);
        }
        break;

      case 'PL':
        // Format as ##-### (Polish postal code)
        formatted = formatted.replace(/[^0-9]/g, '');
        if (formatted.length === 5) {
          formatted = formatted.slice(0, 2) + '-' + formatted.slice(2);
        }
        break;

      case 'NL':
        // Format as #### AA (Dutch postal code)
        formatted = formatted.toUpperCase().replace(/\s+/g, '');
        if (formatted.length === 6 && /^\d{4}[A-Z]{2}$/.test(formatted)) {
          formatted = formatted.slice(0, 4) + ' ' + formatted.slice(4);
        }
        break;

      default:
        // No special formatting
        break;
    }

    return formatted;
  }

  /**
   * Format address string based on country
   * @private
   */
  _formatAddressString(components, countryCode, config, uppercase) {
    const parts = [];

    // Use country-specific template if available
    if (config?.format?.template) {
      // Apply template
      let template = config.format.template;
      template = template.replace('{street}', components.street || '');
      template = template.replace('{street2}', components.street2 || '');
      template = template.replace('{number}', components.number || '');
      template = template.replace('{city}', components.city || '');
      template = template.replace('{state}', components.state || '');
      template = template.replace('{postalCode}', components.postal_code || '');
      template = template.replace('{postal_code}', components.postal_code || '');
      template = template.replace('{county}', components.county || '');
      template = template.replace('{neighborhood}', components.neighborhood || '');
      template = template.replace('{district}', components.district || '');

      // Clean up empty placeholders and multiple newlines
      return template
        .replace(/\n\s*\n/g, '\n')
        .replace(/,\s*,/g, ',')
        .replace(/\s+,/g, ',')
        .replace(/^\s+|\s+$/gm, '')
        .trim();
    }

    // Default US-style format
    if (components.street) parts.push(components.street);
    if (components.street2) parts.push(components.street2);
    if (components.city && components.state && components.postal_code) {
      parts.push(`${components.city}, ${components.state} ${components.postal_code}`);
    } else {
      if (components.city) parts.push(components.city);
      if (components.state) parts.push(components.state);
      if (components.postal_code) parts.push(components.postal_code);
    }

    // Add country if not US
    if (components.country &&
        components.country.toUpperCase() !== 'US' &&
        components.country.toUpperCase() !== 'USA') {
      const countryName = this.internationalConfig.countryCodes?.countries?.[components.country]?.name || components.country;
      parts.push(uppercase ? countryName.toUpperCase() : countryName);
    }

    return parts.join('\n');
  }

  /**
   * Parse address string into components (basic parser)
   * @private
   */
  _parseAddressString(str) {
    const lines = str.split(/[\n,]+/).map(l => l.trim()).filter(l => l);
    const components = {};

    if (lines.length >= 1) {
      components.street = lines[0];
    }

    // Try to find city, state, zip in last line(s)
    for (let i = lines.length - 1; i >= 1; i--) {
      const line = lines[i];

      // Check for "City, State ZIP" pattern
      const cityStateZip = line.match(/^([^,]+),?\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/i);
      if (cityStateZip) {
        components.city = cityStateZip[1].trim();
        components.state = cityStateZip[2];
        components.postal_code = cityStateZip[3];
        if (i > 1) {
          components.street2 = lines.slice(1, i).join(' ');
        }
        break;
      }

      // Check for just state and ZIP
      const stateZip = line.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/i);
      if (stateZip) {
        components.state = stateZip[1];
        components.postal_code = stateZip[2];
        continue;
      }

      // Check for just ZIP
      const justZip = line.match(/^(\d{5}(?:-\d{4})?)$/);
      if (justZip) {
        components.postal_code = justZip[1];
        continue;
      }
    }

    return components;
  }

  /**
   * Normalize a job title
   * @param {string} title - The job title to normalize
   * @param {Object} [context] - Context for disambiguation
   * @returns {Object} Normalized title result
   */
  normalizeTitle(title, context = {}) {
    if (!title) {
      return { original: title, normalized: '', changes: [] };
    }

    // Use the semantic disambiguator for title normalization
    const result = this.disambiguator.normalizeTitle(title, context);

    // Additional normalization
    let normalized = result.normalized;

    // Standardize separators
    normalized = normalized.replace(/\s*[/|–—]\s*/g, ' - ');

    // Remove extra whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();

    // Apply title case
    normalized = this._toTitleCase(normalized);

    return {
      original: title,
      normalized,
      changes: result.changes,
      disambiguations: result.changes.filter(c => c.confidence !== undefined)
    };
  }

  /**
   * Normalize a person's name
   * @param {string} name - The name to normalize
   * @returns {Object} Normalized name result
   */
  normalizePersonName(name) {
    if (!name) {
      return { original: name, normalized: '', honorific: null, suffix: null };
    }

    let normalized = name.trim();
    const changes = [];
    let honorific = null;
    let suffix = null;

    // Remove honorifics
    const honorifics = ['Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.', 'Prof.', 'Rev.', 'Hon.', 'Sir'];
    for (const h of honorifics) {
      const pattern = new RegExp(`^${this._escapeRegex(h)}\\s+`, 'i');
      if (pattern.test(normalized)) {
        honorific = h;
        normalized = normalized.replace(pattern, '');
        changes.push({ type: 'remove_honorific', value: h });
        break;
      }
    }

    // Remove suffixes
    const suffixes = ['Jr.', 'Jr', 'Sr.', 'Sr', 'II', 'III', 'IV', 'PhD', 'Ph.D.', 'MD', 'M.D.', 'Esq.', 'CPA'];
    for (const s of suffixes) {
      const pattern = new RegExp(`[,\\s]+${this._escapeRegex(s)}\\s*$`, 'i');
      if (pattern.test(normalized)) {
        suffix = s;
        normalized = normalized.replace(pattern, '');
        changes.push({ type: 'remove_suffix', value: s });
        break;
      }
    }

    // Apply proper case with special handling
    normalized = this._toProperNameCase(normalized);

    return {
      original: name,
      normalized: normalized.trim(),
      honorific,
      suffix,
      changes
    };
  }

  /**
   * Normalize government entity name
   * @param {string} name - The government entity name
   * @returns {Object} Normalized name result
   */
  normalizeGovernmentEntity(name) {
    if (!name) {
      return { original: name, normalized: '', jurisdiction: null, department: null };
    }

    let normalized = name.trim();
    const changes = [];
    let jurisdiction = null;
    let department = null;

    // Standardize jurisdiction prefixes
    const prefixMappings = {
      'City of': 'City of',
      'Town of': 'Town of',
      'Village of': 'Village of',
      'Borough of': 'Borough of',
      'County of': 'County of',
      'State of': 'State of',
      'Commonwealth of': 'Commonwealth of'
    };

    for (const prefix of Object.keys(prefixMappings)) {
      const pattern = new RegExp(`^${prefix}\\s+`, 'i');
      if (pattern.test(normalized)) {
        jurisdiction = normalized.match(pattern)[0].trim();
        break;
      }
    }

    // Standardize department names
    const deptMappings = {
      'Police Dept': 'Police Department',
      'Police Dept.': 'Police Department',
      'PD': 'Police Department',
      'Fire Dept': 'Fire Department',
      'Fire Dept.': 'Fire Department',
      'FD': 'Fire Department',
      'Dept of': 'Department of',
      'Dept. of': 'Department of'
    };

    for (const [abbrev, full] of Object.entries(deptMappings)) {
      const pattern = new RegExp(`\\b${this._escapeRegex(abbrev)}\\b`, 'gi');
      if (pattern.test(normalized)) {
        normalized = normalized.replace(pattern, full);
        changes.push({ type: 'expand_department', from: abbrev, to: full });
      }
    }

    // Extract department type
    const deptPatterns = [
      { pattern: /Police Department/i, type: 'police' },
      { pattern: /Fire Department/i, type: 'fire' },
      { pattern: /Department of Public Works/i, type: 'public_works' },
      { pattern: /Parks.*Recreation/i, type: 'parks' },
      { pattern: /Department of Finance/i, type: 'finance' },
      { pattern: /Human Resources/i, type: 'hr' },
      { pattern: /Information Technology/i, type: 'it' }
    ];

    for (const { pattern, type } of deptPatterns) {
      if (pattern.test(normalized)) {
        department = type;
        break;
      }
    }

    return {
      original: name,
      normalized: normalized.trim(),
      jurisdiction,
      department,
      changes
    };
  }

  /**
   * Normalize a record with multiple fields
   * @param {Object} record - Record with fields to normalize
   * @param {Object} [fieldMap] - Map of field names to normalization types
   * @returns {Object} Normalized record with metadata
   */
  normalizeRecord(record, fieldMap = {}) {
    const defaultFieldMap = {
      account_name: 'company_name',
      company_name: 'company_name',
      name: 'company_name',
      website: 'domain',
      domain: 'domain',
      website_domain: 'domain',
      email: 'email',
      phone: 'phone',
      telephone: 'phone',
      mobile: 'phone',
      address: 'address',
      billing_address: 'address',
      shipping_address: 'address',
      title: 'title',
      job_title: 'title',
      first_name: 'person_name',
      last_name: 'person_name'
    };

    const effectiveFieldMap = { ...defaultFieldMap, ...fieldMap };
    const normalizedRecord = { ...record };
    const changes = {};

    for (const [field, value] of Object.entries(record)) {
      const normType = effectiveFieldMap[field.toLowerCase()];
      if (!normType || value === null || value === undefined) continue;

      let result;
      switch (normType) {
        case 'company_name':
          result = this.normalizeCompanyName(value);
          break;
        case 'domain':
          result = this.normalizeDomain(value);
          break;
        case 'email':
          result = this.normalizeEmail(value);
          break;
        case 'phone':
          result = this.normalizePhone(value);
          break;
        case 'address':
          result = this.normalizeAddress(value);
          break;
        case 'title':
          result = this.normalizeTitle(value);
          break;
        case 'person_name':
          result = this.normalizePersonName(value);
          break;
        default:
          continue;
      }

      if (result && result.normalized !== undefined) {
        normalizedRecord[field] = result.normalized;
        if (result.changes && result.changes.length > 0) {
          changes[field] = result;
        }
      }
    }

    return {
      original: record,
      normalized: normalizedRecord,
      changes
    };
  }

  /**
   * Convert string to Title Case, preserving known acronyms
   * @private
   */
  _toTitleCase(str, preserveAcronyms = []) {
    if (!str) return str;

    const acronyms = new Set((preserveAcronyms || []).map(a => a.toUpperCase()));

    return str.replace(/\w\S*/g, (word) => {
      const upper = word.toUpperCase();
      if (acronyms.has(upper)) {
        // Return the acronym as defined in the list (preserving original case)
        const original = preserveAcronyms.find(a => a.toUpperCase() === upper);
        return original || upper;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
  }

  /**
   * Convert name to proper case with special handling for prefixes
   * @private
   */
  _toProperNameCase(name) {
    if (!name) return name;

    const specialCases = {
      'mcdonald': 'McDonald',
      'macdonald': 'MacDonald',
      'macarthur': 'MacArthur',
      "o'brien": "O'Brien",
      "o'connor": "O'Connor",
      "o'malley": "O'Malley",
      "o'neill": "O'Neill"
    };

    const lowercasePrefixes = ['van', 'von', 'de', 'la', 'del', 'da', 'di'];

    return name.split(/\s+/).map((word, index) => {
      const lower = word.toLowerCase();

      // Check special cases
      if (specialCases[lower]) {
        return specialCases[lower];
      }

      // Check lowercase prefixes (except at start)
      if (index > 0 && lowercasePrefixes.includes(lower)) {
        return lower;
      }

      // Handle Mc prefix
      if (lower.startsWith('mc') && word.length > 2) {
        return 'Mc' + word.charAt(2).toUpperCase() + word.slice(3).toLowerCase();
      }

      // Handle O' prefix
      if (lower.startsWith("o'") && word.length > 2) {
        return "O'" + word.charAt(2).toUpperCase() + word.slice(3).toLowerCase();
      }

      // Default title case
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  }

  /**
   * Escape special regex characters
   * @private
   */
  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Clear the normalization cache
   */
  clearCache() {
    this.cache.clear();
  }
}

module.exports = {
  NormalizationEngine,
  DEFAULT_RULES
};
