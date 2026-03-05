# Apex Triggers Quick Reference Guide

Quick reference for creating production-ready Salesforce Apex triggers with the Apex Triggers Management System (v3.50.0).

## Command Quick Start

```bash
# Create trigger (interactive wizard)
/create-trigger

# Or with parameters
/create-trigger --name AccountTrigger --object Account --events "before insert,before update" --template data-validation
```

## Templates (32 Available Across 7 Categories)

### Basic (4 templates)
- **simple-trigger** - Basic trigger structure
- **before-insert** - Before insert operations
- **after-insert** - After insert operations
- **before-update** - Before update operations

### Data Validation (5 templates)
- **field-validation** - Field-level validation
- **cross-object-validation** - Validate against related records
- **duplicate-detection** - Prevent duplicate records
- **data-quality-checks** - Comprehensive data quality
- **conditional-validation** - Validation based on conditions

### Data Enrichment (6 templates)
- **auto-populate-fields** - Automatically populate fields
- **calculate-derived-fields** - Calculate rollup/formula fields
- **lookup-data-enrichment** - Enrich from related records
- **external-data-enrichment** - Enrich from external systems
- **geolocation-enrichment** - Add geolocation data
- **timestamp-tracking** - Track created/modified times

### Related Records (6 templates)
- **create-related-records** - Auto-create child records
- **update-parent-records** - Update parent on child change
- **sync-related-fields** - Sync fields across relationships
- **cascade-operations** - Cascade changes to related
- **relationship-validation** - Validate relationships
- **junction-object-management** - Manage junction objects

### Integration (4 templates)
- **outbound-integration** - Send data to external system
- **webhook-notification** - Trigger webhooks
- **queue-for-processing** - Queue for async processing
- **event-publishing** - Publish platform events

### Audit Logging (3 templates)
- **field-history-tracking** - Track field changes
- **compliance-logging** - Compliance audit trail
- **change-notifications** - Notify on changes

### Business Logic (4 templates)
- **workflow-automation** - Complex business workflows
- **approval-process-trigger** - Trigger approval processes
- **escalation-logic** - Escalate records based on criteria
- **territory-assignment** - Auto-assign territories

## Handler Pattern (MANDATORY)

### Trigger Structure

```apex
trigger AccountTrigger on Account (before insert, before update, after insert, after update) {
    // Delegate to handler class following handler pattern
    AccountTriggerHandler.handle(Trigger.new, Trigger.old, Trigger.newMap, Trigger.oldMap, Trigger.operationType);
}
```

### Handler Class Structure

```apex
public class AccountTriggerHandler {
    // Recursion prevention
    private static boolean isExecuting = false;
    private static Set<Id> processedIds = new Set<Id>();

    public static void handle(List<Account> newList, List<Account> oldList,
                              Map<Id, Account> newMap, Map<Id, Account> oldMap,
                              System.TriggerOperation operationType) {
        // Prevent recursion
        if (isExecuting) return;
        isExecuting = true;

        try {
            switch on operationType {
                when BEFORE_INSERT {
                    beforeInsert(newList);
                }
                when BEFORE_UPDATE {
                    beforeUpdate(newList, oldMap);
                }
                when AFTER_INSERT {
                    afterInsert(newList);
                }
                when AFTER_UPDATE {
                    afterUpdate(newList, oldMap);
                }
                when BEFORE_DELETE {
                    beforeDelete(oldList);
                }
                when AFTER_DELETE {
                    afterDelete(oldList);
                }
                when AFTER_UNDELETE {
                    afterUndelete(newList);
                }
            }
        } finally {
            isExecuting = false;
        }
    }

    // Handler methods
    private static void beforeInsert(List<Account> newList) {
        // Bulkified logic here
    }

    private static void beforeUpdate(List<Account> newList, Map<Id, Account> oldMap) {
        // Bulkified logic here
    }

    // ... other handler methods
}
```

## Recursion Prevention

### Method 1: Static Boolean (Simple)

```apex
private static boolean isExecuting = false;

public static void handle(...) {
    if (isExecuting) return;
    isExecuting = true;

    try {
        // Trigger logic
    } finally {
        isExecuting = false;
    }
}
```

### Method 2: Set<Id> (Granular)

```apex
private static Set<Id> processedIds = new Set<Id>();

public static void handle(...) {
    List<Account> unprocessedRecords = new List<Account>();

    for (Account acc : newList) {
        if (!processedIds.contains(acc.Id)) {
            unprocessedRecords.add(acc);
            processedIds.add(acc.Id);
        }
    }

    if (unprocessedRecords.isEmpty()) return;

    // Process unprocessedRecords
}
```

### Method 3: Trigger Framework (Enterprise)

```apex
public class TriggerContextManager {
    private static Set<String> executingTriggers = new Set<String>();

    public static boolean isFirstTime(String triggerName) {
        if (executingTriggers.contains(triggerName)) {
            return false;
        }
        executingTriggers.add(triggerName);
        return true;
    }
}

// Usage in handler
public static void handle(...) {
    if (!TriggerContextManager.isFirstTime('AccountTrigger')) return;
    // Trigger logic
}
```

## Bulkification Patterns

### ❌ BAD: SOQL in Loop

```apex
// Anti-pattern: SOQL inside loop
for (Account acc : newList) {
    Contact con = [SELECT Id FROM Contact WHERE AccountId = :acc.Id LIMIT 1];
    // Process contact
}
```

### ✅ GOOD: Bulkified SOQL

```apex
// Query once outside loop
Set<Id> accountIds = new Set<Id>();
for (Account acc : newList) {
    accountIds.add(acc.Id);
}

Map<Id, Contact> contactMap = new Map<Id, Contact>(
    [SELECT Id, AccountId FROM Contact WHERE AccountId IN :accountIds]
);

// Process using map
for (Account acc : newList) {
    Contact con = contactMap.get(acc.Id);
    if (con != null) {
        // Process contact
    }
}
```

### ❌ BAD: DML in Loop

```apex
// Anti-pattern: DML inside loop
for (Account acc : newList) {
    Contact con = new Contact(AccountId = acc.Id, LastName = 'Default');
    insert con;
}
```

### ✅ GOOD: Bulkified DML

```apex
// Collect records for bulk DML
List<Contact> contactsToInsert = new List<Contact>();

for (Account acc : newList) {
    contactsToInsert.add(new Contact(AccountId = acc.Id, LastName = 'Default'));
}

// Single DML operation
if (!contactsToInsert.isEmpty()) {
    insert contactsToInsert;
}
```

## Anti-Patterns (5 Types)

### 1. SOQL in Loops
**Problem**: Query inside for loop (governor limit 100 queries)
**Detection**: Pattern matching for SOQL inside loops
**Fix**: Query once outside loop, use Map for lookups

### 2. DML in Loops
**Problem**: DML inside for loop (governor limit 150 DML statements)
**Detection**: Pattern matching for DML inside loops
**Fix**: Collect records in List, perform bulk DML

### 3. No Bulkification
**Problem**: Code assumes single record (fails with 200 records)
**Detection**: Single record logic patterns
**Fix**: Use collections (List, Set, Map) for all operations

### 4. No Recursion Prevention
**Problem**: Trigger calls itself infinitely
**Detection**: Missing recursion prevention logic
**Fix**: Implement static boolean or Set<Id> tracking

### 5. No Error Handling
**Problem**: Exceptions crash entire transaction
**Detection**: Missing try-catch blocks
**Fix**: Wrap risky operations in try-catch, log errors

## Complexity Scoring (0.0-1.0)

### Formula

```
Score = (events_count / 7) × 0.3 +
        (soql_queries × 0.10) +
        (dml_statements × 0.10) +
        (nested_loops / 3) × 0.20 +
        (lines_of_code / 500) × 0.30

Factors for handlers:
+ method_count × 0.05
+ cross_object_operations × 0.10
```

### Thresholds

- **0.0-0.3 (Simple)**: Direct deployment recommended
  - Single event (before insert OR after insert)
  - Basic field updates, < 50 lines
  - 0-1 SOQL queries, 0-1 DML statements

- **0.3-0.7 (Moderate)**: Segmented approach recommended
  - 2-3 events, moderate logic, 50-200 lines
  - 2-4 SOQL queries, 2-4 DML statements
  - Some cross-object operations

- **0.7-1.0 (Complex)**: Delegate to segmentation specialist
  - 4+ events, complex logic, > 200 lines
  - 5+ SOQL queries, 5+ DML statements
  - Extensive cross-object operations

## Segment-by-Segment Workflow (8 Segments)

For complex triggers (complexity ≥ 0.7), use segmented approach:

| Segment | Content | Validation |
|---------|---------|------------|
| 1. Metadata | Trigger name, object, events | Naming conventions, event selection |
| 2. Handler Setup | Handler class structure, recursion prevention | Pattern compliance |
| 3. Before Insert Logic | Field validation, auto-population | Bulkification, governor limits |
| 4. Before Update Logic | Field validation, change detection | Bulkification, old value access |
| 5. After Insert Logic | Related record creation, integrations | DML limits, async considerations |
| 6. After Update Logic | Related record updates, notifications | Change detection, efficiency |
| 7. Delete/Undelete Logic | Cascade operations, cleanup | Reference integrity, permissions |
| 8. Testing | Test class with 200+ records | Coverage ≥75%, bulk testing |

## Test Class Template

```apex
@isTest
private class AccountTriggerTest {
    @testSetup
    static void setup() {
        // Create test data
    }

    @isTest
    static void testBeforeInsert() {
        Test.startTest();
        // Insert 200 records to test bulkification
        List<Account> accounts = new List<Account>();
        for (Integer i = 0; i < 200; i++) {
            accounts.add(new Account(Name = 'Test Account ' + i));
        }
        insert accounts;
        Test.stopTest();

        // Assert results
        accounts = [SELECT Id, SomeField__c FROM Account WHERE Name LIKE 'Test Account%'];
        System.assertEquals(200, accounts.size(), 'Should create 200 accounts');

        for (Account acc : accounts) {
            System.assertNotEquals(null, acc.SomeField__c, 'SomeField__c should be populated');
        }
    }

    @isTest
    static void testBeforeUpdate() {
        // Create test data
        List<Account> accounts = new List<Account>();
        for (Integer i = 0; i < 200; i++) {
            accounts.add(new Account(Name = 'Test Account ' + i));
        }
        insert accounts;

        Test.startTest();
        // Update 200 records
        for (Account acc : accounts) {
            acc.Industry = 'Technology';
        }
        update accounts;
        Test.stopTest();

        // Assert results
        accounts = [SELECT Id, SomeCalculatedField__c FROM Account WHERE Id IN :accounts];
        for (Account acc : accounts) {
            System.assertNotEquals(null, acc.SomeCalculatedField__c, 'Calculated field should be set');
        }
    }

    @isTest
    static void testRecursionPrevention() {
        // Test that trigger doesn't recurse infinitely
        Account acc = new Account(Name = 'Test Account');
        insert acc;

        Test.startTest();
        // Update multiple times (would cause recursion without prevention)
        acc.Name = 'Updated Name 1';
        update acc;

        acc.Name = 'Updated Name 2';
        update acc;

        acc.Name = 'Updated Name 3';
        update acc;
        Test.stopTest();

        // Should complete without hitting governor limits
        acc = [SELECT Id, Name FROM Account WHERE Id = :acc.Id];
        System.assertEquals('Updated Name 3', acc.Name);
    }
}
```

## Governor Limits Reference

| Limit Type | Synchronous | Asynchronous |
|------------|-------------|--------------|
| **SOQL Queries** | 100 | 200 |
| **SOQL Rows** | 50,000 | 50,000 |
| **DML Statements** | 150 | 150 |
| **DML Rows** | 10,000 | 10,000 |
| **Heap Size** | 6 MB | 12 MB |
| **CPU Time** | 10,000 ms | 60,000 ms |
| **Callouts** | 100 | 100 |

## CLI Commands

### Trigger Batch Manager

```bash
# Create multiple triggers from configuration
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/trigger-batch-manager.js create --config batch-config.json

# Validate all triggers
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/trigger-batch-manager.js validate --triggers ./force-app/main/default/triggers

# Deploy triggers
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/trigger-batch-manager.js deploy --org dev-org --triggers ./force-app/main/default/triggers

# Test triggers with coverage report
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/trigger-batch-manager.js test --org dev-org --triggers ./force-app/main/default/triggers
```

### Trigger Complexity Calculator

```bash
# Calculate complexity for a single trigger
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/trigger-complexity-calculator.js calculate --file AccountTrigger.trigger

# Get recommendations
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/trigger-complexity-calculator.js recommend --file AccountTrigger.trigger
```

### Trigger Handler Generator

```bash
# Generate handler class from trigger
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/trigger-handler-generator.js generate \
  --name AccountTrigger \
  --object Account \
  --events "before insert,before update,after insert,after update" \
  --output ./classes
```

## Routing Decision Tree

```
Apex Trigger Creation Request
├─ Simple (< 0.3)?
│  ├─ Single event, basic logic?
│  │  └─ YES → Use trigger-handler-generator.js directly
│  └─ NO → Continue
├─ Moderate (0.3-0.7)?
│  ├─ 2-3 events, moderate logic?
│  │  └─ YES → Use /create-trigger wizard (segmented)
│  └─ NO → Continue
└─ Complex (≥ 0.7)?
   └─ 4+ events, complex logic?
      └─ YES → Delegate to trigger-segmentation-specialist agent
```

## Best Practices Checklist

- [ ] Handler pattern implemented (all logic in handler class)
- [ ] Recursion prevention implemented (static boolean or Set<Id>)
- [ ] All operations bulkified (no SOQL/DML in loops)
- [ ] Test class with 200+ records
- [ ] Code coverage ≥ 75%
- [ ] Governor limits monitored (SOQL queries < 100, DML statements < 150)
- [ ] Error handling implemented (try-catch for risky operations)
- [ ] Async processing considered for heavy operations (Queueable, Batch)
- [ ] Trigger tested in sandbox before production
- [ ] Trigger documented in org-specific runbook

## Common Errors & Solutions

### Error: "System.LimitException: Too many SOQL queries: 101"
**Cause**: SOQL inside loop or inefficient querying
**Solution**: Query once outside loop, use Map for lookups

### Error: "System.LimitException: Too many DML statements: 151"
**Cause**: DML inside loop
**Solution**: Collect records in List, perform single bulk DML

### Error: "System.DmlException: UNABLE_TO_LOCK_ROW"
**Cause**: Record locked by another process or recursion
**Solution**: Implement recursion prevention, consider async processing

### Error: "System.LimitException: Apex CPU time limit exceeded"
**Cause**: Complex operations or inefficient code
**Solution**: Optimize code, use async processing (Queueable, Batch)

## Integration with Living Runbook System

All trigger operations are automatically captured:

- **Captured Data**: Template used, events, complexity score, anti-patterns detected, test coverage, deployment outcome
- **Synthesis**: Common patterns, handler implementations, bulkification strategies
- **Usage**: Future operations reference historical context for org-specific insights

## Related Documentation

- **Full Agent Documentation**: `agents/trigger-orchestrator.md`, `agents/trigger-segmentation-specialist.md`
- **Command Documentation**: `commands/create-trigger.md`
- **Template Library**: `templates/triggers/`
- **Order of Operations**: `config/order-of-operations-v3.50.json`

---

**Version**: 3.50.0
**Last Updated**: 2025-01-24
