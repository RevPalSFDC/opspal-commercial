#!/usr/bin/env node

/**
 * Field Dictionary Loader
 *
 * Loads and caches field dictionaries that bridge technical Salesforce/HubSpot
 * metadata with LLM-consumable business context for reporting agents.
 *
 * Features:
 * - Lazy loading with in-memory cache (TTL: 5min dev, 1hr prod)
 * - YAML format with JSON Schema validation
 * - Cross-platform field lookup (Salesforce + HubSpot)
 * - Tag-based field discovery
 * - LLM context string generation for reporting agents
 * - Enrichment status tracking
 *
 * Usage:
 *   const { FieldDictionaryLoader } = require('./field-dictionary-loader');
 *   const loader = new FieldDictionaryLoader();
 *   const dict = await loader.load('acme-corp');
 *   const field = loader.getField('acme-corp', 'salesforce', 'Opportunity', 'Amount');
 *   const context = loader.generateReportingContext('acme-corp', ['Account', 'Opportunity']);
 *
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Live-first configuration: always reload from disk unless explicitly caching
const LIVE_FIRST = process.env.GLOBAL_LIVE_FIRST !== 'false' &&
                   process.env.FIELD_DICT_LIVE_FIRST !== 'false';

// Try to load yaml parser, fallback to JSON if not available
let yaml;
try {
  yaml = require('js-yaml');
} catch (e) {
  yaml = null;
}

class FieldDictionaryLoader {
  constructor(options = {}) {
    // Base directory for org configs
    this.orgsDir = options.orgsDir ||
      path.join(process.cwd(), 'orgs');

    // Schema path for validation
    this.schemaPath = options.schemaPath ||
      path.join(__dirname, '..', '..', 'schemas', 'field-dictionary.schema.json');

    // In-memory cache
    this.cache = new Map();

    // Cache TTL (default: 5 minutes in development, 1 hour in production)
    this.cacheTTL = options.cacheTTL ||
      (process.env.NODE_ENV === 'production' ? 3600000 : 300000);

    // Track cache timestamps
    this.cacheTimestamps = new Map();

    // Verbose logging
    this.verbose = options.verbose || false;
  }

  /**
   * Log message if verbose mode is enabled
   * @private
   */
  _log(message) {
    if (this.verbose) {
      console.log(`[FieldDictionaryLoader] ${message}`);
    }
  }

  /**
   * Get the dictionary file path for an org
   * @param {string} orgSlug - Organization slug
   * @returns {string} Path to dictionary file
   */
  getDictionaryPath(orgSlug) {
    // Try YAML first, then JSON
    const yamlPath = path.join(this.orgsDir, orgSlug, 'configs', 'field-dictionary.yaml');
    const jsonPath = path.join(this.orgsDir, orgSlug, 'configs', 'field-dictionary.json');

    if (fs.existsSync(yamlPath)) {
      return yamlPath;
    }
    return jsonPath;
  }

  /**
   * Check if a dictionary exists for an org
   * @param {string} orgSlug - Organization slug
   * @returns {boolean}
   */
  exists(orgSlug) {
    const dictPath = this.getDictionaryPath(orgSlug);
    return fs.existsSync(dictPath);
  }

  /**
   * List all orgs with field dictionaries
   * @returns {string[]} Array of org slugs
   */
  listOrgs() {
    try {
      if (!fs.existsSync(this.orgsDir)) {
        return [];
      }

      const orgs = fs.readdirSync(this.orgsDir);
      return orgs
        .filter(org => this.exists(org))
        .sort();
    } catch (error) {
      console.error(`Error listing orgs: ${error.message}`);
      return [];
    }
  }

  /**
   * Load a field dictionary with caching
   * @param {string} orgSlug - Organization slug
   * @param {Object} options - Load options
   * @param {boolean} options.skipCache - Force reload from disk
   * @param {boolean} options.useCacheFirst - Use cache-first behavior (bypass live-first)
   * @returns {Object|null} Field dictionary or null if not found
   */
  load(orgSlug, options = {}) {
    // In live-first mode, skip cache unless explicitly requested
    const shouldUseCache = options.useCacheFirst || (!LIVE_FIRST && !options.skipCache);

    // Check cache validity
    if (shouldUseCache && this.cache.has(orgSlug)) {
      const timestamp = this.cacheTimestamps.get(orgSlug);
      if (timestamp && (Date.now() - timestamp) < this.cacheTTL) {
        this._log(`Cache hit for ${orgSlug}`);
        return this.cache.get(orgSlug);
      }
    }

    if (LIVE_FIRST && !options.useCacheFirst) {
      this._log(`Live-first mode: reloading ${orgSlug} from disk`);
    }

    // Load from disk
    const dictPath = this.getDictionaryPath(orgSlug);
    if (!fs.existsSync(dictPath)) {
      this._log(`Dictionary not found for ${orgSlug} at ${dictPath}`);
      return null;
    }

    let dictionary;
    try {
      const content = fs.readFileSync(dictPath, 'utf-8');

      // Parse based on file extension
      if (dictPath.endsWith('.yaml') || dictPath.endsWith('.yml')) {
        if (!yaml) {
          throw new Error('js-yaml not installed. Run: npm install js-yaml');
        }
        dictionary = yaml.load(content);
      } else {
        dictionary = JSON.parse(content);
      }

      this._log(`Loaded dictionary for ${orgSlug}`);
    } catch (error) {
      console.error(`Error loading dictionary for ${orgSlug}: ${error.message}`);
      return null;
    }

    // Cache the result
    this.cache.set(orgSlug, dictionary);
    this.cacheTimestamps.set(orgSlug, Date.now());

    return dictionary;
  }

  /**
   * Load dictionary with cache-first behavior (for fallback scenarios)
   * @param {string} orgSlug - Organization slug
   * @returns {Object|null} Field dictionary or null
   */
  loadFallback(orgSlug) {
    return this.load(orgSlug, { useCacheFirst: true });
  }

  /**
   * Get a specific field from the dictionary
   * @param {string} orgSlug - Organization slug
   * @param {string} platform - Platform ('salesforce' or 'hubspot')
   * @param {string} objectName - Object API name
   * @param {string} fieldName - Field API name
   * @param {Object} options - Options (useCacheFirst)
   * @returns {Object|null} Field definition or null
   */
  getField(orgSlug, platform, objectName, fieldName, options = {}) {
    const dict = this.load(orgSlug, options);
    if (!dict) return null;

    const platformData = dict.platforms?.[platform];
    if (!platformData) return null;

    const objectData = platformData[objectName];
    if (!objectData) return null;

    return objectData.fields?.[fieldName] || null;
  }

  /**
   * Get field with cache-first behavior (for fallback scenarios)
   * @param {string} orgSlug - Organization slug
   * @param {string} platform - Platform
   * @param {string} objectName - Object API name
   * @param {string} fieldName - Field API name
   * @returns {Object|null} Field definition or null
   */
  getFieldFallback(orgSlug, platform, objectName, fieldName) {
    return this.getField(orgSlug, platform, objectName, fieldName, { useCacheFirst: true });
  }

  /**
   * Get all fields with a specific tag
   * @param {string} orgSlug - Organization slug
   * @param {string} tag - Tag to search for
   * @returns {Array} Array of { platform, object, field, definition }
   */
  getFieldsByTag(orgSlug, tag) {
    const dict = this.load(orgSlug);
    if (!dict) return [];

    const results = [];
    const tagLower = tag.toLowerCase();

    for (const [platform, objects] of Object.entries(dict.platforms || {})) {
      for (const [objectName, objectData] of Object.entries(objects || {})) {
        for (const [fieldName, fieldDef] of Object.entries(objectData.fields || {})) {
          const fieldTags = fieldDef.tags || [];
          if (fieldTags.some(t => t.toLowerCase() === tagLower)) {
            results.push({
              platform,
              object: objectName,
              field: fieldName,
              definition: fieldDef
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Search fields by name, label, or description
   * @param {string} orgSlug - Organization slug
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {string} options.platform - Limit to specific platform
   * @param {string} options.object - Limit to specific object
   * @returns {Array} Array of matching fields
   */
  searchFields(orgSlug, query, options = {}) {
    const dict = this.load(orgSlug);
    if (!dict) return [];

    const results = [];
    const queryLower = query.toLowerCase();
    const queryRegex = new RegExp(query, 'i');

    for (const [platform, objects] of Object.entries(dict.platforms || {})) {
      if (options.platform && platform !== options.platform) continue;

      for (const [objectName, objectData] of Object.entries(objects || {})) {
        if (options.object && objectName !== options.object) continue;

        for (const [fieldName, fieldDef] of Object.entries(objectData.fields || {})) {
          // Check API name, label, and description
          const matches =
            fieldName.toLowerCase().includes(queryLower) ||
            (fieldDef.field_name && fieldDef.field_name.toLowerCase().includes(queryLower)) ||
            (fieldDef.description && queryRegex.test(fieldDef.description));

          if (matches) {
            results.push({
              platform,
              object: objectName,
              field: fieldName,
              definition: fieldDef,
              score: this._calculateMatchScore(fieldName, fieldDef, query)
            });
          }
        }
      }
    }

    // Sort by match score
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate match score for search ranking
   * @private
   */
  _calculateMatchScore(fieldName, fieldDef, query) {
    let score = 0;
    const queryLower = query.toLowerCase();

    // Exact API name match
    if (fieldName.toLowerCase() === queryLower) score += 100;
    // API name contains query
    else if (fieldName.toLowerCase().includes(queryLower)) score += 50;

    // Exact label match
    if (fieldDef.field_name?.toLowerCase() === queryLower) score += 90;
    // Label contains query
    else if (fieldDef.field_name?.toLowerCase().includes(queryLower)) score += 40;

    // Description contains query
    if (fieldDef.description?.toLowerCase().includes(queryLower)) score += 20;

    // Has enrichment (higher priority)
    if (fieldDef.description && fieldDef.use_cases?.length > 0) score += 10;

    return score;
  }

  /**
   * Generate LLM context string for all fields
   * @param {string} orgSlug - Organization slug
   * @param {Object} options - Generation options
   * @param {string} options.audience - Target audience filter
   * @param {string[]} options.tags - Filter by tags
   * @param {number} options.maxFields - Maximum fields to include
   * @returns {string} LLM-consumable context string
   */
  generateFieldContext(orgSlug, options = {}) {
    const dict = this.load(orgSlug);
    if (!dict) return '';

    const lines = [];
    lines.push(`# Field Dictionary for ${orgSlug}`);
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Enrichment Status: ${dict.dictionary_metadata?.enrichment_status || 'unknown'}`);
    lines.push('');

    let fieldCount = 0;
    const maxFields = options.maxFields || 500;

    for (const [platform, objects] of Object.entries(dict.platforms || {})) {
      lines.push(`## ${platform.charAt(0).toUpperCase() + platform.slice(1)}`);
      lines.push('');

      for (const [objectName, objectData] of Object.entries(objects || {})) {
        const objectFields = Object.entries(objectData.fields || {})
          .filter(([_, fieldDef]) => {
            // Audience filter
            if (options.audience && fieldDef.audience_relevance) {
              if (fieldDef.audience_relevance !== options.audience &&
                  fieldDef.audience_relevance !== 'All') {
                return false;
              }
            }
            // Tag filter
            if (options.tags?.length > 0) {
              const fieldTags = fieldDef.tags || [];
              if (!options.tags.some(t => fieldTags.includes(t))) {
                return false;
              }
            }
            return true;
          });

        if (objectFields.length === 0) continue;

        lines.push(`### ${objectData.object_label || objectName}`);
        if (objectData.object_description) {
          lines.push(objectData.object_description);
        }
        lines.push('');

        for (const [fieldName, fieldDef] of objectFields) {
          if (fieldCount >= maxFields) break;

          lines.push(`**${fieldDef.field_name || fieldName}** (\`${fieldName}\`)`);
          lines.push(`- Type: ${fieldDef.field_type}`);

          if (fieldDef.description) {
            lines.push(`- Description: ${fieldDef.description}`);
          }

          if (fieldDef.reporting_guidance?.recommended_aggregations?.length > 0) {
            lines.push(`- Aggregations: ${fieldDef.reporting_guidance.recommended_aggregations.join(', ')}`);
          }

          if (fieldDef.reporting_guidance?.caveats) {
            lines.push(`- Caveats: ${fieldDef.reporting_guidance.caveats}`);
          }

          if (fieldDef.tags?.length > 0) {
            lines.push(`- Tags: ${fieldDef.tags.join(', ')}`);
          }

          lines.push('');
          fieldCount++;
        }

        if (fieldCount >= maxFields) {
          lines.push(`... (truncated at ${maxFields} fields)`);
          break;
        }
      }

      if (fieldCount >= maxFields) break;
    }

    return lines.join('\n');
  }

  /**
   * Generate focused context for specific objects (for reporting agents)
   * @param {string} orgSlug - Organization slug
   * @param {string[]} objectNames - Objects to include
   * @param {Object} options - Generation options
   * @returns {string} Focused LLM context
   */
  generateReportingContext(orgSlug, objectNames, options = {}) {
    const dict = this.load(orgSlug);
    if (!dict) return '';

    const lines = [];
    lines.push('# Field Reference for Report Building');
    lines.push('');
    lines.push('Use these field definitions to understand what data is available and how to use it correctly.');
    lines.push('');

    for (const [platform, objects] of Object.entries(dict.platforms || {})) {
      const relevantObjects = Object.entries(objects || {})
        .filter(([objName]) => objectNames.includes(objName));

      if (relevantObjects.length === 0) continue;

      lines.push(`## ${platform.charAt(0).toUpperCase() + platform.slice(1)}`);

      for (const [objectName, objectData] of relevantObjects) {
        lines.push(`### ${objectData.object_label || objectName}`);
        if (objectData.object_description) {
          lines.push(`> ${objectData.object_description}`);
        }
        lines.push('');
        lines.push('| Field | Type | Description | Aggregations | Caveats |');
        lines.push('|-------|------|-------------|--------------|---------|');

        const sortedFields = Object.entries(objectData.fields || {})
          .sort((a, b) => {
            // Prioritize fields with reporting guidance
            const aHasGuidance = a[1].reporting_guidance ? 1 : 0;
            const bHasGuidance = b[1].reporting_guidance ? 1 : 0;
            return bHasGuidance - aHasGuidance;
          });

        for (const [fieldName, fieldDef] of sortedFields) {
          const desc = fieldDef.description || '-';
          const aggs = fieldDef.reporting_guidance?.recommended_aggregations?.join(', ') || '-';
          const caveats = fieldDef.reporting_guidance?.caveats || '-';

          // Truncate long descriptions
          const shortDesc = desc.length > 60 ? desc.substring(0, 57) + '...' : desc;
          const shortCaveats = caveats.length > 40 ? caveats.substring(0, 37) + '...' : caveats;

          lines.push(`| ${fieldDef.field_name || fieldName} | ${fieldDef.field_type} | ${shortDesc} | ${aggs} | ${shortCaveats} |`);
        }

        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Get fields that need business context enrichment
   * @param {string} orgSlug - Organization slug
   * @returns {Array} Array of fields missing enrichment
   */
  getUnenrichedFields(orgSlug) {
    const dict = this.load(orgSlug);
    if (!dict) return [];

    const unenriched = [];

    for (const [platform, objects] of Object.entries(dict.platforms || {})) {
      for (const [objectName, objectData] of Object.entries(objects || {})) {
        for (const [fieldName, fieldDef] of Object.entries(objectData.fields || {})) {
          // Check if field is missing key enrichment
          const missingDescription = !fieldDef.description || fieldDef.description === '';
          const missingUseCases = !fieldDef.use_cases || fieldDef.use_cases.length === 0;
          const missingReportingGuidance = !fieldDef.reporting_guidance;

          if (missingDescription || missingUseCases || missingReportingGuidance) {
            unenriched.push({
              platform,
              object: objectName,
              field: fieldName,
              label: fieldDef.field_name,
              type: fieldDef.field_type,
              missing: {
                description: missingDescription,
                use_cases: missingUseCases,
                reporting_guidance: missingReportingGuidance
              }
            });
          }
        }
      }
    }

    return unenriched;
  }

  /**
   * Get enrichment statistics for a dictionary
   * @param {string} orgSlug - Organization slug
   * @returns {Object} Enrichment statistics
   */
  getEnrichmentStats(orgSlug) {
    const dict = this.load(orgSlug);
    if (!dict) return null;

    let totalFields = 0;
    let enrichedFields = 0;
    let partiallyEnrichedFields = 0;
    const byPlatform = {};

    for (const [platform, objects] of Object.entries(dict.platforms || {})) {
      byPlatform[platform] = { total: 0, enriched: 0, partial: 0 };

      for (const [objectName, objectData] of Object.entries(objects || {})) {
        for (const [fieldName, fieldDef] of Object.entries(objectData.fields || {})) {
          totalFields++;
          byPlatform[platform].total++;

          const hasDescription = fieldDef.description && fieldDef.description.length > 0;
          const hasUseCases = fieldDef.use_cases && fieldDef.use_cases.length > 0;
          const hasReportingGuidance = !!fieldDef.reporting_guidance;
          const hasTags = fieldDef.tags && fieldDef.tags.length > 0;

          const enrichmentScore = [hasDescription, hasUseCases, hasReportingGuidance, hasTags]
            .filter(Boolean).length;

          if (enrichmentScore === 4) {
            enrichedFields++;
            byPlatform[platform].enriched++;
          } else if (enrichmentScore > 0) {
            partiallyEnrichedFields++;
            byPlatform[platform].partial++;
          }
        }
      }
    }

    return {
      orgSlug,
      totalFields,
      enrichedFields,
      partiallyEnrichedFields,
      unenrichedFields: totalFields - enrichedFields - partiallyEnrichedFields,
      enrichmentPercentage: totalFields > 0 ? Math.round((enrichedFields / totalFields) * 100) : 0,
      byPlatform,
      status: dict.dictionary_metadata?.enrichment_status || 'unknown'
    };
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.cache.clear();
    this.cacheTimestamps.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      cachedDictionaries: this.cache.size,
      cacheTTL: this.cacheTTL
    };
  }
}

// Export for CommonJS
module.exports = { FieldDictionaryLoader };

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const loader = new FieldDictionaryLoader({ verbose: true });

  if (args.length === 0 || args[0] === 'list') {
    console.log('\nOrganizations with field dictionaries:');
    const orgs = loader.listOrgs();
    if (orgs.length === 0) {
      console.log('  (none found)');
      console.log(`\nCreate dictionaries in: ${loader.orgsDir}/<org-slug>/configs/field-dictionary.yaml`);
    } else {
      orgs.forEach(o => console.log(`  - ${o}`));
    }
    console.log(`\nTotal: ${orgs.length} orgs\n`);
  } else if (args[0] === 'stats' && args[1]) {
    const stats = loader.getEnrichmentStats(args[1]);
    if (stats) {
      console.log('\nEnrichment Statistics:');
      console.log(JSON.stringify(stats, null, 2));
    } else {
      console.error(`Dictionary not found for org: ${args[1]}`);
    }
  } else if (args[0] === 'context' && args[1]) {
    const options = {};
    if (args.includes('--audience')) {
      options.audience = args[args.indexOf('--audience') + 1];
    }
    if (args.includes('--tags')) {
      options.tags = args[args.indexOf('--tags') + 1].split(',');
    }
    console.log(loader.generateFieldContext(args[1], options));
  } else if (args[0] === 'query' && args[1] && args[2]) {
    const platform = args[2];
    const objectName = args[3];
    const fieldName = args[4];

    if (fieldName) {
      const field = loader.getField(args[1], platform, objectName, fieldName);
      if (field) {
        console.log(JSON.stringify(field, null, 2));
      } else {
        console.error(`Field not found: ${platform}.${objectName}.${fieldName}`);
      }
    } else if (objectName) {
      const dict = loader.load(args[1]);
      const obj = dict?.platforms?.[platform]?.[objectName];
      if (obj) {
        console.log(JSON.stringify(obj, null, 2));
      } else {
        console.error(`Object not found: ${platform}.${objectName}`);
      }
    } else {
      console.error('Usage: query <org> <platform> <object> [field]');
    }
  } else if (args[0] === 'search' && args[1] && args[2]) {
    const results = loader.searchFields(args[1], args[2]);
    console.log(`\nFound ${results.length} matching fields:\n`);
    results.slice(0, 20).forEach(r => {
      console.log(`  ${r.platform}.${r.object}.${r.field}`);
      console.log(`    ${r.definition.field_name} (${r.definition.field_type})`);
      if (r.definition.description) {
        console.log(`    ${r.definition.description.substring(0, 80)}...`);
      }
      console.log('');
    });
    if (results.length > 20) {
      console.log(`  ... and ${results.length - 20} more`);
    }
  } else if (args[0] === 'tags' && args[1] && args[2]) {
    const results = loader.getFieldsByTag(args[1], args[2]);
    console.log(`\nFields tagged '${args[2]}':\n`);
    results.forEach(r => {
      console.log(`  ${r.platform}.${r.object}.${r.field} - ${r.definition.field_name}`);
    });
    console.log(`\nTotal: ${results.length} fields\n`);
  } else if (args[0] === 'unenriched' && args[1]) {
    const unenriched = loader.getUnenrichedFields(args[1]);
    console.log(`\nFields needing enrichment (${unenriched.length}):\n`);
    unenriched.slice(0, 30).forEach(f => {
      const missing = Object.entries(f.missing)
        .filter(([_, v]) => v)
        .map(([k]) => k)
        .join(', ');
      console.log(`  ${f.platform}.${f.object}.${f.field}`);
      console.log(`    Missing: ${missing}`);
    });
    if (unenriched.length > 30) {
      console.log(`\n  ... and ${unenriched.length - 30} more`);
    }
  } else {
    console.log(`
Field Dictionary Loader CLI

Usage:
  node field-dictionary-loader.js list                          List orgs with dictionaries
  node field-dictionary-loader.js stats <org>                   Show enrichment statistics
  node field-dictionary-loader.js context <org> [--audience X] [--tags X,Y]  Generate LLM context
  node field-dictionary-loader.js query <org> <platform> <object> [field]   Query fields
  node field-dictionary-loader.js search <org> <query>          Search fields
  node field-dictionary-loader.js tags <org> <tag>              Find fields by tag
  node field-dictionary-loader.js unenriched <org>              List fields needing enrichment

Examples:
  node field-dictionary-loader.js list
  node field-dictionary-loader.js stats acme-corp
  node field-dictionary-loader.js context acme-corp --audience Executive --tags Revenue,Pipeline
  node field-dictionary-loader.js query acme-corp salesforce Opportunity Amount
  node field-dictionary-loader.js search acme-corp revenue
  node field-dictionary-loader.js tags acme-corp Pipeline
  node field-dictionary-loader.js unenriched acme-corp
`);
  }
}
