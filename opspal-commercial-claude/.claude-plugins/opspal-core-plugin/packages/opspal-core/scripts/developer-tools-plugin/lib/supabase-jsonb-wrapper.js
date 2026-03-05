#!/usr/bin/env node

/**
 * Supabase JSONB Wrapper - Centralized utility for submitting to JSONB columns
 *
 * Purpose: Ensures consistent payload format for Supabase tables with JSONB 'data' columns
 *
 * Problem: Supabase tables use single JSONB 'data' column for flexibility, but scripts
 *          often submit flat payloads, causing 400 errors.
 *
 * Solution: Automatically wraps payloads in correct format and validates against schema.
 *
 * Usage:
 *   const { wrapForSupabase, validatePayload } = require('./supabase-jsonb-wrapper');
 *
 *   const payload = { summary: '...', issues: [...] };
 *   const wrapped = wrapForSupabase('reflections', payload);
 *   // Result: { data: { summary: '...', issues: [...] }, created_at: '...', ... }
 *
 * @module supabase-jsonb-wrapper
 */

const fs = require('fs');
const path = require('path');

/**
 * Wraps a payload for Supabase JSONB submission
 *
 * @param {string} tableName - Name of the Supabase table (e.g., 'reflections')
 * @param {object} payload - The data to be wrapped
 * @param {object} options - Optional configuration
 * @param {string} options.userEmail - User email for attribution
 * @param {string} options.org - Organization name
 * @param {boolean} options.validate - Whether to validate against schema (default: true)
 * @returns {object} Wrapped payload ready for Supabase insertion
 * @throws {Error} If validation fails or required fields missing
 */
function wrapForSupabase(tableName, payload, options = {}) {
  const {
    userEmail = process.env.USER_EMAIL,
    org = null,
    validate = true
  } = options;

  // Validate input
  if (!tableName || typeof tableName !== 'string') {
    throw new Error('tableName is required and must be a string');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('payload is required and must be an object');
  }

  // Validate against schema if requested
  if (validate) {
    validatePayload(tableName, payload);
  }

  // Build wrapped payload
  const wrapped = {
    data: payload,
    created_at: new Date().toISOString()
  };

  // Add optional fields
  if (userEmail) {
    wrapped.user_email = userEmail;
  }

  if (org) {
    wrapped.org = org;
  }

  // Table-specific fields
  if (tableName === 'reflections') {
    wrapped.reflection_status = wrapped.reflection_status || 'new';
    wrapped.plugin_name = payload.plugin_name || null;
    wrapped.plugin_version = payload.plugin_version || null;
  }

  return wrapped;
}

/**
 * Validates a payload against the table schema
 *
 * @param {string} tableName - Name of the Supabase table
 * @param {object} payload - The payload to validate
 * @throws {Error} If validation fails with detailed error message
 */
function validatePayload(tableName, payload) {
  // Load schema file
  const schemaPath = findSchemaFile(tableName);

  if (!schemaPath) {
    console.warn(`⚠️  No schema file found for table '${tableName}' - skipping validation`);
    return;
  }

  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  } catch (error) {
    console.warn(`⚠️  Could not load schema file ${schemaPath}: ${error.message}`);
    return;
  }

  // Validate required fields
  const requiredFields = schema.required || [];
  const missingFields = requiredFields.filter(field => !(field in payload));

  if (missingFields.length > 0) {
    throw new Error(
      `Missing required fields for ${tableName}: ${missingFields.join(', ')}\n` +
      `Required: ${requiredFields.join(', ')}\n` +
      `Provided: ${Object.keys(payload).join(', ')}`
    );
  }

  // Validate field types
  if (schema.properties) {
    for (const [field, definition] of Object.entries(schema.properties)) {
      if (field in payload) {
        const value = payload[field];
        const expectedType = definition.type;

        if (!validateType(value, expectedType)) {
          throw new Error(
            `Invalid type for field '${field}': expected ${expectedType}, got ${typeof value}`
          );
        }
      }
    }
  }

  console.log(`✅ Payload validated against ${tableName} schema`);
}

/**
 * Validates a value against expected type
 *
 * @param {*} value - The value to validate
 * @param {string} expectedType - Expected JSON schema type
 * @returns {boolean} Whether value matches expected type
 */
function validateType(value, expectedType) {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'null':
      return value === null;
    default:
      return true; // Unknown type - skip validation
  }
}

/**
 * Finds the schema file for a table
 *
 * Searches in order:
 * 1. .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/schemas/{tableName}-schema.json
 * 2. .claude-plugins/opspal-core-plugin/packages/domains/salesforce/schemas/{tableName}-schema.json
 * 3. .claude-plugins/opspal-core-plugin/packages/domains/hubspot/schemas/{tableName}-schema.json
 * 4. .claude-plugins/salesforce-plugin/schemas/{tableName}-schema.json
 * 5. .claude-plugins/hubspot-core-plugin/schemas/{tableName}-schema.json
 *
 * @param {string} tableName - Name of the table
 * @returns {string|null} Path to schema file, or null if not found
 */
function findSchemaFile(tableName) {
  const pluginDirs = [
    '.claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin',
    '.claude-plugins/opspal-core-plugin/packages/domains/salesforce',
    '.claude-plugins/opspal-core-plugin/packages/domains/hubspot',
    '.claude-plugins/salesforce-plugin',
    '.claude-plugins/hubspot-core-plugin'
  ];

  for (const pluginDir of pluginDirs) {
    const schemaPath = path.join(process.cwd(), pluginDir, 'schemas', `${tableName}-schema.json`);

    if (fs.existsSync(schemaPath)) {
      return schemaPath;
    }
  }

  return null;
}

/**
 * Extracts error details from Supabase API error response
 *
 * @param {object} error - Error object from Supabase API call
 * @returns {string} Human-readable error message
 */
function parseSupabaseError(error) {
  if (!error) {
    return 'Unknown error';
  }

  // Extract error from various formats
  const errorMessage = error.message || error.error || error.details || JSON.stringify(error);

  // Common Supabase error patterns
  if (errorMessage.includes('violates check constraint')) {
    return '❌ Data validation failed: ' + errorMessage.split('violates check constraint')[1];
  }

  if (errorMessage.includes('duplicate key')) {
    return '❌ Duplicate entry: ' + errorMessage.split('duplicate key')[1];
  }

  if (errorMessage.includes('column') && errorMessage.includes('does not exist')) {
    return '❌ Invalid column: ' + errorMessage;
  }

  if (errorMessage.includes('permission denied')) {
    return '❌ Permission denied - check API key has insert permissions';
  }

  return '❌ Supabase error: ' + errorMessage;
}

/**
 * Helper function to unwrap JSONB data from Supabase response
 *
 * @param {object} row - Row from Supabase query result
 * @returns {object} Unwrapped data with top-level fields preserved
 */
function unwrapFromSupabase(row) {
  if (!row) {
    return null;
  }

  const { data, ...metadata } = row;

  return {
    ...metadata,
    ...data
  };
}

// Export functions
module.exports = {
  wrapForSupabase,
  validatePayload,
  parseSupabaseError,
  unwrapFromSupabase,
  findSchemaFile
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: supabase-jsonb-wrapper.js <table-name> <payload-json>');
    console.error('Example: supabase-jsonb-wrapper.js reflections \'{"summary":"test"}\'');
    process.exit(1);
  }

  const [tableName, payloadJson] = args;

  try {
    const payload = JSON.parse(payloadJson);
    const wrapped = wrapForSupabase(tableName, payload);

    console.log(JSON.stringify(wrapped, null, 2));
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}
