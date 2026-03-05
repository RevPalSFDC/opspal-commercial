/**
 * Mermaid to Lucid JSON Converter
 *
 * Converts Mermaid diagram code to Lucid Standard Import JSON format.
 * Supports flowcharts, ERDs, sequence diagrams, and state diagrams.
 *
 * @module mermaid-to-lucid-json-converter
 */

const {
  parseFlowchart,
  parseERD,
  parseSequence,
  parseState,
  detectDiagramType
} = require('./mermaid-parser-utils');

const {
  layoutFlowchart,
  layoutERD,
  layoutSequence,
  layoutState
} = require('./lucid-layout-engine');

/**
 * Convert Mermaid code to Lucid Standard Import JSON
 *
 * @param {string} mermaidCode - Mermaid diagram syntax
 * @param {Object} options - Conversion options
 * @param {string} options.title - Document title
 * @param {string} options.pageTitle - Page title
 * @param {string} options.diagramType - Override auto-detection
 * @param {Object} options.layoutConfig - Layout configuration
 * @returns {Object} Lucid Standard Import JSON
 */
function convertMermaidToLucid(mermaidCode, options = {}) {
  const {
    title = 'Diagram',
    pageTitle = 'Page 1',
    diagramType = detectDiagramType(mermaidCode),
    layoutConfig = {}
  } = options;

  let lucidDocument;

  switch (diagramType) {
    case 'flowchart':
      lucidDocument = convertFlowchart(mermaidCode, pageTitle, layoutConfig);
      break;
    case 'erd':
      lucidDocument = convertERD(mermaidCode, pageTitle, layoutConfig);
      break;
    case 'sequence':
      lucidDocument = convertSequence(mermaidCode, pageTitle, layoutConfig);
      break;
    case 'state':
      lucidDocument = convertState(mermaidCode, pageTitle, layoutConfig);
      break;
    default:
      throw new Error(`Unsupported diagram type: ${diagramType}`);
  }

  return {
    ...lucidDocument,
    _metadata: {
      title,
      diagramType,
      generatedFrom: 'mermaid',
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Convert Mermaid flowchart to Lucid JSON
 */
function convertFlowchart(mermaidCode, pageTitle, layoutConfig) {
  const { direction, nodes, edges } = parseFlowchart(mermaidCode);
  const positions = layoutFlowchart(nodes, edges, direction, layoutConfig);

  const shapes = nodes.map(node => {
    const pos = positions.get(node.id);
    if (!pos) return null;

    return {
      id: node.id,
      type: getLucidShapeType(node.shape),
      boundingBox: pos,
      style: getShapeStyle(node.shape),
      text: formatText(node.label)
    };
  }).filter(Boolean);

  const lines = edges.map((edge, index) => {
    const fromPos = positions.get(edge.from);
    const toPos = positions.get(edge.to);

    if (!fromPos || !toPos) return null;

    return {
      id: `line_${edge.from}_${edge.to}_${index}`,
      lineType: edge.type === 'dotted' ? 'straight' : 'elbow',
      stroke: getLineStyle(edge.type),
      endpoint1: {
        type: 'shapeEndpoint',
        style: 'none',
        shapeId: edge.from,
        position: getExitPoint(fromPos, toPos)
      },
      endpoint2: {
        type: 'shapeEndpoint',
        style: 'arrow',
        shapeId: edge.to,
        position: getEntryPoint(toPos, fromPos)
      },
      ...(edge.label && {
        text: [{
          text: edge.label,
          position: 0.5,
          side: 'middle'
        }]
      })
    };
  }).filter(Boolean);

  return {
    version: 1,
    pages: [{
      id: 'page1',
      title: pageTitle,
      shapes,
      lines
    }]
  };
}

/**
 * Convert Mermaid ERD to Lucid JSON
 */
function convertERD(mermaidCode, pageTitle, layoutConfig) {
  const { entities, relationships } = parseERD(mermaidCode);
  const positions = layoutERD(entities, layoutConfig);

  // Create entity shapes (tables)
  const shapes = entities.map(entity => {
    const pos = positions.get(entity.name);
    if (!pos) return null;

    // Build table HTML
    const tableHTML = buildEntityTable(entity);

    return {
      id: entity.name,
      type: 'rectangle',
      boundingBox: pos,
      style: {
        stroke: { color: '#333333', width: 2 },
        fill: '#ffffff'
      },
      text: tableHTML
    };
  }).filter(Boolean);

  // Create relationship lines
  const lines = relationships.map((rel, index) => {
    const fromPos = positions.get(rel.from);
    const toPos = positions.get(rel.to);

    if (!fromPos || !toPos) return null;

    return {
      id: `rel_${rel.from}_${rel.to}_${index}`,
      lineType: 'straight',
      stroke: { color: '#666666', width: 2 },
      endpoint1: {
        type: 'shapeEndpoint',
        style: getERDEndpointStyle(rel.cardinality.from),
        shapeId: rel.from,
        position: getExitPoint(fromPos, toPos)
      },
      endpoint2: {
        type: 'shapeEndpoint',
        style: getERDEndpointStyle(rel.cardinality.to),
        shapeId: rel.to,
        position: getEntryPoint(toPos, fromPos)
      },
      text: [{
        text: rel.label,
        position: 0.5,
        side: 'middle'
      }]
    };
  }).filter(Boolean);

  return {
    version: 1,
    pages: [{
      id: 'page1',
      title: pageTitle,
      shapes,
      lines
    }]
  };
}

/**
 * Convert Mermaid sequence diagram to Lucid JSON
 */
function convertSequence(mermaidCode, pageTitle, layoutConfig) {
  const { participants, messages, autonumber } = parseSequence(mermaidCode);
  const { participants: participantPositions, messageYPositions } = layoutSequence(participants, messages, layoutConfig);

  // Create participant shapes
  const shapes = participants.map(participant => {
    const pos = participantPositions.get(participant.id);
    if (!pos) return null;

    return {
      id: participant.id,
      type: participant.type === 'actor' ? 'human' : 'rectangle',
      boundingBox: pos,
      style: getShapeStyle('rectangle'),
      text: formatText(participant.label)
    };
  }).filter(Boolean);

  // Create lifelines (vertical lines below each participant)
  const lifelines = participants.map(participant => {
    const pos = participantPositions.get(participant.id);
    if (!pos) return null;

    const lifelineStart = { x: pos.x + pos.w / 2, y: pos.y + pos.h };
    const lifelineEnd = { x: pos.x + pos.w / 2, y: messageYPositions[messageYPositions.length - 1] + 100 };

    return {
      id: `lifeline_${participant.id}`,
      lineType: 'straight',
      stroke: { color: '#cccccc', width: 1, style: 'dashed' },
      endpoint1: {
        type: 'pointEndpoint',
        style: 'none',
        point: lifelineStart
      },
      endpoint2: {
        type: 'pointEndpoint',
        style: 'none',
        point: lifelineEnd
      }
    };
  }).filter(Boolean);

  // Create message lines
  const messageLines = messages.map((message, index) => {
    const fromPos = participantPositions.get(message.from);
    const toPos = participantPositions.get(message.to);

    if (!fromPos || !toPos) return null;

    const y = messageYPositions[index];
    const fromX = fromPos.x + fromPos.w / 2;
    const toX = toPos.x + toPos.w / 2;

    return {
      id: `message_${index}`,
      lineType: 'straight',
      stroke: { color: '#333333', width: 2 },
      endpoint1: {
        type: 'pointEndpoint',
        style: 'none',
        point: { x: fromX, y }
      },
      endpoint2: {
        type: 'pointEndpoint',
        style: message.type === 'sync' ? 'arrow' : 'openArrow',
        point: { x: toX, y }
      },
      text: [{
        text: autonumber ? `${index + 1}. ${message.text}` : message.text,
        position: 0.5,
        side: 'top'
      }]
    };
  }).filter(Boolean);

  const lines = [...lifelines, ...messageLines];

  return {
    version: 1,
    pages: [{
      id: 'page1',
      title: pageTitle,
      shapes,
      lines
    }]
  };
}

/**
 * Convert Mermaid state diagram to Lucid JSON
 */
function convertState(mermaidCode, pageTitle, layoutConfig) {
  const { direction, states, transitions } = parseState(mermaidCode);
  const positions = layoutState(states, transitions, direction, layoutConfig);

  // Create state shapes
  const shapes = states.map(state => {
    const pos = positions.get(state.id);
    if (!pos) return null;

    return {
      id: state.id,
      type: 'roundedRectangle',
      boundingBox: pos,
      style: {
        stroke: { color: '#4a90e2', width: 2 },
        fill: '#e3f2fd',
        rounding: 10
      },
      text: formatText(state.label)
    };
  }).filter(Boolean);

  // Add start/end states
  shapes.push({
    id: 'start',
    type: 'circle',
    boundingBox: { x: 50, y: 150, w: 40, h: 40 },
    style: {
      stroke: { color: '#000000', width: 2 },
      fill: '#000000'
    }
  });

  shapes.push({
    id: 'end',
    type: 'circle',
    boundingBox: { x: 1000, y: 150, w: 40, h: 40 },
    style: {
      stroke: { color: '#000000', width: 3 },
      fill: '#ffffff'
    }
  });

  // Create transition lines
  const lines = transitions.map((transition, index) => {
    const fromId = transition.from === 'start' ? 'start' : transition.from;
    const toId = transition.to === 'end' ? 'end' : transition.to;

    const fromPos = positions.get(fromId) || shapes.find(s => s.id === fromId)?.boundingBox;
    const toPos = positions.get(toId) || shapes.find(s => s.id === toId)?.boundingBox;

    if (!fromPos || !toPos) return null;

    return {
      id: `transition_${index}`,
      lineType: 'elbow',
      stroke: { color: '#666666', width: 2 },
      endpoint1: {
        type: 'shapeEndpoint',
        style: 'none',
        shapeId: fromId,
        position: getExitPoint(fromPos, toPos)
      },
      endpoint2: {
        type: 'shapeEndpoint',
        style: 'arrow',
        shapeId: toId,
        position: getEntryPoint(toPos, fromPos)
      },
      ...(transition.label && {
        text: [{
          text: transition.label,
          position: 0.5,
          side: 'middle'
        }]
      })
    };
  }).filter(Boolean);

  return {
    version: 1,
    pages: [{
      id: 'page1',
      title: pageTitle,
      shapes,
      lines
    }]
  };
}

// ========== HELPER FUNCTIONS ==========

/**
 * Map Mermaid shape to Lucid shape type
 */
function getLucidShapeType(mermaidShape) {
  const shapeMap = {
    'rectangle': 'process',
    'diamond': 'decision',
    'circle': 'terminator',
    'roundedRectangle': 'process',
    'hexagon': 'preparation',
    'parallelogram': 'data'
  };

  return shapeMap[mermaidShape] || 'process';
}

/**
 * Get shape style based on shape type
 */
function getShapeStyle(shapeType) {
  return {
    stroke: { color: '#333333', width: 2 },
    fill: '#ffffff'
  };
}

/**
 * Get line style based on edge type
 */
function getLineStyle(edgeType) {
  if (edgeType === 'thick') {
    return { color: '#333333', width: 3 };
  } else if (edgeType === 'dotted') {
    return { color: '#666666', width: 2, style: 'dashed' };
  }
  return { color: '#333333', width: 2 };
}

/**
 * Format text with HTML styling for Lucid
 */
function formatText(text) {
  return `<span style='font-size: 11pt; color: #000000;'>${escapeHTML(text)}</span>`;
}

/**
 * Escape HTML special characters
 */
function escapeHTML(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Build entity table HTML for ERD
 */
function buildEntityTable(entity) {
  let html = `<table style='border-collapse: collapse; width: 100%;'>`;
  html += `<tr style='background-color: #4a90e2; color: white;'><th style='padding: 8px; text-align: left;'><b>${entity.name}</b></th></tr>`;

  entity.attributes.forEach(attr => {
    const keyBadge = attr.key ? ` <span style='color: #ff9800;'>[${attr.key}]</span>` : '';
    html += `<tr><td style='padding: 4px; border-top: 1px solid #ddd;'>${attr.type} ${attr.name}${keyBadge}</td></tr>`;
  });

  html += `</table>`;
  return html;
}

/**
 * Get ERD endpoint style based on cardinality
 */
function getERDEndpointStyle(cardinality) {
  const styleMap = {
    'one': 'line',
    'zero-or-one': 'circle',
    'zero-or-many': 'crowsFoot',
    'one-or-many': 'crowsFoot'
  };

  return styleMap[cardinality] || 'none';
}

/**
 * Calculate exit point from one shape to another
 * Returns relative position {x, y} where x,y are 0-1
 */
function getExitPoint(fromBox, toBox) {
  const fromCenterX = fromBox.x + fromBox.w / 2;
  const fromCenterY = fromBox.y + fromBox.h / 2;
  const toCenterX = toBox.x + toBox.w / 2;
  const toCenterY = toBox.y + toBox.h / 2;

  const dx = toCenterX - fromCenterX;
  const dy = toCenterY - fromCenterY;

  // Determine which side to exit from
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal: left or right
    return dx > 0 ? { x: 1, y: 0.5 } : { x: 0, y: 0.5 };
  } else {
    // Vertical: top or bottom
    return dy > 0 ? { x: 0.5, y: 1 } : { x: 0.5, y: 0 };
  }
}

/**
 * Calculate entry point into one shape from another
 * Returns relative position {x, y} where x,y are 0-1
 */
function getEntryPoint(toBox, fromBox) {
  const exitPoint = getExitPoint(toBox, fromBox);

  // Invert the direction
  return {
    x: 1 - exitPoint.x,
    y: 1 - exitPoint.y
  };
}

module.exports = {
  convertMermaidToLucid,
  convertFlowchart,
  convertERD,
  convertSequence,
  convertState
};
