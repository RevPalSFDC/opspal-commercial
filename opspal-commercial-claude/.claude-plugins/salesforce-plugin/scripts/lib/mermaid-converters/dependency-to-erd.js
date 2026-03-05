/**
 * Dependency Graph to ERD Converter
 *
 * Converts dependency graph data (from sfdc-dependency-analyzer) into
 * Mermaid ERD format for visualization.
 *
 * @module mermaid-converters/dependency-to-erd
 * @version 1.0.0
 * @date 2025-10-20
 */

/**
 * Convert dependency graph JSON to ERD data structure
 *
 * @param {Object} dependencyData - Dependency graph data
 * @param {Array} dependencyData.nodes - Object nodes with metadata
 * @param {Array} dependencyData.edges - Relationship edges
 * @param {Object} options - Conversion options
 * @param {boolean} options.includeAutomationCount - Show automation count on objects
 * @param {boolean} options.highlightCircular - Highlight circular dependencies
 * @param {boolean} options.showRiskScores - Include risk scores
 * @returns {Object} ERD data structure for diagram-generator
 */
function dependencyToERD(dependencyData, options = {}) {
  const {
    includeAutomationCount = true,
    highlightCircular = true,
    showRiskScores = true
  } = options;

  const entities = [];
  const relationships = [];

  // Convert nodes to entities
  dependencyData.nodes.forEach(node => {
    const attributes = [];

    // Add automation count if available
    if (includeAutomationCount && node.automationCount !== undefined) {
      attributes.push({
        name: 'Automation Count',
        type: 'number',
        value: node.automationCount
      });
    }

    // Add risk score if available
    if (showRiskScores && node.riskScore !== undefined) {
      attributes.push({
        name: 'Risk Score',
        type: 'number',
        value: node.riskScore
      });
    }

    // Add record count if available
    if (node.recordCount !== undefined) {
      attributes.push({
        name: 'Record Count',
        type: 'number',
        value: node.recordCount
      });
    }

    const entity = {
      name: node.name || node.label || node.id,
      label: node.label || node.name,
      attributes
    };

    // Highlight if part of circular dependency
    if (highlightCircular && node.hasCircularDep) {
      entity.style = 'fill:#ff6b6b';
    } else if (showRiskScores && node.riskScore >= 75) {
      entity.style = 'fill:#ffa500';
    }

    entities.push(entity);
  });

  // Convert edges to relationships (handle nested structure from toJSON())
  dependencyData.edges.forEach(edgeGroup => {
    // The graph toJSON() returns edges as: { from, fromName, edges: [...] }
    const fromId = edgeGroup.from;
    const fromName = edgeGroup.fromName || fromId;

    // Process each edge in the nested edges array
    const edgeArray = edgeGroup.edges || [edgeGroup];
    edgeArray.forEach(edge => {
      const relationship = {
        from: fromName,
        to: edge.toName || edge.to,
        type: getRelationshipType(edge.type || edge.relationshipType),
        label: edge.label || edge.fieldName || ''
      };

      // Highlight circular dependency relationships
      if (highlightCircular && edge.type === 'circular') {
        relationship.style = 'stroke:red,stroke-width:3px';
      }

      relationships.push(relationship);
    });
  });

  // Generate annotations
  const annotations = [];
  const circularCount = dependencyData.nodes.filter(n => n.hasCircularDep).length;

  if (highlightCircular && circularCount > 0) {
    annotations.push({
      text: `⚠️ ${circularCount} object${circularCount > 1 ? 's' : ''} in circular dependencies`,
      color: 'red'
    });
  }

  return {
    entities,
    relationships,
    annotations
  };
}

/**
 * Map Salesforce relationship types to ERD cardinality
 */
function getRelationshipType(sfType) {
  const typeMap = {
    'Lookup': 'many-to-one',
    'MasterDetail': 'one-to-many',
    'invokes': 'one-to-many',
    'reads': 'many-to-one',
    'writes': 'many-to-one',
    'circular': 'many-to-many'
  };

  return typeMap[sfType] || 'one-to-one';
}

/**
 * Convert execution order data to phased flowchart
 *
 * @param {Object} executionOrderData - Execution order analysis
 * @param {Array} executionOrderData.phases - Deployment phases
 * @param {Array} executionOrderData.dependencies - Cross-phase dependencies
 * @returns {Object} Flowchart data structure for diagram-generator
 */
function executionOrderToFlowchart(executionOrderData) {
  const nodes = [];
  const edges = [];
  const subgraphs = [];

  // Create nodes from phases
  executionOrderData.phases.forEach((phase, phaseIndex) => {
    phase.objects.forEach(obj => {
      nodes.push({
        id: obj.name,
        label: `${obj.label}\\n(Phase ${phaseIndex + 1})`,
        shape: obj.hasCircularDep ? 'hexagon' : 'rectangle',
        style: obj.hasCircularDep ? 'fill:#ff6b6b' : undefined
      });
    });

    // Create subgraph for phase
    subgraphs.push({
      id: `phase_${phaseIndex + 1}`,
      title: `Phase ${phaseIndex + 1}: ${phase.description || 'Deployment'}`,
      nodes: phase.objects.map(obj => obj.name)
    });
  });

  // Create edges from dependencies
  executionOrderData.dependencies.forEach(dep => {
    edges.push({
      from: dep.parent,
      to: dep.child,
      label: dep.type === 'Lookup' ? 'Lookup' : 'Master-Detail',
      style: dep.type === 'circular' ? 'stroke:red,stroke-width:3px' : undefined
    });
  });

  return {
    nodes,
    edges,
    subgraphs,
    direction: 'TB'
  };
}

module.exports = {
  dependencyToERD,
  executionOrderToFlowchart
};
