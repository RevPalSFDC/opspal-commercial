#!/usr/bin/env node

/**
 * n8n Workflow Validator
 *
 * Validates n8n workflow JSON structure before deployment.
 * Ensures workflows are syntactically correct and follow best practices.
 *
 * Features:
 * - Validates node structure and required fields
 * - Checks connection integrity (no orphaned nodes)
 * - Verifies credential references (not embedded secrets)
 * - Validates node type configurations
 * - Checks for common anti-patterns
 *
 * Usage:
 *   const N8nWorkflowValidator = require('./n8n-workflow-validator');
 *   const validator = new N8nWorkflowValidator();
 *   const result = validator.validate(workflowJson);
 *   if (!result.valid) console.error(result.errors);
 *
 * CLI Commands:
 *   node n8n-workflow-validator.js validate <file.json>  - Validate workflow file
 *   node n8n-workflow-validator.js check-connections     - Check connection integrity
 *   node n8n-workflow-validator.js analyze <file.json>   - Full analysis with suggestions
 */

const fs = require('fs');
const path = require('path');

class N8nWorkflowValidator {
  constructor(options = {}) {
    this.options = {
      strictMode: options.strictMode || false,
      maxNodes: options.maxNodes || 100,
      maxParallelPaths: options.maxParallelPaths || 10,
      maxNestingDepth: options.maxNestingDepth || 5,
      ...options
    };

    this.errors = [];
    this.warnings = [];
    this.suggestions = [];

    // Known n8n node types
    this.knownNodeTypes = new Set([
      // Triggers
      'n8n-nodes-base.salesforceTrigger',
      'n8n-nodes-base.hubspotTrigger',
      'n8n-nodes-base.webhook',
      'n8n-nodes-base.scheduleTrigger',
      'n8n-nodes-base.manualTrigger',
      'n8n-nodes-base.errorTrigger',
      // Actions
      'n8n-nodes-base.salesforce',
      'n8n-nodes-base.hubspot',
      'n8n-nodes-base.httpRequest',
      'n8n-nodes-base.code',
      'n8n-nodes-base.set',
      'n8n-nodes-base.function',
      'n8n-nodes-base.functionItem',
      // Logic
      'n8n-nodes-base.if',
      'n8n-nodes-base.switch',
      'n8n-nodes-base.merge',
      'n8n-nodes-base.splitInBatches',
      'n8n-nodes-base.wait',
      'n8n-nodes-base.noOp',
      'n8n-nodes-base.stopAndError',
      // Workflow
      'n8n-nodes-base.executeWorkflow',
      'n8n-nodes-base.executeWorkflowTrigger',
      // Communication
      'n8n-nodes-base.slack',
      'n8n-nodes-base.email',
      'n8n-nodes-base.emailSend',
      // Data
      'n8n-nodes-base.spreadsheetFile',
      'n8n-nodes-base.readBinaryFiles',
      'n8n-nodes-base.writeBinaryFile'
    ]);

    // Required fields for each node type
    this.requiredNodeFields = {
      'n8n-nodes-base.salesforceTrigger': ['triggerOn', 'sobject'],
      'n8n-nodes-base.salesforce': ['operation', 'resource'],
      'n8n-nodes-base.hubspotTrigger': ['eventsUi'],
      'n8n-nodes-base.hubspot': ['resource', 'operation'],
      'n8n-nodes-base.httpRequest': ['method', 'url'],
      'n8n-nodes-base.webhook': ['path']
    };
  }

  /**
   * Reset validation state
   */
  reset() {
    this.errors = [];
    this.warnings = [];
    this.suggestions = [];
  }

  /**
   * Main validation entry point
   * @param {Object|string} workflow - Workflow JSON object or file path
   * @returns {Object} Validation result
   */
  validate(workflow) {
    this.reset();

    // Parse if string (file path or JSON string)
    let workflowObj;
    if (typeof workflow === 'string') {
      try {
        if (fs.existsSync(workflow)) {
          const content = fs.readFileSync(workflow, 'utf8');
          workflowObj = JSON.parse(content);
        } else {
          workflowObj = JSON.parse(workflow);
        }
      } catch (error) {
        this.errors.push({
          code: 'PARSE_ERROR',
          message: `Failed to parse workflow: ${error.message}`
        });
        return this.getResult();
      }
    } else {
      workflowObj = workflow;
    }

    // Run all validations
    this.validateStructure(workflowObj);
    this.validateNodes(workflowObj);
    this.validateConnections(workflowObj);
    this.validateCredentials(workflowObj);
    this.validateComplexity(workflowObj);
    this.checkBestPractices(workflowObj);

    return this.getResult();
  }

  /**
   * Validate basic workflow structure
   */
  validateStructure(workflow) {
    // Required top-level fields
    if (!workflow.name || typeof workflow.name !== 'string') {
      this.errors.push({
        code: 'MISSING_NAME',
        message: 'Workflow must have a name property'
      });
    }

    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
      this.errors.push({
        code: 'MISSING_NODES',
        message: 'Workflow must have a nodes array'
      });
      return; // Can't continue without nodes
    }

    if (workflow.nodes.length === 0) {
      this.errors.push({
        code: 'EMPTY_WORKFLOW',
        message: 'Workflow must contain at least one node'
      });
    }

    if (!workflow.connections || typeof workflow.connections !== 'object') {
      this.errors.push({
        code: 'MISSING_CONNECTIONS',
        message: 'Workflow must have a connections object'
      });
    }

    // Check for settings
    if (!workflow.settings) {
      this.warnings.push({
        code: 'MISSING_SETTINGS',
        message: 'Workflow has no settings object (defaults will be used)'
      });
    }
  }

  /**
   * Validate individual nodes
   */
  validateNodes(workflow) {
    if (!workflow.nodes) return;

    const nodeIds = new Set();
    const nodeNames = new Set();
    let hasTrigger = false;

    workflow.nodes.forEach((node, index) => {
      // Required node fields
      if (!node.id) {
        this.errors.push({
          code: 'MISSING_NODE_ID',
          message: `Node at index ${index} is missing an id`
        });
      } else {
        // Check for duplicate IDs
        if (nodeIds.has(node.id)) {
          this.errors.push({
            code: 'DUPLICATE_NODE_ID',
            message: `Duplicate node id: ${node.id}`
          });
        }
        nodeIds.add(node.id);
      }

      if (!node.name) {
        this.errors.push({
          code: 'MISSING_NODE_NAME',
          message: `Node ${node.id || index} is missing a name`
        });
      } else {
        if (nodeNames.has(node.name)) {
          this.warnings.push({
            code: 'DUPLICATE_NODE_NAME',
            message: `Duplicate node name: ${node.name} (consider unique names for clarity)`
          });
        }
        nodeNames.add(node.name);
      }

      if (!node.type) {
        this.errors.push({
          code: 'MISSING_NODE_TYPE',
          message: `Node ${node.id || node.name || index} is missing a type`
        });
      } else {
        // Check if type is known
        if (!this.knownNodeTypes.has(node.type) && !node.type.includes('@')) {
          this.warnings.push({
            code: 'UNKNOWN_NODE_TYPE',
            message: `Unknown node type: ${node.type} (may be a custom node)`
          });
        }

        // Check if it's a trigger
        if (node.type.toLowerCase().includes('trigger')) {
          hasTrigger = true;
        }

        // Validate required parameters for known types
        this.validateNodeParameters(node);
      }

      if (!node.position || !Array.isArray(node.position) || node.position.length !== 2) {
        this.warnings.push({
          code: 'INVALID_POSITION',
          message: `Node ${node.id || node.name || index} has invalid position (should be [x, y])`
        });
      }
    });

    // Workflow should have at least one trigger
    if (!hasTrigger && workflow.nodes.length > 0) {
      this.warnings.push({
        code: 'NO_TRIGGER',
        message: 'Workflow has no trigger node (manual execution only)'
      });
    }
  }

  /**
   * Validate node-specific parameters
   */
  validateNodeParameters(node) {
    const requiredFields = this.requiredNodeFields[node.type];
    if (!requiredFields) return;

    const params = node.parameters || {};

    requiredFields.forEach(field => {
      if (params[field] === undefined || params[field] === null || params[field] === '') {
        this.errors.push({
          code: 'MISSING_PARAMETER',
          message: `Node "${node.name}" (${node.type}) is missing required parameter: ${field}`
        });
      }
    });
  }

  /**
   * Validate connection integrity
   */
  validateConnections(workflow) {
    if (!workflow.connections || !workflow.nodes) return;

    const nodeIds = new Set(workflow.nodes.map(n => n.id));
    const connectedNodes = new Set();

    // Track source and target nodes
    Object.entries(workflow.connections).forEach(([sourceId, outputs]) => {
      // Check source exists
      if (!nodeIds.has(sourceId)) {
        this.errors.push({
          code: 'INVALID_CONNECTION_SOURCE',
          message: `Connection from non-existent node: ${sourceId}`
        });
        return;
      }

      connectedNodes.add(sourceId);

      // Check each output
      if (outputs.main && Array.isArray(outputs.main)) {
        outputs.main.forEach((outputConnections, outputIndex) => {
          if (Array.isArray(outputConnections)) {
            outputConnections.forEach(conn => {
              if (!conn.node) {
                this.errors.push({
                  code: 'INVALID_CONNECTION_TARGET',
                  message: `Connection from ${sourceId} has no target node`
                });
                return;
              }

              if (!nodeIds.has(conn.node)) {
                this.errors.push({
                  code: 'INVALID_CONNECTION_TARGET',
                  message: `Connection from ${sourceId} to non-existent node: ${conn.node}`
                });
              } else {
                connectedNodes.add(conn.node);
              }
            });
          }
        });
      }
    });

    // Check for orphaned nodes (except triggers which don't need incoming)
    workflow.nodes.forEach(node => {
      if (!connectedNodes.has(node.id)) {
        const isTrigger = node.type && node.type.toLowerCase().includes('trigger');
        if (!isTrigger) {
          this.warnings.push({
            code: 'ORPHANED_NODE',
            message: `Node "${node.name}" (${node.id}) is not connected to the workflow`
          });
        }
      }
    });
  }

  /**
   * Validate credential references
   */
  validateCredentials(workflow) {
    if (!workflow.nodes) return;

    workflow.nodes.forEach(node => {
      if (!node.credentials) return;

      Object.entries(node.credentials).forEach(([credType, credValue]) => {
        // Check for embedded secrets (CRITICAL SECURITY)
        if (typeof credValue === 'object') {
          const sensitiveFields = ['clientId', 'clientSecret', 'apiKey', 'token', 'password', 'secret'];

          sensitiveFields.forEach(field => {
            if (credValue[field] && typeof credValue[field] === 'string' && credValue[field].length > 0) {
              // Check if it looks like a real secret (not a placeholder)
              if (!credValue[field].startsWith('{{') && !credValue[field].startsWith('$')) {
                this.errors.push({
                  code: 'EMBEDDED_SECRET',
                  message: `SECURITY: Node "${node.name}" has embedded credential secret (${field}). Use credential reference by name instead.`,
                  severity: 'critical'
                });
              }
            }
          });

          // Valid pattern: reference by name
          if (!credValue.name && !credValue.id) {
            this.warnings.push({
              code: 'CREDENTIAL_MISSING_REF',
              message: `Node "${node.name}" credential ${credType} should have a name or id reference`
            });
          }
        }
      });
    });
  }

  /**
   * Validate workflow complexity
   */
  validateComplexity(workflow) {
    if (!workflow.nodes) return;

    // Check node count
    if (workflow.nodes.length > this.options.maxNodes) {
      this.warnings.push({
        code: 'TOO_MANY_NODES',
        message: `Workflow has ${workflow.nodes.length} nodes (recommended max: ${this.options.maxNodes}). Consider splitting into sub-workflows.`
      });
    }

    // Count parallel paths
    if (workflow.connections) {
      let maxParallel = 0;
      Object.values(workflow.connections).forEach(outputs => {
        if (outputs.main && outputs.main[0]) {
          const parallelCount = outputs.main[0].length;
          if (parallelCount > maxParallel) {
            maxParallel = parallelCount;
          }
        }
      });

      if (maxParallel > this.options.maxParallelPaths) {
        this.warnings.push({
          code: 'EXCESSIVE_PARALLELISM',
          message: `Workflow has ${maxParallel} parallel paths from a single node (recommended max: ${this.options.maxParallelPaths})`
        });
      }
    }

    // Check for deep nesting (simplified check)
    // A more thorough check would do graph traversal
    const mergeNodes = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.merge');
    const ifNodes = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.if' || n.type === 'n8n-nodes-base.switch');

    if (ifNodes.length > this.options.maxNestingDepth * 2) {
      this.suggestions.push({
        code: 'DEEP_NESTING',
        message: `Workflow has ${ifNodes.length} conditional nodes. Consider restructuring for maintainability.`
      });
    }
  }

  /**
   * Check for best practices
   */
  checkBestPractices(workflow) {
    if (!workflow.nodes) return;

    // Check for error handling
    const hasErrorHandler = workflow.nodes.some(n =>
      n.type === 'n8n-nodes-base.errorTrigger' ||
      n.type === 'n8n-nodes-base.stopAndError'
    );

    if (!hasErrorHandler && workflow.nodes.length > 3) {
      this.suggestions.push({
        code: 'NO_ERROR_HANDLING',
        message: 'Consider adding error handling for production workflows (Error Trigger node)'
      });
    }

    // Check for tags
    if (!workflow.tags || workflow.tags.length === 0) {
      this.suggestions.push({
        code: 'NO_TAGS',
        message: 'Consider adding tags for better organization and searchability'
      });
    }

    // Check for descriptive names
    workflow.nodes.forEach(node => {
      if (node.name && (
        node.name.toLowerCase().startsWith('node') ||
        node.name.match(/^(if|switch|set|code)\d*$/i)
      )) {
        this.suggestions.push({
          code: 'GENERIC_NAME',
          message: `Node "${node.name}" has a generic name. Consider a more descriptive name.`
        });
      }
    });

    // Check for hardcoded IDs in expressions
    workflow.nodes.forEach(node => {
      const paramsStr = JSON.stringify(node.parameters || {});

      // Check for hardcoded Salesforce IDs (001, 003, 006, 00Q patterns)
      const sfIdPattern = /0[0-9A-Za-z]{14,17}/g;
      const matches = paramsStr.match(sfIdPattern);
      if (matches && matches.length > 0) {
        this.warnings.push({
          code: 'HARDCODED_ID',
          message: `Node "${node.name}" may contain hardcoded Salesforce IDs. Use dynamic references instead.`
        });
      }
    });
  }

  /**
   * Get validation result
   */
  getResult() {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      suggestions: this.suggestions,
      summary: {
        errorCount: this.errors.length,
        warningCount: this.warnings.length,
        suggestionCount: this.suggestions.length,
        hasCritical: this.errors.some(e => e.severity === 'critical')
      }
    };
  }

  /**
   * Format result for display
   */
  formatResult(result) {
    let output = '';

    if (result.valid) {
      output += '✅ Workflow validation PASSED\n';
    } else {
      output += '❌ Workflow validation FAILED\n';
    }

    output += `\nSummary: ${result.summary.errorCount} errors, ${result.summary.warningCount} warnings, ${result.summary.suggestionCount} suggestions\n`;

    if (result.errors.length > 0) {
      output += '\n🔴 ERRORS:\n';
      result.errors.forEach(e => {
        output += `  - [${e.code}] ${e.message}${e.severity === 'critical' ? ' ⚠️ CRITICAL' : ''}\n`;
      });
    }

    if (result.warnings.length > 0) {
      output += '\n🟡 WARNINGS:\n';
      result.warnings.forEach(w => {
        output += `  - [${w.code}] ${w.message}\n`;
      });
    }

    if (result.suggestions.length > 0) {
      output += '\n💡 SUGGESTIONS:\n';
      result.suggestions.forEach(s => {
        output += `  - [${s.code}] ${s.message}\n`;
      });
    }

    return output;
  }

  /**
   * Validate multiple workflows
   */
  validateBatch(workflows) {
    const results = [];

    workflows.forEach((workflow, index) => {
      const name = workflow.name || `Workflow ${index + 1}`;
      const result = this.validate(workflow);
      results.push({
        name,
        ...result
      });
    });

    return {
      totalValid: results.filter(r => r.valid).length,
      totalInvalid: results.filter(r => !r.valid).length,
      results
    };
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const validator = new N8nWorkflowValidator();

  switch (command) {
    case 'validate': {
      const filePath = args[1];
      if (!filePath) {
        console.error('Usage: n8n-workflow-validator.js validate <file.json>');
        process.exit(1);
      }

      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
      }

      const result = validator.validate(filePath);
      console.log(validator.formatResult(result));
      process.exit(result.valid ? 0 : 1);
      break;
    }

    case 'analyze': {
      const filePath = args[1];
      if (!filePath) {
        console.error('Usage: n8n-workflow-validator.js analyze <file.json>');
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const workflow = JSON.parse(content);

      console.log('\n📊 WORKFLOW ANALYSIS\n');
      console.log(`Name: ${workflow.name}`);
      console.log(`Nodes: ${workflow.nodes?.length || 0}`);
      console.log(`Tags: ${workflow.tags?.join(', ') || 'None'}`);

      // Node type breakdown
      const typeCount = {};
      (workflow.nodes || []).forEach(node => {
        const shortType = node.type?.split('.').pop() || 'unknown';
        typeCount[shortType] = (typeCount[shortType] || 0) + 1;
      });

      console.log('\nNode Types:');
      Object.entries(typeCount).forEach(([type, count]) => {
        console.log(`  - ${type}: ${count}`);
      });

      // Validation
      const result = validator.validate(workflow);
      console.log('\n' + validator.formatResult(result));

      break;
    }

    case 'check-connections': {
      const filePath = args[1];
      if (!filePath) {
        console.error('Usage: n8n-workflow-validator.js check-connections <file.json>');
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const workflow = JSON.parse(content);

      validator.validateConnections(workflow);

      console.log('\n🔗 CONNECTION CHECK\n');

      const errors = validator.errors.filter(e => e.code.includes('CONNECTION'));
      const warnings = validator.warnings.filter(w => w.code.includes('ORPHAN'));

      if (errors.length === 0 && warnings.length === 0) {
        console.log('✅ All connections are valid');
      } else {
        if (errors.length > 0) {
          console.log('❌ Connection Errors:');
          errors.forEach(e => console.log(`  - ${e.message}`));
        }
        if (warnings.length > 0) {
          console.log('⚠️  Orphaned Nodes:');
          warnings.forEach(w => console.log(`  - ${w.message}`));
        }
      }

      break;
    }

    default:
      console.log(`
n8n Workflow Validator

Commands:
  validate <file.json>       Validate a workflow file
  analyze <file.json>        Full analysis with statistics
  check-connections <file>   Check connection integrity only

Options:
  --strict                   Enable strict validation mode

Examples:
  node n8n-workflow-validator.js validate workflow.json
  node n8n-workflow-validator.js analyze my-workflow.json
`);
  }
}

// Export for programmatic use
module.exports = N8nWorkflowValidator;

// Run CLI if executed directly
if (require.main === module) {
  main().catch(console.error);
}
