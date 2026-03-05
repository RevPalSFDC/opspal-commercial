/**
 * Automation Cascade to Flowchart Converter
 *
 * Converts automation cascade data (from automation-audit-v2) into
 * Mermaid flowchart format for visualization.
 *
 * @module mermaid-converters/automation-cascade-to-flowchart
 * @version 1.0.0
 * @date 2025-10-20
 */

/**
 * Convert automation cascade JSON to flowchart data structure
 *
 * @param {Object} cascadeData - Cascade mapping data from automation audit
 * @param {Array} cascadeData.chains - Automation execution chains
 * @param {Array} conflicts - Optional conflict data to highlight
 * @param {Object} options - Conversion options
 * @param {boolean} options.highlightConflicts - Highlight conflicting automations in red
 * @param {boolean} options.groupByPhase - Group by before/after phases
 * @param {boolean} options.showRiskScores - Include risk scores in labels
 * @returns {Object} Flowchart data structure for diagram-generator
 */
function automationCascadeToFlowchart(cascadeData, conflicts = [], options = {}) {
  const {
    highlightConflicts = true,
    groupByPhase = true,
    showRiskScores = true
  } = options;

  const nodes = [];
  const edges = [];
  const subgraphs = [];

  // Build conflict ID set for quick lookup
  const conflictIds = new Set(
    conflicts.flatMap(c => c.involved.map(inv => inv.id))
  );

  // Extract all unique nodes from chains
  const nodeMap = new Map();

  cascadeData.chains.forEach(chain => {
    chain.nodes.forEach(node => {
      if (!nodeMap.has(node.id)) {
        const isConflict = highlightConflicts && conflictIds.has(node.id);
        const riskColor = showRiskScores ? getRiskColor(node.riskScore) : undefined;

        nodeMap.set(node.id, {
          id: node.id,
          label: formatNodeLabel(node, showRiskScores),
          shape: getNodeShape(node.type),
          style: isConflict ? 'fill:#ff6b6b' : riskColor
        });
      }
    });

    // Extract edges
    chain.edges.forEach(edge => {
      edges.push({
        from: edge.from,
        to: edge.to,
        label: edge.label || edge.type,
        style: edge.type === 'invokes' ? undefined : 'stroke-dasharray: 5 5'
      });
    });
  });

  nodes.push(...nodeMap.values());

  // Group by phase if requested
  if (groupByPhase) {
    const phases = groupNodesByPhase(cascadeData.chains);
    phases.forEach((phaseNodes, phaseName) => {
      subgraphs.push({
        id: `phase_${phaseName.replace(/\s+/g, '_')}`,
        title: phaseName,
        nodes: phaseNodes.map(n => n.id)
      });
    });
  }

  // Add annotations for conflicts
  const annotations = [];
  if (highlightConflicts && conflicts.length > 0) {
    annotations.push({
      text: `⚠️ ${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''} detected`,
      position: 'bottom',
      color: 'red'
    });
  }

  return {
    nodes,
    edges,
    subgraphs,
    annotations,
    direction: 'TB'
  };
}

/**
 * Format node label with optional risk score
 */
function formatNodeLabel(node, showRiskScore) {
  let label = node.name;

  if (node.object) {
    label += `\\n${node.object}`;
  }

  if (showRiskScore && node.riskScore !== undefined) {
    label += `\\nRisk: ${node.riskScore}`;
  }

  return label;
}

/**
 * Get node shape based on automation type
 */
function getNodeShape(type) {
  const shapeMap = {
    'ApexTrigger': 'rectangle',
    'ApexClass': 'parallelogram',
    'Flow': 'diamond',
    'WorkflowRule': 'trapezoid',
    'ValidationRule': 'hexagon'
  };

  return shapeMap[type] || 'rectangle';
}

/**
 * Get color based on risk score
 */
function getRiskColor(riskScore) {
  if (riskScore >= 75) return 'fill:#ff6b6b'; // Critical
  if (riskScore >= 50) return 'fill:#ffa500'; // High
  if (riskScore >= 25) return 'fill:#ffd93d'; // Medium
  return undefined; // Low - default color
}

/**
 * Group nodes by execution phase (before/after triggers)
 */
function groupNodesByPhase(chains) {
  const phases = new Map();

  chains.forEach(chain => {
    chain.nodes.forEach(node => {
      const phase = detectPhase(node);
      if (!phases.has(phase)) {
        phases.set(phase, []);
      }
      if (!phases.get(phase).find(n => n.id === node.id)) {
        phases.get(phase).push(node);
      }
    });
  });

  return phases;
}

/**
 * Detect execution phase from node metadata
 */
function detectPhase(node) {
  if (node.type === 'ApexTrigger') {
    if (node.events && (node.events.includes('beforeInsert') || node.events.includes('beforeUpdate'))) {
      return 'Before Triggers';
    }
    return 'After Triggers';
  }

  if (node.type === 'Flow') {
    if (node.recordTriggerType && node.recordTriggerType.includes('before')) {
      return 'Before Flows';
    }
    return 'After Flows';
  }

  if (node.type === 'ValidationRule') {
    return 'Validation';
  }

  return 'Other Automation';
}

module.exports = {
  automationCascadeToFlowchart
};
