/**
 * Territory Field Detector
 *
 * Auto-detects Territory2 fields on objects to prevent manual discovery
 * and ensure correct field references in territory operations.
 *
 * Related reflections: e39d9e86
 * ROI: $3,000/yr
 *
 * @module territory-field-detector
 */

const { execSync } = require('child_process');

// Standard Territory2 related fields
const STANDARD_TERRITORY_FIELDS = {
  // Account object
  Account: [
    'Territory2',          // Lookup to Territory2
    'Territory2Id',        // The ID field
    'Sync_Territory2__c'   // Common custom field
  ],
  // User Assignment
  UserTerritory2Association: [
    'Territory2Id',
    'UserId',
    'IsActive',
    'RoleInTerritory2'
  ],
  // Object Territory Assignment
  ObjectTerritory2Association: [
    'Territory2Id',
    'ObjectId',
    'AssociationCause'
  ]
};

// Common custom territory field patterns
const TERRITORY_FIELD_PATTERNS = [
  /territory/i,
  /region/i,
  /area/i,
  /district/i,
  /geo/i,
  /zone/i
];

/**
 * Describe object to get all fields
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} objectName - Object API name
 * @returns {Object[]} Array of field definitions
 */
function describeObject(orgAlias, objectName) {
  try {
    const output = execSync(
      `sf sobject describe --sobject ${objectName} --target-org ${orgAlias} --json`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );

    const response = JSON.parse(output);
    return response.result?.fields || [];
  } catch (err) {
    return [];
  }
}

/**
 * Query Territory2 model information
 * @param {string} orgAlias - Salesforce org alias
 * @returns {Object} Territory2 model details
 */
function queryTerritoryModel(orgAlias) {
  const result = {
    hasTerritory2: false,
    activeModel: null,
    models: [],
    error: null
  };

  try {
    const output = execSync(
      `sf data query --query "SELECT Id, Name, DeveloperName, State, ActivatedDate FROM Territory2Model" --target-org ${orgAlias} --json`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );

    const response = JSON.parse(output);
    if (response.result?.records?.length > 0) {
      result.hasTerritory2 = true;
      result.models = response.result.records;

      // Find active model
      result.activeModel = response.result.records.find(m => m.State === 'Active');
    }
  } catch (err) {
    // Territory2Model may not exist if Enterprise Territory Management not enabled
    result.error = 'Territory2Model not found - Enterprise Territory Management may not be enabled';
  }

  return result;
}

/**
 * Detect territory-related fields on an object
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} objectName - Object API name
 * @returns {Object} Detection result
 */
function detectTerritoryFields(orgAlias, objectName) {
  const result = {
    object: objectName,
    hasTerritory2Lookup: false,
    territoryFields: [],
    customTerritoryFields: [],
    relatedObjects: [],
    recommendations: []
  };

  // Get object fields
  const fields = describeObject(orgAlias, objectName);

  if (fields.length === 0) {
    result.error = `Could not describe object: ${objectName}`;
    return result;
  }

  for (const field of fields) {
    // Check for standard Territory2 lookup
    if (field.referenceTo?.includes('Territory2')) {
      result.hasTerritory2Lookup = true;
      result.territoryFields.push({
        name: field.name,
        label: field.label,
        type: 'standard_lookup',
        referenceTo: 'Territory2',
        description: 'Standard Territory2 lookup field'
      });
    }

    // Check for custom territory-related fields
    if (field.custom) {
      for (const pattern of TERRITORY_FIELD_PATTERNS) {
        if (pattern.test(field.name) || pattern.test(field.label)) {
          result.customTerritoryFields.push({
            name: field.name,
            label: field.label,
            type: field.type,
            referenceTo: field.referenceTo?.[0] || null,
            matchedPattern: pattern.source
          });
          break;
        }
      }
    }

    // Check for relationships to Territory2 related objects
    if (field.referenceTo?.some(ref =>
        ref === 'Territory2' ||
        ref === 'Territory2Model' ||
        ref === 'Territory2Type'
    )) {
      result.relatedObjects.push({
        field: field.name,
        referenceTo: field.referenceTo[0]
      });
    }
  }

  // Generate recommendations
  if (!result.hasTerritory2Lookup && objectName === 'Account') {
    result.recommendations.push(
      'Account does not have Territory2 enabled. Enable Enterprise Territory Management to add territory assignment.'
    );
  }

  if (result.customTerritoryFields.length > 0 && result.hasTerritory2Lookup) {
    result.recommendations.push(
      'Both standard Territory2 and custom territory fields found. Consider consolidating to standard Territory2 for better functionality.'
    );
  }

  if (result.customTerritoryFields.length > 0 && !result.hasTerritory2Lookup) {
    result.recommendations.push(
      'Custom territory fields found but no standard Territory2. Consider migrating to Enterprise Territory Management.'
    );
  }

  return result;
}

/**
 * Generate territory field mapping for an org
 * @param {string} orgAlias - Salesforce org alias
 * @param {string[]} objects - Objects to analyze (default: common objects)
 * @returns {Object} Complete territory field mapping
 */
function generateTerritoryMapping(orgAlias, objects = null) {
  const result = {
    orgAlias,
    timestamp: new Date().toISOString(),
    territoryModel: null,
    objectMappings: {},
    summary: {
      objectsAnalyzed: 0,
      objectsWithTerritory: 0,
      totalTerritoryFields: 0,
      totalCustomFields: 0
    }
  };

  // Check if Territory2 is enabled
  result.territoryModel = queryTerritoryModel(orgAlias);

  // Default objects if not specified
  if (!objects) {
    objects = ['Account', 'Opportunity', 'Lead', 'Contact', 'User'];
  }

  for (const objectName of objects) {
    const detection = detectTerritoryFields(orgAlias, objectName);
    result.objectMappings[objectName] = detection;
    result.summary.objectsAnalyzed++;

    if (detection.hasTerritory2Lookup || detection.customTerritoryFields.length > 0) {
      result.summary.objectsWithTerritory++;
    }

    result.summary.totalTerritoryFields += detection.territoryFields.length;
    result.summary.totalCustomFields += detection.customTerritoryFields.length;
  }

  return result;
}

/**
 * Get field reference for territory operations
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} objectName - Object API name
 * @returns {Object} Field reference for territory operations
 */
function getTerritoryFieldReference(orgAlias, objectName) {
  const detection = detectTerritoryFields(orgAlias, objectName);

  const reference = {
    object: objectName,
    primaryTerritoryField: null,
    allTerritoryFields: [],
    usageNotes: []
  };

  // Prefer standard Territory2 field
  if (detection.territoryFields.length > 0) {
    reference.primaryTerritoryField = detection.territoryFields[0].name;
    reference.allTerritoryFields = detection.territoryFields.map(f => f.name);
    reference.usageNotes.push('Use standard Territory2 field for assignment operations');
  } else if (detection.customTerritoryFields.length > 0) {
    // Fall back to custom
    reference.primaryTerritoryField = detection.customTerritoryFields[0].name;
    reference.allTerritoryFields = detection.customTerritoryFields.map(f => f.name);
    reference.usageNotes.push('Using custom territory field - standard Territory2 not available');
  } else {
    reference.usageNotes.push(`No territory fields found on ${objectName}`);
  }

  return reference;
}

/**
 * Validate territory assignment data
 * @param {Object[]} records - Records with territory assignments
 * @param {string} territoryField - Field name for territory
 * @param {string[]} validTerritoryIds - List of valid Territory2 IDs
 * @returns {Object} Validation result
 */
function validateTerritoryAssignments(records, territoryField, validTerritoryIds) {
  const result = {
    valid: true,
    totalRecords: records.length,
    validAssignments: 0,
    invalidAssignments: [],
    missingField: []
  };

  const validIds = new Set(validTerritoryIds);

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    if (!(territoryField in record)) {
      result.missingField.push({
        index: i,
        recordId: record.Id || `row ${i}`
      });
      continue;
    }

    const territoryId = record[territoryField];

    if (territoryId && !validIds.has(territoryId)) {
      result.valid = false;
      result.invalidAssignments.push({
        index: i,
        recordId: record.Id || `row ${i}`,
        invalidTerritoryId: territoryId
      });
    } else {
      result.validAssignments++;
    }
  }

  return result;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'detect':
      if (!args[1] || !args[2]) {
        console.error('Usage: territory-field-detector.js detect <org-alias> <object>');
        process.exit(1);
      }
      const detection = detectTerritoryFields(args[1], args[2]);
      console.log(JSON.stringify(detection, null, 2));
      break;

    case 'mapping':
      if (!args[1]) {
        console.error('Usage: territory-field-detector.js mapping <org-alias> [objects-comma-separated]');
        process.exit(1);
      }
      const objects = args[2] ? args[2].split(',').map(o => o.trim()) : null;
      const mapping = generateTerritoryMapping(args[1], objects);
      console.log(JSON.stringify(mapping, null, 2));
      break;

    case 'reference':
      if (!args[1] || !args[2]) {
        console.error('Usage: territory-field-detector.js reference <org-alias> <object>');
        process.exit(1);
      }
      const reference = getTerritoryFieldReference(args[1], args[2]);
      console.log(JSON.stringify(reference, null, 2));
      break;

    case 'model':
      if (!args[1]) {
        console.error('Usage: territory-field-detector.js model <org-alias>');
        process.exit(1);
      }
      const model = queryTerritoryModel(args[1]);
      console.log(JSON.stringify(model, null, 2));
      break;

    default:
      console.log(`Territory Field Detector

Usage:
  territory-field-detector.js detect <org> <object>       Detect territory fields on object
  territory-field-detector.js mapping <org> [objects]     Generate full territory mapping
  territory-field-detector.js reference <org> <object>    Get field reference for operations
  territory-field-detector.js model <org>                 Check Territory2 model status

Detects:
  - Standard Territory2 lookup fields
  - Custom territory-related fields (territory, region, area, etc.)
  - Territory2Model enablement
  - Related territory objects

Examples:
  # Check Account territory fields
  node territory-field-detector.js detect my-org Account

  # Generate mapping for multiple objects
  node territory-field-detector.js mapping my-org Account,Opportunity,Lead

  # Get field reference for operations
  node territory-field-detector.js reference my-org Account

  # Check if Territory2 is enabled
  node territory-field-detector.js model my-org
`);
  }
}

module.exports = {
  STANDARD_TERRITORY_FIELDS,
  TERRITORY_FIELD_PATTERNS,
  describeObject,
  queryTerritoryModel,
  detectTerritoryFields,
  generateTerritoryMapping,
  getTerritoryFieldReference,
  validateTerritoryAssignments
};
