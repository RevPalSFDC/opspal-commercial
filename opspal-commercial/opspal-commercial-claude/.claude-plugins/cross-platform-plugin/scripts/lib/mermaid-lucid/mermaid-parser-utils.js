/**
 * Mermaid Parser Utilities
 *
 * Lightweight parser for Mermaid diagram syntax to extract nodes, edges, and metadata.
 * Supports flowcharts, ERDs, sequence diagrams, and state diagrams.
 *
 * @module mermaid-parser-utils
 */

/**
 * Parse a Mermaid flowchart into structured data
 *
 * @param {string} mermaidCode - Mermaid flowchart syntax
 * @returns {Object} Parsed flowchart with nodes and edges
 *
 * @example
 * const flowchart = parseFlowchart(`
 *   flowchart TB
 *     A[Start] --> B{Decision}
 *     B -->|Yes| C[Action]
 *     B -->|No| D[End]
 * `);
 * // Returns: { direction: 'TB', nodes: [...], edges: [...] }
 */
function parseFlowchart(mermaidCode) {
  const lines = mermaidCode.trim().split('\n').map(l => l.trim()).filter(Boolean);

  // Extract direction
  const firstLine = lines[0];
  const directionMatch = firstLine.match(/flowchart\s+(TB|TD|BT|RL|LR)/);
  const direction = directionMatch ? directionMatch[1] : 'TB';

  const nodes = new Map();
  const edges = [];

  // Process lines
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    // Skip comments and empty lines
    if (line.startsWith('%%') || !line.trim()) continue;

    // Parse edge: A --> B or A -->|label| B
    // Supports: --> (solid), --- (open), -.-> (dotted), ==> (thick), ===> (thick)
    const edgeMatch = line.match(/(\w+)\s*(-->|---|-\.->|===>|==>)\s*(?:\|([^|]+)\|\s*)?(\w+)/);
    if (edgeMatch) {
      const [, from, connector, label, to] = edgeMatch;

      edges.push({
        from,
        to,
        label: label || '',
        type: getEdgeType(connector)
      });

      // Ensure nodes exist
      if (!nodes.has(from)) nodes.set(from, { id: from, label: from, shape: 'rectangle' });
      if (!nodes.has(to)) nodes.set(to, { id: to, label: to, shape: 'rectangle' });

      continue;
    }

    // Parse node definition: A[Label] or A{Decision} or A((Circle))
    const nodeMatch = line.match(/(\w+)([\[\{\(\<])([^\]\}\)\>]+)([\]\}\)\>])/);
    if (nodeMatch) {
      const [, id, openBracket, label, closeBracket] = nodeMatch;
      const shape = getNodeShape(openBracket, closeBracket);

      nodes.set(id, { id, label, shape });
    }
  }

  return {
    direction,
    nodes: Array.from(nodes.values()),
    edges
  };
}

/**
 * Parse a Mermaid ERD into structured data
 *
 * @param {string} mermaidCode - Mermaid ERD syntax
 * @returns {Object} Parsed ERD with entities and relationships
 */
function parseERD(mermaidCode) {
  const lines = mermaidCode.trim().split('\n').map(l => l.trim()).filter(Boolean);

  const entities = new Map();
  const relationships = [];

  let currentEntity = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    // Skip comments
    if (line.startsWith('%%')) continue;

    // Parse relationship: Entity1 ||--o{ Entity2 : "relationship"
    const relMatch = line.match(/(\w+)\s+([\|\}o])([o\|])--([o\|])([\|\{o])\s+(\w+)\s*:\s*"([^"]+)"/);
    if (relMatch) {
      const [, entity1, left1, left2, right1, right2, entity2, label] = relMatch;

      relationships.push({
        from: entity1,
        to: entity2,
        label,
        cardinality: {
          from: getCardinality(left1, left2),
          to: getCardinality(right1, right2)
        }
      });

      // Ensure entities exist
      if (!entities.has(entity1)) entities.set(entity1, { name: entity1, attributes: [] });
      if (!entities.has(entity2)) entities.set(entity2, { name: entity2, attributes: [] });

      continue;
    }

    // Parse entity start: Entity {
    const entityMatch = line.match(/(\w+)\s*\{/);
    if (entityMatch) {
      currentEntity = entityMatch[1];
      if (!entities.has(currentEntity)) {
        entities.set(currentEntity, { name: currentEntity, attributes: [] });
      }
      continue;
    }

    // Parse attribute: string name PK
    if (currentEntity && line !== '}') {
      const attrMatch = line.match(/(\w+)\s+(\w+)(?:\s+(PK|FK|UK))?/);
      if (attrMatch) {
        const [, type, name, key] = attrMatch;
        entities.get(currentEntity).attributes.push({
          name,
          type,
          key: key || null
        });
      }
    }

    // Close entity
    if (line === '}') {
      currentEntity = null;
    }
  }

  return {
    entities: Array.from(entities.values()),
    relationships
  };
}

/**
 * Parse a Mermaid sequence diagram into structured data
 *
 * @param {string} mermaidCode - Mermaid sequence syntax
 * @returns {Object} Parsed sequence with participants and messages
 */
function parseSequence(mermaidCode) {
  const lines = mermaidCode.trim().split('\n').map(l => l.trim()).filter(Boolean);

  const participants = new Map();
  const messages = [];
  let autonumber = false;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    // Skip comments
    if (line.startsWith('%%')) continue;

    // Check for autonumber
    if (line === 'autonumber') {
      autonumber = true;
      continue;
    }

    // Parse participant: participant A as Alice
    const participantMatch = line.match(/participant\s+(\w+)(?:\s+as\s+(.+))?/);
    if (participantMatch) {
      const [, id, label] = participantMatch;
      participants.set(id, { id, label: label || id, type: 'participant' });
      continue;
    }

    // Parse actor: actor A as Alice
    const actorMatch = line.match(/actor\s+(\w+)(?:\s+as\s+(.+))?/);
    if (actorMatch) {
      const [, id, label] = actorMatch;
      participants.set(id, { id, label: label || id, type: 'actor' });
      continue;
    }

    // Parse message: A->>B: Message or A->>+B: Message (with activation)
    const messageMatch = line.match(/(\w+)\s*([-=]+>>?[-+]?)\s*(\w+)\s*:\s*(.+)/);
    if (messageMatch) {
      const [, from, arrow, to, text] = messageMatch;

      messages.push({
        from,
        to,
        text,
        type: getMessageType(arrow),
        activate: arrow.includes('+')
      });

      // Ensure participants exist
      if (!participants.has(from)) participants.set(from, { id: from, label: from, type: 'participant' });
      if (!participants.has(to)) participants.set(to, { id: to, label: to, type: 'participant' });
    }
  }

  return {
    participants: Array.from(participants.values()),
    messages,
    autonumber
  };
}

/**
 * Parse a Mermaid state diagram into structured data
 *
 * @param {string} mermaidCode - Mermaid state syntax
 * @returns {Object} Parsed state diagram with states and transitions
 */
function parseState(mermaidCode) {
  const lines = mermaidCode.trim().split('\n').map(l => l.trim()).filter(Boolean);

  const states = new Map();
  const transitions = [];
  let direction = 'LR';

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    // Skip comments
    if (line.startsWith('%%')) continue;

    // Parse direction
    const dirMatch = line.match(/direction\s+(LR|RL|TB|BT)/);
    if (dirMatch) {
      direction = dirMatch[1];
      continue;
    }

    // Parse transition: State1 --> State2 : Label
    const transMatch = line.match(/(\w+|\[\*\])\s*-->\s*(\w+|\[\*\])(?:\s*:\s*(.+))?/);
    if (transMatch) {
      const [, from, to, label] = transMatch;

      transitions.push({
        from: from === '[*]' ? 'start' : from,
        to: to === '[*]' ? 'end' : to,
        label: label || ''
      });

      // Add states
      if (from !== '[*]' && !states.has(from)) {
        states.set(from, { id: from, label: from });
      }
      if (to !== '[*]' && !states.has(to)) {
        states.set(to, { id: to, label: to });
      }

      continue;
    }

    // Parse state definition: state "Label" as StateId
    const stateMatch = line.match(/state\s+"([^"]+)"\s+as\s+(\w+)/);
    if (stateMatch) {
      const [, label, id] = stateMatch;
      states.set(id, { id, label });
    }
  }

  return {
    direction,
    states: Array.from(states.values()),
    transitions
  };
}

/**
 * Helper: Determine node shape from bracket type
 */
function getNodeShape(openBracket, closeBracket) {
  const bracketPair = openBracket + closeBracket;

  const shapeMap = {
    '[]': 'rectangle',
    '{}': 'diamond',      // Decision
    '()': 'roundedRectangle',
    '((': 'circle',
    '(())': 'circle',
    '<>': 'hexagon',
    '[[]]': 'subroutine',
    '[()]': 'stadium',
    '{{}}': 'hexagon',
    '[//]': 'parallelogram'
  };

  return shapeMap[bracketPair] || 'rectangle';
}

/**
 * Helper: Determine edge type from connector
 * Supports: --> (normal), --- (open), -.-> (dotted), ==> (thick)
 */
function getEdgeType(connector) {
  if (connector.includes('=')) return 'thick';
  if (connector.includes('-.')) return 'dotted';  // Fixed: -.-> pattern
  return 'normal';
}

/**
 * Helper: Determine message type from arrow
 */
function getMessageType(arrow) {
  if (arrow.includes('>>')) return 'sync';
  if (arrow.includes('->>')) return 'async';
  if (arrow.includes('-->>')) return 'response';
  return 'sync';
}

/**
 * Helper: Determine cardinality from ERD symbols
 */
function getCardinality(symbol1, symbol2) {
  const combined = symbol1 + symbol2;

  const cardinalityMap = {
    '||': 'one',
    '|o': 'zero-or-one',
    '}o': 'zero-or-many',
    '}{': 'one-or-many'
  };

  return cardinalityMap[combined] || 'many';
}

/**
 * Detect Mermaid diagram type from code
 *
 * @param {string} mermaidCode - Mermaid syntax
 * @returns {string} Diagram type: 'flowchart', 'erd', 'sequence', 'state'
 */
function detectDiagramType(mermaidCode) {
  const firstLine = mermaidCode.trim().split('\n')[0].toLowerCase();

  if (firstLine.startsWith('flowchart') || firstLine.startsWith('graph')) return 'flowchart';
  if (firstLine.startsWith('erdiagram')) return 'erd';
  if (firstLine.startsWith('sequencediagram')) return 'sequence';
  if (firstLine.startsWith('statediagram')) return 'state';

  return 'unknown';
}

module.exports = {
  parseFlowchart,
  parseERD,
  parseSequence,
  parseState,
  detectDiagramType
};
