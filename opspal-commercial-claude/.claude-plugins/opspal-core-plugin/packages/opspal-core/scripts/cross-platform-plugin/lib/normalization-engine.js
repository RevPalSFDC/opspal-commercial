/**
 * Normalization Engine
 *
 * Applies canonicalization rules to normalize data fields for the RevOps Data Quality System.
 * Handles company names, domains, emails, phones, addresses, and job titles.
 *
 * @module normalization-engine
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { SemanticDisambiguator } = require('./semantic-disambiguator');

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
   */
  constructor(options = {}) {
    this.rules = this._loadRules(options);
    this.disambiguator = options.disambiguator || new SemanticDisambiguator();
    this.cache = new Map();
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
   * Normalize a company/account name
   * @param {string} name - The company name to normalize
   * @param {Object} [options] - Options
   * @param {boolean} [options.preserveSuffix=false] - Keep legal suffix
   * @param {boolean} [options.forMatching=false] - Apply extra normalization for matching
   * @returns {Object} Normalized name result
   */
  normalizeCompanyName(name, options = {}) {
    if (!name) {
      return { original: name, normalized: '', suffix: null, changes: [] };
    }

    const { preserveSuffix = false, forMatching = false } = options;
    let normalized = name.trim();
    const changes = [];
    let suffix = null;

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

    // Step 3: Expand abbreviations
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
      changes
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
   * @returns {Object} Normalized phone result
   */
  normalizePhone(phone, options = {}) {
    if (!phone) {
      return { original: phone, normalized: '', valid: false, extension: null };
    }

    const { defaultCountry = 'US' } = options;
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

    // Strip all non-digit characters except leading +
    const hasPlus = normalized.startsWith('+');
    normalized = normalized.replace(/[^0-9]/g, '');

    // Add country code if missing
    const countryCodes = {
      'US': '1', 'CA': '1',
      'UK': '44', 'GB': '44',
      'AU': '61', 'DE': '49', 'FR': '33'
    };

    // If 10 digits and US/CA default, add +1
    if (normalized.length === 10 && countryCodes[defaultCountry] === '1') {
      normalized = '1' + normalized;
      changes.push({ type: 'add_country_code', country: defaultCountry });
    }

    // If 11 digits starting with 1, assume US/CA
    if (normalized.length === 11 && normalized.startsWith('1')) {
      // Valid as is
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
      changes
    };
  }

  /**
   * Normalize a postal address (USPS format for US)
   * @param {Object|string} address - Address object or string
   * @returns {Object} Normalized address result
   */
  normalizeAddress(address) {
    if (!address) {
      return { original: address, normalized: null, components: null };
    }

    // If string, try to parse into components
    let components;
    if (typeof address === 'string') {
      components = this._parseAddressString(address);
    } else {
      components = { ...address };
    }

    const changes = [];

    // Normalize street
    if (components.street) {
      let street = components.street.toUpperCase();

      // Abbreviate street types
      for (const [full, abbr] of Object.entries(this.rules.street_abbreviations)) {
        const pattern = new RegExp(`\\b${full}\\b`, 'gi');
        if (pattern.test(street)) {
          street = street.replace(pattern, abbr);
          changes.push({ type: 'abbreviate_street', from: full, to: abbr });
        }
      }

      // Abbreviate directions
      for (const [full, abbr] of Object.entries(this.rules.direction_abbreviations)) {
        const pattern = new RegExp(`\\b${full}\\b`, 'gi');
        if (pattern.test(street)) {
          street = street.replace(pattern, abbr);
        }
      }

      components.street = street;
    }

    // Normalize secondary unit
    if (components.street2) {
      let street2 = components.street2.toUpperCase();
      for (const [full, abbr] of Object.entries(this.rules.unit_abbreviations)) {
        const pattern = new RegExp(`\\b${full}\\b`, 'gi');
        if (pattern.test(street2)) {
          street2 = street2.replace(pattern, abbr);
        }
      }
      components.street2 = street2;
    }

    // Normalize city (uppercase)
    if (components.city) {
      components.city = components.city.toUpperCase();
    }

    // Normalize state to two-letter code
    if (components.state) {
      const stateUpper = components.state.trim();
      // Check if it's already a 2-letter code
      if (stateUpper.length === 2) {
        components.state = stateUpper.toUpperCase();
      } else {
        // Look up full state name
        const stateCode = this.rules.us_states[stateUpper] ||
                          this.rules.us_states[this._toTitleCase(stateUpper.toLowerCase())];
        if (stateCode) {
          components.state = stateCode;
          changes.push({ type: 'normalize_state', from: stateUpper, to: stateCode });
        } else {
          components.state = stateUpper.toUpperCase();
        }
      }
    }

    // Format postal code
    if (components.postal_code) {
      let zip = components.postal_code.replace(/[^0-9-]/g, '');
      // Format as ZIP+4 if applicable
      if (zip.length === 9 && !zip.includes('-')) {
        zip = zip.slice(0, 5) + '-' + zip.slice(5);
      }
      components.postal_code = zip;
    }

    // Build normalized string
    const parts = [];
    if (components.street) parts.push(components.street);
    if (components.street2) parts.push(components.street2);
    if (components.city && components.state && components.postal_code) {
      parts.push(`${components.city}, ${components.state} ${components.postal_code}`);
    } else {
      if (components.city) parts.push(components.city);
      if (components.state) parts.push(components.state);
      if (components.postal_code) parts.push(components.postal_code);
    }
    if (components.country && components.country.toUpperCase() !== 'US' && components.country.toUpperCase() !== 'USA') {
      parts.push(components.country.toUpperCase());
    }

    return {
      original: address,
      normalized: parts.join('\n'),
      components,
      changes
    };
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
