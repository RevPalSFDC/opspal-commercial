#!/usr/bin/env node

/**
 * Contact Merge Validator - Runbook-Compliant Contact-Specific Validation
 *
 * Implements Contact-specific merge validation from Salesforce Record Merging Runbook:
 * 1. Portal User Handling - Only one user login can remain
 * 2. Individual Records (GDPR) - Most recent Individual record selection
 * 3. Circular Hierarchy - Prevents ReportsTo loops
 * 4. Relationship Conflicts - Shared account relationships, duplicate campaign members
 *
 * Runbook References:
 * - "Contacts - Using SOAP API (Merge Contacts)" section
 * - Portal Users: Ad

ditionalInformationMap with PortalUserId
 * - Individual: Most recently updated Individual if enabled
 * - Circular Hierarchy: ReportsToId cannot create loops
 *
 * Usage:
 *   const validator = new ContactMergeValidator(orgAlias, options);
 *   const result = await validator.validateObjectSpecificRules(master, duplicate, profile);
 *
 * @version 1.0.0
 * @phase Phase 3.1 - Contact-Specific Safety Checks
 */

const { execSync } = require('child_process');

class ContactMergeValidator {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.options = options;
  }

  /**
   * Convenience wrapper for Contact merge validation (takes IDs)
   * Provides consistent API with AccountMergeValidator
   *
   * @param {string} masterId - Master contact ID
   * @param {string} duplicateId - Duplicate contact ID
   * @param {Object} mergeProfile - Merge profile configuration
   * @returns {Promise<Object>} Validation result with isValid, errors, warnings, infos, details
   */
  async validateContactMerge(masterId, duplicateId, mergeProfile) {
    const validationResults = {
      isValid: true,
      errors: [],
      warnings: [],
      infos: [],
      details: {}
    };

    try {
      // Query both contact records
      const query = `SELECT Id, Name, Email, AccountId, ReportsToId, IndividualId
                     FROM Contact
                     WHERE Id IN ('${masterId}', '${duplicateId}')`;
      const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;
      const output = execSync(cmd, { encoding: 'utf-8' });
      const data = JSON.parse(output);

      if (data.status !== 0) {
        throw new Error(`Failed to query contacts: ${data.message}`);
      }

      const contacts = data.result.records;
      if (contacts.length !== 2) {
        throw new Error(`Expected 2 contacts, found ${contacts.length}`);
      }

      const masterRecord = contacts.find(c => c.Id === masterId);
      const duplicateRecord = contacts.find(c => c.Id === duplicateId);

      if (!masterRecord || !duplicateRecord) {
        throw new Error('Could not find both master and duplicate contacts');
      }

      // Call main validation method
      const result = await this.validateObjectSpecificRules(masterRecord, duplicateRecord, mergeProfile);

      if (result.errors && result.errors.length > 0) {
        validationResults.isValid = false;
        validationResults.errors = result.errors;
      }

      // Store validation details
      validationResults.details = result.details || {};

    } catch (error) {
      validationResults.isValid = false;
      validationResults.errors.push(`Contact merge validation failed: ${error.message}`);
      validationResults.details.error = error.message;
    }

    return validationResults;
  }

  /**
   * Main validation method for Contact-specific rules
   * Called by DedupSafetyEngine or validateContactMerge wrapper
   */
  async validateObjectSpecificRules(masterRecord, duplicateRecord, profile) {
    const errors = [];
    const details = {};

    // Check 1: Portal user handling (Runbook requirement)
    const portalUserResult = await this.checkPortalUsers(masterRecord, duplicateRecord, profile);
    if (portalUserResult.errors) {
      errors.push(...portalUserResult.errors);
    }
    details.portalUsers = portalUserResult;

    // Check 2: Individual records (GDPR) (Runbook requirement)
    const individualResult = await this.checkIndividualRecords(masterRecord, duplicateRecord, profile);
    if (individualResult.errors) {
      errors.push(...individualResult.errors);
    }
    details.individualRecords = individualResult;

    // Check 3: Circular hierarchy (Runbook requirement)
    const hierarchyResult = await this.checkCircularHierarchy(masterRecord, duplicateRecord, profile);
    if (hierarchyResult.errors) {
      errors.push(...hierarchyResult.errors);
    }
    details.reportsToHierarchy = hierarchyResult;

    // Check 4: Relationship conflicts
    const relationshipResult = await this.checkRelationshipConflicts(masterRecord, duplicateRecord, profile);
    if (relationshipResult.errors) {
      errors.push(...relationshipResult.errors);
    }
    details.relationshipConflicts = relationshipResult;

    return { errors, details };
  }

  /**
   * Check 1: Portal User Handling
   *
   * Runbook: "If the contact records being merged are associated with community
   * or portal user accounts, only one user login can be linked to the surviving contact.
   * Use AdditionalInformationMap with PortalUserId."
   *
   * Implementation:
   * - Query User records WHERE ContactId IN (master, duplicate)
   * - If both have portal users, BLOCK merge with selection requirement
   * - If one has portal user, ensure it's preserved with master
   */
  async checkPortalUsers(masterRecord, duplicateRecord, profile) {
    const errors = [];
    const users = [];

    if (!profile.specialCases?.portalUser?.enabled) {
      return { errors, users };
    }

    try {
      // Query for portal/community users associated with these contacts
      const userQuery = `SELECT Id, ContactId, Username, UserType, IsActive, Profile.Name
                         FROM User
                         WHERE ContactId IN ('${masterRecord.Id}', '${duplicateRecord.Id}')
                         AND IsActive = true`;

      const cmd = `sf data query --query "${userQuery}" --target-org ${this.orgAlias} --json`;
      const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      const parsed = JSON.parse(result);

      const queriedUsers = parsed.result?.records || [];
      users.push(...queriedUsers);

      if (users.length === 0) {
        // No portal users - safe to proceed
        return { errors, users };
      }

      const masterUsers = users.filter(u => u.ContactId === masterRecord.Id);
      const duplicateUsers = users.filter(u => u.ContactId === duplicateRecord.Id);

      if (masterUsers.length > 0 && duplicateUsers.length > 0) {
        // BLOCK: Both contacts have portal users
        // Runbook: Only ONE user can remain - requires manual selection
        errors.push({
          type: 'PORTAL_USER_CONFLICT',
          severity: 'TYPE1_ERROR',
          message: `Both contacts have active portal users - only one user can remain after merge`,
          details: {
            masterUsers: masterUsers.map(u => ({
              id: u.Id,
              username: u.Username,
              userType: u.UserType,
              profileName: u.Profile?.Name
            })),
            duplicateUsers: duplicateUsers.map(u => ({
              id: u.Id,
              username: u.Username,
              userType: u.UserType,
              profileName: u.Profile?.Name
            }))
          },
          runbookReference: 'AdditionalInformationMap with PortalUserId',
          remediation: [
            'Select which portal user should remain (PortalUserId parameter)',
            'The other user will be deactivated/reassigned',
            'Cannot proceed without user selection',
            'CLI Implementation: Deactivate duplicate user, reassign ContactId to master'
          ]
        });
      } else if (duplicateUsers.length > 0 && masterUsers.length === 0) {
        // WARN: Duplicate has portal user, master doesn't
        // User must be transferred to master
        errors.push({
          type: 'PORTAL_USER_TRANSFER_REQUIRED',
          severity: 'WARN',
          message: `Duplicate contact has portal user - will be transferred to master`,
          details: {
            duplicateUsers: duplicateUsers.map(u => ({
              id: u.Id,
              username: u.Username,
              userType: u.UserType
            }))
          },
          remediation: [
            'Portal user will be updated: ContactId → master.Id',
            'Verify master contact has required fields for portal access',
            'Test portal login after merge'
          ]
        });
      }

    } catch (error) {
      this.log(`Portal user check failed: ${error.message}`, 'ERROR');
      errors.push({
        type: 'VALIDATION_ERROR',
        severity: 'WARN',
        message: 'Could not validate portal users',
        details: { error: error.message }
      });
    }

    return { errors, users };
  }

  /**
   * Check 2: Individual Records (GDPR/Data Privacy)
   *
   * Runbook: "If the Individual object is enabled (Data Privacy records for GDPR),
   * merging contacts will choose which Individual record to keep. By configuration,
   * either the most recently updated Individual or the one tied to the master is retained."
   *
   * Implementation:
   * - Query Individual records associated with contacts
   * - If both have Individuals, use most recent (LastModifiedDate)
   * - Inform user which Individual will be retained
   */
  async checkIndividualRecords(masterRecord, duplicateRecord, profile) {
    const errors = [];

    if (!profile.specialCases?.individual?.enabled) {
      return { errors };
    }

    try {
      // Check if Individual object exists and is accessible
      const individualQuery = `SELECT Id, LastModifiedDate
                               FROM Individual
                               WHERE Id IN (SELECT IndividualId FROM Contact WHERE Id IN ('${masterRecord.Id}', '${duplicateRecord.Id}'))`;

      const cmd = `sf data query --query "${individualQuery}" --target-org ${this.orgAlias} --json`;
      const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      const parsed = JSON.parse(result);

      const individuals = parsed.result?.records || [];

      if (individuals.length === 0) {
        // No Individual records - safe to proceed
        return { errors };
      }

      // Sort by LastModifiedDate (most recent first)
      individuals.sort((a, b) => new Date(b.LastModifiedDate) - new Date(a.LastModifiedDate));
      const mostRecentIndividual = individuals[0];

      if (individuals.length > 1) {
        // INFO: Multiple Individuals - most recent will be kept
        errors.push({
          type: 'INDIVIDUAL_RECORD_SELECTION',
          severity: 'INFO',
          message: `Both contacts have Individual records (GDPR) - most recent will be retained`,
          details: {
            selectedIndividual: mostRecentIndividual.Id,
            lastModified: mostRecentIndividual.LastModifiedDate,
            totalIndividuals: individuals.length
          },
          runbookReference: 'Most recently updated Individual retained if enabled',
          note: 'This is automatic per org Data Privacy settings (Setup > Data Privacy > Individual)'
        });
      }

    } catch (error) {
      // Individual object might not be enabled - this is not an error
      this.log(`Individual record check skipped: ${error.message}`, 'DEBUG');
    }

    return { errors };
  }

  /**
   * Check 3: Circular Hierarchy (ReportsTo)
   *
   * Runbook: "Contacts can have a ReportsToId field. When merging contacts,
   * Salesforce attempts to preserve this hierarchy. If this would create a loop
   * (a cyclical relationship), the merge will error out."
   *
   * Example: Contact B reports to Contact A. Merging A into B would make B report
   * to itself (indirectly), creating a circular reference.
   *
   * Implementation:
   * - Check if duplicate.ReportsToId === master.Id (direct loop)
   * - Check if master.ReportsToId === duplicate.Id (reverse loop)
   * - Check indirect loops via recursive hierarchy traversal (A->B->C->A)
   */
  async checkCircularHierarchy(masterRecord, duplicateRecord, profile) {
    const errors = [];

    if (!profile.validation?.checkCircularHierarchy || !profile.hierarchyField) {
      return { errors };
    }

    const hierarchyField = profile.hierarchyField; // ReportsToId for Contacts

    // Check 1: Direct circular reference
    if (duplicateRecord[hierarchyField] === masterRecord.Id) {
      errors.push({
        type: 'CIRCULAR_HIERARCHY_DIRECT',
        severity: 'TYPE1_ERROR',
        message: `Circular hierarchy detected: duplicate reports to master via ${hierarchyField}`,
        details: {
          masterId: masterRecord.Id,
          masterName: masterRecord.Name,
          duplicateId: duplicateRecord.Id,
          duplicateName: duplicateRecord.Name,
          duplicateReportsTo: duplicateRecord[hierarchyField]
        },
        runbookReference: 'Circular relationship prevents merge',
        remediation: [
          'Break the ReportsTo relationship before merging',
          'Update duplicate.ReportsToId to null or different contact',
          'Or swap master/duplicate to avoid the loop'
        ]
      });
    }

    // Check 2: Reverse circular reference
    if (masterRecord[hierarchyField] === duplicateRecord.Id) {
      errors.push({
        type: 'CIRCULAR_HIERARCHY_REVERSE',
        severity: 'TYPE1_ERROR',
        message: `Circular hierarchy detected: master reports to duplicate via ${hierarchyField}`,
        details: {
          masterId: masterRecord.Id,
          masterName: masterRecord.Name,
          masterReportsTo: masterRecord[hierarchyField],
          duplicateId: duplicateRecord.Id,
          duplicateName: duplicateRecord.Name
        },
        runbookReference: 'Circular relationship prevents merge',
        remediation: [
          'Break the ReportsTo relationship before merging',
          'Update master.ReportsToId to null or different contact',
          'Or swap master/duplicate to avoid the loop'
        ]
      });
    }

    // Check 3: Indirect circular references (A->B->C->A)
    // Use comprehensive detection method
    try {
      const masterCheck = await this.detectCircularReferences(
        masterRecord.Id,
        'Contact',
        hierarchyField
      );

      const duplicateCheck = await this.detectCircularReferences(
        duplicateRecord.Id,
        'Contact',
        hierarchyField
      );

      // Master is in circular chain
      if (masterCheck.isCircular) {
        errors.push({
          type: 'CIRCULAR_HIERARCHY_INDIRECT',
          severity: 'TYPE1_ERROR',
          message: `Master record is in circular reference chain (${masterCheck.depth}-level loop)`,
          details: {
            masterId: masterRecord.Id,
            masterName: masterRecord.Name,
            chain: masterCheck.chain,
            depth: masterCheck.depth,
            cycleStart: masterCheck.cycleStart
          },
          runbookReference: 'Circular relationship prevents merge',
          remediation: [
            `Break the circular chain at any point: ${masterCheck.chain.join(' → ')}`,
            'Update ReportsToId to null for one of the contacts in the chain',
            'Or restructure the reporting hierarchy to avoid the loop'
          ]
        });
      }

      // Duplicate is in circular chain
      if (duplicateCheck.isCircular) {
        errors.push({
          type: 'CIRCULAR_HIERARCHY_INDIRECT',
          severity: 'TYPE1_ERROR',
          message: `Duplicate record is in circular reference chain (${duplicateCheck.depth}-level loop)`,
          details: {
            duplicateId: duplicateRecord.Id,
            duplicateName: duplicateRecord.Name,
            chain: duplicateCheck.chain,
            depth: duplicateCheck.depth,
            cycleStart: duplicateCheck.cycleStart
          },
          runbookReference: 'Circular relationship prevents merge',
          remediation: [
            `Break the circular chain at any point: ${duplicateCheck.chain.join(' → ')}`,
            'Update ReportsToId to null for one of the contacts in the chain',
            'Or restructure the reporting hierarchy to avoid the loop'
          ]
        });
      }

      // Warn about deep hierarchies (approaching max depth)
      if (masterCheck.depth >= 15 || duplicateCheck.depth >= 15) {
        errors.push({
          type: 'DEEP_HIERARCHY_WARNING',
          severity: 'WARN',
          message: `Deep reporting hierarchy detected (${Math.max(masterCheck.depth, duplicateCheck.depth)} levels)`,
          details: {
            masterDepth: masterCheck.depth,
            duplicateDepth: duplicateCheck.depth,
            warning: 'Consider flattening the reporting structure for better performance'
          }
        });
      }

      // Check if max depth was reached (possible very deep nesting)
      if (masterCheck.limitReached || duplicateCheck.limitReached) {
        errors.push({
          type: 'HIERARCHY_DEPTH_LIMIT',
          severity: 'WARN',
          message: 'Maximum hierarchy depth reached during traversal',
          details: {
            warning: masterCheck.warning || duplicateCheck.warning,
            note: 'Validation stopped at depth 20 - possible extremely deep nesting'
          }
        });
      }

    } catch (error) {
      this.log(`Indirect circular reference check failed: ${error.message}`, 'ERROR');
      errors.push({
        type: 'VALIDATION_ERROR',
        severity: 'WARN',
        message: 'Could not complete indirect circular reference check',
        details: { error: error.message }
      });
    }

    return { errors };
  }

  /**
   * Detect circular references (direct and indirect)
   *
   * Uses recursive traversal to detect circular reference chains of any depth.
   * Prevents infinite recursion with MAX_DEPTH limit and visited set tracking.
   *
   * @param {string} recordId - Record to check
   * @param {string} object - Object type (Contact, Account)
   * @param {string} field - Lookup field (ReportsToId, ParentId)
   * @returns {Promise<Object>} { isCircular, chain, depth, cycleStart?, limitReached?, warning? }
   *
   * @example
   * // Check for circular references in Contact hierarchy
   * const result = await validator.detectCircularReferences('003xx...', 'Contact', 'ReportsToId');
   * if (result.isCircular) {
   *   console.log(`Circular chain: ${result.chain.join(' → ')}`);
   *   console.log(`Cycle starts at: ${result.cycleStart}`);
   * }
   */
  async detectCircularReferences(recordId, object, field) {
    const MAX_DEPTH = 20; // Prevent infinite recursion
    const visited = new Set();
    const chain = [];

    return await this._traverseHierarchy(
      recordId,
      object,
      field,
      visited,
      chain,
      0,
      MAX_DEPTH
    );
  }

  /**
   * Recursive hierarchy traversal
   *
   * Traverses up the hierarchy chain (following lookup field references) to detect
   * circular references. Stops when:
   * - A circular reference is found (visited set contains current record)
   * - Maximum depth is reached (MAX_DEPTH limit)
   * - End of chain is reached (no parent reference)
   *
   * @param {string} recordId - Current record ID
   * @param {string} object - Object type (Contact, Account)
   * @param {string} field - Lookup field (ReportsToId, ParentId)
   * @param {Set<string>} visited - Set of visited record IDs
   * @param {Array<string>} chain - Array of record IDs in traversal order
   * @param {number} depth - Current depth in hierarchy
   * @param {number} maxDepth - Maximum allowed depth
   * @returns {Promise<Object>} Traversal result
   * @private
   */
  async _traverseHierarchy(recordId, object, field, visited, chain, depth, maxDepth) {
    // Depth limit check - prevents infinite recursion in very deep hierarchies
    if (depth > maxDepth) {
      return {
        isCircular: false,
        chain: chain,
        depth: depth,
        limitReached: true,
        warning: 'Maximum hierarchy depth reached - possible extremely deep nesting'
      };
    }

    // Circular reference check - found a loop
    if (visited.has(recordId)) {
      return {
        isCircular: true,
        chain: [...chain, recordId],
        depth: depth,
        cycleStart: recordId
      };
    }

    // Mark as visited
    visited.add(recordId);
    chain.push(recordId);

    // Query the lookup field
    const query = `SELECT Id, Name, ${field} FROM ${object} WHERE Id = '${recordId}'`;
    let result;

    try {
      const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;
      const output = execSync(cmd, { encoding: 'utf-8' });
      const data = JSON.parse(output);

      if (data.status !== 0) {
        throw new Error(`Query failed: ${data.message}`);
      }

      const records = data.result?.records || [];
      if (records.length === 0) {
        // Record doesn't exist or was deleted
        return {
          isCircular: false,
          chain: chain,
          depth: depth,
          error: 'Record not found or deleted'
        };
      }

      result = records[0];

    } catch (error) {
      // Query failed - likely permissions or object doesn't exist
      return {
        isCircular: false,
        chain: chain,
        depth: depth,
        error: error.message
      };
    }

    // No parent reference - end of chain
    if (!result[field]) {
      return {
        isCircular: false,
        chain: chain,
        depth: depth
      };
    }

    // Recursively check parent
    return await this._traverseHierarchy(
      result[field],
      object,
      field,
      visited,
      chain,
      depth + 1,
      maxDepth
    );
  }

  /**
   * Validate merge safety with circular reference check
   *
   * Enhanced validation that checks for:
   * - Existing circular references in master or duplicate
   * - Potential circular references that would be created by merge
   * - Simulates merge by checking if newParentId would create cycle
   *
   * @param {string} masterId - Master contact ID
   * @param {string} duplicateId - Duplicate contact ID
   * @param {Object} options - Merge options
   * @param {string} options.newParentId - New parent ID to set after merge (optional)
   * @param {string} options.hierarchyField - Hierarchy field name (defaults to 'ReportsToId')
   * @returns {Promise<Object>} { safe, issues }
   *
   * @example
   * // Validate merge and simulate new parent relationship
   * const result = await validator.validateMergeSafety('003xx...', '003yy...', {
   *   newParentId: '003zz...',
   *   hierarchyField: 'ReportsToId'
   * });
   *
   * if (!result.safe) {
   *   for (const issue of result.issues) {
   *     console.error(`${issue.type}: ${issue.message}`);
   *   }
   * }
   */
  async validateMergeSafety(masterId, duplicateId, options = {}) {
    const issues = [];
    const hierarchyField = options.hierarchyField || 'ReportsToId';
    const object = 'Contact'; // Can be parameterized for Account support

    // Check if either record is in a circular reference
    const masterCheck = await this.detectCircularReferences(masterId, object, hierarchyField);
    const duplicateCheck = await this.detectCircularReferences(duplicateId, object, hierarchyField);

    if (masterCheck.isCircular) {
      issues.push({
        type: 'CIRCULAR_REFERENCE',
        severity: 'error',
        record: masterId,
        chain: masterCheck.chain,
        message: `Master record is in circular reference chain: ${masterCheck.chain.join(' → ')}`
      });
    }

    if (duplicateCheck.isCircular) {
      issues.push({
        type: 'CIRCULAR_REFERENCE',
        severity: 'error',
        record: duplicateId,
        chain: duplicateCheck.chain,
        message: `Duplicate record is in circular reference chain: ${duplicateCheck.chain.join(' → ')}`
      });
    }

    // Check if merge would create circular reference
    if (options.newParentId) {
      // Simulate: After merge, master would have newParentId as parent
      // Check if newParentId is in master's descendant chain
      const masterDescendants = await this._getDescendants(masterId, object, hierarchyField);

      if (masterDescendants.has(options.newParentId)) {
        issues.push({
          type: 'MERGE_WOULD_CREATE_CYCLE',
          severity: 'error',
          record: masterId,
          newParent: options.newParentId,
          message: `Setting ${hierarchyField} to ${options.newParentId} would create circular reference`
        });
      }

      // Also check if master is in newParent's chain
      const newParentChain = await this.detectCircularReferences(options.newParentId, object, hierarchyField);
      if (newParentChain.chain && newParentChain.chain.includes(masterId)) {
        issues.push({
          type: 'MERGE_WOULD_CREATE_CYCLE',
          severity: 'error',
          record: masterId,
          newParent: options.newParentId,
          message: `Master is already in new parent's reporting chain - merge would create cycle`
        });
      }
    }

    return {
      safe: issues.length === 0,
      issues: issues
    };
  }

  /**
   * Helper: Get all descendants of a record in hierarchy
   *
   * Queries all records that report (directly or indirectly) to the given record.
   * Used for merge simulation to detect if setting a new parent would create a cycle.
   *
   * @param {string} recordId - Root record ID
   * @param {string} object - Object type (Contact, Account)
   * @param {string} field - Lookup field (ReportsToId, ParentId)
   * @returns {Promise<Set<string>>} Set of descendant record IDs
   * @private
   */
  async _getDescendants(recordId, object, field) {
    const descendants = new Set();
    const toProcess = [recordId];
    const processed = new Set();

    while (toProcess.length > 0) {
      const currentId = toProcess.shift();

      if (processed.has(currentId)) {
        continue;
      }
      processed.add(currentId);

      // Query direct children
      const query = `SELECT Id FROM ${object} WHERE ${field} = '${currentId}'`;

      try {
        const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;
        const output = execSync(cmd, { encoding: 'utf-8' });
        const data = JSON.parse(output);

        if (data.status === 0 && data.result?.records) {
          for (const record of data.result.records) {
            descendants.add(record.Id);
            toProcess.push(record.Id);
          }
        }

      } catch (error) {
        this.log(`Failed to query descendants: ${error.message}`, 'DEBUG');
      }
    }

    return descendants;
  }

  /**
   * Check 4: Relationship Conflicts
   *
   * Detects relationship conflicts specific to Contacts:
   * - Duplicate Account-Contact relationships (Contact to Multiple Accounts)
   * - Duplicate CampaignMember records (same Contact + Campaign)
   * - Duplicate OpportunityContactRole records
   */
  async checkRelationshipConflicts(masterRecord, duplicateRecord, profile) {
    const errors = [];

    try {
      // Check 1: Account-Contact Relationships (if Contact to Multiple Accounts enabled)
      const acrConflicts = await this.checkAccountContactRelationships(masterRecord, duplicateRecord);
      if (acrConflicts.length > 0) {
        errors.push({
          type: 'DUPLICATE_ACCOUNT_RELATIONSHIPS',
          severity: 'WARN',
          message: `${acrConflicts.length} duplicate Account-Contact relationship(s) detected`,
          details: { conflicts: acrConflicts },
          remediation: [
            'Remove duplicate AccountContactRelation records before merge',
            'Or accept that duplicates will be deduplicated automatically'
          ]
        });
      }

      // Check 2: Campaign Members
      const campaignConflicts = await this.checkCampaignMembers(masterRecord, duplicateRecord);
      if (campaignConflicts.length > 0) {
        errors.push({
          type: 'DUPLICATE_CAMPAIGN_MEMBERS',
          severity: 'INFO',
          message: `${campaignConflicts.length} shared campaign(s) - Salesforce will deduplicate automatically`,
          details: { sharedCampaigns: campaignConflicts },
          note: 'Salesforce prevents duplicate CampaignMember records (one per Contact+Campaign)'
        });
      }

    } catch (error) {
      this.log(`Relationship conflict check failed: ${error.message}`, 'ERROR');
      errors.push({
        type: 'VALIDATION_ERROR',
        severity: 'WARN',
        message: 'Could not complete relationship conflict checks',
        details: { error: error.message }
      });
    }

    return { errors };
  }

  /**
   * Helper: Check Account-Contact Relationships
   */
  async checkAccountContactRelationships(masterRecord, duplicateRecord) {
    const conflicts = [];

    try {
      // Query AccountContactRelation for both contacts
      const acrQuery = `SELECT Id, AccountId, ContactId, Roles
                        FROM AccountContactRelation
                        WHERE ContactId IN ('${masterRecord.Id}', '${duplicateRecord.Id}')`;

      const cmd = `sf data query --query "${acrQuery}" --target-org ${this.orgAlias} --json`;
      const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      const parsed = JSON.parse(result);

      const relationships = parsed.result?.records || [];

      // Group by AccountId to find duplicates
      const accountMap = {};
      for (const rel of relationships) {
        if (!accountMap[rel.AccountId]) {
          accountMap[rel.AccountId] = [];
        }
        accountMap[rel.AccountId].push(rel);
      }

      // Find accounts with relationships to BOTH contacts
      for (const [accountId, rels] of Object.entries(accountMap)) {
        if (rels.length > 1) {
          conflicts.push({
            accountId,
            masterRelationshipId: rels.find(r => r.ContactId === masterRecord.Id)?.Id,
            duplicateRelationshipId: rels.find(r => r.ContactId === duplicateRecord.Id)?.Id
          });
        }
      }

    } catch (error) {
      // AccountContactRelation might not be enabled
      this.log(`ACR check skipped: ${error.message}`, 'DEBUG');
    }

    return conflicts;
  }

  /**
   * Helper: Check Campaign Members
   */
  async checkCampaignMembers(masterRecord, duplicateRecord) {
    const sharedCampaigns = [];

    try {
      // Query CampaignMember for both contacts
      const cmQuery = `SELECT Id, CampaignId, ContactId, Status
                       FROM CampaignMember
                       WHERE ContactId IN ('${masterRecord.Id}', '${duplicateRecord.Id}')`;

      const cmd = `sf data query --query "${cmQuery}" --target-org ${this.orgAlias} --json`;
      const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      const parsed = JSON.parse(result);

      const campaignMembers = parsed.result?.records || [];

      // Group by CampaignId to find shared campaigns
      const campaignMap = {};
      for (const cm of campaignMembers) {
        if (!campaignMap[cm.CampaignId]) {
          campaignMap[cm.CampaignId] = [];
        }
        campaignMap[cm.CampaignId].push(cm);
      }

      // Find campaigns with memberships for BOTH contacts
      for (const [campaignId, members] of Object.entries(campaignMap)) {
        if (members.length > 1) {
          sharedCampaigns.push({
            campaignId,
            masterMember: members.find(m => m.ContactId === masterRecord.Id),
            duplicateMember: members.find(m => m.ContactId === duplicateRecord.Id)
          });
        }
      }

    } catch (error) {
      this.log(`Campaign member check failed: ${error.message}`, 'DEBUG');
    }

    return sharedCampaigns;
  }

  /**
   * Logging helper
   */
  log(message, level = 'INFO') {
    if (this.options.verbose || level === 'ERROR' || level === 'WARN') {
      const prefix = {
        'INFO': '  ℹ️ ',
        'WARN': '  ⚠️ ',
        'ERROR': '  ❌',
        'DEBUG': '  🔍'
      }[level] || '  ';

      console.log(`${prefix}${message}`);
    }
  }
}

module.exports = ContactMergeValidator;
