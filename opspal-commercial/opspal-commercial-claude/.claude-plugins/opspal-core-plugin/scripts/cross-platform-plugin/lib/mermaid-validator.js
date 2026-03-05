/**
 * Mermaid Syntax Validator
 *
 * Validates Mermaid diagram syntax and provides helpful error messages
 * and suggestions for common mistakes.
 *
 * @module mermaid-validator
 * @version 1.0.0
 *
 * @example
 * const MermaidValidator = require('./mermaid-validator');
 * const validator = new MermaidValidator();
 *
 * const result = validator.validate(mermaidCode);
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors);
 *   console.log('Suggestions:', result.suggestions);
 * }
 */

class MermaidValidator {
  constructor(options = {}) {
    this.options = {
      strict: options.strict !== false, // Strict validation by default
      ...options
    };

    // Known Mermaid diagram types
    this.diagramTypes = [
      'flowchart',
      'graph',
      'sequenceDiagram',
      'classDiagram',
      'stateDiagram',
      'stateDiagram-v2',
      'erDiagram',
      'gantt',
      'pie',
      'journey',
      'gitGraph',
      'mindmap',
      'timeline'
    ];

    // Flowchart directions
    this.flowchartDirections = ['TB', 'TD', 'BT', 'RL', 'LR'];

    // Node shapes for flowcharts
    this.nodeShapes = {
      rectangle: /\[[^\]]+\]/,
      rounded: /\([^)]+\)/,
      stadium: /\(\[[^\]]+\]\)/,
      circle: /\(\([^)]+\)\)/,
      asymmetric: />[^\]]+\]/,
      rhombus: /\{[^}]+\}/,
      hexagon: /\{\{[^}]+\}\}/,
      parallelogram: /\[\/[^\/]+\/\]/,
      trapezoid: /\[\\[^\/]+\/\]/,
      database: /\[\([^)]+\)\]/
    };
  }

  /**
   * Validate Mermaid syntax
   * @param {string} mermaidCode - Mermaid diagram code
   * @returns {Object} Validation result
   */
  validate(mermaidCode) {
    const errors = [];
    const warnings = [];
    const suggestions = [];

    // Basic checks
    if (!mermaidCode || typeof mermaidCode !== 'string') {
      return {
        valid: false,
        errors: ['Invalid input: mermaidCode must be a non-empty string'],
        warnings: [],
        suggestions: []
      };
    }

    const lines = mermaidCode.trim().split('\n');

    if (lines.length === 0) {
      return {
        valid: false,
        errors: ['Empty diagram'],
        warnings: [],
        suggestions: ['Add at least one diagram declaration']
      };
    }

    // Check diagram type
    const firstLine = lines[0].trim();
    const diagramType = this._extractDiagramType(firstLine);

    if (!diagramType) {
      errors.push(`Invalid diagram type: "${firstLine}"`);
      suggestions.push(`Start with one of: ${this.diagramTypes.join(', ')}`);
      return { valid: false, errors, warnings, suggestions };
    }

    // Validate based on diagram type
    switch (diagramType) {
      case 'flowchart':
      case 'graph':
        this._validateFlowchart(lines, errors, warnings, suggestions);
        break;
      case 'sequenceDiagram':
        this._validateSequence(lines, errors, warnings, suggestions);
        break;
      case 'erDiagram':
        this._validateERD(lines, errors, warnings, suggestions);
        break;
      case 'stateDiagram':
      case 'stateDiagram-v2':
        this._validateState(lines, errors, warnings, suggestions);
        break;
      default:
        warnings.push(`Validation for ${diagramType} not fully implemented`);
    }

    // Common syntax checks
    this._checkCommonIssues(lines, errors, warnings, suggestions);

    return {
      valid: errors.length === 0,
      diagramType,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * Extract diagram type from first line
   * @private
   */
  _extractDiagramType(line) {
    for (const type of this.diagramTypes) {
      if (line.startsWith(type)) {
        return type;
      }
    }
    return null;
  }

  /**
   * Validate flowchart syntax
   * @private
   */
  _validateFlowchart(lines, errors, warnings, suggestions) {
    const firstLine = lines[0].trim();
    const parts = firstLine.split(/\s+/);

    // Check direction
    if (parts.length > 1) {
      const direction = parts[1];
      if (!this.flowchartDirections.includes(direction)) {
        errors.push(`Invalid flowchart direction: "${direction}"`);
        suggestions.push(`Valid directions: ${this.flowchartDirections.join(', ')}`);
      }
    }

    // Check nodes and edges
    const nodeIds = new Set();
    const edgePattern = /(\w+)\s*(-->|---|-\.-|==>)\s*(\w+)/;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip comments and empty lines
      if (line.startsWith('%%') || line === '') continue;

      // Check for node declaration
      const nodeMatch = line.match(/^\s*(\w+)(\[|\(|\{|\>)/);
      if (nodeMatch) {
        const nodeId = nodeMatch[1];
        nodeIds.add(nodeId);

        // Check for valid shape closure
        const hasValidShape = Object.values(this.nodeShapes).some(pattern =>
          line.match(pattern)
        );

        if (!hasValidShape && !line.includes(':::')) {
          warnings.push(`Line ${i + 1}: Potentially malformed node shape`);
          suggestions.push('Ensure node shapes are properly closed (e.g., [text], (text), {text})');
        }
      }

      // Check for edge declaration
      const edgeMatch = line.match(edgePattern);
      if (edgeMatch) {
        const [, from, , to] = edgeMatch;
        nodeIds.add(from);
        nodeIds.add(to);
      }

      // Check for subgraph
      if (line.includes('subgraph')) {
        const subgraphMatch = line.match(/subgraph\s+(\w+)/);
        if (!subgraphMatch) {
          errors.push(`Line ${i + 1}: Malformed subgraph declaration`);
          suggestions.push('Format: subgraph id["label"]');
        }
      }
    }

    if (nodeIds.size === 0) {
      warnings.push('No nodes defined in flowchart');
      suggestions.push('Add at least one node definition');
    }
  }

  /**
   * Validate sequence diagram syntax
   * @private
   */
  _validateSequence(lines, errors, warnings, suggestions) {
    const participants = new Set();
    const actors = new Set();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip comments and empty lines
      if (line.startsWith('%%') || line === '') continue;

      // Check participant/actor declarations
      if (line.startsWith('participant') || line.startsWith('actor')) {
        const match = line.match(/(participant|actor)\s+(\w+)\s+as\s+(.+)/);
        if (!match) {
          errors.push(`Line ${i + 1}: Malformed participant/actor declaration`);
          suggestions.push('Format: participant ID as Label');
        } else {
          const [, type, id] = match;
          if (type === 'participant') {
            participants.add(id);
          } else {
            actors.add(id);
          }
        }
      }

      // Check message syntax
      if (line.includes('->>') || line.includes('-->>') || line.includes('->') || line.includes('-->')) {
        const messagePattern = /(\w+)\s*(--?>>?|--?>)\s*(\w+)\s*:\s*(.+)/;
        const match = line.match(messagePattern);

        if (!match) {
          errors.push(`Line ${i + 1}: Malformed message syntax`);
          suggestions.push('Format: From->>To: Message text');
        } else {
          const [, from, , to] = match;

          // Check if participants are declared
          if (!participants.has(from) && !actors.has(from)) {
            warnings.push(`Line ${i + 1}: Undeclared participant "${from}"`);
            suggestions.push(`Add: participant ${from} as ${from}`);
          }
          if (!participants.has(to) && !actors.has(to)) {
            warnings.push(`Line ${i + 1}: Undeclared participant "${to}"`);
            suggestions.push(`Add: participant ${to} as ${to}`);
          }
        }
      }

      // Check note syntax
      if (line.startsWith('Note')) {
        const notePattern = /Note\s+(left of|right of|over)\s+(\w+)\s*:\s*(.+)/;
        if (!line.match(notePattern)) {
          errors.push(`Line ${i + 1}: Malformed note syntax`);
          suggestions.push('Format: Note left of/right of/over Participant: Text');
        }
      }
    }

    if (participants.size === 0 && actors.size === 0) {
      warnings.push('No participants or actors defined');
      suggestions.push('Add at least two participants for a meaningful sequence');
    }
  }

  /**
   * Validate ERD syntax
   * @private
   */
  _validateERD(lines, errors, warnings, suggestions) {
    const entities = new Set();
    let inEntity = false;
    let currentEntity = null;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip comments and empty lines
      if (line.startsWith('%%') || line === '') continue;

      // Check entity declaration
      if (line.match(/^\w+\s*\{$/)) {
        inEntity = true;
        currentEntity = line.replace(/\s*\{/, '');
        entities.add(currentEntity);
      } else if (line === '}') {
        inEntity = false;
        currentEntity = null;
      } else if (inEntity) {
        // Check attribute syntax
        const attrPattern = /^\s*(\w+)\s+(\w+)(\s+PK)?(\s+FK)?/;
        if (!line.match(attrPattern)) {
          errors.push(`Line ${i + 1}: Malformed attribute in entity "${currentEntity}"`);
          suggestions.push('Format: type name [PK] [FK]');
        }
      } else {
        // Check relationship syntax
        const relPattern = /(\w+)\s+([\|\}][\|\o]--[\|\o]?[\|\{])\s+(\w+)(\s*:\s*"[^"]+"\s*)?/;
        const match = line.match(relPattern);

        if (match) {
          const [, from, , to] = match;

          // Check if entities are declared
          if (!entities.has(from)) {
            warnings.push(`Line ${i + 1}: Undeclared entity "${from}" in relationship`);
          }
          if (!entities.has(to)) {
            warnings.push(`Line ${i + 1}: Undeclared entity "${to}" in relationship`);
          }
        } else if (line.length > 0) {
          errors.push(`Line ${i + 1}: Malformed relationship syntax`);
          suggestions.push('Format: Entity1 ||--o{ Entity2 : "label"');
        }
      }
    }

    if (entities.size === 0) {
      warnings.push('No entities defined in ERD');
      suggestions.push('Add at least one entity with attributes');
    }
  }

  /**
   * Validate state diagram syntax
   * @private
   */
  _validateState(lines, errors, warnings, suggestions) {
    const states = new Set(['[*]']); // Start/end state
    let inComposite = false;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip comments and empty lines
      if (line.startsWith('%%') || line === '') continue;

      // Check state declaration
      const statePattern = /^(\w+)\s*:\s*(.+)/;
      const stateMatch = line.match(statePattern);

      if (stateMatch) {
        const [, stateId] = stateMatch;
        states.add(stateId);
      }

      // Check transition
      const transitionPattern = /(\w+|\[\*\])\s*-->\s*(\w+|\[\*\])(\s*:\s*(.+))?/;
      const transMatch = line.match(transitionPattern);

      if (transMatch) {
        const [, from, to] = transMatch;
        states.add(from);
        states.add(to);
      }

      // Check composite state
      if (line.startsWith('state')) {
        const compositePattern = /state\s+"[^"]+"\s+as\s+(\w+)\s*\{/;
        if (line.match(compositePattern)) {
          inComposite = true;
        } else if (!line.match(/state\s+\w+\s*:\s*.+/)) {
          errors.push(`Line ${i + 1}: Malformed state declaration`);
          suggestions.push('Format: state "Label" as ID { ... }');
        }
      }

      if (line === '}') {
        inComposite = false;
      }
    }

    if (states.size <= 1) {
      warnings.push('Very few states defined');
      suggestions.push('Add more states and transitions for meaningful diagram');
    }
  }

  /**
   * Check common syntax issues
   * @private
   */
  _checkCommonIssues(lines, errors, warnings, suggestions) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for unbalanced brackets
      const openBrackets = (line.match(/[\[\{\(]/g) || []).length;
      const closeBrackets = (line.match(/[\]\}\)]/g) || []).length;

      if (openBrackets !== closeBrackets) {
        warnings.push(`Line ${i + 1}: Possibly unbalanced brackets`);
      }

      // Check for unescaped special characters in labels
      if (line.includes('"') && !line.match(/\\"/) && !line.match(/"[^"]*"/)) {
        warnings.push(`Line ${i + 1}: Unescaped quote character - may cause syntax error`);
        suggestions.push('Escape quotes in labels: \\" or use single quotes');
      }

      // Check for very long lines (potential readability issue)
      if (line.length > 200) {
        warnings.push(`Line ${i + 1}: Very long line (${line.length} chars) - consider breaking into multiple lines`);
      }
    }
  }

  /**
   * Suggest fixes for common errors
   * @param {Object} validationResult - Result from validate()
   * @returns {Array} Array of fix suggestions
   */
  suggestFixes(validationResult) {
    if (validationResult.valid) {
      return ['No fixes needed - diagram is valid'];
    }

    const fixes = [];

    // Provide specific fixes based on error types
    for (const error of validationResult.errors) {
      if (error.includes('Invalid diagram type')) {
        fixes.push('Fix: Start with a valid diagram type (e.g., flowchart TB, sequenceDiagram, erDiagram)');
      }

      if (error.includes('Malformed node shape')) {
        fixes.push('Fix: Ensure node shapes are properly closed: [rect], (round), {diamond}');
      }

      if (error.includes('Malformed message')) {
        fixes.push('Fix: Use correct message syntax: A->>B: Message text');
      }

      if (error.includes('Malformed relationship')) {
        fixes.push('Fix: Use correct ERD relationship: Entity1 ||--o{ Entity2 : "label"');
      }

      if (error.includes('Undeclared participant')) {
        fixes.push('Fix: Declare all participants before using: participant A as Alice');
      }
    }

    return fixes.length > 0 ? fixes : validationResult.suggestions;
  }

  /**
   * Get detailed validation report
   * @param {string} mermaidCode - Mermaid diagram code
   * @returns {Object} Detailed report
   */
  getDetailedReport(mermaidCode) {
    const result = this.validate(mermaidCode);
    const fixes = this.suggestFixes(result);

    return {
      ...result,
      fixes,
      summary: this._generateSummary(result),
      lineCount: mermaidCode.split('\n').length
    };
  }

  /**
   * Generate validation summary
   * @private
   */
  _generateSummary(result) {
    if (result.valid) {
      return `✓ Valid ${result.diagramType || 'diagram'} (${result.warnings.length} warnings)`;
    } else {
      return `✗ Invalid diagram (${result.errors.length} errors, ${result.warnings.length} warnings)`;
    }
  }
}

module.exports = MermaidValidator;
