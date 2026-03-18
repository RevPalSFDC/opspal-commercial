# Process Builder to Flow Migration Guide

## Migration Decision Matrix

### When to Migrate

| Criteria | Migrate Now | Defer | Leave As-Is |
|----------|-------------|-------|-------------|
| Actions < 10 | Yes | | |
| Actions 10-25 | | Evaluate | |
| Actions > 25 | | | Consider redesign |
| No complex formulas | Yes | | |
| Uses cross-object updates | | Evaluate | |
| Critical business process | | Test thoroughly | |
| Error-prone | Yes | | |

### Migration Complexity Assessment

```javascript
const assessMigrationComplexity = (processBuilder) => {
  let score = 0;

  // Action count
  score += processBuilder.actions.length * 0.5;

  // Criteria complexity
  score += (processBuilder.criteria?.length || 0) * 1;

  // Cross-object references
  const crossObject = processBuilder.actions.filter(a =>
    a.targetObject !== processBuilder.object
  );
  score += crossObject.length * 2;

  // Invoked processes
  score += (processBuilder.invokedProcesses?.length || 0) * 3;

  // Apex invocations
  score += (processBuilder.apexInvocations?.length || 0) * 4;

  return {
    score,
    complexity: score < 5 ? 'LOW' : score < 15 ? 'MEDIUM' : 'HIGH',
    estimatedHours: score < 5 ? 2 : score < 15 ? 4 : 8
  };
};
```

## Migration Patterns

### Pattern 1: Simple Field Update

**Process Builder:**
```
Criteria: [Object].Status = 'Active'
Action: Update [Object].IsActive__c = true
```

**Flow Equivalent:**
```xml
<recordUpdates>
  <name>Update_IsActive</name>
  <object>[Object]</object>
  <inputAssignments>
    <field>IsActive__c</field>
    <value>
      <booleanValue>true</booleanValue>
    </value>
  </inputAssignments>
</recordUpdates>
```

### Pattern 2: Cross-Object Update

**Process Builder:**
```
Criteria: Opportunity.StageName = 'Closed Won'
Action: Update Account.Has_Won_Opp__c = true
```

**Flow Equivalent:**
```xml
<recordUpdates>
  <name>Update_Account</name>
  <object>Account</object>
  <filterLogic>and</filterLogic>
  <filters>
    <field>Id</field>
    <operator>EqualTo</operator>
    <value>
      <elementReference>$Record.AccountId</elementReference>
    </value>
  </filters>
  <inputAssignments>
    <field>Has_Won_Opp__c</field>
    <value>
      <booleanValue>true</booleanValue>
    </value>
  </inputAssignments>
</recordUpdates>
```

### Pattern 3: Invoke Apex

**Process Builder:**
```
Action: Invoke Apex Class 'ProcessOpportunity'
```

**Flow Equivalent:**
```xml
<actionCalls>
  <name>Invoke_Apex</name>
  <actionName>ProcessOpportunity</actionName>
  <actionType>apex</actionType>
  <inputParameters>
    <name>recordId</name>
    <value>
      <elementReference>$Record.Id</elementReference>
    </value>
  </inputParameters>
</actionCalls>
```

## Migration Checklist

### Pre-Migration

- [ ] Document current Process Builder behavior
- [ ] Identify all entry criteria
- [ ] Map all actions and order
- [ ] Identify cross-object references
- [ ] Review error handling needs
- [ ] Plan test coverage

### Migration Steps

1. **Create Flow structure**
   - Start element with entry conditions
   - Decision elements for criteria
   - Action elements for each update

2. **Handle scheduled actions**
   - Convert to Scheduled Paths in Flow
   - Verify time-based logic

3. **Test thoroughly**
   - Unit test each path
   - Integration test with related automation
   - Load test for high-volume objects

4. **Deploy and monitor**
   - Activate Flow in sandbox
   - Monitor for 1-2 weeks
   - Compare outcomes to Process Builder
   - Deactivate Process Builder

### Post-Migration

- [ ] Verify all functionality migrated
- [ ] Monitor error rates
- [ ] Document changes
- [ ] Archive Process Builder (don't delete)
- [ ] Update automation inventory

## Common Pitfalls

| Pitfall | Prevention |
|---------|------------|
| Missing scheduled actions | Audit all time-based triggers |
| Lost cross-object updates | Map all related object changes |
| Broken formula references | Validate formulas in Flow context |
| Order of operations changed | Test automation sequence |
| Recursion introduced | Add recursion guards |
