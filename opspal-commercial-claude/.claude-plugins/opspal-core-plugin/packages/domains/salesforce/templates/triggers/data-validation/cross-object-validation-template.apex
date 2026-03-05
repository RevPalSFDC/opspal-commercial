/**
 * @description Validate against related object data
 * @usage Validation requiring data from parent/child records
 * @complexity Medium
 * @bestPractices Handler pattern, before trigger, single query, Map lookups
 *
 * USE CASE EXAMPLES:
 * - Validate child count (Account cannot have more than 100 Contacts)
 * - Validate parent status (cannot create Opportunity if Account is inactive)
 * - Validate hierarchy (cannot set Parent to own child)
 * - Validate related record existence (Product must exist in PriceBook)
 * - Validate sum/total limits (total child Amounts cannot exceed parent Budget)
 * - Validate cross-object business rules
 *
 * WHY USE TRIGGER INSTEAD OF VALIDATION RULE:
 * - Need to query related records
 * - Need to aggregate/sum related data
 * - Need to check multiple levels of hierarchy
 * - Complex cross-object logic
 *
 * PERFORMANCE CONSIDERATIONS:
 * - Query related records ONCE (outside loop)
 * - Use Map for O(1) lookups
 * - Collect IDs in Set first
 * - Minimize SOQL queries (<10 target)
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with your object (e.g., Opportunity)
 * [ ] Replace RelatedObject with parent/child object (e.g., Account)
 * [ ] Update relationship fields (ParentId__c, etc.)
 * [ ] Implement your cross-object validation rules
 * [ ] Test with 200 records to verify bulkification
 * [ ] Deploy to sandbox and test before production
 */

trigger ObjectNameTrigger on ObjectName (before insert, before update) {
    ObjectNameTriggerHandler.handleBeforeInsertUpdate(Trigger.new, Trigger.oldMap);
}

/**
 * HANDLER CLASS TEMPLATE
 *
 * IMPLEMENTATION NOTES:
 * - Use before trigger (can add errors directly to records)
 * - Query related records ONCE (outside loop)
 * - Use Map<Id, RelatedObject> for fast lookups
 * - Minimize SOQL queries
 * - Provide clear error messages with context
 */
/*
public class ObjectNameTriggerHandler {

    // ========================================
    // RECURSION PREVENTION
    // ========================================
    private static Boolean isExecuting = false;

    // ========================================
    // MAIN HANDLER
    // ========================================
    public static void handleBeforeInsertUpdate(List<ObjectName> newRecords, Map<Id, ObjectName> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        Boolean isInsert = (oldMap == null);

        // Call validation methods
        validateParentStatus(newRecords);
        validateChildCount(newRecords, isInsert);
        validateBudgetLimit(newRecords);
        validateHierarchy(newRecords);
        validateRelatedRecordExists(newRecords);

        isExecuting = false;
    }

    // ========================================
    // VALIDATE PARENT STATUS
    // ========================================

    private static void validateParentStatus(List<ObjectName> records) {
        // Step 1: Collect parent IDs
        Set<Id> parentIds = new Set<Id>();
        for (ObjectName record : records) {
            if (record.ParentId__c != null) {
                parentIds.add(record.ParentId__c);
            }
        }

        if (parentIds.isEmpty()) return;

        // Step 2: Query parent records (SINGLE query)
        Map<Id, ParentObject__c> parentMap = new Map<Id, ParentObject__c>([
            SELECT Id, Status__c, Name
            FROM ParentObject__c
            WHERE Id IN :parentIds
        ]);

        // Step 3: Validate each record
        for (ObjectName record : records) {
            if (record.ParentId__c != null) {
                ParentObject__c parent = parentMap.get(record.ParentId__c);

                if (parent == null) {
                    record.ParentId__c.addError('Parent record not found');
                } else if (parent.Status__c == 'Inactive') {
                    record.ParentId__c.addError(
                        'Cannot create record for inactive parent: ' + parent.Name
                    );
                } else if (parent.Status__c == 'Closed') {
                    record.ParentId__c.addError(
                        'Cannot create record for closed parent: ' + parent.Name
                    );
                }
            }
        }
    }

    // ========================================
    // VALIDATE CHILD COUNT LIMIT
    // ========================================

    private static void validateChildCount(List<ObjectName> records, Boolean isInsert) {
        // Only validate on insert (count doesn't change on update)
        if (!isInsert) return;

        // Step 1: Collect parent IDs
        Set<Id> parentIds = new Set<Id>();
        for (ObjectName record : records) {
            if (record.ParentId__c != null) {
                parentIds.add(record.ParentId__c);
            }
        }

        if (parentIds.isEmpty()) return;

        // Step 2: Query parent records with child count (SINGLE query)
        Map<Id, ParentObject__c> parentMap = new Map<Id, ParentObject__c>([
            SELECT Id, Name,
                   (SELECT Id FROM Children__r)
            FROM ParentObject__c
            WHERE Id IN :parentIds
        ]);

        // Step 3: Validate child count limit
        for (ObjectName record : records) {
            if (record.ParentId__c != null) {
                ParentObject__c parent = parentMap.get(record.ParentId__c);

                if (parent != null) {
                    Integer currentCount = parent.Children__r.size();
                    Integer maxAllowed = 100;  // Business rule: max 100 children

                    if (currentCount >= maxAllowed) {
                        record.ParentId__c.addError(
                            'Parent ' + parent.Name + ' already has ' + currentCount +
                            ' children. Maximum allowed is ' + maxAllowed + '.'
                        );
                    }
                }
            }
        }
    }

    // ========================================
    // VALIDATE BUDGET LIMIT (SUM)
    // ========================================

    private static void validateBudgetLimit(List<ObjectName> records) {
        // Step 1: Collect parent IDs
        Set<Id> parentIds = new Set<Id>();
        for (ObjectName record : records) {
            if (record.ParentId__c != null && record.Amount__c != null) {
                parentIds.add(record.ParentId__c);
            }
        }

        if (parentIds.isEmpty()) return;

        // Step 2: Query parent with budget and existing children amounts (SINGLE query)
        Map<Id, ParentObject__c> parentMap = new Map<Id, ParentObject__c>([
            SELECT Id, Name, Budget__c,
                   (SELECT Amount__c FROM Children__r)
            FROM ParentObject__c
            WHERE Id IN :parentIds
        ]);

        // Step 3: Calculate existing totals
        Map<Id, Decimal> existingTotals = new Map<Id, Decimal>();
        for (ParentObject__c parent : parentMap.values()) {
            Decimal total = 0;
            for (ObjectName child : parent.Children__r) {
                total += (child.Amount__c != null ? child.Amount__c : 0);
            }
            existingTotals.put(parent.Id, total);
        }

        // Step 4: Validate each record
        for (ObjectName record : records) {
            if (record.ParentId__c != null && record.Amount__c != null) {
                ParentObject__c parent = parentMap.get(record.ParentId__c);

                if (parent != null && parent.Budget__c != null) {
                    Decimal existingTotal = existingTotals.get(parent.Id);
                    Decimal newTotal = existingTotal + record.Amount__c;

                    if (newTotal > parent.Budget__c) {
                        record.Amount__c.addError(
                            'Total amount ($' + newTotal + ') would exceed parent budget ($' +
                            parent.Budget__c + ') for ' + parent.Name
                        );
                    }
                }
            }
        }
    }

    // ========================================
    // VALIDATE HIERARCHY (NO LOOPS)
    // ========================================

    private static void validateHierarchy(List<ObjectName> records) {
        // Prevent circular references (A → B → A)
        // Only validate if ParentId is being set

        Set<Id> recordIds = new Set<Id>();
        for (ObjectName record : records) {
            if (record.Id != null) {
                recordIds.add(record.Id);
            }
        }

        if (recordIds.isEmpty()) return;

        // Query potential parent records
        Set<Id> parentIds = new Set<Id>();
        for (ObjectName record : records) {
            if (record.ParentId__c != null) {
                parentIds.add(record.ParentId__c);
            }
        }

        if (parentIds.isEmpty()) return;

        // Query parent records with their hierarchy
        Map<Id, ObjectName> parentMap = new Map<Id, ObjectName>([
            SELECT Id, Name, ParentId__c
            FROM ObjectName
            WHERE Id IN :parentIds
        ]);

        // Validate no circular references
        for (ObjectName record : records) {
            if (record.ParentId__c != null && recordIds.contains(record.ParentId__c)) {
                record.ParentId__c.addError('Cannot set parent to self');
            }

            // Check if parent is already a child of this record
            if (record.Id != null && record.ParentId__c != null) {
                ObjectName parent = parentMap.get(record.ParentId__c);
                if (parent != null && parent.ParentId__c == record.Id) {
                    record.ParentId__c.addError(
                        'Cannot create circular reference: ' + parent.Name +
                        ' is already a child of this record'
                    );
                }
            }
        }
    }

    // ========================================
    // VALIDATE RELATED RECORD EXISTS
    // ========================================

    private static void validateRelatedRecordExists(List<ObjectName> records) {
        // Validate that related record exists and meets criteria
        // Example: Product must exist in PriceBook

        Set<Id> productIds = new Set<Id>();
        Set<Id> priceBookIds = new Set<Id>();

        for (ObjectName record : records) {
            if (record.ProductId__c != null) {
                productIds.add(record.ProductId__c);
            }
            if (record.PriceBookId__c != null) {
                priceBookIds.add(record.PriceBookId__c);
            }
        }

        if (productIds.isEmpty() || priceBookIds.isEmpty()) return;

        // Query PriceBookEntries (junction object)
        Set<String> validCombinations = new Set<String>();
        for (PriceBookEntry pbe : [
            SELECT Product2Id, Pricebook2Id
            FROM PriceBookEntry
            WHERE Product2Id IN :productIds
              AND Pricebook2Id IN :priceBookIds
              AND IsActive = true
        ]) {
            validCombinations.add('' + pbe.Product2Id + '-' + pbe.Pricebook2Id);
        }

        // Validate each record
        for (ObjectName record : records) {
            if (record.ProductId__c != null && record.PriceBookId__c != null) {
                String key = '' + record.ProductId__c + '-' + record.PriceBookId__c;

                if (!validCombinations.contains(key)) {
                    record.ProductId__c.addError(
                        'Product is not available in the selected PriceBook'
                    );
                }
            }
        }
    }
}
*/

/**
 * REAL-WORLD EXAMPLE: Opportunity Line Item Validation
 *
 * Scenario: Validate OppLineItem against Opportunity and PriceBook
 */
/*
trigger OpportunityLineItemTrigger on OpportunityLineItem (before insert, before update) {
    OpportunityLineItemValidationHandler.handleBeforeInsertUpdate(Trigger.new, Trigger.oldMap);
}

public class OpportunityLineItemValidationHandler {

    private static Boolean isExecuting = false;

    public static void handleBeforeInsertUpdate(List<OpportunityLineItem> newLineItems,
                                                 Map<Id, OpportunityLineItem> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        Boolean isInsert = (oldMap == null);

        validateOpportunityStatus(newLineItems);
        validateOpportunityLineItemCount(newLineItems, isInsert);
        validateTotalAmountLimit(newLineItems);
        validateProductInPriceBook(newLineItems);

        isExecuting = false;
    }

    private static void validateOpportunityStatus(List<OpportunityLineItem> lineItems) {
        // Cannot add products to closed opportunities

        // Step 1: Collect opportunity IDs
        Set<Id> oppIds = new Set<Id>();
        for (OpportunityLineItem lineItem : lineItems) {
            oppIds.add(lineItem.OpportunityId);
        }

        // Step 2: Query opportunities (SINGLE query)
        Map<Id, Opportunity> oppMap = new Map<Id, Opportunity>([
            SELECT Id, Name, StageName, IsClosed
            FROM Opportunity
            WHERE Id IN :oppIds
        ]);

        // Step 3: Validate each line item
        for (OpportunityLineItem lineItem : lineItems) {
            Opportunity opp = oppMap.get(lineItem.OpportunityId);

            if (opp != null && opp.IsClosed) {
                lineItem.addError(
                    'Cannot add or modify products on closed opportunity: ' + opp.Name
                );
            }
        }
    }

    private static void validateOpportunityLineItemCount(List<OpportunityLineItem> lineItems,
                                                          Boolean isInsert) {
        // Max 50 line items per opportunity
        if (!isInsert) return;

        // Step 1: Collect opportunity IDs
        Set<Id> oppIds = new Set<Id>();
        for (OpportunityLineItem lineItem : lineItems) {
            oppIds.add(lineItem.OpportunityId);
        }

        // Step 2: Query opportunities with line item count (SINGLE query)
        Map<Id, Opportunity> oppMap = new Map<Id, Opportunity>([
            SELECT Id, Name,
                   (SELECT Id FROM OpportunityLineItems)
            FROM Opportunity
            WHERE Id IN :oppIds
        ]);

        // Step 3: Validate line item count
        for (OpportunityLineItem lineItem : lineItems) {
            Opportunity opp = oppMap.get(lineItem.OpportunityId);

            if (opp != null) {
                Integer currentCount = opp.OpportunityLineItems.size();
                Integer maxAllowed = 50;

                if (currentCount >= maxAllowed) {
                    lineItem.addError(
                        'Opportunity ' + opp.Name + ' already has ' + currentCount +
                        ' products. Maximum allowed is ' + maxAllowed + '.'
                    );
                }
            }
        }
    }

    private static void validateTotalAmountLimit(List<OpportunityLineItem> lineItems) {
        // Total line items cannot exceed opportunity Amount

        // Step 1: Collect opportunity IDs
        Set<Id> oppIds = new Set<Id>();
        for (OpportunityLineItem lineItem : lineItems) {
            oppIds.add(lineItem.OpportunityId);
        }

        // Step 2: Query opportunities with existing line items (SINGLE query)
        Map<Id, Opportunity> oppMap = new Map<Id, Opportunity>([
            SELECT Id, Name, Amount,
                   (SELECT TotalPrice FROM OpportunityLineItems)
            FROM Opportunity
            WHERE Id IN :oppIds
        ]);

        // Step 3: Calculate existing totals
        Map<Id, Decimal> existingTotals = new Map<Id, Decimal>();
        for (Opportunity opp : oppMap.values()) {
            Decimal total = 0;
            for (OpportunityLineItem existingLineItem : opp.OpportunityLineItems) {
                total += (existingLineItem.TotalPrice != null ? existingLineItem.TotalPrice : 0);
            }
            existingTotals.put(opp.Id, total);
        }

        // Step 4: Validate each line item
        for (OpportunityLineItem lineItem : lineItems) {
            Opportunity opp = oppMap.get(lineItem.OpportunityId);

            if (opp != null && opp.Amount != null) {
                Decimal existingTotal = existingTotals.get(opp.Id);
                Decimal lineItemTotal = lineItem.TotalPrice != null ? lineItem.TotalPrice : 0;
                Decimal newTotal = existingTotal + lineItemTotal;

                if (newTotal > opp.Amount) {
                    lineItem.TotalPrice.addError(
                        'Total products ($' + newTotal + ') would exceed opportunity amount ($' +
                        opp.Amount + ') for ' + opp.Name
                    );
                }
            }
        }
    }

    private static void validateProductInPriceBook(List<OpportunityLineItem> lineItems) {
        // Product must be in opportunity's PriceBook

        // Step 1: Collect product IDs and opportunity IDs
        Set<Id> productIds = new Set<Id>();
        Set<Id> oppIds = new Set<Id>();

        for (OpportunityLineItem lineItem : lineItems) {
            productIds.add(lineItem.Product2Id);
            oppIds.add(lineItem.OpportunityId);
        }

        // Step 2: Query opportunities to get PriceBook IDs (SINGLE query)
        Map<Id, Id> oppToPriceBook = new Map<Id, Id>();
        for (Opportunity opp : [
            SELECT Id, Pricebook2Id
            FROM Opportunity
            WHERE Id IN :oppIds
        ]) {
            oppToPriceBook.put(opp.Id, opp.Pricebook2Id);
        }

        // Step 3: Query PriceBookEntries (SINGLE query)
        Set<String> validCombinations = new Set<String>();
        for (PriceBookEntry pbe : [
            SELECT Product2Id, Pricebook2Id
            FROM PriceBookEntry
            WHERE Product2Id IN :productIds
              AND Pricebook2Id IN :oppToPriceBook.values()
              AND IsActive = true
        ]) {
            validCombinations.add('' + pbe.Product2Id + '-' + pbe.Pricebook2Id);
        }

        // Step 4: Validate each line item
        for (OpportunityLineItem lineItem : lineItems) {
            Id priceBookId = oppToPriceBook.get(lineItem.OpportunityId);
            String key = '' + lineItem.Product2Id + '-' + priceBookId;

            if (!validCombinations.contains(key)) {
                lineItem.Product2Id.addError(
                    'Product is not available in the opportunity\'s PriceBook'
                );
            }
        }
    }
}
*/

/**
 * TEST CLASS TEMPLATE
 *
 * TESTING CHECKLIST:
 * [ ] Test valid scenarios (should NOT throw errors)
 * [ ] Test parent status validation
 * [ ] Test child count limit
 * [ ] Test budget/sum limit validation
 * [ ] Test hierarchy/circular reference prevention
 * [ ] Test related record existence
 * [ ] Test bulk (200 records) - verify <10 SOQL queries
 * [ ] Verify error messages are clear
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
                Status__c = 'Active',
                Budget__c = 10000
            ));
        }
        insert parents;
    }

    // ========================================
    // VALID RECORD TEST
    // ========================================

    @isTest
    static void testInsert_ValidRecord() {
        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        ObjectName record = new ObjectName(
            Name = 'Test Record',
            ParentId__c = parent.Id,
            Amount__c = 1000
        );

        Test.startTest();
        insert record;
        Test.stopTest();

        ObjectName inserted = [SELECT Id FROM ObjectName WHERE Id = :record.Id];
        System.assertNotEquals(null, inserted.Id, 'Valid record should be inserted');
    }

    // ========================================
    // PARENT STATUS VALIDATION TEST
    // ========================================

    @isTest
    static void testInsert_InactiveParent() {
        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];
        parent.Status__c = 'Inactive';
        update parent;

        ObjectName record = new ObjectName(
            Name = 'Test Record',
            ParentId__c = parent.Id
        );

        Test.startTest();
        try {
            insert record;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('inactive'),
                'Error should mention inactive parent');
        }
        Test.stopTest();
    }

    // ========================================
    // CHILD COUNT LIMIT TEST
    // ========================================

    @isTest
    static void testInsert_ExceedsChildLimit() {
        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        // Create 100 existing children (at limit)
        List<ObjectName> existingChildren = new List<ObjectName>();
        for (Integer i = 0; i < 100; i++) {
            existingChildren.add(new ObjectName(
                Name = 'Existing ' + i,
                ParentId__c = parent.Id
            ));
        }
        insert existingChildren;

        // Try to add one more (should fail)
        ObjectName record = new ObjectName(
            Name = 'One Too Many',
            ParentId__c = parent.Id
        );

        Test.startTest();
        try {
            insert record;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('Maximum allowed'),
                'Error should mention child limit');
        }
        Test.stopTest();
    }

    // ========================================
    // BUDGET LIMIT VALIDATION TEST
    // ========================================

    @isTest
    static void testInsert_ExceedsBudget() {
        ParentObject__c parent = [SELECT Id, Budget__c FROM ParentObject__c LIMIT 1];

        // Create existing child using 9,000 of 10,000 budget
        ObjectName existingChild = new ObjectName(
            Name = 'Existing',
            ParentId__c = parent.Id,
            Amount__c = 9000
        );
        insert existingChild;

        // Try to add 2,000 more (total would be 11,000, exceeds 10,000 budget)
        ObjectName record = new ObjectName(
            Name = 'Too Much',
            ParentId__c = parent.Id,
            Amount__c = 2000
        );

        Test.startTest();
        try {
            insert record;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('exceed parent budget'),
                'Error should mention budget exceeded');
        }
        Test.stopTest();
    }

    // ========================================
    // HIERARCHY VALIDATION TEST
    // ========================================

    @isTest
    static void testUpdate_CircularReference() {
        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        // Create parent-child relationship
        ObjectName child = new ObjectName(
            Name = 'Child',
            ParentId__c = parent.Id
        );
        insert child;

        ObjectName parentRecord = new ObjectName(
            Name = 'Parent',
            Id = parent.Id
        );

        // Try to set parent of parent to child (circular)
        parentRecord.ParentId__c = child.Id;

        Test.startTest();
        try {
            update parentRecord;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('circular'),
                'Error should mention circular reference');
        }
        Test.stopTest();
    }

    // ========================================
    // BULK VALIDATION TEST
    // ========================================

    @isTest
    static void testInsert_BulkRecords() {
        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ObjectName(
                Name = 'Test Record ' + i,
                ParentId__c = parent.Id,
                Amount__c = 10  // Total 2,000 (within 10,000 budget)
            ));
        }

        Test.startTest();
        Integer queriesBefore = Limits.getQueries();
        insert records;
        Integer queriesUsed = Limits.getQueries() - queriesBefore;
        Test.stopTest();

        List<ObjectName> inserted = [SELECT Id FROM ObjectName];
        System.assertEquals(200, inserted.size(), 'All 200 records should be inserted');
        System.assert(queriesUsed < 10,
            'Should use <10 SOQL queries. Used: ' + queriesUsed);
    }

    // ========================================
    // GOVERNOR LIMIT TEST
    // ========================================

    @isTest
    static void testInsert_MultipleParents() {
        List<ParentObject__c> parents = [SELECT Id FROM ParentObject__c];

        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ObjectName(
                Name = 'Test Record ' + i,
                ParentId__c = parents[Math.mod(i, parents.size())].Id,
                Amount__c = 100
            ));
        }

        Test.startTest();
        Integer queriesBefore = Limits.getQueries();
        insert records;
        Integer queriesUsed = Limits.getQueries() - queriesBefore;
        Test.stopTest();

        System.assert(queriesUsed < 10,
            'Should use <10 SOQL queries even with multiple parents. Used: ' + queriesUsed);
    }
}
*/
