/**
 * INTEGRATION TEST CLASS TEMPLATE
 *
 * Purpose: Test trigger integration with external systems and async operations
 * Use Case: Verify trigger integration with:
 *   - HTTP callouts to external APIs
 *   - @future method execution
 *   - Queueable job processing
 *   - Batch job scheduling
 *   - Platform event publishing
 *   - Email sending
 *   - Document generation
 *
 * Pattern: Mock external systems, test async operations with Test.startTest/stopTest
 *
 * Integration Patterns:
 *   - REST API callouts
 *   - SOAP web services
 *   - Platform events
 *   - Asynchronous processing
 *   - Email notifications
 *   - Document generation
 *   - Third-party integrations
 *
 * Testing Considerations:
 *   - Mock HTTP callouts (Test.setMock)
 *   - Test async operations (force synchronous with Test.startTest)
 *   - Verify platform events published
 *   - Check queueable/batch jobs enqueued
 *   - Validate email sending
 *   - Test error handling and retries
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with your actual object API name
 * [ ] Create mock classes for external callouts
 * [ ] Test all integration points
 * [ ] Verify error handling for API failures
 * [ ] Test retry logic
 * [ ] Verify async job execution
 * [ ] Test platform event subscribers
 * [ ] Validate email templates
 */

@isTest
private class ObjectNameIntegrationTest {

    // ========================================================================
    // TEST SETUP
    // ========================================================================

    @testSetup
    static void setup() {
        // Create test data
        Account testAccount = new Account(
            Name = 'Integration Test Account',
            ExternalId__c = 'EXT-12345'
        );
        insert testAccount;

        ObjectName testRecord = new ObjectName(
            Name = 'Integration Test',
            Status__c = 'New',
            AccountId__c = testAccount.Id,
            ExternalSync__c = true
        );
        insert testRecord;
    }

    // ========================================================================
    // HTTP CALLOUT TESTS
    // ========================================================================

    /**
     * Test: Successful HTTP callout to external API
     * Expected: Callout succeeds, response processed
     */
    @isTest
    static void testSuccessfulAPICallout() {
        // Arrange
        ObjectName record = [SELECT Id, ExternalId__c FROM ObjectName LIMIT 1];

        // Set mock callout
        Test.setMock(HttpCalloutMock.class, new SuccessCalloutMock());

        // Act
        Test.startTest();
        record.SyncToExternalSystem__c = true;
        update record;
        Test.stopTest();

        // Assert
        ObjectName updatedRecord = [
            SELECT Id, ExternalId__c, LastSyncDate__c, SyncStatus__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertNotEquals(null, updatedRecord.ExternalId__c,
            'External ID should be set from API response');
        System.assertNotEquals(null, updatedRecord.LastSyncDate__c,
            'Sync date should be set');
        System.assertEquals('Success', updatedRecord.SyncStatus__c,
            'Sync status should be Success');
    }

    /**
     * Test: Failed HTTP callout
     * Expected: Error handled gracefully, retry scheduled
     */
    @isTest
    static void testFailedAPICallout() {
        // Arrange
        ObjectName record = [SELECT Id FROM ObjectName LIMIT 1];

        // Set mock failure
        Test.setMock(HttpCalloutMock.class, new FailureCalloutMock());

        // Act
        Test.startTest();
        record.SyncToExternalSystem__c = true;
        update record;
        Test.stopTest();

        // Assert
        ObjectName updatedRecord = [
            SELECT Id, SyncStatus__c, RetryCount__c, LastErrorMessage__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals('Error', updatedRecord.SyncStatus__c,
            'Sync status should be Error');
        System.assertEquals(1, updatedRecord.RetryCount__c,
            'Retry count should be incremented');
        System.assertNotEquals(null, updatedRecord.LastErrorMessage__c,
            'Error message should be captured');
    }

    /**
     * Test: Timeout on API callout
     * Expected: Timeout handled, appropriate status set
     */
    @isTest
    static void testAPICalloutTimeout() {
        // Arrange
        ObjectName record = [SELECT Id FROM ObjectName LIMIT 1];

        // Set mock timeout
        Test.setMock(HttpCalloutMock.class, new TimeoutCalloutMock());

        // Act
        Test.startTest();
        record.SyncToExternalSystem__c = true;
        update record;
        Test.stopTest();

        // Assert
        ObjectName updatedRecord = [
            SELECT Id, SyncStatus__c, LastErrorMessage__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals('Timeout', updatedRecord.SyncStatus__c,
            'Status should indicate timeout');
        System.assert(updatedRecord.LastErrorMessage__c.contains('timeout'),
            'Error message should mention timeout');
    }

    // ========================================================================
    // FUTURE METHOD TESTS
    // ========================================================================

    /**
     * Test: @future method execution
     * Expected: Future method processes record after commit
     */
    @isTest
    static void testFutureMethodExecution() {
        // Arrange
        ObjectName record = [SELECT Id FROM ObjectName LIMIT 1];

        // Act
        Test.startTest();
        record.ProcessAsync__c = true;
        update record;
        Test.stopTest(); // Forces @future to execute synchronously

        // Assert
        ObjectName updatedRecord = [
            SELECT Id, AsyncProcessed__c, AsyncProcessedDate__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals(true, updatedRecord.AsyncProcessed__c,
            'Async processing should complete');
        System.assertNotEquals(null, updatedRecord.AsyncProcessedDate__c,
            'Async processing date should be set');
    }

    /**
     * Test: @future method with callout
     * Expected: Callout executes successfully
     */
    @isTest
    static void testFutureMethodWithCallout() {
        // Arrange
        ObjectName record = [SELECT Id FROM ObjectName LIMIT 1];

        Test.setMock(HttpCalloutMock.class, new SuccessCalloutMock());

        // Act
        Test.startTest();
        record.ProcessAsyncWithCallout__c = true;
        update record;
        Test.stopTest();

        // Assert
        ObjectName updatedRecord = [
            SELECT Id, CalloutCompleted__c, ExternalResponse__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals(true, updatedRecord.CalloutCompleted__c,
            'Callout should complete');
        System.assertNotEquals(null, updatedRecord.ExternalResponse__c,
            'Response should be stored');
    }

    // ========================================================================
    // QUEUEABLE TESTS
    // ========================================================================

    /**
     * Test: Queueable job enqueued
     * Expected: Job enqueued and executes
     */
    @isTest
    static void testQueueableJobExecution() {
        // Arrange
        ObjectName record = [SELECT Id, Name FROM ObjectName LIMIT 1];

        // Act
        Test.startTest();
        record.EnqueueProcessing__c = true;
        update record;
        Test.stopTest(); // Forces queueable to execute

        // Assert
        ObjectName updatedRecord = [
            SELECT Id, QueueableProcessed__c, ProcessedBy__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals(true, updatedRecord.QueueableProcessed__c,
            'Queueable should process record');
        System.assertNotEquals(null, updatedRecord.ProcessedBy__c,
            'Processor should be recorded');
    }

    /**
     * Test: Chained queueable jobs
     * Expected: Multiple jobs execute in sequence
     */
    @isTest
    static void testChainedQueueableJobs() {
        // Arrange
        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 5; i++) {
            records.add(new ObjectName(
                Name = 'Queueable Chain Test ' + i,
                Status__c = 'New',
                ChainProcessing__c = true
            ));
        }
        insert records;

        // Act
        Test.startTest();
        for (ObjectName record : records) {
            record.Status__c = 'Queued';
        }
        update records;
        Test.stopTest();

        // Assert
        List<ObjectName> processedRecords = [
            SELECT Id, ChainedProcessed__c, ChainSequence__c
            FROM ObjectName
            WHERE Name LIKE 'Queueable Chain Test%'
        ];

        for (ObjectName record : processedRecords) {
            System.assertEquals(true, record.ChainedProcessed__c,
                'Should be processed in chain');
            System.assertNotEquals(null, record.ChainSequence__c,
                'Chain sequence should be set');
        }
    }

    // ========================================================================
    // BATCH JOB TESTS
    // ========================================================================

    /**
     * Test: Batch job scheduled
     * Expected: Batch job created and ready to execute
     */
    @isTest
    static void testBatchJobScheduled() {
        // Arrange
        ObjectName record = [SELECT Id FROM ObjectName LIMIT 1];

        // Act
        Test.startTest();
        record.ScheduleBatchProcessing__c = true;
        update record;
        Test.stopTest();

        // Assert - Query async apex jobs
        List<AsyncApexJob> jobs = [
            SELECT Id, Status, JobType
            FROM AsyncApexJob
            WHERE JobType = 'BatchApex'
              AND Status IN ('Queued', 'Processing', 'Completed')
        ];

        System.assert(jobs.size() > 0,
            'Batch job should be enqueued');
    }

    /**
     * Test: Batch job execution with records
     * Expected: Batch processes records correctly
     */
    @isTest
    static void testBatchJobExecution() {
        // Arrange - Create 50 records for batch
        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 50; i++) {
            records.add(new ObjectName(
                Name = 'Batch Test ' + i,
                Status__c = 'Pending',
                BatchProcessing__c = true
            ));
        }
        insert records;

        // Act
        Test.startTest();
        // Execute batch directly in test
        ObjectNameBatchProcessor batch = new ObjectNameBatchProcessor();
        Database.executeBatch(batch, 10); // Batch size 10
        Test.stopTest();

        // Assert
        List<ObjectName> processedRecords = [
            SELECT Id, Status__c, BatchProcessed__c
            FROM ObjectName
            WHERE Name LIKE 'Batch Test%'
        ];

        System.assertEquals(50, processedRecords.size(),
            'All records should exist');

        for (ObjectName record : processedRecords) {
            System.assertEquals(true, record.BatchProcessed__c,
                'Should be batch processed');
        }
    }

    // ========================================================================
    // PLATFORM EVENT TESTS
    // ========================================================================

    /**
     * Test: Platform event published
     * Expected: Event published successfully
     */
    @isTest
    static void testPlatformEventPublished() {
        // Arrange
        ObjectName record = [SELECT Id, Name FROM ObjectName LIMIT 1];

        // Act
        Test.startTest();
        record.PublishEvent__c = true;
        update record;
        Test.stopTest();

        // Assert
        ObjectName updatedRecord = [
            SELECT Id, EventPublished__c, EventPublishDate__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals(true, updatedRecord.EventPublished__c,
            'Event should be marked as published');
        System.assertNotEquals(null, updatedRecord.EventPublishDate__c,
            'Publish date should be set');

        // Note: Cannot query platform events in tests
        // Verify indirect effects only
    }

    /**
     * Test: Multiple platform events published in bulk
     * Expected: All events published
     */
    @isTest
    static void testBulkPlatformEventPublish() {
        // Arrange
        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 10; i++) {
            records.add(new ObjectName(
                Name = 'Event Test ' + i,
                Status__c = 'New',
                PublishEvent__c = true
            ));
        }

        // Act
        Test.startTest();
        insert records;
        Test.stopTest();

        // Assert
        List<ObjectName> insertedRecords = [
            SELECT Id, EventPublished__c
            FROM ObjectName
            WHERE Name LIKE 'Event Test%'
        ];

        for (ObjectName record : insertedRecords) {
            System.assertEquals(true, record.EventPublished__c,
                'All events should be published');
        }
    }

    // ========================================================================
    // EMAIL TESTS
    // ========================================================================

    /**
     * Test: Email sent on record creation
     * Expected: Email queued for delivery
     */
    @isTest
    static void testEmailSentOnInsert() {
        // Arrange
        Account account = [SELECT Id FROM Account LIMIT 1];

        // Act
        Test.startTest();
        ObjectName record = new ObjectName(
            Name = 'Email Test',
            Status__c = 'New',
            SendWelcomeEmail__c = true,
            AccountId__c = account.Id
        );
        insert record;
        Test.stopTest();

        // Assert
        ObjectName insertedRecord = [
            SELECT Id, EmailSent__c, EmailSentDate__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals(true, insertedRecord.EmailSent__c,
            'Email should be marked as sent');
        System.assertNotEquals(null, insertedRecord.EmailSentDate__c,
            'Email sent date should be set');

        // Note: Emails are not actually sent in tests
        // Verify email flags/counters only
    }

    /**
     * Test: Bulk email sending stays within limits
     * Expected: Emails queued, single email limit not exceeded
     */
    @isTest
    static void testBulkEmailSending() {
        // Arrange - 50 records
        Account account = [SELECT Id FROM Account LIMIT 1];
        List<ObjectName> records = new List<ObjectName>();

        for (Integer i = 0; i < 50; i++) {
            records.add(new ObjectName(
                Name = 'Bulk Email Test ' + i,
                Status__c = 'New',
                SendNotification__c = true,
                AccountId__c = account.Id
            ));
        }

        // Act
        Test.startTest();
        insert records;
        Test.stopTest();

        // Assert - Verify all marked for email
        List<ObjectName> insertedRecords = [
            SELECT Id, EmailQueued__c
            FROM ObjectName
            WHERE Name LIKE 'Bulk Email Test%'
        ];

        System.assertEquals(50, insertedRecords.size(),
            'All records inserted');

        for (ObjectName record : insertedRecords) {
            System.assertEquals(true, record.EmailQueued__c,
                'Email should be queued');
        }

        // Verify within single email limit (10 per transaction in test context)
        System.assert(Limits.getEmailInvocations() <= Limits.getLimitEmailInvocations(),
            'Should not exceed email limit');
    }

    // ========================================================================
    // ERROR HANDLING & RETRY TESTS
    // ========================================================================

    /**
     * Test: API error triggers retry logic
     * Expected: Retry scheduled, exponential backoff applied
     */
    @isTest
    static void testAPIErrorRetryLogic() {
        // Arrange
        ObjectName record = [SELECT Id, RetryCount__c FROM ObjectName LIMIT 1];
        record.RetryCount__c = 0;
        update record;

        Test.setMock(HttpCalloutMock.class, new FailureCalloutMock());

        // Act - First attempt
        Test.startTest();
        record.SyncToExternalSystem__c = true;
        update record;
        Test.stopTest();

        // Assert
        ObjectName updatedRecord = [
            SELECT Id, RetryCount__c, NextRetryDate__c, RetryScheduled__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals(1, updatedRecord.RetryCount__c,
            'Retry count incremented');
        System.assertEquals(true, updatedRecord.RetryScheduled__c,
            'Retry should be scheduled');
        System.assertNotEquals(null, updatedRecord.NextRetryDate__c,
            'Next retry date should be set');
    }

    /**
     * Test: Max retries exceeded
     * Expected: Record marked as failed, no more retries
     */
    @isTest
    static void testMaxRetriesExceeded() {
        // Arrange
        ObjectName record = [SELECT Id FROM ObjectName LIMIT 1];
        record.RetryCount__c = 3; // Already at max
        update record;

        Test.setMock(HttpCalloutMock.class, new FailureCalloutMock());

        // Act
        Test.startTest();
        record.SyncToExternalSystem__c = true;
        update record;
        Test.stopTest();

        // Assert
        ObjectName updatedRecord = [
            SELECT Id, SyncStatus__c, RetryCount__c, RetryScheduled__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals('Failed', updatedRecord.SyncStatus__c,
            'Should mark as permanently failed');
        System.assertEquals(false, updatedRecord.RetryScheduled__c,
            'Should not schedule more retries');
    }

    // ========================================================================
    // MOCK CLASSES
    // ========================================================================

    /**
     * Mock: Successful HTTP callout
     */
    private class SuccessCalloutMock implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setBody('{"success":true,"externalId":"EXT-' +
                       String.valueOf(Math.random()) + '"}');
            return res;
        }
    }

    /**
     * Mock: Failed HTTP callout
     */
    private class FailureCalloutMock implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(500);
            res.setBody('{"error":"Internal Server Error"}');
            return res;
        }
    }

    /**
     * Mock: Timeout HTTP callout
     */
    private class TimeoutCalloutMock implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            // Simulate timeout by throwing exception
            CalloutException e = new CalloutException();
            e.setMessage('Read timed out');
            throw e;
        }
    }

    /**
     * Mock: Multi-endpoint callout (routes by endpoint)
     */
    private class MultiEndpointCalloutMock implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse res = new HttpResponse();

            if (req.getEndpoint().contains('/api/users')) {
                res.setStatusCode(200);
                res.setBody('{"users":[]}');
            } else if (req.getEndpoint().contains('/api/orders')) {
                res.setStatusCode(200);
                res.setBody('{"orders":[]}');
            } else {
                res.setStatusCode(404);
                res.setBody('{"error":"Not Found"}');
            }

            return res;
        }
    }
}

/**
 * INTEGRATION TESTING BEST PRACTICES:
 *
 * 1. HTTP Callouts:
 *    - Always use Test.setMock(HttpCalloutMock.class, mockClass)
 *    - Test success, failure, timeout scenarios
 *    - Verify error handling and retry logic
 *    - Test different response codes (200, 400, 500)
 *    - Mock multiple endpoints with routing logic
 *
 * 2. Asynchronous Operations:
 *    - Use Test.startTest/stopTest to force sync execution
 *    - Verify @future methods execute correctly
 *    - Test queueable job chaining
 *    - Verify batch jobs enqueue/execute
 *    - Check async job status in AsyncApexJob
 *
 * 3. Platform Events:
 *    - Cannot query events in tests
 *    - Verify publish flags/counters
 *    - Test bulk event publishing
 *    - Verify error handling on publish failure
 *
 * 4. Email:
 *    - Emails not actually sent in tests
 *    - Verify email flags/counters
 *    - Test within single email limit (10/transaction in tests)
 *    - Verify template usage
 *    - Test bulk email sending
 *
 * 5. Error Handling:
 *    - Test all failure scenarios
 *    - Verify retry logic
 *    - Test max retries exceeded
 *    - Verify error messages captured
 *    - Test exponential backoff
 *
 * 6. Limits:
 *    - Callout limit: 100 per transaction
 *    - Future/Queueable: 50 per transaction
 *    - Email: 10 single emails per transaction
 *    - Mass email: 5,000 per day org-wide
 */
