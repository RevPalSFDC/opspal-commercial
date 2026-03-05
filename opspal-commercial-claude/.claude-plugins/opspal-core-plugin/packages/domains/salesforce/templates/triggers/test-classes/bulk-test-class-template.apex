/**
 * BULK TEST CLASS TEMPLATE
 *
 * Purpose: Test trigger bulkification and governor limits with large data volumes
 * Use Case: Verify trigger handles bulk operations correctly:
 *   - 200+ record DML operations
 *   - Governor limit compliance
 *   - Performance optimization
 *   - Batch data processing
 *   - List-based operations
 *
 * Pattern: Create 200+ records, verify queries/DML within limits
 *
 * Governor Limits to Verify:
 *   - SOQL Queries: 100 per transaction
 *   - DML Statements: 150 per transaction
 *   - DML Rows: 10,000 per transaction
 *   - CPU Time: 10,000ms synchronous
 *   - Heap Size: 6MB synchronous
 *
 * Bulkification Requirements:
 *   - Process collections, not individual records
 *   - Use Maps for efficient lookups
 *   - Single SOQL queries per object type
 *   - Single DML operations per object type
 *   - No SOQL/DML inside loops
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with your actual object API name
 * [ ] Adjust record count for your org limits
 * [ ] Test all trigger contexts with bulk data
 * [ ] Verify child record creation scales
 * [ ] Test bulk updates with field changes
 * [ ] Verify bulk delete doesn't hit limits
 * [ ] Test mixed record types in bulk
 */

@isTest
private class ObjectNameBulkTest {

    // Test data size constants
    private static final Integer BULK_SIZE = 200;
    private static final Integer LARGE_BULK_SIZE = 500;

    // ========================================================================
    // TEST SETUP
    // ========================================================================

    @testSetup
    static void setup() {
        // Create minimal test data in setup
        // Most bulk data created in individual tests for isolation

        // Create test account for foreign key
        Account testAccount = new Account(
            Name = 'Bulk Test Account',
            Type = 'Customer'
        );
        insert testAccount;
    }

    // ========================================================================
    // BULK INSERT TESTS
    // ========================================================================

    /**
     * Test: Bulk insert 200 records
     * Expected: All records inserted, limits not exceeded
     */
    @isTest
    static void testBulkInsert200Records() {
        // Arrange
        Account testAccount = [SELECT Id FROM Account LIMIT 1];
        List<ObjectName> records = new List<ObjectName>();

        for (Integer i = 0; i < BULK_SIZE; i++) {
            records.add(new ObjectName(
                Name = 'Bulk Test ' + i,
                Status__c = 'New',
                Amount__c = 1000 + i,
                Priority__c = 'Medium',
                AccountId__c = testAccount.Id
            ));
        }

        // Act
        Test.startTest();
        insert records;
        Test.stopTest();

        // Assert - Verify all records inserted
        List<ObjectName> insertedRecords = [
            SELECT Id, Name, Status__c
            FROM ObjectName
            WHERE Name LIKE 'Bulk Test%'
        ];

        System.assertEquals(BULK_SIZE, insertedRecords.size(),
            'All ' + BULK_SIZE + ' records should be inserted');

        // Assert - Verify governor limits
        System.assert(Limits.getQueries() < 100,
            'Should use fewer than 100 SOQL queries. Used: ' + Limits.getQueries());
        System.assert(Limits.getDMLStatements() < 10,
            'Should use fewer than 10 DML statements. Used: ' + Limits.getDMLStatements());
    }

    /**
     * Test: Bulk insert with different record types
     * Expected: All record types processed correctly
     */
    @isTest
    static void testBulkInsertMixedRecordTypes() {
        // Arrange
        Id customerRT = Schema.SObjectType.ObjectName
            .getRecordTypeInfosByDeveloperName()
            .get('Customer')
            .getRecordTypeId();
        Id partnerRT = Schema.SObjectType.ObjectName
            .getRecordTypeInfosByDeveloperName()
            .get('Partner')
            .getRecordTypeId();

        List<ObjectName> records = new List<ObjectName>();

        // Half customer, half partner
        for (Integer i = 0; i < BULK_SIZE; i++) {
            records.add(new ObjectName(
                Name = 'Mixed RT Test ' + i,
                RecordTypeId = Math.mod(i, 2) == 0 ? customerRT : partnerRT,
                Status__c = 'New',
                Amount__c = 1000 + i
            ));
        }

        // Act
        Test.startTest();
        insert records;
        Test.stopTest();

        // Assert
        List<ObjectName> customerRecords = [
            SELECT Id, RecordTypeId
            FROM ObjectName
            WHERE RecordTypeId = :customerRT
        ];

        List<ObjectName> partnerRecords = [
            SELECT Id, RecordTypeId
            FROM ObjectName
            WHERE RecordTypeId = :partnerRT
        ];

        System.assertEquals(BULK_SIZE / 2, customerRecords.size(),
            'Should have half customer records');
        System.assertEquals(BULK_SIZE / 2, partnerRecords.size(),
            'Should have half partner records');
    }

    /**
     * Test: Bulk insert with child record creation
     * Expected: All children created, limits not exceeded
     */
    @isTest
    static void testBulkInsertWithChildCreation() {
        // Arrange
        List<ObjectName> records = new List<ObjectName>();

        for (Integer i = 0; i < BULK_SIZE; i++) {
            records.add(new ObjectName(
                Name = 'Parent ' + i,
                Status__c = 'New',
                CreateChildren__c = true,
                ChildCount__c = 3 // Create 3 children per parent
            ));
        }

        // Act
        Test.startTest();
        insert records;
        Test.stopTest();

        // Assert - Verify children created
        List<ChildObject__c> children = [
            SELECT Id, ParentId__c
            FROM ChildObject__c
        ];

        Integer expectedChildren = BULK_SIZE * 3;
        System.assertEquals(expectedChildren, children.size(),
            'Should create ' + expectedChildren + ' children');

        // Assert - Verify governor limits
        System.assert(Limits.getDMLRows() < 10000,
            'Should not exceed DML rows limit. Used: ' + Limits.getDMLRows());
    }

    // ========================================================================
    // BULK UPDATE TESTS
    // ========================================================================

    /**
     * Test: Bulk update 200 records
     * Expected: All records updated, limits not exceeded
     */
    @isTest
    static void testBulkUpdate200Records() {
        // Arrange
        Account testAccount = [SELECT Id FROM Account LIMIT 1];
        List<ObjectName> records = new List<ObjectName>();

        for (Integer i = 0; i < BULK_SIZE; i++) {
            records.add(new ObjectName(
                Name = 'Bulk Update Test ' + i,
                Status__c = 'New',
                Amount__c = 1000 + i,
                AccountId__c = testAccount.Id
            ));
        }
        insert records;

        // Modify all records
        for (ObjectName record : records) {
            record.Status__c = 'In Progress';
            record.Amount__c += 500;
        }

        // Act
        Test.startTest();
        update records;
        Test.stopTest();

        // Assert - Verify all updated
        List<ObjectName> updatedRecords = [
            SELECT Id, Status__c, Amount__c, PreviousStatus__c
            FROM ObjectName
            WHERE Name LIKE 'Bulk Update Test%'
        ];

        System.assertEquals(BULK_SIZE, updatedRecords.size(),
            'All records should be updated');

        for (ObjectName record : updatedRecords) {
            System.assertEquals('In Progress', record.Status__c,
                'Status should be In Progress');
            System.assertEquals('New', record.PreviousStatus__c,
                'Previous status should be tracked');
        }

        // Assert - Governor limits
        System.assert(Limits.getQueries() < 50,
            'Should use minimal queries. Used: ' + Limits.getQueries());
        System.assert(Limits.getDMLStatements() < 10,
            'Should use minimal DML. Used: ' + Limits.getDMLStatements());
    }

    /**
     * Test: Bulk update with cascading changes
     * Expected: Parent and children updated, limits not exceeded
     */
    @isTest
    static void testBulkUpdateWithCascade() {
        // Arrange
        List<ObjectName> parents = new List<ObjectName>();

        for (Integer i = 0; i < BULK_SIZE; i++) {
            parents.add(new ObjectName(
                Name = 'Cascade Parent ' + i,
                Status__c = 'New'
            ));
        }
        insert parents;

        // Create children
        List<ChildObject__c> children = new List<ChildObject__c>();
        for (ObjectName parent : parents) {
            for (Integer j = 0; j < 2; j++) {
                children.add(new ChildObject__c(
                    Name = 'Child ' + j,
                    ParentId__c = parent.Id,
                    Status__c = 'New'
                ));
            }
        }
        insert children;

        // Update parents
        for (ObjectName parent : parents) {
            parent.Status__c = 'Completed';
        }

        // Act
        Test.startTest();
        update parents;
        Test.stopTest();

        // Assert - Verify children cascaded
        List<ChildObject__c> updatedChildren = [
            SELECT Id, Status__c, ParentStatus__c
            FROM ChildObject__c
        ];

        Integer expectedChildren = BULK_SIZE * 2;
        System.assertEquals(expectedChildren, updatedChildren.size(),
            'All children should exist');

        for (ChildObject__c child : updatedChildren) {
            System.assertEquals('Completed', child.ParentStatus__c,
                'Child should reflect parent status');
        }

        // Assert - Governor limits (cascade requires queries + DML)
        System.assert(Limits.getQueries() < 20,
            'Should use minimal queries for cascade. Used: ' + Limits.getQueries());
        System.assert(Limits.getDMLStatements() < 15,
            'Should use minimal DML for cascade. Used: ' + Limits.getDMLStatements());
    }

    /**
     * Test: Bulk update with rollup calculations
     * Expected: Aggregations calculated, limits not exceeded
     */
    @isTest
    static void testBulkUpdateWithRollup() {
        // Arrange
        List<ParentObject__c> parents = new List<ParentObject__c>();

        for (Integer i = 0; i < 50; i++) { // 50 parents
            parents.add(new ParentObject__c(
                Name = 'Rollup Parent ' + i
            ));
        }
        insert parents;

        // Create children (4 per parent = 200 total)
        List<ObjectName> children = new List<ObjectName>();
        for (ParentObject__c parent : parents) {
            for (Integer j = 0; j < 4; j++) {
                children.add(new ObjectName(
                    Name = 'Rollup Child ' + j,
                    ParentId__c = parent.Id,
                    Amount__c = 1000 + j,
                    Status__c = 'New'
                ));
            }
        }
        insert children;

        // Update all children
        for (ObjectName child : children) {
            child.Status__c = 'Completed';
        }

        // Act
        Test.startTest();
        update children;
        Test.stopTest();

        // Assert - Verify rollups calculated
        List<ParentObject__c> updatedParents = [
            SELECT Id, TotalAmount__c, CompletedCount__c, TotalCount__c
            FROM ParentObject__c
            WHERE Name LIKE 'Rollup Parent%'
        ];

        System.assertEquals(50, updatedParents.size(),
            'All parents should be queried');

        for (ParentObject__c parent : updatedParents) {
            System.assertEquals(4, parent.TotalCount__c,
                'Should have 4 children');
            System.assertEquals(4, parent.CompletedCount__c,
                'All 4 children completed');
            System.assertEquals(4000 + 6, parent.TotalAmount__c,
                'Total should be sum of children');
        }

        // Assert - Rollup should use aggregation query
        System.assert(Limits.getQueries() < 25,
            'Rollup should use aggregation. Queries: ' + Limits.getQueries());
    }

    // ========================================================================
    // BULK DELETE TESTS
    // ========================================================================

    /**
     * Test: Bulk delete 200 records
     * Expected: All deleted, audit trail created, limits OK
     */
    @isTest
    static void testBulkDelete200Records() {
        // Arrange
        List<ObjectName> records = new List<ObjectName>();

        for (Integer i = 0; i < BULK_SIZE; i++) {
            records.add(new ObjectName(
                Name = 'Bulk Delete Test ' + i,
                Status__c = 'New'
            ));
        }
        insert records;

        // Act
        Test.startTest();
        delete records;
        Test.stopTest();

        // Assert - Verify all deleted
        List<ObjectName> remainingRecords = [
            SELECT Id
            FROM ObjectName
            WHERE Name LIKE 'Bulk Delete Test%'
        ];

        System.assertEquals(0, remainingRecords.size(),
            'All records should be deleted');

        // Assert - Verify audit trail
        List<AuditTrail__c> auditRecords = [
            SELECT Id, Action__c
            FROM AuditTrail__c
            WHERE Action__c = 'DELETE'
        ];

        System.assertEquals(BULK_SIZE, auditRecords.size(),
            'Should create audit trail for all deletions');

        // Assert - Governor limits
        System.assert(Limits.getDMLRows() < 10000,
            'Should not exceed DML rows. Used: ' + Limits.getDMLRows());
    }

    /**
     * Test: Bulk delete with child cascade
     * Expected: Parents and children deleted
     */
    @isTest
    static void testBulkDeleteWithCascade() {
        // Arrange
        List<ObjectName> parents = new List<ObjectName>();

        for (Integer i = 0; i < BULK_SIZE; i++) {
            parents.add(new ObjectName(
                Name = 'Delete Cascade Parent ' + i,
                Status__c = 'New'
            ));
        }
        insert parents;

        // Create children
        List<ChildObject__c> children = new List<ChildObject__c>();
        for (ObjectName parent : parents) {
            children.add(new ChildObject__c(
                Name = 'Child',
                ParentId__c = parent.Id
            ));
        }
        insert children;

        // Act
        Test.startTest();
        delete parents;
        Test.stopTest();

        // Assert - Verify children also deleted
        Integer remainingChildren = [
            SELECT COUNT()
            FROM ChildObject__c
        ];

        System.assertEquals(0, remainingChildren,
            'All children should be deleted with parents');
    }

    // ========================================================================
    // BULK UNDELETE TESTS
    // ========================================================================

    /**
     * Test: Bulk undelete 200 records
     * Expected: All restored
     */
    @isTest
    static void testBulkUndelete200Records() {
        // Arrange
        List<ObjectName> records = new List<ObjectName>();

        for (Integer i = 0; i < BULK_SIZE; i++) {
            records.add(new ObjectName(
                Name = 'Undelete Test ' + i,
                Status__c = 'New'
            ));
        }
        insert records;
        delete records;

        // Act
        Test.startTest();
        undelete records;
        Test.stopTest();

        // Assert
        List<ObjectName> restoredRecords = [
            SELECT Id, IsDeleted, RestoredDate__c
            FROM ObjectName
            WHERE Name LIKE 'Undelete Test%'
        ];

        System.assertEquals(BULK_SIZE, restoredRecords.size(),
            'All records should be restored');

        for (ObjectName record : restoredRecords) {
            System.assertEquals(false, record.IsDeleted,
                'IsDeleted should be false');
            System.assertNotEquals(null, record.RestoredDate__c,
                'Restore date should be set');
        }
    }

    // ========================================================================
    // PERFORMANCE TESTS
    // ========================================================================

    /**
     * Test: Large bulk operation performance
     * Expected: Completes within CPU time limit
     */
    @isTest
    static void testLargeBulkPerformance() {
        // Arrange
        List<ObjectName> records = new List<ObjectName>();

        for (Integer i = 0; i < LARGE_BULK_SIZE; i++) {
            records.add(new ObjectName(
                Name = 'Performance Test ' + i,
                Status__c = 'New',
                Amount__c = 1000 + i
            ));
        }

        // Act
        Long startTime = System.currentTimeMillis();

        Test.startTest();
        insert records;
        Test.stopTest();

        Long endTime = System.currentTimeMillis();
        Long duration = endTime - startTime;

        // Assert
        System.assert(Limits.getCpuTime() < 10000,
            'Should complete within CPU limit. CPU: ' + Limits.getCpuTime() + 'ms');

        System.debug('Bulk insert of ' + LARGE_BULK_SIZE +
                    ' records took ' + duration + 'ms' +
                    ' (CPU: ' + Limits.getCpuTime() + 'ms)');
    }

    /**
     * Test: Memory usage with large data
     * Expected: Stays within heap size limit
     */
    @isTest
    static void testBulkMemoryUsage() {
        // Arrange
        List<ObjectName> records = new List<ObjectName>();

        for (Integer i = 0; i < LARGE_BULK_SIZE; i++) {
            records.add(new ObjectName(
                Name = 'Memory Test ' + i,
                Status__c = 'New',
                LargeTextField__c = 'Large text content '.repeat(100)
            ));
        }

        // Act
        Test.startTest();
        insert records;

        // Query back with large fields
        List<ObjectName> queriedRecords = [
            SELECT Id, Name, LargeTextField__c
            FROM ObjectName
            WHERE Name LIKE 'Memory Test%'
        ];
        Test.stopTest();

        // Assert
        Integer heapUsed = Limits.getHeapSize();
        Integer heapLimit = Limits.getLimitHeapSize();

        System.assert(heapUsed < heapLimit,
            'Should stay within heap limit. Used: ' + heapUsed +
            ' / ' + heapLimit + ' bytes');
    }

    // ========================================================================
    // GOVERNOR LIMIT VERIFICATION
    // ========================================================================

    /**
     * Test: Verify all governor limits in bulk scenario
     * Expected: All limits respected
     */
    @isTest
    static void testAllGovernorLimits() {
        // Arrange
        List<ObjectName> records = new List<ObjectName>();

        for (Integer i = 0; i < BULK_SIZE; i++) {
            records.add(new ObjectName(
                Name = 'Limits Test ' + i,
                Status__c = 'New',
                Amount__c = 1000 + i
            ));
        }

        // Act
        Test.startTest();
        insert records;

        // Update all
        for (ObjectName record : records) {
            record.Status__c = 'In Progress';
        }
        update records;
        Test.stopTest();

        // Assert - All limits
        System.debug('=== Governor Limits Report ===');
        System.debug('SOQL Queries: ' + Limits.getQueries() + ' / ' + Limits.getLimitQueries());
        System.debug('DML Statements: ' + Limits.getDMLStatements() + ' / ' + Limits.getLimitDMLStatements());
        System.debug('DML Rows: ' + Limits.getDMLRows() + ' / ' + Limits.getLimitDMLRows());
        System.debug('CPU Time: ' + Limits.getCpuTime() + ' / ' + Limits.getLimitCpuTime());
        System.debug('Heap Size: ' + Limits.getHeapSize() + ' / ' + Limits.getLimitHeapSize());

        // Verify all within limits
        System.assert(Limits.getQueries() < Limits.getLimitQueries(),
            'SOQL queries within limit');
        System.assert(Limits.getDMLStatements() < Limits.getLimitDMLStatements(),
            'DML statements within limit');
        System.assert(Limits.getDMLRows() < Limits.getLimitDMLRows(),
            'DML rows within limit');
        System.assert(Limits.getCpuTime() < Limits.getLimitCpuTime(),
            'CPU time within limit');
        System.assert(Limits.getHeapSize() < Limits.getLimitHeapSize(),
            'Heap size within limit');
    }
}

/**
 * BULK TESTING BEST PRACTICES:
 *
 * 1. Test Volume:
 *    - Always test with 200+ records (Salesforce best practice)
 *    - Test up to 500+ records for critical operations
 *    - Test with 10,000 records for batch operations
 *
 * 2. Performance:
 *    - Monitor CPU time (10,000ms limit)
 *    - Monitor heap size (6MB limit)
 *    - Test with large text fields
 *    - Profile query performance
 *
 * 3. Governor Limits:
 *    - Verify SOQL queries < 100
 *    - Verify DML statements < 150
 *    - Verify DML rows < 10,000
 *    - Print limits report in test output
 *
 * 4. Data Isolation:
 *    - Each test should create own data
 *    - Clean naming (easy to query/identify)
 *    - Use Test.startTest/stopTest for governor reset
 *
 * 5. Assertions:
 *    - Verify ALL records processed
 *    - Check governor limits usage
 *    - Validate data integrity
 *    - Test cascading effects
 */
