/**
 * CPQ Process Extrapolator
 *
 * Extrapolates the end-to-end Quote-to-Cash business process from discovered
 * technical components (objects, automation, approvals, flows). Generates
 * executive-friendly process diagrams and stage-by-stage risk analysis.
 *
 * @module cpq-process-extrapolator
 * @version 3.47.0
 */

const fs = require('fs');
const path = require('path');

class CPQProcessExtrapolator {
  constructor(orgAlias, discoveredComponents, options = {}) {
    this.orgAlias = orgAlias;
    this.components = discoveredComponents;
    this.options = {
      verbose: options.verbose || false,
      outputDir: options.outputDir || './output'
    };

    this.processStages = [];
    this.stageRisks = {};
    this.processEfficiency = 0;
    this.bottlenecks = [];
  }

  /**
   * Main entry point - analyzes process and generates outputs
   * @returns {Object} Process analysis results
   */
  async analyzeProcess() {
    if (this.options.verbose) {
      console.log('\n🔍 Extrapolating Q2C Business Process...');
    }

    // Step 1: Detect process stages from technical patterns
    this._detectProcessStages();

    // Step 2: Map technical components to stages
    this._mapComponentsToStages();

    // Step 3: Calculate stage-specific risks
    this._calculateStageRisks();

    // Step 4: Identify bottlenecks
    this._identifyBottlenecks();

    // Step 5: Calculate overall process efficiency
    this._calculateProcessEfficiency();

    // Step 6: Generate process diagram
    const diagramPath = await this._generateProcessDiagram();

    // Step 7: Generate executive summary
    const executiveSummary = this._generateExecutiveSummary();

    return {
      stages: this.processStages,
      stageRisks: this.stageRisks,
      bottlenecks: this.bottlenecks,
      processEfficiency: this.processEfficiency,
      diagramPath: diagramPath,
      executiveSummary: executiveSummary
    };
  }

  /**
   * Detect Q2C process stages from technical components
   * @private
   */
  _detectProcessStages() {
    const stages = [
      {
        name: 'Quote Creation',
        id: 'quote_creation',
        description: 'Initial quote setup and customer information capture',
        keyObjects: ['SBQQ__Quote__c', 'Opportunity', 'Account'],
        automationPatterns: ['create', 'initialize', 'setup'],
        typicalDuration: '0.5-1 days'
      },
      {
        name: 'Configuration',
        id: 'configuration',
        description: 'Product selection, pricing, and quote line configuration',
        keyObjects: ['SBQQ__QuoteLine__c', 'SBQQ__ProductOption__c', 'Product2', 'PricebookEntry'],
        automationPatterns: ['price', 'calculate', 'validate', 'configure'],
        typicalDuration: '1-3 days'
      },
      {
        name: 'Approval',
        id: 'approval',
        description: 'Multi-level approval routing and decision making',
        keyObjects: ['ProcessInstance', 'ProcessInstanceStep', 'SBQQ__Quote__c'],
        automationPatterns: ['approve', 'submit', 'route', 'escalate'],
        typicalDuration: '2-5 days'
      },
      {
        name: 'Contract Generation',
        id: 'contract',
        description: 'Contract creation, subscription setup, and documentation',
        keyObjects: ['Contract', 'SBQQ__Subscription__c', 'Order', 'ContractLineItem'],
        automationPatterns: ['contract', 'generate', 'subscribe', 'document'],
        typicalDuration: '0.5-1 days'
      },
      {
        name: 'Revenue Recognition',
        id: 'revenue',
        description: 'Revenue scheduling, invoicing, and financial recording',
        keyObjects: ['SBQQ__Subscription__c', 'OpportunityLineItem', 'Opportunity'],
        automationPatterns: ['revenue', 'invoice', 'schedule', 'recognize'],
        typicalDuration: '1-2 days'
      }
    ];

    this.processStages = stages;

    if (this.options.verbose) {
      console.log(`  → Detected ${stages.length} process stages`);
    }
  }

  /**
   * Map discovered technical components to process stages
   * @private
   */
  _mapComponentsToStages() {
    const { automation = {}, erd = {}, approvals = [], circularDeps = [] } = this.components;

    this.processStages.forEach(stage => {
      stage.mappedComponents = {
        objects: [],
        automation: [],
        approvals: [],
        circularDeps: []
      };

      // Map objects from ERD
      // ERD objects structure: [{ apiName: 'Account', label: 'Account', type: 'cpq-standard', ... }, ...]
      if (erd.objects && Array.isArray(erd.objects)) {
        stage.mappedComponents.objects = stage.keyObjects.filter(obj =>
          erd.objects.some(discovered =>
            discovered.apiName === obj ||
            discovered.apiName.includes(obj) ||
            obj.includes(discovered.apiName)
          )
        );
      }

      // Map automation components
      // Automation structure: { flows: [], triggers: [], processBuilders: [], validationRules: [], workflowRules: [] }
      // OR: { components: [] } for backwards compatibility
      let allAutomationComponents = [];

      if (automation.components) {
        // Backwards compatibility with older structure
        allAutomationComponents = automation.components;
      } else {
        // New structure from CPQAutomationCascadeGenerator
        allAutomationComponents = [
          ...(automation.flows || []),
          ...(automation.triggers || []),
          ...(automation.processBuilders || []),
          ...(automation.validationRules || []),
          ...(automation.workflowRules || [])
        ];
      }

      if (allAutomationComponents.length > 0) {
        stage.mappedComponents.automation = allAutomationComponents.filter(component => {
          const componentStr = JSON.stringify(component).toLowerCase();
          return stage.automationPatterns.some(pattern => componentStr.includes(pattern)) ||
                 stage.keyObjects.some(obj => componentStr.includes(obj.toLowerCase()));
        });
      }

      // Map approval processes
      if (approvals.length > 0) {
        stage.mappedComponents.approvals = approvals.filter(approval => {
          const approvalStr = JSON.stringify(approval).toLowerCase();
          return stage.keyObjects.some(obj => approvalStr.includes(obj.toLowerCase())) ||
                 stage.automationPatterns.some(pattern => approvalStr.includes(pattern));
        });
      }

      // Map circular dependencies
      if (circularDeps.length > 0) {
        stage.mappedComponents.circularDeps = circularDeps.filter(dep => {
          const depStr = JSON.stringify(dep).toLowerCase();
          return stage.keyObjects.some(obj => depStr.includes(obj.toLowerCase()));
        });
      }

      stage.componentCount =
        stage.mappedComponents.automation.length +
        stage.mappedComponents.approvals.length;
    });

    if (this.options.verbose) {
      console.log(`  → Mapped components to stages`);
    }
  }

  /**
   * Calculate risk scores for each process stage
   * @private
   */
  _calculateStageRisks() {
    this.processStages.forEach(stage => {
      let score = 0;
      const risks = {
        bottleneck: 0,
        dataQuality: 0,
        circularDeps: 0
      };

      // Bottleneck scoring (automation complexity)
      const autoCount = stage.mappedComponents.automation.length;
      if (autoCount > 75) {
        risks.bottleneck = 40;
        score += 40;
      } else if (autoCount > 50) {
        risks.bottleneck = 25;
        score += 25;
      } else if (autoCount > 25) {
        risks.bottleneck = 10;
        score += 10;
      }

      // Approval chain complexity
      const approvalCount = stage.mappedComponents.approvals.length;
      if (approvalCount > 5) {
        risks.bottleneck += 30;
        score += 30;
      } else if (approvalCount > 3) {
        risks.bottleneck += 15;
        score += 15;
      }

      // Data quality risk (inversely proportional to validation rules)
      const validationRules = stage.mappedComponents.automation.filter(c =>
        c.type === 'ValidationRule' || (c.Type && c.Type === 'ValidationRule')
      );
      if (validationRules.length < 3 && stage.id !== 'revenue') {
        risks.dataQuality = 20;
        score += 20;
      } else if (validationRules.length < 5) {
        risks.dataQuality = 10;
        score += 10;
      }

      // Circular dependency impact
      if (stage.mappedComponents.circularDeps.length > 0) {
        risks.circularDeps = 40;
        score += 40;
      }

      // Determine risk level
      let level, color, emoji;
      if (score >= 50) {
        level = 'HIGH';
        color = '#ff6b6b';
        emoji = '🔴';
      } else if (score >= 25) {
        level = 'MEDIUM';
        color = '#ffd93d';
        emoji = '🟡';
      } else {
        level = 'LOW';
        color = '#a3e7ac';
        emoji = '🟢';
      }

      this.stageRisks[stage.id] = {
        level,
        score,
        color,
        emoji,
        risks,
        componentCount: stage.componentCount,
        approvalLevels: approvalCount,
        circularDeps: stage.mappedComponents.circularDeps.length
      };

      stage.riskLevel = level;
      stage.riskEmoji = emoji;
      stage.riskScore = score;
    });

    if (this.options.verbose) {
      console.log(`  → Calculated stage risks`);
    }
  }

  /**
   * Identify top bottlenecks across the process
   * @private
   */
  _identifyBottlenecks() {
    this.bottlenecks = [];

    this.processStages.forEach(stage => {
      const risk = this.stageRisks[stage.id];

      // High automation complexity bottleneck
      if (risk.componentCount > 50) {
        this.bottlenecks.push({
          stage: stage.name,
          type: 'Automation Complexity',
          severity: risk.level,
          description: `${risk.componentCount} automation components create performance and maintenance risks`,
          impact: 'Slow processing, governor limit risks, difficult to troubleshoot',
          recommendation: 'Consolidate automation using trigger framework pattern',
          estimatedROI: 'Reduce processing time by 30-50%, improve maintainability'
        });
      }

      // Long approval chain bottleneck
      if (risk.approvalLevels > 5) {
        this.bottlenecks.push({
          stage: stage.name,
          type: 'Approval Bottleneck',
          severity: risk.level,
          description: `${risk.approvalLevels}-level approval chain extends cycle time`,
          impact: `Average ${stage.typicalDuration} delay, opportunity cost of slow deals`,
          recommendation: 'Consolidate approval levels, implement parallel approvals',
          estimatedROI: 'Reduce approval time by 40-60%, improve close rate'
        });
      }

      // Circular dependency bottleneck
      if (risk.circularDeps > 0) {
        this.bottlenecks.push({
          stage: stage.name,
          type: 'Circular Dependency',
          severity: 'HIGH',
          description: `${risk.circularDeps} circular dependencies detected`,
          impact: 'Governor limit failures, infinite loops, data corruption risk',
          recommendation: 'Implement trigger framework with execution control',
          estimatedROI: 'Eliminate system errors, improve reliability'
        });
      }

      // Data quality bottleneck
      if (risk.risks.dataQuality > 0) {
        this.bottlenecks.push({
          stage: stage.name,
          type: 'Data Quality Risk',
          severity: risk.level,
          description: 'Insufficient validation allows bad data into downstream stages',
          impact: 'Data cleanup costs, reporting inaccuracies, downstream errors',
          recommendation: 'Add validation rules at stage entry points',
          estimatedROI: 'Reduce data cleanup time by 50-70%'
        });
      }
    });

    // Sort by severity (HIGH > MEDIUM > LOW)
    this.bottlenecks.sort((a, b) => {
      const severityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });

    if (this.options.verbose) {
      console.log(`  → Identified ${this.bottlenecks.length} bottlenecks`);
    }
  }

  /**
   * Calculate overall process efficiency score (0-100)
   * @private
   */
  _calculateProcessEfficiency() {
    let totalScore = 0;
    const maxScore = 100;

    this.processStages.forEach(stage => {
      const risk = this.stageRisks[stage.id];

      // Invert risk score to efficiency score (high risk = low efficiency)
      const stageEfficiency = Math.max(0, 100 - risk.score);
      totalScore += stageEfficiency;
    });

    this.processEfficiency = Math.round(totalScore / this.processStages.length);

    if (this.options.verbose) {
      console.log(`  → Process efficiency: ${this.processEfficiency}/100`);
    }
  }

  /**
   * Generate Mermaid process flow diagram
   * @private
   * @returns {string} Path to diagram file
   */
  async _generateProcessDiagram() {
    let mermaid = '```mermaid\ngraph LR\n';

    // Create stage nodes with risk indicators
    const stageIds = [];
    this.processStages.forEach((stage, index) => {
      const id = `STAGE_${index + 1}`;
      stageIds.push(id);
      const label = `${stage.name} ${stage.riskEmoji}`;
      mermaid += `  ${id}["${label}"]\n`;
    });

    // Connect stages
    for (let i = 0; i < stageIds.length - 1; i++) {
      mermaid += `  ${stageIds[i]} --> ${stageIds[i + 1]}\n`;
    }

    mermaid += '\n';

    // Add styling based on risk levels
    this.processStages.forEach((stage, index) => {
      const id = `STAGE_${index + 1}`;
      const risk = this.stageRisks[stage.id];
      mermaid += `  style ${id} fill:${risk.color}\n`;
    });

    // Add detail nodes below main flow
    mermaid += '\n  %% Stage Details\n';
    this.processStages.forEach((stage, index) => {
      const id = `STAGE_${index + 1}`;
      const detailId = `${id}_DETAIL`;
      const risk = this.stageRisks[stage.id];

      // Show object count if objects are mapped, otherwise show 'N/A'
      const objectCount = stage.mappedComponents.objects.length;
      const objectText = objectCount > 0
        ? `${objectCount} object${objectCount !== 1 ? 's' : ''} (${stage.mappedComponents.objects.join(', ')})`
        : 'N/A';

      let details = `Objects: ${objectText}<br/>`;
      details += `Automation: ${risk.componentCount} components`;

      if (risk.approvalLevels > 0) {
        details += `<br/>Approvals: ${risk.approvalLevels} levels`;
      }

      if (risk.circularDeps > 0) {
        details += ` 🔴<br/>Circular Deps: ${risk.circularDeps}`;
      }

      details += `<br/>Risk: ${risk.level}`;

      mermaid += `  ${detailId}["${details}"]\n`;
      mermaid += `  ${id} -.-> ${detailId}\n`;
    });

    // Add legend
    mermaid += '\n  %% Legend\n';
    mermaid += '  LEGEND1["🟢 = Healthy Stage"]\n';
    mermaid += '  LEGEND2["🟡 = Moderate Risk"]\n';
    mermaid += '  LEGEND3["🔴 = High Risk / Bottleneck"]\n';
    mermaid += '  style LEGEND1 fill:#a3e7ac\n';
    mermaid += '  style LEGEND2 fill:#ffd93d\n';
    mermaid += '  style LEGEND3 fill:#ff6b6b\n';

    mermaid += '```\n';

    // Write to file
    const diagramPath = path.join(this.options.outputDir, 'Q2C-PROCESS-FLOW.md');
    const content = `# Quote-to-Cash Process Flow (Extrapolated)\n\n` +
      `**Organization**: ${this.orgAlias}\n` +
      `**Process Efficiency**: ${this.processEfficiency}/100\n` +
      `**Generated**: ${new Date().toISOString()}\n\n` +
      `## Process Overview\n\n${mermaid}\n`;

    fs.writeFileSync(diagramPath, content, 'utf8');

    if (this.options.verbose) {
      console.log(`  → Generated process diagram: ${diagramPath}`);
    }

    return diagramPath;
  }

  /**
   * Generate executive summary text
   * @private
   * @returns {Object} Executive summary data
   */
  _generateExecutiveSummary() {
    const healthyStages = this.processStages.filter(s => this.stageRisks[s.id].level === 'LOW');
    const moderateStages = this.processStages.filter(s => this.stageRisks[s.id].level === 'MEDIUM');
    const highRiskStages = this.processStages.filter(s => this.stageRisks[s.id].level === 'HIGH');

    const summary = {
      processEfficiency: this.processEfficiency,
      totalStages: this.processStages.length,
      healthyStages: healthyStages.length,
      moderateRiskStages: moderateStages.length,
      highRiskStages: highRiskStages.length,
      topBottlenecks: this.bottlenecks.slice(0, 5),
      stageBreakdown: this.processStages.map(stage => ({
        name: stage.name,
        risk: this.stageRisks[stage.id].level,
        emoji: stage.riskEmoji,
        componentCount: this.stageRisks[stage.id].componentCount,
        description: stage.description
      }))
    };

    return summary;
  }

  /**
   * Format executive summary as Markdown
   * @returns {string} Formatted executive summary
   */
  formatExecutiveSummary() {
    const summary = this._generateExecutiveSummary();

    let md = '## Executive Summary\n\n';
    md += '### Quote-to-Cash Process Overview\n\n';
    md += `**Process Efficiency Score**: ${summary.processEfficiency}/100\n\n`;
    md += `**Identified Process Stages**: ${summary.totalStages}\n`;
    md += `- Quote Creation → Configuration → Approval → Contract → Revenue\n\n`;

    md += '**Process Health**:\n';
    md += `- 🟢 Healthy Stages: ${summary.healthyStages}\n`;
    md += `- 🟡 Moderate Risk: ${summary.moderateRiskStages}\n`;
    md += `- 🔴 High Risk: ${summary.highRiskStages}\n\n`;

    if (summary.topBottlenecks.length > 0) {
      md += '**Top Bottlenecks**:\n';
      summary.topBottlenecks.forEach((bottleneck, index) => {
        md += `${index + 1}. **${bottleneck.stage}** - ${bottleneck.type}: ${bottleneck.description}\n`;
        md += `   - *Impact*: ${bottleneck.impact}\n`;
        md += `   - *Recommendation*: ${bottleneck.recommendation}\n`;
        md += `   - *Expected ROI*: ${bottleneck.estimatedROI}\n\n`;
      });
    }

    md += '### Stage-by-Stage Analysis\n\n';
    summary.stageBreakdown.forEach(stage => {
      md += `#### ${stage.name} ${stage.emoji}\n`;
      md += `- **Risk Level**: ${stage.risk}\n`;
      md += `- **Automation Components**: ${stage.componentCount}\n`;
      md += `- **Description**: ${stage.description}\n\n`;
    });

    return md;
  }
}

module.exports = CPQProcessExtrapolator;
