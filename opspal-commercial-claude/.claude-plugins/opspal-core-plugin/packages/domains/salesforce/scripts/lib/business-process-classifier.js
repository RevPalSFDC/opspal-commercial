/**
 * Business Process Classifier - Auto-classify Automation by Business Context
 *
 * Purpose: Tags automation components with business process stage and department ownership.
 * Provides business context to technical automation inventory for stakeholder reporting.
 *
 * Business Stages:
 * - Top of Funnel: Lead generation, marketing campaigns, prospect engagement
 * - Sales Cycle: Opportunity management, quoting, contract negotiation
 * - Post-Close: Onboarding, support, renewals, customer success
 *
 * Departments:
 * - Marketing Operations: Campaign, lead, attribution automation
 * - Sales Operations: Opportunity, quote, territory, forecast automation
 * - Customer Success: Case, renewal, subscription, support automation
 * - Finance/RevOps: Billing, invoicing, revenue recognition
 * - IT/Systems: Integration, logging, data sync, system maintenance
 *
 * @author Automation Audit System v2.0
 * @version 2.0.0
 * @date 2025-10-09
 */

class BusinessProcessClassifier {
  constructor() {
    this.classificationRules = this.buildClassificationRules();
    this.manualOverrides = {};
  }

  /**
   * Classify automation component
   * @param {Object} component - Automation component (trigger, flow, class)
   * @returns {Object} Classification with stage and department
   */
  classify(component) {
    const object = component.object || component.TableEnumOrId || this.inferObjectFromName(component.name);

    // Check manual overrides first
    if (this.manualOverrides[component.name]) {
      return this.manualOverrides[component.name];
    }

    // Apply classification rules
    for (const rule of this.classificationRules) {
      if (this.matchesRule(object, component, rule)) {
        return {
          businessStage: rule.stage,
          department: rule.department,
          confidence: rule.confidence || 'HIGH',
          rationale: rule.rationale,
          object: object
        };
      }
    }

    // Default fallback
    return {
      businessStage: 'Unknown',
      department: 'IT/Systems',
      confidence: 'LOW',
      rationale: 'No matching classification rule - defaulting to IT/Systems',
      object: object
    };
  }

  /**
   * Classify multiple components
   * @param {Array} components - Array of automation components
   * @returns {Array} Components with classifications
   */
  classifyAll(components) {
    return components.map(component => ({
      ...component,
      classification: this.classify(component)
    }));
  }

  /**
   * Build classification rules
   * @returns {Array} Classification rules
   */
  buildClassificationRules() {
    return [
      // ============================================
      // TOP OF FUNNEL (Lead Generation & Marketing)
      // ============================================
      {
        stage: 'Top of Funnel',
        department: 'Marketing Operations',
        patterns: ['Lead', 'Campaign', 'CampaignMember'],
        confidence: 'HIGH',
        rationale: 'Lead and campaign management is marketing territory'
      },
      {
        stage: 'Top of Funnel',
        department: 'Marketing Operations',
        patterns: ['et4ae5', 'Marketing'],
        confidence: 'HIGH',
        rationale: 'Marketing Cloud automation for email campaigns and journeys'
      },
      {
        stage: 'Top of Funnel',
        department: 'Marketing Operations',
        patterns: ['Web.*Lead', '.*WebToLead', 'FormSubmission'],
        confidence: 'HIGH',
        rationale: 'Web lead capture and form processing'
      },

      // ============================================
      // SALES CYCLE (Opportunity to Close)
      // ============================================
      {
        stage: 'Sales Cycle',
        department: 'Sales Operations',
        patterns: ['Opportunity', 'OpportunityLineItem', 'Quote', 'Proposal'],
        confidence: 'HIGH',
        rationale: 'Opportunity and quoting is core sales process'
      },
      {
        stage: 'Sales Cycle',
        department: 'Sales Operations',
        patterns: ['SBQQ', 'CPQ'],
        confidence: 'HIGH',
        rationale: 'Salesforce CPQ for quote configuration and pricing'
      },
      {
        stage: 'Sales Cycle',
        department: 'Sales Operations',
        patterns: ['Contract(?!.*Renewal)'],
        confidence: 'HIGH',
        rationale: 'Initial contract creation during sales cycle'
      },
      {
        stage: 'Sales Cycle',
        department: 'Sales Operations',
        patterns: ['Territory', 'LeadAssignment', 'OpportunityTeam'],
        confidence: 'MEDIUM',
        rationale: 'Territory and assignment automation for sales teams'
      },

      // ============================================
      // POST-CLOSE (Customer Success & Support)
      // ============================================
      {
        stage: 'Post-Close',
        department: 'Customer Success',
        patterns: ['Case', 'Support', 'Ticket', 'Incident'],
        confidence: 'HIGH',
        rationale: 'Case management and customer support'
      },
      {
        stage: 'Post-Close',
        department: 'Customer Success',
        patterns: ['Subscription', 'Renewal', 'Contract.*Renewal'],
        confidence: 'HIGH',
        rationale: 'Subscription and renewal management post-sale'
      },
      {
        stage: 'Post-Close',
        department: 'Customer Success',
        patterns: ['Onboarding', 'Implementation', 'Training'],
        confidence: 'HIGH',
        rationale: 'Customer onboarding and implementation'
      },
      {
        stage: 'Post-Close',
        department: 'Customer Success',
        patterns: ['.*Health.*Score', 'NPS', 'CSAT', 'Churn'],
        confidence: 'MEDIUM',
        rationale: 'Customer health and satisfaction tracking'
      },

      // ============================================
      // FINANCE/REVOPS (Billing & Revenue)
      // ============================================
      {
        stage: 'Post-Close',
        department: 'Finance/RevOps',
        patterns: ['Invoice', 'Billing', 'Payment', 'Revenue'],
        confidence: 'HIGH',
        rationale: 'Financial operations and revenue recognition'
      },
      {
        stage: 'Sales Cycle',
        department: 'Finance/RevOps',
        patterns: ['Forecast', 'Quota', 'Commission'],
        confidence: 'HIGH',
        rationale: 'Sales forecasting and compensation'
      },

      // ============================================
      // CROSS-FUNCTIONAL (Account & Contact)
      // ============================================
      {
        stage: 'Sales Cycle',
        department: 'Sales Operations',
        patterns: ['Account(?!.*Product)', 'Contact(?!.*Assignment)'],
        confidence: 'MEDIUM',
        rationale: 'Account and contact management spans sales and success - defaulting to sales'
      },

      // ============================================
      // IT/SYSTEMS (Integration & Infrastructure)
      // ============================================
      {
        stage: 'Infrastructure',
        department: 'IT/Systems',
        patterns: ['.*Sync', '.*Integration', 'API', 'Webhook', 'External'],
        confidence: 'HIGH',
        rationale: 'Integration and data synchronization'
      },
      {
        stage: 'Infrastructure',
        department: 'IT/Systems',
        patterns: ['Log', 'Debug', 'Audit', 'Error', 'Monitor'],
        confidence: 'HIGH',
        rationale: 'Logging, debugging, and system monitoring'
      },
      {
        stage: 'Infrastructure',
        department: 'IT/Systems',
        patterns: ['Batch', 'Schedule', 'Async', 'Job'],
        confidence: 'MEDIUM',
        rationale: 'Scheduled and asynchronous processing'
      },

      // ============================================
      // SPECIALIZED OBJECTS
      // ============================================
      {
        stage: 'Sales Cycle',
        department: 'Sales Operations',
        patterns: ['Product', 'PricebookEntry', 'Pricebook'],
        confidence: 'HIGH',
        rationale: 'Product catalog and pricing management'
      },
      {
        stage: 'Post-Close',
        department: 'Customer Success',
        patterns: ['Asset', 'Entitlement', 'ServiceContract'],
        confidence: 'HIGH',
        rationale: 'Asset and entitlement management post-sale'
      },
      {
        stage: 'Top of Funnel',
        department: 'Marketing Operations',
        patterns: ['.*Marketing.*', 'Webinar', 'Event(?!.*Case)'],
        confidence: 'MEDIUM',
        rationale: 'Marketing events and programs'
      }
    ];
  }

  /**
   * Check if component matches classification rule
   * @param {string} object - Object API name
   * @param {Object} component - Component data
   * @param {Object} rule - Classification rule
   * @returns {boolean} True if matches
   */
  matchesRule(object, component, rule) {
    if (!object) return false;

    for (const pattern of rule.patterns) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(object) || regex.test(component.name || '')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Infer object name from component name (for classes without explicit object)
   * @param {string} name - Component name
   * @returns {string} Inferred object name
   */
  inferObjectFromName(name) {
    // Common patterns: AccountTrigger → Account, ContactHelper → Contact
    const patterns = [
      { regex: /^([A-Z][a-zA-Z0-9_]+)Trigger$/, group: 1 },
      { regex: /^([A-Z][a-zA-Z0-9_]+)Handler$/, group: 1 },
      { regex: /^([A-Z][a-zA-Z0-9_]+)Helper$/, group: 1 },
      { regex: /^([A-Z][a-zA-Z0-9_]+)Controller$/, group: 1 },
      { regex: /^([A-Z][a-zA-Z0-9_]+)Service$/, group: 1 },
      { regex: /^([A-Z][a-zA-Z0-9_]+)Util/, group: 1 }
    ];

    for (const { regex, group } of patterns) {
      const match = name.match(regex);
      if (match && match[group]) {
        return match[group];
      }
    }

    return name;
  }

  /**
   * Load manual overrides from config file
   * @param {string} configPath - Path to override config JSON
   */
  loadOverrides(configPath) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      this.manualOverrides = config.overrides || {};
      console.log(`✓ Loaded ${Object.keys(this.manualOverrides).length} manual overrides`);
    } catch (error) {
      console.warn(`⚠ Could not load overrides from ${configPath}: ${error.message}`);
    }
  }

  /**
   * Generate classification summary
   * @param {Array} classifiedComponents - Components with classifications
   * @returns {Object} Summary statistics
   */
  generateClassificationSummary(classifiedComponents) {
    const byStage = {};
    const byDepartment = {};
    const byConfidence = {};

    classifiedComponents.forEach(component => {
      const { businessStage, department, confidence } = component.classification;

      // Count by stage
      byStage[businessStage] = (byStage[businessStage] || 0) + 1;

      // Count by department
      byDepartment[department] = (byDepartment[department] || 0) + 1;

      // Count by confidence
      byConfidence[confidence] = (byConfidence[confidence] || 0) + 1;
    });

    return {
      totalComponents: classifiedComponents.length,
      byStage: Object.entries(byStage)
        .sort((a, b) => b[1] - a[1])
        .map(([stage, count]) => ({ stage, count, percentage: Math.round(count / classifiedComponents.length * 100) })),
      byDepartment: Object.entries(byDepartment)
        .sort((a, b) => b[1] - a[1])
        .map(([dept, count]) => ({ department: dept, count, percentage: Math.round(count / classifiedComponents.length * 100) })),
      byConfidence: byConfidence,
      lowConfidenceCount: byConfidence['LOW'] || 0,
      lowConfidencePercentage: Math.round(((byConfidence['LOW'] || 0) / classifiedComponents.length) * 100)
    };
  }

  /**
   * Export classification to CSV
   * @param {Array} classifiedComponents - Components with classifications
   * @param {string} outputPath - Output directory
   */
  exportToCSV(classifiedComponents, outputPath) {
    const timestamp = new Date().toISOString().split('T')[0];

    const rows = classifiedComponents.map(c => [
      c.object || c.TableEnumOrId || '',
      c.type,
      c.name,
      c.active !== undefined ? c.active : c.Status === 'Active',
      c.namespace || '',
      c.packageType || 'CUSTOM',
      c.classification.businessStage,
      c.classification.department,
      c.classification.confidence,
      c.classification.rationale
    ]);

    const header = [
      'Object', 'Type', 'Name', 'Active', 'Namespace', 'Managed/Custom',
      'Stage', 'Department', 'Confidence', 'Rationale'
    ];

    const csv = [header, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const fs = require('fs');
    const path = require('path');
    fs.writeFileSync(
      path.join(outputPath, `automation-inventory-classified-${timestamp}.csv`),
      csv
    );

    console.log(`✓ Classified inventory exported to ${outputPath}`);
  }

  /**
   * Generate classification summary report
   * @param {Array} classifiedComponents - Components with classifications
   * @returns {string} Markdown report
   */
  generateSummaryReport(classifiedComponents) {
    const summary = this.generateClassificationSummary(classifiedComponents);

    let report = `# Business Process Classification Summary\n\n`;
    report += `**Total Components Classified**: ${summary.totalComponents}\n`;
    report += `**Date**: ${new Date().toISOString().split('T')[0]}\n\n`;

    report += `## By Business Stage\n\n`;
    summary.byStage.forEach(({ stage, count, percentage }) => {
      report += `- **${stage}**: ${count} components (${percentage}%)\n`;
    });

    report += `\n## By Department\n\n`;
    summary.byDepartment.forEach(({ department, count, percentage }) => {
      report += `- **${department}**: ${count} components (${percentage}%)\n`;
    });

    report += `\n## Classification Confidence\n\n`;
    report += `- **HIGH**: ${summary.byConfidence.HIGH || 0} (${Math.round(((summary.byConfidence.HIGH || 0) / summary.totalComponents) * 100)}%)\n`;
    report += `- **MEDIUM**: ${summary.byConfidence.MEDIUM || 0} (${Math.round(((summary.byConfidence.MEDIUM || 0) / summary.totalComponents) * 100)}%)\n`;
    report += `- **LOW**: ${summary.byConfidence.LOW || 0} (${summary.lowConfidencePercentage}%)\n\n`;

    if (summary.lowConfidencePercentage > 15) {
      report += `⚠️ **${summary.lowConfidencePercentage}% low confidence** - Consider adding manual overrides for these components\n\n`;
    }

    report += `## Key Insights\n\n`;

    const topStage = summary.byStage[0];
    if (topStage) {
      report += `📊 **Primary business stage**: ${topStage.stage} (${topStage.percentage}% of automation)\n\n`;
    }

    const topDept = summary.byDepartment[0];
    if (topDept) {
      report += `👥 **Primary owner**: ${topDept.department} (${topDept.percentage}% of automation)\n\n`;
    }

    report += `## Recommendations\n\n`;

    if (summary.lowConfidenceCount > 0) {
      report += `1. **Review ${summary.lowConfidenceCount} low-confidence classifications** - Add manual overrides for accurate stakeholder reporting\n`;
    }

    const salesOps = summary.byDepartment.find(d => d.department === 'Sales Operations');
    if (salesOps && salesOps.percentage > 40) {
      report += `2. **Sales Operations owns ${salesOps.percentage}% of automation** - Focus remediation efforts here for maximum business impact\n`;
    }

    const itSystems = summary.byDepartment.find(d => d.department === 'IT/Systems');
    if (itSystems && itSystems.percentage > 25) {
      report += `3. **IT/Systems has ${itSystems.percentage}% of automation** - Potential candidates for consolidation or deactivation\n`;
    }

    return report;
  }

  /**
   * Generate department-specific reports
   * @param {Array} classifiedComponents - Components with classifications
   * @param {string} outputPath - Output directory
   */
  generateDepartmentReports(classifiedComponents, outputPath) {
    const fs = require('fs');
    const path = require('path');

    // Group by department
    const byDept = {};
    classifiedComponents.forEach(c => {
      const dept = c.classification.department;
      if (!byDept[dept]) {
        byDept[dept] = [];
      }
      byDept[dept].push(c);
    });

    // Generate report for each department
    Object.entries(byDept).forEach(([department, components]) => {
      const filename = department.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const report = this.generateDepartmentReport(department, components);

      fs.writeFileSync(
        path.join(outputPath, `automation-${filename}.md`),
        report
      );
    });

    console.log(`✓ Generated ${Object.keys(byDept).length} department-specific reports`);
  }

  /**
   * Generate department-specific report
   * @param {string} department - Department name
   * @param {Array} components - Department components
   * @returns {string} Markdown report
   */
  generateDepartmentReport(department, components) {
    let report = `# ${department} - Automation Inventory\n\n`;
    report += `**Total Components**: ${components.length}\n`;
    report += `**Date**: ${new Date().toISOString().split('T')[0]}\n\n`;

    // Group by business stage
    const byStage = {};
    components.forEach(c => {
      const stage = c.classification.businessStage;
      if (!byStage[stage]) {
        byStage[stage] = [];
      }
      byStage[stage].push(c);
    });

    report += `## Automation by Business Stage\n\n`;
    Object.entries(byStage).forEach(([stage, comps]) => {
      report += `### ${stage} (${comps.length} components)\n\n`;
      comps.forEach(c => {
        report += `- **${c.name}** (${c.type})\n`;
        report += `  - Object: ${c.object || c.TableEnumOrId || 'Unknown'}\n`;
        report += `  - Package: ${c.packageType || 'CUSTOM'}\n`;
        if (c.namespace) {
          report += `  - Namespace: ${c.namespace}\n`;
        }
        report += `\n`;
      });
    });

    return report;
  }
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node business-process-classifier.js <automation-data.json> <output-dir> [overrides.json]');
    console.error('');
    console.error('Example:');
    console.error('  node business-process-classifier.js audit-results.json ./output/');
    console.error('  node business-process-classifier.js audit-results.json ./output/ overrides.json');
    process.exit(1);
  }

  const inputFile = args[0];
  const outputDir = args[1];
  const overridesFile = args[2];

  try {
    const fs = require('fs');
    const path = require('path');

    // Load automation data
    const automationData = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));

    // Flatten all components
    const allComponents = [
      ...(automationData.triggers || []),
      ...(automationData.classes || []),
      ...(automationData.flows || [])
    ];

    console.log(`📊 Loaded ${allComponents.length} automation components\n`);

    // Create classifier
    const classifier = new BusinessProcessClassifier();

    // Load overrides if provided
    if (overridesFile && fs.existsSync(overridesFile)) {
      classifier.loadOverrides(overridesFile);
    }

    // Classify all components
    console.log('🏷️  Classifying components...\n');
    const classified = classifier.classifyAll(allComponents);

    // Export to CSV
    classifier.exportToCSV(classified, outputDir);

    // Generate summary report
    const summaryReport = classifier.generateSummaryReport(classified);
    fs.writeFileSync(
      path.join(outputDir, 'business-classification-summary.md'),
      summaryReport
    );

    // Generate department-specific reports
    classifier.generateDepartmentReports(classified, outputDir);

    // Export full JSON
    fs.writeFileSync(
      path.join(outputDir, 'automation-classified.json'),
      JSON.stringify(classified, null, 2)
    );

    console.log('\n' + summaryReport);
    console.log(`\n✅ Classification complete! Files saved to: ${outputDir}`);

  } catch (error) {
    console.error('\n❌ Classification failed:', error.message);
    process.exit(1);
  }
}

module.exports = BusinessProcessClassifier;
