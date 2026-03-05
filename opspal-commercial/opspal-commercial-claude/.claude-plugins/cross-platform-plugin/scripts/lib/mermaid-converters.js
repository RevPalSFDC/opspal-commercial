/**
 * Mermaid Data Converters
 *
 * Convert various data formats (JSON, CSV, Salesforce metadata, HubSpot workflows)
 * into Mermaid diagram syntax.
 *
 * @module mermaid-converters
 * @version 1.0.0
 *
 * @example
 * const { salesforceMetadataToERD, jsonToFlowchart } = require('./mermaid-converters');
 * const MermaidGenerator = require('./mermaid-generator');
 *
 * const metadata = await fetchSalesforceMetadata();
 * const erd = salesforceMetadataToERD(metadata);
 * const generator = new MermaidGenerator();
 * await generator.saveAs('/path/to/diagram', erd);
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Convert Salesforce metadata to ERD
 * @param {Object} metadata - Salesforce object describe result
 * @param {Array} relatedObjects - Additional objects to include
 * @returns {string} Mermaid ERD syntax
 */
function salesforceMetadataToERD(metadata, relatedObjects = []) {
  const generator = require('./mermaid-generator');
  const gen = new generator();
  const erd = gen.erd({ title: `${metadata.name} Data Model` });

  // Add primary entity
  const primaryAttributes = metadata.fields.map(field => ({
    type: mapSalesforceFieldType(field.type),
    name: field.name
  }));

  erd.addEntity(metadata.name, primaryAttributes, { primaryKey: 'Id' });

  // Add related objects and relationships
  const relationshipFields = metadata.fields.filter(
    f => f.type === 'reference' || f.type === 'lookup' || f.type === 'masterdetail'
  );

  for (const relField of relationshipFields) {
    const referencedObject = relField.referenceTo ? relField.referenceTo[0] : null;

    if (referencedObject) {
      // Check if we have metadata for referenced object
      const relatedMetadata = relatedObjects.find(o => o.name === referencedObject);

      if (relatedMetadata) {
        // Add related entity
        const relatedAttributes = relatedMetadata.fields.map(field => ({
          type: mapSalesforceFieldType(field.type),
          name: field.name
        }));

        erd.addEntity(referencedObject, relatedAttributes, { primaryKey: 'Id' });
      }

      // Add relationship
      const relationshipType = relField.type === 'masterdetail' ? 'many-to-one' : 'zero-or-many-to-one';
      erd.addRelationship(
        metadata.name,
        referencedObject,
        relationshipType,
        relField.relationshipName || relField.name
      );
    }
  }

  return erd.generate();
}

/**
 * Map Salesforce field types to ERD types
 * @private
 */
function mapSalesforceFieldType(sfType) {
  const typeMapping = {
    id: 'string',
    string: 'string',
    textarea: 'text',
    picklist: 'string',
    multipicklist: 'string',
    email: 'string',
    phone: 'string',
    url: 'string',
    reference: 'string',
    boolean: 'boolean',
    currency: 'decimal',
    double: 'decimal',
    percent: 'decimal',
    int: 'int',
    date: 'date',
    datetime: 'datetime',
    time: 'time'
  };

  return typeMapping[sfType.toLowerCase()] || 'string';
}

/**
 * Convert JSON data to flowchart
 * @param {Object} data - JSON with nodes and edges
 * @returns {string} Mermaid flowchart syntax
 */
function jsonToFlowchart(data) {
  const generator = require('./mermaid-generator');
  const gen = new generator();
  const flowchart = gen.flowchart({
    direction: data.direction || 'TB',
    title: data.title || ''
  });

  // Add nodes
  if (data.nodes) {
    for (const node of data.nodes) {
      flowchart.addNode(node.id, node.label, {
        shape: node.shape || 'rectangle',
        cssClass: node.class
      });
    }
  }

  // Add edges
  if (data.edges) {
    for (const edge of data.edges) {
      flowchart.addEdge(edge.from, edge.to, edge.label, {
        type: edge.type || 'solid'
      });
    }
  }

  // Add subgraphs
  if (data.subgraphs) {
    for (const subgraph of data.subgraphs) {
      flowchart.addSubgraph(subgraph.id, subgraph.label, builder => {
        if (subgraph.nodes) {
          for (const node of subgraph.nodes) {
            builder.addNode(node.id, node.label, { shape: node.shape || 'rectangle' });
          }
        }
        if (subgraph.edges) {
          for (const edge of subgraph.edges) {
            builder.addEdge(edge.from, edge.to, edge.label);
          }
        }
      });
    }
  }

  return flowchart.generate();
}

/**
 * Convert CSV to entity relationship diagram
 * @param {string} csvContent - CSV content
 * @param {Object} options - Conversion options
 * @returns {string} Mermaid ERD syntax
 */
function csvToERD(csvContent, options = {}) {
  const { entityName = 'Entity', delimiter = ',', hasHeader = true } = options;

  const generator = require('./mermaid-generator');
  const gen = new generator();
  const erd = gen.erd({ title: `${entityName} Data Model` });

  // Parse CSV
  const lines = csvContent.trim().split('\n');
  const headers = hasHeader ? lines[0].split(delimiter) : [];

  if (headers.length === 0) {
    throw new Error('CSV must have headers to generate ERD');
  }

  // Infer field types from first data row
  const firstDataRow = hasHeader ? lines[1] : lines[0];
  const values = firstDataRow.split(delimiter);

  const attributes = headers.map((header, index) => {
    const value = values[index];
    const type = inferTypeFromValue(value);

    return {
      type,
      name: header.trim()
    };
  });

  erd.addEntity(entityName, attributes, { primaryKey: attributes[0].name });

  return erd.generate();
}

/**
 * Infer data type from value
 * @private
 */
function inferTypeFromValue(value) {
  if (!value || value === 'null') return 'string';

  // Check for number
  if (!isNaN(value)) {
    return value.includes('.') ? 'decimal' : 'int';
  }

  // Check for date
  if (Date.parse(value) && value.match(/\d{4}-\d{2}-\d{2}/)) {
    return 'date';
  }

  // Check for boolean
  if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
    return 'boolean';
  }

  return 'string';
}

/**
 * Convert HubSpot workflow to flowchart
 * @param {Object} workflow - HubSpot workflow JSON
 * @returns {string} Mermaid flowchart syntax
 */
function hubspotWorkflowToFlowchart(workflow) {
  const generator = require('./mermaid-generator');
  const gen = new generator();
  const flowchart = gen.flowchart({
    direction: 'TB',
    title: workflow.name || 'HubSpot Workflow'
  });

  // Add enrollment trigger
  flowchart.addNode('trigger', workflow.type || 'Workflow Trigger', { shape: 'circle' });

  // Process actions
  if (workflow.actions) {
    let prevNodeId = 'trigger';

    for (let i = 0; i < workflow.actions.length; i++) {
      const action = workflow.actions[i];
      const nodeId = `action${i}`;

      // Determine node shape based on action type
      let shape = 'rectangle';
      if (action.type === 'BRANCH') {
        shape = 'rhombus';
      } else if (action.type === 'DELAY') {
        shape = 'stadium';
      }

      flowchart.addNode(nodeId, action.label || action.type, { shape });
      flowchart.addEdge(prevNodeId, nodeId);

      // Handle branches
      if (action.type === 'BRANCH' && action.branches) {
        for (let j = 0; j < action.branches.length; j++) {
          const branch = action.branches[j];
          const branchId = `branch${i}_${j}`;

          // Process branch actions recursively
          if (branch.actions && branch.actions.length > 0) {
            flowchart.addNode(branchId, branch.label || `Branch ${j + 1}`, { shape: 'rectangle' });
            flowchart.addEdge(nodeId, branchId, branch.condition || '');
          }
        }
      }

      prevNodeId = nodeId;
    }

    // Add end node
    flowchart.addNode('end', 'Workflow Complete', { shape: 'circle' });
    flowchart.addEdge(prevNodeId, 'end');
  }

  return flowchart.generate();
}

/**
 * Convert dependency graph to flowchart
 * @param {Object} dependencies - Dependency graph data
 * @returns {string} Mermaid flowchart syntax
 */
function dependencyGraphToFlowchart(dependencies) {
  const generator = require('./mermaid-generator');
  const gen = new generator();
  const flowchart = gen.flowchart({
    direction: 'TB',
    title: dependencies.title || 'Dependency Graph'
  });

  // Add nodes
  if (dependencies.nodes) {
    for (const node of dependencies.nodes) {
      const shape = node.circular ? 'hexagon' : 'rectangle';
      flowchart.addNode(node.id, node.name, { shape });

      // Highlight circular dependencies
      if (node.circular) {
        flowchart.addStyle(node.id, { fill: '#ff6b6b', stroke: '#c92a2a' });
      }
    }
  }

  // Add edges (dependencies)
  if (dependencies.edges) {
    for (const edge of dependencies.edges) {
      const edgeType = edge.required ? 'solid' : 'dotted';
      flowchart.addEdge(edge.from, edge.to, edge.label, { type: edgeType });
    }
  }

  return flowchart.generate();
}

/**
 * Convert state machine to state diagram
 * @param {Object} stateMachine - State machine definition
 * @returns {string} Mermaid state diagram syntax
 */
function stateMachineToStateDiagram(stateMachine) {
  const generator = require('./mermaid-generator');
  const gen = new generator();
  const state = gen.state({
    title: stateMachine.title || 'State Machine',
    direction: stateMachine.direction || 'LR'
  });

  // Add states
  if (stateMachine.states) {
    for (const stateData of stateMachine.states) {
      state.addState(stateData.id, stateData.label, {
        description: stateData.description
      });
    }
  }

  // Add transitions
  if (stateMachine.transitions) {
    for (const transition of stateMachine.transitions) {
      state.addTransition(transition.from, transition.to, transition.label);
    }
  }

  // Add composite states
  if (stateMachine.compositeStates) {
    for (const composite of stateMachine.compositeStates) {
      state.addCompositeState(composite.id, composite.label, builder => {
        if (composite.states) {
          for (const subState of composite.states) {
            builder.addState(subState.id, subState.label);
          }
        }
        if (composite.transitions) {
          for (const transition of composite.transitions) {
            builder.addTransition(transition.from, transition.to, transition.label);
          }
        }
      });
    }
  }

  return state.generate();
}

/**
 * Convert API spec to sequence diagram
 * @param {Object} apiSpec - API specification (OpenAPI, custom format)
 * @returns {string} Mermaid sequence diagram syntax
 */
function apiSpecToSequence(apiSpec) {
  const generator = require('./mermaid-generator');
  const gen = new generator();
  const sequence = gen.sequence({
    title: apiSpec.title || 'API Sequence',
    autonumber: apiSpec.autonumber !== false
  });

  // Add participants
  if (apiSpec.participants) {
    for (const participant of apiSpec.participants) {
      sequence.addParticipant(participant.id, participant.name, participant.type || 'participant');
    }
  }

  // Add interactions
  if (apiSpec.interactions) {
    for (const interaction of apiSpec.interactions) {
      sequence.addMessage(
        interaction.from,
        interaction.to,
        interaction.message,
        {
          type: interaction.type || 'solid',
          activate: interaction.activate,
          deactivate: interaction.deactivate
        }
      );

      // Add note if provided
      if (interaction.note) {
        sequence.addNote('right of', interaction.to, interaction.note);
      }
    }
  }

  return sequence.generate();
}

/**
 * Load and convert data file to diagram
 * @param {string} filePath - Path to data file
 * @param {string} diagramType - Type of diagram to generate
 * @returns {Promise<string>} Mermaid diagram syntax
 */
async function fileToDiagram(filePath, diagramType) {
  const content = await fs.readFile(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();

  // Parse file content
  let data;
  if (ext === '.json') {
    data = JSON.parse(content);
  } else if (ext === '.csv') {
    data = { csvContent: content };
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  // Auto-detect diagram type if not provided
  if (!diagramType) {
    const MermaidGenerator = require('./mermaid-generator');
    diagramType = MermaidGenerator.detectDiagramType(data);
  }

  // Convert based on diagram type
  switch (diagramType) {
    case 'flowchart':
      return jsonToFlowchart(data);
    case 'erd':
      if (ext === '.csv') {
        return csvToERD(content);
      } else if (data.entities || data.objects) {
        // Salesforce metadata format
        return salesforceMetadataToERD(data);
      }
      throw new Error('Invalid data format for ERD');
    case 'sequence':
      return apiSpecToSequence(data);
    case 'state':
      return stateMachineToStateDiagram(data);
    default:
      throw new Error(`Unsupported diagram type: ${diagramType}`);
  }
}

module.exports = {
  salesforceMetadataToERD,
  jsonToFlowchart,
  csvToERD,
  hubspotWorkflowToFlowchart,
  dependencyGraphToFlowchart,
  stateMachineToStateDiagram,
  apiSpecToSequence,
  fileToDiagram,
  // Helper functions
  mapSalesforceFieldType,
  inferTypeFromValue
};
