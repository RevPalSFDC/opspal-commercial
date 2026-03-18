#!/usr/bin/env node

/**
 * SOQL Query Rewriter
 * 
 * Purpose: Automatically rewrites SOQL queries to work around Salesforce limitations
 * Handles common failure patterns:
 * - CASE statements in aggregations
 * - COUNT(DISTINCT) operations
 * - Complex nested queries
 * - Date calculation functions
 */

const fs = require('fs').promises;
const path = require('path');

class SOQLQueryRewriter {
  constructor() {
    this.rewriteRules = [];
    this.warnings = [];
    this.suggestions = [];
    this.initializeRules();
  }

  initializeRules() {
    // Rule 1: CASE statements in aggregations
    this.rewriteRules.push({
      name: 'CASE_IN_AGGREGATION',
      pattern: /COUNT\s*\(\s*CASE\s+WHEN.*?END\s*\)/gis,
      description: 'CASE statements not supported in COUNT aggregations',
      rewrite: this.rewriteCaseInCount.bind(this)
    });

    // Rule 2: COUNT(DISTINCT) operations
    this.rewriteRules.push({
      name: 'COUNT_DISTINCT',
      pattern: /COUNT\s*\(\s*DISTINCT\s+(\w+(?:\.\w+)?)\s*\)/gi,
      description: 'COUNT(DISTINCT) not supported in SOQL',
      rewrite: this.rewriteCountDistinct.bind(this)
    });

    // Rule 3: Complex nested queries
    this.rewriteRules.push({
      name: 'COMPLEX_NESTED',
      pattern: /SELECT.*?\(\s*SELECT.*?\(\s*SELECT.*?\).*?\).*?FROM/gis,
      description: 'Triple-nested queries not supported',
      rewrite: this.rewriteComplexNested.bind(this)
    });

    // Rule 4: Date calculation functions
    this.rewriteRules.push({
      name: 'DATE_CALCULATIONS',
      pattern: /DATEADD|DATEDIFF|DATE_ADD|DATE_SUB/gi,
      description: 'Complex date calculations not supported',
      rewrite: this.rewriteDateCalculations.bind(this)
    });
  }

  /**
   * Main rewrite method
   */
  async rewriteQuery(originalQuery) {
    let rewrittenQuery = originalQuery;
    const appliedRules = [];
    this.warnings = [];
    this.suggestions = [];

    // Apply each rule
    for (const rule of this.rewriteRules) {
      if (rule.pattern.test(rewrittenQuery)) {
        const result = rule.rewrite(rewrittenQuery);
        if (result.success) {
          rewrittenQuery = result.query;
          appliedRules.push(rule.name);
          if (result.warning) {
            this.warnings.push(result.warning);
          }
          if (result.suggestion) {
            this.suggestions.push(result.suggestion);
          }
        }
      }
      // Reset regex lastIndex
      rule.pattern.lastIndex = 0;
    }

    return {
      original: originalQuery,
      rewritten: rewrittenQuery,
      modified: originalQuery !== rewrittenQuery,
      appliedRules,
      warnings: this.warnings,
      suggestions: this.suggestions
    };
  }

  /**
   * Rewrite CASE statements in COUNT aggregations
   * Example: COUNT(CASE WHEN Status = 'Closed' THEN 1 END)
   * Becomes: Multiple queries or formula field reference
   */
  rewriteCaseInCount(query) {
    // Pattern: COUNT(CASE WHEN condition THEN 1 END)
    const casePattern = /COUNT\s*\(\s*CASE\s+WHEN\s+(.*?)\s+THEN\s+\d+(?:\s+ELSE\s+NULL)?\s+END\s*\)/gis;
    
    let rewritten = query;
    let match;
    const suggestions = [];

    while ((match = casePattern.exec(query)) !== null) {
      const condition = match[1];
      
      // Option 1: Use a formula field (best practice)
      suggestions.push({
        type: 'FORMULA_FIELD',
        description: `Create a formula field: IF(${condition}, 1, 0) and use SUM(FormulaField__c)`,
        example: `SUM(Status_Is_Closed__c) // Where Status_Is_Closed__c is a formula field`
      });

      // Option 2: Use multiple queries
      suggestions.push({
        type: 'MULTIPLE_QUERIES',
        description: 'Split into separate queries with WHERE clauses',
        example: `SELECT COUNT(Id) FROM Object WHERE ${condition}`
      });

      // For now, comment out the problematic part
      rewritten = rewritten.replace(match[0], `/* REWRITE NEEDED: ${match[0]} */ COUNT(Id)`);
    }

    return {
      success: true,
      query: rewritten,
      warning: 'CASE in COUNT not supported. Consider using formula fields or multiple queries.',
      suggestion: suggestions
    };
  }

  /**
   * Rewrite COUNT(DISTINCT field) operations
   * SOQL doesn't support COUNT(DISTINCT)
   */
  rewriteCountDistinct(query) {
    const pattern = /COUNT\s*\(\s*DISTINCT\s+(\w+(?:\.\w+)?)\s*\)/gi;
    let rewritten = query;
    const alternatives = [];

    rewritten = rewritten.replace(pattern, (match, field) => {
      // Generate alternatives
      alternatives.push({
        type: 'GROUP_BY',
        description: `Use GROUP BY ${field} and count results`,
        example: `SELECT ${field}, COUNT(Id) FROM Object GROUP BY ${field}`
      });

      alternatives.push({
        type: 'APEX_CODE',
        description: 'Process distinct count in Apex',
        example: `
// Apex code to count distinct values
Set<String> distinctValues = new Set<String>();
for(SObject record : [SELECT ${field} FROM Object]) {
  distinctValues.add(String.valueOf(record.get('${field}')));
}
Integer distinctCount = distinctValues.size();`
      });

      alternatives.push({
        type: 'AGGREGATE_RESULT',
        description: 'Use AggregateResult with GROUP BY',
        example: `
List<AggregateResult> results = [
  SELECT ${field} 
  FROM Object 
  WHERE ${field} != null 
  GROUP BY ${field}
];
Integer distinctCount = results.size();`
      });

      return `/* COUNT(DISTINCT ${field}) not supported - see alternatives */ COUNT(Id)`;
    });

    return {
      success: true,
      query: rewritten,
      warning: 'COUNT(DISTINCT) not supported in SOQL. Use GROUP BY or Apex processing.',
      suggestion: alternatives
    };
  }

  /**
   * Rewrite complex nested queries (more than 2 levels deep)
   */
  rewriteComplexNested(query) {
    // Detect triple+ nesting
    const nestingLevel = this.countNestingLevel(query);
    
    if (nestingLevel > 2) {
      const suggestions = [];
      
      suggestions.push({
        type: 'SEPARATE_QUERIES',
        description: 'Break into multiple queries and process in code',
        example: `
// First query
List<Id> parentIds = [SELECT Id FROM Parent WHERE ...];

// Second query using results
List<Child> children = [SELECT Id FROM Child WHERE ParentId IN :parentIds];

// Process results in Apex`
      });

      suggestions.push({
        type: 'RELATIONSHIP_QUERIES',
        description: 'Use relationship queries instead of nested SELECTs',
        example: `
SELECT Id, Name, 
  (SELECT Id, Name FROM Children__r WHERE ...),
  Parent__r.Name, Parent__r.Account.Name
FROM Object
WHERE ...`
      });

      // Add warning comment to query
      const warningComment = '/* WARNING: Query nesting level ' + nestingLevel + ' exceeds SOQL limit of 2 */\n';
      
      return {
        success: true,
        query: warningComment + query,
        warning: `Query has ${nestingLevel} levels of nesting. Maximum is 2.`,
        suggestion: suggestions
      };
    }

    return {
      success: false,
      query: query
    };
  }

  /**
   * Count nesting level in a query
   */
  countNestingLevel(query) {
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
    
    return maxLevel;
  }

  /**
   * Rewrite date calculation functions
   */
  rewriteDateCalculations(query) {
    let rewritten = query;
    const alternatives = [];

    // DATEADD alternative
    rewritten = rewritten.replace(/DATEADD\s*\(\s*(\w+)\s*,\s*(-?\d+)\s*,\s*(\w+)\s*\)/gi, 
      (match, unit, amount, field) => {
        alternatives.push({
          type: 'DATE_LITERALS',
          description: 'Use SOQL date literals',
          examples: [
            'LAST_N_DAYS:30',
            'NEXT_N_MONTHS:3',
            'THIS_YEAR',
            'LAST_QUARTER'
          ]
        });

        // Convert to date literal if possible
        const amountNum = parseInt(amount);
        if (unit.toUpperCase() === 'DAY' && amountNum > 0) {
          return `${field} = NEXT_N_DAYS:${amountNum}`;
        } else if (unit.toUpperCase() === 'DAY' && amountNum < 0) {
          return `${field} = LAST_N_DAYS:${Math.abs(amountNum)}`;
        } else if (unit.toUpperCase() === 'MONTH' && amountNum > 0) {
          return `${field} = NEXT_N_MONTHS:${amountNum}`;
        } else if (unit.toUpperCase() === 'MONTH' && amountNum < 0) {
          return `${field} = LAST_N_MONTHS:${Math.abs(amountNum)}`;
        }

        return `/* DATEADD not supported - use date literals */ ${field}`;
      });

    // DATEDIFF alternative
    rewritten = rewritten.replace(/DATEDIFF\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)/gi,
      (match, unit, date1, date2) => {
        alternatives.push({
          type: 'FORMULA_FIELD',
          description: 'Create a formula field for date differences',
          example: `Days_Between__c = ${date2} - ${date1}`
        });

        alternatives.push({
          type: 'APEX_CALCULATION',
          description: 'Calculate date differences in Apex',
          example: `
Date date1 = record.${date1};
Date date2 = record.${date2};
Integer daysDiff = date1.daysBetween(date2);`
        });

        return `/* DATEDIFF not supported - use formula field */ ${date2}`;
      });

    return {
      success: true,
      query: rewritten,
      warning: 'Date calculation functions not directly supported. Use date literals or formula fields.',
      suggestion: alternatives
    };
  }

  /**
   * Validate the rewritten query for common issues
   */
  validateRewrittenQuery(query) {
    const issues = [];

    // Check for remaining unsupported functions
    const unsupportedFunctions = [
      'CASE WHEN',
      'COUNT(DISTINCT',
      'DATEADD',
      'DATEDIFF',
      'PIVOT',
      'UNPIVOT',
      'CONNECT BY'
    ];

    for (const func of unsupportedFunctions) {
      if (query.toUpperCase().includes(func)) {
        issues.push(`Query still contains unsupported function: ${func}`);
      }
    }

    // Check nesting level
    const nestingLevel = this.countNestingLevel(query);
    if (nestingLevel > 2) {
      issues.push(`Query nesting level (${nestingLevel}) exceeds maximum of 2`);
    }

    // Check for proper date format
    const datePattern = /'\d{4}-\d{2}-\d{2}'/g;
    if (datePattern.test(query)) {
      issues.push('Date values should not be quoted in SOQL');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Generate alternative query strategies
   */
  generateAlternatives(originalQuery, issue) {
    const alternatives = [];

    switch (issue) {
      case 'CASE_IN_AGGREGATION':
        alternatives.push({
          strategy: 'Use Formula Fields',
          description: 'Create formula fields for conditional logic, then aggregate',
          steps: [
            '1. Create formula field: IF(condition, 1, 0)',
            '2. Use SUM(FormulaField__c) instead of COUNT(CASE...)'
          ]
        });
        break;

      case 'COUNT_DISTINCT':
        alternatives.push({
          strategy: 'Use GROUP BY',
          description: 'Group by the field and count the groups',
          steps: [
            '1. SELECT field, COUNT(Id) FROM Object GROUP BY field',
            '2. Count the number of results returned'
          ]
        });
        break;

      case 'COMPLEX_NESTED':
        alternatives.push({
          strategy: 'Use Relationship Queries',
          description: 'Leverage parent-child relationships',
          steps: [
            '1. Use __r notation for relationships',
            '2. Query parent and children in one query',
            '3. Process nested data in code'
          ]
        });
        break;

      case 'DATE_CALCULATIONS':
        alternatives.push({
          strategy: 'Use Date Literals',
          description: 'SOQL provides built-in date literals',
          steps: [
            '1. Use LAST_N_DAYS:n, NEXT_N_MONTHS:n',
            '2. Use THIS_WEEK, LAST_QUARTER, etc.',
            '3. Create formula fields for complex calculations'
          ]
        });
        break;
    }

    return alternatives;
  }
}

// CLI interface
async function main() {
  const rewriter = new SOQLQueryRewriter();
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('SOQL Query Rewriter - Handles Common Query Failures');
    console.log('\nUsage:');
    console.log('  soql-query-rewriter.js "YOUR QUERY"');
    console.log('  soql-query-rewriter.js --file query.sql');
    console.log('  soql-query-rewriter.js --validate "QUERY"');
    console.log('\nHandles:');
    console.log('  - CASE statements in aggregations');
    console.log('  - COUNT(DISTINCT) operations');
    console.log('  - Complex nested queries (>2 levels)');
    console.log('  - Date calculation functions');
    process.exit(0);
  }

  let query = '';
  
  if (args[0] === '--file') {
    query = await fs.readFile(args[1], 'utf-8');
  } else if (args[0] === '--validate') {
    query = args.slice(1).join(' ');
    const validation = rewriter.validateRewrittenQuery(query);
    console.log(JSON.stringify(validation, null, 2));
    process.exit(validation.valid ? 0 : 1);
  } else {
    query = args.join(' ');
  }

  const result = await rewriter.rewriteQuery(query);

  if (result.modified) {
    console.log('\n=== ORIGINAL QUERY ===');
    console.log(result.original);
    console.log('\n=== REWRITTEN QUERY ===');
    console.log(result.rewritten);
    
    if (result.warnings.length > 0) {
      console.log('\n⚠️ WARNINGS:');
      result.warnings.forEach(w => console.log(`  - ${w}`));
    }
    
    if (result.suggestions.length > 0) {
      console.log('\n💡 SUGGESTIONS:');
      result.suggestions.forEach(s => {
        if (typeof s === 'object') {
          console.log(`\n  ${s.type}:`);
          console.log(`    ${s.description}`);
          if (s.example) {
            console.log(`    Example: ${s.example}`);
          }
        } else {
          console.log(`  - ${s}`);
        }
      });
    }
    
    console.log('\n✅ Applied Rules:', result.appliedRules.join(', '));
  } else {
    console.log('✅ Query appears to be valid - no rewriting needed');
    console.log(query);
  }

  // Validate the result
  const validation = rewriter.validateRewrittenQuery(result.rewritten);
  if (!validation.valid) {
    console.log('\n⚠️ REMAINING ISSUES:');
    validation.issues.forEach(issue => console.log(`  - ${issue}`));
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = SOQLQueryRewriter;