#!/usr/bin/env node

/**
 * Territory Model Lifecycle Manager
 *
 * Manages Territory2Model state transitions including activation,
 * archival, and preparation for cloning.
 *
 * @module territory-model-lifecycle
 * @version 1.0.0
 * @see docs/runbooks/territory-management/08-deployment-and-activation.md
 */

const { execSync } = require('child_process');
const fs = require('fs');

/**
 * Execute SF CLI query
 * @param {string} query - SOQL query
 * @param {string} orgAlias - Target org alias
 * @returns {Array} Query results
 */
function sfQuery(query, orgAlias) {
  const cmd = `sf data query --query "${query}" --target-org ${orgAlias} --json`;

  try {
    const result = JSON.parse(execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }));
    return result.result?.records || [];
  } catch (error) {
    console.error(`Query failed: ${error.message}`);
    return [];
  }
}

/**
 * Update a record
 * @param {string} sobject - SObject type
 * @param {string} recordId - Record ID
 * @param {Object} values - Field values to update
 * @param {string} orgAlias - Target org alias
 * @returns {Object} Result
 */
function sfUpdate(sobject, recordId, values, orgAlias) {
  const valuesStr = Object.entries(values)
    .map(([k, v]) => `${k}='${v}'`)
    .join(' ');

  const cmd = `sf data update record --sobject ${sobject} --record-id ${recordId} --values "${valuesStr}" --target-org ${orgAlias} --json`;

  try {
    const result = JSON.parse(execSync(cmd, { encoding: 'utf-8' }));
    return { success: true, id: result.result?.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * State transition rules
 */
const STATE_TRANSITIONS = {
  'Planning': {
    allowedTransitions: ['Active'],
    description: 'Model is being designed. Can be activated.'
  },
  'Active': {
    allowedTransitions: ['Archived'],
    description: 'Model is live. Can be archived.'
  },
  'Archived': {
    allowedTransitions: [],
    description: 'Model is archived. Can be deleted.'
  },
  'Cloning': {
    allowedTransitions: [],
    description: 'Model is being cloned. No transitions allowed.'
  }
};

/**
 * Get model details
 * @param {string} orgAlias - Target org alias
 * @param {string} modelId - Territory2Model ID
 * @returns {Object} Model details
 */
function getModelDetails(orgAlias, modelId) {
  const models = sfQuery(`
    SELECT Id, Name, DeveloperName, State, Description,
           CreatedDate, LastModifiedDate
    FROM Territory2Model
    WHERE Id = '${modelId}'
  `, orgAlias);

  if (models.length === 0) {
    return null;
  }

  const model = models[0];

  // Get territory count
  const territoryCount = sfQuery(`
    SELECT COUNT(Id) cnt FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
  `, orgAlias);

  // Get user assignment count
  const userCount = sfQuery(`
    SELECT COUNT(Id) cnt FROM UserTerritory2Association uta
    JOIN Territory2 t ON uta.Territory2Id = t.Id
    WHERE t.Territory2ModelId = '${modelId}'
  `, orgAlias);

  // Get account assignment count
  const accountCount = sfQuery(`
    SELECT COUNT(Id) cnt FROM ObjectTerritory2Association ota
    JOIN Territory2 t ON ota.Territory2Id = t.Id
    WHERE t.Territory2ModelId = '${modelId}'
  `, orgAlias);

  return {
    ...model,
    territoryCount: territoryCount[0]?.cnt || 0,
    userAssignmentCount: userCount[0]?.cnt || 0,
    accountAssignmentCount: accountCount[0]?.cnt || 0,
    stateInfo: STATE_TRANSITIONS[model.State]
  };
}

/**
 * List all models
 * @param {string} orgAlias - Target org alias
 * @returns {Array} List of models
 */
function listModels(orgAlias) {
  console.log('\n📋 Territory2 Models:\n');

  const models = sfQuery(`
    SELECT Id, Name, DeveloperName, State, Description,
           CreatedDate, LastModifiedDate
    FROM Territory2Model
    ORDER BY State, Name
  `, orgAlias);

  if (models.length === 0) {
    console.log('No Territory2Models found.');
    return [];
  }

  const stateIcons = {
    'Planning': '📝',
    'Active': '✅',
    'Archived': '📦',
    'Cloning': '🔄'
  };

  for (const model of models) {
    const icon = stateIcons[model.State] || '❓';
    console.log(`${icon} ${model.Name} (${model.DeveloperName})`);
    console.log(`   ID: ${model.Id}`);
    console.log(`   State: ${model.State}`);
    console.log(`   Created: ${model.CreatedDate}`);
    console.log('');
  }

  return models;
}

/**
 * Validate model can be activated
 * @param {string} orgAlias - Target org alias
 * @param {string} modelId - Model ID to validate
 * @returns {Object} Validation results
 */
async function validateForActivation(orgAlias, modelId) {
  console.log('\n🔍 Validating model for activation...\n');

  const checks = [];
  let canActivate = true;

  // 1. Get model details
  const model = getModelDetails(orgAlias, modelId);

  if (!model) {
    return { canActivate: false, error: 'Model not found', checks: [] };
  }

  // 2. Check current state
  if (model.State !== 'Planning') {
    checks.push({
      name: 'Current State',
      passed: false,
      message: `Model is in ${model.State} state. Must be Planning to activate.`
    });
    canActivate = false;
  } else {
    checks.push({
      name: 'Current State',
      passed: true,
      message: 'Model is in Planning state'
    });
  }

  // 3. Check no other active model
  const activeModels = sfQuery(`
    SELECT Id, Name FROM Territory2Model WHERE State = 'Active'
  `, orgAlias);

  if (activeModels.length > 0) {
    checks.push({
      name: 'No Active Model',
      passed: false,
      message: `Another model is already active: ${activeModels[0].Name}`
    });
    canActivate = false;
  } else {
    checks.push({
      name: 'No Active Model',
      passed: true,
      message: 'No other model is currently active'
    });
  }

  // 4. Check has territories
  if (model.territoryCount === 0) {
    checks.push({
      name: 'Has Territories',
      passed: false,
      message: 'Model has no territories'
    });
    canActivate = false;
  } else {
    checks.push({
      name: 'Has Territories',
      passed: true,
      message: `Model has ${model.territoryCount} territories`
    });
  }

  // 5. Check for hierarchy issues
  const orphans = sfQuery(`
    SELECT Id FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
    AND ParentTerritory2Id != null
    AND ParentTerritory2Id NOT IN (
      SELECT Id FROM Territory2 WHERE Territory2ModelId = '${modelId}'
    )
  `, orgAlias);

  if (orphans.length > 0) {
    checks.push({
      name: 'No Orphaned Territories',
      passed: false,
      message: `${orphans.length} orphaned territories found`
    });
    canActivate = false;
  } else {
    checks.push({
      name: 'No Orphaned Territories',
      passed: true,
      message: 'No orphaned territories'
    });
  }

  // 6. User assignments (warning only)
  if (model.userAssignmentCount === 0) {
    checks.push({
      name: 'User Assignments',
      passed: true,
      message: 'No user assignments (warning - model will activate but no users assigned)',
      warning: true
    });
  } else {
    checks.push({
      name: 'User Assignments',
      passed: true,
      message: `${model.userAssignmentCount} user assignments configured`
    });
  }

  // Print results
  console.log('Validation Results:');
  console.log('─'.repeat(60));

  for (const check of checks) {
    const icon = check.passed ? (check.warning ? '⚠️' : '✅') : '❌';
    console.log(`${icon} ${check.name}: ${check.message}`);
  }

  console.log('─'.repeat(60));
  console.log(`Can Activate: ${canActivate ? '✅ YES' : '❌ NO'}\n`);

  return { canActivate, checks, model };
}

/**
 * Activate a territory model
 * Note: Direct state update may not work in all orgs.
 * Use the custom Apex endpoint for reliable activation.
 *
 * @param {string} orgAlias - Target org alias
 * @param {string} modelId - Model ID to activate
 * @param {Object} options - Activation options
 * @returns {Object} Activation result
 */
async function activateModel(orgAlias, modelId, options = {}) {
  const { skipValidation = false, useApex = true } = options;

  // Validate first
  if (!skipValidation) {
    const validation = await validateForActivation(orgAlias, modelId);
    if (!validation.canActivate) {
      return {
        success: false,
        error: 'Model failed validation',
        validation
      };
    }
  }

  console.log('\n🚀 Activating model...\n');

  if (useApex) {
    // Use custom Apex endpoint (recommended)
    console.log('Using Apex endpoint for activation...');
    console.log(`
To activate via Apex REST endpoint:

1. Deploy Territory2ModelActivator.cls to your org
2. Execute:

   curl -X POST "https://<instance>.salesforce.com/services/apexrest/territory/activate/${modelId}" \\
     -H "Authorization: Bearer <access_token>" \\
     -H "Content-Type: application/json"

Or use Anonymous Apex:

   Territory2Model model = [SELECT Id, State FROM Territory2Model WHERE Id = '${modelId}'];
   model.State = 'Active';
   update model;
`);
    return {
      success: false,
      error: 'Manual activation required - see instructions above',
      apexRequired: true
    };
  }

  // Try direct update (may fail due to API restrictions)
  const result = sfUpdate('Territory2Model', modelId, { State: 'Active' }, orgAlias);

  if (result.success) {
    console.log('✅ Model activated successfully!');

    // Verify
    const updated = getModelDetails(orgAlias, modelId);
    return {
      success: true,
      model: updated
    };
  } else {
    console.log(`❌ Direct activation failed: ${result.error}`);
    console.log('Model activation typically requires Apex or UI interaction.');
    return {
      success: false,
      error: result.error,
      suggestion: 'Use Setup UI or custom Apex endpoint to activate'
    };
  }
}

/**
 * Archive a territory model
 * @param {string} orgAlias - Target org alias
 * @param {string} modelId - Model ID to archive
 * @returns {Object} Archive result
 */
async function archiveModel(orgAlias, modelId) {
  console.log('\n📦 Archiving model...\n');

  // Get current model
  const model = getModelDetails(orgAlias, modelId);

  if (!model) {
    return { success: false, error: 'Model not found' };
  }

  if (model.State !== 'Active') {
    return {
      success: false,
      error: `Model is in ${model.State} state. Only Active models can be archived.`
    };
  }

  // Archive
  const result = sfUpdate('Territory2Model', modelId, { State: 'Archived' }, orgAlias);

  if (result.success) {
    console.log('✅ Model archived successfully!');
    console.log(`\n⚠️  Note: Archiving removes territory-based access. Users will lose access to accounts assigned via this model.`);

    const updated = getModelDetails(orgAlias, modelId);
    return { success: true, model: updated };
  } else {
    console.log(`❌ Archive failed: ${result.error}`);
    return { success: false, error: result.error };
  }
}

/**
 * Create checkpoint before major operation
 * @param {string} orgAlias - Target org alias
 * @param {string} modelId - Model ID
 * @returns {string} Checkpoint file path
 */
async function createCheckpoint(orgAlias, modelId) {
  console.log('\n💾 Creating checkpoint...\n');

  const model = getModelDetails(orgAlias, modelId);
  if (!model) {
    throw new Error('Model not found');
  }

  // Get all territories
  const territories = sfQuery(`
    SELECT Id, Name, DeveloperName, ParentTerritory2Id,
           Territory2TypeId, AccountAccessLevel,
           OpportunityAccessLevel, CaseAccessLevel, ContactAccessLevel
    FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
  `, orgAlias);

  // Get user assignments
  const userAssignments = sfQuery(`
    SELECT UserId, Territory2Id, RoleInTerritory2
    FROM UserTerritory2Association uta
    JOIN Territory2 t ON uta.Territory2Id = t.Id
    WHERE t.Territory2ModelId = '${modelId}'
  `, orgAlias);

  // Get account assignments
  const accountAssignments = sfQuery(`
    SELECT ObjectId, Territory2Id, AssociationCause
    FROM ObjectTerritory2Association ota
    JOIN Territory2 t ON ota.Territory2Id = t.Id
    WHERE t.Territory2ModelId = '${modelId}'
  `, orgAlias);

  const checkpoint = {
    timestamp: new Date().toISOString(),
    modelId,
    modelName: model.Name,
    modelState: model.State,
    territories,
    userAssignments,
    accountAssignments,
    counts: {
      territories: territories.length,
      userAssignments: userAssignments.length,
      accountAssignments: accountAssignments.length
    }
  };

  const filename = `territory-checkpoint-${model.DeveloperName}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(filename, JSON.stringify(checkpoint, null, 2));

  console.log(`✅ Checkpoint created: ${filename}`);
  console.log(`   Territories: ${checkpoint.counts.territories}`);
  console.log(`   User Assignments: ${checkpoint.counts.userAssignments}`);
  console.log(`   Account Assignments: ${checkpoint.counts.accountAssignments}`);

  return filename;
}

/**
 * Show model status
 * @param {string} orgAlias - Target org alias
 * @param {string} modelId - Model ID
 */
function showModelStatus(orgAlias, modelId) {
  const model = getModelDetails(orgAlias, modelId);

  if (!model) {
    console.log('Model not found');
    return;
  }

  const stateIcons = {
    'Planning': '📝',
    'Active': '✅',
    'Archived': '📦',
    'Cloning': '🔄'
  };

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`${stateIcons[model.State] || '❓'} Territory2Model: ${model.Name}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`ID:                  ${model.Id}`);
  console.log(`DeveloperName:       ${model.DeveloperName}`);
  console.log(`State:               ${model.State}`);
  console.log(`Description:         ${model.Description || '(none)'}`);
  console.log('───────────────────────────────────────────────────────────');
  console.log(`Territories:         ${model.territoryCount}`);
  console.log(`User Assignments:    ${model.userAssignmentCount}`);
  console.log(`Account Assignments: ${model.accountAssignmentCount}`);
  console.log('───────────────────────────────────────────────────────────');
  console.log(`Created:             ${model.CreatedDate}`);
  console.log(`Last Modified:       ${model.LastModifiedDate}`);
  console.log('───────────────────────────────────────────────────────────');
  console.log('Allowed Transitions:');
  const allowed = model.stateInfo?.allowedTransitions || [];
  if (allowed.length === 0) {
    console.log('  (none)');
  } else {
    for (const state of allowed) {
      console.log(`  → ${state}`);
    }
  }
  console.log('═══════════════════════════════════════════════════════════\n');
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Territory Model Lifecycle Manager

Usage: node territory-model-lifecycle.js <org-alias> <command> [options]

Commands:
  list                           List all Territory2Models
  status <model-id>              Show model status
  validate <model-id>            Validate model for activation
  activate <model-id>            Activate model
  archive <model-id>             Archive active model
  checkpoint <model-id>          Create checkpoint

Options:
  --skip-validation    Skip validation before activation
  --no-apex           Try direct update instead of Apex (may fail)

Examples:
  node territory-model-lifecycle.js myorg list
  node territory-model-lifecycle.js myorg status 0MCxxxxxxxxxx
  node territory-model-lifecycle.js myorg validate 0MCxxxxxxxxxx
  node territory-model-lifecycle.js myorg activate 0MCxxxxxxxxxx
  node territory-model-lifecycle.js myorg archive 0MCxxxxxxxxxx
  node territory-model-lifecycle.js myorg checkpoint 0MCxxxxxxxxxx
`);
    process.exit(1);
  }

  const orgAlias = args[0];
  const command = args[1];
  const modelId = args[2];

  // Parse options
  const skipValidation = args.includes('--skip-validation');
  const noApex = args.includes('--no-apex');

  switch (command) {
    case 'list':
      listModels(orgAlias);
      break;

    case 'status':
      if (!modelId) {
        console.error('Model ID required');
        process.exit(1);
      }
      showModelStatus(orgAlias, modelId);
      break;

    case 'validate':
      if (!modelId) {
        console.error('Model ID required');
        process.exit(1);
      }
      validateForActivation(orgAlias, modelId)
        .then(result => process.exit(result.canActivate ? 0 : 1));
      break;

    case 'activate':
      if (!modelId) {
        console.error('Model ID required');
        process.exit(1);
      }
      activateModel(orgAlias, modelId, { skipValidation, useApex: !noApex })
        .then(result => process.exit(result.success ? 0 : 1));
      break;

    case 'archive':
      if (!modelId) {
        console.error('Model ID required');
        process.exit(1);
      }
      archiveModel(orgAlias, modelId)
        .then(result => process.exit(result.success ? 0 : 1));
      break;

    case 'checkpoint':
      if (!modelId) {
        console.error('Model ID required');
        process.exit(1);
      }
      createCheckpoint(orgAlias, modelId)
        .then(() => process.exit(0))
        .catch(error => {
          console.error(error.message);
          process.exit(1);
        });
      break;

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

module.exports = {
  getModelDetails,
  listModels,
  validateForActivation,
  activateModel,
  archiveModel,
  createCheckpoint,
  showModelStatus
};
