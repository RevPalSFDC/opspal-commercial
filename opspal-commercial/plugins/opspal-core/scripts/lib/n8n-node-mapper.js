#!/usr/bin/env node

/**
 * n8n Node Mapper
 *
 * Maps Salesforce and HubSpot objects/properties to n8n node configurations.
 * Handles field mapping, type conversion, and platform-specific requirements.
 *
 * Features:
 * - Auto-detect field types and map to n8n parameters
 * - Generate node configurations from object metadata
 * - Support for relationship fields and lookups
 * - Handle platform-specific naming conventions
 *
 * Usage:
 *   const N8nNodeMapper = require('./n8n-node-mapper');
 *   const mapper = new N8nNodeMapper();
 *   const nodeConfig = mapper.mapSalesforceObject('Lead', metadata);
 *
 * CLI Commands:
 *   node n8n-node-mapper.js sf-to-n8n <object>   - Map SF object to n8n config
 *   node n8n-node-mapper.js hs-to-n8n <object>   - Map HS object to n8n config
 *   node n8n-node-mapper.js field-map <sf> <hs>  - Generate field mapping
 */

const fs = require('fs');
const path = require('path');

class N8nNodeMapper {
  constructor(options = {}) {
    this.options = {
      includeSystemFields: options.includeSystemFields || false,
      includeFormulaFields: options.includeFormulaFields || false,
      ...options
    };

    // Load field mappings configuration
    this.mappingsPath = options.mappingsPath || path.join(
      __dirname, '../../config/n8n-sf-hs-mappings.json'
    );
    this.mappings = this.loadMappings();

    // Salesforce field type to n8n type mapping
    this.sfTypeToN8n = {
      'string': 'string',
      'textarea': 'string',
      'email': 'string',
      'phone': 'string',
      'url': 'string',
      'picklist': 'options',
      'multipicklist': 'multiOptions',
      'boolean': 'boolean',
      'currency': 'number',
      'double': 'number',
      'int': 'number',
      'percent': 'number',
      'date': 'dateTime',
      'datetime': 'dateTime',
      'time': 'string',
      'reference': 'string',
      'id': 'string',
      'address': 'json',
      'location': 'json'
    };

    // HubSpot property type to n8n type mapping
    this.hsTypeToN8n = {
      'string': 'string',
      'number': 'number',
      'date': 'dateTime',
      'datetime': 'dateTime',
      'enumeration': 'options',
      'bool': 'boolean',
      'phone_number': 'string',
      'json': 'json'
    };
  }

  /**
   * Load field mappings from configuration file
   */
  loadMappings() {
    try {
      if (fs.existsSync(this.mappingsPath)) {
        const content = fs.readFileSync(this.mappingsPath, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn(`Warning: Could not load mappings: ${error.message}`);
    }

    return this.getDefaultMappings();
  }

  /**
   * Get default field mappings
   */
  getDefaultMappings() {
    return {
      salesforceToHubspot: {
        standard: {
          'FirstName': 'firstname',
          'LastName': 'lastname',
          'Email': 'email',
          'Phone': 'phone',
          'Company': 'company',
          'Title': 'jobtitle',
          'Website': 'website'
        }
      },
      hubspotToSalesforce: {
        standard: {
          'firstname': 'FirstName',
          'lastname': 'LastName',
          'email': 'Email',
          'phone': 'Phone',
          'company': 'Company',
          'jobtitle': 'Title',
          'website': 'Website'
        }
      }
    };
  }

  /**
   * Map Salesforce object metadata to n8n node configuration
   * @param {string} objectName - Salesforce object API name
   * @param {Object} metadata - Salesforce object metadata
   * @param {string} operation - CRUD operation (create, update, get, query)
   * @returns {Object} n8n node configuration
   */
  mapSalesforceObject(objectName, metadata, operation = 'create') {
    const fields = metadata.fields || [];

    // Filter fields based on operation and options
    const mappableFields = fields.filter(field => {
      // Skip system fields unless explicitly included
      if (!this.options.includeSystemFields && this.isSystemField(field.name)) {
        return false;
      }

      // Skip formula fields for write operations
      if (!this.options.includeFormulaFields && field.calculated) {
        return false;
      }

      // Check field permissions for operation
      if (operation === 'create' && !field.createable) return false;
      if (operation === 'update' && !field.updateable) return false;

      return true;
    });

    // Build n8n additionalFields configuration
    const additionalFields = {};
    mappableFields.forEach(field => {
      const n8nType = this.sfTypeToN8n[field.type.toLowerCase()] || 'string';

      additionalFields[field.name] = {
        type: n8nType,
        label: field.label,
        description: field.inlineHelpText || '',
        required: !field.nillable && !field.defaultedOnCreate
      };

      // Add picklist values if available
      if (field.picklistValues && field.picklistValues.length > 0) {
        additionalFields[field.name].options = field.picklistValues
          .filter(v => v.active)
          .map(v => ({
            name: v.label,
            value: v.value
          }));
      }

      // Add relationship info if reference field
      if (field.type === 'reference' && field.referenceTo) {
        additionalFields[field.name].referenceTo = field.referenceTo;
        additionalFields[field.name].relationshipName = field.relationshipName;
      }
    });

    return {
      type: 'n8n-nodes-base.salesforce',
      operation,
      resource: objectName,
      additionalFields,
      metadata: {
        objectName,
        fieldCount: mappableFields.length,
        hasRelationships: fields.some(f => f.type === 'reference')
      }
    };
  }

  /**
   * Map HubSpot object properties to n8n node configuration
   * @param {string} objectType - HubSpot object type (contacts, companies, deals)
   * @param {Array} properties - HubSpot property definitions
   * @param {string} operation - CRUD operation
   * @returns {Object} n8n node configuration
   */
  mapHubspotObject(objectType, properties, operation = 'create') {
    const additionalFields = {};

    properties.forEach(prop => {
      // Skip read-only properties for write operations
      if ((operation === 'create' || operation === 'update') && prop.readOnlyValue) {
        return;
      }

      const n8nType = this.hsTypeToN8n[prop.type] || 'string';

      additionalFields[prop.name] = {
        type: n8nType,
        label: prop.label,
        description: prop.description || '',
        required: false // HubSpot doesn't typically have required fields via API
      };

      // Add options for enumeration type
      if (prop.type === 'enumeration' && prop.options) {
        additionalFields[prop.name].options = prop.options.map(opt => ({
          name: opt.label,
          value: opt.value
        }));
      }
    });

    return {
      type: 'n8n-nodes-base.hubspot',
      operation,
      resource: this.normalizeHsResourceName(objectType),
      additionalFields,
      metadata: {
        objectType,
        propertyCount: Object.keys(additionalFields).length
      }
    };
  }

  /**
   * Generate field mapping between Salesforce and HubSpot
   * @param {Object} sfMetadata - Salesforce object metadata
   * @param {Array} hsProperties - HubSpot property definitions
   * @param {string} direction - 'sfToHs' or 'hsToSf'
   * @returns {Object} Field mapping configuration
   */
  generateFieldMapping(sfMetadata, hsProperties, direction = 'sfToHs') {
    const mapping = {};
    const sfFields = sfMetadata.fields || [];

    if (direction === 'sfToHs') {
      // Map Salesforce fields to HubSpot properties
      sfFields.forEach(sfField => {
        // Check if there's a standard mapping
        const standardMapping = this.mappings.salesforceToHubspot?.standard?.[sfField.name];
        if (standardMapping) {
          mapping[sfField.name] = {
            target: standardMapping,
            source: 'standard',
            expression: `={{ $json.${sfField.name} }}`
          };
          return;
        }

        // Try to find matching HubSpot property by name similarity
        const hsMatch = this.findMatchingHsProperty(sfField, hsProperties);
        if (hsMatch) {
          mapping[sfField.name] = {
            target: hsMatch.name,
            source: 'auto-matched',
            confidence: hsMatch.confidence,
            expression: `={{ $json.${sfField.name} }}`
          };
        }
      });
    } else {
      // Map HubSpot properties to Salesforce fields
      hsProperties.forEach(hsProp => {
        // Check if there's a standard mapping
        const standardMapping = this.mappings.hubspotToSalesforce?.standard?.[hsProp.name];
        if (standardMapping) {
          mapping[hsProp.name] = {
            target: standardMapping,
            source: 'standard',
            expression: `={{ $json.properties.${hsProp.name} }}`
          };
          return;
        }

        // Try to find matching Salesforce field
        const sfMatch = this.findMatchingSfField(hsProp, sfFields);
        if (sfMatch) {
          mapping[hsProp.name] = {
            target: sfMatch.name,
            source: 'auto-matched',
            confidence: sfMatch.confidence,
            expression: `={{ $json.properties.${hsProp.name} }}`
          };
        }
      });
    }

    return {
      direction,
      mappingCount: Object.keys(mapping).length,
      mapping
    };
  }

  /**
   * Find matching HubSpot property for Salesforce field
   */
  findMatchingHsProperty(sfField, hsProperties) {
    const sfName = sfField.name.toLowerCase();
    const sfLabel = sfField.label.toLowerCase();

    for (const hsProp of hsProperties) {
      const hsName = hsProp.name.toLowerCase();
      const hsLabel = (hsProp.label || '').toLowerCase();

      // Exact name match
      if (sfName === hsName) {
        return { name: hsProp.name, confidence: 1.0 };
      }

      // Label match
      if (sfLabel === hsLabel) {
        return { name: hsProp.name, confidence: 0.9 };
      }

      // Partial name match (camelCase vs snake_case)
      const normalizedSf = sfName.replace(/_/g, '');
      const normalizedHs = hsName.replace(/_/g, '');
      if (normalizedSf === normalizedHs) {
        return { name: hsProp.name, confidence: 0.8 };
      }
    }

    return null;
  }

  /**
   * Find matching Salesforce field for HubSpot property
   */
  findMatchingSfField(hsProp, sfFields) {
    const hsName = hsProp.name.toLowerCase();
    const hsLabel = (hsProp.label || '').toLowerCase();

    for (const sfField of sfFields) {
      const sfName = sfField.name.toLowerCase();
      const sfLabel = sfField.label.toLowerCase();

      // Exact name match
      if (hsName === sfName) {
        return { name: sfField.name, confidence: 1.0 };
      }

      // Label match
      if (hsLabel === sfLabel) {
        return { name: sfField.name, confidence: 0.9 };
      }

      // Partial match
      const normalizedHs = hsName.replace(/_/g, '');
      const normalizedSf = sfName.replace(/_/g, '');
      if (normalizedHs === normalizedSf) {
        return { name: sfField.name, confidence: 0.8 };
      }
    }

    return null;
  }

  /**
   * Generate n8n Set node for field transformation
   * @param {Object} mapping - Field mapping from generateFieldMapping
   * @returns {Object} n8n Set node configuration
   */
  generateSetNode(mapping) {
    const assignments = Object.entries(mapping.mapping).map(([source, config]) => ({
      name: config.target,
      value: config.expression,
      type: 'string'
    }));

    return {
      type: 'n8n-nodes-base.set',
      typeVersion: 2,
      parameters: {
        mode: 'manual',
        duplicateItem: false,
        assignments: {
          assignments
        },
        options: {}
      }
    };
  }

  /**
   * Build complete trigger node from Salesforce object
   */
  buildSfTriggerNode(objectName, triggerType = 'recordCreated', credentialName) {
    return {
      type: 'n8n-nodes-base.salesforceTrigger',
      typeVersion: 1,
      parameters: {
        triggerOn: triggerType,
        sobject: objectName,
        conditions: []
      },
      credentials: {
        salesforceOAuth2Api: { name: credentialName }
      }
    };
  }

  /**
   * Build complete action node from HubSpot object
   */
  buildHsActionNode(objectType, operation, credentialName, additionalFields = {}) {
    return {
      type: 'n8n-nodes-base.hubspot',
      typeVersion: 1,
      parameters: {
        resource: this.normalizeHsResourceName(objectType),
        operation,
        ...additionalFields
      },
      credentials: {
        hubspotApi: { name: credentialName }
      }
    };
  }

  /**
   * Check if field is a system field
   */
  isSystemField(fieldName) {
    const systemFields = [
      'Id', 'IsDeleted', 'CreatedById', 'CreatedDate',
      'LastModifiedById', 'LastModifiedDate', 'SystemModstamp',
      'LastActivityDate', 'LastViewedDate', 'LastReferencedDate'
    ];
    return systemFields.includes(fieldName);
  }

  /**
   * Normalize HubSpot resource name
   */
  normalizeHsResourceName(objectType) {
    const resourceMap = {
      'contacts': 'contact',
      'companies': 'company',
      'deals': 'deal',
      'tickets': 'ticket',
      'products': 'product',
      'line_items': 'lineItem'
    };
    return resourceMap[objectType.toLowerCase()] || objectType;
  }

  /**
   * Get expression for field value in n8n
   */
  getFieldExpression(fieldName, platform = 'salesforce') {
    if (platform === 'salesforce') {
      return `={{ $json.${fieldName} }}`;
    } else if (platform === 'hubspot') {
      return `={{ $json.properties.${fieldName} }}`;
    }
    return `={{ $json.${fieldName} }}`;
  }

  /**
   * Generate complete workflow from SF trigger to HS action
   */
  generateSfToHsWorkflow(config) {
    const {
      workflowName,
      sfObject,
      hsObject,
      sfCredential,
      hsCredential,
      triggerType = 'recordCreated',
      hsOperation = 'create',
      fieldMapping = {}
    } = config;

    const triggerId = 'sf-trigger';
    const transformId = 'transform-fields';
    const actionId = 'hs-action';

    const workflow = {
      name: workflowName,
      nodes: [
        {
          id: triggerId,
          name: `${sfObject} ${triggerType}`,
          ...this.buildSfTriggerNode(sfObject, triggerType, sfCredential),
          position: [250, 300]
        },
        {
          id: transformId,
          name: 'Map Fields',
          ...this.generateSetNode({ mapping: fieldMapping }),
          position: [500, 300]
        },
        {
          id: actionId,
          name: `${hsOperation} ${hsObject}`,
          ...this.buildHsActionNode(hsObject, hsOperation, hsCredential),
          position: [750, 300]
        }
      ],
      connections: {
        [triggerId]: {
          main: [[{ node: transformId, type: 'main', index: 0 }]]
        },
        [transformId]: {
          main: [[{ node: actionId, type: 'main', index: 0 }]]
        }
      },
      settings: { executionOrder: 'v1' },
      tags: ['salesforce', 'hubspot', 'sync', sfObject.toLowerCase()]
    };

    return workflow;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const mapper = new N8nNodeMapper();

  switch (command) {
    case 'sf-to-n8n': {
      const objectName = args[1];
      if (!objectName) {
        console.error('Usage: n8n-node-mapper.js sf-to-n8n <object>');
        process.exit(1);
      }

      // In practice, this would fetch real metadata from SF
      console.log(`\nMapping Salesforce object: ${objectName}`);
      console.log('Note: In production, use sfdc-field-analyzer to get real metadata\n');

      // Sample output structure
      const sampleConfig = {
        type: 'n8n-nodes-base.salesforce',
        operation: 'create',
        resource: objectName,
        additionalFields: {
          'note': 'Fetch actual metadata using sfdc-field-analyzer agent'
        }
      };

      console.log(JSON.stringify(sampleConfig, null, 2));
      break;
    }

    case 'hs-to-n8n': {
      const objectType = args[1];
      if (!objectType) {
        console.error('Usage: n8n-node-mapper.js hs-to-n8n <object>');
        process.exit(1);
      }

      console.log(`\nMapping HubSpot object: ${objectType}`);
      console.log('Note: In production, use HubSpot MCP to get real properties\n');

      const sampleConfig = {
        type: 'n8n-nodes-base.hubspot',
        operation: 'create',
        resource: mapper.normalizeHsResourceName(objectType),
        additionalFields: {
          'note': 'Fetch actual properties using HubSpot API'
        }
      };

      console.log(JSON.stringify(sampleConfig, null, 2));
      break;
    }

    case 'field-map': {
      const sfObject = args[1];
      const hsObject = args[2];

      if (!sfObject || !hsObject) {
        console.error('Usage: n8n-node-mapper.js field-map <sf-object> <hs-object>');
        process.exit(1);
      }

      console.log(`\nGenerating field mapping: ${sfObject} -> ${hsObject}`);
      console.log('Using standard mappings from configuration:\n');

      const standardMappings = mapper.mappings.salesforceToHubspot?.standard || {};
      console.log(JSON.stringify(standardMappings, null, 2));
      break;
    }

    default:
      console.log(`
n8n Node Mapper

Maps Salesforce/HubSpot objects to n8n node configurations.

Commands:
  sf-to-n8n <object>         Generate n8n config from SF object
  hs-to-n8n <object>         Generate n8n config from HS object
  field-map <sf> <hs>        Generate field mapping between platforms

Examples:
  node n8n-node-mapper.js sf-to-n8n Lead
  node n8n-node-mapper.js hs-to-n8n contacts
  node n8n-node-mapper.js field-map Lead contacts
`);
  }
}

// Export for programmatic use
module.exports = N8nNodeMapper;

// Run CLI if executed directly
if (require.main === module) {
  main().catch(console.error);
}
