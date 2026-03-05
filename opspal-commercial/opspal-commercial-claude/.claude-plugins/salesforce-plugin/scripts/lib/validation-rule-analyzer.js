#!/usr/bin/env node

/**
 * Validation Rule Analyzer
 *
 * Analyze existing validation rules in Salesforce org for complexity, anti-patterns,
 * and consolidation opportunities.
 *
 * Features:
 * - Comprehensive org-wide validation rule analysis
 * - Complexity scoring across all rules
 * - Anti-pattern detection with remediation suggestions
 * - Consolidation opportunity identification
 * - Governor limit usage tracking
 * - Object-level summaries
 * - Health score calculation (0-100)
 * - Detailed recommendations report
 * - Export to JSON/CSV formats
 *
 * Analysis Dimensions:
 * 1. Complexity distribution (Simple/Medium/Complex)
 * 2. Anti-pattern frequency
 * 3. Inactive rules (candidates for deletion)
 * 4. Duplicate logic detection
 * 5. Governor limit usage per object
 * 6. Formula length distribution
 * 7. Error message quality assessment
 * 8. Maintenance burden estimation
 *
 * Usage:
 *   const Analyzer = require('./validation-rule-analyzer');
 *   const analyzer = new Analyzer('my-org');
 *   const analysis = await analyzer.analyzeOrg();
 *
 * CLI Usage:
 *   node validation-rule-analyzer.js --org my-org
 *   node validation-rule-analyzer.js --org my-org --object Opportunity
 *   node validation-rule-analyzer.js --org my-org --format csv --output report.csv
 *   node validation-rule-analyzer.js --org my-org --health-score
 *
 * @version 1.0.0
 * @see agents/validation-rule-orchestrator.md
 * @see docs/runbooks/validation-rule-management/06-monitoring-maintenance-rollback.md
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ValidationRuleAnalyzer {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.options = {
      verbose: options.verbose || false,
      includeInactive: options.includeInactive !== false,
      timeout: options.timeout || 60000,
      ...options
    };

    // Load dependencies
    this.complexityCalculator = require('./validation-rule-complexity-calculator');
  }

  /**
   * Analyze all validation rules in org
   *
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Complete analysis with recommendations
   *
   * @example
   * const analysis = await analyzer.analyzeOrg({ includeRecommendations: true });
   * console.log(`Health Score: ${analysis.healthScore}/100`);
   */
  async analyzeOrg(options = {}) {
    this.log('🔍 Starting validation rule analysis...');

    const analysis = {
      timestamp: new Date().toISOString(),
      orgAlias: this.orgAlias,
      summary: {},
      objectAnalysis: [],
      complexityDistribution: {},
      antiPatternSummary: {},
      recommendations: [],
      healthScore: 0
    };

    // Fetch all validation rules
    this.log('📋 Fetching validation rules from org...');
    const rules = await this._fetchAllRules();

    analysis.summary.totalRules = rules.length;
    analysis.summary.activeRules = rules.filter(r => r.active).length;
    analysis.summary.inactiveRules = rules.filter(r => !r.active).length;

    this.log(`   Found ${rules.length} validation rules (${analysis.summary.activeRules} active)`);

    // Analyze each rule
    this.log('📊 Analyzing rules...');
    const ruleAnalyses = await Promise.all(
      rules.map(rule => this._analyzeRule(rule))
    );

    // Group by object
    const rulesByObject = this._groupByObject(ruleAnalyses);
    analysis.objectAnalysis = rulesByObject;

    // Calculate complexity distribution
    analysis.complexityDistribution = this._calculateComplexityDistribution(ruleAnalyses);

    // Summarize anti-patterns
    analysis.antiPatternSummary = this._summarizeAntiPatterns(ruleAnalyses);

    // Find consolidation opportunities
    analysis.consolidationOpportunities = this._findConsolidationOpportunities(rulesByObject);

    // Generate recommendations
    if (options.includeRecommendations !== false) {
      analysis.recommendations = this._generateRecommendations(analysis);
    }

    // Calculate health score
    analysis.healthScore = this._calculateHealthScore(analysis);

    this.log(`✅ Analysis complete. Health Score: ${analysis.healthScore}/100`);

    return analysis;
  }

  /**
   * Analyze validation rules for specific object
   *
   * @param {String} objectName - Object API name
   * @returns {Promise<Object>} Object-specific analysis
   *
   * @example
   * const analysis = await analyzer.analyzeObject('Opportunity');
   */
  async analyzeObject(objectName) {
    this.log(`🔍 Analyzing validation rules for ${objectName}...`);

    const rules = await this._fetchRulesForObject(objectName);

    const analysis = {
      timestamp: new Date().toISOString(),
      orgAlias: this.orgAlias,
      object: objectName,
      summary: {
        totalRules: rules.length,
        activeRules: rules.filter(r => r.active).length,
        inactiveRules: rules.filter(r => !r.active).length
      },
      rules: [],
      complexityDistribution: {},
      antiPatternSummary: {},
      recommendations: [],
      healthScore: 0
    };

    // Analyze each rule
    const ruleAnalyses = await Promise.all(
      rules.map(rule => this._analyzeRule(rule))
    );

    analysis.rules = ruleAnalyses;

    // Calculate metrics
    analysis.complexityDistribution = this._calculateComplexityDistribution(ruleAnalyses);
    analysis.antiPatternSummary = this._summarizeAntiPatterns(ruleAnalyses);
    analysis.recommendations = this._generateObjectRecommendations(objectName, analysis);
    analysis.healthScore = this._calculateObjectHealthScore(analysis);

    return analysis;
  }

  /**
   * Fetch all validation rules from org
   *
   * @private
   */
  async _fetchAllRules() {
    try {
      const query = `
        SELECT Id, ValidationName, EntityDefinition.QualifiedApiName,
               Active, Description, ErrorConditionFormula, ErrorMessage, ErrorDisplayField
        FROM ValidationRule
        ${this.options.includeInactive ? '' : 'WHERE Active = true'}
        ORDER BY EntityDefinition.QualifiedApiName, ValidationName
      `;

      const result = execSync(
        `sf data query --query "${query.replace(/\n/g, ' ').replace(/\s+/g, ' ')}" --use-tooling-api --target-org ${this.orgAlias} --json`,
        { encoding: 'utf-8', timeout: this.options.timeout }
      );

      const data = JSON.parse(result);

      if (!data.result || !data.result.records) {
        throw new Error('No validation rules found or query failed');
      }

      return data.result.records.map(record => ({
        id: record.Id,
        name: record.ValidationName,
        object: record.EntityDefinition.QualifiedApiName,
        active: record.Active,
        description: record.Description || '',
        formula: record.ErrorConditionFormula || '',
        errorMessage: record.ErrorMessage || '',
        errorDisplayField: record.ErrorDisplayField || ''
      }));
    } catch (error) {
      throw new Error(`Failed to fetch validation rules: ${error.message}`);
    }
  }

  /**
   * Fetch validation rules for specific object
   *
   * @private
   */
  async _fetchRulesForObject(objectName) {
    try {
      const query = `
        SELECT Id, ValidationName, Active, Description,
               ErrorConditionFormula, ErrorMessage, ErrorDisplayField
        FROM ValidationRule
        WHERE EntityDefinition.QualifiedApiName = '${objectName}'
        ${this.options.includeInactive ? '' : 'AND Active = true'}
        ORDER BY ValidationName
      `;

      const result = execSync(
        `sf data query --query "${query.replace(/\n/g, ' ').replace(/\s+/g, ' ')}" --use-tooling-api --target-org ${this.orgAlias} --json`,
        { encoding: 'utf-8', timeout: this.options.timeout }
      );

      const data = JSON.parse(result);

      if (!data.result || !data.result.records) {
        return [];
      }

      return data.result.records.map(record => ({
        id: record.Id,
        name: record.ValidationName,
        object: objectName,
        active: record.Active,
        description: record.Description || '',
        formula: record.ErrorConditionFormula || '',
        errorMessage: record.ErrorMessage || '',
        errorDisplayField: record.ErrorDisplayField || ''
      }));
    } catch (error) {
      throw new Error(`Failed to fetch rules for ${objectName}: ${error.message}`);
    }
  }

  /**
   * Analyze single validation rule
   *
   * @private
   */
  async _analyzeRule(rule) {
    const analysis = {
      id: rule.id,
      name: rule.name,
      object: rule.object,
      active: rule.active,
      formula: rule.formula,
      errorMessage: rule.errorMessage,
      complexity: null,
      antiPatterns: [],
      issues: [],
      suggestions: []
    };

    // Calculate complexity
    if (rule.formula) {
      analysis.complexity = this.complexityCalculator.calculateFromFormula(rule.formula);

      // Detect anti-patterns
      analysis.antiPatterns = this.complexityCalculator.detectAntiPatterns(rule.formula);

      // Flag high complexity
      if (analysis.complexity.score > 60) {
        analysis.issues.push({
          type: 'HIGH_COMPLEXITY',
          message: `High complexity (${analysis.complexity.score}). Consider segmentation.`,
          severity: analysis.complexity.score > 80 ? 'HIGH' : 'MEDIUM'
        });
      }

      // Flag very long formulas
      if (rule.formula.length > 1000) {
        analysis.issues.push({
          type: 'LONG_FORMULA',
          message: `Formula length ${rule.formula.length} chars. Consider segmentation.`,
          severity: rule.formula.length > 2000 ? 'HIGH' : 'MEDIUM'
        });
      }
    } else {
      analysis.issues.push({
        type: 'MISSING_FORMULA',
        message: 'Validation rule has no formula',
        severity: 'CRITICAL'
      });
    }

    // Check error message quality
    if (!rule.errorMessage || rule.errorMessage.length < 10) {
      analysis.issues.push({
        type: 'POOR_ERROR_MESSAGE',
        message: 'Error message is missing or too short',
        severity: 'MEDIUM'
      });
    }

    // Flag inactive rules
    if (!rule.active) {
      analysis.suggestions.push({
        type: 'INACTIVE_RULE',
        message: 'Inactive rule - consider deleting if no longer needed'
      });
    }

    return analysis;
  }

  /**
   * Group rule analyses by object
   *
   * @private
   */
  _groupByObject(ruleAnalyses) {
    const byObject = {};

    ruleAnalyses.forEach(rule => {
      if (!byObject[rule.object]) {
        byObject[rule.object] = {
          object: rule.object,
          totalRules: 0,
          activeRules: 0,
          inactiveRules: 0,
          avgComplexity: 0,
          highComplexityRules: 0,
          totalIssues: 0,
          antiPatternCount: 0,
          rules: []
        };
      }

      const obj = byObject[rule.object];
      obj.totalRules++;
      obj.rules.push(rule);

      if (rule.active) obj.activeRules++;
      else obj.inactiveRules++;

      if (rule.complexity) {
        obj.avgComplexity += rule.complexity.score;
        if (rule.complexity.score > 60) obj.highComplexityRules++;
      }

      obj.totalIssues += rule.issues.length;
      obj.antiPatternCount += rule.antiPatterns.length;
    });

    // Calculate averages
    Object.values(byObject).forEach(obj => {
      obj.avgComplexity = obj.totalRules > 0
        ? Math.round(obj.avgComplexity / obj.totalRules)
        : 0;
    });

    return Object.values(byObject);
  }

  /**
   * Calculate complexity distribution
   *
   * @private
   */
  _calculateComplexityDistribution(ruleAnalyses) {
    const distribution = {
      simple: 0,      // 0-30
      medium: 0,      // 31-60
      complex: 0,     // 61-100
      unknown: 0
    };

    ruleAnalyses.forEach(rule => {
      if (!rule.complexity) {
        distribution.unknown++;
      } else if (rule.complexity.score <= 30) {
        distribution.simple++;
      } else if (rule.complexity.score <= 60) {
        distribution.medium++;
      } else {
        distribution.complex++;
      }
    });

    return distribution;
  }

  /**
   * Summarize anti-patterns across all rules
   *
   * @private
   */
  _summarizeAntiPatterns(ruleAnalyses) {
    const summary = {};

    ruleAnalyses.forEach(rule => {
      rule.antiPatterns.forEach(ap => {
        if (!summary[ap.pattern]) {
          summary[ap.pattern] = {
            pattern: ap.pattern,
            count: 0,
            severity: ap.severity,
            description: ap.description,
            fix: ap.fix,
            affectedRules: []
          };
        }

        summary[ap.pattern].count++;
        summary[ap.pattern].affectedRules.push({
          object: rule.object,
          name: rule.name
        });
      });
    });

    return Object.values(summary).sort((a, b) => b.count - a.count);
  }

  /**
   * Find consolidation opportunities
   *
   * @private
   */
  _findConsolidationOpportunities(objectAnalyses) {
    const opportunities = [];

    objectAnalyses.forEach(objAnalysis => {
      // Many inactive rules on same object
      if (objAnalysis.inactiveRules >= 3) {
        opportunities.push({
          type: 'CLEANUP_INACTIVE',
          priority: 'HIGH',
          object: objAnalysis.object,
          count: objAnalysis.inactiveRules,
          description: `${objAnalysis.inactiveRules} inactive rules can be deleted`,
          action: 'Review inactive rules and delete if no longer needed'
        });
      }

      // Many complex rules on same object
      if (objAnalysis.highComplexityRules >= 3) {
        opportunities.push({
          type: 'REFACTOR_COMPLEX',
          priority: 'MEDIUM',
          object: objAnalysis.object,
          count: objAnalysis.highComplexityRules,
          description: `${objAnalysis.highComplexityRules} complex rules could be simplified`,
          action: 'Review high-complexity rules for segmentation opportunities'
        });
      }

      // Object approaching governor limit
      if (objAnalysis.totalRules > 400) {
        opportunities.push({
          type: 'GOVERNOR_LIMIT',
          priority: objAnalysis.totalRules > 450 ? 'HIGH' : 'MEDIUM',
          object: objAnalysis.object,
          count: objAnalysis.totalRules,
          description: `Object approaching validation rule limit (${objAnalysis.totalRules}/500)`,
          action: 'Consolidate rules or delete unused rules'
        });
      }

      // Look for duplicate logic patterns (simplified detection)
      const formulas = objAnalysis.rules.map(r => r.formula).filter(f => f);
      const formulaSet = new Set(formulas);

      if (formulas.length !== formulaSet.size) {
        const duplicateCount = formulas.length - formulaSet.size;
        opportunities.push({
          type: 'DUPLICATE_LOGIC',
          priority: 'LOW',
          object: objAnalysis.object,
          count: duplicateCount,
          description: `Possible duplicate validation logic detected`,
          action: 'Review rules for duplicate or overlapping logic'
        });
      }
    });

    return opportunities.sort((a, b) => {
      const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Generate recommendations
   *
   * @private
   */
  _generateRecommendations(analysis) {
    const recommendations = [];

    // Complexity recommendations
    if (analysis.complexityDistribution.complex > 0) {
      recommendations.push({
        category: 'COMPLEXITY',
        priority: 'HIGH',
        title: 'Simplify Complex Validation Rules',
        description: `${analysis.complexityDistribution.complex} rules have high complexity (score > 60)`,
        action: 'Use validation-rule-segmentation-specialist to break complex rules into segments',
        benefit: 'Improved maintainability, easier troubleshooting, reduced error rate'
      });
    }

    // Anti-pattern recommendations
    if (analysis.antiPatternSummary.length > 0) {
      const criticalPatterns = analysis.antiPatternSummary.filter(ap => ap.severity === 'CRITICAL');

      if (criticalPatterns.length > 0) {
        recommendations.push({
          category: 'ANTI_PATTERNS',
          priority: 'HIGH',
          title: 'Fix Critical Anti-Patterns',
          description: `${criticalPatterns.length} critical anti-patterns detected across ${criticalPatterns.reduce((sum, ap) => sum + ap.count, 0)} rules`,
          action: `Fix patterns: ${criticalPatterns.map(ap => ap.pattern).join(', ')}`,
          benefit: 'Prevent runtime errors, ensure correct validation behavior'
        });
      }
    }

    // Inactive rule recommendations
    if (analysis.summary.inactiveRules > 0) {
      recommendations.push({
        category: 'CLEANUP',
        priority: 'MEDIUM',
        title: 'Clean Up Inactive Rules',
        description: `${analysis.summary.inactiveRules} inactive rules detected`,
        action: 'Review inactive rules and delete if no longer needed',
        benefit: 'Reduced metadata clutter, easier navigation, improved org performance'
      });
    }

    // Consolidation recommendations
    if (analysis.consolidationOpportunities.length > 0) {
      const highPriority = analysis.consolidationOpportunities.filter(opp => opp.priority === 'HIGH');

      if (highPriority.length > 0) {
        recommendations.push({
          category: 'CONSOLIDATION',
          priority: 'HIGH',
          title: 'Address High-Priority Consolidation Opportunities',
          description: `${highPriority.length} high-priority consolidation opportunities identified`,
          action: highPriority.map(opp => `${opp.object}: ${opp.action}`).join('; '),
          benefit: 'Avoid governor limits, improve performance, reduce maintenance burden'
        });
      }
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Generate object-specific recommendations
   *
   * @private
   */
  _generateObjectRecommendations(objectName, analysis) {
    const recommendations = [];

    // High complexity
    const highComplexityRules = analysis.rules.filter(
      r => r.complexity && r.complexity.score > 60
    );

    if (highComplexityRules.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        title: 'Simplify Complex Rules',
        description: `${highComplexityRules.length} rules with complexity > 60`,
        affectedRules: highComplexityRules.map(r => r.name)
      });
    }

    // Anti-patterns
    const rulesWithAntiPatterns = analysis.rules.filter(r => r.antiPatterns.length > 0);

    if (rulesWithAntiPatterns.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        title: 'Fix Anti-Patterns',
        description: `${rulesWithAntiPatterns.length} rules with detected anti-patterns`,
        affectedRules: rulesWithAntiPatterns.map(r => r.name)
      });
    }

    // Inactive rules
    if (analysis.summary.inactiveRules > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        title: 'Clean Up Inactive Rules',
        description: `${analysis.summary.inactiveRules} inactive rules`,
        affectedRules: analysis.rules.filter(r => !r.active).map(r => r.name)
      });
    }

    return recommendations;
  }

  /**
   * Calculate overall health score (0-100)
   *
   * Health Score Formula:
   * - Complexity (30%): Fewer complex rules = higher score
   * - Anti-Patterns (30%): Fewer anti-patterns = higher score
   * - Inactive Rules (20%): Fewer inactive = higher score
   * - Governor Limits (20%): More headroom = higher score
   *
   * @private
   */
  _calculateHealthScore(analysis) {
    const totalRules = analysis.summary.totalRules;

    if (totalRules === 0) return 100;

    // Complexity score (30%)
    const complexRules = analysis.complexityDistribution.complex;
    const complexityScore = Math.max(0, 100 - (complexRules / totalRules) * 100);

    // Anti-pattern score (30%)
    const antiPatternCount = analysis.antiPatternSummary.reduce((sum, ap) => sum + ap.count, 0);
    const antiPatternScore = Math.max(0, 100 - (antiPatternCount / totalRules) * 50);

    // Inactive rules score (20%)
    const inactiveRules = analysis.summary.inactiveRules;
    const inactiveScore = Math.max(0, 100 - (inactiveRules / totalRules) * 100);

    // Governor limit score (20%)
    const maxRulesPerObject = Math.max(
      ...analysis.objectAnalysis.map(obj => obj.totalRules),
      0
    );
    const governorScore = Math.max(0, 100 - (maxRulesPerObject / 500) * 100);

    // Weighted average
    const healthScore = Math.round(
      complexityScore * 0.3 +
      antiPatternScore * 0.3 +
      inactiveScore * 0.2 +
      governorScore * 0.2
    );

    return healthScore;
  }

  /**
   * Calculate object-specific health score
   *
   * @private
   */
  _calculateObjectHealthScore(analysis) {
    const totalRules = analysis.summary.totalRules;

    if (totalRules === 0) return 100;

    // Complexity score
    const complexRules = analysis.complexityDistribution.complex;
    const complexityScore = Math.max(0, 100 - (complexRules / totalRules) * 100);

    // Anti-pattern score
    const totalAntiPatterns = analysis.antiPatternSummary.reduce((sum, ap) => sum + ap.count, 0);
    const antiPatternScore = Math.max(0, 100 - (totalAntiPatterns / totalRules) * 50);

    // Inactive rules score
    const inactiveScore = Math.max(0, 100 - (analysis.summary.inactiveRules / totalRules) * 100);

    // Governor limit score
    const governorScore = Math.max(0, 100 - (totalRules / 500) * 100);

    return Math.round(
      complexityScore * 0.3 +
      antiPatternScore * 0.3 +
      inactiveScore * 0.2 +
      governorScore * 0.2
    );
  }

  /**
   * Export analysis to CSV format
   *
   * @param {Object} analysis - Analysis result
   * @returns {String} CSV content
   */
  exportToCsv(analysis) {
    const rows = [
      ['Object', 'Rule Name', 'Active', 'Complexity Score', 'Complexity Category', 'Anti-Patterns', 'Issues', 'Formula Length']
    ];

    analysis.objectAnalysis.forEach(objAnalysis => {
      objAnalysis.rules.forEach(rule => {
        rows.push([
          rule.object,
          rule.name,
          rule.active ? 'Yes' : 'No',
          rule.complexity ? rule.complexity.score : 'N/A',
          rule.complexity ? rule.complexity.category : 'N/A',
          rule.antiPatterns.length,
          rule.issues.length,
          rule.formula ? rule.formula.length : 0
        ]);
      });
    });

    return rows.map(row => row.join(',')).join('\n');
  }

  /**
   * Log message if verbose mode enabled
   *
   * @private
   */
  log(message) {
    if (this.options.verbose) {
      console.log(message);
    }
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Validation Rule Analyzer v1.0.0

Usage:
  node validation-rule-analyzer.js [options]

Options:
  --org <alias>         Salesforce org alias (required)
  --object <object>     Analyze specific object only
  --format <format>     Output format: json (default) or csv
  --output <path>       Save analysis to file
  --health-score        Show health score only
  --no-inactive         Exclude inactive rules
  --verbose             Enable detailed logging
  --help, -h            Show this help message

Examples:
  # Analyze entire org
  node validation-rule-analyzer.js --org my-org --verbose

  # Analyze specific object
  node validation-rule-analyzer.js --org my-org --object Opportunity

  # Export to CSV
  node validation-rule-analyzer.js --org my-org --format csv --output report.csv

  # Quick health check
  node validation-rule-analyzer.js --org my-org --health-score
`);
    process.exit(0);
  }

  // Parse options
  const options = { verbose: false, includeInactive: true };
  let orgAlias, objectName, format = 'json', outputPath, healthScoreOnly = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--org' && i + 1 < args.length) {
      orgAlias = args[++i];
    } else if (arg === '--object' && i + 1 < args.length) {
      objectName = args[++i];
    } else if (arg === '--format' && i + 1 < args.length) {
      format = args[++i];
    } else if (arg === '--output' && i + 1 < args.length) {
      outputPath = args[++i];
    } else if (arg === '--health-score') {
      healthScoreOnly = true;
    } else if (arg === '--no-inactive') {
      options.includeInactive = false;
    } else if (arg === '--verbose') {
      options.verbose = true;
    }
  }

  if (!orgAlias) {
    console.error('Error: --org is required');
    process.exit(1);
  }

  // Execute analysis
  const analyzer = new ValidationRuleAnalyzer(orgAlias, options);

  (async () => {
    try {
      let analysis;

      if (objectName) {
        analysis = await analyzer.analyzeObject(objectName);
      } else {
        analysis = await analyzer.analyzeOrg();
      }

      if (healthScoreOnly) {
        console.log(`\n📊 Health Score: ${analysis.healthScore}/100`);
        process.exit(0);
      }

      // Output results
      console.log('\n' + '='.repeat(80));
      console.log('VALIDATION RULE ANALYSIS');
      console.log('='.repeat(80));
      console.log(`Org: ${analysis.orgAlias}`);
      console.log(`Timestamp: ${analysis.timestamp}`);
      console.log(`Health Score: ${analysis.healthScore}/100`);
      console.log('\nSummary:');
      console.log(JSON.stringify(analysis.summary, null, 2));

      if (analysis.recommendations && analysis.recommendations.length > 0) {
        console.log('\nTop Recommendations:');
        analysis.recommendations.slice(0, 3).forEach((rec, idx) => {
          console.log(`\n${idx + 1}. [${rec.priority}] ${rec.title}`);
          console.log(`   ${rec.description}`);
          console.log(`   Action: ${rec.action}`);
        });
      }

      // Save output
      if (outputPath) {
        let content;

        if (format === 'csv') {
          content = analyzer.exportToCsv(analysis);
        } else {
          content = JSON.stringify(analysis, null, 2);
        }

        fs.writeFileSync(outputPath, content);
        console.log(`\n📝 Analysis saved to: ${outputPath}`);
      } else if (!healthScoreOnly) {
        // Print full analysis to console
        console.log('\n' + '='.repeat(80));
        console.log('FULL ANALYSIS');
        console.log('='.repeat(80));
        console.log(JSON.stringify(analysis, null, 2));
      }

      process.exit(0);
    } catch (error) {
      console.error(`\n❌ Analysis failed: ${error.message}`);
      process.exit(1);
    }
  })();
}

module.exports = ValidationRuleAnalyzer;
