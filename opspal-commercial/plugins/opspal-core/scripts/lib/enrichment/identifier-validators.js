#!/usr/bin/env node

/**
 * Identifier Validators
 *
 * Validates industry-specific identifiers against authoritative sources:
 * - NPI (National Provider Identifier) - Healthcare via NPPES
 * - EIN (Employer Identification Number) - IRS/Tax Exempt Search
 * - DUNS (D-U-N-S Number) - Dun & Bradstreet
 * - FCC Call Signs - Broadcasting via FCC CDBS
 *
 * Features:
 * - Local format/checksum validation
 * - API-based verification when available
 * - Caching to reduce API calls
 * - Rate limit management
 *
 * Usage:
 *   const { IdentifierValidators } = require('./identifier-validators');
 *   const validators = new IdentifierValidators();
 *
 *   const npiResult = await validators.validateNPI('1234567890');
 *   const einResult = await validators.validateEIN('123456789');
 */

'use strict';

const https = require('https');
const http = require('http');
const { EnrichmentCache } = require('./enrichment-cache');

class IdentifierValidators {
  constructor(options = {}) {
    // Initialize cache
    this.cache = options.cache || new EnrichmentCache();

    // API configuration
    this.apis = {
      nppes: {
        baseUrl: 'https://npiregistry.cms.hhs.gov/api',
        version: '2.1',
        enabled: options.nppesEnabled !== false
      },
      irs: {
        baseUrl: 'https://apps.irs.gov/app/eos',
        enabled: options.irsEnabled !== false
      },
      fcc: {
        baseUrl: 'https://api.fcc.gov',
        enabled: options.fccEnabled !== false
      }
    };

    // Timeout for API requests (ms)
    this.timeout = options.timeout || 10000;

    // Whether to use API validation or just format validation
    this.apiValidationEnabled = options.apiValidation !== false;
  }

  // ========== NPI Validation ==========

  /**
   * Validate NPI (National Provider Identifier)
   * @param {string} npi - 10-digit NPI
   * @returns {Promise<Object>} Validation result
   */
  async validateNPI(npi) {
    // Normalize
    const normalized = String(npi).replace(/\D/g, '');

    // Basic format check
    if (!/^\d{10}$/.test(normalized)) {
      return {
        valid: false,
        error: 'NPI must be exactly 10 digits',
        identifier: npi,
        type: 'NPI'
      };
    }

    // Luhn checksum validation
    if (!this._validateNPIChecksum(normalized)) {
      return {
        valid: false,
        error: 'NPI checksum validation failed',
        identifier: npi,
        type: 'NPI'
      };
    }

    // Check cache
    const cached = this.cache.get('NPI', normalized);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    // API validation if enabled
    if (this.apiValidationEnabled && this.apis.nppes.enabled) {
      const apiResult = await this._validateNPIViaAPI(normalized);
      if (apiResult) {
        this.cache.set('NPI', normalized, apiResult);
        return apiResult;
      }
    }

    // Return format-valid result if API unavailable
    return {
      valid: true,
      verified: false,
      identifier: normalized,
      type: 'NPI',
      message: 'Format valid (API verification unavailable)'
    };
  }

  /**
   * Validate NPI checksum using Luhn algorithm
   * NPI uses Luhn with prefix 80840
   * @private
   */
  _validateNPIChecksum(npi) {
    // Prepend 80840 per CMS specification
    const withPrefix = '80840' + npi.substring(0, 9);
    const checkDigit = parseInt(npi.charAt(9), 10);

    let sum = 0;
    let double = false;

    // Process from right to left
    for (let i = withPrefix.length - 1; i >= 0; i--) {
      let digit = parseInt(withPrefix.charAt(i), 10);

      if (double) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }

      sum += digit;
      double = !double;
    }

    // Calculate expected check digit
    const expected = (10 - (sum % 10)) % 10;
    return expected === checkDigit;
  }

  /**
   * Validate NPI via NPPES API
   * @private
   */
  async _validateNPIViaAPI(npi) {
    // Check rate limit
    const rateCheck = this.cache.checkRateLimit('NPPES');
    if (!rateCheck.allowed) {
      return null; // Fall back to format validation
    }

    try {
      const url = `${this.apis.nppes.baseUrl}/?version=${this.apis.nppes.version}&number=${npi}`;
      const response = await this._httpGet(url);
      this.cache.recordApiCall('NPPES');

      if (response && response.result_count > 0) {
        const result = response.results[0];
        return {
          valid: true,
          verified: true,
          identifier: npi,
          type: 'NPI',
          provider: {
            name: this._formatNPIName(result),
            entityType: result.enumeration_type,
            taxonomy: result.taxonomies?.[0]?.desc,
            state: result.addresses?.[0]?.state,
            status: result.status || 'Active'
          }
        };
      }

      return {
        valid: false,
        verified: true,
        identifier: npi,
        type: 'NPI',
        error: 'NPI not found in NPPES registry'
      };
    } catch (error) {
      // API error - fall back to format validation
      return null;
    }
  }

  _formatNPIName(npiResult) {
    if (npiResult.enumeration_type === 'NPI-1') {
      // Individual provider
      const basic = npiResult.basic || {};
      return [basic.first_name, basic.middle_name, basic.last_name]
        .filter(Boolean).join(' ');
    } else {
      // Organization
      return npiResult.basic?.organization_name || 'Unknown';
    }
  }

  // ========== EIN Validation ==========

  /**
   * Validate EIN (Employer Identification Number)
   * @param {string} ein - 9-digit EIN (XX-XXXXXXX format accepted)
   * @returns {Promise<Object>} Validation result
   */
  async validateEIN(ein) {
    // Normalize - remove dashes
    const normalized = String(ein).replace(/\D/g, '');

    // Basic format check
    if (!/^\d{9}$/.test(normalized)) {
      return {
        valid: false,
        error: 'EIN must be exactly 9 digits',
        identifier: ein,
        type: 'EIN'
      };
    }

    // Validate prefix (first two digits)
    const prefix = normalized.substring(0, 2);
    if (!this._isValidEINPrefix(prefix)) {
      return {
        valid: false,
        error: `Invalid EIN prefix: ${prefix}`,
        identifier: ein,
        type: 'EIN'
      };
    }

    // Check cache
    const cached = this.cache.get('EIN', normalized);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    // Note: IRS Tax Exempt Organization search is limited to 501(c) orgs
    // General EIN validation requires paid services like D&B
    // For now, return format-valid result

    const result = {
      valid: true,
      verified: false,
      identifier: normalized,
      formatted: `${normalized.substring(0, 2)}-${normalized.substring(2)}`,
      type: 'EIN',
      message: 'Format valid (API verification requires subscription)'
    };

    this.cache.set('EIN', normalized, result);
    return result;
  }

  /**
   * Check if EIN prefix is valid
   * IRS assigns specific prefixes to different offices/purposes
   * @private
   */
  _isValidEINPrefix(prefix) {
    // Known valid prefixes (not exhaustive but covers most)
    const validPrefixes = [
      // IRS Campus codes
      '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
      '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
      '31', '32', '33', '34', '35', '36', '37', '38', '39', '40',
      '41', '42', '43', '44', '45', '46', '47', '48', '49', '50',
      '51', '52', '53', '54', '55', '56', '57', '58', '59', '60',
      '61', '62', '63', '64', '65', '66', '67', '68', '71', '72',
      '73', '74', '75', '76', '77', '80', '81', '82', '83', '84',
      '85', '86', '87', '88', '90', '91', '92', '93', '94', '95',
      '98', '99'
    ];

    return validPrefixes.includes(prefix);
  }

  // ========== DUNS Validation ==========

  /**
   * Validate DUNS (Data Universal Numbering System)
   * @param {string} duns - 9-digit DUNS number
   * @returns {Promise<Object>} Validation result
   */
  async validateDUNS(duns) {
    // Normalize
    const normalized = String(duns).replace(/\D/g, '');

    // Basic format check (9 digits)
    if (!/^\d{9}$/.test(normalized)) {
      return {
        valid: false,
        error: 'DUNS must be exactly 9 digits',
        identifier: duns,
        type: 'DUNS'
      };
    }

    // DUNS doesn't have a public checksum algorithm
    // First digit cannot be 0
    if (normalized.charAt(0) === '0') {
      return {
        valid: false,
        error: 'DUNS cannot start with 0',
        identifier: duns,
        type: 'DUNS'
      };
    }

    // Check cache
    const cached = this.cache.get('DUNS', normalized);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    // Note: D&B API requires subscription
    // Return format-valid result
    const result = {
      valid: true,
      verified: false,
      identifier: normalized,
      type: 'DUNS',
      message: 'Format valid (D&B API verification requires subscription)'
    };

    this.cache.set('DUNS', normalized, result);
    return result;
  }

  // ========== FCC Call Sign Validation ==========

  /**
   * Validate FCC Call Sign
   * @param {string} callSign - FCC broadcast call sign (e.g., WABC, KQED)
   * @returns {Promise<Object>} Validation result
   */
  async validateCallSign(callSign) {
    // Normalize
    const normalized = String(callSign).toUpperCase().trim();

    // Basic format check
    // US call signs: W/K prefix + 3-4 letters, or N/A prefix for amateur
    // Broadcast: W (east of Mississippi) or K (west)
    if (!/^[WNKA][A-Z]{2,3}(-[A-Z]{2})?$/.test(normalized)) {
      return {
        valid: false,
        error: 'Invalid call sign format. Expected W/K prefix with 3-4 letters',
        identifier: callSign,
        type: 'FCC_CALLSIGN'
      };
    }

    // Check cache
    const cached = this.cache.get('FCC_CALLSIGN', normalized);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    // API validation if enabled
    if (this.apiValidationEnabled && this.apis.fcc.enabled) {
      const apiResult = await this._validateCallSignViaAPI(normalized);
      if (apiResult) {
        this.cache.set('FCC_CALLSIGN', normalized, apiResult);
        return apiResult;
      }
    }

    // Return format-valid result
    return {
      valid: true,
      verified: false,
      identifier: normalized,
      type: 'FCC_CALLSIGN',
      message: 'Format valid (API verification unavailable)'
    };
  }

  /**
   * Validate call sign via FCC API
   * @private
   */
  async _validateCallSignViaAPI(callSign) {
    // Check rate limit
    const rateCheck = this.cache.checkRateLimit('FCC');
    if (!rateCheck.allowed) {
      return null;
    }

    try {
      // FCC public search API
      const url = `${this.apis.fcc.baseUrl}/license-view/basicSearch.json?searchValue=${callSign}`;
      const response = await this._httpGet(url);
      this.cache.recordApiCall('FCC');

      if (response && response.Licenses && response.Licenses.License) {
        const licenses = Array.isArray(response.Licenses.License)
          ? response.Licenses.License
          : [response.Licenses.License];

        // Find broadcast license
        const broadcastLicense = licenses.find(l =>
          l.serviceDesc?.includes('Broadcast') ||
          l.serviceDesc?.includes('Radio') ||
          l.serviceDesc?.includes('Television')
        );

        if (broadcastLicense) {
          return {
            valid: true,
            verified: true,
            identifier: callSign,
            type: 'FCC_CALLSIGN',
            license: {
              name: broadcastLicense.licName,
              service: broadcastLicense.serviceDesc,
              status: broadcastLicense.statusDesc,
              market: broadcastLicense.marketName,
              state: broadcastLicense.licState,
              frequency: broadcastLicense.frequencyAssigned
            }
          };
        }
      }

      return {
        valid: false,
        verified: true,
        identifier: callSign,
        type: 'FCC_CALLSIGN',
        error: 'Call sign not found in FCC database'
      };
    } catch (error) {
      return null;
    }
  }

  // ========== Batch Validation ==========

  /**
   * Validate multiple identifiers
   * @param {Array} identifiers - Array of { type, value } objects
   * @returns {Promise<Array>} Validation results
   */
  async validateBatch(identifiers) {
    const results = [];

    for (const { type, value } of identifiers) {
      let result;

      switch (type.toUpperCase()) {
        case 'NPI':
          result = await this.validateNPI(value);
          break;
        case 'EIN':
          result = await this.validateEIN(value);
          break;
        case 'DUNS':
          result = await this.validateDUNS(value);
          break;
        case 'FCC_CALLSIGN':
        case 'CALLSIGN':
          result = await this.validateCallSign(value);
          break;
        default:
          result = {
            valid: false,
            error: `Unknown identifier type: ${type}`,
            identifier: value,
            type
          };
      }

      results.push(result);
    }

    return results;
  }

  // ========== HTTP Helper ==========

  _httpGet(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const urlObj = new URL(url);

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'OpsPal-Enrichment/1.0'
        },
        timeout: this.timeout
      };

      const req = protocol.request(options, (res) => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(null);
          }
        });
      });

      req.on('error', (e) => {
        resolve(null);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });

      req.end();
    });
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }
}

// Identifier format regexes (exported for testing)
const IDENTIFIER_FORMATS = {
  NPI: /^\d{10}$/,
  EIN: /^\d{2}-?\d{7}$/,
  DUNS: /^\d{9}$/,
  FCC_CALLSIGN: /^[WKNC][A-Z0-9]{2,7}(-[A-Z]{2,3})?$/i
};

// Validation endpoints (exported for reference)
const VALIDATION_ENDPOINTS = {
  NPI: 'https://npiregistry.cms.hhs.gov/api',
  FCC: 'https://api.fcc.gov/license-view',
  IRS: 'https://apps.irs.gov/app/eos'
};

// Export
module.exports = {
  IdentifierValidators,
  IDENTIFIER_FORMATS,
  VALIDATION_ENDPOINTS
};

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const validators = new IdentifierValidators();

  if (args.length === 0) {
    console.log(`
Identifier Validators CLI

Usage:
  node identifier-validators.js validate <type> <value>
  node identifier-validators.js batch <json-array>

Types:
  NPI          National Provider Identifier (10 digits)
  EIN          Employer Identification Number (9 digits)
  DUNS         D-U-N-S Number (9 digits)
  FCC_CALLSIGN FCC Broadcast Call Sign (W/K prefix)

Examples:
  node identifier-validators.js validate NPI 1234567893
  node identifier-validators.js validate EIN 12-3456789
  node identifier-validators.js validate FCC_CALLSIGN WABC
  node identifier-validators.js batch '[{"type":"NPI","value":"1234567893"}]'
`);
    process.exit(0);
  }

  const command = args[0];

  (async () => {
    if (command === 'validate') {
      const type = args[1];
      const value = args[2];

      if (!type || !value) {
        console.error('Error: Type and value required');
        process.exit(1);
      }

      let result;
      switch (type.toUpperCase()) {
        case 'NPI':
          result = await validators.validateNPI(value);
          break;
        case 'EIN':
          result = await validators.validateEIN(value);
          break;
        case 'DUNS':
          result = await validators.validateDUNS(value);
          break;
        case 'FCC_CALLSIGN':
        case 'CALLSIGN':
          result = await validators.validateCallSign(value);
          break;
        default:
          console.error(`Unknown type: ${type}`);
          process.exit(1);
      }

      console.log('\n=== Validation Result ===\n');
      console.log(JSON.stringify(result, null, 2));
      console.log('');

    } else if (command === 'batch') {
      const jsonArray = args[1];

      if (!jsonArray) {
        console.error('Error: JSON array required');
        process.exit(1);
      }

      try {
        const identifiers = JSON.parse(jsonArray);
        const results = await validators.validateBatch(identifiers);

        console.log('\n=== Batch Validation Results ===\n');
        console.log(JSON.stringify(results, null, 2));
        console.log('');
      } catch (e) {
        console.error(`Error parsing JSON: ${e.message}`);
        process.exit(1);
      }

    } else {
      console.error(`Unknown command: ${command}`);
      process.exit(1);
    }

    validators.cache.close();
  })();
}
