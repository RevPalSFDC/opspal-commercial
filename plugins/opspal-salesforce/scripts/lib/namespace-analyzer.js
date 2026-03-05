/**
 * Namespace Analyzer - Detects Managed Packages vs Custom Code
 *
 * Purpose: Analyzes Salesforce automation components to identify managed packages,
 * custom code, and standard Salesforce components. Critical for understanding
 * which automation can be modified vs read-only managed package components.
 *
 * Categories:
 * - MANAGED_PACKAGE: Has namespace prefix (e.g., SBQQ, FCR, et4ae5)
 * - CUSTOM: No namespace prefix (org-developed)
 * - STANDARD: Salesforce standard objects with no custom automation
 *
 * @author Automation Audit System v2.0
 * @version 2.0.0
 * @date 2025-10-09
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { RobustCSVParser } = require('./csv-schema-validator');

class NamespaceAnalyzer {
  constructor(orgAlias) {
    this.orgAlias = orgAlias;
    this.namespaceData = {
      triggers: [],
      classes: [],
      flows: [],
      summary: {
        totalComponents: 0,
        managedPackages: 0,
        customCode: 0,
        standardComponents: 0,
        packageBreakdown: {}
      }
    };
    this.csvParser = new RobustCSVParser();
  }

  /**
   * Execute full namespace analysis
   * @returns {Object} Complete namespace analysis results
   */
  async analyze() {
    console.log(`🔍 Starting namespace analysis for org: ${this.orgAlias}\n`);

    try {
      // Phase 1: Analyze Apex Triggers
      console.log('Phase 1: Analyzing Apex Triggers...');
      this.namespaceData.triggers = await this.analyzeApexTriggers();
      console.log(`✓ Found ${this.namespaceData.triggers.length} triggers\n`);

      // Phase 2: Analyze Apex Classes
      console.log('Phase 2: Analyzing Apex Classes...');
      this.namespaceData.classes = await this.analyzeApexClasses();
      console.log(`✓ Found ${this.namespaceData.classes.length} classes\n`);

      // Phase 3: Analyze Flows (including Process Builder)
      console.log('Phase 3: Analyzing Flows...');
      this.namespaceData.flows = await this.analyzeFlows();
      console.log(`✓ Found ${this.namespaceData.flows.length} flows\n`);

      // Phase 4: Generate Summary
      console.log('Phase 4: Generating summary...');
      this.generateSummary();
      console.log(`✓ Summary complete\n`);

      console.log('✅ Namespace analysis complete!\n');
      return this.namespaceData;

    } catch (error) {
      console.error('❌ Namespace analysis failed:', error.message);
      throw error;
    }
  }

  /**
   * Analyze Apex Triggers for namespace prefixes
   * @returns {Array} Trigger namespace data
   */
  async analyzeApexTriggers() {
    const query = `
      SELECT
        Id,
        Name,
        NamespacePrefix,
        TableEnumOrId,
        Status,
        ApiVersion,
        LastModifiedDate,
        LastModifiedBy.Name
      FROM ApexTrigger
      WHERE Status = 'Active'
      ORDER BY NamespacePrefix NULLS LAST, Name
    `;

    try {
      const result = this.executeQuery(query);
      const triggers = JSON.parse(result).result.records;

      return triggers.map(trigger => ({
        id: trigger.Id,
        name: trigger.Name,
        namespace: trigger.NamespacePrefix || null,
        packageType: this.categorizePackageType(trigger.NamespacePrefix),
        object: trigger.TableEnumOrId,
        status: trigger.Status,
        apiVersion: trigger.ApiVersion,
        lastModified: trigger.LastModifiedDate,
        modifiable: !trigger.NamespacePrefix, // Managed packages are read-only
        type: 'ApexTrigger'
      }));

    } catch (error) {
      console.error('Error analyzing triggers:', error.message);
      return [];
    }
  }

  /**
   * Analyze Apex Classes for namespace prefixes
   * @returns {Array} Class namespace data
   */
  async analyzeApexClasses() {
    const query = `
      SELECT
        Id,
        Name,
        NamespacePrefix,
        Status,
        ApiVersion,
        LastModifiedDate,
        LastModifiedBy.Name
      FROM ApexClass
      WHERE Status = 'Active'
      ORDER BY NamespacePrefix NULLS LAST, Name
      LIMIT 200
    `;

    try {
      const result = this.executeQuery(query);
      const classes = JSON.parse(result).result.records;

      return classes.map(cls => ({
        id: cls.Id,
        name: cls.Name,
        namespace: cls.NamespacePrefix || null,
        packageType: this.categorizePackageType(cls.NamespacePrefix),
        status: cls.Status,
        apiVersion: cls.ApiVersion,
        lastModified: cls.LastModifiedDate,
        modifiable: !cls.NamespacePrefix, // Managed packages are read-only
        type: 'ApexClass'
      }));

    } catch (error) {
      console.error('Error analyzing classes:', error.message);
      return [];
    }
  }

  /**
   * Analyze Flows for namespace prefixes
   * @returns {Array} Flow namespace data
   */
  async analyzeFlows() {
    const query = `
      SELECT
        DurableId,
        ActiveVersionId,
        DeveloperName,
        NamespacePrefix,
        ProcessType,
        LastModifiedDate
      FROM FlowDefinitionView
      WHERE IsActive = true
      ORDER BY NamespacePrefix NULLS LAST, DeveloperName
    `;

    try {
      const result = this.executeQuery(query);
      const flows = JSON.parse(result).result.records;

      return flows.map(flow => ({
        id: flow.DurableId,
        name: flow.DeveloperName,
        namespace: flow.NamespacePrefix || null,
        packageType: this.categorizePackageType(flow.NamespacePrefix),
        processType: flow.ProcessType,
        lastModified: flow.LastModifiedDate,
        modifiable: !flow.NamespacePrefix, // Managed packages are read-only
        type: 'Flow'
      }));

    } catch (error) {
      console.error('Error analyzing flows:', error.message);
      return [];
    }
  }

  /**
   * Categorize component by package type
   * @param {string|null} namespace - Namespace prefix
   * @returns {string} Package type category
   */
  categorizePackageType(namespace) {
    if (!namespace) {
      return 'CUSTOM';
    }

    // Well-known managed packages
    const knownPackages = {
      'SBQQ': 'Salesforce CPQ',
      'FCR': 'Full Circle Response Management',
      'et4ae5': 'Salesforce Marketing Cloud',
      'DB': 'DemandBase',
      'PS': 'PredictiveBooks',
      'RHX': 'RollupHelper',
      'AC': 'AdvancedCampaigns',
      'FCDSC': 'Full Circle Data Science',
      'Opsos': 'Opsos'
    };

    const packageName = knownPackages[namespace] || `Managed Package (${namespace})`;

    return 'MANAGED_PACKAGE';
  }

  /**
   * Get package name from namespace
   * @param {string} namespace - Namespace prefix
   * @returns {string} Human-readable package name
   */
  getPackageName(namespace) {
    const knownPackages = {
      'SBQQ': 'Salesforce CPQ',
      'FCR': 'Full Circle Response Management',
      'et4ae5': 'Salesforce Marketing Cloud',
      'DB': 'DemandBase',
      'PS': 'PredictiveBooks',
      'RHX': 'RollupHelper',
      'AC': 'AdvancedCampaigns',
      'FCDSC': 'Full Circle Data Science',
      'Opsos': 'Opsos'
    };

    return knownPackages[namespace] || `Unknown Package (${namespace})`;
  }

  /**
   * Generate summary statistics
   */
  generateSummary() {
    const allComponents = [
      ...this.namespaceData.triggers,
      ...this.namespaceData.classes,
      ...this.namespaceData.flows
    ];

    this.namespaceData.summary.totalComponents = allComponents.length;

    // Count by package type
    allComponents.forEach(component => {
      if (component.packageType === 'MANAGED_PACKAGE') {
        this.namespaceData.summary.managedPackages++;

        // Count by specific package
        const packageName = this.getPackageName(component.namespace);
        this.namespaceData.summary.packageBreakdown[packageName] =
          (this.namespaceData.summary.packageBreakdown[packageName] || 0) + 1;
      } else if (component.packageType === 'CUSTOM') {
        this.namespaceData.summary.customCode++;
      } else {
        this.namespaceData.summary.standardComponents++;
      }
    });

    // Calculate modifiability
    const modifiable = allComponents.filter(c => c.modifiable).length;
    const nonModifiable = allComponents.length - modifiable;

    this.namespaceData.summary.modifiable = modifiable;
    this.namespaceData.summary.nonModifiable = nonModifiable;
    this.namespaceData.summary.modifiablePercentage =
      Math.round((modifiable / allComponents.length) * 100);
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
   * Export namespace data to CSV
   * @param {string} outputPath - Output directory path
   */
  exportToCSV(outputPath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Export triggers
    const triggersCSV = this.generateCSV(this.namespaceData.triggers, [
      'name', 'namespace', 'packageType', 'object', 'modifiable', 'lastModified'
    ]);
    fs.writeFileSync(
      path.join(outputPath, `namespace-triggers-${timestamp}.csv`),
      triggersCSV
    );

    // Export classes (top 200)
    const classesCSV = this.generateCSV(this.namespaceData.classes, [
      'name', 'namespace', 'packageType', 'modifiable', 'lastModified'
    ]);
    fs.writeFileSync(
      path.join(outputPath, `namespace-classes-${timestamp}.csv`),
      classesCSV
    );

    // Export flows
    const flowsCSV = this.generateCSV(this.namespaceData.flows, [
      'name', 'namespace', 'packageType', 'processType', 'modifiable', 'lastModified'
    ]);
    fs.writeFileSync(
      path.join(outputPath, `namespace-flows-${timestamp}.csv`),
      flowsCSV
    );

    console.log(`✓ CSV files exported to ${outputPath}`);
  }

  /**
   * Generate CSV from data array
   * @param {Array} data - Data array
   * @param {Array} columns - Column names
   * @returns {string} CSV content
   */
  generateCSV(data, columns) {
    // Convert data to object-based rows with proper column names
    const rows = data.map(item => {
      const row = {};
      columns.forEach(col => {
        // Convert column name to Title Case for header
        const headerName = col.charAt(0).toUpperCase() + col.slice(1);
        row[headerName] = item[col] || '';
      });
      return row;
    });

    return this.csvParser.generate(rows);
  }

  /**
   * Generate summary report
   * @returns {string} Formatted summary report
   */
  generateSummaryReport() {
    const { summary } = this.namespaceData;

    let report = `# Namespace Analysis Summary\n\n`;
    report += `**Org**: ${this.orgAlias}\n`;
    report += `**Date**: ${new Date().toISOString().split('T')[0]}\n\n`;

    report += `## Overview\n\n`;
    report += `- **Total Components**: ${summary.totalComponents}\n`;
    report += `- **Custom Code**: ${summary.customCode} (${Math.round(summary.customCode / summary.totalComponents * 100)}%)\n`;
    report += `- **Managed Packages**: ${summary.managedPackages} (${Math.round(summary.managedPackages / summary.totalComponents * 100)}%)\n`;
    report += `- **Modifiable**: ${summary.modifiable} (${summary.modifiablePercentage}%)\n`;
    report += `- **Non-Modifiable**: ${summary.nonModifiable} (${100 - summary.modifiablePercentage}%)\n\n`;

    report += `## Package Breakdown\n\n`;
    Object.entries(summary.packageBreakdown)
      .sort((a, b) => b[1] - a[1])
      .forEach(([pkg, count]) => {
        report += `- **${pkg}**: ${count} components\n`;
      });

    report += `\n## Component Breakdown\n\n`;
    report += `- **Apex Triggers**: ${this.namespaceData.triggers.length}\n`;
    report += `  - Custom: ${this.namespaceData.triggers.filter(t => t.packageType === 'CUSTOM').length}\n`;
    report += `  - Managed: ${this.namespaceData.triggers.filter(t => t.packageType === 'MANAGED_PACKAGE').length}\n\n`;

    report += `- **Apex Classes**: ${this.namespaceData.classes.length} (top 200)\n`;
    report += `  - Custom: ${this.namespaceData.classes.filter(c => c.packageType === 'CUSTOM').length}\n`;
    report += `  - Managed: ${this.namespaceData.classes.filter(c => c.packageType === 'MANAGED_PACKAGE').length}\n\n`;

    report += `- **Flows**: ${this.namespaceData.flows.length}\n`;
    report += `  - Custom: ${this.namespaceData.flows.filter(f => f.packageType === 'CUSTOM').length}\n`;
    report += `  - Managed: ${this.namespaceData.flows.filter(f => f.packageType === 'MANAGED_PACKAGE').length}\n\n`;

    report += `## Key Insights\n\n`;

    if (summary.managedPackages > summary.customCode) {
      report += `⚠️ **Managed packages dominate** (${Math.round(summary.managedPackages / summary.totalComponents * 100)}% of components). Focus remediation on custom code only.\n\n`;
    }

    if (summary.modifiablePercentage < 50) {
      report += `⚠️ **Low modifiability** (${summary.modifiablePercentage}%). Majority of automation is locked in managed packages.\n\n`;
    }

    const topPackage = Object.entries(summary.packageBreakdown)
      .sort((a, b) => b[1] - a[1])[0];
    if (topPackage) {
      report += `📦 **Primary managed package**: ${topPackage[0]} (${topPackage[1]} components)\n\n`;
    }

    return report;
  }
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node namespace-analyzer.js <org-alias> [output-dir]');
    process.exit(1);
  }

  const orgAlias = args[0];
  const outputDir = args[1] || process.cwd();

  (async () => {
    try {
      const analyzer = new NamespaceAnalyzer(orgAlias);
      const results = await analyzer.analyze();

      // Export to CSV
      analyzer.exportToCSV(outputDir);

      // Generate summary report
      const summaryReport = analyzer.generateSummaryReport();
      fs.writeFileSync(
        path.join(outputDir, 'namespace-analysis-summary.md'),
        summaryReport
      );

      // Export full JSON
      const jsonPath = path.join(outputDir, 'namespace-analysis.json');
      fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

      // Quality Gate: Validate both report files were created
      const summaryPath = path.join(outputDir, 'namespace-analysis-summary.md');
      if (!fs.existsSync(summaryPath) || !fs.existsSync(jsonPath)) {
        throw new Error('Analysis failed: Report files were not created');
      }

      console.log('\n' + summaryReport);
      console.log(`\n✅ Analysis complete! Files saved to: ${outputDir}`);

    } catch (error) {
      console.error('\n❌ Analysis failed:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = NamespaceAnalyzer;
