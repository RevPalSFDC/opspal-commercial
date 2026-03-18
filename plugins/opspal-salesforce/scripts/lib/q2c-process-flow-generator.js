#!/usr/bin/env node

/**
 * Q2C Process Flow Generator
 *
 * Generates comprehensive Quote-to-Cash process flow diagrams showing automation
 * at each stage of the Q2C lifecycle. Supports layered output (high-level + detailed).
 *
 * @module q2c-process-flow-generator
 * @version 1.0.0
 * @phase Phase 2: Build Q2C Process Flow Generator
 *
 * Q2C Stages Mapped:
 * 1. Quote Creation - Opportunity conversion, quote generation
 * 2. Product Configuration - Product selection, pricing, bundles
 * 3. Pricing & Discounting - Price rules, discount schedules
 * 4. Quote Approval - Multi-level approvals, manager reviews
 * 5. Quote Presentation - Send to customer, negotiation
 * 6. Quote Acceptance - Customer acceptance, signature
 * 7. Contract Generation - Contract creation, amendments
 * 8. Order Processing - Order creation, fulfillment
 * 9. Billing & Invoicing - Invoice generation, payment
 * 10. Revenue Recognition - Revenue booking, subscriptions
 *
 * Related Components:
 * - FlowMetadataRetriever - Flow discovery
 * - AutomationInventoryOrchestrator - Trigger/workflow inventory
 * - CascadeTracer - Automation chain mapping
 * - CPQDiagramGenerator - Reusable diagram utilities
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Q2C Process Flow Generator Class
 */
class Q2CProcessFlowGenerator {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.options = {
      detailLevel: options.detailLevel || 'both', // 'high-level', 'detailed', 'both'
      outputDir: options.outputDir || './diagrams',
      verbose: options.verbose || false,
      includeInactive: options.includeInactive || false, // Include inactive flows
      ...options
    };

    // Q2C stage definitions with associated objects and automation keywords
    this.q2cStages = {
      quoteCreation: {
        name: 'Quote Creation',
        order: 1,
        objects: ['Opportunity', 'SBQQ__Quote__c', 'Quote'],
        keywords: ['create quote', 'new quote', 'quote generation', 'opportunity to quote'],
        color: '#e1f5fe'
      },
      productConfiguration: {
        name: 'Product Configuration',
        order: 2,
        objects: ['SBQQ__QuoteLine__c', 'QuoteLineItem', 'Product2', 'SBQQ__ProductOption__c'],
        keywords: ['add product', 'configure', 'product selection', 'bundle'],
        color: '#f3e5f5'
      },
      pricing: {
        name: 'Pricing & Discounting',
        order: 3,
        objects: ['SBQQ__Quote__c', 'SBQQ__PriceRule__c', 'SBQQ__DiscountSchedule__c', 'PricebookEntry'],
        keywords: ['pricing', 'price', 'discount', 'pricing rule', 'calculate'],
        color: '#fff3e0'
      },
      approval: {
        name: 'Quote Approval',
        order: 4,
        objects: ['SBQQ__Quote__c', 'ProcessInstance', 'ApprovalRequest'],
        keywords: ['approve', 'approval', 'manager review', 'submit for approval'],
        color: '#ffebee'
      },
      presentation: {
        name: 'Quote Presentation',
        order: 5,
        objects: ['SBQQ__Quote__c', 'ContentDocument', 'EmailMessage'],
        keywords: ['send', 'present', 'customer review', 'proposal'],
        color: '#e8f5e9'
      },
      acceptance: {
        name: 'Quote Acceptance',
        order: 6,
        objects: ['SBQQ__Quote__c', 'Contract', 'Signature'],
        keywords: ['accept', 'sign', 'customer acceptance', 'e-signature'],
        color: '#e0f2f1'
      },
      contract: {
        name: 'Contract Generation',
        order: 7,
        objects: ['Contract', 'SBQQ__Subscription__c', 'Amendment'],
        keywords: ['contract', 'amendment', 'renewal', 'subscription'],
        color: '#fce4ec'
      },
      order: {
        name: 'Order Processing',
        order: 8,
        objects: ['Order', 'OrderItem', 'SBQQ__OrderProduct__c'],
        keywords: ['order', 'fulfillment', 'activate'],
        color: '#f1f8e9'
      },
      billing: {
        name: 'Billing & Invoicing',
        order: 9,
        objects: ['Invoice__c', 'Payment__c', 'SBQQ__Invoice__c'],
        keywords: ['invoice', 'bill', 'payment', 'charge'],
        color: '#fff9c4'
      },
      revenue: {
        name: 'Revenue Recognition',
        order: 10,
        objects: ['RevenueSchedule', 'SBQQ__Subscription__c', 'Asset'],
        keywords: ['revenue', 'booking', 'recognition', 'mrr', 'arr'],
        color: '#c5cae9'
      }
    };
  }

  /**
   * Generate complete Q2C process flow diagram
   * @param {Object} options - Generation options
   * @returns {Object} Diagram metadata with file paths
   */
  async generateQ2CProcessFlow(options = {}) {
    const detailLevel = options.detailLevel || this.options.detailLevel;

    if (this.options.verbose) {
      console.log('📊 Generating Q2C Process Flow Diagram...');
      console.log(`   Org: ${this.orgAlias}`);
      console.log(`   Detail Level: ${detailLevel}`);
    }

    // Step 1: Discover all Q2C automation
    const automation = await this.discoverQ2CAutomation();

    // Step 2: Map automation to Q2C stages
    const stageMapping = this.mapAutomationToStages(automation);

    // Step 3: Generate diagrams
    const diagrams = {};

    if (detailLevel === 'high-level' || detailLevel === 'both') {
      diagrams.highLevel = await this._generateHighLevelProcessFlow(stageMapping);
    }

    if (detailLevel === 'detailed' || detailLevel === 'both') {
      diagrams.detailed = await this._generateDetailedProcessFlow(stageMapping);
    }

    return diagrams;
  }

  /**
   * Discover all Q2C-related automation in the org
   * @returns {Object} Automation inventory categorized by type
   */
  async discoverQ2CAutomation() {
    if (this.options.verbose) {
      console.log('   🔍 Discovering Q2C automation...');
    }

    const automation = {
      flows: await this._discoverFlows(),
      triggers: await this._discoverTriggers(),
      approvalProcesses: await this._discoverApprovalProcesses(),
      validationRules: await this._discoverValidationRules(),
      workflowRules: await this._discoverWorkflowRules()
    };

    const totalCount =
      automation.flows.length +
      automation.triggers.length +
      automation.approvalProcesses.length +
      automation.validationRules.length +
      automation.workflowRules.length;

    if (this.options.verbose) {
      console.log(`   ✓ Found ${totalCount} automation components`);
      console.log(`     - Flows: ${automation.flows.length}`);
      console.log(`     - Triggers: ${automation.triggers.length}`);
      console.log(`     - Approval Processes: ${automation.approvalProcesses.length}`);
      console.log(`     - Validation Rules: ${automation.validationRules.length}`);
      console.log(`     - Workflow Rules: ${automation.workflowRules.length}`);
    }

    return automation;
  }

  /**
   * Map automation components to Q2C stages
   * @param {Object} automation - Automation inventory
   * @returns {Object} Stage mapping with automation at each stage
   */
  mapAutomationToStages(automation) {
    const stageMapping = {};

    // Initialize stages
    Object.keys(this.q2cStages).forEach(stageKey => {
      stageMapping[stageKey] = {
        ...this.q2cStages[stageKey],
        automation: {
          flows: [],
          triggers: [],
          approvals: [],
          validations: [],
          workflows: []
        }
      };
    });

    // Map flows to stages
    automation.flows.forEach(flow => {
      const stage = this._matchFlowToStage(flow);
      if (stage) {
        stageMapping[stage].automation.flows.push(flow);
      }
    });

    // Map triggers to stages
    automation.triggers.forEach(trigger => {
      const stage = this._matchTriggerToStage(trigger);
      if (stage) {
        stageMapping[stage].automation.triggers.push(trigger);
      }
    });

    // Map approval processes to stages (usually in approval stage)
    automation.approvalProcesses.forEach(approval => {
      const stage = this._matchApprovalToStage(approval);
      if (stage) {
        stageMapping[stage].automation.approvals.push(approval);
      }
    });

    // Map validation rules to stages
    automation.validationRules.forEach(rule => {
      const stage = this._matchValidationToStage(rule);
      if (stage) {
        stageMapping[stage].automation.validations.push(rule);
      }
    });

    // Map workflow rules to stages
    automation.workflowRules.forEach(workflow => {
      const stage = this._matchWorkflowToStage(workflow);
      if (stage) {
        stageMapping[stage].automation.workflows.push(workflow);
      }
    });

    return stageMapping;
  }

  // ==================== PRIVATE METHODS: AUTOMATION DISCOVERY ====================

  /**
   * Discover flows using FlowDefinitionView query
   * @private
   */
  async _discoverFlows() {
    try {
      const activeFilter = this.options.includeInactive ? '' : "AND ActiveVersionId != null";
      const query = `SELECT DeveloperName, Label, ProcessType, TriggerType, TriggerObjectOrEvent.QualifiedApiName
                     FROM FlowDefinitionView
                     WHERE ProcessType IN ('RecordAfterSave', 'RecordBeforeSave', 'InvocableProcess', 'Workflow')
                     ${activeFilter}`;

      const result = execSync(
        `sf data query --query "${query}" --target-org ${this.orgAlias} --use-tooling-api --json`,
        { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
      );

      const parsed = JSON.parse(result);
      if (parsed.status === 0 && parsed.result && parsed.result.records) {
        return parsed.result.records.map(record => ({
          name: record.DeveloperName,
          label: record.Label,
          type: record.ProcessType,
          triggerType: record.TriggerType,
          object: record.TriggerObjectOrEvent?.QualifiedApiName || 'Unknown'
        }));
      }

      return [];
    } catch (error) {
      if (this.options.verbose) {
        console.warn(`   ⚠️  Flow discovery failed: ${error.message}`);
      }
      return [];
    }
  }

  /**
   * Discover Apex triggers
   * @private
   */
  async _discoverTriggers() {
    try {
      const query = `SELECT Name, TableEnumOrId, Status
                     FROM ApexTrigger
                     WHERE Status = 'Active'`;

      const result = execSync(
        `sf data query --query "${query}" --target-org ${this.orgAlias} --use-tooling-api --json`,
        { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
      );

      const parsed = JSON.parse(result);
      if (parsed.status === 0 && parsed.result && parsed.result.records) {
        return parsed.result.records.map(record => ({
          name: record.Name,
          object: record.TableEnumOrId,
          status: record.Status
        }));
      }

      return [];
    } catch (error) {
      if (this.options.verbose) {
        console.warn(`   ⚠️  Trigger discovery failed: ${error.message}`);
      }
      return [];
    }
  }

  /**
   * Discover approval processes
   * @private
   */
  async _discoverApprovalProcesses() {
    try {
      const query = `SELECT Id, Name, TableEnumOrId
                     FROM ProcessDefinition
                     WHERE Type = 'Approval'`;

      const result = execSync(
        `sf data query --query "${query}" --target-org ${this.orgAlias} --use-tooling-api --json`,
        { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
      );

      const parsed = JSON.parse(result);
      if (parsed.status === 0 && parsed.result && parsed.result.records) {
        return parsed.result.records.map(record => ({
          name: record.Name,
          object: record.TableEnumOrId
        }));
      }

      return [];
    } catch (error) {
      if (this.options.verbose) {
        console.warn(`   ⚠️  Approval process discovery failed: ${error.message}`);
      }
      return [];
    }
  }

  /**
   * Discover validation rules
   * @private
   */
  async _discoverValidationRules() {
    try {
      const query = `SELECT ValidationName, EntityDefinition.QualifiedApiName, Active
                     FROM ValidationRule
                     WHERE Active = true`;

      const result = execSync(
        `sf data query --query "${query}" --target-org ${this.orgAlias} --use-tooling-api --json`,
        { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
      );

      const parsed = JSON.parse(result);
      if (parsed.status === 0 && parsed.result && parsed.result.records) {
        return parsed.result.records.map(record => ({
          name: record.ValidationName,
          object: record.EntityDefinition?.QualifiedApiName || 'Unknown'
        }));
      }

      return [];
    } catch (error) {
      if (this.options.verbose) {
        console.warn(`   ⚠️  Validation rule discovery failed: ${error.message}`);
      }
      return [];
    }
  }

  /**
   * Discover workflow rules
   * @private
   */
  async _discoverWorkflowRules() {
    try {
      const query = `SELECT Name, TableEnumOrId
                     FROM WorkflowRule`;

      const result = execSync(
        `sf data query --query "${query}" --target-org ${this.orgAlias} --use-tooling-api --json`,
        { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
      );

      const parsed = JSON.parse(result);
      if (parsed.status === 0 && parsed.result && parsed.result.records) {
        return parsed.result.records.map(record => ({
          name: record.Name,
          object: record.TableEnumOrId
        }));
      }

      return [];
    } catch (error) {
      if (this.options.verbose) {
        console.warn(`   ⚠️  Workflow rule discovery failed: ${error.message}`);
      }
      return [];
    }
  }

  // ==================== PRIVATE METHODS: STAGE MATCHING ====================

  /**
   * Match flow to Q2C stage based on object and keywords
   * Uses scoring to find best match (prioritizes keyword specificity)
   * @private
   */
  _matchFlowToStage(flow) {
    const flowName = (flow.name + ' ' + flow.label).toLowerCase();
    const flowObject = flow.object;

    let bestMatch = null;
    let bestScore = 0;

    // Score each stage based on matches
    for (const [stageKey, stage] of Object.entries(this.q2cStages)) {
      let score = 0;

      // Check if flow name contains stage keywords (higher priority)
      for (const keyword of stage.keywords) {
        if (flowName.includes(keyword.toLowerCase())) {
          // Longer keywords get higher scores (more specific)
          score += keyword.length * 10;
        }
      }

      // Check if flow object matches stage objects (lower priority)
      if (flowObject) {
        for (const obj of stage.objects) {
          if (flowObject.includes(obj)) {
            score += 5;
          }
        }
      }

      // Update best match if this stage has higher score
      if (score > bestScore) {
        bestScore = score;
        bestMatch = stageKey;
      }
    }

    return bestMatch; // Return best match or null if no matches
  }

  /**
   * Match trigger to Q2C stage
   * @private
   */
  _matchTriggerToStage(trigger) {
    const triggerObject = trigger.object;

    for (const [stageKey, stage] of Object.entries(this.q2cStages)) {
      const objectMatch = stage.objects.some(obj =>
        triggerObject && triggerObject.includes(obj)
      );

      if (objectMatch) {
        return stageKey;
      }
    }

    return null;
  }

  /**
   * Match approval process to stage (usually approval stage)
   * @private
   */
  _matchApprovalToStage(approval) {
    // Most approval processes belong to approval stage
    // But check object to be sure
    if (approval.object && approval.object.includes('Quote')) {
      return 'approval';
    }

    // Check other stages if not quote-related
    for (const [stageKey, stage] of Object.entries(this.q2cStages)) {
      const objectMatch = stage.objects.some(obj =>
        approval.object && approval.object.includes(obj)
      );

      if (objectMatch) {
        return stageKey;
      }
    }

    return 'approval'; // Default to approval stage
  }

  /**
   * Match validation rule to stage
   * @private
   */
  _matchValidationToStage(rule) {
    const ruleObject = rule.object;

    for (const [stageKey, stage] of Object.entries(this.q2cStages)) {
      const objectMatch = stage.objects.some(obj =>
        ruleObject && ruleObject.includes(obj)
      );

      if (objectMatch) {
        return stageKey;
      }
    }

    return null;
  }

  /**
   * Match workflow rule to stage
   * @private
   */
  _matchWorkflowToStage(workflow) {
    const workflowObject = workflow.object;

    for (const [stageKey, stage] of Object.entries(this.q2cStages)) {
      const objectMatch = stage.objects.some(obj =>
        workflowObject && workflowObject.includes(obj)
      );

      if (objectMatch) {
        return stageKey;
      }
    }

    return null;
  }

  // ==================== PRIVATE METHODS: DIAGRAM GENERATION ====================

  /**
   * Generate high-level Q2C process flow (stages only)
   * @private
   */
  async _generateHighLevelProcessFlow(stageMapping) {
    let mermaid = `flowchart LR
`;

    // Get sorted stages
    const sortedStages = Object.entries(stageMapping)
      .sort(([, a], [, b]) => a.order - b.order);

    // Add stage nodes with automation counts
    sortedStages.forEach(([stageKey, stage]) => {
      const totalAutomation =
        stage.automation.flows.length +
        stage.automation.triggers.length +
        stage.automation.approvals.length +
        stage.automation.validations.length +
        stage.automation.workflows.length;

      const stageId = this._sanitizeId(stageKey);
      const stageName = this._sanitizeMermaidText(stage.name);
      const count = totalAutomation > 0 ? `\\n(${totalAutomation} automation${totalAutomation !== 1 ? 's' : ''})` : '';

      mermaid += `  ${stageId}["${stageName}${count}"]
`;

      // Apply color styling
      if (stage.color) {
        mermaid += `  style ${stageId} fill:${stage.color}
`;
      }
    });

    mermaid += `
`;

    // Add connections between stages
    for (let i = 0; i < sortedStages.length - 1; i++) {
      const currentStageId = this._sanitizeId(sortedStages[i][0]);
      const nextStageId = this._sanitizeId(sortedStages[i + 1][0]);
      mermaid += `  ${currentStageId} --> ${nextStageId}
`;
    }

    return await this._saveDiagram(
      mermaid,
      'q2c-process-flow-overview',
      'Q2C Process Flow (Overview)'
    );
  }

  /**
   * Generate detailed Q2C process flow (stages + automation)
   * @private
   */
  async _generateDetailedProcessFlow(stageMapping) {
    let mermaid = `flowchart TB
`;

    // Get sorted stages
    const sortedStages = Object.entries(stageMapping)
      .sort(([, a], [, b]) => a.order - b.order);

    // Add each stage as a subgraph with its automation
    sortedStages.forEach(([stageKey, stage]) => {
      const stageId = this._sanitizeId(stageKey);
      const stageName = this._sanitizeMermaidText(stage.name);

      mermaid += `
  subgraph ${stageId}["${stageName}"]
    direction TB
`;

      // Add stage entry node
      mermaid += `    ${stageId}_start((Start))
`;

      // Add automation nodes
      let hasAutomation = false;

      // Add flows
      stage.automation.flows.forEach((flow, idx) => {
        hasAutomation = true;
        const flowId = `${stageId}_flow${idx}`;
        const flowLabel = this._sanitizeMermaidText(flow.label || flow.name);
        mermaid += `    ${flowId}["Flow: ${flowLabel}"]
`;
      });

      // Add triggers
      stage.automation.triggers.forEach((trigger, idx) => {
        hasAutomation = true;
        const triggerId = `${stageId}_trigger${idx}`;
        const triggerLabel = this._sanitizeMermaidText(trigger.name);
        mermaid += `    ${triggerId}["Trigger: ${triggerLabel}"]
`;
      });

      // Add approvals
      stage.automation.approvals.forEach((approval, idx) => {
        hasAutomation = true;
        const approvalId = `${stageId}_approval${idx}`;
        const approvalLabel = this._sanitizeMermaidText(approval.name);
        mermaid += `    ${approvalId}{{"Approval: ${approvalLabel}"}}
`;
      });

      // Add validations
      stage.automation.validations.forEach((validation, idx) => {
        hasAutomation = true;
        const validationId = `${stageId}_validation${idx}`;
        const validationLabel = this._sanitizeMermaidText(validation.name);
        mermaid += `    ${validationId}[/"Validation: ${validationLabel}"/]
`;
      });

      // Add workflows
      stage.automation.workflows.forEach((workflow, idx) => {
        hasAutomation = true;
        const workflowId = `${stageId}_workflow${idx}`;
        const workflowLabel = this._sanitizeMermaidText(workflow.name);
        mermaid += `    ${workflowId}["Workflow: ${workflowLabel}"]
`;
      });

      // Add stage exit node
      mermaid += `    ${stageId}_end((Complete))
`;

      // Add connections within stage
      if (hasAutomation) {
        // Connect start to first automation of each type
        if (stage.automation.flows.length > 0) {
          mermaid += `    ${stageId}_start --> ${stageId}_flow0
`;
        }
        if (stage.automation.triggers.length > 0) {
          mermaid += `    ${stageId}_start --> ${stageId}_trigger0
`;
        }
        if (stage.automation.approvals.length > 0) {
          mermaid += `    ${stageId}_start --> ${stageId}_approval0
`;
        }
        if (stage.automation.validations.length > 0) {
          mermaid += `    ${stageId}_start --> ${stageId}_validation0
`;
        }
        if (stage.automation.workflows.length > 0) {
          mermaid += `    ${stageId}_start --> ${stageId}_workflow0
`;
        }

        // Connect all automation to end
        const allAutomationIds = [];
        stage.automation.flows.forEach((_, idx) => allAutomationIds.push(`${stageId}_flow${idx}`));
        stage.automation.triggers.forEach((_, idx) => allAutomationIds.push(`${stageId}_trigger${idx}`));
        stage.automation.approvals.forEach((_, idx) => allAutomationIds.push(`${stageId}_approval${idx}`));
        stage.automation.validations.forEach((_, idx) => allAutomationIds.push(`${stageId}_validation${idx}`));
        stage.automation.workflows.forEach((_, idx) => allAutomationIds.push(`${stageId}_workflow${idx}`));

        allAutomationIds.forEach(id => {
          mermaid += `    ${id} --> ${stageId}_end
`;
        });
      } else {
        // No automation, direct connection
        mermaid += `    ${stageId}_start --> ${stageId}_end
`;
      }

      mermaid += `  end
`;
    });

    mermaid += `
`;

    // Add connections between stages
    for (let i = 0; i < sortedStages.length - 1; i++) {
      const currentStageId = this._sanitizeId(sortedStages[i][0]);
      const nextStageId = this._sanitizeId(sortedStages[i + 1][0]);
      mermaid += `  ${currentStageId} --> ${nextStageId}
`;
    }

    return await this._saveDiagram(
      mermaid,
      'q2c-process-flow-detailed',
      'Q2C Process Flow (Detailed)'
    );
  }

  // ==================== HELPER METHODS ====================

  /**
   * Sanitize text for Mermaid diagram nodes
   * @private
   */
  _sanitizeMermaidText(text) {
    return (text || '')
      .replace(/"/g, '\\"')  // Escape quotes
      .replace(/\n/g, '\\n') // Escape newlines
      .substring(0, 100);    // Limit length
  }

  /**
   * Sanitize ID for Mermaid node IDs
   * @private
   */
  _sanitizeId(text) {
    return (text || 'node')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .substring(0, 50);
  }

  /**
   * Save diagram to file
   * @private
   */
  async _saveDiagram(mermaidCode, filename, title) {
    // Ensure output directory exists
    if (!fs.existsSync(this.options.outputDir)) {
      fs.mkdirSync(this.options.outputDir, { recursive: true });
    }

    const metadata = {
      filename,
      title,
      paths: {},
      metadata: {
        orgAlias: this.orgAlias,
        generatedAt: new Date().toISOString()
      }
    };

    // Save as Markdown file
    const mdPath = path.join(this.options.outputDir, `${filename}.md`);
    const mdContent = `# ${title}

Org: ${this.orgAlias}
Generated: ${new Date().toLocaleString()}

\`\`\`mermaid
${mermaidCode}
\`\`\`

---

*Generated by OpsPal by RevPal*
`;
    fs.writeFileSync(mdPath, mdContent, 'utf8');
    metadata.paths.markdown = mdPath;

    if (this.options.verbose) {
      console.log(`   ✓ Saved diagram: ${mdPath}`);
    }

    return metadata;
  }
}

// ==================== EXPORTS ====================

module.exports = Q2CProcessFlowGenerator;

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Q2C Process Flow Generator v1.0.0');
    console.log('\nUsage: node q2c-process-flow-generator.js <org-alias> [options]');
    console.log('\nOptions:');
    console.log('  --detail-level <level>  Detail level: high-level, detailed, both (default: both)');
    console.log('  --output-dir <path>     Output directory (default: ./diagrams)');
    console.log('  --verbose               Enable verbose output');
    console.log('  --include-inactive      Include inactive flows');
    console.log('\nExample:');
    console.log('  node q2c-process-flow-generator.js my-org --detail-level both --verbose');
    process.exit(0);
  }

  const orgAlias = args[0];
  const options = {
    detailLevel: 'both',
    outputDir: './diagrams',
    verbose: false,
    includeInactive: false
  };

  // Parse command-line options
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--detail-level' && args[i + 1]) {
      options.detailLevel = args[++i];
    } else if (args[i] === '--output-dir' && args[i + 1]) {
      options.outputDir = args[++i];
    } else if (args[i] === '--verbose') {
      options.verbose = true;
    } else if (args[i] === '--include-inactive') {
      options.includeInactive = true;
    }
  }

  // Run generator
  (async () => {
    try {
      const generator = new Q2CProcessFlowGenerator(orgAlias, options);
      const diagrams = await generator.generateQ2CProcessFlow();

      console.log('\n✅ Q2C Process Flow diagrams generated successfully!');
      if (diagrams.highLevel) {
        console.log(`   High-level: ${diagrams.highLevel.paths.markdown}`);
      }
      if (diagrams.detailed) {
        console.log(`   Detailed: ${diagrams.detailed.paths.markdown}`);
      }
    } catch (error) {
      console.error('\n❌ Error generating Q2C process flow:', error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  })();
}
