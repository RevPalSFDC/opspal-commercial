/**
 * Q2C Audit Orchestrator
 *
 * Coordinates all Q2C diagram generators to produce a comprehensive audit package.
 *
 * Features:
 * - Orchestrates 7 diagram generators:
 *   1. CPQ Diagram Generator (pricing, lifecycle, renewal, bundles)
 *   2. Q2C Process Flow Generator (10-stage Q2C process)
 *   3. CPQ ERD Generator (object relationships)
 *   4. Automation Cascade Generator (automation chains)
 *   5. Approval Flow Generator (approval processes)
 *   6. Process Extrapolator (business process with risk analysis)
 *   7. Admin Guide Generator (onboarding guide for new admins) - NEW in v3.47.1
 * - Generates comprehensive audit report with executive summary
 * - Provides progress feedback
 * - Creates organized output structure
 *
 * Usage:
 *   const orchestrator = new Q2CAuditOrchestrator(orgAlias, options);
 *   const audit = await orchestrator.generateCompleteAudit();
 *
 * @phase Phase 7: Add Admin Onboarding Guide
 * @version 3.47.1
 */

const fs = require('fs');
const path = require('path');
const CPQDiagramGenerator = require('./cpq-diagram-generator');
const Q2CProcessFlowGenerator = require('./q2c-process-flow-generator');
const CPQERDGenerator = require('./cpq-erd-generator');
const CPQAutomationCascadeGenerator = require('./cpq-automation-cascade-generator');
const ApprovalFlowGenerator = require('./approval-flow-generator');
const CPQProcessExtrapolator = require('./cpq-process-extrapolator');
const CPQAdminGuideGenerator = require('./cpq-admin-guide-generator');

class Q2CAuditOrchestrator {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.options = {
      outputDir: options.outputDir || `./q2c-audit-${orgAlias}-${Date.now()}`,
      detailLevel: options.detailLevel || 'both',
      includeInactive: options.includeInactive || false,
      generateSummary: options.generateSummary !== false,
      verbose: options.verbose || false,
      // Individual generator options
      cpqOptions: options.cpqOptions || {},
      q2cOptions: options.q2cOptions || {},
      erdOptions: options.erdOptions || {},
      cascadeOptions: options.cascadeOptions || {},
      approvalOptions: options.approvalOptions || {}
    };

    this.results = {
      startTime: null,
      endTime: null,
      duration: null,
      orgAlias: this.orgAlias,
      diagrams: {},
      errors: [],
      warnings: []
    };
  }

  /**
   * Main entry point - generates complete Q2C audit
   * @returns {Object} Audit results
   */
  async generateCompleteAudit() {
    this.results.startTime = new Date();
    const phaseTimings = {};

    // Always show basic progress (not just in verbose mode)
    console.log(`\n🔍 Starting Q2C Audit for ${this.orgAlias}`);
    console.log(`📁 Output: ${this.options.outputDir}\n`);

    // Create output directory structure
    this._createOutputStructure();

    try {
      // Phase 1: CPQ Configuration Diagrams
      console.log('[1/6] Generating CPQ configuration diagrams...');
      const phase1Start = Date.now();
      await this._generateCPQDiagrams();
      phaseTimings.cpqConfiguration = Date.now() - phase1Start;
      console.log(`  ✓ Complete (${(phaseTimings.cpqConfiguration / 1000).toFixed(1)}s)\n`);

      // Phase 2: Q2C Process Flow
      console.log('[2/6] Generating Q2C process flow...');
      const phase2Start = Date.now();
      await this._generateQ2CProcessFlow();
      phaseTimings.q2cProcess = Date.now() - phase2Start;
      console.log(`  ✓ Complete (${(phaseTimings.q2cProcess / 1000).toFixed(1)}s)\n`);

      // Phase 3: CPQ ERD
      console.log('[3/6] Generating CPQ ERD...');
      const phase3Start = Date.now();
      await this._generateCPQERD();
      phaseTimings.erd = Date.now() - phase3Start;
      const erdInfo = this.results.diagrams.erd?.generated ?
        ` - ${this.results.diagrams.erd.objectCount || 0} objects, ${this.results.diagrams.erd.relationshipCount || 0} relationships` : '';
      console.log(`  ✓ Complete (${(phaseTimings.erd / 1000).toFixed(1)}s)${erdInfo}\n`);

      // Phase 4: Automation Cascades
      console.log('[4/6] Generating automation cascades...');
      const phase4Start = Date.now();
      await this._generateAutomationCascades();
      phaseTimings.automation = Date.now() - phase4Start;
      const cascadeInfo = this.results.diagrams.automation?.generated ?
        ` - ${this.results.diagrams.automation.cascades || 0} cascades, ${this.results.diagrams.automation.circularDependencies || 0} circular deps` : '';
      console.log(`  ✓ Complete (${(phaseTimings.automation / 1000).toFixed(1)}s)${cascadeInfo}\n`);

      // Phase 5: Approval Flows
      console.log('[5/6] Generating approval flows...');
      const phase5Start = Date.now();
      await this._generateApprovalFlows();
      phaseTimings.approvals = Date.now() - phase5Start;
      const approvalInfo = this.results.diagrams.approvals?.generated ?
        ` - ${this.results.diagrams.approvals.processCount || 0} processes` : '';
      console.log(`  ✓ Complete (${(phaseTimings.approvals / 1000).toFixed(1)}s)${approvalInfo}\n`);

      // Phase 6: Process Extrapolation (NEW in v3.47.0)
      console.log('[6/7] Extrapolating Q2C business process...');
      const phase6Start = Date.now();
      await this._generateProcessExtrapolation();
      phaseTimings.processExtrapolation = Date.now() - phase6Start;
      const processInfo = this.results.diagrams.processExtrapolation?.generated ?
        ` - Efficiency: ${this.results.diagrams.processExtrapolation.processEfficiency}/100, ${this.results.diagrams.processExtrapolation.bottlenecks.length} bottlenecks` : '';
      console.log(`  ✓ Complete (${(phaseTimings.processExtrapolation / 1000).toFixed(1)}s)${processInfo}\n`);

      // Phase 7: Admin Onboarding Guide (NEW in v3.47.1)
      console.log('[7/7] Generating Admin Onboarding Guide...');
      const phase7Start = Date.now();
      await this._generateAdminOnboardingGuide();
      phaseTimings.adminGuide = Date.now() - phase7Start;
      const guideInfo = this.results.adminGuide?.generated ?
        ` - ${this.results.adminGuide.sections} sections` : '';
      console.log(`  ✓ Complete (${(phaseTimings.adminGuide / 1000).toFixed(1)}s)${guideInfo}\n`);

      // Generate summary report
      if (this.options.generateSummary) {
        console.log('Generating summary report...');
        const summaryStart = Date.now();
        await this._generateSummaryReport();
        phaseTimings.summary = Date.now() - summaryStart;
        console.log(`  ✓ Complete (${(phaseTimings.summary / 1000).toFixed(1)}s)\n`);
      }

      this.results.endTime = new Date();
      this.results.duration = this.results.endTime - this.results.startTime;
      this.results.phaseTimings = phaseTimings;

      // Enhanced completion message
      console.log('═'.repeat(60));
      console.log(`✅ Q2C Audit Complete!`);
      console.log(`⏱️  Total Duration: ${(this.results.duration / 1000).toFixed(2)}s`);
      console.log(`📊 Diagrams Generated: ${Object.keys(this.results.diagrams).filter(k => this.results.diagrams[k]?.generated).length}/6`);

      if (this.results.warnings.length > 0) {
        console.log(`⚠️  Warnings: ${this.results.warnings.length} (see summary)`);
      }

      if (this.results.errors.length > 0) {
        console.log(`❌ Errors: ${this.results.errors.length}`);
      }

      console.log(`\n📁 Output Directory: ${this.options.outputDir}`);
      console.log(`📄 Summary Report: ${this.results.summaryPath || 'N/A'}`);
      console.log('═'.repeat(60) + '\n');

      return this.results;

    } catch (error) {
      this.results.errors.push({
        phase: 'orchestration',
        message: error.message,
        stack: error.stack
      });

      console.error(`\n❌ Q2C Audit Failed: ${error.message}`);
      if (this.options.verbose) {
        console.error(error.stack);
      }

      throw error;
    }
  }

  /**
   * Create output directory structure
   */
  _createOutputStructure() {
    const dirs = [
      this.options.outputDir,
      path.join(this.options.outputDir, 'cpq-configuration'),
      path.join(this.options.outputDir, 'q2c-process'),
      path.join(this.options.outputDir, 'erd'),
      path.join(this.options.outputDir, 'automation'),
      path.join(this.options.outputDir, 'approvals')
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Generate CPQ configuration diagrams
   */
  async _generateCPQDiagrams() {
    try {
      const outputDir = path.join(this.options.outputDir, 'cpq-configuration');
      const generator = new CPQDiagramGenerator({
        outputDir,
        detailLevel: this.options.detailLevel,
        ...this.options.cpqOptions
      });

      // Note: CPQ diagrams require assessment data
      // For now, we'll create a placeholder
      this.results.diagrams.cpqConfiguration = {
        generated: false,
        reason: 'Requires assessment data - will be generated by CPQ assessor integration'
      };

      if (this.options.verbose) {
        console.log('  ⓘ CPQ configuration diagrams will be generated with assessment data');
      }

    } catch (error) {
      this.results.errors.push({
        phase: 'cpq-diagrams',
        message: error.message
      });

      if (this.options.verbose) {
        console.error(`  ✗ Error: ${error.message}`);
      }
    }
  }

  /**
   * Generate Q2C process flow diagrams
   */
  async _generateQ2CProcessFlow() {
    try {
      const outputDir = path.join(this.options.outputDir, 'q2c-process');
      const generator = new Q2CProcessFlowGenerator(this.orgAlias, {
        outputDir,
        detailLevel: this.options.detailLevel,
        verbose: this.options.verbose,
        ...this.options.q2cOptions
      });

      const result = await generator.generateQ2CProcessFlow();

      this.results.diagrams.q2cProcess = {
        generated: true,
        highLevel: result.highLevel,
        detailed: result.detailed
      };

      if (this.options.verbose) {
        console.log('  ✓ Q2C process flow generated');
        if (result.highLevel) console.log(`    - High-level: ${result.highLevel.paths.markdown}`);
        if (result.detailed) console.log(`    - Detailed: ${result.detailed.paths.markdown}`);
      }

    } catch (error) {
      this.results.errors.push({
        phase: 'q2c-process',
        message: error.message
      });

      if (this.options.verbose) {
        console.error(`  ✗ Error: ${error.message}`);
      }
    }
  }

  /**
   * Generate CPQ ERD diagrams
   */
  async _generateCPQERD() {
    try {
      const outputDir = path.join(this.options.outputDir, 'erd');
      const generator = new CPQERDGenerator(this.orgAlias, {
        outputDir,
        detailLevel: this.options.detailLevel,
        verbose: this.options.verbose,
        ...this.options.erdOptions
      });

      const result = await generator.generateERD();

      this.results.diagrams.erd = {
        generated: true,
        objects: result.objects,          // Store discovered objects for process extrapolation
        relationships: result.relationships, // Store relationships for process extrapolation
        highLevel: result.highLevel,
        detailed: result.detailed
      };

      if (this.options.verbose) {
        console.log('  ✓ CPQ ERD generated');
        if (result.highLevel) console.log(`    - High-level: ${result.highLevel.paths.markdown}`);
        if (result.detailed) console.log(`    - Detailed: ${result.detailed.paths.markdown}`);
      }

    } catch (error) {
      this.results.errors.push({
        phase: 'erd',
        message: error.message
      });

      if (this.options.verbose) {
        console.error(`  ✗ Error: ${error.message}`);
      }
    }
  }

  /**
   * Generate automation cascade diagrams
   */
  async _generateAutomationCascades() {
    try {
      const outputDir = path.join(this.options.outputDir, 'automation');
      const generator = new CPQAutomationCascadeGenerator(this.orgAlias, {
        outputDir,
        detailLevel: this.options.detailLevel,
        verbose: this.options.verbose,
        ...this.options.cascadeOptions
      });

      const result = await generator.generateCascadeDiagrams();

      this.results.diagrams.automation = {
        generated: true,
        automation: result.automation, // Store raw automation discovery data for process extrapolation
        cascades: result.cascades.length,
        circularDependencies: result.circularDependencies.length,
        circularDependencyDetails: result.circularDependencies, // Store full details for reporting
        highLevel: result.highLevel,
        detailed: result.detailed
      };

      if (this.options.verbose) {
        console.log('  ✓ Automation cascades generated');
        console.log(`    - Cascades found: ${result.cascades.length}`);
        console.log(`    - Circular dependencies: ${result.circularDependencies.length}`);
        if (result.highLevel) console.log(`    - High-level: ${result.highLevel.paths.markdown}`);
        if (result.detailed) console.log(`    - Detailed: ${result.detailed.paths.markdown}`);
      }

      // Add warning if circular dependencies found
      if (result.circularDependencies.length > 0) {
        this.results.warnings.push({
          phase: 'automation',
          message: `Found ${result.circularDependencies.length} circular dependencies (potential infinite loops)`
        });
      }

    } catch (error) {
      this.results.errors.push({
        phase: 'automation',
        message: error.message
      });

      if (this.options.verbose) {
        console.error(`  ✗ Error: ${error.message}`);
      }
    }
  }

  /**
   * Generate approval flow diagrams
   */
  async _generateApprovalFlows() {
    try {
      const outputDir = path.join(this.options.outputDir, 'approvals');
      const generator = new ApprovalFlowGenerator(this.orgAlias, {
        outputDir,
        detailLevel: this.options.detailLevel,
        includeInactive: this.options.includeInactive,
        verbose: this.options.verbose,
        ...this.options.approvalOptions
      });

      const result = await generator.generateApprovalFlowDiagrams();

      this.results.diagrams.approvals = {
        generated: true,
        processCount: result.approvalProcesses.length,
        diagrams: result.diagrams
      };

      if (this.options.verbose) {
        console.log('  ✓ Approval flows generated');
        console.log(`    - Approval processes: ${result.approvalProcesses.length}`);
        console.log(`    - Diagrams created: ${result.diagrams.length * 2}`); // high-level + detailed
      }

    } catch (error) {
      this.results.errors.push({
        phase: 'approvals',
        message: error.message
      });

      if (this.options.verbose) {
        console.error(`  ✗ Error: ${error.message}`);
      }
    }
  }

  /**
   * Generate process extrapolation (business process with risk analysis)
   * NEW in v3.47.0
   */
  async _generateProcessExtrapolation() {
    try {
      // Collect all discovered components from previous phases
      const discoveredComponents = {
        automation: this.results.diagrams.automation?.automation || {}, // Pass raw automation discovery data
        erd: this.results.diagrams.erd || {},
        approvals: this.results.diagrams.approvals?.diagrams || [],
        circularDeps: this.results.diagrams.automation?.circularDependencyDetails || []
      };

      const extrapolator = new CPQProcessExtrapolator(this.orgAlias, discoveredComponents, {
        verbose: this.options.verbose,
        outputDir: this.options.outputDir
      });

      const result = await extrapolator.analyzeProcess();

      this.results.diagrams.processExtrapolation = {
        generated: true,
        stages: result.stages,
        stageRisks: result.stageRisks,
        bottlenecks: result.bottlenecks,
        processEfficiency: result.processEfficiency,
        diagramPath: result.diagramPath,
        executiveSummary: result.executiveSummary
      };

      if (this.options.verbose) {
        console.log('  ✓ Process extrapolation complete');
        console.log(`    - Process stages: ${result.stages.length}`);
        console.log(`    - Process efficiency: ${result.processEfficiency}/100`);
        console.log(`    - Bottlenecks identified: ${result.bottlenecks.length}`);
      }

    } catch (error) {
      this.results.errors.push({
        phase: 'process-extrapolation',
        message: error.message
      });

      if (this.options.verbose) {
        console.error(`  ✗ Error: ${error.message}`);
      }
    }
  }

  /**
   * Generate Admin Onboarding Guide
   * NEW in v3.47.1 - Creates narrative documentation for new admins
   */
  async _generateAdminOnboardingGuide() {
    try {
      if (!this.results.diagrams.processExtrapolation?.generated) {
        this.results.warnings.push({
          phase: 'admin-guide',
          message: 'Process extrapolation not available - skipping admin guide generation'
        });
        return;
      }

      if (!this.results.diagrams.automation?.automation) {
        this.results.warnings.push({
          phase: 'admin-guide',
          message: 'Automation data not available - skipping admin guide generation'
        });
        return;
      }

      const guideGenerator = new CPQAdminGuideGenerator(
        this.orgAlias,
        this.results.diagrams.processExtrapolation,
        this.results.diagrams.automation,
        {
          outputDir: this.options.outputDir,
          verbose: this.options.verbose
        }
      );

      const result = await guideGenerator.generateGuide();

      this.results.adminGuide = result;

      if (this.options.verbose) {
        console.log('  ✓ Admin onboarding guide complete');
        console.log(`    - Sections: ${result.sections}`);
        console.log(`    - Path: ${result.path}`);
      }

    } catch (error) {
      this.results.errors.push({
        phase: 'admin-guide',
        message: error.message
      });

      if (this.options.verbose) {
        console.error(`  ✗ Error generating admin guide: ${error.message}`);
      }
    }
  }

  /**
   * Generate summary report
   */
  async _generateSummaryReport() {
    try {
      const reportPath = path.join(this.options.outputDir, 'Q2C-AUDIT-SUMMARY.md');

      let report = `# Q2C Audit Summary\n\n`;
      report += `**Org**: ${this.orgAlias}\n`;
      report += `**Generated**: ${new Date().toLocaleString()}\n`;
      report += `**Duration**: ${(this.results.duration / 1000).toFixed(2)}s\n\n`;

      // Executive Summary (NEW in v3.47.0)
      if (this.results.diagrams.processExtrapolation?.generated) {
        const extrapolator = new CPQProcessExtrapolator(this.orgAlias, {}, {
          verbose: false,
          outputDir: this.options.outputDir
        });
        // Populate with stored results
        extrapolator.processStages = this.results.diagrams.processExtrapolation.stages;
        extrapolator.stageRisks = this.results.diagrams.processExtrapolation.stageRisks;
        extrapolator.bottlenecks = this.results.diagrams.processExtrapolation.bottlenecks;
        extrapolator.processEfficiency = this.results.diagrams.processExtrapolation.processEfficiency;

        report += extrapolator.formatExecutiveSummary();
        report += `\n---\n\n`;
      }

      report += `## Overview\n\n`;
      report += `This Q2C audit provides comprehensive visualization of your Salesforce CPQ/Q2C configuration.\n\n`;

      // Q2C Process Flow
      report += `## Q2C Process Flow\n\n`;
      if (this.results.diagrams.q2cProcess?.generated) {
        report += `✓ **Generated**: Shows automation at each of 10 Q2C stages\n\n`;
        if (this.results.diagrams.q2cProcess.highLevel) {
          report += `- **High-Level**: [q2c-process/q2c-process-flow-overview.md](q2c-process/q2c-process-flow-overview.md)\n`;
        }
        if (this.results.diagrams.q2cProcess.detailed) {
          report += `- **Detailed**: [q2c-process/q2c-process-flow-detailed.md](q2c-process/q2c-process-flow-detailed.md)\n`;
        }
      } else {
        report += `✗ Not generated\n`;
      }
      report += `\n`;

      // Entity Relationship Diagram
      report += `## Entity Relationship Diagram (ERD)\n\n`;
      if (this.results.diagrams.erd?.generated) {
        report += `✓ **Generated**: Shows CPQ object relationships\n\n`;
        if (this.results.diagrams.erd.highLevel) {
          report += `- **High-Level**: [erd/cpq-erd-overview.md](erd/cpq-erd-overview.md)\n`;
        }
        if (this.results.diagrams.erd.detailed) {
          report += `- **Detailed**: [erd/cpq-erd-detailed.md](erd/cpq-erd-detailed.md)\n`;
        }
      } else {
        report += `✗ Not generated\n`;
      }
      report += `\n`;

      // Automation Cascades
      report += `## Automation Cascades\n\n`;
      if (this.results.diagrams.automation?.generated) {
        report += `✓ **Generated**: Shows how automation components trigger each other\n\n`;
        report += `- **Cascades Found**: ${this.results.diagrams.automation.cascades}\n`;
        report += `- **Circular Dependencies**: ${this.results.diagrams.automation.circularDependencies}\n\n`;
        if (this.results.diagrams.automation.highLevel) {
          report += `- **High-Level**: [automation/cpq-automation-cascade-overview.md](automation/cpq-automation-cascade-overview.md)\n`;
        }
        if (this.results.diagrams.automation.detailed) {
          report += `- **Detailed**: [automation/cpq-automation-cascade-detailed.md](automation/cpq-automation-cascade-detailed.md)\n`;
        }
      } else {
        report += `✗ Not generated\n`;
      }
      report += `\n`;

      // Approval Flows
      report += `## Approval Flows\n\n`;
      if (this.results.diagrams.approvals?.generated) {
        report += `✓ **Generated**: Shows approval process sequences\n\n`;
        report += `- **Approval Processes**: ${this.results.diagrams.approvals.processCount}\n`;
        report += `- **Diagrams Created**: ${this.results.diagrams.approvals.diagrams.length * 2}\n\n`;

        if (this.results.diagrams.approvals.diagrams.length > 0) {
          report += `**Processes**:\n`;
          for (const diagram of this.results.diagrams.approvals.diagrams) {
            report += `- ${diagram.processName} (${diagram.object})\n`;
            if (diagram.highLevel) {
              report += `  - High-Level: [approvals/${diagram.highLevel.filename}.md](approvals/${diagram.highLevel.filename}.md)\n`;
            }
            if (diagram.detailed) {
              report += `  - Detailed: [approvals/${diagram.detailed.filename}.md](approvals/${diagram.detailed.filename}.md)\n`;
            }
          }
        }
      } else {
        report += `✗ Not generated\n`;
      }
      report += `\n`;

      // Process Extrapolation (NEW in v3.47.0)
      report += `## Q2C Business Process (Extrapolated)\n\n`;
      if (this.results.diagrams.processExtrapolation?.generated) {
        report += `✓ **Generated**: Business process flow with risk analysis and bottleneck identification\n\n`;
        report += `- **Process Efficiency**: ${this.results.diagrams.processExtrapolation.processEfficiency}/100\n`;
        report += `- **Process Stages**: ${this.results.diagrams.processExtrapolation.stages.length}\n`;
        report += `- **Bottlenecks Identified**: ${this.results.diagrams.processExtrapolation.bottlenecks.length}\n\n`;
        report += `- **Process Diagram**: [Q2C-PROCESS-FLOW.md](Q2C-PROCESS-FLOW.md)\n\n`;
        report += `**Stage Health Summary**:\n`;
        this.results.diagrams.processExtrapolation.stages.forEach(stage => {
          const risk = this.results.diagrams.processExtrapolation.stageRisks[stage.id];
          report += `- ${stage.riskEmoji} ${stage.name}: ${risk.level} (${risk.componentCount} components)\n`;
        });
      } else {
        report += `✗ Not generated\n`;
      }
      report += `\n`;

      // CPQ Configuration
      report += `## CPQ Configuration Diagrams\n\n`;
      if (this.results.diagrams.cpqConfiguration?.generated) {
        report += `✓ **Generated**: Pricing, lifecycle, renewal, and bundle diagrams\n\n`;
      } else {
        report += `ⓘ **Pending**: ${this.results.diagrams.cpqConfiguration?.reason || 'Not generated'}\n\n`;
      }

      // Circular Dependency Details (if any found)
      if (this.results.diagrams.automation?.circularDependencyDetails?.length > 0) {
        report += this._generateCircularDependencyReport(
          this.results.diagrams.automation.circularDependencyDetails
        );
      }

      // Warnings
      if (this.results.warnings.length > 0) {
        report += `## Warnings\n\n`;
        for (const warning of this.results.warnings) {
          report += `⚠️ **${warning.phase}**: ${warning.message}\n\n`;
        }
      }

      // Errors
      if (this.results.errors.length > 0) {
        report += `## Errors\n\n`;
        for (const error of this.results.errors) {
          report += `✗ **${error.phase}**: ${error.message}\n\n`;
        }
      }

      report += `---\n\n`;
      report += `Generated by Salesforce Plugin Q2C Audit Tool\n`;

      fs.writeFileSync(reportPath, report);

      this.results.summaryPath = reportPath;

      if (this.options.verbose) {
        console.log(`  ✓ Summary report: ${reportPath}`);
      }

    } catch (error) {
      this.results.errors.push({
        phase: 'summary',
        message: error.message
      });

      if (this.options.verbose) {
        console.error(`  ✗ Error generating summary: ${error.message}`);
      }
    }
  }

  /**
   * Generate detailed circular dependency report with remediation guidance
   * @param {Array} circularDeps - Array of circular dependency objects
   * @returns {String} Markdown report section
   */
  _generateCircularDependencyReport(circularDeps) {
    if (!circularDeps || circularDeps.length === 0) {
      return '';
    }

    let report = `## Critical Issues Requiring Action\n\n`;
    report += `### 🚨 Circular Dependencies Detected (${circularDeps.length})\n\n`;
    report += `**CRITICAL**: The following automation chains create circular references that could cause infinite loops and governor limit failures.\n\n`;

    circularDeps.forEach((dep, index) => {
      report += `#### Circular Dependency #${index + 1}: ${dep.chain[0].split(':')[1]} Loop\n\n`;

      // Parse chain to extract components
      const components = dep.chain.map(item => {
        const [type, name] = item.split(':');
        return { type, name };
      });

      // Extract primary object
      const primaryObject = components[0].name.replace(/Before|After|Trigger|Handler/gi, '');

      report += `**Objects Involved**: ${primaryObject}\n\n`;
      report += `**Automation Chain**:\n`;
      components.forEach((comp, i) => {
        report += `${i + 1}. ${comp.type}: ${comp.name}\n`;
      });
      report += `${components.length + 1}. **LOOP BACK TO STEP 1** ← Circular reference detected\n\n`;

      // Risk assessment
      const componentCount = components.length;
      const hasMultipleTriggers = components.filter(c => c.type === 'Trigger').length > 1;
      const riskLevel = hasMultipleTriggers && componentCount >= 3 ? 'HIGH' :
                        componentCount >= 3 ? 'MEDIUM' : 'LOW';

      report += `**Risk**: ${riskLevel} (${componentCount} components in loop`;
      if (hasMultipleTriggers) {
        report += `, multiple triggers`;
      }
      report += `)\n\n`;

      // Estimated impact
      const estimatedDmlOps = componentCount * 5; // Rough estimate
      report += `**Impact**: \n`;
      report += `- Governor limit risk: ~${estimatedDmlOps} DML operations per transaction\n`;
      report += `- Performance degradation on ${primaryObject} operations\n`;
      report += `- Potential "Too many DML operations" or "Maximum CPU time exceeded" errors\n`;
      report += `- Affects all users performing ${primaryObject} create/update operations\n\n`;

      // Remediation options
      report += `**Recommended Fix Options**:\n\n`;

      if (hasMultipleTriggers) {
        report += `**Option A: Trigger Consolidation** (Recommended)\n`;
        report += `- Merge ${components.filter(c => c.type === 'Trigger').length} triggers into single handler using Trigger Framework pattern\n`;
        report += `- Use static recursion flag: \`if (!${primaryObject}TriggerHandler.inContext) {...}\`\n`;
        report += `- Estimated effort: 4-6 hours\n`;
        report += `- Risk: Low (industry standard pattern)\n`;
        report += `- ROI: Prevents failures, improves maintainability\n\n`;
      }

      report += `**Option B: Add Recursion Check**\n`;
      report += `- Add custom field \`${primaryObject}.Trigger_Recursion_Flag__c\` (Checkbox)\n`;
      report += `- Set flag on first execution, check before processing\n`;
      report += `- Estimated effort: 2-3 hours\n`;
      report += `- Risk: Medium (adds technical debt, field management)\n\n`;

      if (components.some(c => c.type === 'WorkflowRule' || c.type === 'ProcessBuilder')) {
        report += `**Option C: Workflow/Process Builder Migration**\n`;
        report += `- Migrate Workflow Rules/Process Builders to Flows\n`;
        report += `- Consolidate logic to reduce cascade complexity\n`;
        report += `- Estimated effort: 6-10 hours\n`;
        report += `- Risk: Medium (requires thorough testing)\n\n`;
      }

      // Next steps
      report += `**Next Steps**:\n`;
      report += `1. Review detailed automation cascade: [automation/cpq-automation-cascade-detailed.md](automation/cpq-automation-cascade-detailed.md)\n`;
      report += `2. Use \`sfdc-automation-builder\` agent to implement trigger consolidation\n`;
      report += `3. Test in sandbox environment before deploying to production\n`;
      report += `4. Re-run Q2C audit to verify resolution\n\n`;

      // Learning resources
      report += `**Learn More**:\n`;
      report += `- [Salesforce Trigger Best Practices](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_triggers_best_practices.htm)\n`;
      report += `- [Trigger Framework Pattern](https://developer.salesforce.com/wiki/apex_enterprise_patterns_-_trigger_frameworks)\n`;
      report += `- [Preventing Recursion in Triggers](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_triggers_context_variables.htm)\n\n`;

      report += `---\n\n`;
    });

    return report;
  }

  /**
   * Get audit statistics
   * @returns {Object} Audit statistics
   */
  getStatistics() {
    return {
      duration: this.results.duration,
      diagramsGenerated: Object.keys(this.results.diagrams).filter(
        key => this.results.diagrams[key]?.generated
      ).length,
      totalDiagrams: Object.keys(this.results.diagrams).length,
      errors: this.results.errors.length,
      warnings: this.results.warnings.length
    };
  }
}

module.exports = Q2CAuditOrchestrator;
