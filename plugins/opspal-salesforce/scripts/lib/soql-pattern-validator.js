#!/usr/bin/env node
/**
 * SOQL Pattern Validator
 *
 * Pre-flight validation of SOQL query structure before execution.
 * Prevents common errors like missing aliases on aggregates, invalid field references,
 * and inconsistent jq parsing paths.
 *
 * @module soql-pattern-validator
 * @version 1.0.0
 * @created 2025-10-03
 */

const { execSync } = require('child_process');

/**
 * Common SOQL anti-patterns and their fixes
 */
const PATTERNS = {
  aggregateWithoutAlias: {
    regex: /\b(COUNT|SUM|AVG|MIN|MAX)\s*\([^)]*\)(?!\s+\w+)/gi,
    message: 'Aggregate functions should use explicit aliases for consistent jq parsing',
    severity: 'warning',
    fix: (match) => {
      const funcName = match.match(/\b(COUNT|SUM|AVG|MIN|MAX)/i)[1].toLowerCase();
      return `${match} ${funcName}_value`;
    }
  },

  countWithoutField: {
    regex: /\bCOUNT\s*\(\s*\)/gi,
    message: 'COUNT() should specify field: COUNT(Id) or COUNT(FieldName)',
    severity: 'error',
    fix: (match) => 'COUNT(Id) total_count'
  },

  picklistWithIsBlank: {
    regex: /ISBLANK\s*\(\s*\w+__c\s*\)/gi,
    message: 'ISBLANK() on picklist fields is invalid. Use: TEXT(field) = \'\'',
    severity: 'error',
    fix: (match) => {
      const field = match.match(/ISBLANK\s*\(\s*(\w+__c)\s*\)/i)[1];
      return `TEXT(${field}) = ''`;
    }
  },

  picklistWithIsNull: {
    regex: /ISNULL\s*\(\s*\w+__c\s*\)/gi,
    message: 'ISNULL() on picklist fields is invalid. Use: TEXT(field) = \'\'',
    severity: 'error',
    fix: (match) => {
      const field = match.match(/ISNULL\s*\(\s*(\w+__c)\s*\)/i)[1];
      return `TEXT(${field}) = ''`;
    }
  },

  missingFromClause: {
    regex: /^SELECT\s+.*?(?:WHERE|GROUP|ORDER|LIMIT)/i,
    message: 'Missing FROM clause',
    severity: 'error',
    fix: null // Cannot auto-fix
  },

  textareaInWhereClause: {
    regex: /WHERE\s+[^]*?\b(Description|Comments|Body|Notes|Solution|TextBody|Details)\s*(=|!=|<>|LIKE|IN\b|NOT\s+IN\b)/gi,
    message: 'Textarea/LongTextArea fields (Description, Comments, Body, Notes, etc.) cannot be filtered in WHERE clauses. Use SOSL FIND for text search or remove the filter.',
    severity: 'warning',
    fix: null // Cannot auto-fix without schema
  }
};

/**
 * Validate SOQL query structure
 *
 * @param {string} soql - The SOQL query to validate
 * @returns {Object} Validation result
 */
function validateQuery(soql) {
  const issues = [];
  const warnings = [];
  let suggestedFix = soql;

  // Check each pattern
  for (const [patternName, pattern] of Object.entries(PATTERNS)) {
    const matches = soql.match(pattern.regex);

    if (matches) {
      const issue = {
        pattern: patternName,
        message: pattern.message,
        severity: pattern.severity,
        matches: matches
      };

      if (pattern.severity === 'error') {
        issues.push(issue);
      } else {
        warnings.push(issue);
      }

      // Apply fix if available
      if (pattern.fix) {
        matches.forEach(match => {
          const replacement = pattern.fix(match);
          suggestedFix = suggestedFix.replace(match, replacement);
        });
      }
    }
  }

  // Check for SELECT and FROM presence
  if (!soql.match(/\bSELECT\b/i)) {
    issues.push({
      pattern: 'missingSelect',
      message: 'Query must start with SELECT',
      severity: 'error',
      matches: []
    });
  }

  if (!soql.match(/\bFROM\b/i)) {
    issues.push({
      pattern: 'missingFrom',
      message: 'Query must include FROM clause',
      severity: 'error',
      matches: []
    });
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    suggestedFix: issues.length > 0 ? suggestedFix : null
  };
}

/**
 * Get recommended jq path for query results
 *
 * @param {string} soql - The SOQL query
 * @returns {string} Recommended jq path
 */
function getRecommendedJqPath(soql) {
  // Check if it's an aggregate query
  const isAggregate = /\b(COUNT|SUM|AVG|MIN|MAX|GROUP\s+BY)\b/i.test(soql);

  if (!isAggregate) {
    return '.result.records[]';
  }

  // For aggregates, extract field names/aliases
  const selectMatch = soql.match(/SELECT\s+(.*?)\s+FROM/i);
  if (!selectMatch) return '.result.records[0]';

  const selectClause = selectMatch[1];
  const fields = selectClause.split(',').map(f => {
    const trimmed = f.trim();
    // Check for alias (field AS alias or field alias)
    const aliasMatch = trimmed.match(/\s+(?:AS\s+)?(\w+)$/i);
    if (aliasMatch) {
      return aliasMatch[1];
    }
    // Check for aggregate function
    const aggMatch = trimmed.match(/^(COUNT|SUM|AVG|MIN|MAX)\s*\(/i);
    if (aggMatch) {
      return 'expr0'; // Default Salesforce aggregate alias
    }
    // Simple field name
    return trimmed.split('.').pop();
  });

  if (fields.length === 1) {
    return `.result.records[0].${fields[0]}`;
  }

  return '.result.records[0]';
}

/**
 * Test connection and query execution
 *
 * @param {string} orgAlias - Salesforce org alias
 * @returns {Object} Connection test results
 */
function testConnection(orgAlias) {
  try {
    // Simple test query
    const testQuery = 'SELECT COUNT(Id) test_count FROM Account LIMIT 1';
    const result = execSync(
      `sf data query --query "${testQuery}" -o ${orgAlias} --json`,
      { encoding: 'utf-8' }
    );

    const parsed = JSON.parse(result);

    return {
      connected: parsed.status === 0,
      orgAlias,
      testQuery,
      result: parsed
    };
  } catch (error) {
    return {
      connected: false,
      orgAlias,
      error: error.message
    };
  }
}

/**
 * Suggest improvements for query
 *
 * @param {string} soql - The SOQL query
 * @returns {Object} Suggestions
 */
function suggestImprovements(soql) {
  const suggestions = [];

  // Check for SELECT *
  if (soql.includes('SELECT *')) {
    suggestions.push({
      type: 'performance',
      message: 'Avoid SELECT *. Specify only needed fields.',
      impact: 'Reduces data transfer and improves performance'
    });
  }

  // Check for missing WHERE with LIMIT
  if (soql.match(/\bLIMIT\b/i) && !soql.match(/\bWHERE\b/i)) {
    suggestions.push({
      type: 'best-practice',
      message: 'Consider adding WHERE clause for more predictable results',
      impact: 'LIMIT without WHERE returns arbitrary records'
    });
  }

  // Check for time-based filters
  if (!soql.match(/\b(CreatedDate|LastModifiedDate|LAST_N_DAYS|THIS_MONTH|THIS_YEAR)\b/i)) {
    suggestions.push({
      type: 'analysis',
      message: 'Consider adding time-based filter for recency analysis',
      impact: 'Helps distinguish historical vs current data'
    });
  }

  return suggestions;
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'test-connection') {
    const orgAlias = args[1];
    if (!orgAlias) {
      console.error('Usage: soql-pattern-validator.js test-connection <org-alias>');
      process.exit(1);
    }

    const result = testConnection(orgAlias);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.connected ? 0 : 1);
  }

  if (command === 'validate') {
    const soql = args[1];
    if (!soql) {
      console.error('Usage: soql-pattern-validator.js validate "<soql-query>"');
      process.exit(1);
    }

    const validation = validateQuery(soql);
    const jqPath = getRecommendedJqPath(soql);
    const suggestions = suggestImprovements(soql);

    console.log(JSON.stringify({
      ...validation,
      recommendedJqPath: jqPath,
      suggestions
    }, null, 2));

    process.exit(validation.valid ? 0 : 1);
  }

  console.error('Usage:');
  console.error('  soql-pattern-validator.js test-connection <org-alias>');
  console.error('  soql-pattern-validator.js validate "<soql-query>"');
  process.exit(1);
}

module.exports = {
  validateQuery,
  getRecommendedJqPath,
  testConnection,
  suggestImprovements
};
