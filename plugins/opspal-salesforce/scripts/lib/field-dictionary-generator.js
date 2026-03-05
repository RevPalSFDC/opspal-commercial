#!/usr/bin/env node

/**
 * Salesforce Field Dictionary Generator
 *
 * Generates field dictionary skeleton from Salesforce org metadata cache.
 * Produces a YAML file that can be enriched with business context.
 *
 * Features:
 * - Reads from org-metadata-cache.js output
 * - Maps Salesforce field types to dictionary types
 * - Auto-infers tags from field names and types
 * - Focuses on priority objects first
 * - Outputs YAML for human editing
 *
 * Usage:
 *   node field-dictionary-generator.js generate <org-alias> [options]
 *   node field-dictionary-generator.js preview <org-alias>
 *
 * Options:
 *   --output <path>       Custom output path
 *   --objects <list>      Comma-separated objects to include
 *   --all-objects         Include all queryable objects
 *   --skip-system         Skip system fields (CreatedById, etc.)
 *
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const OrgMetadataCache = require('./org-metadata-cache');

// Try to load yaml for output
let yaml;
try {
  yaml = require('js-yaml');
} catch (e) {
  yaml = null;
}

// Priority objects for initial dictionary generation
const PRIORITY_OBJECTS = [
  'Account',
  'Contact',
  'Lead',
  'Opportunity',
  'OpportunityLineItem',
  'Campaign',
  'CampaignMember',
  'Task',
  'Event',
  'Case',
  'Product2',
  'PricebookEntry',
  'Contract',
  'Quote',
  'QuoteLineItem',
  // CPQ objects
  'SBQQ__Quote__c',
  'SBQQ__QuoteLine__c',
  'SBQQ__Subscription__c',
  'SBQQ__Product__c'
];

// System fields to skip by default
const SYSTEM_FIELDS = [
  'Id',
  'IsDeleted',
  'CreatedDate',
  'CreatedById',
  'LastModifiedDate',
  'LastModifiedById',
  'SystemModstamp',
  'LastActivityDate',
  'LastViewedDate',
  'LastReferencedDate',
  'Jigsaw',
  'JigsawContactId'
];

// Field type mapping from Salesforce to dictionary types
const TYPE_MAPPING = {
  'string': 'Text',
  'textarea': 'TextArea',
  'picklist': 'Picklist',
  'multipicklist': 'MultiPicklist',
  'combobox': 'Picklist',
  'reference': 'Lookup',
  'masterrecord': 'MasterDetail',
  'boolean': 'Checkbox',
  'currency': 'Currency',
  'date': 'Date',
  'datetime': 'DateTime',
  'time': 'Time',
  'double': 'Number',
  'int': 'Number',
  'percent': 'Percent',
  'phone': 'Phone',
  'email': 'Email',
  'url': 'URL',
  'encryptedstring': 'EncryptedText',
  'id': 'Id',
  'address': 'Address',
  'location': 'Geolocation',
  'base64': 'Text',
  'long': 'Number',
  'anytype': 'Unknown'
};

// Tag inference rules based on field patterns
const TAG_RULES = [
  // Revenue tags
  { pattern: /amount|revenue|price|arr|mrr|tcv|acv|bookings/i, tag: 'Revenue' },
  { pattern: /currency|value|total|sum/i, tag: 'Revenue' },

  // Pipeline tags
  { pattern: /stage|pipeline|status|probability|forecast/i, tag: 'Pipeline' },
  { pattern: /close.*date|expected.*date|commit/i, tag: 'Pipeline' },
  { pattern: /opportunity|deal|opp/i, tag: 'Pipeline' },

  // Marketing tags
  { pattern: /campaign|source|medium|utm|lead.*source|marketing/i, tag: 'Marketing' },
  { pattern: /score|rating|grade|qualification/i, tag: 'Marketing' },

  // Sales tags
  { pattern: /owner|rep|territory|region|sales.*rep/i, tag: 'Sales' },
  { pattern: /activity|meeting|call|email.*sent|outreach/i, tag: 'Sales' },

  // Service tags
  { pattern: /case|ticket|support|escalation|resolution/i, tag: 'Service' },
  { pattern: /sla|response.*time|first.*response/i, tag: 'Service' },

  // Firmographic tags
  { pattern: /industry|employee|annual.*revenue|company.*size/i, tag: 'Firmographic' },
  { pattern: /billing|shipping|address|city|state|country|postal/i, tag: 'Firmographic' },

  // Contact tags
  { pattern: /name|first.*name|last.*name|title|email|phone/i, tag: 'Contact' },
  { pattern: /contact|person|individual/i, tag: 'Contact' },

  // Activity tags
  { pattern: /last.*activity|last.*contact|last.*touch|last.*engagement/i, tag: 'Activity' },
  { pattern: /created|modified|updated/i, tag: 'Activity' },

  // Product tags
  { pattern: /product|sku|item|line.*item|quantity|unit/i, tag: 'Product' },

  // Financial tags
  { pattern: /discount|tax|payment|invoice|billing/i, tag: 'Financial' },

  // CPQ tags
  { pattern: /sbqq|quote|subscription|renewal|contracted/i, tag: 'CPQ' },
  { pattern: /net.*unit|list.*price|customer.*price|package/i, tag: 'CPQ' },

  // Renewal tags
  { pattern: /renewal|renew|contract.*end|expiration/i, tag: 'Renewal' },

  // Forecast tags
  { pattern: /forecast|commit|best.*case|upside|worst.*case/i, tag: 'Forecast' },

  // System/Integration tags
  { pattern: /external.*id|sync|integration|external/i, tag: 'Integration' },
  { pattern: /__c$/i, tag: 'Custom' }
];

/**
 * Infer tags from field name and metadata
 * @param {string} fieldName - API name of field
 * @param {Object} fieldMeta - Field metadata from cache
 * @returns {string[]} Inferred tags
 */
function inferTags(fieldName, fieldMeta) {
  const tags = new Set();
  const searchText = `${fieldName} ${fieldMeta.label || ''}`;

  for (const rule of TAG_RULES) {
    if (rule.pattern.test(searchText)) {
      tags.add(rule.tag);
    }
  }

  // Type-based tags
  if (fieldMeta.type === 'currency') {
    tags.add('Financial');
  }
  if (fieldMeta.type === 'reference') {
    tags.add('System');
  }
  if (fieldMeta.calculated) {
    tags.add('System');
  }
  if (fieldMeta.custom) {
    tags.add('Custom');
  }

  return Array.from(tags);
}

/**
 * Map Salesforce field type to dictionary type
 * @param {string} sfType - Salesforce field type
 * @param {Object} fieldMeta - Field metadata
 * @returns {string} Dictionary field type
 */
function mapFieldType(sfType, fieldMeta) {
  // Check for formula fields
  if (fieldMeta.calculated) {
    return 'Formula';
  }

  // Check for auto-number
  if (sfType === 'string' && fieldMeta.autoNumber) {
    return 'AutoNumber';
  }

  // Check for rich text
  if (sfType === 'textarea' && fieldMeta.length > 10000) {
    return 'RichText';
  }

  // Check for long text area
  if (sfType === 'textarea' && fieldMeta.length > 255) {
    return 'LongTextArea';
  }

  // Standard mapping
  const mapped = TYPE_MAPPING[sfType.toLowerCase()];
  return mapped || 'Unknown';
}

/**
 * Infer recommended aggregations based on field type
 * @param {string} fieldType - Dictionary field type
 * @returns {string[]} Recommended aggregations
 */
function inferAggregations(fieldType) {
  switch (fieldType) {
    case 'Currency':
    case 'Number':
    case 'Percent':
      return ['SUM', 'AVG', 'MIN', 'MAX'];
    case 'Date':
    case 'DateTime':
      return ['MIN', 'MAX', 'COUNT'];
    case 'Picklist':
      return ['COUNT', 'GROUP'];
    case 'Checkbox':
      return ['COUNT', 'SUM'];
    default:
      return ['COUNT'];
  }
}

/**
 * Generate field dictionary from metadata cache
 */
class SalesforceDictionaryGenerator {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.options = options;
    this.metadataCache = new OrgMetadataCache(orgAlias, options.instancePath);
  }

  /**
   * Load metadata from cache
   */
  loadMetadata() {
    return this.metadataCache.loadCache();
  }

  /**
   * Generate field dictionary
   * @param {Object} options - Generation options
   * @returns {Object} Field dictionary structure
   */
  generate(options = {}) {
    const metadata = this.loadMetadata();

    if (!metadata || !metadata.objects) {
      throw new Error(`No metadata cache found for ${this.orgAlias}. Run: node org-metadata-cache.js init ${this.orgAlias}`);
    }

    // Determine which objects to include
    let objectNames;
    if (options.objects) {
      objectNames = options.objects;
    } else if (options.allObjects) {
      objectNames = Object.keys(metadata.objects)
        .filter(obj => metadata.objects[obj].queryable);
    } else {
      // Use priority objects that exist in the cache
      objectNames = PRIORITY_OBJECTS.filter(obj => metadata.objects[obj]);
    }

    console.log(`Generating dictionary for ${objectNames.length} objects...`);

    // Build dictionary structure
    const dictionary = {
      dictionary_metadata: {
        schema_version: '1.0.0',
        org_slug: this.orgAlias.replace(/[^a-z0-9-]/gi, '-').toLowerCase(),
        generated_at: new Date().toISOString(),
        enrichment_status: 'none',
        source_metadata_hash: this._computeHash(metadata),
        notes: `Auto-generated from Salesforce metadata cache for ${this.orgAlias}`
      },
      platforms: {
        salesforce: {}
      }
    };

    // Process each object
    for (const objectName of objectNames) {
      const objectMeta = metadata.objects[objectName];
      if (!objectMeta) continue;

      const objectEntry = {
        object_label: objectMeta.label || objectName,
        object_description: '', // To be enriched
        object_api_name: objectName,
        is_custom: objectMeta.custom || false,
        record_type_count: (objectMeta.recordTypes || []).length,
        fields: {}
      };

      // Process fields
      for (const [fieldName, fieldMeta] of Object.entries(objectMeta.fields || {})) {
        // Skip system fields if requested
        if (options.skipSystem && SYSTEM_FIELDS.includes(fieldName)) {
          continue;
        }

        const fieldType = mapFieldType(fieldMeta.type, fieldMeta);
        const tags = inferTags(fieldName, fieldMeta);

        const fieldEntry = {
          api_name: fieldName,
          field_name: fieldMeta.label || fieldName,
          field_type: fieldType,
          description: '', // To be enriched
          example_values: [], // To be enriched
          is_required: !fieldMeta.nillable && fieldMeta.createable,
          is_calculated: fieldMeta.calculated || false,
          source_system: fieldMeta.calculated ? 'Calculated' : 'Manual entry',
          sync_frequency: 'Manual',
          reporting_guidance: {
            recommended_aggregations: inferAggregations(fieldType),
            caveats: '', // To be enriched
            related_fields: [],
            drill_down_fields: []
          },
          use_cases: [], // To be enriched
          audience_relevance: 'All',
          tags: tags,
          _technical: {
            precision: fieldMeta.precision,
            scale: fieldMeta.scale,
            length: fieldMeta.length,
            nillable: fieldMeta.nillable,
            custom: fieldMeta.custom,
            createable: fieldMeta.createable,
            updateable: fieldMeta.updateable,
            referenceTo: fieldMeta.referenceTo,
            relationshipName: fieldMeta.relationshipName,
            picklistValues: fieldMeta.picklistValues,
            defaultValue: fieldMeta.defaultValue
          }
        };

        // Add formula if calculated
        if (fieldMeta.calculated && fieldMeta.calculatedFormula) {
          fieldEntry.formula = fieldMeta.calculatedFormula;
        }

        objectEntry.fields[fieldName] = fieldEntry;
      }

      dictionary.platforms.salesforce[objectName] = objectEntry;
    }

    return dictionary;
  }

  /**
   * Compute simple hash for drift detection
   * @private
   */
  _computeHash(metadata) {
    const str = JSON.stringify({
      objects: Object.keys(metadata.objects).sort(),
      timestamp: metadata.timestamp
    });
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Save dictionary to file
   * @param {Object} dictionary - Dictionary object
   * @param {string} outputPath - Output file path
   */
  save(dictionary, outputPath) {
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let content;
    if (outputPath.endsWith('.yaml') || outputPath.endsWith('.yml')) {
      if (!yaml) {
        throw new Error('js-yaml not installed. Run: npm install js-yaml');
      }
      content = yaml.dump(dictionary, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        sortKeys: false
      });
    } else {
      content = JSON.stringify(dictionary, null, 2);
    }

    fs.writeFileSync(outputPath, content);
    console.log(`Dictionary saved to: ${outputPath}`);
  }

  /**
   * Get statistics about the generated dictionary
   */
  getStats(dictionary) {
    let totalFields = 0;
    let customFields = 0;
    let formulaFields = 0;
    const objectStats = {};

    for (const [objectName, objectData] of Object.entries(dictionary.platforms.salesforce || {})) {
      const fieldCount = Object.keys(objectData.fields).length;
      totalFields += fieldCount;

      let objCustom = 0;
      let objFormula = 0;

      for (const fieldDef of Object.values(objectData.fields)) {
        if (fieldDef._technical?.custom) {
          customFields++;
          objCustom++;
        }
        if (fieldDef.is_calculated) {
          formulaFields++;
          objFormula++;
        }
      }

      objectStats[objectName] = {
        total: fieldCount,
        custom: objCustom,
        formula: objFormula
      };
    }

    return {
      totalObjects: Object.keys(dictionary.platforms.salesforce).length,
      totalFields,
      customFields,
      formulaFields,
      standardFields: totalFields - customFields - formulaFields,
      objectStats
    };
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const orgAlias = args[1];

  // Parse options
  const options = {};
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      options.output = args[i + 1];
      i++;
    } else if (args[i] === '--objects' && args[i + 1]) {
      options.objects = args[i + 1].split(',').map(s => s.trim());
      i++;
    } else if (args[i] === '--all-objects') {
      options.allObjects = true;
    } else if (args[i] === '--skip-system') {
      options.skipSystem = true;
    }
  }

  if (!command || command === 'help') {
    console.log(`
Salesforce Field Dictionary Generator

Usage:
  node field-dictionary-generator.js generate <org-alias> [options]
  node field-dictionary-generator.js preview <org-alias>
  node field-dictionary-generator.js help

Options:
  --output <path>       Custom output path (default: orgs/<slug>/configs/field-dictionary.yaml)
  --objects <list>      Comma-separated objects to include
  --all-objects         Include all queryable objects (may be large)
  --skip-system         Skip system fields (CreatedById, etc.)

Examples:
  node field-dictionary-generator.js generate my-org
  node field-dictionary-generator.js generate my-org --objects Account,Opportunity,Lead
  node field-dictionary-generator.js generate my-org --all-objects --skip-system
  node field-dictionary-generator.js preview my-org
`);
    process.exit(0);
  }

  if (!orgAlias) {
    console.error('Error: org-alias is required');
    process.exit(1);
  }

  try {
    const generator = new SalesforceDictionaryGenerator(orgAlias);

    if (command === 'preview') {
      const dictionary = generator.generate(options);
      const stats = generator.getStats(dictionary);

      console.log('\n📊 Dictionary Preview');
      console.log('='.repeat(50));
      console.log(`Objects: ${stats.totalObjects}`);
      console.log(`Total Fields: ${stats.totalFields}`);
      console.log(`  - Standard: ${stats.standardFields}`);
      console.log(`  - Custom: ${stats.customFields}`);
      console.log(`  - Formula: ${stats.formulaFields}`);
      console.log('\nObjects included:');
      for (const [obj, objStats] of Object.entries(stats.objectStats)) {
        console.log(`  - ${obj}: ${objStats.total} fields (${objStats.custom} custom, ${objStats.formula} formula)`);
      }

    } else if (command === 'generate') {
      const dictionary = generator.generate(options);
      const stats = generator.getStats(dictionary);

      // Determine output path
      const orgSlug = dictionary.dictionary_metadata.org_slug;
      const outputPath = options.output ||
        path.join(process.cwd(), 'orgs', orgSlug, 'configs', 'field-dictionary.yaml');

      generator.save(dictionary, outputPath);

      console.log('\n✅ Dictionary generated successfully!');
      console.log('='.repeat(50));
      console.log(`Objects: ${stats.totalObjects}`);
      console.log(`Fields: ${stats.totalFields}`);
      console.log(`Location: ${outputPath}`);
      console.log('\nNext steps:');
      console.log('1. Review and enrich field descriptions');
      console.log('2. Add example_values for key fields');
      console.log('3. Update use_cases for reporting fields');
      console.log('4. Run: /enrich-field-dictionary to add business context');

    } else {
      console.error(`Unknown command: ${command}`);
      process.exit(1);
    }

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { SalesforceDictionaryGenerator, PRIORITY_OBJECTS, inferTags, mapFieldType };
