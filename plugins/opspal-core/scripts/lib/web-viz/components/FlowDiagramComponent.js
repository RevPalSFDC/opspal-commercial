/**
 * Flow Diagram Component
 *
 * Renders interactive workflow diagrams using Mermaid.js.
 * Supports flowcharts, sequence diagrams, ERDs, and state diagrams.
 * Integrates with automation audit data for Salesforce/HubSpot visualization.
 *
 * @module web-viz/components/FlowDiagramComponent
 * @version 1.0.0
 *
 * @example
 * const dashboard = viz.dashboard('Automation Audit');
 *
 * // From Mermaid syntax
 * dashboard.addFlowDiagram('process-flow', {
 *   title: 'Lead Routing Flow',
 *   diagramType: 'flowchart'
 * });
 * dashboard.setData('process-flow', `
 *   flowchart TD
 *     A[New Lead] --> B{Score > 80?}
 *     B -->|Yes| C[Assign to Sales]
 *     B -->|No| D[Nurture Campaign]
 * `);
 *
 * // From automation audit data
 * dashboard.addFlowDiagram('automation-deps', {
 *   title: 'Automation Dependencies',
 *   diagramType: 'dependency-graph',
 *   showLegend: true
 * });
 * dashboard.setData('automation-deps', automationGraphData);
 */

const BaseComponent = require('./BaseComponent');

class FlowDiagramComponent extends BaseComponent {
  /**
   * Create a FlowDiagramComponent
   * @param {Object} options - Component options
   */
  constructor(options = {}) {
    super('flowDiagram', options);

    if (this.position.colspan == null) {
      this.position.colspan = 8;
    }

    // Default configuration
    this.config = {
      diagramType: 'flowchart',  // flowchart, sequence, erd, state, dependency-graph
      direction: 'TB',           // TB, BT, LR, RL
      theme: 'default',          // default, dark, forest, neutral
      showLegend: false,
      height: 400,
      interactive: true,
      zoomable: true,
      highlightOnHover: true,
      nodeColors: {
        ApexTrigger: '#4ECDC4',
        ApexClass: '#45B7D1',
        Flow: '#FF6B6B',
        ProcessBuilder: '#FFE66D',
        WorkflowRule: '#96CEB4',
        AssignmentRule: '#DDA0DD',
        ValidationRule: '#F0E68C',
        default: '#5F3B8C'
      },
      edgeColors: {
        invokes: '#2196F3',
        data_dependency: '#FF9800',
        triggers: '#F44336',
        assigns: '#9C27B0',
        default: '#757575'
      },
      ...options.config
    };
  }

  /**
   * Set data for the diagram
   * @param {string|Object} data - Mermaid syntax string or automation graph data
   * @param {Object} metadata - Data source metadata
   */
  setData(data, metadata = {}) {
    // If string, assume Mermaid syntax
    if (typeof data === 'string') {
      this.data = {
        type: 'mermaid',
        syntax: data.trim()
      };
    }
    // If object with nodes/edges, it's dependency graph data
    else if (data && (data.nodes || data.automations)) {
      this.data = this._processAutomationData(data);
    }
    else {
      this.data = data;
    }

    this.dataSource = {
      type: metadata.type || 'provided',
      ...metadata
    };
  }

  /**
   * Process automation audit data into renderable format
   * @private
   */
  _processAutomationData(data) {
    // If raw automation array, convert to graph structure
    if (Array.isArray(data.automations || data)) {
      const automations = data.automations || data;
      return {
        type: 'automation-graph',
        nodes: this._extractNodes(automations),
        edges: this._extractEdges(automations),
        overlaps: data.overlaps || [],
        cycles: data.cycles || [],
        statistics: data.statistics || this._calculateStats(automations)
      };
    }

    // Already structured graph data
    if (data.nodes && data.edges) {
      return {
        type: 'automation-graph',
        ...data
      };
    }

    return data;
  }

  /**
   * Extract nodes from automation data
   * @private
   */
  _extractNodes(automations) {
    return automations.map(auto => ({
      id: auto.id || auto.name.replace(/\s+/g, '_'),
      name: auto.name,
      type: auto.type,
      status: auto.status || 'Active',
      objectTargets: auto.objectTargets || [],
      riskScore: auto.riskScore || 0,
      description: auto.description || ''
    }));
  }

  /**
   * Extract edges from automation data
   * @private
   */
  _extractEdges(automations) {
    const edges = [];

    for (const auto of automations) {
      const fromId = auto.id || auto.name.replace(/\s+/g, '_');

      // Invocation edges
      if (auto.invokes) {
        for (const invoke of auto.invokes) {
          edges.push({
            from: fromId,
            to: invoke.id || invoke.name?.replace(/\s+/g, '_'),
            type: 'invokes',
            label: invoke.name || ''
          });
        }
      }

      // Data dependency edges
      if (auto.writes && auto.reads) {
        // This would need cross-referencing with other automations
        // For now, include if explicitly provided
      }
    }

    return edges;
  }

  /**
   * Calculate statistics from automation data
   * @private
   */
  _calculateStats(automations) {
    const stats = {
      total: automations.length,
      byType: {},
      byStatus: {},
      byObject: {}
    };

    for (const auto of automations) {
      // By type
      stats.byType[auto.type] = (stats.byType[auto.type] || 0) + 1;

      // By status
      const status = auto.status || 'Active';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

      // By object
      for (const target of (auto.objectTargets || [])) {
        const obj = target.objectApiName || target;
        stats.byObject[obj] = (stats.byObject[obj] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * Generate Mermaid syntax from automation graph
   * @returns {string}
   */
  toMermaid() {
    if (!this.data) return '';

    if (this.data.type === 'mermaid') {
      return this.data.syntax;
    }

    if (this.data.type === 'automation-graph') {
      return this._automationGraphToMermaid();
    }

    return '';
  }

  /**
   * Convert automation graph to Mermaid flowchart
   * @private
   */
  _automationGraphToMermaid() {
    const { nodes, edges, cycles } = this.data;
    const direction = this.config.direction;
    const lines = [`flowchart ${direction}`];

    // Track cycle nodes for highlighting
    const cycleNodeIds = new Set();
    if (cycles) {
      for (const cycle of cycles) {
        for (const node of cycle) {
          cycleNodeIds.add(node.id);
        }
      }
    }

    // Add subgraphs by type
    const nodesByType = {};
    for (const node of nodes) {
      if (!nodesByType[node.type]) {
        nodesByType[node.type] = [];
      }
      nodesByType[node.type].push(node);
    }

    for (const [type, typeNodes] of Object.entries(nodesByType)) {
      lines.push(`  subgraph ${type}s`);
      for (const node of typeNodes) {
        const shape = this._getNodeShape(node.type);
        const label = node.name.replace(/"/g, "'");
        const nodeId = node.id;

        // Mark cycle nodes
        if (cycleNodeIds.has(nodeId)) {
          lines.push(`    ${nodeId}${shape[0]}"${label} ⚠️"${shape[1]}`);
        } else {
          lines.push(`    ${nodeId}${shape[0]}"${label}"${shape[1]}`);
        }
      }
      lines.push('  end');
    }

    // Add edges
    lines.push('');
    for (const edge of edges) {
      if (!edge.from || !edge.to) continue;
      const edgeStyle = this._getEdgeStyle(edge.type);
      const label = edge.label ? `|${edge.label}|` : '';
      lines.push(`  ${edge.from} ${edgeStyle}${label} ${edge.to}`);
    }

    // Add styling
    lines.push('');
    for (const [type, color] of Object.entries(this.config.nodeColors)) {
      if (type !== 'default' && nodesByType[type]) {
        const ids = nodesByType[type].map(n => n.id).join(',');
        if (ids) {
          lines.push(`  style ${ids} fill:${color},stroke:#333`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Get Mermaid node shape for automation type
   * @private
   */
  _getNodeShape(type) {
    const shapes = {
      ApexTrigger: ['((', '))'],      // Circle (triggers events)
      ApexClass: ['[/', '/]'],        // Parallelogram (processing)
      Flow: ['{{', '}}'],             // Hexagon (automation)
      ProcessBuilder: ['{{', '}}'],   // Hexagon
      WorkflowRule: ['[', ']'],       // Rectangle
      AssignmentRule: ['[/', '\\]'],  // Parallelogram right
      ValidationRule: ['{', '}'],     // Diamond
      default: ['[', ']']
    };
    return shapes[type] || shapes.default;
  }

  /**
   * Get Mermaid edge style for relationship type
   * @private
   */
  _getEdgeStyle(type) {
    const styles = {
      invokes: '-->',           // Solid arrow
      data_dependency: '-.->',  // Dotted arrow
      triggers: '==>',          // Thick arrow
      assigns: '-->>',          // Arrow with open head
      default: '-->'
    };
    return styles[type] || styles.default;
  }

  /**
   * Generate HTML for the component (required by BaseComponent)
   * @returns {string}
   */
  generateHTML() {
    const mermaidSyntax = this.toMermaid();
    const height = this.config.height || 400;
    const containerId = `diagram-${this.id}`;

    let html = `
      <div class="viz-component flow-diagram-component component-${this.id}" id="component-${this.id}" data-component-id="${this.id}" data-component-type="flowDiagram">
        <div class="component-header">
          <h3 class="component-title">${this.title || 'Flow Diagram'}</h3>
          ${this.description ? `<p class="component-description">${this.description}</p>` : ''}
        </div>
        <div class="component-body">
          <div class="flow-diagram-container" id="${containerId}" style="min-height: ${height}px;">
            <pre class="mermaid" id="mermaid-${this.id}">
${mermaidSyntax}
            </pre>
          </div>
    `;

    // Add legend if requested
    if (this.config.showLegend && this.data?.type === 'automation-graph') {
      html += this._renderLegend();
    }

    // Add statistics if available
    if (this.data?.statistics) {
      html += this._renderStatistics();
    }

    // Add cycle warnings
    if (this.data?.cycles?.length > 0) {
      html += this._renderCycleWarnings();
    }

    html += `
        </div>
        <div class="component-footer">
          <span>Type: ${this.config.diagramType || 'flowchart'}</span>
          <span>${this.dataSource?.recordCount || 0} nodes</span>
        </div>
      </div>
    `;

    return html;
  }

  /**
   * Render HTML for the component (alias for generateHTML)
   * @returns {string}
   */
  render() {
    return this.generateHTML();
  }

  /**
   * Render legend
   * @private
   */
  _renderLegend() {
    const types = Object.keys(this.config.nodeColors).filter(t => t !== 'default');

    let html = '<div class="diagram-legend" style="margin-top: 16px; padding: 12px; background: #f8f9fa; border-radius: 6px;">';
    html += '<strong style="display: block; margin-bottom: 8px;">Automation Types</strong>';
    html += '<div style="display: flex; flex-wrap: wrap; gap: 12px;">';

    for (const type of types) {
      const color = this.config.nodeColors[type];
      html += `
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 12px; height: 12px; background: ${color}; border-radius: 2px;"></span>
          <span style="font-size: 12px;">${type}</span>
        </div>
      `;
    }

    html += '</div>';

    // Edge legend
    html += '<strong style="display: block; margin: 12px 0 8px;">Relationships</strong>';
    html += '<div style="display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px;">';
    html += '<span>→ Invokes</span>';
    html += '<span>⤏ Data Dependency</span>';
    html += '<span>⇒ Triggers</span>';
    html += '<span>↠ Assigns</span>';
    html += '</div></div>';

    return html;
  }

  /**
   * Render statistics
   * @private
   */
  _renderStatistics() {
    const stats = this.data.statistics;

    let html = '<div class="diagram-stats" style="margin-top: 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">';

    // Total
    html += `
      <div style="padding: 12px; background: #e3f2fd; border-radius: 6px; text-align: center;">
        <div style="font-size: 24px; font-weight: bold; color: #1976d2;">${stats.total}</div>
        <div style="font-size: 12px; color: #666;">Total Automations</div>
      </div>
    `;

    // By type breakdown
    for (const [type, count] of Object.entries(stats.byType || {})) {
      const color = this.config.nodeColors[type] || this.config.nodeColors.default;
      html += `
        <div style="padding: 12px; background: ${color}22; border-left: 3px solid ${color}; border-radius: 6px;">
          <div style="font-size: 20px; font-weight: bold;">${count}</div>
          <div style="font-size: 12px; color: #666;">${type}s</div>
        </div>
      `;
    }

    html += '</div>';
    return html;
  }

  /**
   * Render cycle warnings
   * @private
   */
  _renderCycleWarnings() {
    const cycles = this.data.cycles;

    let html = `
      <div class="diagram-warnings" style="margin-top: 12px; padding: 12px; background: #fff3e0; border-left: 4px solid #ff9800; border-radius: 6px;">
        <strong style="color: #e65100;">⚠️ Circular Dependencies Detected (${cycles.length})</strong>
        <ul style="margin: 8px 0 0; padding-left: 20px; font-size: 13px;">
    `;

    for (const cycle of cycles.slice(0, 5)) {
      const path = cycle.map(n => n.name).join(' → ');
      html += `<li>${path} → ...</li>`;
    }

    if (cycles.length > 5) {
      html += `<li>... and ${cycles.length - 5} more</li>`;
    }

    html += '</ul></div>';
    return html;
  }

  /**
   * Serialize component for state management
   * @returns {Object}
   */
  serialize() {
    return {
      ...super.serialize(),
      mermaidSyntax: this.toMermaid()
    };
  }

  /**
   * Get client-side JavaScript for interactivity
   * @returns {string}
   */
  getClientScript() {
    if (!this.config.interactive) return '';

    return `
      // Initialize Mermaid for ${this.id}
      (function() {
        const container = document.getElementById('mermaid-${this.id}');
        if (!container) return;

        // Re-render on window resize if zoomable
        ${this.config.zoomable ? `
        let resizeTimeout;
        window.addEventListener('resize', function() {
          clearTimeout(resizeTimeout);
          resizeTimeout = setTimeout(function() {
            mermaid.init(undefined, container);
          }, 250);
        });
        ` : ''}

        // Add click handlers to nodes if interactive
        ${this.config.highlightOnHover ? `
        container.addEventListener('mouseover', function(e) {
          const node = e.target.closest('.node');
          if (node) {
            node.style.filter = 'brightness(1.1)';
            node.style.cursor = 'pointer';
          }
        });
        container.addEventListener('mouseout', function(e) {
          const node = e.target.closest('.node');
          if (node) {
            node.style.filter = '';
          }
        });
        ` : ''}
      })();
    `;
  }
}

module.exports = FlowDiagramComponent;
