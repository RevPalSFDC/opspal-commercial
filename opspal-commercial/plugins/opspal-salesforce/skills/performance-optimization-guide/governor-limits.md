# Governor Limits Management

## Limit Reference

| Limit | Synchronous | Async/Batch | Best Practice |
|-------|-------------|-------------|---------------|
| SOQL Queries | 100 | 200 | Consolidate queries |
| SOQL Rows | 50,000 | 50,000 | Use pagination |
| DML Statements | 150 | 150 | Batch operations |
| DML Rows | 10,000 | 10,000 | Chunk large operations |
| CPU Time | 10,000ms | 60,000ms | Optimize loops |
| Heap Size | 6MB | 12MB | Stream large data |
| Callouts | 100 | 100 | Consolidate calls |
| Callout Time | 120s total | 120s total | Use async |
| Email Invocations | 10 | 10 | Batch emails |
| Future Calls | 50 | 0 | Use Queueable |

## Monitoring Patterns

### Check Limits in Apex
```java
System.debug('SOQL queries: ' + Limits.getQueries() + '/' + Limits.getLimitQueries());
System.debug('DML statements: ' + Limits.getDmlStatements() + '/' + Limits.getLimitDmlStatements());
System.debug('CPU time: ' + Limits.getCpuTime() + '/' + Limits.getLimitCpuTime());
System.debug('Heap size: ' + Limits.getHeapSize() + '/' + Limits.getLimitHeapSize());
```

### Pre-Operation Check
```java
public static Boolean canExecuteOperation(Integer requiredQueries, Integer requiredDml) {
    return (Limits.getQueries() + requiredQueries <= Limits.getLimitQueries()) &&
           (Limits.getDmlStatements() + requiredDml <= Limits.getLimitDmlStatements());
}
```

## Common Limit Violations

### SOQL 101 (Too Many Queries)

**Problem**: Query inside loop

```java
// ❌ BAD
for (Account acc : accounts) {
    List<Contact> contacts = [SELECT Id FROM Contact WHERE AccountId = :acc.Id];
}

// ✅ GOOD
Map<Id, List<Contact>> contactsByAccount = new Map<Id, List<Contact>>();
for (Contact c : [SELECT Id, AccountId FROM Contact WHERE AccountId IN :accountIds]) {
    if (!contactsByAccount.containsKey(c.AccountId)) {
        contactsByAccount.put(c.AccountId, new List<Contact>());
    }
    contactsByAccount.get(c.AccountId).add(c);
}
```

### DML Limit

**Problem**: DML inside loop

```java
// ❌ BAD
for (Account acc : accounts) {
    acc.Status__c = 'Active';
    update acc;
}

// ✅ GOOD
for (Account acc : accounts) {
    acc.Status__c = 'Active';
}
update accounts;
```

### CPU Time Limit

**Problem**: Complex calculations in loops

```java
// ❌ BAD
for (Record__c rec : records) {
    rec.Calculated__c = complexCalculation(rec); // Heavy computation
}

// ✅ GOOD: Pre-compute lookup tables
Map<String, Decimal> lookupTable = buildLookupTable();
for (Record__c rec : records) {
    rec.Calculated__c = lookupTable.get(rec.Key__c);
}
```

### Heap Size Limit

**Problem**: Loading too much data

```java
// ❌ BAD
List<Account> allAccounts = [SELECT Id, Name, Description FROM Account];

// ✅ GOOD: Use QueryLocator or pagination
Database.QueryLocator ql = Database.getQueryLocator('SELECT Id, Name FROM Account');
Database.QueryLocatorIterator iter = ql.iterator();
while (iter.hasNext()) {
    Account acc = (Account) iter.next();
    // Process one at a time
}
```

## Prevention Strategies

### 1. Query Consolidation
- Combine related queries with relationship queries
- Use IN clauses instead of individual queries

### 2. Collection-Based DML
- Add records to collections
- Single DML at end of transaction

### 3. Async Processing
- Use Batch Apex for large data volumes
- Use Queueable for complex chains
- Use Platform Events for decoupling

### 4. Efficient Data Structures
- Use Maps for lookups instead of nested loops
- Use Sets for deduplication
- Avoid unnecessary object instantiation
