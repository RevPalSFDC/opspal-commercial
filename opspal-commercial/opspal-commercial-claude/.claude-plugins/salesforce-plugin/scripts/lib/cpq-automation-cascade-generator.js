/**
 * CPQ Automation Cascade Generator
 *
 * Generates cascade diagrams showing how automation components trigger each other.
 *
 * Features:
 * - Discovers automation components (flows, triggers, PBs, validation rules, workflows)
 * - Maps trigger relationships and execution order
 * - Detects cascading sequences (A → B → C)
 * - Identifies circular dependencies (potential infinite loops)
 * - Generates layered Mermaid flowchart diagrams
 *   - High-level: Object-level cascades
 *   - Detailed: Component-level cascades with execution order
 *
 * Usage:
 *   const generator = new CPQAutomationCascadeGenerator(orgAlias, options);
 *   const cascades = await generator.generateCascadeDiagrams();
 *
 * @phase Phase 4: Build CPQ Automation Cascade Generator
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class CPQAutomationCascadeGenerator {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.options = {
      detailLevel: options.detailLevel || 'both', // 'high-level', 'detailed', 'both'
      outputDir: options.outputDir || './diagrams',
      saveAsMarkdown: options.saveAsMarkdown !== false,
      saveMermaidOnly: options.saveMermaidOnly || false,
      focusObjects: options.focusObjects || [], // Empty = all CPQ objects
      detectCircularDeps: options.detectCircularDeps !== false,
      maxCascadeDepth: options.maxCascadeDepth || 5,
      verbose: options.verbose || false
    };

    // CPQ objects to focus on
    this.cpqObjects = [
      'SBQQ__Quote__c',
      'SBQQ__QuoteLine__c',
      'SBQQ__Subscription__c',
      'Product2',
      'PricebookEntry',
      'Opportunity',
      'OpportunityLineItem',
      'Account',
      'Contract',
      'Order',
      'OrderItem'
    ];

    this.automationCache = null;
    this.cascadeCache = null;
  }

  /**
   * Main entry point - generates automation cascade diagrams
   * @returns {Object} Generated diagram metadata
   */
  async generateCascadeDiagrams(options = {}) {
    const detailLevel = options.detailLevel || this.options.detailLevel;

    // Discover automation components
    const automation = await this._discoverAutomation();

    // Map cascading relationships
    const cascades = await this._mapCascades(automation);

    // Detect circular dependencies
    const circularDeps = this.options.detectCircularDeps
      ? this._detectCircularDependencies(cascades)
      : [];

    const result = {
      automation,  // Include raw automation discovery data for downstream consumers
      cascades,
      circularDependencies: circularDeps
    };

    if (detailLevel === 'high-level' || detailLevel === 'both') {
      result.highLevel = await this._generateHighLevelCascade(cascades, circularDeps);
    }

    if (detailLevel === 'detailed' || detailLevel === 'both') {
      result.detailed = await this._generateDetailedCascade(cascades, circularDeps);
    }

    return result;
  }

  /**
   * Discover all automation components in the org
   * @returns {Object} Automation inventory by type
   */
  async _discoverAutomation() {
    if (this.automationCache) {
      return this.automationCache;
    }

    if (this.options.verbose) {
      console.log('Discovering automation components...');
    }

    const automation = {
      flows: await this._discoverFlows(),
      triggers: await this._discoverTriggers(),
      processBuilders: await this._discoverProcessBuilders(),
      validationRules: await this._discoverValidationRules(),
      workflowRules: await this._discoverWorkflowRules()
    };

    // Filter to focus objects if specified
    if (this.options.focusObjects.length > 0) {
      const focusSet = new Set(this.options.focusObjects);
      automation.flows = automation.flows.filter(f => focusSet.has(f.object));
      automation.triggers = automation.triggers.filter(t => focusSet.has(t.object));
      automation.processBuilders = automation.processBuilders.filter(p => focusSet.has(p.object));
      automation.validationRules = automation.validationRules.filter(v => focusSet.has(v.object));
      automation.workflowRules = automation.workflowRules.filter(w => focusSet.has(w.object));
    }

    if (this.options.verbose) {
      console.log(`Found ${automation.flows.length} flows`);
      console.log(`Found ${automation.triggers.length} triggers`);
      console.log(`Found ${automation.processBuilders.length} process builders`);
      console.log(`Found ${automation.validationRules.length} validation rules`);
      console.log(`Found ${automation.workflowRules.length} workflow rules`);
    }

    this.automationCache = automation;
    return automation;
  }

  /**
   * Discover flows via Tooling API
   * @returns {Array} Flow metadata
   */
  async _discoverFlows() {
    try {
      const query = `
        SELECT Id, DeveloperName, MasterLabel, ProcessType, TriggerType,
               IsActive, TriggerObjectOrEvent.QualifiedApiName
        FROM FlowDefinitionView
        WHERE IsActive = true
      `;

      const result = this._executeQuery(query, { useToolingApi: true });
      const flows = result.records || [];

      return flows.map(f => ({
        id: f.Id,
        name: f.DeveloperName,
        label: f.MasterLabel,
        type: 'Flow',
        subtype: f.ProcessType,
        triggerType: f.TriggerType,
        object: f.TriggerObjectOrEvent?.QualifiedApiName || null,
        isActive: f.IsActive
      }));

    } catch (error) {
      if (this.options.verbose) {
        console.error('Error discovering flows:', error.message);
      }
      return [];
    }
  }

  /**
   * Discover Apex triggers via Tooling API
   * @returns {Array} Trigger metadata
   */
  async _discoverTriggers() {
    try {
      const query = `
        SELECT Id, Name, TableEnumOrId, Status,
               UsageBeforeInsert, UsageAfterInsert,
               UsageBeforeUpdate, UsageAfterUpdate,
               UsageBeforeDelete, UsageAfterDelete,
               UsageAfterUndelete
        FROM ApexTrigger
        WHERE Status = 'Active'
      `;

      const result = this._executeQuery(query, { useToolingApi: true });
      const triggers = result.records || [];

      return triggers.map(t => ({
        id: t.Id,
        name: t.Name,
        label: t.Name,
        type: 'Trigger',
        object: t.TableEnumOrId,
        events: this._getTriggerEvents(t),
        isActive: t.Status === 'Active'
      }));

    } catch (error) {
      if (this.options.verbose) {
        console.error('Error discovering triggers:', error.message);
      }
      return [];
    }
  }

  /**
   * Get trigger events from trigger metadata
   * @param {Object} trigger - Trigger record
   * @returns {Array} Active trigger events
   */
  _getTriggerEvents(trigger) {
    const events = [];
    if (trigger.UsageBeforeInsert) events.push('before insert');
    if (trigger.UsageAfterInsert) events.push('after insert');
    if (trigger.UsageBeforeUpdate) events.push('before update');
    if (trigger.UsageAfterUpdate) events.push('after update');
    if (trigger.UsageBeforeDelete) events.push('before delete');
    if (trigger.UsageAfterDelete) events.push('after delete');
    if (trigger.UsageAfterUndelete) events.push('after undelete');
    return events;
  }

  /**
   * Discover Process Builders via Tooling API
   * @returns {Array} Process Builder metadata
   */
  async _discoverProcessBuilders() {
    try {
      const query = `
        SELECT Id, DeveloperName, MasterLabel, ProcessType,
               IsActive, TriggerObjectOrEvent.QualifiedApiName
        FROM FlowDefinitionView
        WHERE ProcessType = 'Workflow'
        AND IsActive = true
      `;

      const result = this._executeQuery(query, { useToolingApi: true });
      const pbs = result.records || [];

      return pbs.map(p => ({
        id: p.Id,
        name: p.DeveloperName,
        label: p.MasterLabel,
        type: 'ProcessBuilder',
        object: p.TriggerObjectOrEvent?.QualifiedApiName || null,
        isActive: p.IsActive
      }));

    } catch (error) {
      if (this.options.verbose) {
        console.error('Error discovering process builders:', error.message);
      }
      return [];
    }
  }

  /**
   * Discover Validation Rules via Tooling API
   * @returns {Array} Validation rule metadata
   */
  async _discoverValidationRules() {
    try {
      const query = `
        SELECT Id, ValidationName, EntityDefinition.QualifiedApiName, Active
        FROM ValidationRule
        WHERE Active = true
      `;

      const result = this._executeQuery(query, { useToolingApi: true });
      const rules = result.records || [];

      return rules.map(r => ({
        id: r.Id,
        name: r.ValidationName,
        label: r.ValidationName,
        type: 'ValidationRule',
        object: r.EntityDefinition?.QualifiedApiName || null,
        isActive: r.Active
      }));

    } catch (error) {
      if (this.options.verbose) {
        console.error('Error discovering validation rules:', error.message);
      }
      return [];
    }
  }

  /**
   * Discover Workflow Rules via Tooling API
   * @returns {Array} Workflow rule metadata
   */
  async _discoverWorkflowRules() {
    try {
      const query = `
        SELECT Id, Name, TableEnumOrId
        FROM WorkflowRule
      `;

      const result = this._executeQuery(query, { useToolingApi: true });
      const rules = result.records || [];

      return rules.map(w => ({
        id: w.Id,
        name: w.Name,
        label: w.Name,
        type: 'WorkflowRule',
        object: w.TableEnumOrId,
        isActive: true
      }));

    } catch (error) {
      if (this.options.verbose) {
        console.error('Error discovering workflow rules:', error.message);
      }
      return [];
    }
  }

  /**
   * Map cascading relationships between automation components
   * @param {Object} automation - Automation inventory
   * @returns {Array} Cascade relationships
   */
  async _mapCascades(automation) {
    if (this.cascadeCache) {
      return this.cascadeCache;
    }

    if (this.options.verbose) {
      console.log('Mapping cascade relationships...');
    }

    const cascades = [];

    // Flatten all automation into single array
    const allAutomation = [
      ...automation.flows,
      ...automation.triggers,
      ...automation.processBuilders,
      ...automation.validationRules,
      ...automation.workflowRules
    ];

    // Map cascades by object
    const automationByObject = {};
    for (const component of allAutomation) {
      if (!component.object) continue;

      if (!automationByObject[component.object]) {
        automationByObject[component.object] = [];
      }
      automationByObject[component.object].push(component);
    }

    // Create cascades for each object
    for (const [object, components] of Object.entries(automationByObject)) {
      // Sort by execution order
      const sorted = this._sortByExecutionOrder(components);

      // Create cascade chain
      for (let i = 0; i < sorted.length - 1; i++) {
        cascades.push({
          from: sorted[i],
          to: sorted[i + 1],
          object,
          executionOrder: i + 1
        });
      }
    }

    this.cascadeCache = cascades;
    return cascades;
  }

  /**
   * Sort automation components by execution order
   * @param {Array} components - Automation components
   * @returns {Array} Sorted components
   */
  _sortByExecutionOrder(components) {
    const order = {
      'ValidationRule': 1,      // Before trigger
      'Trigger': 2,             // Before/After trigger
      'Flow': 3,                // Record-triggered flow
      'ProcessBuilder': 4,      // After flow
      'WorkflowRule': 5         // After process builder
    };

    return components.sort((a, b) => {
      const orderA = order[a.type] || 999;
      const orderB = order[b.type] || 999;
      return orderA - orderB;
    });
  }

  /**
   * Detect circular dependencies in cascades
   * @param {Array} cascades - Cascade relationships
   * @returns {Array} Circular dependency chains
   */
  _detectCircularDependencies(cascades) {
    if (this.options.verbose) {
      console.log('Detecting circular dependencies...');
    }

    const circular = [];
    const visited = new Set();
    const recursionStack = new Set();

    // Build adjacency list
    const graph = {};
    for (const cascade of cascades) {
      const fromKey = `${cascade.from.type}:${cascade.from.name}`;
      const toKey = `${cascade.to.type}:${cascade.to.name}`;

      if (!graph[fromKey]) {
        graph[fromKey] = [];
      }
      graph[fromKey].push({ key: toKey, cascade });
    }

    // DFS to detect cycles
    const detectCycle = (node, path = []) => {
      if (recursionStack.has(node)) {
        // Found cycle
        const cycleStart = path.findIndex(n => n === node);
        const cycle = path.slice(cycleStart);
        circular.push({
          chain: cycle,
          severity: 'high',
          description: `Circular dependency detected: ${cycle.join(' → ')}`
        });
        return true;
      }

      if (visited.has(node)) {
        return false;
      }

      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = graph[node] || [];
      for (const neighbor of neighbors) {
        detectCycle(neighbor.key, [...path]);
      }

      recursionStack.delete(node);
      return false;
    };

    // Check each node
    for (const node of Object.keys(graph)) {
      if (!visited.has(node)) {
        detectCycle(node);
      }
    }

    if (this.options.verbose) {
      console.log(`Found ${circular.length} circular dependencies`);
    }

    return circular;
  }

  /**
   * Calculate risk score for automation components
   * @param {String} object - Object name
   * @param {Object} types - Component counts by type
   * @param {Array} circularDeps - Circular dependencies
   * @returns {Object} Risk assessment {level: 'HIGH'|'MEDIUM'|'LOW', score: Number, color: String}
   */
  _calculateAutomationRisk(object, types, circularDeps) {
    let score = 0;

    // Component count scoring
    const triggerCount = types['Trigger'] || 0;
    const validationCount = types['ValidationRule'] || 0;
    const workflowCount = types['WorkflowRule'] || 0;

    // High trigger count is risky
    if (triggerCount > 15) score += 30;
    else if (triggerCount > 10) score += 20;
    else if (triggerCount > 5) score += 10;

    // Validation rules (moderate risk)
    if (validationCount > 20) score += 15;
    else if (validationCount > 10) score += 10;

    // Workflow rules (moderate risk)
    if (workflowCount > 20) score += 15;
    else if (workflowCount > 10) score += 10;

    // Circular dependency involvement (high risk)
    const involvedInCircular = circularDeps.some(dep =>
      dep.chain.some(item => item.includes(object))
    );
    if (involvedInCircular) score += 40;

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

    return { level, score, color, emoji };
  }

  /**
   * Generate high-level cascade diagram (object-level view)
   * @param {Array} cascades - Cascade relationships
   * @param {Array} circularDeps - Circular dependencies
   * @returns {Object} Diagram metadata
   */
  async _generateHighLevelCascade(cascades, circularDeps) {
    if (this.options.verbose) {
      console.log('Generating high-level cascade diagram...');
    }

    let mermaidCode = 'flowchart TB\n';

    // Group cascades by object
    const cascadesByObject = {};
    for (const cascade of cascades) {
      if (!cascadesByObject[cascade.object]) {
        cascadesByObject[cascade.object] = [];
      }
      cascadesByObject[cascade.object].push(cascade);
    }

    // Calculate risk for each object and store styling
    const objectRisks = {};
    const styleDirectives = [];

    // Generate diagram for each object
    for (const [object, objCascades] of Object.entries(cascadesByObject)) {
      const sanitizedObject = this._sanitizeId(object);

      // Count automation types
      const types = {};
      for (const cascade of objCascades) {
        types[cascade.from.type] = (types[cascade.from.type] || 0) + 1;
        types[cascade.to.type] = (types[cascade.to.type] || 0) + 1;
      }

      // Calculate risk
      const risk = this._calculateAutomationRisk(object, types, circularDeps);
      objectRisks[object] = risk;

      // Add subgraph with risk indicator
      const riskLabel = risk.level === 'HIGH' ? ` ${risk.emoji} HIGH COMPLEXITY` :
                        risk.level === 'MEDIUM' ? ` ${risk.emoji} MEDIUM COMPLEXITY` : '';
      mermaidCode += `  subgraph ${sanitizedObject}["${this._sanitizeMermaidText(object)}${riskLabel}"]\n`;

      // Create summary nodes
      for (const [type, count] of Object.entries(types)) {
        const nodeId = `${sanitizedObject}_${this._sanitizeId(type)}`;
        const emoji = type === 'Trigger' && count > 15 ? ' 🔴' :
                      type === 'Trigger' && count > 10 ? ' 🟡' : '';
        const label = `${type} (${count})${emoji}`;
        mermaidCode += `    ${nodeId}["${label}"]\n`;

        // Store style directive
        if (type === 'Trigger' && count > 10) {
          styleDirectives.push(`  style ${nodeId} fill:${risk.color}`);
        } else if (risk.level !== 'LOW') {
          styleDirectives.push(`  style ${nodeId} fill:${risk.color}`);
        }
      }

      mermaidCode += `  end\n`;

      // Add cascade flow
      const typeOrder = ['ValidationRule', 'Trigger', 'Flow', 'ProcessBuilder', 'WorkflowRule'];
      const typesInObject = Object.keys(types).sort((a, b) =>
        typeOrder.indexOf(a) - typeOrder.indexOf(b)
      );

      for (let i = 0; i < typesInObject.length - 1; i++) {
        const fromId = `${sanitizedObject}_${this._sanitizeId(typesInObject[i])}`;
        const toId = `${sanitizedObject}_${this._sanitizeId(typesInObject[i + 1])}`;
        mermaidCode += `  ${fromId} --> ${toId}\n`;
      }
    }

    // Add style directives
    if (styleDirectives.length > 0) {
      mermaidCode += '\n';
      mermaidCode += styleDirectives.join('\n') + '\n';
    }

    // Add legend
    mermaidCode += '\n  %% Legend:\n';
    mermaidCode += '  %% 🔴 RED = HIGH RISK (>15 triggers or circular dependencies)\n';
    mermaidCode += '  %% 🟡 YELLOW = MEDIUM RISK (>10 triggers or high component count)\n';
    mermaidCode += '  %% 🟢 GREEN = LOW RISK (normal automation levels)\n';

    // Highlight circular dependencies
    if (circularDeps.length > 0) {
      mermaidCode += '\n  %% Circular Dependencies Detected\n';
      for (const dep of circularDeps) {
        mermaidCode += `  %% ${dep.description}\n`;
      }
    }

    return await this._saveDiagram(
      mermaidCode,
      'cpq-automation-cascade-overview',
      'CPQ Automation Cascade - High Level'
    );
  }

  /**
   * Generate detailed cascade diagram (component-level view)
   * @param {Array} cascades - Cascade relationships
   * @param {Array} circularDeps - Circular dependencies
   * @returns {Object} Diagram metadata
   */
  async _generateDetailedCascade(cascades, circularDeps) {
    if (this.options.verbose) {
      console.log('Generating detailed cascade diagram...');
    }

    let mermaidCode = 'flowchart TB\n';

    // Group cascades by object
    const cascadesByObject = {};
    for (const cascade of cascades) {
      if (!cascadesByObject[cascade.object]) {
        cascadesByObject[cascade.object] = [];
      }
      cascadesByObject[cascade.object].push(cascade);
    }

    // Generate diagram for each object
    for (const [object, objCascades] of Object.entries(cascadesByObject)) {
      const sanitizedObject = this._sanitizeId(object);
      mermaidCode += `  subgraph ${sanitizedObject}["${this._sanitizeMermaidText(object)}"]\n`;

      // Create nodes for each component
      const components = new Map();
      for (const cascade of objCascades) {
        components.set(cascade.from.id, cascade.from);
        components.set(cascade.to.id, cascade.to);
      }

      for (const component of components.values()) {
        const nodeId = this._sanitizeId(`${component.type}_${component.name}`);
        const label = `${component.type}: ${this._sanitizeMermaidText(component.label)}`;
        mermaidCode += `    ${nodeId}["${label}"]\n`;
      }

      mermaidCode += `  end\n`;

      // Add cascade arrows with execution order
      for (const cascade of objCascades) {
        const fromId = this._sanitizeId(`${cascade.from.type}_${cascade.from.name}`);
        const toId = this._sanitizeId(`${cascade.to.type}_${cascade.to.name}`);
        mermaidCode += `  ${fromId} -->|"Order: ${cascade.executionOrder}"| ${toId}\n`;
      }
    }

    // Highlight circular dependencies
    if (circularDeps.length > 0) {
      mermaidCode += '\n  %% Circular Dependencies Detected\n';
      for (const dep of circularDeps) {
        mermaidCode += `  %% ${dep.description}\n`;
      }
    }

    return await this._saveDiagram(
      mermaidCode,
      'cpq-automation-cascade-detailed',
      'CPQ Automation Cascade - Detailed'
    );
  }

  /**
   * Save diagram to file(s)
   * @param {String} mermaidCode - Mermaid diagram code
   * @param {String} filename - Base filename (without extension)
   * @param {String} title - Diagram title
   * @returns {Object} Diagram metadata
   */
  async _saveDiagram(mermaidCode, filename, title) {
    // Ensure output directory exists
    if (!fs.existsSync(this.options.outputDir)) {
      fs.mkdirSync(this.options.outputDir, { recursive: true });
    }

    const result = {
      filename,
      title,
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

module.exports = CPQAutomationCascadeGenerator;
