# Trigger Management Runbook 4: Testing and Code Coverage

**Version**: 1.0.0
**Last Updated**: 2025-11-23
**Audience**: Salesforce Developers, QA Engineers
**Prerequisites**: Runbook 1-3 (Fundamentals, Handler Pattern, Bulkification)

---

## Table of Contents

1. [Introduction](#introduction)
2. [Test Class Structure](#test-class-structure)
3. [Test Data Factories](#test-data-factories)
4. [Bulk Testing Strategies](#bulk-testing-strategies)
5. [Testing Recursion Prevention](#testing-recursion-prevention)
6. [Code Coverage Requirements](#code-coverage-requirements)
7. [Common Testing Pitfalls](#common-testing-pitfalls)
8. [Advanced Testing Patterns](#advanced-testing-patterns)
9. [Debugging Failed Tests](#debugging-failed-tests)
10. [Quick Reference](#quick-reference)

---

## Introduction

Salesforce requires **75% code coverage** for production deployments. But good tests do more than meet coverage requirements—they verify business logic, catch regressions, and document expected behavior.

### Why Testing Matters for Triggers

1. **Governor Limit Verification**: Ensure bulk operations don't hit limits
2. **Business Logic Validation**: Confirm triggers behave correctly
3. **Regression Prevention**: Catch breaks when code changes
4. **Deployment Requirement**: 75% coverage required for production
5. **Documentation**: Tests show how code should behave

### Testing Philosophy

**Bad Test**: Achieves coverage, doesn't verify behavior
```apex
@isTest
static void testTrigger() {
    Account acc = new Account(Name = 'Test');
    insert acc;  // Achieves coverage
    // No assertions!
}
```

**Good Test**: Verifies expected behavior with assertions
```apex
@isTest
static void testTrigger_SetsDefaultRating() {
    Account acc = new Account(Name = 'Test');

    Test.startTest();
    insert acc;
    Test.stopTest();

    Account inserted = [SELECT Rating FROM Account WHERE Id = :acc.Id];
    System.assertEquals('Warm', inserted.Rating, 'Trigger should set default rating to Warm');
}
```

---

## Test Class Structure

### Basic Test Class Template

```apex
@isTest
private class ObjectNameTriggerHandlerTest {

    // Test data factory methods
    private static Account createTestAccount() {
        return new Account(
            Name = 'Test Account',
            Industry = 'Technology'
        );
    }

    // Test before insert logic
    @isTest
    static void testBeforeInsert_SingleRecord() {
        Account acc = createTestAccount();

        Test.startTest();
        insert acc;
        Test.stopTest();

        // Assertions
        Account inserted = [SELECT Rating FROM Account WHERE Id = :acc.Id];
        System.assertNotEquals(null, inserted.Rating);
    }

    @isTest
    static void testBeforeInsert_BulkRecords() {
        List<Account> accounts = new List<Account>();
        for (Integer i = 0; i < 200; i++) {
            accounts.add(createTestAccount());
        }

        Test.startTest();
        insert accounts;
        Test.stopTest();

        // Assertions
        List<Account> inserted = [SELECT Rating FROM Account];
        System.assertEquals(200, inserted.size());
    }

    // Test before update logic
    @isTest
    static void testBeforeUpdate_SingleRecord() {
        Account acc = createTestAccount();
        insert acc;

        acc.Industry = 'Finance';

        Test.startTest();
        update acc;
        Test.stopTest();

        // Assertions
        Account updated = [SELECT Rating FROM Account WHERE Id = :acc.Id];
        System.assertEquals('Hot', updated.Rating);
    }

    // Test after insert logic
    @isTest
    static void testAfterInsert_CreatesDefaultContact() {
        Account acc = createTestAccount();

        Test.startTest();
        insert acc;
        Test.stopTest();

        // Assertions
        List<Contact> contacts = [SELECT Id FROM Contact WHERE AccountId = :acc.Id];
        System.assertEquals(1, contacts.size(), 'Should create one default contact');
    }

    // Test negative scenarios
    @isTest
    static void testBeforeInsert_ValidationError() {
        Account acc = new Account(Name = 'Test', AnnualRevenue = -1000);

        Test.startTest();
        try {
            insert acc;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('Revenue cannot be negative'));
        }
        Test.stopTest();
    }
}
```

### Test Class Annotations

#### @isTest (Class Level)
**Purpose**: Mark entire class as test class

```apex
@isTest
private class AccountTriggerHandlerTest {
    // All methods are test methods or helpers
}
```

**Benefits**:
- Excluded from code coverage calculations
- Excluded from organization limits
- Can use `@testSetup` and `@isTest` method annotations

#### @isTest (Method Level)
**Purpose**: Mark individual method as test method

```apex
@isTest
static void testSomething() {
    // Test logic
}
```

**Requirements**:
- Must be `static`
- Cannot have parameters
- Cannot return a value

#### @testSetup
**Purpose**: Create test data once, shared across all test methods

```apex
@testSetup
static void setupTestData() {
    List<Account> accounts = new List<Account>();
    for (Integer i = 0; i < 100; i++) {
        accounts.add(new Account(Name = 'Test Account ' + i));
    }
    insert accounts;
}

@isTest
static void testMethod1() {
    // Can query accounts created in @testSetup
    List<Account> accounts = [SELECT Id FROM Account];
    System.assertEquals(100, accounts.size());
}

@isTest
static void testMethod2() {
    // Can also query the same accounts
    List<Account> accounts = [SELECT Id FROM Account];
    System.assertEquals(100, accounts.size());
}
```

**Benefits**:
- Test data created once, not per method
- Faster test execution
- Reduces DML operations

**Limitations**:
- Data is rolled back after each test method
- Changes in one test method don't affect others

---

## Test Data Factories

### Why Test Data Factories?

**Problem**: Duplicate test data creation code

```apex
// In every test method...
@isTest
static void testMethod1() {
    Account acc = new Account(
        Name = 'Test Account',
        Industry = 'Technology',
        AnnualRevenue = 1000000,
        Rating = 'Hot'
    );
    insert acc;
}

@isTest
static void testMethod2() {
    // Same code duplicated!
    Account acc = new Account(
        Name = 'Test Account',
        Industry = 'Technology',
        AnnualRevenue = 1000000,
        Rating = 'Hot'
    );
    insert acc;
}
```

**Solution**: Centralized test data factory

```apex
@isTest
static void testMethod1() {
    Account acc = TestDataFactory.createAccount();
}

@isTest
static void testMethod2() {
    Account acc = TestDataFactory.createAccount();
}
```

### Test Data Factory Pattern

```apex
@isTest
public class TestDataFactory {

    // Account factory
    public static Account createAccount() {
        return new Account(
            Name = 'Test Account',
            Industry = 'Technology',
            AnnualRevenue = 1000000,
            Rating = 'Hot'
        );
    }

    public static Account createAccount(Boolean doInsert) {
        Account acc = createAccount();
        if (doInsert) {
            insert acc;
        }
        return acc;
    }

    public static List<Account> createAccounts(Integer count) {
        return createAccounts(count, false);
    }

    public static List<Account> createAccounts(Integer count, Boolean doInsert) {
        List<Account> accounts = new List<Account>();
        for (Integer i = 0; i < count; i++) {
            accounts.add(new Account(
                Name = 'Test Account ' + i,
                Industry = 'Technology',
                AnnualRevenue = 1000000
            ));
        }
        if (doInsert) {
            insert accounts;
        }
        return accounts;
    }

    // Opportunity factory
    public static Opportunity createOpportunity(Id accountId) {
        return new Opportunity(
            Name = 'Test Opportunity',
            AccountId = accountId,
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30),
            Amount = 50000
        );
    }

    public static Opportunity createOpportunity(Id accountId, Boolean doInsert) {
        Opportunity opp = createOpportunity(accountId);
        if (doInsert) {
            insert opp;
        }
        return opp;
    }

    public static List<Opportunity> createOpportunities(Id accountId, Integer count, Boolean doInsert) {
        List<Opportunity> opps = new List<Opportunity>();
        for (Integer i = 0; i < count; i++) {
            opps.add(new Opportunity(
                Name = 'Test Opportunity ' + i,
                AccountId = accountId,
                StageName = 'Prospecting',
                CloseDate = Date.today().addDays(30),
                Amount = 50000 + (i * 1000)
            ));
        }
        if (doInsert) {
            insert opps;
        }
        return opps;
    }

    // Contact factory
    public static Contact createContact(Id accountId) {
        return new Contact(
            FirstName = 'Test',
            LastName = 'Contact',
            AccountId = accountId,
            Email = 'test@example.com'
        );
    }

    public static Contact createContact(Id accountId, Boolean doInsert) {
        Contact con = createContact(accountId);
        if (doInsert) {
            insert con;
        }
        return con;
    }
}
```

### Using Test Data Factory

```apex
@isTest
class OpportunityTriggerHandlerTest {

    @isTest
    static void testEnrichFromAccount() {
        // Create account with factory
        Account acc = TestDataFactory.createAccount(true);  // Insert immediately

        // Create opportunity
        Opportunity opp = TestDataFactory.createOpportunity(acc.Id, false);  // Don't insert yet

        Test.startTest();
        insert opp;  // Trigger fires
        Test.stopTest();

        // Verify opportunity has account data
        Opportunity inserted = [SELECT Industry__c FROM Opportunity WHERE Id = :opp.Id];
        System.assertEquals('Technology', inserted.Industry__c);
    }

    @isTest
    static void testBulkOpportunities() {
        // Create account
        Account acc = TestDataFactory.createAccount(true);

        // Create 200 opportunities with factory
        List<Opportunity> opps = TestDataFactory.createOpportunities(acc.Id, 200, false);

        Test.startTest();
        insert opps;  // Bulk trigger test
        Test.stopTest();

        // Verify all opportunities processed
        List<Opportunity> inserted = [SELECT Id FROM Opportunity];
        System.assertEquals(200, inserted.size());
    }
}
```

### Advanced Factory Pattern: Builder Pattern

For complex objects with many optional fields:

```apex
@isTest
public class AccountBuilder {
    private Account acc;

    public AccountBuilder() {
        acc = new Account(Name = 'Test Account');
    }

    public AccountBuilder withName(String name) {
        acc.Name = name;
        return this;
    }

    public AccountBuilder withIndustry(String industry) {
        acc.Industry = industry;
        return this;
    }

    public AccountBuilder withRevenue(Decimal revenue) {
        acc.AnnualRevenue = revenue;
        return this;
    }

    public AccountBuilder withRating(String rating) {
        acc.Rating = rating;
        return this;
    }

    public Account build() {
        return acc;
    }

    public Account buildAndInsert() {
        insert acc;
        return acc;
    }
}

// Usage
@isTest
static void testAccountWithBuilder() {
    Account acc = new AccountBuilder()
        .withName('Enterprise Customer')
        .withIndustry('Technology')
        .withRevenue(10000000)
        .withRating('Hot')
        .buildAndInsert();

    // Test logic...
}
```

---

## Bulk Testing Strategies

### Strategy 1: Always Test with 200 Records

**Minimum**: Test with 200 records to verify bulkification

```apex
@isTest
static void testBulkInsert() {
    List<Opportunity> opps = TestDataFactory.createOpportunities(TestDataFactory.createAccount(true).Id, 200, false);

    Test.startTest();
    insert opps;  // Should not hit governor limits
    Test.stopTest();

    // Verify all processed
    List<Opportunity> inserted = [SELECT Id FROM Opportunity];
    System.assertEquals(200, inserted.size(), 'All 200 opportunities should be inserted');
}
```

### Strategy 2: Test Governor Limits

**Verify**: Trigger uses minimal SOQL/DML

```apex
@isTest
static void testGovernorLimits_Bulk() {
    List<Opportunity> opps = TestDataFactory.createOpportunities(TestDataFactory.createAccount(true).Id, 200, false);

    Test.startTest();
    Integer queriesBefore = Limits.getQueries();
    Integer dmlBefore = Limits.getDmlStatements();

    insert opps;

    Integer queriesUsed = Limits.getQueries() - queriesBefore;
    Integer dmlUsed = Limits.getDmlStatements() - dmlBefore;
    Test.stopTest();

    // Verify efficient bulkification
    System.assert(queriesUsed < 10, 'Should use <10 queries for 200 records. Used: ' + queriesUsed);
    System.assert(dmlUsed < 5, 'Should use <5 DML for 200 records. Used: ' + dmlUsed);

    System.debug('Queries used: ' + queriesUsed);
    System.debug('DML used: ' + dmlUsed);
}
```

### Strategy 3: Test with Duplicates

**Scenario**: Multiple records with same parent/related records

```apex
@isTest
static void testBulkWithSameAccount() {
    Account acc = TestDataFactory.createAccount(true);

    // 200 opportunities, all pointing to same account
    List<Opportunity> opps = TestDataFactory.createOpportunities(acc.Id, 200, false);

    Test.startTest();
    insert opps;
    Test.stopTest();

    // Verify all have correct industry (from single account query)
    List<Opportunity> inserted = [SELECT Industry__c FROM Opportunity];
    System.assertEquals(200, inserted.size());
    for (Opportunity opp : inserted) {
        System.assertEquals('Technology', opp.Industry__c, 'All opps should have account industry');
    }
}
```

### Strategy 4: Test Mixed Operations

**Scenario**: Bulk update with some records meeting criteria, some not

```apex
@isTest
static void testBulkUpdate_MixedCriteria() {
    Account acc = TestDataFactory.createAccount(true);
    List<Opportunity> opps = TestDataFactory.createOpportunities(acc.Id, 200, true);

    // Update 100 to Closed Won, leave 100 as Prospecting
    for (Integer i = 0; i < 100; i++) {
        opps[i].StageName = 'Closed Won';
    }

    Test.startTest();
    update opps;
    Test.stopTest();

    // Verify only Closed Won opportunities processed
    List<Opportunity> closedWon = [
        SELECT Id
        FROM Opportunity
        WHERE StageName = 'Closed Won'
        AND LastModifiedDate = TODAY
    ];
    System.assertEquals(100, closedWon.size(), 'Only 100 Closed Won opps should be processed');
}
```

---

## Testing Recursion Prevention

### Test Pattern 1: Verify Recursion Doesn't Occur

```apex
@isTest
static void testRecursionPrevention() {
    Account acc = TestDataFactory.createAccount(true);

    // Update account (triggers after update)
    Test.startTest();
    acc.Description = 'Updated';
    update acc;  // Trigger updates Description again internally
    Test.stopTest();

    // Verify recursion was prevented (only 1 update, not infinite)
    Account updated = [SELECT Description FROM Account WHERE Id = :acc.Id];
    System.assertNotEquals(null, updated.Description, 'Description should be updated');

    // Check logs for recursion prevention
    // If recursion wasn't prevented, test would timeout or hit governor limits
}
```

### Test Pattern 2: Verify Static Boolean Flag Works

```apex
@isTest
static void testRecursionFlag() {
    // Verify flag starts as false
    System.assertEquals(false, AccountTriggerHandler.isExecuting, 'Flag should start false');

    Account acc = TestDataFactory.createAccount();

    Test.startTest();
    AccountTriggerHandler.handleAfterInsert(new List<Account>{acc});
    Test.stopTest();

    // Flag should be reset to false after execution
    System.assertEquals(false, AccountTriggerHandler.isExecuting, 'Flag should be reset to false');
}
```

### Test Pattern 3: Multiple DML Operations in Same Transaction

```apex
@isTest
static void testMultipleDMLOperations() {
    Account acc = TestDataFactory.createAccount(true);

    Test.startTest();
    // First update
    acc.Industry = 'Finance';
    update acc;

    // Second update (should not cause recursion issues)
    acc.AnnualRevenue = 5000000;
    update acc;

    // Third update
    acc.Rating = 'Hot';
    update acc;
    Test.stopTest();

    // Verify all updates succeeded
    Account updated = [SELECT Industry, AnnualRevenue, Rating FROM Account WHERE Id = :acc.Id];
    System.assertEquals('Finance', updated.Industry);
    System.assertEquals(5000000, updated.AnnualRevenue);
    System.assertEquals('Hot', updated.Rating);
}
```

---

## Code Coverage Requirements

### Salesforce Coverage Requirements

| Deployment Type | Coverage Requirement |
|----------------|----------------------|
| Production | 75% overall, 1%+ per trigger/class |
| Sandbox | No requirement |
| Developer Edition | No requirement |
| Unpackaged Changes | 75% overall |
| Managed Package | 75% per package |

### Calculating Coverage

```apex
Total Lines Covered / Total Executable Lines = Coverage %

Example:
Trigger: 100 lines
- 20 lines are comments/whitespace (excluded)
- 80 executable lines
- 65 lines covered by tests

Coverage: 65 / 80 = 81.25%
```

### Coverage Best Practices

#### 1. Cover All Paths

**Bad**: Only tests happy path
```apex
// Trigger logic
if (opp.Amount > 100000) {
    opp.Priority__c = 'High';  // Line 1
} else {
    opp.Priority__c = 'Normal';  // Line 2
}

// Test only covers Line 1
@isTest
static void testHighPriority() {
    Opportunity opp = new Opportunity(Amount = 200000);
    insert opp;
}
// Coverage: 50% (Line 1 covered, Line 2 not covered)
```

**Good**: Tests all paths
```apex
@isTest
static void testHighPriority() {
    Opportunity opp = new Opportunity(Amount = 200000);
    insert opp;

    Opportunity inserted = [SELECT Priority__c FROM Opportunity WHERE Id = :opp.Id];
    System.assertEquals('High', inserted.Priority__c);
}

@isTest
static void testNormalPriority() {
    Opportunity opp = new Opportunity(Amount = 50000);
    insert opp;

    Opportunity inserted = [SELECT Priority__c FROM Opportunity WHERE Id = :opp.Id];
    System.assertEquals('Normal', inserted.Priority__c);
}
// Coverage: 100% (Both lines covered)
```

#### 2. Test Exception Paths

```apex
// Trigger logic
try {
    callExternalAPI(opp);
} catch (Exception e) {
    System.debug('API call failed: ' + e.getMessage());
}

// Test exception path
@isTest
static void testAPIFailure() {
    // Mock API failure
    Test.setMock(HttpCalloutMock.class, new MockHttpResponseError());

    Opportunity opp = TestDataFactory.createOpportunity(TestDataFactory.createAccount(true).Id);

    Test.startTest();
    insert opp;  // API call fails, exception caught
    Test.stopTest();

    // Verify exception was handled gracefully
    Opportunity inserted = [SELECT Status__c FROM Opportunity WHERE Id = :opp.Id];
    System.assertEquals('Pending', inserted.Status__c, 'Status should remain Pending on API failure');
}
```

#### 3. Test Edge Cases

```apex
@isTest
static void testEdgeCases() {
    // Test with null values
    Opportunity opp1 = new Opportunity(
        Name = 'Test',
        Amount = null,  // Null amount
        StageName = 'Prospecting',
        CloseDate = Date.today()
    );
    insert opp1;

    // Test with minimum values
    Opportunity opp2 = new Opportunity(
        Name = 'Test',
        Amount = 0,  // Zero amount
        StageName = 'Prospecting',
        CloseDate = Date.today()
    );
    insert opp2;

    // Test with maximum values
    Opportunity opp3 = new Opportunity(
        Name = 'Test',
        Amount = 999999999,  // Very large amount
        StageName = 'Prospecting',
        CloseDate = Date.today()
    );
    insert opp3;

    // Verify all handled correctly
    List<Opportunity> inserted = [SELECT Id FROM Opportunity];
    System.assertEquals(3, inserted.size(), 'All edge cases should be handled');
}
```

### Coverage Report Analysis

**View Coverage**:
1. Developer Console → Tests → Run Tests
2. Select test classes
3. Click "Run"
4. View "Overall Code Coverage" tab

**Coverage Report Example**:
```
Class: AccountTriggerHandler
Coverage: 87%

Lines not covered:
- Line 45: Exception handling for API timeout
- Line 89: Recursive depth check (>5 levels)

Lines covered:
- Lines 10-44: Before insert logic
- Lines 50-88: After update logic
```

**Fix Low Coverage**:
```apex
// Add test for Line 45 (API timeout)
@isTest
static void testAPITimeout() {
    Test.setMock(HttpCalloutMock.class, new MockHttpResponseTimeout());
    // ... test logic ...
}

// Add test for Line 89 (recursive depth check)
@isTest
static void testDeepRecursion() {
    // Simulate 6 levels of recursion
    // ... test logic ...
}
```

---

## Common Testing Pitfalls

### Pitfall 1: No Assertions

**Problem**: Test achieves coverage but doesn't verify behavior

```apex
// ❌ BAD: No assertions
@isTest
static void testTrigger() {
    Account acc = new Account(Name = 'Test');
    insert acc;  // Coverage achieved
    // But we don't verify anything!
}
```

**Solution**: Always assert expected behavior

```apex
// ✅ GOOD: Assertions verify behavior
@isTest
static void testTrigger_SetsDefaultRating() {
    Account acc = new Account(Name = 'Test');

    Test.startTest();
    insert acc;
    Test.stopTest();

    Account inserted = [SELECT Rating FROM Account WHERE Id = :acc.Id];
    System.assertEquals('Warm', inserted.Rating, 'Default rating should be Warm');
}
```

### Pitfall 2: Testing Only Single Records

**Problem**: Bulkification bugs not caught

```apex
// ❌ BAD: Only tests single record
@isTest
static void testTrigger() {
    Opportunity opp = new Opportunity(/* ... */);
    insert opp;  // Works fine with 1 record
}

// But trigger has SOQL in loop - breaks with 200 records!
```

**Solution**: Always test bulk (200 records)

```apex
// ✅ GOOD: Tests bulk scenario
@isTest
static void testTrigger_Bulk() {
    List<Opportunity> opps = new List<Opportunity>();
    for (Integer i = 0; i < 200; i++) {
        opps.add(new Opportunity(/* ... */));
    }
    insert opps;  // Would fail if SOQL in loop
}
```

### Pitfall 3: Not Using Test.startTest() / Test.stopTest()

**Problem**: Governor limits not reset, async operations not executed

```apex
// ❌ BAD: No Test.startTest()
@isTest
static void testTrigger() {
    // Create 100 accounts (uses governor limits)
    List<Account> accounts = TestDataFactory.createAccounts(100, true);

    // Now insert opportunity (continues using same limits!)
    Opportunity opp = new Opportunity(/* ... */);
    insert opp;

    // @future methods don't execute
}
```

**Solution**: Use Test.startTest() to reset limits

```apex
// ✅ GOOD: Test.startTest() resets limits
@isTest
static void testTrigger() {
    List<Account> accounts = TestDataFactory.createAccounts(100, true);

    Test.startTest();  // ← Resets governor limits here
    Opportunity opp = new Opportunity(/* ... */);
    insert opp;  // Fresh governor limits
    Test.stopTest();  // ← @future methods execute here

    // Assertions...
}
```

### Pitfall 4: Hardcoded Record IDs

**Problem**: IDs differ between orgs

```apex
// ❌ BAD: Hardcoded Record Type ID
@isTest
static void testTrigger() {
    Account acc = new Account(
        Name = 'Test',
        RecordTypeId = '012000000000ABC'  // ← Breaks in other orgs!
    );
    insert acc;
}
```

**Solution**: Query Record Type dynamically

```apex
// ✅ GOOD: Query Record Type
@isTest
static void testTrigger() {
    Id enterpriseRTId = Schema.SObjectType.Account
        .getRecordTypeInfosByName()
        .get('Enterprise')
        .getRecordTypeId();

    Account acc = new Account(
        Name = 'Test',
        RecordTypeId = enterpriseRTId
    );
    insert acc;
}
```

### Pitfall 5: Order-Dependent Tests

**Problem**: Tests pass individually but fail together

```apex
// ❌ BAD: Test modifies static variable
@isTest
static void testMethod1() {
    AccountTriggerHandler.isExecuting = true;  // ← Modifies static
    // Test logic...
}

@isTest
static void testMethod2() {
    // Assumes isExecuting = false
    // But if testMethod1 ran first, it's true!
    Account acc = new Account(Name = 'Test');
    insert acc;  // Might not execute trigger logic
}
```

**Solution**: Reset static variables in each test

```apex
// ✅ GOOD: Reset static variables
@isTest
static void testMethod1() {
    AccountTriggerHandler.isExecuting = false;  // Reset
    // Test logic...
}

@isTest
static void testMethod2() {
    AccountTriggerHandler.isExecuting = false;  // Reset
    // Test logic...
}
```

### Pitfall 6: Not Testing Error Conditions

**Problem**: Exception paths not covered

```apex
// Trigger adds error for negative amount
if (opp.Amount < 0) {
    opp.addError('Amount cannot be negative');
}

// ❌ BAD: Only tests valid amounts
@isTest
static void testTrigger() {
    Opportunity opp = new Opportunity(Amount = 5000);
    insert opp;  // Doesn't cover error path
}
```

**Solution**: Test both valid and invalid inputs

```apex
// ✅ GOOD: Tests error condition
@isTest
static void testTrigger_NegativeAmount() {
    Opportunity opp = new Opportunity(Amount = -1000);

    Test.startTest();
    try {
        insert opp;
        System.assert(false, 'Should have thrown error');
    } catch (DmlException e) {
        System.assert(e.getMessage().contains('Amount cannot be negative'));
    }
    Test.stopTest();
}
```

---

## Advanced Testing Patterns

### Pattern 1: Testing @future Methods

**Trigger with @future callout**:
```apex
trigger OpportunityTrigger on Opportunity (after insert) {
    Set<Id> oppIds = new Set<Id>();
    for (Opportunity opp : Trigger.new) {
        if (opp.Amount > 100000) {
            oppIds.add(opp.Id);
        }
    }
    if (!oppIds.isEmpty()) {
        ExternalSystemIntegration.sendToCPQ(oppIds);
    }
}

public class ExternalSystemIntegration {
    @future(callout=true)
    public static void sendToCPQ(Set<Id> oppIds) {
        // Callout logic...
    }
}
```

**Test**:
```apex
@isTest
static void testFutureCallout() {
    // Set mock for HTTP callout
    Test.setMock(HttpCalloutMock.class, new MockHttpResponseSuccess());

    Opportunity opp = new Opportunity(Amount = 200000, /* ... */);

    Test.startTest();
    insert opp;  // Trigger queues @future method
    Test.stopTest();  // ← @future method executes here

    // Verify @future method completed
    Opportunity updated = [SELECT SyncStatus__c FROM Opportunity WHERE Id = :opp.Id];
    System.assertEquals('Synced', updated.SyncStatus__c);
}
```

### Pattern 2: Testing with Mock HTTP Callouts

**Mock HTTP Response**:
```apex
@isTest
global class MockHttpResponseSuccess implements HttpCalloutMock {
    global HTTPResponse respond(HTTPRequest req) {
        HttpResponse res = new HttpResponse();
        res.setHeader('Content-Type', 'application/json');
        res.setBody('{"status":"success","id":"12345"}');
        res.setStatusCode(200);
        return res;
    }
}

@isTest
global class MockHttpResponseError implements HttpCalloutMock {
    global HTTPResponse respond(HTTPRequest req) {
        HttpResponse res = new HttpResponse();
        res.setStatusCode(500);
        res.setBody('{"error":"Internal server error"}');
        return res;
    }
}
```

### Pattern 3: Testing Platform Events

**Trigger publishes platform event**:
```apex
trigger OpportunityTrigger on Opportunity (after insert) {
    List<Opportunity_Event__e> events = new List<Opportunity_Event__e>();
    for (Opportunity opp : Trigger.new) {
        events.add(new Opportunity_Event__e(
            Opportunity_Id__c = opp.Id,
            Amount__c = opp.Amount
        ));
    }
    EventBus.publish(events);
}
```

**Test**:
```apex
@isTest
static void testPlatformEventPublished() {
    Opportunity opp = new Opportunity(/* ... */);

    Test.startTest();
    insert opp;

    // Deliver platform events
    Test.getEventBus().deliver();
    Test.stopTest();

    // Verify event was published and processed
    // (Requires separate trigger on Opportunity_Event__e to verify)
}
```

### Pattern 4: Testing Queueable Apex

**Trigger queues job**:
```apex
trigger OpportunityTrigger on Opportunity (after update) {
    Set<Id> oppIds = new Set<Id>();
    for (Opportunity opp : Trigger.new) {
        if (opp.StageName == 'Closed Won') {
            oppIds.add(opp.Id);
        }
    }
    if (!oppIds.isEmpty()) {
        System.enqueueJob(new OpportunityProcessor(oppIds));
    }
}
```

**Test**:
```apex
@isTest
static void testQueueableJob() {
    Opportunity opp = new Opportunity(StageName = 'Prospecting', /* ... */);
    insert opp;

    opp.StageName = 'Closed Won';

    Test.startTest();
    update opp;  // Queues job
    Test.stopTest();  // ← Job executes here

    // Verify job completed
    Opportunity updated = [SELECT ProcessedStatus__c FROM Opportunity WHERE Id = :opp.Id];
    System.assertEquals('Processed', updated.ProcessedStatus__c);
}
```

---

## Debugging Failed Tests

### Debug Log Analysis

**Enable Debug Logs**:
1. Setup → Debug Logs
2. Click "New"
3. Select test user
4. Set log level to "FINEST" for Apex Code

**Read Debug Logs**:
```
14:32:15.123 USER_DEBUG [10]|DEBUG|Trigger.new size: 200
14:32:15.145 USER_DEBUG [25]|DEBUG|Queries before: 0
14:32:15.234 USER_DEBUG [30]|DEBUG|Queries after: 1
14:32:15.456 USER_DEBUG [45]|DEBUG|Processing opportunity: Test Opp 1
14:32:15.567 FATAL_ERROR System.NullPointerException: Attempt to de-reference a null object
```

### Common Test Failures

#### Failure 1: System.AssertException

```
System.AssertException: Assertion Failed: Expected: 200, Actual: 0
```

**Cause**: Query returned no results

**Debug**:
```apex
// Add debug logs
System.debug('Opportunities inserted: ' + [SELECT COUNT() FROM Opportunity]);
System.debug('Expected count: 200');

// Check if insert succeeded
System.assertEquals(200, [SELECT COUNT() FROM Opportunity], 'Insert should create 200 records');
```

#### Failure 2: System.DmlException

```
System.DmlException: Insert failed. First exception on row 0; first error: REQUIRED_FIELD_MISSING, Required fields are missing: [StageName]
```

**Cause**: Missing required field

**Fix**:
```apex
// Ensure all required fields are set
Opportunity opp = new Opportunity(
    Name = 'Test',
    StageName = 'Prospecting',  // ← Add missing required field
    CloseDate = Date.today()
);
```

#### Failure 3: System.LimitException

```
System.LimitException: Too many SOQL queries: 101
```

**Cause**: SOQL in loop

**Debug**:
```apex
Test.startTest();
Integer queriesBefore = Limits.getQueries();

insert opps;  // Trigger fires

Integer queriesUsed = Limits.getQueries() - queriesBefore;
System.debug('Queries used: ' + queriesUsed);  // Shows 101

// Fix: Move SOQL outside loop in trigger
```

#### Failure 4: System.QueryException

```
System.QueryException: List has no rows for assignment to SObject
```

**Cause**: Query expected result but found none

**Fix**:
```apex
// ❌ BAD: Assumes record exists
Account acc = [SELECT Id FROM Account WHERE Name = 'Test' LIMIT 1];

// ✅ GOOD: Handle empty result
List<Account> accounts = [SELECT Id FROM Account WHERE Name = 'Test' LIMIT 1];
if (!accounts.isEmpty()) {
    Account acc = accounts[0];
} else {
    System.debug('Account not found');
}
```

---

## Quick Reference

### Test Class Template

```apex
@isTest
private class ObjectNameTriggerHandlerTest {

    @testSetup
    static void setupTestData() {
        // Create shared test data
    }

    @isTest
    static void testBeforeInsert_SingleRecord() {
        // Test single record
    }

    @isTest
    static void testBeforeInsert_BulkRecords() {
        // Test 200 records
    }

    @isTest
    static void testValidation_ErrorCondition() {
        // Test error handling
    }
}
```

### Test Checklist

- [ ] Test single record scenario
- [ ] Test bulk scenario (200 records)
- [ ] Test with duplicates (same parent/related records)
- [ ] Test error conditions (validation, exceptions)
- [ ] Test recursion prevention
- [ ] Verify governor limits usage
- [ ] Use Test.startTest() / Test.stopTest()
- [ ] Add meaningful assertions
- [ ] Test all code paths (if/else, try/catch)
- [ ] 75%+ code coverage

### Coverage Requirements

| Deployment | Overall Coverage | Per Trigger/Class |
|-----------|------------------|-------------------|
| Production | 75% | 1%+ |
| Sandbox | None | None |
| Package | 75% | 75% |

---

## Next Steps

After mastering testing and code coverage, proceed to:

**Runbook 5: Deployment and Monitoring**
- Deployment strategies (direct, staged, blue-green, canary)
- Pre-deployment validation
- Production monitoring
- Performance tracking

**Key Takeaways from Runbook 4**:
1. Always test with 200 records (bulk testing)
2. Use Test.startTest() / Test.stopTest() to reset governor limits
3. Create test data factories for reusable test data
4. Test all code paths (happy path, error path, edge cases)
5. Verify behavior with assertions, not just coverage
6. Test recursion prevention
7. Aim for 75%+ coverage for production deployments

---

**Version History**:
- 1.0.0 (2025-11-23): Initial release

**Related Documentation**:
- Runbook 3: Bulkification Best Practices
- Runbook 5: Deployment and Monitoring
- trigger-test-generator.js documentation (upcoming)
