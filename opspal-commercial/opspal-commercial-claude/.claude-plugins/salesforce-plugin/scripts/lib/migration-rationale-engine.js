/**
 * Migration Rationale Engine - Decision Matrix for Trigger-to-Flow Migration
 *
 * Purpose: Provides data-driven recommendations for migrating Apex triggers to Flow
 * or keeping them as Apex, based on complexity, performance, and maintainability factors.
 *
 * Decision Factors:
 * - Complexity Score: Simple field updates vs complex business logic
 * - DML/SOQL Counts: Governor limit considerations
 * - Error Handling: Needs try/catch vs declarative error handling
 * - External Callouts: Requires @future or queueable
 * - Maintainability: Admin-friendly Flow vs developer-only Apex
 * - Performance: CPU-intensive operations vs declarative logic
 *
 * Recommendations:
 * - MIGRATE_TO_FLOW: Strong case for Flow migration
 * - KEEP_AS_APEX: Strong case to remain Apex
 * - HYBRID: Split into Flow + Apex helper classes
 * - EVALUATE: Requires deeper analysis
 *
 * @author Automation Audit System v2.0
 * @version 2.0.0
 * @date 2025-10-09
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class MigrationRationaleEngine {
  constructor(orgAlias, cascadeData = null, namespaceData = null) {
    this.orgAlias = orgAlias;
    this.cascadeData = cascadeData;
    this.namespaceData = namespaceData;
    this.triggers = [];
    this.recommendations = [];
    this.decisionMatrix = this.buildDecisionMatrix();
  }

  /**
   * Build comprehensive decision matrix
   * @returns {Array} Decision rules with scoring
   */
  buildDecisionMatrix() {
    return [
      {
        ruleId: 'SIMPLE_FIELD_UPDATES',
        name: 'Simple Field Updates Only',
        recommendation: 'MIGRATE_TO_FLOW',
        confidence: 'HIGH',
        weight: 10,
        criteria: {
          maxComplexity: 3,
          maxDML: 5,
          maxSOQL: 2,
          noCallouts: true,
          noAsyncProcessing: true
        },
        rationale: 'Simple field updates are ideal for Flow - no code maintenance, admin-friendly, declarative logic'
      },
      {
        ruleId: 'RECORD_TRIGGERED_FLOW_PATTERN',
        name: 'Record-Triggered Flow Pattern',
        recommendation: 'MIGRATE_TO_FLOW',
        confidence: 'HIGH',
        weight: 9,
        criteria: {
          maxComplexity: 5,
          singleObjectFocus: true,
          noComplexLooping: true,
          declarativeLogic: true
        },
        rationale: 'Pattern matches record-triggered Flow capabilities - better maintainability, visual debugging'
      },
      {
        ruleId: 'COMPLEX_BUSINESS_LOGIC',
        name: 'Complex Business Logic',
        recommendation: 'KEEP_AS_APEX',
        confidence: 'HIGH',
        weight: 10,
        criteria: {
          minComplexity: 8,
          complexCalculations: true,
          multipleObjectUpdates: true,
          conditionalLogic: 'complex'
        },
        rationale: 'Complex business logic requires Apex for maintainability, debugging, and performance'
      },
      {
        ruleId: 'EXTERNAL_CALLOUTS',
        name: 'External System Integration',
        recommendation: 'KEEP_AS_APEX',
        confidence: 'HIGH',
        weight: 9,
        criteria: {
          hasCallouts: true,
          requiresAsync: true
        },
        rationale: 'External callouts require @future/queueable Apex - Flow cannot handle async processing'
      },
      {
        ruleId: 'HIGH_DML_OPERATIONS',
        name: 'High DML Count',
        recommendation: 'KEEP_AS_APEX',
        confidence: 'MEDIUM',
        weight: 7,
        criteria: {
          minDML: 10,
          bulkProcessing: true
        },
        rationale: 'High DML operations need Apex bulkification patterns - Flow governor limits are stricter'
      },
      {
        ruleId: 'GOVERNOR_LIMIT_RISK',
        name: 'Near Governor Limits',
        recommendation: 'KEEP_AS_APEX',
        confidence: 'HIGH',
        weight: 8,
        criteria: {
          governorLimitPressure: 70, // >70% of limits
          cpuIntensive: true
        },
        rationale: 'Governor limit pressure requires Apex optimization - Flow has less control over resource usage'
      },
      {
        ruleId: 'ERROR_HANDLING_NEEDS',
        name: 'Complex Error Handling',
        recommendation: 'KEEP_AS_APEX',
        confidence: 'MEDIUM',
        weight: 6,
        criteria: {
          requiresTryCatch: true,
          partialSuccessNeeded: true,
          customExceptions: true
        },
        rationale: 'Complex error handling requires try/catch blocks - Flow has limited error recovery'
      },
      {
        ruleId: 'ADMIN_MAINTAINABILITY',
        name: 'Admin-Friendly Maintenance',
        recommendation: 'MIGRATE_TO_FLOW',
        confidence: 'MEDIUM',
        weight: 7,
        criteria: {
          frequentChanges: true,
          businessRulesChange: true,
          noComplexLogic: true
        },
        rationale: 'Frequent business rule changes favor Flow - admins can update without code deployments'
      },
      {
        ruleId: 'HYBRID_OPPORTUNITY',
        name: 'Hybrid Flow + Apex Helper',
        recommendation: 'HYBRID',
        confidence: 'MEDIUM',
        weight: 8,
        criteria: {
          mixedComplexity: true,
          someSimpleLogic: true,
          someComplexLogic: true
        },
        rationale: 'Split into Flow for simple logic + Apex helper for complex operations - best of both worlds'
      },
      {
        ruleId: 'MANAGED_PACKAGE',
        name: 'Managed Package Component',
        recommendation: 'KEEP_AS_APEX',
        confidence: 'HIGH',
        weight: 10,
        criteria: {
          isManaged: true
        },
        rationale: 'Managed package components are read-only - cannot modify or migrate'
      }
    ];
  }

  /**
   * Execute full migration analysis
   * @returns {Object} Complete migration recommendations
   */
  async analyze() {
    console.log(`🔍 Starting migration analysis for org: ${this.orgAlias}\n`);

    try {
      // Phase 1: Load trigger data
      console.log('Phase 1: Loading trigger data...');
      await this.loadTriggerData();
      console.log(`✓ Loaded ${this.triggers.length} triggers\n`);

      // Phase 2: Analyze each trigger
      console.log('Phase 2: Analyzing triggers...');
      this.triggers.forEach(trigger => {
        const recommendation = this.analyzeTrigger(trigger);
        this.recommendations.push(recommendation);
      });
      console.log(`✓ Generated ${this.recommendations.length} recommendations\n`);

      // Phase 3: Generate summary
      console.log('Phase 3: Generating summary...');
      const summary = this.generateSummary();
      this.summary = summary;  // Store summary for generateReport() to access
      console.log(`✓ Summary complete\n`);

      console.log('✅ Migration analysis complete!\n');

      return {
        triggers: this.triggers,
        recommendations: this.recommendations,
        summary: summary,
        decisionMatrix: this.decisionMatrix
      };

    } catch (error) {
      console.error('❌ Migration analysis failed:', error.message);
      throw error;
    }
  }

  /**
   * Load trigger data from org
   */
  async loadTriggerData() {
    const query = `
      SELECT
        Id,
        Name,
        NamespacePrefix,
        TableEnumOrId,
        Status,
        ApiVersion,
        LengthWithoutComments,
        LastModifiedDate
      FROM ApexTrigger
      WHERE Status = 'Active'
      ORDER BY TableEnumOrId, Name
    `;

    try {
      const result = this.executeQuery(query);
      const triggers = JSON.parse(result).result.records;

      this.triggers = triggers.map(trigger => ({
        id: trigger.Id,
        name: trigger.Name,
        namespace: trigger.NamespacePrefix || null,
        object: trigger.TableEnumOrId,
        status: trigger.Status,
        apiVersion: trigger.ApiVersion,
        linesOfCode: trigger.LengthWithoutComments || 0,
        lastModified: trigger.LastModifiedDate,
        isManaged: !!trigger.NamespacePrefix
      }));

    } catch (error) {
      console.error('Error loading trigger data:', error.message);
      this.triggers = [];
    }
  }

  /**
   * Analyze individual trigger for migration recommendation
   * @param {Object} trigger - Trigger data
   * @returns {Object} Migration recommendation
   */
  analyzeTrigger(trigger) {
    // Calculate complexity score based on lines of code
    const complexityScore = this.calculateComplexityScore(trigger);

    // Estimate DML/SOQL counts (heuristic based on LOC)
    const estimatedDML = Math.ceil(trigger.linesOfCode / 50);
    const estimatedSOQL = Math.ceil(trigger.linesOfCode / 70);

    // Build trigger profile
    const profile = {
      trigger: trigger,
      complexity: complexityScore,
      estimatedDML: estimatedDML,
      estimatedSOQL: estimatedSOQL,
      isManaged: trigger.isManaged,
      linesOfCode: trigger.linesOfCode
    };

    // Apply decision matrix
    const matchedRules = this.applyDecisionMatrix(profile);

    // Select best recommendation
    const bestRecommendation = this.selectBestRecommendation(matchedRules);

    return {
      triggerId: trigger.id,
      triggerName: trigger.name,
      object: trigger.object,
      namespace: trigger.namespace,
      recommendation: bestRecommendation.recommendation,
      confidence: bestRecommendation.confidence,
      complexity: complexityScore,
      estimatedEffort: this.estimateEffort(profile, bestRecommendation.recommendation),
      rationale: bestRecommendation.rationale,
      matchedRules: matchedRules.map(r => r.name),
      considerations: this.buildConsiderations(profile, bestRecommendation)
    };
  }

  /**
   * Calculate complexity score (1-10)
   * @param {Object} trigger - Trigger data
   * @returns {number} Complexity score
   */
  calculateComplexityScore(trigger) {
    const loc = trigger.linesOfCode;

    // Complexity tiers based on lines of code
    if (loc < 50) return 2;        // Very simple
    if (loc < 100) return 3;       // Simple
    if (loc < 200) return 5;       // Moderate
    if (loc < 300) return 7;       // Complex
    if (loc < 500) return 8;       // Very complex
    return 10;                      // Extremely complex
  }

  /**
   * Apply decision matrix to trigger profile
   * @param {Object} profile - Trigger profile
   * @returns {Array} Matched rules
   */
  applyDecisionMatrix(profile) {
    const matchedRules = [];

    this.decisionMatrix.forEach(rule => {
      const score = this.scoreRuleMatch(rule, profile);
      if (score > 0) {
        matchedRules.push({
          ...rule,
          matchScore: score,
          appliesTo: profile.trigger.name
        });
      }
    });

    // Sort by match score (weight * confidence)
    return matchedRules.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Score how well a rule matches the trigger profile
   * @param {Object} rule - Decision rule
   * @param {Object} profile - Trigger profile
   * @returns {number} Match score (0-100)
   */
  scoreRuleMatch(rule, profile) {
    const criteria = rule.criteria;
    let matchCount = 0;
    let totalCriteria = 0;

    // Managed package check (highest priority)
    if (criteria.isManaged !== undefined) {
      totalCriteria++;
      if (profile.isManaged === criteria.isManaged) {
        matchCount += 2; // Double weight for managed check
      }
    }

    // Complexity checks
    if (criteria.maxComplexity !== undefined) {
      totalCriteria++;
      if (profile.complexity <= criteria.maxComplexity) matchCount++;
    }
    if (criteria.minComplexity !== undefined) {
      totalCriteria++;
      if (profile.complexity >= criteria.minComplexity) matchCount++;
    }

    // DML/SOQL checks
    if (criteria.maxDML !== undefined) {
      totalCriteria++;
      if (profile.estimatedDML <= criteria.maxDML) matchCount++;
    }
    if (criteria.minDML !== undefined) {
      totalCriteria++;
      if (profile.estimatedDML >= criteria.minDML) matchCount++;
    }
    if (criteria.maxSOQL !== undefined) {
      totalCriteria++;
      if (profile.estimatedSOQL <= criteria.maxSOQL) matchCount++;
    }

    // If no criteria matched, return 0
    if (totalCriteria === 0) return 0;

    // Calculate match percentage and apply rule weight
    const matchPercentage = (matchCount / totalCriteria) * 100;
    return matchPercentage * (rule.weight / 10);
  }

  /**
   * Select best recommendation from matched rules
   * @param {Array} matchedRules - Sorted matched rules
   * @returns {Object} Best recommendation
   */
  selectBestRecommendation(matchedRules) {
    if (matchedRules.length === 0) {
      return {
        recommendation: 'EVALUATE',
        confidence: 'LOW',
        rationale: 'No clear decision criteria matched - requires manual evaluation'
      };
    }

    // Return highest scoring rule
    const topRule = matchedRules[0];
    return {
      recommendation: topRule.recommendation,
      confidence: topRule.confidence,
      rationale: topRule.rationale,
      rule: topRule.name
    };
  }

  /**
   * Estimate migration effort
   * @param {Object} profile - Trigger profile
   * @param {string} recommendation - Migration recommendation
   * @returns {Object} Effort estimate
   */
  estimateEffort(profile, recommendation) {
    let hours = 0;
    let complexity = 'SIMPLE';

    switch (recommendation) {
      case 'MIGRATE_TO_FLOW':
        // Simple migrations: 2-8 hours per trigger
        hours = Math.ceil(profile.complexity * 0.8);
        complexity = profile.complexity <= 3 ? 'SIMPLE' : 'MODERATE';
        break;

      case 'KEEP_AS_APEX':
        // No migration, but document: 1-2 hours
        hours = 1;
        complexity = 'SIMPLE';
        break;

      case 'HYBRID':
        // Hybrid approach: 4-12 hours
        hours = Math.ceil(profile.complexity * 1.2);
        complexity = 'MODERATE';
        break;

      case 'EVALUATE':
        // Deep analysis needed: 2-4 hours
        hours = 3;
        complexity = 'MODERATE';
        break;
    }

    return {
      hours: hours,
      range: `${Math.floor(hours * 0.8)}-${Math.ceil(hours * 1.2)} hours`,
      complexity: complexity
    };
  }

  /**
   * Build considerations for recommendation
   * @param {Object} profile - Trigger profile
   * @param {Object} recommendation - Recommendation details
   * @returns {Array} Considerations
   */
  buildConsiderations(profile, recommendation) {
    const considerations = [];

    // Managed package consideration
    if (profile.isManaged) {
      considerations.push('⚠️ Managed package component - read-only, cannot modify');
    }

    // Complexity consideration
    if (profile.complexity >= 8) {
      considerations.push('⚠️ High complexity - thorough testing required');
    }

    // Performance consideration
    if (profile.estimatedDML > 10 || profile.estimatedSOQL > 8) {
      considerations.push('⚠️ High DML/SOQL usage - governor limit monitoring needed');
    }

    // Migration-specific considerations
    if (recommendation.recommendation === 'MIGRATE_TO_FLOW') {
      considerations.push('✓ Flow Builder provides visual debugging');
      considerations.push('✓ Admin-friendly maintenance without code deployments');
      if (profile.complexity <= 3) {
        considerations.push('✓ Simple logic ideal for declarative Flow');
      }
    }

    if (recommendation.recommendation === 'KEEP_AS_APEX') {
      considerations.push('✓ Apex provides fine-grained control and optimization');
      considerations.push('✓ Better error handling with try/catch blocks');
      if (profile.complexity >= 7) {
        considerations.push('✓ Complex logic more maintainable in code');
      }
    }

    if (recommendation.recommendation === 'HYBRID') {
      considerations.push('✓ Leverage Flow for simple updates');
      considerations.push('✓ Use Apex helper classes for complex operations');
      considerations.push('⚠️ Requires coordination between Flow and Apex');
    }

    return considerations;
  }

  /**
   * Generate summary statistics
   * @returns {Object} Summary data
   */
  generateSummary() {
    const summary = {
      totalTriggers: this.recommendations.length,
      recommendations: {
        MIGRATE_TO_FLOW: 0,
        KEEP_AS_APEX: 0,
        HYBRID: 0,
        EVALUATE: 0
      },
      confidence: {
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0
      },
      totalEffort: {
        hours: 0,
        range: ''
      },
      managedPackages: 0
    };

    this.recommendations.forEach(rec => {
      // Count recommendations
      summary.recommendations[rec.recommendation]++;

      // Count confidence levels
      summary.confidence[rec.confidence]++;

      // Sum effort
      summary.totalEffort.hours += rec.estimatedEffort.hours;

      // Count managed packages
      if (rec.namespace) summary.managedPackages++;
    });

    // Calculate effort range
    const minHours = Math.floor(summary.totalEffort.hours * 0.8);
    const maxHours = Math.ceil(summary.totalEffort.hours * 1.2);
    summary.totalEffort.range = `${minHours}-${maxHours} hours`;

    return summary;
  }

  /**
   * Execute SOQL query against org
   * @param {string} query - SOQL query
   * @returns {string} Query result JSON
   */
  executeQuery(query) {
    const sanitizedQuery = query.replace(/\s+/g, ' ').trim();
    const cmd = `sf data query --query "${sanitizedQuery}" --use-tooling-api --target-org ${this.orgAlias} --json`;

    try {
      return execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
    } catch (error) {
      throw new Error(`Query failed: ${error.message}`);
    }
  }

  /**
   * Export recommendations to CSV
   * @param {string} outputPath - Output directory path
   */
  exportToCSV(outputPath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    const csv = this.generateCSV(this.recommendations, [
      'triggerName',
      'object',
      'namespace',
      'recommendation',
      'confidence',
      'complexity',
      'estimatedEffort',
      'rationale'
    ]);

    const filename = path.join(outputPath, `migration-recommendations-${timestamp}.csv`);
    fs.writeFileSync(filename, csv);

    console.log(`✓ Recommendations exported to ${filename}`);
  }

  /**
   * Generate CSV from data array
   * @param {Array} data - Data array
   * @param {Array} columns - Column names
   * @returns {string} CSV content
   */
  generateCSV(data, columns) {
    const header = columns.join(',');
    const rows = data.map(item => {
      return columns.map(col => {
        let value = item[col];

        // Special handling for effort
        if (col === 'estimatedEffort') {
          value = item.estimatedEffort.range;
        }

        // Escape commas and quotes
        return `"${String(value || '').replace(/"/g, '""')}"`;
      }).join(',');
    });

    return [header, ...rows].join('\n');
  }

  /**
   * Generate detailed report
   * @returns {string} Formatted Markdown report
   */
  generateReport() {
    const { summary } = this;

    let report = `# Migration Rationale Report\n\n`;
    report += `**Org**: ${this.orgAlias}\n`;
    report += `**Date**: ${new Date().toISOString().split('T')[0]}\n\n`;

    report += `## Executive Summary\n\n`;
    report += `- **Total Triggers Analyzed**: ${summary.totalTriggers}\n`;
    report += `- **Migrate to Flow**: ${summary.recommendations.MIGRATE_TO_FLOW} (${Math.round(summary.recommendations.MIGRATE_TO_FLOW / summary.totalTriggers * 100)}%)\n`;
    report += `- **Keep as Apex**: ${summary.recommendations.KEEP_AS_APEX} (${Math.round(summary.recommendations.KEEP_AS_APEX / summary.totalTriggers * 100)}%)\n`;
    report += `- **Hybrid Approach**: ${summary.recommendations.HYBRID} (${Math.round(summary.recommendations.HYBRID / summary.totalTriggers * 100)}%)\n`;
    report += `- **Needs Evaluation**: ${summary.recommendations.EVALUATE} (${Math.round(summary.recommendations.EVALUATE / summary.totalTriggers * 100)}%)\n`;
    report += `- **Managed Packages**: ${summary.managedPackages} (read-only)\n`;
    report += `- **Estimated Effort**: ${summary.totalEffort.range}\n\n`;

    report += `## Confidence Levels\n\n`;
    report += `- **High Confidence**: ${summary.confidence.HIGH} recommendations\n`;
    report += `- **Medium Confidence**: ${summary.confidence.MEDIUM} recommendations\n`;
    report += `- **Low Confidence**: ${summary.confidence.LOW} recommendations\n\n`;

    report += `## Top 10 Migration Candidates\n\n`;
    const migrationCandidates = this.recommendations
      .filter(r => r.recommendation === 'MIGRATE_TO_FLOW')
      .sort((a, b) => a.complexity - b.complexity)
      .slice(0, 10);

    migrationCandidates.forEach((rec, idx) => {
      report += `### ${idx + 1}. ${rec.triggerName} (${rec.object})\n`;
      report += `- **Complexity**: ${rec.complexity}/10\n`;
      report += `- **Confidence**: ${rec.confidence}\n`;
      report += `- **Effort**: ${rec.estimatedEffort.range}\n`;
      report += `- **Rationale**: ${rec.rationale}\n\n`;
    });

    report += `## Triggers to Keep as Apex\n\n`;
    const keepAsApex = this.recommendations
      .filter(r => r.recommendation === 'KEEP_AS_APEX')
      .sort((a, b) => b.complexity - a.complexity)
      .slice(0, 10);

    keepAsApex.forEach((rec, idx) => {
      report += `### ${idx + 1}. ${rec.triggerName} (${rec.object})\n`;
      report += `- **Complexity**: ${rec.complexity}/10\n`;
      report += `- **Rationale**: ${rec.rationale}\n\n`;
    });

    report += `## Decision Matrix\n\n`;
    report += `The following decision rules were applied:\n\n`;
    this.decisionMatrix.forEach(rule => {
      report += `- **${rule.name}**: ${rule.recommendation} (Weight: ${rule.weight}/10)\n`;
      report += `  - ${rule.rationale}\n\n`;
    });

    return report;
  }
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node migration-rationale-engine.js <org-alias> [output-dir]');
    process.exit(1);
  }

  const orgAlias = args[0];
  const outputDir = args[1] || process.cwd();

  (async () => {
    try {
      const engine = new MigrationRationaleEngine(orgAlias);
      const results = await engine.analyze();

      // Export to CSV
      engine.exportToCSV(outputDir);

      // Generate report
      const report = engine.generateReport();
      fs.writeFileSync(
        path.join(outputDir, 'migration-rationale-report.md'),
        report
      );

      // Export full JSON
      const jsonPath = path.join(outputDir, 'migration-rationale.json');
      fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

      // Quality Gate: Validate both report files were created
      const reportPath = path.join(outputDir, 'migration-rationale-report.md');
      if (!fs.existsSync(reportPath) || !fs.existsSync(jsonPath)) {
        throw new Error('Analysis failed: Report files were not created');
      }

      console.log('\n' + report);
      console.log(`\n✅ Analysis complete! Files saved to: ${outputDir}`);

    } catch (error) {
      console.error('\n❌ Analysis failed:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = MigrationRationaleEngine;
