/**
 * RECURSION TEST CLASS TEMPLATE
 *
 * Purpose: Test recursion prevention mechanisms in triggers
 * Use Case: Verify triggers don't cause infinite loops when:
 *   - Trigger updates same record (cascades back to itself)
 *   - Parent update triggers child update which triggers parent
 *   - Multiple triggers fire in sequence
 *   - Field changes cause recursive updates
 *   - Approval processes trigger additional updates
 *
 * Pattern: Test recursion prevention with static flags and processed ID sets
 *
 * Recursion Scenarios:
 *   - Self-recursion (record updates itself)
 *   - Parent-child recursion (bidirectional cascade)
 *   - Cross-object recursion (A→B→A)
 *   - Multi-level recursion (A→B→C→A)
 *   - Workflow-triggered recursion
 *
 * Prevention Mechanisms:
 *   - Static boolean flag (isExecuting)
 *   - Static Set of processed IDs
 *   - Context variable checking (Trigger.isExecuting)
 *   - Conditional logic (only process if field changed)
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with your actual object API name
 * [ ] Test all recursion scenarios in your trigger
 * [ ] Verify static flags reset between test methods
 * [ ] Test recursion with workflow rules
 * [ ] Test recursion with process builder
 * [ ] Verify bidirectional updates work correctly
 * [ ] Test multi-level object hierarchies
 */

@isTest
private class ObjectNameRecursionTest {

    // ========================================================================
    // TEST SETUP
    // ========================================================================

    @testSetup
    static void setup() {
        // Create minimal test data
        Account testAccount = new Account(
            Name = 'Recursion Test Account'
        );
        insert testAccount;
    }

    // ========================================================================
    // SELF-RECURSION TESTS
    // ========================================================================

    /**
     * Test: Record updates itself in trigger
     * Expected: Recursion prevented, single update only
     */
    @isTest
    static void testSelfRecursionPrevention() {
        // Arrange
        ObjectName record = new ObjectName(
            Name = 'Self Recursion Test',
            Status__c = 'New',
            Amount__c = 1000,
            UpdatesSelf__c = true // Flag that causes self-update in trigger
        );
        insert record;

        // Track updates
        Integer updateCountBefore = [
            SELECT COUNT()
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        // Act
        Test.startTest();
        record.Amount__c = 2000;
        update record;
        Test.stopTest();

        // Assert - Record updated only once
        ObjectName updatedRecord = [
            SELECT Id, Amount__c, UpdateCount__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals(2000, updatedRecord.Amount__c,
            'Amount should be updated');
        System.assertEquals(1, updatedRecord.UpdateCount__c,
            'Should update only once, not recursively');

        // Verify no infinite loop
        System.assert(Limits.getDMLStatements() < 10,
            'Should not exceed DML limit from recursion');
    }

    /**
     * Test: Multiple sequential updates
     * Expected: Each update processed once, no recursion
     */
    @isTest
    static void testSequentialUpdatesNoRecursion() {
        // Arrange
        ObjectName record = new ObjectName(
            Name = 'Sequential Test',
            Status__c = 'New',
            Amount__c = 1000
        );
        insert record;

        // Act - Multiple updates in sequence
        Test.startTest();

        record.Status__c = 'In Progress';
        update record;

        record.Amount__c = 2000;
        update record;

        record.Status__c = 'Completed';
        update record;

        Test.stopTest();

        // Assert
        ObjectName finalRecord = [
            SELECT Id, Status__c, Amount__c, TotalUpdates__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals('Completed', finalRecord.Status__c,
            'Final status correct');
        System.assertEquals(2000, finalRecord.Amount__c,
            'Final amount correct');
        System.assertEquals(3, finalRecord.TotalUpdates__c,
            'Should count 3 updates');
    }

    // ========================================================================
    // PARENT-CHILD RECURSION TESTS
    // ========================================================================

    /**
     * Test: Parent updates child, child updates parent
     * Expected: Recursion prevented after first cycle
     */
    @isTest
    static void testParentChildRecursionPrevention() {
        // Arrange
        ObjectName parent = new ObjectName(
            Name = 'Parent Record',
            Status__c = 'New',
            CascadeToChildren__c = true
        );
        insert parent;

        ChildObject__c child = new ChildObject__c(
            Name = 'Child Record',
            ParentId__c = parent.Id,
            Status__c = 'New',
            UpdateParentOnChange__c = true
        );
        insert child;

        // Act - Update parent (should cascade to child)
        Test.startTest();
        parent.Status__c = 'In Progress';
        update parent;
        Test.stopTest();

        // Assert - Both updated once, no infinite loop
        ObjectName updatedParent = [
            SELECT Id, Status__c, ChildUpdateCount__c
            FROM ObjectName
            WHERE Id = :parent.Id
        ];

        ChildObject__c updatedChild = [
            SELECT Id, Status__c, ParentStatus__c
            FROM ChildObject__c
            WHERE Id = :child.Id
        ];

        System.assertEquals('In Progress', updatedParent.Status__c,
            'Parent status updated');
        System.assertEquals('In Progress', updatedChild.ParentStatus__c,
            'Child reflects parent status');
        System.assertEquals(1, updatedParent.ChildUpdateCount__c,
            'Should cascade once only');

        // Verify no recursion
        System.assert(Limits.getDMLStatements() < 15,
            'Should not cause excessive DML from recursion');
    }

    /**
     * Test: Bidirectional updates with multiple children
     * Expected: All children updated, no recursion
     */
    @isTest
    static void testBidirectionalUpdateMultipleChildren() {
        // Arrange
        ObjectName parent = new ObjectName(
            Name = 'Multi-Child Parent',
            Status__c = 'New'
        );
        insert parent;

        List<ChildObject__c> children = new List<ChildObject__c>();
        for (Integer i = 0; i < 5; i++) {
            children.add(new ChildObject__c(
                Name = 'Child ' + i,
                ParentId__c = parent.Id,
                Status__c = 'New',
                UpdateParentOnChange__c = true
            ));
        }
        insert children;

        // Act - Update parent
        Test.startTest();
        parent.Status__c = 'Completed';
        update parent;
        Test.stopTest();

        // Assert - All children updated
        List<ChildObject__c> updatedChildren = [
            SELECT Id, ParentStatus__c
            FROM ChildObject__c
            WHERE ParentId__c = :parent.Id
        ];

        System.assertEquals(5, updatedChildren.size(),
            'Should have 5 children');

        for (ChildObject__c child : updatedChildren) {
            System.assertEquals('Completed', child.ParentStatus__c,
                'All children should reflect parent status');
        }

        // Assert - Parent not recursively updated by children
        ObjectName updatedParent = [
            SELECT Id, RecursionCount__c
            FROM ObjectName
            WHERE Id = :parent.Id
        ];

        System.assert(updatedParent.RecursionCount__c <= 1,
            'Parent should not be recursively updated');
    }

    // ========================================================================
    // CROSS-OBJECT RECURSION TESTS
    // ========================================================================

    /**
     * Test: A→B→A cross-object recursion
     * Expected: Recursion prevented after first cycle
     */
    @isTest
    static void testCrossObjectRecursionPrevention() {
        // Arrange
        ObjectA__c recordA = new ObjectA__c(
            Name = 'Record A',
            Status__c = 'New'
        );
        insert recordA;

        ObjectB__c recordB = new ObjectB__c(
            Name = 'Record B',
            RelatedA__c = recordA.Id,
            Status__c = 'New'
        );
        insert recordB;

        // Link back (A→B→A)
        recordA.RelatedB__c = recordB.Id;
        update recordA;

        // Act - Update A (should cascade to B, B should NOT cascade back)
        Test.startTest();
        recordA.Status__c = 'In Progress';
        update recordA;
        Test.stopTest();

        // Assert
        ObjectA__c updatedA = [
            SELECT Id, Status__c, UpdateCount__c
            FROM ObjectA__c
            WHERE Id = :recordA.Id
        ];

        ObjectB__c updatedB = [
            SELECT Id, RelatedAStatus__c
            FROM ObjectB__c
            WHERE Id = :recordB.Id
        ];

        System.assertEquals('In Progress', updatedA.Status__c,
            'A status updated');
        System.assertEquals('In Progress', updatedB.RelatedAStatus__c,
            'B reflects A status');
        System.assertEquals(1, updatedA.UpdateCount__c,
            'A should update once only');
    }

    // ========================================================================
    // MULTI-LEVEL RECURSION TESTS
    // ========================================================================

    /**
     * Test: Three-level recursion A→B→C→A
     * Expected: Recursion prevented
     */
    @isTest
    static void testThreeLevelRecursionPrevention() {
        // Arrange
        ObjectA__c recordA = new ObjectA__c(Name = 'Level A');
        insert recordA;

        ObjectB__c recordB = new ObjectB__c(
            Name = 'Level B',
            RelatedA__c = recordA.Id
        );
        insert recordB;

        ObjectC__c recordC = new ObjectC__c(
            Name = 'Level C',
            RelatedB__c = recordB.Id
        );
        insert recordC;

        // Link back (A→B→C→A)
        recordA.RelatedC__c = recordC.Id;
        update recordA;

        // Act - Update A
        Test.startTest();
        recordA.Value__c = 100;
        update recordA;
        Test.stopTest();

        // Assert - Values cascaded through chain
        ObjectB__c updatedB = [
            SELECT Id, ValueFromA__c
            FROM ObjectB__c
            WHERE Id = :recordB.Id
        ];

        ObjectC__c updatedC = [
            SELECT Id, ValueFromB__c
            FROM ObjectC__c
            WHERE Id = :recordC.Id
        ];

        ObjectA__c updatedA = [
            SELECT Id, Value__c, RecursionCount__c
            FROM ObjectA__c
            WHERE Id = :recordA.Id
        ];

        System.assertEquals(100, updatedB.ValueFromA__c,
            'B should have value from A');
        System.assertEquals(100, updatedC.ValueFromB__c,
            'C should have value from B');
        System.assert(updatedA.RecursionCount__c <= 1,
            'A should not recurse');
    }

    // ========================================================================
    // FIELD-BASED RECURSION TESTS
    // ========================================================================

    /**
     * Test: Field change causes recursive update
     * Expected: Only processes if field actually changed
     */
    @isTest
    static void testFieldChangeRecursionPrevention() {
        // Arrange
        ObjectName record = new ObjectName(
            Name = 'Field Change Test',
            Amount__c = 1000,
            CalculateDiscount__c = true
        );
        insert record;

        // Act - Update amount (trigger recalculates discount)
        Test.startTest();
        record.Amount__c = 2000;
        update record;
        Test.stopTest();

        // Assert
        ObjectName updatedRecord = [
            SELECT Id, Amount__c, Discount__c, CalculationCount__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals(2000, updatedRecord.Amount__c,
            'Amount updated');
        System.assertNotEquals(null, updatedRecord.Discount__c,
            'Discount calculated');
        System.assertEquals(1, updatedRecord.CalculationCount__c,
            'Should calculate once only');
    }

    /**
     * Test: Conditional recursion based on flag
     * Expected: Recursion occurs when flag enabled
     */
    @isTest
    static void testConditionalRecursion() {
        // Arrange
        ObjectName record = new ObjectName(
            Name = 'Conditional Test',
            Status__c = 'New',
            AllowRecursion__c = false // Recursion disabled
        );
        insert record;

        // Act - Update with recursion disabled
        Test.startTest();
        record.Status__c = 'In Progress';
        update record;

        // Enable recursion
        record.AllowRecursion__c = true;
        record.Status__c = 'Completed';
        update record;
        Test.stopTest();

        // Assert
        ObjectName updatedRecord = [
            SELECT Id, Status__c, RecursiveUpdateCount__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals('Completed', updatedRecord.Status__c,
            'Status updated');
        System.assert(updatedRecord.RecursiveUpdateCount__c >= 0,
            'Recursive updates controlled by flag');
    }

    // ========================================================================
    // WORKFLOW/PROCESS BUILDER RECURSION TESTS
    // ========================================================================

    /**
     * Test: Trigger + Workflow recursion
     * Expected: Both execute without infinite loop
     */
    @isTest
    static void testTriggerWorkflowRecursion() {
        // Arrange
        ObjectName record = new ObjectName(
            Name = 'Workflow Test',
            Status__c = 'New',
            TriggerWorkflow__c = true
        );

        // Act
        Test.startTest();
        insert record;
        Test.stopTest();

        // Assert - Both trigger and workflow executed
        ObjectName insertedRecord = [
            SELECT Id, TriggerExecuted__c, WorkflowExecuted__c,
                   TotalExecutions__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals(true, insertedRecord.TriggerExecuted__c,
            'Trigger should execute');
        // Note: Workflow execution depends on org configuration
        System.assert(insertedRecord.TotalExecutions__c <= 2,
            'Should not execute excessively');
    }

    // ========================================================================
    // STATIC FLAG VERIFICATION TESTS
    // ========================================================================

    /**
     * Test: Static flag resets between test methods
     * Expected: Each test starts with fresh state
     */
    @isTest
    static void testStaticFlagReset() {
        // Arrange
        ObjectName record1 = new ObjectName(
            Name = 'Flag Reset Test 1',
            Status__c = 'New'
        );
        insert record1;

        // Act - First update
        record1.Status__c = 'In Progress';
        update record1;

        // Create second record (static flag should be reset)
        ObjectName record2 = new ObjectName(
            Name = 'Flag Reset Test 2',
            Status__c = 'New'
        );
        insert record2;

        // Second update
        Test.startTest();
        record2.Status__c = 'In Progress';
        update record2;
        Test.stopTest();

        // Assert - Both records processed normally
        List<ObjectName> records = [
            SELECT Id, Status__c
            FROM ObjectName
            WHERE Name LIKE 'Flag Reset Test%'
        ];

        System.assertEquals(2, records.size(), 'Should have 2 records');

        for (ObjectName record : records) {
            System.assertEquals('In Progress', record.Status__c,
                'Both should be processed normally');
        }
    }

    /**
     * Test: Processed IDs set clears between transactions
     * Expected: Same record can be updated in multiple transactions
     */
    @isTest
    static void testProcessedIDsClear() {
        // Arrange
        ObjectName record = new ObjectName(
            Name = 'Processed IDs Test',
            Status__c = 'New'
        );
        insert record;

        // Act - First update
        Test.startTest();
        record.Status__c = 'In Progress';
        update record;
        Test.stopTest();

        // Second update (new transaction)
        Test.startTest();
        record.Status__c = 'Completed';
        update record;
        Test.stopTest();

        // Assert
        ObjectName updatedRecord = [
            SELECT Id, Status__c, TotalTransactions__c
            FROM ObjectName
            WHERE Id = :record.Id
        ];

        System.assertEquals('Completed', updatedRecord.Status__c,
            'Should process both updates');
        System.assertEquals(2, updatedRecord.TotalTransactions__c,
            'Should count 2 transactions');
    }

    // ========================================================================
    // BULK RECURSION TESTS
    // ========================================================================

    /**
     * Test: Bulk update doesn't cause recursion
     * Expected: All records processed once
     */
    @isTest
    static void testBulkRecursionPrevention() {
        // Arrange
        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ObjectName(
                Name = 'Bulk Recursion Test ' + i,
                Status__c = 'New',
                CascadeOnUpdate__c = true
            ));
        }
        insert records;

        // Act - Bulk update
        Test.startTest();
        for (ObjectName record : records) {
            record.Status__c = 'In Progress';
        }
        update records;
        Test.stopTest();

        // Assert
        List<ObjectName> updatedRecords = [
            SELECT Id, Status__c, UpdateCount__c
            FROM ObjectName
            WHERE Name LIKE 'Bulk Recursion Test%'
        ];

        System.assertEquals(200, updatedRecords.size(),
            'All records updated');

        for (ObjectName record : updatedRecords) {
            System.assertEquals('In Progress', record.Status__c,
                'Status updated correctly');
            System.assertEquals(1, record.UpdateCount__c,
                'Should update once only');
        }

        // Verify no excessive DML from recursion
        System.assert(Limits.getDMLStatements() < 20,
            'Should not cause excessive DML. Used: ' + Limits.getDMLStatements());
    }
}

/**
 * RECURSION PREVENTION PATTERNS:
 *
 * 1. Static Boolean Flag:
 *    private static Boolean isExecuting = false;
 *    if (isExecuting) return;
 *    isExecuting = true;
 *    try { ... } finally { isExecuting = false; }
 *
 * 2. Static Set of Processed IDs:
 *    private static Set<Id> processedIds = new Set<Id>();
 *    if (processedIds.contains(record.Id)) continue;
 *    processedIds.add(record.Id);
 *
 * 3. Conditional Processing:
 *    if (newRecord.Field__c != oldRecord.Field__c) {
 *        // Only process if field actually changed
 *    }
 *
 * 4. Context Variables:
 *    if (Trigger.isExecuting && !recursiveCall) {
 *        recursiveCall = true;
 *        // Process
 *        recursiveCall = false;
 *    }
 *
 * TESTING RECURSION:
 *
 * 1. Test self-recursion (record updates itself)
 * 2. Test parent-child recursion (bidirectional)
 * 3. Test cross-object recursion (A→B→A)
 * 4. Test multi-level recursion (A→B→C→A)
 * 5. Test field-based recursion
 * 6. Test workflow/process builder recursion
 * 7. Test bulk recursion prevention
 * 8. Verify static flags reset between tests
 * 9. Monitor governor limits (no excessive DML/queries)
 * 10. Test with real-world update patterns
 */
