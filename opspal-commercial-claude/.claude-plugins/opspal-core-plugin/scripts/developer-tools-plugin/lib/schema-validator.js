/**
 * schema-validator.js
 *
 * Pre-flight validation wrapper for database operations
 * Prevents runtime errors by validating schema before executing queries
 *
 * Usage:
 *   const { validateBeforeUpdate, validateBeforeInsert } = require('./schema-validator');
 *
 *   // Validate before update
 *   await validateBeforeUpdate('reflections', { reflection_status: 'under_review', asana_project_url: '...' });
 *   // Throws if asana_project_url column doesn't exist
 */

const { discoverSchema, validateColumn, getSafeUpdateData } = require('./schema-discovery');
const { createLogger } = require('./structured-logger');

const logger = createLogger('schema-validator');

/**
 * Validate data before update operation
 * @param {string} tableName - Table name
 * @param {object} updateData - Data to update
 * @param {object} options - Validation options
 * @param {boolean} options.throwOnInvalid - Throw error if invalid columns found
 * @param {boolean} options.removInvalid - Remove invalid columns and proceed
 * @returns {Promise<object>} Validated data and warnings
 */
async function validateBeforeUpdate(tableName, updateData, options = {}) {
  const { throwOnInvalid = true, removeInvalid = false } = options;

  logger.debug('Validating update data', {
    tableName,
    columns: Object.keys(updateData)
  });

  const { safeData, skipped } = await getSafeUpdateData(tableName, updateData);

  if (skipped.length > 0) {
    const message = `Invalid columns in update for ${tableName}: ${skipped.join(', ')}`;

    if (throwOnInvalid && !removeInvalid) {
      logger.error(message, null, {
        tableName,
        invalidColumns: skipped
      });
      throw new Error(message);
    } else {
      logger.warn(message, {
        tableName,
        invalidColumns: skipped,
        action: 'removed'
      });
    }
  }

  return {
    validatedData: safeData,
    skippedColumns: skipped,
    isValid: skipped.length === 0
  };
}

/**
 * Validate data before insert operation
 * @param {string} tableName - Table name
 * @param {object} insertData - Data to insert
 * @param {object} options - Validation options
 * @returns {Promise<object>} Validated data
 */
async function validateBeforeInsert(tableName, insertData, options = {}) {
  return validateBeforeUpdate(tableName, insertData, options);
}

/**
 * Validate column exists before query
 * @param {string} tableName - Table name
 * @param {string} columnName - Column name
 * @returns {Promise<boolean>} True if valid
 */
async function validateColumnExists(tableName, columnName) {
  return await validateColumn(tableName, columnName, { throwOnMissing: true });
}

module.exports = {
  validateBeforeUpdate,
  validateBeforeInsert,
  validateColumnExists
};
