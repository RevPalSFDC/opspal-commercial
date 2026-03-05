#!/usr/bin/env node

/**
 * Territory Pre-Operation Validator
 *
 * Validates prerequisites before any territory operation.
 * Checks: feature enabled, permissions, model state, hierarchy constraints,
 * DeveloperName uniqueness, and required fields.
 *
 * @module territory-pre-validator
 * @version 1.0.0
 * @see docs/runbooks/territory-management/07-testing-and-validation.md
 */

const { execSync } = require('child_process');

/**
 * Execute SF CLI query
 * @param {string} query - SOQL query
 * @param {string} orgAlias - Target org alias
 * @param {boolean} useToolingApi - Use Tooling API
 * @returns {Array} Query results
 */
function sfQuery(query, orgAlias, useToolingApi = false) {
  const toolingFlag = useToolingApi ? '--use-tooling-api' : '';
  const cmd = `sf data query --query "${query}" --target-org ${orgAlias} ${toolingFlag} --json`;

  try {
    const result = JSON.parse(execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }));
    return result.result?.records || [];
  } catch (error) {
    console.error(`Query failed: ${error.message}`);
    return [];
  }
}

/**
 * Check if Territory Management feature is enabled
 * @param {string} orgAlias - Target org alias
 * @returns {Object} Validation result
 */
function checkFeatureEnabled(orgAlias) {
  // Check if any Territory2Model exists
  const models = sfQuery('SELECT Id, Name FROM Territory2Model LIMIT 1', orgAlias);

  if (models.length > 0) {
    return { valid: true, message: 'Territory Management is enabled' };
  }

  // If no models, try to create one (will fail if not enabled)
  return {
    valid: models.length > 0,
    message: models.length > 0
      ? 'Territory Management is enabled'
      : 'Cannot confirm Territory Management is enabled - no models found'
  };
}

/**
 * Check if user has Manage Territories permission
 * @param {string} orgAlias - Target org alias
 * @param {string} userId - User ID to check (defaults to current user)
 * @returns {Object} Validation result
 */
function checkPermissions(orgAlias, userId = null) {
  // Get current user if not specified
  if (!userId) {
    const userInfo = sfQuery("SELECT Id FROM User WHERE Username = USER_NAME() LIMIT 1", orgAlias);
    if (userInfo.length === 0) {
      return { valid: false, message: 'Cannot determine current user' };
    }
    userId = userInfo[0].Id;
  }

  // Check profile permission
  const profilePerm = sfQuery(`
    SELECT u.Profile.PermissionsManageTerritories
    FROM User u
    WHERE u.Id = '${userId}'
  `, orgAlias);

  if (profilePerm.length > 0 && profilePerm[0].Profile?.PermissionsManageTerritories) {
    return { valid: true, message: 'User has Manage Territories permission via Profile' };
  }

  // Check permission set assignments
  const permSetPerm = sfQuery(`
    SELECT PermissionSet.PermissionsManageTerritories
    FROM PermissionSetAssignment
    WHERE AssigneeId = '${userId}'
    AND PermissionSet.PermissionsManageTerritories = true
  `, orgAlias);

  if (permSetPerm.length > 0) {
    return { valid: true, message: 'User has Manage Territories permission via Permission Set' };
  }

  return { valid: false, message: 'User does not have Manage Territories permission' };
}

/**
 * Check model state allows the requested operation
 * @param {string} orgAlias - Target org alias
 * @param {string} modelId - Territory2Model ID
 * @param {string} operation - Operation type (create, update, delete, activate)
 * @returns {Object} Validation result
 */
function checkModelState(orgAlias, modelId, operation) {
  const model = sfQuery(`
    SELECT Id, Name, State FROM Territory2Model WHERE Id = '${modelId}'
  `, orgAlias);

  if (model.length === 0) {
    return { valid: false, message: 'Model not found' };
  }

  const state = model[0].State;
  const allowedOperations = {
    'Planning': ['create', 'update', 'delete', 'activate'],
    'Active': ['update', 'archive'],  // Limited modifications in Active
    'Archived': ['delete'],
    'Cloning': []  // No operations during clone
  };

  const allowed = allowedOperations[state] || [];

  if (allowed.includes(operation)) {
    return {
      valid: true,
      message: `Model is in ${state} state - ${operation} is allowed`,
      modelState: state
    };
  }

  return {
    valid: false,
    message: `Model is in ${state} state - ${operation} is not allowed. Allowed: ${allowed.join(', ') || 'none'}`,
    modelState: state
  };
}

/**
 * Check for circular references in hierarchy
 * @param {string} orgAlias - Target org alias
 * @param {string} modelId - Territory2Model ID
 * @param {string} territoryId - Territory being moved (optional)
 * @param {string} newParentId - New parent ID (optional)
 * @returns {Object} Validation result
 */
function checkHierarchyConstraints(orgAlias, modelId, territoryId = null, newParentId = null) {
  const territories = sfQuery(`
    SELECT Id, DeveloperName, ParentTerritory2Id
    FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
  `, orgAlias);

  const parentMap = new Map(territories.map(t => [t.Id, t.ParentTerritory2Id]));

  // If checking a specific move, simulate it
  if (territoryId && newParentId) {
    parentMap.set(territoryId, newParentId);
  }

  const cycles = [];
  const orphans = [];

  for (const territory of territories) {
    const visited = new Set();
    let current = territory.Id;
    let depth = 0;

    while (current && parentMap.has(current)) {
      if (visited.has(current)) {
        cycles.push({
          territoryId: territory.Id,
          developerName: territory.DeveloperName,
          cycleStart: current
        });
        break;
      }

      visited.add(current);
      current = parentMap.get(current);
      depth++;

      // Safety limit
      if (depth > 100) {
        cycles.push({
          territoryId: territory.Id,
          developerName: territory.DeveloperName,
          issue: 'Exceeded depth limit'
        });
        break;
      }
    }

    // Check for orphans (parent not in model)
    if (territory.ParentTerritory2Id && !parentMap.has(territory.ParentTerritory2Id)) {
      orphans.push({
        territoryId: territory.Id,
        developerName: territory.DeveloperName,
        invalidParentId: territory.ParentTerritory2Id
      });
    }
  }

  if (cycles.length > 0 || orphans.length > 0) {
    return {
      valid: false,
      message: `Hierarchy issues found: ${cycles.length} cycles, ${orphans.length} orphans`,
      cycles,
      orphans
    };
  }

  return { valid: true, message: 'Hierarchy is valid - no cycles or orphans' };
}

/**
 * Check DeveloperName uniqueness within model
 * @param {string} orgAlias - Target org alias
 * @param {string} modelId - Territory2Model ID
 * @param {string} developerName - DeveloperName to check
 * @param {string} excludeId - Territory ID to exclude (for updates)
 * @returns {Object} Validation result
 */
function checkDeveloperNameUniqueness(orgAlias, modelId, developerName, excludeId = null) {
  let query = `
    SELECT Id, Name FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
    AND DeveloperName = '${developerName}'
  `;

  if (excludeId) {
    query += ` AND Id != '${excludeId}'`;
  }

  const existing = sfQuery(query, orgAlias);

  if (existing.length > 0) {
    return {
      valid: false,
      message: `DeveloperName '${developerName}' already exists in this model`,
      conflictId: existing[0].Id
    };
  }

  // Validate DeveloperName format
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(developerName)) {
    return {
      valid: false,
      message: 'DeveloperName must start with letter, contain only alphanumeric and underscore'
    };
  }

  if (developerName.length > 80) {
    return {
      valid: false,
      message: 'DeveloperName must be 80 characters or less'
    };
  }

  return { valid: true, message: 'DeveloperName is unique and valid' };
}

/**
 * Validate required fields for territory creation
 * @param {Object} territory - Territory data
 * @returns {Object} Validation result
 */
function validateRequiredFields(territory) {
  const errors = [];

  // Required fields
  const required = ['Name', 'DeveloperName', 'Territory2ModelId', 'Territory2TypeId'];
  for (const field of required) {
    if (!territory[field]) {
      errors.push(`${field} is required`);
    }
  }

  // Access level validation
  const validAccountAccess = ['Read', 'Edit', 'All'];
  const validOppCaseAccess = ['None', 'Read', 'Edit'];

  if (territory.AccountAccessLevel && !validAccountAccess.includes(territory.AccountAccessLevel)) {
    errors.push(`AccountAccessLevel must be one of: ${validAccountAccess.join(', ')}`);
  }

  if (territory.OpportunityAccessLevel && !validOppCaseAccess.includes(territory.OpportunityAccessLevel)) {
    errors.push(`OpportunityAccessLevel must be one of: ${validOppCaseAccess.join(', ')}`);
  }

  if (territory.CaseAccessLevel && !validOppCaseAccess.includes(territory.CaseAccessLevel)) {
    errors.push(`CaseAccessLevel must be one of: ${validOppCaseAccess.join(', ')}`);
  }

  if (territory.ContactAccessLevel && !validOppCaseAccess.includes(territory.ContactAccessLevel)) {
    errors.push(`ContactAccessLevel must be one of: ${validOppCaseAccess.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    message: errors.length === 0 ? 'All required fields are valid' : errors.join('; '),
    errors
  };
}

/**
 * Validate territory type exists
 * @param {string} orgAlias - Target org alias
 * @param {string} typeId - Territory2Type ID
 * @returns {Object} Validation result
 */
function validateTerritoryType(orgAlias, typeId) {
  const types = sfQuery(`
    SELECT Id, MasterLabel, DeveloperName FROM Territory2Type WHERE Id = '${typeId}'
  `, orgAlias);

  if (types.length === 0) {
    return { valid: false, message: 'Territory2Type not found' };
  }

  return {
    valid: true,
    message: `Territory type '${types[0].MasterLabel}' is valid`,
    type: types[0]
  };
}

/**
 * Validate parent territory exists and is in same model
 * @param {string} orgAlias - Target org alias
 * @param {string} modelId - Territory2Model ID
 * @param {string} parentId - Parent Territory2 ID
 * @returns {Object} Validation result
 */
function validateParentTerritory(orgAlias, modelId, parentId) {
  if (!parentId) {
    return { valid: true, message: 'No parent specified (will be root territory)' };
  }

  const parent = sfQuery(`
    SELECT Id, Name, Territory2ModelId FROM Territory2 WHERE Id = '${parentId}'
  `, orgAlias);

  if (parent.length === 0) {
    return { valid: false, message: 'Parent territory not found' };
  }

  if (parent[0].Territory2ModelId !== modelId) {
    return {
      valid: false,
      message: 'Parent territory must be in the same model'
    };
  }

  return {
    valid: true,
    message: `Parent territory '${parent[0].Name}' is valid`,
    parent: parent[0]
  };
}

/**
 * Run comprehensive pre-operation validation
 * @param {string} orgAlias - Target org alias
 * @param {string} operation - Operation type
 * @param {Object} data - Operation data
 * @returns {Object} Comprehensive validation result
 */
function runPreValidation(orgAlias, operation, data = {}) {
  const results = {
    operation,
    timestamp: new Date().toISOString(),
    checks: [],
    valid: true
  };

  console.log(`\n🔍 Running pre-validation for: ${operation}\n`);

  // 1. Check feature enabled
  const featureCheck = checkFeatureEnabled(orgAlias);
  results.checks.push({ name: 'Feature Enabled', ...featureCheck });
  if (!featureCheck.valid) results.valid = false;

  // 2. Check permissions
  const permCheck = checkPermissions(orgAlias);
  results.checks.push({ name: 'Permissions', ...permCheck });
  if (!permCheck.valid) results.valid = false;

  // 3. Model-specific checks
  if (data.modelId) {
    const stateCheck = checkModelState(orgAlias, data.modelId, operation);
    results.checks.push({ name: 'Model State', ...stateCheck });
    if (!stateCheck.valid) results.valid = false;

    const hierarchyCheck = checkHierarchyConstraints(
      orgAlias,
      data.modelId,
      data.territoryId,
      data.parentId
    );
    results.checks.push({ name: 'Hierarchy Constraints', ...hierarchyCheck });
    if (!hierarchyCheck.valid) results.valid = false;
  }

  // 4. DeveloperName uniqueness (for create/update)
  if (data.developerName && data.modelId) {
    const uniqueCheck = checkDeveloperNameUniqueness(
      orgAlias,
      data.modelId,
      data.developerName,
      data.territoryId
    );
    results.checks.push({ name: 'DeveloperName Uniqueness', ...uniqueCheck });
    if (!uniqueCheck.valid) results.valid = false;
  }

  // 5. Required fields (for create)
  if (operation === 'create' && data.territory) {
    const fieldCheck = validateRequiredFields(data.territory);
    results.checks.push({ name: 'Required Fields', ...fieldCheck });
    if (!fieldCheck.valid) results.valid = false;
  }

  // 6. Territory type (for create/update)
  if (data.typeId) {
    const typeCheck = validateTerritoryType(orgAlias, data.typeId);
    results.checks.push({ name: 'Territory Type', ...typeCheck });
    if (!typeCheck.valid) results.valid = false;
  }

  // 7. Parent territory (for create/update with parent)
  if (data.parentId && data.modelId) {
    const parentCheck = validateParentTerritory(orgAlias, data.modelId, data.parentId);
    results.checks.push({ name: 'Parent Territory', ...parentCheck });
    if (!parentCheck.valid) results.valid = false;
  }

  // Print results
  console.log('Validation Results:');
  console.log('─'.repeat(60));

  for (const check of results.checks) {
    const icon = check.valid ? '✅' : '❌';
    console.log(`${icon} ${check.name}: ${check.message}`);
  }

  console.log('─'.repeat(60));
  console.log(`Overall: ${results.valid ? '✅ PASS' : '❌ FAIL'}\n`);

  return results;
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Territory Pre-Operation Validator

Usage: node territory-pre-validator.js <org-alias> <operation> [options]

Operations:
  create    - Validate before creating territory
  update    - Validate before updating territory
  delete    - Validate before deleting territory
  activate  - Validate before activating model
  reparent  - Validate before reparenting territory

Options:
  --model-id=<id>        Territory2Model ID
  --territory-id=<id>    Territory2 ID (for update/delete/reparent)
  --parent-id=<id>       Parent Territory2 ID (for create/reparent)
  --type-id=<id>         Territory2Type ID (for create)
  --developer-name=<name> DeveloperName (for create/update)

Examples:
  node territory-pre-validator.js myorg create --model-id=0MC... --type-id=0MT... --developer-name=US_West
  node territory-pre-validator.js myorg activate --model-id=0MC...
  node territory-pre-validator.js myorg reparent --model-id=0MC... --territory-id=0MI... --parent-id=0MI...
`);
    process.exit(1);
  }

  const orgAlias = args[0];
  const operation = args[1];

  // Parse options
  const options = {};
  for (const arg of args.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.+)$/);
    if (match) {
      const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      options[key] = match[2];
    }
  }

  const data = {
    modelId: options.modelId,
    territoryId: options.territoryId,
    parentId: options.parentId,
    typeId: options.typeId,
    developerName: options.developerName
  };

  const results = runPreValidation(orgAlias, operation, data);
  process.exit(results.valid ? 0 : 1);
}

module.exports = {
  checkFeatureEnabled,
  checkPermissions,
  checkModelState,
  checkHierarchyConstraints,
  checkDeveloperNameUniqueness,
  validateRequiredFields,
  validateTerritoryType,
  validateParentTerritory,
  runPreValidation
};
