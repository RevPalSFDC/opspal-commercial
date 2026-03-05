/**
 * CHANGE LOG TRIGGER TEMPLATE
 *
 * Purpose: Track complete record snapshots for comprehensive audit trails
 * Use Case: Capture entire record state before and after changes for:
 *   - Compliance and regulatory requirements
 *   - Complete audit history with full record context
 *   - Rollback and recovery capabilities
 *   - Change comparison and diff visualization
 *   - Legal discovery and investigation support
 *
 * Pattern: Store JSON snapshots of entire records rather than individual fields
 *
 * Advantages Over Field History Tracking:
 *   - Captures complete record state at point in time
 *   - Includes related data and lookups
 *   - Enables complete record reconstruction
 *   - Supports complex change analysis
 *   - Better for compliance and legal requirements
 *
 * Considerations:
 *   - Higher storage requirements than field-level tracking
 *   - JSON serialization overhead
 *   - May need archiving strategy for large volumes
 *   - Consider data retention policies
 *
 * Governor Limits:
 *   - Heap size for JSON serialization (6MB limit)
 *   - DML operations for log records
 *   - SOQL queries for related data
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with your actual object API name
 * [ ] Update INCLUDED_FIELDS list with fields to track
 * [ ] Configure retention policy (days to keep logs)
 * [ ] Set up related data to include in snapshot
 * [ ] Implement archiving strategy if needed
 * [ ] Add custom metadata for snapshot configuration
 * [ ] Create scheduled job for log archiving
 * [ ] Build change log viewer component
 */

// ============================================================================
// TRIGGER FILE
// ============================================================================
trigger ObjectNameChangeLogTrigger on ObjectName (after insert, after update, after delete, after undelete) {
    ObjectNameChangeLogHandler.handleTrigger();
}

// ============================================================================
// HANDLER CLASS
// ============================================================================
public class ObjectNameChangeLogHandler {

    // Recursion prevention
    private static Boolean isExecuting = false;

    public static void handleTrigger() {
        // Prevent recursion
        if (isExecuting) {
            return;
        }

        try {
            isExecuting = true;

            if (Trigger.isAfter) {
                if (Trigger.isInsert) {
                    logInsert(Trigger.new);
                } else if (Trigger.isUpdate) {
                    logUpdate(Trigger.new, Trigger.oldMap);
                } else if (Trigger.isDelete) {
                    logDelete(Trigger.old);
                } else if (Trigger.isUndelete) {
                    logUndelete(Trigger.new);
                }
            }

        } finally {
            isExecuting = false;
        }
    }

    // ========================================================================
    // CONFIGURATION
    // ========================================================================

    // Fields to include in snapshot (null = all fields)
    private static final Set<String> INCLUDED_FIELDS = new Set<String>{
        'Name',
        'Status__c',
        'Amount__c',
        'Priority__c',
        'Category__c',
        'OwnerId',
        'Owner.Name',
        'CreatedDate',
        'CreatedById',
        'LastModifiedDate',
        'LastModifiedById'
    };

    // Related objects to include in snapshot
    private static final Map<String, String> RELATED_OBJECTS = new Map<String, String>{
        'ChildObjects__r' => 'ParentId__c',
        'RelatedItems__r' => 'ObjectNameId__c'
    };

    // Retention policy (days)
    private static final Integer RETENTION_DAYS = 365;

    // ========================================================================
    // CHANGE LOG METHODS
    // ========================================================================

    /**
     * Log record creation with initial snapshot
     */
    public static void logInsert(List<ObjectName> newRecords) {
        List<ChangeLog__c> logs = new List<ChangeLog__c>();

        // Query records with all needed fields and related data
        Map<Id, ObjectName> recordsWithData = queryRecordsWithRelated(
            new Map<Id, ObjectName>(newRecords).keySet()
        );

        for (ObjectName record : newRecords) {
            ObjectName recordWithData = recordsWithData.get(record.Id);

            ChangeLog__c log = new ChangeLog__c();
            log.ParentRecordId__c = record.Id;
            log.ParentRecordName__c = record.Name;
            log.ObjectType__c = 'ObjectName';
            log.ChangeType__c = 'INSERT';
            log.ChangedBy__c = UserInfo.getUserId();
            log.ChangedByName__c = UserInfo.getName();
            log.ChangedDate__c = System.now();

            // Store complete record snapshot
            log.AfterSnapshot__c = serializeRecord(recordWithData);
            log.SnapshotSize__c = log.AfterSnapshot__c.length();

            // Store basic info for quick queries
            log.Status__c = String.valueOf(record.get('Status__c'));
            log.Owner__c = String.valueOf(record.get('OwnerId'));

            logs.add(log);
        }

        if (!logs.isEmpty()) {
            insert logs;
        }
    }

    /**
     * Log record update with before and after snapshots
     */
    public static void logUpdate(List<ObjectName> newRecords,
                                  Map<Id, ObjectName> oldMap) {
        List<ChangeLog__c> logs = new List<ChangeLog__c>();

        // Query records with all needed fields and related data
        Map<Id, ObjectName> newRecordsWithData = queryRecordsWithRelated(
            new Map<Id, ObjectName>(newRecords).keySet()
        );

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);
            ObjectName newRecordWithData = newRecordsWithData.get(newRecord.Id);

            // Only log if something actually changed
            if (hasChanges(newRecord, oldRecord)) {
                ChangeLog__c log = new ChangeLog__c();
                log.ParentRecordId__c = newRecord.Id;
                log.ParentRecordName__c = newRecord.Name;
                log.ObjectType__c = 'ObjectName';
                log.ChangeType__c = 'UPDATE';
                log.ChangedBy__c = UserInfo.getUserId();
                log.ChangedByName__c = UserInfo.getName();
                log.ChangedDate__c = System.now();

                // Store before and after snapshots
                log.BeforeSnapshot__c = serializeRecord(oldRecord);
                log.AfterSnapshot__c = serializeRecord(newRecordWithData);
                log.SnapshotSize__c = log.BeforeSnapshot__c.length() +
                                      log.AfterSnapshot__c.length();

                // Calculate and store change summary
                log.ChangeSummary__c = getChangeSummary(newRecord, oldRecord);
                log.ChangedFieldsCount__c = getChangedFieldsCount(newRecord, oldRecord);

                // Store critical field values for quick queries
                log.Status__c = String.valueOf(newRecord.get('Status__c'));
                log.Owner__c = String.valueOf(newRecord.get('OwnerId'));

                logs.add(log);
            }
        }

        if (!logs.isEmpty()) {
            insert logs;
        }
    }

    /**
     * Log record deletion with final snapshot
     */
    public static void logDelete(List<ObjectName> oldRecords) {
        List<ChangeLog__c> logs = new List<ChangeLog__c>();

        for (ObjectName record : oldRecords) {
            ChangeLog__c log = new ChangeLog__c();
            log.ParentRecordId__c = record.Id;
            log.ParentRecordName__c = record.Name;
            log.ObjectType__c = 'ObjectName';
            log.ChangeType__c = 'DELETE';
            log.ChangedBy__c = UserInfo.getUserId();
            log.ChangedByName__c = UserInfo.getName();
            log.ChangedDate__c = System.now();

            // Store final snapshot before deletion
            log.BeforeSnapshot__c = serializeRecord(record);
            log.SnapshotSize__c = log.BeforeSnapshot__c.length();

            // Mark as deleted
            log.IsDeleted__c = true;

            logs.add(log);
        }

        if (!logs.isEmpty()) {
            insert logs;
        }
    }

    /**
     * Log record restoration
     */
    public static void logUndelete(List<ObjectName> newRecords) {
        List<ChangeLog__c> logs = new List<ChangeLog__c>();

        // Query records with all needed fields and related data
        Map<Id, ObjectName> recordsWithData = queryRecordsWithRelated(
            new Map<Id, ObjectName>(newRecords).keySet()
        );

        for (ObjectName record : newRecords) {
            ObjectName recordWithData = recordsWithData.get(record.Id);

            ChangeLog__c log = new ChangeLog__c();
            log.ParentRecordId__c = record.Id;
            log.ParentRecordName__c = record.Name;
            log.ObjectType__c = 'ObjectName';
            log.ChangeType__c = 'UNDELETE';
            log.ChangedBy__c = UserInfo.getUserId();
            log.ChangedByName__c = UserInfo.getName();
            log.ChangedDate__c = System.now();

            // Store restored record snapshot
            log.AfterSnapshot__c = serializeRecord(recordWithData);
            log.SnapshotSize__c = log.AfterSnapshot__c.length();

            logs.add(log);
        }

        if (!logs.isEmpty()) {
            insert logs;
        }
    }

    // ========================================================================
    // SNAPSHOT SERIALIZATION
    // ========================================================================

    /**
     * Serialize record to JSON with all tracked fields
     */
    private static String serializeRecord(ObjectName record) {
        if (record == null) return null;

        Map<String, Object> snapshot = new Map<String, Object>();

        // Add record ID and name
        snapshot.put('Id', record.Id);
        snapshot.put('Name', record.Name);

        // Add all tracked fields
        if (INCLUDED_FIELDS == null || INCLUDED_FIELDS.isEmpty()) {
            // Include all fields
            Map<String, Object> fields = record.getPopulatedFieldsAsMap();
            snapshot.putAll(fields);
        } else {
            // Include only specified fields
            for (String fieldName : INCLUDED_FIELDS) {
                if (fieldName.contains('.')) {
                    // Handle lookup fields (e.g., Owner.Name)
                    addLookupField(snapshot, record, fieldName);
                } else {
                    // Regular field
                    try {
                        snapshot.put(fieldName, record.get(fieldName));
                    } catch (Exception e) {
                        snapshot.put(fieldName, null);
                    }
                }
            }
        }

        // Add metadata
        snapshot.put('_metadata', new Map<String, Object>{
            'capturedAt' => System.now(),
            'capturedBy' => UserInfo.getUserId(),
            'capturedByName' => UserInfo.getName()
        });

        return JSON.serialize(snapshot);
    }

    /**
     * Add lookup field to snapshot
     */
    private static void addLookupField(Map<String, Object> snapshot,
                                       ObjectName record,
                                       String fieldPath) {
        List<String> parts = fieldPath.split('\\.');

        try {
            if (parts.size() == 2) {
                SObject relatedRecord = record.getSObject(parts[0]);
                if (relatedRecord != null) {
                    snapshot.put(fieldPath, relatedRecord.get(parts[1]));
                } else {
                    snapshot.put(fieldPath, null);
                }
            }
        } catch (Exception e) {
            snapshot.put(fieldPath, null);
        }
    }

    /**
     * Query records with all needed fields and related data
     */
    private static Map<Id, ObjectName> queryRecordsWithRelated(Set<Id> recordIds) {
        // Build dynamic SOQL query
        String query = 'SELECT Id, Name';

        // Add tracked fields
        if (INCLUDED_FIELDS != null && !INCLUDED_FIELDS.isEmpty()) {
            for (String field : INCLUDED_FIELDS) {
                if (!field.equals('Id') && !field.equals('Name')) {
                    query += ', ' + field;
                }
            }
        }

        // Add related objects
        if (RELATED_OBJECTS != null && !RELATED_OBJECTS.isEmpty()) {
            for (String relationship : RELATED_OBJECTS.keySet()) {
                query += ', (SELECT Id, Name FROM ' + relationship + ')';
            }
        }

        query += ' FROM ObjectName WHERE Id IN :recordIds';

        return new Map<Id, ObjectName>((List<ObjectName>)Database.query(query));
    }

    // ========================================================================
    // CHANGE ANALYSIS
    // ========================================================================

    /**
     * Check if record has any changes
     */
    private static Boolean hasChanges(ObjectName newRecord, ObjectName oldRecord) {
        if (INCLUDED_FIELDS == null || INCLUDED_FIELDS.isEmpty()) {
            // Check all fields
            Map<String, Object> newFields = newRecord.getPopulatedFieldsAsMap();
            Map<String, Object> oldFields = oldRecord.getPopulatedFieldsAsMap();

            for (String field : newFields.keySet()) {
                if (newFields.get(field) != oldFields.get(field)) {
                    return true;
                }
            }
        } else {
            // Check only tracked fields
            for (String field : INCLUDED_FIELDS) {
                if (!field.contains('.')) { // Skip lookup fields
                    try {
                        if (newRecord.get(field) != oldRecord.get(field)) {
                            return true;
                        }
                    } catch (Exception e) {
                        // Field doesn't exist
                    }
                }
            }
        }

        return false;
    }

    /**
     * Get count of changed fields
     */
    private static Integer getChangedFieldsCount(ObjectName newRecord,
                                                  ObjectName oldRecord) {
        Integer count = 0;

        if (INCLUDED_FIELDS == null || INCLUDED_FIELDS.isEmpty()) {
            // Count all changed fields
            Map<String, Object> newFields = newRecord.getPopulatedFieldsAsMap();
            Map<String, Object> oldFields = oldRecord.getPopulatedFieldsAsMap();

            for (String field : newFields.keySet()) {
                if (newFields.get(field) != oldFields.get(field)) {
                    count++;
                }
            }
        } else {
            // Count only tracked changed fields
            for (String field : INCLUDED_FIELDS) {
                if (!field.contains('.')) {
                    try {
                        if (newRecord.get(field) != oldRecord.get(field)) {
                            count++;
                        }
                    } catch (Exception e) {
                        // Field doesn't exist
                    }
                }
            }
        }

        return count;
    }

    /**
     * Generate human-readable change summary
     */
    private static String getChangeSummary(ObjectName newRecord,
                                           ObjectName oldRecord) {
        List<String> changes = new List<String>();

        Set<String> fieldsToCheck = INCLUDED_FIELDS != null &&
                                     !INCLUDED_FIELDS.isEmpty() ?
            INCLUDED_FIELDS : newRecord.getPopulatedFieldsAsMap().keySet();

        for (String field : fieldsToCheck) {
            if (!field.contains('.')) {
                try {
                    Object oldValue = oldRecord.get(field);
                    Object newValue = newRecord.get(field);

                    if (oldValue != newValue) {
                        changes.add(field + ': ' + formatValue(oldValue) +
                                  ' → ' + formatValue(newValue));
                    }
                } catch (Exception e) {
                    // Field doesn't exist
                }
            }
        }

        return String.join(changes, '\n');
    }

    /**
     * Format field value for display
     */
    private static String formatValue(Object value) {
        if (value == null) return 'null';
        if (value instanceof Date) {
            return ((Date)value).format();
        }
        if (value instanceof DateTime) {
            return ((DateTime)value).format();
        }
        if (value instanceof Decimal) {
            return ((Decimal)value).setScale(2).toPlainString();
        }
        return String.valueOf(value);
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Archive old change logs based on retention policy
     */
    public static void archiveOldLogs() {
        Date cutoffDate = Date.today().addDays(-RETENTION_DAYS);

        List<ChangeLog__c> oldLogs = [
            SELECT Id
            FROM ChangeLog__c
            WHERE ChangedDate__c < :cutoffDate
              AND IsArchived__c = false
            LIMIT 10000
        ];

        // Option 1: Move to external storage and delete
        // exportToExternalStorage(oldLogs);
        // delete oldLogs;

        // Option 2: Mark as archived
        for (ChangeLog__c log : oldLogs) {
            log.IsArchived__c = true;
            log.ArchivedDate__c = System.now();
        }

        if (!oldLogs.isEmpty()) {
            update oldLogs;
        }
    }

    /**
     * Get change history for a record
     */
    public static List<ChangeLog__c> getChangeHistory(Id recordId) {
        return [
            SELECT Id, ChangeType__c, ChangedBy__c, ChangedByName__c,
                   ChangedDate__c, BeforeSnapshot__c, AfterSnapshot__c,
                   ChangeSummary__c, ChangedFieldsCount__c
            FROM ChangeLog__c
            WHERE ParentRecordId__c = :recordId
            ORDER BY ChangedDate__c DESC
        ];
    }

    /**
     * Compare two snapshots and return differences
     */
    public static Map<String, Map<String, Object>> compareSnapshots(
        String beforeSnapshot,
        String afterSnapshot
    ) {
        Map<String, Object> before =
            (Map<String, Object>)JSON.deserializeUntyped(beforeSnapshot);
        Map<String, Object> after =
            (Map<String, Object>)JSON.deserializeUntyped(afterSnapshot);

        Map<String, Map<String, Object>> differences =
            new Map<String, Map<String, Object>>();

        for (String field : after.keySet()) {
            if (!field.startsWith('_')) { // Skip metadata fields
                Object beforeValue = before.get(field);
                Object afterValue = after.get(field);

                if (beforeValue != afterValue) {
                    differences.put(field, new Map<String, Object>{
                        'before' => beforeValue,
                        'after' => afterValue
                    });
                }
            }
        }

        return differences;
    }

    /**
     * Reconstruct record from snapshot
     */
    public static ObjectName reconstructRecord(String snapshot) {
        Map<String, Object> data =
            (Map<String, Object>)JSON.deserializeUntyped(snapshot);

        ObjectName record = new ObjectName();

        for (String field : data.keySet()) {
            if (!field.startsWith('_') && field != 'Id') {
                try {
                    record.put(field, data.get(field));
                } catch (Exception e) {
                    System.debug('Could not set field ' + field + ': ' +
                               e.getMessage());
                }
            }
        }

        return record;
    }
}

// ============================================================================
// TEST CLASS TEMPLATE
// ============================================================================
@isTest
private class ObjectNameChangeLogHandlerTest {

    @testSetup
    static void setup() {
        // Create test data
        List<ObjectName> testRecords = new List<ObjectName>();
        for (Integer i = 0; i < 10; i++) {
            testRecords.add(new ObjectName(
                Name = 'Test Record ' + i,
                Status__c = 'New',
                Amount__c = 1000 + (i * 100),
                Priority__c = 'Medium'
            ));
        }
        insert testRecords;
    }

    @isTest
    static void testLogInsert() {
        // Get test record
        ObjectName record = [SELECT Id, Name FROM ObjectName LIMIT 1];

        // Query change logs
        List<ChangeLog__c> logs = [
            SELECT Id, ChangeType__c, AfterSnapshot__c
            FROM ChangeLog__c
            WHERE ParentRecordId__c = :record.Id
              AND ChangeType__c = 'INSERT'
        ];

        // Verify log created
        System.assertEquals(1, logs.size(), 'Should create insert log');
        System.assertNotEquals(null, logs[0].AfterSnapshot__c,
            'Should have after snapshot');
    }

    @isTest
    static void testLogUpdate() {
        // Get test record
        ObjectName record = [SELECT Id, Name, Status__c FROM ObjectName LIMIT 1];

        // Update record
        Test.startTest();
        record.Status__c = 'In Progress';
        record.Amount__c = 5000;
        update record;
        Test.stopTest();

        // Query change logs
        List<ChangeLog__c> logs = [
            SELECT Id, ChangeType__c, BeforeSnapshot__c, AfterSnapshot__c,
                   ChangeSummary__c, ChangedFieldsCount__c
            FROM ChangeLog__c
            WHERE ParentRecordId__c = :record.Id
              AND ChangeType__c = 'UPDATE'
        ];

        // Verify log created
        System.assertEquals(1, logs.size(), 'Should create update log');
        System.assertNotEquals(null, logs[0].BeforeSnapshot__c,
            'Should have before snapshot');
        System.assertNotEquals(null, logs[0].AfterSnapshot__c,
            'Should have after snapshot');
        System.assert(logs[0].ChangedFieldsCount__c > 0,
            'Should track changed fields');
    }

    @isTest
    static void testLogDelete() {
        // Get test record
        ObjectName record = [SELECT Id, Name FROM ObjectName LIMIT 1];
        Id recordId = record.Id;

        // Delete record
        Test.startTest();
        delete record;
        Test.stopTest();

        // Query change logs
        List<ChangeLog__c> logs = [
            SELECT Id, ChangeType__c, BeforeSnapshot__c, IsDeleted__c
            FROM ChangeLog__c
            WHERE ParentRecordId__c = :recordId
              AND ChangeType__c = 'DELETE'
        ];

        // Verify log created
        System.assertEquals(1, logs.size(), 'Should create delete log');
        System.assertNotEquals(null, logs[0].BeforeSnapshot__c,
            'Should have before snapshot');
        System.assertEquals(true, logs[0].IsDeleted__c,
            'Should mark as deleted');
    }

    @isTest
    static void testLogUndelete() {
        // Get test record
        ObjectName record = [SELECT Id, Name FROM ObjectName LIMIT 1];
        Id recordId = record.Id;

        // Delete and undelete
        delete record;

        Test.startTest();
        undelete record;
        Test.stopTest();

        // Query change logs
        List<ChangeLog__c> logs = [
            SELECT Id, ChangeType__c, AfterSnapshot__c
            FROM ChangeLog__c
            WHERE ParentRecordId__c = :recordId
              AND ChangeType__c = 'UNDELETE'
        ];

        // Verify log created
        System.assertEquals(1, logs.size(), 'Should create undelete log');
        System.assertNotEquals(null, logs[0].AfterSnapshot__c,
            'Should have after snapshot');
    }

    @isTest
    static void testBulkOperations() {
        // Get test records
        List<ObjectName> records = [
            SELECT Id, Name, Status__c
            FROM ObjectName
        ];

        // Update all records
        Test.startTest();
        for (ObjectName record : records) {
            record.Status__c = 'Completed';
        }
        update records;
        Test.stopTest();

        // Query change logs
        List<ChangeLog__c> logs = [
            SELECT Id
            FROM ChangeLog__c
            WHERE ChangeType__c = 'UPDATE'
        ];

        // Verify logs created for all records
        System.assertEquals(records.size(), logs.size(),
            'Should create log for each record');
    }

    @isTest
    static void testGetChangeHistory() {
        // Get test record
        ObjectName record = [SELECT Id, Name, Status__c FROM ObjectName LIMIT 1];

        // Make multiple updates
        record.Status__c = 'In Progress';
        update record;

        record.Status__c = 'Completed';
        update record;

        // Get change history
        Test.startTest();
        List<ChangeLog__c> history =
            ObjectNameChangeLogHandler.getChangeHistory(record.Id);
        Test.stopTest();

        // Verify history (INSERT + 2 UPDATEs = 3 logs)
        System.assert(history.size() >= 3,
            'Should have multiple change log entries');
    }

    @isTest
    static void testCompareSnapshots() {
        // Create before and after snapshots
        String beforeSnapshot = '{"Name":"Test","Status__c":"New","Amount__c":1000}';
        String afterSnapshot = '{"Name":"Test","Status__c":"In Progress","Amount__c":2000}';

        // Compare snapshots
        Test.startTest();
        Map<String, Map<String, Object>> differences =
            ObjectNameChangeLogHandler.compareSnapshots(beforeSnapshot, afterSnapshot);
        Test.stopTest();

        // Verify differences detected
        System.assert(differences.containsKey('Status__c'),
            'Should detect status change');
        System.assert(differences.containsKey('Amount__c'),
            'Should detect amount change');
    }

    @isTest
    static void testReconstructRecord() {
        // Create snapshot
        String snapshot = '{"Name":"Test Record","Status__c":"New","Amount__c":1000}';

        // Reconstruct record
        Test.startTest();
        ObjectName reconstructed =
            ObjectNameChangeLogHandler.reconstructRecord(snapshot);
        Test.stopTest();

        // Verify reconstruction
        System.assertEquals('Test Record', reconstructed.Name,
            'Should reconstruct name');
        System.assertEquals('New', reconstructed.Status__c,
            'Should reconstruct status');
        System.assertEquals(1000, reconstructed.Amount__c,
            'Should reconstruct amount');
    }
}

/**
 * REQUIRED CUSTOM OBJECT: ChangeLog__c
 *
 * Fields:
 *   - ParentRecordId__c (Text, 18) - ID of the tracked record
 *   - ParentRecordName__c (Text, 255) - Name of tracked record
 *   - ObjectType__c (Text, 80) - API name of tracked object
 *   - ChangeType__c (Picklist) - INSERT, UPDATE, DELETE, UNDELETE
 *   - ChangedBy__c (Lookup to User) - User who made the change
 *   - ChangedByName__c (Text, 255) - Name of user who made change
 *   - ChangedDate__c (DateTime) - When change occurred
 *   - BeforeSnapshot__c (Long Text Area, 131072) - Before state JSON
 *   - AfterSnapshot__c (Long Text Area, 131072) - After state JSON
 *   - SnapshotSize__c (Number) - Total size of snapshots in bytes
 *   - ChangeSummary__c (Long Text Area, 32768) - Human-readable summary
 *   - ChangedFieldsCount__c (Number) - Count of changed fields
 *   - Status__c (Text, 255) - Record status at time of change
 *   - Owner__c (Text, 18) - Record owner at time of change
 *   - IsDeleted__c (Checkbox) - Whether this is a deletion log
 *   - IsArchived__c (Checkbox) - Whether log is archived
 *   - ArchivedDate__c (DateTime) - When log was archived
 *
 * Indexes:
 *   - ParentRecordId__c, ChangedDate__c DESC
 *   - ObjectType__c, ChangedDate__c DESC
 *   - ChangedBy__c, ChangedDate__c DESC
 */

/**
 * VISUALFORCE PAGE: Change Log Viewer
 *
 * <apex:page controller="ChangeLogViewerController" showHeader="true">
 *   <apex:form>
 *     <apex:pageBlock title="Change History for {!recordName}">
 *       <apex:pageBlockTable value="{!changeLogs}" var="log">
 *         <apex:column value="{!log.ChangedDate__c}"/>
 *         <apex:column value="{!log.ChangedByName__c}"/>
 *         <apex:column value="{!log.ChangeType__c}"/>
 *         <apex:column value="{!log.ChangedFieldsCount__c}"/>
 *         <apex:column headerValue="Details">
 *           <apex:commandLink value="View" action="{!viewDetails}"
 *                            reRender="detailPanel">
 *             <apex:param name="logId" value="{!log.Id}"/>
 *           </apex:commandLink>
 *         </apex:column>
 *       </apex:pageBlockTable>
 *     </apex:pageBlock>
 *
 *     <apex:outputPanel id="detailPanel">
 *       <apex:pageBlock title="Change Details" rendered="{!selectedLog != null}">
 *         <apex:pageBlockSection columns="1">
 *           <apex:outputField value="{!selectedLog.ChangeSummary__c}"/>
 *         </apex:pageBlockSection>
 *       </apex:pageBlock>
 *     </apex:outputPanel>
 *   </apex:form>
 * </apex:page>
 */
