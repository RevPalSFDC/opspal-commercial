/**
 * Permission Pre-Flight Validator for Salesforce Record Merging
 *
 * Validates that the user has sufficient permissions to perform a merge operation
 * before attempting the merge. This prevents cryptic "Insufficient Access Rights"
 * errors during merge execution.
 *
 * Compliance: Implements permission requirements from Salesforce SOAP API merge specification:
 * - Delete permission on the object
 * - Edit permission on the master record
 * - User must own records OR have Modify All OR be above owner in role hierarchy
 * - Edit permission on related objects that will be reparented
 *
 * @module validators/permission-validator
 * @version 1.0.0
 * @created 2025-01-08
 */

const { execSync } = require('child_process');

class PermissionValidator {
  /**
   * Initialize the permission validator
   *
   * @param {string} orgAlias - Salesforce org alias
   * @param {Object} options - Configuration options
   * @param {boolean} options.strictMode - Fail on any permission warning (default: false)
   * @param {boolean} options.verbose - Enable detailed logging (default: false)
   */
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.strictMode = options.strictMode || false;
    this.verbose = options.verbose || false;

    // Cache for permission checks to reduce API calls
    this.permissionCache = {
      objectPerms: {},
      userInfo: null,
      recordAccess: {}
    };
  }

  /**
   * Validate all permissions required for a merge operation
   *
   * @param {string} objectType - Object API name (e.g., 'Account', 'Contact', 'Lead')
   * @param {string} masterId - Master record ID
   * @param {string} duplicateId - Duplicate record ID
   * @param {Object} mergeProfile - Merge profile configuration
   * @returns {Promise<Object>} Validation result
   */
  async validateMergePermissions(objectType, masterId, duplicateId, mergeProfile) {
    const validationResults = {
      isValid: true,
      errors: [],
      warnings: [],
      details: {}
    };

    try {
      // Step 1: Validate object-level permissions
      this.log(`Validating object-level permissions for ${objectType}...`);
      const objectPerms = await this.validateObjectPermissions(objectType);
      validationResults.details.objectPermissions = objectPerms;

      if (!objectPerms.isValid) {
        validationResults.isValid = false;
        validationResults.errors.push(...objectPerms.errors);
      }

      // Step 2: Get current user information
      this.log('Retrieving current user information...');
      const userInfo = await this.getCurrentUserInfo();
      validationResults.details.currentUser = {
        userId: userInfo.userId,
        username: userInfo.username,
        isSystemAdmin: userInfo.isSystemAdmin,
        hasModifyAllData: userInfo.hasModifyAllData
      };

      // Step 3: Validate record-level access
      this.log(`Validating record-level access for ${masterId} and ${duplicateId}...`);
      const recordAccess = await this.validateRecordAccess(
        objectType,
        [masterId, duplicateId],
        userInfo
      );
      validationResults.details.recordAccess = recordAccess;

      if (!recordAccess.isValid) {
        validationResults.isValid = false;
        validationResults.errors.push(...recordAccess.errors);
      }

      // Step 4: Validate related object permissions
      if (mergeProfile.relatedObjects && mergeProfile.relatedObjects.length > 0) {
        this.log('Validating related object permissions...');
        const relatedPerms = await this.validateRelatedObjectPermissions(
          mergeProfile.relatedObjects
        );
        validationResults.details.relatedObjectPermissions = relatedPerms;

        if (relatedPerms.warnings.length > 0) {
          validationResults.warnings.push(...relatedPerms.warnings);
        }

        if (this.strictMode && relatedPerms.warnings.length > 0) {
          validationResults.isValid = false;
          validationResults.errors.push(
            'Strict mode enabled: Related object permission warnings treated as errors'
          );
        }
      }

      // Step 5: Generate summary
      validationResults.summary = this.generateSummary(validationResults);

    } catch (error) {
      validationResults.isValid = false;
      validationResults.errors.push(`Permission validation failed: ${error.message}`);
      validationResults.details.error = error.message;
    }

    return validationResults;
  }

  /**
   * Validate object-level CRUD permissions
   *
   * @param {string} objectType - Object API name
   * @returns {Promise<Object>} Object permission details
   */
  async validateObjectPermissions(objectType) {
    // Check cache first
    if (this.permissionCache.objectPerms[objectType]) {
      this.log(`Using cached permissions for ${objectType}`);
      return this.permissionCache.objectPerms[objectType];
    }

    const result = {
      isValid: true,
      errors: [],
      permissions: {}
    };

    try {
      // Use sf sobject describe to get permission details
      const describeCmd = `sf sobject describe --sobject ${objectType} --target-org ${this.orgAlias} --json`;
      const describeOutput = execSync(describeCmd, { encoding: 'utf-8' });
      const describeData = JSON.parse(describeOutput);

      if (describeData.status !== 0) {
        throw new Error(`Failed to describe ${objectType}: ${describeData.message}`);
      }

      const objMeta = describeData.result;

      result.permissions = {
        isDeletable: objMeta.deletable,
        isUpdateable: objMeta.updateable,
        isQueryable: objMeta.queryable,
        isCreateable: objMeta.createable
      };

      // Check required permissions for merge
      if (!objMeta.deletable) {
        result.isValid = false;
        result.errors.push(
          `PERMISSION_ERROR: User lacks Delete permission on ${objectType}. ` +
          `Merge operation requires the ability to delete duplicate records.`
        );
      }

      if (!objMeta.updateable) {
        result.isValid = false;
        result.errors.push(
          `PERMISSION_ERROR: User lacks Edit permission on ${objectType}. ` +
          `Merge operation requires the ability to update the master record.`
        );
      }

      if (!objMeta.queryable) {
        result.isValid = false;
        result.errors.push(
          `PERMISSION_ERROR: User lacks Read permission on ${objectType}. ` +
          `Cannot query records for merge operation.`
        );
      }

      // Cache the result
      this.permissionCache.objectPerms[objectType] = result;

    } catch (error) {
      result.isValid = false;
      result.errors.push(`Failed to validate object permissions: ${error.message}`);
    }

    return result;
  }

  /**
   * Get current user information including admin status
   *
   * @returns {Promise<Object>} User information
   */
  async getCurrentUserInfo() {
    // Check cache first
    if (this.permissionCache.userInfo) {
      return this.permissionCache.userInfo;
    }

    try {
      // Query current user details
      const userQuery = `
        SELECT Id, Username, Profile.Name, Profile.PermissionsModifyAllData,
               UserRole.Name
        FROM User
        WHERE Id = UserInfo.UserId()
      `;

      const queryCmd = `sf data query --query "${userQuery.replace(/\n/g, ' ')}" --target-org ${this.orgAlias} --json`;
      const queryOutput = execSync(queryCmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
      const queryData = JSON.parse(queryOutput);

      if (queryData.status !== 0) {
        // Query failed - return minimal user info
        this.log(`Warning: Failed to retrieve full user information: ${queryData.message}`, 'WARN');

        const minimalUserInfo = {
          userId: 'unknown',
          username: 'unknown',
          profileName: 'Unknown',
          isSystemAdmin: false,
          hasModifyAllData: false,
          roleName: null
        };

        // Cache the minimal result
        this.permissionCache.userInfo = minimalUserInfo;
        return minimalUserInfo;
      }

      if (!queryData.result || !queryData.result.records || queryData.result.records.length === 0) {
        this.log('Warning: User query returned no records', 'WARN');

        const minimalUserInfo = {
          userId: 'unknown',
          username: 'unknown',
          profileName: 'Unknown',
          isSystemAdmin: false,
          hasModifyAllData: false,
          roleName: null
        };

        this.permissionCache.userInfo = minimalUserInfo;
        return minimalUserInfo;
      }

      const user = queryData.result.records[0];

      const userInfo = {
        userId: user.Id || 'unknown',
        username: user.Username || 'unknown',
        profileName: user.Profile ? user.Profile.Name : 'Unknown',
        isSystemAdmin: user.Profile ? user.Profile.Name === 'System Administrator' : false,
        hasModifyAllData: user.Profile ? (user.Profile.PermissionsModifyAllData || false) : false,
        roleName: user.UserRole ? user.UserRole.Name : null
      };

      // Cache the result
      this.permissionCache.userInfo = userInfo;

      return userInfo;

    } catch (error) {
      // Graceful fallback on any error
      this.log(`Warning: Error retrieving user info: ${error.message}`, 'WARN');

      const minimalUserInfo = {
        userId: 'unknown',
        username: 'unknown',
        profileName: 'Unknown',
        isSystemAdmin: false,
        hasModifyAllData: false,
        roleName: null,
        error: error.message
      };

      // Cache the minimal result
      this.permissionCache.userInfo = minimalUserInfo;
      return minimalUserInfo;
    }
  }

  /**
   * Validate record-level access for specific records
   *
   * @param {string} objectType - Object API name
   * @param {Array<string>} recordIds - Array of record IDs to check
   * @param {Object} userInfo - Current user information
   * @returns {Promise<Object>} Record access validation result
   */
  async validateRecordAccess(objectType, recordIds, userInfo) {
    const result = {
      isValid: true,
      errors: [],
      records: []
    };

    try {
      // If user is system admin or has Modify All Data, skip detailed checks
      if (userInfo.isSystemAdmin || userInfo.hasModifyAllData) {
        this.log('User is System Admin or has Modify All Data - full access granted');
        result.records = recordIds.map(id => ({
          id,
          canDelete: true,
          canEdit: true,
          reason: 'System Admin or Modify All Data permission'
        }));
        return result;
      }

      // Query records with ownership information
      const recordQuery = `
        SELECT Id, OwnerId, IsDeleted
        FROM ${objectType}
        WHERE Id IN ('${recordIds.join("','")}')
      `;

      const queryCmd = `sf data query --query "${recordQuery}" --target-org ${this.orgAlias} --json`;
      const queryOutput = execSync(queryCmd, { encoding: 'utf-8' });
      const queryData = JSON.parse(queryOutput);

      if (queryData.status !== 0) {
        throw new Error(`Failed to query records: ${queryData.message}`);
      }

      const records = queryData.result.records;

      if (records.length === 0) {
        result.isValid = false;
        result.errors.push(`No records found with IDs: ${recordIds.join(', ')}`);
        return result;
      }

      // Check each record
      for (const record of records) {
        const recordResult = {
          id: record.Id,
          canDelete: false,
          canEdit: false,
          reason: ''
        };

        // Check if record is deleted
        if (record.IsDeleted) {
          recordResult.reason = 'Record is already deleted';
          result.errors.push(`RECORD_ACCESS_ERROR: Record ${record.Id} is deleted`);
          result.isValid = false;
          result.records.push(recordResult);
          continue;
        }

        // Check ownership
        if (record.OwnerId === userInfo.userId) {
          recordResult.canDelete = true;
          recordResult.canEdit = true;
          recordResult.reason = 'User owns the record';
        } else {
          // User doesn't own the record - would need Modify All on object or higher role
          recordResult.reason = `Record owned by ${record.OwnerId}, user is ${userInfo.userId}`;
          result.errors.push(
            `RECORD_ACCESS_ERROR: Cannot delete/edit record ${record.Id}. ` +
            `User ${userInfo.username} does not own this record. ` +
            `Requires: Record ownership, Modify All ${objectType}, or higher role in hierarchy.`
          );
          result.isValid = false;
        }

        result.records.push(recordResult);
      }

      // Check for missing records
      const foundIds = records.map(r => r.Id);
      const missingIds = recordIds.filter(id => !foundIds.includes(id));

      if (missingIds.length > 0) {
        result.isValid = false;
        result.errors.push(
          `RECORD_ACCESS_ERROR: Cannot access records: ${missingIds.join(', ')}. ` +
          `Records may not exist or user lacks Read access.`
        );
      }

    } catch (error) {
      result.isValid = false;
      result.errors.push(`Record access validation failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Validate permissions on related objects that will be reparented
   *
   * @param {Array<Object>} relatedObjects - Array of related object configurations
   * @returns {Promise<Object>} Related object permission validation result
   */
  async validateRelatedObjectPermissions(relatedObjects) {
    const result = {
      warnings: [],
      relatedObjects: []
    };

    for (const relatedObj of relatedObjects) {
      const objType = relatedObj.objectType;

      try {
        const objPerms = await this.validateObjectPermissions(objType);

        const relatedResult = {
          objectType: objType,
          hasEditPermission: objPerms.permissions.isUpdateable,
          warnings: []
        };

        if (!objPerms.permissions.isUpdateable) {
          const warning =
            `PERMISSION_WARNING: User lacks Edit permission on ${objType}. ` +
            `Reparenting ${objType} records may fail during merge. ` +
            `Related records: ${relatedObj.lookupField || 'lookup field'}`;

          relatedResult.warnings.push(warning);
          result.warnings.push(warning);
        }

        result.relatedObjects.push(relatedResult);

      } catch (error) {
        const warning = `PERMISSION_WARNING: Could not validate ${objType}: ${error.message}`;
        result.warnings.push(warning);
        result.relatedObjects.push({
          objectType: objType,
          hasEditPermission: false,
          warnings: [warning]
        });
      }
    }

    return result;
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
      lines.push('✅ PERMISSION VALIDATION PASSED');
      lines.push('');
      lines.push('All required permissions are present:');

      if (validationResults.details.currentUser) {
        const user = validationResults.details.currentUser;
        lines.push(`- User: ${user.username}`);
        if (user.isSystemAdmin) {
          lines.push('- Role: System Administrator (full access)');
        } else if (user.hasModifyAllData) {
          lines.push('- Permission: Modify All Data (full access)');
        }
      }

      if (validationResults.details.objectPermissions) {
        const perms = validationResults.details.objectPermissions.permissions;
        lines.push(`- Object: ${perms.isDeletable ? 'Delete ✓' : 'Delete ✗'} | ${perms.isUpdateable ? 'Edit ✓' : 'Edit ✗'}`);
      }

      if (validationResults.warnings.length > 0) {
        lines.push('');
        lines.push(`⚠️  ${validationResults.warnings.length} warning(s):`);
        validationResults.warnings.forEach(w => lines.push(`  - ${w}`));
      }

    } else {
      lines.push('❌ PERMISSION VALIDATION FAILED');
      lines.push('');
      lines.push(`Found ${validationResults.errors.length} error(s):`);
      validationResults.errors.forEach(e => lines.push(`  - ${e}`));

      lines.push('');
      lines.push('Required permissions for merge:');
      lines.push('  1. Delete permission on object');
      lines.push('  2. Edit permission on object');
      lines.push('  3. Record ownership OR Modify All OR higher role hierarchy');
      lines.push('  4. Edit permission on related objects (for reparenting)');
      lines.push('');
      lines.push('Resolution:');
      lines.push('  - Contact your Salesforce administrator');
      lines.push('  - Request appropriate permissions');
      lines.push('  - Or have record owner perform the merge');
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
      console.log(`[PermissionValidator] ${message}`);
    }
  }

  /**
   * Clear the permission cache (useful for long-running processes)
   */
  clearCache() {
    this.permissionCache = {
      objectPerms: {},
      userInfo: null,
      recordAccess: {}
    };
  }
}

module.exports = PermissionValidator;
