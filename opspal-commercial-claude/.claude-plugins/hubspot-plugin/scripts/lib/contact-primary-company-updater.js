/**
 * Phase 4: Contact Primary Company Updater
 *
 * Updates contacts where duplicate company is the primary company
 * Prevents contacts from having archived/merged company as primary
 *
 * CRITICAL: In HubSpot, contacts have a "primary company" that's separate
 * from company associations. This is stored in the contact's
 * 'associatedcompanyid' property.
 */

/**
 * Find contacts with a specific company as their primary company
 */
async function findContactsWithPrimaryCompany(hubspotClient, companyId) {
  try {
    const response = await hubspotClient.crm.contacts.searchApi.doSearch({
      filterGroups: [{
        filters: [{
          propertyName: 'associatedcompanyid',
          operator: 'EQ',
          value: companyId.toString()
        }]
      }],
      properties: [
        'email',
        'firstname',
        'lastname',
        'associatedcompanyid',
        'hs_lifecyclestage_customer_date',
        'hs_lead_status'
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
 * Update a contact's primary company
 */
async function updateContactPrimaryCompany(hubspotClient, contactId, newPrimaryCompanyId, dryRun = false) {
  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      contactId: contactId
    };
  }

  try {
    await hubspotClient.crm.contacts.basicApi.update(contactId, {
      properties: {
        associatedcompanyid: newPrimaryCompanyId.toString()
      }
    });

    return {
      success: true,
      contactId: contactId,
      newPrimaryCompanyId: newPrimaryCompanyId
    };

  } catch (error) {
    return {
      success: false,
      contactId: contactId,
      error: error.message
    };
  }
}

/**
 * Batch update contacts with rate limiting
 */
async function batchUpdateContacts(hubspotClient, updates, dryRun = false) {
  console.log(`📊 Updating ${updates.length} contact primary companies in parallel...`);

  // Parallelize updates - each update is independent
  const results = await Promise.all(
    updates.map(async (update) => {
      try {
        const result = await updateContactPrimaryCompany(
          hubspotClient,
          update.contactId,
          update.newPrimaryCompanyId,
          dryRun
        );

        return {
          ...result,
          contactEmail: update.contactEmail,
          contactName: update.contactName,
          oldPrimaryCompanyId: update.oldPrimaryCompanyId
        };
      } catch (error) {
        console.error(`⚠️  Update failed for contact ${update.contactEmail}:`, error.message);
        return {
          success: false,
          contactId: update.contactId,
          contactEmail: update.contactEmail,
          error: error.message
        };
      }
    })
  );

  const successCount = results.filter(r => r.success !== false).length;
  console.log(`✅ Updated ${successCount}/${updates.length} contacts`);

  return results;
}

/**
 * Update all contacts that have duplicate companies as their primary company
 *
 * @param {Object} hubspotClient - HubSpot API client
 * @param {Object} master - Master company
 * @param {Array} duplicates - Array of duplicate companies
 * @param {Object} options - Update options
 * @returns {Object} - Update results
 */
async function updatePrimaryCompanyForContacts(hubspotClient, master, duplicates, options = {}) {
  const dryRun = options.dryRun || false;

  const updates = [];
  const contactsByDuplicate = {};

  console.log('\n👤 Checking for contacts with duplicates as primary company...\n');

  // Find contacts for each duplicate
  for (const duplicate of duplicates) {
    console.log(`  Checking duplicate: ${duplicate.properties.name} (${duplicate.id})...`);

    try {
      const contacts = await findContactsWithPrimaryCompany(hubspotClient, duplicate.id);

      if (contacts.length === 0) {
        console.log(`    No contacts found with this as primary company`);
        continue;
      }

      console.log(`    Found ${contacts.length} contacts with this as primary company`);

      contactsByDuplicate[duplicate.id] = contacts;

      // Prepare updates
      contacts.forEach(contact => {
        updates.push({
          contactId: contact.id,
          contactEmail: contact.properties.email || 'no-email',
          contactName: `${contact.properties.firstname || ''} ${contact.properties.lastname || ''}`.trim() || 'Unknown',
          oldPrimaryCompanyId: duplicate.id,
          oldPrimaryCompanyName: duplicate.properties.name,
          newPrimaryCompanyId: master.id,
          newPrimaryCompanyName: master.properties.name
        });
      });

    } catch (error) {
      console.error(`    ❌ Error checking contacts: ${error.message}`);
      throw error;
    }

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (updates.length === 0) {
    console.log('  ✅ No contacts need primary company updates\n');
    return {
      status: 'success',
      totalUpdates: 0,
      successfulUpdates: 0,
      failedUpdates: 0,
      message: 'No contacts with duplicates as primary company',
      dryRun: dryRun
    };
  }

  console.log(`\n  Found ${updates.length} total contacts that need primary company updates`);

  if (dryRun) {
    console.log(`  DRY RUN: Would update ${updates.length} contacts\n`);
    return {
      status: 'dry_run',
      totalUpdates: updates.length,
      plannedUpdates: updates,
      dryRun: true
    };
  }

  // Perform batch updates
  console.log(`  Updating primary company for ${updates.length} contacts...\n`);

  const results = await batchUpdateContacts(hubspotClient, updates, dryRun);

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`  ✅ Successfully updated: ${successful.length} contacts`);
  if (failed.length > 0) {
    console.log(`  ❌ Failed to update: ${failed.length} contacts`);
    console.error(`  Errors:`, failed.map(f => `${f.contactEmail}: ${f.error}`).join('; '));
  }
  console.log();

  return {
    status: successful.length === updates.length ? 'success' : 'partial_success',
    totalUpdates: updates.length,
    successfulUpdates: successful.length,
    failedUpdates: failed.length,
    contactsByDuplicate: contactsByDuplicate,
    updateResults: results,
    dryRun: dryRun
  };
}

/**
 * Validate that no contacts have archived companies as primary
 */
async function validateNoPrimaryCompanyOrphans(hubspotClient, duplicates) {
  const errors = [];

  console.log('🔍 Validating no contacts have archived companies as primary...\n');

  for (const duplicate of duplicates) {
    const contacts = await findContactsWithPrimaryCompany(hubspotClient, duplicate.id);

    if (contacts.length > 0) {
      errors.push(
        `${contacts.length} contacts still have archived company ${duplicate.id} as primary`
      );

      console.error(`  ❌ ${contacts.length} contacts with company ${duplicate.id} as primary:`);
      contacts.slice(0, 5).forEach(c => {
        console.error(`     - ${c.properties.email || 'no-email'} (${c.id})`);
      });
      if (contacts.length > 5) {
        console.error(`     ... and ${contacts.length - 5} more`);
      }
    }
  }

  if (errors.length === 0) {
    console.log('  ✅ No contacts have archived companies as primary\n');
  } else {
    console.log();
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  updatePrimaryCompanyForContacts,
  validateNoPrimaryCompanyOrphans,
  findContactsWithPrimaryCompany,
  updateContactPrimaryCompany
};
