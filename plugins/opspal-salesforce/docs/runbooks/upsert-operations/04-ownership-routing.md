# 04 - Ownership Routing

Intelligent record ownership assignment during upsert operations.

## Ownership Assignment Priority

The ownership router evaluates these strategies in order:

```
1. EXPLICIT ASSIGNMENT
   └── OwnerId specified in input → Use that owner
             │
             ▼
2. ACCOUNT-BASED ASSIGNMENT (Contacts/related records)
   └── AccountId exists → Query Account.OwnerId → Assign
             │
             ▼
3. TERRITORY ASSIGNMENT (if Territory2 enabled)
   └── Evaluate Territory2 rules → Assign to territory owner
             │
             ▼
4. LEAD ASSIGNMENT RULES (Leads only)
   └── Evaluate active Assignment Rules → Assign per rule
             │
             ▼
5. QUEUE ROUND-ROBIN (if queue specified)
   └── Get next available queue member → Assign
             │
             ▼
6. DEFAULT FALLBACK
   └── Assign to configured default owner or queue
```

## Strategy Details

### 1. Explicit Assignment

**When it applies:** Input record contains `OwnerId`

```javascript
const assignExplicit = async (record) => {
    if (!record.OwnerId) return null;

    // Validate owner is active
    const owner = await queryUser(record.OwnerId);

    if (!owner || !owner.IsActive) {
        return {
            success: false,
            error: 'INACTIVE_OWNER',
            fallback: true
        };
    }

    return {
        success: true,
        ownerId: record.OwnerId,
        strategy: 'EXPLICIT'
    };
};
```

### 2. Account-Based Assignment

**When it applies:** Creating Contacts or related records under an Account

```javascript
const assignToAccountOwner = async (record, accountId) => {
    const query = `
        SELECT Id, OwnerId, Owner.IsActive, Owner.Name
        FROM Account
        WHERE Id = '${accountId}'
    `;

    const account = await executeQuery(query);

    if (!account) {
        return { success: false, error: 'ACCOUNT_NOT_FOUND' };
    }

    if (!account.Owner?.IsActive) {
        // Fallback to Account Team
        return await getAccountTeamMember(accountId);
    }

    return {
        success: true,
        ownerId: account.OwnerId,
        ownerName: account.Owner.Name,
        strategy: 'ACCOUNT_OWNER'
    };
};
```

**Account Team Fallback:**

```javascript
const getAccountTeamMember = async (accountId) => {
    const query = `
        SELECT UserId, User.IsActive, TeamMemberRole
        FROM AccountTeamMember
        WHERE AccountId = '${accountId}'
          AND User.IsActive = true
        ORDER BY TeamMemberRole
        LIMIT 1
    `;

    const member = await executeQuery(query);

    if (member) {
        return {
            success: true,
            ownerId: member.UserId,
            strategy: 'ACCOUNT_TEAM',
            role: member.TeamMemberRole
        };
    }

    return { success: false, fallback: true };
};
```

### 3. Territory Assignment

**When it applies:** Organization uses Territory Management 2.0

```javascript
const assignByTerritory = async (record) => {
    // Check if Territory2 is enabled
    const orgInfo = await getOrgInfo();
    if (!orgInfo.Territory2Enabled) {
        return { success: false, fallback: true };
    }

    // Find territory for this record
    const territoryQuery = `
        SELECT Id, Territory2Id, Territory2.DeveloperName
        FROM ObjectTerritory2Association
        WHERE ObjectId = '${record.Id}'
        LIMIT 1
    `;

    const association = await executeQuery(territoryQuery);

    if (!association) {
        return { success: false, fallback: true };
    }

    // Get territory owner
    const userQuery = `
        SELECT UserId, User.Name, User.IsActive
        FROM UserTerritory2Association
        WHERE Territory2Id = '${association.Territory2Id}'
          AND User.IsActive = true
          AND RoleInTerritory2 = 'Owner'
        LIMIT 1
    `;

    const user = await executeQuery(userQuery);

    if (user) {
        return {
            success: true,
            ownerId: user.UserId,
            ownerName: user.User.Name,
            strategy: 'TERRITORY',
            territory: association.Territory2.DeveloperName
        };
    }

    return { success: false, fallback: true };
};
```

### 4. Lead Assignment Rules

**When it applies:** New Leads being created

```javascript
// Trigger assignment rule evaluation via DML options
const insertLeadWithAssignment = async (leadData) => {
    // Option 1: Use sf CLI with assignment rule header
    const cmd = `sf data create record --sobject Lead \
        --values "${JSON.stringify(leadData)}" \
        --use-assignment-rules`;

    // Option 2: Use Apex with DML options
    // Database.DMLOptions dmo = new Database.DMLOptions();
    // dmo.assignmentRuleHeader.useDefaultRule = true;
    // Database.insert(lead, dmo);

    return await executeCommand(cmd);
};
```

**Query Assignment Rules (for visibility):**

```javascript
const getActiveAssignmentRules = async () => {
    const query = `
        SELECT Id, Name, Active
        FROM AssignmentRule
        WHERE SobjectType = 'Lead'
          AND Active = true
    `;

    return await executeQuery(query, { useToolingApi: true });
};
```

### 5. Queue Round-Robin

**When it applies:** Distributing records among queue members

```javascript
const roundRobinAssign = async (queueId) => {
    // Get queue members
    const memberQuery = `
        SELECT Id, UserOrGroupId
        FROM GroupMember
        WHERE GroupId = '${queueId}'
    `;

    const members = await executeQuery(memberQuery);
    const userIds = members.map(m => m.UserOrGroupId);

    // Filter to active users
    const activeUsers = await getActiveUsers(userIds);

    if (activeUsers.length === 0) {
        return { success: false, error: 'NO_ACTIVE_QUEUE_MEMBERS' };
    }

    // Get last assigned user from recent records
    const lastAssignedQuery = `
        SELECT OwnerId
        FROM Lead
        WHERE OwnerId IN ('${activeUsers.join("','")}')
        ORDER BY CreatedDate DESC
        LIMIT 1
    `;

    const lastAssigned = await executeQuery(lastAssignedQuery);
    const lastUserId = lastAssigned?.[0]?.OwnerId;

    // Find next user in rotation
    const lastIndex = activeUsers.indexOf(lastUserId);
    const nextIndex = (lastIndex + 1) % activeUsers.length;
    const nextUser = activeUsers[nextIndex];

    return {
        success: true,
        ownerId: nextUser.Id,
        ownerName: nextUser.Name,
        strategy: 'ROUND_ROBIN',
        queueId
    };
};
```

**Weighted Round-Robin:**

```javascript
const weightedRoundRobin = async (queueId, weights) => {
    const members = await getQueueMembers(queueId);

    // Build weighted pool
    const pool = [];
    for (const member of members) {
        const weight = weights[member.UserId] || 1;
        for (let i = 0; i < weight; i++) {
            pool.push(member);
        }
    }

    // Random selection from weighted pool
    const index = Math.floor(Math.random() * pool.length);
    return pool[index];
};
```

### 6. Default Fallback

```javascript
const assignDefault = async (objectType, config) => {
    const fallback = config.strategies[objectType]?.fallback;

    if (fallback === 'queue') {
        return {
            ownerId: config.strategies[objectType].fallbackQueueId,
            strategy: 'DEFAULT_QUEUE'
        };
    }

    return {
        ownerId: config.strategies[objectType].fallbackOwnerId,
        strategy: 'DEFAULT_OWNER'
    };
};
```

## Configuration

**Location:** `instances/{org}/ownership-config.json`

```json
{
  "strategies": {
    "Lead": {
      "primary": "assignment-rules",
      "fallback": "round-robin-queue",
      "fallbackQueueId": "00GXXXXXXXXXX",
      "useAssignmentRules": true
    },
    "Contact": {
      "primary": "account-owner",
      "fallback": "account-team",
      "fallbackOwnerId": "005XXXXXXXXXX"
    },
    "Account": {
      "primary": "territory",
      "fallback": "default-owner",
      "fallbackOwnerId": "005XXXXXXXXXX"
    }
  },
  "notifications": {
    "enabled": true,
    "createTask": true,
    "taskSubject": "New Record Assigned",
    "taskPriority": "Normal",
    "postChatter": false,
    "emailAlert": false
  },
  "validation": {
    "requireActiveOwner": true,
    "blockInactiveUsers": true,
    "validateQueueMembership": true
  },
  "roundRobin": {
    "trackingMethod": "recent-records",
    "weights": {
      "005USER1": 2,
      "005USER2": 1,
      "005USER3": 1
    }
  }
}
```

## Owner Change Notifications

### Create Task for New Owner

```javascript
const createOwnerChangeTask = async (recordId, newOwnerId, context) => {
    const taskData = {
        OwnerId: newOwnerId,
        Subject: context.config.notifications.taskSubject || 'New Record Assigned',
        Description: `
This record was assigned to you via automated routing.

Details:
- Record ID: ${recordId}
- Previous Owner: ${context.previousOwnerId || 'None'}
- Assignment Strategy: ${context.strategy}
- Assignment Time: ${new Date().toISOString()}
${context.notes || ''}

Please review and follow up as appropriate.
        `.trim(),
        Priority: context.config.notifications.taskPriority || 'Normal',
        Status: 'Not Started',
        ActivityDate: new Date().toISOString().split('T')[0]
    };

    // Set WhoId or WhatId based on record type
    if (recordId.startsWith('00Q') || recordId.startsWith('003')) {
        taskData.WhoId = recordId; // Lead or Contact
    } else {
        taskData.WhatId = recordId; // Account or other
    }

    return await createRecord('Task', taskData);
};
```

### Post Chatter Notification

```javascript
const postChatterNotification = async (recordId, newOwnerId, message) => {
    const feedItem = {
        ParentId: recordId,
        Body: message || `This record has been assigned to you.`,
        Type: 'TextPost'
    };

    // Mention the new owner
    feedItem.Body = `@[${newOwnerId}] ${feedItem.Body}`;

    return await createRecord('FeedItem', feedItem);
};
```

### Send Email Alert

```javascript
const sendOwnerChangeEmail = async (recordId, newOwnerId, context) => {
    // Use Salesforce Email Alert or custom email template
    const emailData = {
        templateId: context.config.notifications.emailTemplateId,
        targetObjectId: newOwnerId,
        whatId: recordId,
        saveAsActivity: false
    };

    return await sendEmail(emailData);
};
```

## Ownership During Conversion

### Lead Conversion Ownership

When converting a Lead to Contact/Account:

```javascript
const determineConversionOwner = async (lead, matchedAccount, config) => {
    // Priority 1: Use Account owner if matching Account found
    if (matchedAccount) {
        const accountOwner = await validateOwner(matchedAccount.OwnerId);
        if (accountOwner.isActive) {
            return {
                ownerId: matchedAccount.OwnerId,
                strategy: 'MATCHED_ACCOUNT_OWNER'
            };
        }
    }

    // Priority 2: Keep Lead owner if active and configured
    if (config.conversion.keepLeadOwner) {
        const leadOwner = await validateOwner(lead.OwnerId);
        if (leadOwner.isActive) {
            return {
                ownerId: lead.OwnerId,
                strategy: 'LEAD_OWNER'
            };
        }
    }

    // Priority 3: Use territory assignment
    if (config.conversion.useTerritoryRules) {
        const territoryResult = await assignByTerritory(lead);
        if (territoryResult.success) {
            return territoryResult;
        }
    }

    // Fallback to default
    return await assignDefault('Contact', config);
};
```

## Active Owner Validation

```javascript
const validateOwner = async (ownerId) => {
    const query = `
        SELECT Id, Name, IsActive, Profile.Name, UserRole.Name
        FROM User
        WHERE Id = '${ownerId}'
    `;

    const user = await executeQuery(query);

    if (!user) {
        return { exists: false, isActive: false };
    }

    return {
        exists: true,
        isActive: user.IsActive,
        name: user.Name,
        profile: user.Profile?.Name,
        role: user.UserRole?.Name
    };
};

const ensureActiveOwner = async (ownerId, fallbackConfig) => {
    const validation = await validateOwner(ownerId);

    if (validation.exists && validation.isActive) {
        return { ownerId, validated: true };
    }

    // Owner inactive, find replacement
    const replacement = await findReplacementOwner(ownerId, fallbackConfig);

    return {
        ownerId: replacement.ownerId,
        validated: true,
        replaced: true,
        originalOwner: ownerId,
        reason: validation.exists ? 'OWNER_INACTIVE' : 'OWNER_NOT_FOUND'
    };
};
```

## Output Format

```json
{
  "assignmentResults": {
    "summary": {
      "totalRecords": 100,
      "assigned": 95,
      "unchanged": 3,
      "errors": 2
    },
    "byStrategy": {
      "ACCOUNT_OWNER": 45,
      "ASSIGNMENT_RULES": 30,
      "TERRITORY": 15,
      "ROUND_ROBIN": 5
    },
    "assignments": [
      {
        "recordId": "00QXXXXXXXXXX",
        "objectType": "Lead",
        "previousOwnerId": null,
        "newOwnerId": "005XXXXXXXXXX",
        "newOwnerName": "John Smith",
        "strategy": "ASSIGNMENT_RULES",
        "ruleName": "West Region Assignment",
        "notificationSent": true
      }
    ],
    "errors": [
      {
        "recordId": "00QYYYYYYYYYY",
        "error": "NO_ACTIVE_QUEUE_MEMBERS",
        "fallbackApplied": "DEFAULT_OWNER",
        "newOwnerId": "005XXXXXXXXXX"
      }
    ]
  }
}
```

## Best Practices

### 1. Always Validate Owners

Never assign to an owner without checking they're active.

### 2. Document Assignment Logic

Keep assignment rules and territories documented for troubleshooting.

### 3. Monitor Queue Distribution

Track round-robin fairness and adjust weights as needed.

### 4. Test Territory Changes

Validate territory rule changes in sandbox before production.

### 5. Set Up Alerts

Configure notifications for assignment failures.

## Related Sections

- [01 - Upsert Fundamentals](01-upsert-fundamentals.md)
- [06 - Lead Auto-Conversion](06-lead-auto-conversion.md)
- [08 - Audit Logging](08-audit-logging.md)

---
Next: [05 - Enrichment Waterfall](05-enrichment-waterfall.md)
