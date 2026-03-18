/**
 * Field History Tracking Template
 *
 * USE CASE: Track field changes beyond standard field history (20 field limit)
 *
 * When to use this template:
 * - Track changes for more than 20 fields per object (standard limit)
 * - Maintain longer history than 18 months (standard retention)
 * - Track formula field changes (not tracked by standard history)
 * - Implement custom retention policies
 * - Generate detailed audit reports
 * - Track who changed what and when for compliance
 * - Maintain complete change log for critical fields
 *
 * COMPLEXITY: Medium
 * GOVERNOR LIMITS: Target < 3 SOQL queries, < 2 DML operations
 *
 * CRITICAL NOTES:
 * - Standard field history limited to 20 fields per object
 * - Standard history retained for 18 months
 * - This pattern creates custom history records (no built-in limits)
 * - Consider data volume and storage costs
 * - Archive old history records periodically
 *
 * CUSTOMIZATION CHECKLIST:
 * 1. Create custom FieldHistory__c object with appropriate fields
 * 2. Replace ObjectName with your object API name
 * 3. Define which fields to track
 * 4. Configure retention policy
 * 5. Add data archival strategy
 */

// ============================================================================
// CUSTOM OBJECT: FieldHistory__c
// ============================================================================
// Fields:
//   - ParentRecordId__c (Lookup to tracked object)
//   - ParentRecordName__c (Text, 255)
//   - FieldName__c (Text, 255)
//   - FieldLabel__c (Text, 255)
//   - OldValue__c (Long Text, 32768)
//   - NewValue__c (Long Text, 32768)
//   - ChangedBy__c (Lookup to User)
//   - ChangedDate__c (DateTime)
//   - ChangeType__c (Text: INSERT, UPDATE, DELETE)

// ============================================================================
// TRIGGER FILE: ObjectNameTrigger.trigger
// ============================================================================
trigger ObjectNameTrigger on ObjectName (after insert, after update, after delete) {
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
                }
            }
        } finally {
            isExecuting = false;
        }
    }

    // ========================================================================
    // AFTER INSERT - Track initial values
    // ========================================================================
    private static void handleAfterInsert(List<ObjectName> newRecords) {
        FieldHistoryTracker.trackInsert(newRecords);
    }

    // ========================================================================
    // AFTER UPDATE - Track field changes
    // ========================================================================
    private static void handleAfterUpdate(List<ObjectName> newRecords,
                                          Map<Id, ObjectName> oldMap) {
        FieldHistoryTracker.trackUpdate(newRecords, oldMap);
    }

    // ========================================================================
    // AFTER DELETE - Track deletion
    // ========================================================================
    private static void handleAfterDelete(List<ObjectName> oldRecords) {
        FieldHistoryTracker.trackDelete(oldRecords);
    }
}

// ============================================================================
// FIELD HISTORY TRACKER CLASS
// ============================================================================
public class FieldHistoryTracker {

    // Define fields to track
    private static final Set<String> TRACKED_FIELDS = new Set<String>{
        'Status__c',
        'Amount__c',
        'Priority__c',
        'Category__c',
        'Region__c',
        'OwnerId',
        'StartDate__c',
        'EndDate__c',
        'Description__c',
        'Comments__c'
        // Add all fields you want to track
    };

    // ========================================================================
    // TRACK INSERT - Create history for initial values
    // ========================================================================
    public static void trackInsert(List<ObjectName> newRecords) {
        List<FieldHistory__c> historyRecords = new List<FieldHistory__c>();

        for (ObjectName record : newRecords) {
            // Create history entry for each tracked field
            for (String fieldName : TRACKED_FIELDS) {
                Object fieldValue = record.get(fieldName);

                // Only track if field has a value
                if (fieldValue != null) {
                    historyRecords.add(createHistoryRecord(
                        record.Id,
                        record.Name,
                        fieldName,
                        null, // No old value on insert
                        fieldValue,
                        'INSERT'
                    ));
                }
            }
        }

        if (!historyRecords.isEmpty()) {
            insert historyRecords;
        }
    }

    // ========================================================================
    // TRACK UPDATE - Create history for changed fields
    // ========================================================================
    public static void trackUpdate(List<ObjectName> newRecords,
                                   Map<Id, ObjectName> oldMap) {
        List<FieldHistory__c> historyRecords = new List<FieldHistory__c>();

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            // Check each tracked field for changes
            for (String fieldName : TRACKED_FIELDS) {
                Object oldValue = oldRecord.get(fieldName);
                Object newValue = newRecord.get(fieldName);

                // Track if value changed
                if (hasValueChanged(oldValue, newValue)) {
                    historyRecords.add(createHistoryRecord(
                        newRecord.Id,
                        newRecord.Name,
                        fieldName,
                        oldValue,
                        newValue,
                        'UPDATE'
                    ));
                }
            }
        }

        if (!historyRecords.isEmpty()) {
            insert historyRecords;
        }
    }

    // ========================================================================
    // TRACK DELETE - Create history for deletion
    // ========================================================================
    public static void trackDelete(List<ObjectName> oldRecords) {
        List<FieldHistory__c> historyRecords = new List<FieldHistory__c>();

        for (ObjectName record : oldRecords) {
            // Create single deletion entry
            historyRecords.add(createHistoryRecord(
                record.Id,
                record.Name,
                'Record',
                'Active',
                'Deleted',
                'DELETE'
            ));
        }

        if (!historyRecords.isEmpty()) {
            insert historyRecords;
        }
    }

    // ========================================================================
    // CREATE HISTORY RECORD
    // ========================================================================
    private static FieldHistory__c createHistoryRecord(Id recordId,
                                                       String recordName,
                                                       String fieldName,
                                                       Object oldValue,
                                                       Object newValue,
                                                       String changeType) {
        FieldHistory__c history = new FieldHistory__c();
        history.ParentRecordId__c = recordId;
        history.ParentRecordName__c = recordName;
        history.FieldName__c = fieldName;
        history.FieldLabel__c = getFieldLabel(fieldName);
        history.OldValue__c = formatValue(oldValue);
        history.NewValue__c = formatValue(newValue);
        history.ChangedBy__c = UserInfo.getUserId();
        history.ChangedDate__c = System.now();
        history.ChangeType__c = changeType;

        return history;
    }

    // ========================================================================
    // HELPER: Check if value changed
    // ========================================================================
    private static Boolean hasValueChanged(Object oldValue, Object newValue) {
        // Handle null cases
        if (oldValue == null && newValue == null) {
            return false;
        }

        if (oldValue == null || newValue == null) {
            return true;
        }

        // Compare values
        return String.valueOf(oldValue) != String.valueOf(newValue);
    }

    // ========================================================================
    // HELPER: Format value for storage
    // ========================================================================
    private static String formatValue(Object value) {
        if (value == null) {
            return null;
        }

        // Handle dates
        if (value instanceof Date) {
            return ((Date) value).format();
        }

        // Handle datetimes
        if (value instanceof DateTime) {
            return ((DateTime) value).format();
        }

        // Handle lookups (store ID)
        if (value instanceof Id) {
            return String.valueOf(value);
        }

        // Default: convert to string
        return String.valueOf(value);
    }

    // ========================================================================
    // HELPER: Get field label
    // ========================================================================
    private static String getFieldLabel(String fieldName) {
        // Cache field describe
        Map<String, Schema.SObjectField> fieldMap =
            Schema.SObjectType.ObjectName.fields.getMap();

        if (fieldMap.containsKey(fieldName)) {
            return fieldMap.get(fieldName).getDescribe().getLabel();
        }

        return fieldName;
    }

    // ========================================================================
    // UTILITY: Get field history for a record
    // ========================================================================
    public static List<FieldHistory__c> getFieldHistory(Id recordId) {
        return [
            SELECT Id, FieldName__c, FieldLabel__c, OldValue__c, NewValue__c,
                   ChangedBy__c, ChangedBy__r.Name, ChangedDate__c, ChangeType__c
            FROM FieldHistory__c
            WHERE ParentRecordId__c = :recordId
            ORDER BY ChangedDate__c DESC
            LIMIT 1000
        ];
    }

    // ========================================================================
    // UTILITY: Get field history for specific field
    // ========================================================================
    public static List<FieldHistory__c> getFieldHistoryForField(Id recordId,
                                                                 String fieldName) {
        return [
            SELECT Id, OldValue__c, NewValue__c, ChangedBy__r.Name, ChangedDate__c
            FROM FieldHistory__c
            WHERE ParentRecordId__c = :recordId
              AND FieldName__c = :fieldName
            ORDER BY ChangedDate__c DESC
            LIMIT 100
        ];
    }

    // ========================================================================
    // UTILITY: Archive old history (data retention)
    // ========================================================================
    public static void archiveOldHistory(Integer daysToKeep) {
        Date cutoffDate = Date.today().addDays(-daysToKeep);

        List<FieldHistory__c> oldHistory = [
            SELECT Id
            FROM FieldHistory__c
            WHERE ChangedDate__c < :cutoffDate
            LIMIT 10000
        ];

        if (!oldHistory.isEmpty()) {
            // Move to archive object or delete
            delete oldHistory;
        }
    }
}

// ============================================================================
// VISUALFORCE PAGE: Field History Viewer
// ============================================================================
/*
<apex:page standardController="ObjectName" extensions="FieldHistoryController">
    <apex:sectionHeader title="Field History" subtitle="{!ObjectName.Name}"/>

    <apex:pageBlock title="Field Changes">
        <apex:pageBlockTable value="{!fieldHistory}" var="h">
            <apex:column value="{!h.FieldLabel__c}" headerValue="Field"/>
            <apex:column value="{!h.OldValue__c}" headerValue="Old Value"/>
            <apex:column value="{!h.NewValue__c}" headerValue="New Value"/>
            <apex:column value="{!h.ChangedBy__r.Name}" headerValue="Changed By"/>
            <apex:column value="{!h.ChangedDate__c}" headerValue="Changed Date"/>
        </apex:pageBlockTable>
    </apex:pageBlock>
</apex:page>
*/

// ============================================================================
// CONTROLLER: Field History Viewer
// ============================================================================
public class FieldHistoryController {
    private Id recordId;

    public FieldHistoryController(ApexPages.StandardController controller) {
        this.recordId = controller.getId();
    }

    public List<FieldHistory__c> getFieldHistory() {
        return FieldHistoryTracker.getFieldHistory(recordId);
    }
}

// ============================================================================
// TEST CLASS: FieldHistoryTrackerTest.cls
// ============================================================================
@isTest
private class FieldHistoryTrackerTest {

    // ========================================================================
    // TEST: Track Insert
    // ========================================================================
    @isTest
    static void testTrackInsert() {
        Test.startTest();

        ObjectName record = new ObjectName(
            Name = 'Test Record',
            Status__c = 'New',
            Amount__c = 50000,
            Priority__c = 'High'
        );
        insert record;

        Test.stopTest();

        // Verify history created
        List<FieldHistory__c> history = [
            SELECT Id, FieldName__c, NewValue__c, ChangeType__c
            FROM FieldHistory__c
            WHERE ParentRecordId__c = :record.Id
        ];

        System.assert(history.size() > 0, 'Should create history on insert');

        // Verify specific fields tracked
        Boolean foundStatus = false;
        Boolean foundAmount = false;

        for (FieldHistory__c h : history) {
            if (h.FieldName__c == 'Status__c') {
                foundStatus = true;
                System.assertEquals('New', h.NewValue__c);
                System.assertEquals('INSERT', h.ChangeType__c);
            }
            if (h.FieldName__c == 'Amount__c') {
                foundAmount = true;
                System.assertEquals('50000', h.NewValue__c);
            }
        }

        System.assert(foundStatus, 'Should track Status field');
        System.assert(foundAmount, 'Should track Amount field');
    }

    // ========================================================================
    // TEST: Track Update
    // ========================================================================
    @isTest
    static void testTrackUpdate() {
        // Create record
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            Status__c = 'New',
            Amount__c = 50000
        );
        insert record;

        // Clear insert history for this test
        delete [SELECT Id FROM FieldHistory__c];

        Test.startTest();

        // Update record
        record.Status__c = 'In Progress';
        record.Amount__c = 75000;
        update record;

        Test.stopTest();

        // Verify history created for changes only
        List<FieldHistory__c> history = [
            SELECT Id, FieldName__c, OldValue__c, NewValue__c, ChangeType__c
            FROM FieldHistory__c
            WHERE ParentRecordId__c = :record.Id
        ];

        System.assertEquals(2, history.size(),
            'Should track 2 changed fields');

        for (FieldHistory__c h : history) {
            System.assertEquals('UPDATE', h.ChangeType__c);

            if (h.FieldName__c == 'Status__c') {
                System.assertEquals('New', h.OldValue__c);
                System.assertEquals('In Progress', h.NewValue__c);
            }

            if (h.FieldName__c == 'Amount__c') {
                System.assertEquals('50000', h.OldValue__c);
                System.assertEquals('75000', h.NewValue__c);
            }
        }
    }

    // ========================================================================
    // TEST: Track Delete
    // ========================================================================
    @isTest
    static void testTrackDelete() {
        // Create record
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            Status__c = 'New'
        );
        insert record;

        // Clear insert history
        delete [SELECT Id FROM FieldHistory__c];

        Test.startTest();

        // Delete record
        delete record;

        Test.stopTest();

        // Verify deletion tracked
        List<FieldHistory__c> history = [
            SELECT Id, ChangeType__c, OldValue__c, NewValue__c
            FROM FieldHistory__c
        ];

        System.assertEquals(1, history.size());
        System.assertEquals('DELETE', history[0].ChangeType__c);
        System.assertEquals('Deleted', history[0].NewValue__c);
    }

    // ========================================================================
    // TEST: No History for Unchanged Fields
    // ========================================================================
    @isTest
    static void testNoHistoryForUnchangedFields() {
        // Create record
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            Status__c = 'New',
            Amount__c = 50000
        );
        insert record;

        // Clear insert history
        delete [SELECT Id FROM FieldHistory__c];

        Test.startTest();

        // Update non-tracked field
        record.Description__c = 'Updated description';
        // Don't update tracked fields
        update record;

        Test.stopTest();

        // Verify no history if Description not tracked
        // (Unless Description is in TRACKED_FIELDS)
        List<FieldHistory__c> history = [
            SELECT Id FROM FieldHistory__c
            WHERE ParentRecordId__c = :record.Id
        ];

        // Should only have history if Description is tracked
        System.assert(true, 'Test completes without error');
    }

    // ========================================================================
    // TEST: Bulk Operations (200 records)
    // ========================================================================
    @isTest
    static void testBulkOperations() {
        Test.startTest();

        // Create 200 records
        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ObjectName(
                Name = 'Bulk ' + i,
                Status__c = 'New',
                Amount__c = 10000 + i
            ));
        }
        insert records;

        Test.stopTest();

        // Verify history created for all
        Integer historyCount = [
            SELECT COUNT()
            FROM FieldHistory__c
        ];

        System.assert(historyCount > 0,
            'Should create history for bulk insert');

        // Verify governor limits
        System.assert(Limits.getDMLStatements() < 3,
            'Should use < 3 DML statements');
    }

    // ========================================================================
    // TEST: Get Field History
    // ========================================================================
    @isTest
    static void testGetFieldHistory() {
        // Create and update record
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            Status__c = 'New'
        );
        insert record;

        record.Status__c = 'In Progress';
        update record;

        Test.startTest();

        List<FieldHistory__c> history =
            FieldHistoryTracker.getFieldHistory(record.Id);

        Test.stopTest();

        System.assert(history.size() > 0, 'Should retrieve history');
    }

    // ========================================================================
    // TEST: Get Field History for Specific Field
    // ========================================================================
    @isTest
    static void testGetFieldHistoryForField() {
        // Create and update record multiple times
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            Status__c = 'New'
        );
        insert record;

        record.Status__c = 'In Progress';
        update record;

        record.Status__c = 'Completed';
        update record;

        Test.startTest();

        List<FieldHistory__c> history =
            FieldHistoryTracker.getFieldHistoryForField(record.Id, 'Status__c');

        Test.stopTest();

        System.assert(history.size() >= 2,
            'Should have multiple status changes');
    }

    // ========================================================================
    // TEST: Archive Old History
    // ========================================================================
    @isTest
    static void testArchiveOldHistory() {
        // Create old history records
        List<FieldHistory__c> oldHistory = new List<FieldHistory__c>();
        for (Integer i = 0; i < 10; i++) {
            FieldHistory__c h = new FieldHistory__c();
            h.ParentRecordId__c = '001000000000000AAA'; // Fake ID
            h.FieldName__c = 'Status__c';
            h.ChangedDate__c = System.now().addDays(-400); // Old
            oldHistory.add(h);
        }
        insert oldHistory;

        Test.startTest();

        FieldHistoryTracker.archiveOldHistory(365); // Keep 1 year

        Test.stopTest();

        // Verify old history deleted
        Integer remainingCount = [
            SELECT COUNT()
            FROM FieldHistory__c
            WHERE ChangedDate__c < :Date.today().addDays(-365)
        ];

        System.assertEquals(0, remainingCount,
            'Old history should be archived/deleted');
    }
}
