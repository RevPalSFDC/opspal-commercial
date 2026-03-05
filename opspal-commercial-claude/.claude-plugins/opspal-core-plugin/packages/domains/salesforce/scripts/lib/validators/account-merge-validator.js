/**
 * Account Merge Validator
 *
 * Validates Account-specific requirements before merging, including:
 * - Shared Contact relationships (Contact to Multiple Accounts)
 * - Account hierarchy circular references
 * - Person Account compatibility
 *
 * Compliance: Implements Account merge special cases from Salesforce SOAP API merge specification
 *
 * @module validators/account-merge-validator
 * @version 1.0.0
 * @created 2025-01-08
 */

const { execSync } = require('child_process');

class AccountMergeValidator {
  /**
   * Initialize the account merge validator
   *
   * @param {string} orgAlias - Salesforce org alias
   * @param {Object} options - Configuration options
   * @param {boolean} options.verbose - Enable detailed logging (default: false)
   */
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.verbose = options.verbose || false;
  }

  /**
   * Validate all Account-specific merge requirements
   *
   * @param {string} masterId - Master account ID
   * @param {string} duplicateId - Duplicate account ID
   * @param {Object} mergeProfile - Merge profile configuration
   * @returns {Promise<Object>} Validation result
   */
  async validateAccountMerge(masterId, duplicateId, mergeProfile) {
    const validationResults = {
      isValid: true,
      errors: [],
      warnings: [],
      infos: [],
      details: {}
    };

    try {
      // Step 1: Validate shared contact relationships
      this.log('Validating shared contact relationships...');
      const sharedContactValidation = await this.validateSharedContacts(
        masterId,
        duplicateId,
        mergeProfile
      );
      validationResults.details.sharedContacts = sharedContactValidation;

      if (!sharedContactValidation.isValid) {
        validationResults.isValid = false;
        validationResults.errors.push(...sharedContactValidation.errors);
      } else if (sharedContactValidation.warnings.length > 0) {
        validationResults.warnings.push(...sharedContactValidation.warnings);
      }

      // Step 2: Validate account hierarchy (circular references)
      if (mergeProfile.checkCircularHierarchy) {
        this.log('Validating account hierarchy...');
        const hierarchyValidation = await this.validateAccountHierarchy(
          masterId,
          duplicateId
        );
        validationResults.details.accountHierarchy = hierarchyValidation;

        if (!hierarchyValidation.isValid) {
          validationResults.isValid = false;
          validationResults.errors.push(...hierarchyValidation.errors);
        } else if (hierarchyValidation.warnings.length > 0) {
          validationResults.warnings.push(...hierarchyValidation.warnings);
        }
      }

      // Step 3: Validate Person Account compatibility
      this.log('Validating Person Account compatibility...');
      const personAccountValidation = await this.validatePersonAccounts(
        masterId,
        duplicateId
      );
      validationResults.details.personAccounts = personAccountValidation;

      if (!personAccountValidation.isValid) {
        validationResults.isValid = false;
        validationResults.errors.push(...personAccountValidation.errors);
      } else if (personAccountValidation.infos.length > 0) {
        validationResults.infos.push(...personAccountValidation.infos);
      }

      // Generate summary
      validationResults.summary = this.generateSummary(validationResults);

    } catch (error) {
      validationResults.isValid = false;
      validationResults.errors.push(`Account validation failed: ${error.message}`);
      validationResults.details.error = error.message;
    }

    return validationResults;
  }

  /**
   * Validate shared contact relationships
   *
   * Per Salesforce spec: "You cannot merge two accounts if they both relate to the
   * same contact via Contact roles or the Shared Contacts feature. You must remove
   * duplicate account-contact relationships before merging accounts."
   *
   * @param {string} masterId - Master account ID
   * @param {string} duplicateId - Duplicate account ID
   * @param {Object} mergeProfile - Merge profile configuration
   * @returns {Promise<Object>} Shared contact validation result
   */
  async validateSharedContacts(masterId, duplicateId, mergeProfile) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      sharedContacts: []
    };

    try {
      // Check if Contact to Multiple Accounts feature is enabled
      // This is indicated by the presence of AccountContactRelation object
      const hasACR = await this.checkAccountContactRelationEnabled();

      if (!hasACR) {
        result.warnings.push(
          'INFO: Contact to Multiple Accounts feature not enabled. ' +
          'Skipping shared contact validation.'
        );
        return result;
      }

      // Query AccountContactRelation for both accounts
      const acrQuery = `
        SELECT Id, AccountId, ContactId, Contact.Name, Roles, IsDirect
        FROM AccountContactRelation
        WHERE AccountId IN ('${masterId}', '${duplicateId}')
      `;

      const queryCmd = `sf data query --query "${acrQuery.replace(/\n/g, ' ')}" --target-org ${this.orgAlias} --json`;
      const queryOutput = execSync(queryCmd, { encoding: 'utf-8' });
      const queryData = JSON.parse(queryOutput);

      if (queryData.status !== 0) {
        throw new Error(`Failed to query AccountContactRelation: ${queryData.message}`);
      }

      const relationships = queryData.result.records || [];

      // Group relationships by ContactId
      const contactMap = {};
      for (const rel of relationships) {
        const contactId = rel.ContactId;
        if (!contactMap[contactId]) {
          contactMap[contactId] = {
            contactId,
            contactName: rel.Contact ? rel.Contact.Name : 'Unknown',
            masterRelationship: null,
            duplicateRelationship: null
          };
        }

        if (rel.AccountId === masterId) {
          contactMap[contactId].masterRelationship = {
            id: rel.Id,
            roles: rel.Roles,
            isDirect: rel.IsDirect
          };
        } else if (rel.AccountId === duplicateId) {
          contactMap[contactId].duplicateRelationship = {
            id: rel.Id,
            roles: rel.Roles,
            isDirect: rel.IsDirect
          };
        }
      }

      // Find contacts that have relationships with BOTH accounts
      for (const [contactId, data] of Object.entries(contactMap)) {
        if (data.masterRelationship && data.duplicateRelationship) {
          result.sharedContacts.push({
            contactId: data.contactId,
            contactName: data.contactName,
            masterRelationshipId: data.masterRelationship.id,
            duplicateRelationshipId: data.duplicateRelationship.id,
            masterRoles: data.masterRelationship.roles,
            duplicateRoles: data.duplicateRelationship.roles
          });
        }
      }

      // If there are shared contacts, this blocks the merge
      if (result.sharedContacts.length > 0) {
        result.isValid = false;
        result.errors.push(
          `SHARED_CONTACT_CONFLICT: Found ${result.sharedContacts.length} contact(s) ` +
          `with relationships to BOTH accounts. ` +
          `Salesforce does not allow merging accounts with shared contact relationships.`
        );
        result.errors.push('');
        result.errors.push('Shared Contacts:');

        for (const contact of result.sharedContacts) {
          result.errors.push(`  - ${contact.contactName} (${contact.contactId})`);
          result.errors.push(`    Master Account Relationship: ${contact.masterRelationshipId}`);
          result.errors.push(`      Roles: ${contact.masterRoles || 'None'}`);
          result.errors.push(`    Duplicate Account Relationship: ${contact.duplicateRelationshipId}`);
          result.errors.push(`      Roles: ${contact.duplicateRoles || 'None'}`);
          result.errors.push('');
        }

        result.errors.push('REQUIRED ACTION:');
        result.errors.push('  1. Choose which AccountContactRelation to keep for each shared contact');
        result.errors.push('  2. Delete the other AccountContactRelation record');
        result.errors.push('  3. Retry the merge after removing duplicate relationships');
        result.errors.push('');
        result.errors.push('Deletion Commands:');
        for (const contact of result.sharedContacts) {
          result.errors.push(
            `  # Keep master, delete duplicate for ${contact.contactName}:`
          );
          result.errors.push(
            `  sf data delete record --sobject AccountContactRelation --record-id ${contact.duplicateRelationshipId} --target-org ${this.orgAlias}`
          );
          result.errors.push('  OR');
          result.errors.push(
            `  # Keep duplicate, delete master for ${contact.contactName}:`
          );
          result.errors.push(
            `  sf data delete record --sobject AccountContactRelation --record-id ${contact.masterRelationshipId} --target-org ${this.orgAlias}`
          );
          result.errors.push('');
        }
      }

    } catch (error) {
      // If error is because AccountContactRelation doesn't exist, that's fine
      if (error.message.includes('sObject type \'AccountContactRelation\' is not supported')) {
        result.warnings.push(
          'INFO: Contact to Multiple Accounts feature not available. ' +
          'Skipping shared contact validation.'
        );
      } else {
        result.warnings.push(`Shared contact validation warning: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * Validate account hierarchy for circular references
   *
   * Per Salesforce spec: "If accounts are part of a parent-child hierarchy,
   * merging can be problematic. If reparenting would create a circular hierarchy
   * (making a parent account a child of its former child), the merge is aborted."
   *
   * @param {string} masterId - Master account ID
   * @param {string} duplicateId - Duplicate account ID
   * @returns {Promise<Object>} Hierarchy validation result
   */
  async validateAccountHierarchy(masterId, duplicateId) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      hierarchy: {}
    };

    try {
      // Query ParentId for both accounts
      const hierarchyQuery = `
        SELECT Id, Name, ParentId, Parent.Name
        FROM Account
        WHERE Id IN ('${masterId}', '${duplicateId}')
      `;

      const queryCmd = `sf data query --query "${hierarchyQuery}" --target-org ${this.orgAlias} --json`;
      const queryOutput = execSync(queryCmd, { encoding: 'utf-8' });
      const queryData = JSON.parse(queryOutput);

      if (queryData.status !== 0) {
        throw new Error(`Failed to query Account hierarchy: ${queryData.message}`);
      }

      const accounts = queryData.result.records;
      const master = accounts.find(a => a.Id === masterId);
      const duplicate = accounts.find(a => a.Id === duplicateId);

      result.hierarchy = {
        masterParentId: master.ParentId,
        masterParentName: master.Parent ? master.Parent.Name : null,
        duplicateParentId: duplicate.ParentId,
        duplicateParentName: duplicate.Parent ? duplicate.Parent.Name : null
      };

      // Check for direct circular reference
      if (master.ParentId === duplicateId) {
        result.isValid = false;
        result.errors.push(
          `CIRCULAR_HIERARCHY: Master account (${master.Name}) is a child of duplicate account (${duplicate.Name}). ` +
          `Merging would create a circular reference (account as its own parent). ` +
          `This is not allowed by Salesforce.`
        );
        result.errors.push('');
        result.errors.push('RESOLUTION: Update the ParentId before merging:');
        result.errors.push(`  sf data update record --sobject Account --record-id ${masterId} --values "ParentId=" --target-org ${this.orgAlias}`);
      }

      if (duplicate.ParentId === masterId) {
        result.warnings.push(
          `WARNING: Duplicate account is a child of master account. ` +
          `After merge, child accounts of duplicate will be reparented to master, ` +
          `creating a potentially deep hierarchy.`
        );
      }

      // TODO: Check for indirect circular references (A->B->C->A)
      // This would require recursive traversal of the hierarchy

    } catch (error) {
      result.warnings.push(`Account hierarchy validation warning: ${error.message}`);
    }

    return result;
  }

  /**
   * Validate Person Account compatibility
   *
   * Per Salesforce spec: "Person Accounts can be merged with other Person Accounts,
   * but not with Business Accounts. Additionally, a Person Account enabled as a
   * Customer Portal user cannot be merged."
   *
   * @param {string} masterId - Master account ID
   * @param {string} duplicateId - Duplicate account ID
   * @returns {Promise<Object>} Person Account validation result
   */
  async validatePersonAccounts(masterId, duplicateId) {
    const result = {
      isValid: true,
      errors: [],
      infos: [],
      accountTypes: {}
    };

    try {
      // Query IsPersonAccount field
      const personAccountQuery = `
        SELECT Id, Name, IsPersonAccount, PersonContactId
        FROM Account
        WHERE Id IN ('${masterId}', '${duplicateId}')
      `;

      const queryCmd = `sf data query --query "${personAccountQuery}" --target-org ${this.orgAlias} --json`;
      const queryOutput = execSync(queryCmd, { encoding: 'utf-8' });
      const queryData = JSON.parse(queryOutput);

      if (queryData.status !== 0) {
        throw new Error(`Failed to query Person Account status: ${queryData.message}`);
      }

      const accounts = queryData.result.records;
      const master = accounts.find(a => a.Id === masterId);
      const duplicate = accounts.find(a => a.Id === duplicateId);

      result.accountTypes = {
        masterIsPersonAccount: master.IsPersonAccount || false,
        duplicateIsPersonAccount: duplicate.IsPersonAccount || false,
        masterPersonContactId: master.PersonContactId,
        duplicatePersonContactId: duplicate.PersonContactId
      };

      const masterIsPerson = master.IsPersonAccount;
      const duplicateIsPerson = duplicate.IsPersonAccount;

      // Case 1: Both are Person Accounts - allowed
      if (masterIsPerson && duplicateIsPerson) {
        result.infos.push(
          'INFO: Both accounts are Person Accounts. Merge is allowed. ' +
          'Person Contact data will be merged according to field merge rules.'
        );

        // Check if either is a portal user
        const portalCheck = await this.checkPersonAccountPortalUsers(
          master.PersonContactId,
          duplicate.PersonContactId
        );
        if (portalCheck.hasPortalUser) {
          result.isValid = false;
          result.errors.push(
            `PERSON_ACCOUNT_PORTAL_USER: ${portalCheck.accountName} is enabled as a Customer Portal user. ` +
            `Person Accounts with portal users cannot be merged. ` +
            `You must deactivate the portal user before merging.`
          );
          result.errors.push('');
          result.errors.push('RESOLUTION:');
          result.errors.push(`  1. Deactivate the portal user (Contact ID: ${portalCheck.contactId})`);
          result.errors.push('  2. Retry the merge');
        }
      }

      // Case 2: Mixing Person Account with Business Account - NOT allowed
      else if (masterIsPerson && !duplicateIsPerson) {
        result.isValid = false;
        result.errors.push(
          `PERSON_ACCOUNT_TYPE_MISMATCH: Cannot merge Person Account with Business Account. ` +
          `Master (${master.Name}) is a Person Account, but duplicate (${duplicate.Name}) is a Business Account. ` +
          `Salesforce does not allow mixing account types in merge operations.`
        );
        result.errors.push('');
        result.errors.push('RESOLUTION: Only merge accounts of the same type.');
      }

      else if (!masterIsPerson && duplicateIsPerson) {
        result.isValid = false;
        result.errors.push(
          `PERSON_ACCOUNT_TYPE_MISMATCH: Cannot merge Business Account with Person Account. ` +
          `Master (${master.Name}) is a Business Account, but duplicate (${duplicate.Name}) is a Person Account. ` +
          `Salesforce does not allow mixing account types in merge operations.`
        );
        result.errors.push('');
        result.errors.push('RESOLUTION: Only merge accounts of the same type.');
      }

      // Case 3: Both are Business Accounts - allowed (normal case)
      else {
        result.infos.push('INFO: Both accounts are Business Accounts. Merge is allowed.');
      }

    } catch (error) {
      // If IsPersonAccount field doesn't exist, Person Accounts are not enabled
      if (error.message.includes('No such column \'IsPersonAccount\'')) {
        result.infos.push('INFO: Person Accounts not enabled in this org. Skipping Person Account validation.');
      } else {
        result.infos.push(`Person Account validation info: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * Check if Person Account is a portal user
   *
   * @param {string} masterPersonContactId - Master Person Contact ID
   * @param {string} duplicatePersonContactId - Duplicate Person Contact ID
   * @returns {Promise<Object>} Portal user check result
   */
  async checkPersonAccountPortalUsers(masterPersonContactId, duplicatePersonContactId) {
    const result = {
      hasPortalUser: false,
      accountName: null,
      contactId: null
    };

    try {
      if (!masterPersonContactId && !duplicatePersonContactId) {
        return result;
      }

      const contactIds = [masterPersonContactId, duplicatePersonContactId].filter(Boolean);

      // Query for portal users associated with these contacts
      const userQuery = `
        SELECT Id, ContactId, Username, IsActive, Profile.UserType
        FROM User
        WHERE ContactId IN ('${contactIds.join("','")}')
        AND IsActive = true
        AND Profile.UserType LIKE '%Portal%'
      `;

      const queryCmd = `sf data query --query "${userQuery}" --target-org ${this.orgAlias} --json`;
      const queryOutput = execSync(queryCmd, { encoding: 'utf-8' });
      const queryData = JSON.parse(queryOutput);

      if (queryData.status !== 0) {
        return result;
      }

      const users = queryData.result.records || [];

      if (users.length > 0) {
        const portalUser = users[0];
        result.hasPortalUser = true;
        result.contactId = portalUser.ContactId;
        result.accountName = portalUser.ContactId === masterPersonContactId ? 'Master' : 'Duplicate';
      }

    } catch (error) {
      // Ignore errors - portal user check is informational
      this.log(`Portal user check warning: ${error.message}`);
    }

    return result;
  }

  /**
   * Check if AccountContactRelation object is enabled
   *
   * @returns {Promise<boolean>} True if ACR is enabled
   */
  async checkAccountContactRelationEnabled() {
    try {
      const describeCmd = `sf sobject describe --sobject AccountContactRelation --target-org ${this.orgAlias} --json`;
      const describeOutput = execSync(describeCmd, { encoding: 'utf-8' });
      const describeData = JSON.parse(describeOutput);

      return describeData.status === 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate a human-readable summary of validation results
   *
   * @param {Object} validationResults - Full validation results
   * @returns {string} Summary text
   */
  generateSummary(validationResults) {
    const lines = [];

    if (validationResults.isValid) {
      lines.push('✅ ACCOUNT MERGE VALIDATION PASSED');
      lines.push('');

      if (validationResults.infos.length > 0) {
        lines.push('Information:');
        validationResults.infos.forEach(i => lines.push(`  ${i}`));
        lines.push('');
      }

      if (validationResults.warnings.length > 0) {
        lines.push(`⚠️  ${validationResults.warnings.length} warning(s):`);
        validationResults.warnings.forEach(w => lines.push(`  ${w}`));
      }

    } else {
      lines.push('❌ ACCOUNT MERGE VALIDATION FAILED');
      lines.push('');
      lines.push(`Found ${validationResults.errors.length} error(s):`);
      validationResults.errors.forEach(e => lines.push(`  ${e}`));
    }

    return lines.join('\n');
  }

  /**
   * Log message if verbose mode is enabled
   *
   * @param {string} message - Message to log
   */
  log(message) {
    if (this.verbose) {
      console.log(`[AccountMergeValidator] ${message}`);
    }
  }
}

module.exports = AccountMergeValidator;
