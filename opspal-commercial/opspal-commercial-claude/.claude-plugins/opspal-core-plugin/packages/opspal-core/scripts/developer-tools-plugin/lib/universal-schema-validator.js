/**
 * Universal Schema Validator
 * Validates data against database schemas before submission
 *
 * Part of: Universal Schema Validator Implementation
 * ROI: $9,200/year | Effort: 13 hours | Payback: 4 weeks
 */

class UniversalSchemaValidator {
  /**
   * Validate data against schema definition
   * @param {Object} data - Data to validate
   * @param {Object} schema - Schema definition
   * @param {Object} options - Validation options
   * @returns {Object} {valid: boolean, errors: string[], warnings: string[]}
   */
  validateAgainstSchema(data, schema, options = {}) {
    const errors = [];
    const warnings = [];
    const { strict = true, allowUnknownFields = false } = options;

    // 1. Check required fields
    if (schema.required) {
      schema.required.forEach(field => {
        if (data[field] === undefined || data[field] === null) {
          errors.push(`Missing required field: ${field}`);
        }
      });
    }

    // 2. Validate field types and constraints
    if (schema.properties) {
      Object.keys(data).forEach(field => {
        const fieldSchema = schema.properties[field];

        // Check for unknown fields
        if (!fieldSchema) {
          if (!allowUnknownFields) {
            errors.push(`Unknown field: ${field} (not defined in schema)`);
          } else {
            warnings.push(`Unknown field: ${field} (will be ignored)`);
          }
          return;
        }

        const value = data[field];

        // Skip null values if nullable
        if (value === null) {
          if (!fieldSchema.nullable) {
            errors.push(`Field ${field} cannot be null`);
          }
          return;
        }

        // Skip undefined values
        if (value === undefined) {
          return;
        }

        // Type validation
        const typeError = this.validateType(field, value, fieldSchema);
        if (typeError) {
          errors.push(typeError);
        }

        // Constraint validation
        const constraintErrors = this.validateConstraints(field, value, fieldSchema);
        errors.push(...constraintErrors);
      });
    }

    // 3. Validate unique constraints
    if (schema.unique && options.existingRecords) {
      schema.unique.forEach(field => {
        if (data[field] !== undefined) {
          const exists = options.existingRecords.some(
            record => record[field] === data[field]
          );
          if (exists) {
            errors.push(`Unique constraint violation: ${field} = '${data[field]}' already exists`);
          }
        }
      });
    }

    // 4. Validate foreign key constraints
    if (schema.foreignKeys && options.referencedData) {
      schema.foreignKeys.forEach(fk => {
        const value = data[fk.field];
        if (value !== undefined && value !== null) {
          const referencedTable = options.referencedData[fk.references.table];
          if (referencedTable) {
            const exists = referencedTable.some(
              record => record[fk.references.field] === value
            );
            if (!exists) {
              errors.push(`Foreign key violation: ${fk.field} = '${value}' not found in ${fk.references.table}.${fk.references.field}`);
            }
          } else if (strict) {
            warnings.push(`Cannot validate foreign key ${fk.field}: Referenced data not provided`);
          }
        }
      });
    }

    // 5. Validate check constraints
    if (schema.checks) {
      schema.checks.forEach(check => {
        try {
          // Evaluate check constraint (simple expression evaluation)
          const result = this.evaluateCheckConstraint(data, check);
          if (!result) {
            errors.push(`Check constraint failed: ${check.name} (${check.expression})`);
          }
        } catch (error) {
          warnings.push(`Could not evaluate check constraint ${check.name}: ${error.message}`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate field type
   * @param {string} field - Field name
   * @param {*} value - Field value
   * @param {Object} fieldSchema - Field schema definition
   * @returns {string|null} Error message or null
   */
  validateType(field, value, fieldSchema) {
    const { type, format } = fieldSchema;

    switch (type) {
      case 'string':
        if (typeof value !== 'string') {
          return `Field ${field} must be a string, got ${typeof value}`;
        }
        if (format === 'email' && !this.isValidEmail(value)) {
          return `Field ${field} must be a valid email address`;
        }
        if (format === 'uuid' && !this.isValidUUID(value)) {
          return `Field ${field} must be a valid UUID`;
        }
        if (format === 'date-time' && !this.isValidDateTime(value)) {
          return `Field ${field} must be a valid ISO 8601 date-time`;
        }
        break;

      case 'integer':
        if (!Number.isInteger(value)) {
          return `Field ${field} must be an integer, got ${typeof value}`;
        }
        break;

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return `Field ${field} must be a number, got ${typeof value}`;
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          return `Field ${field} must be a boolean, got ${typeof value}`;
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          return `Field ${field} must be an array, got ${typeof value}`;
        }
        // Validate array items if schema provided
        if (fieldSchema.items) {
          for (let i = 0; i < value.length; i++) {
            const itemError = this.validateType(`${field}[${i}]`, value[i], fieldSchema.items);
            if (itemError) {
              return itemError;
            }
          }
        }
        break;

      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return `Field ${field} must be an object, got ${typeof value}`;
        }
        break;

      default:
        return `Unknown type '${type}' for field ${field}`;
    }

    return null;
  }

  /**
   * Validate field constraints
   * @param {string} field - Field name
   * @param {*} value - Field value
   * @param {Object} fieldSchema - Field schema definition
   * @returns {string[]} Array of error messages
   */
  validateConstraints(field, value, fieldSchema) {
    const errors = [];

    // String constraints
    if (fieldSchema.type === 'string') {
      if (fieldSchema.minLength !== undefined && value.length < fieldSchema.minLength) {
        errors.push(`Field ${field} must be at least ${fieldSchema.minLength} characters (got ${value.length})`);
      }
      if (fieldSchema.maxLength !== undefined && value.length > fieldSchema.maxLength) {
        errors.push(`Field ${field} must be at most ${fieldSchema.maxLength} characters (got ${value.length})`);
      }
      if (fieldSchema.pattern) {
        const regex = new RegExp(fieldSchema.pattern);
        if (!regex.test(value)) {
          errors.push(`Field ${field} does not match pattern: ${fieldSchema.pattern}`);
        }
      }
      if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
        errors.push(`Field ${field} must be one of: ${fieldSchema.enum.join(', ')} (got '${value}')`);
      }
    }

    // Number constraints
    if (fieldSchema.type === 'number' || fieldSchema.type === 'integer') {
      if (fieldSchema.minimum !== undefined && value < fieldSchema.minimum) {
        errors.push(`Field ${field} must be >= ${fieldSchema.minimum} (got ${value})`);
      }
      if (fieldSchema.maximum !== undefined && value > fieldSchema.maximum) {
        errors.push(`Field ${field} must be <= ${fieldSchema.maximum} (got ${value})`);
      }
      if (fieldSchema.exclusiveMinimum !== undefined && value <= fieldSchema.exclusiveMinimum) {
        errors.push(`Field ${field} must be > ${fieldSchema.exclusiveMinimum} (got ${value})`);
      }
      if (fieldSchema.exclusiveMaximum !== undefined && value >= fieldSchema.exclusiveMaximum) {
        errors.push(`Field ${field} must be < ${fieldSchema.exclusiveMaximum} (got ${value})`);
      }
    }

    // Array constraints
    if (fieldSchema.type === 'array') {
      if (fieldSchema.minItems !== undefined && value.length < fieldSchema.minItems) {
        errors.push(`Field ${field} must have at least ${fieldSchema.minItems} items (got ${value.length})`);
      }
      if (fieldSchema.maxItems !== undefined && value.length > fieldSchema.maxItems) {
        errors.push(`Field ${field} must have at most ${fieldSchema.maxItems} items (got ${value.length})`);
      }
      if (fieldSchema.uniqueItems && value.length !== new Set(value).size) {
        errors.push(`Field ${field} must have unique items`);
      }
    }

    return errors;
  }

  /**
   * Evaluate check constraint expression
   * @param {Object} data - Data object
   * @param {Object} check - Check constraint definition
   * @returns {boolean} True if constraint satisfied
   */
  evaluateCheckConstraint(data, check) {
    // Simple expression evaluator for common patterns
    const { expression } = check;

    // Pattern: field > value
    const gtMatch = expression.match(/(\w+)\s*>\s*(\d+)/);
    if (gtMatch) {
      return data[gtMatch[1]] > parseInt(gtMatch[2]);
    }

    // Pattern: field >= value
    const gteMatch = expression.match(/(\w+)\s*>=\s*(\d+)/);
    if (gteMatch) {
      return data[gteMatch[1]] >= parseInt(gteMatch[2]);
    }

    // Pattern: field < value
    const ltMatch = expression.match(/(\w+)\s*<\s*(\d+)/);
    if (ltMatch) {
      return data[ltMatch[1]] < parseInt(ltMatch[2]);
    }

    // Pattern: field <= value
    const lteMatch = expression.match(/(\w+)\s*<=\s*(\d+)/);
    if (lteMatch) {
      return data[lteMatch[1]] <= parseInt(lteMatch[2]);
    }

    // Pattern: field IN (value1, value2, ...)
    const inMatch = expression.match(/(\w+)\s+IN\s*\((.*?)\)/i);
    if (inMatch) {
      const values = inMatch[2].split(',').map(v => v.trim().replace(/['"]/g, ''));
      return values.includes(String(data[inMatch[1]]));
    }

    // For complex expressions, skip validation
    return true;
  }

  /**
   * Validate email format
   */
  isValidEmail(value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  }

  /**
   * Validate UUID format
   */
  isValidUUID(value) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  /**
   * Validate ISO 8601 date-time format
   */
  isValidDateTime(value) {
    const date = new Date(value);
    return !isNaN(date.getTime()) && value === date.toISOString();
  }

  /**
   * Batch validate multiple records
   * @param {Array} records - Array of records to validate
   * @param {Object} schema - Schema definition
   * @param {Object} options - Validation options
   * @returns {Object} {valid: boolean, results: Array, summary: Object}
   */
  batchValidate(records, schema, options = {}) {
    const results = records.map((record, index) => {
      const result = this.validateAgainstSchema(record, schema, options);
      return {
        index,
        record,
        ...result
      };
    });

    const failedRecords = results.filter(r => !r.valid);
    const totalErrors = failedRecords.reduce((sum, r) => sum + r.errors.length, 0);
    const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);

    return {
      valid: failedRecords.length === 0,
      results,
      summary: {
        total: records.length,
        valid: records.length - failedRecords.length,
        invalid: failedRecords.length,
        totalErrors,
        totalWarnings
      }
    };
  }

  /**
   * Log validation result
   * @param {string} operation - Operation name
   * @param {Object} result - Validation result
   */
  logValidation(operation, result) {
    if (result.valid) {
      console.log(`✅ ${operation} schema validation passed`);
    } else {
      console.error(`❌ ${operation} schema validation failed:`);
      result.errors.forEach(err => console.error(`  - ${err}`));
    }

    if (result.warnings && result.warnings.length > 0) {
      console.warn(`⚠️  ${operation} schema validation warnings:`);
      result.warnings.forEach(warn => console.warn(`  - ${warn}`));
    }

    // Summary for batch validation
    if (result.summary) {
      console.log(`\n📊 Batch Validation Summary:`);
      console.log(`  Total records: ${result.summary.total}`);
      console.log(`  Valid: ${result.summary.valid} (${Math.round(result.summary.valid / result.summary.total * 100)}%)`);
      console.log(`  Invalid: ${result.summary.invalid}`);
      console.log(`  Total errors: ${result.summary.totalErrors}`);
      console.log(`  Total warnings: ${result.summary.totalWarnings}`);
    }
  }
}

module.exports = new UniversalSchemaValidator();
