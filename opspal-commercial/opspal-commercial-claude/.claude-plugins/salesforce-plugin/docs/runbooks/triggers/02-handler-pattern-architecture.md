# Trigger Management Runbook 2: Handler Pattern Architecture

**Version**: 1.0.0
**Last Updated**: 2025-11-23
**Audience**: Salesforce Developers, Architects
**Prerequisites**: Runbook 1 - Trigger Fundamentals

---

## Table of Contents

1. [Introduction](#introduction)
2. [Why Handler Pattern?](#why-handler-pattern)
3. [Handler Architecture](#handler-architecture)
4. [Recursion Prevention Strategies](#recursion-prevention-strategies)
5. [Separation of Concerns](#separation-of-concerns)
6. [Testing Benefits](#testing-benefits)
7. [Implementation Guide](#implementation-guide)
8. [Migration from Direct Triggers](#migration-from-direct-triggers)
9. [Advanced Patterns](#advanced-patterns)
10. [Quick Reference](#quick-reference)

---

## Introduction

The **Handler Pattern** (also called **Trigger Framework**) is the industry-standard architecture for Apex triggers. Instead of writing business logic directly in the trigger, you delegate to a handler class that contains all logic organized into methods.

### Problem: Direct Trigger Logic

```apex
trigger OpportunityTrigger on Opportunity (before insert, before update, after insert, after update) {
    if (Trigger.isBefore) {
        if (Trigger.isInsert) {
            for (Opportunity opp : Trigger.new) {
                if (opp.Amount < 1000) {
                    opp.addError('Amount too low');
                }
                if (opp.StageName == null) {
                    opp.StageName = 'Prospecting';
                }
            }
        } else if (Trigger.isUpdate) {
            for (Opportunity opp : Trigger.new) {
                Opportunity oldOpp = Trigger.oldMap.get(opp.Id);
                if (opp.StageName != oldOpp.StageName) {
                    opp.LastStageChangeDate__c = System.today();
                }
            }
        }
    } else if (Trigger.isAfter) {
        if (Trigger.isInsert) {
            Set<Id> accountIds = new Set<Id>();
            for (Opportunity opp : Trigger.new) {
                accountIds.add(opp.AccountId);
            }
            List<Account> accounts = [SELECT Id FROM Account WHERE Id IN :accountIds];
            for (Account acc : accounts) {
                acc.LastOpportunityDate__c = System.today();
            }
            update accounts;
        } else if (Trigger.isUpdate) {
            // 200 more lines of logic...
        }
    }
}
```

**Problems**:
- ❌ 300+ lines of mixed logic in trigger file
- ❌ Difficult to test individual operations
- ❌ No code reuse between triggers
- ❌ No recursion prevention
- ❌ Nested if/else becomes unreadable
- ❌ Can't disable specific logic without deploying

### Solution: Handler Pattern

```apex
// Trigger (10 lines - minimal delegation logic)
trigger OpportunityTrigger on Opportunity (before insert, before update, after insert, after update) {
    if (Trigger.isBefore) {
        if (Trigger.isInsert) {
            OpportunityTriggerHandler.handleBeforeInsert(Trigger.new);
        } else if (Trigger.isUpdate) {
            OpportunityTriggerHandler.handleBeforeUpdate(Trigger.new, Trigger.oldMap);
        }
    } else if (Trigger.isAfter) {
        if (Trigger.isInsert) {
            OpportunityTriggerHandler.handleAfterInsert(Trigger.new);
        } else if (Trigger.isUpdate) {
            OpportunityTriggerHandler.handleAfterUpdate(Trigger.new, Trigger.oldMap);
        }
    }
}

// Handler (300 lines - organized, testable, reusable)
public class OpportunityTriggerHandler {
    private static Boolean isExecuting = false;

    public static void handleBeforeInsert(List<Opportunity> newOpps) {
        if (isExecuting) return;
        isExecuting = true;

        validateMinimumAmount(newOpps);
        setDefaultStage(newOpps);

        isExecuting = false;
    }

    public static void handleBeforeUpdate(List<Opportunity> newOpps, Map<Id, Opportunity> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        trackStageChanges(newOpps, oldMap);

        isExecuting = false;
    }

    public static void handleAfterInsert(List<Opportunity> newOpps) {
        if (isExecuting) return;
        isExecuting = true;

        updateAccountLastOpportunityDate(newOpps);

        isExecuting = false;
    }

    public static void handleAfterUpdate(List<Opportunity> newOpps, Map<Id, Opportunity> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        // Additional logic...

        isExecuting = false;
    }

    private static void validateMinimumAmount(List<Opportunity> opps) { /* ... */ }
    private static void setDefaultStage(List<Opportunity> opps) { /* ... */ }
    private static void trackStageChanges(List<Opportunity> opps, Map<Id, Opportunity> oldMap) { /* ... */ }
    private static void updateAccountLastOpportunityDate(List<Opportunity> opps) { /* ... */ }
}
```

**Benefits**:
- ✅ Clean separation: Trigger = routing, Handler = logic
- ✅ Testable methods (can call individually)
- ✅ Recursion prevention built-in
- ✅ Reusable helper methods
- ✅ Easy to disable specific logic
- ✅ Organized by operation type

---

## Why Handler Pattern?

### Benefit 1: Clean Separation of Concerns

**Principle**: One class, one responsibility

#### Without Handler (Mixed Responsibilities)
```apex
trigger AccountTrigger on Account (before insert, after update) {
    // Responsibility 1: Route to correct logic
    if (Trigger.isBefore && Trigger.isInsert) {
        // Responsibility 2: Validate data
        for (Account acc : Trigger.new) {
            if (acc.AnnualRevenue < 0) {
                acc.addError('Revenue cannot be negative');
            }
        }

        // Responsibility 3: Enrich data
        for (Account acc : Trigger.new) {
            if (acc.Industry == 'Technology') {
                acc.Rating = 'Hot';
            }
        }
    }

    // Responsibility 4: Update related records
    if (Trigger.isAfter && Trigger.isUpdate) {
        Set<Id> accountIds = new Set<Id>();
        for (Account acc : Trigger.new) {
            accountIds.add(acc.Id);
        }
        // 50 more lines...
    }
}
```

#### With Handler (Separated Responsibilities)
```apex
// Trigger: Responsibility 1 only (routing)
trigger AccountTrigger on Account (before insert, after update) {
    if (Trigger.isBefore && Trigger.isInsert) {
        AccountTriggerHandler.handleBeforeInsert(Trigger.new);
    } else if (Trigger.isAfter && Trigger.isUpdate) {
        AccountTriggerHandler.handleAfterUpdate(Trigger.new, Trigger.oldMap);
    }
}

// Handler: Responsibility 2-4 organized into methods
public class AccountTriggerHandler {
    public static void handleBeforeInsert(List<Account> newAccounts) {
        validateRevenue(newAccounts);  // Responsibility 2
        enrichIndustryData(newAccounts);  // Responsibility 3
    }

    public static void handleAfterUpdate(List<Account> newAccounts, Map<Id, Account> oldMap) {
        updateRelatedContacts(newAccounts, oldMap);  // Responsibility 4
    }

    private static void validateRevenue(List<Account> accounts) { /* ... */ }
    private static void enrichIndustryData(List<Account> accounts) { /* ... */ }
    private static void updateRelatedContacts(List<Account> accounts, Map<Id, Account> oldMap) { /* ... */ }
}
```

### Benefit 2: Improved Testability

#### Without Handler (Hard to Test)
```apex
trigger OpportunityTrigger on Opportunity (before insert) {
    for (Opportunity opp : Trigger.new) {
        if (opp.Amount < 1000) {
            opp.addError('Amount too low');
        }
    }
}

// Test class - must create records and perform DML to test
@isTest
class OpportunityTriggerTest {
    @isTest
    static void testMinimumAmount() {
        Opportunity opp = new Opportunity(Name = 'Test', Amount = 500, StageName = 'Prospecting', CloseDate = Date.today());

        Test.startTest();
        try {
            insert opp;  // ❌ Must execute full trigger to test
            System.assert(false, 'Should have thrown error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('Amount too low'));
        }
        Test.stopTest();
    }
}
```

#### With Handler (Easy to Test)
```apex
public class OpportunityTriggerHandler {
    public static void handleBeforeInsert(List<Opportunity> newOpps) {
        validateMinimumAmount(newOpps);
    }

    private static void validateMinimumAmount(List<Opportunity> opps) {
        for (Opportunity opp : opps) {
            if (opp.Amount < 1000) {
                opp.addError('Amount too low');
            }
        }
    }
}

// Test class - can test methods directly without DML
@isTest
class OpportunityTriggerHandlerTest {
    @isTest
    static void testMinimumAmount_Valid() {
        List<Opportunity> opps = new List<Opportunity>{
            new Opportunity(Amount = 5000)
        };

        Test.startTest();
        OpportunityTriggerHandler.validateMinimumAmount(opps);  // ✅ Direct method call
        Test.stopTest();

        // No error added
        System.assertEquals(0, opps[0].getErrors().size());
    }

    @isTest
    static void testMinimumAmount_Invalid() {
        List<Opportunity> opps = new List<Opportunity>{
            new Opportunity(Amount = 500)
        };

        Test.startTest();
        OpportunityTriggerHandler.validateMinimumAmount(opps);
        Test.stopTest();

        // Error was added
        System.assertEquals(1, opps[0].getErrors().size());
        System.assert(opps[0].getErrors()[0].getMessage().contains('Amount too low'));
    }
}
```

### Benefit 3: Code Reuse

#### Without Handler (Duplicate Logic)
```apex
// Lead trigger
trigger LeadTrigger on Lead (before insert) {
    for (Lead lead : Trigger.new) {
        if (lead.Email != null) {
            lead.Email = lead.Email.toLowerCase().trim();
        }
    }
}

// Contact trigger (duplicate logic!)
trigger ContactTrigger on Contact (before insert) {
    for (Contact con : Trigger.new) {
        if (con.Email != null) {
            con.Email = con.Email.toLowerCase().trim();
        }
    }
}
```

#### With Handler (Shared Utility Methods)
```apex
// Shared utility class
public class EmailUtility {
    public static String normalizeEmail(String email) {
        return email != null ? email.toLowerCase().trim() : null;
    }
}

// Lead handler
public class LeadTriggerHandler {
    public static void handleBeforeInsert(List<Lead> newLeads) {
        for (Lead lead : newLeads) {
            lead.Email = EmailUtility.normalizeEmail(lead.Email);
        }
    }
}

// Contact handler (reuses utility)
public class ContactTriggerHandler {
    public static void handleBeforeInsert(List<Contact> newContacts) {
        for (Contact con : newContacts) {
            con.Email = EmailUtility.normalizeEmail(con.Email);
        }
    }
}
```

### Benefit 4: Recursion Prevention

**Problem**: Triggers can fire themselves, causing infinite loops

```apex
trigger AccountTrigger on Account (after update) {
    List<Account> accountsToUpdate = new List<Account>();

    for (Account acc : Trigger.new) {
        Account accUpdate = new Account(Id = acc.Id);
        accUpdate.Description = 'Updated';
        accountsToUpdate.add(accUpdate);
    }

    update accountsToUpdate;  // ⚡ Fires trigger again → infinite loop!
}
```

**Solution**: Handler pattern with static boolean flag

```apex
public class AccountTriggerHandler {
    private static Boolean isExecuting = false;

    public static void handleAfterUpdate(List<Account> newAccounts, Map<Id, Account> oldMap) {
        if (isExecuting) return;  // ✅ Prevents recursion
        isExecuting = true;

        List<Account> accountsToUpdate = new List<Account>();
        for (Account acc : newAccounts) {
            Account accUpdate = new Account(Id = acc.Id);
            accUpdate.Description = 'Updated';
            accountsToUpdate.add(accUpdate);
        }

        update accountsToUpdate;  // Safe - recursion prevented

        isExecuting = false;  // Reset for next transaction
    }
}
```

### Benefit 5: Easier Maintenance

#### Scenario: Need to add new validation rule

**Without Handler**: Find correct location in 500-line trigger file
```apex
trigger OpportunityTrigger on Opportunity (before insert, before update, after insert, after update) {
    if (Trigger.isBefore) {
        if (Trigger.isInsert) {
            // 100 lines of existing logic
            // Where do I add new validation? Line 47? Line 82?
        }
    }
    // 400 more lines...
}
```

**With Handler**: Add method, call from handler method
```apex
public class OpportunityTriggerHandler {
    public static void handleBeforeInsert(List<Opportunity> newOpps) {
        validateMinimumAmount(newOpps);
        validateRequiredFields(newOpps);
        validateCloseDate(newOpps);  // ✅ New method added here
    }

    private static void validateCloseDate(List<Opportunity> opps) {
        // New validation logic
    }
}
```

---

## Handler Architecture

### Standard Handler Structure

```apex
public class ObjectNameTriggerHandler {
    // Recursion prevention
    private static Boolean isExecuting = false;

    // Public handler methods (one per trigger event)
    public static void handleBeforeInsert(List<SObject> newRecords) {
        if (isExecuting) return;
        isExecuting = true;

        // Call private helper methods
        method1(newRecords);
        method2(newRecords);

        isExecuting = false;
    }

    public static void handleBeforeUpdate(List<SObject> newRecords, Map<Id, SObject> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        // Call private helper methods
        method3(newRecords, oldMap);

        isExecuting = false;
    }

    public static void handleAfterInsert(List<SObject> newRecords) {
        if (isExecuting) return;
        isExecuting = true;

        // Call private helper methods
        method4(newRecords);

        isExecuting = false;
    }

    public static void handleAfterUpdate(List<SObject> newRecords, Map<Id, SObject> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        // Call private helper methods
        method5(newRecords, oldMap);

        isExecuting = false;
    }

    // Private helper methods (business logic)
    private static void method1(List<SObject> records) {
        // Implementation
    }

    private static void method2(List<SObject> records) {
        // Implementation
    }

    private static void method3(List<SObject> records, Map<Id, SObject> oldMap) {
        // Implementation
    }

    private static void method4(List<SObject> records) {
        // Implementation
    }

    private static void method5(List<SObject> records, Map<Id, SObject> oldMap) {
        // Implementation
    }
}
```

### Handler Method Naming Conventions

| Trigger Event | Handler Method Name |
|---------------|---------------------|
| before insert | `handleBeforeInsert(List<SObject>)` |
| before update | `handleBeforeUpdate(List<SObject>, Map<Id, SObject>)` |
| before delete | `handleBeforeDelete(List<SObject>)` |
| after insert | `handleAfterInsert(List<SObject>)` |
| after update | `handleAfterUpdate(List<SObject>, Map<Id, SObject>)` |
| after delete | `handleAfterDelete(List<SObject>)` |
| after undelete | `handleAfterUndelete(List<SObject>)` |

### Complete Example: Account Handler

```apex
// AccountTrigger.trigger
trigger AccountTrigger on Account (before insert, before update, after insert, after update, after delete) {
    if (Trigger.isBefore) {
        if (Trigger.isInsert) {
            AccountTriggerHandler.handleBeforeInsert(Trigger.new);
        } else if (Trigger.isUpdate) {
            AccountTriggerHandler.handleBeforeUpdate(Trigger.new, Trigger.oldMap);
        }
    } else if (Trigger.isAfter) {
        if (Trigger.isInsert) {
            AccountTriggerHandler.handleAfterInsert(Trigger.new);
        } else if (Trigger.isUpdate) {
            AccountTriggerHandler.handleAfterUpdate(Trigger.new, Trigger.oldMap);
        } else if (Trigger.isDelete) {
            AccountTriggerHandler.handleAfterDelete(Trigger.old);
        }
    }
}

// AccountTriggerHandler.cls
public class AccountTriggerHandler {
    private static Boolean isExecuting = false;

    // Before Insert Handler
    public static void handleBeforeInsert(List<Account> newAccounts) {
        if (isExecuting) return;
        isExecuting = true;

        setDefaultRating(newAccounts);
        normalizePhone(newAccounts);
        validateIndustry(newAccounts);

        isExecuting = false;
    }

    // Before Update Handler
    public static void handleBeforeUpdate(List<Account> newAccounts, Map<Id, Account> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        preventOwnerChange(newAccounts, oldMap);
        trackIndustryChange(newAccounts, oldMap);

        isExecuting = false;
    }

    // After Insert Handler
    public static void handleAfterInsert(List<Account> newAccounts) {
        if (isExecuting) return;
        isExecuting = true;

        createDefaultContact(newAccounts);
        sendWelcomeEmail(newAccounts);

        isExecuting = false;
    }

    // After Update Handler
    public static void handleAfterUpdate(List<Account> newAccounts, Map<Id, Account> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        updateRelatedOpportunities(newAccounts, oldMap);
        syncToExternalSystem(newAccounts, oldMap);

        isExecuting = false;
    }

    // After Delete Handler
    public static void handleAfterDelete(List<Account> oldAccounts) {
        if (isExecuting) return;
        isExecuting = true;

        archiveRelatedRecords(oldAccounts);

        isExecuting = false;
    }

    // Private Helper Methods

    private static void setDefaultRating(List<Account> accounts) {
        for (Account acc : accounts) {
            if (acc.Rating == null) {
                acc.Rating = acc.AnnualRevenue > 1000000 ? 'Hot' : 'Warm';
            }
        }
    }

    private static void normalizePhone(List<Account> accounts) {
        for (Account acc : accounts) {
            if (acc.Phone != null) {
                acc.Phone = acc.Phone.replaceAll('[^0-9]', '');
            }
        }
    }

    private static void validateIndustry(List<Account> accounts) {
        Set<String> validIndustries = new Set<String>{'Technology', 'Finance', 'Healthcare', 'Manufacturing'};

        for (Account acc : accounts) {
            if (acc.Industry != null && !validIndustries.contains(acc.Industry)) {
                acc.addError('Invalid industry. Must be: Technology, Finance, Healthcare, or Manufacturing');
            }
        }
    }

    private static void preventOwnerChange(List<Account> accounts, Map<Id, Account> oldMap) {
        for (Account acc : accounts) {
            Account oldAcc = oldMap.get(acc.Id);
            if (acc.OwnerId != oldAcc.OwnerId && acc.AnnualRevenue > 10000000) {
                acc.addError('Cannot change owner for enterprise accounts (>$10M revenue)');
            }
        }
    }

    private static void trackIndustryChange(List<Account> accounts, Map<Id, Account> oldMap) {
        for (Account acc : accounts) {
            Account oldAcc = oldMap.get(acc.Id);
            if (acc.Industry != oldAcc.Industry) {
                acc.IndustryChangeDate__c = System.today();
            }
        }
    }

    private static void createDefaultContact(List<Account> accounts) {
        List<Contact> contactsToInsert = new List<Contact>();

        for (Account acc : accounts) {
            Contact con = new Contact(
                AccountId = acc.Id,
                FirstName = 'Primary',
                LastName = 'Contact',
                Email = 'contact@' + (acc.Website != null ? acc.Website : 'example.com')
            );
            contactsToInsert.add(con);
        }

        if (!contactsToInsert.isEmpty()) {
            insert contactsToInsert;
        }
    }

    private static void sendWelcomeEmail(List<Account> accounts) {
        // Email sending logic
    }

    private static void updateRelatedOpportunities(List<Account> accounts, Map<Id, Account> oldMap) {
        Set<Id> accountIdsWithOwnerChange = new Set<Id>();

        for (Account acc : accounts) {
            Account oldAcc = oldMap.get(acc.Id);
            if (acc.OwnerId != oldAcc.OwnerId) {
                accountIdsWithOwnerChange.add(acc.Id);
            }
        }

        if (!accountIdsWithOwnerChange.isEmpty()) {
            List<Opportunity> oppsToUpdate = [
                SELECT Id, OwnerId, AccountId
                FROM Opportunity
                WHERE AccountId IN :accountIdsWithOwnerChange
            ];

            for (Opportunity opp : oppsToUpdate) {
                for (Account acc : accounts) {
                    if (opp.AccountId == acc.Id) {
                        opp.OwnerId = acc.OwnerId;
                        break;
                    }
                }
            }

            update oppsToUpdate;
        }
    }

    private static void syncToExternalSystem(List<Account> accounts, Map<Id, Account> oldMap) {
        // External system integration logic
    }

    private static void archiveRelatedRecords(List<Account> accounts) {
        // Archival logic
    }
}
```

---

## Recursion Prevention Strategies

Triggers can fire themselves through DML operations, workflow field updates, or process builder actions. Without recursion prevention, this causes infinite loops and governor limit errors.

### Strategy 1: Simple Boolean Flag (Most Common)

**Use Case**: Single trigger execution per transaction

```apex
public class AccountTriggerHandler {
    private static Boolean isExecuting = false;

    public static void handleAfterUpdate(List<Account> newAccounts, Map<Id, Account> oldMap) {
        if (isExecuting) return;  // Exit if already executing
        isExecuting = true;

        // Business logic that might cause recursion
        List<Account> accountsToUpdate = new List<Account>();
        for (Account acc : newAccounts) {
            Account accUpdate = new Account(Id = acc.Id);
            accUpdate.Description = 'Updated at ' + System.now();
            accountsToUpdate.add(accUpdate);
        }
        update accountsToUpdate;  // This fires trigger again, but isExecuting prevents re-entry

        isExecuting = false;  // Reset for next transaction
    }
}
```

**How It Works**:
1. First execution: `isExecuting = false`, continues
2. Sets `isExecuting = true`
3. DML operation fires trigger again
4. Second execution: `isExecuting = true`, returns immediately
5. Resets `isExecuting = false` after completion

**Limitation**: Prevents ALL recursion, even when you might want multiple executions

### Strategy 2: Record-Level Tracking (Granular Control)

**Use Case**: Allow recursion for different records, prevent for same record

```apex
public class OpportunityTriggerHandler {
    private static Set<Id> processedRecordIds = new Set<Id>();

    public static void handleAfterUpdate(List<Opportunity> newOpps, Map<Id, Opportunity> oldMap) {
        List<Opportunity> oppsToProcess = new List<Opportunity>();

        // Only process records we haven't seen yet
        for (Opportunity opp : newOpps) {
            if (!processedRecordIds.contains(opp.Id)) {
                processedRecordIds.add(opp.Id);
                oppsToProcess.add(opp);
            }
        }

        if (!oppsToProcess.isEmpty()) {
            updateRelatedRecords(oppsToProcess, oldMap);
        }
    }

    private static void updateRelatedRecords(List<Opportunity> opps, Map<Id, Opportunity> oldMap) {
        // Business logic
    }
}
```

**How It Works**:
1. Maintains `Set<Id>` of processed record IDs
2. On each execution, checks if record ID already processed
3. Only processes records not in the set
4. Adds processed record IDs to set

**Benefit**: Allows trigger to fire for Record A while preventing recursion for Record B

### Strategy 3: Context-Specific Flags (Most Flexible)

**Use Case**: Different operations need different recursion rules

```apex
public class AccountTriggerHandler {
    private static Boolean ownerChangeProcessing = false;
    private static Boolean industryChangeProcessing = false;
    private static Boolean addressChangeProcessing = false;

    public static void handleAfterUpdate(List<Account> newAccounts, Map<Id, Account> oldMap) {
        processOwnerChanges(newAccounts, oldMap);
        processIndustryChanges(newAccounts, oldMap);
        processAddressChanges(newAccounts, oldMap);
    }

    private static void processOwnerChanges(List<Account> accounts, Map<Id, Account> oldMap) {
        if (ownerChangeProcessing) return;
        ownerChangeProcessing = true;

        List<Account> accountsWithOwnerChange = new List<Account>();
        for (Account acc : accounts) {
            Account oldAcc = oldMap.get(acc.Id);
            if (acc.OwnerId != oldAcc.OwnerId) {
                accountsWithOwnerChange.add(acc);
            }
        }

        if (!accountsWithOwnerChange.isEmpty()) {
            // Update related opportunities
            Set<Id> accountIds = new Set<Id>();
            for (Account acc : accountsWithOwnerChange) {
                accountIds.add(acc.Id);
            }

            List<Opportunity> opps = [SELECT Id, OwnerId, AccountId FROM Opportunity WHERE AccountId IN :accountIds];
            for (Opportunity opp : opps) {
                for (Account acc : accountsWithOwnerChange) {
                    if (opp.AccountId == acc.Id) {
                        opp.OwnerId = acc.OwnerId;
                        break;
                    }
                }
            }
            update opps;  // Safe - ownerChangeProcessing prevents recursion
        }

        ownerChangeProcessing = false;
    }

    private static void processIndustryChanges(List<Account> accounts, Map<Id, Account> oldMap) {
        if (industryChangeProcessing) return;
        industryChangeProcessing = true;

        // Industry change logic...

        industryChangeProcessing = false;
    }

    private static void processAddressChanges(List<Account> accounts, Map<Id, Account> oldMap) {
        if (addressChangeProcessing) return;
        addressChangeProcessing = true;

        // Address change logic...

        addressChangeProcessing = false;
    }
}
```

**How It Works**:
- Separate boolean flag for each operation type
- Owner change can execute while industry change is blocked
- Allows fine-grained control over recursion

**Use Case Example**:
- Owner change updates related opportunities
- Industry change updates related contacts
- Both can execute in same transaction without interfering

### Strategy 4: Execution Counter (Controlled Recursion)

**Use Case**: Allow limited number of recursive executions

```apex
public class AccountTriggerHandler {
    private static Integer executionCount = 0;
    private static final Integer MAX_EXECUTIONS = 3;

    public static void handleAfterUpdate(List<Account> newAccounts, Map<Id, Account> oldMap) {
        executionCount++;

        if (executionCount > MAX_EXECUTIONS) {
            System.debug('Max execution count reached: ' + executionCount);
            return;
        }

        // Business logic that might cause recursion
        List<Account> accountsToUpdate = new List<Account>();
        for (Account acc : newAccounts) {
            if (executionCount < MAX_EXECUTIONS) {
                Account accUpdate = new Account(Id = acc.Id);
                accUpdate.Description = 'Updated ' + executionCount + ' times';
                accountsToUpdate.add(accUpdate);
            }
        }

        if (!accountsToUpdate.isEmpty()) {
            update accountsToUpdate;
        }
    }
}
```

**How It Works**:
- Increments counter on each execution
- Allows processing up to `MAX_EXECUTIONS` times
- Exits when limit reached

**Use Case**: Cascade updates that legitimately need 2-3 executions

### Choosing the Right Strategy

| Strategy | Use When | Pros | Cons |
|----------|----------|------|------|
| **Simple Boolean** | Most scenarios, single operation | Easy to implement, covers 95% of cases | Blocks all recursion |
| **Record-Level Tracking** | Need to process different records differently | Granular control per record | More complex |
| **Context-Specific Flags** | Multiple independent operations | Most flexible, operation-specific control | Most complex |
| **Execution Counter** | Legitimate cascade updates | Allows controlled recursion | Can mask infinite loop bugs |

**Recommendation**: Start with **Simple Boolean Flag** (Strategy 1). Only use more complex strategies when you have a proven need.

---

## Separation of Concerns

### Organizing Handler Methods by Functionality

**Poor Organization**: All logic in one method
```apex
public static void handleBeforeInsert(List<Opportunity> newOpps) {
    // 200 lines of mixed validation, enrichment, and calculation logic
}
```

**Good Organization**: Methods grouped by functionality
```apex
public static void handleBeforeInsert(List<Opportunity> newOpps) {
    // Data Validation
    validateRequiredFields(newOpps);
    validateAmount(newOpps);
    validateCloseDate(newOpps);

    // Data Enrichment
    setDefaultStage(newOpps);
    enrichAccountData(newOpps);

    // Calculations
    calculateProbability(newOpps);
    calculateExpectedRevenue(newOpps);
}
```

### Method Categorization

#### Category 1: Validation Methods
**Purpose**: Enforce business rules, add errors

**Naming**: `validate{What}`, `check{What}`, `ensure{What}`

```apex
private static void validateAmount(List<Opportunity> opps) {
    for (Opportunity opp : opps) {
        if (opp.Amount < 1000) {
            opp.addError('Minimum opportunity amount is $1,000');
        }
    }
}

private static void validateCloseDate(List<Opportunity> opps) {
    Date today = System.today();
    for (Opportunity opp : opps) {
        if (opp.CloseDate < today) {
            opp.addError('Close date cannot be in the past');
        }
    }
}

private static void checkDuplicates(List<Lead> leads) {
    Set<String> emails = new Set<String>();
    for (Lead lead : leads) {
        if (lead.Email != null) {
            emails.add(lead.Email.toLowerCase());
        }
    }

    List<Lead> existingLeads = [SELECT Email FROM Lead WHERE Email IN :emails];
    Set<String> existingEmails = new Set<String>();
    for (Lead existing : existingLeads) {
        existingEmails.add(existing.Email.toLowerCase());
    }

    for (Lead lead : leads) {
        if (lead.Email != null && existingEmails.contains(lead.Email.toLowerCase())) {
            lead.addError('A lead with this email already exists');
        }
    }
}
```

#### Category 2: Enrichment Methods
**Purpose**: Calculate and set field values

**Naming**: `set{What}`, `calculate{What}`, `enrich{What}`, `populate{What}`

```apex
private static void setDefaultStage(List<Opportunity> opps) {
    for (Opportunity opp : opps) {
        if (opp.StageName == null) {
            opp.StageName = 'Prospecting';
        }
    }
}

private static void calculateProbability(List<Opportunity> opps) {
    Map<String, Integer> stageProbability = new Map<String, Integer>{
        'Prospecting' => 10,
        'Qualification' => 25,
        'Proposal' => 50,
        'Negotiation' => 75,
        'Closed Won' => 100
    };

    for (Opportunity opp : opps) {
        if (stageProbability.containsKey(opp.StageName)) {
            opp.Probability = stageProbability.get(opp.StageName);
        }
    }
}

private static void enrichAccountData(List<Opportunity> opps) {
    Set<Id> accountIds = new Set<Id>();
    for (Opportunity opp : opps) {
        if (opp.AccountId != null) {
            accountIds.add(opp.AccountId);
        }
    }

    if (!accountIds.isEmpty()) {
        Map<Id, Account> accountMap = new Map<Id, Account>([
            SELECT Id, Industry, AnnualRevenue
            FROM Account
            WHERE Id IN :accountIds
        ]);

        for (Opportunity opp : opps) {
            if (opp.AccountId != null) {
                Account acc = accountMap.get(opp.AccountId);
                if (acc != null) {
                    opp.Industry__c = acc.Industry;
                    opp.AccountRevenue__c = acc.AnnualRevenue;
                }
            }
        }
    }
}
```

#### Category 3: Update Methods
**Purpose**: Update related records (after triggers only)

**Naming**: `update{What}`, `sync{What}`, `cascade{What}`

```apex
private static void updateAccountOpportunityCount(List<Opportunity> opps) {
    Set<Id> accountIds = new Set<Id>();
    for (Opportunity opp : opps) {
        accountIds.add(opp.AccountId);
    }

    List<Account> accounts = [
        SELECT Id, (SELECT Id FROM Opportunities)
        FROM Account
        WHERE Id IN :accountIds
    ];

    for (Account acc : accounts) {
        acc.NumberOfEmployees = acc.Opportunities.size();
    }

    update accounts;
}

private static void syncToExternalSystem(List<Opportunity> opps, Map<Id, Opportunity> oldMap) {
    List<Opportunity> oppsToSync = new List<Opportunity>();

    for (Opportunity opp : opps) {
        Opportunity oldOpp = oldMap.get(opp.Id);
        if (opp.Amount != oldOpp.Amount || opp.StageName != oldOpp.StageName) {
            oppsToSync.add(opp);
        }
    }

    if (!oppsToSync.isEmpty()) {
        ExternalSystemIntegration.syncOpportunities(oppsToSync);
    }
}
```

#### Category 4: Notification Methods
**Purpose**: Send emails, create tasks, log events

**Naming**: `send{What}`, `create{What}`, `log{What}`, `notify{What}`

```apex
private static void sendManagerNotification(List<Opportunity> opps) {
    List<Messaging.SingleEmailMessage> emails = new List<Messaging.SingleEmailMessage>();

    for (Opportunity opp : opps) {
        if (opp.Amount > 1000000) {
            Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
            email.setToAddresses(new List<String>{'manager@example.com'});
            email.setSubject('Large Opportunity Created: ' + opp.Name);
            email.setPlainTextBody('Amount: $' + opp.Amount);
            emails.add(email);
        }
    }

    if (!emails.isEmpty()) {
        Messaging.sendEmail(emails);
    }
}

private static void createFollowUpTasks(List<Lead> leads) {
    List<Task> tasksToInsert = new List<Task>();

    for (Lead lead : leads) {
        if (lead.Status == 'Open - Not Contacted') {
            Task followUp = new Task(
                WhoId = lead.Id,
                Subject = 'Follow up with new lead',
                ActivityDate = System.today().addDays(1),
                Priority = 'High'
            );
            tasksToInsert.add(followUp);
        }
    }

    if (!tasksToInsert.isEmpty()) {
        insert tasksToInsert;
    }
}
```

---

## Testing Benefits

### Benefit 1: Test Individual Methods

Without handler, you must test the entire trigger by inserting/updating records:

```apex
// ❌ Without Handler - Must test via DML
@isTest
class OpportunityTriggerTest {
    @isTest
    static void testMinimumAmount() {
        Test.startTest();
        try {
            Opportunity opp = new Opportunity(
                Name = 'Test',
                Amount = 500,
                StageName = 'Prospecting',
                CloseDate = Date.today()
            );
            insert opp;  // Full trigger executes
            System.assert(false, 'Should fail');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('Minimum'));
        }
        Test.stopTest();
    }
}
```

With handler, you can test methods directly:

```apex
// ✅ With Handler - Test methods directly
@isTest
class OpportunityTriggerHandlerTest {
    @isTest
    static void testValidateAmount_Valid() {
        List<Opportunity> opps = new List<Opportunity>{
            new Opportunity(Amount = 5000)
        };

        Test.startTest();
        OpportunityTriggerHandler.validateAmount(opps);
        Test.stopTest();

        System.assertEquals(0, opps[0].getErrors().size(), 'Should have no errors');
    }

    @isTest
    static void testValidateAmount_Invalid() {
        List<Opportunity> opps = new List<Opportunity>{
            new Opportunity(Amount = 500)
        };

        Test.startTest();
        OpportunityTriggerHandler.validateAmount(opps);
        Test.stopTest();

        System.assertEquals(1, opps[0].getErrors().size(), 'Should have error');
    }
}
```

### Benefit 2: Bulk Testing

Test with 200 records easily:

```apex
@isTest
class OpportunityTriggerHandlerTest {
    @isTest
    static void testBulkInsert() {
        List<Opportunity> opps = new List<Opportunity>();

        for (Integer i = 0; i < 200; i++) {
            opps.add(new Opportunity(
                Name = 'Test ' + i,
                Amount = 1000 + i,
                StageName = 'Prospecting',
                CloseDate = Date.today()
            ));
        }

        Test.startTest();
        insert opps;  // Handler processes all 200
        Test.stopTest();

        // Verify all processed correctly
        List<Opportunity> inserted = [SELECT Id, Probability FROM Opportunity];
        System.assertEquals(200, inserted.size());
        for (Opportunity opp : inserted) {
            System.assertEquals(10, opp.Probability, 'Probability should be set');
        }
    }
}
```

### Benefit 3: Test Recursion Prevention

```apex
@isTest
class AccountTriggerHandlerTest {
    @isTest
    static void testRecursionPrevention() {
        Account acc = new Account(Name = 'Test Account');
        insert acc;

        Test.startTest();
        acc.Description = 'Updated';
        update acc;  // Trigger fires

        // Trigger updates Description again internally
        // Recursion prevention should allow exactly 1 update

        Test.stopTest();

        Account updated = [SELECT Description FROM Account WHERE Id = :acc.Id];
        System.assertNotEquals(null, updated.Description);
    }
}
```

---

## Implementation Guide

### Step 1: Create Minimal Trigger

```apex
trigger OpportunityTrigger on Opportunity (before insert, before update, after insert, after update) {
    if (Trigger.isBefore) {
        if (Trigger.isInsert) {
            OpportunityTriggerHandler.handleBeforeInsert(Trigger.new);
        } else if (Trigger.isUpdate) {
            OpportunityTriggerHandler.handleBeforeUpdate(Trigger.new, Trigger.oldMap);
        }
    } else if (Trigger.isAfter) {
        if (Trigger.isInsert) {
            OpportunityTriggerHandler.handleAfterInsert(Trigger.new);
        } else if (Trigger.isUpdate) {
            OpportunityTriggerHandler.handleAfterUpdate(Trigger.new, Trigger.oldMap);
        }
    }
}
```

### Step 2: Create Handler Class

```apex
public class OpportunityTriggerHandler {
    private static Boolean isExecuting = false;

    public static void handleBeforeInsert(List<Opportunity> newOpps) {
        if (isExecuting) return;
        isExecuting = true;

        // Call helper methods here

        isExecuting = false;
    }

    public static void handleBeforeUpdate(List<Opportunity> newOpps, Map<Id, Opportunity> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        // Call helper methods here

        isExecuting = false;
    }

    public static void handleAfterInsert(List<Opportunity> newOpps) {
        if (isExecuting) return;
        isExecuting = true;

        // Call helper methods here

        isExecuting = false;
    }

    public static void handleAfterUpdate(List<Opportunity> newOpps, Map<Id, Opportunity> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        // Call helper methods here

        isExecuting = false;
    }
}
```

### Step 3: Add Helper Methods

```apex
public class OpportunityTriggerHandler {
    private static Boolean isExecuting = false;

    public static void handleBeforeInsert(List<Opportunity> newOpps) {
        if (isExecuting) return;
        isExecuting = true;

        validateAmount(newOpps);
        setDefaultStage(newOpps);
        calculateProbability(newOpps);

        isExecuting = false;
    }

    private static void validateAmount(List<Opportunity> opps) {
        for (Opportunity opp : opps) {
            if (opp.Amount < 1000) {
                opp.addError('Minimum amount is $1,000');
            }
        }
    }

    private static void setDefaultStage(List<Opportunity> opps) {
        for (Opportunity opp : opps) {
            if (opp.StageName == null) {
                opp.StageName = 'Prospecting';
            }
        }
    }

    private static void calculateProbability(List<Opportunity> opps) {
        Map<String, Integer> stageProbability = new Map<String, Integer>{
            'Prospecting' => 10,
            'Qualification' => 25,
            'Proposal' => 50
        };

        for (Opportunity opp : opps) {
            if (stageProbability.containsKey(opp.StageName)) {
                opp.Probability = stageProbability.get(opp.StageName);
            }
        }
    }
}
```

### Step 4: Create Test Class

```apex
@isTest
class OpportunityTriggerHandlerTest {
    @isTest
    static void testBeforeInsert() {
        List<Opportunity> opps = new List<Opportunity>();

        for (Integer i = 0; i < 200; i++) {
            opps.add(new Opportunity(
                Name = 'Test ' + i,
                Amount = 2000,
                StageName = 'Prospecting',
                CloseDate = Date.today()
            ));
        }

        Test.startTest();
        insert opps;
        Test.stopTest();

        List<Opportunity> inserted = [SELECT Probability FROM Opportunity];
        System.assertEquals(200, inserted.size());
        for (Opportunity opp : inserted) {
            System.assertEquals(10, opp.Probability);
        }
    }

    @isTest
    static void testValidateAmount_Invalid() {
        Opportunity opp = new Opportunity(
            Name = 'Test',
            Amount = 500,
            StageName = 'Prospecting',
            CloseDate = Date.today()
        );

        Test.startTest();
        try {
            insert opp;
            System.assert(false, 'Should fail validation');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('Minimum amount'));
        }
        Test.stopTest();
    }
}
```

---

## Migration from Direct Triggers

### Scenario: Existing Trigger with Direct Logic

**Before (Direct Logic)**:
```apex
trigger AccountTrigger on Account (before insert, after update) {
    if (Trigger.isBefore && Trigger.isInsert) {
        for (Account acc : Trigger.new) {
            if (acc.Rating == null) {
                acc.Rating = 'Warm';
            }
            if (acc.Phone != null) {
                acc.Phone = acc.Phone.replaceAll('[^0-9]', '');
            }
        }
    }

    if (Trigger.isAfter && Trigger.isUpdate) {
        Set<Id> accountIds = new Set<Id>();
        for (Account acc : Trigger.new) {
            Account oldAcc = Trigger.oldMap.get(acc.Id);
            if (acc.OwnerId != oldAcc.OwnerId) {
                accountIds.add(acc.Id);
            }
        }

        if (!accountIds.isEmpty()) {
            List<Opportunity> opps = [SELECT Id, OwnerId, AccountId FROM Opportunity WHERE AccountId IN :accountIds];
            for (Opportunity opp : opps) {
                for (Account acc : Trigger.new) {
                    if (opp.AccountId == acc.Id) {
                        opp.OwnerId = acc.OwnerId;
                        break;
                    }
                }
            }
            update opps;
        }
    }
}
```

### Migration Steps

#### Step 1: Create Handler Class Structure
```apex
public class AccountTriggerHandler {
    private static Boolean isExecuting = false;

    public static void handleBeforeInsert(List<Account> newAccounts) {
        if (isExecuting) return;
        isExecuting = true;

        // Move before insert logic here

        isExecuting = false;
    }

    public static void handleAfterUpdate(List<Account> newAccounts, Map<Id, Account> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        // Move after update logic here

        isExecuting = false;
    }
}
```

#### Step 2: Extract Logic into Helper Methods
```apex
public class AccountTriggerHandler {
    private static Boolean isExecuting = false;

    public static void handleBeforeInsert(List<Account> newAccounts) {
        if (isExecuting) return;
        isExecuting = true;

        setDefaultRating(newAccounts);
        normalizePhone(newAccounts);

        isExecuting = false;
    }

    public static void handleAfterUpdate(List<Account> newAccounts, Map<Id, Account> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        cascadeOwnerChange(newAccounts, oldMap);

        isExecuting = false;
    }

    private static void setDefaultRating(List<Account> accounts) {
        for (Account acc : accounts) {
            if (acc.Rating == null) {
                acc.Rating = 'Warm';
            }
        }
    }

    private static void normalizePhone(List<Account> accounts) {
        for (Account acc : accounts) {
            if (acc.Phone != null) {
                acc.Phone = acc.Phone.replaceAll('[^0-9]', '');
            }
        }
    }

    private static void cascadeOwnerChange(List<Account> accounts, Map<Id, Account> oldMap) {
        Set<Id> accountIdsWithOwnerChange = new Set<Id>();

        for (Account acc : accounts) {
            Account oldAcc = oldMap.get(acc.Id);
            if (acc.OwnerId != oldAcc.OwnerId) {
                accountIdsWithOwnerChange.add(acc.Id);
            }
        }

        if (!accountIdsWithOwnerChange.isEmpty()) {
            List<Opportunity> opps = [
                SELECT Id, OwnerId, AccountId
                FROM Opportunity
                WHERE AccountId IN :accountIdsWithOwnerChange
            ];

            for (Opportunity opp : opps) {
                for (Account acc : accounts) {
                    if (opp.AccountId == acc.Id) {
                        opp.OwnerId = acc.OwnerId;
                        break;
                    }
                }
            }

            update opps;
        }
    }
}
```

#### Step 3: Update Trigger to Use Handler
```apex
trigger AccountTrigger on Account (before insert, after update) {
    if (Trigger.isBefore && Trigger.isInsert) {
        AccountTriggerHandler.handleBeforeInsert(Trigger.new);
    } else if (Trigger.isAfter && Trigger.isUpdate) {
        AccountTriggerHandler.handleAfterUpdate(Trigger.new, Trigger.oldMap);
    }
}
```

#### Step 4: Create Tests
```apex
@isTest
class AccountTriggerHandlerTest {
    @isTest
    static void testSetDefaultRating() {
        List<Account> accounts = new List<Account>{
            new Account(Name = 'Test', Rating = null)
        };

        Test.startTest();
        AccountTriggerHandler.setDefaultRating(accounts);
        Test.stopTest();

        System.assertEquals('Warm', accounts[0].Rating);
    }

    @isTest
    static void testNormalizePhone() {
        List<Account> accounts = new List<Account>{
            new Account(Phone = '(555) 123-4567')
        };

        Test.startTest();
        AccountTriggerHandler.normalizePhone(accounts);
        Test.stopTest();

        System.assertEquals('5551234567', accounts[0].Phone);
    }

    @isTest
    static void testCascadeOwnerChange() {
        Account acc = new Account(Name = 'Test Account');
        insert acc;

        Opportunity opp = new Opportunity(
            Name = 'Test Opp',
            AccountId = acc.Id,
            StageName = 'Prospecting',
            CloseDate = Date.today()
        );
        insert opp;

        User newOwner = [SELECT Id FROM User WHERE Id != :acc.OwnerId LIMIT 1];

        Test.startTest();
        acc.OwnerId = newOwner.Id;
        update acc;
        Test.stopTest();

        Opportunity updated = [SELECT OwnerId FROM Opportunity WHERE Id = :opp.Id];
        System.assertEquals(newOwner.Id, updated.OwnerId);
    }
}
```

---

## Advanced Patterns

### Pattern 1: Conditional Logic Execution

**Use Case**: Only execute certain logic if specific criteria met

```apex
public static void handleAfterUpdate(List<Opportunity> newOpps, Map<Id, Opportunity> oldMap) {
    if (isExecuting) return;
    isExecuting = true;

    // Only process opportunities that changed stage
    List<Opportunity> oppsWithStageChange = new List<Opportunity>();
    for (Opportunity opp : newOpps) {
        Opportunity oldOpp = oldMap.get(opp.Id);
        if (opp.StageName != oldOpp.StageName) {
            oppsWithStageChange.add(opp);
        }
    }

    if (!oppsWithStageChange.isEmpty()) {
        processStageChange(oppsWithStageChange, oldMap);
    }

    isExecuting = false;
}
```

### Pattern 2: Shared Utility Classes

**Use Case**: Reuse logic across multiple handlers

```apex
// Shared utility class
public class ValidationUtility {
    public static void validateEmail(String email, SObject record, String fieldName) {
        if (email != null && !email.contains('@')) {
            record.addError(fieldName, 'Invalid email format');
        }
    }

    public static void validatePhone(String phone, SObject record, String fieldName) {
        if (phone != null && phone.length() < 10) {
            record.addError(fieldName, 'Phone number must be at least 10 digits');
        }
    }
}

// Lead handler uses utility
public class LeadTriggerHandler {
    public static void handleBeforeInsert(List<Lead> newLeads) {
        for (Lead lead : newLeads) {
            ValidationUtility.validateEmail(lead.Email, lead, 'Email');
            ValidationUtility.validatePhone(lead.Phone, lead, 'Phone');
        }
    }
}

// Contact handler uses same utility
public class ContactTriggerHandler {
    public static void handleBeforeInsert(List<Contact> newContacts) {
        for (Contact con : newContacts) {
            ValidationUtility.validateEmail(con.Email, con, 'Email');
            ValidationUtility.validatePhone(con.Phone, con, 'Phone');
        }
    }
}
```

### Pattern 3: Strategy Pattern for Complex Logic

**Use Case**: Different logic based on record type or other criteria

```apex
public class OpportunityTriggerHandler {
    public static void handleBeforeInsert(List<Opportunity> newOpps) {
        for (Opportunity opp : newOpps) {
            IOpportunityStrategy strategy = getStrategy(opp);
            strategy.processOpportunity(opp);
        }
    }

    private static IOpportunityStrategy getStrategy(Opportunity opp) {
        if (opp.Type == 'New Business') {
            return new NewBusinessStrategy();
        } else if (opp.Type == 'Renewal') {
            return new RenewalStrategy();
        } else {
            return new DefaultStrategy();
        }
    }
}

public interface IOpportunityStrategy {
    void processOpportunity(Opportunity opp);
}

public class NewBusinessStrategy implements IOpportunityStrategy {
    public void processOpportunity(Opportunity opp) {
        opp.Probability = 10;
        opp.LeadSource = 'Marketing';
    }
}

public class RenewalStrategy implements IOpportunityStrategy {
    public void processOpportunity(Opportunity opp) {
        opp.Probability = 75;
        opp.LeadSource = 'Customer';
    }
}
```

---

## Quick Reference

### Handler Template

```apex
public class ObjectNameTriggerHandler {
    private static Boolean isExecuting = false;

    public static void handleBeforeInsert(List<SObject> newRecords) {
        if (isExecuting) return;
        isExecuting = true;
        // Logic here
        isExecuting = false;
    }

    public static void handleBeforeUpdate(List<SObject> newRecords, Map<Id, SObject> oldMap) {
        if (isExecuting) return;
        isExecuting = true;
        // Logic here
        isExecuting = false;
    }

    public static void handleAfterInsert(List<SObject> newRecords) {
        if (isExecuting) return;
        isExecuting = true;
        // Logic here
        isExecuting = false;
    }

    public static void handleAfterUpdate(List<SObject> newRecords, Map<Id, SObject> oldMap) {
        if (isExecuting) return;
        isExecuting = true;
        // Logic here
        isExecuting = false;
    }
}
```

### Recursion Prevention Comparison

| Strategy | Code | Use Case |
|----------|------|----------|
| **Simple Boolean** | `if (isExecuting) return; isExecuting = true;` | Most scenarios |
| **Record-Level** | `if (!processedIds.contains(id)) { processedIds.add(id); }` | Different records need different handling |
| **Context-Specific** | `if (ownerChangeProcessing) return; ownerChangeProcessing = true;` | Multiple independent operations |
| **Execution Counter** | `if (count > MAX) return; count++;` | Legitimate cascade updates |

---

## Next Steps

After mastering handler pattern architecture, proceed to:

**Runbook 3: Bulkification Best Practices**
- Master governor limits
- Implement collection-based patterns
- Optimize SOQL queries
- Avoid common bulkification pitfalls

**Key Takeaways from Runbook 2**:
1. Handler pattern = Trigger (routing) + Handler (logic)
2. Implement recursion prevention (usually simple boolean flag)
3. Organize methods by functionality (validation, enrichment, updates)
4. Test handler methods directly without DML
5. Migrate existing triggers incrementally
6. Use shared utility classes for common logic
7. One trigger per object, all logic in handler

---

**Version History**:
- 1.0.0 (2025-11-23): Initial release

**Related Documentation**:
- Runbook 1: Trigger Fundamentals
- Runbook 3: Bulkification Best Practices
- trigger-segmentation-specialist agent documentation
