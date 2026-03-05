#!/usr/bin/env node

/**
 * Assignee Access Validator
 *
 * Verify assignee can access and own records. Checks profile/permission set access
 * to objects, validates record type access, and audits access levels.
 *
 * @module validators/assignee-access-validator
 * @version 1.0.0
 */

const { execSync } = require('child_process');
const { validateAssignee } = require('../assignee-validator');

/**
 * Access levels
 * @const
 */
const ACCESS_LEVELS = {
  NONE: 'None',
  READ: 'Read',
  EDIT: 'Edit', // Required for ownership
  ALL: 'All'
};

/**
 * Check user's object access level
 *
 * @param {string} userId - Salesforce User ID
 * @param {string} objectApiName - Object API name
 * @param {string} [orgAlias] - Salesforce org alias
 * @returns {Promise<Object>} Access check result
 *
 * @example
 * const access = await checkUserObjectAccess('0051...', 'Lead', 'myorg');
 * if (access.canOwn) {
 *   console.log('User can own Lead records');
 * }
 */
async function checkUserObjectAccess(userId, objectApiName, orgAlias = null) {
  // Validate user exists first
  const userValidation = await validateAssignee(userId, orgAlias);

  if (!userValidation.valid) {
    return {
      hasAccess: false,
      canOwn: false,
      userId,
      objectApiName,
      error: `User validation failed: ${userValidation.error}`,
      severity: 'critical'
    };
  }

  const userName = userValidation.data.Name;

  try {
    // Query user's profile for object permissions
    const profileQuery = `
      SELECT Id, ProfileId, Profile.Name
      FROM User
      WHERE Id = '${userId}'
    `;

    const userResult = await executeQuery(profileQuery, orgAlias);

    if (!userResult.records || userResult.records.length === 0) {
      throw new Error('User not found');
    }

    const user = userResult.records[0];
    const profileId = user.ProfileId;
    const profileName = user.Profile.Name;

    // Query object permissions for profile
    const objectPermsQuery = `
      SELECT PermissionsCreate, PermissionsRead, PermissionsEdit, PermissionsDelete,
             PermissionsViewAllRecords, PermissionsModifyAllRecords
      FROM ObjectPermissions
      WHERE ParentId = '${profileId}'
      AND SobjectType = '${objectApiName}'
    `;

    let objectPerms = await executeQuery(objectPermsQuery, orgAlias);

    // Also check permission sets assigned to user
    const permSetQuery = `
      SELECT PermissionSet.Id, PermissionSet.Name
      FROM PermissionSetAssignment
      WHERE AssigneeId = '${userId}'
      AND PermissionSet.IsOwnedByProfile = false
    `;

    const permSets = await executeQuery(permSetQuery, orgAlias);

    // Aggregate permissions from permission sets
    if (permSets.records && permSets.records.length > 0) {
      for (const psa of permSets.records) {
        const psObjectPermsQuery = `
          SELECT PermissionsCreate, PermissionsRead, PermissionsEdit, PermissionsDelete,
                 PermissionsViewAllRecords, PermissionsModifyAllRecords
          FROM ObjectPermissions
          WHERE ParentId = '${psa.PermissionSet.Id}'
          AND SobjectType = '${objectApiName}'
        `;

        const psPerms = await executeQuery(psObjectPermsQuery, orgAlias);

        if (psPerms.records && psPerms.records.length > 0) {
          // Merge permissions (OR logic - any true wins)
          if (!objectPerms.records || objectPerms.records.length === 0) {
            objectPerms = psPerms;
          } else {
            const merged = objectPerms.records[0];
            const psRecord = psPerms.records[0];

            merged.PermissionsCreate = merged.PermissionsCreate || psRecord.PermissionsCreate;
            merged.PermissionsRead = merged.PermissionsRead || psRecord.PermissionsRead;
            merged.PermissionsEdit = merged.PermissionsEdit || psRecord.PermissionsEdit;
            merged.PermissionsDelete = merged.PermissionsDelete || psRecord.PermissionsDelete;
            merged.PermissionsViewAllRecords = merged.PermissionsViewAllRecords || psRecord.PermissionsViewAllRecords;
            merged.PermissionsModifyAllRecords = merged.PermissionsModifyAllRecords || psRecord.PermissionsModifyAllRecords;
          }
        }
      }
    }

    if (!objectPerms.records || objectPerms.records.length === 0) {
      return {
        hasAccess: false,
        canOwn: false,
        userId,
        userName,
        profileName,
        objectApiName,
        error: `User has no ${objectApiName} object permissions`,
        severity: 'critical',
        resolution: `Grant ${objectApiName} Edit access via Profile or Permission Set`
      };
    }

    const perms = objectPerms.records[0];

    // Determine access level
    let accessLevel = ACCESS_LEVELS.NONE;
    let canOwn = false;

    if (perms.PermissionsModifyAllRecords) {
      accessLevel = ACCESS_LEVELS.ALL;
      canOwn = true;
    } else if (perms.PermissionsEdit) {
      accessLevel = ACCESS_LEVELS.EDIT;
      canOwn = true; // Edit permission allows ownership
    } else if (perms.PermissionsRead) {
      accessLevel = ACCESS_LEVELS.READ;
      canOwn = false; // Read-only cannot own records
    }

    if (!canOwn) {
      return {
        hasAccess: true,
        canOwn: false,
        userId,
        userName,
        profileName,
        objectApiName,
        accessLevel,
        permissions: perms,
        error: `User has ${accessLevel} access but needs Edit to own ${objectApiName} records`,
        severity: 'critical',
        resolution: `Grant ${objectApiName} Edit permission via Profile or Permission Set`
      };
    }

    return {
      hasAccess: true,
      canOwn: true,
      userId,
      userName,
      profileName,
      objectApiName,
      accessLevel,
      permissions: perms,
      message: `User ${userName} has ${accessLevel} access to ${objectApiName}`
    };

  } catch (error) {
    return {
      hasAccess: false,
      canOwn: false,
      userId,
      objectApiName,
      error: `Access check failed: ${error.message}`,
      severity: 'warning'
    };
  }
}

/**
 * Check queue's object access
 *
 * Validates queue supports the object and checks queue member access
 *
 * @param {string} queueId - Salesforce Queue (Group) ID
 * @param {string} objectApiName - Object API name
 * @param {string} [orgAlias] - Salesforce org alias
 * @returns {Promise<Object>} Access check result
 */
async function checkQueueObjectAccess(queueId, objectApiName, orgAlias = null) {
  try {
    // Validate queue exists
    const queueValidation = await validateAssignee(queueId, orgAlias);

    if (!queueValidation.valid) {
      return {
        hasAccess: false,
        queueId,
        objectApiName,
        error: `Queue validation failed: ${queueValidation.error}`,
        severity: 'critical'
      };
    }

    const queueName = queueValidation.data.Name;

    // Check if queue supports this object
    const queueSupportQuery = `
      SELECT Id, QueueSobjectId, SobjectType
      FROM QueueSobject
      WHERE QueueId = '${queueId}'
      AND SobjectType = '${objectApiName}'
    `;

    const queueSupport = await executeQuery(queueSupportQuery, orgAlias);

    if (!queueSupport.records || queueSupport.records.length === 0) {
      return {
        hasAccess: false,
        queueId,
        queueName,
        objectApiName,
        error: `Queue '${queueName}' does not support ${objectApiName} objects`,
        severity: 'critical',
        resolution: `Add ${objectApiName} to queue supported objects in Setup → Queues`
      };
    }

    // Check queue members
    const membersQuery = `
      SELECT UserOrGroupId
      FROM GroupMember
      WHERE GroupId = '${queueId}'
    `;

    const members = await executeQuery(membersQuery, orgAlias);

    if (!members.records || members.records.length === 0) {
      return {
        hasAccess: true,
        queueId,
        queueName,
        objectApiName,
        memberCount: 0,
        warning: `Queue '${queueName}' has no members`,
        severity: 'warning',
        message: `Queue supports ${objectApiName} but has no members to pick up records`,
        resolution: 'Add users to queue'
      };
    }

    // Sample check: verify first few members have access
    const sampleSize = Math.min(3, members.records.length);
    const accessChecks = [];

    for (let i = 0; i < sampleSize; i++) {
      const memberId = members.records[i].UserOrGroupId;

      // Check if member is a user (starts with 005)
      if (memberId.startsWith('005')) {
        const memberAccess = await checkUserObjectAccess(memberId, objectApiName, orgAlias);
        accessChecks.push({
          memberId,
          hasAccess: memberAccess.canOwn,
          accessLevel: memberAccess.accessLevel
        });
      }
    }

    const membersWithoutAccess = accessChecks.filter(c => !c.hasAccess).length;

    if (membersWithoutAccess > 0) {
      return {
        hasAccess: true,
        queueId,
        queueName,
        objectApiName,
        memberCount: members.records.length,
        accessChecks,
        warning: `${membersWithoutAccess} of ${sampleSize} sampled queue members lack ${objectApiName} Edit access`,
        severity: 'warning',
        message: `Queue supports ${objectApiName} but some members may not be able to own records`,
        resolution: 'Grant Edit access to all queue members'
      };
    }

    return {
      hasAccess: true,
      queueId,
      queueName,
      objectApiName,
      memberCount: members.records.length,
      accessChecks,
      message: `Queue '${queueName}' supports ${objectApiName} with ${members.records.length} members (sample: all have access)`
    };

  } catch (error) {
    return {
      hasAccess: false,
      queueId,
      objectApiName,
      error: `Queue access check failed: ${error.message}`,
      severity: 'warning'
    };
  }
}

/**
 * Validate record type access for assignee
 *
 * @param {string} assigneeId - User or Queue ID
 * @param {string} recordTypeId - Record Type ID
 * @param {string} [orgAlias] - Salesforce org alias
 * @returns {Promise<Object>} Validation result
 */
async function validateRecordTypeAccess(assigneeId, recordTypeId, orgAlias = null) {
  try {
    // Validate assignee
    const assigneeValidation = await validateAssignee(assigneeId, orgAlias);

    if (!assigneeValidation.valid) {
      return {
        hasAccess: false,
        assigneeId,
        recordTypeId,
        error: `Assignee validation failed: ${assigneeValidation.error}`,
        severity: 'critical'
      };
    }

    const assigneeType = assigneeValidation.type;

    if (assigneeType === 'User') {
      // Check user's profile for record type access
      const profileQuery = `
        SELECT ProfileId, Profile.Name
        FROM User
        WHERE Id = '${assigneeId}'
      `;

      const userResult = await executeQuery(profileQuery, orgAlias);

      if (!userResult.records || userResult.records.length === 0) {
        throw new Error('User not found');
      }

      const profileId = userResult.records[0].ProfileId;

      // Check record type assignment
      const rtQuery = `
        SELECT Id, RecordTypeId
        FROM RecordTypeVisibility
        WHERE SobjectType IN (
          SELECT SobjectType FROM RecordType WHERE Id = '${recordTypeId}'
        )
        AND ProfileId = '${profileId}'
      `;

      const rtAccess = await executeQuery(rtQuery, orgAlias);

      const hasAccess = rtAccess.records && rtAccess.records.some(rt => rt.RecordTypeId === recordTypeId);

      return {
        hasAccess,
        assigneeId,
        assigneeType,
        recordTypeId,
        message: hasAccess
          ? 'User has access to record type'
          : 'User does not have access to record type',
        severity: hasAccess ? null : 'warning'
      };

    } else if (assigneeType === 'Queue') {
      // Queues don't have record type restrictions (members do)
      return {
        hasAccess: true,
        assigneeId,
        assigneeType: 'Queue',
        recordTypeId,
        message: 'Queue access to record type depends on queue member access',
        note: 'Validate individual queue member access separately'
      };
    } else {
      return {
        hasAccess: true,
        assigneeId,
        assigneeType,
        recordTypeId,
        message: `${assigneeType} record type access not validated`,
        note: 'Record type restrictions not applicable'
      };
    }

  } catch (error) {
    return {
      hasAccess: false,
      assigneeId,
      recordTypeId,
      error: `Record type access check failed: ${error.message}`,
      severity: 'warning'
    };
  }
}

/**
 * Audit access levels for assignment rule
 *
 * Checks all assignees in rule for proper access
 *
 * @param {Object} assignmentRule - Parsed assignment rule object
 * @param {string} objectApiName - Object API name
 * @param {string} [orgAlias] - Salesforce org alias
 * @returns {Promise<Object>} Audit report
 *
 * @example
 * const audit = await auditAccessLevels(rule, 'Lead', 'myorg');
 * console.log(`${audit.accessibleAssignees}/${audit.totalAssignees} assignees have access`);
 */
async function auditAccessLevels(assignmentRule, objectApiName, orgAlias = null) {
  const report = {
    ruleName: assignmentRule.name,
    objectApiName,
    totalAssignees: 0,
    accessibleAssignees: 0,
    inaccessibleAssignees: 0,
    warnings: 0,
    assigneeResults: []
  };

  // Get unique assignees
  const assignees = new Set();
  assignmentRule.entries.forEach(entry => {
    if (entry.assignedTo) {
      assignees.add(entry.assignedTo);
    }
  });

  report.totalAssignees = assignees.size;

  // Check each assignee
  for (const assigneeId of assignees) {
    const assigneeType = assigneeId.substring(0, 3);

    let accessCheck;

    if (assigneeType === '005') {
      // User
      accessCheck = await checkUserObjectAccess(assigneeId, objectApiName, orgAlias);
    } else if (assigneeType === '00G') {
      // Queue
      accessCheck = await checkQueueObjectAccess(assigneeId, objectApiName, orgAlias);
    } else {
      // Role, Territory, or other
      accessCheck = {
        hasAccess: true,
        assigneeId,
        message: 'Access validation not applicable for this assignee type',
        note: 'Roles and Territories rely on user access'
      };
    }

    if (accessCheck.hasAccess && (accessCheck.canOwn !== false)) {
      report.accessibleAssignees++;
    } else {
      report.inaccessibleAssignees++;
    }

    if (accessCheck.warning || accessCheck.severity === 'warning') {
      report.warnings++;
    }

    report.assigneeResults.push(accessCheck);
  }

  return report;
}

/**
 * Execute SOQL query
 * @private
 */
async function executeQuery(query, orgAlias = null) {
  const orgFlag = orgAlias ? `--target-org ${orgAlias}` : '';
  const command = `sf data query --query "${query.replace(/"/g, '\\"')}" ${orgFlag} --json`;

  try {
    const output = execSync(command, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const result = JSON.parse(output);

    if (result.status !== 0) {
      throw new Error(result.message || 'Query failed');
    }

    return result.result;

  } catch (error) {
    throw new Error(error.message);
  }
}

// Export functions
module.exports = {
  checkUserObjectAccess,
  checkQueueObjectAccess,
  validateRecordTypeAccess,
  auditAccessLevels,
  ACCESS_LEVELS
};

// CLI support
if (require.main === module) {
  const fs = require('fs');
  const { parseRuleMetadata } = require('../assignment-rule-parser');

  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node assignee-access-validator.js <action> [options]');
    console.error('');
    console.error('Actions:');
    console.error('  check-user <user-id> <object> [org]       Check user object access');
    console.error('  check-queue <queue-id> <object> [org]     Check queue object access');
    console.error('  audit-rule <xml-file> <object> [org]      Audit all assignees in rule');
    console.error('');
    console.error('Examples:');
    console.error('  node assignee-access-validator.js check-user 0051... Lead myorg');
    console.error('  node assignee-access-validator.js check-queue 00G1... Case myorg');
    console.error('  node assignee-access-validator.js audit-rule Lead.xml Lead myorg');
    process.exit(1);
  }

  const action = args[0];

  (async () => {
    try {
      switch (action) {
        case 'check-user': {
          const [, userId, objectApiName, orgAlias] = args;
          const result = await checkUserObjectAccess(userId, objectApiName, orgAlias);

          if (result.canOwn) {
            console.log(`✓ User can own ${objectApiName} records`);
            console.log(`  User: ${result.userName}`);
            console.log(`  Profile: ${result.profileName}`);
            console.log(`  Access Level: ${result.accessLevel}`);
          } else {
            console.log(`✗ User cannot own ${objectApiName} records`);
            console.log(`  Error: ${result.error}`);
            console.log(`  Resolution: ${result.resolution}`);
            process.exit(1);
          }
          break;
        }

        case 'check-queue': {
          const [, queueId, objectApiName, orgAlias] = args;
          const result = await checkQueueObjectAccess(queueId, objectApiName, orgAlias);

          if (result.hasAccess) {
            console.log(`✓ Queue supports ${objectApiName}`);
            console.log(`  Queue: ${result.queueName}`);
            console.log(`  Members: ${result.memberCount}`);

            if (result.warning) {
              console.log(`  ⚠ Warning: ${result.warning}`);
            }
          } else {
            console.log(`✗ Queue cannot be used for ${objectApiName}`);
            console.log(`  Error: ${result.error}`);
            console.log(`  Resolution: ${result.resolution}`);
            process.exit(1);
          }
          break;
        }

        case 'audit-rule': {
          const [, xmlFile, objectApiName, orgAlias] = args;

          if (!fs.existsSync(xmlFile)) {
            throw new Error(`File not found: ${xmlFile}`);
          }

          const xmlContent = fs.readFileSync(xmlFile, 'utf8');
          const parsed = parseRuleMetadata(xmlContent);

          if (!parsed.assignmentRules || parsed.assignmentRules.length === 0) {
            throw new Error('No assignment rules found in file');
          }

          for (const rule of parsed.assignmentRules) {
            console.log(`\nAuditing rule: ${rule.name}`);
            console.log('─'.repeat(60));

            const audit = await auditAccessLevels(rule, objectApiName, orgAlias);

            console.log(`\nTotal Assignees: ${audit.totalAssignees}`);
            console.log(`Accessible: ${audit.accessibleAssignees}`);
            console.log(`Inaccessible: ${audit.inaccessibleAssignees}`);
            console.log(`Warnings: ${audit.warnings}\n`);

            audit.assigneeResults.forEach((result, index) => {
              const icon = result.canOwn !== false && result.hasAccess ? '✓' : '✗';
              const name = result.userName || result.queueName || result.assigneeId;

              console.log(`${index + 1}. ${icon} ${name}`);

              if (result.error) {
                console.log(`   Error: ${result.error}`);
              } else if (result.message) {
                console.log(`   ${result.message}`);
              }

              if (result.warning) {
                console.log(`   ⚠ ${result.warning}`);
              }

              console.log('');
            });

            if (audit.inaccessibleAssignees > 0) {
              process.exit(1);
            }
          }
          break;
        }

        default:
          console.error(`Unknown action: ${action}`);
          process.exit(1);
      }

    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })();
}
