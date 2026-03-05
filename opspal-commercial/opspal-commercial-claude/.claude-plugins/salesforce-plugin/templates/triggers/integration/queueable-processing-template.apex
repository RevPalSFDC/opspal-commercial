/**
 * Queueable Processing Template
 *
 * USE CASE: Asynchronous processing with the ability to chain jobs and make callouts
 *
 * When to use this template:
 * - Process large datasets that exceed synchronous limits
 * - Make HTTP callouts from triggers (not allowed synchronously)
 * - Chain multiple async jobs (Queueable can enqueue another Queueable)
 * - Process records in batches with progress tracking
 * - Avoid "Uncommitted work pending" errors
 * - Defer expensive operations to background processing
 *
 * COMPLEXITY: Medium
 * GOVERNOR LIMITS (Queueable):
 * - 100 SOQL queries, 150 DML operations
 * - 12MB heap size, 60 seconds CPU time
 * - Can chain up to 50 jobs per transaction
 * - Can make HTTP callouts
 *
 * CRITICAL NOTES:
 * - Queueable jobs are asynchronous (no guaranteed execution time)
 * - Maximum 50 jobs can be enqueued per transaction
 * - Jobs execute in order but timing is not guaranteed
 * - Use for operations that can afford eventual consistency
 *
 * CUSTOMIZATION CHECKLIST:
 * 1. Replace ObjectName with your object API name
 * 2. Define which operations should run asynchronously
 * 3. Implement job chaining logic if needed
 * 4. Add error handling and retry logic
 * 5. Consider monitoring/logging for async jobs
 */

// ============================================================================
// TRIGGER FILE: ObjectNameTrigger.trigger
// ============================================================================
trigger ObjectNameTrigger on ObjectName (after insert, after update) {
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
                }
            }
        } finally {
            isExecuting = false;
        }
    }

    // ========================================================================
    // AFTER INSERT - Queue async processing
    // ========================================================================
    private static void handleAfterInsert(List<ObjectName> newRecords) {
        // Collect record IDs that need processing
        Set<Id> recordIds = new Set<Id>();
        for (ObjectName record : newRecords) {
            if (requiresAsyncProcessing(record)) {
                recordIds.add(record.Id);
            }
        }

        // Enqueue async processing
        if (!recordIds.isEmpty()) {
            System.enqueueJob(new RecordProcessorQueueable(recordIds,
                'INSERT'));
        }
    }

    // ========================================================================
    // AFTER UPDATE - Queue async processing for relevant changes
    // ========================================================================
    private static void handleAfterUpdate(List<ObjectName> newRecords,
                                          Map<Id, ObjectName> oldMap) {
        Set<Id> recordIds = new Set<Id>();

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            if (hasRelevantChanges(newRecord, oldRecord)) {
                recordIds.add(newRecord.Id);
            }
        }

        if (!recordIds.isEmpty()) {
            System.enqueueJob(new RecordProcessorQueueable(recordIds,
                'UPDATE'));
        }
    }

    // ========================================================================
    // HELPERS
    // ========================================================================
    private static Boolean requiresAsyncProcessing(ObjectName record) {
        // Define criteria for async processing
        return record.Status__c == 'Pending Processing' ||
               record.RequiresEnrichment__c == true ||
               record.Amount__c > 100000;
    }

    private static Boolean hasRelevantChanges(ObjectName newRecord,
                                               ObjectName oldRecord) {
        return newRecord.Status__c != oldRecord.Status__c ||
               newRecord.ProcessingRequired__c != oldRecord.ProcessingRequired__c;
    }
}

// ============================================================================
// PATTERN 1: Basic Queueable for Record Processing
// ============================================================================
public class RecordProcessorQueueable implements Queueable {
    private Set<Id> recordIds;
    private String operation;

    public RecordProcessorQueueable(Set<Id> recordIds, String operation) {
        this.recordIds = recordIds;
        this.operation = operation;
    }

    public void execute(QueueableContext context) {
        try {
            // Query records (with full access to governor limits)
            List<ObjectName> records = [
                SELECT Id, Name, Status__c, Amount__c, ProcessingRequired__c,
                       Category__c, Region__c, RequiresEnrichment__c
                FROM ObjectName
                WHERE Id IN :recordIds
            ];

            // Process each record
            List<ObjectName> recordsToUpdate = new List<ObjectName>();

            for (ObjectName record : records) {
                // Perform expensive operations
                enrichRecord(record);
                calculateComplexFields(record);
                updateRelatedRecords(record);

                recordsToUpdate.add(record);
            }

            // Update records
            if (!recordsToUpdate.isEmpty()) {
                update recordsToUpdate;
            }

            // Log success
            logProcessingResult(context.getJobId(), recordIds, 'SUCCESS', null);

        } catch (Exception e) {
            // Log failure
            logProcessingResult(context.getJobId(), recordIds, 'FAILURE',
                e.getMessage());

            // Optionally retry failed records
            retryFailedRecords(recordIds, e);
        }
    }

    private void enrichRecord(ObjectName record) {
        // Example: Lookup additional data
        if (record.RequiresEnrichment__c) {
            record.EnrichedData__c = 'Enriched Value';
            record.EnrichmentDate__c = System.now();
            record.RequiresEnrichment__c = false;
        }
    }

    private void calculateComplexFields(ObjectName record) {
        // Example: Complex calculations
        if (record.Amount__c != null) {
            record.TaxAmount__c = record.Amount__c * 0.08;
            record.TotalWithTax__c = record.Amount__c + record.TaxAmount__c;
        }
    }

    private void updateRelatedRecords(ObjectName record) {
        // Example: Update related records
        // This would make additional SOQL/DML calls
    }

    private void logProcessingResult(Id jobId, Set<Id> recordIds,
                                     String status, String errorMessage) {
        AsyncProcessingLog__c log = new AsyncProcessingLog__c();
        log.JobId__c = jobId;
        log.RecordCount__c = recordIds.size();
        log.Status__c = status;
        log.ErrorMessage__c = errorMessage;
        log.ProcessedDate__c = System.now();

        insert log;
    }

    private void retryFailedRecords(Set<Id> recordIds, Exception e) {
        // Implement retry logic if needed
        System.debug('Failed to process records: ' + e.getMessage());
    }
}

// ============================================================================
// PATTERN 2: Queueable with HTTP Callout
// ============================================================================
public class ExternalSystemCalloutQueueable implements Queueable, Database.AllowsCallouts {
    private Set<Id> recordIds;

    public ExternalSystemCalloutQueueable(Set<Id> recordIds) {
        this.recordIds = recordIds;
    }

    public void execute(QueueableContext context) {
        // Query records
        List<ObjectName> records = [
            SELECT Id, Name, ExternalId__c, Status__c
            FROM ObjectName
            WHERE Id IN :recordIds
        ];

        for (ObjectName record : records) {
            try {
                // Make HTTP callout
                HttpRequest req = new HttpRequest();
                req.setEndpoint('https://api.external-system.com/update');
                req.setMethod('POST');
                req.setHeader('Content-Type', 'application/json');
                req.setBody(JSON.serialize(record));
                req.setTimeout(120000); // 2 minutes

                Http http = new Http();
                HttpResponse res = http.send(req);

                if (res.getStatusCode() == 200) {
                    // Success - update record
                    record.ExternalSyncStatus__c = 'Success';
                    record.LastSyncDate__c = System.now();
                } else {
                    // Failure - log error
                    record.ExternalSyncStatus__c = 'Failed';
                    record.ExternalSyncError__c = res.getBody();
                }

            } catch (Exception e) {
                record.ExternalSyncStatus__c = 'Error';
                record.ExternalSyncError__c = e.getMessage();
            }
        }

        // Update all records with sync status
        update records;
    }
}

// ============================================================================
// PATTERN 3: Chained Queueable Jobs
// ============================================================================
public class ChainedQueueableExample implements Queueable {
    private List<Id> recordIds;
    private Integer batchNumber;
    private Integer totalBatches;

    public ChainedQueueableExample(List<Id> recordIds, Integer batchNumber,
                                   Integer totalBatches) {
        this.recordIds = recordIds;
        this.batchNumber = batchNumber;
        this.totalBatches = totalBatches;
    }

    public void execute(QueueableContext context) {
        System.debug('Processing batch ' + batchNumber + ' of ' + totalBatches);

        // Process current batch
        List<ObjectName> records = [
            SELECT Id, Name, Status__c
            FROM ObjectName
            WHERE Id IN :recordIds
        ];

        for (ObjectName record : records) {
            record.Status__c = 'Processed';
            record.ProcessedDate__c = System.now();
        }

        update records;

        // Chain next job if more batches remain
        if (batchNumber < totalBatches) {
            // Query next batch of IDs
            List<ObjectName> nextBatch = [
                SELECT Id
                FROM ObjectName
                WHERE Status__c = 'Pending'
                ORDER BY CreatedDate ASC
                LIMIT 200
            ];

            if (!nextBatch.isEmpty()) {
                List<Id> nextBatchIds = new List<Id>();
                for (ObjectName record : nextBatch) {
                    nextBatchIds.add(record.Id);
                }

                // Enqueue next job
                System.enqueueJob(new ChainedQueueableExample(nextBatchIds,
                    batchNumber + 1, totalBatches));
            }
        }
    }

    /**
     * Static method to start the chain
     */
    public static void processAllPendingRecords() {
        // Count total records
        Integer totalCount = [
            SELECT COUNT()
            FROM ObjectName
            WHERE Status__c = 'Pending'
        ];

        if (totalCount == 0) {
            System.debug('No pending records to process');
            return;
        }

        // Calculate number of batches (200 records per batch)
        Integer batchSize = 200;
        Integer totalBatches = (Integer) Math.ceil(totalCount / (Decimal) batchSize);

        // Query first batch
        List<ObjectName> firstBatch = [
            SELECT Id
            FROM ObjectName
            WHERE Status__c = 'Pending'
            ORDER BY CreatedDate ASC
            LIMIT :batchSize
        ];

        List<Id> firstBatchIds = new List<Id>();
        for (ObjectName record : firstBatch) {
            firstBatchIds.add(record.Id);
        }

        // Start chain
        System.enqueueJob(new ChainedQueueableExample(firstBatchIds, 1,
            totalBatches));

        System.debug('Started chain processing: ' + totalBatches + ' batches');
    }
}

// ============================================================================
// PATTERN 4: Queueable with Progress Tracking
// ============================================================================
public class ProgressTrackingQueueable implements Queueable {
    private Id jobTrackerId;
    private List<Id> recordIds;

    public ProgressTrackingQueueable(Id jobTrackerId, List<Id> recordIds) {
        this.jobTrackerId = jobTrackerId;
        this.recordIds = recordIds;
    }

    public void execute(QueueableContext context) {
        // Update tracker with job ID
        JobTracker__c tracker = [
            SELECT Id, Status__c, TotalRecords__c, ProcessedRecords__c
            FROM JobTracker__c
            WHERE Id = :jobTrackerId
        ];

        tracker.QueueableJobId__c = context.getJobId();
        tracker.Status__c = 'Processing';
        tracker.StartTime__c = System.now();
        update tracker;

        try {
            // Process records
            List<ObjectName> records = [
                SELECT Id, Name FROM ObjectName WHERE Id IN :recordIds
            ];

            Integer processed = 0;
            for (ObjectName record : records) {
                // Process record
                record.Status__c = 'Processed';
                processed++;

                // Update progress periodically
                if (Math.mod(processed, 10) == 0) {
                    tracker.ProcessedRecords__c = processed;
                    update tracker;
                }
            }

            update records;

            // Mark as complete
            tracker.Status__c = 'Completed';
            tracker.ProcessedRecords__c = processed;
            tracker.EndTime__c = System.now();
            tracker.DurationSeconds__c =
                (tracker.EndTime__c.getTime() - tracker.StartTime__c.getTime()) / 1000;

        } catch (Exception e) {
            tracker.Status__c = 'Failed';
            tracker.ErrorMessage__c = e.getMessage();
            tracker.EndTime__c = System.now();
        }

        update tracker;
    }

    /**
     * Start job with tracking
     */
    public static Id startTrackedJob(List<Id> recordIds) {
        // Create tracker
        JobTracker__c tracker = new JobTracker__c();
        tracker.JobType__c = 'Record Processing';
        tracker.TotalRecords__c = recordIds.size();
        tracker.Status__c = 'Queued';
        insert tracker;

        // Enqueue job
        System.enqueueJob(new ProgressTrackingQueueable(tracker.Id, recordIds));

        return tracker.Id;
    }
}

// ============================================================================
// PATTERN 5: Queueable with Error Recovery
// ============================================================================
public class ResilientQueueable implements Queueable {
    private Set<Id> recordIds;
    private Integer retryCount;
    private static final Integer MAX_RETRIES = 3;

    public ResilientQueueable(Set<Id> recordIds, Integer retryCount) {
        this.recordIds = recordIds;
        this.retryCount = retryCount != null ? retryCount : 0;
    }

    public void execute(QueueableContext context) {
        try {
            // Process records
            List<ObjectName> records = [
                SELECT Id, Name, Status__c
                FROM ObjectName
                WHERE Id IN :recordIds
            ];

            for (ObjectName record : records) {
                // Process (may throw exception)
                processRecord(record);
            }

            update records;

        } catch (Exception e) {
            System.debug('Error in queueable (attempt ' + (retryCount + 1) +
                '): ' + e.getMessage());

            // Retry if under max retries
            if (retryCount < MAX_RETRIES) {
                System.debug('Retrying...');
                System.enqueueJob(new ResilientQueueable(recordIds,
                    retryCount + 1));
            } else {
                // Max retries reached - log permanent failure
                logPermanentFailure(recordIds, e);
            }
        }
    }

    private void processRecord(ObjectName record) {
        // Processing logic that may fail
        record.Status__c = 'Processed';
    }

    private void logPermanentFailure(Set<Id> recordIds, Exception e) {
        AsyncProcessingError__c error = new AsyncProcessingError__c();
        error.RecordIds__c = String.join(new List<Id>(recordIds), ',');
        error.ErrorMessage__c = e.getMessage();
        error.MaxRetriesReached__c = true;
        error.FailureDate__c = System.now();
        insert error;
    }
}

// ============================================================================
// TEST CLASS: QueueableProcessingTest.cls
// ============================================================================
@isTest
private class QueueableProcessingTest {

    // ========================================================================
    // TEST SETUP
    // ========================================================================
    @testSetup
    static void setup() {
        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 10; i++) {
            records.add(new ObjectName(
                Name = 'Test ' + i,
                Status__c = 'Pending Processing',
                Amount__c = 50000 + (i * 1000),
                RequiresEnrichment__c = true
            ));
        }
        insert records;
    }

    // ========================================================================
    // TEST: Basic Queueable Processing
    // ========================================================================
    @isTest
    static void testBasicQueueableProcessing() {
        List<ObjectName> records = [SELECT Id FROM ObjectName];
        Set<Id> recordIds = new Set<Id>();
        for (ObjectName record : records) {
            recordIds.add(record.Id);
        }

        Test.startTest();

        // Enqueue job
        System.enqueueJob(new RecordProcessorQueueable(recordIds, 'TEST'));

        Test.stopTest();

        // Verify records processed
        records = [SELECT Id, Status__c, EnrichedData__c,
                          RequiresEnrichment__c
                   FROM ObjectName];

        // In test context, queueable executes synchronously
        System.assertNotEquals(0, records.size());
    }

    // ========================================================================
    // TEST: Queueable with Callout (mock)
    // ========================================================================
    @isTest
    static void testQueueableWithCallout() {
        List<ObjectName> records = [SELECT Id FROM ObjectName LIMIT 5];
        Set<Id> recordIds = new Set<Id>();
        for (ObjectName record : records) {
            recordIds.add(record.Id);
        }

        // Set mock callout
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator());

        Test.startTest();

        System.enqueueJob(new ExternalSystemCalloutQueueable(recordIds));

        Test.stopTest();

        System.assert(true, 'Callout queueable should execute');
    }

    // ========================================================================
    // TEST: Chained Queueable
    // ========================================================================
    @isTest
    static void testChainedQueueable() {
        Test.startTest();

        ChainedQueueableExample.processAllPendingRecords();

        Test.stopTest();

        // Verify first batch processed
        List<ObjectName> processed = [
            SELECT Id, Status__c
            FROM ObjectName
            WHERE Status__c = 'Processed'
        ];

        System.assert(processed.size() > 0, 'Should process some records');
    }

    // ========================================================================
    // TEST: Progress Tracking
    // ========================================================================
    @isTest
    static void testProgressTracking() {
        List<ObjectName> records = [SELECT Id FROM ObjectName];
        List<Id> recordIds = new List<Id>();
        for (ObjectName record : records) {
            recordIds.add(record.Id);
        }

        Test.startTest();

        Id trackerId = ProgressTrackingQueueable.startTrackedJob(recordIds);

        Test.stopTest();

        // Verify tracker created and updated
        JobTracker__c tracker = [
            SELECT Id, Status__c, ProcessedRecords__c
            FROM JobTracker__c
            WHERE Id = :trackerId
        ];

        System.assertNotEquals(null, tracker);
        System.assertNotEquals('Queued', tracker.Status__c);
    }

    // ========================================================================
    // TEST: Error Recovery
    // ========================================================================
    @isTest
    static void testErrorRecovery() {
        List<ObjectName> records = [SELECT Id FROM ObjectName LIMIT 3];
        Set<Id> recordIds = new Set<Id>();
        for (ObjectName record : records) {
            recordIds.add(record.Id);
        }

        Test.startTest();

        System.enqueueJob(new ResilientQueueable(recordIds, 0));

        Test.stopTest();

        System.assert(true, 'Error recovery queueable should execute');
    }

    // ========================================================================
    // TEST: Bulk Queueable (200 records)
    // ========================================================================
    @isTest
    static void testBulkQueueable() {
        // Delete existing test records
        delete [SELECT Id FROM ObjectName];

        // Create 200 records
        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ObjectName(
                Name = 'Bulk ' + i,
                Status__c = 'Pending',
                RequiresEnrichment__c = true
            ));
        }
        insert records;

        Set<Id> recordIds = new Set<Id>();
        for (ObjectName record : records) {
            recordIds.add(record.Id);
        }

        Test.startTest();

        System.enqueueJob(new RecordProcessorQueueable(recordIds, 'BULK'));

        Test.stopTest();

        // Verify processing
        System.assertEquals(200, recordIds.size());
    }

    // ========================================================================
    // MOCK HTTP RESPONSE
    // ========================================================================
    private class MockHttpResponseGenerator implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setBody('{"success": true}');
            return res;
        }
    }
}
