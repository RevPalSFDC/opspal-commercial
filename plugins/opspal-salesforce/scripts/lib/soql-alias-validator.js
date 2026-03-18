/**
 * SOQL Alias Validator
 *
 * Validates SOQL expressions for common issues like invalid field aliases,
 * reserved word conflicts, and aggregate function requirements.
 *
 * Related reflections: 43f8e970
 * ROI: $3,000/yr
 *
 * @module soql-alias-validator
 */

// Reserved SOQL keywords that cannot be used as aliases
const RESERVED_KEYWORDS = new Set([
  'and', 'as', 'asc', 'by', 'cube', 'desc', 'else', 'end', 'excludes',
  'false', 'first', 'for', 'from', 'group', 'having', 'in', 'includes',
  'last', 'like', 'limit', 'not', 'null', 'nulls', 'offset', 'or', 'order',
  'rollup', 'select', 'then', 'true', 'typeof', 'update', 'using', 'view',
  'when', 'where', 'with', 'calendar_month', 'calendar_quarter', 'calendar_year',
  'day_in_month', 'day_in_week', 'day_in_year', 'day_only', 'fiscal_month',
  'fiscal_quarter', 'fiscal_year', 'hour_in_day', 'week_in_month', 'week_in_year'
]);

// Aggregate functions that require aliases
const AGGREGATE_FUNCTIONS = ['count', 'sum', 'avg', 'min', 'max', 'count_distinct'];

// Common objects that are mistaken for fields
const COMMON_OBJECT_NAMES = new Set([
  'account', 'contact', 'lead', 'opportunity', 'case', 'task', 'event',
  'campaign', 'user', 'product', 'pricebook', 'quote', 'order', 'contract'
]);

/**
 * Parse SELECT clause to extract fields and aliases
 * @param {string} selectClause - The SELECT portion of the query
 * @returns {Object[]} Array of field definitions
 */
function parseSelectClause(selectClause) {
  const fields = [];

  // Handle nested parentheses (subqueries)
  let depth = 0;
  let currentField = '';

  for (let i = 0; i < selectClause.length; i++) {
    const char = selectClause[i];

    if (char === '(') {
      depth++;
      currentField += char;
    } else if (char === ')') {
      depth--;
      currentField += char;
    } else if (char === ',' && depth === 0) {
      if (currentField.trim()) {
        fields.push(parseField(currentField.trim()));
      }
      currentField = '';
    } else {
      currentField += char;
    }
  }

  // Don't forget the last field
  if (currentField.trim()) {
    fields.push(parseField(currentField.trim()));
  }

  return fields;
}

/**
 * Parse a single field expression
 * @param {string} fieldExpr - Field expression to parse
 * @returns {Object} Parsed field definition
 */
function parseField(fieldExpr) {
  const result = {
    raw: fieldExpr,
    field: null,
    alias: null,
    isAggregate: false,
    isSubquery: false,
    aggregateFunction: null
  };

  // Check for subquery
  if (fieldExpr.trim().startsWith('(')) {
    result.isSubquery = true;
    return result;
  }

  // Check for aggregate function
  const aggregateMatch = fieldExpr.match(/^\s*(COUNT|SUM|AVG|MIN|MAX|COUNT_DISTINCT)\s*\(/i);
  if (aggregateMatch) {
    result.isAggregate = true;
    result.aggregateFunction = aggregateMatch[1].toUpperCase();
  }

  // Check for alias (field AS alias or field alias)
  const asMatch = fieldExpr.match(/(.+?)\s+AS\s+(\w+)\s*$/i);
  const implicitMatch = fieldExpr.match(/(.+?)\s+(\w+)\s*$/);

  if (asMatch) {
    result.field = asMatch[1].trim();
    result.alias = asMatch[2].trim();
  } else if (implicitMatch) {
    // Allow implicit aliases for aggregates too (e.g., COUNT(Id) total)
    const lastWord = implicitMatch[2].trim();
    if (!lastWord.includes('(')) {
      result.field = implicitMatch[1].trim();
      result.alias = lastWord;
    } else {
      result.field = fieldExpr;
    }
  } else {
    result.field = fieldExpr;
  }

  return result;
}

/**
 * Validate a SOQL query
 * @param {string} query - SOQL query to validate
 * @returns {Object} Validation result
 */
function validateSOQL(query) {
  const result = {
    valid: true,
    query,
    issues: [],
    warnings: [],
    suggestions: []
  };

  if (!query || typeof query !== 'string') {
    result.valid = false;
    result.issues.push({
      type: 'invalid_query',
      message: 'Query is empty or not a string'
    });
    return result;
  }

  const queryUpper = query.toUpperCase();

  // Extract SELECT clause
  const selectMatch = query.match(/SELECT\s+([\s\S]+?)\s+FROM/i);
  if (!selectMatch) {
    result.valid = false;
    result.issues.push({
      type: 'missing_from',
      message: 'Query must have SELECT ... FROM structure'
    });
    return result;
  }

  const selectClause = selectMatch[1];
  const fields = parseSelectClause(selectClause);

  // Track aliases for duplicates
  const usedAliases = new Map();

  for (const field of fields) {
    // Check for reserved keyword aliases
    if (field.alias && RESERVED_KEYWORDS.has(field.alias.toLowerCase())) {
      result.valid = false;
      result.issues.push({
        type: 'reserved_keyword',
        message: `Alias '${field.alias}' is a reserved SOQL keyword`,
        field: field.raw,
        suggestion: `Use a different alias like '${field.alias}_value' or '${field.alias}Alias'`
      });
    }

    // Check for duplicate aliases
    if (field.alias) {
      const aliasLower = field.alias.toLowerCase();
      if (usedAliases.has(aliasLower)) {
        result.valid = false;
        result.issues.push({
          type: 'duplicate_alias',
          message: `Alias '${field.alias}' is used multiple times`,
          field: field.raw,
          previousField: usedAliases.get(aliasLower)
        });
      } else {
        usedAliases.set(aliasLower, field.raw);
      }
    }

    // Check aggregate functions without GROUP BY
    if (field.isAggregate && !queryUpper.includes('GROUP BY')) {
      // COUNT(*) or COUNT(Id) without other fields is valid
      const hasNonAggregateFields = fields.some(f => !f.isAggregate && !f.isSubquery);
      if (hasNonAggregateFields) {
        result.valid = false;
        result.issues.push({
          type: 'missing_group_by',
          message: `Aggregate function ${field.aggregateFunction}() used with non-aggregate fields but no GROUP BY`,
          field: field.raw,
          suggestion: 'Add GROUP BY clause or remove non-aggregate fields'
        });
      }
    }

    // Check aggregate functions that should have aliases for usability
    if (field.isAggregate && !field.alias) {
      result.suggestions.push({
        type: 'aggregate_without_alias',
        message: `Aggregate function ${field.aggregateFunction}() has no alias`,
        field: field.raw,
        suggestion: `Add alias: ${field.raw} AS ${field.aggregateFunction.toLowerCase()}_result`
      });
    }

    // Warn about common object names used as field aliases
    if (field.alias && COMMON_OBJECT_NAMES.has(field.alias.toLowerCase())) {
      result.warnings.push({
        type: 'object_name_alias',
        message: `Alias '${field.alias}' is a Salesforce object name, which may cause confusion`,
        field: field.raw,
        suggestion: `Consider a more descriptive alias like '${field.alias}_field'`
      });
    }

    // Check for self-referencing alias (e.g., SELECT Name Name)
    if (field.alias && field.field) {
      const fieldName = field.field.split('.').pop();
      if (fieldName && field.alias.toLowerCase() === fieldName.toLowerCase()) {
        result.valid = false;
        result.issues.push({
          type: 'self_alias',
          message: `Alias '${field.alias}' duplicates the field name`,
          field: field.raw,
          suggestion: `Use a distinct alias like '${field.alias}_value'`
        });
      }
    }
  }

  // Check for common mistakes in WHERE clause
  const whereMatch = query.match(/WHERE\s+([\s\S]+?)(?:GROUP BY|ORDER BY|LIMIT|OFFSET|FOR|$)/i);
  if (whereMatch) {
    const whereClause = whereMatch[1];

    // Check for = null (should be = null is valid, but LIKE null is not)
    if (/LIKE\s+null/i.test(whereClause)) {
      result.valid = false;
      result.issues.push({
        type: 'like_null',
        message: "LIKE operator cannot be used with null",
        suggestion: 'Use = null or != null instead'
      });
    }

    // Check for missing quotes around string literals
    const missingQuotes = whereClause.match(/=\s+([A-Za-z][A-Za-z0-9_]*)\s*(?:AND|OR|$)/gi);
    if (missingQuotes) {
      for (const match of missingQuotes) {
        const value = match.match(/=\s+([A-Za-z][A-Za-z0-9_]*)/i);
        if (value && !['true', 'false', 'null', 'today', 'yesterday', 'tomorrow',
            'last_n_days', 'next_n_days', 'this_week', 'last_week', 'next_week',
            'this_month', 'last_month', 'next_month', 'this_quarter', 'last_quarter',
            'next_quarter', 'this_year', 'last_year', 'next_year'].includes(value[1].toLowerCase())) {
          result.warnings.push({
            type: 'possible_missing_quotes',
            message: `Value '${value[1]}' may need quotes if it's a string literal`,
            suggestion: `Use '${value[1]}' (with quotes) for string values`
          });
        }
      }
    }
  }

  // Check GROUP BY clause
  const groupByMatch = query.match(/GROUP BY\s+([\s\S]+?)(?:HAVING|ORDER BY|LIMIT|OFFSET|FOR|$)/i);
  if (groupByMatch) {
    const groupByFields = groupByMatch[1].split(',').map(f => f.trim().toLowerCase());

    // Verify all non-aggregate fields in SELECT are in GROUP BY
    for (const field of fields) {
      if (!field.isAggregate && !field.isSubquery && field.field) {
        const fieldName = field.field.toLowerCase().split('.').pop();
        const inGroupBy = groupByFields.some(g => g.includes(fieldName));

        if (!inGroupBy) {
          result.warnings.push({
            type: 'field_not_in_group_by',
            message: `Field '${field.field}' is in SELECT but not in GROUP BY`,
            suggestion: `Add '${field.field}' to GROUP BY clause`
          });
        }
      }
    }
  }

  // Check ORDER BY with NULLS FIRST/LAST
  if (queryUpper.includes('NULLS FIRST') || queryUpper.includes('NULLS LAST')) {
    // Valid, but ensure it's after ORDER BY
    if (!queryUpper.includes('ORDER BY')) {
      result.valid = false;
      result.issues.push({
        type: 'nulls_without_order_by',
        message: 'NULLS FIRST/LAST requires ORDER BY clause'
      });
    }
  }

  return result;
}

/**
 * Fix common SOQL issues
 * @param {string} query - SOQL query to fix
 * @param {Object} options - Fix options
 * @returns {Object} Fixed query and changes made
 */
function fixSOQL(query, options = {}) {
  const result = {
    original: query,
    fixedQuery: query,
    fixed: query,
    changes: []
  };

  let fixed = query;

  const selectMatch = query.match(/SELECT\s+([\s\S]+?)\s+FROM/i);
  if (selectMatch) {
    const selectClause = selectMatch[1];
    const fields = parseSelectClause(selectClause);
    const aliasCounts = new Map();
    const aliasOccurrences = new Map();

    for (const field of fields) {
      if (!field.alias) continue;
      const key = field.alias.toLowerCase();
      aliasOccurrences.set(key, (aliasOccurrences.get(key) || 0) + 1);
    }

    const updatedFields = fields.map(field => {
      if (!field.alias) {
        return field.raw;
      }

      const aliasLower = field.alias.toLowerCase();
      let newAlias = field.alias;
      const duplicateAlias = aliasOccurrences.get(aliasLower) > 1;

      // Reserved keyword aliases
      if (RESERVED_KEYWORDS.has(aliasLower)) {
        if (field.isAggregate && field.aggregateFunction) {
          const fn = field.aggregateFunction.toLowerCase();
          newAlias = fn === 'count' ? `${aliasLower}_count` : `${aliasLower}_${fn}`;
        } else {
          newAlias = `${aliasLower}_value`;
        }
        result.changes.push({
          type: 'renamed_reserved_alias',
          from: field.alias,
          to: newAlias
        });
      }

      // Self-referencing aliases
      if (field.field) {
        const fieldName = field.field.split('.').pop();
        if (fieldName && fieldName.toLowerCase() === newAlias.toLowerCase()) {
          const prevAlias = newAlias;
          newAlias = `${newAlias.toLowerCase()}_value`;
          result.changes.push({
            type: 'fixed_self_alias',
            from: prevAlias,
            to: newAlias
          });
        }
      }

      // Normalize duplicate aliases by using field-based alias
      if (duplicateAlias) {
        const fieldName = field.field ? field.field.split('.').pop() : null;
        const base = fieldName ? fieldName.replace(/[^A-Za-z0-9_]/g, '').toLowerCase() : 'field';
        const prevAlias = newAlias;
        newAlias = `${base}_${aliasLower}`;
        result.changes.push({
          type: 'fixed_duplicate_alias',
          from: prevAlias,
          to: newAlias
        });
      }

      // Duplicate aliases
      const key = newAlias.toLowerCase();
      const count = aliasCounts.get(key) || 0;
      aliasCounts.set(key, count + 1);
      if (count > 0) {
        const prevAlias = newAlias;
        newAlias = `${newAlias}_${count + 1}`;
        result.changes.push({
          type: 'fixed_duplicate_alias',
          from: prevAlias,
          to: newAlias
        });
      }

      if (newAlias === field.alias) {
        return field.raw;
      }

      // Replace alias in the raw field expression
      if (/\s+AS\s+\w+\s*$/i.test(field.raw)) {
        return field.raw.replace(/\s+AS\s+\w+\s*$/i, ` AS ${newAlias}`);
      }

      return field.raw.replace(/\s+\w+\s*$/i, ` ${newAlias}`);
    });

    const newSelect = updatedFields.join(', ');
    fixed = query.replace(selectClause, newSelect);
  }

  // Fix LIKE null
  const likeFixed = fixed.replace(/LIKE\s+null/gi, '= null');
  if (likeFixed !== fixed) {
    fixed = likeFixed;
    result.changes.push({
      type: 'fixed_like_null',
      from: 'LIKE null',
      to: '= null'
    });
  }

  result.fixedQuery = fixed;
  result.fixed = fixed;
  result.fixesApplied = result.changes.length;
  return result;
}

/**
 * Generate suggestions for query optimization
 * @param {string} query - SOQL query to analyze
 * @returns {string[]} Array of optimization suggestions
 */
function suggestOptimizations(query) {
  const suggestions = [];
  const queryUpper = query.toUpperCase();

  // Suggest LIMIT for large result sets
  if (!queryUpper.includes('LIMIT')) {
    suggestions.push({
      type: 'add_limit',
      message: 'Consider adding LIMIT clause to prevent large result sets'
    });
  }

  // Suggest indexed fields in WHERE
  if (queryUpper.includes('WHERE')) {
    const commonIndexedFields = ['Id', 'Name', 'CreatedDate', 'LastModifiedDate', 'OwnerId'];
    const hasIndexedField = commonIndexedFields.some(f => queryUpper.includes(f.toUpperCase()));
    if (!hasIndexedField) {
      suggestions.push({
        type: 'use_indexed_fields',
        message: 'Consider using indexed fields (Id, Name, CreatedDate, etc.) in WHERE clause for better performance'
      });
    }
  }

  // Warn about leading wildcards
  if (query.includes("LIKE '%") || query.includes('LIKE "%')) {
    suggestions.push({
      type: 'leading_wildcard',
      message: "Leading wildcards (LIKE '%value') cannot use indexes and may be slow"
    });
  }

  // Suggest specific fields instead of *
  if (query.includes('SELECT *') || query.match(/SELECT\s+\*/i)) {
    suggestions.push({
      type: 'avoid_select_star',
      message: 'Specify exact fields instead of SELECT * for better performance'
    });
  }

  // Check for NOT IN with large lists
  const notInMatch = query.match(/NOT\s+IN\s*\([^)]+\)/gi);
  if (notInMatch && notInMatch[0].length > 200) {
    suggestions.push({
      type: 'large_not_in',
      message: 'Large NOT IN lists can be slow - consider alternative approaches'
    });
  }

  return { suggestions };
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'validate':
      if (!args[1]) {
        console.error('Usage: soql-alias-validator.js validate "<query>"');
        process.exit(1);
      }
      const query = args.slice(1).join(' ');
      const result = validateSOQL(query);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.valid ? 0 : 1);
      break;

    case 'fix':
      if (!args[1]) {
        console.error('Usage: soql-alias-validator.js fix "<query>"');
        process.exit(1);
      }
      const queryToFix = args.slice(1).join(' ');
      const fixResult = fixSOQL(queryToFix);
      console.log(JSON.stringify(fixResult, null, 2));
      break;

    case 'optimize':
      if (!args[1]) {
        console.error('Usage: soql-alias-validator.js optimize "<query>"');
        process.exit(1);
      }
      const queryToOptimize = args.slice(1).join(' ');
      const suggestionsResult = suggestOptimizations(queryToOptimize);
      console.log(JSON.stringify(suggestionsResult, null, 2));
      break;

    default:
      console.log(`SOQL Alias Validator

Usage:
  soql-alias-validator.js validate "<query>"  Validate SOQL query
  soql-alias-validator.js fix "<query>"       Auto-fix common issues
  soql-alias-validator.js optimize "<query>"  Get optimization suggestions

Checks:
  - Reserved keyword conflicts in aliases
  - Duplicate aliases
  - Aggregate functions without GROUP BY
  - Missing aliases on aggregate functions
  - LIKE null (invalid)
  - Missing quotes on string literals
  - Fields in SELECT but not GROUP BY

Examples:
  # Validate a query
  node soql-alias-validator.js validate "SELECT COUNT(Id) AS count FROM Account"

  # Fix issues
  node soql-alias-validator.js fix "SELECT Name AS select FROM Account"

  # Get optimization tips
  node soql-alias-validator.js optimize "SELECT * FROM Account WHERE Type LIKE '%Partner%'"
`);
  }
}

module.exports = {
  RESERVED_KEYWORDS,
  AGGREGATE_FUNCTIONS,
  parseSelectClause,
  parseField,
  validateSOQL,
  fixSOQL,
  suggestOptimizations
};
