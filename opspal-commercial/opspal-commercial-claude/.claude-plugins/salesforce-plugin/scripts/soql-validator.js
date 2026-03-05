#!/usr/bin/env node

/**
 * SOQL Validation Pre-Processor
 * 
 * Purpose: Validates SOQL queries before execution to prevent common failures
 * Catches issues that would cause runtime errors and suggests fixes
 */

const fs = require('fs').promises;
const path = require('path');

class SOQLValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.suggestions = [];
    this.initializeRules();
  }

  initializeRules() {
    // Known unsupported functions
    this.unsupportedFunctions = [
      { pattern: /COUNT\s*\(\s*DISTINCT/gi, name: 'COUNT(DISTINCT)', severity: 'ERROR' },
      { pattern: /\bCASE\s+WHEN.*?END\s*\)/gis, name: 'CASE in aggregation', severity: 'ERROR' },
      { pattern: /DATEADD\s*\(/gi, name: 'DATEADD', severity: 'ERROR' },
      { pattern: /DATEDIFF\s*\(/gi, name: 'DATEDIFF', severity: 'ERROR' },
      { pattern: /DATE_ADD\s*\(/gi, name: 'DATE_ADD', severity: 'ERROR' },
      { pattern: /DATE_SUB\s*\(/gi, name: 'DATE_SUB', severity: 'ERROR' },
      { pattern: /\bPIVOT\s/gi, name: 'PIVOT', severity: 'ERROR' },
      { pattern: /\bUNPIVOT\s/gi, name: 'UNPIVOT', severity: 'ERROR' },
      { pattern: /\bWITH\s+\w+\s+AS\s*\(/gi, name: 'CTE (WITH)', severity: 'ERROR' },
      { pattern: /\bUNION\s/gi, name: 'UNION', severity: 'ERROR' },
      { pattern: /\bINTERSECT\s/gi, name: 'INTERSECT', severity: 'ERROR' },
      { pattern: /\bEXCEPT\s/gi, name: 'EXCEPT', severity: 'ERROR' },
      { pattern: /\bCONNECT\s+BY/gi, name: 'CONNECT BY', severity: 'ERROR' }
    ];

    // Common syntax issues
    this.syntaxRules = [
      {
        name: 'Quoted dates',
        pattern: /'\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2})?'/g,
        severity: 'ERROR',
        fix: (match) => match.replace(/'/g, ''),
        message: 'Date values should not be quoted in SOQL'
      },
      {
        name: 'Reserved keyword alias',
        pattern: /\b(COUNT|SUM|AVG|MIN|MAX)\s*\([^)]+\)\s+(count|sum|avg|min|max|group|order|limit|offset)\b/gi,
        severity: 'ERROR',
        message: 'Using reserved keyword as alias'
      },
      {
        name: 'Escaped operators',
        pattern: /\\[!=<>]/g,
        severity: 'WARNING',
        fix: (match) => match.replace(/\\/g, ''),
        message: 'Escaped operators detected (bash escape issue)'
      },
      {
        name: 'Missing FROM clause',
        pattern: /SELECT\s+[\w\s,.*()]+(?!.*\bFROM\b)/gi,
        severity: 'ERROR',
        message: 'SELECT statement missing FROM clause'
      }
    ];

    // Field and object validation patterns
    this.fieldPatterns = [
      {
        name: 'Invalid field reference',
        pattern: /\b\w+\.\w+\.\w+\.\w+/g,
        severity: 'WARNING',
        message: 'Relationship traversal limited to 5 levels in SOQL'
      },
      {
        name: 'Missing field alias in aggregation',
        pattern: /\b(COUNT|SUM|AVG|MIN|MAX)\s*\([^)]+\)(?!\s+\w+)(?=\s*,|\s*FROM)/gi,
        severity: 'WARNING',
        message: 'Aggregate function without alias'
      }
    ];
  }

  /**
   * Main validation method
   */
  async validate(query) {
    this.errors = [];
    this.warnings = [];
    this.suggestions = [];

    // Check for unsupported functions
    this.checkUnsupportedFunctions(query);

    // Check syntax issues
    this.checkSyntaxIssues(query);

    // Check nesting level
    this.checkNestingLevel(query);

    // Check field patterns
    this.checkFieldPatterns(query);

    // Check date literals
    this.checkDateLiterals(query);

    // Check governor limit risks
    this.checkGovernorLimits(query);

    // Generate suggestions based on errors
    this.generateSuggestions();

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      suggestions: this.suggestions,
      fixedQuery: this.attemptAutoFix(query)
    };
  }

  /**
   * Check for unsupported functions
   */
  checkUnsupportedFunctions(query) {
    for (const func of this.unsupportedFunctions) {
      if (func.pattern.test(query)) {
        this.errors.push({
          type: 'UNSUPPORTED_FUNCTION',
          name: func.name,
          message: `${func.name} is not supported in SOQL`,
          position: query.search(func.pattern)
        });
      }
      // Reset regex lastIndex
      func.pattern.lastIndex = 0;
    }
  }

  /**
   * Check for syntax issues
   */
  checkSyntaxIssues(query) {
    for (const rule of this.syntaxRules) {
      const matches = [...query.matchAll(rule.pattern)];
      if (matches.length > 0) {
        const issue = {
          type: 'SYNTAX_ERROR',
          name: rule.name,
          message: rule.message,
          matches: matches.map(m => m[0])
        };

        if (rule.severity === 'ERROR') {
          this.errors.push(issue);
        } else {
          this.warnings.push(issue);
        }

        if (rule.fix) {
          this.suggestions.push({
            type: 'AUTO_FIX',
            description: `Auto-fix available for ${rule.name}`,
            fix: rule.fix
          });
        }
      }
    }
  }

  /**
   * Check query nesting level
   */
  checkNestingLevel(query) {
    let maxLevel = 0;
    let currentLevel = 0;
    
    for (let i = 0; i < query.length; i++) {
      if (query.substring(i, i + 6).toUpperCase() === 'SELECT') {
        currentLevel++;
        maxLevel = Math.max(maxLevel, currentLevel);
      } else if (query[i] === ')' && query.substring(Math.max(0, i - 10), i).includes('FROM')) {
        currentLevel = Math.max(0, currentLevel - 1);
      }
    }

    if (maxLevel > 2) {
      this.errors.push({
        type: 'NESTING_LIMIT',
        message: `Query nesting level (${maxLevel}) exceeds maximum of 2`,
        level: maxLevel
      });
    } else if (maxLevel === 2) {
      this.warnings.push({
        type: 'NESTING_WARNING',
        message: 'Query uses maximum nesting level (2)',
        level: maxLevel
      });
    }
  }

  /**
   * Check field patterns
   */
  checkFieldPatterns(query) {
    for (const pattern of this.fieldPatterns) {
      const matches = [...query.matchAll(pattern.pattern)];
      if (matches.length > 0) {
        this.warnings.push({
          type: 'FIELD_PATTERN',
          name: pattern.name,
          message: pattern.message,
          matches: matches.map(m => m[0])
        });
      }
    }
  }

  /**
   * Check date literal usage
   */
  checkDateLiterals(query) {
    // Check for proper date literal format
    const dateLiteralPattern = /\b(TODAY|YESTERDAY|TOMORROW|THIS_WEEK|LAST_WEEK|NEXT_WEEK|THIS_MONTH|LAST_MONTH|NEXT_MONTH|THIS_QUARTER|LAST_QUARTER|NEXT_QUARTER|THIS_YEAR|LAST_YEAR|NEXT_YEAR|LAST_N_DAYS:\d+|NEXT_N_DAYS:\d+|LAST_N_MONTHS:\d+|NEXT_N_MONTHS:\d+|LAST_N_YEARS:\d+|NEXT_N_YEARS:\d+)\b/g;
    
    const dateLiterals = [...query.matchAll(dateLiteralPattern)];
    if (dateLiterals.length > 0) {
      this.suggestions.push({
        type: 'DATE_LITERALS',
        description: 'Query uses date literals correctly',
        literals: dateLiterals.map(m => m[0])
      });
    }

    // Check for hardcoded dates that could use literals
    const hardcodedDatePattern = /\b\d{4}-\d{2}-\d{2}\b/g;
    const hardcodedDates = [...query.matchAll(hardcodedDatePattern)];
    if (hardcodedDates.length > 0) {
      this.warnings.push({
        type: 'HARDCODED_DATES',
        message: 'Consider using date literals instead of hardcoded dates',
        dates: hardcodedDates.map(m => m[0])
      });
    }
  }

  /**
   * Check for governor limit risks
   */
  checkGovernorLimits(query) {
    // Check for missing WHERE clause (could return too many records)
    if (!/\bWHERE\b/i.test(query) && /\bFROM\b/i.test(query)) {
      this.warnings.push({
        type: 'GOVERNOR_LIMIT_RISK',
        message: 'Query without WHERE clause may hit governor limits',
        suggestion: 'Add WHERE clause or LIMIT to restrict results'
      });
    }

    // Check for missing LIMIT on queries without WHERE
    if (!/\bWHERE\b/i.test(query) && !/\bLIMIT\b/i.test(query) && /\bFROM\b/i.test(query)) {
      this.warnings.push({
        type: 'GOVERNOR_LIMIT_RISK',
        message: 'Query without WHERE or LIMIT clause',
        suggestion: 'Add LIMIT to prevent returning too many records'
      });
    }

    // Check for IN clause with potential for large lists
    const inClausePattern = /\bIN\s*\(\s*:[^)]+\)/gi;
    if (inClausePattern.test(query)) {
      this.warnings.push({
        type: 'GOVERNOR_LIMIT_RISK',
        message: 'IN clause with bind variable - ensure list size < 50,000',
        suggestion: 'Consider chunking large lists'
      });
    }
  }

  /**
   * Generate suggestions based on errors found
   */
  generateSuggestions() {
    // Suggestions for COUNT(DISTINCT)
    if (this.errors.some(e => e.name === 'COUNT(DISTINCT)')) {
      this.suggestions.push({
        type: 'ALTERNATIVE',
        for: 'COUNT(DISTINCT)',
        options: [
          'Use GROUP BY and count results',
          'Use Set<> in Apex to get unique values',
          'Create a formula field for uniqueness'
        ]
      });
    }

    // Suggestions for CASE in aggregation
    if (this.errors.some(e => e.name === 'CASE in aggregation')) {
      this.suggestions.push({
        type: 'ALTERNATIVE',
        for: 'CASE in aggregation',
        options: [
          'Create formula fields for conditions',
          'Use multiple queries with WHERE clauses',
          'Process conditional logic in Apex'
        ]
      });
    }

    // Suggestions for date functions
    if (this.errors.some(e => e.name === 'DATEADD' || e.name === 'DATEDIFF')) {
      this.suggestions.push({
        type: 'ALTERNATIVE',
        for: 'Date calculations',
        options: [
          'Use date literals (LAST_N_DAYS, NEXT_N_MONTHS)',
          'Create formula fields for date calculations',
          'Calculate dates in Apex before querying'
        ]
      });
    }
  }

  /**
   * Attempt to auto-fix common issues
   */
  attemptAutoFix(query) {
    let fixed = query;

    // Fix quoted dates
    fixed = fixed.replace(/'\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2})?'/g, (match) => {
      return match.replace(/'/g, '');
    });

    // Fix escaped operators
    fixed = fixed.replace(/\\[!=<>]/g, (match) => {
      return match.replace(/\\/g, '');
    });

    // Fix reserved keyword aliases
    fixed = fixed.replace(/\b(COUNT|SUM|AVG|MIN|MAX)\s*\(([^)]+)\)\s+(count|sum|avg|min|max)\b/gi, 
      (match, func, field, alias) => {
        return `${func}(${field}) ${alias}Value`;
      });

    return fixed;
  }

  /**
   * Format validation report
   */
  formatReport(result) {
    const lines = [];
    
    lines.push('=== SOQL VALIDATION REPORT ===\n');
    
    if (result.valid) {
      lines.push('✅ Query appears to be valid\n');
    } else {
      lines.push('❌ Query has errors that will cause failure\n');
    }

    if (result.errors.length > 0) {
      lines.push('\n🔴 ERRORS (will cause query to fail):');
      result.errors.forEach(error => {
        lines.push(`  - ${error.message}`);
        if (error.matches) {
          lines.push(`    Found: ${error.matches.join(', ')}`);
        }
      });
    }

    if (result.warnings.length > 0) {
      lines.push('\n🟡 WARNINGS (may cause issues):');
      result.warnings.forEach(warning => {
        lines.push(`  - ${warning.message}`);
        if (warning.matches) {
          lines.push(`    Found: ${warning.matches.join(', ')}`);
        }
      });
    }

    if (result.suggestions.length > 0) {
      lines.push('\n💡 SUGGESTIONS:');
      result.suggestions.forEach(suggestion => {
        if (suggestion.type === 'ALTERNATIVE') {
          lines.push(`  Alternative for ${suggestion.for}:`);
          suggestion.options.forEach(opt => {
            lines.push(`    • ${opt}`);
          });
        } else {
          lines.push(`  - ${suggestion.description}`);
        }
      });
    }

    if (result.fixedQuery && result.fixedQuery !== result.originalQuery) {
      lines.push('\n🔧 AUTO-FIXED QUERY:');
      lines.push(result.fixedQuery);
    }

    return lines.join('\n');
  }
}

// CLI interface
async function main() {
  const validator = new SOQLValidator();
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('SOQL Validator - Pre-execution Query Validation');
    console.log('\nUsage:');
    console.log('  soql-validator.js "YOUR QUERY"');
    console.log('  soql-validator.js --file query.sql');
    console.log('  soql-validator.js --fix "YOUR QUERY"');
    console.log('  soql-validator.js --json "YOUR QUERY"');
    console.log('\nValidates:');
    console.log('  - Unsupported functions (COUNT DISTINCT, CASE, etc.)');
    console.log('  - Syntax errors (quoted dates, reserved keywords)');
    console.log('  - Nesting levels (max 2)');
    console.log('  - Governor limit risks');
    process.exit(0);
  }

  let query = '';
  let outputJson = false;
  let autoFix = false;

  if (args[0] === '--file') {
    query = await fs.readFile(args[1], 'utf-8');
  } else if (args[0] === '--json') {
    outputJson = true;
    query = args.slice(1).join(' ');
  } else if (args[0] === '--fix') {
    autoFix = true;
    query = args.slice(1).join(' ');
  } else {
    query = args.join(' ');
  }

  const result = await validator.validate(query);
  result.originalQuery = query;

  if (outputJson) {
    console.log(JSON.stringify(result, null, 2));
  } else if (autoFix && result.fixedQuery) {
    console.log(result.fixedQuery);
  } else {
    console.log(validator.formatReport(result));
  }

  // Exit with error code if validation failed
  process.exit(result.valid ? 0 : 1);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = SOQLValidator;