#!/usr/bin/env node

/**
 * Validation Rule Analyzer
 * Analyzes Salesforce validation rules for problematic patterns
 */

const fs = require('fs');
const path = require('path');

class ValidationRuleAnalyzer {
  constructor(options = {}) {
    this.org = options.org || process.env.SALESFORCE_ORG_ALIAS || 'production';
    this.problematicPatterns = [
      'PRIORVALUE',
      'ISCHANGED',
      'ISNEW',
      'ISBLANK',
      'ISNULL'
    ];
  }

  /**
   * Analyze validation rules for blockers
   * @param {Object} options - Analysis options
   * @returns {Object} Analysis results
   */
  async analyze(options) {
    const { rules, checkPatterns, output } = options;
    const blockers = [];
    const warnings = [];
    const info = [];

    try {
      // Load validation rules
      const validationRules = this.loadRules(rules);

      // Parse check patterns
      const patterns = checkPatterns ? checkPatterns.split(',') : this.problematicPatterns;

      // Analyze each rule
      for (const rule of validationRules) {
        const analysis = this.analyzeRule(rule, patterns);

        if (analysis.severity === 'BLOCKER') {
          blockers.push(analysis);
        } else if (analysis.severity === 'WARNING') {
          warnings.push(analysis);
        } else if (analysis.hasIssues) {
          info.push(analysis);
        }
      }

      const results = {
        success: true,
        analyzedAt: new Date().toISOString(),
        org: this.org,
        summary: {
          total: validationRules.length,
          blockers: blockers.length,
          warnings: warnings.length,
          info: info.length,
          clean: validationRules.length - blockers.length - warnings.length - info.length
        },
        blockers,
        warnings,
        info,
        canProceed: blockers.length === 0
      };

      // Write output if specified
      if (output) {
        fs.writeFileSync(output, JSON.stringify(results, null, 2));
        console.log(`Analysis results written to ${output}`);
      }

      return results;

    } catch (error) {
      return {
        success: false,
        error: error.message,
        blockers: [],
        warnings: [],
        canProceed: false
      };
    }
  }

  /**
   * Load validation rules from source
   */
  loadRules(source) {
    if (typeof source === 'string' && source.endsWith('.json')) {
      const data = JSON.parse(fs.readFileSync(source, 'utf8'));

      // Handle different JSON structures
      if (data.records) return data.records;
      if (data.result) return data.result;
      if (Array.isArray(data)) return data;

      // Try to extract from query result
      if (data.done !== undefined && data.totalSize !== undefined) {
        return data.records || [];
      }
    }

    // Mock data for demonstration
    return [
      {
        Name: 'Require_Close_Date',
        Active: true,
        Description: 'Ensures close date is populated',
        ErrorConditionFormula: 'ISBLANK(CloseDate)',
        EntityDefinition: { DeveloperName: 'Opportunity' }
      },
      {
        Name: 'Prevent_Stage_Regression',
        Active: true,
        Description: 'Prevents moving opportunity to earlier stage',
        ErrorConditionFormula: 'PRIORVALUE(StageName) > StageName',
        EntityDefinition: { DeveloperName: 'Opportunity' }
      },
      {
        Name: 'Email_Change_Validation',
        Active: true,
        Description: 'Validates email changes',
        ErrorConditionFormula: 'AND(ISCHANGED(Email), NOT(CONTAINS(Email, "@")))',
        EntityDefinition: { DeveloperName: 'Contact' }
      }
    ];
  }

  /**
   * Analyze a single validation rule
   */
  analyzeRule(rule, patterns) {
    const analysis = {
      ruleName: rule.Name,
      object: rule.EntityDefinition?.DeveloperName || 'Unknown',
      active: rule.Active,
      description: rule.Description,
      formula: rule.ErrorConditionFormula,
      issues: [],
      hasIssues: false,
      severity: 'INFO',
      recommendations: []
    };

    // Check for problematic patterns
    patterns.forEach(pattern => {
      if (rule.ErrorConditionFormula && rule.ErrorConditionFormula.includes(pattern)) {
        const issue = this.categorizePattern(pattern, rule);
        analysis.issues.push(issue);
        analysis.hasIssues = true;

        // Update severity
        if (issue.severity === 'BLOCKER' && analysis.severity !== 'BLOCKER') {
          analysis.severity = 'BLOCKER';
        } else if (issue.severity === 'WARNING' && analysis.severity === 'INFO') {
          analysis.severity = 'WARNING';
        }

        // Add recommendations
        if (issue.recommendation) {
          analysis.recommendations.push(issue.recommendation);
        }
      }
    });

    // Check for complex formulas
    if (rule.ErrorConditionFormula) {
      const complexity = this.calculateComplexity(rule.ErrorConditionFormula);
      if (complexity > 10) {
        analysis.issues.push({
          pattern: 'COMPLEX_FORMULA',
          severity: 'WARNING',
          impact: 'May affect performance',
          recommendation: 'Consider simplifying or splitting into multiple rules'
        });
        analysis.hasIssues = true;
        if (analysis.severity === 'INFO') {
          analysis.severity = 'WARNING';
        }
      }
    }

    // Check for field references
    const fieldRefs = this.extractFieldReferences(rule.ErrorConditionFormula);
    if (fieldRefs.length > 5) {
      analysis.issues.push({
        pattern: 'MANY_FIELD_REFS',
        severity: 'INFO',
        impact: 'Rule depends on many fields',
        fields: fieldRefs,
        recommendation: 'Monitor for maintenance complexity'
      });
      analysis.hasIssues = true;
    }

    return analysis;
  }

  /**
   * Categorize problematic pattern
   */
  categorizePattern(pattern, rule) {
    const categories = {
      'PRIORVALUE': {
        severity: 'BLOCKER',
        impact: 'Blocks flows and triggers from updating records',
        recommendation: 'Use field history tracking or audit fields instead',
        workaround: 'Create bypass setting or deactivate during automation'
      },
      'ISCHANGED': {
        severity: 'WARNING',
        impact: 'May prevent bulk updates and integrations',
        recommendation: 'Consider using triggers for complex change detection',
        workaround: 'Implement conditional bypass logic'
      },
      'ISNEW': {
        severity: 'WARNING',
        impact: 'Only works in before insert context',
        recommendation: 'Ensure rule is appropriate for record creation only',
        workaround: 'Use CreatedDate = LastModifiedDate for existing records'
      },
      'ISBLANK': {
        severity: 'INFO',
        impact: 'May behave unexpectedly with picklists',
        recommendation: 'Use TEXT(field) = "" for picklist fields',
        workaround: 'Ensure proper null handling'
      },
      'ISNULL': {
        severity: 'INFO',
        impact: 'Deprecated function',
        recommendation: 'Replace with ISBLANK() for better compatibility',
        workaround: 'Update formula syntax'
      }
    };

    const category = categories[pattern] || {
      severity: 'INFO',
      impact: 'Pattern detected',
      recommendation: 'Review for potential issues'
    };

    return {
      pattern,
      ...category,
      context: this.getPatternContext(pattern, rule.ErrorConditionFormula)
    };
  }

  /**
   * Get context around pattern usage
   */
  getPatternContext(pattern, formula) {
    const index = formula.indexOf(pattern);
    if (index === -1) return '';

    const start = Math.max(0, index - 20);
    const end = Math.min(formula.length, index + pattern.length + 20);

    return formula.substring(start, end);
  }

  /**
   * Calculate formula complexity
   */
  calculateComplexity(formula) {
    if (!formula) return 0;

    let complexity = 0;

    // Count logical operators
    complexity += (formula.match(/AND|OR|NOT/g) || []).length * 2;

    // Count functions
    complexity += (formula.match(/[A-Z]+\(/g) || []).length;

    // Count nested parentheses
    let maxNesting = 0;
    let currentNesting = 0;
    for (const char of formula) {
      if (char === '(') {
        currentNesting++;
        maxNesting = Math.max(maxNesting, currentNesting);
      } else if (char === ')') {
        currentNesting--;
      }
    }
    complexity += maxNesting * 3;

    return complexity;
  }

  /**
   * Extract field references from formula
   */
  extractFieldReferences(formula) {
    if (!formula) return [];

    // Match field patterns (simplified)
    const fieldPattern = /[A-Z][a-zA-Z0-9_]*__c|[A-Z][a-zA-Z0-9]+(?=[^(])/g;
    const matches = formula.match(fieldPattern) || [];

    // Remove duplicates and functions
    const fields = [...new Set(matches)].filter(f =>
      !['AND', 'OR', 'NOT', 'IF', 'ISBLANK', 'ISNULL', 'ISCHANGED', 'ISNEW', 'PRIORVALUE'].includes(f)
    );

    return fields;
  }

  /**
   * Generate mitigation script
   */
  generateMitigationScript(results) {
    const script = [];

    script.push('#!/bin/bash');
    script.push('# Validation Rule Mitigation Script');
    script.push(`# Generated: ${new Date().toISOString()}`);
    script.push('');

    if (results.blockers.length > 0) {
      script.push('# BLOCKER Mitigations');
      script.push('echo "Creating bypass settings for blocking rules..."');

      results.blockers.forEach(blocker => {
        script.push(`# ${blocker.ruleName}`);
        script.push(`sf data create record --sobject Validation_Bypass__c --values "Rule_Name__c='${blocker.ruleName}' Object__c='${blocker.object}' Active__c=true" --target-org ${this.org}`);
      });
      script.push('');
    }

    if (results.warnings.length > 0) {
      script.push('# WARNING Reviews');
      results.warnings.forEach(warning => {
        script.push(`# Review: ${warning.ruleName} - ${warning.issues[0]?.impact}`);
      });
    }

    return script.join('\n');
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: validation-rule-analyzer.js --rules <file> [--check-patterns <patterns>] [--output <file>]');
    console.log('Patterns: PRIORVALUE,ISCHANGED,ISNEW,ISBLANK,ISNULL');
    process.exit(1);
  }

  const options = {
    rules: args[args.indexOf('--rules') + 1],
    checkPatterns: args.includes('--check-patterns') ? args[args.indexOf('--check-patterns') + 1] : null,
    output: args.includes('--output') ? args[args.indexOf('--output') + 1] : null
  };

  const analyzer = new ValidationRuleAnalyzer();
  analyzer.analyze(options).then(results => {
    if (!options.output) {
      console.log(JSON.stringify(results, null, 2));
    }

    if (args.includes('--mitigation')) {
      const script = analyzer.generateMitigationScript(results);
      const scriptFile = 'validation-mitigation.sh';
      fs.writeFileSync(scriptFile, script, { mode: 0o755 });
      console.log(`Mitigation script generated: ${scriptFile}`);
    }

    process.exit(results.canProceed ? 0 : 1);
  });
}

module.exports = ValidationRuleAnalyzer;