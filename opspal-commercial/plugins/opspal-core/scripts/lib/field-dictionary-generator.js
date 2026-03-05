#!/usr/bin/env node

/**
 * Unified Field Dictionary Generator
 *
 * Orchestrates generation of field dictionaries from Salesforce and HubSpot
 * metadata caches, merging them into a single unified dictionary per org.
 *
 * Features:
 * - Coordinates Salesforce and HubSpot generators
 * - Merges output into single org-level dictionary
 * - Supports incremental updates (existing + new)
 * - Validates output against schema
 *
 * Usage:
 *   node field-dictionary-generator.js generate <org-slug> [options]
 *   node field-dictionary-generator.js merge <org-slug> <sf-dict> <hs-dict>
 *   node field-dictionary-generator.js validate <org-slug>
 *
 * Options:
 *   --sf-alias <alias>      Salesforce org alias
 *   --hs-portal <name>      HubSpot portal name
 *   --output <path>         Custom output path
 *   --skip-system           Skip system fields
 *
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Try to load yaml for output
let yaml;
try {
  yaml = require('js-yaml');
} catch (e) {
  yaml = null;
}

// Try to load platform-specific generators
let SalesforceDictionaryGenerator;
let HubSpotDictionaryGenerator;

try {
  const sfModule = require('../../../opspal-salesforce/scripts/lib/field-dictionary-generator');
  SalesforceDictionaryGenerator = sfModule.SalesforceDictionaryGenerator;
} catch (e) {
  SalesforceDictionaryGenerator = null;
}

try {
  const hsModule = require('../../../opspal-hubspot/scripts/lib/field-dictionary-generator');
  HubSpotDictionaryGenerator = hsModule.HubSpotDictionaryGenerator;
} catch (e) {
  HubSpotDictionaryGenerator = null;
}

const { FieldDictionaryLoader } = require('./field-dictionary-loader');

/**
 * Unified Field Dictionary Generator
 */
class UnifiedDictionaryGenerator {
  constructor(orgSlug, options = {}) {
    this.orgSlug = orgSlug;
    this.options = options;
    this.loader = new FieldDictionaryLoader({ verbose: options.verbose });
    this.orgsDir = path.join(process.cwd(), 'orgs');
  }

  /**
   * Generate unified dictionary from platform sources
   * @param {Object} options - Generation options
   * @returns {Object} Unified dictionary
   */
  async generate(options = {}) {
    const dictionary = {
      dictionary_metadata: {
        schema_version: '1.0.0',
        org_slug: this.orgSlug,
        generated_at: new Date().toISOString(),
        enrichment_status: 'none',
        source_metadata_hash: '',
        notes: `Unified dictionary for ${this.orgSlug}`
      },
      platforms: {
        salesforce: {},
        hubspot: {}
      }
    };

    const sources = [];
    const hashes = [];

    // Generate Salesforce portion if alias provided
    if (options.sfAlias && SalesforceDictionaryGenerator) {
      console.log(`\n📦 Generating Salesforce dictionary from ${options.sfAlias}...`);
      try {
        const sfGenerator = new SalesforceDictionaryGenerator(options.sfAlias);
        const sfDict = sfGenerator.generate({
          skipSystem: options.skipSystem,
          objects: options.sfObjects
        });

        dictionary.platforms.salesforce = sfDict.platforms.salesforce;
        hashes.push(sfDict.dictionary_metadata.source_metadata_hash);
        sources.push('salesforce');

        const stats = sfGenerator.getStats(sfDict);
        console.log(`   ✅ ${stats.totalObjects} objects, ${stats.totalFields} fields`);
      } catch (error) {
        console.error(`   ❌ Salesforce generation failed: ${error.message}`);
      }
    } else if (options.sfAlias) {
      console.warn('   ⚠️ Salesforce generator not available (opspal-salesforce plugin required)');
    }

    // Generate HubSpot portion if portal name provided
    if (options.hsPortal && HubSpotDictionaryGenerator) {
      console.log(`\n📦 Generating HubSpot dictionary from ${options.hsPortal}...`);
      try {
        const hsGenerator = new HubSpotDictionaryGenerator(options.hsPortal);
        const hsDict = hsGenerator.generate({
          skipHubspot: options.skipSystem,
          objects: options.hsObjects
        });

        dictionary.platforms.hubspot = hsDict.platforms.hubspot;
        hashes.push(hsDict.dictionary_metadata.source_metadata_hash);
        sources.push('hubspot');

        const stats = hsGenerator.getStats(hsDict);
        console.log(`   ✅ ${stats.totalObjects} objects, ${stats.totalFields} properties`);
      } catch (error) {
        console.error(`   ❌ HubSpot generation failed: ${error.message}`);
      }
    } else if (options.hsPortal) {
      console.warn('   ⚠️ HubSpot generator not available (opspal-hubspot plugin required)');
    }

    // Update metadata
    dictionary.dictionary_metadata.source_metadata_hash = hashes.join('-');
    dictionary.dictionary_metadata.notes = `Generated from: ${sources.join(', ')}`;

    return dictionary;
  }

  /**
   * Merge existing dictionary with new data
   * @param {Object} existing - Existing dictionary
   * @param {Object} newData - New dictionary data
   * @returns {Object} Merged dictionary
   */
  merge(existing, newData) {
    const merged = JSON.parse(JSON.stringify(existing));

    // Update metadata
    merged.dictionary_metadata.generated_at = new Date().toISOString();
    merged.dictionary_metadata.source_metadata_hash = newData.dictionary_metadata.source_metadata_hash;

    // Merge platforms
    for (const [platform, objects] of Object.entries(newData.platforms || {})) {
      if (!merged.platforms[platform]) {
        merged.platforms[platform] = {};
      }

      for (const [objectName, objectData] of Object.entries(objects || {})) {
        if (!merged.platforms[platform][objectName]) {
          // New object - add it
          merged.platforms[platform][objectName] = objectData;
        } else {
          // Existing object - merge fields
          const existingObj = merged.platforms[platform][objectName];

          for (const [fieldName, fieldData] of Object.entries(objectData.fields || {})) {
            if (!existingObj.fields[fieldName]) {
              // New field - add it
              existingObj.fields[fieldName] = fieldData;
            } else {
              // Existing field - preserve enrichments, update technical
              const existingField = existingObj.fields[fieldName];

              // Update technical metadata
              existingField._technical = fieldData._technical;
              existingField.field_type = fieldData.field_type;
              existingField.is_calculated = fieldData.is_calculated;

              // Preserve enrichments if they exist
              if (!existingField.description && fieldData.description) {
                existingField.description = fieldData.description;
              }
            }
          }

          // Check for removed fields (mark them)
          for (const fieldName of Object.keys(existingObj.fields)) {
            if (!objectData.fields[fieldName]) {
              existingObj.fields[fieldName]._technical = existingObj.fields[fieldName]._technical || {};
              existingObj.fields[fieldName]._technical._removed = true;
              existingObj.fields[fieldName]._technical._removedAt = new Date().toISOString();
            }
          }
        }
      }
    }

    // Update enrichment status based on content
    const stats = this._computeEnrichmentStats(merged);
    if (stats.enrichmentPercentage >= 80) {
      merged.dictionary_metadata.enrichment_status = 'complete';
    } else if (stats.enrichmentPercentage > 0) {
      merged.dictionary_metadata.enrichment_status = 'partial';
    }

    return merged;
  }

  /**
   * Compute enrichment statistics
   * @private
   */
  _computeEnrichmentStats(dictionary) {
    let totalFields = 0;
    let enrichedFields = 0;

    for (const objects of Object.values(dictionary.platforms || {})) {
      for (const objectData of Object.values(objects || {})) {
        for (const fieldDef of Object.values(objectData.fields || {})) {
          totalFields++;

          const hasDescription = fieldDef.description && fieldDef.description.length > 0;
          const hasUseCases = fieldDef.use_cases && fieldDef.use_cases.length > 0;
          const hasReportingGuidance = fieldDef.reporting_guidance?.caveats;

          if (hasDescription && hasUseCases && hasReportingGuidance) {
            enrichedFields++;
          }
        }
      }
    }

    return {
      totalFields,
      enrichedFields,
      enrichmentPercentage: totalFields > 0 ? Math.round((enrichedFields / totalFields) * 100) : 0
    };
  }

  /**
   * Save dictionary to file
   * @param {Object} dictionary - Dictionary object
   * @param {string} outputPath - Output file path
   */
  save(dictionary, outputPath) {
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
    return outputPath;
  }

  /**
   * Validate dictionary against schema
   * @param {Object} dictionary - Dictionary to validate
   * @returns {Object} Validation result
   */
  validate(dictionary) {
    const errors = [];
    const warnings = [];

    // Required metadata checks
    if (!dictionary.dictionary_metadata) {
      errors.push('Missing dictionary_metadata');
    } else {
      if (!dictionary.dictionary_metadata.schema_version) {
        errors.push('Missing schema_version in metadata');
      }
      if (!dictionary.dictionary_metadata.org_slug) {
        errors.push('Missing org_slug in metadata');
      }
      if (!dictionary.dictionary_metadata.generated_at) {
        errors.push('Missing generated_at in metadata');
      }
    }

    // Platform checks
    if (!dictionary.platforms) {
      errors.push('Missing platforms section');
    } else {
      const hasSalesforce = Object.keys(dictionary.platforms.salesforce || {}).length > 0;
      const hasHubspot = Object.keys(dictionary.platforms.hubspot || {}).length > 0;

      if (!hasSalesforce && !hasHubspot) {
        warnings.push('Dictionary has no platform data');
      }

      // Validate field entries
      for (const [platform, objects] of Object.entries(dictionary.platforms || {})) {
        for (const [objectName, objectData] of Object.entries(objects || {})) {
          if (!objectData.object_label) {
            warnings.push(`${platform}.${objectName}: missing object_label`);
          }

          for (const [fieldName, fieldDef] of Object.entries(objectData.fields || {})) {
            if (!fieldDef.api_name) {
              errors.push(`${platform}.${objectName}.${fieldName}: missing api_name`);
            }
            if (!fieldDef.field_type) {
              errors.push(`${platform}.${objectName}.${fieldName}: missing field_type`);
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get statistics for the dictionary
   */
  getStats(dictionary) {
    let totalObjects = 0;
    let totalFields = 0;
    const platforms = {};

    for (const [platform, objects] of Object.entries(dictionary.platforms || {})) {
      const objectCount = Object.keys(objects || {}).length;
      let fieldCount = 0;

      for (const objectData of Object.values(objects || {})) {
        fieldCount += Object.keys(objectData.fields || {}).length;
      }

      totalObjects += objectCount;
      totalFields += fieldCount;
      platforms[platform] = { objects: objectCount, fields: fieldCount };
    }

    const enrichmentStats = this._computeEnrichmentStats(dictionary);

    return {
      orgSlug: dictionary.dictionary_metadata?.org_slug,
      totalObjects,
      totalFields,
      platforms,
      enrichmentStatus: dictionary.dictionary_metadata?.enrichment_status,
      ...enrichmentStats
    };
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const orgSlug = args[1];

  // Parse options
  const options = { verbose: false };
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--sf-alias' && args[i + 1]) {
      options.sfAlias = args[i + 1];
      i++;
    } else if (args[i] === '--hs-portal' && args[i + 1]) {
      options.hsPortal = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      options.output = args[i + 1];
      i++;
    } else if (args[i] === '--skip-system') {
      options.skipSystem = true;
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      options.verbose = true;
    } else if (args[i] === '--sf-objects' && args[i + 1]) {
      options.sfObjects = args[i + 1].split(',').map(s => s.trim());
      i++;
    } else if (args[i] === '--hs-objects' && args[i + 1]) {
      options.hsObjects = args[i + 1].split(',').map(s => s.trim());
      i++;
    }
  }

  if (!command || command === 'help') {
    console.log(`
Unified Field Dictionary Generator

Usage:
  node field-dictionary-generator.js generate <org-slug> [options]
  node field-dictionary-generator.js validate <org-slug>
  node field-dictionary-generator.js stats <org-slug>
  node field-dictionary-generator.js help

Options:
  --sf-alias <alias>    Salesforce org alias (for generating SF portion)
  --hs-portal <name>    HubSpot portal name (for generating HS portion)
  --output <path>       Custom output path
  --skip-system         Skip system fields
  --sf-objects <list>   Comma-separated Salesforce objects
  --hs-objects <list>   Comma-separated HubSpot objects
  --verbose, -v         Verbose output

Examples:
  # Generate unified dictionary
  node field-dictionary-generator.js generate acme-corp --sf-alias acme-prod --hs-portal acme

  # Generate Salesforce only
  node field-dictionary-generator.js generate acme-corp --sf-alias acme-prod

  # Generate HubSpot only
  node field-dictionary-generator.js generate acme-corp --hs-portal acme

  # Validate existing dictionary
  node field-dictionary-generator.js validate acme-corp

  # Get statistics
  node field-dictionary-generator.js stats acme-corp
`);
    process.exit(0);
  }

  if (!orgSlug) {
    console.error('Error: org-slug is required');
    process.exit(1);
  }

  try {
    const generator = new UnifiedDictionaryGenerator(orgSlug, options);

    if (command === 'generate') {
      if (!options.sfAlias && !options.hsPortal) {
        console.error('Error: At least one of --sf-alias or --hs-portal is required');
        process.exit(1);
      }

      console.log(`\n🔧 Generating unified field dictionary for: ${orgSlug}`);

      // Check if dictionary exists for merge
      const loader = new FieldDictionaryLoader({ verbose: options.verbose });
      const existing = loader.load(orgSlug);

      // Generate new data
      const newDict = await generator.generate(options);

      // Merge or use new
      let finalDict;
      if (existing) {
        console.log('\n📎 Merging with existing dictionary...');
        finalDict = generator.merge(existing, newDict);
      } else {
        finalDict = newDict;
      }

      // Validate
      const validation = generator.validate(finalDict);
      if (!validation.valid) {
        console.error('\n❌ Validation errors:');
        validation.errors.forEach(e => console.error(`   - ${e}`));
        process.exit(1);
      }

      if (validation.warnings.length > 0) {
        console.warn('\n⚠️ Warnings:');
        validation.warnings.forEach(w => console.warn(`   - ${w}`));
      }

      // Save
      const outputPath = options.output ||
        path.join(process.cwd(), 'orgs', orgSlug, 'configs', 'field-dictionary.yaml');

      generator.save(finalDict, outputPath);

      const stats = generator.getStats(finalDict);
      console.log('\n✅ Dictionary generated successfully!');
      console.log('='.repeat(50));
      console.log(`Location: ${outputPath}`);
      console.log(`Objects: ${stats.totalObjects}`);
      console.log(`Fields: ${stats.totalFields}`);
      console.log(`Enrichment: ${stats.enrichmentPercentage}%`);

      if (stats.platforms.salesforce) {
        console.log(`\nSalesforce: ${stats.platforms.salesforce.objects} objects, ${stats.platforms.salesforce.fields} fields`);
      }
      if (stats.platforms.hubspot) {
        console.log(`HubSpot: ${stats.platforms.hubspot.objects} objects, ${stats.platforms.hubspot.fields} properties`);
      }

      console.log('\nNext steps:');
      console.log('1. Run /enrich-field-dictionary to add business context');
      console.log('2. Run /query-field-dictionary to test lookups');

    } else if (command === 'validate') {
      const loader = new FieldDictionaryLoader({ verbose: options.verbose });
      const dict = loader.load(orgSlug);

      if (!dict) {
        console.error(`Dictionary not found for org: ${orgSlug}`);
        process.exit(1);
      }

      const validation = generator.validate(dict);

      if (validation.valid) {
        console.log('✅ Dictionary is valid');
      } else {
        console.error('❌ Validation errors:');
        validation.errors.forEach(e => console.error(`   - ${e}`));
      }

      if (validation.warnings.length > 0) {
        console.warn('\n⚠️ Warnings:');
        validation.warnings.forEach(w => console.warn(`   - ${w}`));
      }

      process.exit(validation.valid ? 0 : 1);

    } else if (command === 'stats') {
      const loader = new FieldDictionaryLoader({ verbose: options.verbose });
      const dict = loader.load(orgSlug);

      if (!dict) {
        console.error(`Dictionary not found for org: ${orgSlug}`);
        process.exit(1);
      }

      const stats = generator.getStats(dict);
      console.log('\n📊 Dictionary Statistics');
      console.log('='.repeat(50));
      console.log(JSON.stringify(stats, null, 2));

    } else {
      console.error(`Unknown command: ${command}`);
      process.exit(1);
    }

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { UnifiedDictionaryGenerator };
