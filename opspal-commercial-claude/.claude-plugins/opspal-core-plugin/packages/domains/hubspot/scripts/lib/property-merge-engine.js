/**
 * Phase 2: Property Merge Engine
 *
 * Safely merges properties from duplicate companies to master:
 * - Only fills EMPTY properties on master (never overwrites)
 * - Uses allowlist for merge-safe properties
 * - Never touches Salesforce-synced fields
 * - Logs all property fills for audit trail
 */

/**
 * Properties that are safe to merge
 * These are standard HubSpot fields that won't break Salesforce sync
 */
const MERGE_SAFE_PROPERTIES = [
  // Contact information
  'phone',
  'city',
  'state',
  'zip',
  'country',
  'address',
  'address2',

  // Company details
  'industry',
  'numberofemployees',
  'annualrevenue',
  'description',
  'timezone',
  'type',
  'founded_year',

  // Social/Web
  'linkedin_company_page',
  'twitterhandle',
  'facebook_company_page',
  'googleplus_page',
  'linkedinbio',

  // Hierarchy (will be handled specially)
  'hs_parent_company_id',
  'hs_num_child_companies',

  // Custom properties (examples - adjust based on portal)
  'property_count',
  'units_managed',
  'markets_served',

  // Calculated/derived fields that are safe
  'total_revenue',
  'total_money_raised'
];

/**
 * Properties that should NEVER be touched during merge
 * Primarily Salesforce-synced fields
 */
const SALESFORCE_PROTECTED = [
  'hs_salesforce_object_id',
  'hs_salesforce_account_id',
  'hs_salesforce_record_id',
  'hs_salesforce_last_sync',
  'hs_salesforce_sync_status',
  'hs_salesforce_last_sync_error'
];

/**
 * Additional protected fields (system-managed)
 */
const SYSTEM_PROTECTED = [
  'hs_object_id',
  'createdate',
  'hs_lastmodifieddate',
  'hs_all_owner_ids',
  'hubspot_owner_id', // Preserve master's owner
  'lifecyclestage' // Will be set to archived for duplicates, preserve for master
];

/**
 * Check if a property is safe to merge
 */
function isPropertySafeToMerge(propertyName) {
  // Block Salesforce-synced properties
  if (SALESFORCE_PROTECTED.includes(propertyName)) {
    return false;
  }

  // Block properties starting with salesforce_
  if (propertyName.startsWith('salesforce_')) {
    return false;
  }

  // Block system-protected properties
  if (SYSTEM_PROTECTED.includes(propertyName)) {
    return false;
  }

  // Only allow properties in the allowlist
  if (!MERGE_SAFE_PROPERTIES.includes(propertyName)) {
    return false;
  }

  return true;
}

/**
 * Check if a property value is considered "empty"
 */
function isPropertyEmpty(value) {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'string' && value.trim() === '') {
    return true;
  }

  if (typeof value === 'number' && value === 0) {
    return false; // 0 is a valid value
  }

  if (Array.isArray(value) && value.length === 0) {
    return true;
  }

  return false;
}

/**
 * Determine which property value to use
 * Prefers non-empty, most recent values
 */
function selectPropertyValue(masterValue, duplicateValues, propertyName) {
  // If master has a value, keep it (never overwrite)
  if (!isPropertyEmpty(masterValue)) {
    return {
      value: masterValue,
      source: 'master',
      reason: 'Master already has value'
    };
  }

  // Find non-empty values from duplicates
  const nonEmptyValues = duplicateValues.filter(dv => !isPropertyEmpty(dv.value));

  if (nonEmptyValues.length === 0) {
    return {
      value: masterValue,
      source: 'master',
      reason: 'No non-empty values in duplicates'
    };
  }

  // If multiple non-empty values, prefer the most recent one
  // (based on last modified date of the company)
  nonEmptyValues.sort((a, b) => {
    const dateA = new Date(a.company.properties.hs_lastmodifieddate || 0);
    const dateB = new Date(b.company.properties.hs_lastmodifieddate || 0);
    return dateB - dateA; // Most recent first
  });

  const selected = nonEmptyValues[0];

  return {
    value: selected.value,
    source: selected.company.id,
    sourceName: selected.company.properties.name,
    reason: 'Most recent non-empty value from duplicate'
  };
}

/**
 * Merge properties from duplicates into master
 *
 * @param {Object} master - Master company object
 * @param {Array} duplicates - Array of duplicate company objects
 * @param {Object} options - Merge options
 * @returns {Object} - Merge results with properties to update
 */
function mergeProperties(master, duplicates, options = {}) {
  const dryRun = options.dryRun || false;
  const customAllowlist = options.allowlist || null;

  const propertiesToUpdate = {};
  const mergeLog = [];
  const skippedProperties = [];

  // Get all property names from master and duplicates
  const allPropertyNames = new Set();

  Object.keys(master.properties).forEach(prop => allPropertyNames.add(prop));
  duplicates.forEach(dup => {
    Object.keys(dup.properties).forEach(prop => allPropertyNames.add(prop));
  });

  // Process each property
  allPropertyNames.forEach(propertyName => {
    // Check if property is safe to merge
    if (!isPropertySafeToMerge(propertyName)) {
      if (SALESFORCE_PROTECTED.includes(propertyName) || propertyName.startsWith('salesforce_')) {
        skippedProperties.push({
          property: propertyName,
          reason: 'Salesforce-protected field'
        });
      } else if (SYSTEM_PROTECTED.includes(propertyName)) {
        skippedProperties.push({
          property: propertyName,
          reason: 'System-protected field'
        });
      } else {
        skippedProperties.push({
          property: propertyName,
          reason: 'Not in allowlist'
        });
      }
      return;
    }

    // Use custom allowlist if provided
    if (customAllowlist && !customAllowlist.includes(propertyName)) {
      skippedProperties.push({
        property: propertyName,
        reason: 'Not in custom allowlist'
      });
      return;
    }

    // Get master value
    const masterValue = master.properties[propertyName];

    // Get duplicate values
    const duplicateValues = duplicates.map(dup => ({
      value: dup.properties[propertyName],
      company: dup
    }));

    // Select best value
    const selection = selectPropertyValue(masterValue, duplicateValues, propertyName);

    // If we're using a value from a duplicate, add to update list
    if (selection.source !== 'master' && !isPropertyEmpty(selection.value)) {
      propertiesToUpdate[propertyName] = selection.value;

      mergeLog.push({
        property: propertyName,
        oldValue: masterValue,
        newValue: selection.value,
        source: selection.source,
        sourceName: selection.sourceName,
        reason: selection.reason
      });
    }
  });

  return {
    propertiesToUpdate,
    mergeLog,
    skippedProperties,
    summary: {
      totalProperties: allPropertyNames.size,
      propertiesMerged: Object.keys(propertiesToUpdate).length,
      propertiesSkipped: skippedProperties.length,
      dryRun: dryRun
    }
  };
}

/**
 * Validate merge results before applying
 */
function validateMergeResults(mergeResults, master) {
  const warnings = [];
  const errors = [];

  // Check if we're accidentally trying to update protected fields
  Object.keys(mergeResults.propertiesToUpdate).forEach(prop => {
    if (SALESFORCE_PROTECTED.includes(prop) || prop.startsWith('salesforce_')) {
      errors.push(`Attempting to update Salesforce-protected field: ${prop}`);
    }

    if (SYSTEM_PROTECTED.includes(prop)) {
      errors.push(`Attempting to update system-protected field: ${prop}`);
    }
  });

  // Check if we're overwriting existing values
  mergeResults.mergeLog.forEach(log => {
    if (!isPropertyEmpty(log.oldValue)) {
      warnings.push(`Overwriting existing value for ${log.property}: "${log.oldValue}" -> "${log.newValue}"`);
    }
  });

  // Check for large number of updates (potential issue)
  if (Object.keys(mergeResults.propertiesToUpdate).length > 50) {
    warnings.push(`Large number of property updates (${Object.keys(mergeResults.propertiesToUpdate).length})`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Apply property updates to master company (via HubSpot API)
 */
async function applyPropertyUpdates(hubspotClient, masterId, propertiesToUpdate, dryRun = false) {
  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      updateCount: Object.keys(propertiesToUpdate).length
    };
  }

  if (Object.keys(propertiesToUpdate).length === 0) {
    return {
      success: true,
      updateCount: 0,
      message: 'No properties to update'
    };
  }

  try {
    await hubspotClient.crm.companies.basicApi.update(masterId, {
      properties: propertiesToUpdate
    });

    return {
      success: true,
      updateCount: Object.keys(propertiesToUpdate).length,
      updatedProperties: Object.keys(propertiesToUpdate)
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      updateCount: 0
    };
  }
}

module.exports = {
  mergeProperties,
  validateMergeResults,
  applyPropertyUpdates,
  isPropertySafeToMerge,
  isPropertyEmpty,
  MERGE_SAFE_PROPERTIES,
  SALESFORCE_PROTECTED,
  SYSTEM_PROTECTED
};
