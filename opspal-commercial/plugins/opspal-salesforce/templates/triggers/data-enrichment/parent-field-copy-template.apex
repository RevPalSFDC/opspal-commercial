/**
 * @description Copy fields from parent record (e.g., Account to Opportunity)
 * @usage Common pattern: Denormalize parent data for reporting and performance
 * @complexity Simple
 * @bestPractices Bulk query, Map lookup, null checks
 *
 * USE CASE EXAMPLES:
 * - Copy Account Industry to Opportunity for reporting
 * - Copy Account Owner to Opportunity when created
 * - Copy Contact Email to Lead for enrichment
 * - Copy Account BillingAddress to Opportunity ShippingAddress
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ChildObject with your child object (e.g., Opportunity)
 * [ ] Replace ParentObject with your parent object (e.g., Account)
 * [ ] Replace ParentId__c with your lookup field (e.g., AccountId)
 * [ ] Add fields to copy in FIELDS_TO_COPY map
 * [ ] Test with 200 records to verify bulkification
 */

trigger ChildObjectTrigger on ChildObject (before insert, before update) {
    ChildObjectTriggerHandler.handle Before(Trigger.new, Trigger.oldMap);
}

public class ChildObjectTriggerHandler {

    // ========================================
    // RECURSION PREVENTION
    // ========================================
    private static Boolean isExecuting = false;

    // ========================================
    // CONFIGURATION: Fields to Copy
    // ========================================
    // Map<Child Field API Name, Parent Field API Name>
    private static final Map<String, String> FIELDS_TO_COPY = new Map<String, String>{
        'Industry__c' => 'Industry',           // Copy Account.Industry to Opportunity.Industry__c
        'AnnualRevenue__c' => 'AnnualRevenue', // Copy Account.AnnualRevenue to Opportunity.AnnualRevenue__c
        'Rating__c' => 'Rating',               // Copy Account.Rating to Opportunity.Rating__c
        'ParentName__c' => 'Name'              // Copy Account.Name to Opportunity.ParentName__c
    };

    // ========================================
    // MAIN HANDLER
    // ========================================
    public static void handleBefore(List<ChildObject> newRecords, Map<Id, ChildObject> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        Boolean isInsert = (oldMap == null);
        Boolean isUpdate = (oldMap != null);

        if (isInsert) {
            // On insert, always copy parent fields
            copyParentFields(newRecords);
        } else if (isUpdate) {
            // On update, only copy if parent changed
            List<ChildObject> recordsWithParentChange = new List<ChildObject>();

            for (ChildObject record : newRecords) {
                ChildObject oldRecord = oldMap.get(record.Id);
                if (record.ParentId__c != oldRecord.ParentId__c) {
                    recordsWithParentChange.add(record);
                }
            }

            if (!recordsWithParentChange.isEmpty()) {
                copyParentFields(recordsWithParentChange);
            }
        }

        isExecuting = false;
    }

    // ========================================
    // CORE LOGIC: Copy Parent Fields
    // ========================================
    private static void copyParentFields(List<ChildObject> records) {
        // Step 1: Collect parent IDs
        Set<Id> parentIds = new Set<Id>();
        for (ChildObject record : records) {
            if (record.ParentId__c != null) {
                parentIds.add(record.ParentId__c);
            }
        }

        if (parentIds.isEmpty()) return;

        // Step 2: Build dynamic SOQL query
        String query = buildDynamicQuery(parentIds);

        // Step 3: Query parent records (single query for all)
        Map<Id, ParentObject> parentMap = new Map<Id, ParentObject>();
        for (ParentObject parent : Database.query(query)) {
            parentMap.put(parent.Id, parent);
        }

        // Step 4: Copy fields from parent to child
        for (ChildObject record : records) {
            if (record.ParentId__c != null) {
                ParentObject parent = parentMap.get(record.ParentId__c);

                if (parent != null) {
                    copyFieldsToRecord(record, parent);
                } else {
                    // Parent not found - clear fields
                    clearFields(record);
                }
            } else {
                // No parent - clear fields
                clearFields(record);
            }
        }
    }

    // ========================================
    // HELPER: Build Dynamic SOQL Query
    // ========================================
    private static String buildDynamicQuery(Set<Id> parentIds) {
        // Build field list from FIELDS_TO_COPY values
        Set<String> fieldsToQuery = new Set<String>{'Id'};
        fieldsToQuery.addAll(FIELDS_TO_COPY.values());

        String fieldList = String.join(new List<String>(fieldsToQuery), ', ');

        String query = 'SELECT ' + fieldList +
                      ' FROM ParentObject' +
                      ' WHERE Id IN :parentIds';

        return query;
    }

    // ========================================
    // HELPER: Copy Fields to Record
    // ========================================
    private static void copyFieldsToRecord(ChildObject record, ParentObject parent) {
        for (String childField : FIELDS_TO_COPY.keySet()) {
            String parentField = FIELDS_TO_COPY.get(childField);

            try {
                // Copy value from parent to child
                Object parentValue = parent.get(parentField);
                record.put(childField, parentValue);

                System.debug('Copied ' + parentField + ' (' + parentValue + ') to ' + childField);
            } catch (Exception e) {
                System.debug(LoggingLevel.ERROR,
                    'Error copying field ' + parentField + ' to ' + childField + ': ' + e.getMessage());
            }
        }
    }

    // ========================================
    // HELPER: Clear Fields
    // ========================================
    private static void clearFields(ChildObject record) {
        for (String childField : FIELDS_TO_COPY.keySet()) {
            try {
                record.put(childField, null);
            } catch (Exception e) {
                System.debug(LoggingLevel.ERROR,
                    'Error clearing field ' + childField + ': ' + e.getMessage());
            }
        }
    }
}

/**
 * REAL-WORLD EXAMPLE: Account to Opportunity
 *
 * Scenario: Copy Account fields to Opportunity for reporting
 * Parent: Account
 * Child: Opportunity
 * Lookup Field: AccountId
 *
 * Fields to Copy:
 * - Account.Industry → Opportunity.Industry__c (custom field)
 * - Account.AnnualRevenue → Opportunity.AccountRevenue__c (custom field)
 * - Account.Rating → Opportunity.AccountRating__c (custom field)
 * - Account.BillingCountry → Opportunity.Country__c (custom field)
 */
/*
trigger OpportunityTrigger on Opportunity (before insert, before update) {
    OpportunityTriggerHandler.handleBefore(Trigger.new, Trigger.oldMap);
}

public class OpportunityTriggerHandler {

    private static Boolean isExecuting = false;

    private static final Map<String, String> FIELDS_TO_COPY = new Map<String, String>{
        'Industry__c' => 'Industry',
        'AccountRevenue__c' => 'AnnualRevenue',
        'AccountRating__c' => 'Rating',
        'Country__c' => 'BillingCountry'
    };

    public static void handleBefore(List<Opportunity> newOpps, Map<Id, Opportunity> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        Boolean isInsert = (oldMap == null);
        Boolean isUpdate = (oldMap != null);

        if (isInsert) {
            copyAccountFields(newOpps);
        } else if (isUpdate) {
            List<Opportunity> oppsWithAccountChange = new List<Opportunity>();

            for (Opportunity opp : newOpps) {
                Opportunity oldOpp = oldMap.get(opp.Id);
                if (opp.AccountId != oldOpp.AccountId) {
                    oppsWithAccountChange.add(opp);
                }
            }

            if (!oppsWithAccountChange.isEmpty()) {
                copyAccountFields(oppsWithAccountChange);
            }
        }

        isExecuting = false;
    }

    private static void copyAccountFields(List<Opportunity> opps) {
        // Collect Account IDs
        Set<Id> accountIds = new Set<Id>();
        for (Opportunity opp : opps) {
            if (opp.AccountId != null) {
                accountIds.add(opp.AccountId);
            }
        }

        if (accountIds.isEmpty()) return;

        // Query Accounts (single query)
        Map<Id, Account> accountMap = new Map<Id, Account>([
            SELECT Id, Industry, AnnualRevenue, Rating, BillingCountry
            FROM Account
            WHERE Id IN :accountIds
        ]);

        // Copy fields
        for (Opportunity opp : opps) {
            if (opp.AccountId != null) {
                Account acc = accountMap.get(opp.AccountId);

                if (acc != null) {
                    opp.Industry__c = acc.Industry;
                    opp.AccountRevenue__c = acc.AnnualRevenue;
                    opp.AccountRating__c = acc.Rating;
                    opp.Country__c = acc.BillingCountry;
                } else {
                    // Account not found - clear fields
                    opp.Industry__c = null;
                    opp.AccountRevenue__c = null;
                    opp.AccountRating__c = null;
                    opp.Country__c = null;
                }
            } else {
                // No account - clear fields
                opp.Industry__c = null;
                opp.AccountRevenue__c = null;
                opp.AccountRating__c = null;
                opp.Country__c = null;
            }
        }
    }
}
*/

/**
 * TEST CLASS
 *
 * TESTING STRATEGY:
 * 1. Test single record with parent
 * 2. Test bulk records (200) with same parent
 * 3. Test record without parent (null parent ID)
 * 4. Test update when parent changes
 * 5. Test update when parent doesn't change (no copy)
 * 6. Verify governor limits (< 10 queries)
 */
/*
@isTest
private class OpportunityTriggerHandlerTest {

    @testSetup
    static void setupTestData() {
        // Create test accounts
        List<Account> accounts = new List<Account>();
        for (Integer i = 0; i < 10; i++) {
            accounts.add(new Account(
                Name = 'Test Account ' + i,
                Industry = 'Technology',
                AnnualRevenue = 1000000 + (i * 100000),
                Rating = 'Hot',
                BillingCountry = 'USA'
            ));
        }
        insert accounts;
    }

    @isTest
    static void testInsert_SingleOpportunity() {
        Account acc = [SELECT Id, Industry, AnnualRevenue, Rating FROM Account LIMIT 1];

        Opportunity opp = new Opportunity(
            Name = 'Test Opp',
            AccountId = acc.Id,
            StageName = 'Prospecting',
            CloseDate = Date.today()
        );

        Test.startTest();
        insert opp;
        Test.stopTest();

        Opportunity inserted = [
            SELECT Industry__c, AccountRevenue__c, AccountRating__c, Country__c
            FROM Opportunity
            WHERE Id = :opp.Id
        ];

        System.assertEquals('Technology', inserted.Industry__c, 'Industry should be copied');
        System.assertEquals(acc.AnnualRevenue, inserted.AccountRevenue__c, 'Revenue should be copied');
        System.assertEquals('Hot', inserted.AccountRating__c, 'Rating should be copied');
        System.assertEquals('USA', inserted.Country__c, 'Country should be copied');
    }

    @isTest
    static void testInsert_BulkOpportunities() {
        Account acc = [SELECT Id FROM Account LIMIT 1];

        List<Opportunity> opps = new List<Opportunity>();
        for (Integer i = 0; i < 200; i++) {
            opps.add(new Opportunity(
                Name = 'Test Opp ' + i,
                AccountId = acc.Id,
                StageName = 'Prospecting',
                CloseDate = Date.today()
            ));
        }

        Test.startTest();
        insert opps;
        Test.stopTest();

        List<Opportunity> inserted = [
            SELECT Industry__c
            FROM Opportunity
            WHERE AccountId = :acc.Id
        ];

        System.assertEquals(200, inserted.size(), 'All 200 opportunities should be inserted');
        for (Opportunity opp : inserted) {
            System.assertEquals('Technology', opp.Industry__c, 'All should have Industry copied');
        }
    }

    @isTest
    static void testInsert_NoAccount() {
        Opportunity opp = new Opportunity(
            Name = 'Test Opp',
            AccountId = null,  // No account
            StageName = 'Prospecting',
            CloseDate = Date.today()
        );

        Test.startTest();
        insert opp;
        Test.stopTest();

        Opportunity inserted = [
            SELECT Industry__c, AccountRevenue__c
            FROM Opportunity
            WHERE Id = :opp.Id
        ];

        System.assertEquals(null, inserted.Industry__c, 'Industry should be null');
        System.assertEquals(null, inserted.AccountRevenue__c, 'Revenue should be null');
    }

    @isTest
    static void testUpdate_AccountChanged() {
        List<Account> accounts = [SELECT Id FROM Account LIMIT 2];
        Account acc1 = accounts[0];
        Account acc2 = accounts[1];

        Opportunity opp = new Opportunity(
            Name = 'Test Opp',
            AccountId = acc1.Id,
            StageName = 'Prospecting',
            CloseDate = Date.today()
        );
        insert opp;

        // Change account
        opp.AccountId = acc2.Id;

        Test.startTest();
        update opp;
        Test.stopTest();

        Opportunity updated = [
            SELECT Industry__c
            FROM Opportunity
            WHERE Id = :opp.Id
        ];

        System.assertEquals('Technology', updated.Industry__c, 'Should copy from new account');
    }

    @isTest
    static void testUpdate_AccountNotChanged() {
        Account acc = [SELECT Id FROM Account LIMIT 1];

        Opportunity opp = new Opportunity(
            Name = 'Test Opp',
            AccountId = acc.Id,
            StageName = 'Prospecting',
            CloseDate = Date.today()
        );
        insert opp;

        // Update different field (not account)
        opp.StageName = 'Qualification';

        Test.startTest();
        Integer queriesBefore = Limits.getQueries();
        update opp;
        Integer queriesUsed = Limits.getQueries() - queriesBefore;
        Test.stopTest();

        System.assert(queriesUsed < 5, 'Should not query account if account didnt change');
    }

    @isTest
    static void testGovernorLimits_Bulk() {
        Account acc = [SELECT Id FROM Account LIMIT 1];

        List<Opportunity> opps = new List<Opportunity>();
        for (Integer i = 0; i < 200; i++) {
            opps.add(new Opportunity(
                Name = 'Test Opp ' + i,
                AccountId = acc.Id,
                StageName = 'Prospecting',
                CloseDate = Date.today()
            ));
        }

        Test.startTest();
        Integer queriesBefore = Limits.getQueries();
        insert opps;
        Integer queriesUsed = Limits.getQueries() - queriesBefore;
        Test.stopTest();

        System.assert(queriesUsed < 10, 'Should use <10 queries for 200 records. Used: ' + queriesUsed);
    }
}
*/
