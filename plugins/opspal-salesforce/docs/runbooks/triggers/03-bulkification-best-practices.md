# Trigger Management Runbook 3: Bulkification Best Practices

**Version**: 1.0.0
**Last Updated**: 2025-11-23
**Audience**: Salesforce Developers, Architects
**Prerequisites**: Runbook 1 - Trigger Fundamentals, Runbook 2 - Handler Pattern Architecture

---

## Table of Contents

1. [Introduction](#introduction)
2. [Understanding Governor Limits](#understanding-governor-limits)
3. [Bulkification Principles](#bulkification-principles)
4. [Anti-Pattern #1: SOQL in Loops](#anti-pattern-1-soql-in-loops)
5. [Anti-Pattern #2: DML in Loops](#anti-pattern-2-dml-in-loops)
6. [Collection-Based Patterns](#collection-based-patterns)
7. [Map-Based Lookups](#map-based-lookups)
8. [Optimization Techniques](#optimization-techniques)
9. [Testing Bulk Operations](#testing-bulk-operations)
10. [Quick Reference](#quick-reference)

---

## Introduction

**Bulkification** is the practice of writing Apex code that can efficiently process large numbers of records in a single transaction. In Salesforce, triggers receive **collections** of records (1-200 per transaction), not single records.

### Why Bulkification Matters

**Scenario**: Data loader imports 10,000 leads

Without bulkification:
```
Transaction 1: Processes leads 1-200
  → 200 SOQL queries (if query per record)
  → Hits 100 query limit at record 100
  → Transaction FAILS

All 10,000 leads REJECTED
```

With bulkification:
```
Transaction 1: Processes leads 1-200
  → 1 SOQL query (bulk query)
  → Succeeds

Transaction 2-50: Same pattern
All 10,000 leads ACCEPTED
```

### The Bulkification Mindset

**Wrong Mindset**: "I'm processing one record"
```apex
for (Lead lead : Trigger.new) {
    Account acc = [SELECT Industry FROM Account WHERE Name = :lead.Company];  // ❌ Per-record
    lead.Industry = acc.Industry;
}
```

**Right Mindset**: "I'm processing a collection of records"
```apex
// Collect all companies
Set<String> companies = new Set<String>();
for (Lead lead : Trigger.new) {
    companies.add(lead.Company);
}

// Single query for all accounts
Map<String, Account> accountMap = new Map<String, Account>();
for (Account acc : [SELECT Name, Industry FROM Account WHERE Name IN :companies]) {
    accountMap.put(acc.Name, acc);
}

// Apply to all leads
for (Lead lead : Trigger.new) {
    Account acc = accountMap.get(lead.Company);
    if (acc != null) {
        lead.Industry = acc.Industry;
    }
}
```

---

## Understanding Governor Limits

Salesforce enforces **governor limits** to ensure fair resource allocation in a multi-tenant environment. Triggers must stay within these limits.

### Critical Limits for Triggers

| Resource | Synchronous Limit | Why It Matters |
|----------|-------------------|----------------|
| **SOQL Queries** | 100 | Most common limit hit |
| **SOQL Query Rows** | 50,000 | Large dataset queries |
| **DML Statements** | 150 | Insert/update/delete operations |
| **DML Rows** | 10,000 | Total records modified |
| **CPU Time** | 10,000 ms (10 sec) | Computation time |
| **Heap Size** | 6 MB | Memory usage |
| **Callouts** | 100 | External API calls |
| **Callout Time** | 120,000 ms (120 sec) | Total external call time |

### How Limits Are Consumed

#### SOQL Queries (100 limit)

```apex
// ❌ BAD: 200 queries for 200 records
for (Opportunity opp : Trigger.new) {
    Account acc = [SELECT Industry FROM Account WHERE Id = :opp.AccountId];  // 1 query
}
// Total: 200 queries → LIMIT EXCEEDED at query 100

// ✅ GOOD: 1 query for 200 records
Set<Id> accountIds = new Set<Id>();
for (Opportunity opp : Trigger.new) {
    accountIds.add(opp.AccountId);
}
Map<Id, Account> accounts = new Map<Id, Account>([
    SELECT Industry FROM Account WHERE Id IN :accountIds
]);  // 1 query total
```

#### DML Statements (150 limit)

```apex
// ❌ BAD: 200 DML operations for 200 records
for (Account acc : Trigger.new) {
    Contact con = new Contact(AccountId = acc.Id, LastName = 'Primary');
    insert con;  // 1 DML operation
}
// Total: 200 DML → LIMIT EXCEEDED at DML 150

// ✅ GOOD: 1 DML operation for 200 records
List<Contact> contacts = new List<Contact>();
for (Account acc : Trigger.new) {
    contacts.add(new Contact(AccountId = acc.Id, LastName = 'Primary'));
}
insert contacts;  // 1 DML operation for all 200 contacts
```

#### CPU Time (10,000 ms limit)

```apex
// ❌ BAD: Nested loops = O(n²) complexity
for (Opportunity opp : Trigger.new) {  // 200 records
    for (Account acc : allAccounts) {  // 10,000 records
        if (opp.AccountId == acc.Id) {  // 2,000,000 comparisons!
            opp.Industry__c = acc.Industry;
        }
    }
}
// CPU Time: ~15,000 ms → LIMIT EXCEEDED

// ✅ GOOD: Map lookup = O(1) complexity
Map<Id, Account> accountMap = new Map<Id, Account>(allAccounts);
for (Opportunity opp : Trigger.new) {  // 200 records
    Account acc = accountMap.get(opp.AccountId);  // O(1) lookup
    if (acc != null) {
        opp.Industry__c = acc.Industry;
    }
}
// CPU Time: ~50 ms
```

### Monitoring Limits in Code

```apex
public class OpportunityTriggerHandler {
    public static void handleAfterInsert(List<Opportunity> newOpps) {
        System.debug('Queries used: ' + Limits.getQueries() + '/' + Limits.getLimitQueries());
        System.debug('DML used: ' + Limits.getDmlStatements() + '/' + Limits.getLimitDmlStatements());
        System.debug('CPU time used: ' + Limits.getCpuTime() + '/' + Limits.getLimitCpuTime());
        System.debug('Heap size used: ' + Limits.getHeapSize() + '/' + Limits.getLimitHeapSize());

        // Business logic...

        System.debug('Queries after: ' + Limits.getQueries());
        System.debug('DML after: ' + Limits.getDmlStatements());
    }
}
```

### Best Practices for Governor Limits

1. **Budget Your Limits**: Assume trigger will process 200 records
2. **Query Early**: Get all needed data in 1-2 queries at the start
3. **DML Late**: Collect all changes, perform DML at the end
4. **Use Maps**: O(1) lookups instead of O(n) loops
5. **Profile CPU**: Avoid nested loops and complex calculations
6. **Test Bulk**: Always test with 200 records

---

## Bulkification Principles

### Principle 1: Query Outside Loops

**Problem**: Each record triggers a separate query

```apex
// ❌ WRONG: SOQL in loop
trigger OpportunityTrigger on Opportunity (before insert) {
    for (Opportunity opp : Trigger.new) {
        Account acc = [
            SELECT Industry
            FROM Account
            WHERE Id = :opp.AccountId
        ];  // Executes 200 times for 200 opportunities

        opp.Industry__c = acc.Industry;
    }
}

// With 200 opportunities: 200 SOQL queries → FAILS at query 100
```

**Solution**: Single query with `IN` clause

```apex
// ✅ CORRECT: SOQL outside loop
trigger OpportunityTrigger on Opportunity (before insert) {
    // Step 1: Collect all Account IDs
    Set<Id> accountIds = new Set<Id>();
    for (Opportunity opp : Trigger.new) {
        if (opp.AccountId != null) {
            accountIds.add(opp.AccountId);
        }
    }

    // Step 2: Single query for all accounts
    Map<Id, Account> accountMap = new Map<Id, Account>([
        SELECT Industry
        FROM Account
        WHERE Id IN :accountIds
    ]);  // Executes ONCE regardless of record count

    // Step 3: Apply to each opportunity
    for (Opportunity opp : Trigger.new) {
        Account acc = accountMap.get(opp.AccountId);
        if (acc != null) {
            opp.Industry__c = acc.Industry;
        }
    }
}

// With 200 opportunities: 1 SOQL query → SUCCESS
```

### Principle 2: DML Outside Loops

**Problem**: Each record triggers a separate DML operation

```apex
// ❌ WRONG: DML in loop
trigger AccountTrigger on Account (after insert) {
    for (Account acc : Trigger.new) {
        Contact con = new Contact(
            AccountId = acc.Id,
            FirstName = 'Primary',
            LastName = 'Contact'
        );
        insert con;  // Executes 200 times for 200 accounts
    }
}

// With 200 accounts: 200 DML operations → FAILS at DML 150
```

**Solution**: Collect records, single DML operation

```apex
// ✅ CORRECT: DML outside loop
trigger AccountTrigger on Account (after insert) {
    // Step 1: Collect all contacts to insert
    List<Contact> contactsToInsert = new List<Contact>();

    for (Account acc : Trigger.new) {
        contactsToInsert.add(new Contact(
            AccountId = acc.Id,
            FirstName = 'Primary',
            LastName = 'Contact'
        ));
    }

    // Step 2: Single DML operation
    if (!contactsToInsert.isEmpty()) {
        insert contactsToInsert;  // Executes ONCE for all 200 contacts
    }
}

// With 200 accounts: 1 DML operation → SUCCESS
```

### Principle 3: Use Collections (Sets, Maps, Lists)

**Why**: Sets for uniqueness, Maps for lookups, Lists for DML

```apex
// Collect unique IDs
Set<Id> accountIds = new Set<Id>();
for (Opportunity opp : Trigger.new) {
    accountIds.add(opp.AccountId);  // Automatically handles duplicates
}

// Fast lookups by ID
Map<Id, Account> accountMap = new Map<Id, Account>([
    SELECT Industry FROM Account WHERE Id IN :accountIds
]);

// Bulk DML
List<Contact> contactsToInsert = new List<Contact>();
// ... populate list ...
insert contactsToInsert;
```

### Principle 4: Process All Records, Not One

**Wrong Mindset**: "For each opportunity, do X"

```apex
// ❌ Per-record mindset
for (Opportunity opp : Trigger.new) {
    // Query account
    // Check something
    // Update something
    // Insert related record
}
```

**Right Mindset**: "For all opportunities, collect data, then process"

```apex
// ✅ Bulk mindset
// Step 1: Collect all needed data
Set<Id> ids = new Set<Id>();
for (Opportunity opp : Trigger.new) {
    ids.add(opp.AccountId);
}

// Step 2: Query once
Map<Id, Account> accountMap = new Map<Id, Account>([...]);

// Step 3: Process all records
List<RecordToInsert> recordsToInsert = new List<RecordToInsert>();
for (Opportunity opp : Trigger.new) {
    // Use accountMap for lookups
    // Collect records to insert
}

// Step 4: DML once
insert recordsToInsert;
```

---

## Anti-Pattern #1: SOQL in Loops

### The Problem

Every SOQL query counts against the 100-query limit, regardless of how many rows it returns.

```apex
// ❌ CRITICAL ERROR: SOQL in loop
trigger LeadTrigger on Lead (before insert) {
    for (Lead lead : Trigger.new) {
        // Query 1: Get account
        Account acc = [
            SELECT Industry
            FROM Account
            WHERE Name = :lead.Company
            LIMIT 1
        ];

        // Query 2: Check for duplicates
        List<Lead> existingLeads = [
            SELECT Id
            FROM Lead
            WHERE Email = :lead.Email
        ];

        if (!existingLeads.isEmpty()) {
            lead.addError('Duplicate email');
        }

        lead.Industry = acc.Industry;
    }
}

// With 200 leads: 400 queries (2 per record) → FAILS at query 100 (50th lead)
```

### The Solution

Query once with `IN` clause, store results in Map

```apex
// ✅ CORRECT: SOQL outside loop
trigger LeadTrigger on Lead (before insert) {
    // Collect unique companies and emails
    Set<String> companies = new Set<String>();
    Set<String> emails = new Set<String>();

    for (Lead lead : Trigger.new) {
        if (lead.Company != null) {
            companies.add(lead.Company);
        }
        if (lead.Email != null) {
            emails.add(lead.Email.toLowerCase());
        }
    }

    // Query 1: Get all accounts
    Map<String, Account> accountMap = new Map<String, Account>();
    for (Account acc : [SELECT Name, Industry FROM Account WHERE Name IN :companies]) {
        accountMap.put(acc.Name, acc);
    }

    // Query 2: Check for duplicates
    Set<String> existingEmails = new Set<String>();
    for (Lead existingLead : [SELECT Email FROM Lead WHERE Email IN :emails]) {
        existingEmails.add(existingLead.Email.toLowerCase());
    }

    // Process all leads
    for (Lead lead : Trigger.new) {
        // Check duplicate
        if (lead.Email != null && existingEmails.contains(lead.Email.toLowerCase())) {
            lead.addError('Duplicate email');
        }

        // Set industry
        Account acc = accountMap.get(lead.Company);
        if (acc != null) {
            lead.Industry = acc.Industry;
        }
    }
}

// With 200 leads: 2 queries total → SUCCESS
```

### Real-World Example: Multi-Object Lookup

**Scenario**: Opportunity needs data from Account, Contact, and Pricebook

```apex
// ❌ WRONG: 3 queries per opportunity = 600 queries for 200 records
trigger OpportunityTrigger on Opportunity (before insert) {
    for (Opportunity opp : Trigger.new) {
        Account acc = [SELECT Industry FROM Account WHERE Id = :opp.AccountId];
        Contact con = [SELECT Title FROM Contact WHERE Id = :opp.Primary_Contact__c];
        Pricebook2 pb = [SELECT Name FROM Pricebook2 WHERE Name = 'Standard'];

        opp.Industry__c = acc.Industry;
        opp.Contact_Title__c = con.Title;
        opp.Pricebook2Id = pb.Id;
    }
}
```

```apex
// ✅ CORRECT: 3 queries total regardless of record count
trigger OpportunityTrigger on Opportunity (before insert) {
    // Collect IDs
    Set<Id> accountIds = new Set<Id>();
    Set<Id> contactIds = new Set<Id>();

    for (Opportunity opp : Trigger.new) {
        if (opp.AccountId != null) accountIds.add(opp.AccountId);
        if (opp.Primary_Contact__c != null) contactIds.add(opp.Primary_Contact__c);
    }

    // Query all needed data (3 queries total)
    Map<Id, Account> accountMap = new Map<Id, Account>([
        SELECT Industry FROM Account WHERE Id IN :accountIds
    ]);

    Map<Id, Contact> contactMap = new Map<Id, Contact>([
        SELECT Title FROM Contact WHERE Id IN :contactIds
    ]);

    Pricebook2 standardPricebook = [
        SELECT Id FROM Pricebook2 WHERE Name = 'Standard' LIMIT 1
    ];

    // Apply to all opportunities
    for (Opportunity opp : Trigger.new) {
        Account acc = accountMap.get(opp.AccountId);
        if (acc != null) {
            opp.Industry__c = acc.Industry;
        }

        Contact con = contactMap.get(opp.Primary_Contact__c);
        if (con != null) {
            opp.Contact_Title__c = con.Title;
        }

        if (standardPricebook != null) {
            opp.Pricebook2Id = standardPricebook.Id;
        }
    }
}
```

---

## Anti-Pattern #2: DML in Loops

### The Problem

Every DML operation counts against the 150-statement limit, regardless of how many records it affects.

```apex
// ❌ CRITICAL ERROR: DML in loop
trigger AccountTrigger on Account (after insert) {
    for (Account acc : Trigger.new) {
        // DML 1: Insert contact
        Contact con = new Contact(
            AccountId = acc.Id,
            FirstName = 'Primary',
            LastName = 'Contact'
        );
        insert con;

        // DML 2: Insert opportunity
        Opportunity opp = new Opportunity(
            AccountId = acc.Id,
            Name = acc.Name + ' - Initial',
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30)
        );
        insert opp;
    }
}

// With 200 accounts: 400 DML operations (2 per account) → FAILS at DML 150 (75th account)
```

### The Solution

Collect all records in Lists, perform single DML operation

```apex
// ✅ CORRECT: DML outside loop
trigger AccountTrigger on Account (after insert) {
    // Collect records to insert
    List<Contact> contactsToInsert = new List<Contact>();
    List<Opportunity> oppsToInsert = new List<Opportunity>();

    for (Account acc : Trigger.new) {
        // Add to contact list
        contactsToInsert.add(new Contact(
            AccountId = acc.Id,
            FirstName = 'Primary',
            LastName = 'Contact'
        ));

        // Add to opportunity list
        oppsToInsert.add(new Opportunity(
            AccountId = acc.Id,
            Name = acc.Name + ' - Initial',
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30)
        ));
    }

    // Single DML for each object (2 DML total)
    if (!contactsToInsert.isEmpty()) {
        insert contactsToInsert;
    }
    if (!oppsToInsert.isEmpty()) {
        insert oppsToInsert;
    }
}

// With 200 accounts: 2 DML operations total → SUCCESS
```

### Real-World Example: Conditional DML

**Scenario**: Update accounts only if specific condition met

```apex
// ❌ WRONG: DML in loop with condition
trigger OpportunityTrigger on Opportunity (after update) {
    for (Opportunity opp : Trigger.new) {
        Opportunity oldOpp = Trigger.oldMap.get(opp.Id);

        if (opp.StageName == 'Closed Won' && oldOpp.StageName != 'Closed Won') {
            Account acc = [SELECT Id, LastClosedDate__c FROM Account WHERE Id = :opp.AccountId];
            acc.LastClosedDate__c = System.today();
            update acc;  // DML in loop!
        }
    }
}
```

```apex
// ✅ CORRECT: Collect records, DML once
trigger OpportunityTrigger on Opportunity (after update) {
    // Collect account IDs that need updating
    Set<Id> accountIdsToUpdate = new Set<Id>();

    for (Opportunity opp : Trigger.new) {
        Opportunity oldOpp = Trigger.oldMap.get(opp.Id);

        if (opp.StageName == 'Closed Won' && oldOpp.StageName != 'Closed Won') {
            accountIdsToUpdate.add(opp.AccountId);
        }
    }

    // Query accounts that need updating
    if (!accountIdsToUpdate.isEmpty()) {
        List<Account> accountsToUpdate = [
            SELECT Id
            FROM Account
            WHERE Id IN :accountIdsToUpdate
        ];

        for (Account acc : accountsToUpdate) {
            acc.LastClosedDate__c = System.today();
        }

        // Single DML operation
        update accountsToUpdate;
    }
}
```

---

## Collection-Based Patterns

### Pattern 1: Set for Unique Values

**Use Case**: Collect unique IDs, prevent duplicates

```apex
// Collect unique account IDs
Set<Id> accountIds = new Set<Id>();
for (Opportunity opp : Trigger.new) {
    if (opp.AccountId != null) {
        accountIds.add(opp.AccountId);  // Automatically handles duplicates
    }
}

// Query accounts (IN clause requires Set or List)
List<Account> accounts = [SELECT Id, Industry FROM Account WHERE Id IN :accountIds];
```

**Set Benefits**:
- Automatically removes duplicates
- O(1) contains() operation
- Works with `IN` clause in SOQL

### Pattern 2: Map for Lookups

**Use Case**: Fast lookup by ID or unique key

```apex
// Map by ID (most common)
Map<Id, Account> accountMap = new Map<Id, Account>([
    SELECT Id, Industry FROM Account WHERE Id IN :accountIds
]);

// Lookup is O(1)
for (Opportunity opp : Trigger.new) {
    Account acc = accountMap.get(opp.AccountId);
    if (acc != null) {
        opp.Industry__c = acc.Industry;
    }
}
```

**Map by Custom Key**:
```apex
// Map by unique field (e.g., external ID)
Map<String, Account> accountMapByName = new Map<String, Account>();
for (Account acc : [SELECT Name, Industry FROM Account WHERE Name IN :companyNames]) {
    accountMapByName.put(acc.Name, acc);
}

// Lookup by name
for (Lead lead : Trigger.new) {
    Account acc = accountMapByName.get(lead.Company);
    if (acc != null) {
        lead.Industry = acc.Industry;
    }
}
```

### Pattern 3: List for DML

**Use Case**: Insert/update/delete multiple records

```apex
// Collect records to insert
List<Contact> contactsToInsert = new List<Contact>();

for (Account acc : Trigger.new) {
    contactsToInsert.add(new Contact(
        AccountId = acc.Id,
        LastName = 'Primary'
    ));
}

// Single DML operation
if (!contactsToInsert.isEmpty()) {
    insert contactsToInsert;
}
```

### Pattern 4: Map of Lists (One-to-Many Relationships)

**Use Case**: Group child records by parent ID

```apex
// Query opportunities grouped by account
Map<Id, List<Opportunity>> oppsByAccount = new Map<Id, List<Opportunity>>();

for (Opportunity opp : [SELECT AccountId, Amount FROM Opportunity WHERE AccountId IN :accountIds]) {
    if (!oppsByAccount.containsKey(opp.AccountId)) {
        oppsByAccount.put(opp.AccountId, new List<Opportunity>());
    }
    oppsByAccount.get(opp.AccountId).add(opp);
}

// Process accounts with their opportunities
for (Account acc : Trigger.new) {
    List<Opportunity> opps = oppsByAccount.get(acc.Id);
    if (opps != null) {
        Decimal totalRevenue = 0;
        for (Opportunity opp : opps) {
            totalRevenue += opp.Amount;
        }
        acc.TotalRevenue__c = totalRevenue;
    }
}
```

---

## Map-Based Lookups

### Why Maps?

**Problem**: Nested loops = O(n²) complexity

```apex
// ❌ WRONG: O(n²) = 200 × 10,000 = 2,000,000 iterations
List<Account> allAccounts = [SELECT Id, Industry FROM Account LIMIT 10000];

for (Opportunity opp : Trigger.new) {  // 200 opportunities
    for (Account acc : allAccounts) {  // 10,000 accounts
        if (opp.AccountId == acc.Id) {
            opp.Industry__c = acc.Industry;
            break;
        }
    }
}

// CPU Time: 15,000+ ms → LIMIT EXCEEDED
```

**Solution**: Map lookup = O(1) complexity

```apex
// ✅ CORRECT: O(n) = 200 iterations
Map<Id, Account> accountMap = new Map<Id, Account>([
    SELECT Id, Industry FROM Account WHERE Id IN :accountIds
]);

for (Opportunity opp : Trigger.new) {  // 200 opportunities
    Account acc = accountMap.get(opp.AccountId);  // O(1) lookup
    if (acc != null) {
        opp.Industry__c = acc.Industry;
    }
}

// CPU Time: 50 ms → SUCCESS
```

### Map Pattern Examples

#### Example 1: Parent Field Lookup
```apex
public static void enrichFromAccount(List<Opportunity> opps) {
    // Collect parent IDs
    Set<Id> accountIds = new Set<Id>();
    for (Opportunity opp : opps) {
        if (opp.AccountId != null) {
            accountIds.add(opp.AccountId);
        }
    }

    // Query parents into map
    Map<Id, Account> accountMap = new Map<Id, Account>([
        SELECT Industry, AnnualRevenue, Rating
        FROM Account
        WHERE Id IN :accountIds
    ]);

    // Apply to children (O(1) lookup per record)
    for (Opportunity opp : opps) {
        Account acc = accountMap.get(opp.AccountId);
        if (acc != null) {
            opp.Industry__c = acc.Industry;
            opp.AccountRevenue__c = acc.AnnualRevenue;
            opp.AccountRating__c = acc.Rating;
        }
    }
}
```

#### Example 2: Child Record Aggregation
```apex
public static void calculateOpportunityTotals(List<Account> accounts) {
    // Collect account IDs
    Set<Id> accountIds = new Set<Id>();
    for (Account acc : accounts) {
        accountIds.add(acc.Id);
    }

    // Query children and aggregate by parent
    Map<Id, Decimal> totalRevenueByAccount = new Map<Id, Decimal>();
    Map<Id, Integer> oppCountByAccount = new Map<Id, Integer>();

    for (Opportunity opp : [
        SELECT AccountId, Amount
        FROM Opportunity
        WHERE AccountId IN :accountIds
        AND IsClosed = true
        AND IsWon = true
    ]) {
        // Total revenue
        if (!totalRevenueByAccount.containsKey(opp.AccountId)) {
            totalRevenueByAccount.put(opp.AccountId, 0);
        }
        totalRevenueByAccount.put(
            opp.AccountId,
            totalRevenueByAccount.get(opp.AccountId) + opp.Amount
        );

        // Opportunity count
        if (!oppCountByAccount.containsKey(opp.AccountId)) {
            oppCountByAccount.put(opp.AccountId, 0);
        }
        oppCountByAccount.put(
            opp.AccountId,
            oppCountByAccount.get(opp.AccountId) + 1
        );
    }

    // Apply aggregations to accounts
    for (Account acc : accounts) {
        acc.TotalRevenue__c = totalRevenueByAccount.get(acc.Id);
        acc.OpportunityCount__c = oppCountByAccount.get(acc.Id);
    }
}
```

#### Example 3: External ID Lookup
```apex
public static void matchToExistingAccounts(List<Lead> leads) {
    // Collect company names
    Set<String> companyNames = new Set<String>();
    for (Lead lead : leads) {
        if (lead.Company != null) {
            companyNames.add(lead.Company.toLowerCase());
        }
    }

    // Query accounts by name
    Map<String, Account> accountMapByName = new Map<String, Account>();
    for (Account acc : [SELECT Name, Id, Industry FROM Account WHERE Name IN :companyNames]) {
        accountMapByName.put(acc.Name.toLowerCase(), acc);
    }

    // Match leads to accounts
    for (Lead lead : leads) {
        if (lead.Company != null) {
            Account acc = accountMapByName.get(lead.Company.toLowerCase());
            if (acc != null) {
                lead.ConvertedAccountId__c = acc.Id;
                lead.Industry = acc.Industry;
            }
        }
    }
}
```

---

## Optimization Techniques

### Technique 1: Selective Queries

**Problem**: Querying more rows than needed

```apex
// ❌ INEFFICIENT: Queries all accounts (could be 100,000+)
Map<Id, Account> accountMap = new Map<Id, Account>([
    SELECT Id, Industry FROM Account
]);

// Hits 50,000 row limit if org has >50K accounts
```

**Solution**: Query only what you need

```apex
// ✅ EFFICIENT: Queries only related accounts
Map<Id, Account> accountMap = new Map<Id, Account>([
    SELECT Id, Industry
    FROM Account
    WHERE Id IN :accountIds
]);

// Queries only 200 accounts (or fewer if duplicates)
```

### Technique 2: Selective Fields

**Problem**: Querying unnecessary fields increases CPU and heap

```apex
// ❌ INEFFICIENT: Queries all fields
Map<Id, Account> accountMap = new Map<Id, Account>([
    SELECT FIELDS(ALL) FROM Account WHERE Id IN :accountIds
]);

// Large heap usage, slow deserialization
```

**Solution**: Query only fields you use

```apex
// ✅ EFFICIENT: Queries only needed fields
Map<Id, Account> accountMap = new Map<Id, Account>([
    SELECT Id, Industry, AnnualRevenue
    FROM Account
    WHERE Id IN :accountIds
]);

// Minimal heap usage, fast deserialization
```

### Technique 3: Early Exit Conditions

**Problem**: Processing records unnecessarily

```apex
// ❌ INEFFICIENT: Processes all records even if no work needed
public static void updateRelatedContacts(List<Account> accounts, Map<Id, Account> oldMap) {
    Set<Id> accountIds = new Set<Id>();
    for (Account acc : accounts) {
        accountIds.add(acc.Id);
    }

    List<Contact> contacts = [SELECT Id, AccountId FROM Contact WHERE AccountId IN :accountIds];
    // ... update logic ...
    update contacts;
}
```

**Solution**: Check if work is needed first

```apex
// ✅ EFFICIENT: Only processes if owner changed
public static void updateRelatedContacts(List<Account> accounts, Map<Id, Account> oldMap) {
    Set<Id> accountIdsWithOwnerChange = new Set<Id>();

    // Early exit: Check if any owner changed
    for (Account acc : accounts) {
        Account oldAcc = oldMap.get(acc.Id);
        if (acc.OwnerId != oldAcc.OwnerId) {
            accountIdsWithOwnerChange.add(acc.Id);
        }
    }

    // Exit if no work needed
    if (accountIdsWithOwnerChange.isEmpty()) {
        return;  // Saves SOQL query and DML operation
    }

    List<Contact> contacts = [SELECT Id, AccountId FROM Contact WHERE AccountId IN :accountIdsWithOwnerChange];
    // ... update logic ...
    update contacts;
}
```

### Technique 4: Lazy Loading

**Problem**: Querying data you might not use

```apex
// ❌ INEFFICIENT: Always queries contacts, even if not needed
public static void handleBeforeInsert(List<Opportunity> newOpps) {
    Set<Id> accountIds = new Set<Id>();
    for (Opportunity opp : newOpps) {
        accountIds.add(opp.AccountId);
    }

    Map<Id, List<Contact>> contactsByAccount = queryContactsByAccount(accountIds);

    for (Opportunity opp : newOpps) {
        if (opp.Type == 'New Business') {  // Only used for 10% of opportunities
            List<Contact> contacts = contactsByAccount.get(opp.AccountId);
            // ... use contacts ...
        }
    }
}
```

**Solution**: Only query when needed

```apex
// ✅ EFFICIENT: Queries contacts only for New Business opportunities
public static void handleBeforeInsert(List<Opportunity> newOpps) {
    // Check if we need contacts
    Set<Id> accountIdsForNewBusiness = new Set<Id>();
    for (Opportunity opp : newOpps) {
        if (opp.Type == 'New Business') {
            accountIdsForNewBusiness.add(opp.AccountId);
        }
    }

    // Lazy load: Only query if needed
    Map<Id, List<Contact>> contactsByAccount = new Map<Id, List<Contact>>();
    if (!accountIdsForNewBusiness.isEmpty()) {
        contactsByAccount = queryContactsByAccount(accountIdsForNewBusiness);
    }

    for (Opportunity opp : newOpps) {
        if (opp.Type == 'New Business') {
            List<Contact> contacts = contactsByAccount.get(opp.AccountId);
            // ... use contacts ...
        }
    }
}
```

### Technique 5: Batch Size Awareness

**Problem**: Not considering batch size in data loader

```apex
// ❌ RISKY: Assumes 200 records max, but user might set batch size to 10,000
public static void handleBeforeInsert(List<Lead> newLeads) {
    Set<String> emails = new Set<String>();
    for (Lead lead : newLeads) {
        emails.add(lead.Email);
    }

    // If 10,000 leads with unique emails, this query returns 10,000+ rows
    List<Lead> existingLeads = [SELECT Email FROM Lead WHERE Email IN :emails];
    // Might hit 50,000 row limit if org has lots of leads with those emails
}
```

**Solution**: Process in chunks if needed

```apex
// ✅ SAFE: Processes in chunks if batch size exceeds safe threshold
public static void handleBeforeInsert(List<Lead> newLeads) {
    final Integer CHUNK_SIZE = 200;

    if (newLeads.size() > CHUNK_SIZE) {
        // Process in chunks
        for (Integer i = 0; i < newLeads.size(); i += CHUNK_SIZE) {
            Integer endIndex = Math.min(i + CHUNK_SIZE, newLeads.size());
            List<Lead> chunk = new List<Lead>();
            for (Integer j = i; j < endIndex; j++) {
                chunk.add(newLeads[j]);
            }
            processLeadChunk(chunk);
        }
    } else {
        // Process all at once
        processLeadChunk(newLeads);
    }
}

private static void processLeadChunk(List<Lead> leads) {
    // Standard processing logic
}
```

---

## Testing Bulk Operations

### Test Pattern 1: Single Record Test

**Purpose**: Verify logic works for one record

```apex
@isTest
static void testSingleLead() {
    Lead lead = new Lead(
        FirstName = 'Test',
        LastName = 'Lead',
        Company = 'Test Company',
        Email = 'test@example.com'
    );

    Test.startTest();
    insert lead;
    Test.stopTest();

    Lead inserted = [SELECT Industry FROM Lead WHERE Id = :lead.Id];
    System.assertNotEquals(null, inserted.Industry, 'Industry should be set');
}
```

### Test Pattern 2: Bulk Test (200 Records)

**Purpose**: Verify bulkification works

```apex
@isTest
static void testBulkLeads() {
    List<Lead> leads = new List<Lead>();

    for (Integer i = 0; i < 200; i++) {
        leads.add(new Lead(
            FirstName = 'Test',
            LastName = 'Lead ' + i,
            Company = 'Test Company ' + i,
            Email = 'test' + i + '@example.com'
        ));
    }

    Test.startTest();
    insert leads;  // Should not hit governor limits
    Test.stopTest();

    List<Lead> inserted = [SELECT Id, Industry FROM Lead];
    System.assertEquals(200, inserted.size(), 'All leads should be inserted');
    for (Lead lead : inserted) {
        System.assertNotEquals(null, lead.Industry, 'Industry should be set for all leads');
    }
}
```

### Test Pattern 3: Governor Limit Verification

**Purpose**: Ensure limits are not exceeded

```apex
@isTest
static void testGovernorLimits() {
    List<Lead> leads = new List<Lead>();
    for (Integer i = 0; i < 200; i++) {
        leads.add(new Lead(
            FirstName = 'Test',
            LastName = 'Lead ' + i,
            Company = 'Test Company',
            Email = 'test' + i + '@example.com'
        ));
    }

    Test.startTest();
    Integer queriesBefore = Limits.getQueries();
    Integer dmlBefore = Limits.getDmlStatements();

    insert leads;

    Integer queriesUsed = Limits.getQueries() - queriesBefore;
    Integer dmlUsed = Limits.getDmlStatements() - dmlBefore;
    Test.stopTest();

    // Verify bulkification
    System.assert(queriesUsed < 10, 'Should use less than 10 queries for 200 records. Used: ' + queriesUsed);
    System.assert(dmlUsed < 5, 'Should use less than 5 DML for 200 records. Used: ' + dmlUsed);
}
```

### Test Pattern 4: Duplicate Handling

**Purpose**: Verify bulk processing with duplicates

```apex
@isTest
static void testBulkWithDuplicates() {
    // Create 100 leads pointing to same account
    Account acc = new Account(Name = 'Test Account', Industry = 'Technology');
    insert acc;

    List<Opportunity> opps = new List<Opportunity>();
    for (Integer i = 0; i < 100; i++) {
        opps.add(new Opportunity(
            Name = 'Test Opp ' + i,
            AccountId = acc.Id,  // All same account!
            StageName = 'Prospecting',
            CloseDate = Date.today()
        ));
    }

    Test.startTest();
    insert opps;
    Test.stopTest();

    // Verify all opportunities have correct industry
    List<Opportunity> inserted = [SELECT Industry__c FROM Opportunity];
    System.assertEquals(100, inserted.size());
    for (Opportunity opp : inserted) {
        System.assertEquals('Technology', opp.Industry__c);
    }

    // Verify only 1 query was used (not 100)
    System.assert(Limits.getQueries() < 5, 'Should handle duplicate account IDs efficiently');
}
```

---

## Quick Reference

### Bulkification Checklist

- [ ] No SOQL queries inside for loops
- [ ] No DML operations inside for loops
- [ ] Collect IDs in Set, query once with `IN` clause
- [ ] Use Map for O(1) lookups
- [ ] Collect records to insert/update in List, DML once
- [ ] Test with 200 records
- [ ] Verify governor limits in test

### Common Governor Limits

| Limit | Value | Best Practice |
|-------|-------|---------------|
| SOQL Queries | 100 | Stay under 50 (50% buffer) |
| DML Statements | 150 | Stay under 75 (50% buffer) |
| Query Rows | 50,000 | Use LIMIT clause, paginate |
| CPU Time | 10,000 ms | Use Maps, avoid nested loops |
| Heap Size | 6 MB | Query only needed fields |

### Pattern Quick Reference

| Pattern | Bad | Good |
|---------|-----|------|
| **SOQL** | `for (x : list) { query }` | `query WHERE Id IN :ids; for (x : list) { }` |
| **DML** | `for (x : list) { insert y }` | `List<Y> list; for (x) { list.add(y) } insert list` |
| **Lookup** | `for (x) { for (y) { if match } }` | `Map<Id, Y> map; for (x) { y = map.get(id) }` |

---

## Next Steps

After mastering bulkification, proceed to:

**Runbook 4: Testing and Code Coverage**
- Create comprehensive test classes
- Test bulk scenarios (200+ records)
- Implement test data factories
- Achieve 75%+ code coverage

**Key Takeaways from Runbook 3**:
1. Always process collections, never individual records
2. Query once outside loop, use Map for lookups
3. Collect DML changes, execute once at the end
4. Use Set for unique values, Map for lookups, List for DML
5. Test with 200 records to verify bulkification
6. Monitor governor limits during development
7. Profile CPU time for nested loop detection

---

**Version History**:
- 1.0.0 (2025-11-23): Initial release

**Related Documentation**:
- Runbook 2: Handler Pattern Architecture
- Runbook 4: Testing and Code Coverage
- trigger-complexity-calculator.js documentation
