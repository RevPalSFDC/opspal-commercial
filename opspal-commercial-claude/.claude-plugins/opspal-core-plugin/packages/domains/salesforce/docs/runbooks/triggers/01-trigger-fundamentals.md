# Trigger Management Runbook 1: Trigger Fundamentals

**Version**: 1.0.0
**Last Updated**: 2025-11-23
**Audience**: Salesforce Developers, Administrators, Architects
**Prerequisites**: Basic Apex knowledge, understanding of Salesforce data model

---

## Table of Contents

1. [Introduction](#introduction)
2. [What Are Apex Triggers?](#what-are-apex-triggers)
3. [Trigger Context Variables](#trigger-context-variables)
4. [Trigger Events](#trigger-events)
5. [When to Use Triggers](#when-to-use-triggers)
6. [Order of Execution](#order-of-execution)
7. [Basic Trigger Syntax](#basic-trigger-syntax)
8. [Common Use Cases](#common-use-cases)
9. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
10. [Quick Reference](#quick-reference)

---

## Introduction

Apex triggers are the most powerful automation tool in Salesforce, providing fine-grained control over record operations. Unlike declarative automation (Flows, Process Builder, Workflow Rules), triggers execute **synchronously** during the database transaction, allowing you to:

- Enforce complex business logic that can't be expressed declaratively
- Manipulate data before it's saved to the database (before triggers)
- Update related records after the primary record is committed (after triggers)
- Integrate with external systems during record operations
- Implement sophisticated validation beyond validation rules

**Critical Principle**: With great power comes great responsibility. Poorly designed triggers can:
- Cause governor limit violations
- Create infinite recursion loops
- Severely degrade system performance
- Block user operations with hard-to-debug errors

This runbook provides the foundational knowledge to build triggers that are efficient, maintainable, and production-ready.

---

## What Are Apex Triggers?

### Definition

An **Apex trigger** is a piece of code that executes automatically before or after specific database operations (insert, update, delete, undelete) on a Salesforce object.

### Key Characteristics

1. **Event-Driven**: Triggers fire automatically when DML operations occur
2. **Context-Aware**: Access to both old and new record values
3. **Bulkified by Default**: Receive collections of records (1-200 per transaction)
4. **Synchronous**: Execute within the database transaction
5. **Order-Dependent**: Execute at specific points in the Order of Execution

### Trigger vs. Other Automation

| Feature | Apex Trigger | Flow/Process Builder | Workflow Rule | Validation Rule |
|---------|--------------|----------------------|---------------|-----------------|
| **Timing** | Before/After DML | After DML | After DML | Before DML |
| **Complexity** | Unlimited | High | Medium | Low |
| **Performance** | Fastest | Medium | Fast | Fastest |
| **External Integration** | ✅ Yes | ✅ Yes (limited) | ✅ Yes (limited) | ❌ No |
| **Related Record Updates** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| **Before Save Logic** | ✅ Yes | ❌ No | ❌ No | ✅ Yes |
| **Requires Code** | ✅ Yes | ❌ No | ❌ No | ❌ No |
| **Test Coverage Required** | ✅ Yes (75%) | ❌ No | ❌ No | ❌ No |

### When Triggers Fire

Triggers fire during these operations:
- **insert**: New record creation
- **update**: Existing record modification
- **delete**: Record deletion (moved to Recycle Bin)
- **undelete**: Record restoration from Recycle Bin

Each operation can trigger **before** and **after** events, giving you 8 possible trigger events per object:
1. before insert
2. after insert
3. before update
4. after update
5. before delete
6. after delete
7. after undelete
8. (No before undelete - records are already restored)

---

## Trigger Context Variables

Salesforce provides **context variables** that give you access to record data and metadata during trigger execution.

### Core Context Variables

#### `Trigger.new`
- **Type**: `List<SObject>`
- **Available In**: before insert, before update, after insert, after update, after undelete
- **Description**: New versions of records being inserted or updated
- **Use Case**: Access new field values

```apex
trigger AccountTrigger on Account (before insert) {
    for (Account acc : Trigger.new) {
        System.debug('New Account Name: ' + acc.Name);
    }
}
```

#### `Trigger.newMap`
- **Type**: `Map<Id, SObject>`
- **Available In**: before update, after insert, after update, after undelete
- **Description**: Map of IDs to new record versions
- **Use Case**: Fast lookup by ID

```apex
trigger OpportunityTrigger on Opportunity (after update) {
    for (Id oppId : Trigger.newMap.keySet()) {
        Opportunity opp = Trigger.newMap.get(oppId);
        System.debug('Updated Opportunity: ' + opp.Name);
    }
}
```

#### `Trigger.old`
- **Type**: `List<SObject>`
- **Available In**: before update, before delete, after update, after delete
- **Description**: Old versions of records before modification
- **Use Case**: Compare old vs new values

```apex
trigger ContactTrigger on Contact (before update) {
    for (Integer i = 0; i < Trigger.new.size(); i++) {
        Contact newContact = Trigger.new[i];
        Contact oldContact = Trigger.old[i];

        if (newContact.Email != oldContact.Email) {
            System.debug('Email changed from ' + oldContact.Email + ' to ' + newContact.Email);
        }
    }
}
```

#### `Trigger.oldMap`
- **Type**: `Map<Id, SObject>`
- **Available In**: before update, before delete, after update, after delete
- **Description**: Map of IDs to old record versions
- **Use Case**: Fast lookup of old values by ID

```apex
trigger AccountTrigger on Account (after update) {
    for (Account newAcc : Trigger.new) {
        Account oldAcc = Trigger.oldMap.get(newAcc.Id);

        if (newAcc.Industry != oldAcc.Industry) {
            System.debug('Industry changed for: ' + newAcc.Name);
        }
    }
}
```

### Boolean Context Variables

These variables tell you **when** and **how** the trigger is executing:

#### Timing Variables
- `Trigger.isBefore`: Returns `true` if trigger is executing before DML
- `Trigger.isAfter`: Returns `true` if trigger is executing after DML

#### Operation Variables
- `Trigger.isInsert`: Returns `true` for insert operations
- `Trigger.isUpdate`: Returns `true` for update operations
- `Trigger.isDelete`: Returns `true` for delete operations
- `Trigger.isUndelete`: Returns `true` for undelete operations

#### Execution Context
- `Trigger.isExecuting`: Returns `true` if code is running in a trigger context

### Numeric Context Variables

- `Trigger.size`: Number of records in the trigger invocation

### Context Variable Availability Matrix

| Context Variable | before insert | before update | before delete | after insert | after update | after delete | after undelete |
|------------------|---------------|---------------|---------------|--------------|--------------|--------------|----------------|
| `Trigger.new` | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ |
| `Trigger.newMap` | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ |
| `Trigger.old` | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| `Trigger.oldMap` | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| `Trigger.isBefore` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `Trigger.isAfter` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `Trigger.isInsert` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `Trigger.isUpdate` | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `Trigger.isDelete` | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| `Trigger.isUndelete` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### Common Mistakes with Context Variables

#### ❌ WRONG: Accessing Trigger.old in before insert
```apex
trigger AccountTrigger on Account (before insert) {
    for (Account acc : Trigger.new) {
        // ERROR: Trigger.oldMap is null in before insert
        if (acc.Name != Trigger.oldMap.get(acc.Id).Name) {
            // This will throw NullPointerException
        }
    }
}
```

#### ✅ CORRECT: Check operation type first
```apex
trigger AccountTrigger on Account (before insert, before update) {
    for (Account acc : Trigger.new) {
        if (Trigger.isUpdate) {
            // Safe to access Trigger.oldMap in update
            Account oldAcc = Trigger.oldMap.get(acc.Id);
            if (acc.Name != oldAcc.Name) {
                System.debug('Name changed');
            }
        }
    }
}
```

#### ❌ WRONG: Using Trigger.new in before delete
```apex
trigger AccountTrigger on Account (before delete) {
    // ERROR: Trigger.new is null in delete operations
    for (Account acc : Trigger.new) {
        System.debug(acc.Name);
    }
}
```

#### ✅ CORRECT: Use Trigger.old in delete
```apex
trigger AccountTrigger on Account (before delete) {
    // Correct: Use Trigger.old in delete operations
    for (Account acc : Trigger.old) {
        System.debug('Deleting: ' + acc.Name);
    }
}
```

---

## Trigger Events

### Before Triggers

**Purpose**: Modify records before they are saved to the database

**When to Use**:
- Data validation beyond validation rules
- Data enrichment (calculating field values)
- Setting default values based on complex logic
- Enforcing business rules that require database queries

**Key Characteristics**:
- ✅ Can modify `Trigger.new` records directly (no DML needed)
- ❌ Cannot access `Id` field in before insert (not assigned yet)
- ⚡ Fastest execution (no additional database round-trip)
- 🚫 Cannot update related records (require after triggers)

#### Before Insert
Fires before new records are saved to the database.

**Use Cases**:
- Set default values based on other fields
- Normalize data formats
- Validate complex business rules
- Enrich records with calculated values

**Example**:
```apex
trigger LeadTrigger on Lead (before insert) {
    for (Lead lead : Trigger.new) {
        // Set default LeadSource if not provided
        if (lead.LeadSource == null) {
            lead.LeadSource = 'Web';
        }

        // Normalize phone format
        if (lead.Phone != null) {
            lead.Phone = lead.Phone.replaceAll('[^0-9]', '');
        }

        // Auto-populate country based on state
        if (lead.State == 'CA' && lead.Country == null) {
            lead.Country = 'USA';
        }
    }
}
```

#### Before Update
Fires before existing records are modified.

**Use Cases**:
- Prevent unauthorized field changes
- Calculate dependent field values
- Audit trail preparation
- Complex validation requiring old vs new comparison

**Example**:
```apex
trigger OpportunityTrigger on Opportunity (before update) {
    for (Opportunity opp : Trigger.new) {
        Opportunity oldOpp = Trigger.oldMap.get(opp.Id);

        // Prevent stage regression
        if (opp.StageName == 'Closed Lost' && oldOpp.StageName == 'Closed Won') {
            opp.addError('Cannot change Closed Won opportunities to Closed Lost');
        }

        // Auto-calculate probability
        if (opp.StageName == 'Prospecting') {
            opp.Probability = 10;
        } else if (opp.StageName == 'Qualification') {
            opp.Probability = 25;
        }
    }
}
```

#### Before Delete
Fires before records are deleted (moved to Recycle Bin).

**Use Cases**:
- Prevent deletion of critical records
- Validate deletion permissions
- Check for dependent records

**Example**:
```apex
trigger AccountTrigger on Account (before delete) {
    Set<Id> accountIds = new Set<Id>();
    for (Account acc : Trigger.old) {
        accountIds.add(acc.Id);
    }

    // Check for open opportunities
    List<Opportunity> openOpps = [
        SELECT AccountId
        FROM Opportunity
        WHERE AccountId IN :accountIds
        AND IsClosed = false
    ];

    if (!openOpps.isEmpty()) {
        for (Account acc : Trigger.old) {
            acc.addError('Cannot delete account with open opportunities');
        }
    }
}
```

### After Triggers

**Purpose**: Perform actions after records are committed to the database

**When to Use**:
- Update related records (requires DML)
- Create child records
- Send notifications
- Call external systems
- Complex calculations requiring committed data

**Key Characteristics**:
- ✅ Can access `Id` field (assigned by database)
- ✅ Can perform DML on related records
- ❌ Cannot modify `Trigger.new` records (read-only)
- 🔄 Requires additional database operations for changes

#### After Insert
Fires after new records are saved to the database.

**Use Cases**:
- Create related records (e.g., default tasks, contacts)
- Update parent/related records
- Send notifications
- Log creation events

**Example**:
```apex
trigger AccountTrigger on Account (after insert) {
    List<Contact> contactsToInsert = new List<Contact>();

    for (Account acc : Trigger.new) {
        // Create default contact for new accounts
        Contact defaultContact = new Contact(
            AccountId = acc.Id,  // Id is available in after insert
            FirstName = 'Primary',
            LastName = 'Contact',
            Email = acc.Website != null ? 'info@' + acc.Website : null
        );
        contactsToInsert.add(defaultContact);
    }

    if (!contactsToInsert.isEmpty()) {
        insert contactsToInsert;  // DML allowed in after triggers
    }
}
```

#### After Update
Fires after existing records are modified.

**Use Cases**:
- Update child records when parent changes
- Recalculate rollup summaries
- Send change notifications
- Update related data

**Example**:
```apex
trigger OpportunityTrigger on Opportunity (after update) {
    Set<Id> closedWonIds = new Set<Id>();

    for (Opportunity opp : Trigger.new) {
        Opportunity oldOpp = Trigger.oldMap.get(opp.Id);

        // Detect stage change to Closed Won
        if (opp.StageName == 'Closed Won' && oldOpp.StageName != 'Closed Won') {
            closedWonIds.add(opp.Id);
        }
    }

    if (!closedWonIds.isEmpty()) {
        // Update related opportunities
        List<Opportunity> relatedOpps = [
            SELECT Id, Status__c
            FROM Opportunity
            WHERE AccountId IN (SELECT AccountId FROM Opportunity WHERE Id IN :closedWonIds)
            AND Id NOT IN :closedWonIds
        ];

        for (Opportunity relOpp : relatedOpps) {
            relOpp.Status__c = 'Renewed Customer';
        }

        update relatedOpps;
    }
}
```

#### After Delete
Fires after records are deleted (after moving to Recycle Bin).

**Use Cases**:
- Clean up related records
- Archive data to external systems
- Send deletion notifications
- Update parent record counts

**Example**:
```apex
trigger OpportunityTrigger on Opportunity (after delete) {
    Set<Id> accountIds = new Set<Id>();

    for (Opportunity opp : Trigger.old) {
        accountIds.add(opp.AccountId);
    }

    // Recalculate account opportunity counts
    List<Account> accountsToUpdate = [
        SELECT Id, NumberOfEmployees,
               (SELECT Id FROM Opportunities)
        FROM Account
        WHERE Id IN :accountIds
    ];

    for (Account acc : accountsToUpdate) {
        acc.NumberOfEmployees = acc.Opportunities.size();
    }

    update accountsToUpdate;
}
```

#### After Undelete
Fires after records are restored from Recycle Bin.

**Use Cases**:
- Restore related data
- Re-establish relationships
- Send restoration notifications
- Reactivate processes

**Example**:
```apex
trigger ContactTrigger on Contact (after undelete) {
    Set<Id> accountIds = new Set<Id>();

    for (Contact con : Trigger.new) {
        if (con.AccountId != null) {
            accountIds.add(con.AccountId);
        }
    }

    // Reactivate account if it was deactivated
    List<Account> accountsToUpdate = [
        SELECT Id, Active__c
        FROM Account
        WHERE Id IN :accountIds
        AND Active__c = false
    ];

    for (Account acc : accountsToUpdate) {
        acc.Active__c = true;
    }

    if (!accountsToUpdate.isEmpty()) {
        update accountsToUpdate;
    }
}
```

---

## When to Use Triggers

### Decision Tree: Trigger vs. Declarative Automation

```
Need to automate record operations?
│
├─ Before record is saved to database?
│  ├─ Simple validation? → Validation Rule
│  ├─ Complex validation with queries? → Before Trigger
│  └─ Data enrichment/calculation? → Before Trigger
│
├─ After record is saved to database?
│  ├─ Simple field update on same record? → Workflow Rule/Process Builder
│  ├─ Update related records? → Flow/Process Builder (if simple)
│  │                           → After Trigger (if complex)
│  ├─ Create child records? → Flow/After Trigger
│  └─ External integration? → After Trigger + @future
│
└─ Need maximum performance? → Trigger (always faster than declarative)
```

### Use Triggers When...

#### ✅ Scenario 1: Before-Save Data Manipulation
**Problem**: Need to modify record values before database commit

**Example**: Auto-populate Account rating based on annual revenue and industry

```apex
trigger AccountTrigger on Account (before insert, before update) {
    for (Account acc : Trigger.new) {
        if (acc.AnnualRevenue != null && acc.Industry != null) {
            if (acc.AnnualRevenue > 10000000 && acc.Industry == 'Technology') {
                acc.Rating = 'Hot';
            } else if (acc.AnnualRevenue > 1000000) {
                acc.Rating = 'Warm';
            } else {
                acc.Rating = 'Cold';
            }
        }
    }
}
```

**Why Trigger**: Validation rules can't set field values, flows execute after save

#### ✅ Scenario 2: Complex Business Logic with Multiple Queries
**Problem**: Need to validate against multiple related objects

**Example**: Prevent opportunity closure if account has overdue invoices

```apex
trigger OpportunityTrigger on Opportunity (before update) {
    Set<Id> accountIds = new Set<Id>();

    for (Opportunity opp : Trigger.new) {
        if (opp.StageName == 'Closed Won') {
            accountIds.add(opp.AccountId);
        }
    }

    if (!accountIds.isEmpty()) {
        // Query multiple related objects
        Map<Id, Account> accountsWithInvoices = new Map<Id, Account>([
            SELECT Id,
                   (SELECT Id, Status__c FROM Invoices__r WHERE Status__c = 'Overdue')
            FROM Account
            WHERE Id IN :accountIds
        ]);

        for (Opportunity opp : Trigger.new) {
            if (opp.StageName == 'Closed Won') {
                Account acc = accountsWithInvoices.get(opp.AccountId);
                if (acc != null && !acc.Invoices__r.isEmpty()) {
                    opp.addError('Cannot close opportunity while account has overdue invoices');
                }
            }
        }
    }
}
```

**Why Trigger**: Validation rules can't query related objects, flows have limited query capabilities

#### ✅ Scenario 3: High-Volume Bulk Operations
**Problem**: Need maximum performance for bulk data loads

**Example**: Process 10,000 lead imports daily with enrichment logic

```apex
trigger LeadTrigger on Lead (before insert) {
    // Bulk-efficient: Single query for all leads
    Set<String> companies = new Set<String>();
    for (Lead lead : Trigger.new) {
        if (lead.Company != null) {
            companies.add(lead.Company);
        }
    }

    // Single SOQL query for all companies
    Map<String, Account> accountMap = new Map<String, Account>();
    for (Account acc : [SELECT Name, Industry, AnnualRevenue FROM Account WHERE Name IN :companies]) {
        accountMap.put(acc.Name, acc);
    }

    // Enrich leads with account data
    for (Lead lead : Trigger.new) {
        Account acc = accountMap.get(lead.Company);
        if (acc != null) {
            lead.Industry = acc.Industry;
            lead.AnnualRevenue = acc.AnnualRevenue;
            lead.Rating = 'Hot'; // Existing customer
        }
    }
}
```

**Why Trigger**: Flows execute per-record, triggers process bulk efficiently

#### ✅ Scenario 4: Cascade Updates Across Multiple Objects
**Problem**: Need to update 3+ related objects when parent changes

**Example**: When account owner changes, update all related opportunities, cases, and contacts

```apex
trigger AccountTrigger on Account (after update) {
    Map<Id, Id> accountOwnerChanges = new Map<Id, Id>();

    for (Account acc : Trigger.new) {
        Account oldAcc = Trigger.oldMap.get(acc.Id);
        if (acc.OwnerId != oldAcc.OwnerId) {
            accountOwnerChanges.put(acc.Id, acc.OwnerId);
        }
    }

    if (!accountOwnerChanges.isEmpty()) {
        // Update opportunities
        List<Opportunity> opps = [SELECT Id FROM Opportunity WHERE AccountId IN :accountOwnerChanges.keySet()];
        for (Opportunity opp : opps) {
            opp.OwnerId = accountOwnerChanges.get(opp.AccountId);
        }

        // Update cases
        List<Case> cases = [SELECT Id FROM Case WHERE AccountId IN :accountOwnerChanges.keySet()];
        for (Case c : cases) {
            c.OwnerId = accountOwnerChanges.get(c.AccountId);
        }

        // Update contacts
        List<Contact> contacts = [SELECT Id FROM Contact WHERE AccountId IN :accountOwnerChanges.keySet()];
        for (Contact con : contacts) {
            con.OwnerId = accountOwnerChanges.get(con.AccountId);
        }

        // Bulk DML
        update opps;
        update cases;
        update contacts;
    }
}
```

**Why Trigger**: Flows can't efficiently cascade across multiple objects

#### ✅ Scenario 5: External System Integration
**Problem**: Need to sync data with external system in real-time

**Example**: Send new opportunity to external CPQ system

```apex
trigger OpportunityTrigger on Opportunity (after insert) {
    Set<Id> oppIds = new Set<Id>();

    for (Opportunity opp : Trigger.new) {
        if (opp.Amount > 100000) { // Only large opportunities
            oppIds.add(opp.Id);
        }
    }

    if (!oppIds.isEmpty()) {
        // Call @future method for callout
        OpportunityIntegration.sendToCPQ(oppIds);
    }
}

public class OpportunityIntegration {
    @future(callout=true)
    public static void sendToCPQ(Set<Id> oppIds) {
        List<Opportunity> opps = [SELECT Id, Name, Amount FROM Opportunity WHERE Id IN :oppIds];

        for (Opportunity opp : opps) {
            HttpRequest req = new HttpRequest();
            req.setEndpoint('https://cpq.example.com/api/opportunities');
            req.setMethod('POST');
            req.setBody(JSON.serialize(opp));

            Http http = new Http();
            HttpResponse res = http.send(req);

            // Handle response...
        }
    }
}
```

**Why Trigger**: Flows have limited callout capabilities, triggers provide full control

### Avoid Triggers When...

#### ❌ Scenario 1: Simple Field Updates
**Problem**: Update single field on same record

**Use Flow Instead**:
- Easier to maintain
- No code coverage required
- Faster to implement
- Visual debugging

**Example**: Set opportunity close date to today when stage = Closed Won
→ Use Flow with Before Save update

#### ❌ Scenario 2: Email Alerts
**Problem**: Send email when field changes

**Use Workflow Rule Instead**:
- Built-in email templates
- No code required
- Easy scheduling

**Example**: Email sales manager when opportunity amount > $1M
→ Use Workflow Rule with Email Alert

#### ❌ Scenario 3: Simple Task Creation
**Problem**: Create task when lead is created

**Use Flow Instead**:
- Drag-and-drop interface
- Built-in task templates
- No testing required

**Example**: Create follow-up task for new high-priority leads
→ Use Record-Triggered Flow

---

## Order of Execution

Understanding Salesforce's **Order of Execution** is critical for trigger development. Triggers execute at specific points in a complex sequence of operations.

### Complete Order of Execution (20 Steps)

```
1. LOAD ORIGINAL RECORD
   └─ Load record from database (or initialize for new records)

2. LOAD NEW FIELD VALUES
   └─ Overwrite with values from UI/API request

3. SYSTEM VALIDATION RULES
   └─ Check required fields, field formats, max length

4. ⚡ BEFORE TRIGGERS ⚡
   └─ Execute all before triggers

5. CUSTOM VALIDATION RULES
   └─ Execute all validation rules

6. DUPLICATE RULES
   └─ Execute duplicate detection (if enabled)

7. SAVE RECORD (NOT COMMITTED YET)
   └─ Record saved to memory, not database

8. ⚡ AFTER TRIGGERS ⚡
   └─ Execute all after triggers

9. ASSIGNMENT RULES
   └─ Execute lead/case assignment rules

10. AUTO-RESPONSE RULES
    └─ Execute case auto-response rules

11. WORKFLOW RULES
    └─ Execute workflow field updates (immediate)

12. PROCESSES (Process Builder)
    └─ Execute process builder processes

13. ENTITLEMENT RULES
    └─ Execute entitlement processes

14. ESCALATION RULES
    └─ Execute case escalation rules

15. ⚡ RE-EXECUTE TRIGGERS IF FIELD UPDATED ⚡
    └─ Before/after triggers run again if workflow updated fields

16. EXECUTE FLOWS (Record-Triggered)
    └─ Execute flows with "Fast Field Updates"

17. EXECUTE ROLL-UP SUMMARY FIELDS
    └─ Calculate parent rollup summaries

18. EXECUTE CRITERIA-BASED SHARING
    └─ Calculate sharing rules

19. ⚡ FINAL AFTER TRIGGERS ⚡
    └─ After triggers run one final time (if previous steps changed records)

20. COMMIT TO DATABASE
    └─ Transaction committed, all changes saved
```

### Key Insights for Trigger Developers

#### Insight 1: Before Triggers Execute Before Validation
**Implication**: You can set field values that validation rules will check

```apex
// ✅ GOOD: Set required field in before trigger
trigger LeadTrigger on Lead (before insert) {
    for (Lead lead : Trigger.new) {
        if (lead.LeadSource == null) {
            lead.LeadSource = 'Web'; // Validation rule requires this
        }
    }
}
```

#### Insight 2: Validation Rules Execute After Before Triggers
**Implication**: Validation rules can block changes made by before triggers

```apex
// Validation Rule: Amount < 1000 → ERROR
trigger OpportunityTrigger on Opportunity (before insert) {
    for (Opportunity opp : Trigger.new) {
        opp.Amount = 500; // Will still be blocked by validation rule
    }
}
```

#### Insight 3: After Triggers Can Fire Multiple Times
**Implication**: Workflow field updates cause triggers to re-execute

```apex
// Workflow: When Stage = 'Closed Won', set CloseDate = TODAY
trigger OpportunityTrigger on Opportunity (after update) {
    // This trigger will fire TWICE if workflow updates CloseDate
    System.debug('After trigger executed');
}
```

**Solution**: Implement recursion prevention (covered in Runbook 2)

#### Insight 4: Flows Execute After Triggers
**Implication**: Trigger changes are visible to flows, flow changes are NOT visible to triggers

```apex
// After trigger runs first
trigger AccountTrigger on Account (after insert) {
    // Flow will see changes made here
    for (Account acc : Trigger.new) {
        acc.Description = 'Updated by trigger';
    }
}

// Flow runs after trigger
// Flow field updates: Rating = 'Hot'
// ❌ Trigger does NOT see Rating change
```

#### Insight 5: DML in Triggers Starts New Order of Execution
**Implication**: Inserting/updating related records triggers their full execution sequence

```apex
trigger AccountTrigger on Account (after insert) {
    List<Contact> contacts = new List<Contact>();
    for (Account acc : Trigger.new) {
        contacts.add(new Contact(AccountId = acc.Id, LastName = 'Primary'));
    }
    insert contacts; // ⚡ Starts FULL Order of Execution for Contact triggers
}
```

### Execution Order Conflicts

#### Conflict 1: Trigger vs. Validation Rule
**Scenario**: Before trigger sets field, validation rule checks different field

```apex
// Before Trigger: Set Rating based on Revenue
trigger AccountTrigger on Account (before insert) {
    for (Account acc : Trigger.new) {
        if (acc.AnnualRevenue > 1000000) {
            acc.Rating = 'Hot';
        }
    }
}

// Validation Rule: Rating must be 'Cold' if Industry = 'Non-Profit'
// Rule: AND(ISPICKVAL(Industry, "Non-Profit"), ISPICKVAL(Rating, "Hot"))
```

**Result**: Validation rule will block records, even though trigger set Rating correctly

**Solution**: Check validation rule conditions in before trigger:
```apex
trigger AccountTrigger on Account (before insert) {
    for (Account acc : Trigger.new) {
        if (acc.Industry == 'Non-Profit') {
            acc.Rating = 'Cold'; // Override trigger logic for non-profits
        } else if (acc.AnnualRevenue > 1000000) {
            acc.Rating = 'Hot';
        }
    }
}
```

#### Conflict 2: Trigger vs. Workflow Field Update
**Scenario**: After trigger updates field, workflow also updates it

```apex
// After Trigger: Set Status based on Stage
trigger OpportunityTrigger on Opportunity (after update) {
    List<Opportunity> oppsToUpdate = new List<Opportunity>();
    for (Opportunity opp : Trigger.new) {
        if (opp.StageName == 'Closed Won') {
            Opportunity oppUpdate = new Opportunity(Id = opp.Id);
            oppUpdate.Status__c = 'Won - Pending Implementation';
            oppsToUpdate.add(oppUpdate);
        }
    }
    update oppsToUpdate;
}

// Workflow Rule: When Stage = 'Closed Won', set Status__c = 'Won - Invoiced'
```

**Result**: Workflow will overwrite trigger's Status value

**Solution**: Disable workflow and consolidate logic in trigger, or use process builder with conditional logic

#### Conflict 3: Multiple Triggers on Same Object
**Scenario**: Two triggers on Account object

```apex
// Trigger 1: AccountTriggerHandler
trigger AccountTriggerHandler on Account (before insert) {
    for (Account acc : Trigger.new) {
        acc.Rating = 'Hot';
    }
}

// Trigger 2: AccountValidation
trigger AccountValidation on Account (before insert) {
    for (Account acc : Trigger.new) {
        if (acc.Rating != 'Cold') {
            acc.addError('Rating must be Cold for new accounts');
        }
    }
}
```

**Result**: Execution order is NOT guaranteed. Trigger 2 might execute before Trigger 1, causing errors.

**Best Practice**: **ONE trigger per object** - use handler pattern (Runbook 2)

---

## Basic Trigger Syntax

### Minimal Trigger Structure

```apex
trigger TriggerName on ObjectName (trigger_events) {
    // Trigger logic here
}
```

**Components**:
- `trigger`: Keyword to define trigger
- `TriggerName`: Name of trigger (must be unique per object)
- `on ObjectName`: Salesforce object to monitor
- `(trigger_events)`: One or more events (comma-separated)

### Trigger Naming Conventions

**Standard Convention**: `{ObjectName}Trigger`

**Examples**:
- `AccountTrigger`
- `OpportunityTrigger`
- `CustomObject__cTrigger`

**Anti-Pattern**: Descriptive names like `AccountValidationTrigger`, `AccountRatingTrigger`
- Problem: Encourages multiple triggers per object
- Solution: Use single trigger per object with handler pattern

### Event Syntax

**Single Event**:
```apex
trigger AccountTrigger on Account (before insert) {
    // Logic
}
```

**Multiple Events**:
```apex
trigger AccountTrigger on Account (before insert, before update, after insert, after update) {
    // Logic
}
```

**All Events** (not recommended):
```apex
trigger AccountTrigger on Account (before insert, before update, before delete,
                                    after insert, after update, after delete, after undelete) {
    // Logic
}
```

### Basic Trigger Patterns

#### Pattern 1: Simple Before Trigger
```apex
trigger LeadTrigger on Lead (before insert, before update) {
    for (Lead lead : Trigger.new) {
        // Modify fields directly (no DML needed)
        if (lead.Email != null) {
            lead.Email = lead.Email.toLowerCase();
        }
    }
}
```

#### Pattern 2: Simple After Trigger
```apex
trigger ContactTrigger on Contact (after insert) {
    // Collect data for bulk processing
    Set<Id> accountIds = new Set<Id>();

    for (Contact con : Trigger.new) {
        if (con.AccountId != null) {
            accountIds.add(con.AccountId);
        }
    }

    // Perform DML on related records
    List<Account> accounts = [SELECT Id, NumberOfEmployees FROM Account WHERE Id IN :accountIds];
    for (Account acc : accounts) {
        acc.NumberOfEmployees = acc.NumberOfEmployees != null ? acc.NumberOfEmployees + 1 : 1;
    }
    update accounts;
}
```

#### Pattern 3: Conditional Logic by Event Type
```apex
trigger OpportunityTrigger on Opportunity (before insert, before update, after insert, after update) {
    if (Trigger.isBefore) {
        if (Trigger.isInsert) {
            // Before insert logic
            for (Opportunity opp : Trigger.new) {
                opp.LeadSource = 'Web';
            }
        } else if (Trigger.isUpdate) {
            // Before update logic
            for (Opportunity opp : Trigger.new) {
                Opportunity oldOpp = Trigger.oldMap.get(opp.Id);
                if (opp.StageName != oldOpp.StageName) {
                    opp.LastModifiedDate = System.now();
                }
            }
        }
    } else if (Trigger.isAfter) {
        if (Trigger.isInsert) {
            // After insert logic
        } else if (Trigger.isUpdate) {
            // After update logic
        }
    }
}
```

**Problem with Pattern 3**: Becomes unreadable as logic grows
**Solution**: Use handler pattern (Runbook 2)

---

## Common Use Cases

### Use Case 1: Auto-Populate Related Fields

**Requirement**: When opportunity is created, copy account industry to opportunity

```apex
trigger OpportunityTrigger on Opportunity (before insert, before update) {
    Set<Id> accountIds = new Set<Id>();

    for (Opportunity opp : Trigger.new) {
        if (opp.AccountId != null) {
            accountIds.add(opp.AccountId);
        }
    }

    if (!accountIds.isEmpty()) {
        Map<Id, Account> accountMap = new Map<Id, Account>([
            SELECT Id, Industry
            FROM Account
            WHERE Id IN :accountIds
        ]);

        for (Opportunity opp : Trigger.new) {
            if (opp.AccountId != null) {
                Account acc = accountMap.get(opp.AccountId);
                if (acc != null) {
                    opp.Industry__c = acc.Industry;
                }
            }
        }
    }
}
```

### Use Case 2: Prevent Duplicate Records

**Requirement**: Prevent duplicate leads based on email

```apex
trigger LeadTrigger on Lead (before insert, before update) {
    Set<String> emails = new Set<String>();

    for (Lead lead : Trigger.new) {
        if (lead.Email != null) {
            emails.add(lead.Email.toLowerCase());
        }
    }

    if (!emails.isEmpty()) {
        List<Lead> existingLeads = [
            SELECT Email
            FROM Lead
            WHERE Email IN :emails
            AND Id NOT IN :Trigger.new
        ];

        Set<String> existingEmails = new Set<String>();
        for (Lead existing : existingLeads) {
            existingEmails.add(existing.Email.toLowerCase());
        }

        for (Lead lead : Trigger.new) {
            if (lead.Email != null && existingEmails.contains(lead.Email.toLowerCase())) {
                lead.addError('A lead with this email already exists');
            }
        }
    }
}
```

### Use Case 3: Create Related Records

**Requirement**: Create default contact when account is created

```apex
trigger AccountTrigger on Account (after insert) {
    List<Contact> contactsToInsert = new List<Contact>();

    for (Account acc : Trigger.new) {
        Contact con = new Contact(
            AccountId = acc.Id,
            FirstName = 'Primary',
            LastName = 'Contact',
            Email = acc.Website != null ? 'contact@' + acc.Website : null
        );
        contactsToInsert.add(con);
    }

    if (!contactsToInsert.isEmpty()) {
        insert contactsToInsert;
    }
}
```

### Use Case 4: Audit Trail

**Requirement**: Log all opportunity stage changes

```apex
trigger OpportunityTrigger on Opportunity (after update) {
    List<Opportunity_History__c> historyRecords = new List<Opportunity_History__c>();

    for (Opportunity opp : Trigger.new) {
        Opportunity oldOpp = Trigger.oldMap.get(opp.Id);

        if (opp.StageName != oldOpp.StageName) {
            Opportunity_History__c history = new Opportunity_History__c(
                Opportunity__c = opp.Id,
                Field_Changed__c = 'StageName',
                Old_Value__c = oldOpp.StageName,
                New_Value__c = opp.StageName,
                Changed_By__c = UserInfo.getUserId(),
                Changed_Date__c = System.now()
            );
            historyRecords.add(history);
        }
    }

    if (!historyRecords.isEmpty()) {
        insert historyRecords;
    }
}
```

### Use Case 5: Rollup Summary (Non-Master-Detail)

**Requirement**: Count number of contacts per account

```apex
trigger ContactTrigger on Contact (after insert, after update, after delete, after undelete) {
    Set<Id> accountIds = new Set<Id>();

    if (Trigger.isDelete) {
        for (Contact con : Trigger.old) {
            if (con.AccountId != null) {
                accountIds.add(con.AccountId);
            }
        }
    } else {
        for (Contact con : Trigger.new) {
            if (con.AccountId != null) {
                accountIds.add(con.AccountId);
            }
        }

        if (Trigger.isUpdate) {
            for (Contact con : Trigger.old) {
                if (con.AccountId != null) {
                    accountIds.add(con.AccountId);
                }
            }
        }
    }

    if (!accountIds.isEmpty()) {
        List<Account> accounts = [
            SELECT Id,
                   (SELECT Id FROM Contacts)
            FROM Account
            WHERE Id IN :accountIds
        ];

        for (Account acc : accounts) {
            acc.NumberOfEmployees = acc.Contacts.size();
        }

        update accounts;
    }
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: SOQL/DML in Loops

#### ❌ WRONG
```apex
trigger OpportunityTrigger on Opportunity (after insert) {
    for (Opportunity opp : Trigger.new) {
        // SOQL in loop - will hit 100 query limit
        Account acc = [SELECT Industry FROM Account WHERE Id = :opp.AccountId];

        // DML in loop - will hit 150 DML limit
        Contact con = new Contact(AccountId = acc.Id, LastName = 'Test');
        insert con;
    }
}
```

**Problem**: With 200 opportunities, this executes 200 SOQL queries and 200 DML operations
**Governor Limits**: 100 SOQL queries, 150 DML statements per transaction

#### ✅ CORRECT
```apex
trigger OpportunityTrigger on Opportunity (after insert) {
    // Collect all account IDs
    Set<Id> accountIds = new Set<Id>();
    for (Opportunity opp : Trigger.new) {
        accountIds.add(opp.AccountId);
    }

    // Single SOQL query
    Map<Id, Account> accountMap = new Map<Id, Account>([
        SELECT Industry
        FROM Account
        WHERE Id IN :accountIds
    ]);

    // Collect contacts to insert
    List<Contact> contactsToInsert = new List<Contact>();
    for (Opportunity opp : Trigger.new) {
        Account acc = accountMap.get(opp.AccountId);
        if (acc != null) {
            contactsToInsert.add(new Contact(AccountId = acc.Id, LastName = 'Test'));
        }
    }

    // Single DML operation
    if (!contactsToInsert.isEmpty()) {
        insert contactsToInsert;
    }
}
```

### Anti-Pattern 2: Multiple Triggers Per Object

#### ❌ WRONG
```apex
// Trigger 1: AccountRating
trigger AccountRating on Account (before insert) {
    for (Account acc : Trigger.new) {
        acc.Rating = 'Hot';
    }
}

// Trigger 2: AccountValidation
trigger AccountValidation on Account (before insert) {
    for (Account acc : Trigger.new) {
        if (acc.Rating != 'Cold') {
            acc.addError('Must be Cold');
        }
    }
}
```

**Problem**: Execution order is NOT guaranteed. Validation might run before Rating assignment.

#### ✅ CORRECT
```apex
// Single trigger delegates to handler
trigger AccountTrigger on Account (before insert, before update) {
    AccountTriggerHandler.handleBeforeInsert(Trigger.new);
}

// Handler consolidates all logic
public class AccountTriggerHandler {
    public static void handleBeforeInsert(List<Account> newAccounts) {
        setRating(newAccounts);
        validateAccounts(newAccounts);
    }

    private static void setRating(List<Account> accounts) { /* ... */ }
    private static void validateAccounts(List<Account> accounts) { /* ... */ }
}
```

### Anti-Pattern 3: No Recursion Prevention

#### ❌ WRONG
```apex
trigger AccountTrigger on Account (after update) {
    List<Account> accountsToUpdate = new List<Account>();

    for (Account acc : Trigger.new) {
        Account accUpdate = new Account(Id = acc.Id);
        accUpdate.Description = 'Updated at ' + System.now();
        accountsToUpdate.add(accUpdate);
    }

    update accountsToUpdate; // ⚡ Triggers ANOTHER after update, infinite loop!
}
```

**Problem**: After trigger updates accounts, which fires after trigger again, infinite loop

#### ✅ CORRECT
```apex
trigger AccountTrigger on Account (after update) {
    if (!AccountTriggerHandler.hasRun) {
        AccountTriggerHandler.hasRun = true;

        List<Account> accountsToUpdate = new List<Account>();
        for (Account acc : Trigger.new) {
            Account accUpdate = new Account(Id = acc.Id);
            accUpdate.Description = 'Updated at ' + System.now();
            accountsToUpdate.add(accUpdate);
        }

        update accountsToUpdate;
    }
}

public class AccountTriggerHandler {
    public static Boolean hasRun = false;
}
```

### Anti-Pattern 4: Hardcoded IDs

#### ❌ WRONG
```apex
trigger CaseTrigger on Case (before insert) {
    for (Case c : Trigger.new) {
        if (c.RecordTypeId == '012000000000001AAA') { // Hardcoded RecordType ID
            c.Priority = 'High';
        }
    }
}
```

**Problem**: RecordType IDs differ between sandbox and production, between orgs

#### ✅ CORRECT
```apex
trigger CaseTrigger on Case (before insert) {
    // Query RecordType dynamically
    Id vipRecordTypeId = Schema.SObjectType.Case.getRecordTypeInfosByName()
        .get('VIP Case').getRecordTypeId();

    for (Case c : Trigger.new) {
        if (c.RecordTypeId == vipRecordTypeId) {
            c.Priority = 'High';
        }
    }
}
```

### Anti-Pattern 5: No Null Checks

#### ❌ WRONG
```apex
trigger OpportunityTrigger on Opportunity (before insert) {
    for (Opportunity opp : Trigger.new) {
        // NullPointerException if Account relationship is null
        String industry = opp.Account.Industry;
        opp.Description = 'Account industry: ' + industry;
    }
}
```

**Problem**: Relationship fields can be null, causing NullPointerException

#### ✅ CORRECT
```apex
trigger OpportunityTrigger on Opportunity (before insert) {
    Set<Id> accountIds = new Set<Id>();
    for (Opportunity opp : Trigger.new) {
        if (opp.AccountId != null) {
            accountIds.add(opp.AccountId);
        }
    }

    if (!accountIds.isEmpty()) {
        Map<Id, Account> accountMap = new Map<Id, Account>([
            SELECT Industry FROM Account WHERE Id IN :accountIds
        ]);

        for (Opportunity opp : Trigger.new) {
            if (opp.AccountId != null) {
                Account acc = accountMap.get(opp.AccountId);
                if (acc != null && acc.Industry != null) {
                    opp.Description = 'Account industry: ' + acc.Industry;
                }
            }
        }
    }
}
```

---

## Quick Reference

### Trigger Syntax Template

```apex
trigger ObjectNameTrigger on ObjectName (before insert, before update, after insert, after update) {
    if (Trigger.isBefore) {
        if (Trigger.isInsert) {
            // Before insert logic
            for (ObjectName obj : Trigger.new) {
                // Modify fields directly
            }
        } else if (Trigger.isUpdate) {
            // Before update logic
            for (ObjectName obj : Trigger.new) {
                ObjectName oldObj = Trigger.oldMap.get(obj.Id);
                // Compare old vs new
            }
        }
    } else if (Trigger.isAfter) {
        if (Trigger.isInsert) {
            // After insert logic
            Set<Id> relatedIds = new Set<Id>();
            for (ObjectName obj : Trigger.new) {
                relatedIds.add(obj.RelatedId__c);
            }
            // Perform DML on related records
        } else if (Trigger.isUpdate) {
            // After update logic
        }
    }
}
```

### Context Variables Cheat Sheet

| Variable | Type | Available In | Description |
|----------|------|--------------|-------------|
| `Trigger.new` | `List<SObject>` | before insert, before update, after insert, after update, after undelete | New record values |
| `Trigger.newMap` | `Map<Id, SObject>` | before update, after insert, after update, after undelete | Map of IDs to new records |
| `Trigger.old` | `List<SObject>` | before update, before delete, after update, after delete | Old record values |
| `Trigger.oldMap` | `Map<Id, SObject>` | before update, before delete, after update, after delete | Map of IDs to old records |
| `Trigger.isBefore` | `Boolean` | All | True if before trigger |
| `Trigger.isAfter` | `Boolean` | All | True if after trigger |
| `Trigger.isInsert` | `Boolean` | All | True if insert operation |
| `Trigger.isUpdate` | `Boolean` | All | True if update operation |
| `Trigger.isDelete` | `Boolean` | All | True if delete operation |
| `Trigger.isUndelete` | `Boolean` | All | True if undelete operation |
| `Trigger.size` | `Integer` | All | Number of records |

### Decision Matrix: Before vs After

| Need | Before Trigger | After Trigger |
|------|----------------|---------------|
| Modify record being saved | ✅ Yes | ❌ No (read-only) |
| Access record ID | ❌ No (not assigned yet in insert) | ✅ Yes |
| Update related records | ❌ No | ✅ Yes |
| Prevent DML operation | ✅ Yes (addError) | ⚠️ Partial (can rollback) |
| Fastest performance | ✅ Yes | ❌ No |
| External callouts | ❌ No (use @future) | ✅ Yes (@future) |

### Bulkification Checklist

- [ ] No SOQL queries inside for loops
- [ ] No DML operations inside for loops
- [ ] Collect IDs in Set, query once with `IN` clause
- [ ] Collect records to insert/update in List, DML once
- [ ] Use Map for O(1) lookups instead of nested loops
- [ ] Test with 200 records
- [ ] Check governor limits in test

### Common Governor Limits

| Resource | Limit | Best Practice |
|----------|-------|---------------|
| SOQL Queries | 100 | < 50 per transaction |
| DML Statements | 150 | < 75 per transaction |
| SOQL Query Rows | 50,000 | Use LIMIT clause, batch processing |
| Heap Size | 6 MB | Avoid large collections |
| CPU Time | 10,000 ms | Optimize loops, avoid nested queries |

---

## Next Steps

After mastering trigger fundamentals, proceed to:

**Runbook 2: Handler Pattern Architecture**
- Implement separation of concerns
- Build reusable handler classes
- Master recursion prevention strategies
- Create testable trigger logic

**Key Takeaways from Runbook 1**:
1. Triggers are the most powerful but complex automation tool
2. Use triggers for before-save logic and complex business rules
3. Avoid triggers for simple field updates (use flows/workflows)
4. Understand Order of Execution to prevent conflicts
5. Always bulkify (no SOQL/DML in loops)
6. One trigger per object (use handler pattern)
7. Implement recursion prevention
8. Test with 200 records

---

**Version History**:
- 1.0.0 (2025-11-23): Initial release

**Related Documentation**:
- Runbook 2: Handler Pattern Architecture
- Runbook 3: Bulkification Best Practices
- trigger-complexity-calculator.js documentation
- trigger-orchestrator agent documentation
