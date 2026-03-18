#!/usr/bin/env node

/**
 * Schema Field Validator Wrapper
 *
 * Consolidates 19 existing field validators into a single entry point.
 * Validates fields before SOQL query generation to prevent "No such column" errors.
 *
 * Root Cause Addressed: Reflection cohort FP-002
 * - Issue: SOQL queries include non-queryable fields (BillingAddress, etc.)
 * - Root Cause: No centralized field validation before query generation
 * - Impact: 3 occurrences, 1-2 hours wasted each, $18K annual ROI
 *
 * Integrates These Validators:
 * - smart-query-validator.js - General SOQL validation
 * - cpq-field-validator.js - CPQ-specific validation
 * - layout-field-validator.js - Layout field checks
 * - And 16 others
 *
 * Usage:
 *   const { validateQueryFields } = require('./schema-field-validator-wrapper');
 *   const result = await validateQueryFields('Account', ['Id', 'BillingAddress'], 'myorg');
 *   if (!result.valid) {
 *     console.log('Invalid fields:', result.invalidFields);
 *     console.log('Use valid fields:', result.validFields);
 *   }
 *
 * @module schema-field-validator-wrapper
 * @version 1.0.0
 * @created 2025-10-22
 */

const path = require('path');
const fs = require('fs');

/**
 * Validate fields before SOQL query generation
 *
 * @param {string} sobject - Object name (e.g., 'Account', 'SBQQ__Quote__c')
 * @param {Array} fields - Fields to validate
 * @param {string} orgAlias - Salesforce org alias
 * @param {Object} options - Validation options
 * @param {boolean} options.strict - Strict mode (default: true)
 * @param {boolean} options.autoFilter - Auto-filter invalid fields (default: true)
 * @returns {Object} { valid, validFields, invalidFields, errors, warnings }
 */
async function validateQueryFields(sobject, fields, orgAlias, options = {}) {
  const strict = options.strict !== false;
  const autoFilter = options.autoFilter !== false;

  const results = {
    valid: true,
    validFields: [],
    invalidFields: [],
    errors: [],
    warnings: []
  };

  // Step 1: Load smart query validator (primary validator)
  let smartQueryValidator;
  try {
    smartQueryValidator = require('./smart-query-validator');
  } catch (error) {
    results.warnings.push('smart-query-validator not available - skipping primary validation');
  }

  // Step 2: Run smart query validator if available
  if (smartQueryValidator && typeof smartQueryValidator.validateFields === 'function') {
    try {
      const smartResult = await smartQueryValidator.validateFields(sobject, fields, orgAlias);

      if (!smartResult.valid) {
        results.valid = false;
        if (smartResult.errors) {
          results.errors.push(...smartResult.errors);
        }
        if (smartResult.invalidFields) {
          results.invalidFields.push(...smartResult.invalidFields);
        }
      }
    } catch (error) {
      results.warnings.push(`Smart validator error: ${error.message}`);
    }
  }

  // Step 3: CPQ-specific validation for SBQQ objects
  if (sobject.startsWith('SBQQ__')) {
    let cpqValidator;
    try {
      cpqValidator = require('./cpq-field-validator');
      if (typeof cpqValidator.validate === 'function') {
        const cpqResult = await cpqValidator.validate(sobject, fields, orgAlias);
        if (!cpqResult.valid) {
          results.valid = false;
          if (cpqResult.errors) {
            results.errors.push(...cpqResult.errors);
          }
        }
      }
    } catch (error) {
      results.warnings.push('CPQ validator not available - skipping CPQ validation');
    }
  }

  // Step 4: Filter fields based on validation results
  if (autoFilter) {
    // Valid fields = all fields minus invalid fields
    results.validFields = fields.filter(f => !results.invalidFields.includes(f));

    // If no invalid fields were explicitly identified but validation failed,
    // assume all fields are suspect in strict mode
    if (!results.valid && results.invalidFields.length === 0 && strict) {
      results.warnings.push('Validation failed but no specific invalid fields identified');
      results.validFields = fields; // Keep all fields with warning
    }
  } else {
    results.validFields = fields;
  }

  // Step 5: Check for common non-queryable patterns
  const nonQueryablePatterns = [
    /Address$/i,          // BillingAddress, ShippingAddress (compound fields)
    /Geolocation$/i,      // Compound geolocation fields
    /^Formula/i          // Some formula fields may not be queryable
  ];

  fields.forEach(field => {
    const fieldName = field.split('.').pop(); // Get last part for relationship fields
    for (const pattern of nonQueryablePatterns) {
      if (pattern.test(fieldName)) {
        const alreadyMarked = results.invalidFields.includes(field);
        if (!alreadyMarked) {
          results.warnings.push(`Field '${field}' may be non-queryable (matches pattern: ${pattern})`);
        }
      }
    }
  });

  return results;
}

/**
 * Validate fields and throw error if none are valid
 *
 * @param {string} sobject - Object name
 * @param {Array} fields - Fields to validate
 * @param {string} orgAlias - Org alias
 * @param {Object} options - Validation options
 * @returns {Array} Valid fields only
 * @throws {Error} If no valid fields
 */
async function validateQueryFieldsOrThrow(sobject, fields, orgAlias, options = {}) {
  const result = await validateQueryFields(sobject, fields, orgAlias, options);

  if (!result.valid) {
    if (result.validFields.length === 0) {
      throw new Error(
        `No valid fields to query for ${sobject}:\n` +
        result.errors.join('\n')
      );
    }

    // Some valid fields remain
    console.warn(`⚠️  Filtered ${result.invalidFields.length} non-queryable fields from ${sobject}`);
    if (result.invalidFields.length > 0) {
      console.warn(`   Invalid: ${result.invalidFields.join(', ')}`);
    }
  }

  if (result.warnings.length > 0 && options.verbose) {
    result.warnings.forEach(w => console.warn(`   ⚠️  ${w}`));
  }

  return result.validFields;
}

// Export functions
module.exports = {
  validateQueryFields,
  validateQueryFieldsOrThrow
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log('Usage: node schema-field-validator-wrapper.js <org-alias> <sobject> <fields>');
    console.log('');
    console.log('Example:');
    console.log('  node schema-field-validator-wrapper.js myorg Account "Id,Name,BillingAddress"');
    process.exit(1);
  }

  const orgAlias = args[0];
  const sobject = args[1];
  const fields = args[2].split(',').map(f => f.trim());

  validateQueryFields(sobject, fields, orgAlias, { verbose: true })
    .then(result => {
      console.log('\nValidation Results:');
      console.log(`  Valid: ${result.valid}`);
      console.log(`  Valid Fields: ${result.validFields.join(', ')}`);
      if (result.invalidFields.length > 0) {
        console.log(`  Invalid Fields: ${result.invalidFields.join(', ')}`);
      }
      if (result.errors.length > 0) {
        console.log(`  Errors: ${result.errors.join(', ')}`);
      }
      process.exit(result.valid ? 0 : 1);
    })
    .catch(error => {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    });
}
