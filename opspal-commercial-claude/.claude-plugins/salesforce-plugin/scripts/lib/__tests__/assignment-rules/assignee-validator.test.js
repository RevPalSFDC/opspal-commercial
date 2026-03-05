/**
 * Unit Tests for Assignee Validator
 *
 * Tests validation of Users, Queues, Roles, Territories, and access permissions
 * for Salesforce Assignment Rules.
 *
 * @group assignment-rules
 * @group validators
 */

const {
  validateUser,
  validateQueue,
  validateRole,
  validateTerritory,
  validateAssignee,
  validateAssigneeAccess,
  batchValidateAssignees
} = require('../../assignee-validator');

// Mock child_process execSync
jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

const { execSync } = require('child_process');

/**
 * Test Fixtures
 */
const FIXTURES = {
  // Valid User record
  activeUser: {
    Id: '0051234567890ABC',
    Name: 'John Doe',
    Username: 'john.doe@example.com',
    Email: 'john.doe@example.com',
    IsActive: true
  },

  // Inactive User record
  inactiveUser: {
    Id: '0051234567890DEF',
    Name: 'Jane Smith',
    Username: 'jane.smith@example.com',
    Email: 'jane.smith@example.com',
    IsActive: false
  },

  // Valid Queue record
  validQueue: {
    Id: '00G1234567890ABC',
    Name: 'Healthcare Queue',
    DeveloperName: 'Healthcare_Queue',
    Type: 'Queue'
  },

  // Group (not Queue)
  regularGroup: {
    Id: '00G1234567890DEF',
    Name: 'Sales Team',
    DeveloperName: 'Sales_Team',
    Type: 'Regular'
  },

  // Valid Role record
  validRole: {
    Id: '00E1234567890ABC',
    Name: 'VP Sales',
    DeveloperName: 'VP_Sales'
  },

  // Valid Territory record
  validTerritory: {
    Id: '0TM1234567890ABC',
    Name: 'Western Region',
    DeveloperName: 'Western_Region'
  },

  // Queue Sobject (for access validation)
  queueSobject: {
    Id: 'a001234567890ABC',
    QueueSobjectId: 'a001234567890ABC',
    SobjectType: 'Lead'
  },

  // Queue Members
  queueMembers: [
    { UserOrGroupId: '0051234567890ABC' },
    { UserOrGroupId: '0051234567890DEF' },
    { UserOrGroupId: '0051234567890GHI' }
  ]
};

/**
 * Helper function to mock successful query result
 */
function mockSuccessQuery(records) {
  const result = {
    status: 0,
    result: {
      records: records,
      totalSize: records.length
    }
  };

  execSync.mockReturnValue(JSON.stringify(result));
}

/**
 * Helper function to mock failed query
 */
function mockFailedQuery(errorMessage = 'Query failed') {
  execSync.mockImplementation(() => {
    const error = new Error(errorMessage);
    error.stdout = JSON.stringify({
      status: 1,
      message: errorMessage
    });
    throw error;
  });
}

/**
 * Helper function to mock not found result
 */
function mockNotFound() {
  mockSuccessQuery([]);
}

describe('assignee-validator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // validateUser Tests
  // ============================================================================
  describe('validateUser', () => {
    test('should validate active user', async () => {
      mockSuccessQuery([FIXTURES.activeUser]);

      const result = await validateUser('0051234567890ABC', 'myorg');

      expect(result.valid).toBe(true);
      expect(result.type).toBe('User');
      expect(result.data.Name).toBe('John Doe');
      expect(result.data.IsActive).toBe(true);
      expect(result.message).toContain('active');
    });

    test('should reject inactive user', async () => {
      mockSuccessQuery([FIXTURES.inactiveUser]);

      const result = await validateUser('0051234567890DEF', 'myorg');

      expect(result.valid).toBe(false);
      expect(result.type).toBe('User');
      expect(result.error).toContain('inactive');
      expect(result.severity).toBe('critical');
      expect(result.resolution).toBeDefined();
    });

    test('should handle null userId', async () => {
      const result = await validateUser(null, 'myorg');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a non-empty string');
      expect(result.severity).toBe('critical');
    });

    test('should handle invalid userId format', async () => {
      const result = await validateUser('00G1234567890ABC', 'myorg'); // Queue ID, not User

      expect(result.valid).toBe(false);
      expect(result.error).toContain('must start with 005');
      expect(result.severity).toBe('critical');
    });

    test('should handle user not found', async () => {
      mockNotFound();

      const result = await validateUser('0051234567890ABC', 'myorg');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
      expect(result.severity).toBe('critical');
    });

    test('should query User with correct SOQL', async () => {
      mockSuccessQuery([FIXTURES.activeUser]);

      await validateUser('0051234567890ABC', 'myorg');

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining("SELECT Id, Name, IsActive, Username, Email FROM User WHERE Id = '0051234567890ABC'"),
        expect.any(Object)
      );
    });

    test('should handle query failure', async () => {
      mockFailedQuery('Network error');

      const result = await validateUser('0051234567890ABC', 'myorg');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Query failed');
      expect(result.severity).toBe('critical');
    });

    test('should use default org if not provided', async () => {
      mockSuccessQuery([FIXTURES.activeUser]);

      await validateUser('0051234567890ABC');

      // Should not include --target-org flag
      const call = execSync.mock.calls[0][0];
      expect(call).not.toContain('--target-org');
    });
  });

  // ============================================================================
  // validateQueue Tests
  // ============================================================================
  describe('validateQueue', () => {
    test('should validate queue with Type = Queue', async () => {
      mockSuccessQuery([FIXTURES.validQueue]);

      const result = await validateQueue('00G1234567890ABC', 'myorg');

      expect(result.valid).toBe(true);
      expect(result.type).toBe('Queue');
      expect(result.data.Name).toBe('Healthcare Queue');
      expect(result.data.Type).toBe('Queue');
    });

    test('should reject group with Type != Queue', async () => {
      mockSuccessQuery([FIXTURES.regularGroup]);

      const result = await validateQueue('00G1234567890DEF', 'myorg');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('type Regular, not Queue');
      expect(result.severity).toBe('critical');
    });

    test('should handle null queueId', async () => {
      const result = await validateQueue(null, 'myorg');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a non-empty string');
      expect(result.severity).toBe('critical');
    });

    test('should handle invalid queue ID format', async () => {
      const result = await validateQueue('0051234567890ABC', 'myorg'); // User ID, not Queue

      expect(result.valid).toBe(false);
      expect(result.error).toContain('must start with 00G');
      expect(result.severity).toBe('critical');
    });

    test('should verify queue object access', async () => {
      mockSuccessQuery([FIXTURES.validQueue]);

      const result = await validateQueue('00G1234567890ABC', 'myorg');

      expect(result.valid).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining("AND Type = 'Queue'"),
        expect.any(Object)
      );
    });

    test('should handle queue not found', async () => {
      mockNotFound();

      const result = await validateQueue('00G1234567890ABC', 'myorg');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
      expect(result.resolution).toBeDefined();
    });
  });

  // ============================================================================
  // validateRole Tests
  // ============================================================================
  describe('validateRole', () => {
    test('should validate existing role', async () => {
      mockSuccessQuery([FIXTURES.validRole]);

      const result = await validateRole('00E1234567890ABC', 'myorg');

      expect(result.valid).toBe(true);
      expect(result.type).toBe('Role');
      expect(result.data.Name).toBe('VP Sales');
      expect(result.message).toContain('exists');
    });

    test('should reject non-existent role', async () => {
      mockNotFound();

      const result = await validateRole('00E1234567890ABC', 'myorg');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
      expect(result.severity).toBe('critical');
    });

    test('should handle null roleId', async () => {
      const result = await validateRole(null, 'myorg');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a non-empty string');
    });

    test('should handle invalid role ID format', async () => {
      const result = await validateRole('0051234567890ABC', 'myorg'); // User ID, not Role

      expect(result.valid).toBe(false);
      expect(result.error).toContain('must start with 00E');
    });

    test('should query Role with correct SOQL', async () => {
      mockSuccessQuery([FIXTURES.validRole]);

      await validateRole('00E1234567890ABC', 'myorg');

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining("SELECT Id, Name, DeveloperName FROM UserRole WHERE Id = '00E1234567890ABC'"),
        expect.any(Object)
      );
    });
  });

  // ============================================================================
  // validateTerritory Tests
  // ============================================================================
  describe('validateTerritory', () => {
    test('should validate Territory2 record', async () => {
      mockSuccessQuery([FIXTURES.validTerritory]);

      const result = await validateTerritory('0TM1234567890ABC', 'myorg');

      expect(result.valid).toBe(true);
      expect(result.type).toBe('Territory');
      expect(result.data.Name).toBe('Western Region');
    });

    test('should reject non-existent territory', async () => {
      mockNotFound();

      const result = await validateTerritory('0TM1234567890ABC', 'myorg');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
      expect(result.severity).toBe('critical');
    });

    test('should handle null territoryId', async () => {
      const result = await validateTerritory(null, 'myorg');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a non-empty string');
    });

    test('should handle invalid territory ID format', async () => {
      const result = await validateTerritory('0051234567890ABC', 'myorg'); // User ID, not Territory

      expect(result.valid).toBe(false);
      expect(result.error).toContain('must start with 0TM');
    });
  });

  // ============================================================================
  // validateAssignee Tests (auto-detect type)
  // ============================================================================
  describe('validateAssignee', () => {
    test('should auto-detect User and validate', async () => {
      mockSuccessQuery([FIXTURES.activeUser]);

      const result = await validateAssignee('0051234567890ABC', 'myorg');

      expect(result.valid).toBe(true);
      expect(result.type).toBe('User');
    });

    test('should auto-detect Queue and validate', async () => {
      mockSuccessQuery([FIXTURES.validQueue]);

      const result = await validateAssignee('00G1234567890ABC', 'myorg');

      expect(result.valid).toBe(true);
      expect(result.type).toBe('Queue');
    });

    test('should auto-detect Role and validate', async () => {
      mockSuccessQuery([FIXTURES.validRole]);

      const result = await validateAssignee('00E1234567890ABC', 'myorg');

      expect(result.valid).toBe(true);
      expect(result.type).toBe('Role');
    });

    test('should auto-detect Territory and validate', async () => {
      mockSuccessQuery([FIXTURES.validTerritory]);

      const result = await validateAssignee('0TM1234567890ABC', 'myorg');

      expect(result.valid).toBe(true);
      expect(result.type).toBe('Territory');
    });

    test('should handle unknown ID prefix', async () => {
      const result = await validateAssignee('001234567890ABC', 'myorg'); // Account ID

      expect(result.valid).toBe(false);
      expect(result.type).toBe('Unknown');
      expect(result.error).toContain('Unknown assignee type');
      expect(result.resolution).toContain('Valid prefixes');
    });

    test('should handle null assignee ID', async () => {
      const result = await validateAssignee(null, 'myorg');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a non-empty string');
    });

    test('should handle empty string', async () => {
      const result = await validateAssignee('', 'myorg');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a non-empty string');
    });
  });

  // ============================================================================
  // validateAssigneeAccess Tests
  // ============================================================================
  describe('validateAssigneeAccess', () => {
    test('should verify User has Edit access', async () => {
      mockSuccessQuery([FIXTURES.activeUser]);

      const result = await validateAssigneeAccess('0051234567890ABC', 'Lead', 'myorg');

      expect(result.hasAccess).toBe(true);
      expect(result.assigneeType).toBe('User');
      expect(result.userName).toBe('John Doe');
      expect(result.message).toContain('can be assigned');
      expect(result.note).toContain('Profile/PermissionSet');
    });

    test('should verify Queue supports object', async () => {
      // First query: validate queue
      mockSuccessQuery([FIXTURES.validQueue]);

      const firstResult = await validateAssigneeAccess('00G1234567890ABC', 'Lead', 'myorg');

      // Reset mock for second query (QueueSobject check)
      mockSuccessQuery([FIXTURES.queueSobject]);

      const result = await validateAssigneeAccess('00G1234567890ABC', 'Lead', 'myorg');

      // Third query would be for members, mock it
      execSync.mockReturnValueOnce(JSON.stringify({
        status: 0,
        result: { records: FIXTURES.queueMembers, totalSize: 3 }
      }));

      expect(result.hasAccess).toBe(true);
      expect(result.assigneeType).toBe('Queue');
    });

    test('should handle Queue without object support', async () => {
      // First query: validate queue
      execSync.mockReturnValueOnce(JSON.stringify({
        status: 0,
        result: { records: [FIXTURES.validQueue], totalSize: 1 }
      }));

      // Second query: QueueSobject (not found)
      execSync.mockReturnValueOnce(JSON.stringify({
        status: 0,
        result: { records: [], totalSize: 0 }
      }));

      const result = await validateAssigneeAccess('00G1234567890ABC', 'Case', 'myorg');

      expect(result.hasAccess).toBe(false);
      expect(result.error).toContain('does not support Case objects');
      expect(result.resolution).toContain('Add Case to queue');
    });

    test('should warn when Queue has no members', async () => {
      // First query: validate queue
      execSync.mockReturnValueOnce(JSON.stringify({
        status: 0,
        result: { records: [FIXTURES.validQueue], totalSize: 1 }
      }));

      // Second query: QueueSobject (found)
      execSync.mockReturnValueOnce(JSON.stringify({
        status: 0,
        result: { records: [FIXTURES.queueSobject], totalSize: 1 }
      }));

      // Third query: Members (none)
      execSync.mockReturnValueOnce(JSON.stringify({
        status: 0,
        result: { records: [], totalSize: 0 }
      }));

      const result = await validateAssigneeAccess('00G1234567890ABC', 'Lead', 'myorg');

      expect(result.hasAccess).toBe(true);
      expect(result.warning).toContain('no members');
      expect(result.severity).toBe('warning');
    });

    test('should handle invalid assignee', async () => {
      mockNotFound();

      const result = await validateAssigneeAccess('0051234567890ABC', 'Lead', 'myorg');

      expect(result.hasAccess).toBe(false);
      expect(result.error).toContain('Assignee validation failed');
      expect(result.severity).toBe('critical');
    });

    test('should handle Role access', async () => {
      mockSuccessQuery([FIXTURES.validRole]);

      const result = await validateAssigneeAccess('00E1234567890ABC', 'Lead', 'myorg');

      expect(result.hasAccess).toBe(true);
      expect(result.assigneeType).toBe('Role');
      expect(result.note).toContain('role hierarchy');
    });

    test('should handle Territory access', async () => {
      mockSuccessQuery([FIXTURES.validTerritory]);

      const result = await validateAssigneeAccess('0TM1234567890ABC', 'Account', 'myorg');

      expect(result.hasAccess).toBe(true);
      expect(result.assigneeType).toBe('Territory');
      expect(result.note).toContain('role hierarchy');
    });

    test('should handle access check query failure', async () => {
      // First query succeeds (validate user)
      execSync.mockReturnValueOnce(JSON.stringify({
        status: 0,
        result: { records: [FIXTURES.activeUser], totalSize: 1 }
      }));

      // Second query fails (access check)
      execSync.mockImplementationOnce(() => {
        throw new Error('Query failed');
      });

      const result = await validateAssigneeAccess('0051234567890ABC', 'Lead', 'myorg');

      // Should still return hasAccess: true with note (simplified check)
      expect(result.hasAccess).toBe(true);
      expect(result.note).toBeDefined();
    });
  });

  // ============================================================================
  // batchValidateAssignees Tests
  // ============================================================================
  describe('batchValidateAssignees', () => {
    test('should validate multiple assignees in parallel', async () => {
      // Mock responses for each ID
      execSync
        .mockReturnValueOnce(JSON.stringify({
          status: 0,
          result: { records: [FIXTURES.activeUser], totalSize: 1 }
        }))
        .mockReturnValueOnce(JSON.stringify({
          status: 0,
          result: { records: [FIXTURES.validQueue], totalSize: 1 }
        }))
        .mockReturnValueOnce(JSON.stringify({
          status: 0,
          result: { records: [FIXTURES.validRole], totalSize: 1 }
        }));

      const ids = ['0051234567890ABC', '00G1234567890ABC', '00E1234567890ABC'];
      const result = await batchValidateAssignees(ids, 'myorg');

      expect(result.totalCount).toBe(3);
      expect(result.validCount).toBe(3);
      expect(result.invalidCount).toBe(0);
      expect(result.results).toHaveLength(3);
      expect(result.results[0].type).toBe('User');
      expect(result.results[1].type).toBe('Queue');
      expect(result.results[2].type).toBe('Role');
    });

    test('should return all validation results', async () => {
      // Mock mixed results
      execSync
        .mockReturnValueOnce(JSON.stringify({
          status: 0,
          result: { records: [FIXTURES.activeUser], totalSize: 1 }
        }))
        .mockReturnValueOnce(JSON.stringify({
          status: 0,
          result: { records: [], totalSize: 0 } // Not found
        }));

      const ids = ['0051234567890ABC', '00G1234567890ABC'];
      const result = await batchValidateAssignees(ids, 'myorg');

      expect(result.totalCount).toBe(2);
      expect(result.validCount).toBe(1);
      expect(result.invalidCount).toBe(1);
      expect(result.results[0].valid).toBe(true);
      expect(result.results[1].valid).toBe(false);
    });

    test('should handle empty array', async () => {
      const result = await batchValidateAssignees([], 'myorg');

      expect(result.totalCount).toBe(0);
      expect(result.validCount).toBe(0);
      expect(result.invalidCount).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    test('should continue on individual failures', async () => {
      // First succeeds, second fails, third succeeds
      execSync
        .mockReturnValueOnce(JSON.stringify({
          status: 0,
          result: { records: [FIXTURES.activeUser], totalSize: 1 }
        }))
        .mockImplementationOnce(() => {
          throw new Error('Network error');
        })
        .mockReturnValueOnce(JSON.stringify({
          status: 0,
          result: { records: [FIXTURES.validRole], totalSize: 1 }
        }));

      const ids = ['0051234567890ABC', '00G1234567890ABC', '00E1234567890ABC'];
      const result = await batchValidateAssignees(ids, 'myorg');

      expect(result.totalCount).toBe(3);
      expect(result.validCount).toBe(2);
      expect(result.invalidCount).toBe(1);
      expect(result.results[1].error).toContain('Query failed');
    });

    test('should throw error for non-array input', async () => {
      await expect(batchValidateAssignees('not-array', 'myorg')).rejects.toThrow('must be an array');
    });

    test('should handle null org alias', async () => {
      mockSuccessQuery([FIXTURES.activeUser]);

      const result = await batchValidateAssignees(['0051234567890ABC']);

      expect(result.totalCount).toBe(1);
      expect(result.validCount).toBe(1);
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================
  describe('Integration Tests', () => {
    test('should validate entire assignment rule entry', async () => {
      // Simulate validating all assignees in an assignment rule
      execSync
        .mockReturnValueOnce(JSON.stringify({
          status: 0,
          result: { records: [FIXTURES.activeUser], totalSize: 1 }
        }))
        .mockReturnValueOnce(JSON.stringify({
          status: 0,
          result: { records: [FIXTURES.validQueue], totalSize: 1 }
        }))
        .mockReturnValueOnce(JSON.stringify({
          status: 0,
          result: { records: [FIXTURES.validRole], totalSize: 1 }
        }));

      const assignees = [
        '0051234567890ABC', // User
        '00G1234567890ABC', // Queue
        '00E1234567890ABC'  // Role
      ];

      const result = await batchValidateAssignees(assignees, 'myorg');

      expect(result.validCount).toBe(3);
      expect(result.results.every(r => r.valid)).toBe(true);
    });

    test('should detect invalid assignees before deployment', async () => {
      execSync
        .mockReturnValueOnce(JSON.stringify({
          status: 0,
          result: { records: [FIXTURES.inactiveUser], totalSize: 1 }
        }));

      const result = await validateUser('0051234567890DEF', 'myorg');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('inactive');
    });

    test('should validate access before rule activation', async () => {
      // Validate Queue
      execSync.mockReturnValueOnce(JSON.stringify({
        status: 0,
        result: { records: [FIXTURES.validQueue], totalSize: 1 }
      }));

      // Check QueueSobject (not found)
      execSync.mockReturnValueOnce(JSON.stringify({
        status: 0,
        result: { records: [], totalSize: 0 }
      }));

      const result = await validateAssigneeAccess('00G1234567890ABC', 'Case', 'myorg');

      expect(result.hasAccess).toBe(false);
      expect(result.resolution).toContain('Add Case to queue');
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================
  describe('Edge Cases', () => {
    test('should handle 15-character Salesforce IDs', async () => {
      mockSuccessQuery([FIXTURES.activeUser]);

      const result = await validateUser('005123456789012', 'myorg');

      expect(result.valid).toBe(true);
    });

    test('should handle 18-character Salesforce IDs', async () => {
      mockSuccessQuery([FIXTURES.activeUser]);

      const result = await validateUser('0051234567890ABCDE', 'myorg');

      expect(result.valid).toBe(true);
    });

    test('should handle special characters in names', async () => {
      const userWithSpecialChars = {
        ...FIXTURES.activeUser,
        Name: "O'Brien, John (VP)"
      };

      mockSuccessQuery([userWithSpecialChars]);

      const result = await validateUser('0051234567890ABC', 'myorg');

      expect(result.valid).toBe(true);
      expect(result.data.Name).toBe("O'Brien, John (VP)");
    });

    test('should handle query timeout', async () => {
      mockFailedQuery('Timeout');

      const result = await validateUser('0051234567890ABC', 'myorg');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Query failed');
    });

    test('should handle malformed JSON response', async () => {
      execSync.mockReturnValue('invalid json');

      const result = await validateUser('0051234567890ABC', 'myorg');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle undefined vs null assigneeId', async () => {
      const nullResult = await validateUser(null, 'myorg');
      const undefinedResult = await validateUser(undefined, 'myorg');

      expect(nullResult.valid).toBe(false);
      expect(undefinedResult.valid).toBe(false);
      expect(nullResult.error).toEqual(undefinedResult.error);
    });

    test('should handle numeric assigneeId (coerced to string)', async () => {
      const result = await validateUser(123, 'myorg');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
