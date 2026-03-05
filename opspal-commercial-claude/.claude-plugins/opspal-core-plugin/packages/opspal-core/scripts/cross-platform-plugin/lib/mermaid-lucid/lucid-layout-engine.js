/**
 * Lucid Layout Engine
 *
 * Automatic layout algorithm for positioning shapes in Lucid diagrams.
 * Supports hierarchical, grid, and radial layouts.
 *
 * @module lucid-layout-engine
 */

/**
 * Layout configuration
 */
const DEFAULT_CONFIG = {
  shapeWidth: 160,
  shapeHeight: 80,
  horizontalSpacing: 100,
  verticalSpacing: 80,
  marginX: 50,
  marginY: 50,
  gridColumns: 3
};

/**
 * Calculate flowchart layout positions
 *
 * Uses hierarchical layout algorithm (layered graph drawing)
 *
 * @param {Array} nodes - Array of nodes from Mermaid parser
 * @param {Array} edges - Array of edges from Mermaid parser
 * @param {string} direction - Flow direction: 'TB', 'LR', 'BT', 'RL'
 * @param {Object} config - Layout configuration
 * @returns {Map} Map of nodeId -> {x, y, w, h}
 */
function layoutFlowchart(nodes, edges, direction = 'TB', config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const positions = new Map();

  // Build adjacency list for graph traversal
  const adjacency = buildAdjacencyList(nodes, edges);

  // Assign layers (ranks) to nodes using longest path algorithm
  const layers = assignLayers(nodes, edges, adjacency);

  // Within each layer, order nodes to minimize edge crossings
  const orderedLayers = minimizeCrossings(layers, edges);

  // Calculate positions based on direction
  const isVertical = direction === 'TB' || direction === 'BT';
  const reverse = direction === 'BT' || direction === 'RL';

  orderedLayers.forEach((layer, layerIndex) => {
    layer.forEach((nodeId, positionInLayer) => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      let x, y;

      if (isVertical) {
        // Vertical flow (TB or BT)
        x = cfg.marginX + positionInLayer * (cfg.shapeWidth + cfg.horizontalSpacing);
        y = cfg.marginY + layerIndex * (cfg.shapeHeight + cfg.verticalSpacing);

        if (reverse) {
          // BT: reverse Y direction
          const maxLayer = orderedLayers.length - 1;
          y = cfg.marginY + (maxLayer - layerIndex) * (cfg.shapeHeight + cfg.verticalSpacing);
        }
      } else {
        // Horizontal flow (LR or RL)
        x = cfg.marginX + layerIndex * (cfg.shapeWidth + cfg.horizontalSpacing);
        y = cfg.marginY + positionInLayer * (cfg.shapeHeight + cfg.verticalSpacing);

        if (reverse) {
          // RL: reverse X direction
          const maxLayer = orderedLayers.length - 1;
          x = cfg.marginX + (maxLayer - layerIndex) * (cfg.shapeWidth + cfg.horizontalSpacing);
        }
      }

      positions.set(nodeId, {
        x,
        y,
        w: cfg.shapeWidth,
        h: cfg.shapeHeight
      });
    });
  });

  return positions;
}

/**
 * Calculate ERD layout positions
 *
 * Uses grid layout for entities
 *
 * @param {Array} entities - Array of entities from Mermaid parser
 * @param {Object} config - Layout configuration
 * @returns {Map} Map of entityName -> {x, y, w, h}
 */
function layoutERD(entities, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const positions = new Map();

  // Calculate entity height based on number of attributes
  const entityHeights = entities.map(entity => {
    const headerHeight = 40;
    const attributeHeight = 25;
    const paddingHeight = 20;
    return headerHeight + (entity.attributes.length * attributeHeight) + paddingHeight;
  });

  // Use grid layout
  const cols = cfg.gridColumns || Math.ceil(Math.sqrt(entities.length));

  entities.forEach((entity, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);

    const x = cfg.marginX + col * (cfg.shapeWidth + cfg.horizontalSpacing);
    const y = cfg.marginY + row * (Math.max(...entityHeights) + cfg.verticalSpacing);

    positions.set(entity.name, {
      x,
      y,
      w: cfg.shapeWidth,
      h: entityHeights[index]
    });
  });

  return positions;
}

/**
 * Calculate sequence diagram layout positions
 *
 * Participants in a row, messages flow vertically
 *
 * @param {Array} participants - Array of participants from Mermaid parser
 * @param {Array} messages - Array of messages from Mermaid parser
 * @param {Object} config - Layout configuration
 * @returns {Object} Positions for participants and message y-coordinates
 */
function layoutSequence(participants, messages, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const participantPositions = new Map();
  const messageYPositions = [];

  // Position participants horizontally
  participants.forEach((participant, index) => {
    const x = cfg.marginX + index * (cfg.shapeWidth + cfg.horizontalSpacing);
    const y = cfg.marginY;

    participantPositions.set(participant.id, {
      x,
      y,
      w: cfg.shapeWidth,
      h: cfg.shapeHeight
    });
  });

  // Calculate message Y positions
  const messageStartY = cfg.marginY + cfg.shapeHeight + 40;
  const messageSpacing = 60;

  messages.forEach((message, index) => {
    messageYPositions.push(messageStartY + index * messageSpacing);
  });

  return {
    participants: participantPositions,
    messageYPositions
  };
}

/**
 * Calculate state diagram layout positions
 *
 * Uses hierarchical layout similar to flowchart
 *
 * @param {Array} states - Array of states from Mermaid parser
 * @param {Array} transitions - Array of transitions from Mermaid parser
 * @param {string} direction - Flow direction
 * @param {Object} config - Layout configuration
 * @returns {Map} Map of stateId -> {x, y, w, h}
 */
function layoutState(states, transitions, direction = 'LR', config = {}) {
  // Convert states and transitions to node/edge format
  const nodes = states.map(s => ({ id: s.id, label: s.label, shape: 'roundedRectangle' }));
  const edges = transitions.map(t => ({ from: t.from, to: t.to, label: t.label }));

  // Reuse flowchart layout algorithm
  return layoutFlowchart(nodes, edges, direction, config);
}

/**
 * Helper: Build adjacency list from edges
 */
function buildAdjacencyList(nodes, edges) {
  const adjacency = new Map();

  nodes.forEach(node => {
    adjacency.set(node.id, []);
  });

  edges.forEach(edge => {
    if (adjacency.has(edge.from)) {
      adjacency.get(edge.from).push(edge.to);
    }
  });

  return adjacency;
}

/**
 * Helper: Assign layers to nodes using longest path from sources
 */
function assignLayers(nodes, edges, adjacency) {
  const layers = [];
  const visited = new Set();
  const layerMap = new Map();

  // Find source nodes (no incoming edges)
  const inDegree = new Map();
  nodes.forEach(node => inDegree.set(node.id, 0));
  edges.forEach(edge => {
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  });

  const sources = nodes.filter(node => inDegree.get(node.id) === 0);

  // BFS to assign layers
  const queue = sources.map(node => ({ nodeId: node.id, layer: 0 }));

  while (queue.length > 0) {
    const { nodeId, layer } = queue.shift();

    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    // Assign to layer
    if (!layers[layer]) layers[layer] = [];
    layers[layer].push(nodeId);
    layerMap.set(nodeId, layer);

    // Add children to queue
    const children = adjacency.get(nodeId) || [];
    children.forEach(childId => {
      queue.push({ nodeId: childId, layer: layer + 1 });
    });
  }

  // Handle disconnected nodes
  nodes.forEach(node => {
    if (!visited.has(node.id)) {
      if (!layers[0]) layers[0] = [];
      layers[0].push(node.id);
    }
  });

  return layers;
}

/**
 * Helper: Minimize edge crossings within layers
 *
 * Uses barycenter heuristic
 */
function minimizeCrossings(layers, edges) {
  // For simplicity, return layers as-is
  // Full implementation would use barycenter method or median heuristic
  return layers;
}

module.exports = {
  layoutFlowchart,
  layoutERD,
  layoutSequence,
  layoutState,
  DEFAULT_CONFIG
};
