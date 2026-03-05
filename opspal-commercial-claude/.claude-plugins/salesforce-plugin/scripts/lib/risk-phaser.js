/**
 * Risk Phaser - Risk Scoring and Phased Implementation Planning
 *
 * Purpose: Calculates risk scores for automation changes and groups them into
 * Low/Medium/High risk phases for safe, incremental implementation.
 *
 * Risk Factors:
 * - Complexity: How complex is the automation logic?
 * - Criticality: How business-critical is the object/process?
 * - Conflict Count: How many overlapping automations exist?
 * - Governor Limits: How close to resource limits?
 * - User Impact: How many users/processes affected?
 * - Dependencies: How many downstream dependencies?
 *
 * Risk Levels:
 * - LOW (0-33): Safe for quick implementation, minimal testing
 * - MEDIUM (34-66): Requires thorough testing in sandbox
 * - HIGH (67-100): Requires extensive testing, phased rollout, rollback plan
 *
 * Implementation Phases:
 * - Phase 1 (Week 1-2): Low-risk changes
 * - Phase 2 (Week 3-5): Medium-risk changes
 * - Phase 3 (Week 6-10): High-risk changes with extensive validation
 *
 * @author Automation Audit System v2.0
 * @version 2.0.0
 * @date 2025-10-09
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class RiskPhaser {
  constructor(orgAlias, conflictsData = null, cascadeData = null, namespaceData = null) {
    this.orgAlias = orgAlias;
    this.conflictsData = conflictsData;
    this.cascadeData = cascadeData;
    this.namespaceData = namespaceData;
    this.components = [];
    this.phases = {
      LOW: [],
      MEDIUM: [],
      HIGH: []
    };
    this.criticalObjects = this.identifyCriticalObjects();
  }

  /**
   * Identify business-critical objects
   * @returns {Set} Set of critical object names
   */
  identifyCriticalObjects() {
    return new Set([
      // Revenue-critical objects
      'Opportunity',
      'OpportunityLineItem',
      'Quote',
      'SBQQ__Quote__c',
      'SBQQ__QuoteLine__c',
      'Order',
      'OrderItem',
      'Contract',

      // Customer-critical objects
      'Account',
      'Contact',
      'Lead',
      'Case',

      // Post-close critical
      'SBQQ__Subscription__c',
      'Asset',
      'Entitlement',

      // Financial
      'Invoice__c',
      'Payment__c',
      'PricebookEntry',
      'Product2'
    ]);
  }

  /**
   * Execute full risk analysis and phasing
   * @returns {Object} Complete phased implementation plan
   */
  async analyze() {
    console.log(`🔍 Starting risk analysis for org: ${this.orgAlias}\n`);

    try {
      // Phase 1: Load components
      console.log('Phase 1: Loading automation components...');
      await this.loadComponents();
      console.log(`✓ Loaded ${this.components.length} components\n`);

      // Phase 2: Calculate risk scores
      console.log('Phase 2: Calculating risk scores...');
      this.components.forEach(component => {
        component.riskScore = this.calculateRiskScore(component);
        component.riskLevel = this.determineRiskLevel(component.riskScore);
      });
      console.log(`✓ Risk scores calculated\n`);

      // Phase 3: Group into phases
      console.log('Phase 3: Grouping into implementation phases...');
      this.groupIntoPhases();
      console.log(`✓ Phases generated\n`);

      // Phase 4: Generate timeline
      console.log('Phase 4: Generating implementation timeline...');
      const timeline = this.generateTimeline();
      console.log(`✓ Timeline complete\n`);

      console.log('✅ Risk analysis complete!\n');

      return {
        components: this.components,
        phases: this.phases,
        timeline: timeline,
        summary: this.generateSummary()
      };

    } catch (error) {
      console.error('❌ Risk analysis failed:', error.message);
      throw error;
    }
  }

  /**
   * Load automation components
   */
  async loadComponents() {
    // Use v1 results if available (passed as conflictsData parameter)
    if (this.conflictsData && (this.conflictsData.triggers || this.conflictsData.flows)) {
      console.log('Loading components from v1 results...');

      // Load triggers from v1
      if (this.conflictsData.triggers) {
        this.conflictsData.triggers.forEach(trigger => {
          this.components.push({
            id: trigger.Id,
            name: trigger.Name,
            type: 'ApexTrigger',
            object: trigger.TableEnumOrId,
            namespace: trigger.NamespacePrefix || null,
            complexity: Math.ceil((trigger.LengthWithoutComments || 0) / 50),
            isManaged: !!trigger.NamespacePrefix,
            lastModified: trigger.LastModifiedDate
          });
        });
      }

      // Load flows from v1
      if (this.conflictsData.flows) {
        this.conflictsData.flows.forEach(flow => {
          this.components.push({
            id: flow.ActiveVersionId || flow.Id,
            name: flow.DeveloperName || flow.MasterLabel,
            type: 'Flow',
            processType: flow.ProcessType,
            namespace: flow.NamespacePrefix || null,
            complexity: 5, // Default complexity for flows
            isManaged: !!flow.NamespacePrefix,
            lastModified: flow.LastModifiedDate
          });
        });
      }

      console.log(`✓ Loaded ${this.components.length} components from v1 results`);
      return;
    }

    // Fallback: Query org directly if v1 results not available
    console.log('Loading components via direct queries...');

    // Load triggers
    const triggersQuery = `
      SELECT
        Id,
        Name,
        NamespacePrefix,
        TableEnumOrId,
        Status,
        LengthWithoutComments,
        LastModifiedDate
      FROM ApexTrigger
      WHERE Status = 'Active'
      ORDER BY TableEnumOrId
    `;

    // Load flows
    const flowsQuery = `
      SELECT
        DurableId,
        ActiveVersionId,
        DeveloperName,
        NamespacePrefix,
        ProcessType,
        LastModifiedDate
      FROM FlowDefinitionView
      WHERE IsActive = true
      ORDER BY DeveloperName
    `;

    try {
      // Load triggers
      const triggerResult = this.executeQuery(triggersQuery);
      const triggers = JSON.parse(triggerResult).result.records;

      triggers.forEach(trigger => {
        this.components.push({
          id: trigger.Id,
          name: trigger.Name,
          type: 'ApexTrigger',
          object: trigger.TableEnumOrId,
          namespace: trigger.NamespacePrefix || null,
          complexity: Math.ceil((trigger.LengthWithoutComments || 0) / 50),
          isManaged: !!trigger.NamespacePrefix,
          lastModified: trigger.LastModifiedDate
        });
      });

      // Load flows
      const flowResult = this.executeQuery(flowsQuery);
      const flows = JSON.parse(flowResult).result.records;

      flows.forEach(flow => {
        this.components.push({
          id: flow.DurableId,
          name: flow.DeveloperName,
          type: 'Flow',
          processType: flow.ProcessType,
          namespace: flow.NamespacePrefix || null,
          complexity: 5, // Default complexity for flows
          isManaged: !!flow.NamespacePrefix,
          lastModified: flow.LastModifiedDate
        });
      });

      console.log(`✓ Loaded ${this.components.length} components via queries`);

    } catch (error) {
      console.error('Error loading components:', error.message);
      this.components = [];
    }
  }

  /**
   * Calculate comprehensive risk score (0-100)
   * @param {Object} component - Component data
   * @returns {number} Risk score
   */
  calculateRiskScore(component) {
    let score = 0;

    // Factor 1: Complexity (0-20 points)
    const complexityScore = Math.min(component.complexity * 2, 20);
    score += complexityScore;

    // Factor 2: Business Criticality (0-25 points)
    const criticalityScore = this.calculateCriticalityScore(component);
    score += criticalityScore;

    // Factor 3: Conflict Count (0-20 points)
    const conflictScore = this.calculateConflictScore(component);
    score += conflictScore;

    // Factor 4: Governor Limit Pressure (0-15 points)
    const governorScore = this.calculateGovernorScore(component);
    score += governorScore;

    // Factor 5: Managed Package (0-10 points)
    if (component.isManaged) {
      score += 10; // Higher risk if modifying around managed code
    }

    // Factor 6: Age/Stability (0-10 points)
    const ageScore = this.calculateAgeScore(component);
    score += ageScore;

    return Math.min(Math.round(score), 100);
  }

  /**
   * Calculate criticality score based on object importance
   * @param {Object} component - Component data
   * @returns {number} Criticality score (0-25)
   */
  calculateCriticalityScore(component) {
    const object = component.object || '';

    // Critical revenue objects
    if (this.criticalObjects.has(object)) {
      return 25;
    }

    // CPQ objects (very critical)
    if (object.includes('SBQQ__Quote') || object.includes('SBQQ__Subscription')) {
      return 25;
    }

    // Standard but less critical
    if (['Task', 'Event', 'EmailMessage'].includes(object)) {
      return 10;
    }

    // Custom objects (medium criticality)
    if (object.endsWith('__c')) {
      return 15;
    }

    return 5; // Default low criticality
  }

  /**
   * Calculate conflict score
   * @param {Object} component - Component data
   * @returns {number} Conflict score (0-20)
   */
  calculateConflictScore(component) {
    // Check if conflicts data exists (from v1 results)
    const conflicts = this.conflictsData?.conflicts;
    if (!conflicts || !Array.isArray(conflicts)) {
      return 0;
    }

    // Find conflicts related to this component
    const relatedConflicts = conflicts.filter(conflict =>
      conflict.components && conflict.components.some(c => c.name === component.name)
    );

    if (relatedConflicts.length === 0) return 0;
    if (relatedConflicts.length <= 2) return 5;
    if (relatedConflicts.length <= 5) return 10;
    if (relatedConflicts.length <= 10) return 15;
    return 20;
  }

  /**
   * Calculate governor limit pressure score
   * @param {Object} component - Component data
   * @returns {number} Governor score (0-15)
   */
  calculateGovernorScore(component) {
    if (!this.cascadeData || !this.cascadeData.cascades) {
      // Estimate based on complexity
      if (component.complexity > 8) return 15;
      if (component.complexity > 5) return 10;
      return 5;
    }

    // Find cascade chains involving this component
    const relatedCascades = this.cascadeData.cascades.filter(cascade =>
      cascade.nodes.some(node => node.name === component.name)
    );

    if (relatedCascades.length === 0) return 0;

    // Find highest governor limit pressure
    const maxPressure = Math.max(
      ...relatedCascades.map(c => c.governorLimitPressure || 0)
    );

    if (maxPressure > 80) return 15;
    if (maxPressure > 60) return 10;
    if (maxPressure > 40) return 5;
    return 2;
  }

  /**
   * Calculate age/stability score
   * @param {Object} component - Component data
   * @returns {number} Age score (0-10)
   */
  calculateAgeScore(component) {
    if (!component.lastModified) return 5; // Unknown age = medium risk

    const lastModified = new Date(component.lastModified);
    const ageInDays = (Date.now() - lastModified.getTime()) / (1000 * 60 * 60 * 24);

    // Older = more stable = lower risk
    if (ageInDays > 365) return 0;  // >1 year old, very stable
    if (ageInDays > 180) return 3;  // 6-12 months, stable
    if (ageInDays > 90) return 5;   // 3-6 months, moderately stable
    if (ageInDays > 30) return 7;   // 1-3 months, newer
    return 10;                       // <1 month, very new, higher risk
  }

  /**
   * Determine risk level from score
   * @param {number} score - Risk score
   * @returns {string} Risk level
   */
  determineRiskLevel(score) {
    if (score <= 33) return 'LOW';
    if (score <= 66) return 'MEDIUM';
    return 'HIGH';
  }

  /**
   * Group components into implementation phases
   */
  groupIntoPhases() {
    this.components.forEach(component => {
      const level = component.riskLevel;
      this.phases[level].push(component);
    });

    // Sort each phase by risk score (lowest first)
    Object.keys(this.phases).forEach(level => {
      this.phases[level].sort((a, b) => a.riskScore - b.riskScore);
    });
  }

  /**
   * Generate implementation timeline
   * @returns {Object} Timeline with phases
   */
  generateTimeline() {
    const timeline = {
      phases: [
        {
          phaseNumber: 1,
          name: 'Low-Risk Quick Wins',
          riskLevel: 'LOW',
          duration: '1-2 weeks',
          components: this.phases.LOW.length,
          description: 'Safe, straightforward changes with minimal testing requirements',
          activities: [
            'Deploy in sandbox',
            'Basic smoke testing',
            'Deploy to production',
            'Monitor for 24 hours'
          ],
          rollbackStrategy: 'Simple rollback if issues detected',
          estimatedEffort: this.calculatePhaseEffort(this.phases.LOW)
        },
        {
          phaseNumber: 2,
          name: 'Medium-Risk Core Changes',
          riskLevel: 'MEDIUM',
          duration: '3-5 weeks',
          components: this.phases.MEDIUM.length,
          description: 'Moderate complexity changes requiring thorough testing',
          activities: [
            'Deploy in sandbox',
            'Comprehensive testing (unit + integration)',
            'User acceptance testing (UAT)',
            'Deploy to production (staged)',
            'Monitor for 1 week'
          ],
          rollbackStrategy: 'Prepared rollback package, tested in sandbox',
          estimatedEffort: this.calculatePhaseEffort(this.phases.MEDIUM)
        },
        {
          phaseNumber: 3,
          name: 'High-Risk Critical Changes',
          riskLevel: 'HIGH',
          duration: '6-10 weeks',
          components: this.phases.HIGH.length,
          description: 'Complex, business-critical changes requiring extensive validation',
          activities: [
            'Deploy in sandbox',
            'Extensive testing (unit + integration + performance)',
            'User acceptance testing (UAT) with stakeholders',
            'Pilot deployment (subset of users)',
            'Full production deployment',
            'Extended monitoring (2-4 weeks)',
            'Post-deployment review'
          ],
          rollbackStrategy: 'Comprehensive rollback plan with tested procedures',
          estimatedEffort: this.calculatePhaseEffort(this.phases.HIGH)
        }
      ],
      totalDuration: '10-17 weeks',
      totalComponents: this.components.length,
      totalEffort: this.calculateTotalEffort()
    };

    return timeline;
  }

  /**
   * Calculate effort for a phase
   * @param {Array} components - Phase components
   * @returns {Object} Effort estimate
   */
  calculatePhaseEffort(components) {
    const hours = components.reduce((sum, c) => {
      // Base effort by complexity
      let componentHours = c.complexity * 2;

      // Add testing overhead by risk
      if (c.riskLevel === 'LOW') componentHours *= 1.2;
      if (c.riskLevel === 'MEDIUM') componentHours *= 1.5;
      if (c.riskLevel === 'HIGH') componentHours *= 2.0;

      return sum + componentHours;
    }, 0);

    const minHours = Math.floor(hours * 0.8);
    const maxHours = Math.ceil(hours * 1.2);

    return {
      hours: Math.round(hours),
      range: `${minHours}-${maxHours} hours`,
      days: Math.round(hours / 8),
      complexity: components.length > 20 ? 'HIGH' : components.length > 10 ? 'MEDIUM' : 'LOW'
    };
  }

  /**
   * Calculate total effort across all phases
   * @returns {Object} Total effort
   */
  calculateTotalEffort() {
    const lowEffort = this.calculatePhaseEffort(this.phases.LOW);
    const mediumEffort = this.calculatePhaseEffort(this.phases.MEDIUM);
    const highEffort = this.calculatePhaseEffort(this.phases.HIGH);

    const totalHours = lowEffort.hours + mediumEffort.hours + highEffort.hours;
    const minHours = Math.floor(totalHours * 0.8);
    const maxHours = Math.ceil(totalHours * 1.2);

    return {
      hours: totalHours,
      range: `${minHours}-${maxHours} hours`,
      days: Math.round(totalHours / 8),
      weeks: Math.round(totalHours / 40)
    };
  }

  /**
   * Generate summary statistics
   * @returns {Object} Summary data
   */
  generateSummary() {
    const summary = {
      totalComponents: this.components.length,
      riskDistribution: {
        LOW: this.phases.LOW.length,
        MEDIUM: this.phases.MEDIUM.length,
        HIGH: this.phases.HIGH.length
      },
      riskPercentages: {
        LOW: Math.round((this.phases.LOW.length / this.components.length) * 100),
        MEDIUM: Math.round((this.phases.MEDIUM.length / this.components.length) * 100),
        HIGH: Math.round((this.phases.HIGH.length / this.components.length) * 100)
      },
      averageRiskScore: Math.round(
        this.components.reduce((sum, c) => sum + c.riskScore, 0) / this.components.length
      ),
      criticalComponents: this.components.filter(c =>
        this.criticalObjects.has(c.object || '')
      ).length,
      managedComponents: this.components.filter(c => c.isManaged).length
    };

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
   * Export phases to CSV
   * @param {string} outputPath - Output directory path
   */
  exportToCSV(outputPath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Export all components with risk scores
    const allComponents = this.generateCSV(this.components, [
      'name',
      'type',
      'object',
      'riskScore',
      'riskLevel',
      'complexity',
      'namespace'
    ]);

    fs.writeFileSync(
      path.join(outputPath, `risk-scored-components-${timestamp}.csv`),
      allComponents
    );

    // Export each phase separately
    ['LOW', 'MEDIUM', 'HIGH'].forEach(level => {
      const phaseCSV = this.generateCSV(this.phases[level], [
        'name',
        'type',
        'object',
        'riskScore',
        'complexity'
      ]);

      fs.writeFileSync(
        path.join(outputPath, `phase-${level}-${timestamp}.csv`),
        phaseCSV
      );
    });

    console.log(`✓ Phase files exported to ${outputPath}`);
  }

  /**
   * Generate CSV from data array
   * @param {Array} data - Data array
   * @param {Array} columns - Column names
   * @returns {string} CSV content
   */
  generateCSV(data, columns) {
    const header = columns.join(',');
    const rows = data.map(item =>
      columns.map(col => {
        const value = item[col] || '';
        // Escape commas and quotes
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(',')
    );

    return [header, ...rows].join('\n');
  }

  /**
   * Generate detailed report
   * @returns {string} Formatted Markdown report
   */
  generateReport() {
    const timeline = this.generateTimeline();
    const summary = this.generateSummary();

    let report = `# Risk-Based Implementation Plan\n\n`;
    report += `**Org**: ${this.orgAlias}\n`;
    report += `**Date**: ${new Date().toISOString().split('T')[0]}\n\n`;

    report += `## Executive Summary\n\n`;
    report += `- **Total Components**: ${summary.totalComponents}\n`;
    report += `- **Low Risk**: ${summary.riskDistribution.LOW} (${summary.riskPercentages.LOW}%)\n`;
    report += `- **Medium Risk**: ${summary.riskDistribution.MEDIUM} (${summary.riskPercentages.MEDIUM}%)\n`;
    report += `- **High Risk**: ${summary.riskDistribution.HIGH} (${summary.riskPercentages.HIGH}%)\n`;
    report += `- **Average Risk Score**: ${summary.averageRiskScore}/100\n`;
    report += `- **Critical Components**: ${summary.criticalComponents}\n`;
    report += `- **Managed Components**: ${summary.managedComponents}\n\n`;

    report += `## Implementation Timeline\n\n`;
    report += `**Total Duration**: ${timeline.totalDuration}\n`;
    report += `**Total Effort**: ${timeline.totalEffort.range} (${timeline.totalEffort.weeks} weeks)\n\n`;

    timeline.phases.forEach(phase => {
      report += `### Phase ${phase.phaseNumber}: ${phase.name}\n\n`;
      report += `- **Risk Level**: ${phase.riskLevel}\n`;
      report += `- **Duration**: ${phase.duration}\n`;
      report += `- **Components**: ${phase.components}\n`;
      report += `- **Effort**: ${phase.estimatedEffort.range}\n`;
      report += `- **Description**: ${phase.description}\n\n`;

      report += `**Activities**:\n`;
      phase.activities.forEach(activity => {
        report += `- ${activity}\n`;
      });
      report += `\n**Rollback Strategy**: ${phase.rollbackStrategy}\n\n`;
    });

    report += `## Risk Distribution\n\n`;
    report += `\`\`\`\n`;
    report += `LOW    (0-33):  ${'█'.repeat(summary.riskPercentages.LOW / 2)} ${summary.riskPercentages.LOW}%\n`;
    report += `MEDIUM (34-66): ${'█'.repeat(summary.riskPercentages.MEDIUM / 2)} ${summary.riskPercentages.MEDIUM}%\n`;
    report += `HIGH   (67-100): ${'█'.repeat(summary.riskPercentages.HIGH / 2)} ${summary.riskPercentages.HIGH}%\n`;
    report += `\`\`\`\n\n`;

    report += `## Top 10 Highest Risk Components\n\n`;
    const highestRisk = this.components
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10);

    highestRisk.forEach((component, idx) => {
      report += `${idx + 1}. **${component.name}** (${component.object})\n`;
      report += `   - Risk Score: ${component.riskScore}/100 (${component.riskLevel})\n`;
      report += `   - Complexity: ${component.complexity}/10\n`;
      if (component.namespace) {
        report += `   - Managed Package: ${component.namespace}\n`;
      }
      report += `\n`;
    });

    return report;
  }
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node risk-phaser.js <org-alias> [output-dir]');
    process.exit(1);
  }

  const orgAlias = args[0];
  const outputDir = args[1] || process.cwd();

  (async () => {
    try {
      const phaser = new RiskPhaser(orgAlias);
      const results = await phaser.analyze();

      // Export to CSV
      phaser.exportToCSV(outputDir);

      // Generate report
      const report = phaser.generateReport();
      fs.writeFileSync(
        path.join(outputDir, 'risk-based-implementation-plan.md'),
        report
      );

      // Export full JSON
      const jsonPath = path.join(outputDir, 'risk-analysis.json');
      fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

      // Quality Gate: Validate both report files were created
      const reportPath = path.join(outputDir, 'risk-analysis-report.md');
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

module.exports = RiskPhaser;
