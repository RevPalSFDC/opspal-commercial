/**
 * Phase 5: Company Hierarchy Updater
 *
 * Re-parents child companies when duplicate is a parent company
 * Maintains company hierarchy integrity during merge
 *
 * CRITICAL: Companies can have parent-child relationships.
 * If we archive a parent company, child companies become orphaned.
 */

/**
 * Find all child companies of a parent company
 */
async function findChildCompanies(hubspotClient, parentCompanyId) {
  try {
    const response = await hubspotClient.crm.companies.searchApi.doSearch({
      filterGroups: [{
        filters: [{
          propertyName: 'hs_parent_company_id',
          operator: 'EQ',
          value: parentCompanyId.toString()
        }]
      }],
      properties: [
        'name',
        'domain',
        'hs_parent_company_id',
        'hs_num_child_companies',
        'createdate'
      ],
      limit: 100
    });

    return response.results || [];

  } catch (error) {
    if (error.code === 404 || error.statusCode === 404) {
      return [];
    }
    throw error;
  }
}

/**
 * Update a company's parent company
 */
async function updateParentCompany(hubspotClient, childCompanyId, newParentCompanyId, dryRun = false) {
  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      childCompanyId: childCompanyId
    };
  }

  try {
    await hubspotClient.crm.companies.basicApi.update(childCompanyId, {
      properties: {
        hs_parent_company_id: newParentCompanyId.toString()
      }
    });

    return {
      success: true,
      childCompanyId: childCompanyId,
      newParentCompanyId: newParentCompanyId
    };

  } catch (error) {
    return {
      success: false,
      childCompanyId: childCompanyId,
      error: error.message
    };
  }
}

/**
 * Batch update child companies with rate limiting
 */
async function batchUpdateChildCompanies(hubspotClient, updates, dryRun = false) {
  console.log(`📊 Updating ${updates.length} child companies in parallel...`);

  // Parallelize updates - each update is independent
  const results = await Promise.all(
    updates.map(async (update) => {
      try {
        const result = await updateParentCompany(
          hubspotClient,
          update.childCompanyId,
          update.newParentCompanyId,
          dryRun
        );

        return {
          ...result,
          childCompanyName: update.childCompanyName,
          oldParentCompanyId: update.oldParentCompanyId,
          oldParentCompanyName: update.oldParentCompanyName,
          newParentCompanyName: update.newParentCompanyName
        };
      } catch (error) {
        console.error(`⚠️  Update failed for ${update.childCompanyName}:`, error.message);
        return {
          success: false,
          childCompanyId: update.childCompanyId,
          childCompanyName: update.childCompanyName,
          error: error.message
        };
      }
    })
  );

  const successCount = results.filter(r => r.success !== false).length;
  console.log(`✅ Updated ${successCount}/${updates.length} companies`);

  return results;
}

/**
 * Update all child companies to point to master as new parent
 *
 * @param {Object} hubspotClient - HubSpot API client
 * @param {Object} master - Master company
 * @param {Array} duplicates - Array of duplicate companies
 * @param {Object} options - Update options
 * @returns {Object} - Update results
 */
async function updateChildCompanies(hubspotClient, master, duplicates, options = {}) {
  const dryRun = options.dryRun || false;

  const updates = [];
  const childrenByParent = {};

  console.log('\n🏢 Checking for child companies that need re-parenting...\n');

  // Find children for each duplicate that's a parent
  for (const duplicate of duplicates) {
    const childCount = parseInt(duplicate.properties.hs_num_child_companies || 0);

    if (childCount === 0) {
      console.log(`  Duplicate ${duplicate.properties.name} has no child companies`);
      continue;
    }

    console.log(`  Checking duplicate: ${duplicate.properties.name} (${childCount} child companies)...`);

    try {
      const children = await findChildCompanies(hubspotClient, duplicate.id);

      if (children.length === 0) {
        console.log(`    Warning: hs_num_child_companies is ${childCount} but no children found`);
        continue;
      }

      console.log(`    Found ${children.length} child companies`);

      childrenByParent[duplicate.id] = children;

      // Prepare updates
      children.forEach(child => {
        updates.push({
          childCompanyId: child.id,
          childCompanyName: child.properties.name,
          oldParentCompanyId: duplicate.id,
          oldParentCompanyName: duplicate.properties.name,
          newParentCompanyId: master.id,
          newParentCompanyName: master.properties.name
        });
      });

    } catch (error) {
      console.error(`    ❌ Error finding child companies: ${error.message}`);
      throw error;
    }

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (updates.length === 0) {
    console.log('  ✅ No child companies need re-parenting\n');
    return {
      status: 'success',
      totalUpdates: 0,
      successfulUpdates: 0,
      failedUpdates: 0,
      message: 'No child companies to update',
      dryRun: dryRun
    };
  }

  console.log(`\n  Found ${updates.length} child companies that need re-parenting`);

  if (dryRun) {
    console.log(`  DRY RUN: Would re-parent ${updates.length} child companies\n`);
    return {
      status: 'dry_run',
      totalUpdates: updates.length,
      plannedUpdates: updates,
      dryRun: true
    };
  }

  // Perform batch updates
  console.log(`  Re-parenting ${updates.length} child companies to master...\n`);

  const results = await batchUpdateChildCompanies(hubspotClient, updates, dryRun);

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`  ✅ Successfully re-parented: ${successful.length} child companies`);
  if (failed.length > 0) {
    console.log(`  ❌ Failed to re-parent: ${failed.length} child companies`);
    console.error(`  Errors:`, failed.map(f => `${f.childCompanyName}: ${f.error}`).join('; '));
  }
  console.log();

  return {
    status: successful.length === updates.length ? 'success' : 'partial_success',
    totalUpdates: updates.length,
    successfulUpdates: successful.length,
    failedUpdates: failed.length,
    childrenByParent: childrenByParent,
    updateResults: results,
    dryRun: dryRun
  };
}

/**
 * Validate that no child companies point to archived parents
 */
async function validateNoOrphanedChildren(hubspotClient, duplicates) {
  const errors = [];

  console.log('🔍 Validating no child companies point to archived parents...\n');

  for (const duplicate of duplicates) {
    const children = await findChildCompanies(hubspotClient, duplicate.id);

    if (children.length > 0) {
      errors.push(
        `${children.length} child companies still point to archived parent ${duplicate.id}`
      );

      console.error(`  ❌ ${children.length} children still have company ${duplicate.id} as parent:`);
      children.slice(0, 5).forEach(c => {
        console.error(`     - ${c.properties.name} (${c.id})`);
      });
      if (children.length > 5) {
        console.error(`     ... and ${children.length - 5} more`);
      }
    }
  }

  if (errors.length === 0) {
    console.log('  ✅ No child companies point to archived parents\n');
  } else {
    console.log();
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Check if a company is in a hierarchy loop
 * (prevents setting parent that would create circular reference)
 */
async function detectHierarchyLoop(hubspotClient, companyId, potentialParentId, maxDepth = 10) {
  let currentParentId = potentialParentId;
  let depth = 0;

  while (currentParentId && depth < maxDepth) {
    // If we encounter the original company ID, we have a loop
    if (currentParentId.toString() === companyId.toString()) {
      return true;
    }

    // Get the parent's parent
    try {
      const parentCompany = await hubspotClient.crm.companies.basicApi.getById(
        currentParentId,
        ['hs_parent_company_id']
      );

      currentParentId = parentCompany.properties.hs_parent_company_id;
      depth++;

    } catch (error) {
      // Parent doesn't exist or can't be fetched
      break;
    }
  }

  return false;
}

module.exports = {
  updateChildCompanies,
  validateNoOrphanedChildren,
  findChildCompanies,
  updateParentCompany,
  detectHierarchyLoop
};
