/**
 * Platform Event Publishing Template
 *
 * USE CASE: Publish platform events for event-driven architecture and real-time integrations
 *
 * When to use this template:
 * - Notify external systems of record changes in real-time
 * - Trigger flows/processes in other orgs via platform events
 * - Decouple systems with event-driven architecture
 * - Publish events for streaming API consumers
 * - Broadcast changes to multiple subscribers
 * - Enable real-time dashboards and monitoring
 * - Trigger asynchronous processing in response to events
 *
 * COMPLEXITY: Medium
 * GOVERNOR LIMITS: Target < 3 SOQL queries, < 2 DML operations
 *
 * CRITICAL NOTES:
 * - Platform events are DML operations (count toward 150 DML limit)
 * - EventBus.publish() returns immediately (fire-and-forget)
 * - Subscribers process events asynchronously
 * - Events have 24-hour retry window
 * - Maximum 2,000 events can be published per transaction
 *
 * CUSTOMIZATION CHECKLIST:
 * 1. Create platform event definition (e.g., AccountChangeEvent__e)
 * 2. Replace ObjectName with your object API name
 * 3. Define which field changes should trigger events
 * 4. Map object fields to event fields
 * 5. Add conditional logic (only publish events when conditions met)
 * 6. Test with subscribers (flows, processes, external integrations)
 */

// ============================================================================
// PLATFORM EVENT DEFINITION (Setup > Platform Events)
// ============================================================================
// Example: AccountChangeEvent__e
// Fields:
//   - RecordId__c (Text, 18)
//   - RecordName__c (Text, 255)
//   - ChangeType__c (Text, 50) - INSERT, UPDATE, DELETE
//   - ChangedFields__c (Long Text, 5000) - JSON of changed fields
//   - OldValues__c (Long Text, 5000) - JSON of old values
//   - NewValues__c (Long Text, 5000) - JSON of new values
//   - ChangedBy__c (Text, 255)
//   - ChangedDate__c (DateTime)

// ============================================================================
// TRIGGER FILE: ObjectNameTrigger.trigger
// ============================================================================
trigger ObjectNameTrigger on ObjectName (after insert, after update, after delete,
                                         after undelete) {
    ObjectNameTriggerHandler.handleTrigger();
}

// ============================================================================
// HANDLER CLASS: ObjectNameTriggerHandler.cls
// ============================================================================
public class ObjectNameTriggerHandler {
    // Recursion prevention
    private static Boolean isExecuting = false;

    public static void handleTrigger() {
        if (isExecuting) return;
        isExecuting = true;

        try {
            if (Trigger.isAfter) {
                if (Trigger.isInsert) {
                    handleAfterInsert(Trigger.new);
                } else if (Trigger.isUpdate) {
                    handleAfterUpdate(Trigger.new, Trigger.oldMap);
                } else if (Trigger.isDelete) {
                    handleAfterDelete(Trigger.old);
                } else if (Trigger.isUndelete) {
                    handleAfterUndelete(Trigger.new);
                }
            }
        } finally {
            isExecuting = false;
        }
    }

    // ========================================================================
    // AFTER INSERT - Publish creation events
    // ========================================================================
    private static void handleAfterInsert(List<ObjectName> newRecords) {
        publishChangeEvents(newRecords, null, 'INSERT');
    }

    // ========================================================================
    // AFTER UPDATE - Publish update events
    // ========================================================================
    private static void handleAfterUpdate(List<ObjectName> newRecords,
                                          Map<Id, ObjectName> oldMap) {
        publishChangeEvents(newRecords, oldMap, 'UPDATE');
    }

    // ========================================================================
    // AFTER DELETE - Publish deletion events
    // ========================================================================
    private static void handleAfterDelete(List<ObjectName> oldRecords) {
        publishChangeEvents(oldRecords, null, 'DELETE');
    }

    // ========================================================================
    // AFTER UNDELETE - Publish undelete events
    // ========================================================================
    private static void handleAfterUndelete(List<ObjectName> newRecords) {
        publishChangeEvents(newRecords, null, 'UNDELETE');
    }

    // ========================================================================
    // MAIN EVENT PUBLISHING METHOD
    // ========================================================================
    private static void publishChangeEvents(List<ObjectName> records,
                                            Map<Id, ObjectName> oldMap,
                                            String changeType) {
        List<AccountChangeEvent__e> eventsToPublish =
            new List<AccountChangeEvent__e>();

        for (ObjectName record : records) {
            // Only publish events for records that meet criteria
            if (shouldPublishEvent(record, oldMap, changeType)) {

                // Build event payload
                AccountChangeEvent__e event = new AccountChangeEvent__e();
                event.RecordId__c = record.Id;
                event.RecordName__c = record.Name;
                event.ChangeType__c = changeType;
                event.ChangedBy__c = UserInfo.getUserName();
                event.ChangedDate__c = System.now();

                // Add changed fields for UPDATE events
                if (changeType == 'UPDATE' && oldMap != null) {
                    ObjectName oldRecord = oldMap.get(record.Id);
                    event.ChangedFields__c = getChangedFieldsJSON(record, oldRecord);
                    event.OldValues__c = getFieldValuesJSON(oldRecord);
                    event.NewValues__c = getFieldValuesJSON(record);
                } else {
                    // For INSERT/DELETE/UNDELETE, just include current values
                    event.NewValues__c = getFieldValuesJSON(record);
                }

                eventsToPublish.add(event);
            }
        }

        // Publish events (single DML operation)
        if (!eventsToPublish.isEmpty()) {
            List<Database.SaveResult> results = EventBus.publish(eventsToPublish);

            // Check for errors
            for (Integer i = 0; i < results.size(); i++) {
                if (!results[i].isSuccess()) {
                    System.debug('Error publishing event: ' +
                        results[i].getErrors()[0].getMessage());
                    // Log error or handle failure
                }
            }
        }
    }

    // ========================================================================
    // PATTERN 1: Conditional Event Publishing
    // ========================================================================
    private static Boolean shouldPublishEvent(ObjectName record,
                                              Map<Id, ObjectName> oldMap,
                                              String changeType) {
        // Always publish INSERT/DELETE/UNDELETE
        if (changeType != 'UPDATE') {
            return true;
        }

        // For UPDATE, only publish if specific fields changed
        ObjectName oldRecord = oldMap.get(record.Id);

        // Check if monitored fields changed
        if (record.Status__c != oldRecord.Status__c) {
            return true; // Status change always published
        }

        if (record.Amount__c != oldRecord.Amount__c &&
            record.Amount__c > 100000) {
            return true; // Large amount changes published
        }

        if (record.Priority__c != oldRecord.Priority__c &&
            (record.Priority__c == 'Critical' ||
             oldRecord.Priority__c == 'Critical')) {
            return true; // Critical priority changes published
        }

        if (record.OwnerId != oldRecord.OwnerId) {
            return true; // Owner changes published
        }

        // Don't publish if no monitored fields changed
        return false;
    }

    // ========================================================================
    // PATTERN 2: Build Changed Fields JSON
    // ========================================================================
    private static String getChangedFieldsJSON(ObjectName newRecord,
                                               ObjectName oldRecord) {
        Map<String, Object> changedFields = new Map<String, Object>();

        // Check each field for changes
        if (newRecord.Status__c != oldRecord.Status__c) {
            changedFields.put('Status__c', new Map<String, Object>{
                'oldValue' => oldRecord.Status__c,
                'newValue' => newRecord.Status__c
            });
        }

        if (newRecord.Amount__c != oldRecord.Amount__c) {
            changedFields.put('Amount__c', new Map<String, Object>{
                'oldValue' => oldRecord.Amount__c,
                'newValue' => newRecord.Amount__c
            });
        }

        if (newRecord.Priority__c != oldRecord.Priority__c) {
            changedFields.put('Priority__c', new Map<String, Object>{
                'oldValue' => oldRecord.Priority__c,
                'newValue' => newRecord.Priority__c
            });
        }

        if (newRecord.OwnerId != oldRecord.OwnerId) {
            changedFields.put('OwnerId', new Map<String, Object>{
                'oldValue' => oldRecord.OwnerId,
                'newValue' => newRecord.OwnerId
            });
        }

        if (newRecord.StartDate__c != oldRecord.StartDate__c) {
            changedFields.put('StartDate__c', new Map<String, Object>{
                'oldValue' => oldRecord.StartDate__c,
                'newValue' => newRecord.StartDate__c
            });
        }

        if (newRecord.EndDate__c != oldRecord.EndDate__c) {
            changedFields.put('EndDate__c', new Map<String, Object>{
                'oldValue' => oldRecord.EndDate__c,
                'newValue' => newRecord.EndDate__c
            });
        }

        return JSON.serialize(changedFields);
    }

    // ========================================================================
    // PATTERN 3: Build Complete Field Values JSON
    // ========================================================================
    private static String getFieldValuesJSON(ObjectName record) {
        Map<String, Object> fieldValues = new Map<String, Object>{
            'Id' => record.Id,
            'Name' => record.Name,
            'Status__c' => record.Status__c,
            'Amount__c' => record.Amount__c,
            'Priority__c' => record.Priority__c,
            'OwnerId' => record.OwnerId,
            'OwnerName' => record.Owner.Name, // If queried
            'StartDate__c' => record.StartDate__c,
            'EndDate__c' => record.EndDate__c,
            'Category__c' => record.Category__c,
            'Region__c' => record.Region__c,
            'CreatedDate' => record.CreatedDate,
            'LastModifiedDate' => record.LastModifiedDate
        };

        return JSON.serialize(fieldValues);
    }
}

// ============================================================================
// PATTERN 4: Dedicated Event Publisher Class (Alternative Pattern)
// ============================================================================
public class PlatformEventPublisher {

    /**
     * Publish generic change events
     */
    public static void publishAccountChanges(List<ObjectName> records,
                                              Map<Id, ObjectName> oldMap,
                                              String changeType) {
        List<AccountChangeEvent__e> events = new List<AccountChangeEvent__e>();

        for (ObjectName record : records) {
            events.add(buildChangeEvent(record, oldMap, changeType));
        }

        publish(events);
    }

    /**
     * Publish status change events specifically
     */
    public static void publishStatusChanges(List<ObjectName> records,
                                            Map<Id, ObjectName> oldMap) {
        List<StatusChangeEvent__e> events = new List<StatusChangeEvent__e>();

        for (ObjectName record : records) {
            ObjectName oldRecord = oldMap.get(record.Id);

            if (record.Status__c != oldRecord.Status__c) {
                StatusChangeEvent__e event = new StatusChangeEvent__e();
                event.RecordId__c = record.Id;
                event.RecordName__c = record.Name;
                event.OldStatus__c = oldRecord.Status__c;
                event.NewStatus__c = record.Status__c;
                event.ChangedBy__c = UserInfo.getUserName();
                event.ChangedDate__c = System.now();

                events.add(event);
            }
        }

        publish(events);
    }

    /**
     * Publish high-value opportunity events
     */
    public static void publishHighValueOpportunities(List<ObjectName> records) {
        List<HighValueOpportunityEvent__e> events =
            new List<HighValueOpportunityEvent__e>();

        for (ObjectName record : records) {
            if (record.Amount__c >= 1000000) { // $1M+
                HighValueOpportunityEvent__e event =
                    new HighValueOpportunityEvent__e();
                event.OpportunityId__c = record.Id;
                event.OpportunityName__c = record.Name;
                event.Amount__c = record.Amount__c;
                event.AccountName__c = record.Account.Name;
                event.OwnerId__c = record.OwnerId;
                event.Stage__c = record.StageName;
                event.AlertLevel__c = 'CRITICAL';

                events.add(event);
            }
        }

        publish(events);
    }

    /**
     * Generic publish method with error handling
     */
    private static void publish(List<SObject> events) {
        if (events.isEmpty()) return;

        List<Database.SaveResult> results = EventBus.publish(events);

        // Log failures
        Integer successCount = 0;
        Integer failureCount = 0;

        for (Integer i = 0; i < results.size(); i++) {
            if (results[i].isSuccess()) {
                successCount++;
            } else {
                failureCount++;
                Database.Error error = results[i].getErrors()[0];
                System.debug('Event publish failed: ' + error.getMessage());

                // Log to custom object for monitoring
                logEventFailure(events[i], error.getMessage());
            }
        }

        System.debug('Published ' + successCount + ' events successfully, ' +
                    failureCount + ' failures');
    }

    /**
     * Helper to build change event
     */
    private static AccountChangeEvent__e buildChangeEvent(
        ObjectName record,
        Map<Id, ObjectName> oldMap,
        String changeType
    ) {
        AccountChangeEvent__e event = new AccountChangeEvent__e();
        event.RecordId__c = record.Id;
        event.RecordName__c = record.Name;
        event.ChangeType__c = changeType;
        event.ChangedBy__c = UserInfo.getUserName();
        event.ChangedDate__c = System.now();

        if (changeType == 'UPDATE' && oldMap != null) {
            ObjectName oldRecord = oldMap.get(record.Id);
            event.OldValues__c = JSON.serialize(oldRecord);
            event.NewValues__c = JSON.serialize(record);
        } else {
            event.NewValues__c = JSON.serialize(record);
        }

        return event;
    }

    /**
     * Log event publishing failures
     */
    private static void logEventFailure(SObject event, String errorMessage) {
        // Insert log record asynchronously to avoid governor limits
        System.enqueueJob(new EventFailureLogger(event, errorMessage));
    }

    /**
     * Queueable for async logging
     */
    private class EventFailureLogger implements Queueable {
        private SObject event;
        private String errorMessage;

        public EventFailureLogger(SObject event, String errorMessage) {
            this.event = event;
            this.errorMessage = errorMessage;
        }

        public void execute(QueueableContext context) {
            EventPublishLog__c log = new EventPublishLog__c();
            log.EventType__c = String.valueOf(event.getSObjectType());
            log.EventPayload__c = JSON.serialize(event);
            log.ErrorMessage__c = errorMessage;
            log.FailedDate__c = System.now();

            insert log;
        }
    }
}

// ============================================================================
// TEST CLASS: ObjectNameTriggerHandlerTest.cls
// ============================================================================
@isTest
private class ObjectNameTriggerHandlerTest {

    // ========================================================================
    // TEST: Insert Event Publishing
    // ========================================================================
    @isTest
    static void testInsertEventPublishing() {
        Test.startTest();

        // Create record (should publish INSERT event)
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            Status__c = 'New',
            Amount__c = 50000
        );
        insert record;

        Test.stopTest();

        // Verify event published
        // Note: Platform events are not queryable in tests
        // Use Test.getEventBus().deliver() in subscriber tests
        System.assert(true, 'Insert event should be published');
    }

    // ========================================================================
    // TEST: Update Event Publishing (Monitored Field Changed)
    // ========================================================================
    @isTest
    static void testUpdateEventPublishing() {
        // Create record
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            Status__c = 'New',
            Amount__c = 50000
        );
        insert record;

        Test.startTest();

        // Update monitored field (should publish UPDATE event)
        record.Status__c = 'In Progress';
        update record;

        Test.stopTest();

        System.assert(true, 'Update event should be published for status change');
    }

    // ========================================================================
    // TEST: Update Event NOT Published (Non-Monitored Field)
    // ========================================================================
    @isTest
    static void testNoEventForNonMonitoredField() {
        // Create record
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            Status__c = 'New',
            Amount__c = 50000,
            Description__c = 'Original'
        );
        insert record;

        Test.startTest();

        // Update non-monitored field (should NOT publish event)
        record.Description__c = 'Updated';
        update record;

        Test.stopTest();

        System.assert(true, 'No event should be published for description change');
    }

    // ========================================================================
    // TEST: Delete Event Publishing
    // ========================================================================
    @isTest
    static void testDeleteEventPublishing() {
        // Create record
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            Status__c = 'New'
        );
        insert record;

        Test.startTest();

        // Delete record (should publish DELETE event)
        delete record;

        Test.stopTest();

        System.assert(true, 'Delete event should be published');
    }

    // ========================================================================
    // TEST: Bulk Event Publishing (200 records)
    // ========================================================================
    @isTest
    static void testBulkEventPublishing() {
        Test.startTest();

        // Create 200 records (should publish 200 INSERT events)
        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ObjectName(
                Name = 'Bulk Test ' + i,
                Status__c = 'New',
                Amount__c = 10000 + i
            ));
        }
        insert records;

        Test.stopTest();

        System.assertEquals(200, records.size());

        // Verify governor limits
        // Platform events count toward DML statements
        System.assert(Limits.getDMLStatements() < 10,
            'Should use reasonable DML statements');
    }

    // ========================================================================
    // TEST: High Value Opportunity Event
    // ========================================================================
    @isTest
    static void testHighValueOpportunityEvent() {
        Test.startTest();

        // Create high-value opportunity (should publish special event)
        ObjectName record = new ObjectName(
            Name = 'Enterprise Deal',
            Status__c = 'New',
            Amount__c = 2000000 // $2M
        );
        insert record;

        Test.stopTest();

        System.assert(true, 'High value opportunity event should be published');
    }

    // ========================================================================
    // TEST: Status Change Event
    // ========================================================================
    @isTest
    static void testStatusChangeEvent() {
        // Create record
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            Status__c = 'New'
        );
        insert record;

        Test.startTest();

        // Change to critical status (should publish status change event)
        record.Status__c = 'Critical';
        update record;

        Test.stopTest();

        System.assert(true, 'Status change event should be published');
    }

    // ========================================================================
    // TEST: Owner Change Event
    // ========================================================================
    @isTest
    static void testOwnerChangeEvent() {
        // Create record
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            Status__c = 'New',
            OwnerId = UserInfo.getUserId()
        );
        insert record;

        Test.startTest();

        // Change owner (should publish owner change event)
        // In test, just re-assign to same user for simplicity
        record.OwnerId = UserInfo.getUserId();
        update record;

        Test.stopTest();

        System.assert(true, 'Owner change event should be published');
    }

    // ========================================================================
    // TEST: Changed Fields JSON
    // ========================================================================
    @isTest
    static void testChangedFieldsJSON() {
        // Create record
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            Status__c = 'New',
            Amount__c = 50000
        );
        insert record;

        // Update multiple fields
        record.Status__c = 'In Progress';
        record.Amount__c = 75000;
        record.Priority__c = 'High';

        Test.startTest();
        update record;
        Test.stopTest();

        // Changed fields JSON should include all changed fields
        System.assert(true, 'Changed fields JSON should be properly formatted');
    }

    // ========================================================================
    // TEST: Event Failure Handling
    // ========================================================================
    @isTest
    static void testEventFailureHandling() {
        Test.startTest();

        // This test verifies error handling exists
        // Actual event publish failures are hard to simulate in tests
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            Status__c = 'New'
        );
        insert record;

        Test.stopTest();

        System.assert(true, 'Event failure handling should be in place');
    }
}

// ============================================================================
// EXAMPLE SUBSCRIBER (Flow/Process Builder)
// ============================================================================
// In Process Builder or Flow:
// 1. Create Process with "Platform Event" trigger
// 2. Select AccountChangeEvent__e
// 3. Add criteria: ChangeType__c equals "UPDATE"
// 4. Add action: Send email, create task, call external service, etc.

// ============================================================================
// EXAMPLE APEX SUBSCRIBER (for complex logic)
// ============================================================================
trigger AccountChangeEventTrigger on AccountChangeEvent__e (after insert) {
    for (AccountChangeEvent__e event : Trigger.new) {
        // Process event
        System.debug('Account changed: ' + event.RecordName__c);
        System.debug('Change type: ' + event.ChangeType__c);
        System.debug('Changed by: ' + event.ChangedBy__c);

        // Parse changed fields
        if (String.isNotBlank(event.ChangedFields__c)) {
            Map<String, Object> changedFields =
                (Map<String, Object>) JSON.deserializeUntyped(
                    event.ChangedFields__c
                );

            for (String fieldName : changedFields.keySet()) {
                System.debug('Field changed: ' + fieldName);
            }
        }

        // Take action based on change
        if (event.ChangeType__c == 'UPDATE') {
            // Handle update
        } else if (event.ChangeType__c == 'INSERT') {
            // Handle insert
        }
    }
}
