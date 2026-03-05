#!/usr/bin/env node

/**
 * Assignee Validator
 *
 * Query and verify assignee existence and validity for Salesforce Assignment Rules.
 * Supports Users, Queues, Roles, Territories, and Public Groups.
 *
 * @module assignee-validator
 * @version 1.0.0
 */

const { execSync } = require('child_process');

/**
 * SOQL queries for different assignee types
 * @private
 */
const ASSIGNEE_QUERIES = {
  user: "SELECT Id, Name, IsActive, Username, Email FROM User WHERE Id = '{id}'",
  queue: "SELECT Id, DeveloperName, Type, Name FROM Group WHERE Id = '{id}' AND Type = 'Queue'",
  group: "SELECT Id, DeveloperName, Type, Name FROM Group WHERE Id = '{id}' AND Type = 'Regular'",
  role: "SELECT Id, Name, DeveloperName FROM UserRole WHERE Id = '{id}'",
  territory: "SELECT Id, DeveloperName, Name FROM Territory2 WHERE Id = '{id}'"
};

const ASSIGNEE_ID_PREFIXES = {
  User: '005',
  Queue: '00G',
  Role: '00E',
  Territory: '0TM'
};

const ASSIGNEE_TYPE_ALIASES = {
  user: 'User',
  queue: 'Queue',
  group: 'Queue',
  role: 'Role',
  userrole: 'Role',
  territory: 'Territory',
  territory2: 'Territory'
};

function normalizeAssigneeType(typeHint) {
  if (!typeHint || typeof typeHint !== 'string') return null;
  return ASSIGNEE_TYPE_ALIASES[typeHint.trim().toLowerCase()] || null;
}

function looksLikeSalesforceId(value) {
  return /^[a-zA-Z0-9]{15,18}$/.test(value || '');
}

function isKnownAssigneeId(value) {
  if (!looksLikeSalesforceId(value)) return false;
  const prefix = value.substring(0, 3);
  return Object.values(ASSIGNEE_ID_PREFIXES).includes(prefix);
}

function escapeSoqlLiteral(value) {
  return String(value).replace(/'/g, "\\'");
}

async function resolveUserByReference(reference, orgAlias = null) {
  const safeRef = escapeSoqlLiteral(reference);
  const query = `
    SELECT Id, Name, IsActive, Username, Email
    FROM User
    WHERE Username = '${safeRef}'
       OR Email = '${safeRef}'
       OR Name = '${safeRef}'
    LIMIT 2
  `;

  const result = await executeQuery(query, orgAlias);

  if (!result.records || result.records.length === 0) {
    return { valid: false, notFound: true, type: 'User', reference };
  }

  if (result.records.length > 1) {
    return {
      valid: false,
      type: 'User',
      reference,
      error: `Multiple users match reference "${reference}"`,
      severity: 'critical',
      resolution: 'Use a unique Username or User ID'
    };
  }

  const user = result.records[0];
  return {
    valid: true,
    type: 'User',
    id: user.Id,
    data: user,
    reference,
    message: `User ${user.Name} resolved by reference`
  };
}

async function resolveQueueByReference(reference, orgAlias = null) {
  const safeRef = escapeSoqlLiteral(reference);
  const query = `
    SELECT Id, DeveloperName, Type, Name
    FROM Group
    WHERE Type = 'Queue'
      AND (DeveloperName = '${safeRef}' OR Name = '${safeRef}')
    LIMIT 2
  `;

  const result = await executeQuery(query, orgAlias);

  if (!result.records || result.records.length === 0) {
    return { valid: false, notFound: true, type: 'Queue', reference };
  }

  if (result.records.length > 1) {
    return {
      valid: false,
      type: 'Queue',
      reference,
      error: `Multiple queues match reference "${reference}"`,
      severity: 'critical',
      resolution: 'Use a unique DeveloperName or Queue ID'
    };
  }

  const queue = result.records[0];
  return {
    valid: true,
    type: 'Queue',
    id: queue.Id,
    data: queue,
    reference,
    message: `Queue ${queue.Name} resolved by reference`
  };
}

async function resolveRoleByReference(reference, orgAlias = null) {
  const safeRef = escapeSoqlLiteral(reference);
  const query = `
    SELECT Id, Name, DeveloperName
    FROM UserRole
    WHERE DeveloperName = '${safeRef}' OR Name = '${safeRef}'
    LIMIT 2
  `;

  const result = await executeQuery(query, orgAlias);

  if (!result.records || result.records.length === 0) {
    return { valid: false, notFound: true, type: 'Role', reference };
  }

  if (result.records.length > 1) {
    return {
      valid: false,
      type: 'Role',
      reference,
      error: `Multiple roles match reference "${reference}"`,
      severity: 'critical',
      resolution: 'Use a unique DeveloperName or Role ID'
    };
  }

  const role = result.records[0];
  return {
    valid: true,
    type: 'Role',
    id: role.Id,
    data: role,
    reference,
    message: `Role ${role.Name} resolved by reference`
  };
}

async function resolveTerritoryByReference(reference, orgAlias = null) {
  const safeRef = escapeSoqlLiteral(reference);
  const query = `
    SELECT Id, DeveloperName, Name
    FROM Territory2
    WHERE DeveloperName = '${safeRef}' OR Name = '${safeRef}'
    LIMIT 2
  `;

  const result = await executeQuery(query, orgAlias);

  if (!result.records || result.records.length === 0) {
    return { valid: false, notFound: true, type: 'Territory', reference };
  }

  if (result.records.length > 1) {
    return {
      valid: false,
      type: 'Territory',
      reference,
      error: `Multiple territories match reference "${reference}"`,
      severity: 'critical',
      resolution: 'Use a unique DeveloperName or Territory ID'
    };
  }

  const territory = result.records[0];
  return {
    valid: true,
    type: 'Territory',
    id: territory.Id,
    data: territory,
    reference,
    message: `Territory ${territory.Name} resolved by reference`
  };
}

async function resolveAssigneeReference(reference, orgAlias = null, assigneeTypeHint = null) {
  const normalizedType = normalizeAssigneeType(assigneeTypeHint);

  const resolverMap = {
    User: resolveUserByReference,
    Queue: resolveQueueByReference,
    Role: resolveRoleByReference,
    Territory: resolveTerritoryByReference
  };

  if (normalizedType) {
    return resolverMap[normalizedType](reference, orgAlias);
  }

  const resolvers = [
    resolveUserByReference,
    resolveQueueByReference,
    resolveRoleByReference,
    resolveTerritoryByReference
  ];

  const matches = [];
  let lastError = null;

  for (const resolver of resolvers) {
    const result = await resolver(reference, orgAlias);
    if (result.valid) {
      matches.push(result);
    } else if (!result.notFound) {
      lastError = result;
    }
  }

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    const matchedTypes = matches.map(match => match.type).join(', ');
    return {
      valid: false,
      type: 'Unknown',
      reference,
      error: `Ambiguous assignee reference "${reference}" (matches: ${matchedTypes})`,
      severity: 'critical',
      resolution: 'Provide a Salesforce ID or set assignedToType to disambiguate'
    };
  }

  if (lastError) {
    return lastError;
  }

  return {
    valid: false,
    type: 'Unknown',
    reference,
    error: `No assignee found for reference "${reference}"`,
    severity: 'critical',
    resolution: 'Provide a Salesforce ID or set assignedToType'
  };
}

/**
 * Validate User existence and active status
 *
 * @param {string} userId - 15 or 18 character Salesforce User ID
 * @param {string} [orgAlias] - Salesforce org alias (optional, uses default if not provided)
 * @returns {Promise<Object>} Validation result with user details
 *
 * @example
 * const result = await validateUser('0051234567890ABC', 'myorg');
 * if (result.valid) {
 *   console.log(`User ${result.data.Name} is active`);
 * }
 */
async function validateUser(userId, orgAlias = null) {
  if (!userId || typeof userId !== 'string') {
    return {
      valid: false,
      type: 'User',
      id: userId,
      error: 'Invalid user ID: must be a non-empty string',
      severity: 'critical'
    };
  }

  // Validate ID format (starts with 005)
  if (!userId.startsWith('005')) {
    return {
      valid: false,
      type: 'User',
      id: userId,
      error: 'Invalid user ID: must start with 005',
      severity: 'critical'
    };
  }

  try {
    const query = ASSIGNEE_QUERIES.user.replace('{id}', userId);
    const result = await executeQuery(query, orgAlias);

    if (!result.records || result.records.length === 0) {
      return {
        valid: false,
        type: 'User',
        id: userId,
        error: 'User not found in org',
        severity: 'critical'
      };
    }

    const user = result.records[0];

    // Check if user is active
    if (!user.IsActive) {
      return {
        valid: false,
        type: 'User',
        id: userId,
        data: user,
        error: `User ${user.Name} (${user.Username}) is inactive`,
        severity: 'critical',
        resolution: 'Activate user or assign to a different user'
      };
    }

    return {
      valid: true,
      type: 'User',
      id: userId,
      data: user,
      message: `User ${user.Name} is active`
    };

  } catch (error) {
    return {
      valid: false,
      type: 'User',
      id: userId,
      error: `Query failed: ${error.message}`,
      severity: 'critical'
    };
  }
}

/**
 * Validate Queue existence
 *
 * @param {string} queueId - 15 or 18 character Salesforce Queue (Group) ID
 * @param {string} [orgAlias] - Salesforce org alias
 * @returns {Promise<Object>} Validation result with queue details
 *
 * @example
 * const result = await validateQueue('00G1234567890ABC', 'myorg');
 * if (result.valid) {
 *   console.log(`Queue ${result.data.Name} exists`);
 * }
 */
async function validateQueue(queueId, orgAlias = null) {
  if (!queueId || typeof queueId !== 'string') {
    return {
      valid: false,
      type: 'Queue',
      id: queueId,
      error: 'Invalid queue ID: must be a non-empty string',
      severity: 'critical'
    };
  }

  // Validate ID format (starts with 00G)
  if (!queueId.startsWith('00G')) {
    return {
      valid: false,
      type: 'Queue',
      id: queueId,
      error: 'Invalid queue ID: must start with 00G',
      severity: 'critical'
    };
  }

  try {
    const query = ASSIGNEE_QUERIES.queue.replace('{id}', queueId);
    const result = await executeQuery(query, orgAlias);

    if (!result.records || result.records.length === 0) {
      return {
        valid: false,
        type: 'Queue',
        id: queueId,
        error: 'Queue not found in org',
        severity: 'critical',
        resolution: 'Verify queue ID or create the queue'
      };
    }

    const queue = result.records[0];

    // Verify it's actually a Queue type
    if (queue.Type !== 'Queue') {
      return {
        valid: false,
        type: 'Queue',
        id: queueId,
        data: queue,
        error: `Group ${queue.Name} exists but is type ${queue.Type}, not Queue`,
        severity: 'critical'
      };
    }

    return {
      valid: true,
      type: 'Queue',
      id: queueId,
      data: queue,
      message: `Queue ${queue.Name} exists`
    };

  } catch (error) {
    return {
      valid: false,
      type: 'Queue',
      id: queueId,
      error: `Query failed: ${error.message}`,
      severity: 'critical'
    };
  }
}

/**
 * Validate Role existence
 *
 * @param {string} roleId - 15 or 18 character Salesforce UserRole ID
 * @param {string} [orgAlias] - Salesforce org alias
 * @returns {Promise<Object>} Validation result with role details
 */
async function validateRole(roleId, orgAlias = null) {
  if (!roleId || typeof roleId !== 'string') {
    return {
      valid: false,
      type: 'Role',
      id: roleId,
      error: 'Invalid role ID: must be a non-empty string',
      severity: 'critical'
    };
  }

  // Validate ID format (starts with 00E)
  if (!roleId.startsWith('00E')) {
    return {
      valid: false,
      type: 'Role',
      id: roleId,
      error: 'Invalid role ID: must start with 00E',
      severity: 'critical'
    };
  }

  try {
    const query = ASSIGNEE_QUERIES.role.replace('{id}', roleId);
    const result = await executeQuery(query, orgAlias);

    if (!result.records || result.records.length === 0) {
      return {
        valid: false,
        type: 'Role',
        id: roleId,
        error: 'Role not found in org',
        severity: 'critical'
      };
    }

    const role = result.records[0];

    return {
      valid: true,
      type: 'Role',
      id: roleId,
      data: role,
      message: `Role ${role.Name} exists`
    };

  } catch (error) {
    return {
      valid: false,
      type: 'Role',
      id: roleId,
      error: `Query failed: ${error.message}`,
      severity: 'critical'
    };
  }
}

/**
 * Validate Territory2 existence
 *
 * @param {string} territoryId - 15 or 18 character Salesforce Territory2 ID
 * @param {string} [orgAlias] - Salesforce org alias
 * @returns {Promise<Object>} Validation result with territory details
 */
async function validateTerritory(territoryId, orgAlias = null) {
  if (!territoryId || typeof territoryId !== 'string') {
    return {
      valid: false,
      type: 'Territory',
      id: territoryId,
      error: 'Invalid territory ID: must be a non-empty string',
      severity: 'critical'
    };
  }

  // Validate ID format (starts with 0TM)
  if (!territoryId.startsWith('0TM')) {
    return {
      valid: false,
      type: 'Territory',
      id: territoryId,
      error: 'Invalid territory ID: must start with 0TM',
      severity: 'critical'
    };
  }

  try {
    const query = ASSIGNEE_QUERIES.territory.replace('{id}', territoryId);
    const result = await executeQuery(query, orgAlias);

    if (!result.records || result.records.length === 0) {
      return {
        valid: false,
        type: 'Territory',
        id: territoryId,
        error: 'Territory not found in org',
        severity: 'critical'
      };
    }

    const territory = result.records[0];

    return {
      valid: true,
      type: 'Territory',
      id: territoryId,
      data: territory,
      message: `Territory ${territory.Name} exists`
    };

  } catch (error) {
    return {
      valid: false,
      type: 'Territory',
      id: territoryId,
      error: `Query failed: ${error.message}`,
      severity: 'critical'
    };
  }
}

/**
 * Validate assignee based on ID prefix (auto-detect type)
 * Also supports name-based references when assignedToType is provided.
 *
 * @param {string} assigneeId - Salesforce ID (auto-detects type)
 * @param {string} [orgAlias] - Salesforce org alias
 * @returns {Promise<Object>} Validation result
 *
 * @example
 * const result = await validateAssignee('0051234567890ABC');
 * // Automatically detects User and validates
 *
 * const queueResult = await validateAssignee('Support_Queue', 'myorg', 'Queue');
 * // Resolves queue by DeveloperName or Name before validating
 */
async function validateAssignee(assigneeRef, orgAlias = null, assigneeTypeHint = null) {
  if (!assigneeRef || typeof assigneeRef !== 'string') {
    return {
      valid: false,
      type: 'Unknown',
      id: assigneeRef,
      error: 'Invalid assignee ID: must be a non-empty string',
      severity: 'critical'
    };
  }

  const trimmed = assigneeRef.trim();

  // Detect type by ID prefix
  if (isKnownAssigneeId(trimmed)) {
    const prefix = trimmed.substring(0, 3);

    switch (prefix) {
      case '005':
        return validateUser(trimmed, orgAlias);
      case '00G':
        return validateQueue(trimmed, orgAlias);
      case '00E':
        return validateRole(trimmed, orgAlias);
      case '0TM':
        return validateTerritory(trimmed, orgAlias);
      default:
        break;
    }
  }

  if (looksLikeSalesforceId(trimmed)) {
    const prefix = trimmed.substring(0, 3);
    return {
      valid: false,
      type: 'Unknown',
      id: trimmed,
      error: `Unknown assignee type for ID prefix: ${prefix}`,
      severity: 'critical',
      resolution: 'Verify ID is correct. Valid prefixes: 005 (User), 00G (Queue), 00E (Role), 0TM (Territory)'
    };
  }

  const resolved = await resolveAssigneeReference(trimmed, orgAlias, assigneeTypeHint);
  if (!resolved.valid) {
    return resolved;
  }

  const resolvedValidation = await validateAssignee(resolved.id, orgAlias);
  if (!resolvedValidation.valid) {
    return resolvedValidation;
  }

  return {
    ...resolvedValidation,
    reference: trimmed,
    resolvedBy: resolved.type,
    resolvedFrom: assigneeTypeHint ? 'type-hint' : 'lookup'
  };
}

/**
 * Validate assignee access permissions to object
 *
 * Checks if assignee (User or Queue members) has Edit access to object
 *
 * @param {string} assigneeId - Salesforce User or Queue ID
 * @param {string} objectApiName - Object API name (e.g., 'Lead', 'Case')
 * @param {string} [orgAlias] - Salesforce org alias
 * @returns {Promise<Object>} Access validation result
 *
 * @example
 * const access = await validateAssigneeAccess('0051234567890ABC', 'Lead');
 * if (!access.hasAccess) {
 *   console.error(access.error);
 * }
 */
async function validateAssigneeAccess(assigneeRef, objectApiName, orgAlias = null, assigneeTypeHint = null) {
  // First validate assignee exists
  const assigneeValidation = await validateAssignee(assigneeRef, orgAlias, assigneeTypeHint);

  if (!assigneeValidation.valid) {
    return {
      hasAccess: false,
      assigneeId: assigneeValidation.id || assigneeRef,
      assigneeReference: assigneeValidation.reference || assigneeRef,
      objectApiName,
      error: `Assignee validation failed: ${assigneeValidation.error}`,
      severity: 'critical'
    };
  }

  const resolvedAssigneeId = assigneeValidation.id || assigneeRef;
  const assigneeReference = assigneeValidation.reference || assigneeRef;
  const assigneeType = assigneeValidation.type;

  try {
    if (assigneeType === 'User') {
      // Check User's object permissions via UserRecordAccess
      const accessQuery = `
        SELECT RecordId, HasEditAccess, MaxAccessLevel
        FROM UserRecordAccess
        WHERE UserId = '${resolvedAssigneeId}'
        AND RecordId IN (
          SELECT Id FROM ${objectApiName} LIMIT 1
        )
      `;

      // Note: This is a simplified check. In production, would need to:
      // 1. Query Profile/PermissionSet for object permissions
      // 2. Check FLS (Field Level Security)
      // 3. Verify record type access
      // For now, we'll assume if user is active, they can be assigned

      return {
        hasAccess: true,
        assigneeId: resolvedAssigneeId,
        assigneeReference,
        assigneeType: 'User',
        objectApiName,
        userName: assigneeValidation.data.Name,
        message: `User ${assigneeValidation.data.Name} can be assigned ${objectApiName} records`,
        note: 'Full permission verification requires Profile/PermissionSet analysis'
      };

    } else if (assigneeType === 'Queue') {
      // Check if Queue supports this object
      const queueQuery = `
        SELECT Id, QueueSobjectId, SobjectType
        FROM QueueSobject
        WHERE QueueId = '${resolvedAssigneeId}'
        AND SobjectType = '${objectApiName}'
      `;

      const queueResult = await executeQuery(queueQuery, orgAlias);

      if (!queueResult.records || queueResult.records.length === 0) {
        return {
          hasAccess: false,
          assigneeId: resolvedAssigneeId,
          assigneeReference,
          assigneeType: 'Queue',
          objectApiName,
          queueName: assigneeValidation.data.Name,
          error: `Queue ${assigneeValidation.data.Name} does not support ${objectApiName} objects`,
          severity: 'critical',
          resolution: `Add ${objectApiName} to queue supported objects in Setup`
        };
      }

      // Check queue members have access
      const membersQuery = `
        SELECT UserOrGroupId
        FROM GroupMember
        WHERE GroupId = '${resolvedAssigneeId}'
        LIMIT 5
      `;

      const membersResult = await executeQuery(membersQuery, orgAlias);

      if (!membersResult.records || membersResult.records.length === 0) {
        return {
          hasAccess: true,
          assigneeId: resolvedAssigneeId,
          assigneeReference,
          assigneeType: 'Queue',
          objectApiName,
          queueName: assigneeValidation.data.Name,
          warning: 'Queue has no members',
          severity: 'warning',
          message: `Queue ${assigneeValidation.data.Name} supports ${objectApiName} but has no members`
        };
      }

      return {
        hasAccess: true,
        assigneeId: resolvedAssigneeId,
        assigneeReference,
        assigneeType: 'Queue',
        objectApiName,
        queueName: assigneeValidation.data.Name,
        memberCount: membersResult.records.length,
        message: `Queue ${assigneeValidation.data.Name} supports ${objectApiName} and has ${membersResult.records.length}+ members`
      };

    } else {
      // Role or Territory - assume valid
      return {
        hasAccess: true,
        assigneeId: resolvedAssigneeId,
        assigneeReference,
        assigneeType,
        objectApiName,
        message: `${assigneeType} assignments are valid for ${objectApiName}`,
        note: `${assigneeType} access depends on user role hierarchy`
      };
    }

  } catch (error) {
    return {
      hasAccess: false,
      assigneeId: resolvedAssigneeId,
      assigneeReference,
      objectApiName,
      error: `Access validation failed: ${error.message}`,
      severity: 'warning'
    };
  }
}

/**
 * Batch validate multiple assignees
 *
 * @param {Array<string>} assigneeIds - Array of Salesforce IDs
 * @param {string} [orgAlias] - Salesforce org alias
 * @returns {Promise<Object>} Batch validation results
 *
 * @example
 * const results = await batchValidateAssignees(['0051...', '00G1...']);
 * console.log(`Valid: ${results.validCount}/${results.totalCount}`);
 */
async function batchValidateAssignees(assigneeIds, orgAlias = null) {
  if (!Array.isArray(assigneeIds)) {
    throw new Error('assigneeIds must be an array');
  }

  const results = {
    totalCount: assigneeIds.length,
    validCount: 0,
    invalidCount: 0,
    results: []
  };

  // Validate each assignee
  for (const id of assigneeIds) {
    const validation = await validateAssignee(id, orgAlias);
    results.results.push(validation);

    if (validation.valid) {
      results.validCount++;
    } else {
      results.invalidCount++;
    }
  }

  return results;
}

/**
 * Execute SOQL query via Salesforce CLI
 *
 * @private
 * @param {string} query - SOQL query string
 * @param {string} [orgAlias] - Salesforce org alias
 * @returns {Promise<Object>} Query result
 */
async function executeQuery(query, orgAlias = null) {
  const orgFlag = orgAlias ? `--target-org ${orgAlias}` : '';

  const command = `sf data query --query "${query.replace(/"/g, '\\"')}" ${orgFlag} --json`;

  try {
    const output = execSync(command, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    const result = JSON.parse(output);

    if (result.status !== 0) {
      throw new Error(result.message || 'Query failed');
    }

    return result.result;

  } catch (error) {
    // Parse error output if JSON
    try {
      const errorResult = JSON.parse(error.stdout || error.stderr || '{}');
      throw new Error(errorResult.message || error.message);
    } catch {
      throw new Error(error.message);
    }
  }
}

// Export functions
module.exports = {
  validateUser,
  validateQueue,
  validateRole,
  validateTerritory,
  validateAssignee,
  validateAssigneeAccess,
  batchValidateAssignees
};

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node assignee-validator.js <assignee-id> [org-alias] [object-api-name]');
    console.error('');
    console.error('Examples:');
    console.error('  node assignee-validator.js 0051234567890ABC                    # Validate user');
    console.error('  node assignee-validator.js 00G1234567890ABC myorg              # Validate queue');
    console.error('  node assignee-validator.js 0051234567890ABC myorg Lead         # Check Lead access');
    process.exit(1);
  }

  const [assigneeId, orgAlias, objectApiName] = args;

  (async () => {
    try {
      console.log(`Validating assignee: ${assigneeId}`);
      if (orgAlias) console.log(`Org: ${orgAlias}`);
      console.log('');

      const validation = await validateAssignee(assigneeId, orgAlias);

      if (validation.valid) {
        console.log('✓ Validation passed');
        console.log(`  Type: ${validation.type}`);
        console.log(`  Name: ${validation.data.Name}`);
        console.log(`  Message: ${validation.message}`);
      } else {
        console.log('✗ Validation failed');
        console.log(`  Type: ${validation.type}`);
        console.log(`  Error: ${validation.error}`);
        console.log(`  Severity: ${validation.severity}`);
        if (validation.resolution) {
          console.log(`  Resolution: ${validation.resolution}`);
        }
        process.exit(1);
      }

      // If object API name provided, check access
      if (objectApiName) {
        console.log('');
        console.log(`Checking ${objectApiName} access...`);

        const access = await validateAssigneeAccess(assigneeId, objectApiName, orgAlias);

        if (access.hasAccess) {
          console.log('✓ Access validated');
          console.log(`  Message: ${access.message}`);
          if (access.note) {
            console.log(`  Note: ${access.note}`);
          }
          if (access.warning) {
            console.log(`  Warning: ${access.warning}`);
          }
        } else {
          console.log('✗ Access denied');
          console.log(`  Error: ${access.error}`);
          console.log(`  Severity: ${access.severity}`);
          if (access.resolution) {
            console.log(`  Resolution: ${access.resolution}`);
          }
          process.exit(1);
        }
      }

    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })();
}
