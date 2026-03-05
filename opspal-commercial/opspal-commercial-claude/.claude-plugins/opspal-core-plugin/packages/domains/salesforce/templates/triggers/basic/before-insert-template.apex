/**
 * @description Minimal before insert trigger with handler pattern
 * @usage Data validation, enrichment, default values
 * @complexity Simple
 * @bestPractices Handler pattern, recursion prevention, bulkification
 *
 * USE CASE EXAMPLES:
 * - Validate required fields beyond standard validation rules
 * - Set default values based on complex logic
 * - Copy fields from parent records
 * - Standardize data (uppercase, format)
 * - Enrich records from external sources
 *
 * WHY BEFORE INSERT:
 * - Can modify Trigger.new directly (no DML needed)
 * - Runs before validation rules (can set fields that validation requires)
 * - Runs before record is assigned an ID
 * - Ideal for data cleanup and enrichment
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with your object (e.g., Account, Opportunity)
 * [ ] Update handler class name (ObjectNameTriggerHandler)
 * [ ] Implement business logic in handler class
 * [ ] Add test class with 200 record bulk test
 * [ ] Deploy to sandbox and test before production
 */

trigger ObjectNameTrigger on ObjectName (before insert) {
    ObjectNameTriggerHandler.handleBeforeInsert(Trigger.new);
}

/**
 * HANDLER CLASS TEMPLATE
 *
 * IMPLEMENTATION NOTES:
 * - Keep trigger minimal (just routing logic)
 * - Put ALL business logic in handler class
 * - Implement recursion prevention (usually not needed for before insert, but good practice)
 * - Organize methods by functionality (validation, enrichment, defaults)
 * - Query outside loops, use Map for lookups
 */
/*
public class ObjectNameTriggerHandler {

    // ========================================
    // RECURSION PREVENTION
    // ========================================
    // Usually not needed for before insert (runs once per DML)
    // But good practice for consistency
    private static Boolean isExecuting = false;

    // ========================================
    // MAIN HANDLER
    // ========================================
    public static void handleBeforeInsert(List<ObjectName> newRecords) {
        if (isExecuting) return;
        isExecuting = true;

        // Call helper methods in logical order
        validateRequiredFields(newRecords);     // 1. Validation first
        setDefaultValues(newRecords);           // 2. Set defaults
        enrichFromParent(newRecords);           // 3. Copy parent data
        standardizeData(newRecords);            // 4. Standardize format

        isExecuting = false;
    }

    // ========================================
    // VALIDATION METHODS
    // ========================================

    private static void validateRequiredFields(List<ObjectName> records) {
        for (ObjectName record : records) {
            // Validate beyond standard validation rules
            if (record.ImportantField__c == null || record.ImportantField__c == '') {
                record.addError('ImportantField__c is required');
            }

            // Complex validation (e.g., conditional requirements)
            if (record.Type__c == 'Enterprise' && record.AnnualRevenue__c == null) {
                record.AnnualRevenue__c.addError('Annual Revenue is required for Enterprise accounts');
            }

            // Cross-field validation
            if (record.StartDate__c != null && record.EndDate__c != null) {
                if (record.StartDate__c > record.EndDate__c) {
                    record.EndDate__c.addError('End Date must be after Start Date');
                }
            }
        }
    }

    // ========================================
    // DEFAULT VALUE METHODS
    // ========================================

    private static void setDefaultValues(List<ObjectName> records) {
        for (ObjectName record : records) {
            // Set defaults based on other fields
            if (record.Status__c == null) {
                record.Status__c = 'New';
            }

            if (record.Priority__c == null) {
                // Complex default logic
                record.Priority__c = (record.Type__c == 'Enterprise') ? 'High' : 'Medium';
            }

            // Auto-generate values
            if (record.ReferenceNumber__c == null) {
                record.ReferenceNumber__c = 'REF-' + String.valueOf(System.now().getTime());
            }

            // Set timestamps
            if (record.CreatedByUser__c == null) {
                record.CreatedByUser__c = UserInfo.getUserId();
            }
        }
    }

    // ========================================
    // ENRICHMENT METHODS
    // ========================================

    private static void enrichFromParent(List<ObjectName> records) {
        // Step 1: Collect parent IDs
        Set<Id> parentIds = new Set<Id>();
        for (ObjectName record : records) {
            if (record.ParentId__c != null) {
                parentIds.add(record.ParentId__c);
            }
        }

        if (parentIds.isEmpty()) return;

        // Step 2: Query parent records (SINGLE query for ALL records)
        Map<Id, ParentObject__c> parentMap = new Map<Id, ParentObject__c>([
            SELECT Id, Industry__c, Rating__c, Owner.Email
            FROM ParentObject__c
            WHERE Id IN :parentIds
        ]);

        // Step 3: Copy fields from parent to child
        for (ObjectName record : records) {
            if (record.ParentId__c != null) {
                ParentObject__c parent = parentMap.get(record.ParentId__c);

                if (parent != null) {
                    // Copy parent fields
                    record.ParentIndustry__c = parent.Industry__c;
                    record.ParentRating__c = parent.Rating__c;
                    record.ParentOwnerEmail__c = parent.Owner.Email;
                } else {
                    // Parent not found - clear fields
                    record.ParentIndustry__c = null;
                    record.ParentRating__c = null;
                }
            }
        }
    }

    // ========================================
    // STANDARDIZATION METHODS
    // ========================================

    private static void standardizeData(List<ObjectName> records) {
        for (ObjectName record : records) {
            // Uppercase specific fields
            if (record.Code__c != null) {
                record.Code__c = record.Code__c.toUpperCase();
            }

            // Trim whitespace
            if (record.Name != null) {
                record.Name = record.Name.trim();
            }

            // Format phone numbers
            if (record.Phone != null) {
                record.Phone = formatPhoneNumber(record.Phone);
            }

            // Format email to lowercase
            if (record.Email__c != null) {
                record.Email__c = record.Email__c.toLowerCase().trim();
            }

            // Remove special characters
            if (record.AlphanumericField__c != null) {
                record.AlphanumericField__c = record.AlphanumericField__c.replaceAll('[^a-zA-Z0-9]', '');
            }
        }
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    private static String formatPhoneNumber(String phone) {
        // Remove all non-numeric characters
        String cleaned = phone.replaceAll('[^0-9]', '');

        // Format as (XXX) XXX-XXXX
        if (cleaned.length() == 10) {
            return '(' + cleaned.substring(0, 3) + ') ' +
                   cleaned.substring(3, 6) + '-' +
                   cleaned.substring(6);
        }

        return phone;  // Return original if not 10 digits
    }
}
*/

/**
 * REAL-WORLD EXAMPLE: Opportunity Before Insert
 *
 * Scenario: Enrich new opportunities with account data and set defaults
 */
/*
trigger OpportunityTrigger on Opportunity (before insert) {
    OpportunityTriggerHandler.handleBeforeInsert(Trigger.new);
}

public class OpportunityTriggerHandler {

    private static Boolean isExecuting = false;

    public static void handleBeforeInsert(List<Opportunity> newOpps) {
        if (isExecuting) return;
        isExecuting = true;

        // Validate
        validateOpportunityFields(newOpps);

        // Set defaults
        setOpportunityDefaults(newOpps);

        // Copy Account data
        enrichFromAccount(newOpps);

        // Standardize
        standardizeOpportunityData(newOpps);

        isExecuting = false;
    }

    private static void validateOpportunityFields(List<Opportunity> opps) {
        for (Opportunity opp : opps) {
            // Require CloseDate
            if (opp.CloseDate == null) {
                opp.CloseDate.addError('Close Date is required');
            }

            // Validate CloseDate is in future
            if (opp.CloseDate != null && opp.CloseDate < Date.today()) {
                opp.CloseDate.addError('Close Date must be in the future');
            }

            // Enterprise deals require minimum amount
            if (opp.Type == 'New Business - Enterprise' && (opp.Amount == null || opp.Amount < 100000)) {
                opp.Amount.addError('Enterprise opportunities require minimum $100,000 amount');
            }
        }
    }

    private static void setOpportunityDefaults(List<Opportunity> opps) {
        for (Opportunity opp : opps) {
            // Default stage
            if (opp.StageName == null) {
                opp.StageName = 'Prospecting';
            }

            // Default probability based on stage
            if (opp.Probability == null) {
                opp.Probability = getStageProbability(opp.StageName);
            }

            // Default close date if null
            if (opp.CloseDate == null) {
                opp.CloseDate = Date.today().addDays(90);  // 90 days from today
            }

            // Generate opportunity number
            if (opp.OpportunityNumber__c == null) {
                opp.OpportunityNumber__c = 'OPP-' + String.valueOf(System.now().getTime());
            }
        }
    }

    private static void enrichFromAccount(List<Opportunity> opps) {
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
            SELECT Id, Industry, AnnualRevenue, Rating, BillingCountry, Owner.Email
            FROM Account
            WHERE Id IN :accountIds
        ]);

        // Copy Account data to Opportunity
        for (Opportunity opp : opps) {
            if (opp.AccountId != null) {
                Account acc = accountMap.get(opp.AccountId);

                if (acc != null) {
                    opp.Industry__c = acc.Industry;
                    opp.AccountRevenue__c = acc.AnnualRevenue;
                    opp.AccountRating__c = acc.Rating;
                    opp.Country__c = acc.BillingCountry;
                    opp.AccountOwnerEmail__c = acc.Owner.Email;
                }
            }
        }
    }

    private static void standardizeOpportunityData(List<Opportunity> opps) {
        for (Opportunity opp : opps) {
            // Standardize Name
            if (opp.Name != null) {
                opp.Name = opp.Name.trim();
            }

            // Uppercase tracking code
            if (opp.TrackingCode__c != null) {
                opp.TrackingCode__c = opp.TrackingCode__c.toUpperCase();
            }
        }
    }

    // Utility method
    private static Decimal getStageProbability(String stageName) {
        Map<String, Decimal> stageToProbability = new Map<String, Decimal>{
            'Prospecting' => 10,
            'Qualification' => 20,
            'Needs Analysis' => 40,
            'Proposal' => 60,
            'Negotiation' => 80,
            'Closed Won' => 100,
            'Closed Lost' => 0
        };

        return stageToProbability.get(stageName) != null ?
               stageToProbability.get(stageName) : 10;
    }
}
*/

/**
 * TEST CLASS TEMPLATE
 *
 * TESTING CHECKLIST:
 * [ ] Test single record
 * [ ] Test bulk (200 records) - MANDATORY
 * [ ] Test validation errors
 * [ ] Test default values
 * [ ] Test parent field copying
 * [ ] Test data standardization
 * [ ] Verify <10 SOQL queries, <5 DML statements
 */
/*
@isTest
private class ObjectNameTriggerHandlerTest {

    // ========================================
    // TEST DATA SETUP
    // ========================================

    @testSetup
    static void setupTestData() {
        // Create parent records
        List<ParentObject__c> parents = new List<ParentObject__c>();
        for (Integer i = 0; i < 10; i++) {
            parents.add(new ParentObject__c(
                Name = 'Test Parent ' + i,
                Industry__c = 'Technology',
                Rating__c = 'Hot'
            ));
        }
        insert parents;
    }

    // ========================================
    // BASIC INSERT TEST
    // ========================================

    @isTest
    static void testInsert_SingleRecord() {
        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        ObjectName record = new ObjectName(
            Name = 'Test Record',
            ParentId__c = parent.Id
        );

        Test.startTest();
        insert record;
        Test.stopTest();

        // Verify defaults were set
        ObjectName inserted = [
            SELECT Status__c, Priority__c, CreatedByUser__c, ParentIndustry__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals('New', inserted.Status__c, 'Default status should be set');
        System.assertNotEquals(null, inserted.Priority__c, 'Priority should be set');
        System.assertEquals(UserInfo.getUserId(), inserted.CreatedByUser__c, 'CreatedByUser should be set');
        System.assertEquals('Technology', inserted.ParentIndustry__c, 'Parent industry should be copied');
    }

    // ========================================
    // BULK INSERT TEST (MANDATORY)
    // ========================================

    @isTest
    static void testInsert_BulkRecords() {
        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ObjectName(
                Name = 'Test Record ' + i,
                ParentId__c = parent.Id
            ));
        }

        Test.startTest();
        insert records;
        Test.stopTest();

        // Verify all 200 records inserted
        List<ObjectName> inserted = [SELECT Id FROM ObjectName];
        System.assertEquals(200, inserted.size(), 'All 200 records should be inserted');

        // Verify defaults applied to all
        List<ObjectName> withDefaults = [
            SELECT Status__c
            FROM ObjectName
            WHERE Status__c = 'New'
        ];
        System.assertEquals(200, withDefaults.size(), 'All records should have default status');
    }

    // ========================================
    // VALIDATION TEST
    // ========================================

    @isTest
    static void testInsert_ValidationError() {
        ObjectName record = new ObjectName(
            Name = 'Test Record'
            // Missing ImportantField__c (required by validation)
        );

        Test.startTest();
        try {
            insert record;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('required'),
                'Error message should mention required field');
        }
        Test.stopTest();
    }

    // ========================================
    // DATA STANDARDIZATION TEST
    // ========================================

    @isTest
    static void testInsert_DataStandardization() {
        ObjectName record = new ObjectName(
            Name = '  Test Record  ',  // Extra whitespace
            Code__c = 'abc123',         // Should be uppercase
            Email__c = 'TEST@EXAMPLE.COM'  // Should be lowercase
        );

        Test.startTest();
        insert record;
        Test.stopTest();

        ObjectName inserted = [
            SELECT Name, Code__c, Email__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals('Test Record', inserted.Name, 'Name should be trimmed');
        System.assertEquals('ABC123', inserted.Code__c, 'Code should be uppercase');
        System.assertEquals('test@example.com', inserted.Email__c, 'Email should be lowercase');
    }

    // ========================================
    // PARENT ENRICHMENT TEST
    // ========================================

    @isTest
    static void testInsert_ParentEnrichment() {
        ParentObject__c parent = [SELECT Id, Industry__c, Rating__c FROM ParentObject__c LIMIT 1];

        ObjectName record = new ObjectName(
            Name = 'Test Record',
            ParentId__c = parent.Id
        );

        Test.startTest();
        insert record;
        Test.stopTest();

        ObjectName inserted = [
            SELECT ParentIndustry__c, ParentRating__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals(parent.Industry__c, inserted.ParentIndustry__c,
            'Parent industry should be copied');
        System.assertEquals(parent.Rating__c, inserted.ParentRating__c,
            'Parent rating should be copied');
    }

    // ========================================
    // NO PARENT TEST
    // ========================================

    @isTest
    static void testInsert_NoParent() {
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            ParentId__c = null  // No parent
        );

        Test.startTest();
        insert record;
        Test.stopTest();

        ObjectName inserted = [
            SELECT ParentIndustry__c, Status__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals(null, inserted.ParentIndustry__c,
            'Parent fields should be null when no parent');
        System.assertEquals('New', inserted.Status__c,
            'Defaults should still be set');
    }

    // ========================================
    // GOVERNOR LIMIT TEST
    // ========================================

    @isTest
    static void testInsert_GovernorLimits() {
        List<ParentObject__c> parents = [SELECT Id FROM ParentObject__c];

        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ObjectName(
                Name = 'Test Record ' + i,
                ParentId__c = parents[Math.mod(i, parents.size())].Id  // Distribute across parents
            ));
        }

        Test.startTest();
        Integer queriesBefore = Limits.getQueries();
        Integer dmlBefore = Limits.getDmlStatements();

        insert records;

        Integer queriesUsed = Limits.getQueries() - queriesBefore;
        Integer dmlUsed = Limits.getDmlStatements() - dmlBefore;
        Test.stopTest();

        System.assert(queriesUsed < 10,
            'Should use <10 SOQL queries. Used: ' + queriesUsed);
        System.assert(dmlUsed < 5,
            'Should use <5 DML statements. Used: ' + dmlUsed);
    }
}
*/
