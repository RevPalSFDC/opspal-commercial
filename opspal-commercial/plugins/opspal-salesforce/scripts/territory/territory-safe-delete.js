#!/usr/bin/env node

/**
 * Territory Safe Delete Utility
 *
 * Safely delete territories with dependency handling,
 * cascade detection, and rollback support.
 *
 * @module territory-safe-delete
 * @version 1.0.0
 * @see docs/runbooks/territory-management/04-hierarchy-configuration.md
 */

const { execSync } = require('child_process');
const fs = require('fs');
const readline = require('readline');

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
 * Delete a single record
 * @param {string} sobject - SObject type
 * @param {string} recordId - Record ID
 * @param {string} orgAlias - Target org alias
 * @returns {Object} Result
 */
function sfDelete(sobject, recordId, orgAlias) {
  const cmd = `sf data delete record --sobject ${sobject} --record-id ${recordId} --target-org ${orgAlias} --json`;

  try {
    execSync(cmd, { encoding: 'utf-8' });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Prompt user for confirmation
 * @param {string} question - Question to ask
 * @returns {Promise<boolean>} User's answer
 */
async function confirm(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(`${question} (y/n): `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Get territory dependencies
 * @param {string} orgAlias - Target org alias
 * @param {string} territoryId - Territory ID
 * @returns {Object} Dependencies
 */
function getDependencies(orgAlias, territoryId) {
  // Get territory info
  const territory = sfQuery(`
    SELECT Id, Name, DeveloperName, Territory2ModelId
    FROM Territory2
    WHERE Id = '${territoryId}'
  `, orgAlias);

  if (territory.length === 0) {
    return { error: 'Territory not found' };
  }

  // Get child territories
  const children = sfQuery(`
    SELECT Id, Name, DeveloperName
    FROM Territory2
    WHERE ParentTerritory2Id = '${territoryId}'
  `, orgAlias);

  // Get user assignments
  const userAssignments = sfQuery(`
    SELECT Id, UserId, User.Name
    FROM UserTerritory2Association
    WHERE Territory2Id = '${territoryId}'
  `, orgAlias);

  // Get account assignments
  const accountAssignments = sfQuery(`
    SELECT Id, ObjectId, Account.Name
    FROM ObjectTerritory2Association
    WHERE Territory2Id = '${territoryId}'
  `, orgAlias);

  // Get exclusions
  const exclusions = sfQuery(`
    SELECT Id, ObjectId
    FROM Territory2ObjectExclusion
    WHERE Territory2Id = '${territoryId}'
  `, orgAlias);

  return {
    territory: territory[0],
    children,
    userAssignments,
    accountAssignments,
    exclusions,
    counts: {
      children: children.length,
      userAssignments: userAssignments.length,
      accountAssignments: accountAssignments.length,
      exclusions: exclusions.length
    },
    hasBlocking: children.length > 0 || userAssignments.length > 0 || accountAssignments.length > 0
  };
}

/**
 * Get full subtree for cascade delete
 * @param {string} orgAlias - Target org alias
 * @param {string} territoryId - Root territory ID
 * @returns {Array} Territories in bottom-up order
 */
function getSubtree(orgAlias, territoryId) {
  const result = [];
  const queue = [territoryId];
  const visited = new Set();

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const territory = sfQuery(`
      SELECT Id, Name, DeveloperName
      FROM Territory2
      WHERE Id = '${currentId}'
    `, orgAlias);

    if (territory.length > 0) {
      result.push(territory[0]);

      // Get children
      const children = sfQuery(`
        SELECT Id FROM Territory2
        WHERE ParentTerritory2Id = '${currentId}'
      `, orgAlias);

      for (const child of children) {
        queue.push(child.Id);
      }
    }
  }

  // Reverse for bottom-up order (delete children before parents)
  return result.reverse();
}

/**
 * Create deletion checkpoint
 * @param {Object} deps - Dependencies to backup
 * @param {Array} subtree - Subtree to delete
 * @returns {string} Checkpoint file path
 */
function createDeletionCheckpoint(deps, subtree = []) {
  const checkpoint = {
    timestamp: new Date().toISOString(),
    territory: deps.territory,
    subtree: subtree,
    userAssignments: deps.userAssignments,
    accountAssignments: deps.accountAssignments,
    exclusions: deps.exclusions
  };

  const filename = `territory-delete-checkpoint-${deps.territory.DeveloperName}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(filename, JSON.stringify(checkpoint, null, 2));

  return filename;
}

/**
 * Delete user assignments for a territory
 * @param {string} orgAlias - Target org alias
 * @param {string} territoryId - Territory ID
 * @returns {Object} Deletion results
 */
async function deleteUserAssignments(orgAlias, territoryId) {
  const assignments = sfQuery(`
    SELECT Id FROM UserTerritory2Association
    WHERE Territory2Id = '${territoryId}'
  `, orgAlias);

  const results = { deleted: 0, failed: 0, errors: [] };

  for (const assignment of assignments) {
    const result = sfDelete('UserTerritory2Association', assignment.Id, orgAlias);
    if (result.success) {
      results.deleted++;
    } else {
      results.failed++;
      results.errors.push({ id: assignment.Id, error: result.error });
    }
  }

  return results;
}

/**
 * Delete account assignments for a territory
 * @param {string} orgAlias - Target org alias
 * @param {string} territoryId - Territory ID
 * @returns {Object} Deletion results
 */
async function deleteAccountAssignments(orgAlias, territoryId) {
  const assignments = sfQuery(`
    SELECT Id FROM ObjectTerritory2Association
    WHERE Territory2Id = '${territoryId}'
  `, orgAlias);

  const results = { deleted: 0, failed: 0, errors: [] };

  for (const assignment of assignments) {
    const result = sfDelete('ObjectTerritory2Association', assignment.Id, orgAlias);
    if (result.success) {
      results.deleted++;
    } else {
      results.failed++;
      results.errors.push({ id: assignment.Id, error: result.error });
    }
  }

  return results;
}

/**
 * Safely delete a single territory
 * @param {string} orgAlias - Target org alias
 * @param {string} territoryId - Territory ID
 * @param {Object} options - Delete options
 * @returns {Object} Deletion result
 */
async function safeDeleteTerritory(orgAlias, territoryId, options = {}) {
  const { cascade = false, force = false, dryRun = false, interactive = true } = options;

  console.log('\n🔍 Analyzing territory dependencies...\n');

  const deps = getDependencies(orgAlias, territoryId);

  if (deps.error) {
    return { success: false, error: deps.error };
  }

  // Print dependencies
  console.log('Territory Dependencies:');
  console.log('─'.repeat(60));
  console.log(`Territory:        ${deps.territory.Name} (${deps.territory.DeveloperName})`);
  console.log(`Child Territories: ${deps.counts.children}`);
  console.log(`User Assignments:  ${deps.counts.userAssignments}`);
  console.log(`Account Assignments: ${deps.counts.accountAssignments}`);
  console.log(`Exclusions:        ${deps.counts.exclusions}`);
  console.log('─'.repeat(60));

  // Check blocking dependencies
  if (deps.counts.children > 0 && !cascade) {
    console.log('\n❌ Cannot delete: Territory has child territories');
    console.log('   Use --cascade to delete entire subtree');
    return { success: false, error: 'Has child territories', deps };
  }

  if ((deps.counts.userAssignments > 0 || deps.counts.accountAssignments > 0) && !force) {
    console.log('\n❌ Cannot delete: Territory has assignments');
    console.log('   Use --force to delete assignments first');
    return { success: false, error: 'Has assignments', deps };
  }

  // Dry run
  if (dryRun) {
    console.log('\n🔍 DRY RUN - Would delete:');
    if (cascade) {
      const subtree = getSubtree(orgAlias, territoryId);
      console.log(`   ${subtree.length} territories (including subtree)`);
    } else {
      console.log(`   1 territory`);
    }
    console.log(`   ${deps.counts.userAssignments} user assignments`);
    console.log(`   ${deps.counts.accountAssignments} account assignments`);
    console.log(`   ${deps.counts.exclusions} exclusions (auto-deleted)`);
    return { success: true, dryRun: true, deps };
  }

  // Confirm
  if (interactive) {
    const confirmMsg = cascade
      ? `Delete territory and entire subtree (${getSubtree(orgAlias, territoryId).length} territories)?`
      : 'Delete territory and all assignments?';

    const confirmed = await confirm(`\n⚠️  ${confirmMsg}`);
    if (!confirmed) {
      console.log('Cancelled.');
      return { success: false, error: 'Cancelled by user' };
    }
  }

  // Create checkpoint
  const subtree = cascade ? getSubtree(orgAlias, territoryId) : [deps.territory];
  const checkpointPath = createDeletionCheckpoint(deps, subtree);
  console.log(`\n💾 Checkpoint created: ${checkpointPath}`);

  // Execute deletion
  console.log('\n🗑️  Deleting...\n');
  const results = {
    userAssignments: { deleted: 0, failed: 0 },
    accountAssignments: { deleted: 0, failed: 0 },
    territories: { deleted: 0, failed: 0, errors: [] }
  };

  // Delete in correct order: assignments first, then territories bottom-up
  for (const t of subtree) {
    // Delete user assignments
    const userResult = await deleteUserAssignments(orgAlias, t.Id);
    results.userAssignments.deleted += userResult.deleted;
    results.userAssignments.failed += userResult.failed;

    // Delete account assignments
    const accountResult = await deleteAccountAssignments(orgAlias, t.Id);
    results.accountAssignments.deleted += accountResult.deleted;
    results.accountAssignments.failed += accountResult.failed;
  }

  // Delete territories (bottom-up order already)
  for (const t of subtree) {
    console.log(`  Deleting: ${t.Name}...`);
    const result = sfDelete('Territory2', t.Id, orgAlias);

    if (result.success) {
      results.territories.deleted++;
      console.log(`  ✅ Deleted: ${t.Name}`);
    } else {
      results.territories.failed++;
      results.territories.errors.push({ territory: t, error: result.error });
      console.log(`  ❌ Failed: ${t.Name} - ${result.error}`);
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('Deletion Summary:');
  console.log('───────────────────────────────────────────────────────────');
  console.log(`User Assignments:    ${results.userAssignments.deleted} deleted, ${results.userAssignments.failed} failed`);
  console.log(`Account Assignments: ${results.accountAssignments.deleted} deleted, ${results.accountAssignments.failed} failed`);
  console.log(`Territories:         ${results.territories.deleted} deleted, ${results.territories.failed} failed`);
  console.log('───────────────────────────────────────────────────────────');

  const success = results.territories.failed === 0;
  console.log(`Overall: ${success ? '✅ SUCCESS' : '❌ PARTIAL FAILURE'}`);

  if (!success) {
    console.log(`\n⚠️  Use checkpoint to review: ${checkpointPath}`);
  }

  console.log('═══════════════════════════════════════════════════════════\n');

  return { success, results, checkpointPath };
}

/**
 * Delete all territories in a model
 * @param {string} orgAlias - Target org alias
 * @param {string} modelId - Model ID
 * @param {Object} options - Delete options
 * @returns {Object} Deletion result
 */
async function deleteModelTerritories(orgAlias, modelId, options = {}) {
  const { dryRun = false, interactive = true } = options;

  console.log('\n🔍 Analyzing model territories...\n');

  // Get model
  const model = sfQuery(`
    SELECT Id, Name, State FROM Territory2Model WHERE Id = '${modelId}'
  `, orgAlias);

  if (model.length === 0) {
    return { success: false, error: 'Model not found' };
  }

  if (model[0].State === 'Active') {
    return { success: false, error: 'Cannot delete territories from Active model. Archive first.' };
  }

  // Get all territories
  const territories = sfQuery(`
    SELECT Id, Name, DeveloperName, ParentTerritory2Id
    FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
  `, orgAlias);

  console.log(`Model: ${model[0].Name} (${model[0].State})`);
  console.log(`Total Territories: ${territories.length}`);

  if (territories.length === 0) {
    return { success: true, message: 'No territories to delete' };
  }

  // Get all user assignments
  const userCount = sfQuery(`
    SELECT COUNT(Id) cnt FROM UserTerritory2Association uta
    JOIN Territory2 t ON uta.Territory2Id = t.Id
    WHERE t.Territory2ModelId = '${modelId}'
  `, orgAlias);

  // Get all account assignments
  const accountCount = sfQuery(`
    SELECT COUNT(Id) cnt FROM ObjectTerritory2Association ota
    JOIN Territory2 t ON ota.Territory2Id = t.Id
    WHERE t.Territory2ModelId = '${modelId}'
  `, orgAlias);

  console.log(`User Assignments: ${userCount[0]?.cnt || 0}`);
  console.log(`Account Assignments: ${accountCount[0]?.cnt || 0}`);

  if (dryRun) {
    console.log('\n🔍 DRY RUN - Would delete all above');
    return { success: true, dryRun: true };
  }

  if (interactive) {
    const confirmed = await confirm(`\n⚠️  Delete ALL ${territories.length} territories from model?`);
    if (!confirmed) {
      console.log('Cancelled.');
      return { success: false, error: 'Cancelled by user' };
    }
  }

  // Build deletion order (bottom-up)
  const parentMap = new Map(territories.map(t => [t.Id, t.ParentTerritory2Id]));
  const childrenMap = new Map();

  for (const t of territories) {
    const parentId = t.ParentTerritory2Id || 'root';
    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }
    childrenMap.get(parentId).push(t.Id);
  }

  // Topological sort (leaves first)
  const deleteOrder = [];
  const visited = new Set();

  function visit(id) {
    if (visited.has(id)) return;

    const children = childrenMap.get(id) || [];
    for (const childId of children) {
      visit(childId);
    }

    if (id !== 'root') {
      deleteOrder.push(id);
      visited.add(id);
    }
  }

  visit('root');

  // Create checkpoint
  const checkpoint = {
    timestamp: new Date().toISOString(),
    modelId,
    modelName: model[0].Name,
    territories
  };
  const checkpointPath = `territory-model-delete-checkpoint-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
  console.log(`\n💾 Checkpoint created: ${checkpointPath}`);

  // Delete
  console.log('\n🗑️  Deleting territories...\n');
  const results = { deleted: 0, failed: 0, errors: [] };

  for (const id of deleteOrder) {
    const t = territories.find(t => t.Id === id);

    // Delete assignments first
    await deleteUserAssignments(orgAlias, id);
    await deleteAccountAssignments(orgAlias, id);

    // Delete territory
    const result = sfDelete('Territory2', id, orgAlias);

    if (result.success) {
      results.deleted++;
      process.stdout.write(`\r  Deleted: ${results.deleted}/${deleteOrder.length}`);
    } else {
      results.failed++;
      results.errors.push({ territory: t, error: result.error });
    }
  }

  console.log('\n');
  console.log(`✅ Deleted: ${results.deleted}`);
  console.log(`❌ Failed: ${results.failed}`);

  return {
    success: results.failed === 0,
    results,
    checkpointPath
  };
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log(`
Territory Safe Delete Utility

Usage: node territory-safe-delete.js <org-alias> <command> <id> [options]

Commands:
  territory <territory-id>   Delete a single territory
  model <model-id>           Delete all territories in a model

Options:
  --cascade        Delete territory and entire subtree
  --force          Delete assignments before territory
  --dry-run        Show what would be deleted without deleting
  --no-confirm     Skip confirmation prompt

Examples:
  node territory-safe-delete.js myorg territory 0MIxxxxxxxxxx
  node territory-safe-delete.js myorg territory 0MIxxxxxxxxxx --cascade --force
  node territory-safe-delete.js myorg territory 0MIxxxxxxxxxx --dry-run
  node territory-safe-delete.js myorg model 0MCxxxxxxxxxx --dry-run
`);
    process.exit(1);
  }

  const orgAlias = args[0];
  const command = args[1];
  const id = args[2];

  // Parse options
  const options = {
    cascade: args.includes('--cascade'),
    force: args.includes('--force'),
    dryRun: args.includes('--dry-run'),
    interactive: !args.includes('--no-confirm')
  };

  switch (command) {
    case 'territory':
      safeDeleteTerritory(orgAlias, id, options)
        .then(result => process.exit(result.success ? 0 : 1));
      break;

    case 'model':
      deleteModelTerritories(orgAlias, id, options)
        .then(result => process.exit(result.success ? 0 : 1));
      break;

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

module.exports = {
  getDependencies,
  getSubtree,
  safeDeleteTerritory,
  deleteModelTerritories,
  deleteUserAssignments,
  deleteAccountAssignments
};
