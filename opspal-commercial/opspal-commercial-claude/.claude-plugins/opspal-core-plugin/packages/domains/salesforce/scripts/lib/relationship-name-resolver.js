#!/usr/bin/env node

/**
 * Relationship Name Resolver
 *
 * Dynamically queries Salesforce objects to find actual child relationship names.
 * Prevents hardcoded relationship errors (e.g., using "Tiers__r" when actual name is "DiscountTiers__r").
 *
 * Caches results in project data/org-schema-cache.json for performance.
 *
 * Usage:
 *   const resolver = require('./relationship-name-resolver');
 *   const relName = await resolver.getRelationshipName('myorg', 'SBQQ__DiscountSchedule__c', 'SBQQ__DiscountTier__c');
 *   const allRels = await resolver.getAllChildRelationships('myorg', 'SBQQ__Quote__c');
 *
 * @module relationship-name-resolver
 * @version 1.0.0
 * @created 2025-10-08
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Get cache file path for org
 *
 * @param {string} orgAlias - Salesforce org alias
 * @returns {string} Path to cache file
 */
function getCachePath(orgAlias) {
  // Try to find project directory
  const cwd = process.cwd();

  // Check if we're in a project with data directory
  if (fs.existsSync(path.join(cwd, 'data'))) {
    return path.join(cwd, 'data', 'org-schema-cache.json');
  }

  // Fall back to instances directory
  if (cwd.includes('/instances/')) {
    const instanceMatch = cwd.match(/\/instances\/([^\/]+)/);
    if (instanceMatch) {
      const instanceDir = cwd.substring(0, cwd.indexOf(instanceMatch[0]) + instanceMatch[0].length);
      const dataDir = path.join(instanceDir, 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      return path.join(dataDir, 'org-schema-cache.json');
    }
  }

  // Last resort: temp directory
  const tempDir = path.join('/tmp', 'salesforce-schema-cache');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return path.join(tempDir, `${orgAlias}-schema-cache.json`);
}

/**
 * Load cache from disk
 *
 * @param {string} orgAlias - Salesforce org alias
 * @returns {Object} Cached schema data or empty object
 */
function loadCache(orgAlias) {
  const cachePath = getCachePath(orgAlias);

  if (fs.existsSync(cachePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));

      // Check if cache is stale (older than 24 hours)
      if (data.timestamp) {
        const cacheAge = Date.now() - new Date(data.timestamp).getTime();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        if (cacheAge < maxAge) {
          return data;
        }
      }
    } catch (error) {
      // Cache corrupted, will rebuild
    }
  }

  return {
    orgAlias,
    timestamp: new Date().toISOString(),
    objects: {}
  };
}

/**
 * Save cache to disk
 *
 * @param {string} orgAlias - Salesforce org alias
 * @param {Object} cacheData - Data to cache
 */
function saveCache(orgAlias, cacheData) {
  const cachePath = getCachePath(orgAlias);
  cacheData.timestamp = new Date().toISOString();

  fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
}

/**
 * Query Salesforce for object metadata
 *
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} objectName - API name of object
 * @returns {Object} Object metadata including child relationships
 */
function queryObjectMetadata(orgAlias, objectName) {
  try {
    const cmd = `sf sobject describe --sobject ${objectName} --target-org ${orgAlias} --json`;
    const result = JSON.parse(execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }));

    if (result.status !== 0) {
      throw new Error(`Failed to describe ${objectName}: ${result.message}`);
    }

    return result.result;
  } catch (error) {
    throw new Error(`Error querying ${objectName}: ${error.message}`);
  }
}

/**
 * Get all child relationships for an object
 *
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} parentObject - API name of parent object
 * @param {boolean} useCache - Whether to use cache (default: true)
 * @returns {Object} Map of child object to relationship name
 */
function getAllChildRelationships(orgAlias, parentObject, useCache = true) {
  // Check cache first
  if (useCache) {
    const cache = loadCache(orgAlias);
    if (cache.objects[parentObject]?.relationships) {
      return cache.objects[parentObject].relationships;
    }
  }

  // Query Salesforce
  const metadata = queryObjectMetadata(orgAlias, parentObject);

  const relationships = {};

  if (metadata.childRelationships) {
    metadata.childRelationships.forEach(rel => {
      if (rel.relationshipName) {
        relationships[rel.childSObject] = {
          relationshipName: rel.relationshipName,
          field: rel.field,
          cascadeDelete: rel.cascadeDelete,
          restrictedDelete: rel.restrictedDelete
        };
      }
    });
  }

  // Update cache
  if (useCache) {
    const cache = loadCache(orgAlias);
    if (!cache.objects[parentObject]) {
      cache.objects[parentObject] = {};
    }
    cache.objects[parentObject].relationships = relationships;
    cache.objects[parentObject].lastUpdated = new Date().toISOString();
    saveCache(orgAlias, cache);
  }

  return relationships;
}

/**
 * Get relationship name for specific child object
 *
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} parentObject - API name of parent object
 * @param {string} childObject - API name of child object
 * @param {boolean} useCache - Whether to use cache (default: true)
 * @returns {string|null} Relationship name or null if not found
 */
function getRelationshipName(orgAlias, parentObject, childObject, useCache = true) {
  const relationships = getAllChildRelationships(orgAlias, parentObject, useCache);

  if (relationships[childObject]) {
    return relationships[childObject].relationshipName;
  }

  return null;
}

/**
 * Generate relationship lookup table for common SBQQ objects
 *
 * @param {string} orgAlias - Salesforce org alias
 * @returns {Object} Complete relationship mapping
 */
function generateSBQQRelationshipMap(orgAlias) {
  console.log(`\n🔍 Mapping SBQQ object relationships in org: ${orgAlias}\n`);

  const sbqqObjects = [
    'SBQQ__Quote__c',
    'SBQQ__PriceRule__c',
    'SBQQ__ProductRule__c',
    'SBQQ__DiscountSchedule__c',
    'SBQQ__ProductOption__c',
    'SBQQ__ProductFeature__c',
    'Product2'
  ];

  const relationshipMap = {
    orgAlias,
    timestamp: new Date().toISOString(),
    objects: {}
  };

  sbqqObjects.forEach(objectName => {
    try {
      console.log(`📋 ${objectName}...`);
      const relationships = getAllChildRelationships(orgAlias, objectName, true);
      relationshipMap.objects[objectName] = relationships;

      const relCount = Object.keys(relationships).length;
      console.log(`   ✅ Found ${relCount} child relationships`);

      // Show key relationships
      Object.entries(relationships).forEach(([childObj, relInfo]) => {
        if (childObj.startsWith('SBQQ__')) {
          console.log(`      ${childObj} → ${relInfo.relationshipName}`);
        }
      });

    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      relationshipMap.objects[objectName] = { error: error.message };
    }
  });

  console.log(`\n✅ Relationship map generated for ${sbqqObjects.length} objects\n`);

  return relationshipMap;
}

/**
 * Validate and fix relationship name in SOQL query
 *
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} query - SOQL query with potential incorrect relationship name
 * @returns {Object} { valid: boolean, correctedQuery: string, errors: [] }
 */
function validateAndFixRelationships(orgAlias, query) {
  const result = {
    valid: true,
    correctedQuery: query,
    errors: [],
    fixes: []
  };

  // Extract subqueries
  const subqueryPattern = /\(SELECT\s+.*?\s+FROM\s+(\w+)__r\)/gis;
  const matches = [...query.matchAll(subqueryPattern)];

  if (matches.length === 0) {
    return result; // No relationships to validate
  }

  // Extract parent object from main query
  const fromMatch = query.match(/FROM\s+(\w+(?:__c)?)/i);
  if (!fromMatch) {
    result.valid = false;
    result.errors.push('Could not parse parent object from query');
    return result;
  }

  const parentObject = fromMatch[1];

  // Get all relationships for parent
  try {
    const relationships = getAllChildRelationships(orgAlias, parentObject);

    // Check each subquery relationship
    matches.forEach(match => {
      const usedRelName = match[1] + '__r';
      const fullMatch = match[0];

      // Find which child object this should be
      let correctRelName = null;
      let childObject = null;

      Object.entries(relationships).forEach(([childObj, relInfo]) => {
        if (relInfo.relationshipName === usedRelName) {
          // Relationship name is correct
          correctRelName = usedRelName;
          childObject = childObj;
        } else if (childObj.includes(usedRelName.replace('__r', ''))) {
          // Potential match - name is similar
          correctRelName = relInfo.relationshipName;
          childObject = childObj;
        }
      });

      if (!correctRelName) {
        result.valid = false;
        result.errors.push(`Relationship "${usedRelName}" not found in ${parentObject}`);
      } else if (correctRelName !== usedRelName) {
        // Need to fix
        result.valid = false;
        const correctedSubquery = fullMatch.replace(usedRelName, correctRelName);
        result.correctedQuery = result.correctedQuery.replace(fullMatch, correctedSubquery);
        result.fixes.push({
          from: usedRelName,
          to: correctRelName,
          childObject
        });
      }
    });

  } catch (error) {
    result.valid = false;
    result.errors.push(`Error validating relationships: ${error.message}`);
  }

  return result;
}

/**
 * Clear cache for org
 *
 * @param {string} orgAlias - Salesforce org alias
 */
function clearCache(orgAlias) {
  const cachePath = getCachePath(orgAlias);
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
    console.log(`✅ Cache cleared for ${orgAlias}`);
  } else {
    console.log(`ℹ️  No cache found for ${orgAlias}`);
  }
}

// Export functions
module.exports = {
  getRelationshipName,
  getAllChildRelationships,
  generateSBQQRelationshipMap,
  validateAndFixRelationships,
  clearCache,
  getCachePath
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log(`
Usage: relationship-name-resolver.js <org-alias> [options]

Options:
  --map                 Generate complete SBQQ relationship map
  --get <parent> <child>  Get relationship name for specific objects
  --validate <query>    Validate and fix relationship names in query
  --clear               Clear cached relationships

Examples:
  node relationship-name-resolver.js myorg --map
  node relationship-name-resolver.js myorg --get SBQQ__DiscountSchedule__c SBQQ__DiscountTier__c
  node relationship-name-resolver.js myorg --validate "SELECT Id, (SELECT Id FROM Tiers__r) FROM SBQQ__DiscountSchedule__c"
  node relationship-name-resolver.js myorg --clear
    `);
    process.exit(1);
  }

  const orgAlias = args[0];

  if (args.includes('--map')) {
    const map = generateSBQQRelationshipMap(orgAlias);
    console.log('\nSaving to relationship-map.json...');
    fs.writeFileSync('relationship-map.json', JSON.stringify(map, null, 2));
    console.log('✅ Done!\n');

  } else if (args.includes('--get')) {
    const parentIdx = args.indexOf('--get') + 1;
    const parentObject = args[parentIdx];
    const childObject = args[parentIdx + 1];

    if (!parentObject || !childObject) {
      console.error('Error: Both parent and child object names required');
      process.exit(1);
    }

    const relName = getRelationshipName(orgAlias, parentObject, childObject);
    if (relName) {
      console.log(`\n✅ ${parentObject}.${relName} → ${childObject}\n`);
    } else {
      console.log(`\n❌ No relationship found from ${parentObject} to ${childObject}\n`);
      process.exit(1);
    }

  } else if (args.includes('--validate')) {
    const queryIdx = args.indexOf('--validate') + 1;
    const query = args[queryIdx];

    if (!query) {
      console.error('Error: Query string required');
      process.exit(1);
    }

    const result = validateAndFixRelationships(orgAlias, query);

    if (result.valid) {
      console.log('\n✅ Query relationships are valid\n');
    } else {
      console.log('\n⚠️  Issues found:\n');
      result.errors.forEach(err => console.log(`   ❌ ${err}`));

      if (result.fixes.length > 0) {
        console.log('\n🔧 Suggested fixes:\n');
        result.fixes.forEach(fix => {
          console.log(`   ${fix.from} → ${fix.to} (${fix.childObject})`);
        });

        console.log('\n📝 Corrected query:\n');
        console.log(result.correctedQuery);
      }
      console.log('');
    }

  } else if (args.includes('--clear')) {
    clearCache(orgAlias);

  } else {
    // Default: generate map
    generateSBQQRelationshipMap(orgAlias);
  }
}
