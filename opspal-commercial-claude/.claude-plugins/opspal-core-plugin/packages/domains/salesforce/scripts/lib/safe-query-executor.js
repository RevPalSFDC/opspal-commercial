#!/usr/bin/env node

/**
 * Safe Query Executor
 *
 * Provides null-safe wrappers and validation for Salesforce query execution.
 * Prevents common errors from null child relationships and malformed SOQL.
 *
 * Usage:
 *   const { safeChildRecords, validateSOQL, executeQuery } = require('./safe-query-executor');
 *   const records = safeChildRecords(parentRecord.ChildRelationship__r);
 *   const isValid = validateSOQL(myQuery);
 *
 * @module safe-query-executor
 * @version 1.0.0
 * @created 2025-10-08
 */

const { execSync } = require('child_process');

/**
 * Safely access child relationship records
 *
 * Returns empty array if relationship is null/undefined instead of throwing error.
 * Use this for ALL child relationship accesses in queries.
 *
 * @param {Object} relationshipObject - Child relationship from query result
 * @param {Array} defaultValue - Default value if null (default: [])
 * @returns {Array} Array of records or default value
 *
 * @example
 * // ❌ BAD - throws error if null
 * rule.SBQQ__PriceConditions__r.records.forEach(...)
 *
 * // ✅ GOOD - safe
 * safeChildRecords(rule.SBQQ__PriceConditions__r).forEach(...)
 */
function safeChildRecords(relationshipObject, defaultValue = []) {
  if (!relationshipObject) {
    return defaultValue;
  }

  if (Array.isArray(relationshipObject)) {
    return relationshipObject;
  }

  if (relationshipObject.records && Array.isArray(relationshipObject.records)) {
    return relationshipObject.records;
  }

  return defaultValue;
}

/**
 * Safely access nested field value
 *
 * Returns null instead of throwing error if path doesn't exist.
 *
 * @param {Object} obj - Object to access
 * @param {string} path - Dot-notation path (e.g., "Account.Owner.Name")
 * @param {*} defaultValue - Default value if path doesn't exist
 * @returns {*} Value at path or default value
 *
 * @example
 * const ownerName = safeFieldValue(record, 'Account.Owner.Name', 'Unknown');
 */
function safeFieldValue(obj, path, defaultValue = null) {
  if (!obj || !path) {
    return defaultValue;
  }

  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined || !(part in current)) {
      return defaultValue;
    }
    current = current[part];
  }

  return current;
}

/**
 * Validate SOQL query syntax
 *
 * Checks for common syntax errors that cause query failures.
 *
 * @param {string} query - SOQL query to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateSOQL(query) {
  const errors = [];

  if (!query || typeof query !== 'string') {
    return { valid: false, errors: ['Query must be a non-empty string'] };
  }

  // Check for trailing commas in SELECT clause
  const selectMatch = query.match(/SELECT\s+(.*?)\s+FROM/is);
  if (selectMatch) {
    const selectClause = selectMatch[1];

    // Check for trailing comma before FROM
    if (selectClause.trim().endsWith(',')) {
      errors.push('SELECT clause has trailing comma before FROM');
    }

    // Check for empty SELECT items (multiple commas)
    if (selectClause.includes(',,')) {
      errors.push('SELECT clause has empty items (consecutive commas)');
    }

    // Check for comma followed by FROM
    if (selectClause.match(/,\s*$/)) {
      errors.push('SELECT clause ends with comma');
    }
  }

  // Check for malformed WHERE clause
  const whereMatch = query.match(/WHERE\s+(.*?)(\s+ORDER|\s+LIMIT|\s+GROUP|$)/is);
  if (whereMatch) {
    const whereClause = whereMatch[1];

    // Check for dangling operators
    if (whereClause.match(/\b(AND|OR)\s*$/i)) {
      errors.push('WHERE clause ends with dangling AND/OR');
    }

    if (whereClause.match(/^\s*(AND|OR)\b/i)) {
      errors.push('WHERE clause starts with AND/OR');
    }
  }

  // Check for empty subqueries
  if (query.match(/\(SELECT\s*FROM/i)) {
    errors.push('Subquery has empty SELECT clause');
  }

  // Check for unclosed parentheses
  const openParens = (query.match(/\(/g) || []).length;
  const closeParens = (query.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    errors.push(`Unbalanced parentheses (${openParens} open, ${closeParens} close)`);
  }

  // Check for basic structure
  if (!query.match(/SELECT\s+.*?\s+FROM\s+/is)) {
    errors.push('Query missing required SELECT...FROM structure');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Clean SOQL query by removing common syntax issues
 *
 * Attempts to automatically fix common problems.
 *
 * @param {string} query - SOQL query to clean
 * @returns {string} Cleaned query
 */
function cleanSOQL(query) {
  let cleaned = query;

  // Remove trailing commas in SELECT clause
  cleaned = cleaned.replace(/,(\s*FROM\s+)/gi, '$1');

  // Remove empty lines in SELECT clause
  cleaned = cleaned.replace(/SELECT\s+((?:.*?\n)*?)\s*FROM/is, (match, selectClause) => {
    const fields = selectClause
      .split(',')
      .map(f => f.trim())
      .filter(f => f.length > 0);
    return `SELECT\n  ${fields.join(',\n  ')}\nFROM`;
  });

  // Remove double commas
  cleaned = cleaned.replace(/,,+/g, ',');

  // Remove trailing AND/OR in WHERE clause
  cleaned = cleaned.replace(/\b(AND|OR)\s+(ORDER|LIMIT|GROUP|$)/gi, ' $2');

  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * Execute SOQL query with validation and error handling
 *
 * @param {string} query - SOQL query to execute
 * @param {string} orgAlias - Salesforce org alias
 * @param {Object} options - Execution options
 * @returns {Object} Query result with records
 */
function executeQuery(query, orgAlias, options = {}) {
  const {
    validate = true,
    autoClean = true,
    useToolingApi = false,
    maxBuffer = 10 * 1024 * 1024
  } = options;

  // Validate query
  if (validate) {
    const validation = validateSOQL(query);
    if (!validation.valid) {
      if (autoClean) {
        console.warn('⚠️  Query has syntax issues, attempting auto-clean...');
        validation.errors.forEach(err => console.warn(`   - ${err}`));
        query = cleanSOQL(query);

        // Re-validate after cleaning
        const revalidation = validateSOQL(query);
        if (!revalidation.valid) {
          throw new Error(`Query validation failed after cleaning:\n${revalidation.errors.join('\n')}`);
        }
        console.warn('   ✅ Query cleaned successfully');
      } else {
        throw new Error(`Query validation failed:\n${validation.errors.join('\n')}`);
      }
    }
  }

  // Build command
  const toolingFlag = useToolingApi ? '--use-tooling-api' : '';
  const cmd = `sf data query --query "${query}" --target-org ${orgAlias} ${toolingFlag} --json`;

  try {
    const result = JSON.parse(execSync(cmd, {
      encoding: 'utf-8',
      maxBuffer
    }));

    if (result.status !== 0) {
      throw new Error(`Query failed: ${result.message}`);
    }

    return result.result;

  } catch (error) {
    // Add query context to error
    const contextError = new Error(`Query execution failed: ${error.message}\n\nQuery:\n${query}`);
    contextError.originalError = error;
    throw contextError;
  }
}

/**
 * Execute multiple queries in sequence with error recovery
 *
 * @param {Array} queries - Array of { query, orgAlias, options }
 * @returns {Array} Array of results (null for failed queries)
 */
function executeMultipleQueries(queries) {
  const results = [];

  queries.forEach((queryConfig, index) => {
    try {
      console.log(`Executing query ${index + 1}/${queries.length}...`);
      const result = executeQuery(
        queryConfig.query,
        queryConfig.orgAlias,
        queryConfig.options || {}
      );
      results.push({ success: true, result });
    } catch (error) {
      console.error(`❌ Query ${index + 1} failed: ${error.message}`);
      results.push({ success: false, error: error.message });
    }
  });

  return results;
}

/**
 * Check if query result has records
 *
 * @param {Object} result - Query result object
 * @returns {boolean} True if result has at least one record
 */
function hasRecords(result) {
  return result &&
    result.records &&
    Array.isArray(result.records) &&
    result.records.length > 0;
}

/**
 * Get record count from query result
 *
 * @param {Object} result - Query result object
 * @returns {number} Number of records
 */
function getRecordCount(result) {
  if (!result || !result.records) {
    return 0;
  }

  if (Array.isArray(result.records)) {
    return result.records.length;
  }

  return 0;
}

// Export functions
module.exports = {
  safeChildRecords,
  safeFieldValue,
  validateSOQL,
  cleanSOQL,
  executeQuery,
  executeMultipleQueries,
  hasRecords,
  getRecordCount
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log(`
Usage: safe-query-executor.js <command> [options]

Commands:
  validate <query>         Validate SOQL query syntax
  clean <query>            Clean and fix SOQL query
  execute <org> <query>    Execute query with validation

Examples:
  node safe-query-executor.js validate "SELECT Id, Name FROM Account"
  node safe-query-executor.js clean "SELECT Id, Name, FROM Account"
  node safe-query-executor.js execute myorg "SELECT Id FROM Account LIMIT 5"
    `);
    process.exit(1);
  }

  const command = args[0];

  if (command === 'validate') {
    const query = args[1];
    const validation = validateSOQL(query);

    if (validation.valid) {
      console.log('\n✅ Query is valid\n');
    } else {
      console.log('\n❌ Query has errors:\n');
      validation.errors.forEach(err => console.log(`   - ${err}`));
      console.log('');
      process.exit(1);
    }

  } else if (command === 'clean') {
    const query = args[1];
    const cleaned = cleanSOQL(query);

    console.log('\n📝 Cleaned query:\n');
    console.log(cleaned);
    console.log('');

  } else if (command === 'execute') {
    const orgAlias = args[1];
    const query = args[2];

    try {
      const result = executeQuery(query, orgAlias);
      console.log(`\n✅ Query succeeded: ${result.records.length} records\n`);
      console.log(JSON.stringify(result.records, null, 2));
    } catch (error) {
      console.error(`\n❌ Query failed: ${error.message}\n`);
      process.exit(1);
    }

  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}
