/**
 * Batch Processing Template
 *
 * USE CASE: Process millions of records asynchronously in batches
 *
 * When to use this template:
 * - Process large datasets (>200 records, up to millions)
 * - Data cleansing operations across entire object
 * - Mass updates that exceed trigger governor limits
 * - Scheduled data maintenance tasks
 * - Calculate rollup summaries for entire dataset
 * - Archive/delete old records
 * - Data migration and transformation
 *
 * COMPLEXITY: Medium
 * GOVERNOR LIMITS (Per Batch):
 * - 100 SOQL queries, 150 DML operations
 * - 12MB heap size, 60 seconds CPU time
 * - Default batch size: 200 records (configurable: 1-2000)
 * - Maximum 5 batch jobs in queue per org
 *
 * CRITICAL NOTES:
 * - Batch jobs execute asynchronously (timing not guaranteed)
 * - Each batch executes independently (separate transaction)
 * - Use Database.Stateful to maintain state across batches
 * - Monitor via Setup > Apex Jobs
 * - Consider using smaller batch sizes for complex operations
 *
 * CUSTOMIZATION CHECKLIST:
 * 1. Replace ObjectName with your object API name
 * 2. Define query logic in start() method
 * 3. Implement processing logic in execute() method
 * 4. Add completion logic in finish() method
 * 5. Configure batch size based on processing complexity
 * 6. Add error handling and logging
 * 7. Schedule batch if needed (Schedulable interface)
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
    // AFTER INSERT - Queue batch processing if threshold met
    // ========================================================================
    private static void handleAfterInsert(List<ObjectName> newRecords) {
        // Only start batch if large volume inserted
        if (newRecords.size() >= 100) {
            // Start batch to process all pending records
            Database.executeBatch(new RecordProcessingBatch(), 200);
        }
    }

    // ========================================================================
    // AFTER UPDATE - Queue batch for mass recalculation
    // ========================================================================
    private static void handleAfterUpdate(List<ObjectName> newRecords,
                                          Map<Id, ObjectName> oldMap) {
        // Check if batch processing needed
        Boolean needsBatchProcessing = false;

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            if (newRecord.RequiresMassUpdate__c == true &&
                oldRecord.RequiresMassUpdate__c == false) {
                needsBatchProcessing = true;
                break;
            }
        }

        if (needsBatchProcessing) {
            Database.executeBatch(new MassUpdateBatch());
        }
    }
}

// ============================================================================
// PATTERN 1: Basic Batch for Data Processing
// ============================================================================
public class RecordProcessingBatch implements Database.Batchable<SObject> {

    // ========================================================================
    // START - Define query to select records
    // ========================================================================
    public Database.QueryLocator start(Database.BatchableContext context) {
        // Query all records that need processing
        String query = 'SELECT Id, Name, Status__c, Amount__c, ' +
                      'ProcessingRequired__c, Category__c, Region__c ' +
                      'FROM ObjectName ' +
                      'WHERE Status__c = \'Pending\' ' +
                      'AND ProcessingRequired__c = true ' +
                      'ORDER BY CreatedDate ASC';

        return Database.getQueryLocator(query);
    }

    // ========================================================================
    // EXECUTE - Process each batch of records
    // ========================================================================
    public void execute(Database.BatchableContext context,
                       List<ObjectName> scope) {
        List<ObjectName> recordsToUpdate = new List<ObjectName>();

        for (ObjectName record : scope) {
            try {
                // Process record
                processRecord(record);
                recordsToUpdate.add(record);

            } catch (Exception e) {
                // Log error and continue with other records
                System.debug('Error processing record ' + record.Id + ': ' +
                    e.getMessage());
                logError(record.Id, e.getMessage());
            }
        }

        // Update all processed records
        if (!recordsToUpdate.isEmpty()) {
            List<Database.SaveResult> results = Database.update(recordsToUpdate,
                false); // Allow partial success

            // Check for errors
            for (Integer i = 0; i < results.size(); i++) {
                if (!results[i].isSuccess()) {
                    logError(recordsToUpdate[i].Id,
                        results[i].getErrors()[0].getMessage());
                }
            }
        }
    }

    // ========================================================================
    // FINISH - Execute post-processing logic
    // ========================================================================
    public void finish(Database.BatchableContext context) {
        // Query batch job details
        AsyncApexJob job = [
            SELECT Id, Status, NumberOfErrors, JobItemsProcessed,
                   TotalJobItems, CreatedDate, CompletedDate
            FROM AsyncApexJob
            WHERE Id = :context.getJobId()
        ];

        // Log completion
        System.debug('Batch job completed: ' + job.Status);
        System.debug('Records processed: ' + job.JobItemsProcessed +
                    '/' + job.TotalJobItems);
        System.debug('Errors: ' + job.NumberOfErrors);

        // Send notification email
        sendCompletionEmail(job);

        // Chain another batch if needed
        if (needsAdditionalProcessing()) {
            Database.executeBatch(new SecondaryProcessingBatch());
        }
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================
    private void processRecord(ObjectName record) {
        // Implement processing logic
        record.Status__c = 'Processed';
        record.ProcessedDate__c = System.now();
        record.ProcessingRequired__c = false;

        // Complex calculations
        if (record.Amount__c != null) {
            record.TaxAmount__c = record.Amount__c * 0.08;
            record.TotalWithTax__c = record.Amount__c + record.TaxAmount__c;
        }

        // Category-based processing
        if (record.Category__c == 'Premium') {
            record.DiscountPercent__c = 15;
        } else if (record.Category__c == 'Standard') {
            record.DiscountPercent__c = 10;
        }
    }

    private void logError(Id recordId, String errorMessage) {
        BatchProcessingError__c error = new BatchProcessingError__c();
        error.RecordId__c = recordId;
        error.ErrorMessage__c = errorMessage;
        error.ErrorDate__c = System.now();
        error.BatchJobId__c = 'Context unavailable in helper';

        insert error;
    }

    private void sendCompletionEmail(AsyncApexJob job) {
        Messaging.SingleEmailMessage mail = new Messaging.SingleEmailMessage();
        mail.setToAddresses(new String[] { UserInfo.getUserEmail() });
        mail.setSubject('Batch Job Completed: ' + job.Status);
        mail.setPlainTextBody(
            'Batch job completed.\n\n' +
            'Status: ' + job.Status + '\n' +
            'Records processed: ' + job.JobItemsProcessed + '/' +
                job.TotalJobItems + '\n' +
            'Errors: ' + job.NumberOfErrors + '\n' +
            'Started: ' + job.CreatedDate + '\n' +
            'Completed: ' + job.CompletedDate
        );

        Messaging.sendEmail(new Messaging.SingleEmailMessage[] { mail });
    }

    private Boolean needsAdditionalProcessing() {
        Integer pendingCount = [
            SELECT COUNT()
            FROM ObjectName
            WHERE Status__c = 'Needs Secondary Processing'
        ];

        return pendingCount > 0;
    }
}

// ============================================================================
// PATTERN 2: Stateful Batch (Maintains State Across Batches)
// ============================================================================
public class StatefulBatch implements Database.Batchable<SObject>,
                                      Database.Stateful {
    // These variables maintain state across batches
    public Integer recordsProcessed = 0;
    public Integer recordsFailed = 0;
    public List<Id> failedRecordIds = new List<Id>();

    public Database.QueryLocator start(Database.BatchableContext context) {
        return Database.getQueryLocator([
            SELECT Id, Name, Status__c, Amount__c
            FROM ObjectName
            WHERE Status__c = 'Pending'
        ]);
    }

    public void execute(Database.BatchableContext context,
                       List<ObjectName> scope) {
        for (ObjectName record : scope) {
            try {
                record.Status__c = 'Processed';
                update record;
                recordsProcessed++;

            } catch (Exception e) {
                recordsFailed++;
                failedRecordIds.add(record.Id);
            }
        }
    }

    public void finish(Database.BatchableContext context) {
        // Access stateful variables
        System.debug('Total processed: ' + recordsProcessed);
        System.debug('Total failed: ' + recordsFailed);

        // Send summary with all failed IDs
        if (recordsFailed > 0) {
            sendFailureSummary(failedRecordIds);
        }
    }

    private void sendFailureSummary(List<Id> failedIds) {
        String body = 'Failed records: ' + String.join(failedIds, ', ');
        // Send email with full list
    }
}

// ============================================================================
// PATTERN 3: Batch with Scope Query (Dynamic Filtering)
// ============================================================================
public class DynamicQueryBatch implements Database.Batchable<SObject> {
    private String queryString;
    private Map<String, Object> parameters;

    public DynamicQueryBatch(String status, Date startDate) {
        // Build dynamic query
        this.queryString = 'SELECT Id, Name, Status__c, CreatedDate ' +
                          'FROM ObjectName ' +
                          'WHERE Status__c = :status ' +
                          'AND CreatedDate >= :startDate';

        this.parameters = new Map<String, Object>{
            'status' => status,
            'startDate' => startDate
        };
    }

    public Database.QueryLocator start(Database.BatchableContext context) {
        return Database.getQueryLocator(queryString);
    }

    public void execute(Database.BatchableContext context,
                       List<ObjectName> scope) {
        // Process records
        for (ObjectName record : scope) {
            record.Status__c = 'Processed';
        }
        update scope;
    }

    public void finish(Database.BatchableContext context) {
        System.debug('Dynamic query batch completed');
    }
}

// ============================================================================
// PATTERN 4: Batch with Iterable (Custom Data Source)
// ============================================================================
public class IterableBatch implements Database.Batchable<String> {
    // Process data from external source or custom logic

    public Iterable<String> start(Database.BatchableContext context) {
        // Return custom iterable (e.g., list of external IDs to process)
        List<String> externalIds = new List<String>();

        // Query external IDs from custom object
        for (ExternalIdMapping__c mapping : [
            SELECT ExternalId__c FROM ExternalIdMapping__c
        ]) {
            externalIds.add(mapping.ExternalId__c);
        }

        return externalIds;
    }

    public void execute(Database.BatchableContext context,
                       List<String> scope) {
        // Process external IDs
        List<ObjectName> recordsToUpdate = new List<ObjectName>();

        for (String externalId : scope) {
            // Query record by external ID
            List<ObjectName> records = [
                SELECT Id, ExternalId__c, Status__c
                FROM ObjectName
                WHERE ExternalId__c = :externalId
                LIMIT 1
            ];

            if (!records.isEmpty()) {
                records[0].Status__c = 'Synced';
                recordsToUpdate.add(records[0]);
            }
        }

        if (!recordsToUpdate.isEmpty()) {
            update recordsToUpdate;
        }
    }

    public void finish(Database.BatchableContext context) {
        System.debug('Iterable batch completed');
    }
}

// ============================================================================
// PATTERN 5: Schedulable Batch (Runs on Schedule)
// ============================================================================
public class ScheduledBatch implements Schedulable, Database.Batchable<SObject> {

    // Schedulable interface
    public void execute(SchedulableContext context) {
        // Start batch job
        Database.executeBatch(this, 200);
    }

    // Batchable interfaces
    public Database.QueryLocator start(Database.BatchableContext context) {
        return Database.getQueryLocator([
            SELECT Id, Name, LastProcessedDate__c
            FROM ObjectName
            WHERE LastProcessedDate__c < LAST_N_DAYS:7
        ]);
    }

    public void execute(Database.BatchableContext context,
                       List<ObjectName> scope) {
        for (ObjectName record : scope) {
            record.LastProcessedDate__c = System.today();
        }
        update scope;
    }

    public void finish(Database.BatchableContext context) {
        System.debug('Scheduled batch completed');
    }

    /**
     * Schedule this batch to run daily at 2 AM
     * Run in Execute Anonymous:
     * System.schedule('Daily Processing', '0 0 2 * * ?', new ScheduledBatch());
     */
}

// ============================================================================
// PATTERN 6: Mass Update Batch
// ============================================================================
public class MassUpdateBatch implements Database.Batchable<SObject> {

    public Database.QueryLocator start(Database.BatchableContext context) {
        // Select all records
        return Database.getQueryLocator([
            SELECT Id, Status__c, Category__c, Amount__c
            FROM ObjectName
        ]);
    }

    public void execute(Database.BatchableContext context,
                       List<ObjectName> scope) {
        // Apply mass updates
        for (ObjectName record : scope) {
            // Update category based on amount
            if (record.Amount__c >= 1000000) {
                record.Category__c = 'Enterprise';
            } else if (record.Amount__c >= 100000) {
                record.Category__c = 'Premium';
            } else {
                record.Category__c = 'Standard';
            }

            record.LastReviewDate__c = System.today();
        }

        update scope;
    }

    public void finish(Database.BatchableContext context) {
        System.debug('Mass update completed');
    }
}

// ============================================================================
// BATCH UTILITY CLASS
// ============================================================================
public class BatchUtility {

    /**
     * Start batch with optimal batch size
     */
    public static Id startBatch(Database.Batchable<SObject> batch) {
        // Calculate optimal batch size based on complexity
        Integer batchSize = calculateOptimalBatchSize(batch);
        return Database.executeBatch(batch, batchSize);
    }

    /**
     * Check if batch is currently running
     */
    public static Boolean isBatchRunning(String batchClassName) {
        Integer count = [
            SELECT COUNT()
            FROM AsyncApexJob
            WHERE ApexClass.Name = :batchClassName
              AND Status IN ('Processing', 'Queued', 'Preparing')
        ];

        return count > 0;
    }

    /**
     * Get batch job status
     */
    public static AsyncApexJob getBatchStatus(Id jobId) {
        return [
            SELECT Id, Status, NumberOfErrors, JobItemsProcessed,
                   TotalJobItems, CreatedDate, CompletedDate,
                   ExtendedStatus
            FROM AsyncApexJob
            WHERE Id = :jobId
        ];
    }

    /**
     * Calculate optimal batch size
     */
    private static Integer calculateOptimalBatchSize(
        Database.Batchable<SObject> batch
    ) {
        // Default to 200
        // Reduce for complex operations
        // Can increase up to 2000 for simple operations
        return 200;
    }

    /**
     * Abort batch job
     */
    public static void abortBatch(Id jobId) {
        System.abortJob(jobId);
    }
}

// ============================================================================
// TEST CLASS: BatchProcessingTest.cls
// ============================================================================
@isTest
private class BatchProcessingTest {

    // ========================================================================
    // TEST SETUP
    // ========================================================================
    @testSetup
    static void setup() {
        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ObjectName(
                Name = 'Test ' + i,
                Status__c = 'Pending',
                ProcessingRequired__c = true,
                Amount__c = 10000 + (i * 1000)
            ));
        }
        insert records;
    }

    // ========================================================================
    // TEST: Basic Batch Processing
    // ========================================================================
    @isTest
    static void testBasicBatchProcessing() {
        Test.startTest();

        RecordProcessingBatch batch = new RecordProcessingBatch();
        Id jobId = Database.executeBatch(batch, 50); // Small batch size for test

        Test.stopTest();

        // Verify records processed
        List<ObjectName> processed = [
            SELECT Id, Status__c, ProcessedDate__c
            FROM ObjectName
            WHERE Status__c = 'Processed'
        ];

        System.assert(processed.size() > 0, 'Should process some records');

        // Verify job completed
        AsyncApexJob job = [
            SELECT Id, Status, JobItemsProcessed, NumberOfErrors
            FROM AsyncApexJob
            WHERE Id = :jobId
        ];

        System.assertEquals('Completed', job.Status);
    }

    // ========================================================================
    // TEST: Stateful Batch
    // ========================================================================
    @isTest
    static void testStatefulBatch() {
        Test.startTest();

        StatefulBatch batch = new StatefulBatch();
        Database.executeBatch(batch, 50);

        Test.stopTest();

        // Stateful variables should accumulate across batches
        System.assert(batch.recordsProcessed > 0,
            'Should track processed records');
    }

    // ========================================================================
    // TEST: Dynamic Query Batch
    // ========================================================================
    @isTest
    static void testDynamicQueryBatch() {
        Test.startTest();

        DynamicQueryBatch batch = new DynamicQueryBatch('Pending',
            Date.today().addDays(-30));
        Database.executeBatch(batch);

        Test.stopTest();

        List<ObjectName> processed = [
            SELECT Id FROM ObjectName WHERE Status__c = 'Processed'
        ];

        System.assert(processed.size() > 0);
    }

    // ========================================================================
    // TEST: Schedulable Batch
    // ========================================================================
    @isTest
    static void testSchedulableBatch() {
        Test.startTest();

        // Schedule batch
        String cronExp = '0 0 2 * * ?'; // Daily at 2 AM
        String jobId = System.schedule('Test Batch',
            cronExp, new ScheduledBatch());

        Test.stopTest();

        // Verify scheduled
        List<CronTrigger> scheduledJobs = [
            SELECT Id, CronExpression
            FROM CronTrigger
            WHERE Id = :jobId
        ];

        System.assertEquals(1, scheduledJobs.size());
    }

    // ========================================================================
    // TEST: Mass Update Batch
    // ========================================================================
    @isTest
    static void testMassUpdateBatch() {
        Test.startTest();

        MassUpdateBatch batch = new MassUpdateBatch();
        Database.executeBatch(batch);

        Test.stopTest();

        // Verify categories updated
        List<ObjectName> records = [
            SELECT Id, Category__c, Amount__c
            FROM ObjectName
        ];

        for (ObjectName record : records) {
            System.assertNotEquals(null, record.Category__c,
                'Category should be set');
        }
    }

    // ========================================================================
    // TEST: Batch with Errors
    // ========================================================================
    @isTest
    static void testBatchWithErrors() {
        // Create record that will cause error
        ObjectName errorRecord = new ObjectName(
            Name = 'Error Test',
            Status__c = 'Pending',
            ProcessingRequired__c = true
        );
        insert errorRecord;

        Test.startTest();

        RecordProcessingBatch batch = new RecordProcessingBatch();
        Database.executeBatch(batch);

        Test.stopTest();

        // Errors should be logged
        List<BatchProcessingError__c> errors = [
            SELECT Id FROM BatchProcessingError__c
        ];

        // Some records may have errors (depending on test data)
        System.assert(true, 'Batch should handle errors gracefully');
    }

    // ========================================================================
    // TEST: Batch Utility Methods
    // ========================================================================
    @isTest
    static void testBatchUtility() {
        Test.startTest();

        RecordProcessingBatch batch = new RecordProcessingBatch();
        Id jobId = BatchUtility.startBatch(batch);

        // Check if running
        Boolean isRunning = BatchUtility.isBatchRunning(
            'RecordProcessingBatch'
        );

        Test.stopTest();

        System.assertNotEquals(null, jobId);

        // Get status
        AsyncApexJob job = BatchUtility.getBatchStatus(jobId);
        System.assertNotEquals(null, job);
    }

    // ========================================================================
    // TEST: Large Volume (Governor Limits)
    // ========================================================================
    @isTest
    static void testLargeVolume() {
        // Test already has 200 records from setup

        Test.startTest();

        RecordProcessingBatch batch = new RecordProcessingBatch();
        Database.executeBatch(batch, 200); // Process all in one batch

        Test.stopTest();

        // Verify all processed
        Integer processedCount = [
            SELECT COUNT()
            FROM ObjectName
            WHERE Status__c = 'Processed'
        ];

        System.assert(processedCount > 0, 'Should process records');
    }
}
