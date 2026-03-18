# Automation Conflict Detection Patterns

## Conflict Types

### 1. Field Update Conflicts

**Pattern**: Multiple automations updating the same field

```javascript
const detectFieldConflicts = (automations) => {
  const fieldUpdates = {};

  automations.forEach(auto => {
    auto.actions?.forEach(action => {
      if (action.type === 'FIELD_UPDATE') {
        const key = `${auto.object}.${action.field}`;
        if (!fieldUpdates[key]) {
          fieldUpdates[key] = [];
        }
        fieldUpdates[key].push({
          automation: auto.name,
          type: auto.type,
          value: action.value
        });
      }
    });
  });

  // Return fields with multiple updaters
  return Object.entries(fieldUpdates)
    .filter(([_, updaters]) => updaters.length > 1)
    .map(([field, updaters]) => ({
      field,
      conflictCount: updaters.length,
      updaters,
      severity: updaters.length > 2 ? 'HIGH' : 'MEDIUM'
    }));
};
```

### 2. Execution Order Conflicts

**Pattern**: Order-dependent automation producing inconsistent results

| Execution Order | Priority |
|-----------------|----------|
| Validation Rules | 1 (first) |
| Before Triggers | 2 |
| System validations | 3 |
| After Triggers | 4 |
| Assignment Rules | 5 |
| Auto-response Rules | 6 |
| Workflow Rules | 7 |
| Escalation Rules | 8 |
| Entitlement Rules | 9 |
| Record-triggered Flows | 10 |
| Platform Event Triggers | 11 |
| Rollup Summaries | 12 (last) |

### 3. Circular Dependencies

**Pattern**: Automation A triggers Automation B, which triggers Automation A

```javascript
const detectCircularDependencies = (automations) => {
  const graph = buildDependencyGraph(automations);
  const cycles = [];

  const visited = new Set();
  const recursionStack = new Set();

  const dfs = (node, path = []) => {
    visited.add(node);
    recursionStack.add(node);

    const neighbors = graph[node] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path, node]);
      } else if (recursionStack.has(neighbor)) {
        // Found cycle
        const cycleStart = path.indexOf(neighbor);
        cycles.push({
          cycle: [...path.slice(cycleStart), node, neighbor],
          severity: 'CRITICAL'
        });
      }
    }

    recursionStack.delete(node);
  };

  Object.keys(graph).forEach(node => {
    if (!visited.has(node)) {
      dfs(node);
    }
  });

  return cycles;
};
```

### 4. Recursion Conflicts

**Pattern**: Same-object triggers without recursion guards

```javascript
const detectRecursionRisk = (triggers) => {
  return triggers
    .filter(t => t.object && !t.hasRecursionGuard)
    .filter(t => {
      // Check if trigger updates its own object
      return t.actions?.some(a =>
        a.type === 'DML' &&
        (a.operation === 'UPDATE' || a.operation === 'INSERT') &&
        a.object === t.object
      );
    })
    .map(t => ({
      trigger: t.name,
      object: t.object,
      risk: 'HIGH',
      fix: 'Add static recursion guard variable'
    }));
};
```

### 5. Overlapping Assignment Criteria (v3.62.0)

**Pattern**: Multiple assignment rule entries match the same record

**Risk**: Critical (60-100) - First match wins, but overlapping criteria indicate design flaw

```javascript
const detectOverlappingAssignmentCriteria = (assignmentRules, object) => {
  const rulesForObject = assignmentRules.filter(r =>
    r.object === object && r.active
  );

  const conflicts = [];

  rulesForObject.forEach(rule => {
    const entries = rule.entries || [];

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const overlap = checkCriteriaOverlap(entries[i].criteria, entries[j].criteria);

        if (overlap.overlaps) {
          conflicts.push({
            type: 'OVERLAPPING_ASSIGNMENT_CRITERIA',
            severity: 'CRITICAL',
            rule: rule.name,
            entry1: entries[i].order,
            entry2: entries[j].order,
            overlappingFields: overlap.fields,
            evidence: `Entry ${entries[i].order} and ${entries[j].order} both match ${overlap.commonPattern}`,
            impact: 'Assignment depends on rule order. Entry with lower orderNumber will always execute.',
            recommendation: 'Reorder entries: Place more specific criteria before general criteria',
            resolution: entries[i].order < entries[j].order
              ? `Entry ${entries[i].order} will always execute first (correct order)`
              : `⚠️ Reorder: Entry ${entries[j].order} should come before ${entries[i].order}`
          });
        }
      }
    }
  });

  return conflicts;
};

// Helper function to check criteria overlap
const checkCriteriaOverlap = (criteria1, criteria2) => {
  const fields1 = criteria1.map(c => c.field);
  const fields2 = criteria2.map(c => c.field);

  const commonFields = fields1.filter(f => fields2.includes(f));

  if (commonFields.length === 0) return { overlaps: false };

  // Check if all common fields have same values
  const matching = commonFields.every(field => {
    const c1 = criteria1.find(c => c.field === field);
    const c2 = criteria2.find(c => c.field === field);
    return c1.operator === c2.operator && c1.value === c2.value;
  });

  return {
    overlaps: matching,
    fields: commonFields,
    commonPattern: commonFields.map(f => `${f} = ${criteria1.find(c => c.field === f).value}`).join(' AND ')
  };
};
```

**Resolution**: Reorder entries (most specific first) or merge criteria

**Example**:
- Entry 1: `Industry = Healthcare AND State = CA` → Team X
- Entry 2: `State = CA` → Team Y
- **Fix**: Entry 1 must have lower orderNumber than Entry 2

---

### 6. Assignment Rule vs. Flow (v3.62.0)

**Pattern**: Flow assigns owner AND assignment rule also fires

**Risk**: High (50-80) - Assignment rule runs after Flow, overriding Flow's assignment

```javascript
const detectAssignmentRuleVsFlow = (assignmentRules, flows, object) => {
  const assignmentRulesForObject = assignmentRules.filter(r =>
    r.object === object && r.active
  );

  const flowsAssigningOwner = flows.filter(f =>
    f.object === object &&
    f.status === 'Active' &&
    f.recordTriggerType &&
    f.actions?.some(a => a.field === 'OwnerId')
  );

  if (assignmentRulesForObject.length > 0 && flowsAssigningOwner.length > 0) {
    return {
      type: 'ASSIGNMENT_RULE_VS_FLOW',
      severity: 'HIGH',
      object: object,
      assignmentRules: assignmentRulesForObject.map(r => r.name),
      flows: flowsAssigningOwner.map(f => f.name),
      evidence: `Assignment rule(s) AND ${flowsAssigningOwner.length} flow(s) assign owner on ${object}`,
      impact: 'Assignment rule runs after Flow (order of execution). Flow assignment may be overridden.',
      executionOrder: [
        '1. Flow (before/after save)',
        '2. Assignment Rule',
        '3. Auto-response Rule',
        '4. Workflow Rule'
      ],
      recommendation: 'Choose one approach (Flow OR Assignment Rule) or remove OwnerId assignment from Flow',
      resolution: [
        'Option 1: Deactivate Assignment Rule, keep Flow assignment',
        'Option 2: Remove OwnerId field update from Flow, keep Assignment Rule',
        'Option 3: Add condition to Flow: Only assign if Assignment Rule won\'t fire'
      ]
    };
  }

  return null;
};
```

**Resolution**: Choose one approach (Flow OR Assignment Rule) or sequence properly

**Example**: Flow sets owner on Lead → Assignment rule also runs → overrides Flow

---

### 7. Assignment Rule vs. Apex Trigger (v3.62.0)

**Pattern**: Apex trigger assigns owner before/after assignment rule

**Risk**: High (50-80) - Depends on trigger timing

```javascript
const detectAssignmentRuleVsTrigger = (assignmentRules, triggers, object) => {
  const assignmentRulesForObject = assignmentRules.filter(r =>
    r.object === object && r.active
  );

  const triggersAssigningOwner = triggers.filter(t =>
    t.object === object &&
    t.isActive &&
    t.code?.includes('OwnerId')  // Simple check, improve with AST parsing
  );

  if (assignmentRulesForObject.length > 0 && triggersAssigningOwner.length > 0) {
    return {
      type: 'ASSIGNMENT_RULE_VS_TRIGGER',
      severity: 'HIGH',
      object: object,
      assignmentRules: assignmentRulesForObject.map(r => r.name),
      triggers: triggersAssigningOwner.map(t => ({
        name: t.name,
        timing: t.usageBeforeInsert ? 'Before Insert' :
                t.usageAfterInsert ? 'After Insert' :
                t.usageBeforeUpdate ? 'Before Update' : 'After Update'
      })),
      evidence: `Assignment rule(s) AND ${triggersAssigningOwner.length} trigger(s) assign owner on ${object}`,
      impact: 'Depends on trigger timing. BeforeInsert → Assignment Rule → AfterInsert. May override each other.',
      executionOrder: [
        '1. Before Triggers',
        '2. System Validations',
        '3. After Triggers',
        '4. Assignment Rules',
        '5. Auto-response Rules'
      ],
      recommendation: 'Remove owner assignment logic from trigger OR disable Assignment Rule',
      resolution: [
        'Option 1: Remove OwnerId assignment from trigger, use Assignment Rule',
        'Option 2: Deactivate Assignment Rule, keep trigger logic',
        'Option 3: Coordinate: Trigger sets flag, Assignment Rule checks flag'
      ]
    };
  }

  return null;
};
```

**Resolution**: Remove trigger logic or disable assignment rule

**Example**: Trigger sets owner in BeforeInsert → Assignment rule runs after → may override

---

### 8. Circular Assignment Routing (v3.62.0)

**Pattern**: Assignment creates loop (User → Queue → Flow → User)

**Risk**: Critical (80-100) - Can cause infinite assignment changes

```javascript
const detectCircularAssignmentRouting = (assignmentRules, flows, queues, users) => {
  // Build assignment graph
  const graph = {};

  // Add Assignment Rule edges
  assignmentRules.forEach(rule => {
    if (!rule.active) return;

    rule.entries?.forEach(entry => {
      const assignTo = entry.assignTo;
      const assignToType = entry.assignToType;

      if (!graph[rule.object]) graph[rule.object] = [];

      graph[rule.object].push({
        type: 'AssignmentRule',
        name: rule.name,
        assignTo: assignTo,
        assignToType: assignToType
      });
    });
  });

  // Add Queue membership edges
  queues.forEach(queue => {
    queue.members?.forEach(member => {
      const key = `Queue:${queue.id}`;
      if (!graph[key]) graph[key] = [];
      graph[key].push({
        type: 'QueueMember',
        assignTo: `User:${member.userId}`,
        assignToType: 'User'
      });
    });
  });

  // Add Flow auto-forward edges (if Flow reassigns owner)
  flows.forEach(flow => {
    if (!flow.active) return;

    flow.actions?.filter(a => a.field === 'OwnerId').forEach(action => {
      const key = `User:${flow.triggeredByUser}`;
      if (!graph[key]) graph[key] = [];
      graph[key].push({
        type: 'Flow',
        name: flow.name,
        assignTo: action.value,
        assignToType: 'User'
      });
    });
  });

  // Detect cycles using DFS
  const cycles = detectCyclesInGraph(graph);

  return cycles.map(cycle => ({
    type: 'CIRCULAR_ASSIGNMENT_ROUTING',
    severity: 'CRITICAL',
    cycle: cycle.path,
    evidence: `Assignment loop detected: ${cycle.path.join(' → ')}`,
    impact: 'Record owner will repeatedly change, potentially causing infinite updates and governor limit errors',
    recommendation: 'Break cycle by changing one assignment target or adding conditional logic',
    resolution: `Review: ${cycle.breakPoints.map(bp => `Remove ${bp.type} at ${bp.location}`).join(' OR ')}`
  }));
};
```

**Resolution**: Break cycle by changing one assignment target

**Example**: Lead → Queue A → Flow assigns to User X → User X has auto-forward to Queue A

---

### 9. Territory Rule vs. Assignment Rule (v3.62.0)

**Pattern**: Territory assignment conflicts with owner assignment

**Risk**: Medium (30-50) - Different purposes but can cause confusion

```javascript
const detectTerritoryVsAssignmentRule = (territoryModels, assignmentRules) => {
  const conflicts = [];

  // Check if Territory rules are active
  const activeTerritoryModels = territoryModels.filter(tm => tm.isActive);

  if (activeTerritoryModels.length === 0) return conflicts;

  // Territory rules only apply to Accounts (standard behavior)
  const accountAssignmentRules = assignmentRules.filter(r =>
    r.object === 'Account' && r.active
  );

  if (accountAssignmentRules.length > 0) {
    conflicts.push({
      type: 'TERRITORY_VS_ASSIGNMENT_RULE',
      severity: 'MEDIUM',
      object: 'Account',
      territoryModels: activeTerritoryModels.map(tm => tm.name),
      assignmentRules: accountAssignmentRules.map(r => r.name),
      evidence: `${activeTerritoryModels.length} Territory model(s) AND ${accountAssignmentRules.length} Assignment Rule(s) active`,
      impact: 'Territory rules assign Accounts to territories. Assignment Rules assign owner. May cause confusion about account ownership.',
      recommendation: 'Clarify purpose: Territory for territory assignment, Assignment Rule for owner assignment',
      resolution: [
        'Option 1: Use Territory rules for Account assignment (standard pattern)',
        'Option 2: Use Assignment Rules for owner assignment (less common for Accounts)',
        'Option 3: Coordinate: Territory assignment for segmentation, Assignment Rule for owner'
      ],
      note: 'This is often acceptable if purposes are clear: Territory for segmentation, Assignment Rule for owner'
    });
  }

  return conflicts;
};
```

**Resolution**: Clarify purpose - Territory for Account, Assignment for Lead/Case

**Example**: Account Assignment Rule (custom) conflicts with Territory2 rule

---

### 10. Queue Membership Access (v3.62.0)

**Pattern**: User in queue doesn't have access to object

**Risk**: High (60-80) - Assignment succeeds but user can't view record

```javascript
const detectQueueMembershipAccess = async (assignmentRules, queues, profiles, permissionSets, orgAlias) => {
  const conflicts = [];

  for (const rule of assignmentRules.filter(r => r.active)) {
    for (const entry of rule.entries || []) {
      if (entry.assignToType !== 'Queue') continue;

      const queue = queues.find(q => q.id === entry.assignTo);
      if (!queue) continue;

      // Get queue members
      const members = await getQueueMembers(entry.assignTo, orgAlias);

      // Check each member's access to the object
      for (const member of members) {
        const hasAccess = await checkUserObjectAccess(
          member.userId,
          rule.object,
          'Edit',  // Required for ownership
          profiles,
          permissionSets,
          orgAlias
        );

        if (!hasAccess.hasEdit) {
          conflicts.push({
            type: 'QUEUE_MEMBERSHIP_ACCESS',
            severity: 'HIGH',
            rule: rule.name,
            queue: queue.name,
            user: member.userName,
            userId: member.userId,
            object: rule.object,
            evidence: `User ${member.userName} in queue ${queue.name} has no Edit access to ${rule.object}`,
            impact: 'Record will be assigned to queue, but user cannot accept ownership or edit record',
            recommendation: 'Grant Edit access to object via Permission Set or Profile',
            resolution: [
              `Option 1: Add ${rule.object} Edit permission to ${member.profileName}`,
              `Option 2: Create Permission Set with ${rule.object} Edit and assign to ${member.userName}`,
              `Option 3: Remove ${member.userName} from ${queue.name} queue`
            ],
            accessDetails: hasAccess
          });
        }
      }
    }
  }

  return conflicts;
};
```

**Resolution**: Grant queue members object access via permission set

**Example**: Lead assigned to Support Queue → User in queue has no Lead Edit permission

---

### 11. Record Type Assignment Mismatch (v3.62.0)

**Pattern**: Assignment rule doesn't account for record types

**Risk**: Medium (30-50) - Wrong team receives wrong record type

```javascript
const detectRecordTypeAssignmentMismatch = (assignmentRules, recordTypes) => {
  const conflicts = [];

  assignmentRules.forEach(rule => {
    if (!rule.active) return;

    const objectRecordTypes = recordTypes.filter(rt => rt.sobjectType === rule.object);

    if (objectRecordTypes.length === 0) return;  // No record types, no issue

    // Check if rule criteria include RecordTypeId
    const entries = rule.entries || [];
    const hasRecordTypeCriteria = entries.some(entry =>
      entry.criteria?.some(c => c.field === 'RecordTypeId' || c.field === 'RecordType.DeveloperName')
    );

    if (!hasRecordTypeCriteria) {
      conflicts.push({
        type: 'RECORD_TYPE_ASSIGNMENT_MISMATCH',
        severity: 'MEDIUM',
        rule: rule.name,
        object: rule.object,
        recordTypes: objectRecordTypes.map(rt => rt.developerName),
        evidence: `${rule.object} has ${objectRecordTypes.length} record types but Assignment Rule has no RecordTypeId criteria`,
        impact: 'All record types routed identically. Partner records may go to Direct Sales team, or vice versa.',
        recommendation: 'Add RecordTypeId to criteria OR create separate rules per record type',
        resolution: [
          'Option 1: Add RecordTypeId criteria to each entry',
          'Option 2: Create separate Assignment Rules per record type',
          'Option 3: Add RecordType.DeveloperName criteria (more readable)'
        ],
        example: `Entry 1: RecordType.DeveloperName = 'Partner_Lead' AND State = 'CA' → Partner_Queue`
      });
    }
  });

  return conflicts;
};
```

**Resolution**: Add RecordTypeId to criteria or create separate rules per record type

**Example**: Partner Lead record type → assigned to Direct Sales team (wrong)

---

### 12. Field Dependency in Criteria (v3.62.0)

**Pattern**: Assignment criteria references field that doesn't exist

**Risk**: Critical (80-100) - Rule evaluation fails silently

```javascript
const detectFieldDependencyInCriteria = async (assignmentRules, objectDescribes, orgAlias) => {
  const conflicts = [];

  for (const rule of assignmentRules.filter(r => r.active)) {
    const objectDescribe = objectDescribes[rule.object];

    if (!objectDescribe) {
      // Fetch describe if not cached
      objectDescribe = await describeObject(rule.object, orgAlias);
      objectDescribes[rule.object] = objectDescribe;
    }

    const fields = objectDescribe.fields.map(f => f.name);

    for (const entry of rule.entries || []) {
      for (const criterion of entry.criteria || []) {
        const fieldName = criterion.field;

        // Check if field exists
        if (!fields.includes(fieldName)) {
          conflicts.push({
            type: 'FIELD_DEPENDENCY_IN_CRITERIA',
            severity: 'CRITICAL',
            rule: rule.name,
            object: rule.object,
            entry: entry.order,
            field: fieldName,
            evidence: `Assignment Rule criteria references ${fieldName} but field does not exist on ${rule.object}`,
            impact: 'Rule evaluation will fail. Records may not be assigned or may throw errors.',
            recommendation: 'Update criteria to use existing field OR create missing field',
            resolution: [
              `Option 1: Remove criteria referencing ${fieldName}`,
              `Option 2: Update field reference to correct field name`,
              `Option 3: Create ${fieldName} field on ${rule.object} object`
            ],
            possibleCauses: [
              'Field was deleted',
              'Typo in field API name',
              'Field is in different namespace',
              'Field was renamed'
            ]
          });
        } else {
          // Check field type vs operator compatibility
          const field = objectDescribe.fields.find(f => f.name === fieldName);
          const operatorCompatible = checkOperatorCompatibility(field.type, criterion.operator);

          if (!operatorCompatible.compatible) {
            conflicts.push({
              type: 'FIELD_OPERATOR_INCOMPATIBILITY',
              severity: 'HIGH',
              rule: rule.name,
              object: rule.object,
              entry: entry.order,
              field: fieldName,
              fieldType: field.type,
              operator: criterion.operator,
              evidence: `Field ${fieldName} (type: ${field.type}) incompatible with operator ${criterion.operator}`,
              impact: 'Criteria evaluation may fail or produce unexpected results',
              recommendation: operatorCompatible.recommendation,
              resolution: operatorCompatible.suggestedOperators.map(op =>
                `Option: Use ${op} instead of ${criterion.operator}`
              )
            });
          }
        }
      }
    }
  }

  return conflicts;
};

// Helper function to check operator compatibility
const checkOperatorCompatibility = (fieldType, operator) => {
  const compatibility = {
    'equals': ['string', 'picklist', 'number', 'date', 'datetime', 'boolean', 'reference'],
    'notEqual': ['string', 'picklist', 'number', 'date', 'datetime', 'boolean', 'reference'],
    'lessThan': ['number', 'date', 'datetime', 'currency', 'percent'],
    'greaterThan': ['number', 'date', 'datetime', 'currency', 'percent'],
    'lessOrEqual': ['number', 'date', 'datetime', 'currency', 'percent'],
    'greaterOrEqual': ['number', 'date', 'datetime', 'currency', 'percent'],
    'contains': ['string', 'textarea'],
    'notContain': ['string', 'textarea'],
    'startsWith': ['string', 'textarea'],
    'includes': ['multipicklist'],
    'excludes': ['multipicklist']
  };

  const supportedTypes = compatibility[operator] || [];
  const compatible = supportedTypes.includes(fieldType.toLowerCase());

  if (!compatible) {
    const suggestedOperators = Object.keys(compatibility).filter(op =>
      compatibility[op].includes(fieldType.toLowerCase())
    );

    return {
      compatible: false,
      recommendation: `Use operator compatible with ${fieldType} fields`,
      suggestedOperators: suggestedOperators.slice(0, 3)  // Top 3 suggestions
    };
  }

  return { compatible: true };
};
```

**Resolution**: Update criteria to use existing field or create missing field

**Example**: Criteria uses `Custom_Field__c` but field was deleted

---

## Conflict Resolution Strategies

### Strategy 1: Consolidate to Single Flow

**When**: Multiple automations on same object with related logic

```
Before: 3 Process Builders + 2 Flows on Account
After: 1 Record-Triggered Flow with Decision elements
```

### Strategy 2: Add Execution Order Control

**When**: Order matters but consolidation not possible

```javascript
// Use custom setting to control execution
if (AutomationControl__c.getInstance().Run_Account_Flow__c) {
  // Execute flow logic
}
```

### Strategy 3: Separate by Event

**When**: Different business requirements for different events

```
Before: 1 trigger handling insert + update + delete
After:
  - AccountTrigger_BeforeInsert
  - AccountTrigger_AfterUpdate
  - AccountTrigger_BeforeDelete
```

### Strategy 4: Add Recursion Guards

**Standard Pattern:**

```apex
public class TriggerHandler {
  private static Set<Id> processedIds = new Set<Id>();

  public static Boolean hasProcessed(Id recordId) {
    if (processedIds.contains(recordId)) {
      return true;
    }
    processedIds.add(recordId);
    return false;
  }

  public static void clearProcessed() {
    processedIds.clear();
  }
}
```

## Conflict Report Template

```markdown
## Automation Conflicts Detected

### Critical (Immediate Action Required)
| Conflict | Automations Involved | Impact |
|----------|---------------------|--------|
| Circular dependency | Flow_A ↔ Flow_B | Infinite loop |

### High (Plan Remediation)
| Conflict | Automations Involved | Impact |
|----------|---------------------|--------|
| Field conflict | PB_1, Flow_2, Trigger_1 | Inconsistent data |

### Medium (Monitor)
| Conflict | Automations Involved | Impact |
|----------|---------------------|--------|
| Order sensitivity | Flow_A, Flow_B | Occasional incorrect values |

### Recommendations
1. **Consolidate [Object] automation**: Merge [X] automations into 1 Flow
2. **Add recursion guard**: [Trigger] lacks protection
3. **Review execution order**: [Flow] depends on [Trigger] completing first
```
