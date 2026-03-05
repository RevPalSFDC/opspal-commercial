/**
 * @description Make HTTP callouts to external APIs with @future pattern
 * @usage Sync data to external systems asynchronously
 * @complexity Complex
 * @bestPractices @future(callout=true), error handling, retry logic, mock testing
 *
 * USE CASE EXAMPLES:
 * - Send new opportunity data to external CPQ system
 * - Notify external service when account is updated
 * - Push lead data to marketing automation platform
 * - Sync order data to ERP system
 *
 * IMPORTANT NOTES:
 * - HTTP callouts cannot be made directly in triggers
 * - Must use @future or Queueable to make callouts asynchronously
 * - Named Credential recommended for authentication
 * - Implement error handling and retry logic
 * - Create mock HTTP response for testing
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with your object (e.g., Opportunity)
 * [ ] Configure Named Credential for external system
 * [ ] Update endpoint URL
 * [ ] Modify payload structure for your API
 * [ ] Implement error handling strategy
 * [ ] Create mock HTTP response class for testing
 * [ ] Test with mock callouts
 */

trigger ObjectNameTrigger on ObjectName (after insert, after update) {
    ObjectNameTriggerHandler.handleAfter(Trigger.new, Trigger.oldMap);
}

public class ObjectNameTriggerHandler {

    // ========================================
    // RECURSION PREVENTION
    // ========================================
    private static Boolean isExecuting = false;

    // ========================================
    // CONFIGURATION
    // ========================================
    private static final String ENDPOINT_URL = 'callout:ExternalSystem/api/records';
    private static final Integer TIMEOUT_MS = 30000;  // 30 seconds

    // ========================================
    // MAIN HANDLER
    // ========================================
    public static void handleAfter(List<ObjectName> newRecords, Map<Id, ObjectName> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        Boolean isInsert = (oldMap == null);
        Boolean isUpdate = (oldMap != null);

        if (isInsert) {
            // Send new records to external system
            Set<Id> recordIds = new Set<Id>();
            for (ObjectName record : newRecords) {
                if (shouldSendToExternalSystem(record)) {
                    recordIds.add(record.Id);
                }
            }

            if (!recordIds.isEmpty()) {
                sendToExternalSystemAsync(recordIds);  // @future callout
            }
        }

        else if (isUpdate) {
            // Send updated records if specific fields changed
            Set<Id> recordIds = new Set<Id>();
            for (ObjectName record : newRecords) {
                ObjectName oldRecord = oldMap.get(record.Id);

                if (hasSignificantChange(record, oldRecord)) {
                    recordIds.add(record.Id);
                }
            }

            if (!recordIds.isEmpty()) {
                sendToExternalSystemAsync(recordIds);  // @future callout
            }
        }

        isExecuting = false;
    }

    // ========================================
    // @FUTURE METHOD FOR CALLOUT
    // ========================================
    /**
     * @description Send records to external system asynchronously
     * @param recordIds Set of record IDs to send
     *
     * IMPORTANT: @future methods have limitations:
     * - Cannot pass SObjects, only primitive types (Id, String, Integer, etc.)
     * - Runs in separate transaction with own governor limits
     * - Cannot guarantee execution order
     * - Has own 12-second CPU limit
     */
    @future(callout=true)
    public static void sendToExternalSystemAsync(Set<Id> recordIds) {
        // Step 1: Query full record data (can't pass SObjects to @future)
        List<ObjectName> records = [
            SELECT Id, Name, ImportantField__c, AnotherField__c
            FROM ObjectName
            WHERE Id IN :recordIds
        ];

        // Step 2: Send each record (or batch if API supports)
        List<ObjectName> recordsToUpdate = new List<ObjectName>();

        for (ObjectName record : records) {
            try {
                // Make HTTP callout
                HttpResponse response = makeHttpCallout(record);

                // Handle response
                if (response.getStatusCode() == 200 || response.getStatusCode() == 201) {
                    // Success
                    System.debug('Successfully sent record ' + record.Id + ' to external system');

                    // Update record with sync status
                    ObjectName recordUpdate = new ObjectName(
                        Id = record.Id,
                        SyncStatus__c = 'Synced',
                        LastSyncDate__c = System.now(),
                        ExternalSystemId__c = parseExternalId(response.getBody())
                    );
                    recordsToUpdate.add(recordUpdate);

                } else {
                    // Error
                    System.debug(LoggingLevel.ERROR,
                        'Failed to send record ' + record.Id +
                        '. Status: ' + response.getStatusCode() +
                        '. Body: ' + response.getBody());

                    // Update record with error status
                    ObjectName recordUpdate = new ObjectName(
                        Id = record.Id,
                        SyncStatus__c = 'Error',
                        SyncErrorMessage__c = 'HTTP ' + response.getStatusCode() + ': ' + response.getBody()
                    );
                    recordsToUpdate.add(recordUpdate);
                }

            } catch (Exception e) {
                // Callout failed
                System.debug(LoggingLevel.ERROR,
                    'Exception sending record ' + record.Id + ': ' + e.getMessage());

                ObjectName recordUpdate = new ObjectName(
                    Id = record.Id,
                    SyncStatus__c = 'Error',
                    SyncErrorMessage__c = e.getMessage()
                );
                recordsToUpdate.add(recordUpdate);
            }
        }

        // Step 3: Update records with sync status
        if (!recordsToUpdate.isEmpty()) {
            try {
                update recordsToUpdate;
            } catch (DmlException e) {
                System.debug(LoggingLevel.ERROR, 'Failed to update sync status: ' + e.getMessage());
            }
        }
    }

    // ========================================
    // HTTP CALLOUT LOGIC
    // ========================================
    private static HttpResponse makeHttpCallout(ObjectName record) {
        // Step 1: Build request
        HttpRequest req = new HttpRequest();
        req.setEndpoint(ENDPOINT_URL);
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setTimeout(TIMEOUT_MS);

        // Step 2: Build JSON payload
        String jsonBody = buildJsonPayload(record);
        req.setBody(jsonBody);

        // Step 3: Send request
        Http http = new Http();
        HttpResponse res = http.send(req);

        System.debug('Request: ' + jsonBody);
        System.debug('Response Status: ' + res.getStatusCode());
        System.debug('Response Body: ' + res.getBody());

        return res;
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    private static Boolean shouldSendToExternalSystem(ObjectName record) {
        // Define criteria for sending to external system
        return record.SendToExternalSystem__c == true && record.ImportantField__c != null;
    }

    private static Boolean hasSignificantChange(ObjectName newRecord, ObjectName oldRecord) {
        // Define which field changes trigger sync
        return newRecord.ImportantField__c != oldRecord.ImportantField__c ||
               newRecord.AnotherField__c != oldRecord.AnotherField__c;
    }

    private static String buildJsonPayload(ObjectName record) {
        // Build JSON payload for external API
        Map<String, Object> payload = new Map<String, Object>{
            'id' => record.Id,
            'name' => record.Name,
            'importantField' => record.ImportantField__c,
            'anotherField' => record.AnotherField__c,
            'timestamp' => System.now().format('yyyy-MM-dd\'T\'HH:mm:ss\'Z\'')
        };

        return JSON.serialize(payload);
    }

    private static String parseExternalId(String responseBody) {
        try {
            Map<String, Object> responseMap = (Map<String, Object>) JSON.deserializeUntyped(responseBody);
            return (String) responseMap.get('id');
        } catch (Exception e) {
            System.debug('Failed to parse external ID from response: ' + e.getMessage());
            return null;
        }
    }
}

/**
 * MOCK HTTP RESPONSE FOR TESTING
 *
 * CRITICAL: Salesforce requires mock HTTP responses for testing callouts
 * Implement HttpCalloutMock interface to simulate external API
 */
@isTest
global class MockHttpResponseSuccess implements HttpCalloutMock {
    global HTTPResponse respond(HTTPRequest req) {
        // Verify request
        System.assertEquals('POST', req.getMethod());
        System.assertEquals(ENDPOINT_URL, req.getEndpoint());

        // Create mock response
        HttpResponse res = new HttpResponse();
        res.setHeader('Content-Type', 'application/json');
        res.setStatusCode(200);

        // Mock response body
        Map<String, Object> responseBody = new Map<String, Object>{
            'id' => 'EXT-12345',
            'status' => 'success',
            'message' => 'Record created successfully'
        };
        res.setBody(JSON.serialize(responseBody));

        return res;
    }
}

@isTest
global class MockHttpResponseError implements HttpCalloutMock {
    global HTTPResponse respond(HTTPRequest req) {
        HttpResponse res = new HttpResponse();
        res.setHeader('Content-Type', 'application/json');
        res.setStatusCode(500);
        res.setBody('{"error": "Internal server error"}');
        return res;
    }
}

/**
 * TEST CLASS
 *
 * TESTING STRATEGY:
 * 1. Set mock HTTP response with Test.setMock()
 * 2. Insert/update records
 * 3. Verify @future method executed (happens in Test.stopTest())
 * 4. Check sync status updated correctly
 * 5. Test both success and error scenarios
 */
@isTest
private class ObjectNameTriggerHandlerTest {

    @testSetup
    static void setupTestData() {
        // Create test records
        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 10; i++) {
            records.add(new ObjectName(
                Name = 'Test Record ' + i,
                ImportantField__c = 'Value ' + i,
                SendToExternalSystem__c = true
            ));
        }
        insert records;
    }

    @isTest
    static void testCallout_Success() {
        // Set mock HTTP response
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseSuccess());

        ObjectName record = [SELECT Id FROM ObjectName LIMIT 1];
        record.ImportantField__c = 'Updated Value';

        Test.startTest();
        update record;  // Triggers callout
        Test.stopTest();  // ← @future method executes here

        // Verify sync status updated
        ObjectName updated = [
            SELECT SyncStatus__c, LastSyncDate__c, ExternalSystemId__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals('Synced', updated.SyncStatus__c, 'Should be synced');
        System.assertNotEquals(null, updated.LastSyncDate__c, 'Should have sync date');
        System.assertEquals('EXT-12345', updated.ExternalSystemId__c, 'Should have external ID');
    }

    @isTest
    static void testCallout_Error() {
        // Set mock HTTP error response
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseError());

        ObjectName record = [SELECT Id FROM ObjectName LIMIT 1];
        record.ImportantField__c = 'Updated Value';

        Test.startTest();
        update record;
        Test.stopTest();

        // Verify error status updated
        ObjectName updated = [
            SELECT SyncStatus__c, SyncErrorMessage__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals('Error', updated.SyncStatus__c, 'Should have error status');
        System.assert(updated.SyncErrorMessage__c.contains('500'), 'Should contain error code');
    }

    @isTest
    static void testCallout_NoSyncNeeded() {
        ObjectName record = [SELECT Id FROM ObjectName LIMIT 1];
        record.SendToExternalSystem__c = false;  // Disable sync
        record.ImportantField__c = 'Updated Value';

        Test.startTest();
        Integer calloutsBefore = Limits.getCallouts();
        update record;
        Integer calloutsUsed = Limits.getCallouts() - calloutsBefore;
        Test.stopTest();

        System.assertEquals(0, calloutsUsed, 'Should not make callout when disabled');
    }

    @isTest
    static void testCallout_BulkRecords() {
        // Set mock HTTP response
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseSuccess());

        List<ObjectName> records = [SELECT Id FROM ObjectName];
        for (ObjectName record : records) {
            record.ImportantField__c = 'Bulk Update';
        }

        Test.startTest();
        update records;
        Test.stopTest();

        // Verify all records synced
        List<ObjectName> synced = [
            SELECT SyncStatus__c
            FROM ObjectName
            WHERE SyncStatus__c = 'Synced'
        ];

        System.assertEquals(10, synced.size(), 'All 10 records should be synced');
    }
}

/**
 * ALTERNATIVE: QUEUEABLE APEX FOR CALLOUTS
 *
 * Use Queueable instead of @future for more flexibility:
 * - Can chain jobs
 * - Better monitoring via Apex Jobs
 * - Can pass complex objects (not just primitives)
 */
/*
public class ExternalSystemCalloutQueueable implements Queueable, Database.AllowsCallouts {

    private List<Id> recordIds;

    public ExternalSystemCalloutQueueable(List<Id> recordIds) {
        this.recordIds = recordIds;
    }

    public void execute(QueueableContext context) {
        // Query records
        List<ObjectName> records = [
            SELECT Id, Name, ImportantField__c
            FROM ObjectName
            WHERE Id IN :recordIds
        ];

        // Make callouts
        for (ObjectName record : records) {
            makeHttpCallout(record);
        }

        // Can chain another job if needed
        if (needsFollowUp()) {
            System.enqueueJob(new FollowUpQueueable());
        }
    }

    private void makeHttpCallout(ObjectName record) {
        // Callout logic...
    }
}

// Usage in trigger handler
System.enqueueJob(new ExternalSystemCalloutQueueable(recordIds));
*/
