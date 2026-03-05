/**
 * BASIC TEST CLASS TEMPLATE
 *
 * Purpose: Foundation template for testing triggers with comprehensive coverage
 * Use Case: Test trigger functionality with:
 *   - Single record operations (INSERT, UPDATE, DELETE, UNDELETE)
 *   - Test data setup and isolation
 *   - Positive and negative test scenarios
 *   - Assertions for expected behavior
 *   - Governor limit verification
 *
 * Pattern: @testSetup for reusable data, Test.startTest/stopTest for limits
 *
 * Test Coverage Goals:
 *   - Minimum 75% code coverage (Salesforce requirement)
 *   - Target 90%+ coverage for production quality
 *   - Test all trigger contexts (before/after, insert/update/delete)
 *   - Test business logic branches
 *   - Test error handling
 *
 * Best Practices:
 *   - Use @testSetup for shared test data
 *   - One assertion per test method (when possible)
 *   - Clear test method names (testWhatYouAreTesting)
 *   - Test positive and negative scenarios
 *   - Verify governor limits not exceeded
 *   - Use System.assert with descriptive messages
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with your actual object API name
 * [ ] Update test data to match your object fields
 * [ ] Add tests for all trigger logic branches
 * [ ] Test required field validations
 * [ ] Test picklist value validations
 * [ ] Verify formula fields calculate correctly
 * [ ] Test record type specific logic
 * [ ] Verify sharing rules work correctly
 */

@isTest
private class ObjectNameTriggerHandlerTest {

    // ========================================================================
    // TEST SETUP (Runs once per test class)
    // ========================================================================

    @testSetup
    static void setup() {
        // Create test data that can be reused across all test methods

        // Create test users (if needed)
        Profile standardProfile = [
            SELECT Id
            FROM Profile
            WHERE Name = 'Standard User'
            LIMIT 1
        ];

        User testUser = new User(
            FirstName = 'Test',
            LastName = 'User',
            Email = 'testuser@example.com',
            Username = 'testuser@example.com.test',
            Alias = 'tuser',
            ProfileId = standardProfile.Id,
            TimeZoneSidKey = 'America/Los_Angeles',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US'
        );
        insert testUser;

        // Create parent records (if needed)
        Account testAccount = new Account(
            Name = 'Test Account',
            Type = 'Customer',
            Industry = 'Technology'
        );
        insert testAccount;

        // Create test records
        List<ObjectName> testRecords = new List<ObjectName>();
        for (Integer i = 0; i < 5; i++) {
            testRecords.add(new ObjectName(
                Name = 'Test Record ' + i,
                Status__c = 'New',
                Amount__c = 10000 + (i * 1000),
                Priority__c = 'Medium',
                OwnerId = testUser.Id,
                AccountId__c = testAccount.Id
            ));
        }
        insert testRecords;

        // Create related records (if needed)
        List<RelatedObject__c> relatedRecords = new List<RelatedObject__c>();
        for (ObjectName record : testRecords) {
            relatedRecords.add(new RelatedObject__c(
                Name = 'Related to ' + record.Name,
                ParentId__c = record.Id
            ));
        }
        insert relatedRecords;
    }

    // ========================================================================
    // INSERT TESTS
    // ========================================================================

    /**
     * Test: Insert single record
     * Expected: Trigger fires and processes record correctly
     */
    @isTest
    static void testSingleInsert() {
        // Arrange
        ObjectName record = new ObjectName(
            Name = 'Single Insert Test',
            Status__c = 'New',
            Amount__c = 5000,
            Priority__c = 'High'
        );

        // Act
        Test.startTest();
        insert record;
        Test.stopTest();

        // Assert
        ObjectName insertedRecord = [
            SELECT Id, Name, Status__c, Amount__c, CreatedDate,
                   AutoNumberField__c, CalculatedField__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertNotEquals(null, insertedRecord.Id,
            'Record should be inserted');
        System.assertEquals('Single Insert Test', insertedRecord.Name,
            'Name should match');
        System.assertEquals('New', insertedRecord.Status__c,
            'Status should be New');

        // Verify trigger logic executed
        System.assertNotEquals(null, insertedRecord.AutoNumberField__c,
            'Auto number should be assigned');
        System.assertNotEquals(null, insertedRecord.CalculatedField__c,
            'Calculated field should be populated');
    }

    /**
     * Test: Insert with default values
     * Expected: Trigger populates default fields
     */
    @isTest
    static void testInsertWithDefaults() {
        // Arrange
        ObjectName record = new ObjectName(
            Name = 'Defaults Test',
            Amount__c = 1000
            // Status__c not provided - should default
        );

        // Act
        Test.startTest();
        insert record;
        Test.stopTest();

        // Assert
        ObjectName insertedRecord = [
            SELECT Id, Status__c, Priority__c, Category__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals('New', insertedRecord.Status__c,
            'Status should default to New');
        System.assertEquals('Medium', insertedRecord.Priority__c,
            'Priority should default to Medium');
        System.assertNotEquals(null, insertedRecord.Category__c,
            'Category should be defaulted');
    }

    /**
     * Test: Insert with validation error
     * Expected: Validation prevents insert
     */
    @isTest
    static void testInsertValidationError() {
        // Arrange
        ObjectName record = new ObjectName(
            Name = 'Validation Test',
            Amount__c = -1000 // Invalid - negative amount
        );

        // Act & Assert
        Test.startTest();
        try {
            insert record;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('Amount'),
                'Error should mention Amount field');
        }
        Test.stopTest();
    }

    // ========================================================================
    // UPDATE TESTS
    // ========================================================================

    /**
     * Test: Update single record
     * Expected: Trigger processes update correctly
     */
    @isTest
    static void testSingleUpdate() {
        // Arrange
        ObjectName record = [
            SELECT Id, Status__c, Amount__c
            FROM ObjectName
            WHERE Name = 'Test Record 0'
            LIMIT 1
        ];

        // Act
        Test.startTest();
        record.Status__c = 'In Progress';
        record.Amount__c = 20000;
        update record;
        Test.stopTest();

        // Assert
        ObjectName updatedRecord = [
            SELECT Id, Status__c, Amount__c, LastModifiedDate,
                   StatusChangedDate__c, PreviousStatus__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals('In Progress', updatedRecord.Status__c,
            'Status should be updated');
        System.assertEquals(20000, updatedRecord.Amount__c,
            'Amount should be updated');

        // Verify trigger logic executed
        System.assertNotEquals(null, updatedRecord.StatusChangedDate__c,
            'Status change date should be set');
        System.assertEquals('New', updatedRecord.PreviousStatus__c,
            'Previous status should be tracked');
    }

    /**
     * Test: Update with field validation
     * Expected: Validation prevents invalid update
     */
    @isTest
    static void testUpdateValidation() {
        // Arrange
        ObjectName record = [
            SELECT Id, Status__c, RequiredField__c
            FROM ObjectName
            WHERE Name = 'Test Record 0'
            LIMIT 1
        ];

        // Act & Assert
        Test.startTest();
        try {
            record.Status__c = 'Completed';
            record.RequiredField__c = null; // Required for Completed status
            update record;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('Required'),
                'Error should mention required field');
        }
        Test.stopTest();
    }

    /**
     * Test: Update trigger cascades to children
     * Expected: Child records updated
     */
    @isTest
    static void testUpdateCascade() {
        // Arrange
        ObjectName record = [
            SELECT Id, Status__c
            FROM ObjectName
            WHERE Name = 'Test Record 0'
            LIMIT 1
        ];

        // Act
        Test.startTest();
        record.Status__c = 'Completed';
        update record;
        Test.stopTest();

        // Assert - verify cascade to children
        List<RelatedObject__c> children = [
            SELECT Id, Status__c, ParentStatus__c
            FROM RelatedObject__c
            WHERE ParentId__c = :record.Id
        ];

        System.assertEquals(1, children.size(), 'Should have child record');
        System.assertEquals('Completed', children[0].ParentStatus__c,
            'Child should reflect parent status');
    }

    // ========================================================================
    // DELETE TESTS
    // ========================================================================

    /**
     * Test: Delete single record
     * Expected: Record deleted successfully
     */
    @isTest
    static void testSingleDelete() {
        // Arrange
        ObjectName record = [
            SELECT Id
            FROM ObjectName
            WHERE Name = 'Test Record 0'
            LIMIT 1
        ];
        Id recordId = record.Id;

        // Act
        Test.startTest();
        delete record;
        Test.stopTest();

        // Assert
        List<ObjectName> deletedRecords = [
            SELECT Id
            FROM ObjectName
            WHERE Id = :recordId
        ];

        System.assertEquals(0, deletedRecords.size(),
            'Record should be deleted');

        // Verify audit trail created
        List<AuditTrail__c> auditRecords = [
            SELECT Id, Action__c, RecordId__c
            FROM AuditTrail__c
            WHERE RecordId__c = :recordId
              AND Action__c = 'DELETE'
        ];

        System.assertEquals(1, auditRecords.size(),
            'Delete should be audited');
    }

    /**
     * Test: Delete with cascading effect
     * Expected: Related records also deleted
     */
    @isTest
    static void testDeleteCascade() {
        // Arrange
        ObjectName record = [
            SELECT Id
            FROM ObjectName
            WHERE Name = 'Test Record 0'
            LIMIT 1
        ];
        Id recordId = record.Id;

        // Get child count before delete
        Integer childCountBefore = [
            SELECT COUNT()
            FROM RelatedObject__c
            WHERE ParentId__c = :recordId
        ];

        System.assert(childCountBefore > 0, 'Should have children');

        // Act
        Test.startTest();
        delete record;
        Test.stopTest();

        // Assert - verify children deleted
        Integer childCountAfter = [
            SELECT COUNT()
            FROM RelatedObject__c
            WHERE ParentId__c = :recordId
        ];

        System.assertEquals(0, childCountAfter,
            'Children should be deleted');
    }

    // ========================================================================
    // UNDELETE TESTS
    // ========================================================================

    /**
     * Test: Undelete record
     * Expected: Record restored successfully
     */
    @isTest
    static void testUndelete() {
        // Arrange
        ObjectName record = [
            SELECT Id, Name
            FROM ObjectName
            WHERE Name = 'Test Record 0'
            LIMIT 1
        ];
        Id recordId = record.Id;

        delete record;

        // Act
        Test.startTest();
        undelete record;
        Test.stopTest();

        // Assert
        ObjectName restoredRecord = [
            SELECT Id, Name, IsDeleted, RestoredDate__c
            FROM ObjectName
            WHERE Id = :recordId
        ];

        System.assertEquals('Test Record 0', restoredRecord.Name,
            'Record should be restored');
        System.assertEquals(false, restoredRecord.IsDeleted,
            'IsDeleted should be false');
        System.assertNotEquals(null, restoredRecord.RestoredDate__c,
            'Restored date should be set');
    }

    // ========================================================================
    // CONDITIONAL LOGIC TESTS
    // ========================================================================

    /**
     * Test: Record type specific logic
     * Expected: Different behavior for different record types
     */
    @isTest
    static void testRecordTypeLogic() {
        // Arrange
        Id customerRecordType = Schema.SObjectType.ObjectName
            .getRecordTypeInfosByDeveloperName()
            .get('Customer')
            .getRecordTypeId();

        ObjectName record = new ObjectName(
            Name = 'Record Type Test',
            RecordTypeId = customerRecordType,
            Amount__c = 5000
        );

        // Act
        Test.startTest();
        insert record;
        Test.stopTest();

        // Assert - verify record type specific logic
        ObjectName insertedRecord = [
            SELECT Id, CustomerSpecificField__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertNotEquals(null, insertedRecord.CustomerSpecificField__c,
            'Customer-specific field should be populated');
    }

    /**
     * Test: Conditional field updates
     * Expected: Fields updated based on conditions
     */
    @isTest
    static void testConditionalUpdate() {
        // Arrange
        ObjectName record = [
            SELECT Id, Amount__c, Tier__c
            FROM ObjectName
            WHERE Name = 'Test Record 0'
            LIMIT 1
        ];

        // Act - High value amount
        Test.startTest();
        record.Amount__c = 100000;
        update record;
        Test.stopTest();

        // Assert
        ObjectName updatedRecord = [
            SELECT Id, Tier__c, HighValueFlag__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals('Enterprise', updatedRecord.Tier__c,
            'Tier should be Enterprise for high amount');
        System.assertEquals(true, updatedRecord.HighValueFlag__c,
            'High value flag should be set');
    }

    // ========================================================================
    // GOVERNOR LIMITS TESTS
    // ========================================================================

    /**
     * Test: SOQL query limits
     * Expected: Queries stay within limits (100 per transaction)
     */
    @isTest
    static void testSOQLLimits() {
        // Arrange
        List<ObjectName> records = [
            SELECT Id
            FROM ObjectName
            LIMIT 5
        ];

        Integer queriesBefore = Limits.getQueries();

        // Act
        Test.startTest();
        for (ObjectName record : records) {
            record.Amount__c += 1000;
        }
        update records;
        Test.stopTest();

        // Assert
        Integer queriesUsed = Limits.getQueries() - queriesBefore;
        System.assert(queriesUsed < 10,
            'Should use fewer than 10 queries. Used: ' + queriesUsed);
    }

    /**
     * Test: DML statement limits
     * Expected: DML operations stay within limits (150 per transaction)
     */
    @isTest
    static void testDMLLimits() {
        // Arrange
        List<ObjectName> records = [
            SELECT Id
            FROM ObjectName
            LIMIT 5
        ];

        Integer dmlBefore = Limits.getDMLStatements();

        // Act
        Test.startTest();
        for (ObjectName record : records) {
            record.Amount__c += 1000;
        }
        update records;
        Test.stopTest();

        // Assert
        Integer dmlUsed = Limits.getDMLStatements() - dmlBefore;
        System.assert(dmlUsed < 5,
            'Should use fewer than 5 DML statements. Used: ' + dmlUsed);
    }

    // ========================================================================
    // ERROR HANDLING TESTS
    // ========================================================================

    /**
     * Test: Null pointer handling
     * Expected: Graceful handling of null values
     */
    @isTest
    static void testNullHandling() {
        // Arrange
        ObjectName record = new ObjectName(
            Name = 'Null Test',
            Amount__c = null, // Null value
            Status__c = 'New'
        );

        // Act
        Test.startTest();
        insert record;
        Test.stopTest();

        // Assert - no exceptions thrown
        ObjectName insertedRecord = [
            SELECT Id, Amount__c, CalculatedField__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals(null, insertedRecord.Amount__c,
            'Amount can be null');
        // Verify calculated field handles null gracefully
        System.assertNotEquals(null, insertedRecord.CalculatedField__c,
            'Calculated field should handle null');
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    /**
     * Helper: Create test record with defaults
     */
    private static ObjectName createTestRecord(String name) {
        return new ObjectName(
            Name = name,
            Status__c = 'New',
            Amount__c = 10000,
            Priority__c = 'Medium'
        );
    }

    /**
     * Helper: Assert record state
     */
    private static void assertRecordState(Id recordId, String expectedStatus) {
        ObjectName record = [
            SELECT Id, Status__c
            FROM ObjectName
            WHERE Id = :recordId
        ];

        System.assertEquals(expectedStatus, record.Status__c,
            'Status should be ' + expectedStatus);
    }
}

/**
 * TEST COVERAGE REPORT:
 *
 * To check code coverage after running tests:
 * 1. Developer Console: Tests → Always Run Asynchronously (uncheck)
 * 2. Run All Tests
 * 3. View → Code Coverage
 * 4. Find ObjectNameTriggerHandler
 * 5. Verify coverage >= 75% (target 90%+)
 *
 * RUNNING TESTS:
 *
 * Via Developer Console:
 * - Test → New Run → Select Class → Run
 *
 * Via CLI:
 * - sf apex test run --class-names ObjectNameTriggerHandlerTest --wait 10
 * - sf apex get test --test-run-id <id> --code-coverage
 *
 * Via VS Code:
 * - Right-click test class → SF: Run Apex Tests
 */
