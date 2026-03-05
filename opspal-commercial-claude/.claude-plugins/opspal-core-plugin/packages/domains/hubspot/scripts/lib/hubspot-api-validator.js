/**
 * HubSpot API Pre-Flight Validation Library
 * Validates payloads before API calls to catch quirks early
 *
 * Part of: HubSpot API Safeguard Library Implementation
 * ROI: $16,000/year | Effort: 14 hours | Payback: 3 weeks
 */

class HubSpotAPIValidator {
  /**
   * Validate association payload for v4 API
   * @param {Object} payload - Association batch payload
   * @returns {Object} {valid: boolean, errors: string[]}
   */
  validateAssociationPayload(payload) {
    const errors = [];

    if (!payload.inputs || !Array.isArray(payload.inputs)) {
      errors.push('Missing inputs array');
      return { valid: false, errors };
    }

    payload.inputs.forEach((input, idx) => {
      if (!input.types || !Array.isArray(input.types)) {
        errors.push(`Input ${idx}: Missing types array`);
        return;
      }

      input.types.forEach((type, typeIdx) => {
        // CRITICAL: v4 requires both fields
        if (!type.associationCategory) {
          errors.push(`Input ${idx}, type ${typeIdx}: Missing associationCategory (required for v4)`);
        }
        if (!type.associationTypeId) {
          errors.push(`Input ${idx}, type ${typeIdx}: Missing associationTypeId`);
        }
      });
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate list filter operators
   * @param {Object|Array} filters - List filter definitions
   * @returns {Object} {valid: boolean, errors: string[], warnings: string[]}
   */
  validateListOperators(filters) {
    const errors = [];
    const warnings = [];

    // Import operator mappings
    let operatorMappings;
    try {
      operatorMappings = require('./hubspot-list-operators.json');
    } catch (e) {
      warnings.push('Could not load hubspot-list-operators.json - operator validation skipped');
      operatorMappings = {};
    }

    const validateFilter = (filter, path = 'root') => {
      if (filter.filterBranches) {
        // Check for nested OR inside AND
        if (filter.filterBranchType === 'AND') {
          filter.filterBranches.forEach((branch, idx) => {
            if (branch.filterBranchType === 'OR' &&
                branch.filterType !== 'ASSOCIATION' &&
                branch.filterType !== 'UNIFIED_EVENTS') {
              warnings.push(`${path}.branch[${idx}]: Nested OR inside AND not supported via API (use UI instead)`);
            }
            validateFilter(branch, `${path}.branch[${idx}]`);
          });
        } else if (filter.filterBranchType === 'OR') {
          filter.filterBranches.forEach((branch, idx) => {
            validateFilter(branch, `${path}.branch[${idx}]`);
          });
        }
      }

      if (filter.filters) {
        filter.filters.forEach((f, idx) => {
          const propertyType = f.propertyType || 'STRING';
          const validOperators = operatorMappings[propertyType] || {};

          if (f.operator && !validOperators[f.operator]) {
            errors.push(`${path}.filter[${idx}]: Invalid operator '${f.operator}' for type ${propertyType}. Valid operators: ${Object.keys(validOperators).join(', ')}`);
          }
        });
      }
    };

    validateFilter(filters);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate bulk operation safety
   * @param {Object} operation - Bulk operation details
   * @returns {Object} {valid: boolean, errors: string[], requiresConfirmation: boolean}
   */
  validateBulkOperation(operation) {
    const errors = [];
    let requiresConfirmation = false;

    if (operation.action === 'DELETE' && !operation.backup) {
      errors.push('DELETE operations require backup file path');
    }

    if (operation.action === 'DELETE' && !operation.validated) {
      errors.push('DELETE operations require validation checkpoint (e.g., associations transferred)');
    }

    if (operation.count > 100) {
      requiresConfirmation = true;
    }

    return {
      valid: errors.length === 0,
      errors,
      requiresConfirmation
    };
  }

  /**
   * Log validation result
   * @param {string} validationType - Type of validation performed
   * @param {Object} result - Validation result
   */
  logValidation(validationType, result) {
    if (result.valid) {
      console.log(`✅ ${validationType} validation passed`);
    } else {
      console.error(`❌ ${validationType} validation failed:`);
      result.errors.forEach(err => console.error(`  - ${err}`));
    }

    if (result.warnings && result.warnings.length > 0) {
      console.warn(`⚠️  ${validationType} warnings:`);
      result.warnings.forEach(warn => console.warn(`  - ${warn}`));
    }
  }
}

module.exports = new HubSpotAPIValidator();
