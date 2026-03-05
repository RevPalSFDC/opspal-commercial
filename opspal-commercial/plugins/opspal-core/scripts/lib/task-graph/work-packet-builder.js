/**
 * WorkPacketBuilder - Creates minimal context packets for task execution
 *
 * Provides:
 * - Context minimization to prevent token overflow
 * - Input artifact resolution
 * - Dependency output forwarding
 * - Agent-specific prompt generation
 * - Token budget management
 */

const fs = require('fs');
const path = require('path');

class WorkPacketBuilder {
  constructor(options = {}) {
    this.options = {
      maxTokenBudget: options.maxTokenBudget || 8000,
      includeGraphContext: options.includeGraphContext ?? true,
      includePlaybookRef: options.includePlaybookRef ?? true,
      verboseMode: options.verboseMode || false,
      ...options
    };

    // Rough token estimation (4 chars per token)
    this.charsPerToken = 4;

    // Agent specialization registry
    this.agentRegistry = {
      'salesforce-apex': 'opspal-salesforce:sfdc-apex-developer',
      'salesforce-flow': 'opspal-salesforce:flow-segmentation-specialist',
      'salesforce-metadata': 'opspal-salesforce:sfdc-metadata-manager',
      'salesforce-data': 'opspal-salesforce:sfdc-data-operations',
      'salesforce-permission': 'opspal-salesforce:sfdc-permission-orchestrator',
      'salesforce-report': 'opspal-salesforce:sfdc-reports-dashboards',
      'hubspot-workflow': 'hubspot-workflow-builder',
      'hubspot-data': 'hubspot-data-manager',
      'hubspot-property': 'hubspot-property-manager',
      'data-transform': 'data-transform-engineer',
      'data-migration': 'opspal-salesforce:sfdc-data-operations',
      'data-validation': 'data-validation-agent',
      'integration': 'opspal-salesforce:sfdc-integration-specialist',
      'cross-platform': 'unified-orchestrator',
      'documentation': 'documentation-agent',
      'review': 'opspal-salesforce:code-reviewer'
    };
  }

  /**
   * Build a work packet for a task
   * @param {Object} taskSpec - TaskSpec to build packet for
   * @param {Object} context - Additional context
   * @param {Object} context.graph - TaskGraph instance
   * @param {Object} context.resultStore - ResultStore with completed task outputs
   * @param {Object} context.globalContext - Global execution context
   * @returns {Object} Work packet ready for agent execution
   */
  buildPacket(taskSpec, context = {}) {
    const { graph, resultStore, globalContext } = context;

    // Start building packet
    const packet = {
      taskSpec: this.sanitizeTaskSpec(taskSpec),
      agent: this.resolveAgent(taskSpec),
      prompt: '',
      inputs: {},
      constraints: this.buildConstraints(taskSpec),
      metadata: {
        built_at: new Date().toISOString(),
        token_budget: this.options.maxTokenBudget
      }
    };

    // Resolve input artifacts from dependency outputs
    if (resultStore) {
      packet.inputs = this.resolveInputs(taskSpec, resultStore);
    }

    // Build the prompt
    packet.prompt = this.buildPrompt(taskSpec, packet.inputs, context);

    // Estimate tokens and trim if needed
    const estimatedTokens = this.estimateTokens(packet.prompt);
    packet.metadata.estimated_tokens = estimatedTokens;

    if (estimatedTokens > this.options.maxTokenBudget) {
      packet.prompt = this.trimPrompt(packet.prompt, this.options.maxTokenBudget);
      packet.metadata.trimmed = true;
    }

    return packet;
  }

  /**
   * Sanitize TaskSpec for transmission (remove internal fields)
   * @private
   */
  sanitizeTaskSpec(taskSpec) {
    const { status, ...sanitized } = taskSpec;
    return sanitized;
  }

  /**
   * Resolve the appropriate agent for a task
   * @param {Object} taskSpec - TaskSpec
   * @returns {string} Agent identifier
   */
  resolveAgent(taskSpec) {
    if (taskSpec.assigned_agent) {
      return taskSpec.assigned_agent;
    }
    return this.agentRegistry[taskSpec.domain] || 'general-purpose';
  }

  /**
   * Resolve input artifacts from completed dependency outputs
   * @private
   */
  resolveInputs(taskSpec, resultStore) {
    const inputs = {};

    for (const inputRef of taskSpec.inputs || []) {
      // Check if input references a task output (format: T-XX:output_name)
      const taskOutputMatch = inputRef.match(/^(T-\d{2,4}):(.+)$/);

      if (taskOutputMatch) {
        const [, depTaskId, outputName] = taskOutputMatch;
        const depResult = resultStore.getResult(depTaskId);

        if (depResult) {
          // Find the artifact in the result
          const artifact = depResult.artifacts?.find(a =>
            a.name === outputName || a.path.includes(outputName)
          );

          if (artifact) {
            inputs[inputRef] = {
              type: 'task_output',
              source_task: depTaskId,
              artifact: artifact,
              content: this.loadArtifact(artifact)
            };
          } else {
            // Include summary if specific artifact not found
            inputs[inputRef] = {
              type: 'task_summary',
              source_task: depTaskId,
              summary: depResult.summary,
              files_changed: depResult.files_changed
            };
          }
        }
      } else {
        // Treat as file path or external reference
        inputs[inputRef] = {
          type: 'reference',
          path: inputRef,
          content: this.loadFileIfExists(inputRef)
        };
      }
    }

    return inputs;
  }

  /**
   * Load artifact content if available
   * @private
   */
  loadArtifact(artifact) {
    if (artifact.path && fs.existsSync(artifact.path)) {
      try {
        return fs.readFileSync(artifact.path, 'utf8').slice(0, 5000);
      } catch (e) {
        return `[Unable to load: ${e.message}]`;
      }
    }
    return artifact.content || '[Content not available]';
  }

  /**
   * Load file content if it exists
   * @private
   */
  loadFileIfExists(filePath) {
    if (fs.existsSync(filePath)) {
      try {
        return fs.readFileSync(filePath, 'utf8').slice(0, 3000);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /**
   * Build constraints object from task spec
   * @private
   */
  buildConstraints(taskSpec) {
    return {
      tool_policy: taskSpec.tool_policy || {},
      stop_points: taskSpec.stop_points || [],
      concurrency_group: taskSpec.concurrency_group,
      risk_level: taskSpec.risk_level,
      acceptance_criteria: taskSpec.acceptance_criteria
    };
  }

  /**
   * Build the execution prompt
   * @private
   */
  buildPrompt(taskSpec, inputs, context) {
    const sections = [];

    // Header
    sections.push(`# Task Execution: ${taskSpec.id}`);
    sections.push('');

    // Task specification
    sections.push('## Task Specification');
    sections.push('```yaml');
    sections.push(`id: ${taskSpec.id}`);
    sections.push(`title: ${taskSpec.title}`);
    sections.push(`domain: ${taskSpec.domain}`);
    sections.push(`goal: ${taskSpec.goal}`);
    sections.push(`risk_level: ${taskSpec.risk_level}`);
    sections.push('```');
    sections.push('');

    // Acceptance criteria
    sections.push('## Acceptance Criteria');
    for (const criterion of taskSpec.acceptance_criteria || []) {
      sections.push(`- [ ] ${criterion}`);
    }
    sections.push('');

    // Expected outputs
    sections.push('## Expected Outputs');
    for (const output of taskSpec.outputs || []) {
      sections.push(`- ${output}`);
    }
    sections.push('');

    // Resolved inputs (if any)
    if (Object.keys(inputs).length > 0) {
      sections.push('## Resolved Inputs');
      for (const [inputRef, inputData] of Object.entries(inputs)) {
        sections.push(`### ${inputRef}`);
        if (inputData.type === 'task_output' || inputData.type === 'task_summary') {
          sections.push(`Source: Task ${inputData.source_task}`);
          if (inputData.summary) {
            sections.push(`Summary: ${inputData.summary}`);
          }
          if (inputData.content) {
            sections.push('```');
            sections.push(inputData.content.slice(0, 2000));
            sections.push('```');
          }
        } else if (inputData.content) {
          sections.push('```');
          sections.push(inputData.content.slice(0, 2000));
          sections.push('```');
        }
        sections.push('');
      }
    }

    // Tool policy constraints
    sections.push('## Tool Policy');
    const policy = taskSpec.tool_policy || {};
    sections.push(`- File read: ${policy.file_read || 'allowed'}`);
    sections.push(`- File write: ${policy.file_write || 'allowed_with_approval'}`);
    sections.push(`- Destructive ops: ${policy.destructive_ops || 'forbidden'}`);
    sections.push(`- Production ops: ${policy.production_ops || 'forbidden'}`);
    sections.push('');

    // Stop points
    if (taskSpec.stop_points?.length > 0) {
      sections.push('## Stop Points (Require Approval)');
      for (const stop of taskSpec.stop_points) {
        sections.push(`- ${stop}`);
      }
      sections.push('');
    }

    // Instructions
    sections.push('## Instructions');
    sections.push('1. Execute the task according to the goal and acceptance criteria');
    sections.push('2. Respect all tool policy constraints');
    sections.push('3. Stop and request approval at designated stop points');
    sections.push('4. Return a ResultBundle with status, summary, evidence, and artifacts');
    sections.push('5. Document any risks or open questions discovered during execution');
    sections.push('');

    // Result format
    sections.push('## Expected Result Format');
    sections.push('Return your results in the following structure:');
    sections.push('```yaml');
    sections.push(`task_id: ${taskSpec.id}`);
    sections.push('status: success|partial|failed|blocked');
    sections.push('summary: [What was accomplished]');
    sections.push('files_changed: [List of modified files]');
    sections.push('evidence: [Proof of correctness - test outputs, validations]');
    sections.push('risks: [Any risks identified]');
    sections.push('next_steps: [Recommended follow-up actions]');
    sections.push('```');

    return sections.join('\n');
  }

  /**
   * Estimate token count for a string
   * @param {string} text - Text to estimate
   * @returns {number} Estimated token count
   */
  estimateTokens(text) {
    return Math.ceil(text.length / this.charsPerToken);
  }

  /**
   * Trim prompt to fit within token budget
   * @private
   */
  trimPrompt(prompt, maxTokens) {
    const maxChars = maxTokens * this.charsPerToken;

    if (prompt.length <= maxChars) {
      return prompt;
    }

    // Try to preserve structure - trim from inputs section if present
    const inputsMarker = '## Resolved Inputs';
    const inputsIdx = prompt.indexOf(inputsMarker);

    if (inputsIdx > -1) {
      const beforeInputs = prompt.slice(0, inputsIdx);
      const afterInputsMarker = prompt.indexOf('## Tool Policy');

      if (afterInputsMarker > inputsIdx) {
        const afterInputs = prompt.slice(afterInputsMarker);

        // Calculate how much space we have for inputs
        const availableForInputs = maxChars - beforeInputs.length - afterInputs.length - 100;

        if (availableForInputs > 500) {
          const inputsSection = prompt.slice(inputsIdx, afterInputsMarker);
          const trimmedInputs = inputsSection.slice(0, availableForInputs) +
            '\n\n[... inputs truncated due to token limit ...]\n\n';
          return beforeInputs + trimmedInputs + afterInputs;
        }
      }
    }

    // Fallback: hard trim with notice
    return prompt.slice(0, maxChars - 50) + '\n\n[... content truncated ...]';
  }

  /**
   * Build packets for all ready tasks
   * @param {Array<Object>} tasks - Array of TaskSpec objects
   * @param {Object} context - Execution context
   * @returns {Array<Object>} Array of work packets
   */
  buildPacketsForTasks(tasks, context = {}) {
    return tasks.map(task => this.buildPacket(task, context));
  }

  /**
   * Get prompt template for a specific domain
   * @param {string} domain - Domain name
   * @returns {string} Domain-specific prompt additions
   */
  getDomainTemplate(domain) {
    const templates = {
      'salesforce-apex': `
## Salesforce Apex Guidelines
- Follow trigger handler pattern
- Ensure bulkification for all DML operations
- Write corresponding test classes with 75%+ coverage
- Use Custom Metadata or Custom Settings for configuration`,

      'salesforce-flow': `
## Salesforce Flow Guidelines
- Use fault paths for error handling
- Avoid hardcoded IDs - use Custom Labels or Custom Metadata
- Document decision criteria clearly
- Test with boundary conditions`,

      'salesforce-metadata': `
## Salesforce Metadata Guidelines
- Validate all XML before deployment
- Check field-level security impacts
- Verify profile/permission set updates
- Test in sandbox before production`,

      'hubspot-workflow': `
## HubSpot Workflow Guidelines
- Use appropriate enrollment triggers
- Add re-enrollment criteria if needed
- Test with sample contacts first
- Document suppression list handling`,

      'data-transform': `
## Data Transform Guidelines
- Validate input data quality first
- Implement row count reconciliation
- Check referential integrity
- Document transformation logic`
    };

    return templates[domain] || '';
  }

  /**
   * Register a custom agent for a domain
   * @param {string} domain - Domain name
   * @param {string} agentId - Agent identifier
   */
  registerAgent(domain, agentId) {
    this.agentRegistry[domain] = agentId;
  }
}

module.exports = { WorkPacketBuilder };
