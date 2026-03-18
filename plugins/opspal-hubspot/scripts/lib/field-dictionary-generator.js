#!/usr/bin/env node

/**
 * HubSpot Field Dictionary Generator
 *
 * Generates field dictionary skeleton from HubSpot portal metadata cache.
 * Produces a YAML file that can be enriched with business context.
 *
 * Features:
 * - Reads from hubspot-metadata-cache.js output
 * - Maps HubSpot property types to dictionary types
 * - Auto-infers tags from property names and groups
 * - Outputs YAML for human editing
 *
 * Usage:
 *   node field-dictionary-generator.js generate <portal-name> [options]
 *   node field-dictionary-generator.js preview <portal-name>
 *
 * Options:
 *   --output <path>       Custom output path
 *   --objects <list>      Comma-separated objects to include
 *   --skip-hubspot        Skip default HubSpot properties
 *
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { HubSpotMetadataCache, OBJECT_TYPES } = require('./hubspot-metadata-cache');

// Try to load yaml for output
let yaml;
try {
  yaml = require('js-yaml');
} catch (e) {
  yaml = null;
}

// Priority objects for initial dictionary generation
const PRIORITY_OBJECTS = ['contacts', 'companies', 'deals', 'tickets'];

// HubSpot property groups that indicate system/internal properties
const SYSTEM_GROUPS = [
  'socialmediainformation',
  'analyticsHistory',
  'conversionInformation',
  'facebookAds',
  'googleAdwords'
];

// Property type mapping from HubSpot to dictionary types
const TYPE_MAPPING = {
  'string': 'Text',
  'number': 'Number',
  'date': 'Date',
  'datetime': 'DateTime',
  'enumeration': 'Picklist',
  'bool': 'Checkbox',
  'phone_number': 'Phone',
  'email': 'Email',
  'html': 'RichText',
  'calculation_read_time': 'Formula',
  'calculation_equation': 'Formula',
  'calculation_score': 'Formula',
  'calculation_rollup': 'Formula'
};

// Field type mapping from HubSpot to dictionary types
const FIELD_TYPE_MAPPING = {
  'text': 'Text',
  'textarea': 'TextArea',
  'select': 'Picklist',
  'radio': 'Picklist',
  'checkbox': 'Checkbox',
  'booleancheckbox': 'Checkbox',
  'date': 'Date',
  'file': 'URL',
  'number': 'Number',
  'html': 'RichText',
  'phonenumber': 'Phone',
  'calculation_read_time': 'Formula',
  'calculation_equation': 'Formula',
  'calculation_score': 'Formula'
};

// Tag inference rules based on property patterns
const TAG_RULES = [
  // Revenue tags
  { pattern: /amount|revenue|deal.*value|annual|mrr|arr|tcv|acv/i, tag: 'Revenue' },
  { pattern: /budget|price|cost|spend/i, tag: 'Revenue' },

  // Pipeline tags
  { pattern: /stage|pipeline|status|probability|forecast/i, tag: 'Pipeline' },
  { pattern: /close.*date|expected.*date|deal|opportunity/i, tag: 'Pipeline' },

  // Marketing tags
  { pattern: /campaign|source|medium|utm|original.*source|marketing/i, tag: 'Marketing' },
  { pattern: /score|lead.*score|hs_lead_status/i, tag: 'Marketing' },
  { pattern: /newsletter|subscription|email.*optim/i, tag: 'Marketing' },

  // Sales tags
  { pattern: /owner|hubspot_owner|rep|territory|region/i, tag: 'Sales' },
  { pattern: /activity|last.*contact|notes_last_contacted/i, tag: 'Sales' },
  { pattern: /sales.*qualified|sql|mql/i, tag: 'Sales' },

  // Service tags
  { pattern: /ticket|support|issue|resolution|escalation/i, tag: 'Service' },
  { pattern: /sla|first.*response|time.*to.*close/i, tag: 'Service' },

  // Firmographic tags
  { pattern: /industry|employee|annualrevenue|company.*size|numberofemployees/i, tag: 'Firmographic' },
  { pattern: /address|city|state|country|zip|postal/i, tag: 'Firmographic' },
  { pattern: /website|domain|linkedin/i, tag: 'Firmographic' },

  // Contact tags
  { pattern: /firstname|lastname|name|email|phone|jobtitle/i, tag: 'Contact' },
  { pattern: /contact|person|individual/i, tag: 'Contact' },
  { pattern: /lifecycle|lifecyclestage/i, tag: 'Contact' },

  // Activity tags
  { pattern: /last.*activity|last.*engagement|recent_deal/i, tag: 'Activity' },
  { pattern: /num_.*|notes_last_|hs_latest/i, tag: 'Activity' },

  // Product tags
  { pattern: /product|sku|item|line.*item|quantity/i, tag: 'Product' },

  // Financial tags
  { pattern: /discount|tax|payment|invoice|billing/i, tag: 'Financial' },

  // Renewal tags
  { pattern: /renewal|contract.*end|expiration|churn/i, tag: 'Renewal' },

  // Forecast tags
  { pattern: /forecast|projected|prediction|expected/i, tag: 'Forecast' },

  // Integration/System tags
  { pattern: /hs_object_id|createdate|lastmodifieddate/i, tag: 'System' },
  { pattern: /import|integration|sync/i, tag: 'Integration' }
];

/**
 * Infer tags from property name and metadata
 * @param {string} propertyName - API name of property
 * @param {Object} propertyMeta - Property metadata from cache
 * @returns {string[]} Inferred tags
 */
function inferTags(propertyName, propertyMeta) {
  const tags = new Set();
  const searchText = `${propertyName} ${propertyMeta.label || ''} ${propertyMeta.groupName || ''}`;

  for (const rule of TAG_RULES) {
    if (rule.pattern.test(searchText)) {
      tags.add(rule.tag);
    }
  }

  // Group-based tags
  const group = propertyMeta.groupName || '';
  if (group.includes('deal') || group.includes('sales')) {
    tags.add('Sales');
  }
  if (group.includes('contact')) {
    tags.add('Contact');
  }
  if (group.includes('company')) {
    tags.add('Firmographic');
  }

  // Type-based tags
  if (propertyMeta.calculated) {
    tags.add('System');
  }
  if (!propertyName.startsWith('hs_')) {
    tags.add('Custom');
  }

  return Array.from(tags);
}

/**
 * Map HubSpot property type to dictionary type
 * @param {Object} propertyMeta - Property metadata
 * @returns {string} Dictionary field type
 */
function mapFieldType(propertyMeta) {
  // Check for calculated properties
  if (propertyMeta.calculated) {
    return 'Formula';
  }

  // First try fieldType mapping
  if (propertyMeta.fieldType && FIELD_TYPE_MAPPING[propertyMeta.fieldType.toLowerCase()]) {
    return FIELD_TYPE_MAPPING[propertyMeta.fieldType.toLowerCase()];
  }

  // Then try type mapping
  if (propertyMeta.type && TYPE_MAPPING[propertyMeta.type.toLowerCase()]) {
    return TYPE_MAPPING[propertyMeta.type.toLowerCase()];
  }

  return 'Text';
}

/**
 * Infer recommended aggregations based on field type
 * @param {string} fieldType - Dictionary field type
 * @returns {string[]} Recommended aggregations
 */
function inferAggregations(fieldType) {
  switch (fieldType) {
    case 'Number':
    case 'Currency':
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
 * Generate field dictionary from HubSpot metadata cache
 */
class HubSpotDictionaryGenerator {
  constructor(portalName, options = {}) {
    this.portalName = portalName;
    this.options = options;
    this.metadataCache = new HubSpotMetadataCache(portalName, options);
  }

  /**
   * Generate field dictionary
   * @param {Object} options - Generation options
   * @returns {Object} Field dictionary structure
   */
  generate(options = {}) {
    const cache = this.metadataCache.cache;

    if (!cache || !cache.properties) {
      throw new Error(`No metadata cache found for ${this.portalName}. Run: node hubspot-metadata-cache.js init ${this.portalName} --token <token>`);
    }

    // Determine which objects to include
    let objectNames;
    if (options.objects) {
      objectNames = options.objects;
    } else {
      objectNames = PRIORITY_OBJECTS;
    }

    console.log(`Generating dictionary for ${objectNames.length} objects...`);

    // Build dictionary structure
    const dictionary = {
      dictionary_metadata: {
        schema_version: '1.0.0',
        org_slug: this.portalName.replace(/[^a-z0-9-]/gi, '-').toLowerCase(),
        generated_at: new Date().toISOString(),
        enrichment_status: 'none',
        source_metadata_hash: this._computeHash(cache),
        notes: `Auto-generated from HubSpot metadata cache for ${this.portalName}`
      },
      platforms: {
        hubspot: {}
      }
    };

    // Process each object
    for (const objectType of objectNames) {
      const properties = cache.properties[objectType]?.data || [];

      if (properties.length === 0) {
        console.log(`  Skipping ${objectType} - no properties cached`);
        continue;
      }

      const objectEntry = {
        object_label: objectType.charAt(0).toUpperCase() + objectType.slice(1),
        object_description: '', // To be enriched
        object_api_name: objectType,
        is_custom: false,
        fields: {}
      };

      // Process properties
      for (const prop of properties) {
        // Skip HubSpot system properties if requested
        if (options.skipHubspot && prop.name.startsWith('hs_')) {
          continue;
        }

        // Skip certain system groups
        if (SYSTEM_GROUPS.includes(prop.groupName)) {
          continue;
        }

        const fieldType = mapFieldType(prop);
        const tags = inferTags(prop.name, prop);

        const fieldEntry = {
          api_name: prop.name,
          field_name: prop.label || prop.name,
          field_type: fieldType,
          description: prop.description || '', // HubSpot sometimes has descriptions
          example_values: [], // To be enriched
          is_required: false, // HubSpot doesn't have required at property level typically
          is_calculated: prop.calculated || false,
          source_system: prop.calculated ? 'Calculated' : 'Manual entry',
          sync_frequency: 'Real-time',
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
            type: prop.type,
            fieldType: prop.fieldType,
            groupName: prop.groupName,
            calculated: prop.calculated,
            hasUniqueValue: prop.hasUniqueValue,
            externalOptions: prop.externalOptions,
            options: prop.options ? prop.options.map(o => ({
              value: o.value,
              label: o.label
            })) : undefined
          }
        };

        objectEntry.fields[prop.name] = fieldEntry;
      }

      dictionary.platforms.hubspot[objectType] = objectEntry;
    }

    return dictionary;
  }

  /**
   * Compute simple hash for drift detection
   * @private
   */
  _computeHash(cache) {
    const str = JSON.stringify({
      objects: Object.keys(cache.properties || {}).sort(),
      timestamp: cache.lastUpdated
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
    let calculatedFields = 0;
    const objectStats = {};

    for (const [objectName, objectData] of Object.entries(dictionary.platforms.hubspot || {})) {
      const fieldCount = Object.keys(objectData.fields).length;
      totalFields += fieldCount;

      let objCustom = 0;
      let objCalculated = 0;

      for (const fieldDef of Object.values(objectData.fields)) {
        if (!fieldDef.api_name.startsWith('hs_')) {
          customFields++;
          objCustom++;
        }
        if (fieldDef.is_calculated) {
          calculatedFields++;
          objCalculated++;
        }
      }

      objectStats[objectName] = {
        total: fieldCount,
        custom: objCustom,
        calculated: objCalculated
      };
    }

    return {
      totalObjects: Object.keys(dictionary.platforms.hubspot).length,
      totalFields,
      customFields,
      calculatedFields,
      hubspotFields: totalFields - customFields,
      objectStats
    };
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const portalName = args[1];

  // Parse options
  const options = {};
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      options.output = args[i + 1];
      i++;
    } else if (args[i] === '--objects' && args[i + 1]) {
      options.objects = args[i + 1].split(',').map(s => s.trim());
      i++;
    } else if (args[i] === '--skip-hubspot') {
      options.skipHubspot = true;
    }
  }

  if (!command || command === 'help') {
    console.log(`
HubSpot Field Dictionary Generator

Usage:
  node field-dictionary-generator.js generate <portal-name> [options]
  node field-dictionary-generator.js preview <portal-name>
  node field-dictionary-generator.js help

Options:
  --output <path>       Custom output path (default: orgs/<slug>/configs/field-dictionary.yaml)
  --objects <list>      Comma-separated objects to include (default: contacts,companies,deals,tickets)
  --skip-hubspot        Skip default HubSpot properties (hs_*)

Examples:
  node field-dictionary-generator.js generate my-portal
  node field-dictionary-generator.js generate my-portal --objects contacts,deals
  node field-dictionary-generator.js generate my-portal --skip-hubspot
  node field-dictionary-generator.js preview my-portal
`);
    process.exit(0);
  }

  if (!portalName) {
    console.error('Error: portal-name is required');
    process.exit(1);
  }

  try {
    const generator = new HubSpotDictionaryGenerator(portalName);

    if (command === 'preview') {
      const dictionary = generator.generate(options);
      const stats = generator.getStats(dictionary);

      console.log('\n📊 Dictionary Preview');
      console.log('='.repeat(50));
      console.log(`Objects: ${stats.totalObjects}`);
      console.log(`Total Properties: ${stats.totalFields}`);
      console.log(`  - HubSpot: ${stats.hubspotFields}`);
      console.log(`  - Custom: ${stats.customFields}`);
      console.log(`  - Calculated: ${stats.calculatedFields}`);
      console.log('\nObjects included:');
      for (const [obj, objStats] of Object.entries(stats.objectStats)) {
        console.log(`  - ${obj}: ${objStats.total} properties (${objStats.custom} custom, ${objStats.calculated} calculated)`);
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
      console.log(`Properties: ${stats.totalFields}`);
      console.log(`Location: ${outputPath}`);
      console.log('\nNext steps:');
      console.log('1. Review and enrich property descriptions');
      console.log('2. Add example_values for key properties');
      console.log('3. Update use_cases for reporting properties');
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

module.exports = { HubSpotDictionaryGenerator, PRIORITY_OBJECTS, inferTags, mapFieldType };
