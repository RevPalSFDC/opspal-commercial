# Bulk Operation Patterns

## Core Principles

### Always Design for Bulk
- Assume 1-200+ records in every trigger/operation
- Never assume single record processing
- Use collections (List, Set, Map) everywhere

## Bulkification Patterns

### Pattern 1: Map-Based Lookups

```java
// ❌ BAD: Query in loop (O(n) queries)
for (Contact c : contacts) {
    Account acc = [SELECT Name FROM Account WHERE Id = :c.AccountId];
}

// ✅ GOOD: Single query with Map (O(1) lookup)
Set<Id> accountIds = new Set<Id>();
for (Contact c : contacts) {
    accountIds.add(c.AccountId);
}

Map<Id, Account> accountMap = new Map<Id, Account>(
    [SELECT Id, Name FROM Account WHERE Id IN :accountIds]
);

for (Contact c : contacts) {
    Account acc = accountMap.get(c.AccountId);
}
```

### Pattern 2: Collection-Based DML

```java
// ❌ BAD: DML in loop
for (Account acc : accounts) {
    acc.Status__c = 'Active';
    update acc;
}

// ✅ GOOD: Single DML
List<Account> toUpdate = new List<Account>();
for (Account acc : accounts) {
    acc.Status__c = 'Active';
    toUpdate.add(acc);
}
update toUpdate;
```

### Pattern 3: Trigger Context Variables

```java
// ✅ GOOD: Use Trigger context
trigger AccountTrigger on Account (before insert, before update) {
    // Process all records at once
    Set<Id> ownerIds = new Set<Id>();
    for (Account acc : Trigger.new) {
        ownerIds.add(acc.OwnerId);
    }

    Map<Id, User> owners = new Map<Id, User>(
        [SELECT Id, Region__c FROM User WHERE Id IN :ownerIds]
    );

    for (Account acc : Trigger.new) {
        acc.Region__c = owners.get(acc.OwnerId)?.Region__c;
    }
}
```

## Batch Apex Patterns

### Standard Batch
```java
global class AccountBatch implements Database.Batchable<sObject> {
    global Database.QueryLocator start(Database.BatchableContext bc) {
        return Database.getQueryLocator('SELECT Id, Status__c FROM Account');
    }

    global void execute(Database.BatchableContext bc, List<Account> scope) {
        for (Account acc : scope) {
            acc.Status__c = 'Processed';
        }
        update scope;
    }

    global void finish(Database.BatchableContext bc) {
        // Send notification
    }
}
```

### Optimal Batch Size
| Data Volume | Recommended Batch Size |
|-------------|------------------------|
| Simple operations | 200 |
| Complex logic | 50-100 |
| Callouts required | 1-10 |
| Heavy DML | 100 |

## Async Bulk Operations

### AsyncBulkOps Library Usage
```javascript
const AsyncBulkOps = require('./scripts/lib/async-bulk-ops');

// For 10k+ record operations without timeout
const ops = new AsyncBulkOps(orgAlias, {
    batchSize: 200,
    parallel: 5
});

await ops.bulkUpdate(records, {
    object: 'Account',
    onProgress: (processed, total) => {
        console.log(`Progress: ${processed}/${total}`);
    }
});
```

### Performance Targets

| Operation | Sequential | Parallel | Improvement |
|-----------|-----------|----------|-------------|
| 10k updates | 300s | 60s | 5x faster |
| 50k queries | 250s | 50s | 5x faster |
| API callouts | 100s | 20s | 5x faster |

## Error Handling in Bulk

### Partial Success Pattern
```java
Database.SaveResult[] results = Database.update(records, false);

List<Account> failed = new List<Account>();
for (Integer i = 0; i < results.size(); i++) {
    if (!results[i].isSuccess()) {
        failed.add(records[i]);
        for (Database.Error err : results[i].getErrors()) {
            System.debug('Error: ' + err.getMessage());
        }
    }
}
```

### Retry Logic
```java
public static void updateWithRetry(List<sObject> records, Integer maxRetries) {
    List<sObject> toRetry = records;
    Integer retryCount = 0;

    while (!toRetry.isEmpty() && retryCount < maxRetries) {
        List<Database.SaveResult> results = Database.update(toRetry, false);
        toRetry = new List<sObject>();

        for (Integer i = 0; i < results.size(); i++) {
            if (!results[i].isSuccess()) {
                toRetry.add(records[i]);
            }
        }
        retryCount++;
    }
}
```
