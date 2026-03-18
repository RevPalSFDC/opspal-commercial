# Automation Performance Optimization Patterns

## Performance Anti-Patterns

### 1. SOQL in Loops

**Problem**: Query inside loop causes N+1 query pattern

```apex
// BAD: SOQL in loop
for (Account acc : Trigger.new) {
  List<Contact> contacts = [SELECT Id FROM Contact WHERE AccountId = :acc.Id];
  // Process contacts
}

// GOOD: Bulk query before loop
Map<Id, List<Contact>> contactsByAccount = new Map<Id, List<Contact>>();
for (Contact c : [SELECT Id, AccountId FROM Contact WHERE AccountId IN :Trigger.newMap.keySet()]) {
  if (!contactsByAccount.containsKey(c.AccountId)) {
    contactsByAccount.put(c.AccountId, new List<Contact>());
  }
  contactsByAccount.get(c.AccountId).add(c);
}
```

### 2. DML in Loops

**Problem**: DML inside loop causes governor limit issues

```apex
// BAD: DML in loop
for (Account acc : accountsToUpdate) {
  acc.Status__c = 'Processed';
  update acc;
}

// GOOD: Collect and bulk update
List<Account> toUpdate = new List<Account>();
for (Account acc : accountsToProcess) {
  acc.Status__c = 'Processed';
  toUpdate.add(acc);
}
update toUpdate;
```

### 3. Unnecessary Trigger Invocations

**Problem**: Update triggers parent which triggers child which re-triggers parent

```apex
// BAD: Cascading updates
// Account trigger updates Contact, Contact trigger updates Account

// GOOD: Use recursion guard
if (!TriggerHandler.hasProcessed(acc.Id)) {
  // Process only once
}
```

## Flow Optimization Patterns

### Pattern 1: Early Exit

**Before:**
```
Start → Decision → Many Actions → End
```

**After:**
```
Start → Exit Condition Check → (Exit Early if not applicable)
                            → Decision → Actions → End
```

### Pattern 2: Limit Get Records

**Before:**
```xml
<recordLookups>
  <name>Get_All_Contacts</name>
  <!-- Gets all contacts on account -->
</recordLookups>
```

**After:**
```xml
<recordLookups>
  <name>Get_Primary_Contact</name>
  <limit>1</limit>
  <filterLogic>and</filterLogic>
  <filters>
    <field>IsPrimary__c</field>
    <value>true</value>
  </filters>
</recordLookups>
```

### Pattern 3: Batch Collections

**Before:**
```
Loop → Get Record → Update Record (inside loop)
```

**After:**
```
Get All Records (once) → Loop → Collect Updates → Update All (once)
```

## Performance Benchmarks

### SOQL Query Limits

| Context | Limit | Target |
|---------|-------|--------|
| Synchronous | 100 queries | <50 |
| Async | 200 queries | <100 |
| Flow | 100 queries | <30 |

### DML Limits

| Context | Limit | Target |
|---------|-------|--------|
| Synchronous | 150 DML | <50 |
| Async | 150 DML | <75 |
| Flow | 150 DML | <30 |

### CPU Time

| Context | Limit | Target |
|---------|-------|--------|
| Synchronous | 10,000 ms | <5,000 ms |
| Async | 60,000 ms | <30,000 ms |

## Cascade Mapping

### Tracing Automation Chains

```javascript
const traceCascade = async (triggeringObject, maxDepth = 5) => {
  const chain = [];
  let currentLevel = [triggeringObject];
  let depth = 0;

  while (currentLevel.length > 0 && depth < maxDepth) {
    const nextLevel = [];

    for (const obj of currentLevel) {
      const automations = await getAutomationsForObject(obj);

      for (const auto of automations) {
        chain.push({
          level: depth,
          object: obj,
          automation: auto.name,
          type: auto.type,
          triggeredObjects: auto.affectedObjects || []
        });

        nextLevel.push(...(auto.affectedObjects || []));
      }
    }

    currentLevel = [...new Set(nextLevel)]; // Dedupe
    depth++;
  }

  return {
    chain,
    maxDepthReached: depth === maxDepth,
    totalAutomations: chain.length,
    estimatedDuration: estimateDuration(chain)
  };
};
```

### Performance Estimation

```javascript
const estimateDuration = (chain) => {
  // Base estimates per automation type
  const estimates = {
    'Flow': 50,           // ms
    'ProcessBuilder': 75, // ms
    'Trigger': 100,       // ms
    'WorkflowRule': 30    // ms
  };

  const totalMs = chain.reduce((sum, item) => {
    return sum + (estimates[item.type] || 50);
  }, 0);

  return {
    optimistic: totalMs * 0.7,
    expected: totalMs,
    pessimistic: totalMs * 1.5,
    risk: totalMs > 1000 ? 'HIGH' : totalMs > 500 ? 'MEDIUM' : 'LOW'
  };
};
```

## Optimization Report Template

```markdown
## Performance Optimization Findings

### Critical Issues (Governor Limit Risk)
| Issue | Location | Impact | Fix |
|-------|----------|--------|-----|
| SOQL in loop | AccountTrigger:45 | 100% CPU | Bulkify |

### High Priority (Degraded Performance)
| Issue | Location | Impact | Fix |
|-------|----------|--------|-----|
| DML in loop | ContactFlow | 5s+ latency | Batch updates |

### Cascade Analysis
| Starting Object | Chain Length | Est. Duration | Risk |
|-----------------|--------------|---------------|------|
| Opportunity | 7 | 450ms | MEDIUM |
| Account | 12 | 1200ms | HIGH |

### Recommended Actions
1. Consolidate Account automation (12 → 3 components)
2. Add early exit to OpportunityFlow
3. Implement batch pattern in ContactTrigger
```
