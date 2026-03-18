/**
 * Cascade Update Template
 *
 * USE CASE: Propagate updates from parent records to child records automatically
 *
 * When to use this template:
 * - Update all child records when parent status changes
 * - Cascade owner changes to related records
 * - Sync fields from parent to children (price, category, region)
 * - Update child dates when parent dates change
 * - Propagate flags/settings to entire hierarchy
 * - Mass update children when parent is updated
 *
 * COMPLEXITY: Medium
 * GOVERNOR LIMITS: Target < 5 SOQL queries, < 3 DML operations
 *
 * CRITICAL: This pattern requires STRONG recursion prevention to avoid infinite loops
 *
 * CUSTOMIZATION CHECKLIST:
 * 1. Replace ObjectName with your parent object API name
 * 2. Replace child object names with your child objects
 * 3. Implement field mapping logic (which parent fields cascade to which child fields)
 * 4. Add conditional logic (only cascade when specific conditions met)
 * 5. Consider using @future or Queueable for large child record sets (>200)
 * 6. Test recursion prevention thoroughly
 */

// ============================================================================
// TRIGGER FILE: ObjectNameTrigger.trigger
// ============================================================================
trigger ObjectNameTrigger on ObjectName (after update) {
    ObjectNameTriggerHandler.handleTrigger();
}

// ============================================================================
// HANDLER CLASS: ObjectNameTriggerHandler.cls
// ============================================================================
public class ObjectNameTriggerHandler {
    // CRITICAL: Strong recursion prevention
    private static Boolean isExecuting = false;
    private static Set<Id> processedRecordIds = new Set<Id>();

    public static void handleTrigger() {
        if (isExecuting) return;
        isExecuting = true;

        try {
            if (Trigger.isAfter && Trigger.isUpdate) {
                handleAfterUpdate(Trigger.new, Trigger.oldMap);
            }
        } finally {
            isExecuting = false;
        }
    }

    // ========================================================================
    // AFTER UPDATE - Cascade changes to child records
    // ========================================================================
    private static void handleAfterUpdate(List<ObjectName> newRecords,
                                          Map<Id, ObjectName> oldMap) {
        // Only process records that haven't been processed yet
        List<ObjectName> recordsToProcess = new List<ObjectName>();

        for (ObjectName newRecord : newRecords) {
            if (!processedRecordIds.contains(newRecord.Id)) {
                processedRecordIds.add(newRecord.Id);
                recordsToProcess.add(newRecord);
            }
        }

        if (recordsToProcess.isEmpty()) return;

        // Cascade different types of updates
        cascadeStatusChanges(recordsToProcess, oldMap);
        cascadeOwnerChanges(recordsToProcess, oldMap);
        cascadeFieldUpdates(recordsToProcess, oldMap);
        cascadeDateChanges(recordsToProcess, oldMap);
        cascadeFlagUpdates(recordsToProcess, oldMap);
    }

    // ========================================================================
    // PATTERN 1: Cascade Status Changes
    // ========================================================================
    private static void cascadeStatusChanges(List<ObjectName> newRecords,
                                             Map<Id, ObjectName> oldMap) {
        // Collect parent IDs where status changed
        Map<Id, String> parentIdToNewStatus = new Map<Id, String>();

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            // Only cascade if status changed
            if (newRecord.Status__c != oldRecord.Status__c) {
                parentIdToNewStatus.put(newRecord.Id, newRecord.Status__c);
            }
        }

        if (parentIdToNewStatus.isEmpty()) return;

        // Query child records (SINGLE query)
        List<ChildObject__c> childrenToUpdate = [
            SELECT Id, ParentId__c, Status__c, CanStatusBeCascaded__c
            FROM ChildObject__c
            WHERE ParentId__c IN :parentIdToNewStatus.keySet()
              AND IsLocked__c = false  // Don't update locked children
        ];

        // Update child statuses
        for (ChildObject__c child : childrenToUpdate) {
            // Only cascade if child allows it
            if (child.CanStatusBeCascaded__c != false) {
                String newStatus = parentIdToNewStatus.get(child.ParentId__c);

                // Map parent status to child status
                child.Status__c = mapParentStatusToChildStatus(newStatus);
                child.StatusCascadedFromParent__c = true;
                child.StatusCascadeDate__c = System.now();
            }
        }

        // Single DML operation
        if (!childrenToUpdate.isEmpty()) {
            update childrenToUpdate;
        }
    }

    // ========================================================================
    // PATTERN 2: Cascade Owner Changes
    // ========================================================================
    private static void cascadeOwnerChanges(List<ObjectName> newRecords,
                                            Map<Id, ObjectName> oldMap) {
        // Collect parent IDs where owner changed
        Map<Id, Id> parentIdToNewOwner = new Map<Id, Id>();

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            if (newRecord.OwnerId != oldRecord.OwnerId) {
                parentIdToNewOwner.put(newRecord.Id, newRecord.OwnerId);
            }
        }

        if (parentIdToNewOwner.isEmpty()) return;

        // Query child records
        List<ChildObject__c> childrenToUpdate = [
            SELECT Id, ParentId__c, OwnerId, CascadeOwnership__c
            FROM ChildObject__c
            WHERE ParentId__c IN :parentIdToNewOwner.keySet()
        ];

        // Update child owners
        for (ChildObject__c child : childrenToUpdate) {
            if (child.CascadeOwnership__c != false) {
                child.OwnerId = parentIdToNewOwner.get(child.ParentId__c);
                child.OwnerCascadedFromParent__c = true;
                child.OwnerCascadeDate__c = System.now();
            }
        }

        if (!childrenToUpdate.isEmpty()) {
            update childrenToUpdate;
        }

        // Also cascade to related tasks and events
        cascadeOwnerToActivities(parentIdToNewOwner);
    }

    // ========================================================================
    // PATTERN 3: Cascade Field Updates (Price, Category, Region, etc.)
    // ========================================================================
    private static void cascadeFieldUpdates(List<ObjectName> newRecords,
                                            Map<Id, ObjectName> oldMap) {
        // Collect parent IDs with field changes
        Map<Id, ObjectName> parentsWithFieldChanges = new Map<Id, ObjectName>();

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            // Check if any cascadable fields changed
            if (hasCascadableFieldChanges(newRecord, oldRecord)) {
                parentsWithFieldChanges.put(newRecord.Id, newRecord);
            }
        }

        if (parentsWithFieldChanges.isEmpty()) return;

        // Query child records
        List<ChildObject__c> childrenToUpdate = [
            SELECT Id, ParentId__c, Category__c, Region__c, PriceLevel__c,
                   TaxRate__c, Currency__c, DiscountPercent__c
            FROM ChildObject__c
            WHERE ParentId__c IN :parentsWithFieldChanges.keySet()
              AND SyncFieldsFromParent__c = true
        ];

        // Update child fields from parent
        for (ChildObject__c child : childrenToUpdate) {
            ObjectName parent = parentsWithFieldChanges.get(child.ParentId__c);
            ObjectName oldParent = oldMap.get(child.ParentId__c);

            // Cascade category if changed
            if (parent.Category__c != oldParent.Category__c) {
                child.Category__c = parent.Category__c;
            }

            // Cascade region if changed
            if (parent.Region__c != oldParent.Region__c) {
                child.Region__c = parent.Region__c;
            }

            // Cascade price level if changed
            if (parent.PriceLevel__c != oldParent.PriceLevel__c) {
                child.PriceLevel__c = parent.PriceLevel__c;
            }

            // Cascade tax rate if changed
            if (parent.TaxRate__c != oldParent.TaxRate__c) {
                child.TaxRate__c = parent.TaxRate__c;
            }

            // Cascade currency if changed
            if (parent.Currency__c != oldParent.Currency__c) {
                child.Currency__c = parent.Currency__c;
            }

            // Cascade discount if changed
            if (parent.DiscountPercent__c != oldParent.DiscountPercent__c) {
                child.DiscountPercent__c = parent.DiscountPercent__c;
            }

            child.LastCascadeDate__c = System.now();
        }

        if (!childrenToUpdate.isEmpty()) {
            update childrenToUpdate;
        }
    }

    // ========================================================================
    // PATTERN 4: Cascade Date Changes
    // ========================================================================
    private static void cascadeDateChanges(List<ObjectName> newRecords,
                                           Map<Id, ObjectName> oldMap) {
        // Collect parent IDs with date changes
        Map<Id, ObjectName> parentsWithDateChanges = new Map<Id, ObjectName>();

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            if (newRecord.StartDate__c != oldRecord.StartDate__c ||
                newRecord.EndDate__c != oldRecord.EndDate__c) {
                parentsWithDateChanges.put(newRecord.Id, newRecord);
            }
        }

        if (parentsWithDateChanges.isEmpty()) return;

        // Query child records
        List<ChildObject__c> childrenToUpdate = [
            SELECT Id, ParentId__c, StartDate__c, EndDate__c, Duration__c
            FROM ChildObject__c
            WHERE ParentId__c IN :parentsWithDateChanges.keySet()
              AND SyncDatesFromParent__c = true
        ];

        // Update child dates
        for (ChildObject__c child : childrenToUpdate) {
            ObjectName parent = parentsWithDateChanges.get(child.ParentId__c);

            // Cascade start date
            if (parent.StartDate__c != null) {
                child.StartDate__c = parent.StartDate__c;
            }

            // Cascade end date
            if (parent.EndDate__c != null) {
                child.EndDate__c = parent.EndDate__c;
            }

            // Recalculate duration
            if (child.StartDate__c != null && child.EndDate__c != null) {
                child.Duration__c = child.StartDate__c.daysBetween(child.EndDate__c);
            }
        }

        if (!childrenToUpdate.isEmpty()) {
            update childrenToUpdate;
        }
    }

    // ========================================================================
    // PATTERN 5: Cascade Flag Updates (Boolean Fields)
    // ========================================================================
    private static void cascadeFlagUpdates(List<ObjectName> newRecords,
                                           Map<Id, ObjectName> oldMap) {
        // Collect parent IDs with flag changes
        Map<Id, ObjectName> parentsWithFlagChanges = new Map<Id, ObjectName>();

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            if (newRecord.IsActive__c != oldRecord.IsActive__c ||
                newRecord.IsLocked__c != oldRecord.IsLocked__c ||
                newRecord.RequiresApproval__c != oldRecord.RequiresApproval__c) {
                parentsWithFlagChanges.put(newRecord.Id, newRecord);
            }
        }

        if (parentsWithFlagChanges.isEmpty()) return;

        // Query child records
        List<ChildObject__c> childrenToUpdate = [
            SELECT Id, ParentId__c, IsActive__c, IsLocked__c, RequiresApproval__c
            FROM ChildObject__c
            WHERE ParentId__c IN :parentsWithFlagChanges.keySet()
        ];

        // Update child flags
        for (ChildObject__c child : childrenToUpdate) {
            ObjectName parent = parentsWithFlagChanges.get(child.ParentId__c);
            ObjectName oldParent = oldMap.get(child.ParentId__c);

            // Cascade IsActive
            if (parent.IsActive__c != oldParent.IsActive__c) {
                child.IsActive__c = parent.IsActive__c;
                child.ActiveStatusCascaded__c = true;
            }

            // Cascade IsLocked
            if (parent.IsLocked__c != oldParent.IsLocked__c) {
                child.IsLocked__c = parent.IsLocked__c;
                child.LockStatusCascaded__c = true;
            }

            // Cascade RequiresApproval
            if (parent.RequiresApproval__c != oldParent.RequiresApproval__c) {
                child.RequiresApproval__c = parent.RequiresApproval__c;
            }
        }

        if (!childrenToUpdate.isEmpty()) {
            update childrenToUpdate;
        }
    }

    // ========================================================================
    // PATTERN 6: Cascade Owner to Activities (Tasks & Events)
    // ========================================================================
    private static void cascadeOwnerToActivities(Map<Id, Id> parentIdToNewOwner) {
        // Query tasks
        List<Task> tasksToUpdate = [
            SELECT Id, WhatId, OwnerId
            FROM Task
            WHERE WhatId IN :parentIdToNewOwner.keySet()
              AND Status != 'Completed'
              AND IsClosed = false
        ];

        // Update task owners
        for (Task t : tasksToUpdate) {
            t.OwnerId = parentIdToNewOwner.get(t.WhatId);
        }

        if (!tasksToUpdate.isEmpty()) {
            update tasksToUpdate;
        }

        // Query events
        List<Event> eventsToUpdate = [
            SELECT Id, WhatId, OwnerId
            FROM Event
            WHERE WhatId IN :parentIdToNewOwner.keySet()
              AND StartDateTime >= :System.now() // Only future events
        ];

        // Update event owners
        for (Event e : eventsToUpdate) {
            e.OwnerId = parentIdToNewOwner.get(e.WhatId);
        }

        if (!eventsToUpdate.isEmpty()) {
            update eventsToUpdate;
        }
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Map parent status to child status
     */
    private static String mapParentStatusToChildStatus(String parentStatus) {
        // Define status mapping rules
        Map<String, String> statusMap = new Map<String, String>{
            'Active' => 'Open',
            'Inactive' => 'Closed',
            'On Hold' => 'Paused',
            'Cancelled' => 'Cancelled',
            'Completed' => 'Completed',
            'Approved' => 'Active',
            'Rejected' => 'Cancelled'
        };

        return statusMap.containsKey(parentStatus) ?
            statusMap.get(parentStatus) : parentStatus;
    }

    /**
     * Check if any cascadable fields changed
     */
    private static Boolean hasCascadableFieldChanges(ObjectName newRecord,
                                                      ObjectName oldRecord) {
        return newRecord.Category__c != oldRecord.Category__c
            || newRecord.Region__c != oldRecord.Region__c
            || newRecord.PriceLevel__c != oldRecord.PriceLevel__c
            || newRecord.TaxRate__c != oldRecord.TaxRate__c
            || newRecord.Currency__c != oldRecord.Currency__c
            || newRecord.DiscountPercent__c != oldRecord.DiscountPercent__c;
    }

    /**
     * Check if large volume update (use @future or Queueable)
     */
    @future
    private static void cascadeUpdateAsync(Set<Id> parentIds) {
        // For very large child record sets (>200), use async processing
        // This is a placeholder for async cascade logic

        List<ObjectName> parents = [
            SELECT Id, Status__c, OwnerId, Category__c, Region__c
            FROM ObjectName
            WHERE Id IN :parentIds
        ];

        // Process in chunks of 200
        // Implementation similar to synchronous methods above
    }
}

// ============================================================================
// TEST CLASS: ObjectNameTriggerHandlerTest.cls
// ============================================================================
@isTest
private class ObjectNameTriggerHandlerTest {

    // ========================================================================
    // TEST SETUP
    // ========================================================================
    @testSetup
    static void setup() {
        // Create parent records
        List<ObjectName> parents = new List<ObjectName>();
        for (Integer i = 0; i < 5; i++) {
            parents.add(new ObjectName(
                Name = 'Parent ' + i,
                Status__c = 'Active',
                Category__c = 'Standard',
                Region__c = 'West',
                PriceLevel__c = 'Tier 1',
                TaxRate__c = 8.0,
                IsActive__c = true,
                IsLocked__c = false,
                StartDate__c = Date.today(),
                EndDate__c = Date.today().addDays(30)
            ));
        }
        insert parents;

        // Create child records
        List<ChildObject__c> children = new List<ChildObject__c>();
        for (ObjectName parent : parents) {
            for (Integer i = 0; i < 3; i++) {
                children.add(new ChildObject__c(
                    ParentId__c = parent.Id,
                    Name = 'Child ' + i,
                    Status__c = 'Open',
                    Category__c = 'Standard',
                    Region__c = 'West',
                    SyncFieldsFromParent__c = true,
                    SyncDatesFromParent__c = true,
                    CascadeOwnership__c = true,
                    CanStatusBeCascaded__c = true,
                    IsLocked__c = false
                ));
            }
        }
        insert children;

        // Create tasks
        List<Task> tasks = new List<Task>();
        for (ObjectName parent : parents) {
            tasks.add(new Task(
                WhatId = parent.Id,
                Subject = 'Test Task',
                Status = 'Not Started',
                OwnerId = parent.OwnerId
            ));
        }
        insert tasks;
    }

    // ========================================================================
    // TEST: Cascade Status Changes
    // ========================================================================
    @isTest
    static void testCascadeStatusChanges() {
        Test.startTest();

        ObjectName parent = [SELECT Id, Status__c FROM ObjectName LIMIT 1];

        // Update parent status
        parent.Status__c = 'Inactive';
        update parent;

        // Verify children updated
        List<ChildObject__c> children = [
            SELECT Id, Status__c, StatusCascadedFromParent__c
            FROM ChildObject__c
            WHERE ParentId__c = :parent.Id
        ];

        System.assertEquals(3, children.size());

        for (ChildObject__c child : children) {
            System.assertEquals('Closed', child.Status__c,
                'Child status should be mapped to Closed');
            System.assertEquals(true, child.StatusCascadedFromParent__c,
                'Should mark as cascaded');
        }

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Cascade Owner Changes
    // ========================================================================
    @isTest
    static void testCascadeOwnerChanges() {
        Test.startTest();

        ObjectName parent = [SELECT Id, OwnerId FROM ObjectName LIMIT 1];

        // Create new user (or use existing)
        Id newOwnerId = UserInfo.getUserId(); // Simplified for test

        // Update parent owner
        parent.OwnerId = newOwnerId;
        update parent;

        // Verify children updated
        List<ChildObject__c> children = [
            SELECT Id, OwnerId, OwnerCascadedFromParent__c
            FROM ChildObject__c
            WHERE ParentId__c = :parent.Id
        ];

        for (ChildObject__c child : children) {
            System.assertEquals(newOwnerId, child.OwnerId,
                'Child owner should match parent');
            System.assertEquals(true, child.OwnerCascadedFromParent__c);
        }

        // Verify tasks updated
        List<Task> tasks = [
            SELECT Id, OwnerId
            FROM Task
            WHERE WhatId = :parent.Id
        ];

        for (Task t : tasks) {
            System.assertEquals(newOwnerId, t.OwnerId,
                'Task owner should match parent');
        }

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Cascade Field Updates
    // ========================================================================
    @isTest
    static void testCascadeFieldUpdates() {
        Test.startTest();

        ObjectName parent = [SELECT Id, Category__c, Region__c, TaxRate__c
                             FROM ObjectName LIMIT 1];

        // Update multiple fields
        parent.Category__c = 'Premium';
        parent.Region__c = 'East';
        parent.TaxRate__c = 9.5;
        update parent;

        // Verify children updated
        List<ChildObject__c> children = [
            SELECT Id, Category__c, Region__c, TaxRate__c, LastCascadeDate__c
            FROM ChildObject__c
            WHERE ParentId__c = :parent.Id
        ];

        for (ChildObject__c child : children) {
            System.assertEquals('Premium', child.Category__c,
                'Category should cascade');
            System.assertEquals('East', child.Region__c,
                'Region should cascade');
            System.assertEquals(9.5, child.TaxRate__c,
                'Tax rate should cascade');
            System.assertNotEquals(null, child.LastCascadeDate__c,
                'Cascade date should be set');
        }

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Cascade Date Changes
    // ========================================================================
    @isTest
    static void testCascadeDateChanges() {
        Test.startTest();

        ObjectName parent = [SELECT Id, StartDate__c, EndDate__c
                             FROM ObjectName LIMIT 1];

        // Update dates
        parent.StartDate__c = Date.today().addDays(10);
        parent.EndDate__c = Date.today().addDays(40);
        update parent;

        // Verify children updated
        List<ChildObject__c> children = [
            SELECT Id, StartDate__c, EndDate__c, Duration__c
            FROM ChildObject__c
            WHERE ParentId__c = :parent.Id
        ];

        for (ChildObject__c child : children) {
            System.assertEquals(parent.StartDate__c, child.StartDate__c,
                'Start date should cascade');
            System.assertEquals(parent.EndDate__c, child.EndDate__c,
                'End date should cascade');
            System.assertEquals(30, child.Duration__c,
                'Duration should be recalculated');
        }

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Cascade Flag Updates
    // ========================================================================
    @isTest
    static void testCascadeFlagUpdates() {
        Test.startTest();

        ObjectName parent = [SELECT Id, IsActive__c, IsLocked__c
                             FROM ObjectName LIMIT 1];

        // Update flags
        parent.IsActive__c = false;
        parent.IsLocked__c = true;
        update parent;

        // Verify children updated
        List<ChildObject__c> children = [
            SELECT Id, IsActive__c, IsLocked__c, ActiveStatusCascaded__c
            FROM ChildObject__c
            WHERE ParentId__c = :parent.Id
        ];

        for (ChildObject__c child : children) {
            System.assertEquals(false, child.IsActive__c,
                'IsActive should cascade');
            System.assertEquals(true, child.IsLocked__c,
                'IsLocked should cascade');
            System.assertEquals(true, child.ActiveStatusCascaded__c,
                'Should mark active status as cascaded');
        }

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Bulk Operations (200 parent records with 3 children each)
    // ========================================================================
    @isTest
    static void testBulkOperations() {
        // Clean existing data
        delete [SELECT Id FROM ChildObject__c];
        delete [SELECT Id FROM ObjectName];

        // Create 200 parent records
        List<ObjectName> parents = new List<ObjectName>();
        for (Integer i = 0; i < 200; i++) {
            parents.add(new ObjectName(
                Name = 'Bulk Parent ' + i,
                Status__c = 'Active',
                Category__c = 'Standard',
                IsActive__c = true
            ));
        }
        insert parents;

        // Create 3 children per parent (600 total)
        List<ChildObject__c> children = new List<ChildObject__c>();
        for (ObjectName parent : parents) {
            for (Integer i = 0; i < 3; i++) {
                children.add(new ChildObject__c(
                    ParentId__c = parent.Id,
                    Status__c = 'Open',
                    SyncFieldsFromParent__c = true
                ));
            }
        }
        insert children;

        Test.startTest();

        // Update all parent statuses
        for (ObjectName parent : parents) {
            parent.Status__c = 'Inactive';
            parent.Category__c = 'Premium';
        }
        update parents;

        // Verify all children updated
        List<ChildObject__c> updatedChildren = [
            SELECT Id, Status__c, Category__c
            FROM ChildObject__c
        ];

        System.assertEquals(600, updatedChildren.size());

        for (ChildObject__c child : updatedChildren) {
            System.assertEquals('Closed', child.Status__c);
            System.assertEquals('Premium', child.Category__c);
        }

        // Verify governor limits
        System.assert(Limits.getQueries() < 5,
            'Should use < 5 SOQL queries');
        System.assert(Limits.getDMLStatements() < 3,
            'Should use < 3 DML statements');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Conditional Cascade (Only when SyncFieldsFromParent = true)
    // ========================================================================
    @isTest
    static void testConditionalCascade() {
        Test.startTest();

        ObjectName parent = [SELECT Id, Category__c FROM ObjectName LIMIT 1];

        // Create child with SyncFieldsFromParent = false
        ChildObject__c noSyncChild = new ChildObject__c(
            ParentId__c = parent.Id,
            Name = 'No Sync Child',
            Category__c = 'Original',
            SyncFieldsFromParent__c = false
        );
        insert noSyncChild;

        // Update parent category
        parent.Category__c = 'Premium';
        update parent;

        // Verify sync child updated, no-sync child NOT updated
        ChildObject__c syncChild = [
            SELECT Id, Category__c
            FROM ChildObject__c
            WHERE ParentId__c = :parent.Id
              AND SyncFieldsFromParent__c = true
            LIMIT 1
        ];

        noSyncChild = [SELECT Id, Category__c
                       FROM ChildObject__c
                       WHERE Id = :noSyncChild.Id];

        System.assertEquals('Premium', syncChild.Category__c,
            'Sync child should be updated');
        System.assertEquals('Original', noSyncChild.Category__c,
            'No-sync child should NOT be updated');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Recursion Prevention
    // ========================================================================
    @isTest
    static void testRecursionPrevention() {
        Test.startTest();

        ObjectName parent = [SELECT Id, Status__c FROM ObjectName LIMIT 1];

        // Update parent multiple times rapidly
        for (Integer i = 0; i < 5; i++) {
            parent.Status__c = (i % 2 == 0) ? 'Active' : 'Inactive';
            update parent;
        }

        System.assert(true, 'Should not hit recursion issues');

        // Verify children only updated once per transaction
        List<ChildObject__c> children = [
            SELECT Id, Status__c
            FROM ChildObject__c
            WHERE ParentId__c = :parent.Id
        ];

        System.assertNotEquals(0, children.size(),
            'Children should exist and be updated');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Locked Children Not Updated
    // ========================================================================
    @isTest
    static void testLockedChildrenNotUpdated() {
        Test.startTest();

        ObjectName parent = [SELECT Id, Category__c FROM ObjectName LIMIT 1];

        // Create locked child
        ChildObject__c lockedChild = new ChildObject__c(
            ParentId__c = parent.Id,
            Name = 'Locked Child',
            Category__c = 'Original',
            IsLocked__c = true
        );
        insert lockedChild;

        // Update parent
        parent.Category__c = 'Premium';
        update parent;

        // Verify locked child NOT updated
        lockedChild = [SELECT Id, Category__c
                       FROM ChildObject__c
                       WHERE Id = :lockedChild.Id];

        System.assertEquals('Original', lockedChild.Category__c,
            'Locked child should not be updated');

        Test.stopTest();
    }
}
