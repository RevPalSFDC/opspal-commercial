# Assignment Rules Conflict Detection Patterns

**Version**: 1.0.0
**Last Updated**: 2025-12-15

## Overview

This document defines the 8 core conflict patterns for Salesforce Assignment Rules, providing detection algorithms, risk scoring, and resolution strategies. These patterns extend the existing automation conflict detection framework (Patterns 1-8 in automation-audit-framework) with Assignment Rule-specific conflicts.

**Pattern Numbers**: 9-16 (Assignment Rules extend base patterns 1-8)

---

## Conflict Pattern Summary

| Pattern | Name | Risk Level | Auto-Resolvable |
|---------|------|------------|-----------------|
| 9 | Overlapping Assignment Criteria | Critical (60-100) | Yes |
| 10 | Assignment Rule vs. Flow | High (50-80) | Partial |
| 11 | Assignment Rule vs. Apex Trigger | High (50-80) | No |
| 12 | Circular Assignment Routing | Critical (80-100) | Yes |
| 13 | Territory Rule vs. Assignment Rule | Medium (30-50) | No |
| 14 | Queue Membership Access | High (60-80) | Yes |
| 15 | Record Type Assignment Mismatch | Medium (30-50) | Yes |
| 16 | Field Dependency in Criteria | Critical (80-100) | Yes |

---

## Pattern 9: Overlapping Assignment Criteria

### Description

Multiple assignment rule entries match the same record, potentially causing confusion about which entry should fire.

### Risk Level

**Critical (60-100)**

The risk score depends on:
- Severity of overlap (complete superset vs. partial overlap)
- Order difference (adjacent entries vs. far apart)
- Assignee difference (same team vs. different teams)

### Detection Algorithm

```javascript
/**
 * Detect overlapping criteria between two rule entries
 *
 * @param {Object} entry1 - First rule entry
 * @param {Object} entry2 - Second rule entry
 * @returns {Object|null} - Conflict object or null if no overlap
 */
function detectOverlappingCriteria(entry1, entry2) {
  const entry1Criteria = entry1.criteriaItems || [];
  const entry2Criteria = entry2.criteriaItems || [];

  // Build criteria maps for comparison
  const entry1Map = buildCriteriaMap(entry1Criteria);
  const entry2Map = buildCriteriaMap(entry2Criteria);

  // Check if entry2 is a superset of entry1 (more specific → more general)
  const isSuperset = checkSuperset(entry1Map, entry2Map);

  if (isSuperset) {
    // Calculate risk based on order difference and assignee
    const orderDiff = Math.abs(entry1.order - entry2.order);
    const sameAssignee = entry1.assignedTo === entry2.assignedTo;

    let riskScore = 60;  // Base risk

    if (orderDiff === 1) {
      riskScore += 10;  // Adjacent entries - likely intentional
    } else if (orderDiff > 5) {
      riskScore += 20;  // Far apart - likely mistake
    }

    if (!sameAssignee) {
      riskScore += 10;  // Different assignees increase risk
    }

    return {
      type: 'overlapping_criteria',
      severity: riskScore >= 80 ? 'critical' : 'high',
      entry1: entry1.order,
      entry2: entry2.order,
      message: `Entry ${entry2.order} criteria is more general than Entry ${entry1.order}. Both will match records with criteria: ${formatCriteria(entry1Criteria)}`,
      resolution: `Ensure Entry ${entry1.order} (more specific) has lower orderNumber than Entry ${entry2.order} (more general). Current order: ${entry1.order} vs ${entry2.order}.`,
      autoResolvable: true,
      suggestedAction: entry1.order > entry2.order ? 'reorder' : 'verified',
      riskScore: Math.min(riskScore, 100)
    };
  }

  // Check for partial overlap (some shared criteria)
  const sharedCriteria = findSharedCriteria(entry1Map, entry2Map);

  if (sharedCriteria.length > 0) {
    return {
      type: 'partial_overlap',
      severity: 'warning',
      entry1: entry1.order,
      entry2: entry2.order,
      sharedCriteria: sharedCriteria,
      message: `Entries ${entry1.order} and ${entry2.order} share ${sharedCriteria.length} criteria fields. May cause confusion.`,
      resolution: 'Review entries to ensure they target distinct record sets.',
      autoResolvable: false,
      suggestedAction: 'review',
      riskScore: 40
    };
  }

  return null;
}

function buildCriteriaMap(criteriaItems) {
  const map = {};
  criteriaItems.forEach(item => {
    map[item.field] = {
      operator: item.operator || item.operation || 'equals',
      value: item.value
    };
  });
  return map;
}

function checkSuperset(specificMap, generalMap) {
  // General is superset if all its criteria are in specific
  for (const field in generalMap) {
    if (!(field in specificMap)) {
      return false;
    }

    // Check if operators and values match or are compatible
    const specific = specificMap[field];
    const general = generalMap[field];

    if (specific.operator !== general.operator) {
      return false;
    }

    if (specific.value !== general.value) {
      return false;
    }
  }

  // General has fewer or same criteria than specific
  return Object.keys(generalMap).length <= Object.keys(specificMap).length;
}

function findSharedCriteria(map1, map2) {
  const shared = [];
  for (const field in map1) {
    if (field in map2) {
      shared.push(field);
    }
  }
  return shared;
}

function formatCriteria(criteriaItems) {
  return criteriaItems.map(c => `${c.field} ${c.operator || 'equals'} ${c.value}`).join(' AND ');
}
```

### Examples

**Example 1: Complete Overlap (Critical)**
```
Entry 1 (Order: 3): Industry = Healthcare AND State = CA
Entry 2 (Order: 1): State = CA

Risk: Critical (85)
Issue: Entry 2 will match all records that Entry 1 matches, but Entry 1 is more specific
Fix: Swap orders - Entry 1 should be Order 1, Entry 2 should be Order 3
```

**Example 2: Partial Overlap (Warning)**
```
Entry 1: Industry = Healthcare AND State = CA
Entry 2: Industry = Healthcare AND State = NY

Risk: Warning (40)
Issue: Both share "Industry = Healthcare" but target different states
Fix: Review - likely intentional regional routing
```

### Resolution Strategies

**Strategy 1: Reorder Entries (Auto-Resolvable)**
```javascript
function suggestReordering(entries) {
  // Sort entries by specificity (most specific first)
  const sortedEntries = [...entries].sort((a, b) => {
    const aCount = a.criteriaItems.length;
    const bCount = b.criteriaItems.length;
    return bCount - aCount;  // Descending order
  });

  // Assign new order numbers
  return sortedEntries.map((entry, index) => ({
    ...entry,
    order: index + 1,
    originalOrder: entry.order
  }));
}
```

**Strategy 2: Merge Criteria (Manual)**
- Combine overlapping entries into one
- Use assignee priority logic if different assignees

**Strategy 3: Split Entries (Manual)**
- Make criteria mutually exclusive
- Add additional criteria to differentiate

### Prevention

- **Design Time**: Use specificity ordering (most specific → most general)
- **Validation Time**: Run overlap detector before deployment
- **Runtime**: Monitor unassigned records (may indicate catch-all issues)

---

## Pattern 10: Assignment Rule vs. Flow

### Description

A Flow assigns the OwnerId field AND an assignment rule also fires, potentially causing conflicts or unexpected behavior.

### Risk Level

**High (50-80)**

Risk factors:
- Flow timing (before vs. after assignment rule in order of execution)
- Criteria overlap (Flow and rule match same records)
- Business intent (which should take precedence?)

### Detection Algorithm

```javascript
/**
 * Detect Flow vs. Assignment Rule conflicts
 *
 * @param {Object} assignmentRule - Assignment rule metadata
 * @param {Array<Object>} flows - List of active Flows
 * @returns {Array<Object>} - Array of conflicts
 */
async function detectFlowConflicts(assignmentRule, flows) {
  const conflicts = [];

  for (const flow of flows) {
    // Only check Flows that operate on same object
    if (flow.object !== assignmentRule.objectType) {
      continue;
    }

    // Only check Flows that run on Create or Update
    if (!['Create', 'Update'].includes(flow.triggerType)) {
      continue;
    }

    // Check if Flow assigns OwnerId
    const assignsOwner = await flowAssignsOwner(flow);

    if (assignsOwner) {
      // Check criteria overlap
      const overlapScore = calculateCriteriaOverlap(
        assignmentRule.entries,
        flow.entryCriteria
      );

      if (overlapScore > 0) {
        let riskScore = 50 + (overlapScore * 30);  // 50-80 range

        conflicts.push({
          type: 'flow_vs_assignment_rule',
          severity: riskScore >= 70 ? 'high' : 'medium',
          flow: flow.name,
          assignmentRule: assignmentRule.name,
          object: assignmentRule.objectType,
          overlapScore: overlapScore,
          message: `Flow "${flow.name}" assigns OwnerId on ${flow.object} ${flow.triggerType}, and Assignment Rule "${assignmentRule.name}" also assigns owner. Overlap score: ${(overlapScore * 100).toFixed(0)}%`,
          resolution: 'Choose one approach: Either use Flow OR Assignment Rule for owner assignment. If both needed, sequence properly (Flow runs after Assignment Rule).',
          autoResolvable: false,
          suggestedAction: 'review',
          riskScore: Math.min(riskScore, 80),
          orderOfExecution: [
            '1. Before triggers',
            '2. Assignment Rules ← Runs here',
            '3. After triggers',
            '4. Record-Triggered Flows ← Flow runs here'
          ]
        });
      }
    }
  }

  return conflicts;
}

async function flowAssignsOwner(flow) {
  // Parse Flow metadata for OwnerId assignments
  // Look for <fieldAssignment><field>OwnerId</field> elements
  // This requires Flow metadata retrieval

  // Simplified check
  return flow.assignsFields && flow.assignsFields.includes('OwnerId');
}

function calculateCriteriaOverlap(ruleEntries, flowCriteria) {
  // Compare assignment rule criteria with Flow entry criteria
  // Return 0-1 score representing overlap percentage

  if (!flowCriteria || flowCriteria.length === 0) {
    return 1.0;  // Flow has no criteria - matches all records
  }

  // Build criteria sets
  const ruleCriteriaFields = new Set();
  ruleEntries.forEach(entry => {
    entry.criteriaItems.forEach(c => ruleCriteriaFields.add(c.field));
  });

  const flowCriteriaFields = new Set(
    flowCriteria.map(c => c.field)
  );

  // Calculate Jaccard similarity
  const intersection = [...ruleCriteriaFields].filter(f => flowCriteriaFields.has(f));
  const union = new Set([...ruleCriteriaFields, ...flowCriteriaFields]);

  return intersection.length / union.size;
}
```

### Examples

**Example 1: Flow Overrides Assignment Rule**
```
Assignment Rule: Lead created → Assign to Queue A (based on Industry)
Flow: Lead created → Assign to User X (based on Lead Source)

Issue: Flow runs AFTER assignment rule in order of execution
Result: User X becomes owner (Flow overrides rule)
Risk: High (70)

Fix: Choose one approach or coordinate criteria to be mutually exclusive
```

**Example 2: Assignment Rule Overrides Flow**
```
Flow: Lead created → Update Industry = "Healthcare", Owner = User Y
Assignment Rule: Lead with Industry = "Healthcare" → Assign to Queue A

Issue: Assignment rule runs BEFORE Flow
Result: Owner initially unassigned (rule evaluates before Industry set)
Risk: Medium (55)

Fix: Sequence properly - ensure Flow sets Industry first, then trigger assignment rule
```

### Resolution Strategies

**Strategy 1: Choose One Approach**
- Remove owner assignment from Flow, use Assignment Rule
- OR remove Assignment Rule, use Flow exclusively

**Strategy 2: Mutually Exclusive Criteria**
- Flow handles certain criteria (e.g., Lead Source = Referral)
- Assignment Rule handles other criteria (e.g., Industry-based)

**Strategy 3: Sequence Properly**
- Use Flow to set fields used by Assignment Rule criteria
- Don't assign owner in Flow - let Assignment Rule handle it

### Prevention

- Document automation strategy: Flow OR Assignment Rule (not both)
- Run automation auditor before adding new automation
- Test in sandbox with debug logs enabled

---

## Pattern 11: Assignment Rule vs. Apex Trigger

### Description

An Apex trigger assigns the OwnerId field before or after the assignment rule fires, causing conflicts.

### Risk Level

**High (50-80)**

Risk factors:
- Trigger timing (before vs. after insert)
- Logic overlap (trigger and rule match same records)
- Business requirements (which should take precedence?)

### Detection Algorithm

```javascript
/**
 * Detect Apex Trigger vs. Assignment Rule conflicts
 *
 * @param {Object} assignmentRule - Assignment rule metadata
 * @param {Array<Object>} triggers - List of Apex triggers
 * @returns {Array<Object>} - Array of conflicts
 */
async function detectTriggerConflicts(assignmentRule, triggers) {
  const conflicts = [];

  for (const trigger of triggers) {
    // Only check triggers on same object
    if (trigger.object !== assignmentRule.objectType) {
      continue;
    }

    // Check if trigger assigns OwnerId
    const assignsOwner = await triggerAssignsOwner(trigger);

    if (assignsOwner) {
      let riskScore = 60;

      // Higher risk if BeforeInsert (runs before assignment rule)
      if (trigger.events.includes('BeforeInsert')) {
        riskScore += 10;
      }

      // Higher risk if AfterInsert (runs after assignment rule)
      if (trigger.events.includes('AfterInsert')) {
        riskScore += 10;
      }

      conflicts.push({
        type: 'trigger_vs_assignment_rule',
        severity: 'high',
        trigger: trigger.name,
        assignmentRule: assignmentRule.name,
        object: assignmentRule.objectType,
        triggerEvents: trigger.events,
        message: `Apex Trigger "${trigger.name}" assigns OwnerId on ${trigger.object}, and Assignment Rule "${assignmentRule.name}" also assigns owner.`,
        resolution: 'Remove OwnerId assignment from trigger or disable assignment rule. Both should not assign owner.',
        autoResolvable: false,
        suggestedAction: 'review',
        riskScore: Math.min(riskScore, 80),
        orderOfExecution: [
          '1. Before triggers ← Trigger may run here',
          '2. Assignment Rules ← Rule runs here',
          '3. After triggers ← Trigger may run here'
        ]
      });
    }
  }

  return conflicts;
}

async function triggerAssignsOwner(trigger) {
  // Parse Apex trigger code for OwnerId assignments
  // Look for patterns like: record.OwnerId = ...; or OwnerId =

  // Simplified check
  const code = trigger.body || '';
  return code.includes('OwnerId') && code.includes('=');
}
```

### Examples

**Example 1: BeforeInsert Trigger Assigns Owner**
```apex
trigger LeadTrigger on Lead (before insert) {
    for (Lead lead : Trigger.new) {
        if (lead.Industry == 'Healthcare') {
            lead.OwnerId = '005...';  // Assign to User X
        }
    }
}

Assignment Rule: Lead with Industry = Healthcare → Assign to Queue A

Issue: Trigger runs BEFORE assignment rule
Result: Assignment rule may override trigger assignment
Risk: High (70)

Fix: Remove OwnerId assignment from trigger, let Assignment Rule handle it
```

**Example 2: AfterInsert Trigger Updates Owner**
```apex
trigger LeadTrigger on Lead (after insert) {
    List<Lead> leadsToUpdate = new List<Lead>();
    for (Lead lead : Trigger.new) {
        if (lead.LeadSource == 'Referral') {
            Lead l = new Lead(Id = lead.Id, OwnerId = '005...');
            leadsToUpdate.add(l);
        }
    }
    update leadsToUpdate;
}

Assignment Rule: All leads → Assign based on criteria

Issue: Trigger runs AFTER assignment rule and overrides
Result: Referral leads always assigned to User X, ignoring rule
Risk: High (65)

Fix: Coordinate criteria or remove trigger logic
```

### Resolution Strategies

**Strategy 1: Remove Trigger Logic**
- Move owner assignment logic to Assignment Rule
- Use Assignment Rule criteria instead of Apex logic

**Strategy 2: Disable Assignment Rule**
- Keep Apex trigger for complex logic
- Disable or remove Assignment Rule

**Strategy 3: Coordinate Criteria**
- Trigger handles specific cases (e.g., Referral leads)
- Assignment Rule handles all other cases
- Ensure mutually exclusive

### Prevention

- Audit triggers before creating assignment rules
- Document automation strategy
- Use one approach consistently

---

## Pattern 12: Circular Assignment Routing

### Description

Assignment creates a loop where a record is assigned back to the same entity repeatedly.

### Risk Level

**Critical (80-100)**

This is a critical issue that can cause infinite loops, performance degradation, or assignment failures.

### Detection Algorithm

```javascript
/**
 * Detect circular routing in assignment chain
 *
 * @param {Object} assignmentGraph - Graph of assignment relationships
 * @returns {Array<Object>} - Array of circular paths
 */
function detectCircularRouting(assignmentGraph) {
  const cycles = [];
  const visited = new Set();
  const recursionStack = new Set();

  function dfs(node, path = []) {
    if (recursionStack.has(node)) {
      // Found a cycle
      const cycleStart = path.indexOf(node);
      const cyclePath = path.slice(cycleStart).concat(node);

      cycles.push({
        type: 'circular_routing',
        severity: 'critical',
        path: cyclePath,
        entities: cyclePath.map(id => assignmentGraph.nodes[id]),
        message: `Circular routing detected: ${cyclePath.map(id => assignmentGraph.nodes[id].name).join(' → ')}`,
        resolution: 'Break cycle by removing one assignment or changing queue membership.',
        autoResolvable: true,
        suggestedAction: 'break_cycle',
        riskScore: 95
      });

      return;
    }

    if (visited.has(node)) {
      return;
    }

    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    // Explore neighbors
    const neighbors = assignmentGraph.edges[node] || [];
    for (const neighbor of neighbors) {
      dfs(neighbor, [...path]);
    }

    recursionStack.delete(node);
  }

  // Run DFS from each node
  for (const node in assignmentGraph.nodes) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

/**
 * Build assignment graph from rules, queues, and user forwarding
 *
 * @param {Object} assignmentRule - Assignment rule
 * @param {Array<Object>} queues - Queue configurations
 * @param {Array<Object>} userForwarding - User forwarding rules
 * @returns {Object} - Assignment graph
 */
function buildAssignmentGraph(assignmentRule, queues, userForwarding) {
  const graph = {
    nodes: {},  // id → {id, name, type}
    edges: {}   // id → [neighbor ids]
  };

  // Add assignment rule entries
  assignmentRule.entries.forEach(entry => {
    const assigneeId = entry.assignedTo;

    if (!graph.nodes[assigneeId]) {
      graph.nodes[assigneeId] = {
        id: assigneeId,
        name: entry.assignedToType,
        type: entry.assignedToType
      };
    }

    // If assignee is a queue, add edges to members
    if (entry.assignedToType === 'Queue') {
      const queue = queues.find(q => q.id === assigneeId);
      if (queue) {
        graph.edges[assigneeId] = queue.members || [];

        queue.members.forEach(memberId => {
          if (!graph.nodes[memberId]) {
            graph.nodes[memberId] = {
              id: memberId,
              name: 'User',
              type: 'User'
            };
          }
        });
      }
    }
  });

  // Add user forwarding rules
  userForwarding.forEach(rule => {
    const fromUserId = rule.userId;
    const toEntityId = rule.forwardToId;

    if (!graph.edges[fromUserId]) {
      graph.edges[fromUserId] = [];
    }

    graph.edges[fromUserId].push(toEntityId);

    if (!graph.nodes[toEntityId]) {
      graph.nodes[toEntityId] = {
        id: toEntityId,
        name: rule.forwardToType,
        type: rule.forwardToType
      };
    }
  });

  return graph;
}
```

### Examples

**Example 1: Queue → User → Queue Loop**
```
Lead → Queue A (via Assignment Rule)
Queue A members: User X
User X has auto-forward to Queue A

Issue: Infinite loop
Risk: Critical (95)

Fix: Remove auto-forward from User X
```

**Example 2: User → Queue → User Loop**
```
Lead → User Y (via Assignment Rule)
User Y has auto-forward to Queue B
Queue B members: User Y

Issue: Circular routing
Risk: Critical (90)

Fix: Remove User Y from Queue B membership
```

### Resolution Strategies

**Strategy 1: Remove Auto-Forward (Auto-Resolvable)**
```javascript
function suggestRemoveForwarding(cycle) {
  // Identify user nodes with auto-forward in cycle
  const userNodes = cycle.path.filter(id => graph.nodes[id].type === 'User');

  return {
    action: 'remove_forwarding',
    targets: userNodes.map(id => ({
      userId: id,
      userName: graph.nodes[id].name,
      instruction: 'Disable auto-forward in user settings'
    }))
  };
}
```

**Strategy 2: Change Queue Membership (Auto-Resolvable)**
```javascript
function suggestChangeQueueMembership(cycle) {
  // Identify queue nodes in cycle
  const queueNodes = cycle.path.filter(id => graph.nodes[id].type === 'Queue');

  // Find users that create cycle
  const problematicUsers = cycle.path.filter(id => {
    const edges = graph.edges[id] || [];
    return edges.some(e => cycle.path.includes(e));
  });

  return {
    action: 'remove_queue_member',
    targets: queueNodes.map(queueId => ({
      queueId: queueId,
      queueName: graph.nodes[queueId].name,
      usersToRemove: problematicUsers,
      instruction: `Remove users ${problematicUsers.map(id => graph.nodes[id].name).join(', ')} from queue`
    }))
  };
}
```

### Prevention

- Audit queue memberships before deployment
- Disable user auto-forwarding for queue members
- Use dependency analyzer to map assignment chains

---

## Pattern 13: Territory Rule vs. Assignment Rule

### Description

Territory assignment rule (for Accounts) conflicts with owner assignment rule (for Leads/Cases).

### Risk Level

**Medium (30-50)**

Lower risk because these typically operate on different objects (Territory for Account, Assignment Rule for Lead/Case).

### Detection Algorithm

```javascript
/**
 * Detect Territory vs. Assignment Rule conflicts
 *
 * @param {Object} assignmentRule - Assignment rule (Lead/Case)
 * @param {Object} territoryRules - Territory2 rules (Account)
 * @returns {Array<Object>} - Array of conflicts
 */
function detectTerritoryConflicts(assignmentRule, territoryRules) {
  const conflicts = [];

  // Check if both are active
  if (!assignmentRule.active || !territoryRules.active) {
    return conflicts;
  }

  // Territory rules operate on Account, Assignment rules on Lead/Case
  // Conflict only if there's cross-object logic (e.g., Lead.Account lookup)

  if (assignmentRule.objectType === 'Lead' || assignmentRule.objectType === 'Case') {
    // Check if assignment rule criteria references Account fields
    const referencesAccount = assignmentRule.entries.some(entry =>
      entry.criteriaItems.some(c => c.field.startsWith('Account.'))
    );

    if (referencesAccount) {
      conflicts.push({
        type: 'territory_vs_assignment',
        severity: 'warning',
        assignmentRule: assignmentRule.name,
        territoryRule: territoryRules.name,
        object: assignmentRule.objectType,
        message: `Assignment Rule "${assignmentRule.name}" references Account fields, and Territory Rule "${territoryRules.name}" also assigns Account ownership. May cause confusion.`,
        resolution: 'Clarify: Territory for Account ownership, Assignment Rule for Lead/Case ownership. Ensure criteria don\'t conflict.',
        autoResolvable: false,
        suggestedAction: 'review',
        riskScore: 40
      });
    }
  }

  return conflicts;
}
```

### Examples

**Example 1: Lead Assignment References Account Territory**
```
Assignment Rule (Lead): Lead.Account.Territory = "West" → Assign to West Team
Territory Rule (Account): Account.BillingState = "CA" → Assign to CA Territory

Issue: Lead assignment depends on Account territory, which may change
Risk: Medium (45)

Fix: Clarify that Territory manages Account, Assignment Rule manages Lead independently
```

### Resolution Strategies

**Strategy 1: Separate Concerns**
- Territory Management for Accounts
- Assignment Rules for Leads/Cases
- Avoid cross-object dependencies

**Strategy 2: Document Relationship**
- If dependencies exist, document clearly
- Ensure territory changes don't break lead assignment

### Prevention

- Use Territory Management for Account assignment
- Use Assignment Rules for Lead/Case assignment
- Minimize cross-object criteria

---

## Pattern 14: Queue Membership Access

### Description

A user in an assigned queue doesn't have Edit access to the object, preventing them from working on assigned records.

### Risk Level

**High (60-80)**

This causes operational issues where records are assigned but not accessible.

### Detection Algorithm

```javascript
/**
 * Detect queue membership access issues
 *
 * @param {Object} assignmentRule - Assignment rule
 * @param {Array<Object>} queues - Queue configurations
 * @param {Array<Object>} userPermissions - User permissions
 * @returns {Array<Object>} - Array of access issues
 */
async function detectQueueAccessIssues(assignmentRule, queues, userPermissions) {
  const issues = [];

  for (const entry of assignmentRule.entries) {
    if (entry.assignedToType !== 'Queue') {
      continue;
    }

    const queueId = entry.assignedTo;
    const queue = queues.find(q => q.id === queueId);

    if (!queue) {
      issues.push({
        type: 'queue_not_found',
        severity: 'critical',
        queueId: queueId,
        entry: entry.order,
        message: `Queue ${queueId} referenced in Entry ${entry.order} not found`,
        resolution: 'Create queue or update entry to use existing queue',
        autoResolvable: false,
        suggestedAction: 'fix_reference',
        riskScore: 90
      });
      continue;
    }

    // Check each queue member's access
    for (const memberId of queue.members) {
      const userPerm = userPermissions.find(p => p.userId === memberId);

      if (!userPerm) {
        continue;
      }

      const hasEditAccess = checkObjectAccess(
        userPerm,
        assignmentRule.objectType,
        'Edit'
      );

      if (!hasEditAccess) {
        issues.push({
          type: 'queue_member_no_access',
          severity: 'high',
          userId: memberId,
          userName: userPerm.name,
          queueId: queueId,
          queueName: queue.name,
          object: assignmentRule.objectType,
          entry: entry.order,
          message: `Queue member ${userPerm.name} in "${queue.name}" does not have Edit access to ${assignmentRule.objectType}`,
          resolution: `Grant Edit access to ${assignmentRule.objectType} via permission set or profile`,
          autoResolvable: true,
          suggestedAction: 'grant_access',
          riskScore: 70
        });
      }
    }
  }

  return issues;
}

function checkObjectAccess(userPermission, objectApiName, accessLevel) {
  // Check if user has required access level (None, Read, Edit, All)
  const objectPerms = userPermission.objectPermissions[objectApiName];

  if (!objectPerms) {
    return false;
  }

  switch (accessLevel) {
    case 'Edit':
      return objectPerms.allowEdit || objectPerms.modifyAllRecords;
    case 'Read':
      return objectPerms.allowRead || objectPerms.viewAllRecords || checkObjectAccess(userPermission, objectApiName, 'Edit');
    default:
      return false;
  }
}
```

### Examples

**Example 1: Queue Member Can't Edit Leads**
```
Assignment Rule: Lead → Support Queue
Queue Member: User Z
User Z Access: Read-only on Lead

Issue: User Z can see leads but can't work on them
Risk: High (70)

Fix: Grant User Z Edit access to Lead via permission set
```

### Resolution Strategies

**Strategy 1: Grant Access (Auto-Resolvable)**
```bash
# Create permission set
sf project generate manifest --metadata PermissionSet --name Support_Lead_Edit

# Add Lead Edit permission
# Deploy permission set
sf project deploy start --metadata-dir force-app

# Assign to user
sf data create record --sobject PermissionSetAssignment --values "PermissionSetId=0PS... AssigneeId=005..."
```

**Strategy 2: Change Queue Membership**
- Remove users without access
- Add users with proper permissions

### Prevention

- Validate queue member access before deployment
- Use assignee-access-validator.js script
- Document access requirements

---

## Pattern 15: Record Type Assignment Mismatch

### Description

Assignment rule doesn't account for record types, causing records to be assigned to teams not specialized for that record type.

### Risk Level

**Medium (30-50)**

May cause operational confusion but doesn't break functionality.

### Detection Algorithm

```javascript
/**
 * Detect record type handling issues
 *
 * @param {Object} assignmentRule - Assignment rule
 * @param {Object} objectDescribe - Object metadata with record types
 * @returns {Array<Object>} - Array of record type issues
 */
function detectRecordTypeIssues(assignmentRule, objectDescribe) {
  const issues = [];

  // Check if object has multiple record types
  const recordTypes = objectDescribe.recordTypeInfos.filter(rt => rt.available);

  if (recordTypes.length <= 1) {
    return issues;  // No issue if only one record type
  }

  // Check if any entry includes RecordTypeId in criteria
  const criteriaIncludesRecordType = assignmentRule.entries.some(entry =>
    entry.criteriaItems.some(c => c.field === 'RecordTypeId')
  );

  if (!criteriaIncludesRecordType) {
    issues.push({
      type: 'record_type_mismatch',
      severity: 'warning',
      object: assignmentRule.objectType,
      recordTypeCount: recordTypes.length,
      recordTypes: recordTypes.map(rt => rt.name),
      message: `Object ${assignmentRule.objectType} has ${recordTypes.length} record types, but assignment rule does not filter by RecordTypeId. All record types will use same assignment logic.`,
      resolution: 'Add RecordTypeId to criteria to differentiate assignment by record type, or create separate rules per record type.',
      autoResolvable: true,
      suggestedAction: 'add_record_type_criteria',
      riskScore: 40
    });
  }

  return issues;
}
```

### Examples

**Example 1: Partner vs. Direct Leads**
```
Object: Lead
Record Types: Partner Lead, Direct Lead
Assignment Rule: All leads → Direct Sales Team (no RecordTypeId criteria)

Issue: Partner leads assigned to direct sales team
Risk: Medium (45)

Fix: Add RecordTypeId criteria to differentiate
```

### Resolution Strategies

**Strategy 1: Add RecordTypeId Criteria (Auto-Resolvable)**
```javascript
function addRecordTypeCriteria(assignmentRule, recordTypes) {
  const newEntries = [];

  recordTypes.forEach(recordType => {
    assignmentRule.entries.forEach(entry => {
      newEntries.push({
        ...entry,
        order: newEntries.length + 1,
        criteriaItems: [
          ...entry.criteriaItems,
          {
            field: 'RecordTypeId',
            operator: 'equals',
            value: recordType.recordTypeId
          }
        ]
      });
    });
  });

  return {
    ...assignmentRule,
    entries: newEntries
  };
}
```

**Strategy 2: Separate Rules per Record Type**
- Create Rule A for Partner Leads
- Create Rule B for Direct Leads
- Only one can be active at a time

### Prevention

- Check for record types during design phase
- Include RecordTypeId in criteria if multiple types exist
- Document record type handling strategy

---

## Pattern 16: Field Dependency in Criteria

### Description

Assignment criteria references a field that doesn't exist on the object, causing deployment failures.

### Risk Level

**Critical (80-100)**

Deployment will fail with this issue.

### Detection Algorithm

```javascript
/**
 * Detect field existence issues in criteria
 *
 * @param {Object} assignmentRule - Assignment rule
 * @param {Object} objectDescribe - Object metadata with fields
 * @returns {Array<Object>} - Array of field issues
 */
function detectFieldDependencyIssues(assignmentRule, objectDescribe) {
  const issues = [];

  // Build field map
  const fieldMap = {};
  objectDescribe.fields.forEach(field => {
    fieldMap[field.name] = field;
  });

  // Check each criteria field
  assignmentRule.entries.forEach((entry, entryIndex) => {
    entry.criteriaItems.forEach((criteria, criteriaIndex) => {
      const fieldName = criteria.field;

      // Check if field exists
      if (!(fieldName in fieldMap)) {
        issues.push({
          type: 'missing_field',
          severity: 'critical',
          field: fieldName,
          entry: entry.order,
          criteriaIndex: criteriaIndex,
          object: assignmentRule.objectType,
          message: `Field '${fieldName}' in Entry ${entry.order} does not exist on ${assignmentRule.objectType}`,
          resolution: `Update criteria to use existing field, or create field '${fieldName}' before deployment`,
          autoResolvable: true,
          suggestedAction: 'fix_field_reference',
          riskScore: 90
        });
      } else {
        // Field exists - validate operator compatibility
        const fieldDef = fieldMap[fieldName];
        const operatorCompatibility = validateOperatorCompatibility(
          fieldDef.type,
          criteria.operator || criteria.operation || 'equals'
        );

        if (!operatorCompatibility.valid) {
          issues.push({
            type: 'operator_incompatible',
            severity: 'critical',
            field: fieldName,
            fieldType: fieldDef.type,
            operator: criteria.operator,
            entry: entry.order,
            criteriaIndex: criteriaIndex,
            message: `Operator '${criteria.operator}' not compatible with field type '${fieldDef.type}' for field '${fieldName}' in Entry ${entry.order}`,
            resolution: `Use compatible operator: ${operatorCompatibility.supportedOperators.join(', ')}`,
            autoResolvable: true,
            suggestedAction: 'fix_operator',
            supportedOperators: operatorCompatibility.supportedOperators,
            riskScore: 85
          });
        }
      }
    });
  });

  return issues;
}

function validateOperatorCompatibility(fieldType, operator) {
  const OPERATOR_COMPATIBILITY = {
    'string': ['equals', 'notEqual', 'lessThan', 'greaterThan', 'lessOrEqual', 'greaterOrEqual', 'contains', 'notContain', 'startsWith'],
    'picklist': ['equals', 'notEqual'],
    'multipicklist': ['equals', 'notEqual', 'includes'],
    'number': ['equals', 'notEqual', 'lessThan', 'greaterThan', 'lessOrEqual', 'greaterOrEqual'],
    'currency': ['equals', 'notEqual', 'lessThan', 'greaterThan', 'lessOrEqual', 'greaterOrEqual'],
    'percent': ['equals', 'notEqual', 'lessThan', 'greaterThan', 'lessOrEqual', 'greaterOrEqual'],
    'date': ['equals', 'notEqual', 'lessThan', 'greaterThan', 'lessOrEqual', 'greaterOrEqual'],
    'datetime': ['equals', 'notEqual', 'lessThan', 'greaterThan', 'lessOrEqual', 'greaterOrEqual'],
    'boolean': ['equals', 'notEqual'],
    'textarea': ['equals', 'notEqual', 'contains', 'notContain'],
    'email': ['equals', 'notEqual', 'contains', 'notContain'],
    'phone': ['equals', 'notEqual', 'contains', 'notContain'],
    'url': ['equals', 'notEqual', 'contains', 'notContain'],
    'reference': ['equals', 'notEqual']
  };

  const supportedOperators = OPERATOR_COMPATIBILITY[fieldType.toLowerCase()] || [];

  return {
    valid: supportedOperators.includes(operator),
    supportedOperators: supportedOperators
  };
}
```

### Examples

**Example 1: Deleted Custom Field**
```
Assignment Rule Entry: Custom_Field__c = "Value"
Issue: Custom_Field__c was deleted

Risk: Critical (90)
Fix: Update criteria to use existing field or recreate field
```

**Example 2: Incorrect Field Name**
```
Assignment Rule Entry: Industr = "Healthcare"  (typo)
Correct Field Name: Industry

Risk: Critical (95)
Fix: Correct field name to "Industry"
```

### Resolution Strategies

**Strategy 1: Fix Field Reference (Auto-Resolvable)**
```javascript
function suggestFieldFix(issue, objectDescribe) {
  const fieldName = issue.field;

  // Find similar field names (typo detection)
  const similarFields = objectDescribe.fields
    .filter(f => levenshteinDistance(f.name, fieldName) <= 2)
    .map(f => f.name);

  if (similarFields.length > 0) {
    return {
      action: 'fix_field_name',
      originalField: fieldName,
      suggestedFields: similarFields,
      instruction: `Did you mean one of these fields? ${similarFields.join(', ')}`
    };
  }

  return {
    action: 'create_field',
    fieldName: fieldName,
    instruction: `Create field '${fieldName}' before deployment, or remove from criteria`
  };
}

function levenshteinDistance(str1, str2) {
  // Compute edit distance between two strings
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }

  return matrix[str2.length][str1.length];
}
```

**Strategy 2: Create Missing Field**
- Create field with correct API name and type
- Deploy field before deploying assignment rule

### Prevention

- Validate field existence before deployment
- Use pre-deployment validator
- Check object describe before designing rules

---

## Risk Scoring Summary

### Risk Score Calculation

**Base Score Components**:
- Conflict type severity (30-50 points)
- Potential impact radius (10-20 points)
- Auto-resolvability (-10 points if auto-resolvable)
- Order/proximity factors (5-15 points)

**Final Score** = Sum of components, capped at 100

### Risk Levels

| Score Range | Level | Action Required |
|-------------|-------|-----------------|
| 0-29 | LOW | Monitor, fix when convenient |
| 30-59 | MEDIUM | Review, fix before production |
| 60-79 | HIGH | Fix before deployment |
| 80-100 | CRITICAL | Must fix immediately |

### Auto-Resolvability

| Pattern | Auto-Resolvable | Automation |
|---------|-----------------|------------|
| 9 - Overlapping Criteria | ✅ Yes | Reorder entries |
| 10 - Flow Conflict | ⚠️ Partial | Suggest removal |
| 11 - Trigger Conflict | ❌ No | Manual review |
| 12 - Circular Routing | ✅ Yes | Break cycle |
| 13 - Territory Conflict | ❌ No | Manual review |
| 14 - Queue Access | ✅ Yes | Grant permissions |
| 15 - Record Type Mismatch | ✅ Yes | Add criteria |
| 16 - Field Dependency | ✅ Yes | Fix reference |

---

## Integration with Automation Auditor

These 8 patterns (9-16) extend the base automation conflict patterns (1-8) in the automation-audit-framework. When running a comprehensive automation audit, both pattern sets are evaluated:

**Base Patterns (1-8)**: General automation conflicts
**Assignment Rules Patterns (9-16)**: Assignment Rule-specific conflicts

### Usage in sfdc-automation-auditor

```javascript
// Import both pattern sets
const basePatterns = require('./automation-conflict-detector');
const assignmentPatterns = require('./assignment-rule-overlap-detector');

async function comprehensiveAudit(orgAlias) {
  // Run base audit
  const baseConflicts = await basePatterns.detectConflicts(orgAlias);

  // Run assignment rule audit
  const assignmentConflicts = await assignmentPatterns.detectAllConflicts(orgAlias);

  // Combine results
  return {
    totalConflicts: baseConflicts.length + assignmentConflicts.length,
    baseConflicts: baseConflicts,
    assignmentConflicts: assignmentConflicts,
    riskScore: calculateOverallRiskScore([...baseConflicts, ...assignmentConflicts])
  };
}
```

---

## Conclusion

These 8 conflict patterns provide comprehensive detection and resolution strategies for Assignment Rule-specific issues. By integrating with the automation audit framework and using the provided detection algorithms, you can identify and resolve conflicts before deployment, ensuring robust and reliable assignment automation.

**Key Takeaways**:
- Run conflict detection during design phase (Phase 3)
- Prioritize critical conflicts (score ≥80) for immediate resolution
- Use auto-resolution for supported patterns (6 out of 8)
- Document known exceptions and workarounds
- Re-run detection after changes to verify fixes

**Tools**:
- `assignment-rule-overlap-detector.js` - Implements all 8 patterns
- `sfdc-automation-auditor` - Integrates with comprehensive audit
- Pre-deployment validator - Catches conflicts before deployment

---

**Version**: 1.0.0
**Last Updated**: 2025-12-15
**Maintained By**: RevPal Engineering
