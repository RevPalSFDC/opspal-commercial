#!/usr/bin/env node

/**
 * SOQL String Escaping Utilities
 *
 * Centralized SOQL string escaping to ensure consistent, secure query construction.
 *
 * IMPORTANT: This is the CANONICAL implementation for SOQL escaping across all agents.
 * DO NOT implement custom escaping elsewhere - always use this module.
 *
 * Escape Order (CRITICAL):
 * 1. Backslashes MUST be escaped FIRST
 * 2. Single quotes escaped SECOND
 *
 * Escaping in wrong order causes double-escaping bugs:
 *   Wrong: "O'Brian".replace(/'/g, "\\'").replace(/\\/g, "\\\\") => "O\\\\'Brian"
 *   Right: "O'Brian".replace(/\\/g, "\\\\").replace(/'/g, "\\'") => "O\\'Brian"
 *
 * Usage:
 *   const { escapeSoqlLiteral, escapeSoqlLike } = require('./soql-escape');
 *
 *   // For WHERE field = 'value'
 *   const safeValue = escapeSoqlLiteral(userInput);
 *   const query = `SELECT Id FROM Account WHERE Name = '${safeValue}'`;
 *
 *   // For LIKE patterns
 *   const safeName = escapeSoqlLike(userInput);
 *   const query = `SELECT Id FROM Account WHERE Name LIKE '%${safeName}%'`;
 */

/**
 * Escape a string for use in SOQL string literals.
 * Use this for values in WHERE clauses like: WHERE Field = 'value'
 *
 * @param {string|any} value - The value to escape
 * @returns {string} - Escaped string safe for SOQL
 *
 * @example
 * escapeSoqlLiteral("O'Reilly & Sons")  // => "O\\'Reilly & Sons"
 * escapeSoqlLiteral('Path\\to\\file')   // => "Path\\\\to\\\\file"
 */
function escapeSoqlLiteral(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value !== 'string') {
    return String(value);
  }

  // CRITICAL: Escape backslashes FIRST, then single quotes
  // This order prevents double-escaping issues
  return value
    .replace(/\\/g, '\\\\')  // Step 1: Escape backslashes
    .replace(/'/g, "\\'");   // Step 2: Escape single quotes
}

/**
 * Escape a string for use in SOQL LIKE patterns.
 * In addition to standard escaping, also escapes LIKE wildcards.
 * Use this for LIKE clauses: WHERE Field LIKE '%value%'
 *
 * @param {string|any} value - The value to escape
 * @returns {string} - Escaped string safe for SOQL LIKE patterns
 *
 * @example
 * escapeSoqlLike("50% off")     // => "50\\% off"
 * escapeSoqlLike("test_value")  // => "test\\_value"
 */
function escapeSoqlLike(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value !== 'string') {
    return String(value);
  }

  // First apply standard literal escaping
  let escaped = escapeSoqlLiteral(value);

  // Then escape LIKE wildcards: % and _
  return escaped
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

/**
 * Wrap a value in single quotes for SOQL.
 * Combines escaping and quoting in one step.
 *
 * @param {string|any} value - The value to escape and quote
 * @returns {string} - Quoted and escaped string
 *
 * @example
 * quoteSoqlLiteral("O'Reilly")  // => "'O\\'Reilly'"
 */
function quoteSoqlLiteral(value) {
  return `'${escapeSoqlLiteral(value)}'`;
}

/**
 * Escape an array of values and format as SOQL IN clause list.
 *
 * @param {Array<string>} values - Array of values to escape
 * @returns {string} - Comma-separated quoted values for IN clause
 *
 * @example
 * formatSoqlInList(["A", "B's", "C"])  // => "'A', 'B\\'s', 'C'"
 */
function formatSoqlInList(values) {
  if (!Array.isArray(values)) {
    return quoteSoqlLiteral(values);
  }

  return values.map(v => quoteSoqlLiteral(v)).join(', ');
}

/**
 * Validate that a string is safe for use as a SOQL identifier (field/object name).
 * SOQL identifiers must start with a letter and contain only alphanumeric characters and underscores.
 *
 * @param {string} identifier - The identifier to validate
 * @returns {boolean} - True if valid SOQL identifier
 *
 * @example
 * isValidSoqlIdentifier("Account")      // => true
 * isValidSoqlIdentifier("My_Field__c")  // => true
 * isValidSoqlIdentifier("123Field")     // => false
 * isValidSoqlIdentifier("Field Name")   // => false
 */
function isValidSoqlIdentifier(identifier) {
  if (typeof identifier !== 'string' || identifier.length === 0) {
    return false;
  }
  // Must start with letter, then alphanumeric/underscore only
  return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(identifier);
}

/**
 * Sanitize a potential SOQL identifier by removing invalid characters.
 * Useful for converting user input to valid field/object names.
 *
 * @param {string} input - The input to sanitize
 * @returns {string} - Sanitized identifier
 *
 * @example
 * sanitizeSoqlIdentifier("Field Name!")  // => "Field_Name"
 * sanitizeSoqlIdentifier("123Field")     // => "Field"
 */
function sanitizeSoqlIdentifier(input) {
  if (typeof input !== 'string') {
    return '';
  }

  // Replace spaces and special chars with underscores
  let sanitized = input.replace(/[^a-zA-Z0-9_]/g, '_');

  // Remove leading underscores and digits
  sanitized = sanitized.replace(/^[_0-9]+/, '');

  // Collapse multiple underscores
  sanitized = sanitized.replace(/_+/g, '_');

  // Remove trailing underscores
  sanitized = sanitized.replace(/_+$/, '');

  return sanitized || 'field';
}

// CLI interface for testing
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const value = args[1];

  if (!command) {
    console.log(`
SOQL Escape Utilities

Usage:
  node soql-escape.js literal <value>     Escape for string literal
  node soql-escape.js like <value>        Escape for LIKE pattern
  node soql-escape.js quote <value>       Escape and quote
  node soql-escape.js validate <name>     Validate identifier
  node soql-escape.js sanitize <name>     Sanitize identifier
  node soql-escape.js test                Run self-tests

Examples:
  node soql-escape.js literal "O'Reilly"
  node soql-escape.js like "50% off"
  node soql-escape.js quote "Test's Value"
`);
    process.exit(0);
  }

  switch (command) {
    case 'literal':
      console.log(escapeSoqlLiteral(value));
      break;
    case 'like':
      console.log(escapeSoqlLike(value));
      break;
    case 'quote':
      console.log(quoteSoqlLiteral(value));
      break;
    case 'validate':
      console.log(isValidSoqlIdentifier(value) ? 'Valid' : 'Invalid');
      break;
    case 'sanitize':
      console.log(sanitizeSoqlIdentifier(value));
      break;
    case 'test':
      runTests();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name, actual, expected) {
    if (actual === expected) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.log(`❌ ${name}`);
      console.log(`   Expected: ${JSON.stringify(expected)}`);
      console.log(`   Actual:   ${JSON.stringify(actual)}`);
      failed++;
    }
  }

  console.log('\n=== SOQL Escape Tests ===\n');

  // escapeSoqlLiteral tests
  test('literal: basic string', escapeSoqlLiteral('test'), 'test');
  test('literal: single quote', escapeSoqlLiteral("O'Reilly"), "O\\'Reilly");
  test('literal: backslash', escapeSoqlLiteral('path\\to'), 'path\\\\to');
  test('literal: both', escapeSoqlLiteral("O'\\Neil"), "O\\'\\\\Neil");
  test('literal: null', escapeSoqlLiteral(null), '');
  test('literal: number', escapeSoqlLiteral(123), '123');

  // escapeSoqlLike tests
  test('like: percent', escapeSoqlLike('50%'), '50\\%');
  test('like: underscore', escapeSoqlLike('test_val'), 'test\\_val');
  test('like: combined', escapeSoqlLike("O'Neil_50%"), "O\\'Neil\\_50\\%");

  // quoteSoqlLiteral tests
  test('quote: basic', quoteSoqlLiteral('test'), "'test'");
  test('quote: with quote', quoteSoqlLiteral("it's"), "'it\\'s'");

  // formatSoqlInList tests
  test('inList: array', formatSoqlInList(['A', "B's", 'C']), "'A', 'B\\'s', 'C'");
  test('inList: single', formatSoqlInList('test'), "'test'");

  // isValidSoqlIdentifier tests
  test('validate: valid', isValidSoqlIdentifier('Account'), true);
  test('validate: with underscore', isValidSoqlIdentifier('My_Field__c'), true);
  test('validate: starts with number', isValidSoqlIdentifier('123Field'), false);
  test('validate: has space', isValidSoqlIdentifier('Field Name'), false);
  test('validate: empty', isValidSoqlIdentifier(''), false);

  // sanitizeSoqlIdentifier tests
  test('sanitize: spaces', sanitizeSoqlIdentifier('Field Name'), 'Field_Name');
  test('sanitize: leading digits', sanitizeSoqlIdentifier('123Field'), 'Field');
  test('sanitize: special chars', sanitizeSoqlIdentifier('My@Field!'), 'My_Field');

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

module.exports = {
  escapeSoqlLiteral,
  escapeSoqlLike,
  quoteSoqlLiteral,
  formatSoqlInList,
  isValidSoqlIdentifier,
  sanitizeSoqlIdentifier
};
