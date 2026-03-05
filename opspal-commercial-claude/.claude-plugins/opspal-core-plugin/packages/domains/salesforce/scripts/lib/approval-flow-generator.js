/**
 * Approval Flow Generator
 *
 * Generates sequence diagrams showing approval process flows.
 *
 * Features:
 * - Discovers approval processes via Salesforce APIs
 * - Maps approval steps, approvers, and criteria
 * - Identifies rejection paths and escalation rules
 * - Generates layered Mermaid sequence diagrams
 *   - High-level: Simplified approval flow (submitter → approvers → outcome)
 *   - Detailed: Full flow with all steps, criteria, and decision paths
 *
 * Usage:
 *   const generator = new ApprovalFlowGenerator(orgAlias, options);
 *   const flows = await generator.generateApprovalFlowDiagrams();
 *
 * @phase Phase 5: Build Approval Flow Generator
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ApprovalFlowGenerator {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.options = {
      detailLevel: options.detailLevel || 'both', // 'high-level', 'detailed', 'both'
      outputDir: options.outputDir || './diagrams',
      saveAsMarkdown: options.saveAsMarkdown !== false,
      saveMermaidOnly: options.saveMermaidOnly || false,
      focusObjects: options.focusObjects || [], // Empty = all objects with approval processes
      includeInactive: options.includeInactive || false,
      verbose: options.verbose || false
    };

    // CPQ objects commonly using approval processes
    this.cpqObjects = [
      'SBQQ__Quote__c',
      'Opportunity',
      'Contract',
      'SBQQ__Subscription__c'
    ];

    this.approvalProcessCache = null;
  }

  /**
   * Main entry point - generates approval flow diagrams
   * @returns {Object} Generated diagram metadata
   */
  async generateApprovalFlowDiagrams(options = {}) {
    const detailLevel = options.detailLevel || this.options.detailLevel;

    // Discover approval processes
    const approvalProcesses = await this._discoverApprovalProcesses();

    if (approvalProcesses.length === 0) {
      if (this.options.verbose) {
        console.log('No approval processes found');
      }
      return { approvalProcesses: [], diagrams: [] };
    }

    const result = {
      approvalProcesses,
      diagrams: []
    };

    // Generate diagram for each approval process
    for (const process of approvalProcesses) {
      const processResult = {};

      if (detailLevel === 'high-level' || detailLevel === 'both') {
        processResult.highLevel = await this._generateHighLevelApprovalFlow(process);
      }

      if (detailLevel === 'detailed' || detailLevel === 'both') {
        processResult.detailed = await this._generateDetailedApprovalFlow(process);
      }

      result.diagrams.push({
        processName: process.name,
        object: process.object,
        ...processResult
      });
    }

    return result;
  }

  /**
   * Discover approval processes in the org
   * @returns {Array} Approval process metadata
   */
  async _discoverApprovalProcesses() {
    if (this.approvalProcessCache) {
      return this.approvalProcessCache;
    }

    if (this.options.verbose) {
      console.log('Discovering approval processes...');
    }

    try {
      // Query ProcessDefinition for approval processes
      const query = `
        SELECT Id, DeveloperName, Name, TableEnumOrId, State, Type
        FROM ProcessDefinition
        WHERE Type = 'Approval'
        ${this.options.includeInactive ? '' : "AND State = 'Active'"}
      `;

      const result = this._executeQuery(query, { useToolingApi: true });
      const processes = result.records || [];

      if (this.options.verbose) {
        console.log(`Found ${processes.length} approval processes`);
      }

      // Filter to focus objects if specified
      let filteredProcesses = processes;
      if (this.options.focusObjects.length > 0) {
        const focusSet = new Set(this.options.focusObjects);
        filteredProcesses = processes.filter(p => focusSet.has(p.TableEnumOrId));
      }

      // Get approval steps for each process
      const approvalProcesses = [];
      for (const process of filteredProcesses) {
        const steps = await this._getApprovalSteps(process.Id);

        approvalProcesses.push({
          id: process.Id,
          name: process.DeveloperName,
          label: process.Name,
          object: process.TableEnumOrId,
          state: process.State,
          steps
        });
      }

      this.approvalProcessCache = approvalProcesses;
      return approvalProcesses;

    } catch (error) {
      if (this.options.verbose) {
        console.error('Error discovering approval processes:', error.message);
      }
      return [];
    }
  }

  /**
   * Get approval steps for a process
   * @param {String} processId - Process definition ID
   * @returns {Array} Approval steps
   */
  async _getApprovalSteps(processId) {
    try {
      const query = `
        SELECT Id, Name, StepNumber, ApprovalAction,
               AssignedApprover, ApprovedApprover, RejectedRecallAction,
               AllowDelegate, RejectBehavior
        FROM ProcessNode
        WHERE ProcessDefinitionId = '${processId}'
        ORDER BY StepNumber
      `;

      const result = this._executeQuery(query, { useToolingApi: true });
      const nodes = result.records || [];

      return nodes.map(node => ({
        id: node.Id,
        name: node.Name,
        stepNumber: node.StepNumber,
        approvalAction: node.ApprovalAction,
        assignedApprover: node.AssignedApprover,
        approvedApprover: node.ApprovedApprover,
        rejectedRecallAction: node.RejectedRecallAction,
        allowDelegate: node.AllowDelegate,
        rejectBehavior: node.RejectBehavior
      }));

    } catch (error) {
      if (this.options.verbose) {
        console.error(`Error getting steps for process ${processId}:`, error.message);
      }
      return [];
    }
  }

  /**
   * Generate high-level approval flow (simplified view)
   * @param {Object} process - Approval process metadata
   * @returns {Object} Diagram metadata
   */
  async _generateHighLevelApprovalFlow(process) {
    if (this.options.verbose) {
      console.log(`Generating high-level approval flow for ${process.name}...`);
    }

    let mermaidCode = 'sequenceDiagram\n';
    mermaidCode += '  participant Submitter\n';
    mermaidCode += '  participant System\n';

    // Add approver participants
    const approverCount = process.steps.length;
    for (let i = 0; i < approverCount; i++) {
      mermaidCode += `  participant Approver${i + 1}\n`;
    }

    // Submission
    mermaidCode += '  Submitter->>System: Submit for Approval\n';
    mermaidCode += '  activate System\n';

    // Approval steps
    for (let i = 0; i < process.steps.length; i++) {
      const step = process.steps[i];
      const approverLabel = `Approver${i + 1}`;

      mermaidCode += `  System->>+${approverLabel}: Request Approval (Step ${step.stepNumber})\n`;

      // Approval decision
      mermaidCode += `  alt Approved\n`;
      mermaidCode += `    ${approverLabel}-->>-System: Approve\n`;

      if (i === process.steps.length - 1) {
        // Final approval
        mermaidCode += `    System-->>Submitter: Approved\n`;
      }

      mermaidCode += `  else Rejected\n`;
      mermaidCode += `    ${approverLabel}-->>System: Reject\n`;
      mermaidCode += `    System-->>Submitter: Rejected\n`;
      mermaidCode += `  end\n`;
    }

    mermaidCode += '  deactivate System\n';

    const filename = `approval-flow-${this._sanitizeId(process.name)}-overview`;
    const title = `Approval Flow: ${process.label} - High Level`;

    return await this._saveDiagram(mermaidCode, filename, title, process.object);
  }

  /**
   * Generate detailed approval flow (with all steps and criteria)
   * @param {Object} process - Approval process metadata
   * @returns {Object} Diagram metadata
   */
  async _generateDetailedApprovalFlow(process) {
    if (this.options.verbose) {
      console.log(`Generating detailed approval flow for ${process.name}...`);
    }

    let mermaidCode = 'sequenceDiagram\n';
    mermaidCode += '  participant Submitter\n';
    mermaidCode += '  participant System\n';

    // Add approver participants
    const approverCount = process.steps.length;
    for (let i = 0; i < approverCount; i++) {
      const step = process.steps[i];
      const approverType = this._getApproverType(step);
      mermaidCode += `  participant Approver${i + 1} as ${this._sanitizeMermaidText(approverType)}\n`;
    }

    // Submission with entry criteria note
    mermaidCode += '  Submitter->>System: Submit for Approval\n';
    mermaidCode += '  activate System\n';
    mermaidCode += '  Note over System: Entry Criteria Check\n';

    // Approval steps with detailed information
    for (let i = 0; i < process.steps.length; i++) {
      const step = process.steps[i];
      const approverLabel = `Approver${i + 1}`;
      const stepName = this._sanitizeMermaidText(step.name || `Step ${step.stepNumber}`);

      mermaidCode += `  System->>+${approverLabel}: Request Approval\n`;
      mermaidCode += `  Note over ${approverLabel}: ${stepName}\n`;

      // Delegation option
      if (step.allowDelegate) {
        mermaidCode += `  Note over ${approverLabel}: Delegation Allowed\n`;
      }

      // Approval decision with detailed paths
      mermaidCode += `  alt Approved\n`;
      mermaidCode += `    ${approverLabel}-->>-System: Approve\n`;

      if (step.approvedApprover) {
        mermaidCode += `    Note over System: ${this._sanitizeMermaidText(step.approvedApprover)}\n`;
      }

      if (i === process.steps.length - 1) {
        // Final approval
        mermaidCode += `    System->>System: Final Approval Actions\n`;
        mermaidCode += `    System-->>Submitter: Approved\n`;
      } else {
        mermaidCode += `    Note over System: Proceed to Next Step\n`;
      }

      mermaidCode += `  else Rejected\n`;
      mermaidCode += `    ${approverLabel}-->>System: Reject\n`;

      // Rejection behavior
      const rejectBehavior = this._getRejectBehavior(step);
      mermaidCode += `    Note over System: ${rejectBehavior}\n`;

      if (step.rejectedRecallAction) {
        mermaidCode += `    Note over System: ${this._sanitizeMermaidText(step.rejectedRecallAction)}\n`;
      }

      mermaidCode += `    System-->>Submitter: Rejected\n`;
      mermaidCode += `  else Recalled\n`;
      mermaidCode += `    ${approverLabel}-->>System: Recall\n`;
      mermaidCode += `    System-->>Submitter: Recalled\n`;
      mermaidCode += `  end\n`;
    }

    mermaidCode += '  deactivate System\n';

    const filename = `approval-flow-${this._sanitizeId(process.name)}-detailed`;
    const title = `Approval Flow: ${process.label} - Detailed`;

    return await this._saveDiagram(mermaidCode, filename, title, process.object);
  }

  /**
   * Get approver type description
   * @param {Object} step - Approval step
   * @returns {String} Approver type
   */
  _getApproverType(step) {
    if (step.assignedApprover) {
      // Parse assigned approver to get type
      if (step.assignedApprover.includes('Queue')) {
        return 'Queue';
      } else if (step.assignedApprover.includes('User')) {
        return 'User';
      } else if (step.assignedApprover.includes('Role')) {
        return 'Role';
      } else if (step.assignedApprover.includes('Manager')) {
        return 'Manager';
      }
    }
    return `Approver (Step ${step.stepNumber})`;
  }

  /**
   * Get rejection behavior description
   * @param {Object} step - Approval step
   * @returns {String} Rejection behavior
   */
  _getRejectBehavior(step) {
    if (!step.rejectBehavior) {
      return 'Reject Record';
    }

    const behaviors = {
      'Reject': 'Reject Record',
      'RejectRequest': 'Reject Request Only',
      'RejectAndGoBack': 'Reject & Return to Previous Approver'
    };

    return behaviors[step.rejectBehavior] || step.rejectBehavior;
  }

  /**
   * Save diagram to file(s)
   * @param {String} mermaidCode - Mermaid diagram code
   * @param {String} filename - Base filename (without extension)
   * @param {String} title - Diagram title
   * @param {String} object - Salesforce object name
   * @returns {Object} Diagram metadata
   */
  async _saveDiagram(mermaidCode, filename, title, object) {
    // Ensure output directory exists
    if (!fs.existsSync(this.options.outputDir)) {
      fs.mkdirSync(this.options.outputDir, { recursive: true });
    }

    const result = {
      filename,
      title,
      object,
      paths: {},
      metadata: {
        orgAlias: this.orgAlias,
        generatedAt: new Date().toISOString()
      }
    };

    // Save as Markdown with Mermaid code block
    if (this.options.saveAsMarkdown) {
      const markdownPath = path.join(this.options.outputDir, `${filename}.md`);
      const markdownContent = `# ${title}

Object: ${object}
Org: ${this.orgAlias}
Generated: ${new Date().toLocaleString()}

\`\`\`mermaid
${mermaidCode}
\`\`\`
`;
      fs.writeFileSync(markdownPath, markdownContent);
      result.paths.markdown = markdownPath;

      if (this.options.verbose) {
        console.log(`✓ Saved Markdown: ${markdownPath}`);
      }
    }

    // Save as .mmd file (plain Mermaid)
    if (this.options.saveMermaidOnly) {
      const mermaidPath = path.join(this.options.outputDir, `${filename}.mmd`);
      fs.writeFileSync(mermaidPath, mermaidCode);
      result.paths.mermaid = mermaidPath;

      if (this.options.verbose) {
        console.log(`✓ Saved Mermaid: ${mermaidPath}`);
      }
    }

    return result;
  }

  /**
   * Sanitize text for Mermaid diagram labels
   * @param {String} text - Text to sanitize
   * @returns {String} Sanitized text
   */
  _sanitizeMermaidText(text) {
    if (!text) return '';

    return text
      .replace(/"/g, '\\"')      // Escape quotes
      .replace(/\n/g, ' ')       // Remove newlines
      .replace(/\r/g, '')        // Remove carriage returns
      .replace(/\t/g, ' ')       // Replace tabs with spaces
      .replace(/  +/g, ' ')      // Collapse multiple spaces
      .trim();
  }

  /**
   * Sanitize ID for Mermaid diagram node IDs
   * @param {String} id - ID to sanitize
   * @returns {String} Sanitized ID
   */
  _sanitizeId(id) {
    if (!id) return '';

    return id
      .replace(/[^a-zA-Z0-9_]/g, '_')  // Replace non-alphanumeric with underscore
      .replace(/^_|_$/g, '');           // Remove leading/trailing underscores
  }

  /**
   * Execute SOQL query
   * @param {String} query - SOQL query
   * @param {Object} options - Query options
   * @returns {Object} Query result
   */
  _executeQuery(query, options = {}) {
    const useToolingApi = options.useToolingApi || false;
    const apiFlag = useToolingApi ? '--use-tooling-api' : '';

    try {
      const command = `sf data query --query "${query.replace(/"/g, '\\"')}" --target-org ${this.orgAlias} ${apiFlag} --json`;
      const result = execSync(command, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      const parsed = JSON.parse(result);

      if (parsed.status === 0) {
        return parsed.result;
      } else {
        throw new Error(parsed.message || 'Query failed');
      }
    } catch (error) {
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }
}

module.exports = ApprovalFlowGenerator;
