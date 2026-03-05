/**
 * CPQ ERD Generator
 *
 * Generates Entity Relationship Diagrams (ERDs) for Salesforce CPQ objects.
 *
 * Features:
 * - Discovers CPQ objects (standard and custom)
 * - Maps relationships (lookup, master-detail, hierarchical)
 * - Identifies key fields for ERD display
 * - Generates layered Mermaid ERD diagrams
 *   - High-level: Objects and relationships only
 *   - Detailed: Objects with key fields and relationships
 *
 * Usage:
 *   const generator = new CPQERDGenerator(orgAlias, options);
 *   const erd = await generator.generateERD();
 *
 * @phase Phase 3: Build CPQ ERD Generator
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class CPQERDGenerator {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.options = {
      detailLevel: options.detailLevel || 'both', // 'high-level', 'detailed', 'both'
      outputDir: options.outputDir || './diagrams',
      saveAsMarkdown: options.saveAsMarkdown !== false,
      saveMermaidOnly: options.saveMermaidOnly || false,
      includeStandardObjects: options.includeStandardObjects !== false,
      maxFieldsPerObject: options.maxFieldsPerObject || 10,
      fieldCategories: options.fieldCategories || ['key', 'required', 'cpq-specific'],
      verbose: options.verbose || false
    };

    // Core CPQ objects to discover
    this.cpqObjectPatterns = [
      'SBQQ__Quote__c',
      'SBQQ__QuoteLine__c',
      'SBQQ__Subscription__c',
      'SBQQ__SubscriptionConsumptionRate__c',
      'SBQQ__PriceRule__c',
      'SBQQ__PriceAction__c',
      'SBQQ__PriceCondition__c',
      'SBQQ__ProductRule__c',
      'SBQQ__ProductAction__c',
      'SBQQ__ProductOption__c',
      'SBQQ__ConfigurationAttribute__c',
      'SBQQ__DiscountSchedule__c',
      'SBQQ__DiscountTier__c',
      'SBQQ__ContractedPrice__c',
      'SBQQ__QuoteDocument__c',
      'SBQQ__QuoteTemplate__c',
      'SBQQ__TemplateContent__c',
      'SBQQ__OrderItemConsumptionSchedule__c'
    ];

    // Standard objects commonly used in CPQ
    this.cpqStandardObjects = [
      'Product2',
      'PricebookEntry',
      'Pricebook2',
      'Opportunity',
      'OpportunityLineItem',
      'Account',
      'Contact',
      'Contract',
      'Order',
      'OrderItem',
      'Quote',
      'QuoteLineItem'
    ];

    this.objectCache = null;
    this.relationshipCache = null;
  }

  /**
   * Main entry point - generates CPQ ERD diagrams
   * @returns {Object} Generated diagram metadata
   */
  async generateERD(options = {}) {
    const detailLevel = options.detailLevel || this.options.detailLevel;

    // Discover CPQ objects and relationships
    const objects = await this._discoverCPQObjects();
    const relationships = await this._mapRelationships(objects);

    const result = {
      objects,        // Include discovered objects for downstream consumers
      relationships   // Include relationships for downstream consumers
    };

    if (detailLevel === 'high-level' || detailLevel === 'both') {
      result.highLevel = await this._generateHighLevelERD(objects, relationships);
    }

    if (detailLevel === 'detailed' || detailLevel === 'both') {
      result.detailed = await this._generateDetailedERD(objects, relationships);
    }

    return result;
  }

  /**
   * Discover CPQ objects in the org
   * @returns {Array} Array of CPQ object metadata
   */
  async _discoverCPQObjects() {
    if (this.objectCache) {
      return this.objectCache;
    }

    if (this.options.verbose) {
      console.log('Discovering CPQ objects...');
    }

    const objects = [];

    try {
      // Get all objects in org
      const query = `SELECT QualifiedApiName, Label, PluralLabel, IsCustomSetting FROM EntityDefinition WHERE IsCustomizable = true`;
      const result = this._executeQuery(query, { useToolingApi: true });

      const orgObjects = result.records || [];

      // Filter to CPQ objects
      for (const obj of orgObjects) {
        const apiName = obj.QualifiedApiName;

        // Check if it's a CPQ custom object
        if (apiName.startsWith('SBQQ__')) {
          objects.push({
            apiName,
            label: obj.Label,
            pluralLabel: obj.PluralLabel,
            type: 'cpq-custom',
            isCustomSetting: obj.IsCustomSetting
          });
        }
        // Check if it's a standard object used in CPQ
        else if (this.options.includeStandardObjects && this.cpqStandardObjects.includes(apiName)) {
          objects.push({
            apiName,
            label: obj.Label,
            pluralLabel: obj.PluralLabel,
            type: 'cpq-standard',
            isCustomSetting: false
          });
        }
      }

      if (this.options.verbose) {
        console.log(`Found ${objects.length} CPQ objects`);
      }

      // Get field metadata for each object
      for (const obj of objects) {
        obj.fields = await this._getObjectFields(obj.apiName);
      }

      this.objectCache = objects;
      return objects;

    } catch (error) {
      console.error('Error discovering CPQ objects:', error.message);
      return [];
    }
  }

  /**
   * Map Describe API field types to FieldDefinition types
   * @param {String} describeType - Describe API type (e.g., 'reference', 'string')
   * @returns {String} FieldDefinition type (e.g., 'Lookup', 'Text')
   */
  _mapDescribeTypeToFieldDefinitionType(describeType) {
    const typeMap = {
      'reference': 'Lookup',
      'string': 'Text',
      'textarea': 'LongTextArea',
      'picklist': 'Picklist',
      'multipicklist': 'MultiselectPicklist',
      'boolean': 'Checkbox',
      'currency': 'Currency',
      'date': 'Date',
      'datetime': 'DateTime',
      'double': 'Number',
      'int': 'Number',
      'percent': 'Percent',
      'phone': 'Phone',
      'email': 'Email',
      'url': 'Url',
      'id': 'Lookup'
    };

    return typeMap[describeType.toLowerCase()] || describeType;
  }

  /**
   * Determine if relationship is MasterDetail vs Lookup
   * @param {Object} field - Field metadata from Describe API
   * @returns {Boolean} True if MasterDetail
   */
  _isMasterDetailRelationship(field) {
    // Describe API provides cascadeDelete flag for MasterDetail
    // Also check if field is not updateable (MasterDetail fields can't be changed after creation)
    return field.cascadeDelete === true ||
           (field.updateable === false && field.relationshipName && field.type === 'reference');
  }

  /**
   * Get field metadata using Describe API (replaces FieldDefinition query)
   * @param {String} objectApiName - Object API name
   * @returns {Array} Array of field metadata
   */
  async _getObjectFieldsViaDescribe(objectApiName) {
    try {
      // Use sf sobject describe for object metadata
      const describeCmd = `sf sobject describe --sobject ${objectApiName} --target-org ${this.orgAlias} --json`;
      const result = this._executeCommand(describeCmd);

      if (!result.result || !result.result.fields) {
        throw new Error(`No fields returned for ${objectApiName}`);
      }

      // Transform Describe API format to match existing field structure
      return result.result.fields.map(field => {
        // Determine if this is MasterDetail or Lookup
        const isMasterDetail = this._isMasterDetailRelationship(field);
        const dataType = field.type === 'reference'
          ? (isMasterDetail ? 'MasterDetail' : 'Lookup')
          : this._mapDescribeTypeToFieldDefinitionType(field.type);

        return {
          QualifiedApiName: field.name,
          Label: field.label,
          DataType: dataType,
          IsNillable: field.nillable,
          IsCustom: field.custom,
          RelationshipName: field.relationshipName,
          ReferenceTo: field.referenceTo && field.referenceTo.length > 0 ? field.referenceTo[0] : null,
          IsRequired: !field.nillable && !field.defaultedOnCreate
        };
      });

    } catch (error) {
      if (this.options.verbose) {
        console.error(`Error describing ${objectApiName}:`, error.message);
      }
      return [];
    }
  }

  /**
   * Get fields for an object (uses Describe API with fallback to FieldDefinition)
   * @param {String} objectApiName - Object API name
   * @returns {Array} Array of field metadata
   */
  async _getObjectFields(objectApiName) {
    // Strategy 1: Try Describe API (preferred - no permission restrictions)
    try {
      const fields = await this._getObjectFieldsViaDescribe(objectApiName);
      if (fields && fields.length > 0) {
        return fields;
      }
    } catch (describeError) {
      if (this.options.verbose) {
        console.warn(`Describe API failed for ${objectApiName}, trying FieldDefinition...`);
      }
    }

    // Strategy 2: Fallback to FieldDefinition query
    try {
      const query = `
        SELECT QualifiedApiName, Label, DataType, IsNillable, IsCustom,
               RelationshipName, ReferenceTo, IsRequired
        FROM FieldDefinition
        WHERE EntityDefinition.QualifiedApiName = '${objectApiName}'
      `;

      const result = this._executeQuery(query, { useToolingApi: true });
      return result.records || [];

    } catch (fieldDefError) {
      if (this.options.verbose) {
        console.error(`Both strategies failed for ${objectApiName}`);
      }
      return [];
    }
  }

  /**
   * Map relationships between objects
   * @param {Array} objects - Array of object metadata
   * @returns {Array} Array of relationship metadata
   */
  async _mapRelationships(objects) {
    if (this.relationshipCache) {
      return this.relationshipCache;
    }

    if (this.options.verbose) {
      console.log('Mapping relationships...');
    }

    const relationships = [];
    const objectApiNames = objects.map(o => o.apiName);

    for (const obj of objects) {
      for (const field of obj.fields) {
        // Check if field is a relationship
        if (field.DataType === 'Lookup' || field.DataType === 'MasterDetail') {
          const referenceTo = field.ReferenceTo;

          // Only include relationships to other CPQ objects
          if (referenceTo && objectApiNames.includes(referenceTo)) {
            relationships.push({
              from: obj.apiName,
              to: referenceTo,
              field: field.QualifiedApiName,
              fieldLabel: field.Label,
              type: field.DataType,
              relationshipName: field.RelationshipName,
              required: field.IsRequired || !field.IsNillable || field.DataType === 'MasterDetail' // Required if IsRequired=true, IsNillable=false, or MasterDetail
            });
          }
        }
      }
    }

    if (this.options.verbose) {
      console.log(`Found ${relationships.length} relationships`);
    }

    this.relationshipCache = relationships;
    return relationships;
  }

  /**
   * Generate high-level ERD (objects and relationships only)
   * @param {Array} objects - Object metadata
   * @param {Array} relationships - Relationship metadata
   * @returns {Object} Diagram metadata
   */
  async _generateHighLevelERD(objects, relationships) {
    if (this.options.verbose) {
      console.log('Generating high-level ERD...');
    }

    let mermaidCode = 'erDiagram\n';

    // Add relationships
    for (const rel of relationships) {
      const fromLabel = this._sanitizeMermaidText(this._getObjectLabel(objects, rel.from));
      const toLabel = this._sanitizeMermaidText(this._getObjectLabel(objects, rel.to));
      const cardinality = this._getCardinality(rel);

      mermaidCode += `  ${this._sanitizeId(rel.from)} ${cardinality} ${this._sanitizeId(rel.to)} : "${rel.fieldLabel}"\n`;
    }

    // Add object definitions (empty for high-level)
    for (const obj of objects) {
      mermaidCode += `  ${this._sanitizeId(obj.apiName)} {\n  }\n`;
    }

    return await this._saveDiagram(
      mermaidCode,
      'cpq-erd-overview',
      'CPQ Entity Relationship Diagram - High Level'
    );
  }

  /**
   * Generate detailed ERD (objects with key fields and relationships)
   * @param {Array} objects - Object metadata
   * @param {Array} relationships - Relationship metadata
   * @returns {Object} Diagram metadata
   */
  async _generateDetailedERD(objects, relationships) {
    if (this.options.verbose) {
      console.log('Generating detailed ERD...');
    }

    let mermaidCode = 'erDiagram\n';

    // Add relationships
    for (const rel of relationships) {
      const fromLabel = this._sanitizeMermaidText(this._getObjectLabel(objects, rel.from));
      const toLabel = this._sanitizeMermaidText(this._getObjectLabel(objects, rel.to));
      const cardinality = this._getCardinality(rel);

      mermaidCode += `  ${this._sanitizeId(rel.from)} ${cardinality} ${this._sanitizeId(rel.to)} : "${rel.fieldLabel}"\n`;
    }

    // Add object definitions with key fields
    for (const obj of objects) {
      mermaidCode += `  ${this._sanitizeId(obj.apiName)} {\n`;

      // Select key fields to display
      const keyFields = this._selectKeyFields(obj);

      for (const field of keyFields) {
        const fieldType = this._getMermaidFieldType(field.DataType);
        const fieldName = this._sanitizeMermaidText(field.Label || field.QualifiedApiName);
        const required = field.IsRequired || !field.IsNillable ? 'PK' : '';

        mermaidCode += `    ${fieldType} ${fieldName} ${required}\n`;
      }

      mermaidCode += `  }\n`;
    }

    return await this._saveDiagram(
      mermaidCode,
      'cpq-erd-detailed',
      'CPQ Entity Relationship Diagram - Detailed'
    );
  }

  /**
   * Select key fields to display in detailed ERD
   * @param {Object} obj - Object metadata
   * @returns {Array} Selected fields
   */
  _selectKeyFields(obj) {
    const fields = obj.fields || [];
    const selected = [];

    // Priority 1: Required fields
    const required = fields.filter(f => f.IsRequired || !f.IsNillable);

    // Priority 2: CPQ-specific fields (SBQQ__ prefix)
    const cpqSpecific = fields.filter(f => f.QualifiedApiName.startsWith('SBQQ__'));

    // Priority 3: Lookup/MasterDetail fields
    const relationships = fields.filter(f => f.DataType === 'Lookup' || f.DataType === 'MasterDetail');

    // Priority 4: Common important fields
    const important = fields.filter(f =>
      ['Name', 'Status', 'Type', 'Amount', 'Quantity', 'Price', 'Total'].some(keyword =>
        f.QualifiedApiName.includes(keyword) || (f.Label && f.Label.includes(keyword))
      )
    );

    // Combine and deduplicate
    const combined = [...required, ...cpqSpecific, ...relationships, ...important];
    const seen = new Set();

    for (const field of combined) {
      if (!seen.has(field.QualifiedApiName)) {
        selected.push(field);
        seen.add(field.QualifiedApiName);
      }

      // Limit to maxFieldsPerObject
      if (selected.length >= this.options.maxFieldsPerObject) {
        break;
      }
    }

    return selected;
  }

  /**
   * Get Mermaid cardinality notation for relationship
   * @param {Object} rel - Relationship metadata
   * @returns {String} Mermaid cardinality
   */
  _getCardinality(rel) {
    if (rel.type === 'MasterDetail') {
      // Master-Detail: One-to-many (parent ||--|{ child)
      return rel.required ? '||--|{' : '||--o{';
    } else {
      // Lookup: Zero/one-to-many (parent }o--o{ child)
      return rel.required ? '}|--|{' : '}o--o{';
    }
  }

  /**
   * Get Mermaid field type from Salesforce DataType
   * @param {String} dataType - Salesforce DataType
   * @returns {String} Mermaid field type
   */
  _getMermaidFieldType(dataType) {
    const typeMap = {
      'Text': 'string',
      'LongTextArea': 'string',
      'Email': 'string',
      'Phone': 'string',
      'Url': 'string',
      'Picklist': 'string',
      'MultiselectPicklist': 'string',
      'Number': 'int',
      'Currency': 'decimal',
      'Percent': 'decimal',
      'Double': 'decimal',
      'Date': 'date',
      'DateTime': 'datetime',
      'Checkbox': 'boolean',
      'Lookup': 'string',
      'MasterDetail': 'string',
      'Id': 'string'
    };

    return typeMap[dataType] || 'string';
  }

  /**
   * Get object label from objects array
   * @param {Array} objects - Objects array
   * @param {String} apiName - Object API name
   * @returns {String} Object label
   */
  _getObjectLabel(objects, apiName) {
    const obj = objects.find(o => o.apiName === apiName);
    return obj ? obj.label : apiName;
  }

  /**
   * Save diagram to file(s)
   * @param {String} mermaidCode - Mermaid diagram code
   * @param {String} filename - Base filename (without extension)
   * @param {String} title - Diagram title
   * @returns {Object} Diagram metadata
   */
  async _saveDiagram(mermaidCode, filename, title) {
    // Ensure output directory exists
    if (!fs.existsSync(this.options.outputDir)) {
      fs.mkdirSync(this.options.outputDir, { recursive: true });
    }

    const result = {
      filename,
      title,
      paths: {},
      metadata: {
        orgAlias: this.orgAlias,
        generatedAt: new Date().toISOString()
      }
    };

    // Save as Markdown with Mermaid code block
    if (this.options.saveAsMarkdown) {
      const markdownPath = path.join(this.options.outputDir, `${filename}.md`);
      const markdownContent = `# ${title}

Org: ${this.orgAlias}
Generated: ${new Date().toLocaleString()}

\`\`\`mermaid
${mermaidCode}
\`\`\`
`;
      fs.writeFileSync(markdownPath, markdownContent);
      result.paths.markdown = markdownPath;

      if (this.options.verbose) {
        console.log(`✓ Saved Markdown: ${markdownPath}`);
      }
    }

    // Save as .mmd file (plain Mermaid)
    if (this.options.saveMermaidOnly) {
      const mermaidPath = path.join(this.options.outputDir, `${filename}.mmd`);
      fs.writeFileSync(mermaidPath, mermaidCode);
      result.paths.mermaid = mermaidPath;

      if (this.options.verbose) {
        console.log(`✓ Saved Mermaid: ${mermaidPath}`);
      }
    }

    return result;
  }

  /**
   * Sanitize text for Mermaid diagram labels
   * @param {String} text - Text to sanitize
   * @returns {String} Sanitized text
   */
  _sanitizeMermaidText(text) {
    if (!text) return '';

    return text
      .replace(/"/g, '\\"')      // Escape quotes
      .replace(/\n/g, ' ')       // Remove newlines
      .replace(/\r/g, '')        // Remove carriage returns
      .replace(/\t/g, ' ')       // Replace tabs with spaces
      .replace(/  +/g, ' ')      // Collapse multiple spaces
      .trim();
  }

  /**
   * Sanitize ID for Mermaid diagram node IDs
   * @param {String} id - ID to sanitize
   * @returns {String} Sanitized ID
   */
  _sanitizeId(id) {
    if (!id) return '';

    // Salesforce API names are already valid Mermaid IDs (alphanumeric + underscores)
    // Only replace truly invalid characters
    return id
      .replace(/[^a-zA-Z0-9_]/g, '_')  // Replace non-alphanumeric with underscore
      .replace(/^_|_$/g, '');           // Remove leading/trailing underscores
  }

  /**
   * Execute SOQL query
   * @param {String} query - SOQL query
   * @param {Object} options - Query options
   * @returns {Object} Query result
   */
  _executeQuery(query, options = {}) {
    const useToolingApi = options.useToolingApi || false;
    const apiFlag = useToolingApi ? '--use-tooling-api' : '';

    try {
      const command = `sf data query --query "${query.replace(/"/g, '\\"')}" --target-org ${this.orgAlias} ${apiFlag} --json`;
      const result = execSync(command, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      const parsed = JSON.parse(result);

      if (parsed.status === 0) {
        return parsed.result;
      } else {
        throw new Error(parsed.message || 'Query failed');
      }
    } catch (error) {
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }

  /**
   * Execute a Salesforce CLI command
   * @param {String} command - Command to execute
   * @returns {Object} Command result (parsed JSON)
   */
  _executeCommand(command) {
    try {
      const result = execSync(command, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      const parsed = JSON.parse(result);

      if (parsed.status === 0) {
        return parsed;
      } else {
        throw new Error(parsed.message || 'Command failed');
      }
    } catch (error) {
      throw new Error(`Command execution failed: ${error.message}`);
    }
  }
}

module.exports = CPQERDGenerator;
