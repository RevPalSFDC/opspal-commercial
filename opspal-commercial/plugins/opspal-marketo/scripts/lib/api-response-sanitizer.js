/**
 * Marketo API Response Sanitizer
 *
 * Handles quirks in Marketo REST API responses, particularly the literal string
 * "null" that gets returned for empty fields instead of JSON null.
 *
 * Root Cause (P1 - Reflection Cohort schema/parse):
 * Marketo REST API returns literal string 'null' for empty fields, not JSON null.
 * Python's truthiness check treats 'null' string as truthy, causing data issues.
 *
 * @module api-response-sanitizer
 * @version 1.0.0
 * @date 2026-01-30
 */

/**
 * Fields that commonly return 'null' string from Marketo API
 */
const NULL_PRONE_FIELDS = [
  'sfdcId',
  'sfdcType',
  'sfdcAccountId',
  'sfdcContactId',
  'sfdcLeadId',
  'sfdcOpptyId',
  'sfdcCampaignId',
  'company',
  'title',
  'phone',
  'mobilePhone',
  'fax',
  'website',
  'department',
  'industry',
  'address',
  'city',
  'state',
  'country',
  'postalCode',
  'billingAddress',
  'billingCity',
  'billingState',
  'billingCountry',
  'billingPostalCode',
  'annualRevenue',
  'numberOfEmployees',
  'leadSource',
  'leadStatus',
  'rating',
  'originalSourceType',
  'originalSourceInfo',
  'acquisitionProgramId',
  'unsubscribedReason',
  'doNotCallReason',
  'personNotes'
];

/**
 * Sanitize a single value, converting string 'null' to actual null
 *
 * @param {*} value - Value to sanitize
 * @returns {*} Sanitized value
 */
function sanitizeValue(value) {
  // String 'null' (case insensitive) → actual null
  if (typeof value === 'string' && value.toLowerCase() === 'null') {
    return null;
  }

  // Empty string → null (optional, can be configured)
  if (value === '') {
    return null;
  }

  return value;
}

/**
 * Sanitize an object, converting all string 'null' values to actual null
 *
 * @param {Object} obj - Object to sanitize
 * @param {Object} options - Sanitization options
 * @param {boolean} options.deep - Recursively sanitize nested objects (default: true)
 * @param {boolean} options.emptyToNull - Convert empty strings to null (default: false)
 * @param {string[]} options.onlyFields - Only sanitize these specific fields
 * @returns {Object} Sanitized object
 */
function sanitizeObject(obj, options = {}) {
  const {
    deep = true,
    emptyToNull = false,
    onlyFields = null
  } = options;

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, options));
  }

  if (typeof obj !== 'object') {
    return sanitizeValue(obj);
  }

  const result = {};

  for (const [key, value] of Object.entries(obj)) {
    // Check if we should sanitize this field
    const shouldSanitize = !onlyFields || onlyFields.includes(key);

    if (shouldSanitize) {
      if (typeof value === 'string') {
        // Handle string 'null'
        if (value.toLowerCase() === 'null') {
          result[key] = null;
        } else if (emptyToNull && value === '') {
          result[key] = null;
        } else {
          result[key] = value;
        }
      } else if (deep && typeof value === 'object' && value !== null) {
        result[key] = sanitizeObject(value, options);
      } else {
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Sanitize Marketo API response
 *
 * @param {Object} response - Marketo API response
 * @param {Object} options - Sanitization options
 * @returns {Object} Sanitized response
 */
function sanitizeApiResponse(response, options = {}) {
  if (!response) return response;

  // Handle standard Marketo response structure
  if (response.result && Array.isArray(response.result)) {
    return {
      ...response,
      result: response.result.map(item => sanitizeObject(item, {
        ...options,
        onlyFields: options.onlyFields || NULL_PRONE_FIELDS
      }))
    };
  }

  return sanitizeObject(response, options);
}

/**
 * Check if a value is truthy in a Marketo-safe way
 * (handles string 'null' as falsy)
 *
 * @param {*} value - Value to check
 * @returns {boolean} True if value is truthy and not string 'null'
 */
function isTruthy(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.toLowerCase() === 'null') return false;
  if (value === '') return false;
  return Boolean(value);
}

/**
 * Safe field accessor that handles string 'null'
 *
 * Usage:
 *   const sfdcId = getField(lead, 'sfdcId');
 *   if (sfdcId) { ... }  // Won't be truthy for string 'null'
 *
 * @param {Object} obj - Object to get field from
 * @param {string} field - Field name
 * @param {*} defaultValue - Default value if field is null/undefined/'null'
 * @returns {*} Field value or default
 */
function getField(obj, field, defaultValue = null) {
  if (!obj || typeof obj !== 'object') return defaultValue;

  const value = obj[field];

  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'string' && value.toLowerCase() === 'null') return defaultValue;
  if (value === '') return defaultValue;

  return value;
}

/**
 * Filter leads that have a valid Salesforce ID
 * (commonly needed after Marketo API calls)
 *
 * @param {Array} leads - Array of lead objects
 * @returns {Array} Leads with valid sfdcId
 */
function filterWithSfdcId(leads) {
  return leads.filter(lead => isTruthy(lead.sfdcId));
}

/**
 * Filter leads that do NOT have a Salesforce ID
 *
 * @param {Array} leads - Array of lead objects
 * @returns {Array} Leads without sfdcId
 */
function filterWithoutSfdcId(leads) {
  return leads.filter(lead => !isTruthy(lead.sfdcId));
}

/**
 * Wrap a Marketo MCP tool call with automatic response sanitization
 *
 * Usage:
 *   const sanitizedQuery = wrapMcpTool(mcp__marketo__lead_query);
 *   const result = await sanitizedQuery({ filterType: 'email', ... });
 *   // result.result is now sanitized
 *
 * @param {Function} mcpTool - MCP tool function
 * @param {Object} options - Sanitization options
 * @returns {Function} Wrapped function that sanitizes responses
 */
function wrapMcpTool(mcpTool, options = {}) {
  return async function(...args) {
    const response = await mcpTool(...args);
    return sanitizeApiResponse(response, options);
  };
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'test') {
    // Test the sanitizer
    const testData = {
      result: [
        { id: 1, sfdcId: 'null', sfdcType: 'null', email: 'test@example.com' },
        { id: 2, sfdcId: '00Q123', sfdcType: 'Lead', email: 'valid@example.com' },
        { id: 3, sfdcId: 'NULL', sfdcType: 'NULL', email: '' }
      ]
    };

    console.log('Input:', JSON.stringify(testData, null, 2));
    console.log('\nSanitized:', JSON.stringify(sanitizeApiResponse(testData), null, 2));

    console.log('\nWith SFDC ID:', filterWithSfdcId(sanitizeApiResponse(testData).result).length);
    console.log('Without SFDC ID:', filterWithoutSfdcId(sanitizeApiResponse(testData).result).length);

  } else if (command === 'help') {
    console.log(`
Marketo API Response Sanitizer

Usage:
  node api-response-sanitizer.js test       - Run test with sample data
  node api-response-sanitizer.js help       - Show this help

Programmatic Usage:
  const { sanitizeApiResponse, getField, isTruthy } = require('./api-response-sanitizer');

  // Sanitize entire response
  const clean = sanitizeApiResponse(response);

  // Safe field access
  const sfdcId = getField(lead, 'sfdcId');
  if (sfdcId) { /* actually has an ID */ }

  // Check if truthy (handles string 'null')
  if (isTruthy(lead.sfdcId)) { /* has valid ID */ }
`);
  } else {
    console.log('Usage: node api-response-sanitizer.js [test|help]');
  }
}

module.exports = {
  sanitizeValue,
  sanitizeObject,
  sanitizeApiResponse,
  isTruthy,
  getField,
  filterWithSfdcId,
  filterWithoutSfdcId,
  wrapMcpTool,
  NULL_PRONE_FIELDS
};
