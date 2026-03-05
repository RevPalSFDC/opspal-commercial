/**
 * @description Minimal before update trigger with handler pattern
 * @usage Data validation, field updates, audit tracking
 * @complexity Simple
 * @bestPractices Handler pattern, recursion prevention, detect changes with oldMap
 *
 * USE CASE EXAMPLES:
 * - Validate field changes (prevent changing locked fields)
 * - Track changes (update LastModifiedByUser__c)
 * - Conditional validation (different rules per record type)
 * - Prevent status regression (can't go backwards)
 * - Auto-update timestamps (LastStatusChangeDate__c)
 *
 * WHY BEFORE UPDATE:
 * - Can modify Trigger.new directly (no DML needed)
 * - Runs before validation rules
 * - Has access to Trigger.old and Trigger.oldMap (detect changes)
 * - Runs after system updates CreatedDate, LastModifiedDate
 * - Ideal for validation and audit tracking
 *
 * KEY PATTERN: Use Trigger.oldMap to detect changes
 * - Only process records where specific fields changed
 * - Avoid unnecessary processing on irrelevant updates
 * - Compare newRecord vs oldRecord
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with your object (e.g., Account, Opportunity)
 * [ ] Update handler class name (ObjectNameTriggerHandler)
 * [ ] Implement change detection logic
 * [ ] Add test class with field change scenarios
 * [ ] Deploy to sandbox and test before production
 */

trigger ObjectNameTrigger on ObjectName (before update) {
    ObjectNameTriggerHandler.handleBeforeUpdate(Trigger.new, Trigger.oldMap);
}

/**
 * HANDLER CLASS TEMPLATE
 *
 * IMPLEMENTATION NOTES:
 * - Keep trigger minimal (just routing logic)
 * - Put ALL business logic in handler class
 * - Implement recursion prevention (critical for before update!)
 * - Always use Trigger.oldMap to detect changes
 * - Process only records where relevant fields changed
 * - Query outside loops, use Map for lookups
 */
/*
public class ObjectNameTriggerHandler {

    // ========================================
    // RECURSION PREVENTION
    // ========================================
    // CRITICAL for before update (can cause infinite loops)
    private static Boolean isExecuting = false;

    // ========================================
    // MAIN HANDLER
    // ========================================
    public static void handleBeforeUpdate(List<ObjectName> newRecords, Map<Id, ObjectName> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        // Call helper methods in logical order
        validateFieldChanges(newRecords, oldMap);     // 1. Validation first
        trackChanges(newRecords, oldMap);             // 2. Track what changed
        updateTimestamps(newRecords, oldMap);         // 3. Update audit fields
        enrichOnChange(newRecords, oldMap);           // 4. Update related data

        isExecuting = false;
    }

    // ========================================
    // VALIDATION METHODS
    // ========================================

    private static void validateFieldChanges(List<ObjectName> newRecords, Map<Id, ObjectName> oldMap) {
        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            // Prevent changing locked fields
            if (newRecord.LockedField__c != oldRecord.LockedField__c) {
                newRecord.LockedField__c.addError('LockedField__c cannot be changed after creation');
            }

            // Prevent status regression
            if (newRecord.Status__c != oldRecord.Status__c) {
                if (!isValidStatusChange(oldRecord.Status__c, newRecord.Status__c)) {
                    newRecord.Status__c.addError(
                        'Cannot change status from ' + oldRecord.Status__c + ' to ' + newRecord.Status__c
                    );
                }
            }

            // Conditional validation (different rules per record type)
            if (newRecord.RecordTypeId != oldRecord.RecordTypeId) {
                // Don't allow changing record type if has children
                if (hasChildren(newRecord.Id)) {
                    newRecord.RecordTypeId.addError('Cannot change record type when child records exist');
                }
            }

            // Cross-field validation on change
            if (newRecord.EndDate__c != oldRecord.EndDate__c) {
                if (newRecord.EndDate__c < newRecord.StartDate__c) {
                    newRecord.EndDate__c.addError('End Date must be after Start Date');
                }
            }
        }
    }

    // ========================================
    // CHANGE TRACKING METHODS
    // ========================================

    private static void trackChanges(List<ObjectName> newRecords, Map<Id, ObjectName> oldMap) {
        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            // Track status changes
            if (newRecord.Status__c != oldRecord.Status__c) {
                newRecord.LastStatusChangeDate__c = System.today();
                newRecord.PreviousStatus__c = oldRecord.Status__c;
            }

            // Track owner changes
            if (newRecord.OwnerId != oldRecord.OwnerId) {
                newRecord.LastOwnerChangeDate__c = System.now();
                newRecord.PreviousOwner__c = oldRecord.OwnerId;
            }

            // Track important field changes
            if (newRecord.ImportantField__c != oldRecord.ImportantField__c) {
                newRecord.ImportantFieldChangeCount__c =
                    (oldRecord.ImportantFieldChangeCount__c != null ? oldRecord.ImportantFieldChangeCount__c : 0) + 1;
            }

            // Build change log
            List<String> changes = new List<String>();
            if (newRecord.Name != oldRecord.Name) {
                changes.add('Name: ' + oldRecord.Name + ' → ' + newRecord.Name);
            }
            if (newRecord.Status__c != oldRecord.Status__c) {
                changes.add('Status: ' + oldRecord.Status__c + ' → ' + newRecord.Status__c);
            }
            if (!changes.isEmpty()) {
                newRecord.ChangeLog__c = String.join(changes, '\n') +
                    '\n\nChanged by: ' + UserInfo.getName() +
                    '\nChanged at: ' + System.now().format();
            }
        }
    }

    // ========================================
    // TIMESTAMP UPDATE METHODS
    // ========================================

    private static void updateTimestamps(List<ObjectName> newRecords, Map<Id, ObjectName> oldMap) {
        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            // Update stage change timestamp
            if (newRecord.Stage__c != oldRecord.Stage__c) {
                newRecord.StageChangeDate__c = System.now();
            }

            // Update approval timestamp
            if (newRecord.ApprovalStatus__c != oldRecord.ApprovalStatus__c &&
                newRecord.ApprovalStatus__c == 'Approved') {
                newRecord.ApprovedDate__c = System.now();
                newRecord.ApprovedBy__c = UserInfo.getUserId();
            }

            // Update completion timestamp
            if (newRecord.Status__c != oldRecord.Status__c &&
                newRecord.Status__c == 'Completed') {
                newRecord.CompletedDate__c = System.now();
            }
        }
    }

    // ========================================
    // ENRICHMENT ON CHANGE METHODS
    // ========================================

    private static void enrichOnChange(List<ObjectName> newRecords, Map<Id, ObjectName> oldMap) {
        // Only process records where parent changed
        List<ObjectName> recordsWithParentChange = new List<ObjectName>();
        Set<Id> newParentIds = new Set<Id>();

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            if (newRecord.ParentId__c != oldRecord.ParentId__c) {
                recordsWithParentChange.add(newRecord);
                if (newRecord.ParentId__c != null) {
                    newParentIds.add(newRecord.ParentId__c);
                }
            }
        }

        if (recordsWithParentChange.isEmpty()) return;

        // Query new parent records (SINGLE query)
        Map<Id, ParentObject__c> parentMap = new Map<Id, ParentObject__c>([
            SELECT Id, Industry__c, Rating__c
            FROM ParentObject__c
            WHERE Id IN :newParentIds
        ]);

        // Update fields from new parent
        for (ObjectName record : recordsWithParentChange) {
            if (record.ParentId__c != null) {
                ParentObject__c parent = parentMap.get(record.ParentId__c);
                if (parent != null) {
                    record.ParentIndustry__c = parent.Industry__c;
                    record.ParentRating__c = parent.Rating__c;
                } else {
                    // Parent not found - clear fields
                    record.ParentIndustry__c = null;
                    record.ParentRating__c = null;
                }
            } else {
                // Parent removed - clear fields
                record.ParentIndustry__c = null;
                record.ParentRating__c = null;
            }
        }
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    private static Boolean isValidStatusChange(String oldStatus, String newStatus) {
        // Define valid status transitions
        Map<String, Set<String>> validTransitions = new Map<String, Set<String>>{
            'New' => new Set<String>{'In Progress', 'Cancelled'},
            'In Progress' => new Set<String>{'Completed', 'On Hold', 'Cancelled'},
            'On Hold' => new Set<String>{'In Progress', 'Cancelled'},
            'Completed' => new Set<String>(),  // Cannot change from Completed
            'Cancelled' => new Set<String>()   // Cannot change from Cancelled
        };

        Set<String> allowedTransitions = validTransitions.get(oldStatus);
        return allowedTransitions != null && allowedTransitions.contains(newStatus);
    }

    private static Boolean hasChildren(Id recordId) {
        // Query to check if record has children
        List<ChildObject__c> children = [
            SELECT Id
            FROM ChildObject__c
            WHERE ParentId__c = :recordId
            LIMIT 1
        ];
        return !children.isEmpty();
    }
}
*/

/**
 * REAL-WORLD EXAMPLE: Opportunity Before Update
 *
 * Scenario: Validate stage changes, track changes, enforce business rules
 */
/*
trigger OpportunityTrigger on Opportunity (before update) {
    OpportunityTriggerHandler.handleBeforeUpdate(Trigger.new, Trigger.oldMap);
}

public class OpportunityTriggerHandler {

    private static Boolean isExecuting = false;

    public static void handleBeforeUpdate(List<Opportunity> newOpps, Map<Id, Opportunity> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        // Validate
        validateStageChanges(newOpps, oldMap);

        // Track
        trackOpportunityChanges(newOpps, oldMap);

        // Update timestamps
        updateStageTimestamps(newOpps, oldMap);

        // Enrich on account change
        enrichOnAccountChange(newOpps, oldMap);

        isExecuting = false;
    }

    private static void validateStageChanges(List<Opportunity> opps, Map<Id, Opportunity> oldMap) {
        for (Opportunity opp : opps) {
            Opportunity oldOpp = oldMap.get(opp.Id);

            // Only validate if stage changed
            if (opp.StageName != oldOpp.StageName) {

                // Cannot skip stages
                if (!isValidStageProgression(oldOpp.StageName, opp.StageName)) {
                    opp.StageName.addError('Cannot skip stages. Must progress through each stage in order.');
                }

                // Cannot move to Closed Won without required fields
                if (opp.StageName == 'Closed Won') {
                    if (opp.Amount == null) {
                        opp.Amount.addError('Amount is required to close as won');
                    }
                    if (opp.NextStep == null || opp.NextStep == '') {
                        opp.NextStep.addError('Next Step is required to close as won');
                    }
                }

                // Cannot move backwards (except to Closed Lost)
                if (getStageOrder(opp.StageName) < getStageOrder(oldOpp.StageName) &&
                    opp.StageName != 'Closed Lost') {
                    opp.StageName.addError('Cannot move backwards in stages except to Closed Lost');
                }
            }

            // Cannot change Amount on closed opportunities
            if (opp.Amount != oldOpp.Amount) {
                if (oldOpp.IsClosed) {
                    opp.Amount.addError('Cannot change Amount on closed opportunities');
                }
            }

            // Cannot change Account on opportunities with products
            if (opp.AccountId != oldOpp.AccountId) {
                if (hasOpportunityLineItems(opp.Id)) {
                    opp.AccountId.addError('Cannot change Account when opportunity has products');
                }
            }
        }
    }

    private static void trackOpportunityChanges(List<Opportunity> opps, Map<Id, Opportunity> oldMap) {
        for (Opportunity opp : opps) {
            Opportunity oldOpp = oldMap.get(opp.Id);

            // Track stage changes
            if (opp.StageName != oldOpp.StageName) {
                opp.LastStageChangeDate__c = System.today();
                opp.PreviousStage__c = oldOpp.StageName;
                opp.DaysInPreviousStage__c = calculateDaysInStage(oldOpp);
            }

            // Track owner changes
            if (opp.OwnerId != oldOpp.OwnerId) {
                opp.LastOwnerChangeDate__c = System.now();
                opp.OwnerChangeCount__c = (oldOpp.OwnerChangeCount__c != null ? oldOpp.OwnerChangeCount__c : 0) + 1;
            }

            // Track amount changes
            if (opp.Amount != oldOpp.Amount) {
                opp.PreviousAmount__c = oldOpp.Amount;
                opp.AmountChangeDate__c = System.now();
            }
        }
    }

    private static void updateStageTimestamps(List<Opportunity> opps, Map<Id, Opportunity> oldMap) {
        for (Opportunity opp : opps) {
            Opportunity oldOpp = oldMap.get(opp.Id);

            // Update stage-specific timestamps
            if (opp.StageName != oldOpp.StageName) {
                if (opp.StageName == 'Qualification') {
                    opp.QualificationDate__c = System.now();
                }
                else if (opp.StageName == 'Proposal') {
                    opp.ProposalSentDate__c = System.now();
                }
                else if (opp.StageName == 'Negotiation') {
                    opp.NegotiationStartDate__c = System.now();
                }
                else if (opp.StageName == 'Closed Won') {
                    opp.ClosedWonDate__c = System.now();
                    opp.ClosedBy__c = UserInfo.getUserId();
                }
                else if (opp.StageName == 'Closed Lost') {
                    opp.ClosedLostDate__c = System.now();
                }
            }
        }
    }

    private static void enrichOnAccountChange(List<Opportunity> opps, Map<Id, Opportunity> oldMap) {
        // Only process opportunities where Account changed
        List<Opportunity> oppsWithAccountChange = new List<Opportunity>();
        Set<Id> newAccountIds = new Set<Id>();

        for (Opportunity opp : opps) {
            Opportunity oldOpp = oldMap.get(opp.Id);

            if (opp.AccountId != oldOpp.AccountId) {
                oppsWithAccountChange.add(opp);
                if (opp.AccountId != null) {
                    newAccountIds.add(opp.AccountId);
                }
            }
        }

        if (oppsWithAccountChange.isEmpty()) return;

        // Query new Accounts (SINGLE query)
        Map<Id, Account> accountMap = new Map<Id, Account>([
            SELECT Id, Industry, AnnualRevenue, Rating, BillingCountry
            FROM Account
            WHERE Id IN :newAccountIds
        ]);

        // Update fields from new Account
        for (Opportunity opp : oppsWithAccountChange) {
            if (opp.AccountId != null) {
                Account acc = accountMap.get(opp.AccountId);
                if (acc != null) {
                    opp.Industry__c = acc.Industry;
                    opp.AccountRevenue__c = acc.AnnualRevenue;
                    opp.AccountRating__c = acc.Rating;
                    opp.Country__c = acc.BillingCountry;
                }
            } else {
                // Account removed - clear fields
                opp.Industry__c = null;
                opp.AccountRevenue__c = null;
                opp.AccountRating__c = null;
                opp.Country__c = null;
            }
        }
    }

    // Utility methods
    private static Boolean isValidStageProgression(String oldStage, String newStage) {
        Map<String, Set<String>> validProgressions = new Map<String, Set<String>>{
            'Prospecting' => new Set<String>{'Qualification', 'Closed Lost'},
            'Qualification' => new Set<String>{'Needs Analysis', 'Closed Lost'},
            'Needs Analysis' => new Set<String>{'Proposal', 'Closed Lost'},
            'Proposal' => new Set<String>{'Negotiation', 'Closed Lost'},
            'Negotiation' => new Set<String>{'Closed Won', 'Closed Lost'}
        };

        Set<String> allowed = validProgressions.get(oldStage);
        return allowed != null && allowed.contains(newStage);
    }

    private static Integer getStageOrder(String stageName) {
        Map<String, Integer> stageOrder = new Map<String, Integer>{
            'Prospecting' => 1,
            'Qualification' => 2,
            'Needs Analysis' => 3,
            'Proposal' => 4,
            'Negotiation' => 5,
            'Closed Won' => 6,
            'Closed Lost' => 0  // Can move to this from any stage
        };
        return stageOrder.get(stageName) != null ? stageOrder.get(stageName) : 0;
    }

    private static Integer calculateDaysInStage(Opportunity oldOpp) {
        if (oldOpp.LastStageChangeDate__c != null) {
            return Date.today().daysBetween(oldOpp.LastStageChangeDate__c);
        }
        return 0;
    }

    private static Boolean hasOpportunityLineItems(Id oppId) {
        List<OpportunityLineItem> lineItems = [
            SELECT Id
            FROM OpportunityLineItem
            WHERE OpportunityId = :oppId
            LIMIT 1
        ];
        return !lineItems.isEmpty();
    }
}
*/

/**
 * TEST CLASS TEMPLATE
 *
 * TESTING CHECKLIST:
 * [ ] Test field change detection
 * [ ] Test validation on specific field changes
 * [ ] Test no changes (update without changing tracked fields)
 * [ ] Test bulk (200 records) - MANDATORY
 * [ ] Test recursion prevention
 * [ ] Test locked field validation
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

        // Create ObjectName records
        ParentObject__c parent = parents[0];
        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ObjectName(
                Name = 'Test Record ' + i,
                Status__c = 'New',
                ParentId__c = parent.Id
            ));
        }
        insert records;
    }

    // ========================================
    // FIELD CHANGE DETECTION TEST
    // ========================================

    @isTest
    static void testUpdate_StatusChange() {
        ObjectName record = [SELECT Id, Status__c FROM ObjectName LIMIT 1];
        record.Status__c = 'In Progress';

        Test.startTest();
        update record;
        Test.stopTest();

        ObjectName updated = [
            SELECT Status__c, LastStatusChangeDate__c, PreviousStatus__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals('In Progress', updated.Status__c, 'Status should be updated');
        System.assertEquals(Date.today(), updated.LastStatusChangeDate__c, 'Change date should be set');
        System.assertEquals('New', updated.PreviousStatus__c, 'Previous status should be tracked');
    }

    // ========================================
    // NO CHANGE TEST
    // ========================================

    @isTest
    static void testUpdate_NoStatusChange() {
        ObjectName record = [SELECT Id, Name FROM ObjectName LIMIT 1];
        record.Name = 'Updated Name';  // Change non-tracked field

        Test.startTest();
        Integer queriesBefore = Limits.getQueries();
        update record;
        Integer queriesUsed = Limits.getQueries() - queriesBefore;
        Test.stopTest();

        ObjectName updated = [
            SELECT LastStatusChangeDate__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals(null, updated.LastStatusChangeDate__c,
            'Change date should not be set when status not changed');
        System.assert(queriesUsed < 5,
            'Should not query parent when status not changed');
    }

    // ========================================
    // VALIDATION TEST
    // ========================================

    @isTest
    static void testUpdate_LockedFieldValidation() {
        ObjectName record = [SELECT Id, LockedField__c FROM ObjectName LIMIT 1];
        record.LockedField__c = 'New Value';

        Test.startTest();
        try {
            update record;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('cannot be changed'),
                'Error message should mention field is locked');
        }
        Test.stopTest();
    }

    // ========================================
    // PARENT CHANGE TEST
    // ========================================

    @isTest
    static void testUpdate_ParentChange() {
        List<ParentObject__c> parents = [SELECT Id, Industry__c FROM ParentObject__c LIMIT 2];
        ParentObject__c parent1 = parents[0];
        ParentObject__c parent2 = parents[1];

        ObjectName record = [SELECT Id, ParentId__c FROM ObjectName LIMIT 1];
        record.ParentId__c = parent2.Id;

        Test.startTest();
        update record;
        Test.stopTest();

        ObjectName updated = [
            SELECT ParentIndustry__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals(parent2.Industry__c, updated.ParentIndustry__c,
            'Parent industry should be updated from new parent');
    }

    // ========================================
    // BULK UPDATE TEST (MANDATORY)
    // ========================================

    @isTest
    static void testUpdate_BulkRecords() {
        List<ObjectName> records = [SELECT Id, Status__c FROM ObjectName];

        for (ObjectName record : records) {
            record.Status__c = 'In Progress';
        }

        Test.startTest();
        update records;
        Test.stopTest();

        List<ObjectName> updated = [
            SELECT LastStatusChangeDate__c
            FROM ObjectName
            WHERE LastStatusChangeDate__c = TODAY
        ];

        System.assertEquals(200, updated.size(), 'All 200 records should have change date set');
    }

    // ========================================
    // RECURSION PREVENTION TEST
    // ========================================

    @isTest
    static void testUpdate_RecursionPrevention() {
        ObjectName record = [SELECT Id, Status__c FROM ObjectName LIMIT 1];
        record.Status__c = 'In Progress';

        Test.startTest();
        update record;  // Trigger fires once

        // If trigger updates the record again in handler, recursion flag should prevent re-entry
        ObjectName requeried = [SELECT Status__c FROM ObjectName WHERE Id = :record.Id];
        System.assertEquals('In Progress', requeried.Status__c, 'Status should be updated');
        Test.stopTest();
    }

    // ========================================
    // GOVERNOR LIMIT TEST
    // ========================================

    @isTest
    static void testUpdate_GovernorLimits() {
        List<ParentObject__c> parents = [SELECT Id FROM ParentObject__c];
        List<ObjectName> records = [SELECT Id, ParentId__c FROM ObjectName];

        // Change parent on all records (forces enrichment)
        for (Integer i = 0; i < records.size(); i++) {
            records[i].ParentId__c = parents[Math.mod(i, parents.size())].Id;
        }

        Test.startTest();
        Integer queriesBefore = Limits.getQueries();
        Integer dmlBefore = Limits.getDmlStatements();

        update records;

        Integer queriesUsed = Limits.getQueries() - queriesBefore;
        Integer dmlUsed = Limits.getDmlStatements() - dmlBefore;
        Test.stopTest();

        System.assert(queriesUsed < 10,
            'Should use <10 SOQL queries. Used: ' + queriesUsed);
        System.assert(dmlUsed < 5,
            'Should use <5 DML statements. Used: ' + dmlUsed);
    }

    // ========================================
    // MULTIPLE FIELD CHANGES TEST
    // ========================================

    @isTest
    static void testUpdate_MultipleFields() {
        ObjectName record = [SELECT Id, Status__c, Name FROM ObjectName LIMIT 1];
        record.Status__c = 'In Progress';
        record.Name = 'Updated Name';

        Test.startTest();
        update record;
        Test.stopTest();

        ObjectName updated = [
            SELECT Status__c, Name, LastStatusChangeDate__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals('In Progress', updated.Status__c, 'Status should be updated');
        System.assertEquals('Updated Name', updated.Name, 'Name should be updated');
        System.assertEquals(Date.today(), updated.LastStatusChangeDate__c, 'Change date should be set');
    }
}
*/
