/**
 * OWNER CASCADE TRIGGER TEMPLATE
 *
 * Purpose: Cascade owner changes to related records, tasks, and events
 * Use Case: Maintain data ownership consistency across related objects when:
 *   - Account owner changes → cascade to Opportunities, Cases, Contacts
 *   - Opportunity owner changes → cascade to Tasks, Events, Quotes
 *   - Case owner changes → cascade to related Tasks and Comments
 *   - Project owner changes → cascade to Milestones, Tasks, Documents
 *
 * Pattern: Propagate ownership changes throughout object hierarchy
 *
 * Business Benefits:
 *   - Ensures proper data visibility and access
 *   - Maintains reporting accuracy by owner
 *   - Simplifies data ownership management
 *   - Reduces manual reassignment effort
 *   - Supports org-wide sharing model
 *
 * Considerations:
 *   - Governor limits for queries and DML
 *   - Large data volumes (use @future or batch for >200 records)
 *   - Sharing rules and visibility implications
 *   - Triggers on child objects may fire
 *   - Consider owner assignment rules
 *
 * Options:
 *   - Cascade immediately (synchronous)
 *   - Cascade asynchronously (@future)
 *   - Conditional cascade based on flags
 *   - Selective cascade by record type
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with your actual object API name
 * [ ] Configure which child objects to cascade to
 * [ ] Set up selective cascade conditions
 * [ ] Decide synchronous vs asynchronous cascade
 * [ ] Configure owner assignment rules integration
 * [ ] Set up audit trail for ownership changes
 * [ ] Test with org-wide defaults and sharing rules
 */

// ============================================================================
// TRIGGER FILE
// ============================================================================
trigger ObjectNameOwnerCascadeTrigger on ObjectName (after update) {
    ObjectNameOwnerCascadeHandler.handleTrigger();
}

// ============================================================================
// HANDLER CLASS
// ============================================================================
public class ObjectNameOwnerCascadeHandler {

    // Recursion prevention
    private static Boolean isExecuting = false;

    // Track processed records to prevent infinite loops
    private static Set<Id> processedRecordIds = new Set<Id>();

    public static void handleTrigger() {
        // Prevent recursion
        if (isExecuting) {
            return;
        }

        try {
            isExecuting = true;

            if (Trigger.isAfter && Trigger.isUpdate) {
                cascadeOwnerChanges(Trigger.new, Trigger.oldMap);
            }

        } finally {
            isExecuting = false;
        }
    }

    // ========================================================================
    // CONFIGURATION
    // ========================================================================

    // Child objects to cascade ownership to
    private static final Map<String, String> CHILD_OBJECTS = new Map<String, String>{
        'ChildObject1__c' => 'ParentId__c',
        'ChildObject2__c' => 'ObjectNameId__c',
        'RelatedItem__c' => 'Parent__c'
    };

    // Whether to cascade to tasks and events
    private static final Boolean CASCADE_TO_ACTIVITIES = true;

    // Whether to cascade to chatter posts
    private static final Boolean CASCADE_TO_CHATTER = false;

    // Whether to cascade asynchronously for large volumes
    private static final Integer ASYNC_THRESHOLD = 200;

    // Record types that should NOT cascade
    private static final Set<String> EXCLUDED_RECORD_TYPES = new Set<String>{
        'TemporaryRecordType',
        'TestRecordType'
    };

    // ========================================================================
    // OWNER CASCADE METHODS
    // ========================================================================

    /**
     * Cascade owner changes to all related records
     */
    public static void cascadeOwnerChanges(List<ObjectName> newRecords,
                                           Map<Id, ObjectName> oldMap) {
        // Collect records where owner changed
        Map<Id, Id> parentToNewOwner = new Map<Id, Id>();
        List<Id> largeVolumeCascadeIds = new List<Id>();

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            // Check if owner changed
            if (newRecord.OwnerId != oldRecord.OwnerId) {

                // Skip if already processed
                if (processedRecordIds.contains(newRecord.Id)) {
                    continue;
                }

                // Skip excluded record types
                if (isExcludedRecordType(newRecord.RecordTypeId)) {
                    continue;
                }

                // Skip if cascade is disabled for this record
                if (newRecord.DisableOwnerCascade__c == true) {
                    continue;
                }

                // Check volume of related records
                Integer relatedCount = getRelatedRecordCount(newRecord.Id);

                if (relatedCount > ASYNC_THRESHOLD) {
                    // Large volume - cascade asynchronously
                    largeVolumeCascadeIds.add(newRecord.Id);
                } else {
                    // Small volume - cascade synchronously
                    parentToNewOwner.put(newRecord.Id, newRecord.OwnerId);
                }

                // Mark as processed
                processedRecordIds.add(newRecord.Id);
            }
        }

        // Synchronous cascade for small volumes
        if (!parentToNewOwner.isEmpty()) {
            cascadeToChildObjects(parentToNewOwner);

            if (CASCADE_TO_ACTIVITIES) {
                cascadeToActivities(parentToNewOwner);
            }

            if (CASCADE_TO_CHATTER) {
                cascadeToChatterPosts(parentToNewOwner);
            }
        }

        // Asynchronous cascade for large volumes
        if (!largeVolumeCascadeIds.isEmpty()) {
            cascadeOwnerChangesAsync(largeVolumeCascadeIds);
        }
    }

    /**
     * Cascade to child objects
     */
    private static void cascadeToChildObjects(Map<Id, Id> parentToNewOwner) {
        List<SObject> recordsToUpdate = new List<SObject>();

        // Process each child object type
        for (String objectName : CHILD_OBJECTS.keySet()) {
            String parentFieldName = CHILD_OBJECTS.get(objectName);

            // Build dynamic SOQL query
            String query = 'SELECT Id, OwnerId, ' + parentFieldName + ' ' +
                          'FROM ' + objectName + ' ' +
                          'WHERE ' + parentFieldName + ' IN :parentToNewOwner.keySet() ' +
                          'AND IsCascadeAllowed__c != false';

            // Query child records
            List<SObject> children = Database.query(query);

            // Update owner for each child
            for (SObject child : children) {
                Id parentId = (Id)child.get(parentFieldName);
                Id newOwnerId = parentToNewOwner.get(parentId);

                if (newOwnerId != null && child.get('OwnerId') != newOwnerId) {
                    child.put('OwnerId', newOwnerId);
                    child.put('OwnerChangedBy__c', 'OwnerCascade');
                    child.put('OwnerChangedDate__c', System.now());

                    recordsToUpdate.add(child);
                }
            }
        }

        // Update all child records (single DML)
        if (!recordsToUpdate.isEmpty()) {
            update recordsToUpdate;
        }
    }

    /**
     * Cascade to tasks and events
     */
    private static void cascadeToActivities(Map<Id, Id> parentToNewOwner) {
        List<SObject> activitiesToUpdate = new List<SObject>();

        // Query tasks
        List<Task> tasks = [
            SELECT Id, OwnerId, WhatId
            FROM Task
            WHERE WhatId IN :parentToNewOwner.keySet()
              AND IsClosed = false
              AND Status != 'Completed'
        ];

        for (Task task : tasks) {
            Id newOwnerId = parentToNewOwner.get(task.WhatId);
            if (newOwnerId != null && task.OwnerId != newOwnerId) {
                task.OwnerId = newOwnerId;
                activitiesToUpdate.add(task);
            }
        }

        // Query events
        List<Event> events = [
            SELECT Id, OwnerId, WhatId
            FROM Event
            WHERE WhatId IN :parentToNewOwner.keySet()
              AND EndDateTime > :System.now()
        ];

        for (Event event : events) {
            Id newOwnerId = parentToNewOwner.get(event.WhatId);
            if (newOwnerId != null && event.OwnerId != newOwnerId) {
                event.OwnerId = newOwnerId;
                activitiesToUpdate.add(event);
            }
        }

        // Update activities (single DML)
        if (!activitiesToUpdate.isEmpty()) {
            update activitiesToUpdate;
        }
    }

    /**
     * Cascade to Chatter posts (FeedItem)
     */
    private static void cascadeToChatterPosts(Map<Id, Id> parentToNewOwner) {
        // Note: FeedItem is read-only, cannot update owner
        // Consider creating new posts or using Chatter API

        // Alternative: Use Chatter API to transfer ownership
        // Requires custom REST callout
    }

    /**
     * Asynchronous cascade for large volumes
     */
    @future
    public static void cascadeOwnerChangesAsync(List<Id> parentIds) {
        // Query parent records to get new owners
        Map<Id, Id> parentToNewOwner = new Map<Id, Id>();

        List<ObjectName> parents = [
            SELECT Id, OwnerId
            FROM ObjectName
            WHERE Id IN :parentIds
        ];

        for (ObjectName parent : parents) {
            parentToNewOwner.put(parent.Id, parent.OwnerId);
        }

        // Cascade to children
        cascadeToChildObjects(parentToNewOwner);

        if (CASCADE_TO_ACTIVITIES) {
            cascadeToActivities(parentToNewOwner);
        }
    }

    // ========================================================================
    // SELECTIVE CASCADE
    // ========================================================================

    /**
     * Cascade owner change with selective child object filtering
     */
    public static void cascadeToSpecificChildren(Id parentId,
                                                 Id newOwnerId,
                                                 Set<String> objectTypes) {
        Map<Id, Id> parentToNewOwner = new Map<Id, Id>{
            parentId => newOwnerId
        };

        List<SObject> recordsToUpdate = new List<SObject>();

        // Only cascade to specified object types
        for (String objectName : objectTypes) {
            if (CHILD_OBJECTS.containsKey(objectName)) {
                String parentFieldName = CHILD_OBJECTS.get(objectName);

                String query = 'SELECT Id, OwnerId FROM ' + objectName +
                              ' WHERE ' + parentFieldName + ' = :parentId';

                List<SObject> children = Database.query(query);

                for (SObject child : children) {
                    if (child.get('OwnerId') != newOwnerId) {
                        child.put('OwnerId', newOwnerId);
                        recordsToUpdate.add(child);
                    }
                }
            }
        }

        if (!recordsToUpdate.isEmpty()) {
            update recordsToUpdate;
        }
    }

    /**
     * Conditional cascade based on field values
     */
    public static void conditionalCascade(Id parentId,
                                         Id newOwnerId,
                                         String conditionField,
                                         Set<String> conditionValues) {
        Map<Id, Id> parentToNewOwner = new Map<Id, Id>{
            parentId => newOwnerId
        };

        List<SObject> recordsToUpdate = new List<SObject>();

        for (String objectName : CHILD_OBJECTS.keySet()) {
            String parentFieldName = CHILD_OBJECTS.get(objectName);

            // Build query with condition
            String query = 'SELECT Id, OwnerId, ' + conditionField + ' ' +
                          'FROM ' + objectName + ' ' +
                          'WHERE ' + parentFieldName + ' = :parentId';

            List<SObject> children = Database.query(query);

            for (SObject child : children) {
                String fieldValue = String.valueOf(child.get(conditionField));

                // Only cascade if condition is met
                if (conditionValues.contains(fieldValue)) {
                    if (child.get('OwnerId') != newOwnerId) {
                        child.put('OwnerId', newOwnerId);
                        recordsToUpdate.add(child);
                    }
                }
            }
        }

        if (!recordsToUpdate.isEmpty()) {
            update recordsToUpdate;
        }
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Get count of related records for volume threshold
     */
    private static Integer getRelatedRecordCount(Id parentId) {
        Integer totalCount = 0;

        for (String objectName : CHILD_OBJECTS.keySet()) {
            String parentFieldName = CHILD_OBJECTS.get(objectName);

            String countQuery = 'SELECT COUNT() FROM ' + objectName +
                               ' WHERE ' + parentFieldName + ' = :parentId';

            totalCount += Database.countQuery(countQuery);
        }

        // Add activities count
        if (CASCADE_TO_ACTIVITIES) {
            totalCount += [SELECT COUNT() FROM Task WHERE WhatId = :parentId];
            totalCount += [SELECT COUNT() FROM Event WHERE WhatId = :parentId];
        }

        return totalCount;
    }

    /**
     * Check if record type is excluded from cascade
     */
    private static Boolean isExcludedRecordType(Id recordTypeId) {
        if (recordTypeId == null) return false;

        RecordType rt = [SELECT DeveloperName FROM RecordType WHERE Id = :recordTypeId];

        return EXCLUDED_RECORD_TYPES.contains(rt.DeveloperName);
    }

    /**
     * Audit owner change
     */
    public static void auditOwnerChange(Id recordId,
                                       Id oldOwnerId,
                                       Id newOwnerId,
                                       Integer cascadedCount) {
        OwnerChangeAudit__c audit = new OwnerChangeAudit__c();
        audit.RecordId__c = recordId;
        audit.OldOwnerId__c = oldOwnerId;
        audit.NewOwnerId__c = newOwnerId;
        audit.CascadedRecordCount__c = cascadedCount;
        audit.ChangedBy__c = UserInfo.getUserId();
        audit.ChangedDate__c = System.now();

        insert audit;
    }

    /**
     * Rollback owner changes
     */
    public static void rollbackOwnerChange(Id auditId) {
        OwnerChangeAudit__c audit = [
            SELECT Id, RecordId__c, OldOwnerId__c
            FROM OwnerChangeAudit__c
            WHERE Id = :auditId
        ];

        // Restore original owner
        ObjectName record = [SELECT Id FROM ObjectName WHERE Id = :audit.RecordId__c];
        record.OwnerId = audit.OldOwnerId__c;
        record.DisableOwnerCascade__c = true; // Prevent cascade on rollback

        update record;
    }
}

// ============================================================================
// TEST CLASS TEMPLATE
// ============================================================================
@isTest
private class ObjectNameOwnerCascadeHandlerTest {

    @testSetup
    static void setup() {
        // Create test users
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];

        User owner1 = new User(
            FirstName = 'Test',
            LastName = 'Owner1',
            Email = 'owner1@test.com',
            Username = 'owner1@test.com.cascade',
            Alias = 'owner1',
            ProfileId = p.Id,
            TimeZoneSidKey = 'America/Los_Angeles',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US'
        );
        insert owner1;

        User owner2 = new User(
            FirstName = 'Test',
            LastName = 'Owner2',
            Email = 'owner2@test.com',
            Username = 'owner2@test.com.cascade',
            Alias = 'owner2',
            ProfileId = p.Id,
            TimeZoneSidKey = 'America/Los_Angeles',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US'
        );
        insert owner2;

        // Create parent record
        System.runAs(owner1) {
            ObjectName parent = new ObjectName(
                Name = 'Test Parent',
                Status__c = 'Active',
                OwnerId = owner1.Id
            );
            insert parent;

            // Create child records
            List<ChildObject1__c> children = new List<ChildObject1__c>();
            for (Integer i = 0; i < 5; i++) {
                children.add(new ChildObject1__c(
                    Name = 'Child ' + i,
                    ParentId__c = parent.Id,
                    OwnerId = owner1.Id
                ));
            }
            insert children;

            // Create tasks
            List<Task> tasks = new List<Task>();
            for (Integer i = 0; i < 3; i++) {
                tasks.add(new Task(
                    Subject = 'Task ' + i,
                    WhatId = parent.Id,
                    OwnerId = owner1.Id,
                    Status = 'Not Started'
                ));
            }
            insert tasks;
        }
    }

    @isTest
    static void testOwnerCascadeToChildren() {
        // Get test users
        User owner1 = [SELECT Id FROM User WHERE Username = 'owner1@test.com.cascade'];
        User owner2 = [SELECT Id FROM User WHERE Username = 'owner2@test.com.cascade'];

        // Get parent record
        ObjectName parent = [SELECT Id, OwnerId FROM ObjectName LIMIT 1];
        System.assertEquals(owner1.Id, parent.OwnerId, 'Initial owner should be owner1');

        // Change owner
        Test.startTest();
        parent.OwnerId = owner2.Id;
        update parent;
        Test.stopTest();

        // Verify children updated
        List<ChildObject1__c> children = [
            SELECT Id, OwnerId
            FROM ChildObject1__c
            WHERE ParentId__c = :parent.Id
        ];

        System.assertEquals(5, children.size(), 'Should have 5 children');
        for (ChildObject1__c child : children) {
            System.assertEquals(owner2.Id, child.OwnerId,
                'Child owner should cascade to owner2');
        }
    }

    @isTest
    static void testOwnerCascadeToActivities() {
        // Get test users
        User owner1 = [SELECT Id FROM User WHERE Username = 'owner1@test.com.cascade'];
        User owner2 = [SELECT Id FROM User WHERE Username = 'owner2@test.com.cascade'];

        // Get parent record
        ObjectName parent = [SELECT Id, OwnerId FROM ObjectName LIMIT 1];

        // Change owner
        Test.startTest();
        parent.OwnerId = owner2.Id;
        update parent;
        Test.stopTest();

        // Verify tasks updated
        List<Task> tasks = [
            SELECT Id, OwnerId
            FROM Task
            WHERE WhatId = :parent.Id
        ];

        System.assertEquals(3, tasks.size(), 'Should have 3 tasks');
        for (Task task : tasks) {
            System.assertEquals(owner2.Id, task.OwnerId,
                'Task owner should cascade to owner2');
        }
    }

    @isTest
    static void testRecursionPrevention() {
        // Get test users
        User owner2 = [SELECT Id FROM User WHERE Username = 'owner2@test.com.cascade'];

        // Get parent record
        ObjectName parent = [SELECT Id, OwnerId FROM ObjectName LIMIT 1];

        // Change owner twice in same transaction
        Test.startTest();
        parent.OwnerId = owner2.Id;
        update parent;

        // Second update should not cause recursion
        parent.Status__c = 'Inactive';
        update parent;
        Test.stopTest();

        // Should complete without errors
        System.assert(true, 'Should prevent recursion');
    }

    @isTest
    static void testCascadeDisabled() {
        // Get test users
        User owner2 = [SELECT Id FROM User WHERE Username = 'owner2@test.com.cascade'];

        // Get parent record
        ObjectName parent = [SELECT Id, OwnerId FROM ObjectName LIMIT 1];

        // Disable cascade
        parent.DisableOwnerCascade__c = true;
        parent.OwnerId = owner2.Id;

        Test.startTest();
        update parent;
        Test.stopTest();

        // Verify children NOT updated
        List<ChildObject1__c> children = [
            SELECT Id, OwnerId
            FROM ChildObject1__c
            WHERE ParentId__c = :parent.Id
        ];

        User owner1 = [SELECT Id FROM User WHERE Username = 'owner1@test.com.cascade'];
        for (ChildObject1__c child : children) {
            System.assertEquals(owner1.Id, child.OwnerId,
                'Child owner should NOT cascade when disabled');
        }
    }

    @isTest
    static void testBulkOwnerCascade() {
        // Get test users
        User owner2 = [SELECT Id FROM User WHERE Username = 'owner2@test.com.cascade'];

        // Get all parent records
        List<ObjectName> parents = [SELECT Id, OwnerId FROM ObjectName];

        // Change owner for all parents
        Test.startTest();
        for (ObjectName parent : parents) {
            parent.OwnerId = owner2.Id;
        }
        update parents;
        Test.stopTest();

        // Verify all children updated
        List<ChildObject1__c> children = [
            SELECT Id, OwnerId
            FROM ChildObject1__c
        ];

        for (ChildObject1__c child : children) {
            System.assertEquals(owner2.Id, child.OwnerId,
                'All children should cascade to owner2');
        }
    }
}

/**
 * REQUIRED FIELDS:
 *   - ObjectName.DisableOwnerCascade__c (Checkbox) - Flag to disable cascade
 *   - ChildObject*.OwnerChangedBy__c (Text) - Track cascade source
 *   - ChildObject*.OwnerChangedDate__c (DateTime) - Track cascade timestamp
 *   - ChildObject*.IsCascadeAllowed__c (Checkbox) - Allow/prevent cascade per record
 *
 * OPTIONAL CUSTOM OBJECT: OwnerChangeAudit__c
 * Fields:
 *   - RecordId__c (Text, 18)
 *   - OldOwnerId__c (Lookup to User)
 *   - NewOwnerId__c (Lookup to User)
 *   - CascadedRecordCount__c (Number)
 *   - ChangedBy__c (Lookup to User)
 *   - ChangedDate__c (DateTime)
 */
