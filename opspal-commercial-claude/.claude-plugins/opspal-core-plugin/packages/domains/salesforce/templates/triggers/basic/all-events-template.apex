/**
 * @description Complete trigger template covering all 7 events with handler pattern
 * @usage Replace ObjectName with your object name, customize handler methods
 * @complexity Medium
 * @bestPractices Handler pattern, recursion prevention, bulkification
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with actual object name (e.g., Account, Opportunity)
 * [ ] Update handler class name (ObjectNameTriggerHandler)
 * [ ] Implement required handler methods in handler class
 * [ ] Add business logic in handler class, not in trigger
 * [ ] Create test class for handler
 * [ ] Deploy to sandbox and test before production
 */

trigger ObjectNameTrigger on ObjectName (before insert, before update, before delete,
                                          after insert, after update, after delete, after undelete) {

    // BEFORE TRIGGERS (can modify Trigger.new directly)
    if (Trigger.isBefore) {

        if (Trigger.isInsert) {
            // Before Insert: Data validation, enrichment, default values
            ObjectNameTriggerHandler.handleBeforeInsert(Trigger.new);
        }

        else if (Trigger.isUpdate) {
            // Before Update: Data validation, field updates, audit tracking
            ObjectNameTriggerHandler.handleBeforeUpdate(Trigger.new, Trigger.oldMap);
        }

        else if (Trigger.isDelete) {
            // Before Delete: Prevent deletion, check dependencies
            ObjectNameTriggerHandler.handleBeforeDelete(Trigger.old);
        }
    }

    // AFTER TRIGGERS (Trigger.new is read-only, can perform DML on other objects)
    else if (Trigger.isAfter) {

        if (Trigger.isInsert) {
            // After Insert: Create related records, send notifications
            ObjectNameTriggerHandler.handleAfterInsert(Trigger.new);
        }

        else if (Trigger.isUpdate) {
            // After Update: Update related records, cascade changes
            ObjectNameTriggerHandler.handleAfterUpdate(Trigger.new, Trigger.oldMap);
        }

        else if (Trigger.isDelete) {
            // After Delete: Clean up related records, archive data
            ObjectNameTriggerHandler.handleAfterDelete(Trigger.old);
        }

        else if (Trigger.isUndelete) {
            // After Undelete: Restore related data, reactivate processes
            ObjectNameTriggerHandler.handleAfterUndelete(Trigger.new);
        }
    }
}

/**
 * Handler Class Template
 *
 * IMPLEMENTATION NOTES:
 * - Keep trigger minimal (just routing logic)
 * - Put ALL business logic in handler class
 * - Implement recursion prevention with static boolean
 * - Organize methods by functionality (validation, enrichment, updates)
 * - Query outside loops, use Map for lookups
 * - Collect records for DML, perform single operation
 */
/*
public class ObjectNameTriggerHandler {

    // ========================================
    // RECURSION PREVENTION
    // ========================================
    private static Boolean isExecuting = false;

    // ========================================
    // BEFORE INSERT HANDLER
    // ========================================
    public static void handleBeforeInsert(List<ObjectName> newRecords) {
        if (isExecuting) return;
        isExecuting = true;

        // Call helper methods
        validateRequiredFields(newRecords);
        setDefaultValues(newRecords);
        enrichFromParent(newRecords);

        isExecuting = false;
    }

    // ========================================
    // BEFORE UPDATE HANDLER
    // ========================================
    public static void handleBeforeUpdate(List<ObjectName> newRecords, Map<Id, ObjectName> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        // Call helper methods
        validateFieldChanges(newRecords, oldMap);
        trackChanges(newRecords, oldMap);

        isExecuting = false;
    }

    // ========================================
    // BEFORE DELETE HANDLER
    // ========================================
    public static void handleBeforeDelete(List<ObjectName> oldRecords) {
        if (isExecuting) return;
        isExecuting = true;

        // Call helper methods
        preventDeletionIfHasChildren(oldRecords);

        isExecuting = false;
    }

    // ========================================
    // AFTER INSERT HANDLER
    // ========================================
    public static void handleAfterInsert(List<ObjectName> newRecords) {
        if (isExecuting) return;
        isExecuting = true;

        // Call helper methods
        createDefaultRelatedRecords(newRecords);
        sendNotifications(newRecords);

        isExecuting = false;
    }

    // ========================================
    // AFTER UPDATE HANDLER
    // ========================================
    public static void handleAfterUpdate(List<ObjectName> newRecords, Map<Id, ObjectName> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        // Call helper methods
        updateRelatedRecords(newRecords, oldMap);
        processStatusChanges(newRecords, oldMap);

        isExecuting = false;
    }

    // ========================================
    // AFTER DELETE HANDLER
    // ========================================
    public static void handleAfterDelete(List<ObjectName> oldRecords) {
        if (isExecuting) return;
        isExecuting = true;

        // Call helper methods
        archiveRelatedData(oldRecords);

        isExecuting = false;
    }

    // ========================================
    // AFTER UNDELETE HANDLER
    // ========================================
    public static void handleAfterUndelete(List<ObjectName> newRecords) {
        if (isExecuting) return;
        isExecuting = true;

        // Call helper methods
        restoreRelatedData(newRecords);

        isExecuting = false;
    }

    // ========================================
    // HELPER METHODS - VALIDATION
    // ========================================

    private static void validateRequiredFields(List<ObjectName> records) {
        for (ObjectName record : records) {
            // Add validation logic
            if (record.ImportantField__c == null) {
                record.addError('ImportantField__c is required');
            }
        }
    }

    private static void validateFieldChanges(List<ObjectName> records, Map<Id, ObjectName> oldMap) {
        for (ObjectName record : records) {
            ObjectName oldRecord = oldMap.get(record.Id);

            // Prevent changing specific fields
            if (record.LockedField__c != oldRecord.LockedField__c) {
                record.addError('LockedField__c cannot be changed');
            }
        }
    }

    private static void preventDeletionIfHasChildren(List<ObjectName> records) {
        Set<Id> recordIds = new Set<Id>();
        for (ObjectName record : records) {
            recordIds.add(record.Id);
        }

        // Query child records
        List<ChildObject__c> children = [
            SELECT ParentId__c
            FROM ChildObject__c
            WHERE ParentId__c IN :recordIds
            LIMIT 1
        ];

        if (!children.isEmpty()) {
            for (ObjectName record : records) {
                record.addError('Cannot delete record with related children');
            }
        }
    }

    // ========================================
    // HELPER METHODS - ENRICHMENT
    // ========================================

    private static void setDefaultValues(List<ObjectName> records) {
        for (ObjectName record : records) {
            if (record.Status__c == null) {
                record.Status__c = 'New';
            }
            if (record.Priority__c == null) {
                record.Priority__c = 'Medium';
            }
        }
    }

    private static void enrichFromParent(List<ObjectName> records) {
        // Collect parent IDs
        Set<Id> parentIds = new Set<Id>();
        for (ObjectName record : records) {
            if (record.ParentId__c != null) {
                parentIds.add(record.ParentId__c);
            }
        }

        if (parentIds.isEmpty()) return;

        // Query parents (single query for all)
        Map<Id, ParentObject__c> parentMap = new Map<Id, ParentObject__c>([
            SELECT Id, ImportantField__c
            FROM ParentObject__c
            WHERE Id IN :parentIds
        ]);

        // Enrich records
        for (ObjectName record : records) {
            if (record.ParentId__c != null) {
                ParentObject__c parent = parentMap.get(record.ParentId__c);
                if (parent != null) {
                    record.CopiedField__c = parent.ImportantField__c;
                }
            }
        }
    }

    private static void trackChanges(List<ObjectName> records, Map<Id, ObjectName> oldMap) {
        for (ObjectName record : records) {
            ObjectName oldRecord = oldMap.get(record.Id);

            if (record.Status__c != oldRecord.Status__c) {
                record.LastStatusChangeDate__c = System.today();
            }
        }
    }

    // ========================================
    // HELPER METHODS - RELATED RECORDS
    // ========================================

    private static void createDefaultRelatedRecords(List<ObjectName> records) {
        List<ChildObject__c> childrenToInsert = new List<ChildObject__c>();

        for (ObjectName record : records) {
            childrenToInsert.add(new ChildObject__c(
                ParentId__c = record.Id,
                Name = 'Default Child'
            ));
        }

        if (!childrenToInsert.isEmpty()) {
            insert childrenToInsert;
        }
    }

    private static void updateRelatedRecords(List<ObjectName> records, Map<Id, ObjectName> oldMap) {
        Set<Id> recordIdsToUpdate = new Set<Id>();

        // Identify records that need updates
        for (ObjectName record : records) {
            ObjectName oldRecord = oldMap.get(record.Id);

            if (record.ImportantField__c != oldRecord.ImportantField__c) {
                recordIdsToUpdate.add(record.Id);
            }
        }

        if (recordIdsToUpdate.isEmpty()) return;

        // Query and update related records
        List<ChildObject__c> childrenToUpdate = [
            SELECT Id, ParentId__c
            FROM ChildObject__c
            WHERE ParentId__c IN :recordIdsToUpdate
        ];

        for (ChildObject__c child : childrenToUpdate) {
            // Update logic
            child.UpdatedByTrigger__c = true;
        }

        if (!childrenToUpdate.isEmpty()) {
            update childrenToUpdate;
        }
    }

    private static void archiveRelatedData(List<ObjectName> records) {
        Set<Id> recordIds = new Set<Id>();
        for (ObjectName record : records) {
            recordIds.add(record.Id);
        }

        // Archive logic (e.g., update status on related records)
        List<ChildObject__c> childrenToArchive = [
            SELECT Id
            FROM ChildObject__c
            WHERE ParentId__c IN :recordIds
        ];

        for (ChildObject__c child : childrenToArchive) {
            child.Archived__c = true;
        }

        if (!childrenToArchive.isEmpty()) {
            update childrenToArchive;
        }
    }

    private static void restoreRelatedData(List<ObjectName> records) {
        Set<Id> recordIds = new Set<Id>();
        for (ObjectName record : records) {
            recordIds.add(record.Id);
        }

        // Restore logic
        List<ChildObject__c> childrenToRestore = [
            SELECT Id
            FROM ChildObject__c
            WHERE ParentId__c IN :recordIds
            AND Archived__c = true
        ];

        for (ChildObject__c child : childrenToRestore) {
            child.Archived__c = false;
        }

        if (!childrenToRestore.isEmpty()) {
            update childrenToRestore;
        }
    }

    // ========================================
    // HELPER METHODS - NOTIFICATIONS
    // ========================================

    private static void sendNotifications(List<ObjectName> records) {
        List<Messaging.SingleEmailMessage> emails = new List<Messaging.SingleEmailMessage>();

        for (ObjectName record : records) {
            if (record.SendNotification__c) {
                Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
                email.setToAddresses(new List<String>{record.Email__c});
                email.setSubject('Record Created: ' + record.Name);
                email.setPlainTextBody('A new record has been created.');
                emails.add(email);
            }
        }

        if (!emails.isEmpty()) {
            Messaging.sendEmail(emails);
        }
    }

    private static void processStatusChanges(List<ObjectName> records, Map<Id, ObjectName> oldMap) {
        for (ObjectName record : records) {
            ObjectName oldRecord = oldMap.get(record.Id);

            if (record.Status__c == 'Completed' && oldRecord.Status__c != 'Completed') {
                // Status changed to Completed
                // Trigger specific actions (e.g., send notification, create task)
                System.debug('Record completed: ' + record.Name);
            }
        }
    }
}
*/

/**
 * TEST CLASS TEMPLATE
 *
 * TESTING CHECKLIST:
 * [ ] Test single record operations
 * [ ] Test bulk operations (200 records)
 * [ ] Test recursion prevention
 * [ ] Test error conditions
 * [ ] Verify governor limits
 * [ ] Achieve 75%+ code coverage
 */
/*
@isTest
private class ObjectNameTriggerHandlerTest {

    // ========================================
    // TEST DATA SETUP
    // ========================================

    @testSetup
    static void setupTestData() {
        // Create test data shared across test methods
        List<ParentObject__c> parents = new List<ParentObject__c>();
        for (Integer i = 0; i < 10; i++) {
            parents.add(new ParentObject__c(
                Name = 'Test Parent ' + i,
                ImportantField__c = 'Value ' + i
            ));
        }
        insert parents;
    }

    // ========================================
    // BEFORE INSERT TESTS
    // ========================================

    @isTest
    static void testBeforeInsert_SingleRecord() {
        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        ObjectName record = new ObjectName(
            Name = 'Test Record',
            ParentId__c = parent.Id
        );

        Test.startTest();
        insert record;
        Test.stopTest();

        ObjectName inserted = [
            SELECT Status__c, Priority__c, CopiedField__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals('New', inserted.Status__c, 'Default status should be set');
        System.assertEquals('Medium', inserted.Priority__c, 'Default priority should be set');
        System.assertNotEquals(null, inserted.CopiedField__c, 'Parent field should be copied');
    }

    @isTest
    static void testBeforeInsert_BulkRecords() {
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

        List<ObjectName> inserted = [SELECT Id FROM ObjectName];
        System.assertEquals(200, inserted.size(), 'All 200 records should be inserted');
    }

    @isTest
    static void testBeforeInsert_Validation() {
        ObjectName record = new ObjectName(
            Name = 'Test Record'
            // Missing ImportantField__c (required)
        );

        Test.startTest();
        try {
            insert record;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('required'), 'Should contain validation message');
        }
        Test.stopTest();
    }

    // ========================================
    // AFTER INSERT TESTS
    // ========================================

    @isTest
    static void testAfterInsert_CreatesChildRecords() {
        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        ObjectName record = new ObjectName(
            Name = 'Test Record',
            ParentId__c = parent.Id
        );

        Test.startTest();
        insert record;
        Test.stopTest();

        List<ChildObject__c> children = [
            SELECT Id
            FROM ChildObject__c
            WHERE ParentId__c = :record.Id
        ];

        System.assertEquals(1, children.size(), 'Should create one child record');
    }

    // ========================================
    // GOVERNOR LIMIT TESTS
    // ========================================

    @isTest
    static void testGovernorLimits_Bulk() {
        List<ParentObject__c> parents = [SELECT Id FROM ParentObject__c];

        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ObjectName(
                Name = 'Test Record ' + i,
                ParentId__c = parents[Math.mod(i, parents.size())].Id
            ));
        }

        Test.startTest();
        Integer queriesBefore = Limits.getQueries();
        Integer dmlBefore = Limits.getDmlStatements();

        insert records;

        Integer queriesUsed = Limits.getQueries() - queriesBefore;
        Integer dmlUsed = Limits.getDmlStatements() - dmlBefore;
        Test.stopTest();

        System.assert(queriesUsed < 10, 'Should use <10 queries. Used: ' + queriesUsed);
        System.assert(dmlUsed < 5, 'Should use <5 DML. Used: ' + dmlUsed);
    }
}
*/
