/**
 * Tests for Assignee Access Validator
 *
 * Comprehensive unit tests for permission checking and access validation.
 * Target: 30+ test cases covering all access validation scenarios.
 *
 * @group unit
 * @group assignment-rules
 */

const accessValidator = require('../../validators/assignee-access-validator');
const assigneeValidator = require('../../assignee-validator');
const { execSync } = require('child_process');

// Mock child_process
jest.mock('child_process');

// Mock assignee-validator
jest.mock('../../assignee-validator');

describe('Assignee Access Validator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== Test Fixtures ====================

  const FIXTURES = {
    validUser: {
      valid: true,
      type: 'User',
      data: { Id: '0051234567890ABC', Name: 'John Doe', IsActive: true }
    },

    invalidUser: {
      valid: false,
      error: 'User not found'
    },

    validQueue: {
      valid: true,
      type: 'Queue',
      data: { Id: '00G1234567890ABC', Name: 'Lead Queue', Type: 'Queue' }
    },

    userQueryResponse: {
      status: 0,
      result: {
        records: [
          {
            Id: '0051234567890ABC',
            ProfileId: '00e1234567890ABC',
            Profile: { Name: 'Standard User' }
          }
        ]
      }
    },

    objectPermsEdit: {
      status: 0,
      result: {
        records: [
          {
            PermissionsCreate: true,
            PermissionsRead: true,
            PermissionsEdit: true,
            PermissionsDelete: false,
            PermissionsViewAllRecords: false,
            PermissionsModifyAllRecords: false
          }
        ]
      }
    },

    objectPermsReadOnly: {
      status: 0,
      result: {
        records: [
          {
            PermissionsCreate: false,
            PermissionsRead: true,
            PermissionsEdit: false,
            PermissionsDelete: false,
            PermissionsViewAllRecords: false,
            PermissionsModifyAllRecords: false
          }
        ]
      }
    },

    objectPermsAll: {
      status: 0,
      result: {
        records: [
          {
            PermissionsCreate: true,
            PermissionsRead: true,
            PermissionsEdit: true,
            PermissionsDelete: true,
            PermissionsViewAllRecords: true,
            PermissionsModifyAllRecords: true
          }
        ]
      }
    },

    noObjectPerms: {
      status: 0,
      result: { records: [] }
    },

    permissionSets: {
      status: 0,
      result: {
        records: [
          {
            PermissionSet: { Id: '0PS1234567890ABC', Name: 'Lead Edit' }
          }
        ]
      }
    },

    noPermissionSets: {
      status: 0,
      result: { records: [] }
    },

    queueSupportsObject: {
      status: 0,
      result: {
        records: [
          {
            Id: '0QS1234567890ABC',
            QueueSobjectId: '0QS1234567890ABC',
            SobjectType: 'Lead'
          }
        ]
      }
    },

    queueDoesNotSupportObject: {
      status: 0,
      result: { records: [] }
    },

    queueMembers: {
      status: 0,
      result: {
        records: [
          { UserOrGroupId: '0051111111111AAA' },
          { UserOrGroupId: '0052222222222BBB' },
          { UserOrGroupId: '0053333333333CCC' }
        ]
      }
    },

    queueNoMembers: {
      status: 0,
      result: { records: [] }
    },

    recordTypeVisibility: {
      status: 0,
      result: {
        records: [
          { Id: 'RTV123', RecordTypeId: '012XXXXXXXXXXXX' }
        ]
      }
    },

    noRecordTypeVisibility: {
      status: 0,
      result: { records: [] }
    },

    assignmentRule: {
      name: 'Test_Rule',
      entries: [
        { order: 1, assignedTo: '0051234567890ABC', criteriaItems: [] }, // User
        { order: 2, assignedTo: '00G1234567890DEF', criteriaItems: [] }, // Queue
        { order: 3, assignedTo: '00E1234567890GHI', criteriaItems: [] }  // Role
      ]
    }
  };

  // ==================== Test Suite: ACCESS_LEVELS ====================

  describe('ACCESS_LEVELS', () => {
    it('should export access level constants', () => {
      expect(accessValidator.ACCESS_LEVELS).toBeDefined();
      expect(accessValidator.ACCESS_LEVELS.NONE).toBe('None');
      expect(accessValidator.ACCESS_LEVELS.READ).toBe('Read');
      expect(accessValidator.ACCESS_LEVELS.EDIT).toBe('Edit');
      expect(accessValidator.ACCESS_LEVELS.ALL).toBe('All');
    });
  });

  // ==================== Test Suite: checkUserObjectAccess ====================

  describe('checkUserObjectAccess', () => {
    it('should pass when user has Edit access', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.validUser);
      execSync
        .mockReturnValueOnce(JSON.stringify(FIXTURES.userQueryResponse))       // User profile query
        .mockReturnValueOnce(JSON.stringify(FIXTURES.objectPermsEdit))         // Object permissions
        .mockReturnValueOnce(JSON.stringify(FIXTURES.noPermissionSets));       // Permission sets

      const result = await accessValidator.checkUserObjectAccess(
        '0051234567890ABC',
        'Lead',
        'testorg'
      );

      expect(result.hasAccess).toBe(true);
      expect(result.canOwn).toBe(true);
      expect(result.accessLevel).toBe('Edit');
      expect(result.userId).toBe('0051234567890ABC');
      expect(result.userName).toBe('John Doe');
      expect(result.profileName).toBe('Standard User');
      expect(result.objectApiName).toBe('Lead');
      expect(result.error).toBeUndefined();
    });

    it('should pass when user has ModifyAll access', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.validUser);
      execSync
        .mockReturnValueOnce(JSON.stringify(FIXTURES.userQueryResponse))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.objectPermsAll))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.noPermissionSets));

      const result = await accessValidator.checkUserObjectAccess(
        '0051234567890ABC',
        'Lead',
        'testorg'
      );

      expect(result.hasAccess).toBe(true);
      expect(result.canOwn).toBe(true);
      expect(result.accessLevel).toBe('All');
    });

    it('should fail when user has only Read access', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.validUser);
      execSync
        .mockReturnValueOnce(JSON.stringify(FIXTURES.userQueryResponse))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.objectPermsReadOnly))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.noPermissionSets));

      const result = await accessValidator.checkUserObjectAccess(
        '0051234567890ABC',
        'Lead',
        'testorg'
      );

      expect(result.hasAccess).toBe(true);
      expect(result.canOwn).toBe(false);
      expect(result.accessLevel).toBe('Read');
      expect(result.error).toContain('needs Edit to own');
      expect(result.severity).toBe('critical');
      expect(result.resolution).toContain('Grant Lead Edit permission');
    });

    it('should fail when user has no object permissions', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.validUser);
      execSync
        .mockReturnValueOnce(JSON.stringify(FIXTURES.userQueryResponse))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.noObjectPerms))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.noPermissionSets));

      const result = await accessValidator.checkUserObjectAccess(
        '0051234567890ABC',
        'Lead',
        'testorg'
      );

      expect(result.hasAccess).toBe(false);
      expect(result.canOwn).toBe(false);
      expect(result.error).toContain('has no Lead object permissions');
      expect(result.severity).toBe('critical');
      expect(result.resolution).toContain('Grant Lead Edit access');
    });

    it('should fail when user validation fails', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.invalidUser);

      const result = await accessValidator.checkUserObjectAccess(
        '0051234567890ABC',
        'Lead',
        'testorg'
      );

      expect(result.hasAccess).toBe(false);
      expect(result.canOwn).toBe(false);
      expect(result.error).toContain('User validation failed');
      expect(result.severity).toBe('critical');
    });

    it('should merge permissions from permission sets', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.validUser);
      execSync
        .mockReturnValueOnce(JSON.stringify(FIXTURES.userQueryResponse))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.objectPermsReadOnly))      // Profile: Read only
        .mockReturnValueOnce(JSON.stringify(FIXTURES.permissionSets))            // Has permission sets
        .mockReturnValueOnce(JSON.stringify(FIXTURES.objectPermsEdit));          // Permission set: Edit

      const result = await accessValidator.checkUserObjectAccess(
        '0051234567890ABC',
        'Lead',
        'testorg'
      );

      expect(result.hasAccess).toBe(true);
      expect(result.canOwn).toBe(true);
      expect(result.accessLevel).toBe('Edit');
    });

    it('should handle query errors gracefully', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.validUser);
      execSync.mockImplementation(() => {
        throw new Error('API connection timeout');
      });

      const result = await accessValidator.checkUserObjectAccess(
        '0051234567890ABC',
        'Lead',
        'testorg'
      );

      expect(result.hasAccess).toBe(false);
      expect(result.canOwn).toBe(false);
      expect(result.error).toContain('Access check failed');
      expect(result.severity).toBe('warning');
    });

    it('should work without orgAlias parameter', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.validUser);
      execSync
        .mockReturnValueOnce(JSON.stringify(FIXTURES.userQueryResponse))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.objectPermsEdit))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.noPermissionSets));

      const result = await accessValidator.checkUserObjectAccess(
        '0051234567890ABC',
        'Lead'
      );

      expect(result.hasAccess).toBe(true);
      expect(result.canOwn).toBe(true);
    });
  });

  // ==================== Test Suite: checkQueueObjectAccess ====================

  describe('checkQueueObjectAccess', () => {
    it('should pass when queue supports object and has members with access', async () => {
      assigneeValidator.validateAssignee
        .mockResolvedValueOnce(FIXTURES.validQueue)                    // Queue validation
        .mockResolvedValueOnce(FIXTURES.validUser);                    // Member validation

      execSync
        .mockReturnValueOnce(JSON.stringify(FIXTURES.queueSupportsObject))      // Queue supports object
        .mockReturnValueOnce(JSON.stringify(FIXTURES.queueMembers))              // Queue members
        .mockReturnValueOnce(JSON.stringify(FIXTURES.userQueryResponse))         // Member user query
        .mockReturnValueOnce(JSON.stringify(FIXTURES.objectPermsEdit))           // Member permissions
        .mockReturnValueOnce(JSON.stringify(FIXTURES.noPermissionSets));         // Member perm sets

      const result = await accessValidator.checkQueueObjectAccess(
        '00G1234567890ABC',
        'Lead',
        'testorg'
      );

      expect(result.hasAccess).toBe(true);
      expect(result.queueId).toBe('00G1234567890ABC');
      expect(result.queueName).toBe('Lead Queue');
      expect(result.objectApiName).toBe('Lead');
      expect(result.memberCount).toBe(3);
      expect(result.accessChecks).toHaveLength(1); // Sample size 1 (only first member checked)
    });

    it('should fail when queue does not support object', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.validQueue);
      execSync.mockReturnValueOnce(JSON.stringify(FIXTURES.queueDoesNotSupportObject));

      const result = await accessValidator.checkQueueObjectAccess(
        '00G1234567890ABC',
        'Case',
        'testorg'
      );

      expect(result.hasAccess).toBe(false);
      expect(result.error).toContain('does not support Case objects');
      expect(result.severity).toBe('critical');
      expect(result.resolution).toContain('Add Case to queue supported objects');
    });

    it('should warn when queue has no members', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.validQueue);
      execSync
        .mockReturnValueOnce(JSON.stringify(FIXTURES.queueSupportsObject))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.queueNoMembers));

      const result = await accessValidator.checkQueueObjectAccess(
        '00G1234567890ABC',
        'Lead',
        'testorg'
      );

      expect(result.hasAccess).toBe(true);
      expect(result.memberCount).toBe(0);
      expect(result.warning).toContain('has no members');
      expect(result.severity).toBe('warning');
      expect(result.resolution).toBe('Add users to queue');
    });

    it('should warn when queue members lack access', async () => {
      assigneeValidator.validateAssignee
        .mockResolvedValueOnce(FIXTURES.validQueue)
        .mockResolvedValueOnce(FIXTURES.validUser);

      execSync
        .mockReturnValueOnce(JSON.stringify(FIXTURES.queueSupportsObject))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.queueMembers))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.userQueryResponse))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.objectPermsReadOnly))      // Member has read-only
        .mockReturnValueOnce(JSON.stringify(FIXTURES.noPermissionSets));

      const result = await accessValidator.checkQueueObjectAccess(
        '00G1234567890ABC',
        'Lead',
        'testorg'
      );

      expect(result.hasAccess).toBe(true);
      expect(result.warning).toContain('queue members lack Lead Edit access');
      expect(result.severity).toBe('warning');
      expect(result.resolution).toBe('Grant Edit access to all queue members');
    });

    it('should fail when queue validation fails', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue({
        valid: false,
        error: 'Queue not found'
      });

      const result = await accessValidator.checkQueueObjectAccess(
        '00G1234567890ABC',
        'Lead',
        'testorg'
      );

      expect(result.hasAccess).toBe(false);
      expect(result.error).toContain('Queue validation failed');
      expect(result.severity).toBe('critical');
    });

    it('should handle query errors gracefully', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.validQueue);
      execSync.mockImplementation(() => {
        throw new Error('Network error');
      });

      const result = await accessValidator.checkQueueObjectAccess(
        '00G1234567890ABC',
        'Lead',
        'testorg'
      );

      expect(result.hasAccess).toBe(false);
      expect(result.error).toContain('Queue access check failed');
      expect(result.severity).toBe('warning');
    });

    it('should skip non-user queue members', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.validQueue);
      execSync
        .mockReturnValueOnce(JSON.stringify(FIXTURES.queueSupportsObject))
        .mockReturnValueOnce(JSON.stringify({
          status: 0,
          result: {
            records: [
              { UserOrGroupId: '00G9999999999AAA' }  // Group, not user (starts with 00G)
            ]
          }
        }));

      const result = await accessValidator.checkQueueObjectAccess(
        '00G1234567890ABC',
        'Lead',
        'testorg'
      );

      expect(result.hasAccess).toBe(true);
      expect(result.accessChecks).toHaveLength(0);  // No user members checked
    });
  });

  // ==================== Test Suite: validateRecordTypeAccess ====================

  describe('validateRecordTypeAccess', () => {
    it('should pass when user has record type access', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.validUser);
      execSync
        .mockReturnValueOnce(JSON.stringify(FIXTURES.userQueryResponse))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.recordTypeVisibility));

      const result = await accessValidator.validateRecordTypeAccess(
        '0051234567890ABC',
        '012XXXXXXXXXXXX',
        'testorg'
      );

      expect(result.hasAccess).toBe(true);
      expect(result.assigneeType).toBe('User');
      expect(result.recordTypeId).toBe('012XXXXXXXXXXXX');
      expect(result.message).toContain('has access to record type');
      expect(result.severity).toBeNull();
    });

    it('should fail when user lacks record type access', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.validUser);
      execSync
        .mockReturnValueOnce(JSON.stringify(FIXTURES.userQueryResponse))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.noRecordTypeVisibility));

      const result = await accessValidator.validateRecordTypeAccess(
        '0051234567890ABC',
        '012XXXXXXXXXXXX',
        'testorg'
      );

      expect(result.hasAccess).toBe(false);
      expect(result.message).toContain('does not have access to record type');
      expect(result.severity).toBe('warning');
    });

    it('should handle queue assignees with note', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.validQueue);

      const result = await accessValidator.validateRecordTypeAccess(
        '00G1234567890ABC',
        '012XXXXXXXXXXXX',
        'testorg'
      );

      expect(result.hasAccess).toBe(true);
      expect(result.assigneeType).toBe('Queue');
      expect(result.message).toContain('depends on queue member access');
      expect(result.note).toContain('Validate individual queue member access');
    });

    it('should handle role/territory assignees', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue({
        valid: true,
        type: 'Role',
        data: { Id: '00E1234567890ABC', Name: 'Sales Manager' }
      });

      const result = await accessValidator.validateRecordTypeAccess(
        '00E1234567890ABC',
        '012XXXXXXXXXXXX',
        'testorg'
      );

      expect(result.hasAccess).toBe(true);
      expect(result.assigneeType).toBe('Role');
      expect(result.message).toContain('not validated');
      expect(result.note).toContain('not applicable');
    });

    it('should fail when assignee validation fails', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.invalidUser);

      const result = await accessValidator.validateRecordTypeAccess(
        '0051234567890ABC',
        '012XXXXXXXXXXXX',
        'testorg'
      );

      expect(result.hasAccess).toBe(false);
      expect(result.error).toContain('Assignee validation failed');
      expect(result.severity).toBe('critical');
    });

    it('should handle query errors gracefully', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.validUser);
      execSync.mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await accessValidator.validateRecordTypeAccess(
        '0051234567890ABC',
        '012XXXXXXXXXXXX',
        'testorg'
      );

      expect(result.hasAccess).toBe(false);
      expect(result.error).toContain('Record type access check failed');
      expect(result.severity).toBe('warning');
    });
  });

  // ==================== Test Suite: auditAccessLevels ====================

  describe('auditAccessLevels', () => {
    it('should audit all assignees in rule', async () => {
      // Mock user validation
      assigneeValidator.validateAssignee
        .mockResolvedValueOnce(FIXTURES.validUser)       // First user
        .mockResolvedValueOnce(FIXTURES.validQueue)      // Queue
        .mockResolvedValueOnce({                         // Role
          valid: true,
          type: 'Role',
          data: { Id: '00E1234567890GHI', Name: 'Sales Manager' }
        });

      // Mock user access check queries
      execSync
        .mockReturnValueOnce(JSON.stringify(FIXTURES.userQueryResponse))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.objectPermsEdit))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.noPermissionSets))
        // Queue access check queries
        .mockReturnValueOnce(JSON.stringify(FIXTURES.queueSupportsObject))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.queueMembers))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.userQueryResponse))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.objectPermsEdit))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.noPermissionSets));

      const result = await accessValidator.auditAccessLevels(
        FIXTURES.assignmentRule,
        'Lead',
        'testorg'
      );

      expect(result.ruleName).toBe('Test_Rule');
      expect(result.objectApiName).toBe('Lead');
      expect(result.totalAssignees).toBe(3);
      expect(result.accessibleAssignees).toBe(3);
      expect(result.inaccessibleAssignees).toBe(0);
      expect(result.assigneeResults).toHaveLength(3);
    });

    it('should detect inaccessible assignees', async () => {
      assigneeValidator.validateAssignee
        .mockResolvedValueOnce(FIXTURES.validUser)
        .mockResolvedValueOnce(FIXTURES.validQueue);

      execSync
        .mockReturnValueOnce(JSON.stringify(FIXTURES.userQueryResponse))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.objectPermsReadOnly))      // User: Read only
        .mockReturnValueOnce(JSON.stringify(FIXTURES.noPermissionSets))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.queueDoesNotSupportObject)); // Queue: No support

      const smallRule = {
        name: 'Test_Rule',
        entries: [
          { order: 1, assignedTo: '0051234567890ABC', criteriaItems: [] },
          { order: 2, assignedTo: '00G1234567890DEF', criteriaItems: [] }
        ]
      };

      const result = await accessValidator.auditAccessLevels(
        smallRule,
        'Lead',
        'testorg'
      );

      expect(result.totalAssignees).toBe(2);
      expect(result.accessibleAssignees).toBe(0);
      expect(result.inaccessibleAssignees).toBe(2);
    });

    it('should count warnings correctly', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.validQueue);
      execSync
        .mockReturnValueOnce(JSON.stringify(FIXTURES.queueSupportsObject))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.queueNoMembers));          // Queue has no members (warning)

      const queueRule = {
        name: 'Queue_Rule',
        entries: [
          { order: 1, assignedTo: '00G1234567890ABC', criteriaItems: [] }
        ]
      };

      const result = await accessValidator.auditAccessLevels(
        queueRule,
        'Lead',
        'testorg'
      );

      expect(result.totalAssignees).toBe(1);
      expect(result.accessibleAssignees).toBe(1);
      expect(result.warnings).toBe(1);
    });

    it('should handle rule with no assignees', async () => {
      const emptyRule = {
        name: 'Empty_Rule',
        entries: [
          { order: 1, assignedTo: null, criteriaItems: [] }
        ]
      };

      const result = await accessValidator.auditAccessLevels(
        emptyRule,
        'Lead',
        'testorg'
      );

      expect(result.totalAssignees).toBe(0);
      expect(result.accessibleAssignees).toBe(0);
      expect(result.inaccessibleAssignees).toBe(0);
      expect(result.assigneeResults).toHaveLength(0);
    });

    it('should deduplicate assignees', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.validUser);
      execSync
        .mockReturnValueOnce(JSON.stringify(FIXTURES.userQueryResponse))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.objectPermsEdit))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.noPermissionSets));

      const duplicateRule = {
        name: 'Duplicate_Rule',
        entries: [
          { order: 1, assignedTo: '0051234567890ABC', criteriaItems: [] },
          { order: 2, assignedTo: '0051234567890ABC', criteriaItems: [] },  // Same assignee
          { order: 3, assignedTo: '0051234567890ABC', criteriaItems: [] }   // Same assignee
        ]
      };

      const result = await accessValidator.auditAccessLevels(
        duplicateRule,
        'Lead',
        'testorg'
      );

      expect(result.totalAssignees).toBe(1);  // Only unique assignees counted
      expect(result.assigneeResults).toHaveLength(1);
    });
  });

  // ==================== Edge Cases & Error Handling ====================

  describe('Edge Cases', () => {
    it('should handle null orgAlias in checkUserObjectAccess', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.validUser);
      execSync
        .mockReturnValueOnce(JSON.stringify(FIXTURES.userQueryResponse))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.objectPermsEdit))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.noPermissionSets));

      const result = await accessValidator.checkUserObjectAccess(
        '0051234567890ABC',
        'Lead',
        null
      );

      expect(result.hasAccess).toBe(true);
    });

    it('should handle empty permission set assignments', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.validUser);
      execSync
        .mockReturnValueOnce(JSON.stringify(FIXTURES.userQueryResponse))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.noObjectPerms))
        .mockReturnValueOnce(JSON.stringify({
          status: 0,
          result: {
            records: [
              { PermissionSet: { Id: 'PS123', Name: 'Test PS' } }
            ]
          }
        }))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.noObjectPerms));  // PS has no object perms

      const result = await accessValidator.checkUserObjectAccess(
        '0051234567890ABC',
        'Lead',
        'testorg'
      );

      expect(result.hasAccess).toBe(false);
      expect(result.error).toContain('no Lead object permissions');
    });

    it('should handle special characters in object names', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue(FIXTURES.validUser);
      execSync
        .mockReturnValueOnce(JSON.stringify(FIXTURES.userQueryResponse))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.objectPermsEdit))
        .mockReturnValueOnce(JSON.stringify(FIXTURES.noPermissionSets));

      const result = await accessValidator.checkUserObjectAccess(
        '0051234567890ABC',
        'Custom_Object__c',
        'testorg'
      );

      expect(result.objectApiName).toBe('Custom_Object__c');
    });

    it('should handle assigneeId prefix detection correctly', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue({
        valid: true,
        type: 'Territory',
        data: { Id: '0TM1234567890ABC', Name: 'West Territory' }
      });

      const territoryRule = {
        name: 'Territory_Rule',
        entries: [
          { order: 1, assignedTo: '0TM1234567890ABC', criteriaItems: [] }
        ]
      };

      const result = await accessValidator.auditAccessLevels(
        territoryRule,
        'Account',
        'testorg'
      );

      expect(result.totalAssignees).toBe(1);
      expect(result.accessibleAssignees).toBe(1);  // Territory returns hasAccess: true
      expect(result.assigneeResults[0].message).toContain('not applicable');
    });
  });
});
