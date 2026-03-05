# Trigger Management Runbook 6: Troubleshooting and Optimization

**Version**: 1.0.0
**Last Updated**: 2025-11-23
**Audience**: Salesforce Developers, Technical Support, Performance Engineers
**Prerequisites**: Runbook 1-5 (Complete trigger fundamentals through deployment)

---

## Table of Contents

1. [Introduction](#introduction)
2. [Common Trigger Errors](#common-trigger-errors)
3. [Debug Log Analysis](#debug-log-analysis)
4. [Governor Limit Troubleshooting](#governor-limit-troubleshooting)
5. [Performance Optimization](#performance-optimization)
6. [Circular Trigger Detection](#circular-trigger-detection)
7. [Memory Issues](#memory-issues)
8. [CPU Timeout Issues](#cpu-timeout-issues)
9. [Data Quality Issues](#data-quality-issues)
10. [Quick Reference](#quick-reference)

---

## Introduction

Even well-designed triggers can encounter issues in production. This runbook provides systematic approaches to troubleshoot and optimize trigger performance.

### Troubleshooting Philosophy

1. **Reproduce First**: Can you reproduce the issue consistently?
2. **Isolate the Cause**: Is it trigger logic, data, or environment?
3. **Gather Evidence**: Debug logs, error messages, data samples
4. **Fix Root Cause**: Don't just treat symptoms
5. **Validate Fix**: Test thoroughly before redeployment
6. **Document**: Update runbooks with lessons learned

### Common Issue Categories

| Issue Type | % of Issues | Typical Resolution Time |
|------------|-------------|------------------------|
| **Governor Limits** | 40% | 2-4 hours |
| **Null Pointer Exceptions** | 25% | 30 minutes |
| **Logic Errors** | 15% | 4-8 hours |
| **Performance Issues** | 10% | 1-3 days |
| **Data Quality Issues** | 10% | Variable |

---

## Common Trigger Errors

### Error 1: System.NullPointerException

**Symptoms**:
```
System.NullPointerException: Attempt to de-reference a null object
Stack Trace: Class.OpportunityTriggerHandler.handleBeforeInsert: line 25
```

**Common Causes**:
1. Accessing relationship field without null check
2. Map lookup returning null
3. List index out of bounds

**Example**:
```apex
// ❌ WRONG: No null check
for (Opportunity opp : Trigger.new) {
    String industry = opp.Account.Industry;  // ← NullPointerException if Account is null
    opp.Industry__c = industry;
}
```

**Fix**:
```apex
// ✅ CORRECT: Null check before accessing
Set<Id> accountIds = new Set<Id>();
for (Opportunity opp : Trigger.new) {
    if (opp.AccountId != null) {
        accountIds.add(opp.AccountId);
    }
}

Map<Id, Account> accountMap = new Map<Id, Account>([
    SELECT Industry FROM Account WHERE Id IN :accountIds
]);

for (Opportunity opp : Trigger.new) {
    if (opp.AccountId != null) {
        Account acc = accountMap.get(opp.AccountId);
        if (acc != null && acc.Industry != null) {  // ← Double null check
            opp.Industry__c = acc.Industry;
        }
    }
}
```

**Debug Steps**:
1. Enable debug logs for user who experienced error
2. Reproduce error
3. Check debug log for exact line number
4. Add null checks for all object references before that line

---

### Error 2: System.LimitException: Too many SOQL queries

**Symptoms**:
```
System.LimitException: Too many SOQL queries: 101
Stack Trace: Class.OpportunityTriggerHandler.handleBeforeInsert: line 45
```

**Common Cause**: SOQL query inside for loop

**Example**:
```apex
// ❌ WRONG: SOQL in loop
for (Opportunity opp : Trigger.new) {
    Account acc = [SELECT Industry FROM Account WHERE Id = :opp.AccountId];  // ← Query per record
    opp.Industry__c = acc.Industry;
}
// With 200 opportunities: 200 queries → LIMIT EXCEEDED at query 100
```

**Fix**:
```apex
// ✅ CORRECT: Single query with IN clause
Set<Id> accountIds = new Set<Id>();
for (Opportunity opp : Trigger.new) {
    accountIds.add(opp.AccountId);
}

Map<Id, Account> accountMap = new Map<Id, Account>([
    SELECT Industry FROM Account WHERE Id IN :accountIds
]);  // ← Single query

for (Opportunity opp : Trigger.new) {
    Account acc = accountMap.get(opp.AccountId);
    if (acc != null) {
        opp.Industry__c = acc.Industry;
    }
}
// With 200 opportunities: 1 query
```

**Debug Steps**:
1. Check debug log for query count at error point:
   ```
   Number of SOQL queries: 101 out of 100
   ```
2. Search code for queries inside loops
3. Run trigger-complexity-calculator.js to detect pattern:
   ```bash
   node trigger-complexity-calculator.js detect-anti-patterns --file Handler.cls
   ```
4. Refactor to query outside loop

---

### Error 3: System.LimitException: Too many DML statements

**Symptoms**:
```
System.LimitException: Too many DML statements: 151
Stack Trace: Class.AccountTriggerHandler.handleAfterInsert: line 67
```

**Common Cause**: DML operation inside for loop

**Example**:
```apex
// ❌ WRONG: DML in loop
for (Account acc : Trigger.new) {
    Contact con = new Contact(AccountId = acc.Id, LastName = 'Primary');
    insert con;  // ← DML per record
}
// With 200 accounts: 200 DML operations → LIMIT EXCEEDED at DML 150
```

**Fix**:
```apex
// ✅ CORRECT: Collect records, single DML
List<Contact> contactsToInsert = new List<Contact>();

for (Account acc : Trigger.new) {
    contactsToInsert.add(new Contact(AccountId = acc.Id, LastName = 'Primary'));
}

if (!contactsToInsert.isEmpty()) {
    insert contactsToInsert;  // ← Single DML operation
}
// With 200 accounts: 1 DML operation
```

**Debug Steps**:
1. Check debug log for DML count at error point
2. Search code for DML operations inside loops
3. Run anti-pattern detection
4. Refactor to collect records and perform single DML

---

### Error 4: System.QueryException: List has no rows

**Symptoms**:
```
System.QueryException: List has no rows for assignment to SObject
Stack Trace: Class.LeadTriggerHandler.handleBeforeInsert: line 34
```

**Common Cause**: Expecting query to return results, but it doesn't

**Example**:
```apex
// ❌ WRONG: Assumes account exists
Account acc = [SELECT Industry FROM Account WHERE Name = :lead.Company LIMIT 1];
lead.Industry = acc.Industry;  // ← Exception if no account found
```

**Fix**:
```apex
// ✅ CORRECT: Handle empty result
List<Account> accounts = [SELECT Industry FROM Account WHERE Name = :lead.Company LIMIT 1];
if (!accounts.isEmpty()) {
    lead.Industry = accounts[0].Industry;
} else {
    System.debug('Account not found for company: ' + lead.Company);
}
```

**Debug Steps**:
1. Check debug log for query that returned 0 rows
2. Verify data exists that matches query criteria
3. Add conditional check for empty results

---

### Error 5: System.DmlException: REQUIRED_FIELD_MISSING

**Symptoms**:
```
System.DmlException: Insert failed. First exception on row 0;
first error: REQUIRED_FIELD_MISSING, Required fields are missing: [StageName]
```

**Common Cause**: Not setting required field

**Example**:
```apex
// ❌ WRONG: Missing StageName (required field)
Opportunity opp = new Opportunity(
    Name = 'Test',
    CloseDate = Date.today()
    // Missing StageName!
);
insert opp;
```

**Fix**:
```apex
// ✅ CORRECT: Set all required fields
Opportunity opp = new Opportunity(
    Name = 'Test',
    StageName = 'Prospecting',  // ← Required field
    CloseDate = Date.today()
);
insert opp;
```

**Debug Steps**:
1. Check error message for missing field name
2. Describe object to see required fields:
   ```apex
   Schema.DescribeSObjectResult describe = Opportunity.sObjectType.getDescribe();
   Map<String, Schema.SObjectField> fields = describe.fields.getMap();
   for (Schema.SObjectField field : fields.values()) {
       Schema.DescribeFieldResult fieldDescribe = field.getDescribe();
       if (!fieldDescribe.isNillable() && !fieldDescribe.isDefaultedOnCreate()) {
           System.debug('Required field: ' + fieldDescribe.getName());
       }
   }
   ```
3. Ensure all required fields are set before DML

---

### Error 6: System.DmlException: FIELD_CUSTOM_VALIDATION_EXCEPTION

**Symptoms**:
```
System.DmlException: Update failed. First exception on row 0;
first error: FIELD_CUSTOM_VALIDATION_EXCEPTION, Amount cannot be negative
```

**Common Cause**: Validation rule blocked the operation

**Example**:
```apex
// Validation Rule: Amount < 0 → Error
Opportunity opp = new Opportunity(
    Name = 'Test',
    Amount = -1000,  // ← Blocked by validation rule
    StageName = 'Prospecting',
    CloseDate = Date.today()
);
insert opp;
```

**Fix Option 1**: Change data to pass validation
```apex
// ✅ Set valid amount
opp.Amount = 1000;
```

**Fix Option 2**: Add check in trigger to prevent validation error
```apex
// ✅ Check in before trigger
for (Opportunity opp : Trigger.new) {
    if (opp.Amount < 0) {
        opp.addError('Amount cannot be negative');  // ← Friendly error before validation rule
    }
}
```

**Debug Steps**:
1. Check which validation rule fired
2. Review validation rule formula
3. Either:
   - Modify data to pass validation
   - Add trigger logic to prevent invalid data
   - Update validation rule if business logic changed

---

## Debug Log Analysis

### Reading Debug Logs

**Access Debug Logs**:
1. Developer Console → Logs tab
2. Setup → Debug Logs

**Debug Log Structure**:
```
TIMESTAMP|EVENT_TYPE|DETAILS

Example:
14:32:15.123|TRIGGER_BEGIN|OpportunityTrigger on Opportunity trigger event BeforeInsert
14:32:15.145|USER_DEBUG|[10]|DEBUG|Trigger.new size: 50
14:32:15.234|SOQL_EXECUTE_BEGIN|[25]|Aggregations:0
14:32:15.245|SOQL_EXECUTE_END|[25]|Rows:50
14:32:15.456|TRIGGER_END|OpportunityTrigger
```

### Key Events to Monitor

#### TRIGGER_BEGIN / TRIGGER_END
```
14:32:15.123|TRIGGER_BEGIN|OpportunityTrigger on Opportunity trigger event BeforeInsert
14:32:15.456|TRIGGER_END|OpportunityTrigger

Duration: 456ms - 123ms = 333ms
```

**Analysis**: Check if trigger execution time is within acceptable range (< 500ms)

#### USER_DEBUG
```
14:32:15.145|USER_DEBUG|[10]|DEBUG|Trigger.new size: 50
14:32:15.234|USER_DEBUG|[25]|DEBUG|Queries used: 1/100
14:32:15.456|USER_DEBUG|[30]|DEBUG|DML used: 0/150
```

**Analysis**: Custom debug statements show application logic flow

#### SOQL_EXECUTE_BEGIN / SOQL_EXECUTE_END
```
14:32:15.234|SOQL_EXECUTE_BEGIN|[25]|Aggregations:0
14:32:15.235|SOQL_EXECUTE_BEGIN|[25]|SELECT Industry FROM Account WHERE Id IN :accountIds
14:32:15.245|SOQL_EXECUTE_END|[25]|Rows:50

Query duration: 11ms
```

**Analysis**: Check query performance and row count

#### DML_BEGIN / DML_END
```
14:32:15.345|DML_BEGIN|[40]|Op:Insert|Type:Contact|Rows:50
14:32:15.367|DML_END|[40]

DML duration: 22ms
```

**Analysis**: Monitor DML performance

#### EXCEPTION_THROWN
```
14:32:15.456|EXCEPTION_THROWN|[45]|System.NullPointerException: Attempt to de-reference a null object
14:32:15.457|FATAL_ERROR|System.NullPointerException: Attempt to de-reference a null object

Stack Trace:
Class.OpportunityTriggerHandler.handleBeforeInsert: line 45
Trigger.OpportunityTrigger: line 5
```

**Analysis**: Exact line number where exception occurred

### Debug Log Performance Analysis

**Execution Overview** (bottom of log):
```
CUMULATIVE PROFILING:
Number of SOQL queries: 5 out of 100
Number of query rows: 250 out of 50000
Number of SOQL queries for Database.getQueryLocator: 0 out of 100
Number of DML statements: 2 out of 150
Number of DML rows: 50 out of 10000
Maximum CPU time: 1234 out of 10000 ms
Maximum heap size: 0 out of 6291456 bytes
Number of callouts: 0 out of 100
```

**Key Metrics**:
- **SOQL queries: 5/100** ← Good (< 10 target)
- **Query rows: 250/50000** ← Good
- **DML statements: 2/150** ← Good (< 5 target)
- **CPU time: 1234ms/10000ms** ← Good (< 2000ms target)
- **Heap size: 0** ← Excellent (< 1MB target)

### Debug Log Troubleshooting Workflow

**Step 1: Reproduce Issue**
- Enable debug log for affected user
- Reproduce error
- Download debug log

**Step 2: Locate Failure Point**
- Search for "EXCEPTION_THROWN"
- Note line number and exception type
- Review stack trace

**Step 3: Trace Backwards**
- Find TRIGGER_BEGIN before exception
- Review USER_DEBUG statements
- Check SOQL/DML operations before failure

**Step 4: Identify Root Cause**
- Null pointer? → Missing null check
- Governor limit? → Query/DML in loop
- QueryException? → Missing data

**Step 5: Verify Fix**
- Add fix to code
- Add debug statements
- Test and review new debug log

---

## Governor Limit Troubleshooting

### Limit 1: Too Many SOQL Queries (100 limit)

**Symptoms**: System.LimitException: Too many SOQL queries: 101

**Diagnosis**:
```
Debug Log:
Number of SOQL queries: 101 out of 100 ← EXCEEDED
```

**Common Causes**:
1. Query inside for loop
2. Multiple triggers on same object (cumulative queries)
3. Workflow field updates triggering re-execution
4. Complex object relationships with many queries

**Fix Strategies**:

**Strategy 1: Move Query Outside Loop**
```apex
// Before: 200 queries
for (Opportunity opp : Trigger.new) {
    Account acc = [SELECT Industry FROM Account WHERE Id = :opp.AccountId];
}

// After: 1 query
Set<Id> accountIds = new Set<Id>();
for (Opportunity opp : Trigger.new) {
    accountIds.add(opp.AccountId);
}
Map<Id, Account> accountMap = new Map<Id, Account>([
    SELECT Industry FROM Account WHERE Id IN :accountIds
]);
```

**Strategy 2: Combine Multiple Queries**
```apex
// Before: 3 queries
List<Account> accounts = [SELECT Name FROM Account WHERE Id IN :ids];
List<Contact> contacts = [SELECT Name FROM Contact WHERE AccountId IN :ids];
List<Opportunity> opps = [SELECT Name FROM Opportunity WHERE AccountId IN :ids];

// After: 1 query with subqueries
List<Account> accounts = [
    SELECT Name,
           (SELECT Name FROM Contacts),
           (SELECT Name FROM Opportunities)
    FROM Account
    WHERE Id IN :ids
];
```

**Strategy 3: Cache Static Data**
```apex
// Before: Query on every trigger execution
public static void handleBeforeInsert(List<Lead> leads) {
    List<RecordType> recordTypes = [SELECT Id, Name FROM RecordType WHERE SObjectType = 'Lead'];
    // Use record types...
}

// After: Cache with static variable
public class LeadTriggerHandler {
    private static Map<String, Id> recordTypeCache;

    public static void handleBeforeInsert(List<Lead> leads) {
        if (recordTypeCache == null) {
            recordTypeCache = new Map<String, Id>();
            for (RecordType rt : [SELECT Id, Name FROM RecordType WHERE SObjectType = 'Lead']) {
                recordTypeCache.put(rt.Name, rt.Id);
            }
        }
        // Use cached record types...
    }
}
```

### Limit 2: Too Many DML Statements (150 limit)

**Symptoms**: System.LimitException: Too many DML statements: 151

**Diagnosis**:
```
Debug Log:
Number of DML statements: 151 out of 150 ← EXCEEDED
```

**Common Causes**:
1. DML inside for loop
2. Separate DML for each related object type
3. Multiple triggers performing DML

**Fix Strategies**:

**Strategy 1: Collect and Bulk DML**
```apex
// Before: 200 DML operations
for (Account acc : Trigger.new) {
    Contact con = new Contact(AccountId = acc.Id, LastName = 'Primary');
    insert con;
}

// After: 1 DML operation
List<Contact> contacts = new List<Contact>();
for (Account acc : Trigger.new) {
    contacts.add(new Contact(AccountId = acc.Id, LastName = 'Primary'));
}
insert contacts;
```

**Strategy 2: Combine Related DML**
```apex
// Before: 3 DML operations
insert contacts;
insert opportunities;
insert cases;

// After: Still 3 DML (unavoidable for different object types)
// But organize to minimize:
insert contacts;
insert opportunities;
insert cases;

// Or use Database.insert with allOrNone = false for partial success
Database.insert(contacts, false);
Database.insert(opportunities, false);
Database.insert(cases, false);
```

### Limit 3: Too Many Query Rows (50,000 limit)

**Symptoms**: System.LimitException: Too many query rows: 50001

**Diagnosis**:
```
Debug Log:
Number of query rows: 50001 out of 50000 ← EXCEEDED
```

**Common Causes**:
1. Querying too many records without LIMIT
2. Querying all records in large org
3. Relationship queries returning many children

**Fix Strategies**:

**Strategy 1: Add LIMIT Clause**
```apex
// Before: Could return 100,000 rows
List<Lead> leads = [SELECT Id FROM Lead];

// After: Limited to 10,000 rows
List<Lead> leads = [SELECT Id FROM Lead LIMIT 10000];
```

**Strategy 2: Use WHERE Clause to Filter**
```apex
// Before: Queries all accounts
List<Account> accounts = [SELECT Id FROM Account];

// After: Only queries needed accounts
List<Account> accounts = [SELECT Id FROM Account WHERE Id IN :accountIds];
```

**Strategy 3: Process in Batches (Batch Apex)**
```apex
// When need to process >50K rows, use Batch Apex
public class AccountProcessor implements Database.Batchable<SObject> {
    public Database.QueryLocator start(Database.BatchableContext bc) {
        return Database.getQueryLocator([SELECT Id FROM Account]);  // Can query all
    }

    public void execute(Database.BatchableContext bc, List<Account> scope) {
        // Process 200 records at a time
    }

    public void finish(Database.BatchableContext bc) {}
}
```

### Limit 4: Maximum CPU Time (10,000ms / 10 seconds)

**Symptoms**: System.LimitException: Apex CPU time limit exceeded

**Diagnosis**:
```
Debug Log:
Maximum CPU time: 10001 out of 10000 ← EXCEEDED
```

**Common Causes**:
1. Nested loops (O(n²) complexity)
2. Complex calculations in loops
3. Large string concatenation
4. Recursive operations without limit

**Fix Strategies**:

**Strategy 1: Use Map Instead of Nested Loop**
```apex
// Before: O(n²) = 200 × 10,000 = 2,000,000 iterations
for (Opportunity opp : Trigger.new) {  // 200
    for (Account acc : allAccounts) {  // 10,000
        if (opp.AccountId == acc.Id) {
            opp.Industry__c = acc.Industry;
        }
    }
}
// CPU: ~15,000ms ← TIMEOUT

// After: O(n) = 200 iterations
Map<Id, Account> accountMap = new Map<Id, Account>(allAccounts);
for (Opportunity opp : Trigger.new) {  // 200
    Account acc = accountMap.get(opp.AccountId);  // O(1) lookup
    if (acc != null) {
        opp.Industry__c = acc.Industry;
    }
}
// CPU: ~50ms
```

**Strategy 2: Move Complex Calculations to @future**
```apex
// Before: Complex calculation in synchronous trigger
public static void handleAfterInsert(List<Opportunity> newOpps) {
    for (Opportunity opp : newOpps) {
        // Complex calculation (1 second per record)
        opp.ComplexField__c = calculateComplexValue(opp);
    }
    update newOpps;  // With 200 records: 200 seconds ← TIMEOUT
}

// After: Move to @future method
public static void handleAfterInsert(List<Opportunity> newOpps) {
    Set<Id> oppIds = new Set<Id>();
    for (Opportunity opp : newOpps) {
        oppIds.add(opp.Id);
    }
    calculateComplexValuesAsync(oppIds);  // Runs in separate transaction
}

@future
public static void calculateComplexValuesAsync(Set<Id> oppIds) {
    List<Opportunity> opps = [SELECT Id FROM Opportunity WHERE Id IN :oppIds];
    for (Opportunity opp : opps) {
        opp.ComplexField__c = calculateComplexValue(opp);
    }
    update opps;  // Each @future has its own 10-second limit
}
```

---

## Performance Optimization

### Optimization 1: Query Efficiency

**Problem**: Slow SOQL queries

**Diagnosis**:
```
Debug Log:
14:32:15.234|SOQL_EXECUTE_BEGIN|[25]|Aggregations:0
14:32:15.789|SOQL_EXECUTE_END|[25]|Rows:50

Query duration: 555ms ← SLOW (>100ms is concerning)
```

**Optimization Techniques**:

**Technique 1: Selective Query**
```apex
// Before: Queries all fields
SELECT Id, Name, Industry, AnnualRevenue, Rating, ... (50 fields)
FROM Account
WHERE Id IN :accountIds

// After: Only fields you need
SELECT Id, Industry
FROM Account
WHERE Id IN :accountIds

// Performance improvement: 50% faster
```

**Technique 2: Indexed Fields**
```apex
// Before: Query on non-indexed field
SELECT Id FROM Account WHERE Custom_Field__c = 'Value'

// After: Query on indexed field (Id, Name, OwnerId, CreatedDate, etc.)
SELECT Id FROM Account WHERE Id IN :accountIds

// Or create custom index on Custom_Field__c
```

**Technique 3: Avoid OR in WHERE**
```apex
// Before: OR operator (not optimized)
SELECT Id FROM Account
WHERE Industry = 'Technology' OR Industry = 'Finance'

// After: Use IN (optimized)
SELECT Id FROM Account
WHERE Industry IN ('Technology', 'Finance')

// Performance improvement: 2-3x faster
```

### Optimization 2: Reduce DML Operations

**Problem**: Too many DML operations

**Before**: 10 DML operations
```apex
insert contacts;           // DML 1
insert opportunities;      // DML 2
insert cases;             // DML 3
update accounts;          // DML 4
insert tasks;             // DML 5
insert attachments;       // DML 6
update contacts;          // DML 7
update opportunities;     // DML 8
insert emailMessages;     // DML 9
update cases;             // DML 10
```

**After**: 6 DML operations (consolidate updates)
```apex
// Combine operations on same object
List<Contact> contactsToUpsert = new List<Contact>();
contactsToUpsert.addAll(newContacts);
contactsToUpsert.addAll(contactsToUpdate);
upsert contactsToUpsert;  // DML 1 (insert + update combined)

List<Opportunity> oppsToUpsert = new List<Opportunity>();
oppsToUpsert.addAll(newOpps);
oppsToUpsert.addAll(oppsToUpdate);
upsert oppsToUpsert;      // DML 2

insert cases;             // DML 3
update accounts;          // DML 4
insert tasks;             // DML 5
insert attachments;       // DML 6
```

### Optimization 3: Lazy Loading

**Problem**: Querying data you might not use

**Before**: Always queries, even if not needed
```apex
public static void handleBeforeInsert(List<Opportunity> newOpps) {
    // Query contacts for all opportunities
    Set<Id> accountIds = new Set<Id>();
    for (Opportunity opp : newOpps) {
        accountIds.add(opp.AccountId);
    }

    Map<Id, List<Contact>> contactsByAccount = queryContacts(accountIds);  // ← Always queries

    for (Opportunity opp : newOpps) {
        if (opp.Type == 'New Business') {  // Only 10% of opportunities
            List<Contact> contacts = contactsByAccount.get(opp.AccountId);
            // Use contacts...
        }
    }
}
```

**After**: Only queries when needed
```apex
public static void handleBeforeInsert(List<Opportunity> newOpps) {
    // Check if we need contacts
    Set<Id> accountIdsForNewBusiness = new Set<Id>();
    for (Opportunity opp : newOpps) {
        if (opp.Type == 'New Business') {
            accountIdsForNewBusiness.add(opp.AccountId);
        }
    }

    // Lazy load: Only query if needed
    Map<Id, List<Contact>> contactsByAccount;
    if (!accountIdsForNewBusiness.isEmpty()) {
        contactsByAccount = queryContacts(accountIdsForNewBusiness);  // ← Only queries if needed
    }

    // ... rest of logic ...
}
```

**Performance Improvement**: 90% reduction in unnecessary queries

---

## Circular Trigger Detection

### What is a Circular Trigger?

A **circular trigger** occurs when Trigger A updates Object B, which fires Trigger B, which updates Object A, which fires Trigger A again, creating an infinite loop.

**Example**:
```
1. OpportunityTrigger fires (after update)
2. Updates related Account
3. AccountTrigger fires (after update)
4. Updates related Opportunity
5. OpportunityTrigger fires again ← CIRCULAR!
6. Updates related Account
7. AccountTrigger fires again
... infinite loop until governor limits exceeded
```

### Detecting Circular Triggers

**Symptom 1: Maximum Trigger Depth Exceeded**
```
System.DmlException: Update failed.
first error: CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY,
OpportunityTrigger: maximum trigger depth exceeded
```

**Symptom 2: Governor Limits Exceeded**
```
System.LimitException: Too many DML statements: 151

Debug Log shows:
TRIGGER_BEGIN: OpportunityTrigger
TRIGGER_BEGIN: AccountTrigger
TRIGGER_BEGIN: OpportunityTrigger  ← Circular!
TRIGGER_BEGIN: AccountTrigger
... (repeats 20+ times)
```

### Fixing Circular Triggers

**Solution 1: Recursion Prevention with Static Boolean**
```apex
// OpportunityTriggerHandler
public class OpportunityTriggerHandler {
    private static Boolean isExecuting = false;

    public static void handleAfterUpdate(List<Opportunity> newOpps, Map<Id, Opportunity> oldMap) {
        if (isExecuting) return;  // ← Prevents re-entry
        isExecuting = true;

        // Update related accounts
        updateAccounts(newOpps, oldMap);

        isExecuting = false;
    }
}

// AccountTriggerHandler
public class AccountTriggerHandler {
    private static Boolean isExecuting = false;

    public static void handleAfterUpdate(List<Account> newAccounts, Map<Id, Account> oldMap) {
        if (isExecuting) return;  // ← Prevents re-entry
        isExecuting = true;

        // Update related opportunities
        updateOpportunities(newAccounts, oldMap);

        isExecuting = false;
    }
}
```

**Solution 2: Record-Level Tracking**
```apex
public class TriggerRecursionControl {
    private static Set<Id> processedOpportunityIds = new Set<Id>();
    private static Set<Id> processedAccountIds = new Set<Id>();

    public static Boolean hasProcessedOpportunity(Id oppId) {
        return processedOpportunityIds.contains(oppId);
    }

    public static void markOpportunityProcessed(Id oppId) {
        processedOpportunityIds.add(oppId);
    }

    public static Boolean hasProcessedAccount(Id accId) {
        return processedAccountIds.contains(accId);
    }

    public static void markAccountProcessed(Id accId) {
        processedAccountIds.add(accId);
    }
}

// OpportunityTriggerHandler
public static void handleAfterUpdate(List<Opportunity> newOpps, Map<Id, Opportunity> oldMap) {
    List<Opportunity> oppsToProcess = new List<Opportunity>();

    for (Opportunity opp : newOpps) {
        if (!TriggerRecursionControl.hasProcessedOpportunity(opp.Id)) {
            TriggerRecursionControl.markOpportunityProcessed(opp.Id);
            oppsToProcess.add(opp);
        }
    }

    if (!oppsToProcess.isEmpty()) {
        updateAccounts(oppsToProcess, oldMap);
    }
}
```

**Solution 3: Redesign to Avoid Circular Updates**
```
Best Practice: Redesign logic to avoid circular updates altogether

Bad Design:
- OpportunityTrigger updates Account.LastOpportunityDate__c
- AccountTrigger updates Opportunity.AccountLastModified__c
→ Circular!

Good Design:
- OpportunityTrigger updates Account.LastOpportunityDate__c
- AccountTrigger does NOT update Opportunity
→ No circular dependency
```

---

## Memory Issues

### Problem: Heap Size Limit Exceeded (6 MB limit)

**Symptoms**:
```
System.LimitException: Apex heap size too large: 6553601
```

**Common Causes**:
1. Large collections (List, Set, Map)
2. Querying too many fields
3. String concatenation in loops
4. Holding references to large objects

**Fix Strategies**:

**Strategy 1: Process in Batches**
```apex
// Before: Process all 10,000 records at once
List<Account> allAccounts = [SELECT Id, Name, ... FROM Account];  // 10,000 records
// Heap size: 5 MB

// After: Process in chunks
final Integer CHUNK_SIZE = 200;
for (Integer i = 0; i < allAccountIds.size(); i += CHUNK_SIZE) {
    Integer endIndex = Math.min(i + CHUNK_SIZE, allAccountIds.size());
    Set<Id> chunkIds = new Set<Id>();
    for (Integer j = i; j < endIndex; j++) {
        chunkIds.add(allAccountIds[j]);
    }

    List<Account> accountChunk = [SELECT Id, Name, ... FROM Account WHERE Id IN :chunkIds];
    // Process chunk
    // Heap size: 1 MB per chunk
}
```

**Strategy 2: Query Only Needed Fields**
```apex
// Before: All fields
SELECT Id, Name, Industry, ..., (50 fields)
FROM Account
// Heap: 500KB per 1000 records

// After: Only needed fields
SELECT Id, Industry
FROM Account
// Heap: 50KB per 1000 records (10x improvement)
```

**Strategy 3: Use StringBuilder for Large Strings**
```apex
// Before: String concatenation in loop
String csv = '';
for (Account acc : accounts) {
    csv += acc.Id + ',' + acc.Name + '\n';  // ← Creates new string each iteration
}
// Heap: 3 MB for 10,000 records

// After: Use List and String.join
List<String> csvLines = new List<String>();
for (Account acc : accounts) {
    csvLines.add(acc.Id + ',' + acc.Name);
}
String csv = String.join(csvLines, '\n');
// Heap: 1 MB for 10,000 records (3x improvement)
```

---

## CPU Timeout Issues

### Problem: Apex CPU Time Limit Exceeded (10,000ms limit)

**Symptoms**:
```
System.LimitException: Apex CPU time limit exceeded
```

**Diagnosis**:
```
Debug Log:
Maximum CPU time: 10001 out of 10000 ← EXCEEDED

CPU Profiling:
Method: calculateComplexValue - 8000ms (80%)
Method: validateBusinessRules - 1500ms (15%)
Method: enrichData - 500ms (5%)
```

**Optimization Strategy 1: Identify Bottleneck Method**
```apex
// Add CPU tracking
public static void handleBeforeInsert(List<Opportunity> newOpps) {
    Long startCPU = Limits.getCpuTime();

    calculateComplexValue(newOpps);
    System.debug('calculateComplexValue CPU: ' + (Limits.getCpuTime() - startCPU) + 'ms');

    Long startCPU2 = Limits.getCpuTime();
    validateBusinessRules(newOpps);
    System.debug('validateBusinessRules CPU: ' + (Limits.getCpuTime() - startCPU2) + 'ms');
}
```

**Optimization Strategy 2: Move to @future**
```apex
// Before: Synchronous (hits CPU limit)
public static void handleAfterInsert(List<Opportunity> newOpps) {
    for (Opportunity opp : newOpps) {
        opp.ComplexField__c = calculateComplexValue(opp);  // 50ms each × 200 = 10,000ms ← TIMEOUT
    }
    update newOpps;
}

// After: Async @future
public static void handleAfterInsert(List<Opportunity> newOpps) {
    Set<Id> oppIds = new Set<Id>();
    for (Opportunity opp : newOpps) {
        oppIds.add(opp.Id);
    }
    calculateComplexValuesAsync(oppIds);  // Separate transaction with own CPU limit
}

@future
public static void calculateComplexValuesAsync(Set<Id> oppIds) {
    List<Opportunity> opps = [SELECT Id FROM Opportunity WHERE Id IN :oppIds];
    for (Opportunity opp : opps) {
        opp.ComplexField__c = calculateComplexValue(opp);
    }
    update opps;
}
```

---

## Data Quality Issues

### Issue 1: Duplicate Records Created

**Symptoms**: Multiple records with same unique identifier

**Example**:
```apex
// Trigger creates contact for each account
trigger AccountTrigger on Account (after insert) {
    List<Contact> contacts = new List<Contact>();
    for (Account acc : Trigger.new) {
        contacts.add(new Contact(
            AccountId = acc.Id,
            FirstName = 'Primary',
            LastName = 'Contact',
            Email = acc.Email__c  // ← Same email for all contacts if accounts have same email!
        ));
    }
    insert contacts;  // Creates duplicates if multiple accounts have same email
}
```

**Fix**: Check for existing records first
```apex
trigger AccountTrigger on Account (after insert) {
    Set<String> emails = new Set<String>();
    for (Account acc : Trigger.new) {
        if (acc.Email__c != null) {
            emails.add(acc.Email__c);
        }
    }

    // Check existing contacts
    Set<String> existingEmails = new Set<String>();
    for (Contact existing : [SELECT Email FROM Contact WHERE Email IN :emails]) {
        existingEmails.add(existing.Email);
    }

    // Only create if doesn't exist
    List<Contact> contacts = new List<Contact>();
    for (Account acc : Trigger.new) {
        if (acc.Email__c != null && !existingEmails.contains(acc.Email__c)) {
            contacts.add(new Contact(
                AccountId = acc.Id,
                FirstName = 'Primary',
                LastName = 'Contact',
                Email = acc.Email__c
            ));
        }
    }

    if (!contacts.isEmpty()) {
        insert contacts;
    }
}
```

---

## Quick Reference

### Common Errors Quick Fix

| Error | Quick Fix |
|-------|-----------|
| NullPointerException | Add null checks before accessing objects/fields |
| Too many SOQL queries | Move queries outside loops, use IN clause |
| Too many DML statements | Collect records in List, perform single DML |
| List has no rows | Use List instead of direct assignment, check `isEmpty()` |
| REQUIRED_FIELD_MISSING | Set all required fields before DML |
| CPU time limit exceeded | Optimize nested loops, move to @future |
| Heap size too large | Process in batches, query only needed fields |
| Circular trigger | Implement recursion prevention |

### Performance Targets

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Execution Time | <500ms | 500-2000ms | >2000ms |
| SOQL Queries | <10 | 10-50 | >50 |
| Query Rows | <1000 | 1000-10000 | >10000 |
| DML Statements | <5 | 5-20 | >20 |
| CPU Time | <2000ms | 2000-5000ms | >5000ms |
| Heap Size | <1MB | 1-3MB | >3MB |

### Debug Log Analysis Checklist

- [ ] Check CUMULATIVE PROFILING section
- [ ] Look for EXCEPTION_THROWN events
- [ ] Review SOQL_EXECUTE timing
- [ ] Check DML_BEGIN/DML_END timing
- [ ] Count TRIGGER_BEGIN events (detect circular)
- [ ] Review USER_DEBUG statements
- [ ] Check CPU time per method

---

## Conclusion

Troubleshooting triggers requires systematic analysis of debug logs, understanding of governor limits, and knowledge of common patterns. When issues occur:

1. **Reproduce** the issue consistently
2. **Gather evidence** (debug logs, error messages)
3. **Identify root cause** (not just symptoms)
4. **Fix systematically** (test before deploying)
5. **Document** lessons learned
6. **Update** runbooks and validation checklists

**Key Takeaways**:
- Use debug logs to identify exact failure point
- Monitor governor limits proactively
- Optimize for performance from the start
- Implement recursion prevention
- Process in batches when dealing with large data
- Move complex operations to @future when possible
- Always test bulk scenarios (200 records)

---

**Version History**:
- 1.0.0 (2025-11-23): Initial release

**Related Documentation**:
- Runbook 5: Deployment and Monitoring
- Runbook 3: Bulkification Best Practices
- trigger-complexity-calculator.js documentation (anti-pattern detection)
- trigger-orchestrator agent documentation
