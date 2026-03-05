/**
 * Mermaid Diagram Generator
 *
 * Comprehensive library for generating Mermaid.js diagrams programmatically.
 * Supports flowcharts, ERDs, sequence diagrams, and state diagrams.
 *
 * @module mermaid-generator
 * @version 1.0.0
 *
 * @example
 * const MermaidGenerator = require('./mermaid-generator');
 * const generator = new MermaidGenerator();
 *
 * const flowchart = generator.flowchart()
 *   .addNode('start', 'New Lead', { shape: 'circle' })
 *   .addNode('qualify', 'Qualify Lead')
 *   .addEdge('start', 'qualify', 'Score > 80')
 *   .generate();
 *
 * await generator.saveAs('/path/to/diagram', flowchart, { formats: ['md', 'mmd'] });
 */

const fs = require('fs').promises;
const path = require('path');

class MermaidGenerator {
  constructor(options = {}) {
    this.options = {
      theme: options.theme || 'default', // default, dark, forest, neutral
      outputDir: options.outputDir || process.cwd(),
      ...options
    };
  }

  /**
   * Create a flowchart diagram builder
   * @param {Object} config - Flowchart configuration
   * @returns {FlowchartBuilder}
   */
  flowchart(config = {}) {
    return new FlowchartBuilder(config, this.options);
  }

  /**
   * Create an entity relationship diagram builder
   * @param {Object} config - ERD configuration
   * @returns {ERDBuilder}
   */
  erd(config = {}) {
    return new ERDBuilder(config, this.options);
  }

  /**
   * Create a sequence diagram builder
   * @param {Object} config - Sequence diagram configuration
   * @returns {SequenceBuilder}
   */
  sequence(config = {}) {
    return new SequenceBuilder(config, this.options);
  }

  /**
   * Create a state diagram builder
   * @param {Object} config - State diagram configuration
   * @returns {StateBuilder}
   */
  state(config = {}) {
    return new StateBuilder(config, this.options);
  }

  /**
   * Save diagram to file(s)
   * @param {string} basePath - Base path (without extension)
   * @param {string} mermaidCode - Mermaid syntax
   * @param {Object} options - Save options
   * @returns {Promise<Object>} Saved file paths
   */
  async saveAs(basePath, mermaidCode, options = {}) {
    const { formats = ['md', 'mmd'], title, description } = options;
    const savedFiles = {};

    for (const format of formats) {
      const filePath = `${basePath}.${format}`;
      let content;

      if (format === 'md') {
        // Markdown file with embedded Mermaid
        content = this._generateMarkdown(mermaidCode, { title, description });
      } else if (format === 'mmd') {
        // Standalone Mermaid file
        content = mermaidCode;
      } else {
        throw new Error(`Unsupported format: ${format}`);
      }

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf8');
      savedFiles[format] = filePath;
    }

    return savedFiles;
  }

  /**
   * Generate markdown with embedded Mermaid
   * @private
   */
  _generateMarkdown(mermaidCode, { title, description }) {
    let markdown = '';

    if (title) {
      markdown += `# ${title}\n\n`;
    }

    if (description) {
      markdown += `${description}\n\n`;
    }

    markdown += '```mermaid\n';
    markdown += mermaidCode;
    markdown += '\n```\n';

    return markdown;
  }

  /**
   * Get optimal direction based on node count to prevent unreadable layouts
   *
   * LR direction can become unreadable when:
   * - Linear diagrams with >10 nodes become extremely wide horizontal lines
   * - Complex CPQ process flows become flat (47-90px height)
   *
   * This helper recommends TB for large diagrams to maintain readability.
   *
   * @param {number} nodeCount - Number of nodes in the diagram
   * @param {string} preferredDirection - User's preferred direction (TB, LR, etc.)
   * @returns {string} Recommended direction
   *
   * @example
   * // Small diagram - use preferred direction
   * MermaidGenerator.getOptimalDirection(5, 'LR') // => 'LR'
   *
   * // Large diagram - recommend TB for readability
   * MermaidGenerator.getOptimalDirection(15, 'LR') // => 'TB'
   *
   * @phase Phase 3 - Addresses 39 schema/parse reflections
   */
  static getOptimalDirection(nodeCount, preferredDirection = 'TB') {
    // Threshold: LR becomes unreadable with more than 10 nodes in linear flow
    const LR_NODE_THRESHOLD = 10;

    // If direction is TB, BT, or TD - no adjustment needed (vertical flows scale better)
    if (['TB', 'TD', 'BT'].includes(preferredDirection)) {
      return preferredDirection;
    }

    // For LR or RL with high node counts, recommend TB for readability
    if (['LR', 'RL'].includes(preferredDirection) && nodeCount > LR_NODE_THRESHOLD) {
      // Log recommendation for debugging
      console.warn(
        `[MermaidGenerator] Recommending TB instead of ${preferredDirection} for ${nodeCount} nodes. ` +
        `LR layouts with >${LR_NODE_THRESHOLD} nodes become unreadable flat horizontal lines.`
      );
      return 'TB';
    }

    // Use preferred direction for smaller diagrams
    return preferredDirection;
  }

  /**
   * Auto-detect best diagram type from data
   * @param {Object} data - Input data
   * @returns {string} Suggested diagram type
   */
  static detectDiagramType(data) {
    // Check for entities/relationships (ERD)
    if (data.entities || data.objects || data.tables) {
      return 'erd';
    }

    // Check for participants/messages (Sequence)
    if (data.participants || data.actors || data.messages) {
      return 'sequence';
    }

    // Check for states/transitions (State)
    if (data.states || data.transitions) {
      return 'state';
    }

    // Default to flowchart
    return 'flowchart';
  }
}

/**
 * Flowchart Builder
 * Supports process flows, workflows, decision trees
 */
class FlowchartBuilder {
  constructor(config = {}, globalOptions = {}) {
    this.config = {
      direction: config.direction || 'TB', // TB, TD, BT, RL, LR
      title: config.title || '',
      ...config
    };
    this.globalOptions = globalOptions;
    this.nodes = [];
    this.edges = [];
    this.subgraphs = [];
    this.styles = [];
  }

  /**
   * Add a node to the flowchart
   * @param {string} id - Unique node identifier
   * @param {string} label - Node label
   * @param {Object} options - Node options (shape, style, class)
   * @returns {FlowchartBuilder}
   */
  addNode(id, label, options = {}) {
    const { shape = 'rectangle', style, cssClass } = options;

    this.nodes.push({
      id: this._sanitizeId(id),
      label: this._escapeLabel(label),
      shape,
      style,
      cssClass
    });

    return this;
  }

  /**
   * Add an edge between nodes
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {string} label - Edge label (optional)
   * @param {Object} options - Edge options (type, style)
   * @returns {FlowchartBuilder}
   */
  addEdge(from, to, label = '', options = {}) {
    const { type = 'solid', style } = options;

    this.edges.push({
      from: this._sanitizeId(from),
      to: this._sanitizeId(to),
      label: this._escapeLabel(label),
      type,
      style
    });

    return this;
  }

  /**
   * Add a subgraph (group of nodes)
   * @param {string} id - Subgraph identifier
   * @param {string} label - Subgraph label
   * @param {Function} builder - Builder function
   * @returns {FlowchartBuilder}
   */
  addSubgraph(id, label, builder) {
    const subgraphBuilder = new FlowchartBuilder({ direction: this.config.direction }, this.globalOptions);
    builder(subgraphBuilder);

    this.subgraphs.push({
      id: this._sanitizeId(id),
      label: this._escapeLabel(label),
      nodes: subgraphBuilder.nodes,
      edges: subgraphBuilder.edges
    });

    return this;
  }

  /**
   * Add custom styling
   * @param {string} selector - Node ID or class
   * @param {Object} style - CSS-like styles
   * @returns {FlowchartBuilder}
   */
  addStyle(selector, style) {
    this.styles.push({ selector, style });
    return this;
  }

  /**
   * Generate Mermaid syntax
   * @returns {string}
   */
  generate() {
    let mermaid = `flowchart ${this.config.direction}\n`;

    // Add title as comment
    if (this.config.title) {
      mermaid += `  %% ${this.config.title}\n`;
    }

    // Add nodes
    for (const node of this.nodes) {
      const shapeSymbols = this._getShapeSymbols(node.shape);
      const nodeClass = node.cssClass ? `:::${node.cssClass}` : '';
      mermaid += `  ${node.id}${shapeSymbols.open}${node.label}${shapeSymbols.close}${nodeClass}\n`;
    }

    // Add subgraphs
    for (const subgraph of this.subgraphs) {
      mermaid += `  subgraph ${subgraph.id}["${subgraph.label}"]\n`;

      for (const node of subgraph.nodes) {
        const shapeSymbols = this._getShapeSymbols(node.shape);
        mermaid += `    ${node.id}${shapeSymbols.open}${node.label}${shapeSymbols.close}\n`;
      }

      for (const edge of subgraph.edges) {
        const arrow = this._getArrowSymbol(edge.type);
        const edgeLabel = edge.label ? `|${edge.label}|` : '';
        mermaid += `    ${edge.from} ${arrow}${edgeLabel} ${edge.to}\n`;
      }

      mermaid += `  end\n`;
    }

    // Add edges
    for (const edge of this.edges) {
      const arrow = this._getArrowSymbol(edge.type);
      const edgeLabel = edge.label ? `|${edge.label}|` : '';
      mermaid += `  ${edge.from} ${arrow}${edgeLabel} ${edge.to}\n`;
    }

    // Add styles
    for (const style of this.styles) {
      const styleStr = Object.entries(style.style)
        .map(([key, value]) => `${key}:${value}`)
        .join(',');
      mermaid += `  style ${style.selector} ${styleStr}\n`;
    }

    return mermaid;
  }

  _sanitizeId(id) {
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  _escapeLabel(label) {
    return label.replace(/"/g, '\\"');
  }

  _getShapeSymbols(shape) {
    const shapes = {
      rectangle: { open: '[', close: ']' },
      rounded: { open: '(', close: ')' },
      stadium: { open: '([', close: '])' },
      circle: { open: '((', close: '))' },
      asymmetric: { open: '>', close: ']' },
      rhombus: { open: '{', close: '}' },
      hexagon: { open: '{{', close: '}}' },
      parallelogram: { open: '[/', close: '/]' },
      trapezoid: { open: '[\\', close: '/]' },
      database: { open: '[(', close: ')]' }
    };
    return shapes[shape] || shapes.rectangle;
  }

  _getArrowSymbol(type) {
    const arrows = {
      solid: '-->',
      dotted: '-.-',
      thick: '==>',
      open: '---'
    };
    return arrows[type] || arrows.solid;
  }
}

/**
 * Entity Relationship Diagram Builder
 * Supports database schemas, object relationships
 */
class ERDBuilder {
  constructor(config = {}, globalOptions = {}) {
    this.config = {
      title: config.title || '',
      ...config
    };
    this.globalOptions = globalOptions;
    this.entities = [];
    this.relationships = [];
  }

  /**
   * Add an entity (table/object)
   * @param {string} name - Entity name
   * @param {Array} attributes - Entity attributes
   * @param {Object} options - Entity options
   * @returns {ERDBuilder}
   */
  addEntity(name, attributes = [], options = {}) {
    const { primaryKey } = options;

    this.entities.push({
      name: this._sanitizeEntityName(name),
      attributes: attributes.map(attr => this._parseAttribute(attr)),
      primaryKey
    });

    return this;
  }

  /**
   * Add a relationship between entities
   * @param {string} from - Source entity
   * @param {string} to - Target entity
   * @param {string} relationship - Relationship type (one-to-one, one-to-many, many-to-many)
   * @param {string} label - Relationship label
   * @returns {ERDBuilder}
   */
  addRelationship(from, to, relationship, label = '') {
    const cardinality = this._getCardinality(relationship);

    this.relationships.push({
      from: this._sanitizeEntityName(from),
      to: this._sanitizeEntityName(to),
      cardinality,
      label: this._escapeLabel(label)
    });

    return this;
  }

  /**
   * Generate Mermaid ERD syntax
   * @returns {string}
   */
  generate() {
    let mermaid = 'erDiagram\n';

    // Add title as comment
    if (this.config.title) {
      mermaid += `  %% ${this.config.title}\n`;
    }

    // Add entities with attributes
    for (const entity of this.entities) {
      mermaid += `  ${entity.name} {\n`;

      for (const attr of entity.attributes) {
        const pk = attr.name === entity.primaryKey ? ' PK' : '';
        mermaid += `    ${attr.type} ${attr.name}${pk}\n`;
      }

      mermaid += `  }\n`;
    }

    // Add relationships
    for (const rel of this.relationships) {
      const label = rel.label ? ` : "${rel.label}"` : '';
      mermaid += `  ${rel.from} ${rel.cardinality} ${rel.to}${label}\n`;
    }

    return mermaid;
  }

  _sanitizeEntityName(name) {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  _escapeLabel(label) {
    return label.replace(/"/g, '\\"');
  }

  _parseAttribute(attr) {
    if (typeof attr === 'string') {
      const [type, name] = attr.split(' ');
      return { type, name };
    }
    return { type: attr.type || 'string', name: attr.name };
  }

  _getCardinality(relationship) {
    const cardinalities = {
      'one-to-one': '||--||',
      'one-to-many': '||--o{',
      'many-to-one': 'o{--||',
      'many-to-many': '}o--o{',
      'zero-or-one-to-many': '||--o{',
      'zero-or-many-to-one': 'o{--||'
    };
    return cardinalities[relationship] || '||--o{';
  }
}

/**
 * Sequence Diagram Builder
 * Supports API interactions, system flows
 */
class SequenceBuilder {
  constructor(config = {}, globalOptions = {}) {
    this.config = {
      title: config.title || '',
      autonumber: config.autonumber !== false,
      ...config
    };
    this.globalOptions = globalOptions;
    this.participants = [];
    this.messages = [];
    this.notes = [];
  }

  /**
   * Add a participant (actor/system)
   * @param {string} id - Participant identifier
   * @param {string} label - Display label
   * @param {string} type - Participant type (actor, participant, database)
   * @returns {SequenceBuilder}
   */
  addParticipant(id, label, type = 'participant') {
    this.participants.push({
      id: this._sanitizeId(id),
      label: this._escapeLabel(label),
      type
    });

    return this;
  }

  /**
   * Add a message between participants
   * @param {string} from - Source participant
   * @param {string} to - Target participant
   * @param {string} message - Message text
   * @param {Object} options - Message options (type, activate, deactivate)
   * @returns {SequenceBuilder}
   */
  addMessage(from, to, message, options = {}) {
    const { type = 'solid', activate = false, deactivate = false } = options;

    this.messages.push({
      from: this._sanitizeId(from),
      to: this._sanitizeId(to),
      message: this._escapeLabel(message),
      type,
      activate,
      deactivate
    });

    return this;
  }

  /**
   * Add a note
   * @param {string} position - Note position (left of, right of, over)
   * @param {string} participant - Participant ID
   * @param {string} text - Note text
   * @returns {SequenceBuilder}
   */
  addNote(position, participant, text) {
    this.notes.push({
      position,
      participant: this._sanitizeId(participant),
      text: this._escapeLabel(text)
    });

    return this;
  }

  /**
   * Generate Mermaid sequence diagram syntax
   * @returns {string}
   */
  generate() {
    let mermaid = 'sequenceDiagram\n';

    // Add title as comment
    if (this.config.title) {
      mermaid += `  %% ${this.config.title}\n`;
    }

    // Add autonumbering
    if (this.config.autonumber) {
      mermaid += '  autonumber\n';
    }

    // Add participants
    for (const p of this.participants) {
      const participantType = p.type === 'actor' ? 'actor' : 'participant';
      mermaid += `  ${participantType} ${p.id} as ${p.label}\n`;
    }

    // Add messages and notes (interleaved)
    let messageIndex = 0;
    let noteIndex = 0;

    while (messageIndex < this.messages.length || noteIndex < this.notes.length) {
      // Add message
      if (messageIndex < this.messages.length) {
        const msg = this.messages[messageIndex];
        const arrow = this._getMessageArrow(msg.type);

        if (msg.activate) {
          mermaid += `  activate ${msg.to}\n`;
        }

        mermaid += `  ${msg.from}${arrow}${msg.to}: ${msg.message}\n`;

        if (msg.deactivate) {
          mermaid += `  deactivate ${msg.to}\n`;
        }

        messageIndex++;
      }

      // Add note if it logically follows this message
      if (noteIndex < this.notes.length) {
        const note = this.notes[noteIndex];
        mermaid += `  Note ${note.position} ${note.participant}: ${note.text}\n`;
        noteIndex++;
      }
    }

    return mermaid;
  }

  _sanitizeId(id) {
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  _escapeLabel(label) {
    return label.replace(/"/g, '\\"');
  }

  _getMessageArrow(type) {
    const arrows = {
      solid: '->>',
      dotted: '-->>',
      open: '->',
      openDotted: '-->',
      cross: '-x',
      crossDotted: '--x'
    };
    return arrows[type] || arrows.solid;
  }
}

/**
 * State Diagram Builder
 * Supports lifecycle states, status transitions
 */
class StateBuilder {
  constructor(config = {}, globalOptions = {}) {
    this.config = {
      title: config.title || '',
      direction: config.direction || 'TB',
      ...config
    };
    this.globalOptions = globalOptions;
    this.states = [];
    this.transitions = [];
    this.compositeStates = [];
  }

  /**
   * Add a state
   * @param {string} id - State identifier
   * @param {string} label - State label
   * @param {Object} options - State options (description)
   * @returns {StateBuilder}
   */
  addState(id, label, options = {}) {
    const { description } = options;

    this.states.push({
      id: this._sanitizeId(id),
      label: this._escapeLabel(label),
      description
    });

    return this;
  }

  /**
   * Add a transition between states
   * @param {string} from - Source state
   * @param {string} to - Target state
   * @param {string} label - Transition label
   * @returns {StateBuilder}
   */
  addTransition(from, to, label = '') {
    this.transitions.push({
      from: this._sanitizeId(from),
      to: this._sanitizeId(to),
      label: this._escapeLabel(label)
    });

    return this;
  }

  /**
   * Add a composite state (state containing sub-states)
   * @param {string} id - Composite state ID
   * @param {string} label - Composite state label
   * @param {Function} builder - Builder function for sub-states
   * @returns {StateBuilder}
   */
  addCompositeState(id, label, builder) {
    const compositeBuilder = new StateBuilder({ direction: this.config.direction }, this.globalOptions);
    builder(compositeBuilder);

    this.compositeStates.push({
      id: this._sanitizeId(id),
      label: this._escapeLabel(label),
      states: compositeBuilder.states,
      transitions: compositeBuilder.transitions
    });

    return this;
  }

  /**
   * Generate Mermaid state diagram syntax
   * @returns {string}
   */
  generate() {
    let mermaid = `stateDiagram-v2\n`;

    // Add title as comment
    if (this.config.title) {
      mermaid += `  %% ${this.config.title}\n`;
    }

    // Add direction
    mermaid += `  direction ${this.config.direction}\n`;

    // Add states
    for (const state of this.states) {
      if (state.description) {
        mermaid += `  ${state.id} : ${state.label}\n`;
        mermaid += `  ${state.id} : ${state.description}\n`;
      } else if (state.label !== state.id) {
        mermaid += `  ${state.id} : ${state.label}\n`;
      }
    }

    // Add composite states
    for (const composite of this.compositeStates) {
      mermaid += `  state "${composite.label}" as ${composite.id} {\n`;

      for (const state of composite.states) {
        if (state.description) {
          mermaid += `    ${state.id} : ${state.label}\n`;
          mermaid += `    ${state.id} : ${state.description}\n`;
        } else {
          mermaid += `    ${state.id} : ${state.label}\n`;
        }
      }

      for (const transition of composite.transitions) {
        const label = transition.label ? ` : ${transition.label}` : '';
        mermaid += `    ${transition.from} --> ${transition.to}${label}\n`;
      }

      mermaid += `  }\n`;
    }

    // Add transitions
    for (const transition of this.transitions) {
      const label = transition.label ? ` : ${transition.label}` : '';
      mermaid += `  ${transition.from} --> ${transition.to}${label}\n`;
    }

    return mermaid;
  }

  _sanitizeId(id) {
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  _escapeLabel(label) {
    return label.replace(/"/g, '\\"');
  }
}

module.exports = MermaidGenerator;
module.exports.FlowchartBuilder = FlowchartBuilder;
module.exports.ERDBuilder = ERDBuilder;
module.exports.SequenceBuilder = SequenceBuilder;
module.exports.StateBuilder = StateBuilder;
